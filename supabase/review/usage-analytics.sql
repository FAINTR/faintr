-- PROPOSAL ONLY: requires owner approval before running in production.
-- Optional consented analytics, separate from all account and roster data.
begin;
create schema if not exists faintr_usage;
revoke all on schema faintr_usage from public, anon, authenticated;
create table if not exists faintr_usage.settings(singleton boolean primary key default true check(singleton),write_key_hash bytea not null);
create table if not exists faintr_usage.events(
 id uuid primary key, received_at timestamptz not null default now(),
 visitor text not null, session text not null, event text not null, tool text not null,
 source text not null, returning boolean not null, consent text not null
);
create index if not exists usage_event_time on faintr_usage.events(received_at);
create table if not exists faintr_usage.limits(key text primary key,minute timestamptz not null,hits integer not null);
alter table faintr_usage.settings enable row level security;
alter table faintr_usage.events enable row level security;
alter table faintr_usage.limits enable row level security;
revoke all on all tables in schema faintr_usage from public,anon,authenticated;

create or replace function public.record_usage_event(p_event jsonb,p_write_key text,p_rate_key text) returns void
language plpgsql security definer set search_path=pg_catalog,faintr_usage as $$
declare rate_hits integer;
begin
 if not exists(select 1 from settings where write_key_hash=sha256(convert_to(p_write_key,'UTF8'))) then raise exception 'Denied' using errcode='42501';end if;
 if coalesce(p_rate_key,'') !~ '^[a-f0-9]{64}$' or octet_length(p_event::text)>1024
  or coalesce(p_event->>'visitor','') !~ '^[a-f0-9]{64}$' or coalesce(p_event->>'session','') !~ '^[a-f0-9]{64}$'
  or coalesce(p_event->>'event','')<>all(array['page_view','builder_started','builder_completed','grade_started','grade_completed','simulation_started','simulation_completed','roster_saved','roster_imported','roster_exported','iv_started','iv_completed','team_saved','action_failed'])
  or coalesce(p_event->>'tool','')<>all(array['find','grade','battle','roster','ivs','meta','saved','news','bugs','vip','supporters','privacy','terms','sources','licenses'])
  or coalesce(p_event->>'source','')<>all(array['direct','search','discord','social','supporter','referral'])
  or jsonb_typeof(p_event->'returning') is distinct from 'boolean' or p_event->>'consent' is distinct from '2026-10-23'
  then raise exception 'Invalid event';end if;
 -- Limits are atomic and intentionally separate from account permissions.
 insert into limits as l(key,minute,hits) values(p_rate_key,date_trunc('minute',now()),1)
 on conflict(key) do update set minute=excluded.minute,hits=case when l.minute=excluded.minute then l.hits+1 else 1 end returning l.hits into rate_hits;
 if rate_hits>120 then return;end if;
 -- A fixed global ceiling limits storage growth even if clients fabricate events.
 perform pg_advisory_xact_lock(72934011);
 if (select count(*) from events where received_at>=date_trunc('day',now()))>=10000 then return;end if;
 insert into events(id,visitor,session,event,tool,source,returning,consent)
 values((p_event->>'id')::uuid,p_event->>'visitor',p_event->>'session',p_event->>'event',p_event->>'tool',p_event->>'source',(p_event->>'returning')::boolean,p_event->>'consent') on conflict(id) do nothing;
 delete from events where received_at<now()-interval '30 days';
 delete from limits where minute<now()-interval '10 minutes';
end $$;
revoke all on function public.record_usage_event(jsonb,text,text) from public;
grant execute on function public.record_usage_event(jsonb,text,text) to anon,authenticated;
commit;
-- No key is provisioned by this file. An approved operator must generate and save
-- a separate analytics credential through the normal secret-entry workflow.
-- Only its SHA-256 hash belongs in settings; its raw value belongs in Cloudflare.
-- If collection stops, run the retention deletion as an operator after 30 days.
