import { NextResponse } from "next/server";
import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { EVENT_TO_STATUS, getDocument } from "@/lib/signwell";

export const runtime = "nodejs";

/**
 * POST /api/signwell/webhook
 *
 * SignWell posts document-lifecycle events here. Their payload shape varies
 * a little between API versions / event types, so this handler is defensive:
 * it accepts any of the shapes we've observed and always logs the raw body
 * to Vercel with the [signwell/webhook] tag so future mismatches can be
 * debugged from the logs alone.
 *
 * Documented shape:
 *   {
 *     "event":  { "type": "document_viewed", "hash": "..." },
 *     "data":   { "object": <document> }
 *   }
 *
 * Also observed:
 *   { "type": "document_viewed", "document": { ... } }
 *   { "event_type": "Document.Viewed", "data": <document> }
 *
 * We:
 *   1. Log the raw payload.
 *   2. Extract the event type from any of ~4 possible fields.
 *   3. Extract the document from any of ~3 possible fields.
 *   4. Look up the CRM company via metadata.crm_company_id, or by
 *      agreement_document_id fallback.
 *   5. Update the company row's agreement_status + timestamps.
 *   6. Write an activity_log entry.
 *   7. Always return 200 so SignWell stops retrying.
 */
export async function POST(request: Request) {
  const raw = await request.text();

  // Always log the raw body first — even if parsing fails — so we can
  // diagnose the exact payload SignWell is delivering.
  console.log("[signwell/webhook] raw:", raw.slice(0, 2000));

  let payload: Record<string, unknown>;
  try { payload = JSON.parse(raw); }
  catch {
    console.warn("[signwell/webhook] non-JSON body — ignoring");
    return NextResponse.json({ ok: true });
  }

  const eventType = extractEventType(payload);
  const doc = extractDocument(payload);
  const documentId = String(doc?.id ?? "");
  const metadata = ((doc?.metadata ?? {}) as Record<string, string | undefined>);
  const companyId = metadata.crm_company_id;

  console.log("[signwell/webhook] parsed:", JSON.stringify({
    eventType, documentId, companyId, docStatus: doc?.status ?? null,
  }));

  if (!documentId) {
    console.warn("[signwell/webhook] no document id in payload — nothing to do");
    return NextResponse.json({ ok: true });
  }

  // Optional signature verification — best-effort.
  const secret = process.env.SIGNWELL_WEBHOOK_SECRET ?? process.env.SIGNWELL_API_KEY;
  const hash = (payload.event as { hash?: string } | undefined)?.hash;
  if (hash && secret) {
    const eventJson = JSON.stringify(payload.event ?? {});
    const expected = crypto.createHmac("sha256", secret).update(eventJson).digest("hex");
    if (expected !== hash) {
      console.warn("[signwell/webhook] hash mismatch — ignoring", { eventType });
      return NextResponse.json({ ok: true });
    }
  }

  const admin = createServiceClient();

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
    console.warn("[signwell/webhook] unknown company for doc", { documentId, eventType });
    return NextResponse.json({ ok: true });
  }

  // Prefer the status embedded in the payload (case-insensitive) — falls
  // back to the event-name lookup if the payload doesn't include one.
  const docStatus = typeof doc?.status === "string" ? doc.status : "";
  const rawStatus = docStatus.toLowerCase();
  const statusFromPayload =
    rawStatus === "completed" || rawStatus === "signed" ? "signed" :
    rawStatus === "declined" ? "declined" :
    rawStatus === "expired"  ? "expired" :
    rawStatus === "canceled" || rawStatus === "cancelled" || rawStatus === "deleted" ? "voided" :
    rawStatus === "viewed"   ? "viewed" :
    rawStatus === "sent" || rawStatus === "pending" ? "sent" :
    null;

  const statusFromEvent = EVENT_TO_STATUS[eventType] ?? null;
  const nextStatus = statusFromPayload ?? statusFromEvent;
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {};

  if (nextStatus) patch.agreement_status = nextStatus;
  if ((nextStatus === "viewed"  || matchesEvent(eventType, "viewed"))    && !("agreement_viewed_at" in patch))    patch.agreement_viewed_at = now;
  if ((nextStatus === "signed"  || matchesEvent(eventType, "completed") || matchesEvent(eventType, "signed"))) patch.agreement_completed_at = now;
  if ((nextStatus === "declined" || matchesEvent(eventType, "declined"))) patch.agreement_declined_at = now;

  if (matchesEvent(eventType, "completed")) {
    try {
      const full = await getDocument(documentId);
      if ((full as unknown as { files_url?: string }).files_url) {
        patch.agreement_pdf_url = (full as unknown as { files_url?: string }).files_url ?? null;
      }
    } catch (e) { console.warn("[signwell/webhook] post-complete getDocument failed", e); }
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await admin.from("companies").update(patch).eq("id", company.id);
    if (error) console.error("[signwell/webhook] company update failed:", error);
  } else {
    console.log("[signwell/webhook] no status-affecting fields — nothing to update");
  }

  await admin.from("activity_log").insert({
    conference_id: company.conference_id,
    lead_type: "company",
    lead_id: company.id,
    lead_name: company.name,
    action: eventLabel(eventType, nextStatus),
    notes: `SignWell event: ${eventType || "(no event type)"} · doc status: ${docStatus || "?"} · doc ${documentId}`,
  });

  return NextResponse.json({ ok: true });
}

// ---------------------------------------------------------------------------
// Payload extractors — permissive to survive SignWell shape variants.
// ---------------------------------------------------------------------------

function extractEventType(payload: Record<string, unknown>): string {
  // Documented: payload.event.type. Some webhooks use payload.type, others
  // payload.event_type, others send capitalized names like "Document.Viewed"
  // that we normalize to snake_case.
  const raw =
    (payload.event as { type?: string } | undefined)?.type ??
    (payload.type as string | undefined) ??
    (payload.event_type as string | undefined) ??
    "";
  return String(raw)
    .replace(/\./g, "_")
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase();
}

function extractDocument(payload: Record<string, unknown>): Record<string, unknown> | undefined {
  const candidates: unknown[] = [
    (payload.data as { object?: unknown } | undefined)?.object,
    payload.data,
    payload.document,
    (payload.event as { object?: unknown } | undefined)?.object,
    payload.object,
  ];
  for (const c of candidates) {
    if (c && typeof c === "object" && "id" in (c as object)) {
      return c as Record<string, unknown>;
    }
  }
  return undefined;
}

/** eventType contains a keyword? Handles both "document_viewed" and "viewed". */
function matchesEvent(eventType: string, keyword: string): boolean {
  return eventType.includes(keyword);
}

function eventLabel(event: string, mappedStatus: string | null): string {
  if (event.includes("sent"))      return "Agreement sent";
  if (event.includes("viewed"))    return "Agreement viewed";
  if (event.includes("completed")) return "Agreement completed";
  if (event.includes("signed"))    return "Agreement signed (partial)";
  if (event.includes("declined"))  return "Agreement declined";
  if (event.includes("expired"))   return "Agreement expired";
  if (event.includes("deleted") || event.includes("canceled") || event.includes("cancelled")) return "Agreement voided";
  return mappedStatus ? `Agreement → ${mappedStatus}` : `Agreement event: ${event || "unknown"}`;
}
