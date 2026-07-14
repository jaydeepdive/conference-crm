/**
 * POST /api/portal/invites/send
 *
 * Body: { attendee_profile_id, resend_token?: boolean }
 *
 * Behavior:
 *   - Loads the attendee_profiles row (writable by conference_admin+ via RLS).
 *   - If `resend_token` is true (default false) OR the row already has a null
 *     invite_token because it was accepted, generate a fresh token and reset
 *     accepted_at/user_id so the invite is valid again.
 *   - Try to send an invite email via Gmail using the caller's stored token.
 *     If Gmail isn't configured for this user, return the fresh accept URL for
 *     manual copy/paste.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidGmailAccessToken, sendGmail } from "@/lib/gmail";
import { generateInviteToken } from "@/lib/portal";

export const runtime = "nodejs";

interface Body {
  attendee_profile_id?: string;
  resend_token?: boolean;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: Body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Body must be JSON" }, { status: 400 }); }
  if (!body.attendee_profile_id) return NextResponse.json({ error: "Missing attendee_profile_id" }, { status: 400 });

  const { data: attendee, error: aErr } = await supabase.from("attendee_profiles")
    .select("*").eq("id", body.attendee_profile_id).maybeSingle();
  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });
  if (!attendee) return NextResponse.json({ error: "Attendee not found" }, { status: 404 });

  let token: string | null = attendee.invite_token;
  const needFresh = body.resend_token || !token || attendee.accepted_at;
  if (needFresh) {
    token = generateInviteToken();
    const { error: updErr } = await supabase.from("attendee_profiles").update({
      invite_token: token,
      invite_sent_at: new Date().toISOString(),
      accepted_at: null,
      user_id: null,
    }).eq("id", attendee.id);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
  } else {
    // Existing token — bump invite_sent_at.
    await supabase.from("attendee_profiles").update({ invite_sent_at: new Date().toISOString() }).eq("id", attendee.id);
  }

  const origin = new URL(request.url).origin;
  const acceptUrl = `${origin}/portal/accept?token=${encodeURIComponent(token!)}`;

  const { data: conference } = await supabase.from("conferences")
    .select("name").eq("id", attendee.conference_id).maybeSingle();
  const confName = conference?.name ?? "your conference";

  // Try to send via Gmail if the caller has valid creds.
  const accessToken = await getValidGmailAccessToken(user.id);
  if (!accessToken) {
    return NextResponse.json({
      sent: false, accept_url: acceptUrl,
      reason: "No Gmail token for this account. Copy the accept URL and send it manually.",
    });
  }

  const salutation = attendee.full_name ? `Hi ${attendee.full_name.split(" ")[0]},` : "Hello,";
  const bodyHtml = `
    <div style="font-family: Georgia, serif; color: #0E0E0E; line-height: 1.55;">
      <p>${salutation}</p>
      <p>You've been invited to the attendee portal for <strong>${escapeHtml(confName)}</strong>.
      Set your password with the link below to access your profile, meetings, and invoices.</p>
      <p><a href="${acceptUrl}" style="display:inline-block;background:#C8102E;color:#fff;padding:12px 20px;text-decoration:none;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;font-size:12px;">Accept invite</a></p>
      <p style="font-size:12px;color:#6B6B6B;">Or paste this URL into your browser:<br>${acceptUrl}</p>
      <p>See you at ${escapeHtml(confName)}.</p>
    </div>`;
  try {
    const messageId = await sendGmail({
      accessToken,
      to: [{ email: attendee.email, name: attendee.full_name ?? undefined }],
      subject: `Your invite to ${confName}`,
      bodyHtml,
    });
    return NextResponse.json({ sent: true, accept_url: acceptUrl, gmail_message_id: messageId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gmail send failed";
    return NextResponse.json({ sent: false, accept_url: acceptUrl, reason: message });
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  }[c] ?? c));
}
