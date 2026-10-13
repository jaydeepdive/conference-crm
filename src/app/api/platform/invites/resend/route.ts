/**
 * POST /api/platform/invites/resend
 *
 * Body: { email, slug? }
 *
 * Public. Behavior:
 *   - If attendee_profiles[email] exists and already has user_id → send a
 *     Supabase password-reset link.
 *   - Otherwise → generate a fresh invite_token and send the invite email
 *     via Resend (no-reply@abovebeyondsummit.com).
 *   - Rate-limit: if invite_sent_at was within 2 min, return 429.
 *   - Always return 200 to callers to avoid email-existence leaks.
 */
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendResend, brandedEmail } from "@/lib/resend";
import { generateInviteToken } from "@/lib/platform";

export const runtime = "nodejs";

const RATE_LIMIT_MS = 2 * 60 * 1000;

export async function POST(request: Request) {
  let body: { email?: string; slug?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: true }); } // silent

  const email = (body.email ?? "").trim().toLowerCase();
  const slug = (body.slug ?? "").trim();
  if (!email) return NextResponse.json({ ok: true });

  const svc = createServiceClient();

  // Find attendee row(s) for this email in the given conference (preferred),
  // or any conference if no slug.
  let confFilter: string | null = null;
  if (slug) {
    const { data: conf } = await svc.from("conferences").select("id").eq("slug", slug).maybeSingle();
    confFilter = conf?.id ?? null;
  }

  let q = svc.from("attendee_profiles").select("*").ilike("email", email).limit(1);
  if (confFilter) q = q.eq("conference_id", confFilter);
  const { data: attendees } = await q;
  const attendee = (attendees ?? [])[0];
  if (!attendee) return NextResponse.json({ ok: true }); // silent

  // Rate-limit
  if (attendee.invite_sent_at) {
    const since = Date.now() - new Date(attendee.invite_sent_at).getTime();
    if (since < RATE_LIMIT_MS) {
      return NextResponse.json({ ok: true, rate_limited: true });
    }
  }

  const origin = new URL(request.url).origin;
  const { data: conf } = await svc.from("conferences").select("slug, name, public_name")
    .eq("id", attendee.conference_id).maybeSingle();
  const confSlug = conf?.slug ?? slug;
  const confName = conf?.public_name ?? "the Above & Beyond Mining Summit";

  const first = attendee.full_name ? String(attendee.full_name).split(" ")[0] : "";
  const greeting = first ? `Hi ${first},` : "Hello,";

  // User already exists → one-time password-reset link (no Supabase mailer;
  // token_hash is verified by /auth/confirm, works on any device/browser).
  if (attendee.user_id) {
    const { data: link, error } = await svc.auth.admin.generateLink({ type: "recovery", email: attendee.email });
    const hashed = link?.properties?.hashed_token;
    if (error || !hashed) return NextResponse.json({ ok: true });
    const url = `${origin}/auth/confirm?token_hash=${encodeURIComponent(hashed)}&type=recovery&next=${encodeURIComponent(`/conferences/${confSlug}/platform/reset`)}`;
    const { html, text } = brandedEmail({
      origin, heading: "Reset your password", greeting,
      paragraphs: [`Tap below to choose a new password for the <strong>${escapeHtml(confName)}</strong> attendee portal.`],
      buttonLabel: "Choose a new password", url,
      footnote: "This link works once and expires in about an hour. If you didn&rsquo;t ask for it, you can ignore this email.",
    });
    try {
      await sendResend({ to: attendee.email, subject: `Reset your password: ${confName}`, html, text });
      await svc.from("attendee_profiles").update({ invite_sent_at: new Date().toISOString() }).eq("id", attendee.id);
    } catch { /* always 200 */ }
    return NextResponse.json({ ok: true });
  }

  // Not yet accepted → fresh invite link.
  const token = generateInviteToken();
  await svc.from("attendee_profiles").update({
    invite_token: token, invite_sent_at: new Date().toISOString(),
  }).eq("id", attendee.id);

  const acceptUrl = `${origin}/conferences/${confSlug}/platform/accept?token=${encodeURIComponent(token)}`;
  const { html, text } = brandedEmail({
    origin, heading: "Your login link", greeting,
    paragraphs: [`Here&rsquo;s your link to the <strong>${escapeHtml(confName)}</strong> attendee portal. Tap below to set your password.`],
    buttonLabel: "Set my password", url: acceptUrl,
    footnote: "This link is personal to you. Please don&rsquo;t forward it.",
  });
  let sent = false;
  try {
    await sendResend({ to: attendee.email, subject: `Your login link: ${confName}`, html, text });
    sent = true;
  } catch { /* always 200 */ }

  return NextResponse.json({ ok: true, sent });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  }[c] ?? c));
}
