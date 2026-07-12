-- v6.6a: Fix the SELECT policy on conferences.
--
-- Migration 0007 updated has_conference_access() to be visibility-aware
-- (public → default allow, private → require explicit membership) but the
-- RLS SELECT policy from migration 0003 still required an explicit membership
-- row to list a conference in the picker. That's why non-super-admins were
-- seeing an empty /conferences page even though the conference is public.
--
-- Fix: reuse has_conference_access() in the policy so it honors visibility.

drop policy if exists "conferences_read" on public.conferences;

create policy "conferences_read" on public.conferences for select to authenticated
  using (public.has_conference_access(id));

-- Sanity check: the write policy is unchanged (super_admin only).
-- No changes needed for companies / investors / activity / expenses policies —
-- they already delegate to has_conference_access() / has_conference_role()
-- which we updated in 0007.
