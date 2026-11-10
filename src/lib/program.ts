/**
 * Event program (all days) — conference_program_items + conferences.program_published.
 * Attendees only see it once published; super admins (incl. "View as" preview)
 * always see it, flagged as a preview while unpublished.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ProgramItem {
  id: string;
  day: string;           // YYYY-MM-DD
  start_time: string;    // HH:MM[:SS]
  end_time: string | null;
  title: string;
  note: string | null;
  location: string | null;
}

/** Never throws: if the table isn't there yet, returns an unpublished empty program. */
export async function loadProgram(svc: SupabaseClient, conferenceId: string): Promise<{ published: boolean; items: ProgramItem[] }> {
  try {
    const [{ data: conf }, { data: items, error }] = await Promise.all([
      svc.from("conferences").select("program_published").eq("id", conferenceId).maybeSingle(),
      svc.from("conference_program_items").select("id, day, start_time, end_time, title, note, location")
        .eq("conference_id", conferenceId).order("day").order("start_time"),
    ]);
    if (error) return { published: false, items: [] };
    return {
      published: !!(conf as { program_published?: boolean } | null)?.program_published,
      items: (items ?? []) as ProgramItem[],
    };
  } catch {
    return { published: false, items: [] };
  }
}

/** "19:00" → "7:00 PM" */
export function fmtClock(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ap}`;
}

/** "07:00","08:15" → "7:00–8:15 AM"; "11:15","12:00" → "11:15 AM–12:00 PM"; no end → "6:30 PM" */
export function fmtProgramRange(start: string, end: string | null): string {
  if (!end) return fmtClock(start);
  const a = fmtClock(start), b = fmtClock(end);
  const sameHalf = a.slice(-2) === b.slice(-2);
  return sameHalf ? `${a.slice(0, -3)}–${b}` : `${a}–${b}`;
}

/** "2026-11-22" → "Sunday, November 22" */
export function fmtProgramDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" })
    .format(new Date(Date.UTC(y, m - 1, d, 12)));
}

export function groupByDay(items: ProgramItem[]): { day: string; items: ProgramItem[] }[] {
  const map = new Map<string, ProgramItem[]>();
  for (const it of items) { if (!map.has(it.day)) map.set(it.day, []); map.get(it.day)!.push(it); }
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([day, items]) => ({ day, items }));
}
