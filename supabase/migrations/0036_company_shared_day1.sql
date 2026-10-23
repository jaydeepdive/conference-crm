-- 0036: Everyone at a company shares ONE schedule, including Day 1.
-- New company contacts inherit the company's Day 1 activity.
create or replace function public.inherit_company_day1()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.lead_type = 'company' and new.day1_activity is null then
    select day1_activity into new.day1_activity from public.attendee_profiles
     where lead_type = 'company' and lead_id = new.lead_id and day1_activity is not null limit 1;
  end if;
  return new;
end; $$;
drop trigger if exists trg_inherit_company_day1 on public.attendee_profiles;
create trigger trg_inherit_company_day1 before insert on public.attendee_profiles
  for each row execute function public.inherit_company_day1();

-- Align any company whose contacts currently differ (first non-null wins).
update public.attendee_profiles a set day1_activity = s.act
  from (select distinct on (lead_id) lead_id, day1_activity act from public.attendee_profiles
         where lead_type = 'company' and day1_activity is not null order by lead_id, created_at) s
 where a.lead_type = 'company' and a.lead_id = s.lead_id and a.day1_activity is distinct from s.act;
