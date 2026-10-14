-- 0026: Attendee logins no longer read companies / investors / conferences
-- (or other attendees' rows) directly through the API. The portal reads the
-- few public columns it needs server-side (service client, explicit column
-- list — see COMPANY_PUBLIC_COLUMNS / INVESTOR_PUBLIC_COLUMNS in
-- src/lib/platform.ts). Staff access (has_conference_access) is unchanged.
drop policy if exists companies_attendee_read on public.companies;
drop policy if exists investors_attendee_read on public.investors;
drop policy if exists conferences_attendee_read on public.conferences;

-- attendee_profiles: own row + staff only (previously ANY attendee could read
-- every attendee row in the conference, including emails and invite tokens).
drop policy if exists ap_select on public.attendee_profiles;
create policy ap_select on public.attendee_profiles for select
  using (public.is_super_admin() or public.has_conference_access(conference_id) or user_id = auth.uid());
