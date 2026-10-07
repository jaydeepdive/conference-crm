/**
 * POST /api/platform/invites/send
 *
 * Body: { profile_id?: string } or { profile_ids?: string[] }
 *
 * Super-admin-only operator-gated send. For each attendee_profile:
 *   - If user_id is already set (previously accepted), skip.
 *   - Otherwise ensure invite_token is set (generate if missing).
 *   - Send the invite email via the caller's Gmail token.
 *   - On success, stamp invite_sent_at.
 *
 * This is the ONLY code path that sends attendee invite emails. No other
 * code path (attendee creation, resend-public, etc.) sends automatically.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getValidGmailAccessToken, sendGmail } from "@/lib/gmail";
import { generateInviteToken } from "@/lib/platform";

export const runtime = "nodejs";

interface Body { profile_id?: string; profile_ids?: string[] }

interface SendResult {
  profile_id: string;
  email: string | null;
  sent: boolean;
  skipped?: string;
  error?: string;
  accept_url?: string;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: me } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).maybeSingle();
  if (!me?.is_super_admin) return NextResponse.json({ error: "Super admin only" }, { status: 403 });

  let body: Body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Body must be JSON" }, { status: 400 }); }

  const ids = body.profile_ids ?? (body.profile_id ? [body.profile_id] : []);
  if (ids.length === 0) return NextResponse.json({ error: "No profile_ids provided" }, { status: 400 });

  const accessToken = await getValidGmailAccessToken(user.id);

  const svc = createServiceClient();
  const { data: profiles, error: pErr } = await svc.from("attendee_profiles")
    .select("*").in("id", ids);
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const origin = new URL(request.url).origin;
  const results: SendResult[] = [];

  for (const p of profiles ?? []) {
    const res: SendResult = { profile_id: p.id, email: p.email, sent: false };

    if (p.user_id) {
      res.skipped = "already-accepted";
      results.push(res);
      continue;
    }

    let token = p.invite_token as string | null;
    if (!token) {
      token = generateInviteToken();
      await svc.from("attendee_profiles").update({ invite_token: token }).eq("id", p.id);
    }

    const { data: conf } = await svc.from("conferences")
      .select("slug, name").eq("id", p.conference_id).maybeSingle();
    const confSlug = conf?.slug ?? "";
    const confName = conf?.name ?? "the conference";
    const acceptUrl = `${origin}/conferences/${confSlug}/platform/accept?token=${encodeURIComponent(token)}`;
    res.accept_url = acceptUrl;

    if (!accessToken) {
      res.error = "No Gmail token on your account. Paste the link manually from the row.";
      results.push(res);
      continue;
    }

    const salutation = p.full_name ? `Hi ${p.full_name.split(" ")[0]},` : "Hello,";
    const bodyHtml = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#111;line-height:1.55;">
        <p>${salutation}</p>
        <p>You&rsquo;re invited to the attendee app for <strong>${escapeHtml(confName)}</strong>.
        Set your password and we&rsquo;ll take you straight into the schedule.</p>
        <p><a href="${acceptUrl}" style="display:inline-block;background:#111;color:#fff;padding:12px 20px;text-decoration:none;border-radius:6px;font-weight:600;">Set my password</a></p>
        <p style="font-size:12px;color:#666;">Or paste this URL into your browser:<br>${acceptUrl}</p>
      </div>`;
    try {
      await sendGmail({
        accessToken,
        to: [{ email: p.email, name: p.full_name ?? undefined }],
        subject: `Your invite — ${confName}`,
        bodyHtml,
      });
      await svc.from("attendee_profiles").update({ invite_sent_at: new Date().toISOString() }).eq("id", p.id);
      res.sent = true;
    } catch (e) {
      res.error = e instanceof Error ? e.message : "Gmail send failed";
    }
    results.push(res);
  }

  const sentCount = results.filter(r => r.sent).length;
  return NextResponse.json({ results, sent_count: sentCount, total: results.length });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  }[c] ?? c));
}
