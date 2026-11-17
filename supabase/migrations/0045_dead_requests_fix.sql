-- 0045: Fix 0044. A person's OWN self-blocked time must not close requests
-- (Shawn Balaghi had blocked his own slots; 7 live requests were wrongly
-- closed on Nov 17). Only a booked meeting (investor busy / company at
-- capacity) or an ADMIN-LOCKED block (e.g. Deep Dive interview) closes them.
-- Also reopens the 7 wrongly closed requests. No emails.
do $$
declare r record; n int := 0;
begin
  for r in
    select m.id from public.meetings m join public.companies c on c.id = m.company_id
     where m.status = 'cancelled'
       and exists (select 1 from public.meeting_events e where e.meeting_id = m.id and e.body like 'Closed automatically%')
       and not exists (select 1 from public.meetings a where a.investor_id = m.investor_id and a.id <> m.id
                         and a.scheduled_time = m.proposed_time and a.status not in ('declined','cancelled'))
       and (select count(*) from public.meetings a where a.company_id = m.company_id and a.id <> m.id
              and a.scheduled_time = m.proposed_time and a.status not in ('declined','cancelled')) < coalesce(c.slot_capacity, 1)
       and not exists (select 1 from public.attendee_blocked_slots b where b.slot_time = m.proposed_time and b.locked
                         and ((b.lead_type = 'company' and b.lead_id = m.company_id) or (b.lead_type = 'investor' and b.lead_id = m.investor_id)))
  loop
    update public.meetings set status = case when exists (select 1 from public.meeting_events e where e.meeting_id = r.id and e.kind = 'counter')
                                             then 'countered' else 'proposed' end, updated_at = now()
     where id = r.id;
    delete from public.meeting_events where meeting_id = r.id and body like 'Closed automatically%';
    n := n + 1;
  end loop;
  raise notice 'reopened %', n;
end $$;

create or replace function public.close_dead_requests(p_conference uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with dead as (
    select p.id, p.proposed_time from public.meetings p
     where p.conference_id = p_conference
       and p.status in ('proposed', 'countered')
       and p.reschedule_from is null
       and p.proposed_time is not null
       and (
         exists (select 1 from public.meetings a
                  where a.investor_id = p.investor_id and a.id <> p.id
                    and a.scheduled_time = p.proposed_time and a.status not in ('declined', 'cancelled'))
         or (select count(*) from public.meetings a
              where a.company_id = p.company_id and a.id <> p.id
                and a.scheduled_time = p.proposed_time and a.status not in ('declined', 'cancelled'))
            >= coalesce((select slot_capacity from public.companies where id = p.company_id), 1)
         or exists (select 1 from public.attendee_blocked_slots b
                     where b.conference_id = p_conference and b.slot_time = p.proposed_time and b.locked
                       and ((b.lead_type = 'company' and b.lead_id = p.company_id)
                         or (b.lead_type = 'investor' and b.lead_id = p.investor_id)))
       )
  ), upd as (
    update public.meetings m set status = 'cancelled', updated_at = now()
      from dead where m.id = dead.id
    returning m.id, dead.proposed_time
  ), ev as (
    insert into public.meeting_events (meeting_id, actor_side, kind, proposed_time, body)
    select id, 'admin', 'cancel', proposed_time, 'Closed automatically — that time was filled by another meeting.' from upd
    returning 1
  )
  select count(*) into n from ev;
  return n;
end; $$;
revoke all on function public.close_dead_requests(uuid) from anon, authenticated;
