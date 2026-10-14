-- 0029: Reschedule a confirmed meeting. While a new time is pending,
-- reschedule_from holds the original confirmed time (scheduled_time stays
-- set so that slot remains booked). Decline/withdraw reverts to it.
alter table public.meetings add column if not exists reschedule_from timestamptz;
alter table public.meeting_events drop constraint if exists meeting_events_kind_check;
alter table public.meeting_events add constraint meeting_events_kind_check
  check (kind = any (array['propose','counter','accept','decline','cancel','note','reschedule','keep']));
