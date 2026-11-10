-- 0039: Event program (all three days) shown on the attendee Schedule page.
-- Hidden from attendees until conferences.program_published = true; super
-- admins previewing ("View as") always see it with a "Preview" banner.
-- Additive only. No emails.

alter table public.conferences add column if not exists program_published boolean not null default false;

create table if not exists public.conference_program_items (
  id uuid primary key default gen_random_uuid(),
  conference_id uuid not null references public.conferences(id) on delete cascade,
  day date not null,
  start_time time not null,
  end_time time,
  title text not null,
  note text,
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists conference_program_items_conf_day on public.conference_program_items (conference_id, day, start_time);
alter table public.conference_program_items enable row level security; -- service-only (portal reads via service client)

-- Seed the program Jordan gave on Nov 10 (only if nothing is there yet).
do $$
declare c uuid;
begin
  select id into c from public.conferences where slug = 'mining-summit-2026';
  if c is null or exists (select 1 from public.conference_program_items where conference_id = c) then return; end if;
  insert into public.conference_program_items (conference_id, day, start_time, end_time, title, note) values
    (c, '2026-11-22', '19:00', '21:00', 'Cocktail Reception', null),

    (c, '2026-11-23', '07:00', '08:15', 'Breakfast Buffet', null),
    (c, '2026-11-23', '08:30', '08:40', 'Kickoff', null),
    (c, '2026-11-23', '08:45', '09:10', 'Steve Hyland', null),
    (c, '2026-11-23', '09:15', '09:40', 'Spencer Gatten', null),
    (c, '2026-11-23', '09:45', '10:10', 'Mark Finchem', null),
    (c, '2026-11-23', '10:15', '10:40', 'Coffee Break', null),
    (c, '2026-11-23', '10:45', '11:10', 'Panel Discussion, TBD', null),
    (c, '2026-11-23', '11:15', '11:55', 'Lynette Zang', null),
    (c, '2026-11-23', '12:00', '12:55', 'Lunch Buffet', null),
    (c, '2026-11-23', '13:00', '13:25', 'Darrell Thomas', null),
    (c, '2026-11-23', '13:30', '13:55', 'Jay Martin', null),
    (c, '2026-11-23', '14:00', '14:25', 'Panel Discussion, TBD', null),
    (c, '2026-11-23', '14:30', '14:55', 'Coffee Break', null),
    (c, '2026-11-23', '15:00', '15:10', 'Marsden Capital', null),
    (c, '2026-11-23', '15:15', '15:40', 'Steve Barton', null),
    (c, '2026-11-23', '15:45', '16:10', 'David Morgan', null),
    (c, '2026-11-23', '18:30', null,    'Welcome Reception at Fogo de Chão', null),
    (c, '2026-11-23', '19:00', null,    'Dinner', null),

    (c, '2026-11-24', '07:00', '07:55', 'Breakfast Buffet', null),
    (c, '2026-11-24', '15:45', null,    '1 oz Gold Eagle Giveaway (Must be present to win)', 'Investors can qualify by attending 8+ prescheduled 1-on-1 meetings.'),
    (c, '2026-11-24', '16:00', null,    'Farewell Message', null),
    (c, '2026-11-24', '17:00', '18:00', 'Farewell Reception', null);
end $$;
