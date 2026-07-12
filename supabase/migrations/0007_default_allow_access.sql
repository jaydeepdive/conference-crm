-- v6.4: Flip the access model + add per-conference visibility.
--
-- Two-tier access:
--   1. Conference-level visibility:
--        'public'  — everyone has full access by default (opt-out via 'hidden' membership)
--        'private' — nobody has access by default (opt-in via a role membership)
--   2. Membership row (per user × conference):
--        role = 'conference_admin' / 'recruiter' / 'finance' / 'viewer' / 'hidden'
--        No row = default for that conference's visibility

-- 1) Add visibility column to conferences (default 'public' so nothing breaks).
alter table public.conferences add column if not exists visibility text not null default 'public'
  check (visibility in ('public','private'));

-- 2) Add 'hidden' to the allowed membership roles.
alter table public.conference_memberships drop constraint if exists conference_memberships_role_check;
alter table public.conference_memberships add constraint conference_memberships_role_check
  check (role in ('conference_admin','recruiter','finance','viewer','hidden'));

-- 3) has_conference_access():
--    public + no membership          → true
--    public + membership.role=hidden → false
--    public + membership.role=other  → true
--    private + no membership          → false
--    private + membership.role=hidden → false
--    private + membership.role=other  → true
create or replace function public.has_conference_access(c_id uuid)
returns boolean language sql security definer set search_path = public as $$
  with conf as (select visibility from public.conferences where id = c_id),
       mem as (
         select role from public.conference_memberships
         where profile_id = auth.uid() and conference_id = c_id
         limit 1
       )
  select public.is_super_admin()
      or (
        (select visibility from conf) = 'public'
        and coalesce((select role != 'hidden' from mem), true)
      )
      or (
        (select visibility from conf) = 'private'
        and exists (select 1 from mem where role != 'hidden')
      );
$$;

-- 4) has_conference_role():
--    Explicit membership with matching role → true (unless hidden)
--    Public conf + no membership + 'conference_admin' in allowed_roles → true
--    Private conf + no membership → false (must be explicitly invited)
create or replace function public.has_conference_role(c_id uuid, allowed_roles text[])
returns boolean language sql security definer set search_path = public as $$
  with conf as (select visibility from public.conferences where id = c_id),
       mem as (
         select role from public.conference_memberships
         where profile_id = auth.uid() and conference_id = c_id
         limit 1
       )
  select public.is_super_admin()
      or exists (
        select 1 from mem
        where role = any(allowed_roles) and role != 'hidden'
      )
      or (
        (select visibility from conf) = 'public'
        and not exists (select 1 from mem)
        and 'conference_admin' = any(allowed_roles)
      );
$$;

-- 5) Cosmetic: change default profile role from 'pending' to 'team' so new signups
--    land in the app instead of the (now-vestigial) pending page. Also lift any existing
--    pending rows since access is no longer gated on this field.
alter table public.profiles alter column role set default 'team';
update public.profiles set role = 'team' where role = 'pending';
