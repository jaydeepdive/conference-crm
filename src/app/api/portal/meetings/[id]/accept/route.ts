/**
 * POST /api/portal/meetings/[id]/accept — accept the current proposed_time.
 * Only allowed when the OTHER side made the most recent proposal.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadMeetingCaller } from "@/lib/portal-api";

export const runtime = "nodejs";

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const loaded = await loadMeetingCaller(id);
  if (loaded instanceof NextResponse) return loaded;
  const { meeting, mySide, attendee } = loaded;

  if (meeting.status !== "proposed" && meeting.status !== "countered") {
    return NextResponse.json({ error: `Meeting is ${meeting.status}` }, { status: 409 });
  }
  if (meeting.proposed_by === mySide) {
    return NextResponse.json({ error: "You proposed this time — wait for the other side to respond." }, { status: 409 });
  }
  if (!meeting.proposed_time) {
    return NextResponse.json({ error: "No proposed time on this meeting" }, { status: 409 });
  }

  const supabase = await createClient();
  const { error } = await supabase.from("meetings").update({
    status: "accepted",
    scheduled_time: meeting.proposed_time,
  }).eq("id", meeting.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("meeting_events").insert({
    meeting_id: meeting.id,
    actor_profile_id: attendee.id,
    actor_side: mySide,
    kind: "accept",
    proposed_time: meeting.proposed_time,
  });

  return NextResponse.json({ ok: true });
}
