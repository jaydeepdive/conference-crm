-- 0043: Admin-locked blocked slots + The Deep Dive interview blocks (Nov 24).
-- attendee_blocked_slots.locked = set by an admin; attendees can't remove it.
-- 16 company interview times (2 per 30-min slot, 15 min each) chosen Nov 16
-- from open time only — no meetings cancelled, no emails.
alter table public.attendee_blocked_slots add column if not exists locked boolean not null default false;

do $$
declare
  conf uuid := '7ac8254a-ff16-4b27-a964-2d3d0041174d';
  r record; co uuid;
begin
  for r in select * from (values
    ('PTX Metals',                   '08:00', '8:00–8:15 AM'),
    ('Canadian Copper',              '08:00', '8:15–8:30 AM'),
    ('Epic Gold',                    '08:30', '8:30–8:45 AM'),
    ('New Break Resources Ltd.',     '08:30', '8:45–9:00 AM'),
    ('Cupani Metals Corp.',          '09:00', '9:00–9:15 AM'),
    ('Black Swan Graphene',          '09:30', '9:30–9:45 AM'),
    ('Renforth Resources',           '09:30', '9:45–10:00 AM'),
    ('Blade Resources',              '10:30', '10:30–10:45 AM'),
    ('Ravena Resources',             '11:30', '11:30–11:45 AM'),
    ('Prismo Metals',                '11:30', '11:45 AM–12:00 PM'),
    ('Nortec Minerals',              '12:30', '12:30–12:45 PM'),
    ('Zang International',           '13:30', '1:30–1:45 PM'),
    ('Steadright Critical Minerals', '13:30', '1:45–2:00 PM'),
    ('Granada Gold Mine Inc',        '14:30', '2:30–2:45 PM'),
    ('Riverside Resources',          '14:30', '2:45–3:00 PM'),
    ('Alex Metals',                  '15:00', '3:00–3:15 PM')
  ) v(name, slot, label) loop
    select id into co from public.companies where conference_id = conf and name = r.name and stage = 'registered';
    if co is null then raise exception 'company not found: %', r.name; end if;
    insert into public.attendee_blocked_slots (conference_id, lead_type, lead_id, slot_time, reason, locked)
    values (conf, 'company', co, ('2026-11-24 ' || r.slot || ':00')::timestamp at time zone 'America/Phoenix',
            'The Deep Dive Interview · ' || r.label, true)
    on conflict (conference_id, lead_type, lead_id, slot_time)
      do update set reason = excluded.reason, locked = true;
  end loop;
end $$;
