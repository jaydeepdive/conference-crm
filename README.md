# Conference CRM

Multi-user CRM for tracking ~20-30 companies and ~30-50 investors for the Fall 2026 conference. Built on Next.js + Supabase. Google sign-in. Free to host on Vercel.

Phase 2 will add 1:1 meeting scheduling for confirmed attendees.

## Stack at a glance

- **Frontend** — Next.js 15 (App Router) + TypeScript + Tailwind. Hosted on Vercel.
- **Backend** — Supabase (Postgres + Auth + Realtime + RLS).
- **Auth** — Google OAuth via Supabase Auth, with role-based access (`admin`, `team`, `attendee`, `pending`).
- **Cost** — $0 on Supabase free tier + Vercel hobby tier at the scale this needs.

## Local dev quick start

If you just want to see it run locally:

```bash
npm install
cp .env.local.example .env.local   # fill in Supabase keys
npm run dev
```

Then open http://localhost:3000.

But the app is useless without the Supabase project. Set that up first.

---

## Full setup (do this in order)

### 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com), sign in with Google.
2. **New project** → pick a name (`conference-crm`), set a strong database password, choose the region closest to you and your partner.
3. Wait ~2 minutes for the project to provision.

### 2. Run the migrations

1. In the Supabase dashboard: **SQL Editor** → **New query**.
2. Copy the contents of `supabase/migrations/0001_initial_schema.sql` and run it. You should see "Success. No rows returned."
3. Don't run `0002_bootstrap_admin.sql` yet — you need to sign in first so a profile row exists.

### 3. Set up Google OAuth in Supabase

1. In Supabase: **Authentication** → **Providers** → **Google** → enable.
2. Copy the **Callback URL (for OAuth)** Supabase shows you (looks like `https://<project>.supabase.co/auth/v1/callback`). You'll paste this into Google Cloud in a moment.
3. In a new tab, go to [Google Cloud Console](https://console.cloud.google.com) → create a new project or pick one → **APIs & Services** → **OAuth consent screen**. Configure as **External**, fill the basics. Add your email + your partner's as test users while it's in test mode.
4. **Credentials** → **Create credentials** → **OAuth client ID** → **Web application**.
   - Authorized JavaScript origins: `https://your-vercel-url.vercel.app` (you'll know this after step 5) and `http://localhost:3000` for dev.
   - Authorized redirect URIs: paste the Supabase callback URL from step 2.
5. Copy the **Client ID** and **Client Secret** back into Supabase → Google provider config. Save.

### 4. Get your Supabase keys

In Supabase: **Project Settings** → **API**. Copy:

- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (keep this secret; only used server-side)

### 5. Push to GitHub + deploy on Vercel

```bash
git init
git add .
git commit -m "Initial CRM scaffold"
git branch -M main
# create empty repo on github.com first, then:
git remote add origin git@github.com:<you>/conference-crm.git
git push -u origin main
```

Then on [Vercel](https://vercel.com):

1. **Add new project** → import the GitHub repo.
2. Framework should auto-detect as Next.js. Leave defaults.
3. **Environment variables** → paste the three Supabase values from step 4.
4. Deploy. You get a URL like `conference-crm-abc.vercel.app`.
5. Go back to Google Cloud Console and add that URL as an authorized JavaScript origin.
6. (Optional) Add a custom domain in Vercel.

### 6. Bootstrap yourself as admin

1. Open the deployed URL, sign in with Google. You'll land on `/pending`.
2. Back in Supabase SQL Editor, open `supabase/migrations/0002_bootstrap_admin.sql`, change the email to yours if needed, and run it.
3. Refresh the app. You should now see the Dashboard.

### 7. Invite the rest of the team

1. Send them the Vercel URL. Each signs in with Google and lands on `/pending`.
2. You (admin) go to **Team** in the nav, find each person, set their role to **team**.
3. They refresh and now see the CRM.

For attendees (phase 2), the role will be `attendee` — they'll see a different surface, not the CRM.

---

## What's built

- **Dashboard** — KPIs per category, pipeline by stage, payment summary.
- **Companies + Investors** — filterable tables, click any row to edit, "Claim" button for unclaimed leads.
- **Lead detail** — full edit form + activity feed for that lead + quick-log activity widget.
- **Activity log** — global timeline of the last 200 events.
- **Team** — admin-only role management.
- **Auth** — Google sign-in, RLS-enforced (no team role = no CRM data).
- **Realtime** — Supabase publication enabled on all tables. Hook up the subscription in `LeadTable.tsx` for live updates if you want (the data is reloaded on navigation already; realtime is a nice-to-have).

## What's not built yet (Phase 2)

- **Meetings + Preferences** tables (schema design noted in the workflow doc).
- **Attendee portal** at a separate route, gated by `role = 'attendee'`.
- **Schedule generation** from preferences + availability.

When you're ready, build it on the same Supabase project — same auth, same data. Add new migrations as `supabase/migrations/0003_meetings.sql`.

## Project layout

```
conference-crm/
├── README.md                         # this file
├── package.json
├── next.config.mjs, tsconfig.json, tailwind.config.ts, postcss.config.mjs
├── .env.local.example                # the three env vars you need
├── supabase/migrations/
│   ├── 0001_initial_schema.sql       # tables + RLS + triggers + realtime
│   └── 0002_bootstrap_admin.sql      # run after first sign-in to grant yourself admin
└── src/
    ├── middleware.ts                 # auth redirect for protected routes
    ├── app/
    │   ├── layout.tsx, page.tsx, globals.css
    │   ├── login/                    # Google OAuth sign-in
    │   ├── auth/callback/route.ts    # OAuth code exchange
    │   ├── pending/                  # "waiting for approval" landing
    │   ├── dashboard/                # KPIs + pipeline + payments
    │   ├── companies/                # list, [id] detail, new
    │   ├── investors/                # list, [id] detail, new
    │   ├── activity/                 # global activity log
    │   └── team/                     # admin role management
    ├── components/
    │   ├── Nav.tsx, KpiCard.tsx, StageBadge.tsx
    │   ├── LeadTable.tsx             # filterable list
    │   ├── LeadEditor.tsx            # the form (shared by company + investor)
    │   ├── ActivityFeed.tsx
    │   └── SignOutButton.tsx
    └── lib/
        ├── types.ts, constants.ts, auth.ts
        └── supabase/                 # server, client, middleware adapters
```

## Workflow conventions (same as the spreadsheet doc)

- **Owner = Unclaimed** means anyone can grab it. Set Owner to your name to claim.
- **Stage progression**: Not Contacted → Reaching Out → In Discussion → Verbal Commit → Registered (or → Declined).
- **Never delete a lead.** Set Stage to "Declined" instead so history is preserved.
- **Log every meaningful touch** in the lead's detail page using the activity widget.
- **Don't reassign someone else's lead** without asking — leave a note in activity.
- **Next Action + Next Action Date** on every active lead. Past-due dates turn red on the list.

## Troubleshooting

- **"OAuth error" on sign-in** — usually the redirect URI in Google Cloud doesn't match Supabase's callback URL. Check both have the exact same string.
- **Stuck on `/pending`** — your profile row exists but `role = 'pending'`. An admin needs to set it to `team`. If you ARE the admin and haven't bootstrapped yet, run `0002_bootstrap_admin.sql`.
- **`relation "public.profiles" does not exist`** — you skipped running `0001_initial_schema.sql`. Run it in Supabase SQL Editor.
- **Vercel build fails on type errors** — run `npm run build` locally to debug. The strict TS config catches a lot.
