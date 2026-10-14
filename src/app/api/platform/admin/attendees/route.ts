/**
 * POST /api/platform/admin/attendees — super admin manages the people
 * (attendee logins) attached to a company or investor. NEVER sends email.
 *
 *  { action: "create", conference_id, lead_type, lead_id, email, full_name? }
 *  { action: "update", id, email?, full_name? }
 *  { action: "remove", id }
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { generateInviteToken } from "@/lib/platform";

export const runtime = "nodejs";

interface Body {
  action?: "create" | "update" | "remove";
  id?: string;
  conference_id?: string;
  lead_type?: "company" | "investor";
  lead_id?: string;
  email?: string;
  full_name?: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await sb.from("profiles").select("is_super_admin").eq("id", user.id).maybeSingle();
  if (!me?.is_super_admin) return NextResponse.json({ error: "Super admin only" }, { status: 403 });

  let body: Body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Body must be JSON" }, { status: 400 }); }
  const svc = createServiceClient();
  const email = (body.email ?? "").trim().toLowerCase();
  const fullName = body.full_name === undefined ? undefined : (body.full_name ?? "").trim() || null;

  if (body.action === "create") {
    if (!body.conference_id || !body.lead_id || !["company", "investor"].includes(body.lead_type ?? ""))
      return NextResponse.json({ error: "Pick a company or investor." }, { status: 400 });
    if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
    if (body.lead_type === "investor") {
      const { count } = await svc.from("attendee_profiles").select("id", { count: "exact", head: true })
        .eq("lead_type", "investor").eq("lead_id", body.lead_id);
      if ((count ?? 0) > 0) return NextResponse.json({ error: "Investors are one person each — only companies can have extra people." }, { status: 400 });
    }
    const clash = await emailInUse(svc, body.conference_id, email);
    if (clash) return NextResponse.json({ error: clash }, { status: 409 });
    const { data, error } = await svc.from("attendee_profiles").insert({
      conference_id: body.conference_id, lead_type: body.lead_type, lead_id: body.lead_id,
      email, full_name: fullName ?? null, invite_token: generateInviteToken(), invite_sent_at: null,
    }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: data.id });
  }

  if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const { data: row } = await svc.from("attendee_profiles").select("id, user_id, email, conference_id").eq("id", body.id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Attendee not found" }, { status: 404 });

  if (body.action === "update") {
    const patch: Record<string, unknown> = {};
    if (fullName !== undefined) patch.full_name = fullName;
    if (body.email !== undefined && email !== String(row.email).toLowerCase()) {
      if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
      const clash = await emailInUse(svc, row.conference_id as string, email);
      if (clash) return NextResponse.json({ error: clash }, { status: 409 });
      if (row.user_id) return NextResponse.json({
        error: "This person has already signed in with their email. Remove them and add the new email instead.",
      }, { status: 409 });
      patch.email = email;
      patch.invite_token = generateInviteToken(); // old invite link stops working
      patch.invite_sent_at = null;
    }
    if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true });
    const { error } = await svc.from("attendee_profiles").update(patch).eq("id", row.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "remove") {
    // Removes their portal access for this company/investor. Their meetings
    // belong to the company/investor, so nothing else is lost.
    const { error } = await svc.from("attendee_profiles").delete().eq("id", row.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

/** One email = one attendee per conference (DB unique index). Returns a
 *  human message naming who already has it, or null if free. */
async function emailInUse(svc: ReturnType<typeof createServiceClient>, conferenceId: string, email: string): Promise<string | null> {
  const { data: dup } = await svc.from("attendee_profiles").select("lead_type, lead_id")
    .eq("conference_id", conferenceId).ilike("email", email).maybeSingle();
  if (!dup) return null;
  const table = dup.lead_type === "company" ? "companies" : "investors";
  const { data: lead } = await svc.from(table).select(dup.lead_type === "company" ? "name" : "firm_name").eq("id", dup.lead_id).maybeSingle();
  const l = lead as { name?: string; firm_name?: string } | null;
  const who = l?.name ?? l?.firm_name ?? "another company/investor";
  return `${email} is already an attendee for ${who}. Each email can only be used once.`;
}
