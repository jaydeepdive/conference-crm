/**
 * POST /api/platform/invites/send
 *
 * Body: { profile_id?: string } or { profile_ids?: string[] }
 *
 * Super-admin-only operator-gated send. For each attendee_profile:
 *   - If user_id is already set (previously accepted), skip.
 *   - Otherwise ensure invite_token is set (generate if missing).
 *   - Send the invite email via Resend from no-reply@abovebeyondsummit.com
 *     (Reply-To = the admin who pressed Send).
 *   - On success, stamp invite_sent_at.
 *
 * This is the ONLY code path that sends attendee invite emails. No other
 * code path (attendee creation, resend-public, etc.) sends automatically.
 */
import { NextResponse } from "next/server";
import { PORTAL_ORIGIN } from "@/lib/portalDomain";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendResend, brandedEmail, resendConfigured } from "@/lib/resend";
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

  if (!(await resendConfigured())) {
    return NextResponse.json({ error: "Email sending (Resend) is not configured" }, { status: 500 });
  }

  const svc = createServiceClient();
  const { data: profiles, error: pErr } = await svc.from("attendee_profiles")
    .select("*").in("id", ids);
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  // Attendee links always point at the Above & Beyond domain.
  const origin = PORTAL_ORIGIN;
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
      .select("slug, name, public_name").eq("id", p.conference_id).maybeSingle();
    const confSlug = conf?.slug ?? "";
    const confName = conf?.public_name ?? "the Above & Beyond Mining Summit";
    const acceptUrl = `${origin}/conferences/${confSlug}/platform/accept?token=${encodeURIComponent(token)}`;
    res.accept_url = acceptUrl;

    const first = p.full_name ? String(p.full_name).split(" ")[0] : "";
    const { html, text } = brandedEmail({
      origin,
      heading: "Your 1-on-1 meeting portal",
      greeting: first ? `Hi ${first},` : "Hello,",
      paragraphs: [
        `You&rsquo;re invited to the attendee portal for <strong>${escapeHtml(confName)}</strong> in Scottsdale, Arizona.`,
        "Set your password to view the attendee directory, request 1-on-1 meetings for November 24, and manage your schedule.",
      ],
      buttonLabel: "Set my password",
      url: acceptUrl,
      footnote: "This link is personal to you. Please don&rsquo;t forward it.",
    });
    try {
      await sendResend({ to: p.email, subject: `Your invite: ${confName}`, html, text, replyTo: user.email ?? null });
      await svc.from("attendee_profiles").update({ invite_sent_at: new Date().toISOString() }).eq("id", p.id);
      res.sent = true;
    } catch (e) {
      res.error = e instanceof Error ? e.message : "Email send failed";
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
