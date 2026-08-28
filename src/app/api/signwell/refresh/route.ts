import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getDocument, SignWellError } from "@/lib/signwell";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/signwell/refresh
 * Body: { company_id }
 *
 * Pull-based status sync. Fetches the current SignWell document status and
 * updates the CRM row accordingly. Use this whenever SignWell's webhook
 * misses an event (which happens: their retry window is 3 days and they
 * silently disable webhooks after that, plus rare payload-shape variants
 * can slip past the handler).
 *
 * Auth: any signed-in user with access to the company row (RLS enforces).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  let body: { company_id?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Body must be JSON" }, { status: 400 }); }
  if (!body.company_id) return NextResponse.json({ error: "company_id is required" }, { status: 400 });

  // Use RLS-scoped client for the initial fetch (auth check via visibility)
  const { data: companyRls } = await supabase.from("companies")
    .select("id, name, agreement_document_id")
    .eq("id", body.company_id).maybeSingle();
  if (!companyRls) return NextResponse.json({ error: "Company not found or access denied" }, { status: 404 });
  if (!companyRls.agreement_document_id) {
    return NextResponse.json({ error: "No SignWell document on file for this company." }, { status: 400 });
  }

  const admin = createServiceClient();
  const { data: company } = await admin.from("companies")
    .select("id, name, conference_id, agreement_status, agreement_document_id, agreement_sent_at, agreement_viewed_at, agreement_completed_at, agreement_declined_at")
    .eq("id", body.company_id).single();
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  let doc;
  try {
    doc = await getDocument(company.agreement_document_id!);
  } catch (e) {
    const status = e instanceof SignWellError ? e.status : 500;
    return NextResponse.json({ error: `SignWell: ${e instanceof Error ? e.message : String(e)}` }, { status });
  }

  // Log the whole SignWell doc so we can debug status mismatches from
  // Vercel logs without guessing. Only the fields that matter are logged.
  console.log("[signwell/refresh]", JSON.stringify({
    doc_id: doc.id,
    doc_status: doc.status,
    recipients: (doc.recipients ?? []).map(r => ({
      email: r.email, status: r.status, placeholder: r.placeholder_name,
    })),
  }));

  // ---- Combine document + recipient statuses ----------------------------
  //
  // SignWell's doc.status is the OVERALL state ("Sent", "Outstanding",
  // "Completed"). But per-recipient statuses tell us who has viewed or
  // signed. A single recipient viewing does NOT bump doc.status from "Sent"
  // to "Viewed" — that only happens once everyone required has viewed.
  //
  // So we combine: use doc.status for terminal states (Completed, Declined,
  // etc.), but check recipient statuses to detect earlier progress like
  // "at least one recipient has viewed" or "some recipients have signed".
  const rawDoc = (doc.status ?? "").toLowerCase();
  const recipientStatuses = (doc.recipients ?? [])
    .map(r => (r.status ?? "").toLowerCase())
    .filter(Boolean);
  const anyRecipient = (needle: string) => recipientStatuses.some(s => s.includes(needle));

  const nextStatus =
    rawDoc === "completed" || rawDoc === "signed" ? "signed" :
    rawDoc === "declined" || anyRecipient("declined") ? "declined" :
    rawDoc === "expired"  ? "expired" :
    rawDoc === "canceled" || rawDoc === "cancelled" || rawDoc === "deleted" ? "voided" :
    // If any recipient viewed the doc, surface Viewed — even if the doc-
    // level status is still "Sent" / "Outstanding" waiting on other signers.
    anyRecipient("signed")    ? "signed"   :  // one signer done — treat as signed
    anyRecipient("viewed")    ? "viewed"   :
    rawDoc === "viewed"       ? "viewed"   :
    rawDoc === "sent" || rawDoc === "pending" || rawDoc === "outstanding" ? "sent" :
    rawDoc === "draft" ? "not_sent" :
    null;

  if (!nextStatus) {
    return NextResponse.json({
      error: `SignWell reported an unrecognized document status: "${doc.status}". Recipient statuses: ${recipientStatuses.join(", ") || "none"}. Nothing was changed.`,
      signwell_status: doc.status,
      signwell_recipients: doc.recipients,
    }, { status: 502 });
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { agreement_status: nextStatus };
  // Backfill missing timestamps so the panel's history dl doesn't stay blank.
  if (nextStatus === "sent"     && !company.agreement_sent_at)      patch.agreement_sent_at = now;
  if (nextStatus === "viewed"   && !company.agreement_viewed_at)    patch.agreement_viewed_at = now;
  if (nextStatus === "signed"   && !company.agreement_completed_at) patch.agreement_completed_at = now;
  if (nextStatus === "declined" && !company.agreement_declined_at)  patch.agreement_declined_at = now;

  const { error: upErr } = await admin.from("companies").update(patch).eq("id", company.id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // Only log to activity if the status actually moved — pointless noise otherwise.
  if (nextStatus !== company.agreement_status) {
    await admin.from("activity_log").insert({
      conference_id: company.conference_id,
      lead_type: "company",
      lead_id: company.id,
      lead_name: company.name,
      action: `Agreement status refreshed from SignWell → ${nextStatus}`,
      notes: `Manual pull. SignWell status: "${doc.status}". Previous CRM status: "${company.agreement_status}".`,
      user_id: user.id,
    });
  }

  return NextResponse.json({
    ok: true,
    signwell_status: doc.status,
    signwell_recipients: (doc.recipients ?? []).map(r => ({
      email: r.email, status: r.status, placeholder: r.placeholder_name,
    })),
    previous: company.agreement_status,
    current: nextStatus,
    changed: nextStatus !== company.agreement_status,
  });
}
