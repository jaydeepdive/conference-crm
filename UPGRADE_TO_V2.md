# Upgrade to v2 — multi-conference, granular roles, budget

You're upgrading the live app from v1 (single Mining Summit, two roles) to v2 (multiple conferences, six roles, budget tracking, JV entity management).

**Your existing data is preserved.** The migration automatically creates a "Mining Summit 2026" conference and moves all current companies, investors, and activity into it.

## Step 1 — Pull the new code locally

In GitHub Desktop:

1. **Repository → Pull origin** (in case there are remote changes you haven't pulled).
2. Drag-and-drop the new zip's contents over your existing `conference-crm` folder, overwriting everything. Files I removed are now redirects; files I added show up as new.
3. GitHub Desktop will show the diff. Commit with message "v2: multi-conference + roles + budget". Push origin.

Vercel will auto-deploy on push. While that's building, run the migration.

## Step 2 — Run the migration in Supabase

Supabase → SQL Editor → New query. Paste this and run:

```sql
-- (Contents of supabase/migrations/0003_multi_conference.sql)
```

Open `supabase/migrations/0003_multi_conference.sql` from your local folder and paste the whole thing. It should return "Success. No rows returned."

The migration:
- Adds tables: `conferences`, `entities`, `conference_entities`, `conference_memberships`, `expenses`
- Adds columns: `profiles.is_super_admin`, `profiles.entity_id`, conference scoping on existing tables
- Creates a "Mining Summit 2026" conference and assigns all existing leads to it
- Promotes your v1 admin (you) to `super_admin` and gives existing team members `conference_admin` on the default conference
- Replaces the old RLS policies with new conference-scoped ones
- Creates a `receipts` storage bucket with policies for the budget page

## Step 3 — Verify the migration

In SQL Editor, run:

```sql
select id, slug, name, status from public.conferences;
select email, is_super_admin, entity_id from public.profiles;
select count(*) from public.companies where conference_id is null;  -- should be 0
select count(*) from public.investors where conference_id is null;  -- should be 0
```

If everything looks right, refresh your live Vercel URL. You should see the new conferences picker (or auto-redirect into Mining Summit 2026 since it's your only one).

## Step 4 — Add your business partner as super admin

Since they're already in the database (or will be once they sign in):

1. Vercel URL → **Admin** (top-right, super admin only) → **Users**.
2. Find them → click their "No — click to grant" pill in the Super admin column.
3. Done. They now have the same powers you do.

## Step 5 — Set up your JV entities + revenue split

1. **Admin → Entities** → add each parent organization (e.g. "Deep Dive Capital", "Co-Host LLC"). Just name + optional notes.
2. **Admin → Conferences** → click into Mining Summit 2026 (the row).
3. Under "JV split" → add each entity with their split percentage. Total should be 100%.
4. Done. The Budget page now shows JV revenue split for super admins.

## Step 6 — Onboard your other 4 teammates

Each of them does the same flow as you:

1. They open the Vercel URL.
2. Sign in with Google.
3. Land on the "Waiting for approval" page... actually no — in v2, they land on "no conferences available" since they have no memberships yet.
4. You (super admin) go to Mining Summit 2026 → **Team** tab → find their row → set their role to **Recruiter** (or whatever fits).
5. They refresh, and they're in with only the access their role allows.

## Role cheat sheet

| Role | Companies/Investors | Payment data | Budget tab | Team mgmt |
|---|---|---|---|---|
| super_admin (global) | All conferences | ✅ | ✅ | ✅ + entities + super admins |
| conference_admin | This conf only | ✅ | ✅ | This conf only |
| finance | This conf only (read) | ✅ | ✅ | ❌ |
| recruiter | This conf only (write) | ❌ hidden | ❌ | ❌ |
| viewer | This conf only (read) | ❌ hidden | ❌ | ❌ |

## What's new in the UI

- **Conferences picker** at `/conferences` — list of conferences you can access.
- **Per-conference space** at `/conferences/<slug>` — everything below this URL is scoped to that conference.
- **Budget tab** on each conference for finance + admins — revenue auto-calc'd, expenses by category, receipt uploads, JV split.
- **Admin panel** at `/admin` (super admins only) — manage conferences (incl. JV splits), entities, all users.
- **Role badges** in the top-right showing what role you have on the current conference.
- **Receipts** are uploaded to a private Supabase Storage bucket and shown as signed URLs.

## Adding a new conference later

Admin → Conferences → New conference. Name, slug, dates. Then go into it, set the JV split, then go to Team and add memberships. Recruit + track + bill exactly like Mining Summit 2026.

## Troubleshooting

- **Build fails with "Cannot find module @/lib/auth"** — make sure you replaced `src/lib/auth.ts` with the v2 version. The old `requireTeam` function no longer exists.
- **"permission denied for table conferences"** — RLS policy issue. Make sure you ran migration 0003 in full.
- **Receipt upload fails** — the storage bucket policies are in migration 0003. If you skipped them, run just the bottom section of the file.
- **"No conferences available"** — your profile has no memberships. Either become super_admin (run `update public.profiles set is_super_admin = true where email = 'you@example.com';`) or have an existing super_admin grant you a membership.
