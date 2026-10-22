-- Synthetic public setups and the temporary test credential are rolled back.
begin;
insert into faintr_private.share_settings(singleton,write_key_hash) values(true,sha256(convert_to(repeat('a',64),'UTF8')))
on conflict(singleton) do update set write_key_hash=excluded.write_key_hash;
set local role anon;
do $$
declare
  team jsonb := '{"v":1,"f":"all-1500","m":[{"id":"azumarill","moveset":["BUBBLE","PLAY_ROUGH"],"ivs":{"atk":0,"def":15,"hp":15},"levelCap":50,"notes":"PRIVATE NOTE"},{"id":"clodsire","moveset":["POISON_STING","EARTHQUAKE"],"ivs":null,"levelCap":50},{"id":"mandibuzz","moveset":["SNARL","DARK_PULSE"],"ivs":{"atk":0,"def":15,"hp":15},"levelCap":51}],"user_id":"PRIVATE ACCOUNT"}';
  short_id text; other_id text; blocked boolean := false; n integer;
begin
  begin perform public.create_shared_team(team,'wrong',repeat('b',64));
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'Missing write credential accepted'; end if;
  short_id := public.create_shared_team(team,repeat('a',64),repeat('b',64));
  if length(short_id) <> 12 then raise exception 'Link ID is not short'; end if;
  other_id := public.create_shared_team(team,repeat('a',64),repeat('b',64));
  if short_id <> other_id then raise exception 'Identical setup did not reuse its link'; end if;
  if public.get_shared_team(short_id)::text like '%PRIVATE%' then raise exception 'Private fields retained'; end if;
  if public.get_shared_team(short_id)->'m'->0->'ivs' <> team->'m'->0->'ivs' then raise exception 'IV roundtrip failed'; end if;
  if public.get_shared_team('not-a-link') is not null then raise exception 'Invalid ID resolved'; end if;
  blocked := false;
  begin execute 'select * from faintr_private.shared_teams';
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'Anonymous bulk table access was allowed'; end if;
  for n in 3..30 loop perform public.create_shared_team(team,repeat('a',64),repeat('b',64)); end loop;
  blocked := false;
  begin perform public.create_shared_team(team,repeat('a',64),repeat('b',64));
  exception when raise_exception then blocked := sqlerrm='Sharing rate limit'; end;
  if not blocked then raise exception 'Rate limit failed'; end if;
end $$;
rollback;
