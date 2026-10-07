-- v6.54: Attendee-side blocks for meeting scheduling.
--
-- Two new tables, both entity-level (keyed on lead_type + lead_id rather
-- than per-person, matching how meetings themselves are scoped):
--
--   attendee_blocked_slots — "my entity is unavailable for a meeting at
--     this slot_time". Hides the slot in the request flow for the OTHER
--     party, and in the admin meeting-create picker. One row per blocked
--     start_time, unique per (conference, lead, slot_time).
--
--   meeting_blocklist — "my entity does not want to be paired with that
--     entity". One directional row — if investor A blocks company B, the
--     admin matcher respects it; if company B hasn't reciprocated that's
--     still enough to warn. UI will encourage the admin to not pair them.
--     Unique per (conference, from_lead, to_lead).
--
-- RLS: an attendee of EITHER party in a blocklist row can see it (so you
-- can see who's declined you — though the UI deliberately hides that from
-- the "to" side). Only the `from` side can edit. Super admins see all.
-- Blocked slots are visible to all attendees in the conference (so the
-- request flow can hide the slot cleanly), editable only by attendees of
-- the lead itself (plus super admins).

create table if not exists public.attendee_blocked_slots (
  id uuid primary key default gen_random_uuid(),
  conference_id uuid not null references public.conferences(id) on delete cascade,
  lead_type text not null check (lead_type in ('company','investor')),
  lead_id uuid not null,
  slot_time timestamptz not null,
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (conference_id, lead_type, lead_id, slot_time)
);
create index if not exists idx_blocked_slots_lookup
  on public.attendee_blocked_slots (conference_id, lead_type, lead_id);

create table if not exists public.meeting_blocklist (
  id uuid primary key default gen_random_uuid(),
  conference_id uuid not null references public.conferences(id) on delete cascade,
  from_lead_type text not null check (from_lead_type in ('company','investor')),
  from_lead_id uuid not null,
  to_lead_type text not null check (to_lead_type in ('company','investor')),
  to_lead_id uuid not null,
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (conference_id, from_lead_type, from_lead_id, to_lead_type, to_lead_id),
  check (from_lead_id <> to_lead_id or from_lead_type <> to_lead_type)
);
create index if not exists idx_blocklist_from
  on public.meeting_blocklist (conference_id, from_lead_type, from_lead_id);
create index if not exists idx_blocklist_to
  on public.meeting_blocklist (conference_id, to_lead_type, to_lead_id);

-- Helper: does the current auth user represent (lead_type, lead_id) via
-- an attendee_profile? Used by RLS policies below.
create or replace function public.attendee_represents(l_type text, l_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.attendee_profiles ap
     where ap.user_id = auth.uid()
       and ap.lead_type = l_type
       and ap.lead_id = l_id
  );
$$;

-- RLS: attendee_blocked_slots
alter table public.attendee_blocked_slots enable row level security;
drop policy if exists blocked_slots_select on public.attendee_blocked_slots;
create policy blocked_slots_select on public.attendee_blocked_slots
  for select to authenticated
  using (
    -- Anyone in the same conference can see (so the request UI can hide slots).
    exists (select 1 from public.attendee_profiles ap
             where ap.user_id = auth.uid()
               and ap.conference_id = attendee_blocked_slots.conference_id)
    or exists (select 1 from public.profiles p
                where p.id = auth.uid() and p.is_super_admin)
  );
drop policy if exists blocked_slots_write on public.attendee_blocked_slots;
create policy blocked_slots_write on public.attendee_blocked_slots
  for all to authenticated
  using (
    public.attendee_represents(lead_type, lead_id)
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_super_admin)
  )
  with check (
    public.attendee_represents(lead_type, lead_id)
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_super_admin)
  );

-- RLS: meeting_blocklist
alter table public.meeting_blocklist enable row level security;
drop policy if exists blocklist_select on public.meeting_blocklist;
create policy blocklist_select on public.meeting_blocklist
  for select to authenticated
  using (
    public.attendee_represents(from_lead_type, from_lead_id)
    or public.attendee_represents(to_lead_type, to_lead_id)
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_super_admin)
  );
drop policy if exists blocklist_write on public.meeting_blocklist;
create policy blocklist_write on public.meeting_blocklist
  for all to authenticated
  using (
    public.attendee_represents(from_lead_type, from_lead_id)
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_super_admin)
  )
  with check (
    public.attendee_represents(from_lead_type, from_lead_id)
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_super_admin)
  );
