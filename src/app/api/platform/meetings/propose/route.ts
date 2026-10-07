/**
 * POST /api/platform/meetings/propose
 *
 * Body: { slug?, other_lead_type, other_lead_id, proposed_time, notes? }
 *
 * Creates a new meeting (or re-opens a declined/cancelled one between the
 * same pair). The DB unique index on (conference, company, investor) means
 * we must UPDATE the previous row rather than INSERT when one already
 * exists in a terminal state.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { AttendeeSide } from "@/lib/types";

export const runtime = "nodejs";

interface Body {
  slug?: string;
  other_lead_type?: AttendeeSide;
  other_lead_id?: string;
  proposed_time?: string;
  notes?: string;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: Body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Body must be JSON" }, { status: 400 }); }

  if (!body.other_lead_type || !["company", "investor"].includes(body.other_lead_type))
    return NextResponse.json({ error: "other_lead_type must be 'company' or 'investor'" }, { status: 400 });
  if (!body.other_lead_id) return NextResponse.json({ error: "Missing other_lead_id" }, { status: 400 });
  if (!body.proposed_time) return NextResponse.json({ error: "Missing proposed_time" }, { status: 400 });
  const proposedIso = new Date(body.proposed_time);
  if (isNaN(proposedIso.getTime())) return NextResponse.json({ error: "Invalid proposed_time" }, { status: 400 });

  // Resolve my attendee_profile. If slug is passed, scope to that conference;
  // otherwise find the single attendee row for this user.
  let attendeeQuery = supabase.from("attendee_profiles")
    .select("id, lead_type, lead_id, conference_id")
    .eq("user_id", user.id);
  if (body.slug) {
    const { data: conf } = await supabase.from("conferences").select("id").eq("slug", body.slug).maybeSingle();
    if (!conf) return NextResponse.json({ error: "Unknown conference" }, { status: 404 });
    attendeeQuery = attendeeQuery.eq("conference_id", conf.id);
  }
  const { data: attendees } = await attendeeQuery.limit(1);
  const attendee = (attendees ?? [])[0];
  if (!attendee) return NextResponse.json({ error: "Not an attendee of this conference" }, { status: 403 });
  const mySide = attendee.lead_type as AttendeeSide;

  if (mySide === body.other_lead_type) {
    return NextResponse.json({ error: "Meetings are between a company and an investor." }, { status: 400 });
  }

  const companyId = mySide === "company" ? attendee.lead_id : body.other_lead_id;
  const investorId = mySide === "investor" ? attendee.lead_id : body.other_lead_id;

  // Existing row? (unique index enforces one per pair)
  const { data: existing } = await supabase.from("meetings").select("id, status")
    .eq("conference_id", attendee.conference_id)
    .eq("company_id", companyId)
    .eq("investor_id", investorId)
    .maybeSingle();

  let meetingId: string;
  if (existing) {
    if (existing.status !== "declined" && existing.status !== "cancelled") {
      return NextResponse.json({ error: "A meeting with this attendee is already in progress." }, { status: 409 });
    }
    // Reset to a fresh proposal.
    const { error } = await supabase.from("meetings").update({
      status: "proposed",
      proposed_time: proposedIso.toISOString(),
      proposed_by: mySide,
      scheduled_time: null,
      notes: body.notes ?? null,
    }).eq("id", existing.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    meetingId = existing.id;
  } else {
    const { data: inserted, error } = await supabase.from("meetings").insert({
      conference_id: attendee.conference_id,
      company_id: companyId,
      investor_id: investorId,
      status: "proposed",
      proposed_time: proposedIso.toISOString(),
      proposed_by: mySide,
      notes: body.notes ?? null,
      created_by: attendee.id,
    }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    meetingId = inserted.id;
  }

  await supabase.from("meeting_events").insert({
    meeting_id: meetingId,
    actor_profile_id: attendee.id,
    actor_side: mySide,
    kind: "propose",
    proposed_time: proposedIso.toISOString(),
    body: body.notes ?? null,
  });

  return NextResponse.json({ meeting_id: meetingId });
}
