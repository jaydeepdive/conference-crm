/**
 * POST /api/portal/meetings/[id]/counter
 * Body: { proposed_time, notes? }
 *
 * Only the side that DIDN'T make the last proposal may counter. Updates the
 * proposed_time, flips proposed_by to the caller's side, moves status to
 * 'countered', and appends an event.
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

  if (meeting.status !== "proposed" && meeting.status !== "countered") {
    return NextResponse.json({ error: `Meeting is ${meeting.status}` }, { status: 409 });
  }
  if (meeting.proposed_by === mySide) {
    return NextResponse.json({ error: "You already have an open proposal — the other side needs to respond first." }, { status: 409 });
  }

  const supabase = await createClient();
  const { error } = await supabase.from("meetings").update({
    status: "countered",
    proposed_time: t.toISOString(),
    proposed_by: mySide,
    scheduled_time: null,
  }).eq("id", meeting.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("meeting_events").insert({
    meeting_id: meeting.id,
    actor_profile_id: attendee.id,
    actor_side: mySide,
    kind: "counter",
    proposed_time: t.toISOString(),
    body: body.notes ?? null,
  });

  return NextResponse.json({ ok: true });
}
