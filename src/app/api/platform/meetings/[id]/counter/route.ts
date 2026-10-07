/**
 * POST /api/platform/meetings/[id]/counter — propose a different time.
 * Only the side that DIDN'T move last may counter.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadMeetingCaller } from "@/lib/portal-api";

export const runtime = "nodejs";

interface Body { proposed_time?: string; notes?: string }

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const loaded = await loadMeetingCaller(id);
  if (loaded instanceof NextResponse) return loaded;
  const { meeting, mySide, attendee } = loaded;

  let body: Body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Body must be JSON" }, { status: 400 }); }
  if (!body.proposed_time) return NextResponse.json({ error: "Missing proposed_time" }, { status: 400 });
  const t = new Date(body.proposed_time);
  if (isNaN(t.getTime())) return NextResponse.json({ error: "Invalid proposed_time" }, { status: 400 });

  if (meeting.status !== "proposed" && meeting.status !== "countered")
    return NextResponse.json({ error: `Meeting is ${meeting.status}` }, { status: 409 });
  if (meeting.proposed_by === mySide)
    return NextResponse.json({ error: "You already have an open proposal." }, { status: 409 });

  const supabase = await createClient();

  // Block enforcement: refuse if the pair is on either side's blocklist,
  // or if either side has flagged the counter slot unavailable.
  const otherSide = mySide === "company" ? "investor" : "company";
  const myLead = mySide === "company" ? meeting.company_id : meeting.investor_id;
  const otherLead = otherSide === "company" ? meeting.company_id : meeting.investor_id;
  const { data: bl } = await supabase.from("meeting_blocklist").select("id")
    .eq("conference_id", meeting.conference_id)
    .or(
      `and(from_lead_type.eq.${mySide},from_lead_id.eq.${myLead},to_lead_type.eq.${otherSide},to_lead_id.eq.${otherLead}),` +
      `and(from_lead_type.eq.${otherSide},from_lead_id.eq.${otherLead},to_lead_type.eq.${mySide},to_lead_id.eq.${myLead})`,
    )
    .limit(1);
  if (bl && bl.length > 0) {
    return NextResponse.json(
      { error: "You and this attendee are blocked from being paired." },
      { status: 409 },
    );
  }
  const { data: slotBlocks } = await supabase.from("attendee_blocked_slots").select("id")
    .eq("conference_id", meeting.conference_id)
    .eq("slot_time", t.toISOString())
    .or(
      `and(lead_type.eq.${mySide},lead_id.eq.${myLead}),` +
      `and(lead_type.eq.${otherSide},lead_id.eq.${otherLead})`,
    )
    .limit(1);
  if (slotBlocks && slotBlocks.length > 0) {
    return NextResponse.json({ error: "That slot is unavailable." }, { status: 409 });
  }

  const { error } = await supabase.from("meetings").update({
    status: "countered",
    proposed_time: t.toISOString(),
    proposed_by: mySide,
    scheduled_time: null,
  }).eq("id", meeting.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("meeting_events").insert({
    meeting_id: meeting.id, actor_profile_id: attendee.id, actor_side: mySide,
    kind: "counter", proposed_time: t.toISOString(), body: body.notes ?? null,
  });
  return NextResponse.json({ ok: true });
}
