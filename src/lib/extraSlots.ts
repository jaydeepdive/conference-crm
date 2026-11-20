/**
 * Extra bookable meeting times for a company outside the Tuesday 1-on-1 grid
 * (company_extra_slots — e.g. remote Monday meetings for Rackla / Power Metallic).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ExtraSlot { company_id: string; slot_time: string; duration_minutes: number; location: string }

/** Never throws: returns [] if the table isn't there. */
export async function loadExtraSlots(svc: SupabaseClient, conferenceId: string, companyId?: string): Promise<ExtraSlot[]> {
  try {
    let q = svc.from("company_extra_slots").select("company_id, slot_time, duration_minutes, location")
      .eq("conference_id", conferenceId).order("slot_time");
    if (companyId) q = q.eq("company_id", companyId);
    const { data, error } = await q;
    if (error) return [];
    return (data ?? []) as ExtraSlot[];
  } catch { return []; }
}

/** "Mon, Nov 23 · 9:00–9:25 AM" */
export function extraSlotLabel(iso: string, minutes: number, tz: string): string {
  const start = new Date(iso);
  const end = new Date(start.getTime() + minutes * 60000);
  const day = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" }).format(start);
  const hm = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(d);
  const a = hm(start), b = hm(end);
  const same = a.slice(-2) === b.slice(-2);
  return `${day} · ${same ? a.slice(0, -3) : a}–${b}`;
}

/** Day heading for a group of extra slots, e.g. "Monday, November 23". */
export function extraDayHeading(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" }).format(new Date(iso));
}
