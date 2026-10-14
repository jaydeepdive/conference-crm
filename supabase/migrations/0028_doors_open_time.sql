-- 0028: Doors-open time shown to attendees (separate from first meeting slot).
alter table public.conferences add column if not exists doors_open_time time;
update public.conferences set doors_open_time = '07:45' where slug = 'mining-summit-2026';
