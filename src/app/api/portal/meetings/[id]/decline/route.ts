/**
 * POST /api/portal/meetings/[id]/decline — decline the currently proposed time.
 * Either side can decline when a proposal is outstanding from the other side.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadMeetingCaller } from "@/lib/portal-api";

export const runtime = "nodejs";

interface Body { notes?: string }

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const loaded = await loadMeetingCaller(id);
  if (loaded instanceof NextResponse) return loaded;
  const { meeting, mySide, attendee } = loaded;

  if (meeting.status !== "proposed" && meeting.status !== "countered") {
    return NextResponse.json({ error: `Meeting is ${meeting.status}` }, { status: 409 });
  }
  if (meeting.proposed_by === mySide) {
    return NextResponse.json({ error: "You proposed this time — cancel it instead of declining." }, { status: 409 });
  }

  let body: Body = {};
  try { body = await request.json(); } catch { /* body optional */ }

  const supabase = await createClient();
  const { error } = await supabase.from("meetings").update({
    status: "declined",
    scheduled_time: null,
  }).eq("id", meeting.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("meeting_events").insert({
    meeting_id: meeting.id,
    actor_profile_id: attendee.id,
    actor_side: mySide,
    kind: "decline",
    body: body.notes ?? null,
  });

  return NextResponse.json({ ok: true });
}
