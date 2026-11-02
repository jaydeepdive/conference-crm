-- 0038: Attendee logins were labelled 'pending' because GoTrue writes
-- app_metadata.account_type AFTER the insert trigger runs. Fix existing
-- rows and keep it correct from both directions. (Portal access was never
-- affected; this is the Accounts-page label + staff-CRM gate.)
update public.profiles p set account_type = 'attendee'
 where p.account_type = 'pending'
   and exists (select 1 from public.attendee_profiles a where a.user_id = p.id);

-- When auth metadata later says attendee/staff, apply it to a pending profile.
create or replace function public.sync_profile_account_type()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.raw_app_meta_data->>'account_type' in ('staff','attendee') then
    update public.profiles set account_type = new.raw_app_meta_data->>'account_type'
     where id = new.id and account_type = 'pending';
  end if;
  return new;
end; $$;
drop trigger if exists trg_sync_profile_account_type on auth.users;
create trigger trg_sync_profile_account_type
  after update of raw_app_meta_data on auth.users
  for each row execute function public.sync_profile_account_type();

-- When an attendee row gets linked to a login, a pending profile becomes attendee.
create or replace function public.mark_profile_attendee()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is not null and (tg_op = 'INSERT' or old.user_id is distinct from new.user_id) then
    update public.profiles set account_type = 'attendee' where id = new.user_id and account_type = 'pending';
  end if;
  return new;
end; $$;
drop trigger if exists trg_mark_profile_attendee on public.attendee_profiles;
create trigger trg_mark_profile_attendee
  after insert or update of user_id on public.attendee_profiles
  for each row execute function public.mark_profile_attendee();
