-- 0030: Registered companies/investors with no usable email still appear in
-- the portal (directory + meetings) as an attendee with email = NULL
-- ("No email on file"). They can't sign in or get invites until an email is
-- added. Unique (conference_id, email) still applies to real emails (NULLs
-- don't collide in Postgres).
alter table public.attendee_profiles alter column email drop not null;

create or replace function public.ensure_attendee_placeholder(p_side text, p_lead uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_conf uuid; v_name text;
begin
  if exists (select 1 from public.attendee_profiles where lead_type = p_side and lead_id = p_lead) then return; end if;
  if p_side = 'company' then
    select conference_id, coalesce(nullif(trim(contact_name), ''), name) into v_conf, v_name from public.companies where id = p_lead;
  else
    select conference_id, coalesce(nullif(trim(contact_name), ''), firm_name) into v_conf, v_name from public.investors where id = p_lead;
  end if;
  if v_conf is null then return; end if;
  insert into public.attendee_profiles (conference_id, lead_type, lead_id, email, full_name)
  values (v_conf, p_side, p_lead, null, v_name);
end; $$;

create or replace function public.auto_create_attendee_on_registered()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_email text;
  v_name text;
  v_side text;
begin
  if new.stage <> 'registered' then return new; end if;
  if tg_op = 'UPDATE' and old.stage = 'registered' then return new; end if;

  v_side := case when tg_table_name = 'companies' then 'company' else 'investor' end;
  v_email := new.email;
  if v_side = 'company' then
    v_name := coalesce(new.contact_name, new.name);
  else
    v_name := coalesce(new.contact_name, new.firm_name);
  end if;

  if v_email is not null and length(trim(v_email)) > 0 then
    insert into public.attendee_profiles (conference_id, lead_type, lead_id, email, full_name)
    values (new.conference_id, v_side, new.id, lower(trim(v_email)), v_name)
    on conflict (conference_id, email) do nothing;
  end if;

  if v_side = 'company' then
    insert into public.attendee_profiles (conference_id, lead_type, lead_id, email, full_name, title, phone)
    select new.conference_id, 'company', new.id, lower(trim(cc.email)), cc.name, cc.title, cc.phone
      from public.company_contacts cc
     where cc.company_id = new.id and cc.email is not null and length(trim(cc.email)) > 0
    on conflict (conference_id, email) do nothing;
  end if;

  -- No usable/unique email → still list them, flagged "No email on file".
  perform public.ensure_attendee_placeholder(v_side, new.id);
  return new;
end; $$;

create or replace function public.backfill_attendee_placeholders(p_conference uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer := 0; r record;
begin
  for r in
    select 'company' as side, c.id from public.companies c
     where c.conference_id = p_conference and c.stage = 'registered'
       and not exists (select 1 from public.attendee_profiles a where a.lead_type = 'company' and a.lead_id = c.id)
    union all
    select 'investor', i.id from public.investors i
     where i.conference_id = p_conference and i.stage = 'registered'
       and not exists (select 1 from public.attendee_profiles a where a.lead_type = 'investor' and a.lead_id = i.id)
  loop
    perform public.ensure_attendee_placeholder(r.side, r.id);
    n := n + 1;
  end loop;
  return n;
end; $$;
revoke all on function public.backfill_attendee_placeholders(uuid) from anon, authenticated;
revoke all on function public.ensure_attendee_placeholder(text, uuid) from anon, authenticated;

select public.backfill_attendee_placeholders(id) from public.conferences;
