-- 0034: One list of people per company. company_contacts (CRM "Contacts")
-- and company attendee_profiles (portal logins) are kept in sync:
--   * contact with an email at a REGISTERED company  -> portal attendee
--   * company attendee with an email                 -> CRM contact
--   * deleting either removes the other (attendee only if never signed in)
-- No emails are ever sent by any of this.

create or replace function public.sync_contact_to_attendee()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_conf uuid; v_stage text; v_email text;
begin
  if tg_op = 'DELETE' then
    if old.email is not null and length(trim(old.email)) > 0 then
      delete from public.attendee_profiles
       where lead_type = 'company' and lead_id = old.company_id
         and lower(email) = lower(trim(old.email)) and user_id is null;
    end if;
    return old;
  end if;

  v_email := lower(nullif(trim(new.email), ''));
  select conference_id, stage into v_conf, v_stage from public.companies where id = new.company_id;

  -- Email changed on an existing contact: move the unclaimed attendee row along.
  if tg_op = 'UPDATE' and old.email is not null and lower(trim(old.email)) is distinct from v_email then
    if v_email is null or exists (select 1 from public.attendee_profiles where conference_id = v_conf and lower(email) = v_email) then
      delete from public.attendee_profiles
       where lead_type = 'company' and lead_id = new.company_id and lower(email) = lower(trim(old.email)) and user_id is null;
    else
      update public.attendee_profiles set email = v_email, invite_token = null, invite_sent_at = null
       where lead_type = 'company' and lead_id = new.company_id and lower(email) = lower(trim(old.email)) and user_id is null;
    end if;
  end if;

  if v_email is null or v_stage is distinct from 'registered' then return new; end if;

  insert into public.attendee_profiles (conference_id, lead_type, lead_id, email, full_name, title, phone)
  values (v_conf, 'company', new.company_id, v_email, nullif(trim(new.name), ''), new.title, new.phone)
  on conflict (conference_id, email) do update
    set full_name = coalesce(excluded.full_name, public.attendee_profiles.full_name),
        title = coalesce(excluded.title, public.attendee_profiles.title),
        phone = coalesce(excluded.phone, public.attendee_profiles.phone)
    where public.attendee_profiles.lead_type = 'company' and public.attendee_profiles.lead_id = new.company_id;

  -- A real person now exists → drop the "No email on file" placeholder.
  delete from public.attendee_profiles
   where lead_type = 'company' and lead_id = new.company_id and email is null and user_id is null;
  return new;
end; $$;

drop trigger if exists trg_sync_contact_to_attendee on public.company_contacts;
create trigger trg_sync_contact_to_attendee
  after insert or update or delete on public.company_contacts
  for each row execute function public.sync_contact_to_attendee();

create or replace function public.sync_attendee_to_contact()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.lead_type = 'company' and old.email is not null then
      delete from public.company_contacts
       where company_id = old.lead_id and lower(trim(email)) = lower(old.email);
    end if;
    return old;
  end if;
  if new.lead_type <> 'company' or new.email is null then return new; end if;
  if tg_op = 'UPDATE' and old.email is not null and old.email is distinct from new.email then
    update public.company_contacts set email = new.email
     where company_id = new.lead_id and lower(trim(email)) = lower(old.email);
  end if;
  if not exists (select 1 from public.company_contacts
                  where company_id = new.lead_id and lower(trim(email)) = lower(new.email)) then
    insert into public.company_contacts (company_id, name, title, email, phone, is_primary)
    values (new.lead_id, coalesce(new.full_name, new.email), new.title, new.email, new.phone,
            not exists (select 1 from public.company_contacts where company_id = new.lead_id));
  else
    update public.company_contacts
       set name = coalesce(new.full_name, name), title = coalesce(new.title, title), phone = coalesce(new.phone, phone)
     where company_id = new.lead_id and lower(trim(email)) = lower(new.email)
       and (name is distinct from coalesce(new.full_name, name) or title is distinct from coalesce(new.title, title)
            or phone is distinct from coalesce(new.phone, phone));
  end if;
  return new;
end; $$;

drop trigger if exists trg_sync_attendee_to_contact on public.attendee_profiles;
create trigger trg_sync_attendee_to_contact
  after insert or update of email, full_name, title, phone or delete on public.attendee_profiles
  for each row execute function public.sync_attendee_to_contact();

-- Backfill: every existing company attendee with an email becomes a contact.
insert into public.company_contacts (company_id, name, title, email, phone, is_primary)
select a.lead_id, coalesce(a.full_name, a.email), a.title, a.email, a.phone,
       lower(a.email) = lower(coalesce(c.email, ''))
  from public.attendee_profiles a
  join public.companies c on c.id = a.lead_id
 where a.lead_type = 'company' and a.email is not null
   and not exists (select 1 from public.company_contacts cc where cc.company_id = a.lead_id and lower(trim(cc.email)) = lower(a.email));
