-- v6.46: Auto-promote a company's stage to "registered" whenever its
-- agreement_status flips to "signed".
--
-- Belt-and-suspenders with the app-level updates:
--   * webhook route already sets stage=registered on document_completed.
--   * refresh route does the same.
--   * refresh-all route does too, BUT skips the update when the CRM's
--     agreement_status already matches SignWell's — so pre-existing signed
--     rows never got their stage bumped.
--
-- This trigger closes that gap: any UPDATE that sets agreement_status to
-- 'signed' also bumps stage to 'registered' if it wasn't already there.
-- Applies uniformly regardless of which route (or SQL editor) made the
-- change.
--
-- Also backfills every existing signed row that's still in an earlier
-- stage — one-shot cleanup so the current data is correct.
--
-- Idempotent.

create or replace function public.auto_register_on_signed()
returns trigger
language plpgsql
as $$
begin
  if new.agreement_status = 'signed'
     and (old.agreement_status is distinct from 'signed'
          or coalesce(old.stage, '') <> 'registered')
     and coalesce(new.stage, '') <> 'registered' then
    new.stage := 'registered';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_auto_register_on_signed on public.companies;
create trigger trg_auto_register_on_signed
  before update on public.companies
  for each row execute function public.auto_register_on_signed();

-- One-shot backfill for anything already in 'signed' but stuck in an
-- earlier stage (the reason the user was seeing "Verbal Commit + Signed").
update public.companies
   set stage = 'registered'
 where agreement_status = 'signed'
   and coalesce(stage, '') <> 'registered';
