-- 0046: Each company has a fixed meeting table (Jordan, Nov 18: alphabetical,
-- Table 1 = Alex Metals … Table 24 = Zang International). Every meeting with
-- that company gets the table as its location unless an admin set one.
-- No emails.
alter table public.companies add column if not exists meeting_table text;

do $$
declare conf uuid := '7ac8254a-ff16-4b27-a964-2d3d0041174d'; r record; i int := 0;
begin
  for r in select id from public.companies where conference_id = conf and stage = 'registered' order by lower(name) loop
    i := i + 1;
    update public.companies set meeting_table = 'Table ' || i where id = r.id;
  end loop;
  if i <> 24 then raise exception 'expected 24 companies, got %', i; end if;
  if (select meeting_table from public.companies where conference_id = conf and name = 'Alex Metals') <> 'Table 1' then
    raise exception 'Alex Metals is not Table 1';
  end if;
end $$;

create or replace function public.meeting_default_table()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.location is null or trim(new.location) = '' then
    select meeting_table into new.location from public.companies where id = new.company_id;
  end if;
  return new;
end; $$;
drop trigger if exists trg_meeting_default_table on public.meetings;
create trigger trg_meeting_default_table before insert or update on public.meetings
  for each row execute function public.meeting_default_table();

update public.meetings m set location = c.meeting_table
  from public.companies c
 where c.id = m.company_id and c.meeting_table is not null and (m.location is null or trim(m.location) = '');
