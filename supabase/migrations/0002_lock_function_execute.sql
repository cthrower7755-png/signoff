-- Functions get EXECUTE for PUBLIC by default, so revoking from anon alone is not enough.
-- Signed-out callers get nothing; signed-in users keep only what the app calls.
-- Found by the Supabase security advisor after the first deploy (2026-11-15).
revoke execute on function public.send_order(uuid), public.accept_order(uuid), public.deliver_order(uuid),
  public.sign_off(uuid), public.flag_criterion(uuid, text), public.is_owner(uuid), public.is_client(uuid),
  public.jwt_email() from public, anon;
grant execute on function public.send_order(uuid), public.accept_order(uuid), public.deliver_order(uuid),
  public.sign_off(uuid), public.flag_criterion(uuid, text), public.is_owner(uuid), public.is_client(uuid),
  public.jwt_email() to authenticated;
-- Supabase's automatic-RLS event-trigger helper, if the project has it: runs as its owner; API roles never call it.
do $$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'rls_auto_enable') then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;
