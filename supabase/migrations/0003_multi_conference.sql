-- v2: Multi-conference, granular roles, entities, budget tracking.
-- Run AFTER 0001 and 0002. Existing data is preserved.

-- ============== ENTITIES (JV partners) ==============
create table public.entities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  notes text,
  created_at timestamptz not null default now()
);

-- ============== CONFERENCES ==============
create table public.conferences (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  date_start date,
  date_end date,
  status text not null default 'planning' check (status in ('planning','active','past','archived')),
  notes text,
  created_at timestamptz not null default now()
);

-- ============== JV SPLIT (which entities own a conference and at what %) ==============
create table public.conference_entities (
  id uuid primary key default gen_random_uuid(),
  conference_id uuid not null references public.conferences(id) on delete cascade,
  entity_id uuid not null references public.entities(id) on delete cascade,
  split_percentage numeric(5,2) not null default 0 check (split_percentage between 0 and 100),
  unique(conference_id, entity_id)
);

-- ============== PER-CONFERENCE MEMBERSHIPS (granular roles) ==============
create table public.conference_memberships (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  conference_id uuid not null references public.conferences(id) on delete cascade,
  role text not null check (role in ('conference_admin','recruiter','finance','viewer')),
  created_at timestamptz not null default now(),
  unique(profile_id, conference_id)
);

create index cm_profile_idx on public.conference_memberships(profile_id);
create index cm_conf_idx on public.conference_memberships(conference_id);

-- ============== PROFILES: add super_admin flag + entity tag ==============
alter table public.profiles add column is_super_admin boolean not null default false;
alter table public.profiles add column entity_id uuid references public.entities(id) on delete set null;

-- ============== EXPENSES ==============
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  conference_id uuid not null references public.conferences(id) on delete cascade,
  category text not null check (category in ('Venue','Food & Beverage','Audio/Visual','Marketing','Speaker Travel','Staff','Software','Insurance','Other')),
  description text not null,
  amount numeric(10,2) not null,
  date date not null,
  vendor text,
  receipt_url text,
  receipt_path text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index expenses_conf_idx on public.expenses(conference_id);
create index expenses_date_idx on public.expenses(date desc);

create trigger touch_expenses before update on public.expenses
  for each row execute function public.touch_updated_at();

-- ============== ADD conference_id TO EXISTING TABLES ==============
alter table public.companies add column conference_id uuid references public.conferences(id);
alter table public.investors add column conference_id uuid references public.conferences(id);
alter table public.activity_log add column conference_id uuid references public.conferences(id);

-- ============== BOOTSTRAP: create Mining Summit 2026 + migrate existing data ==============
do $$
declare default_conf_id uuid;
begin
  insert into public.conferences (slug, name, date_start, date_end, status)
  values ('mining-summit-2026', 'Mining Summit 2026', '2026-11-15', '2026-11-17', 'planning')
  returning id into default_conf_id;

  update public.companies   set conference_id = default_conf_id where conference_id is null;
  update public.investors   set conference_id = default_conf_id where conference_id is null;
  update public.activity_log set conference_id = default_conf_id where conference_id is null;

  -- Anyone with role 'admin' on v1 becomes a super_admin AND a conference_admin on the default conference
  update public.profiles set is_super_admin = true where role = 'admin';

  insert into public.conference_memberships (profile_id, conference_id, role)
  select p.id, default_conf_id, 'conference_admin'
  from public.profiles p
  where p.role in ('admin','team')
  on conflict do nothing;
end $$;

-- Now make conference_id required
alter table public.companies   alter column conference_id set not null;
alter table public.investors   alter column conference_id set not null;
alter table public.activity_log alter column conference_id set not null;

create index companies_conf_idx on public.companies(conference_id);
create index investors_conf_idx on public.investors(conference_id);
create index activity_conf_idx on public.activity_log(conference_id);

-- ============== NEW RLS HELPERS ==============
create or replace function public.is_super_admin()
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true);
$$;

create or replace function public.has_conference_access(c_id uuid)
returns boolean language sql security definer set search_path = public as $$
  select public.is_super_admin() or exists (
    select 1 from public.conference_memberships
    where profile_id = auth.uid() and conference_id = c_id
  );
$$;

create or replace function public.has_conference_role(c_id uuid, allowed_roles text[])
returns boolean language sql security definer set search_path = public as $$
  select public.is_super_admin() or exists (
    select 1 from public.conference_memberships
    where profile_id = auth.uid() and conference_id = c_id and role = any(allowed_roles)
  );
$$;

-- ============== REPLACE OLD RLS WITH CONFERENCE-SCOPED RLS ==============
drop policy if exists "companies_team_all" on public.companies;
drop policy if exists "investors_team_all" on public.investors;
drop policy if exists "activity_team_all" on public.activity_log;

create policy "companies_conf_scoped" on public.companies
  for all to authenticated
  using (public.has_conference_access(conference_id))
  with check (public.has_conference_access(conference_id));

create policy "investors_conf_scoped" on public.investors
  for all to authenticated
  using (public.has_conference_access(conference_id))
  with check (public.has_conference_access(conference_id));

create policy "activity_conf_scoped" on public.activity_log
  for all to authenticated
  using (public.has_conference_access(conference_id))
  with check (public.has_conference_access(conference_id));

-- Expenses: only conference_admin + finance (or super_admin) can see/edit
alter table public.expenses enable row level security;
create policy "expenses_finance" on public.expenses
  for all to authenticated
  using (public.has_conference_role(conference_id, array['conference_admin','finance']))
  with check (public.has_conference_role(conference_id, array['conference_admin','finance']));

-- Entities: read by any authenticated user (lookup), write by super_admin only
alter table public.entities enable row level security;
create policy "entities_read" on public.entities for select to authenticated using (true);
create policy "entities_admin" on public.entities for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- Conferences: a user can see a conference they have access to; super_admin sees all
alter table public.conferences enable row level security;
create policy "conferences_read" on public.conferences for select to authenticated
  using (
    public.is_super_admin() or exists (
      select 1 from public.conference_memberships
      where profile_id = auth.uid() and conference_id = conferences.id
    )
  );
create policy "conferences_admin" on public.conferences for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- Conference-entity links: super_admin only
alter table public.conference_entities enable row level security;
create policy "ce_super_only" on public.conference_entities for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- Memberships: user can see their own; super_admin sees + manages all; conference_admin can manage their conference
alter table public.conference_memberships enable row level security;
create policy "cm_read_self_or_admin" on public.conference_memberships for select to authenticated
  using (profile_id = auth.uid() or public.is_super_admin()
         or public.has_conference_role(conference_id, array['conference_admin']));
create policy "cm_write_admin" on public.conference_memberships for all to authenticated
  using (public.is_super_admin() or public.has_conference_role(conference_id, array['conference_admin']))
  with check (public.is_super_admin() or public.has_conference_role(conference_id, array['conference_admin']));

-- ============== REALTIME ==============
alter publication supabase_realtime add table public.expenses;
alter publication supabase_realtime add table public.conferences;
alter publication supabase_realtime add table public.conference_memberships;

-- ============== STORAGE BUCKET FOR RECEIPTS ==============
-- Create a 'receipts' bucket via Supabase dashboard or:
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy "receipts_read" on storage.objects for select to authenticated
  using (bucket_id = 'receipts');
create policy "receipts_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts');
create policy "receipts_update" on storage.objects for update to authenticated
  using (bucket_id = 'receipts');
create policy "receipts_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'receipts');
