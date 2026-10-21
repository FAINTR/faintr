-- Exercise the actual database roles and paid policies without retaining test data.
begin;
\ir migrations/003_activate_paywall.sql

insert into auth.users (id, email, email_confirmed_at) values
('11111111-1111-4111-8111-111111111111', 'vip-monthly-verification@example.invalid', now()),
('22222222-2222-4222-8222-222222222222', 'vip-onetime-verification@example.invalid', now());
insert into public.user_storage (user_id, roster) values
('11111111-1111-4111-8111-111111111111', '[{"test":"paid"}]'),
('22222222-2222-4222-8222-222222222222', '[{"test":"unpaid"}]');
insert into public.billing_purchases (id,user_id,kind,active,expires_at) values
('verification-transaction-only','11111111-1111-4111-8111-111111111111','monthly',true,now()+interval '1 month');

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$
begin
  if not public.has_premium() then raise exception 'Paid account lacks membership'; end if;
  if (select count(*) from public.user_storage) <> 1 then raise exception 'Paid account isolation failed'; end if;
  update public.user_storage set teams = '[{"test":"save"}]' where user_id = auth.uid();
  if not found then raise exception 'Paid save failed'; end if;
  if has_table_privilege('authenticated','public.billing_purchases','INSERT') then raise exception 'Browser can grant membership'; end if;
end $$;

set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$
declare blocked boolean := false;
begin
  if public.has_premium() then raise exception 'Unpaid account has membership'; end if;
  if (select count(*) from public.user_storage) <> 0 then raise exception 'Unpaid read was not blocked'; end if;
  update public.user_storage set teams = '[]' where user_id = auth.uid();
  if found then raise exception 'Unpaid save was not blocked'; end if;
  if public.export_my_storage()->'roster' <> '[{"test":"unpaid"}]'::jsonb then raise exception 'Own data export failed'; end if;
  begin
    insert into public.user_storage (user_id) values (auth.uid());
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'Unpaid insert was not blocked'; end if;
end $$;

reset role;
rollback;
select 'Paid account isolation, save, export, and unpaid restrictions passed; test data rolled back.' as verification;
