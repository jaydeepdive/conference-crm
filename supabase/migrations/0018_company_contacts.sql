-- v6.49: Multiple contacts per company.
--
-- Previously companies had a single contact_name / contact_title / email /
-- phone — fine for a sole proprietor, lousy for a company sending three
-- people. This introduces a `company_contacts` child table so each company
-- can carry an arbitrary list, with one marked `is_primary` to drive
-- defaults (SignWell recipient dropdown, invoice "Bill To" line, etc.).
--
-- The legacy columns on `companies` are LEFT IN PLACE for backwards compat:
--   * External intake API still writes them (one-contact signup form).
--   * The UI prefers company_contacts when present, falls back to the
--     legacy columns when the list is empty, so nothing breaks for existing
--     rows that haven't been migrated.
--
-- RLS: same policy as `companies` — mirror conference-access gating so any
-- user who can see the company can see + edit its contacts. Super admins
-- can do anything.
--
-- Idempotent.

create table if not exists public.company_contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  title text,
  email text,
  phone text,
  is_primary boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_company_contacts_company
  on public.company_contacts (company_id);

-- Enforce at most one primary per company. Partial unique index: only rows
-- where is_primary=true are considered.
create unique index if not exists idx_company_contacts_one_primary
  on public.company_contacts (company_id)
  where is_primary;

-- Keep updated_at fresh.
create or replace function public.touch_company_contacts_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists trg_touch_company_contacts on public.company_contacts;
create trigger trg_touch_company_contacts
  before update on public.company_contacts
  for each row execute function public.touch_company_contacts_updated_at();

-- RLS: inherit visibility from the parent company.
alter table public.company_contacts enable row level security;

drop policy if exists company_contacts_select on public.company_contacts;
create policy company_contacts_select on public.company_contacts
  for select to authenticated
  using (
    exists (
      select 1 from public.companies c
      where c.id = company_contacts.company_id
        and public.has_conference_access(c.conference_id)
    )
  );

drop policy if exists company_contacts_insert on public.company_contacts;
create policy company_contacts_insert on public.company_contacts
  for insert to authenticated
  with check (
    exists (
      select 1 from public.companies c
      where c.id = company_contacts.company_id
        and public.has_conference_access(c.conference_id)
    )
  );

drop policy if exists company_contacts_update on public.company_contacts;
create policy company_contacts_update on public.company_contacts
  for update to authenticated
  using (
    exists (
      select 1 from public.companies c
      where c.id = company_contacts.company_id
        and public.has_conference_access(c.conference_id)
    )
  );

drop policy if exists company_contacts_delete on public.company_contacts;
create policy company_contacts_delete on public.company_contacts
  for delete to authenticated
  using (
    exists (
      select 1 from public.companies c
      where c.id = company_contacts.company_id
        and public.has_conference_access(c.conference_id)
    )
  );
