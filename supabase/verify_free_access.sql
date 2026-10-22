-- Real database-role checks; accounts and writes are rolled back.
begin;
insert into auth.users (id, email, email_confirmed_at) values
('33333333-3333-4333-8333-333333333333', 'free-access-check-a@example.invalid', now()),
('44444444-4444-4444-8444-444444444444', 'free-access-check-b@example.invalid', now());
set local role authenticated;
set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
insert into public.user_storage (user_id, roster, teams, battles) values
(auth.uid(), '[{"test":"free-a"}]', '[{"test":"saved"}]', '[{"test":"battle"}]');
do $$
begin
  if public.has_premium() then raise exception 'Test account must have no paid entitlement'; end if;
  if (select count(*) from public.user_storage) <> 1 then raise exception 'Free own read failed'; end if;
  update public.user_storage set vip_settings = '{"test":"free"}' where user_id = auth.uid();
  if not found then raise exception 'Free own update failed'; end if;
  if public.export_my_storage()->'roster' <> '[{"test":"free-a"}]'::jsonb then raise exception 'Free export failed'; end if;
  if not has_function_privilege('authenticated','public.delete_my_account()','EXECUTE') then raise exception 'Account deletion unavailable'; end if;
end $$;
set local request.jwt.claim.sub = '44444444-4444-4444-8444-444444444444';
do $$
declare blocked boolean := false;
begin
  if (select count(*) from public.user_storage) <> 0 then raise exception 'Another trainer can read private data'; end if;
  update public.user_storage set roster = '[]' where user_id = '33333333-3333-4333-8333-333333333333';
  if found then raise exception 'Another trainer can change private data'; end if;
  begin
    insert into public.user_storage (user_id) values ('33333333-3333-4333-8333-333333333333');
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'Another trainer can insert as the owner'; end if;
end $$;
insert into public.user_storage (user_id) values (auth.uid());
reset role;
rollback;
select 'Free account create/read/save/export and private account isolation passed; test data rolled back.' as verification;
