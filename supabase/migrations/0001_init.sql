-- Signoff: written acceptance criteria that lock once the client accepts.
-- Every table has row-level security. Clients act only through functions that check who they are
-- and whether the order is in the right state. History is append-only.


create type order_status as enum ('draft', 'sent', 'accepted', 'delivered', 'changes_requested', 'signed_off');

create table public.orders (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title         text not null check (length(trim(title)) between 3 and 140),
  client_email  text not null check (client_email = lower(client_email) and client_email like '%@%'),
  due_date      date,
  status        order_status not null default 'draft',
  accepted_at   timestamptz,
  signed_off_at timestamptz,
  created_at    timestamptz not null default now()
);
create index orders_owner_idx on public.orders (owner_id);
create index orders_client_idx on public.orders (client_email);

create table public.criteria (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders (id) on delete cascade,
  position     int not null check (position > 0),
  criterion    text not null check (length(trim(criterion)) between 5 and 400),
  how_checked  text not null check (length(trim(how_checked)) between 3 and 300),
  evidence     text,
  met          boolean not null default false,
  client_flag  text,
  unique (order_id, position)
);
create index criteria_order_idx on public.criteria (order_id);

create table public.order_events (
  id         bigint generated always as identity primary key,
  order_id   uuid not null references public.orders (id) on delete cascade,
  actor      uuid default auth.uid(),
  kind       text not null,
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index order_events_order_idx on public.order_events (order_id, created_at);

-- ---------------------------------------------------------------- helpers
create or replace function public.jwt_email() returns text
language sql stable set search_path = '' as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create or replace function public.is_owner(p_order uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.orders o where o.id = p_order and o.owner_id = auth.uid())
$$;

create or replace function public.is_client(p_order uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.orders o where o.id = p_order and o.client_email = public.jwt_email())
$$;

-- ---------------------------------------------------------------- RLS
alter table public.orders enable row level security;
alter table public.criteria enable row level security;
alter table public.order_events enable row level security;

create policy orders_owner_all on public.orders for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy orders_client_read on public.orders for select to authenticated
  using (client_email = (select public.jwt_email()));

create policy criteria_owner_all on public.criteria for all to authenticated
  using ((select public.is_owner(order_id))) with check ((select public.is_owner(order_id)));
create policy criteria_client_read on public.criteria for select to authenticated
  using ((select public.is_client(order_id)));

create policy events_read on public.order_events for select to authenticated
  using ((select public.is_owner(order_id)) or (select public.is_client(order_id)));
-- No insert/update/delete policies on order_events: only the functions below write to it.

revoke all on public.order_events from anon, authenticated;
grant select on public.order_events to authenticated;
revoke all on public.orders, public.criteria from anon;

-- ---------------------------------------------------------------- the bar does not move
-- After the client accepts, the wording of a criterion and how it is checked are frozen.
-- The owner may still record evidence and mark it met. Nobody may add or remove criteria.
create or replace function public.criteria_guard() returns trigger
language plpgsql set search_path = '' as $$
declare s public.order_status;
begin
  select status into s from public.orders where id = coalesce(new.order_id, old.order_id);
  if s = 'draft' then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and current_setting('signoff.transition', true) = 'on'
     and new.criterion is not distinct from old.criterion and new.how_checked is not distinct from old.how_checked then
    return new;   -- a checked transition function (e.g. a client flag) may reset "met"
  end if;
  if tg_op in ('INSERT', 'DELETE') then
    raise exception 'criteria are locked once the order is sent' using errcode = 'P0001';
  end if;
  if new.criterion is distinct from old.criterion
     or new.how_checked is distinct from old.how_checked
     or new.position is distinct from old.position
     or new.order_id is distinct from old.order_id then
    raise exception 'criteria wording is locked once the order is sent' using errcode = 'P0001';
  end if;
  if new.met is distinct from old.met and s not in ('accepted', 'changes_requested') then
    raise exception 'criteria can be marked only after the client accepts' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger criteria_guard before insert or update or delete on public.criteria
  for each row execute function public.criteria_guard();

-- Status changes go through functions only; owners cannot set status directly.
create or replace function public.orders_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status is distinct from old.status and current_setting('signoff.transition', true) is distinct from 'on' then
    raise exception 'status changes go through the order functions' using errcode = 'P0001';
  end if;
  if new.client_email is distinct from old.client_email and old.status <> 'draft' then
    raise exception 'client cannot change after the order is sent' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger orders_guard before update on public.orders
  for each row execute function public.orders_guard();

-- ---------------------------------------------------------------- transitions
-- One table of allowed moves; every action checks it. Same input, same outcome.
create or replace function public._move(p_order uuid, p_from public.order_status[], p_to public.order_status, p_kind text, p_detail jsonb default '{}')
returns public.orders language plpgsql security definer set search_path = '' as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'order not found' using errcode = 'P0002'; end if;
  if not (o.status = any (p_from)) then
    raise exception 'not allowed: % while the order is %', p_kind, o.status using errcode = 'P0001';
  end if;
  perform set_config('signoff.transition', 'on', true);
  update public.orders set status = p_to,
    accepted_at   = case when p_to = 'accepted' then now() else accepted_at end,
    signed_off_at = case when p_to = 'signed_off' then now() else signed_off_at end
  where id = p_order returning * into o;
  perform set_config('signoff.transition', 'off', true);
  insert into public.order_events (order_id, kind, detail) values (p_order, p_kind, p_detail);
  return o;
end $$;
revoke all on function public._move from public, anon, authenticated;

-- Owner: send the order to the client (needs at least one criterion).
create or replace function public.send_order(p_order uuid) returns public.orders
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner(p_order) then raise exception 'not your order' using errcode = '42501'; end if;
  if not exists (select 1 from public.criteria where order_id = p_order) then
    raise exception 'add at least one criterion first' using errcode = 'P0001';
  end if;
  return public._move(p_order, array['draft']::public.order_status[], 'sent', 'sent');
end $$;

-- Client: accept the criteria as written. From here the bar is frozen.
create or replace function public.accept_order(p_order uuid) returns public.orders
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_client(p_order) then raise exception 'not your order' using errcode = '42501'; end if;
  return public._move(p_order, array['sent']::public.order_status[], 'accepted', 'accepted');
end $$;

-- Owner: deliver (every criterion must be marked met, each with evidence).
create or replace function public.deliver_order(p_order uuid) returns public.orders
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner(p_order) then raise exception 'not your order' using errcode = '42501'; end if;
  if exists (select 1 from public.criteria where order_id = p_order and (not met or coalesce(trim(evidence), '') = '')) then
    raise exception 'every criterion needs to be met, with evidence' using errcode = 'P0001';
  end if;
  update public.criteria set client_flag = null where order_id = p_order;
  return public._move(p_order, array['accepted', 'changes_requested']::public.order_status[], 'delivered', 'delivered');
end $$;

-- Client: sign off, or name the criteria that are not met. A flag must point at a criterion.
create or replace function public.sign_off(p_order uuid) returns public.orders
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_client(p_order) then raise exception 'not your order' using errcode = '42501'; end if;
  return public._move(p_order, array['delivered']::public.order_status[], 'signed_off', 'signed_off');
end $$;

create or replace function public.flag_criterion(p_criterion uuid, p_note text) returns public.orders
language plpgsql security definer set search_path = '' as $$
declare c public.criteria;
begin
  select * into c from public.criteria where id = p_criterion;
  if not found or not public.is_client(c.order_id) then raise exception 'not your order' using errcode = '42501'; end if;
  if coalesce(length(trim(p_note)), 0) < 5 then raise exception 'say what is not met' using errcode = 'P0001'; end if;
  perform set_config('signoff.transition', 'on', true);
  update public.criteria set client_flag = left(trim(p_note), 400), met = false where id = p_criterion;
  return public._move(c.order_id, array['delivered']::public.order_status[], 'changes_requested', 'flagged',
                      jsonb_build_object('position', c.position, 'note', left(trim(p_note), 400)));
end $$;

grant execute on function public.send_order, public.accept_order, public.deliver_order, public.sign_off, public.flag_criterion to authenticated;
revoke execute on function public.send_order, public.accept_order, public.deliver_order, public.sign_off, public.flag_criterion from anon;
