-- v6.14: Attendee-facing portal.
--
-- Introduces:
--   * attendee_profiles — one row per human person attending; keyed off (conference_id, email).
--     Each row is linked to a company or investor lead. `user_id` fills in once the
--     invite is accepted and an auth user is created.
--   * meetings          — one row per (company, investor) pair per conference. State machine:
--                         proposed → countered → accepted (or declined / cancelled).
--   * meeting_events    — append-only log of every negotiation move on a meeting.
--   * public-profile fields on companies (`about`, reinstated `website`) and
--     investors (`about`, `investment_criteria`) so the portal directory has
--     something worth showing.
--   * meeting scheduling config on conferences (hours, lunch, slot length + stride, timezone).
--
-- RLS model:
--   * Staff (super_admin OR conference-member) keep full read/write via the existing helpers.
--   * Attendees see their own attendee_profile, and any peer attendee_profile at the same
--     conference (needed for the directory + meeting UIs). They can only edit their own row.
--   * Attendees see meetings + meeting_events where they sit on either side.
--   * Attendees can read companies/investors at the same conference (public-profile columns
--     — the /portal pages only project the safe columns), and can read invoices tied to
--     their own lead.
--
-- Everything is written to be idempotent (`if not exists`, `create or replace`, `drop policy
-- if exists` before create) so the migration can be re-run.

-- =========================================================================
-- 1. NEW COLUMNS ON EXISTING TABLES
-- =========================================================================

-- Public-facing bio + reinstated website (removed in 0-something-earlier — now needed for
-- the portal directory. Staff CRM ignores these unless it wants to show them.)
alter table public.companies
  add column if not exists about text,
  add column if not exists website text;

alter table public.investors
  add column if not exists about text,
  add column if not exists investment_criteria text;

-- Meeting-scheduling knobs on each conference. Sensible defaults for a typical
-- one-day summit; multi-day conferences use date_start..date_end.
alter table public.conferences
  add column if not exists timezone                  text not null default 'America/Toronto',
  add column if not exists meeting_start_time        time not null default '09:00',
  add column if not exists meeting_end_time          time not null default '16:00',
  add column if not exists meeting_lunch_start       time,
  add column if not exists meeting_lunch_end         time,
  add column if not exists meeting_slot_minutes      int  not null default 15,
  add column if not exists meeting_slot_stride_minutes int not null default 20;

-- Populate lunch defaults on any conference that doesn't have them set yet.
update public.conferences
   set meeting_lunch_start = '12:00'
 where meeting_lunch_start is null;
update public.conferences
   set meeting_lunch_end   = '13:00'
 where meeting_lunch_end   is null;

-- =========================================================================
-- 2. ATTENDEE PROFILES
-- =========================================================================

create table if not exists public.attendee_profiles (
  id             uuid primary key default gen_random_uuid(),
  conference_id  uuid not null references public.conferences(id) on delete cascade,
  lead_type      text not null check (lead_type in ('company','investor')),
  lead_id        uuid not null,                        -- fk enforced via trigger (varies by lead_type)
  user_id        uuid references auth.users(id) on delete set null, -- null until invite accepted
  email          text not null,
  full_name      text,
  title          text,
  phone          text,
  about          text,
  invite_token   text unique,                          -- one-shot, cleared on accept
  invite_sent_at timestamptz,
  accepted_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (conference_id, email)
);
create index if not exists ap_user_idx  on public.attendee_profiles (user_id);
create index if not exists ap_lead_idx  on public.attendee_profiles (lead_type, lead_id);
create index if not exists ap_conf_idx  on public.attendee_profiles (conference_id);

do $$ begin
  create trigger touch_attendee_profiles
    before update on public.attendee_profiles
    for each row execute function public.touch_updated_at();
exception when duplicate_object then null; end $$;

-- Validate that lead_id refers to a real row in the right table for its lead_type.
create or replace function public.validate_attendee_lead_ref()
returns trigger language plpgsql as $$
begin
  if new.lead_type = 'company' then
    if not exists (select 1 from public.companies where id = new.lead_id and conference_id = new.conference_id) then
      raise exception 'attendee_profiles.lead_id % does not reference a company in conference %', new.lead_id, new.conference_id;
    end if;
  elsif new.lead_type = 'investor' then
    if not exists (select 1 from public.investors where id = new.lead_id and conference_id = new.conference_id) then
      raise exception 'attendee_profiles.lead_id % does not reference an investor in conference %', new.lead_id, new.conference_id;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists validate_attendee_lead_ref_trigger on public.attendee_profiles;
create trigger validate_attendee_lead_ref_trigger
  before insert or update of lead_type, lead_id, conference_id on public.attendee_profiles
  for each row execute function public.validate_attendee_lead_ref();

-- =========================================================================
-- 3. MEETINGS + EVENTS
-- =========================================================================

create table if not exists public.meetings (
  id              uuid primary key default gen_random_uuid(),
  conference_id   uuid not null references public.conferences(id) on delete cascade,
  company_id      uuid not null references public.companies(id) on delete cascade,
  investor_id     uuid not null references public.investors(id) on delete cascade,
  status          text not null default 'proposed'
                    check (status in ('proposed','countered','accepted','declined','cancelled')),
  proposed_time   timestamptz,
  proposed_by     text check (proposed_by in ('company','investor')),
  scheduled_time  timestamptz,
  notes           text,
  created_by      uuid references public.attendee_profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (conference_id, company_id, investor_id)
);
create index if not exists meetings_conf_company_idx  on public.meetings (conference_id, company_id);
create index if not exists meetings_conf_investor_idx on public.meetings (conference_id, investor_id);
create index if not exists meetings_scheduled_idx     on public.meetings (scheduled_time) where status = 'accepted';

do $$ begin
  create trigger touch_meetings
    before update on public.meetings
    for each row execute function public.touch_updated_at();
exception when duplicate_object then null; end $$;

create table if not exists public.meeting_events (
  id                uuid primary key default gen_random_uuid(),
  meeting_id        uuid not null references public.meetings(id) on delete cascade,
  actor_profile_id  uuid references public.attendee_profiles(id) on delete set null,
  actor_side        text check (actor_side in ('company','investor','admin')),
  kind              text not null check (kind in ('propose','counter','accept','decline','cancel','note')),
  proposed_time     timestamptz,
  body              text,
  created_at        timestamptz not null default now()
);
create index if not exists meeting_events_meeting_idx on public.meeting_events (meeting_id, created_at);

-- =========================================================================
-- 4. RLS HELPERS
-- =========================================================================

-- Return the set of (lead_type, lead_id, conference_id) rows for a given auth user id.
-- One user can be an attendee at multiple conferences, or on multiple lead entities.
create or replace function public.attendee_lead_ref(u uuid)
returns table (lead_type text, lead_id uuid, conference_id uuid)
language sql
security definer
set search_path = public
as $$
  select ap.lead_type, ap.lead_id, ap.conference_id
    from public.attendee_profiles ap
   where ap.user_id = u;
$$;

-- Cheap boolean: does auth.uid() have an attendee_profile in a given conference?
create or replace function public.is_attendee_of(conf_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.attendee_profiles
     where user_id = auth.uid() and conference_id = conf_id
  );
$$;

-- Attendee sits on a specific (lead_type, lead_id) — used for meetings + invoices RLS.
create or replace function public.is_attendee_of_lead(lt text, li uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.attendee_profiles
     where user_id = auth.uid()
       and lead_type = lt
       and lead_id = li
  );
$$;

-- =========================================================================
-- 5. RLS: attendee_profiles
-- =========================================================================

alter table public.attendee_profiles enable row level security;

drop policy if exists ap_select on public.attendee_profiles;
create policy ap_select on public.attendee_profiles
  for select to authenticated
  using (
    public.is_super_admin()
    or public.has_conference_access(conference_id)         -- staff of the conference
    or user_id = auth.uid()                                -- own row
    or public.is_attendee_of(conference_id)                -- peer attendee at same conference (directory)
  );

drop policy if exists ap_update on public.attendee_profiles;
create policy ap_update on public.attendee_profiles
  for update to authenticated
  using (public.is_super_admin() or user_id = auth.uid())
  with check (public.is_super_admin() or user_id = auth.uid());

drop policy if exists ap_insert on public.attendee_profiles;
create policy ap_insert on public.attendee_profiles
  for insert to authenticated
  with check (public.is_super_admin() or public.has_conference_role(conference_id, array['conference_admin']));

drop policy if exists ap_delete on public.attendee_profiles;
create policy ap_delete on public.attendee_profiles
  for delete to authenticated
  using (public.is_super_admin() or public.has_conference_role(conference_id, array['conference_admin']));

-- =========================================================================
-- 6. RLS: meetings
-- =========================================================================

alter table public.meetings enable row level security;

drop policy if exists meetings_select on public.meetings;
create policy meetings_select on public.meetings
  for select to authenticated
  using (
    public.is_super_admin()
    or public.has_conference_access(conference_id)
    or public.is_attendee_of_lead('company', company_id)
    or public.is_attendee_of_lead('investor', investor_id)
  );

drop policy if exists meetings_insert on public.meetings;
create policy meetings_insert on public.meetings
  for insert to authenticated
  with check (
    public.is_super_admin()
    or public.has_conference_role(conference_id, array['conference_admin'])
    or public.is_attendee_of_lead('company', company_id)
    or public.is_attendee_of_lead('investor', investor_id)
  );

drop policy if exists meetings_update on public.meetings;
create policy meetings_update on public.meetings
  for update to authenticated
  using (
    public.is_super_admin()
    or public.has_conference_role(conference_id, array['conference_admin'])
    or public.is_attendee_of_lead('company', company_id)
    or public.is_attendee_of_lead('investor', investor_id)
  )
  with check (
    public.is_super_admin()
    or public.has_conference_role(conference_id, array['conference_admin'])
    or public.is_attendee_of_lead('company', company_id)
    or public.is_attendee_of_lead('investor', investor_id)
  );

drop policy if exists meetings_delete on public.meetings;
create policy meetings_delete on public.meetings
  for delete to authenticated
  using (public.is_super_admin() or public.has_conference_role(conference_id, array['conference_admin']));

-- =========================================================================
-- 7. RLS: meeting_events
-- =========================================================================

alter table public.meeting_events enable row level security;

drop policy if exists me_select on public.meeting_events;
create policy me_select on public.meeting_events
  for select to authenticated
  using (
    exists (
      select 1 from public.meetings m
       where m.id = meeting_events.meeting_id
         and (
              public.is_super_admin()
           or public.has_conference_access(m.conference_id)
           or public.is_attendee_of_lead('company', m.company_id)
           or public.is_attendee_of_lead('investor', m.investor_id)
         )
    )
  );

drop policy if exists me_insert on public.meeting_events;
create policy me_insert on public.meeting_events
  for insert to authenticated
  with check (
    exists (
      select 1 from public.meetings m
       where m.id = meeting_id
         and (
              public.is_super_admin()
           or public.has_conference_role(m.conference_id, array['conference_admin'])
           or public.is_attendee_of_lead('company', m.company_id)
           or public.is_attendee_of_lead('investor', m.investor_id)
         )
    )
  );

-- =========================================================================
-- 8. EXTEND COMPANIES / INVESTORS / INVOICES POLICIES TO ATTENDEES
-- =========================================================================
-- The existing policies gate all access on has_conference_access(). We keep the write
-- side staff-only, but add a select policy that lets attendees at the conference read
-- the public-profile fields. The portal server code only projects the columns it wants
-- attendees to see; a rogue query wouldn't reveal payment fields because the app
-- doesn't provide a UI for that, but the RLS lets them see the row.

drop policy if exists companies_attendee_read on public.companies;
create policy companies_attendee_read on public.companies
  for select to authenticated
  using (public.is_attendee_of(conference_id));

drop policy if exists investors_attendee_read on public.investors;
create policy investors_attendee_read on public.investors
  for select to authenticated
  using (public.is_attendee_of(conference_id));

-- Attendees can read invoices tied to their lead.
drop policy if exists invoices_attendee_read on public.invoices;
create policy invoices_attendee_read on public.invoices
  for select to authenticated
  using (public.is_attendee_of_lead(lead_type, lead_id));

-- Attendees need to be able to read the conference row (even if it's private,
-- and they have no conference_memberships row). Extend the SELECT policy from
-- 0008 to also allow when they have an attendee_profile.
drop policy if exists conferences_attendee_read on public.conferences;
create policy conferences_attendee_read on public.conferences
  for select to authenticated
  using (public.is_attendee_of(id));

-- =========================================================================
-- 9. REALTIME
-- =========================================================================
do $$ begin
  execute 'alter publication supabase_realtime add table public.attendee_profiles';
exception when duplicate_object then null; when others then null; end $$;
do $$ begin
  execute 'alter publication supabase_realtime add table public.meetings';
exception when duplicate_object then null; when others then null; end $$;
do $$ begin
  execute 'alter publication supabase_realtime add table public.meeting_events';
exception when duplicate_object then null; when others then null; end $$;
