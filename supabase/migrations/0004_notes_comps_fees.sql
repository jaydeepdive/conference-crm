-- v3: lead notes with attribution, comp catalog + assignments, management fee terms on JV splits.
-- Run AFTER 0003. Existing data preserved.

-- ============== LEAD NOTES (with attribution) ==============
create table public.lead_notes (
  id uuid primary key default gen_random_uuid(),
  conference_id uuid not null references public.conferences(id) on delete cascade,
  lead_type text not null check (lead_type in ('company','investor')),
  lead_id uuid not null,
  user_id uuid references public.profiles(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ln_lead_idx on public.lead_notes (lead_type, lead_id, created_at desc);
create index ln_conf_idx on public.lead_notes (conference_id);

create trigger touch_lead_notes before update on public.lead_notes
  for each row execute function public.touch_updated_at();

alter table public.lead_notes enable row level security;
create policy "lead_notes_conf_scoped" on public.lead_notes
  for all to authenticated
  using (public.has_conference_access(conference_id))
  with check (public.has_conference_access(conference_id));

-- ============== COMP CATALOG (per conference) ==============
create table public.comp_types (
  id uuid primary key default gen_random_uuid(),
  conference_id uuid not null references public.conferences(id) on delete cascade,
  name text not null,
  default_cost numeric(10,2) not null default 0,
  expense_category text not null default 'Other'
    check (expense_category in ('Venue','Food & Beverage','Audio/Visual','Marketing','Speaker Travel','Staff','Software','Insurance','Other')),
  created_at timestamptz not null default now(),
  unique(conference_id, name)
);
create index ct_conf_idx on public.comp_types (conference_id);

alter table public.comp_types enable row level security;
create policy "comp_types_conf_scoped" on public.comp_types
  for all to authenticated
  using (public.has_conference_access(conference_id))
  with check (public.has_conference_role(conference_id, array['conference_admin','finance']));

-- Seed default comp types for the existing Mining Summit 2026 conference
do $$
declare conf_id uuid;
begin
  select id into conf_id from public.conferences where slug = 'mining-summit-2026' limit 1;
  if conf_id is not null then
    insert into public.comp_types (conference_id, name, default_cost, expense_category) values
      (conf_id, 'Hotel - 1 night', 250, 'Speaker Travel'),
      (conf_id, 'Hotel - 2 nights', 500, 'Speaker Travel'),
      (conf_id, 'Flight - domestic', 600, 'Speaker Travel'),
      (conf_id, 'Flight - international', 1800, 'Speaker Travel'),
      (conf_id, 'Golf round', 350, 'Other'),
      (conf_id, 'VIP dinner seat', 200, 'Food & Beverage'),
      (conf_id, 'Registration waived', 0, 'Other')
    on conflict (conference_id, name) do nothing;
  end if;
end $$;

-- ============== LEAD COMPS (assigned to specific leads) ==============
create table public.lead_comps (
  id uuid primary key default gen_random_uuid(),
  conference_id uuid not null references public.conferences(id) on delete cascade,
  lead_type text not null check (lead_type in ('company','investor')),
  lead_id uuid not null,
  comp_type_id uuid references public.comp_types(id) on delete set null,
  name text not null, -- denormalized so deletion of comp_type doesn't lose the assignment label
  cost numeric(10,2) not null default 0,
  expense_category text not null default 'Other',
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index lc_lead_idx on public.lead_comps (lead_type, lead_id);
create index lc_conf_idx on public.lead_comps (conference_id);

alter table public.lead_comps enable row level security;
create policy "lead_comps_conf_scoped" on public.lead_comps
  for all to authenticated
  using (public.has_conference_access(conference_id))
  with check (public.has_conference_access(conference_id));

-- ============== MANAGEMENT FEE TERMS on conference_entities ==============
alter table public.conference_entities add column fee_label text;
alter table public.conference_entities add column fee_type text not null default 'split_only'
  check (fee_type in ('split_only','per_company','per_investor','per_lead','flat'));
alter table public.conference_entities add column fee_amount numeric(10,2) not null default 0;
alter table public.conference_entities add column fee_basis text not null default 'registered'
  check (fee_basis in ('signed_up','registered','paid'));
alter table public.conference_entities add column fee_min numeric(10,2);
alter table public.conference_entities add column fee_max numeric(10,2);

-- ============== REALTIME ==============
alter publication supabase_realtime add table public.lead_notes;
alter publication supabase_realtime add table public.comp_types;
alter publication supabase_realtime add table public.lead_comps;
