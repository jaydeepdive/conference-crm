-- 0040: Per-company meetings-per-slot limit. Default 1 for every company;
-- Zang International = 3 (Jordan, Nov 10 — exception for Zang ONLY).
-- Investors stay at one meeting per slot (index meetings_one_per_slot_investor).
-- Replaces unique index meetings_one_per_slot_company with a trigger that
-- counts booked meetings at that time against companies.slot_capacity.
-- No emails.

alter table public.companies add column if not exists slot_capacity integer not null default 1;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'companies_slot_capacity_chk') then
    alter table public.companies add constraint companies_slot_capacity_chk check (slot_capacity between 1 and 5);
  end if;
end $$;

update public.companies set slot_capacity = 3 where id = 'd3a007f6-016a-4fe5-963c-a76ea6a04add'; -- Zang International

create or replace function public.enforce_company_slot_capacity()
returns trigger language plpgsql set search_path = public as $$
declare cap integer; n integer;
begin
  if new.scheduled_time is null or new.status in ('declined', 'cancelled') then return new; end if;
  -- Serialize bookings for this company + time so two at once can't both squeeze in.
  perform pg_advisory_xact_lock(hashtextextended(new.company_id::text || '|' || new.scheduled_time::text, 0));
  select coalesce(slot_capacity, 1) into cap from public.companies where id = new.company_id;
  select count(*) into n from public.meetings
   where company_id = new.company_id and scheduled_time = new.scheduled_time
     and status not in ('declined', 'cancelled') and id <> new.id;
  if n >= coalesce(cap, 1) then
    raise exception 'meetings_one_per_slot_company: the company is fully booked at that time'
      using errcode = '23505';
  end if;
  return new;
end; $$;

drop trigger if exists trg_company_slot_capacity on public.meetings;
create trigger trg_company_slot_capacity
  before insert or update of scheduled_time, status, company_id on public.meetings
  for each row execute function public.enforce_company_slot_capacity();

drop index if exists public.meetings_one_per_slot_company;
