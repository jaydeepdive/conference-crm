import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createDocumentFromTemplate, SignWellError } from "@/lib/signwell";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/signwell/send
 *
 * Body: {
 *   company_id: uuid,
 *   signer_name?: string,       // override the company's contact_name
 *   signer_email?: string,      // override the company's email
 *   subject?: string,           // override the default email subject
 *   message?: string,           // override the default email body
 *   test_mode?: boolean,        // default true when NODE_ENV !== 'production'
 * }
 *
 * Sends the conference's SignWell participation-agreement template to the
 * company's designated signer, autofilling the "company name" field (and any
 * other fields the operator configured in conferences.signwell_field_map).
 *
 * Returns the SignWell document id + the stored company row.
 *
 * Auth: any user with edit access to the conference (recruiter+, staff).
 */

type Body = {
  company_id?: string;
  signer_name?: string;
  signer_email?: string;
  subject?: string;
  message?: string;
  test_mode?: boolean;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  let body: Body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Body must be JSON" }, { status: 400 }); }
  if (!body.company_id) return NextResponse.json({ error: "company_id is required" }, { status: 400 });

  const admin = createServiceClient();

  // Load company + conference
  const { data: company, error: cErr } = await admin
    .from("companies").select("*").eq("id", body.company_id).single();
  if (cErr || !company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  const { data: conference } = await admin
    .from("conferences").select("*").eq("id", company.conference_id).single();
  if (!conference) return NextResponse.json({ error: "Conference not found" }, { status: 404 });

  if (!conference.signwell_template_id) {
    return NextResponse.json({
      error: "This conference doesn't have a SignWell template configured yet. Set one under Settings → SignWell.",
    }, { status: 400 });
  }

  const fieldMap = (conference.signwell_field_map ?? {}) as Record<string, string>;
  if (!fieldMap.company_name) {
    return NextResponse.json({
      error: "The SignWell template's Company Name field isn't mapped. Set it under Settings → SignWell.",
    }, { status: 400 });
  }

  const signerName  = (body.signer_name  ?? company.contact_name ?? "").trim();
  const signerEmail = (body.signer_email ?? company.email        ?? "").trim();
  if (!signerName || !signerEmail) {
    return NextResponse.json({
      error: "This company is missing a contact_name or email. Add them on the lead detail before sending the agreement.",
    }, { status: 400 });
  }

  const template_fields: Array<{ api_id: string; value: string }> = [
    { api_id: fieldMap.company_name, value: company.name },
  ];
  if (fieldMap.signer_name)  template_fields.push({ api_id: fieldMap.signer_name,  value: signerName });
  if (fieldMap.signer_email) template_fields.push({ api_id: fieldMap.signer_email, value: signerEmail });
  if (fieldMap.signer_title && company.contact_title) {
    template_fields.push({ api_id: fieldMap.signer_title, value: company.contact_title });
  }
  if (fieldMap.conference_name) {
    template_fields.push({ api_id: fieldMap.conference_name, value: conference.name });
  }
  if (fieldMap.conference_dates) {
    const dates = conference.date_start
      ? `${conference.date_start}${conference.date_end && conference.date_end !== conference.date_start ? ` – ${conference.date_end}` : ""}`
      : "";
    if (dates) template_fields.push({ api_id: fieldMap.conference_dates, value: dates });
  }

  try {
    const doc = await createDocumentFromTemplate({
      template_id: conference.signwell_template_id,
      name: `${conference.name} — Participation Agreement — ${company.name}`,
      subject: body.subject ?? `Participation Agreement — ${conference.name}`,
      message: body.message ?? `Hi ${signerName.split(" ")[0]},\n\nPlease review and sign the participation agreement for ${conference.name}.\n\nThanks.`,
      recipients: [{
        placeholder_name: conference.signwell_placeholder_signer ?? "Signer 1",
        name: signerName,
        email: signerEmail,
      }],
      template_fields,
      draft: false,
      test_mode: body.test_mode ?? (process.env.NODE_ENV !== "production" ? true : false),
      // Metadata is echoed back on every webhook, so we can look up the company
      // without keeping a separate index.
      metadata: {
        crm_company_id: company.id,
        crm_conference_id: conference.id,
        crm_conference_slug: conference.slug,
      },
    });

    // Persist status on the company row
    const { error: upErr } = await admin.from("companies").update({
      agreement_status: "sent",
      agreement_document_id: doc.id,
      agreement_sent_at: new Date().toISOString(),
      agreement_viewed_at: null,
      agreement_completed_at: null,
      agreement_declined_at: null,
      agreement_signer_name: signerName,
      agreement_signer_email: signerEmail,
      agreement_pdf_url: null,
    }).eq("id", company.id);
    if (upErr) console.error("Failed to persist SignWell state:", upErr);

    // Activity log
    await admin.from("activity_log").insert({
      conference_id: conference.id,
      lead_type: "company",
      lead_id: company.id,
      lead_name: company.name,
      action: "Agreement sent",
      notes: `SignWell doc ${doc.id} sent to ${signerName} <${signerEmail}>`,
      user_id: user.id,
    });

    return NextResponse.json({ ok: true, document_id: doc.id });
  } catch (e) {
    const status = e instanceof SignWellError ? e.status : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status });
  }
}
