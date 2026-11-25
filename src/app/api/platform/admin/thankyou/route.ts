/**
 * POST /api/platform/admin/thankyou — super admin sends the post-event
 * thank-you emails. Only ever runs when the admin presses a button.
 *  { slug, side: "company"|"investor", action: "test", email? }  → one sample to the admin
 *  { slug, side, action: "send" }                                → everyone on that side not yet sent
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendResendBatch } from "@/lib/resend";
import { buildThankYous, renderThankYou } from "@/lib/thankyou";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await sb.from("profiles").select("is_super_admin, email").eq("id", user.id).maybeSingle();
  if (!me?.is_super_admin) return NextResponse.json({ error: "Super admin only" }, { status: 403 });
  const b = await request.json().catch(() => ({})) as { slug?: string; side?: string; action?: string; email?: string };
  const side = b.side === "investor" ? "investor" : "company";
  const svc = createServiceClient();
  const { data: conf } = await svc.from("conferences").select("id").eq("slug", b.slug ?? "").maybeSingle();
  if (!conf) return NextResponse.json({ error: "Unknown conference" }, { status: 404 });

  const all = (await buildThankYous(svc, conf.id as string)).filter(r => r.side === side);
  const replyTo = me.email as string;

  if (b.action === "test") {
    const r = all.find(x => !b.email || x.email.toLowerCase() === b.email.toLowerCase()) ?? all[0];
    if (!r) return NextResponse.json({ error: "Nobody to preview." }, { status: 400 });
    const o = renderThankYou(r);
    const { sent, errors } = await sendResendBatch([{ to: replyTo, subject: `[TEST] ${o.subject}`, html: o.html, text: o.text, replyTo }]);
    if (!sent) return NextResponse.json({ error: errors.join("; ") || "Could not send." }, { status: 502 });
    return NextResponse.json({ ok: true, sent_to: replyTo, sample_for: r.email });
  }

  if (b.action === "send") {
    const { data: done } = await svc.from("thankyou_sends").select("email").eq("conference_id", conf.id).eq("lead_type", side);
    const already = new Set((done ?? []).map(d => String(d.email).toLowerCase()));
    const todo = all.filter(r => !already.has(r.email.toLowerCase()));
    if (todo.length === 0) return NextResponse.json({ ok: true, sent: 0, note: "Everyone on this list has already been sent theirs." });
    let sentTotal = 0; const errorsAll: string[] = [];
    for (const r of todo) {   // one at a time so each success is recorded exactly
      const o = renderThankYou(r);
      const { sent, errors } = await sendResendBatch([{ to: r.email, subject: o.subject, html: o.html, text: o.text, replyTo }]);
      if (sent) {
        sentTotal += 1;
        await svc.from("thankyou_sends").insert({ conference_id: conf.id, lead_type: side, lead_id: r.leadId, email: r.email.toLowerCase(), sent_by: user.id });
      } else errorsAll.push(`${r.email}: ${errors.join("; ")}`);
    }
    return NextResponse.json({ ok: errorsAll.length === 0, sent: sentTotal, total: todo.length, errors: errorsAll });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
