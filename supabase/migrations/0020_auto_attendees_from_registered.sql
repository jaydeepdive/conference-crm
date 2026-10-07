-- v6.53: auto-pull registered leads into attendee_profiles.
--
-- WHY: operators mark leads as `stage = 'registered'` once a signup is
-- confirmed. Without manual intervention, those registered leads never
-- show up in the attendee /platform surface or the Platform Invites admin.
-- This trigger fills the gap — every time a company or investor flips to
-- `stage = 'registered'`, we create an attendee_profile row for them
-- (and, for companies, one per company_contact that has an email).
--
-- CRITICAL: this trigger does NOT send email. attendee_profile creation
-- never has — emails only go out when the operator clicks "Send to all
-- unsent" on /platform-invites. Nothing added here changes that.
--
-- The attendee_profiles unique index is (conference_id, email), so repeat
-- registrations / repeat triggers / repeat backfills are no-ops.
--
-- Also backfills every currently-registered lead one time so the admin
-- doesn't have to flip stages to populate the table.
--
-- Idempotent.

create or replace function public.auto_create_attendee_on_registered()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_name text;
  v_side text;
begin
  -- Only fire when the row moves INTO 'registered' (not when it's already there).
  if new.stage <> 'registered' then return new; end if;
  if tg_op = 'UPDATE' and old.stage = 'registered' then return new; end if;

  v_side := case when tg_table_name = 'companies' then 'company' else 'investor' end;
  v_email := new.email;
  if v_side = 'company' then
    v_name := coalesce(new.contact_name, new.name);
  else
    v_name := coalesce(new.contact_name, new.firm_name);
  end if;

  -- Primary attendee: the lead's own email (if present).
  if v_email is not null and length(trim(v_email)) > 0 then
    insert into public.attendee_profiles
      (conference_id, lead_type, lead_id, email, full_name)
    values (new.conference_id, v_side, new.id, lower(trim(v_email)), v_name)
    on conflict (conference_id, email) do nothing;
  end if;

  -- For companies: also create one attendee_profile per company_contact
  -- that has an email. So a company with 3 contacts flipping to registered
  -- lands with up to 4 attendees (lead's own email + 3 contacts).
  if v_side = 'company' then
    insert into public.attendee_profiles
      (conference_id, lead_type, lead_id, email, full_name, title, phone)
    select new.conference_id, 'company', new.id,
           lower(trim(cc.email)), cc.name, cc.title, cc.phone
      from public.company_contacts cc
     where cc.company_id = new.id
       and cc.email is not null
       and length(trim(cc.email)) > 0
    on conflict (conference_id, email) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_auto_attendee_on_companies on public.companies;
create trigger trg_auto_attendee_on_companies
  after insert or update on public.companies
  for each row execute function public.auto_create_attendee_on_registered();

drop trigger if exists trg_auto_attendee_on_investors on public.investors;
create trigger trg_auto_attendee_on_investors
  after insert or update on public.investors
  for each row execute function public.auto_create_attendee_on_registered();

-- One-shot backfill: every lead ALREADY marked registered gets its attendee
-- row (and its company_contacts) created now.
insert into public.attendee_profiles (conference_id, lead_type, lead_id, email, full_name)
select c.conference_id, 'company', c.id, lower(trim(c.email)), coalesce(c.contact_name, c.name)
from public.companies c
where c.stage = 'registered'
  and c.email is not null
  and length(trim(c.email)) > 0
on conflict (conference_id, email) do nothing;

insert into public.attendee_profiles (conference_id, lead_type, lead_id, email, full_name)
select i.conference_id, 'investor', i.id, lower(trim(i.email)), coalesce(i.contact_name, i.firm_name)
from public.investors i
where i.stage = 'registered'
  and i.email is not null
  and length(trim(i.email)) > 0
on conflict (conference_id, email) do nothing;

insert into public.attendee_profiles (conference_id, lead_type, lead_id, email, full_name, title, phone)
select c.conference_id, 'company', c.id,
       lower(trim(cc.email)), cc.name, cc.title, cc.phone
from public.companies c
join public.company_contacts cc on cc.company_id = c.id
where c.stage = 'registered'
  and cc.email is not null
  and length(trim(cc.email)) > 0
on conflict (conference_id, email) do nothing;
