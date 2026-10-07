/**
 * Attendee /platform surface helpers.
 *
 * Parallel to src/lib/portal.ts but tuned for the new mobile-first
 * /conferences/[slug]/platform/* pages. Context resolution returns a
 * union: either "no session" or "no attendee profile for this conf"
 * or the resolved context — the layout decides how to render each
 * so unauth'd users land on the platform login (not /portal/login).
 */
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { AttendeeProfile, AttendeeSide, Company, Conference, Investor } from "./types";
import { generateSlots, type Slot, type SlotConferenceInput } from "./slots";

export type PlatformContextResult =
  | { kind: "no-session" }
  | { kind: "not-attendee"; conference: Conference; userEmail: string | null }
  | { kind: "ok"; ctx: PlatformContext };

export interface PlatformContext {
  user: { id: string; email: string | null };
  attendee: AttendeeProfile;
  conference: Conference;
  side: AttendeeSide;
  lead: Company | Investor;
}

/** Resolve the signed-in user's platform context for a conference slug. Non-redirecting. */
export async function resolvePlatformContext(slug: string): Promise<PlatformContextResult | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: conference } = await supabase
    .from("conferences").select("*").eq("slug", slug).maybeSingle();
  if (!conference) return null;
  const conf = conference as Conference;

  if (!user) return { kind: "no-session" };

  const { data: attendeeRow } = await supabase
    .from("attendee_profiles").select("*")
    .eq("user_id", user.id).eq("conference_id", conf.id).maybeSingle();
  if (!attendeeRow) return { kind: "not-attendee", conference: conf, userEmail: user.email ?? null };
  const attendee = attendeeRow as AttendeeProfile;

  const table = attendee.lead_type === "company" ? "companies" : "investors";
  const { data: leadRow } = await supabase.from(table).select("*").eq("id", attendee.lead_id).maybeSingle();
  if (!leadRow) return { kind: "not-attendee", conference: conf, userEmail: user.email ?? null };

  return {
    kind: "ok",
    ctx: {
      user: { id: user.id, email: user.email ?? null },
      attendee,
      conference: conf,
      side: attendee.lead_type,
      lead: leadRow as Company | Investor,
    },
  };
}

/**
 * Narrowed accessor used by every /platform/(authed) page. Redirects on
 * failure cases (no session, not an attendee of this conf, unknown conf);
 * returns the PlatformContext directly on success.
 */
export async function requirePlatformContext(slug: string): Promise<PlatformContext> {
  const r = await resolvePlatformContext(slug);
  if (!r || r.kind !== "ok") {
    const target = !r || r.kind === "no-session" || r.kind === "not-attendee"
      ? `/conferences/${slug}/platform/login`
      : "/conferences";
    redirect(target);
    // `redirect` throws, but older @types/react pulls in TS defs that don't
    // return `never` here — this throw appeases flow analysis.
    throw new Error("unreachable");
  }
  return r.ctx;
}

/** Compact display name for a lead on either side. */
export function leadDisplayName(lead: Company | Investor, side: AttendeeSide): string {
  return side === "company" ? (lead as Company).name : (lead as Investor).firm_name;
}

/**
 * Generate slots for the single-day /platform surface. Prefers conference.meeting_date;
 * falls back to date_start. Returns an empty array if neither is set.
 */
export function slotsForPlatform(conference: Conference): Slot[] {
  const day = conference.meeting_date ?? conference.date_start;
  if (!day) return [];
  const input: SlotConferenceInput = {
    date_start: day,
    date_end: day,
    timezone: conference.timezone,
    meeting_start_time: conference.meeting_start_time,
    meeting_end_time: conference.meeting_end_time,
    meeting_lunch_start: conference.meeting_lunch_start,
    meeting_lunch_end: conference.meeting_lunch_end,
    meeting_slot_minutes: conference.meeting_slot_minutes,
    meeting_slot_stride_minutes: conference.meeting_slot_stride_minutes,
  };
  return generateSlots(input);
}

/** Format "8:00–8:25 AM" slot range in conference tz. */
export function formatSlotRange(startIso: Date, endIso: Date, tz: string): string {
  const fmt = (d: Date, withMeridiem: boolean) => new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d).replace(withMeridiem ? "" : /\s?(AM|PM)$/i, "");
  // Omit meridiem on the start when both halves share it, to keep labels short.
  const startMer = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: true }).format(startIso).slice(-2);
  const endMer   = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: true }).format(endIso).slice(-2);
  const sameMer = startMer.toUpperCase() === endMer.toUpperCase();
  return `${fmt(startIso, !sameMer)}–${fmt(endIso, true)}`;
}

/** Format the single meeting day's heading, e.g. "Tuesday, November 24". */
export function formatPlatformDayHeading(conference: Conference): string {
  const day = conference.meeting_date ?? conference.date_start;
  if (!day) return "";
  const [y, m, d] = day.split("-").map(Number);
  // Noon avoids DST edges when figuring out the weekday.
  const utc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: conference.timezone,
    weekday: "long", month: "long", day: "numeric",
  }).format(utc);
}

/** Short date, e.g. "November 24". */
export function formatPlatformDayShort(conference: Conference): string {
  const day = conference.meeting_date ?? conference.date_start;
  if (!day) return "";
  const [y, m, d] = day.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: conference.timezone, month: "long", day: "numeric",
  }).format(utc);
}

/** Format a time only in conference tz, e.g. "4:00 PM". */
export function formatTimeInTz(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(iso));
}

/** Convert "HH:MM[:SS]" wall-clock on the conference meeting day to a UTC Date. */
export function conferenceWallClockToUtc(conference: Conference, time: string): Date | null {
  const day = conference.meeting_date ?? conference.date_start;
  if (!day) return null;
  // Reuse the same approach as slots.ts — probe tz offset twice.
  const [y, m, d] = day.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const fakeUtc = new Date(Date.UTC(y, m - 1, d, hh, mm, 0));
  const probeOffset = (utc: Date) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: conference.timezone, hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(utc);
    const bag: Record<string, string> = {};
    for (const p of parts) if (p.type !== "literal") bag[p.type] = p.value;
    const asUtc = Date.UTC(
      Number(bag.year), Number(bag.month) - 1, Number(bag.day),
      Number(bag.hour === "24" ? "0" : bag.hour), Number(bag.minute), Number(bag.second),
    );
    return Math.round((asUtc - utc.getTime()) / 60000);
  };
  let utc = new Date(fakeUtc.getTime() - probeOffset(fakeUtc) * 60000);
  const off2 = probeOffset(utc);
  const off1 = probeOffset(fakeUtc);
  if (off2 !== off1) utc = new Date(fakeUtc.getTime() - off2 * 60000);
  return utc;
}

/** 32-hex-char invite token via WebCrypto; mirrors portal helper. */
export function generateInviteToken(): string {
  const buf = new Uint8Array(24);
  crypto.getRandomValues(buf);
  return Array.from(buf).map(b => b.toString(16).padStart(2, "0")).join("");
}
