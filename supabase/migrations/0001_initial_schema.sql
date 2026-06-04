-- Conference CRM — initial schema
-- Run this in your Supabase SQL editor (Database → SQL Editor → New Query)

-- ============== PROFILES ==============
-- Extends auth.users with app-specific role + name
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  role text not null default 'pending' check (role in ('admin', 'team', 'attendee', 'pending')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create a profile when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============== COMPANIES ==============
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  industry text,
  contact_name text,
  contact_title text,
  email text,
  phone text,
  owner_id uuid references public.profiles(id) on delete set null,
  stage text not null default 'not_contacted'
    check (stage in ('not_contacted','reaching_out','in_discussion','verbal_commit','registered','declined')),
  confirmed text not null default 'no'
    check (confirmed in ('no','tentative','yes')),
  payment_status text not null default 'not_invoiced'
    check (payment_status in ('not_invoiced','invoiced','partial','paid','waived')),
  amount_due numeric(10,2) not null default 0,
  amount_paid numeric(10,2) not null default 0,
  last_contact date,
  next_action text,
  next_action_date date,
  source text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index companies_owner_idx on public.companies (owner_id);
create index companies_stage_idx on public.companies (stage);

-- ============== INVESTORS ==============
create table public.investors (
  id uuid primary key default gen_random_uuid(),
  firm_name text not null,
  investor_type text,
  contact_name text,
  contact_title text,
  email text,
  phone text,
  owner_id uuid references public.profiles(id) on delete set null,
  stage text not null default 'not_contacted'
    check (stage in ('not_contacted','reaching_out','in_discussion','verbal_commit','registered','declined')),
  confirmed text not null default 'no'
    check (confirmed in ('no','tentative','yes')),
  payment_status text not null default 'not_invoiced'
    check (payment_status in ('not_invoiced','invoiced','partial','paid','waived')),
  amount_due numeric(10,2) not null default 0,
  amount_paid numeric(10,2) not null default 0,
  last_contact date,
  next_action text,
  next_action_date date,
  check_size text,
  sector_focus text,
  source text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index investors_owner_idx on public.investors (owner_id);
create index investors_stage_idx on public.investors (stage);

-- ============== ACTIVITY LOG ==============
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  lead_type text not null check (lead_type in ('company','investor')),
  lead_id uuid not null,
  lead_name text not null,
  action text not null,
  notes text,
  created_at timestamptz not null default now()
);

create index activity_log_created_idx on public.activity_log (created_at desc);
create index activity_log_lead_idx on public.activity_log (lead_type, lead_id);

-- ============== UPDATED_AT TRIGGERS ==============
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger touch_companies before update on public.companies
  for each row execute function public.touch_updated_at();
create trigger touch_investors before update on public.investors
  for each row execute function public.touch_updated_at();
create trigger touch_profiles before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ============== ROW LEVEL SECURITY ==============
alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.investors enable row level security;
alter table public.activity_log enable row level security;

-- Helper: is the current user a team member or admin?
create or replace function public.is_team_member()
returns boolean
language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin','team')
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Profiles: everyone signed in can read profiles (needed for owner dropdown);
-- you can only update your own profile; only admins can change roles.
create policy "profiles_select_authenticated" on public.profiles
  for select to authenticated using (true);

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));

create policy "profiles_admin_all" on public.profiles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Companies / Investors: only team + admin can see or modify
create policy "companies_team_all" on public.companies
  for all to authenticated
  using (public.is_team_member())
  with check (public.is_team_member());

create policy "investors_team_all" on public.investors
  for all to authenticated
  using (public.is_team_member())
  with check (public.is_team_member());

create policy "activity_team_all" on public.activity_log
  for all to authenticated
  using (public.is_team_member())
  with check (public.is_team_member());

-- ============== REALTIME ==============
-- Enable realtime so multi-user edits show up live
alter publication supabase_realtime add table public.companies;
alter publication supabase_realtime add table public.investors;
alter publication supabase_realtime add table public.activity_log;
