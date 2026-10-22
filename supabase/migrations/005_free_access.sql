-- All tools are free. Private saved data still belongs only to its trainer.
begin;
drop policy if exists "read own storage" on public.user_storage;
create policy "read own storage" on public.user_storage for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "create own storage" on public.user_storage;
create policy "create own storage" on public.user_storage for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "update own storage" on public.user_storage;
create policy "update own storage" on public.user_storage for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant execute on function public.delete_my_account() to authenticated;
commit;
