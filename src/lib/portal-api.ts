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
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "./supabase/server";
import { createServiceClient } from "./supabase/service";
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

  const attendee = await findActingAttendee(supabase, user.id, meeting.conference_id);
  if (!attendee) return NextResponse.json({ error: "You are not an attendee of this conference." }, { status: 403 });

  const mySide: AttendeeSide | null =
    attendee.lead_type === "company" && attendee.lead_id === meeting.company_id ? "company"
    : attendee.lead_type === "investor" && attendee.lead_id === meeting.investor_id ? "investor"
    : null;
  if (!mySide) return NextResponse.json({ error: "You are not a party to this meeting." }, { status: 403 });

  return { userId: user.id, attendee, meeting, mySide };
}

/**
 * The attendee the current user is acting as:
 *   1. their own attendee row (optionally scoped to a conference), else
 *   2. for SUPER ADMINS previewing the portal ("View as"), the attendee in
 *      the platform_impersonate cookie — so admins can test every action.
 */
export async function findActingAttendee(
  supabase: SupabaseClient, userId: string, conferenceId?: string | null,
): Promise<AttendeeProfile | null> {
  let q = supabase.from("attendee_profiles").select("*").eq("user_id", userId);
  if (conferenceId) q = q.eq("conference_id", conferenceId);
  const { data: own } = await q.limit(1);
  if (own && own[0]) return own[0] as AttendeeProfile;

  const { data: prof } = await supabase.from("profiles").select("is_super_admin").eq("id", userId).maybeSingle();
  if (!(prof as { is_super_admin?: boolean } | null)?.is_super_admin) return null;
  const impId = (await cookies()).get("platform_impersonate")?.value;
  if (!impId) return null;
  let iq = createServiceClient().from("attendee_profiles").select("*").eq("id", impId);
  if (conferenceId) iq = iq.eq("conference_id", conferenceId);
  const { data } = await iq.maybeSingle();
  return (data as AttendeeProfile | null) ?? null;
}

/**
 * Is either party already booked at this time? (A company's contacts all
 * share one schedule.) Returns a friendly message or null if free.
 */
export async function slotConflict(opts: {
  conferenceId: string; companyId: string; investorId: string; timeIso: string; excludeMeetingId?: string;
}): Promise<string | null> {
  const svc = createServiceClient();
  let q = svc.from("meetings").select("id, company_id, investor_id")
    .eq("conference_id", opts.conferenceId)
    .eq("scheduled_time", new Date(opts.timeIso).toISOString())
    .not("status", "in", "(declined,cancelled)")
    .or(`company_id.eq.${opts.companyId},investor_id.eq.${opts.investorId}`);
  if (opts.excludeMeetingId) q = q.neq("id", opts.excludeMeetingId);
  const { data } = await q;
  const rows = data ?? [];
  if (rows.some(r => r.investor_id === opts.investorId)) return "The investor already has a meeting at that time.";
  const companyCount = rows.filter(r => r.company_id === opts.companyId).length;
  if (companyCount === 0) return null;
  const cap = await companySlotCapacity(opts.companyId);
  if (companyCount < cap) return null;
  return cap > 1
    ? `The company already has ${cap} meetings at that time (its limit).`
    : "The company already has a meeting at that time.";
}

/** Meetings a company may hold in one time slot (1 for everyone except
 *  companies given an exception, e.g. Zang International = 3). */
export async function companySlotCapacity(companyId: string): Promise<number> {
  const { data } = await createServiceClient().from("companies").select("slot_capacity").eq("id", companyId).maybeSingle();
  const n = Number((data as { slot_capacity?: number } | null)?.slot_capacity ?? 1);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/** company id → slot capacity, only for companies above 1. */
export async function companyCapacities(conferenceId: string): Promise<Map<string, number>> {
  const { data } = await createServiceClient().from("companies").select("id, slot_capacity")
    .eq("conference_id", conferenceId).gt("slot_capacity", 1);
  return new Map(((data ?? []) as { id: string; slot_capacity: number }[]).map(r => [r.id, r.slot_capacity]));
}

/** Turn a DB unique-slot violation into a readable message. */
export function slotErrorMessage(err: { code?: string; message?: string } | null): string | null {
  if (!err) return null;
  if (err.code === "23505" && /one_per_slot/.test(err.message ?? "")) return "One of the parties already has a meeting at that time.";
  return err.message ?? "Something went wrong.";
}
