-- FAINTR website database. Paste this whole file into Supabase > SQL Editor > New query, then Run.
-- Safe to run again: it only creates what's missing.
-- Written for a project with "Automatically expose new tables" OFF: the website can only reach
-- what the GRANTs at the bottom of this file allow, and row level security limits it further.

-- Profiles: one row per account (trainer name, admin flag)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 40),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select to authenticated using ((select auth.uid()) = id);
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- New accounts get a profile automatically
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 40))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
-- Accounts made before this file ran
insert into public.profiles (id) select id from auth.users on conflict (id) do nothing;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

-- Saved storage: ONE row per trainer. roster = their Pokémon, teams = My Teams (both JSON arrays).
-- version goes up by one on every save so two devices can't overwrite each other.
create table if not exists public.user_storage (
  user_id uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  roster jsonb not null default '[]'::jsonb check (jsonb_typeof(roster) = 'array' and jsonb_array_length(roster) <= 2000),
  teams jsonb not null default '[]'::jsonb check (jsonb_typeof(teams) = 'array' and jsonb_array_length(teams) <= 300),
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint user_storage_size check (octet_length(roster::text) + octet_length(teams::text) < 3000000)
);
alter table public.user_storage drop constraint if exists user_storage_size;
alter table public.user_storage add constraint user_storage_size check (octet_length(roster::text) + octet_length(teams::text) < 3000000);
alter table public.user_storage enable row level security;
drop policy if exists "read own storage" on public.user_storage;
create policy "read own storage" on public.user_storage for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "create own storage" on public.user_storage;
create policy "create own storage" on public.user_storage for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "update own storage" on public.user_storage;
create policy "update own storage" on public.user_storage for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "delete own storage" on public.user_storage;
create policy "delete own storage" on public.user_storage for delete to authenticated using ((select auth.uid()) = user_id);

-- Let a trainer delete their own account (and with it, everything they saved)
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  delete from auth.users where id = auth.uid();
end $$;

-- Bug reports: anyone can send one; only admins can read or change them
create table if not exists public.bug_reports (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null default auth.uid(),
  category text not null default 'bug' check (category in ('bug', 'data', 'idea', 'other')),
  title text not null check (char_length(title) between 1 and 120),
  details text not null check (char_length(details) between 10 and 5000),
  steps text check (char_length(steps) <= 3000),
  email text check (char_length(email) <= 200),
  page text check (char_length(page) <= 200),
  format text check (char_length(format) <= 60),
  app_version text check (char_length(app_version) <= 40),
  data_version text check (char_length(data_version) <= 60),
  user_agent text check (char_length(user_agent) <= 300),
  status text not null default 'new' check (status in ('new', 'seen', 'fixed', 'wontfix'))
);
alter table public.bug_reports enable row level security;
drop policy if exists "anyone can report" on public.bug_reports;
create policy "anyone can report" on public.bug_reports for insert to anon, authenticated
  with check (status = 'new' and (user_id is null or user_id = auth.uid()));
drop policy if exists "admins read reports" on public.bug_reports;
create policy "admins read reports" on public.bug_reports for select using (public.is_admin());
drop policy if exists "admins update reports" on public.bug_reports;
create policy "admins update reports" on public.bug_reports for update using (public.is_admin()) with check (public.is_admin());

-- Simple spam brake: at most 10 reports a minute site-wide from signed-out visitors
create or replace function public.bug_rate_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Who sent it, when, and its status come from the server, never from the report itself
  new.created_at := now();
  new.user_id := auth.uid();
  new.status := 'new';
  if auth.uid() is not null then new.email := coalesce(auth.jwt() ->> 'email', new.email); end if;
  -- Serialize each bucket so simultaneous submissions cannot pass the same count.
  perform pg_advisory_xact_lock(hashtextextended('faintr-report:' || coalesce(auth.uid()::text, 'anonymous'), 0));
  if auth.uid() is null and (select count(*) from public.bug_reports where user_id is null and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'Lots of reports are coming in right now. Please try again in a minute.';
  end if;
  if auth.uid() is not null and (select count(*) from public.bug_reports where user_id = auth.uid() and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'You''ve sent a lot of reports this hour. Please try again later.';
  end if;
  return new;
end $$;
create index if not exists bug_reports_user_time on public.bug_reports (user_id, created_at);
drop trigger if exists bug_rate on public.bug_reports;
create trigger bug_rate before insert on public.bug_reports for each row execute function public.bug_rate_limit();

-- Keep-alive: the nightly job reads this so a free project never pauses for inactivity
create table if not exists public.site_status (id int primary key default 1, last_deploy timestamptz, data_version text);
alter table public.site_status enable row level security;
drop policy if exists "public read status" on public.site_status;
create policy "public read status" on public.site_status for select using (true);
insert into public.site_status (id) values (1) on conflict (id) do nothing;

-- ---------- What the website may touch (nothing else is exposed through the Data API)
revoke all on public.profiles, public.user_storage, public.bug_reports, public.site_status from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;   -- the name only: nobody can make themselves admin
grant select, insert, update, delete on public.user_storage to authenticated;
grant insert on public.bug_reports to anon, authenticated;
grant select on public.bug_reports to authenticated;               -- row level security: admins only
grant update (status) on public.bug_reports to authenticated;      -- row level security: admins only
grant select on public.site_status to anon, authenticated;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
revoke all on function public.handle_new_user(), public.bug_rate_limit() from public, anon, authenticated;
