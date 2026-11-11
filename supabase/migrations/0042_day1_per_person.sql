-- 0042: Day 1 (site visit / golf) is per PERSON, not per company (Jordan,
-- Nov 11). New company contacts no longer inherit a colleague's activity.
drop trigger if exists trg_inherit_company_day1 on public.attendee_profiles;
drop function if exists public.inherit_company_day1();
