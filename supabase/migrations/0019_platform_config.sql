-- v6.51: Attendee-facing /platform surface — config + schema additions.
--
-- Adds:
--   * conferences.meeting_date (date) — the single-day 1-on-1 meeting date.
--     For multi-day conferences we fall back to date_start.
--   * conferences.farewell_time (time) — displayed on the dashboard as the
--     closing event ("4:00 PM — Farewell announcement").
--   * meetings.location (text) — table / room number assigned by admin later.
--
-- Also BACKFILLS the "mining-summit-2026" conference with the exact slot
-- config the operator specified:
--   8:00-12:00 AM  — 25 min meetings on a 30 min stride ( 8 slots)
--   12:00-12:30    — lunch break
--   12:30-3:30 PM  — 25 min meetings on a 30 min stride ( 6 slots)
--   4:00 PM        — farewell announcement
--   Total: 14 slots per entity, meeting date 2026-11-24.
--
-- Idempotent — safe to re-run.

alter table public.conferences
  add column if not exists meeting_date   date,
  add column if not exists farewell_time  time;

alter table public.meetings
  add column if not exists location text;

-- Apply the Mining Summit 2026 config. Only touches that one conference.
update public.conferences
   set meeting_date                = '2026-11-24'::date,
       meeting_start_time          = '08:00',
       meeting_end_time            = '15:30',   -- last slot starts 3:00pm, ends 3:25
       meeting_lunch_start         = '12:00',
       meeting_lunch_end           = '12:30',
       meeting_slot_minutes        = 25,
       meeting_slot_stride_minutes = 30,
       farewell_time               = '16:00'
 where slug = 'mining-summit-2026';
