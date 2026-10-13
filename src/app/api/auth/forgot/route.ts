/**
 * POST /api/auth/forgot  { email }
 * Staff CRM password reset. Sends a branded email via Resend (with a
 * plain-text part) containing a one-time /auth/confirm link. Only sends to
 * existing staff profiles; throttled to 1 per 2 minutes per address.
 * Always returns 200 (no account-existence leak).
 */
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { brandedEmail, sendResend } from "@/lib/resend";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { email?: string };
  const email = (body.email ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) return NextResponse.json({ ok: true });

  const svc = createServiceClient();
  const { data: prof } = await svc.from("profiles").select("id, full_name, email").ilike("email", email).maybeSingle();
  if (!prof) return NextResponse.json({ ok: true });

  const key = `staff-reset:${email}`;
  const { data: th } = await svc.from("email_throttle").select("last_sent_at").eq("key", key).maybeSingle();
  if (th && Date.now() - new Date(th.last_sent_at).getTime() < 120_000) return NextResponse.json({ ok: true });

  const { data: link, error } = await svc.auth.admin.generateLink({ type: "recovery", email });
  const hashed = link?.properties?.hashed_token;
  if (error || !hashed) return NextResponse.json({ ok: true });

  const origin = new URL(request.url).origin;
  const url = `${origin}/auth/confirm?token_hash=${encodeURIComponent(hashed)}&type=recovery&next=%2Freset-password`;
  const first = prof.full_name ? String(prof.full_name).split(" ")[0] : "";
  const { html, text } = brandedEmail({
    heading: "Reset your CRM password",
    greeting: first ? `Hi ${first},` : "Hello,",
    paragraphs: ["Someone (hopefully you) asked to reset the password for your conference CRM account. Tap below to choose a new one."],
    buttonLabel: "Choose a new password",
    url,
    preheader: "Your password reset link (expires in 1 hour)",
    footnote: "This link works once and expires in about an hour. If you didn&rsquo;t ask for it, you can ignore this email.",
  });
  try {
    await sendResend({ to: email, subject: "Reset your CRM password", html, text });
    await svc.from("email_throttle").upsert({ key, last_sent_at: new Date().toISOString() });
  } catch (e) {
    console.error("[forgot] send failed", e);
  }
  return NextResponse.json({ ok: true });
}
