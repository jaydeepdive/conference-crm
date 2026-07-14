/**
 * Shared helpers for /api/portal/meetings/* handlers.
 *
 * Every handler needs to:
 *   1. Read the current auth user.
 *   2. Load the meeting.
 *   3. Confirm the caller is on one side of the meeting (via their
 *      attendee_profile row) and figure out which side that is.
 *
 * Everything below is server-only.
 */
import { NextResponse } from "next/server";
import { createClient } from "./supabase/server";
import type { AttendeeProfile, AttendeeSide, Meeting } from "./types";

export interface MeetingCallerContext {
  userId: string;
  attendee: AttendeeProfile;
  meeting: Meeting;
  mySide: AttendeeSide;
}

/**
 * Load the meeting and the caller's attendee_profile for its conference. Returns
 * a NextResponse (error) or the context. RLS ensures they can only fetch a
 * meeting they're on, but we double-check server-side to be explicit about
 * `mySide`.
 */
export async function loadMeetingCaller(meetingId: string): Promise<MeetingCallerContext | NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: meetingRow, error: mErr } = await supabase
    .from("meetings").select("*").eq("id", meetingId).maybeSingle();
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
  if (!meetingRow) return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  const meeting = meetingRow as Meeting;

  const { data: attendeeRow } = await supabase.from("attendee_profiles")
    .select("*").eq("user_id", user.id).eq("conference_id", meeting.conference_id).maybeSingle();
  if (!attendeeRow) return NextResponse.json({ error: "You are not an attendee of this conference." }, { status: 403 });
  const attendee = attendeeRow as AttendeeProfile;

  const mySide: AttendeeSide | null =
    attendee.lead_type === "company" && attendee.lead_id === meeting.company_id ? "company"
    : attendee.lead_type === "investor" && attendee.lead_id === meeting.investor_id ? "investor"
    : null;
  if (!mySide) return NextResponse.json({ error: "You are not a party to this meeting." }, { status: 403 });

  return { userId: user.id, attendee, meeting, mySide };
}
