-- Public game setups only. No account IDs, ownership, nicknames or private notes.
create schema if not exists faintr_private;
revoke all on schema faintr_private from public, anon, authenticated;
create table if not exists faintr_private.share_settings (
  singleton boolean primary key default true check (singleton), write_key_hash bytea not null
);
create table if not exists faintr_private.shared_teams (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{12}$'),
  fingerprint bytea unique not null, team jsonb not null,
  created_at timestamptz not null default now()
);
create table if not exists faintr_private.share_limits (
  key text primary key, minute timestamptz not null, hits integer not null
);
alter table faintr_private.shared_teams enable row level security;
alter table faintr_private.share_settings enable row level security;
alter table faintr_private.share_limits enable row level security;
revoke all on all tables in schema faintr_private from public, anon, authenticated;

create or replace function public.create_shared_team(p_team jsonb, p_write_key text, p_rate_key text)
returns text language plpgsql security definer set search_path = pg_catalog, faintr_private as $$
declare
  fingerprint bytea; short_id text; found_team jsonb; count_hits integer; attempt integer;
  member jsonb; weights jsonb; clean_members jsonb := '[]'; clean_team jsonb;
begin
  if not exists (select 1 from share_settings where write_key_hash = sha256(convert_to(p_write_key, 'UTF8'))) then
    raise exception 'Sharing service authentication failed' using errcode = '42501';
  end if;
  if p_team is null or octet_length(p_team::text) > 3000 or p_team->>'v' is distinct from '1'
    or coalesce(p_team->>'f','') !~ '^[a-z0-9-]{1,64}$'
    or jsonb_typeof(p_team->'m') is distinct from 'array' or jsonb_array_length(p_team->'m') <> 3
    or coalesce(p_rate_key,'') !~ '^[a-f0-9]{64}$' then raise exception 'Invalid shared team'; end if;
  -- Reconstruct allowed fields even for a trusted caller; never retain extra private fields.
  for member in select value from jsonb_array_elements(p_team->'m') loop
    if coalesce(member->>'id','') !~ '^[a-z0-9_]{1,70}$'
      or jsonb_typeof(member->'moveset') is distinct from 'array'
      or jsonb_array_length(member->'moveset') not between 2 and 3
      or exists(select 1 from jsonb_array_elements_text(member->'moveset') x where x !~ '^[A-Z0-9_]{1,70}$')
      or coalesce(member->>'levelCap','') not in ('40','41','50','51') then raise exception 'Invalid shared member'; end if;
    if member->'ivs' <> 'null'::jsonb and (
      coalesce(member->'ivs'->>'atk','') !~ '^(1[0-5]|[0-9])$' or
      coalesce(member->'ivs'->>'def','') !~ '^(1[0-5]|[0-9])$' or
      coalesce(member->'ivs'->>'hp','') !~ '^(1[0-5]|[0-9])$') then raise exception 'Invalid shared IVs'; end if;
    clean_members := clean_members || jsonb_build_array(jsonb_build_object('id',member->'id','moveset',member->'moveset',
      'ivs',case when member->'ivs' = 'null'::jsonb then 'null'::jsonb else jsonb_build_object('atk',member->'ivs'->'atk','def',member->'ivs'->'def','hp',member->'ivs'->'hp') end,
      'levelCap',member->'levelCap'));
  end loop;
  if (select count(distinct x->>'id') from jsonb_array_elements(clean_members) x) <> 3 then raise exception 'Duplicate shared member'; end if;
  weights := coalesce(p_team->'w', '{}'::jsonb);
  if jsonb_typeof(weights) <> 'object' or exists(select 1 from jsonb_each(weights) x
    where x.key <> all(array['coverage','bulk','safety','consistency','blindSpots','twoAnswers','resilience','sharedWeak','pilot','metaWins'])
      or x.value::text !~ '^[0-5]$') then raise exception 'Invalid shared weights'; end if;
  clean_team := jsonb_build_object('v',1,'f',p_team->'f','m',clean_members,'w',weights);
  fingerprint := sha256(convert_to(clean_team::text,'UTF8'));
  insert into share_limits as limits(key,minute,hits) values(p_rate_key,date_trunc('minute',now()),1)
    on conflict(key) do update set minute=excluded.minute,
      hits=case when limits.minute=excluded.minute then limits.hits+1 else 1 end returning hits into count_hits;
  if count_hits > 30 then raise exception 'Sharing rate limit' using errcode='P0001'; end if;
  delete from share_limits where minute < now()-interval '10 minutes';
  select id into short_id from shared_teams t where t.fingerprint = create_shared_team.fingerprint;
  if found then return short_id; end if;
  for attempt in 0..4 loop
    short_id := left(translate(encode(sha256(fingerprint || convert_to(attempt::text,'UTF8')),'base64'),'+/','-_'),12);
    insert into shared_teams(id,fingerprint,team) values(short_id,fingerprint,clean_team) on conflict do nothing;
    select team into found_team from shared_teams where id=short_id;
    if found_team=clean_team then return short_id; end if;
    select id into short_id from shared_teams t where t.fingerprint = create_shared_team.fingerprint;
    if found then return short_id; end if;
  end loop;
  raise exception 'Could not allocate a short link';
end $$;
revoke all on function public.create_shared_team(jsonb,text,text) from public;
grant execute on function public.create_shared_team(jsonb,text,text) to anon, authenticated;

create or replace function public.get_shared_team(p_id text) returns jsonb
language sql stable security definer set search_path = pg_catalog, faintr_private as $$
  select team from shared_teams where id=p_id and p_id ~ '^[A-Za-z0-9_-]{12}$'
$$;
revoke all on function public.get_shared_team(text) from public;
grant execute on function public.get_shared_team(text) to anon, authenticated;
notify pgrst, 'reload schema';
