/**
 * POST /api/portal/meetings/[id]/cancel — cancel the meeting.
 * Allowed by either side at any stage EXCEPT when it's already declined /
 * cancelled. Common uses: withdraw your own outstanding proposal, or cancel
 * a confirmed meeting that no longer works.
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

  if (meeting.status === "declined" || meeting.status === "cancelled") {
    return NextResponse.json({ error: `Meeting is already ${meeting.status}` }, { status: 409 });
  }

  let body: Body = {};
  try { body = await request.json(); } catch { /* body optional */ }

  const supabase = await createClient();
  const { error } = await supabase.from("meetings").update({
    status: "cancelled",
    scheduled_time: null,
  }).eq("id", meeting.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("meeting_events").insert({
    meeting_id: meeting.id,
    actor_profile_id: attendee.id,
    actor_side: mySide,
    kind: "cancel",
    body: body.notes ?? null,
  });

  return NextResponse.json({ ok: true });
}
