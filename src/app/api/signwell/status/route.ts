import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

/**
 * POST /api/signwell/status
 *
 * Body: { company_id, status }
 *
 * Super-admin override. Force the agreement_status on a company row when
 * SignWell's webhook / verification got it wrong (e.g. verification hit
 * SignWell during their internal dispatch lag and saw "Draft", but the
 * doc actually sent).
 *
 * Logs to activity_log so the manual override is auditable.
 */
const ALLOWED = new Set(["not_sent","sent","viewed","signed","declined","voided","expired"]);

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("is_super_admin, full_name, email").eq("id", user.id).single();
  if (!profile?.is_super_admin) return NextResponse.json({ error: "Super admin only" }, { status: 403 });

  let body: { company_id?: string; status?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Body must be JSON" }, { status: 400 }); }

  if (!body.company_id) return NextResponse.json({ error: "company_id is required" }, { status: 400 });
  if (!body.status || !ALLOWED.has(body.status)) {
    return NextResponse.json({ error: `status must be one of: ${Array.from(ALLOWED).join(", ")}` }, { status: 400 });
  }

  const admin = createServiceClient();
  const { data: company } = await admin.from("companies")
    .select("id, name, conference_id, agreement_status")
    .eq("id", body.company_id).maybeSingle();
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  const prev = company.agreement_status ?? "not_sent";
  const next = body.status;
  const now = new Date().toISOString();

  // Update the primary status column + the relevant timestamp so downstream
  // views (dashboard KPIs, activity feed) reflect the manual change.
  const patch: Record<string, unknown> = { agreement_status: next };
  if (next === "sent"     && !("agreement_sent_at" in company)) patch.agreement_sent_at = now;
  if (next === "sent")     patch.agreement_sent_at ??= now;
  if (next === "viewed")   patch.agreement_viewed_at = now;
  if (next === "signed")   patch.agreement_completed_at = now;
  if (next === "declined") patch.agreement_declined_at = now;
  if (next === "not_sent") {
    // Reset timestamps so the panel doesn't show stale "Sent Aug 21" text.
    patch.agreement_sent_at = null;
    patch.agreement_viewed_at = null;
    patch.agreement_completed_at = null;
    patch.agreement_declined_at = null;
  }
  // Fully-signed → move lead to Registered stage (also fires on the manual
  // override path so operator-corrected signed rows land in the right stage).
  if (next === "signed") patch.stage = "registered";

  const { error: upErr } = await admin.from("companies").update(patch).eq("id", company.id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  await admin.from("activity_log").insert({
    conference_id: company.conference_id,
    lead_type: "company",
    lead_id: company.id,
    lead_name: company.name,
    action: "Agreement status manually overridden",
    notes: `${profile.full_name ?? profile.email} changed agreement_status from "${prev}" to "${next}"`,
    user_id: user.id,
  });

  return NextResponse.json({ ok: true, previous: prev, current: next });
}
