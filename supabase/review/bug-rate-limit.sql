-- PROPOSAL ONLY. Does not alter access policies. Obtain approval before production.
-- Serializes the existing count/check/insert to prevent concurrent reports all
-- passing the same limit. No reports are removed or migrated.
create or replace function public.bug_rate_limit() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 new.created_at:=now();new.user_id:=auth.uid();new.status:='new';
 if auth.uid() is not null then new.email:=coalesce(auth.jwt()->>'email',new.email);end if;
 perform pg_advisory_xact_lock(hashtextextended('faintr-report:'||coalesce(auth.uid()::text,'anonymous'),0));
 if auth.uid() is null and (select count(*) from public.bug_reports where user_id is null and created_at>now()-interval '1 minute')>=10 then
  raise exception 'Lots of reports are coming in right now. Please try again in a minute.';
 end if;
 if auth.uid() is not null and (select count(*) from public.bug_reports where user_id=auth.uid() and created_at>now()-interval '1 hour')>=20 then
  raise exception 'You''ve sent a lot of reports this hour. Please try again later.';
 end if;
 return new;
end $$;
