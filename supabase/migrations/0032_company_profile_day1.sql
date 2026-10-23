-- 0032: (a) company portal profile fields, (b) Day 1 activities (site visit / golf).
alter table public.companies add column if not exists category text;
alter table public.companies add column if not exists primary_metal text;
do $$ begin
  alter table public.companies add constraint companies_category_check
    check (category is null or category in ('Explorer','Developer','Producer','Industrials','Royalty'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.companies add constraint companies_primary_metal_check
    check (primary_metal is null or primary_metal in ('Gold','Silver','Copper','Tungsten','Phosphate','Nickel','Polymetallic'));
exception when duplicate_object then null; end $$;

-- Day 1 activity details, one row per activity per conference.
create table if not exists public.conference_activities (
  id uuid primary key default gen_random_uuid(),
  conference_id uuid not null references public.conferences(id) on delete cascade,
  kind text not null check (kind in ('site_visit','golf')),
  title text not null,
  when_text text,          -- e.g. "Sunday, Nov 22 · Bus departs 7:30 AM"
  location text,           -- meeting point / address
  details text,            -- what to bring, dress code, etc.
  updated_at timestamptz not null default now(),
  unique (conference_id, kind)
);
alter table public.conference_activities enable row level security;
drop policy if exists ca_staff on public.conference_activities;
create policy ca_staff on public.conference_activities for all
  using (public.has_conference_access(conference_id)) with check (public.has_conference_access(conference_id));

-- Per-person Day 1 choice.
alter table public.attendee_profiles add column if not exists day1_activity text;
do $$ begin
  alter table public.attendee_profiles add constraint attendee_day1_check
    check (day1_activity is null or day1_activity in ('site_visit','golf','none'));
exception when duplicate_object then null; end $$;

insert into public.conference_activities (conference_id, kind, title, when_text, location)
select id, 'site_visit', 'Site visit', 'Sunday, November 22', null from public.conferences where slug = 'mining-summit-2026'
on conflict (conference_id, kind) do nothing;
insert into public.conference_activities (conference_id, kind, title, when_text, location)
select id, 'golf', 'Golf tournament', 'Sunday, November 22', 'Camelback Golf Club, Scottsdale' from public.conferences where slug = 'mining-summit-2026'
on conflict (conference_id, kind) do nothing;
