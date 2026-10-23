-- 0035: A company (all its contacts share one schedule) and an investor can
-- each hold only ONE booked meeting per time slot. "Booked" = has a
-- scheduled_time and isn't declined/cancelled (includes a confirmed meeting
-- with a pending reschedule, whose original time stays reserved).
create unique index if not exists meetings_one_per_slot_company
  on public.meetings (company_id, scheduled_time)
  where scheduled_time is not null and status not in ('declined','cancelled');
create unique index if not exists meetings_one_per_slot_investor
  on public.meetings (investor_id, scheduled_time)
  where scheduled_time is not null and status not in ('declined','cancelled');
