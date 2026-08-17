-- v6.17: Add "pending_approval" as a valid lead stage.
--
-- Web signups from the third-party registration site land in this state so
-- the operator can review them before they enter the real pipeline. The
-- previous behaviour dumped them straight into "verbal_commit" which
-- implied they'd already been vetted.
--
-- The stage column has a plain CHECK constraint on both companies and
-- investors — we drop and re-add both. Idempotent via `if exists`.

alter table public.companies  drop constraint if exists companies_stage_check;
alter table public.investors  drop constraint if exists investors_stage_check;

alter table public.companies
  add constraint companies_stage_check
  check (stage in ('pending_approval','not_contacted','reaching_out','in_discussion','verbal_commit','registered','declined'));

alter table public.investors
  add constraint investors_stage_check
  check (stage in ('pending_approval','not_contacted','reaching_out','in_discussion','verbal_commit','registered','declined'));
