/**
 * POST /api/portal/meetings/propose
 *
 * Body: { slug, other_lead_type: 'company'|'investor', other_lead_id, proposed_time, notes? }
 *
 * Creates a new meeting between the caller's own lead and the specified other
 * lead. Enforces:
 *   - the caller has an attendee_profile in the conference
 *   - the other lead is on the OPPOSITE side (company↔investor pairing rule)
 *   - the (company_id, investor_id) pair doesn't already have a meeting (unique
 *     index in the DB will also catch this)
 * Also inserts the initial `propose` meeting_event.
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

  const slug = (body.slug ?? "").trim();
  if (!slug) return NextResponse.json({ error: "Missing conference slug" }, { status: 400 });
  if (!body.other_lead_type || !["company", "investor"].includes(body.other_lead_type))
    return NextResponse.json({ error: "other_lead_type must be 'company' or 'investor'" }, { status: 400 });
  if (!body.other_lead_id) return NextResponse.json({ error: "Missing other_lead_id" }, { status: 400 });
  if (!body.proposed_time) return NextResponse.json({ error: "Missing proposed_time" }, { status: 400 });
  const proposedIso = new Date(body.proposed_time);
  if (isNaN(proposedIso.getTime())) return NextResponse.json({ error: "Invalid proposed_time" }, { status: 400 });

  const { data: conf } = await supabase.from("conferences").select("id").eq("slug", slug).maybeSingle();
  if (!conf) return NextResponse.json({ error: "Unknown conference" }, { status: 404 });

  const { data: attendee } = await supabase.from("attendee_profiles")
    .select("id, lead_type, lead_id")
    .eq("user_id", user.id).eq("conference_id", conf.id).maybeSingle();
  if (!attendee) return NextResponse.json({ error: "Not an attendee of this conference" }, { status: 403 });
  const mySide = attendee.lead_type as AttendeeSide;

  if (mySide === body.other_lead_type) {
    return NextResponse.json({ error: "Meetings are between a company and an investor — you can't request one with your own side." }, { status: 400 });
  }

  const companyId = mySide === "company" ? attendee.lead_id : body.other_lead_id;
  const investorId = mySide === "investor" ? attendee.lead_id : body.other_lead_id;

  const { data: inserted, error: insertErr } = await supabase.from("meetings").insert({
    conference_id: conf.id,
    company_id: companyId,
    investor_id: investorId,
    status: "proposed",
    proposed_time: proposedIso.toISOString(),
    proposed_by: mySide,
    notes: body.notes ?? null,
    created_by: attendee.id,
  }).select("id").single();
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  await supabase.from("meeting_events").insert({
    meeting_id: inserted.id,
    actor_profile_id: attendee.id,
    actor_side: mySide,
    kind: "propose",
    proposed_time: proposedIso.toISOString(),
    body: body.notes ?? null,
  });

  return NextResponse.json({ meeting_id: inserted.id });
}
