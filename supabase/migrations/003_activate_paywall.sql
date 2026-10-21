-- Apply only after both checkout plans and webhook verification pass in Stripe.
drop policy if exists "read own storage" on public.user_storage;
create policy "read own storage" on public.user_storage for select to authenticated
  using ((select auth.uid()) = user_id and (select public.has_premium()));
drop policy if exists "create own storage" on public.user_storage;
create policy "create own storage" on public.user_storage for insert to authenticated
  with check ((select auth.uid()) = user_id and (select public.has_premium()));
-- The billing endpoint checks Stripe before deletion, including past-due subscriptions.
revoke execute on function public.delete_my_account() from authenticated;
drop policy if exists "update own storage" on public.user_storage;
create policy "update own storage" on public.user_storage for update to authenticated
  using ((select auth.uid()) = user_id and (select public.has_premium()))
  with check ((select auth.uid()) = user_id and (select public.has_premium()));
