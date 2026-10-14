/**
 * POST /api/platform/meetings/[id]/cancel — withdraw a proposal or cancel
 * a confirmed meeting. No-op if already terminal.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadMeetingCaller } from "@/lib/portal-api";

export const runtime = "nodejs";

interface Body { notes?: string; keep_original?: boolean }

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const loaded = await loadMeetingCaller(id);
  if (loaded instanceof NextResponse) return loaded;
  const { meeting, mySide, attendee } = loaded;

  if (meeting.status === "declined" || meeting.status === "cancelled")
    return NextResponse.json({ error: `Meeting is already ${meeting.status}` }, { status: 409 });

  let body: Body = {};
  try { body = await request.json(); } catch { /* body optional */ }

  const supabase = await createClient();
  if (meeting.reschedule_from && body.keep_original) {
    // Withdraw a pending reschedule → back to the original confirmed time.
    const { error: e2 } = await supabase.from("meetings").update({
      status: "accepted", scheduled_time: meeting.reschedule_from,
      proposed_time: meeting.reschedule_from, reschedule_from: null,
    }).eq("id", meeting.id);
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
    await supabase.from("meeting_events").insert({
      meeting_id: meeting.id, actor_profile_id: attendee.id, actor_side: mySide,
      kind: "keep", proposed_time: meeting.reschedule_from,
    });
    return NextResponse.json({ ok: true });
  }
  const { error } = await supabase.from("meetings").update({
    status: "cancelled", scheduled_time: null, reschedule_from: null,
  }).eq("id", meeting.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("meeting_events").insert({
    meeting_id: meeting.id, actor_profile_id: attendee.id, actor_side: mySide,
    kind: "cancel", body: body.notes ?? null,
  });
  return NextResponse.json({ ok: true });
}
