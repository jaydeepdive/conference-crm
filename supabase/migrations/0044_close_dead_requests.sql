-- 0044: Pending meeting requests whose time is no longer possible (the
-- company is full at that time, the investor is booked then, or either side
-- has that time blocked — e.g. a Deep Dive interview) are closed as
-- "cancelled" so the slot shows as open again. Called by the app after every
-- accept / admin booking / block, and once now. Pairs can request again
-- later (propose re-opens cancelled rows). No emails.
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
                     where b.conference_id = p_conference and b.slot_time = p.proposed_time
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

select public.close_dead_requests(id) from public.conferences where slug = 'mining-summit-2026';
