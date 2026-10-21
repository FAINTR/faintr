alter table public.user_storage add column if not exists battles jsonb not null default '[]'::jsonb
  check (jsonb_typeof(battles) = 'array' and jsonb_array_length(battles) <= 2000);
alter table public.user_storage add column if not exists vip_settings jsonb not null default '{}'::jsonb
  check (jsonb_typeof(vip_settings) = 'object');
alter table public.user_storage drop constraint if exists user_storage_size;
alter table public.user_storage add constraint user_storage_size check
  (octet_length(roster::text) + octet_length(teams::text) + octet_length(battles::text) + octet_length(vip_settings::text) < 3000000);
create or replace function public.export_my_storage() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_build_object('roster', roster, 'teams', teams, 'battles', battles, 'settings', vip_settings)
    from public.user_storage where user_id = (select auth.uid())),
    '{"roster":[],"teams":[],"battles":[],"settings":{}}'::jsonb)
$$;
