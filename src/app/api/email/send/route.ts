import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidGmailAccessToken, sendGmail } from "@/lib/gmail";

export const runtime = "nodejs";
export const maxDuration = 60;

interface SendPayload {
  conference_id: string;
  kind: "invoice" | "reminder" | "welcome" | "marketing" | "registration" | "general" | "other";
  subject: string;
  body: string; // plain text
  body_html?: string;
  to: { email: string; name?: string; lead_type?: "company" | "investor"; lead_id?: string }[];
  cc?: { email: string; name?: string }[];
  bcc?: { email: string; name?: string }[];
  invoice_id?: string | null;
  template_id?: string | null;
  attachment?: { filename: string; mimeType: string; contentBase64: string };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const payload = (await request.json()) as SendPayload;
  if (!payload.to?.length || !payload.subject || !payload.body) {
    return NextResponse.json({ error: "to, subject, body required" }, { status: 400 });
  }

  const accessToken = await getValidGmailAccessToken(user.id);
  if (!accessToken) {
    return NextResponse.json({
      error: "Gmail not connected. Sign out and back in to re-grant Gmail send permission.",
    }, { status: 400 });
  }

  const html = payload.body_html ?? textToHtml(payload.body);

  try {
    const messageId = await sendGmail({
      accessToken,
      to: payload.to,
      cc: payload.cc, bcc: payload.bcc,
      subject: payload.subject,
      bodyText: payload.body,
      bodyHtml: html,
      attachment: payload.attachment,
    });

    // Audit log
    const { data: sentRow } = await supabase.from("sent_emails").insert({
      conference_id: payload.conference_id,
      sender_user_id: user.id,
      kind: payload.kind,
      recipients: payload.to,
      cc: payload.cc ?? [],
      bcc: payload.bcc ?? [],
      subject: payload.subject,
      body_snapshot: payload.body,
      invoice_id: payload.invoice_id ?? null,
      template_id: payload.template_id ?? null,
      has_pdf_attachment: !!payload.attachment,
      gmail_message_id: messageId,
    }).select().single();

    if (sentRow) {
      const recipientRows = payload.to
        .filter(r => r.lead_type && r.lead_id)
        .map(r => ({
          sent_email_id: sentRow.id,
          lead_type: r.lead_type, lead_id: r.lead_id,
          email: r.email, name: r.name ?? null,
        }));
      if (recipientRows.length) {
        await supabase.from("sent_email_recipients").insert(recipientRows);
      }
    }

    // Update invoice status if this was an invoice send
    if (payload.invoice_id && payload.kind === "invoice") {
      await supabase.from("invoices").update({
        status: "sent",
        sent_at: new Date().toISOString(),
        sent_by: user.id,
      }).eq("id", payload.invoice_id);
    }

    return NextResponse.json({ ok: true, gmail_message_id: messageId });
  } catch (e) {
    return NextResponse.json({
      error: e instanceof Error ? e.message : "Send failed",
    }, { status: 500 });
  }
}

function textToHtml(text: string): string {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<div style="font-family:Helvetica,Arial,sans-serif;color:#0E0E0E;line-height:1.5;white-space:pre-wrap">${esc}</div>`;
}
