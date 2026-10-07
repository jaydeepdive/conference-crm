import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { Meeting } from "@/lib/types";

export const runtime = "nodejs";

/**
 * POST /api/admin/meetings/create
 *
 * Super-admin direct meeting creation. Upserts into `meetings` keyed on
 * (conference_id, company_id, investor_id) — the unique index means a prior
 * row for the same pair gets overwritten with the admin-supplied slot and
 * forced into `accepted`.
 *
 * Body: { conference_id? | slug?, company_id, investor_id, scheduled_time, location?, notes? }
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles").select("is_super_admin, full_name, email").eq("id", user.id).single();
  if (!profile?.is_super_admin) {
    return NextResponse.json({ error: "Super admin only" }, { status: 403 });
  }

  let body: {
    conference_id?: string; slug?: string;
    company_id?: string; investor_id?: string;
    scheduled_time?: string; location?: string | null; notes?: string | null;
  };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Body must be JSON" }, { status: 400 }); }

  const { company_id, investor_id, scheduled_time, location, notes } = body;
  if (!company_id || !investor_id || !scheduled_time) {
    return NextResponse.json({ error: "company_id, investor_id, scheduled_time required" }, { status: 400 });
  }

  const admin = createServiceClient();

  // Resolve conference id.
  let conferenceId = body.conference_id;
  if (!conferenceId && body.slug) {
    const { data: conf } = await admin.from("conferences").select("id").eq("slug", body.slug).maybeSingle();
    if (!conf) return NextResponse.json({ error: "Conference not found" }, { status: 404 });
    conferenceId = (conf as { id: string }).id;
  }
  if (!conferenceId) {
    return NextResponse.json({ error: "conference_id or slug required" }, { status: 400 });
  }

  // Verify both leads belong to this conference.
  const [{ data: co }, { data: inv }] = await Promise.all([
    admin.from("companies").select("id, conference_id").eq("id", company_id).maybeSingle(),
    admin.from("investors").select("id, conference_id").eq("id", investor_id).maybeSingle(),
  ]);
  if (!co || (co as { conference_id: string }).conference_id !== conferenceId) {
    return NextResponse.json({ error: "Company not in this conference" }, { status: 400 });
  }
  if (!inv || (inv as { conference_id: string }).conference_id !== conferenceId) {
    return NextResponse.json({ error: "Investor not in this conference" }, { status: 400 });
  }

  // Does a meeting already exist for this pair? (Unique index means at most one.)
  const { data: existing } = await admin.from("meetings").select("*")
    .eq("conference_id", conferenceId)
    .eq("company_id", company_id)
    .eq("investor_id", investor_id)
    .maybeSingle();

  let meetingId: string;
  if (existing) {
    const row = existing as Meeting;
    const { error: upErr } = await admin.from("meetings").update({
      scheduled_time,
      location: location === undefined ? row.location : location,
      notes: notes === undefined ? row.notes : notes,
      status: "accepted",
    }).eq("id", row.id);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    meetingId = row.id;
  } else {
    // meetings.proposed_by check constraint only allows 'company' | 'investor' —
    // use 'company' as a benign placeholder for admin-created rows.
    const { data: inserted, error: insErr } = await admin.from("meetings").insert({
      conference_id: conferenceId,
      company_id,
      investor_id,
      status: "accepted",
      proposed_by: "company",
      scheduled_time,
      location: location ?? null,
      notes: notes ?? null,
      created_by: null,
    }).select("id").single();
    if (insErr || !inserted) {
      return NextResponse.json({ error: insErr?.message ?? "insert failed" }, { status: 500 });
    }
    meetingId = (inserted as { id: string }).id;
  }

  await admin.from("meeting_events").insert({
    meeting_id: meetingId,
    actor_profile_id: null,
    actor_side: "admin",
    kind: "note",
    proposed_time: scheduled_time,
    body: `Created directly by admin (${profile.full_name ?? profile.email})`,
  });

  return NextResponse.json({ ok: true, meeting_id: meetingId });
}
