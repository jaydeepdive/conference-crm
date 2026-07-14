/**
 * Meeting-slot math for the attendee portal.
 *
 * A conference defines its meeting window in local (conference timezone) time —
 * meeting_start_time / meeting_end_time, an optional lunch break, a slot length
 * (meeting_slot_minutes) and a stride between slots (meeting_slot_stride_minutes).
 * A single-day conference generates one day's worth of slots; multi-day
 * conferences repeat the same window on each date between date_start and date_end.
 *
 * We store the (start, end) of each slot as real UTC `Date`s so they can be
 * compared directly with `timestamptz` values from Postgres. Display formatting
 * (labels, day headings) is done via `Intl.DateTimeFormat` and always renders in
 * the conference timezone — the app never depends on the viewer's local zone.
 *
 * NOTE: the app avoids external date libraries (no date-fns / luxon / dayjs).
 * The parsing helper builds a UTC instant by asking Intl what "this local wall
 * clock in the target timezone equals in UTC" — implemented via a small offset
 * probe. This is accurate to the minute for all real-world timezones (including
 * DST transitions inside the meeting window are handled correctly by re-probing
 * per slot).
 */

export interface SlotConferenceInput {
  date_start: string | null;                    // 'YYYY-MM-DD'
  date_end: string | null;                      // 'YYYY-MM-DD'
  timezone: string;                             // IANA zone e.g. 'America/Toronto'
  meeting_start_time: string;                   // 'HH:MM' or 'HH:MM:SS'
  meeting_end_time: string;                     // 'HH:MM' or 'HH:MM:SS'
  meeting_lunch_start: string | null;
  meeting_lunch_end: string | null;
  meeting_slot_minutes: number;
  meeting_slot_stride_minutes: number;
}

export interface Slot {
  /** 'YYYY-MM-DD' in the conference's local timezone. */
  day: string;
  /** UTC instant for the slot's start. */
  start: Date;
  /** UTC instant for the slot's end. */
  end: Date;
  /** Human label like "9:00 AM" in the conference timezone. */
  label: string;
  /** True if the slot overlaps the lunch break; caller usually skips these. */
  isLunch: boolean;
}

// ---------- timezone-aware helpers ----------

/** Get the offset in minutes for a given UTC instant in `tz` (e.g. -240 for EDT). */
function tzOffsetMinutes(utc: Date, tz: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = fmt.formatToParts(utc);
  const bag: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") bag[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(bag.year), Number(bag.month) - 1, Number(bag.day),
    Number(bag.hour === "24" ? "0" : bag.hour), Number(bag.minute), Number(bag.second),
  );
  return Math.round((asUtc - utc.getTime()) / 60000);
}

/** Convert 'YYYY-MM-DD' + 'HH:MM[:SS]' in the given tz to a UTC Date. */
function localToUtc(day: string, time: string, tz: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  // First pass: pretend the wall clock IS UTC, then subtract the offset at that
  // instant. Repeat once — this converges for every timezone in real use.
  let utc = new Date(Date.UTC(y, m - 1, d, hh, mm, 0));
  const off1 = tzOffsetMinutes(utc, tz);
  utc = new Date(utc.getTime() - off1 * 60000);
  const off2 = tzOffsetMinutes(utc, tz);
  if (off2 !== off1) utc = new Date(new Date(Date.UTC(y, m - 1, d, hh, mm, 0)).getTime() - off2 * 60000);
  return utc;
}

/** 'HH:MM:SS' or 'HH:MM' → total minutes since midnight. */
function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** 'HH:MM' string from minutes since midnight. */
function minutesToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Enumerate every date between two ISO days, inclusive. */
function eachDayInclusive(start: string, end: string): string[] {
  const out: string[] = [];
  const [ys, ms, ds] = start.split("-").map(Number);
  const [ye, me, de] = end.split("-").map(Number);
  const cur = new Date(Date.UTC(ys, ms - 1, ds));
  const stop = new Date(Date.UTC(ye, me - 1, de));
  while (cur.getTime() <= stop.getTime()) {
    const y = cur.getUTCFullYear();
    const m = String(cur.getUTCMonth() + 1).padStart(2, "0");
    const d = String(cur.getUTCDate()).padStart(2, "0");
    out.push(`${y}-${m}-${d}`);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

// ---------- public API ----------

/** Generate every meeting slot for the conference, across all days. */
export function generateSlots(conf: SlotConferenceInput): Slot[] {
  if (!conf.date_start) return [];
  const days = eachDayInclusive(conf.date_start, conf.date_end ?? conf.date_start);
  const startMin = timeToMinutes(conf.meeting_start_time);
  const endMin = timeToMinutes(conf.meeting_end_time);
  const stride = Math.max(1, conf.meeting_slot_stride_minutes);
  const slotLen = Math.max(1, conf.meeting_slot_minutes);
  const lunchStart = conf.meeting_lunch_start ? timeToMinutes(conf.meeting_lunch_start) : null;
  const lunchEnd = conf.meeting_lunch_end ? timeToMinutes(conf.meeting_lunch_end) : null;

  const slots: Slot[] = [];
  for (const day of days) {
    for (let m = startMin; m + slotLen <= endMin; m += stride) {
      const isLunch =
        lunchStart !== null && lunchEnd !== null &&
        m < lunchEnd && (m + slotLen) > lunchStart;
      const startUtc = localToUtc(day, minutesToTime(m), conf.timezone);
      const endUtc = new Date(startUtc.getTime() + slotLen * 60000);
      slots.push({ day, start: startUtc, end: endUtc, label: formatSlotLabel(startUtc, conf.timezone), isLunch });
    }
  }
  return slots;
}

/** Group slots by their `day` field, preserving order. */
export function groupSlotsByDay(slots: Slot[]): { day: string; slots: Slot[] }[] {
  const map = new Map<string, Slot[]>();
  for (const s of slots) {
    const arr = map.get(s.day) ?? [];
    arr.push(s);
    map.set(s.day, arr);
  }
  return Array.from(map.entries()).map(([day, slots]) => ({ day, slots }));
}

/**
 * Return the set of slot start times (as UTC ISO strings) that overlap any
 * meeting in `busy`. Use this to mark timeslots unavailable in the picker.
 */
export function busySlotStarts(slots: Slot[], busy: { scheduled_time: string | null }[]): Set<string> {
  const out = new Set<string>();
  for (const meeting of busy) {
    if (!meeting.scheduled_time) continue;
    const t = new Date(meeting.scheduled_time).getTime();
    for (const s of slots) {
      // A busy meeting blocks any slot whose window contains its start.
      if (t >= s.start.getTime() && t < s.end.getTime()) {
        out.add(s.start.toISOString());
      }
    }
  }
  return out;
}

/** Nicely formatted time label ("9:00 AM") in the conference tz. */
export function formatSlotLabel(utc: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true,
  }).format(utc);
}

/** Long day heading in the conference tz — "Wednesday, November 15". */
export function formatDayHeading(day: string, tz: string): string {
  const utc = localToUtc(day, "12:00", tz); // noon avoids DST edges
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz, weekday: "long", month: "long", day: "numeric",
  }).format(utc);
}

/** Compact date + time label ("Nov 15, 9:00 AM") for lists. */
export function formatMeetingDateTime(utc: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz, month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
  }).format(utc);
}
