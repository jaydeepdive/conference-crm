-- 0025: Separate STAFF accounts from ATTENDEE accounts and unapproved sign-ups.
--   staff    = CRM team (default-allow conference access as before)
--   attendee = portal-only login (created by invite accept / admin set-password)
--   pending  = self-signed-up on the staff login; NO CRM access until approved
alter table public.profiles
  add column if not exists account_type text not null default 'pending';
do $$ begin
  alter table public.profiles add constraint profiles_account_type_check
    check (account_type in ('staff','attendee','pending'));
exception when duplicate_object then null; end $$;

-- Backfill: the existing confirmed team are staff; unconfirmed sign-ups pending;
-- anyone who is only an attendee login becomes attendee.
update public.profiles p set account_type = 'staff'
from auth.users u
where u.id = p.id and (p.is_super_admin or u.email_confirmed_at is not null)
  and p.created_at < '2026-10-01';
update public.profiles p set account_type = 'attendee'
where p.account_type <> 'staff'
  and exists (select 1 from public.attendee_profiles a where a.user_id = p.id);

-- New auth users: type comes from APP metadata (only settable by server/admin
-- API, never by the user). Anything else = pending.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, account_type)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    case when new.raw_app_meta_data->>'account_type' in ('staff','attendee')
         then new.raw_app_meta_data->>'account_type' else 'pending' end
  );
  return new;
end; $$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and (is_super_admin or account_type = 'staff'));
$$;

-- CRM data access now requires a staff (or super admin) account.
create or replace function public.has_conference_access(c_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  with conf as (select visibility from public.conferences where id = c_id),
       mem as (
         select role from public.conference_memberships
         where profile_id = auth.uid() and conference_id = c_id
         limit 1
       )
  select public.is_super_admin()
      or (public.is_staff() and (
           ((select visibility from conf) = 'public'
             and coalesce((select role != 'hidden' from mem), true))
        or ((select visibility from conf) = 'private'
             and exists (select 1 from mem where role != 'hidden'))
      ));
$$;

create or replace function public.has_conference_role(c_id uuid, allowed_roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  with conf as (select visibility from public.conferences where id = c_id),
       mem as (
         select role from public.conference_memberships
         where profile_id = auth.uid() and conference_id = c_id
         limit 1
       )
  select public.is_super_admin()
      or (public.is_staff() and (
           exists (select 1 from mem where role = any(allowed_roles) and role != 'hidden')
        or ((select visibility from conf) = 'public'
             and not exists (select 1 from mem)
             and 'conference_admin' = any(allowed_roles))
      ));
$$;

-- Users may not promote themselves (account_type / super admin).
create or replace function public.guard_profile_privileges()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_super_admin()
     and (new.account_type is distinct from old.account_type
          or new.is_super_admin is distinct from old.is_super_admin) then
    raise exception 'Not allowed to change account type or admin status';
  end if;
  return new;
end; $$;
drop trigger if exists guard_profile_privileges on public.profiles;
create trigger guard_profile_privileges before update on public.profiles
  for each row execute function public.guard_profile_privileges();
