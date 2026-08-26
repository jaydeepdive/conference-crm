import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createDocumentFromTemplate, getTemplate, SignWellError } from "@/lib/signwell";
import type { SignWellTemplateConfig } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/signwell/send
 *
 * Body: {
 *   company_id:   uuid,
 *   template_id?: string,       // SignWell template UUID — picks one of the
 *                                 conference's configured templates. Defaults
 *                                 to the first if the conference has exactly
 *                                 one; otherwise required.
 *   signer_name?:  string,      // override company.contact_name
 *   signer_email?: string,      // override company.email
 *   subject?:      string,
 *   message?:      string,
 *   test_mode?:    boolean,
 * }
 *
 * Sends the selected participation-agreement template to the company's
 * designated signer, autofilling the fields the operator mapped for that
 * template variant.
 */

type Body = {
  company_id?: string;
  template_id?: string;
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

  const { data: company, error: cErr } = await admin
    .from("companies").select("*").eq("id", body.company_id).single();
  if (cErr || !company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  const { data: conference } = await admin
    .from("conferences").select("*").eq("id", company.conference_id).single();
  if (!conference) return NextResponse.json({ error: "Conference not found" }, { status: 404 });

  // ---- Resolve which template to use ---------------------------------------
  //
  // Preference order:
  //   1. Multi-template array (`signwell_templates`). Pick by `template_id`,
  //      or the sole entry if there's only one.
  //   2. Legacy single-template columns (`signwell_template_id` +
  //      `signwell_field_map` + `signwell_placeholder_signer`) — synthesize
  //      a config so the rest of the flow doesn't care.
  const configured: SignWellTemplateConfig[] =
    Array.isArray(conference.signwell_templates) && conference.signwell_templates.length > 0
      ? (conference.signwell_templates as SignWellTemplateConfig[])
      : (conference.signwell_template_id
          ? [{
              id: conference.signwell_template_id,
              name: "Default",
              placeholder_signer: conference.signwell_placeholder_signer ?? "Signer 1",
              field_map: (conference.signwell_field_map ?? {}) as Record<string, string>,
            }]
          : []);

  if (configured.length === 0) {
    return NextResponse.json({
      error: "This conference doesn't have any SignWell templates configured yet. Set one under Settings → SignWell.",
    }, { status: 400 });
  }

  let template: SignWellTemplateConfig | undefined;
  if (body.template_id) {
    template = configured.find(t => t.id === body.template_id);
    if (!template) {
      return NextResponse.json({
        error: `template_id "${body.template_id}" isn't configured on this conference. Available: ${configured.map(t => `${t.name} (${t.id})`).join(", ")}`,
      }, { status: 400 });
    }
  } else if (configured.length === 1) {
    template = configured[0];
  } else {
    return NextResponse.json({
      error: `This conference has ${configured.length} templates. Pass template_id to pick one. Available: ${configured.map(t => `${t.name} (${t.id})`).join(", ")}`,
    }, { status: 400 });
  }

  const fieldMap = template.field_map ?? {};
  if (!fieldMap.company_name) {
    return NextResponse.json({
      error: `Template "${template.name}" is missing the Company Name field mapping. Fix it under Settings → SignWell.`,
    }, { status: 400 });
  }

  const signerName  = (body.signer_name  ?? company.contact_name ?? "").trim();
  const signerEmail = (body.signer_email ?? company.email        ?? "").trim();
  if (!signerName || !signerEmail) {
    return NextResponse.json({
      error: "This company is missing a contact_name or email. Add them on the lead detail before sending the agreement.",
    }, { status: 400 });
  }

  // ---- Build the template_fields autofill payload --------------------------
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

  // ---- Sender + recipients -------------------------------------------------
  const { data: senderProfile } = await admin
    .from("profiles").select("id, full_name, email").eq("id", user.id).single();
  const senderName  = (senderProfile?.full_name ?? senderProfile?.email ?? "").trim() || "Organizer";
  const senderEmail = (senderProfile?.email ?? "").trim();

  let templatePlaceholders: string[] = [];
  try {
    const tpl = await getTemplate(template.id);
    templatePlaceholders = tpl.placeholders.map(p => p.name);
  } catch (e) {
    return NextResponse.json({
      error: `Couldn't load SignWell template "${template.name}": ${e instanceof Error ? e.message : String(e)}`,
    }, { status: 500 });
  }

  const signerPlaceholder = template.placeholder_signer ?? "Signer 1";

  const recipients: Array<{ id: number; placeholder_name: string; name: string; email: string }> = [];
  let recipientCounter = 0;
  const seen = new Set<string>();
  for (const ph of templatePlaceholders) {
    if (seen.has(ph)) continue;
    seen.add(ph);
    recipientCounter += 1;
    if (ph === signerPlaceholder) {
      recipients.push({ id: recipientCounter, placeholder_name: ph, name: signerName, email: signerEmail });
    } else {
      if (!senderEmail) {
        return NextResponse.json({
          error: `SignWell placeholder "${ph}" needs to be filled with the CRM operator, but your profile doesn't have an email on file. Update your profile first.`,
        }, { status: 400 });
      }
      recipients.push({ id: recipientCounter, placeholder_name: ph, name: senderName, email: senderEmail });
    }
  }
  if (!seen.has(signerPlaceholder)) {
    recipientCounter += 1;
    recipients.push({ id: recipientCounter, placeholder_name: signerPlaceholder, name: signerName, email: signerEmail });
  }

  // Force test_mode off in production. In dev / preview it defaults to true
  // so we don't burn quota. The frontend can override either way.
  const testMode = body.test_mode ?? (process.env.NODE_ENV !== "production");

  try {
    const doc = await createDocumentFromTemplate({
      template_id: template.id,
      name: `${conference.name} — ${template.name} — ${company.name}`,
      subject: body.subject ?? `Participation Agreement — ${conference.name}`,
      message: body.message ?? `Hi ${signerName.split(" ")[0]},\n\nPlease review and sign the participation agreement for ${conference.name}.\n\nThanks.`,
      recipients,
      template_fields,
      draft: false,
      test_mode: testMode,
      metadata: {
        crm_company_id: company.id,
        crm_conference_id: conference.id,
        crm_conference_slug: conference.slug,
        crm_template_id: template.id,
      },
    });

    // ---- POST-CREATE VERIFICATION -----------------------------------------
    //
    // SignWell can accept a `create document from template` call and return
    // 201 even when the resulting document ends up in `draft`, `pending`,
    // or another non-sent state (typical causes: a placeholder was left
    // with the same email as the sender, a required field the template
    // didn't expose was left blank, or the workspace is on a plan tier
    // that suppresses email delivery). Fetch the doc back once and use its
    // status as the source of truth for whether we consider this "sent".
    let verified: Awaited<ReturnType<typeof getTemplate>> extends infer T ? T : never;
    let observedStatus: string | undefined;
    try {
      const check = await import("@/lib/signwell").then(m => m.getDocument(doc.id));
      observedStatus = check.status;
      verified = check as never;
    } catch (e) {
      // Non-fatal — we still created the doc.
      console.warn("[signwell/send] post-create getDocument failed:", e);
    }

    // Anything that isn't sent/viewed/pending/completed is suspicious.
    const dispatchOK = observedStatus === undefined ||
      ["sent", "viewed", "pending", "signed", "completed"].includes(observedStatus);

    // ---- Persist status ---------------------------------------------------
    const nextStatus = dispatchOK ? "sent" : "not_sent";
    const { error: upErr } = await admin.from("companies").update({
      agreement_status: nextStatus,
      agreement_document_id: doc.id,
      agreement_sent_at: dispatchOK ? new Date().toISOString() : null,
      agreement_viewed_at: null,
      agreement_completed_at: null,
      agreement_declined_at: null,
      agreement_signer_name: signerName,
      agreement_signer_email: signerEmail,
      agreement_pdf_url: null,
      agreement_template_id: template.id,
      agreement_template_name: template.name,
    }).eq("id", company.id);
    if (upErr) console.error("Failed to persist SignWell state:", upErr);

    await admin.from("activity_log").insert({
      conference_id: conference.id,
      lead_type: "company",
      lead_id: company.id,
      lead_name: company.name,
      action: dispatchOK ? "Agreement sent" : "Agreement created but not dispatched",
      notes: `SignWell doc ${doc.id} (${template.name}) → ${signerName} <${signerEmail}>. Observed status: ${observedStatus ?? "unknown"}. test_mode=${testMode}. Recipients: ${recipients.map(r => `${r.placeholder_name}:${r.email}`).join(", ")}`,
      user_id: user.id,
    });

    // Detailed diagnostic in the server log — critical when things silently
    // fail. Search Vercel logs for [signwell/send] to see this.
    console.log("[signwell/send]", JSON.stringify({
      template_id: template.id,
      template_name: template.name,
      test_mode: testMode,
      recipients: recipients.map(r => ({ ph: r.placeholder_name, email: r.email })),
      template_fields_count: template_fields.length,
      doc_id: doc.id,
      observed_status: observedStatus,
    }));

    if (!dispatchOK) {
      return NextResponse.json({
        error: `SignWell created the document but its status is "${observedStatus}" instead of "sent". No email was dispatched. Check the SignWell dashboard for the doc and confirm the template's placeholders + fields are correctly configured.`,
        document_id: doc.id,
        observed_status: observedStatus,
        test_mode: testMode,
        recipients_sent: recipients.map(r => ({ placeholder: r.placeholder_name, email: r.email })),
      }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      document_id: doc.id,
      template: template.name,
      observed_status: observedStatus ?? "assumed_sent",
      test_mode: testMode,
      recipients: recipients.map(r => ({ placeholder: r.placeholder_name, email: r.email })),
    });
  } catch (e) {
    const status = e instanceof SignWellError ? e.status : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status });
  }
}
