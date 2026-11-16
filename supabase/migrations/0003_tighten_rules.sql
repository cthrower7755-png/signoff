-- 0003: close the gaps found in the 2026-11-16 review (docs/plans/07-tighten-rules.md).
-- Evidence, flags, order details and timestamps now move only at the right stage, and only through the checked functions.

-- ---------------------------------------------------------------- criteria
-- Draft: the owner edits freely, but nothing is marked met yet.
-- After sending: no adds, removes or rewording. Evidence and "met" change only while the work is in progress.
-- client_flag is written only by flag_criterion and cleared only by deliver_order (both set signoff.transition).
create or replace function public.criteria_guard() returns trigger
language plpgsql set search_path = '' as $$
declare
  s public.order_status;
  t boolean := coalesce(current_setting('signoff.transition', true) = 'on', false);
begin
  select status into s from public.orders where id = coalesce(new.order_id, old.order_id);

  if not t then
    if tg_op = 'INSERT' and new.client_flag is not null then
      raise exception 'only the client can flag a criterion' using errcode = 'P0001';
    elsif tg_op = 'UPDATE' and new.client_flag is distinct from old.client_flag then
      raise exception 'only the client can flag a criterion' using errcode = 'P0001';
    end if;
  end if;

  if s = 'draft' then
    if tg_op <> 'DELETE' and (new.met or new.evidence is not null) then
      raise exception 'evidence can be recorded only while the work is in progress' using errcode = 'P0001';
    end if;
    return coalesce(new, old);
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

  if t then
    return new;   -- a checked function: a client flag resets "met", delivery clears flags
  end if;
  if (new.met is distinct from old.met or new.evidence is distinct from old.evidence)
     and s not in ('accepted', 'changes_requested') then
    raise exception 'evidence can be recorded only while the work is in progress' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- orders
-- New orders start as a plain draft. After sending, the title, client, due date, owner and timestamps are fixed;
-- status and timestamps change only inside the order functions.
create or replace function public.orders_guard() returns trigger
language plpgsql set search_path = '' as $$
declare t boolean := coalesce(current_setting('signoff.transition', true) = 'on', false);
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.accepted_at is not null or new.signed_off_at is not null then
      raise exception 'new orders start as a draft' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if not t and (new.status is distinct from old.status
                or new.accepted_at is distinct from old.accepted_at
                or new.signed_off_at is distinct from old.signed_off_at) then
    raise exception 'status changes go through the order functions' using errcode = 'P0001';
  end if;
  if new.owner_id is distinct from old.owner_id or new.created_at is distinct from old.created_at then
    raise exception 'the owner of an order cannot change' using errcode = 'P0001';
  end if;
  if old.status <> 'draft' and not t
     and (new.title is distinct from old.title
          or new.client_email is distinct from old.client_email
          or new.due_date is distinct from old.due_date) then
    raise exception 'the order details are locked once it is sent' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists orders_guard on public.orders;
create trigger orders_guard before insert or update on public.orders
  for each row execute function public.orders_guard();

-- deliver_order clears the client's flags; that write is now a checked transition.
create or replace function public.deliver_order(p_order uuid) returns public.orders
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner(p_order) then raise exception 'not your order' using errcode = '42501'; end if;
  if exists (select 1 from public.criteria where order_id = p_order and (not met or coalesce(trim(evidence), '') = '')) then
    raise exception 'every criterion needs to be met, with evidence' using errcode = 'P0001';
  end if;
  perform set_config('signoff.transition', 'on', true);
  update public.criteria set client_flag = null where order_id = p_order and client_flag is not null;
  return public._move(p_order, array['accepted', 'changes_requested']::public.order_status[], 'delivered', 'delivered');
end $$;
revoke execute on function public.deliver_order(uuid) from public, anon;
grant execute on function public.deliver_order(uuid) to authenticated;

-- ---------------------------------------------------------------- AI drafting: daily limit per user
-- Paid model calls are capped in the database, not in the browser. Users can read their own count; only the function writes.
create table public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null default current_date,
  drafts  int  not null default 0 check (drafts >= 0),
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;
create policy ai_usage_read_own on public.ai_usage for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.ai_usage from anon, authenticated;
grant select on public.ai_usage to authenticated;

-- Counts one draft for the caller and says whether it is within today's limit (20).
create or replace function public.take_ai_draft() returns boolean
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); n int;
begin
  if u is null then raise exception 'sign in first' using errcode = '42501'; end if;
  insert into public.ai_usage (user_id, day, drafts) values (u, current_date, 1)
  on conflict (user_id, day) do update set drafts = public.ai_usage.drafts + 1
  returning drafts into n;
  return n <= 20;
end $$;
revoke execute on function public.take_ai_draft() from public, anon;
grant execute on function public.take_ai_draft() to authenticated;
