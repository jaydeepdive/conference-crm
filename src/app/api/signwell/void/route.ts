import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { deleteDocument, SignWellError } from "@/lib/signwell";

export const runtime = "nodejs";

/**
 * POST /api/signwell/void
 *
 * Body: { company_id: uuid }
 *
 * Deletes the SignWell document (SignWell doesn't have an explicit "void"
 * endpoint — DELETE is the equivalent), and marks the company back to
 * "not_sent" so the operator can prep + resend.
 *
 * Super admin only. Skips SignWell if no document is currently on file.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).single();
  if (!profile?.is_super_admin) return NextResponse.json({ error: "Super admin only" }, { status: 403 });

  let body: { company_id?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Body must be JSON" }, { status: 400 }); }
  if (!body.company_id) return NextResponse.json({ error: "company_id is required" }, { status: 400 });

  const admin = createServiceClient();
  const { data: company } = await admin.from("companies")
    .select("id, name, conference_id, agreement_document_id")
    .eq("id", body.company_id).maybeSingle();
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  if (company.agreement_document_id) {
    try { await deleteDocument(company.agreement_document_id); }
    catch (e) {
      if (!(e instanceof SignWellError && e.status === 404)) {
        return NextResponse.json({ error: `SignWell: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
      }
    }
  }

  await admin.from("companies").update({
    agreement_status: "not_sent",
    agreement_document_id: null,
    agreement_sent_at: null,
    agreement_viewed_at: null,
    agreement_completed_at: null,
    agreement_declined_at: null,
    agreement_pdf_url: null,
  }).eq("id", company.id);

  await admin.from("activity_log").insert({
    conference_id: company.conference_id,
    lead_type: "company",
    lead_id: company.id,
    lead_name: company.name,
    action: "Agreement voided",
    notes: null,
    user_id: user.id,
  });

  return NextResponse.json({ ok: true });
}
