import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendReminder, SignWellError } from "@/lib/signwell";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/signwell/remind
 * Body: { company_id }
 *
 * Sends a reminder email to any recipients on the company's SignWell
 * document who haven't signed yet. Does NOT void the existing doc — same
 * signing URL, same document, fresh nudge. Sales staff can hit this after
 * a client phone call without needing super admin to intervene.
 *
 * Auth: any signed-in user with visibility of the company row (RLS gates
 * the initial select). No role restriction — reminders are safe.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  let body: { company_id?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Body must be JSON" }, { status: 400 }); }
  if (!body.company_id) return NextResponse.json({ error: "company_id is required" }, { status: 400 });

  // RLS-scoped fetch acts as the auth check.
  const { data: companyRls } = await supabase.from("companies")
    .select("id, name, agreement_document_id, agreement_status")
    .eq("id", body.company_id).maybeSingle();
  if (!companyRls) return NextResponse.json({ error: "Company not found or access denied" }, { status: 404 });
  if (!companyRls.agreement_document_id) {
    return NextResponse.json({ error: "This company doesn't have an active SignWell document to remind on." }, { status: 400 });
  }
  const terminalStates = ["signed", "declined", "voided", "expired"];
  if (terminalStates.includes(companyRls.agreement_status ?? "")) {
    return NextResponse.json({
      error: `Can't send a reminder — the agreement is already ${companyRls.agreement_status}. Use "Send again" to start a new one.`,
    }, { status: 400 });
  }

  try {
    await sendReminder(companyRls.agreement_document_id);
  } catch (e) {
    const status = e instanceof SignWellError ? e.status : 500;
    return NextResponse.json({ error: `SignWell: ${e instanceof Error ? e.message : String(e)}` }, { status });
  }

  // Log to activity (uses admin client so it works regardless of RLS).
  const admin = createServiceClient();
  const { data: fullCompany } = await admin.from("companies")
    .select("conference_id").eq("id", companyRls.id).single();
  if (fullCompany) {
    await admin.from("activity_log").insert({
      conference_id: fullCompany.conference_id,
      lead_type: "company",
      lead_id: companyRls.id,
      lead_name: companyRls.name,
      action: "Agreement reminder sent",
      notes: `SignWell reminder dispatched on doc ${companyRls.agreement_document_id}`,
      user_id: user.id,
    });
  }

  return NextResponse.json({ ok: true, document_id: companyRls.agreement_document_id });
}
