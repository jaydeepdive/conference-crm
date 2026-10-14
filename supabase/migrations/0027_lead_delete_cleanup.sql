-- 0027: When a company or investor is deleted, also delete the rows that
-- point at it without a foreign key (attendee logins, blocked slots,
-- do-not-meet entries). Meetings + company contacts already cascade.
create or replace function public.cleanup_lead_children()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_side text := case when tg_table_name = 'companies' then 'company' else 'investor' end;
begin
  delete from public.attendee_profiles where lead_type = v_side and lead_id = old.id;
  delete from public.attendee_blocked_slots where lead_type = v_side and lead_id = old.id;
  delete from public.meeting_blocklist
   where (from_lead_type = v_side and from_lead_id = old.id)
      or (to_lead_type = v_side and to_lead_id = old.id);
  return old;
end; $$;

drop trigger if exists trg_cleanup_company_children on public.companies;
create trigger trg_cleanup_company_children after delete on public.companies
  for each row execute function public.cleanup_lead_children();
drop trigger if exists trg_cleanup_investor_children on public.investors;
create trigger trg_cleanup_investor_children after delete on public.investors
  for each row execute function public.cleanup_lead_children();
