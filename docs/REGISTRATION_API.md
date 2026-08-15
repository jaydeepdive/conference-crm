# Registration API — integration guide

**Audience:** the developer maintaining the conference signup website.
**What this does:** every time someone completes a registration form on your site, POST their info here. It shows up immediately in our CRM as a lead — no manual re-entry, no CSV export/import, no email forwarding.

---

## 1. Endpoint

```
POST https://crm.thedeepdive.ca/api/intake/registration
```

Content-Type: `application/json`

---

## 2. Authentication

Send a shared secret in a header on every request:

```
x-api-key: <REGISTRATION_API_KEY>
```

*(Or, if easier: `Authorization: Bearer <REGISTRATION_API_KEY>` — either works.)*

Jordan will provide the actual key value out-of-band (Signal / password manager — do not commit it to your git repo). Store it on your web host as an environment variable, e.g. `CRM_REGISTRATION_API_KEY`, and read it in your server code. **Never expose the key to the browser** — this endpoint must be called from your backend, not from client-side JavaScript.

---

## 3. Which conference?

Every registration must specify which conference it belongs to. The CRM identifies conferences by their **slug** (a short URL-safe name). For the mining event this will be something like `above-beyond-summit-2026` — Jordan will confirm the exact value.

You can send the slug in either the query string or the JSON body:

```
POST /api/intake/registration?conference_id=above-beyond-summit-2026
```

or

```json
{ "conference_id": "above-beyond-summit-2026", "type": "company", ... }
```

If the slug doesn't match a conference in the CRM, you get `404 Unknown conference: '<slug>'` and no lead is created.

---

## 4. Request body

### Minimum viable payload

```json
{
  "type": "company",
  "email": "jane@example.com",
  "organization": "Acme Mining Corp",
  "conference_id": "above-beyond-summit-2026"
}
```

### Full schema

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | `"company"` \| `"investor"` | **yes** | Which side of the CRM this lead goes to. |
| `conference_id` | string (slug) | **yes** | Query param or body. |
| `email` | string | one of email/organization required | Contact person's email. Used for de-duplication. |
| `organization` | string | one of email/organization required | Company name (for companies) or investment firm name (for investors). |
| `name` | string | recommended | Full name of the person registering. |
| `title` | string | optional | e.g. "VP Investor Relations". |
| `phone` | string | optional | Any format — we store as-is. |
| `ticker` | string | optional | Stock ticker for public companies. Used to auto-match TDD clients. |
| `stage` | string | optional (companies) | Market stage — "Explorer", "Developer", "Producer", etc. |
| `commodities` | string[] | optional | e.g. `["Gold","Silver","Copper"]`. |
| `guests` | `{name?, email?}[]` | optional | Additional people attending under this registration. Stored in the notes field of the lead. |
| `special_requests` | string | optional | Dietary, accessibility, etc. Appended to notes. |
| `extras` | object | optional | Anything else you collected. Serialized into notes as `key=value`. |
| `source` | string | optional | e.g. `"abovebeyondsummit.com"`. Shows up in activity log. |
| `submitted_at` | ISO 8601 string | optional | When the form was submitted on your end. |

### Investor example

```json
{
  "conference_id": "above-beyond-summit-2026",
  "type": "investor",
  "name": "Bob Rivers",
  "email": "bob@riverscapital.com",
  "organization": "Rivers Capital",
  "title": "Portfolio Manager",
  "phone": "+1-416-555-0134",
  "commodities": ["Gold","Silver"],
  "guests": [
    { "name": "Alice Kim", "email": "alice@riverscapital.com" }
  ],
  "special_requests": "Vegetarian meals please",
  "source": "abovebeyondsummit.com",
  "submitted_at": "2026-09-14T18:22:11-04:00"
}
```

### Company example

```json
{
  "conference_id": "above-beyond-summit-2026",
  "type": "company",
  "name": "Jane Doe",
  "email": "jane@acmemining.com",
  "organization": "Acme Mining Corp",
  "title": "CFO",
  "ticker": "ACME",
  "stage": "Producer",
  "commodities": ["Copper","Gold"],
  "source": "abovebeyondsummit.com"
}
```

---

## 5. Responses

All responses are JSON.

### 201 Created — brand-new lead
```json
{
  "id": "6c1d6f8a-...",
  "type": "company",
  "created": true,
  "updated": false,
  "conference_id": "above-beyond-summit-2026",
  "url": "https://crm.thedeepdive.ca/conferences/above-beyond-summit-2026/companies/6c1d6f8a-..."
}
```

### 200 OK — existing lead updated
Same shape, but `created: false, updated: true`. The CRM de-duplicates by matching **email OR organization** within the same conference — so if someone submits the form twice, we update their existing record instead of creating a duplicate.

### 400 Bad Request
Malformed JSON, missing `type`, or missing both `email` and `organization`. Body: `{ "error": "..." }`

### 401 Unauthorized
Missing or wrong `x-api-key`. Body: `{ "error": "Unauthorized" }`

### 404 Not Found
Unknown conference slug. Body: `{ "error": "Unknown conference: '<slug>'" }`

### 503 Service Unavailable
The CRM hasn't been configured with a `REGISTRATION_API_KEY` — Jordan will fix on his side.

### 500 Internal Server Error
Something broke in the CRM database. Body: `{ "error": "<db error message>" }`. **Retry the request after 30 seconds** — network blips are usually transient.

---

## 6. Reference implementation

### Node.js / TypeScript (server-side)

```ts
export async function forwardRegistrationToCRM(payload: RegistrationPayload) {
  const res = await fetch("https://crm.thedeepdive.ca/api/intake/registration", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.CRM_REGISTRATION_API_KEY!,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("CRM sync failed", res.status, data);
    // Don't block the user's registration on this — queue for retry.
    throw new Error(data.error ?? `CRM returned ${res.status}`);
  }
  return data as { id: string; created: boolean; updated: boolean; url: string };
}
```

### Python (Flask/Django/whatever)

```python
import os, requests

def forward_registration(payload: dict) -> dict:
    r = requests.post(
        "https://crm.thedeepdive.ca/api/intake/registration",
        json=payload,
        headers={"x-api-key": os.environ["CRM_REGISTRATION_API_KEY"]},
        timeout=10,
    )
    r.raise_for_status()
    return r.json()
```

### cURL (for testing)

```bash
curl -X POST https://crm.thedeepdive.ca/api/intake/registration \
  -H "Content-Type: application/json" \
  -H "x-api-key: $CRM_REGISTRATION_API_KEY" \
  -d '{
    "conference_id": "above-beyond-summit-2026",
    "type": "company",
    "name": "Test User",
    "email": "test@example.com",
    "organization": "Test Co"
  }'
```

---

## 7. Recommended integration pattern

1. **Submit the form on your site.** Store the registration in your own database first — that's your source of truth for the signup site.
2. **Fire the CRM POST from your backend** (not the browser).
3. **Don't block the user on the CRM call.** Return success to the user as soon as your DB write completes; queue the CRM POST for background processing (BullMQ, Sidekiq, cron sweep — whatever fits your stack).
4. **Retry on 5xx.** Exponential backoff, 3–5 attempts over ~30 minutes. Give up after that and log for manual re-send.
5. **Do NOT retry on 4xx.** Fix the payload instead.
6. **Log the returned `id` and `url`** so you can jump straight from your admin to the CRM entry when troubleshooting.

---

## 8. What happens on the CRM side

- New lead: appears at the top of the Companies (or Investors) tab, stage `verbal_commit`, confirmed `yes`.
- Guests / commodities / special requests: composed into the lead's Notes field, one line each.
- Ticker (if provided): triggers an automatic lookup against TDD AdsPlatform — if it's an active TDD client, the lead is flagged and any invoice generated afterward auto-applies the configured client discount.
- Every intake POST also writes an entry to the Activity Log (`Registered via website` or `Updated via website`).

---

## 9. Testing checklist

- [ ] `curl` with a bad key → 401
- [ ] `curl` with a wrong slug → 404
- [ ] `curl` with valid payload for a **new** email → 201, lead visible in CRM within seconds
- [ ] Same `curl` again → 200, `updated: true`, no duplicate created
- [ ] `curl` with `type: "investor"` → lead appears under Investors, not Companies
- [ ] `curl` with `guests` + `special_requests` → notes appear in the CRM

---

## 10. Contact

Jordan is the CRM operator. If anything on the CRM side breaks — silent errors, duplicates piling up, missing fields — send him a message with:
1. The full JSON payload you sent
2. The response body + status code
3. The approximate time (with timezone)

He'll dig into the CRM logs and either fix it or come back to you with a payload correction.
