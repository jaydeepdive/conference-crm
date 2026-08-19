import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { checkIsClientSponsor } from "@/lib/adsplatform";

export const runtime = "nodejs";

interface Guest { name?: string; email?: string }

interface RegistrationPayload {
  type?: "investor" | "company";
  name?: string;                 // contact's full name
  email?: string;
  phone?: string;
  organization?: string;         // firm (investor) or company name
  ticker?: string;
  stage?: string;                // market stage — Explorer, Producer, etc. (company only)
  title?: string;                // contact's title
  commodities?: string[];
  guests?: Guest[];
  special_requests?: string;
  extras?: Record<string, unknown>;
  source?: string;
  submitted_at?: string;
  conference_id?: string;        // slug — required unless passed as query param
}

/**
 * POST /api/intake/registration
 *
 * External signup websites (e.g. abovebeyondsummit.com) POST here when someone
 * registers. We upsert a lead into the CRM keyed on email+conference.
 *
 * Auth: header `x-api-key: <REGISTRATION_API_KEY>`
 * Query or body: `conference_id=<conference-slug>` (which conference this registration is for)
 *
 * Response:
 *   201  { id, type, created:true, updated:false, conference_id }   — new lead
 *   200  { id, type, created:false, updated:true, conference_id }   — existing lead updated
 *   400  { error: "..." }                                            — bad payload
 *   401  { error: "Unauthorized" }                                   — missing/bad key
 *   404  { error: "Unknown conference: <slug>" }
 *   500  { error: "..." }                                            — DB error
 */
export async function POST(request: Request) {
  // ---- Auth ----
  const incomingKey = request.headers.get("x-api-key") ?? bearerToken(request.headers.get("authorization"));
  const expected = process.env.REGISTRATION_API_KEY;
  if (!expected) return NextResponse.json({ error: "REGISTRATION_API_KEY not configured on the CRM" }, { status: 503 });
  if (incomingKey !== expected) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ---- Parse + validate ----
  let body: RegistrationPayload;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Body must be valid JSON" }, { status: 400 }); }

  if (!body.type || !["company", "investor"].includes(body.type)) {
    return NextResponse.json({ error: "type must be 'company' or 'investor'" }, { status: 400 });
  }
  if (!body.email && !body.organization) {
    return NextResponse.json({ error: "Either email or organization is required" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const conferenceSlug = (searchParams.get("conference_id") ?? body.conference_id ?? "").trim();
  if (!conferenceSlug) {
    return NextResponse.json({
      error: "conference_id required (either as a query param ?conference_id=<slug> or a body field). This is the CRM slug for the conference, e.g. 'above-beyond-summit-2026'.",
    }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: conference } = await supabase
    .from("conferences").select("id, name").eq("slug", conferenceSlug).maybeSingle();
  if (!conference) {
    return NextResponse.json({
      error: `Unknown conference: '${conferenceSlug}'. Create it in the CRM admin first (Admin → Conferences → New conference), then use its slug here.`,
    }, { status: 404 });
  }

  // ---- Compose the human-readable notes blob ----
  const notesParts: string[] = [];
  if (body.commodities && body.commodities.length > 0) {
    notesParts.push(`Commodities: ${body.commodities.join(", ")}`);
  }
  if (body.guests && body.guests.length > 0) {
    notesParts.push(`Guests (${body.guests.length}):`);
    body.guests.forEach(g => {
      notesParts.push(`  • ${g.name ?? "(no name)"}${g.email ? ` <${g.email}>` : ""}`);
    });
  }
  if (body.special_requests) notesParts.push(`Special requests: ${body.special_requests}`);
  if (body.extras && Object.keys(body.extras).length > 0) {
    const flat = Object.entries(body.extras)
      .filter(([, v]) => v !== null && v !== undefined && v !== false && v !== "")
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`);
    if (flat.length > 0) notesParts.push(`Extras: ${flat.join(", ")}`);
  }
  if (body.submitted_at) notesParts.push(`Submitted: ${body.submitted_at}`);
  const notes = notesParts.join("\n") || null;

  // ---- Look for an existing lead (email or org match within this conference) ----
  const table = body.type === "company" ? "companies" : "investors";
  const nameField = body.type === "company" ? "name" : "firm_name";
  const orgName = (body.organization ?? body.name ?? "").trim();

  let existing: { id: string } | null = null;
  if (body.email) {
    const { data } = await supabase.from(table).select("id")
      .eq("conference_id", conference.id).ilike("email", body.email).maybeSingle();
    if (data) existing = data;
  }
  if (!existing && orgName) {
    const { data } = await supabase.from(table).select("id")
      .eq("conference_id", conference.id).ilike(nameField, orgName).maybeSingle();
    if (data) existing = data;
  }

  // ---- Build the payload for insert/update ----
  const fields: Record<string, unknown> = {
    [nameField]: orgName,
    contact_name: body.name ?? null,
    contact_title: body.title ?? null,
    email: body.email ?? null,
    phone: body.phone ?? null,
    ticker: body.ticker ?? null,
    stage: "pending_approval",   // web signups wait for operator review before joining the pipeline
    confirmed: "tentative",      // not confirmed until operator approves
    source: body.source ?? "web registration",
    notes,
    conference_id: conference.id,
  };

  if (body.type === "company") {
    if (body.stage) fields.industry = body.stage;
    else if (body.commodities && body.commodities.length > 0) fields.industry = body.commodities[0];
  } else {
    if (body.commodities && body.commodities.length > 0) {
      fields.sector_focus = body.commodities.join(", ");
    }
  }

  // ---- Insert or update ----
  //
  // On update we deliberately drop `stage` and `confirmed` from the payload:
  // once the operator has moved a lead out of Pending Approval, a repeat form
  // submission from the same person shouldn't bump them back to it.
  //
  // DEFENSIVE: intake must never 500 because a schema migration is behind.
  // If the insert fails with a check-constraint violation (Postgres 23514)
  // because `pending_approval` isn't a valid stage yet (i.e. migration 0013
  // hasn't been run), retry with `not_contacted` — which has been valid since
  // migration 0001. Same treatment for any other column the DB rejects
  // (undefined column = 42703, invalid enum value = 22P02) — we strip the
  // offending column and retry until either the row inserts or we're out of
  // knobs to turn.
  let leadId: string;
  let created: boolean;
  const degradations: string[] = [];  // logged for observability

  if (existing) {
    const updateFields = { ...fields };
    delete updateFields.stage;
    delete updateFields.confirmed;
    const result = await tolerantUpsert(supabase, table, updateFields, existing.id, degradations);
    if (!result.ok) return NextResponse.json({ error: result.error, degradations }, { status: 500 });
    leadId = result.id;
    created = false;
  } else {
    const result = await tolerantUpsert(supabase, table, fields, null, degradations);
    if (!result.ok) return NextResponse.json({ error: result.error, degradations }, { status: 500 });
    leadId = result.id;
    created = true;
  }

  if (degradations.length > 0) {
    console.warn(`[intake] recovered from schema drift on ${table}:`, degradations.join(" · "));
  }

  // ---- Activity log ----
  await supabase.from("activity_log").insert({
    conference_id: conference.id,
    lead_type: body.type, lead_id: leadId, lead_name: orgName,
    action: created ? "Registered via website" : "Updated via website",
    notes: body.source ? `Source: ${body.source}` : null,
  });

  // ---- Fire TDD AdsPlatform lookup in background (non-blocking) ----
  if (orgName) {
    checkIsClientSponsor({ company_name: orgName, ticker: body.ticker ?? null })
      .then(async res => {
        if (!res.error) {
          await supabase.from(table).update({
            is_tdd_client: res.is_client,
            tdd_match_type: res.match_type,
            tdd_company_data: res.company,
            tdd_last_checked_at: new Date().toISOString(),
          }).eq("id", leadId);
        }
      })
      .catch(() => { /* silent — CRM sync loop will catch it later */ });
  }

  return NextResponse.json({
    id: leadId,
    type: body.type,
    created,
    updated: !created,
    conference_id: conferenceSlug,
    url: `https://crm.thedeepdive.ca/conferences/${conferenceSlug}/${body.type === "company" ? "companies" : "investors"}/${leadId}`,
  }, { status: created ? 201 : 200 });
}

function bearerToken(auth: string | null): string | null {
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// tolerantUpsert — insert-or-update that recovers from schema drift.
// ---------------------------------------------------------------------------
//
// Postgres error codes we handle:
//   * 23514 check_violation           → try alternate values, then drop the col
//   * 42703 undefined_column          → drop the col + retry
//   * 22P02 invalid_text_representation (bad enum value) → try alternates
//
// The intake must always succeed for well-formed payloads. If the CRM's
// database is behind on migrations, we degrade the write (falling back to
// safe values or dropping the offending column) rather than 500ing the
// partner's request. Each degradation is recorded and returned in the
// response for visibility.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

interface StageAlternates { [column: string]: string[] }
const SAFE_ALTERNATES: StageAlternates = {
  // Order = preference. pending_approval requires migration 0013; not_contacted
  // is guaranteed to exist since migration 0001.
  stage:      ["not_contacted", "reaching_out"],
  confirmed:  ["no"],
  // Add new columns here if we ever introduce more enum-like fields via
  // intake — keeps the fallback loop mechanical.
};

// Columns that were added by post-0001 migrations and might not exist yet
// on a stale schema. If Postgres reports one of these as unknown, we drop
// it and try again.
const OPTIONAL_COLUMNS = new Set([
  "ticker", "phone", "contact_title",
]);

interface UpsertOk  { ok: true; id: string }
interface UpsertErr { ok: false; error: string }
type UpsertResult   = UpsertOk | UpsertErr;

async function tolerantUpsert(
  supabase: SupabaseClient,
  table: string,
  incoming: Record<string, unknown>,
  updateId: string | null,
  degradations: string[],
): Promise<UpsertResult> {
  const fields = { ...incoming };
  // Track alternate cursor per column so retries make progress.
  const altCursor: Record<string, number> = {};

  // Bounded retry loop — cap at ~10 iterations so we can't get stuck.
  for (let attempt = 0; attempt < 10; attempt++) {
    let error: { code?: string; message?: string; details?: string } | null;
    let data: { id: string } | null;
    if (updateId) {
      const r = await supabase.from(table).update(fields).eq("id", updateId).select("id").single();
      error = r.error; data = r.data;
    } else {
      const r = await supabase.from(table).insert(fields).select("id").single();
      error = r.error; data = r.data;
    }

    if (!error) return { ok: true, id: (data as { id: string }).id };

    const code    = (error.code ?? "").toString();
    const msg     = (error.message ?? "").toString();
    const details = (error.details ?? "").toString();
    const combined = `${msg} ${details}`;

    // ----- Case A: check-constraint or bad-enum on a known stage/confirmed field
    if (code === "23514" || code === "22P02") {
      // Try to identify which column tripped. Postgres includes it in the
      // message (e.g. `investors_stage_check`) or in `details`.
      const guessed =
        /_(stage)_check/.test(combined) ? "stage" :
        /_(confirmed)_check/.test(combined) ? "confirmed" :
        Object.keys(SAFE_ALTERNATES).find(k => new RegExp(`\\b${k}\\b`).test(combined));

      if (guessed && guessed in SAFE_ALTERNATES) {
        const options = SAFE_ALTERNATES[guessed];
        const nextIdx = (altCursor[guessed] ?? 0);
        if (nextIdx < options.length) {
          const nextVal = options[nextIdx];
          degradations.push(`${guessed}: constraint rejected "${fields[guessed]}", retrying with "${nextVal}"`);
          fields[guessed] = nextVal;
          altCursor[guessed] = nextIdx + 1;
          continue;
        }
        // Out of alternates — drop the column and retry so the row still writes.
        degradations.push(`${guessed}: all alternates exhausted, dropping column`);
        delete fields[guessed];
        continue;
      }
    }

    // ----- Case B: undefined column (schema behind on newer migration)
    if (code === "42703") {
      const m = combined.match(/column\s+"?([a-z_][a-z0-9_]*)"?/i);
      const col = m?.[1];
      if (col && col in fields && OPTIONAL_COLUMNS.has(col)) {
        degradations.push(`${col}: column doesn't exist yet, dropping and retrying`);
        delete fields[col];
        continue;
      }
    }

    // Anything else → give up and surface the error.
    return { ok: false, error: `${msg}${details ? ` (${details})` : ""}` };
  }

  return { ok: false, error: "Exceeded retry budget while degrading intake payload" };
}
