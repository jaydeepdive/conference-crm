-- 0047: Extra bookable meeting times for a company outside the Tuesday grid
-- (Nov 20: Rackla Metals + Power Metallic attend remotely; 3 Monday Nov 23
-- times each, 25 min, booked by investors through the portal like normal).
-- Meetings at an extra time get that slot's location ("Remote — video call")
-- instead of the company's table. Tuesday untouched. No emails.
create table if not exists public.company_extra_slots (
  id uuid primary key default gen_random_uuid(),
  conference_id uuid not null references public.conferences(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  slot_time timestamptz not null,
  duration_minutes integer not null default 25,
  location text not null default 'Remote — video call',
  created_at timestamptz not null default now(),
  unique (company_id, slot_time)
);
alter table public.company_extra_slots enable row level security; -- service-only

do $$
declare conf uuid := '7ac8254a-ff16-4b27-a964-2d3d0041174d'; rackla uuid; pm uuid;
begin
  select id into rackla from public.companies where conference_id = conf and name = 'Rackla Metals';
  select id into pm from public.companies where conference_id = conf and name = 'Power Metallic';
  if rackla is null or pm is null then raise exception 'company not found'; end if;
  insert into public.company_extra_slots (conference_id, company_id, slot_time) values
    (conf, rackla, '2026-11-23 09:00'::timestamp at time zone 'America/Phoenix'),
    (conf, rackla, '2026-11-23 09:30'::timestamp at time zone 'America/Phoenix'),
    (conf, rackla, '2026-11-23 10:00'::timestamp at time zone 'America/Phoenix'),
    (conf, pm,     '2026-11-23 13:00'::timestamp at time zone 'America/Phoenix'),
    (conf, pm,     '2026-11-23 14:00'::timestamp at time zone 'America/Phoenix'),
    (conf, pm,     '2026-11-23 15:00'::timestamp at time zone 'America/Phoenix')
  on conflict (company_id, slot_time) do nothing;
end $$;

create or replace function public.meeting_default_table()
returns trigger language plpgsql set search_path = public as $$
declare t timestamptz;
begin
  t := coalesce(new.scheduled_time, new.proposed_time);
  -- A meeting at one of the company's extra (e.g. remote Monday) times uses that slot's location.
  if t is not null and exists (select 1 from public.company_extra_slots x where x.company_id = new.company_id and x.slot_time = t) then
    if new.location is null or trim(new.location) = '' or new.location ~ '^Table [0-9]+$' then
      select x.location into new.location from public.company_extra_slots x where x.company_id = new.company_id and x.slot_time = t;
    end if;
    return new;
  end if;
  if new.location is null or trim(new.location) = '' then
    select meeting_table into new.location from public.companies where id = new.company_id;
  end if;
  return new;
end; $$;
