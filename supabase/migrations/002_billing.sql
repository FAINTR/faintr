-- Stripe is the only writer of paid access. No browser can grant itself membership.
create table if not exists public.billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  customer_id text not null unique,
  created_at timestamptz not null default now()
);
create table if not exists public.billing_purchases (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('monthly', 'lifetime')),
  active boolean not null default false,
  expires_at timestamptz,
  cancel_at_period_end boolean not null default false,
  synced_at timestamptz not null default now()
);
alter table public.billing_customers enable row level security;
alter table public.billing_purchases enable row level security;
revoke all on public.billing_customers, public.billing_purchases from anon, authenticated;
grant all on public.billing_customers, public.billing_purchases to service_role;

create or replace function public.has_premium() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.billing_purchases
    where user_id = (select auth.uid()) and active
      and (kind = 'lifetime' or expires_at > now()))
$$;
revoke all on function public.has_premium() from public, anon;
grant execute on function public.has_premium() to authenticated;

create or replace function public.membership_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_build_object('active', true, 'plan', kind,
    'expiresAt', expires_at, 'cancelAtPeriodEnd', cancel_at_period_end)
    from public.billing_purchases where user_id = (select auth.uid()) and active
    and (kind = 'lifetime' or expires_at > now())
    order by (kind = 'lifetime') desc, expires_at desc nulls first limit 1),
    '{"active":false}'::jsonb)
$$;
revoke all on function public.membership_status() from public, anon;
grant execute on function public.membership_status() to authenticated;

-- Concurrent webhook deliveries cannot overwrite a newer reconciliation.
create or replace function public.sync_billing_purchase(p jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.billing_purchases (id, user_id, kind, active, expires_at, cancel_at_period_end, synced_at)
  values (p->>'id', (p->>'user_id')::uuid, p->>'kind', (p->>'active')::boolean,
    (p->>'expires_at')::timestamptz, coalesce((p->>'cancel_at_period_end')::boolean, false), (p->>'synced_at')::timestamptz)
  on conflict (id) do update set active = excluded.active, expires_at = excluded.expires_at,
    cancel_at_period_end = excluded.cancel_at_period_end, synced_at = excluded.synced_at
  where excluded.synced_at >= public.billing_purchases.synced_at
$$;
revoke all on function public.sync_billing_purchase(jsonb) from public, anon, authenticated;
grant execute on function public.sync_billing_purchase(jsonb) to service_role;

-- Enable these policies only when Stripe is configured and the website is ready.
-- Kept in a separate activation migration so preparation never locks out trainers.

-- Even after membership ends, trainers can download or delete their own data.
create or replace function public.export_my_storage() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_build_object('roster', roster, 'teams', teams)
    from public.user_storage where user_id = (select auth.uid())),
    '{"roster":[],"teams":[]}'::jsonb)
$$;
revoke all on function public.export_my_storage() from public, anon;
grant execute on function public.export_my_storage() to authenticated;

-- An account must not disappear while an uncanceled subscription can still renew.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if exists (select 1 from public.billing_purchases where user_id = auth.uid()
    and kind = 'monthly' and active and not cancel_at_period_end) then
    raise exception 'Cancel your monthly membership in Manage billing before deleting your account.';
  end if;
  delete from auth.users where id = auth.uid();
end $$;
