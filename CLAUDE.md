# Conference CRM — Project Briefing for Claude

> Read this whole file before doing anything. It is the complete hand-off from
> the original build sessions (Jul–Oct 2026). Credentials are NOT in this file:
> they are in `LOCAL_SECRETS.md` in this same folder (git-ignored, on Jordan's
> Mac only). If that file is missing, ask Jordan to paste the tokens.
>
> Last updated: 2026-10-14 · Live version: **v6.73** · 72 commits on `main`

---

## 0. Owner, tone and HARD RULES (non-negotiable)

**Owner:** Jordan Lutz — jay@thedeepdive.ca — super admin. Business: The Deep
Dive (thedeepdive.ca). Business partner runs abovebeyondsummit.com (and its
Resend account). Jordan is NOT a developer: never ask him to edit code, run
SQL, or use a terminal. Do everything yourself end-to-end (code → commit →
push → migration → verify) and report results in plain language.

Jordan is impatient with half-fixes, generic styling, and being asked to do
things manually. Get it right the first time, verify live, keep replies short.

**Standing rules (quoted verbatim from Jordan):**
1. "this is to ONLY be used for the conference CRM and that you are NOT to
   access any unrelated repos." — GitHub token may ONLY touch
   `jaydeepdive/conference-crm`.
2. "DO NOT SEND ANY EMAILS YET. I NEED A BUTTON TO SEND OUT THESE EMAILS AT
   MY OWN DISCRETION NOT YOURS." and "DO NOT SEND AN INVITE EMAIL. WE ARE
   STILL TESTING". Never trigger invites/notifications to real attendees.
   Meeting emails are behind a switch that is OFF (`meeting_emails_enabled`).
3. "google sign in should not be an option for the portal either. we're
   keeping it simple." (attendee portal = email + password only)
4. "Mining Summit 2026" is an INTERNAL name. Anything a client/attendee sees
   must use `conferences.public_name` = **"Above & Beyond Mining Summit"**
   (invoices, emails, SignWell, portal).
5. Impersonation ("View as"/Preview) is a feature but must NEVER be the
   default super-admin view.
6. Never commit secrets. Never put passwords/tokens in URLs. Ask before
   changing persistent third-party config (Supabase auth, DNS) unless Jordan
   just asked for exactly that.
7. Attendee-facing UI must match abovebeyondsummit.com (dark/gold, real logo,
   Cormorant Garamond + Jost), highlight Scottsdale, Arizona. Staff CRM matches
   thedeepdive.ca (Cardo + Bitter, red #C8102E). Must work on phone AND desktop.

---

## 1. The event

- **Above & Beyond Mining Summit** — Nov 22–24, 2026 — Andaz Scottsdale Resort
  & Bungalows, Scottsdale, Arizona.
- **1-on-1 meeting day: Tue Nov 24, 2026.** 14 slots of 25 min + 5 min break:
  08:00–12:00 (8 slots), lunch 12:00–12:30, 12:30–15:30 (6 slots), farewell
  16:00. Table/location per meeting assigned later by admin.
- Companies (presenting miners) ↔ Investors. Meetings are always one company
  + one investor. A company/investor can have several named people.
- JV entities on budget: Canacom Group, Bri-Sim.

---

## 2. Infrastructure

| Thing | Value |
|---|---|
| Repo | github.com/jaydeepdive/conference-crm (branch `main`) |
| Local folder | `/Users/jordanlutz/Documents/conference-crm-source` |
| Hosting | Vercel (Hobby plan — NO cron jobs), auto-deploys every push to `main` (~1–2 min) |
| Prod URL | https://crm.thedeepdive.ca (also conference-crm-rust.vercel.app) |
| Attendee URL | https://crm.abovebeyondsummit.com — portal ONLY (staff pages redirect into the portal) |
| Database/Auth | Supabase project ref **zetiaccmsqamqhldjaps** (https://zetiaccmsqamqhldjaps.supabase.co) |
| Email (attendee + auth) | Resend (partner's account), sender `Above & Beyond Mining Summit <no-reply@abovebeyondsummit.com>`. Key stored in DB table `app_secrets` (key `resend_api_key`) + Supabase SMTP (smtp.resend.com:465 user `resend`). Free plan: 100/day shared with partner. |
| Email (staff invoices/group email) | Gmail OAuth per staff user (`gmail_tokens` table) |
| DNS for abovebeyondsummit.com | Cloudflare (nameservers drew/kay). Email Routing ON (inbound forwarding). Resend DKIM `resend._domainkey` + `send.` MX/SPF present. **NO DMARC record yet** → emails land in junk. Jordan must add TXT `_dmarc` = `v=DMARC1; p=none; rua=mailto:jay@thedeepdive.ca`. Cloudflare Email Sending rejected (paid). |
| e-Signature | SignWell API (templates: Company Participation Agreement, Pricing A / Pricing B) |
| Other integrations | TDD AdsPlatform client lookup, Project Hub (hub.thedeepdive.ca) task sync, Anthropic API for AI email drafts |

### Vercel environment variables (names; values live in Vercel)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `ADSPLATFORM_LOOKUP_URL`, `ADSPLATFORM_API_KEY`,
`HUB_BASE_URL`, `HUB_API_KEY`, `CRM_API_KEY`, `REGISTRATION_API_KEY`,
`SIGNWELL_API_KEY`, `SIGNWELL_API_APPLICATION_ID`, `SIGNWELL_WEBHOOK_SECRET`
(optional), `CRON_SECRET` (optional), `RESEND_API_KEY` (optional — falls back
to `app_secrets`). Claude has NO Vercel access; avoid needing new env vars —
store server-only secrets in `public.app_secrets` instead.

### Supabase Auth config (as of 2026-10-12)
site_url `https://crm.thedeepdive.ca`; uri_allow_list
`https://crm.thedeepdive.ca/**, https://crm.abovebeyondsummit.com/**,
https://conference-crm-rust.vercel.app/**, crm.thedeepdive.ca/**,
crm.thedeepdive.ca/auth/callback`; custom SMTP = Resend; rate_limit_email_sent
= 50/hr; recovery template links to
`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next={{ .RedirectTo }}`.
Google OAuth enabled for STAFF login only.

---

## 3. How to work (the automated loop)

All tokens are in `LOCAL_SECRETS.md`. In a fresh sandbox, recreate helpers:

**Push to GitHub (scoped to this repo only):**
```bash
# credential helper that ONLY answers for jaydeepdive/conference-crm
cat > ~/git-cred.sh <<'SH'
#!/bin/sh
input=$(cat)
if echo "$input" | grep -q "host=github.com" && echo "$input" | grep -q "path=jaydeepdive/conference-crm"; then
  printf "username=x-access-token\npassword=%s\n" "$GITHUB_TOKEN"
fi
SH
chmod +x ~/git-cred.sh
git -C <repo> config credential.helper "$HOME/git-cred.sh"
git -C <repo> config credential.useHttpPath true
git -C <repo> push origin main      # Vercel deploys automatically
```
Check deploy: `GET https://api.github.com/repos/jaydeepdive/conference-crm/commits/<sha>/status`
→ context "Vercel", "Deployment has completed".

**Run a migration / SQL (no dashboard needed):** `scripts/supabase-sql.sh <file.sql>`
(uses env `SUPABASE_ACCESS_TOKEN`; POSTs to
`https://api.supabase.com/v1/projects/zetiaccmsqamqhldjaps/database/query`).
Auth config: `GET/PATCH https://api.supabase.com/v1/projects/zetiaccmsqamqhldjaps/config/auth`.
Service-role key: `GET .../v1/projects/zetiaccmsqamqhldjaps/api-keys?reveal=true`.

**Typecheck:** the repo's own `node_modules` may be absent in the connected
folder. Copy to a scratch dir (exclude node_modules/.git/.next), `npm ci`, then
`./node_modules/.bin/tsc --noEmit --skipLibCheck`. Known pre-existing error to
ignore: `src/lib/auth.ts(11,44): error TS18047`. No ESLint config → lint does
not block builds.

**Conventions:**
- Bump `src/lib/version.ts` (`APP_VERSION`) on every release; commit message
  `vX.YZ: summary`.
- Migrations: `supabase/migrations/00NN_name.sql`, idempotent (`if not
  exists`), apply via API immediately after writing. Next number: **0031**.
- After `redirect()`/`notFound()` add `throw new Error("unreachable")` for TS
  narrowing.
- Deleting files in the connected folder may need the Cowork delete permission.

---

## 4. Code map (Next.js 15 App Router + TypeScript + Tailwind + Supabase)

Deps: next ^15.5.7, react 19, @supabase/ssr, @supabase/supabase-js,
@react-pdf/renderer **4.1.5 (pinned)**, googleapis, @anthropic-ai/sdk.

### Theming
Tailwind tokens are CSS variables (`--c-ink/-muted/-line/-utility/-accent`
in `src/app/globals.css`). Default = TDD red theme. Wrapping element
`.ab-admin` re-skins to Above & Beyond (ivory/gold, Cormorant/Jost). A&B
palette: black #0a0a0a, charcoal #141414, card #1a1a1a, gold #c9a24b,
gold-light #e8cf8f, gold-dark #8f6f2a, ivory #f5f0e6, grey #9a9a9a, border
#2a2a2a. Brand assets: `public/brand/logo-transparent.png` (full logo, background removed — use this; logo-official.jpg is the original with baked-in black),
`public/brand/mark.svg`; components in
`src/app/conferences/[slug]/platform/AboveBeyondBrand.tsx`.

### Surfaces
1. **Staff CRM** — `/conferences`, `/conferences/[slug]/(staff)/…` (route
   group with `ConferenceNav` shell): dashboard, companies, investors, budget,
   invoices, emails (compose/templates), tasks (Hub), activity, team,
   duplicates, settings. `/admin` (users, conferences, entities) super admin
   only. `/account` = change own password. `/login`, `/reset-password`.
   Old `(staff)/meetings` and `(staff)/platform-invites` just redirect to the
   admin console.
2. **A&B Admin console** — `/conferences/[slug]/platform/admin` (super admin):
   Overview (live counts + **Meeting request emails ON/OFF switch**),
   `/meetings` (schedule grid companies/investors × 14 slots, list view,
   create/edit/cancel, tables, sees blocked slots + do-not-pair),
   `/meetings/auto-match` (greedy matcher `src/lib/match.ts`, review then
   commit), `/attendees` (sync registered leads, Send/Resend invite button,
   **Password** button = set/generate password with no email, Preview =
   impersonate).
3. **Attendee portal** — `/conferences/[slug]/platform` (`(authed)` group):
   Schedule, Directory (other side), Inbox, Meetings/[id]
   (accept/decline/counter/cancel), Settings (names, company attendees,
   blocked slots, do-not-meet list). Public: `/platform/login`,
   `/platform/accept?token=`, `/platform/reset`. Super admin who isn't an
   attendee is redirected to the admin console. Impersonation via cookie
   `platform_impersonate`; yellow banner has "← Back to admin".
4. **Legacy portal** `/portal/*` — older v1 attendee portal, unused; leave.

### Key lib files
`auth.ts` (requireConferenceAccess/Role, default-allow model), `platform.ts`
(resolvePlatformContext, slots, impersonation), `resend.ts` (sendResend,
brandedEmail template — table-based, light, logo band, text part),
`meetingEmails.ts` (notifyMeeting on propose/counter, guarded by switch),
`passwords.ts`, `signwell.ts`, `pdf.ts` (invoice PDF, Roboto base64 fonts in
`public/fonts`), `gmail.ts`, `hub.ts`, `adsplatform.ts`, `match.ts`,
`duplicates.ts`, `types.ts`, `version.ts`.

### Middleware (`src/lib/supabase/middleware.ts`)
Sets `x-pathname`. Public: /login, /auth/*, /api/intake/*,
/api/signwell/webhook, /api/signwell/refresh-all, /api/portal/accept,
/api/platform/accept, /api/platform/invites/preview,
/api/platform/invites/resend, /api/auth/forgot, platform /login and /accept.
Unauth platform → platform login; others → /login.

### Auth / email flows
- Staff forgot password: `/api/auth/forgot` → Resend branded email →
  `/auth/confirm?token_hash…&next=/reset-password`.
- Attendee "Email me a link": `/api/platform/invites/resend` → existing user:
  recovery link → `/platform/reset`; not yet accepted: fresh invite link.
- Invites: ONLY via button → `/api/platform/invites/send` (Resend, reply-to =
  admin who pressed it).
- `/auth/confirm` verifies token_hash (works cross-device); `/auth/callback`
  exchanges PKCE code (Google OAuth staff).
- Admin no-email resets: `/api/platform/admin/set-password`,
  `/api/admin/users/[id]/password`.

### Other APIs
Registration intake for partner site: `POST /api/intake/registration`
(header key = REGISTRATION_API_KEY; self-healing, accepts many field-name
variants; new signups get stage `pending_approval`) — see
`docs/REGISTRATION_API.md`. SignWell: send/status/refresh/refresh-all/remind/
void/templates/webhook/pdf — see `docs/SIGNWELL_SETUP.md`; signed → company
stage `registered` (DB trigger). Leads bulk-delete + merge (duplicates).
`/api/conference/income` for Hub P&L (CRM_API_KEY).

---

## 5. Database (public schema)

Tables: activity_log, app_secrets (service-only), attendee_blocked_slots,
attendee_profiles, comp_types, companies, company_contacts,
conference_entities, conference_memberships, conferences, email_templates,
email_throttle (service-only), entities, expenses, gmail_tokens, investors,
invoices, lead_comps, lead_notes, meeting_blocklist, meeting_events,
meetings, profiles, sent_email_recipients, sent_emails.

- Stages (companies & investors): pending_approval, not_contacted,
  reaching_out, in_discussion, verbal_commit, registered, declined.
- Investor types (alphabetical): Advisor/Broker, Broker, Family Office, Hedge
  Fund, Individual Investor, Institutional Investor, Investor Relations.
- Meeting status: proposed, countered, accepted, declined, cancelled. One
  meeting row per company–investor pair (unique index).
- Trigger (0020): any company/investor set to `registered` automatically gets
  attendee_profiles rows — NO email sent.
- Invoices sync to budget receivables and lead `payment_status` (0010/0011).
- Migrations 0001–0030 all applied. Notables: 0007 default-allow access +
  `hidden` role, 0012 attendee portal, 0014–0016 SignWell + public_name,
  0017 signed→registered, 0018 company_contacts, 0019 platform config, 0020
  auto attendees, 0021 blocked slots + blocklist, 0022 app_secrets, 0023
  meeting_emails_enabled + email_throttle.

### Live state (2026-10-14)
- Conference `mining-summit-2026` (id 7ac8254a-ff16-4b27-a964-2d3d0041174d),
  name "Mining Summit 2026", public_name "Above & Beyond Mining Summit",
  status planning, visibility public, timezone America/Phoenix, dates 2026-11-22→24, meeting_date
  2026-11-24, 08:00–15:30, lunch 12:00–12:30, slot 25 / stride 30, farewell
  16:00, meeting_emails_enabled **false**.
- 95 companies, 103 investors, 53 attendee profiles (20 company people, 33
  investor people), **0 attendee logins**, 0 meetings, 11 invoices.
- Staff profiles: jay@thedeepdive.ca (super admin), admin@thedeepdive.ca
  (Jordan's alt), evofarizona@gmail.com (Brian Mildebrandt), steve.r.hyland@
  gmail.com (Steve Hyland), chriz@thedeepdive.ca (Chriz Macray),
  numa.pentest.1791822865@gmail.com (see issues).

---

## 6. OPEN ISSUES / TODO (priority order)

1. ~~Timezone bug~~ FIXED v6.64 (migration 0024): conference timezone is now
   `America/Phoenix`; slots verified 8:00 AM Arizona = 15:00 UTC.
2. Staff self-sign-up: FIXED v6.65 (migration 0025). `profiles.account_type`
   = staff | attendee | pending. New self-sign-ups are `pending` (no CRM data
   via RLS or pages, sent to /pending). Attendee logins are created with
   app_metadata account_type=attendee and can only use the portal. Only super
   admins can change type (DB trigger guard). `/admin/users` is now
   **Accounts** (all logins, type, last sign-in, Make staff / Revoke).
   `numa.pentest.1791822865@gmail.com` is pending + unconfirmed — Jordan may
   delete it from Accounts. Attendee data lockdown DONE v6.66 (migration 0026): attendee logins
   have NO RLS read on companies/investors/conferences or other attendees'
   rows; portal pages read via service client using ONLY
   COMPANY_PUBLIC_COLUMNS / INVESTOR_PUBLIC_COLUMNS (src/lib/platform.ts).
   Any new portal page must follow the same pattern.
3. Jordan adds DMARC TXT record (see §2) — reset email went to junk.
4. DONE v6.66: crm.abovebeyondsummit.com is live on the conference-crm Vercel
   project. Middleware (src/lib/portalDomain.ts) makes that host portal-ONLY:
   any non-/platform page (incl. /login, /conferences, /admin) redirects to
   /conferences/mining-summit-2026/platform. All attendee email links + email
   images use PORTAL_ORIGIN. Staff CRM stays on crm.thedeepdive.ca.
   Console links to staff CRM pages must be ABSOLUTE `${STAFF_ORIGIN}/…`
   (target _blank) — relative links bounce on the portal host. Admin console
   has its own Accounts tab (`/platform/admin/accounts`, shared loader
   `src/app/admin/users/loadAccounts.ts`).
5a. v6.69: multiple people per company/investor — "+ Add person" / Edit /
   Remove on console Attendees (PersonDialog.tsx) and on CRM company/investor
   pages (LeadAttendees.tsx); all via /api/platform/admin/attendees (super
   admin, never emails). One email = one attendee per conference (unique
   index). Migration 0027: deleting a company/investor also deletes its
   attendee logins rows, blocked slots and do-not-meet rows.
   TEMP TEST DATA (delete before launch): "TEST Company (delete after
   testing)" (jordan.douglas.lutz@gmail.com) and "TEST Investor (delete after
   testing)" (admin@thedeepdive.ca), both stage registered. Also an older
   "Test Co" company (admin@thedeepdive.ca, verbal_commit).
5b. v6.70: super admins previewing ("View as") can now perform every
   attendee action (findActingAttendee in src/lib/portal-api.ts honours the
   platform_impersonate cookie). Doors open = conferences.doors_open_time
   (07:45, migration 0028). Directory lists only companies/investors with
   attendee rows; ?slot=<iso> shows only those free at that slot (confirmed
   meetings + self-blocked slots, via busySlotsByLead) and pre-selects the
   slot in the request form. Schedule's open slots link there.
5c. v6.71: Reschedule — either side can propose a new time for a CONFIRMED
   meeting (counter route; status→countered, meetings.reschedule_from = old
   time, scheduled_time kept so the old slot stays booked). Accept → moves;
   decline / "withdraw — keep original" → reverts to accepted at old time
   (event kinds 'reschedule'/'keep', migration 0029). Busy checks count any
   meeting with scheduled_time not declined/cancelled. Only COMPANIES can
   have extra people (UI + API enforce; investors = one person each).
5d. v6.72: Attendees page shows a "can't sign in yet" panel listing
   registered leads with no attendee row + reason (no email / email already
   used by another lead) with Add email + Open in CRM. As of Oct 14: Zang
   International (co, no email); investors Paige Capital, Claude Drolet,
   Brian Allesory, Mi3, Steve Yeomans (no email); New Break Resources Ltd.
   investor shares mfarrant@ email with the New Break company record.
5e. v6.73 (migration 0030): attendee_profiles.email is NULLABLE. Registered
   leads with no usable email get a placeholder attendee (email NULL, shown
   "No email on file"): they appear in the directory and can be booked, but
   can't sign in / get invites / passwords until "Add email". Trigger +
   backfill_attendee_placeholders(conf) RPC (sync calls it and removes
   placeholders once a real-email row exists). Always null-guard
   attendee.email in new code.
5. Meeting emails currently for request + counter only. Possible additions:
   accepted/declined/cancelled notices, day-before schedule email (no cron on
   Hobby — would need a button).
6. Jordan is the first real tester of: staff forgot-password email (Resend),
   meeting emails (switch OFF), invite email design.

---

## 7. History (condensed)

- **v1–v6.9 (Jul–Aug):** Google-sheet → Next.js/Supabase CRM; multi-conference
  URLs; roles (super_admin, conference_admin, finance, recruiter, viewer,
  hidden); default-allow access with per-user hiding; private conferences;
  budget with JV entity splits + management fees; AdsPlatform client discount
  detection (company-name only — Jordan hated ticker tagging); Project Hub
  two-way tasks; invoices with PDF, Gmail send, Claude-drafted emails; group
  email compose with segments; registration intake; email/password login;
  user deletion; invoice issuer name/address/wire instructions (wide,
  resizable inputs). Styling copied from thedeepdive.ca / hub.thedeepdive.ca.
- **v6.10–v6.38:** invoice fixes (Due upon receipt, "Hi [name],", edit/delete,
  public name, budget receivable sync, no invoice # in body, no "due TBD");
  investor types; partner registration API + duplicate scanner/merge;
  Pending Approval stage; SignWell integration (template field mapping,
  signer enters own name, multi-template Pricing A/B, status column on
  Companies, manual override, refresh-all/auto-sync, reminder without void,
  case-insensitive statuses, Draft-race polling); version stamp.
- **v6.39–v6.50:** invoice PDF font crash saga (fixed: bundled Roboto as
  base64 data URLs, pinned react-pdf 4.1.5); comma thousands; signed →
  registered; intake field variants; bulk delete; company contacts +
  SignWell recipient picker; standalone white-label handoff doc.
- **v6.51–v6.58:** attendee 1-on-1 platform; zero-click deploys + API
  migrations; master super admin; admin meetings/auto-match; auto attendees
  from registered; blocked slots + do-not-meet; real A&B branding; contrast
  fixes; mobile/desktop redesign.
- **v6.59–v6.63 (Oct 7–12):** admin set-password (no email) for attendees +
  staff; reset pages; /account change password; /auth/confirm; A&B admin
  console + `(staff)` route group (fixed layout-until-refresh bug); Resend
  for all attendee/auth email; branded email template; meeting request/counter
  notifications behind switch.

Full original transcripts are on Jordan's Mac in the Cowork session; the two
detailed context summaries are in `docs/HISTORY_SUMMARIES.md`.
