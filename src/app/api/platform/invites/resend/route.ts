/**
 * POST /api/platform/invites/resend
 *
 * Body: { email, slug? }
 *
 * Public. Behavior:
 *   - If attendee_profiles[email] exists and already has user_id → send a
 *     Supabase password-reset link.
 *   - Otherwise → generate a fresh invite_token and send the invite email
 *     via Gmail (using whichever admin last sent for this conference —
 *     unavailable here, so we fall through to attempting the first staff
 *     user with a Gmail token).
 *   - Rate-limit: if invite_sent_at was within 2 min, return 429.
 *   - Always return 200 to callers to avoid email-existence leaks.
 */
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getValidGmailAccessToken, sendGmail } from "@/lib/gmail";
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
  const { data: conf } = await svc.from("conferences").select("slug, name")
    .eq("id", attendee.conference_id).maybeSingle();
  const confSlug = conf?.slug ?? slug;
  const confName = conf?.name ?? "the conference";

  // User already exists → password reset flow.
  if (attendee.user_id) {
    const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(`/conferences/${confSlug}/platform/reset`)}`;
    const { error } = await svc.auth.resetPasswordForEmail(attendee.email, { redirectTo });
    if (!error) {
      await svc.from("attendee_profiles").update({ invite_sent_at: new Date().toISOString() })
        .eq("id", attendee.id);
    }
    return NextResponse.json({ ok: true });
  }

  // Not yet accepted → fresh invite link.
  const token = generateInviteToken();
  await svc.from("attendee_profiles").update({
    invite_token: token, invite_sent_at: new Date().toISOString(),
  }).eq("id", attendee.id);

  const acceptUrl = `${origin}/conferences/${confSlug}/platform/accept?token=${encodeURIComponent(token)}`;

  // Try to send via Gmail using any staff user who has a valid token. We
  // pick the first available token holder — the operator can also just
  // use the admin UI from the staff CRM, which uses their own token.
  const { data: tokens } = await svc.from("gmail_tokens").select("profile_id").limit(5);
  let sent = false;
  for (const t of tokens ?? []) {
    const at = await getValidGmailAccessToken((t as { profile_id: string }).profile_id);
    if (!at) continue;
    try {
      const salutation = attendee.full_name ? `Hi ${attendee.full_name.split(" ")[0]},` : "Hello,";
      await sendGmail({
        accessToken: at,
        to: [{ email: attendee.email, name: attendee.full_name ?? undefined }],
        subject: `Your login link — ${confName}`,
        bodyHtml: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color:#111; line-height:1.55;">
            <p>${salutation}</p>
            <p>Here's your login link for <strong>${escapeHtml(confName)}</strong>.
            Tap the button to set your password:</p>
            <p><a href="${acceptUrl}" style="display:inline-block;background:#111;color:#fff;padding:12px 20px;text-decoration:none;border-radius:6px;font-weight:600;">Set my password</a></p>
            <p style="font-size:12px;color:#666;">Or paste this URL:<br>${acceptUrl}</p>
          </div>`,
      });
      sent = true;
      break;
    } catch {
      // Try next token holder.
    }
  }

  return NextResponse.json({ ok: true, sent });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  }[c] ?? c));
}
