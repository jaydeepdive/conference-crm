# SignWell integration — setup guide

**What this does.** Adds a "Prepare & send agreement" button to every company detail page in the CRM. Clicking it sends your SignWell participation-agreement template to the company's contact person, with the company name (and any other fields you've mapped) auto-filled. Status updates flow back automatically via webhook — sent, viewed, signed, declined, and so on — and once complete, the CRM has a "View signed PDF" link.

You only need to do this setup once per environment (production + any preview envs you want the integration to work in).

---

## 1. Deploy migration 0014

Open the Supabase SQL editor and run `supabase/migrations/0014_signwell_agreement.sql` (it's inside the zip you deploy). It adds:

- Three columns on `conferences` to remember which template + field mapping you picked.
- Nine columns on `companies` to track agreement status, timestamps, and signer info.

Idempotent — safe to re-run.

---

## 2. Add environment variables in Vercel

Project **Settings → Environment Variables → Add**. Add these three, all marked **Sensitive**, all three environments (Production, Preview, Development) checked:

| Variable | Value |
|---|---|
| `SIGNWELL_API_KEY` | `YWNjZXNzOjdlZWJhNGY3NGI0YjI5MjI5ODYyNjlmN2YzNDdkZGIz` |
| `SIGNWELL_API_APPLICATION_ID` | `5e4afdb1-d40c-4ec7-a772-ae81f1227c8a` |
| `SIGNWELL_WEBHOOK_SECRET` | *(optional — leave empty for now)* |

The webhook secret is only used if you turn on hash verification in SignWell's webhook settings later; not required to get things working.

After adding, redeploy (Deployments → "…" on latest → **Redeploy**). Env vars only take effect on new deployments.

---

## 3. Configure the SignWell webhook

The CRM needs SignWell to notify it when the signer opens / signs / declines a document. Otherwise the CRM never learns anything happened.

1. Log in to SignWell → **Settings → Developers → API → Webhooks** (or however your dashboard labels it).
2. Add a webhook with:
   - **URL:** `https://crm.thedeepdive.ca/api/signwell/webhook`
   - **Events:** at minimum: `document_sent`, `document_viewed`, `document_completed`, `document_declined`, `document_expired`, `document_canceled`, `document_deleted`. Select all if the UI lets you.
   - **API application:** `5e4afdb1-d40c-4ec7-a772-ae81f1227c8a` (the one whose ID you already have).
3. Save.

SignWell usually offers a "Send test event" button on the webhook detail — click it. In the CRM's Vercel Logs you should see the POST arrive; the response should be `{"ok":true}`.

---

## 4. Map the template inside the CRM

1. Open the CRM → your conference → **Settings**.
2. Scroll to **SignWell — Company Participation Agreement**.
3. **Template**: pick "Above and Beyond - Company Participation Agreement" from the dropdown. (If it doesn't appear, either the API key didn't load — go back and check the deploy — or the template lives on a different SignWell workspace than the API key.)
4. **Signer placeholder**: usually "Signer 1" is fine. If you built the template with a custom role name (e.g. "Company Representative"), pick that instead.
5. **Field mapping** table appears. For each CRM slot on the left, pick which template field on the right should receive that value. At minimum, map **Company name** — that's the one the send API refuses to run without. The others (Signer name, Signer email, Conference name, Conference dates) are nice-to-haves.
6. **Save SignWell settings**.

You have to do this once per conference. If two conferences use the same template you just repeat the mapping.

---

## 5. Send a test agreement

1. Open any company detail page in that conference. The right sidebar now has a **Participation Agreement** panel.
2. Click **Prepare & send agreement**.
3. Confirm the signer name / email (defaults to the company's contact info). Optionally edit the subject / message.
4. Click **Send now**.

In dev/preview environments the CRM sends in **test mode** by default — SignWell doesn't charge, doesn't count against your quota, and marks the doc as non-legally-binding. Production sends live.

The status pill should flip to **Sent — awaiting signature** immediately. If you check the signer's inbox, the SignWell email should arrive within a minute. Sign it in the browser and watch the CRM status update in real time (the webhook will push it, or you can refresh).

Once signed, a **View signed PDF** button appears; it proxies the completed PDF through the CRM so the SignWell key never touches the browser.

---

## 6. Ongoing operator workflow

- **Not sent → Prepared & sent → Signed** is the happy path. No further action needed.
- **Declined / Expired**: click **Send again** to re-send. (Super admin: use **Void & resend** if the current doc is still live.)
- **Void & resend** (super admin only): permanently deletes the SignWell doc, so the signer's link stops working, then reopens the prepare form.
- **Activity log**: every state change is logged on the company's Activity feed, so you have an audit trail without leaving the CRM.

---

## 7. Troubleshooting

- **"SIGNWELL_API_KEY is not configured on the server"** — you set the env var in Vercel but forgot to redeploy. Redeploy.
- **Template dropdown is empty** — the API key doesn't have access to any templates. Confirm the key is from the same workspace as the template.
- **"Company Name field isn't mapped"** — go back to Settings → SignWell and pick a template field for the Company name slot.
- **Sent but no status updates** — webhook not configured, or SignWell can't reach the URL. Confirm the URL is exactly `https://crm.thedeepdive.ca/api/signwell/webhook` and that you enabled the relevant events.
- **Test-mode confusion** — production docs must be sent from production. `crm.thedeepdive.ca` = production; preview URLs (`*-git-branch.vercel.app`) automatically use test mode.

---

## 8. Files touched by this integration

For reference — nothing you need to run manually, but if you're auditing the change:

- `supabase/migrations/0014_signwell_agreement.sql` — schema
- `src/lib/signwell.ts` — SignWell REST client
- `src/app/api/signwell/templates/route.ts` — list / fetch templates (super admin)
- `src/app/api/signwell/send/route.ts` — create + send an agreement
- `src/app/api/signwell/void/route.ts` — void the current agreement (super admin)
- `src/app/api/signwell/webhook/route.ts` — receive status events
- `src/app/api/signwell/document/[id]/pdf/route.ts` — proxy the signed PDF
- `src/app/conferences/[slug]/settings/SignWellSettings.tsx` — settings UI
- `src/components/AgreementPanel.tsx` — company sidebar UI
