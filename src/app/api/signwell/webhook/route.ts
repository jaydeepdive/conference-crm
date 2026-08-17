import { NextResponse } from "next/server";
import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { EVENT_TO_STATUS, getDocument } from "@/lib/signwell";

export const runtime = "nodejs";

/**
 * POST /api/signwell/webhook
 *
 * SignWell posts document-lifecycle events here. Payload shape:
 *   {
 *     "event": { "type": "document_sent" | "document_completed" | ..., "hash": "sha256" },
 *     "data":  { "object": <document> }
 *   }
 *
 * We:
 *   1. (Optionally) verify the SHA-256 signature — SignWell posts a `hash`
 *      field that's HMAC-SHA256(event JSON, api_key) if the workspace has
 *      hash verification turned on.
 *   2. Look up the CRM company via metadata.crm_company_id, or by
 *      agreement_document_id fallback.
 *   3. Update the company row's agreement_status + timestamps.
 *   4. Write an activity_log entry.
 *   5. Always return 200 (unless it's a genuine 4xx) so SignWell stops retrying.
 *
 * No CRM-side auth on this route — SignWell doesn't sign in. Anyone with the
 * URL can POST, so keep the URL secret and rely on hash verification for
 * anti-spoofing when possible.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  let payload: {
    event?: { type?: string; hash?: string };
    data?: { object?: Record<string, unknown> };
  };
  try { payload = JSON.parse(raw); }
  catch { return NextResponse.json({ ok: true }); }  // malformed → ignore

  const eventType = payload.event?.type ?? "";

  // Optional signature verification (SignWell will only send `hash` if you've
  // enabled it). Best-effort — silently skip if disabled or if secret not set.
  const secret = process.env.SIGNWELL_WEBHOOK_SECRET ?? process.env.SIGNWELL_API_KEY;
  if (payload.event?.hash && secret) {
    const eventJson = JSON.stringify(payload.event ?? {});
    const expected = crypto.createHmac("sha256", secret).update(eventJson).digest("hex");
    if (expected !== payload.event.hash) {
      // Not necessarily malicious — could be a secret mismatch. Log and 200.
      console.warn("SignWell webhook hash mismatch — ignoring", { eventType });
      return NextResponse.json({ ok: true });
    }
  }

  const doc = (payload.data?.object ?? {}) as Record<string, unknown>;
  const documentId = String(doc.id ?? "");
  const metadata = (doc.metadata ?? {}) as Record<string, string | undefined>;
  const companyId = metadata.crm_company_id;

  if (!documentId) return NextResponse.json({ ok: true });

  const admin = createServiceClient();

  // Locate the CRM row — prefer metadata (fast + reliable), fall back to
  // the persisted document id.
  type CompanyRow = { id: string; conference_id: string; name: string; agreement_status?: string };
  let company: CompanyRow | null = null;
  if (companyId) {
    const { data } = await admin.from("companies")
      .select("id,conference_id,name,agreement_status")
      .eq("id", companyId).maybeSingle();
    if (data) company = data as unknown as CompanyRow;
  }
  if (!company) {
    const { data } = await admin.from("companies")
      .select("id,conference_id,name,agreement_status")
      .eq("agreement_document_id", documentId).maybeSingle();
    if (data) company = data as unknown as CompanyRow;
  }
  if (!company) {
    console.warn("SignWell webhook for unknown company", { documentId, eventType });
    return NextResponse.json({ ok: true });
  }

  const nextStatus = EVENT_TO_STATUS[eventType];
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {};

  if (nextStatus) patch.agreement_status = nextStatus;
  if (eventType === "document_viewed"    && !patch.agreement_viewed_at)    patch.agreement_viewed_at = now;
  if (eventType === "document_completed" || eventType === "document_signed") patch.agreement_completed_at = now;
  if (eventType === "document_declined") patch.agreement_declined_at = now;

  // On completion, pull the fresh document metadata to try to grab any PDF
  // URL SignWell exposes (some responses include a signed URL).
  if (eventType === "document_completed") {
    try {
      const full = await getDocument(documentId);
      // Not every SignWell response includes a downloadable URL — leave null
      // if unavailable, the CRM UI will proxy `/api/signwell/document/{id}/pdf`.
      if ((full as unknown as { files_url?: string }).files_url) {
        patch.agreement_pdf_url = (full as unknown as { files_url?: string }).files_url ?? null;
      }
    } catch (e) { console.warn("Failed to refresh SignWell doc after completion", e); }
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await admin.from("companies").update(patch).eq("id", company.id);
    if (error) console.error("SignWell webhook update failed", error);
  }

  // Audit trail
  await admin.from("activity_log").insert({
    conference_id: company.conference_id,
    lead_type: "company",
    lead_id: company.id,
    lead_name: company.name,
    action: eventLabel(eventType),
    notes: `SignWell event: ${eventType} (doc ${documentId})`,
  });

  return NextResponse.json({ ok: true });
}

function eventLabel(event: string): string {
  switch (event) {
    case "document_sent":      return "Agreement sent";
    case "document_viewed":    return "Agreement viewed";
    case "document_signed":    return "Agreement signed (partial)";
    case "document_completed": return "Agreement completed";
    case "document_declined":  return "Agreement declined";
    case "document_expired":   return "Agreement expired";
    case "document_deleted":
    case "document_canceled":  return "Agreement voided";
    default:                   return `Agreement event: ${event}`;
  }
}
