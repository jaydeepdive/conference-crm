/**
 * POST /api/platform/admin/broadcast — super admin emails registered portal
 * attendees. Only ever runs when the admin presses Send.
 *  { slug, audience: "company"|"investor"|"all", subject, body, include_button, test?: boolean, preview?: boolean }
 *  preview → just returns the recipient count. test → sends only to the admin.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { brandedEmail, sendResendBatch } from "@/lib/resend";
import { PORTAL_ORIGIN } from "@/lib/portalDomain";
import { sanitizeEmailHtml, htmlToText } from "@/lib/emailHtml";

export const runtime = "nodejs";
export const maxDuration = 60;

function esc(s: string) {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c] ?? c));
}

export async function POST(request: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await sb.from("profiles").select("is_super_admin, full_name, email").eq("id", user.id).maybeSingle();
  if (!me?.is_super_admin) return NextResponse.json({ error: "Super admin only" }, { status: 403 });

  const b = await request.json().catch(() => ({})) as {
    slug?: string; audience?: string; subject?: string; body?: string; body_html?: string; include_button?: boolean; test?: boolean; preview?: boolean;
  };
  const audience = b.audience === "company" || b.audience === "investor" ? b.audience : "all";
  const svc = createServiceClient();
  const { data: conf } = await svc.from("conferences").select("id, slug, public_name").eq("slug", b.slug ?? "").maybeSingle();
  if (!conf) return NextResponse.json({ error: "Unknown conference" }, { status: 404 });

  let q = svc.from("attendee_profiles").select("email, full_name, lead_type").eq("conference_id", conf.id).not("email", "is", null);
  if (audience !== "all") q = q.eq("lead_type", audience);
  const { data: people } = await q;
  const seen = new Set<string>();
  const recipients = (people ?? []).filter(p => {
    const e = String(p.email).toLowerCase();
    if (seen.has(e)) return false; seen.add(e); return true;
  });
  if (b.preview) return NextResponse.json({ ok: true, count: recipients.length });

  const subject = (b.subject ?? "").trim();
  const bodyHtml = b.body_html ? sanitizeEmailHtml(b.body_html) : "";
  const body = bodyHtml ? htmlToText(bodyHtml) : (b.body ?? "").trim();
  if (!subject || !body) return NextResponse.json({ error: "Subject and message are required." }, { status: 400 });

  const paragraphs = bodyHtml ? [] : body.split(/\n{2,}/).map(p => esc(p).replace(/\n/g, "<br>"));
  const url = `${PORTAL_ORIGIN}/conferences/${conf.slug}/platform`;
  const build = (name: string | null) => {
    const first = name ? String(name).split(" ")[0] : "";
    const { html, text } = brandedEmail({
      heading: subject, greeting: first ? `Hi ${first},` : "Hello,", paragraphs,
      bodyHtml: bodyHtml || undefined, bodyText: bodyHtml ? body : undefined,
      buttonLabel: b.include_button === false ? "" : "Open the attendee portal", url,
      preheader: body.slice(0, 100),
    });
    return { html, text };
  };

  const list = b.test
    ? [{ email: me.email as string, full_name: (me.full_name as string | null) ?? null }]
    : recipients.map(r => ({ email: r.email as string, full_name: (r.full_name as string | null) ?? null }));
  if (list.length === 0) return NextResponse.json({ error: "No recipients with an email." }, { status: 400 });

  const items = list.map(r => { const { html, text } = build(r.full_name); return { to: r.email, subject: b.test ? `[TEST] ${subject}` : subject, html, text, replyTo: me.email as string }; });
  const { sent, errors } = await sendResendBatch(items);
  if (errors.length && sent === 0) return NextResponse.json({ error: errors.join("; ") }, { status: 502 });
  return NextResponse.json({ ok: true, sent, total: list.length, errors });
}
