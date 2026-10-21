-- Both the requested trainer name and the owner's verified email must match.
-- The email is supplied from an encrypted repository secret and is never printed.
begin;
select set_config('faintr.owner_name', :'owner_name', true) is not null as owner_name_supplied;
select set_config('faintr.owner_email', :'owner_email', true) <> '' as owner_email_supplied;
do $$
declare account_id uuid; matches integer;
begin
  select count(*), (array_agg(u.id))[1] into matches, account_id
  from auth.users u join public.profiles p on p.id = u.id
  where lower(p.display_name) = lower(current_setting('faintr.owner_name'))
    and lower(u.email) = lower(current_setting('faintr.owner_email'))
    and u.email_confirmed_at is not null;
  if matches <> 1 then
    raise exception 'No unique verified owner account matched. Sign in to FAINTR and check the trainer name before retrying.';
  end if;
  insert into public.billing_purchases (id, user_id, kind, active, expires_at, synced_at)
  values ('complimentary-owner:' || account_id, account_id, 'lifetime', true, null, now())
  on conflict (id) do update set active = true, expires_at = null, synced_at = now();
  raise notice 'Complimentary owner VIP access granted.';
end $$;
commit;
