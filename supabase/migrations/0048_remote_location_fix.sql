-- 0048: Meetings at a company's extra (remote Monday) time must show the extra
-- slot's location, even when the row was re-opened with an old Tuesday
-- scheduled_time still set while proposing. Check both proposed and scheduled.
create or replace function public.meeting_default_table()
returns trigger language plpgsql set search_path = public as $$
declare x_loc text;
begin
  select x.location into x_loc from public.company_extra_slots x
   where x.company_id = new.company_id
     and x.slot_time in (new.scheduled_time, new.proposed_time)
   order by (x.slot_time = new.scheduled_time) desc limit 1;
  if x_loc is not null and (new.status = 'accepted' and new.scheduled_time is not null
        and exists (select 1 from public.company_extra_slots y where y.company_id = new.company_id and y.slot_time = new.scheduled_time)
      or new.status <> 'accepted') then
    if new.location is null or trim(new.location) = '' or new.location ~ '^Table [0-9]+$' then
      new.location := x_loc;
    end if;
    return new;
  end if;
  if new.location is null or trim(new.location) = '' or (new.location = 'Remote — video call' and new.status = 'accepted'
      and not exists (select 1 from public.company_extra_slots y where y.company_id = new.company_id and y.slot_time = new.scheduled_time)) then
    select meeting_table into new.location from public.companies where id = new.company_id;
  end if;
  return new;
end; $$;
