import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getDocument, SignWellError } from "@/lib/signwell";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/signwell/refresh-all
 * Body: { conference_id?: uuid }  — omit to refresh every non-terminal
 *                                   agreement across all conferences the
 *                                   caller can access.
 * Headers: authorization: Bearer <CRON_SECRET>  — optional, allows Vercel
 *          cron to invoke without a user session. Anything else requires
 *          a signed-in staff user.
 *
 * Pulls the current status from SignWell for every company that has an
 * `agreement_document_id` and whose CRM `agreement_status` is one of
 * ('sent','viewed') — i.e. still in-flight. Skips terminal states
 * ('signed','declined','voided','expired','not_sent') because there's
 * nothing to learn about them.
 *
 * Returns per-company outcomes so the UI can show a summary toast.
 */

type LookupRow = {
  id: string;
  name: string;
  conference_id: string;
  agreement_document_id: string;
  agreement_status: string;
  agreement_sent_at: string | null;
  agreement_viewed_at: string | null;
  agreement_completed_at: string | null;
  agreement_declined_at: string | null;
};

type ItemResult = {
  company_id: string;
  company_name: string;
  document_id: string;
  previous: string;
  current: string | null;
  changed: boolean;
  error?: string;
  signwell_status?: string;
};

function cronBearer(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  const supabase = await createClient();

  let authorized = false;
  const isCron = cronBearer(request);
  if (isCron) authorized = true;

  if (!authorized) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) authorized = true;
  }

  if (!authorized) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  let body: { conference_id?: string } = {};
  try { body = (await request.json()) as { conference_id?: string }; }
  catch { /* body is optional */ }

  const admin = createServiceClient();
  let q = admin.from("companies")
    .select("id, name, conference_id, agreement_document_id, agreement_status, agreement_sent_at, agreement_viewed_at, agreement_completed_at, agreement_declined_at")
    .not("agreement_document_id", "is", null)
    .in("agreement_status", ["sent", "viewed"]);
  if (body.conference_id) q = q.eq("conference_id", body.conference_id);

  const { data: rows, error: qErr } = await q;
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });

  const targets = (rows ?? []) as LookupRow[];
  const results: ItemResult[] = [];

  // Sequential to keep SignWell rate-limit-friendly. Small conferences will
  // finish in well under Vercel's maxDuration of 60s.
  for (const row of targets) {
    const result: ItemResult = {
      company_id: row.id,
      company_name: row.name,
      document_id: row.agreement_document_id,
      previous: row.agreement_status,
      current: row.agreement_status,
      changed: false,
    };
    try {
      const doc = await getDocument(row.agreement_document_id);
      result.signwell_status = doc.status;
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
        anyRecipient("signed")    ? "signed"   :
        anyRecipient("viewed")    ? "viewed"   :
        rawDoc === "viewed"       ? "viewed"   :
        rawDoc === "sent" || rawDoc === "pending" || rawDoc === "outstanding" ? "sent" :
        rawDoc === "draft" ? "not_sent" :
        null;

      if (!nextStatus) {
        result.error = `Unrecognized SignWell status: ${doc.status}`;
        results.push(result);
        continue;
      }

      if (nextStatus === row.agreement_status) {
        result.current = nextStatus;
        results.push(result);
        continue;
      }

      // Backfill missing timestamps so history reads cleanly.
      const now = new Date().toISOString();
      const patch: Record<string, unknown> = { agreement_status: nextStatus };
      if (nextStatus === "sent"     && !row.agreement_sent_at)      patch.agreement_sent_at = now;
      if (nextStatus === "viewed"   && !row.agreement_viewed_at)    patch.agreement_viewed_at = now;
      if (nextStatus === "signed"   && !row.agreement_completed_at) patch.agreement_completed_at = now;
      if (nextStatus === "declined" && !row.agreement_declined_at)  patch.agreement_declined_at = now;

      const { error: upErr } = await admin.from("companies").update(patch).eq("id", row.id);
      if (upErr) { result.error = upErr.message; results.push(result); continue; }

      await admin.from("activity_log").insert({
        conference_id: row.conference_id,
        lead_type: "company",
        lead_id: row.id,
        lead_name: row.name,
        action: `Agreement auto-refreshed → ${nextStatus}`,
        notes: `Bulk sync. SignWell status: "${doc.status}". Previous CRM status: "${row.agreement_status}".`,
      });

      result.current = nextStatus;
      result.changed = true;
      results.push(result);
    } catch (e) {
      result.error = e instanceof SignWellError
        ? `SignWell ${e.status}: ${e.message}`
        : (e instanceof Error ? e.message : String(e));
      results.push(result);
    }
  }

  const summary = {
    ok: true,
    checked: results.length,
    changed: results.filter(r => r.changed).length,
    errored: results.filter(r => r.error).length,
    triggered_by: isCron ? "cron" : "user",
  };
  console.log("[signwell/refresh-all]", JSON.stringify(summary));

  return NextResponse.json({ ...summary, results });
}

// GET is convenient for Vercel cron (which uses GET by default).
export async function GET(request: Request) {
  return POST(request);
}
