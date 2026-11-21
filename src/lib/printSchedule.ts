/**
 * Data for printable attendee schedules (admin console → Schedules).
 * One schedule per company or investor; server-only (service client).
 */
import { createServiceClient } from "@/lib/supabase/service";
import { slotsForPlatform, formatSlotRange, conferenceWallClockToUtc, formatTimeInTz } from "@/lib/platform";
import { loadProgram, fmtProgramRange } from "@/lib/program";
import { loadExtraSlots, extraSlotLabel } from "@/lib/extraSlots";
import type { Conference } from "@/lib/types";

export type Side = "company" | "investor";

export interface PrintRow {
  time: string;
  kind: "meeting" | "open" | "blocked" | "lunch" | "program";
  title: string;        // who / what
  sub?: string;         // firm, people, note
  where?: string;       // table / location
  sort: number;
}
export interface PrintSchedule {
  side: Side;
  leadId: string;
  name: string;              // company or investor display name
  subtitle: string;          // "Company · Table 17" / "Investor · Piggo's Trading Desk"
  people: string[];
  dayHeading: string;        // "Tuesday, November 24"
  doors: string | null;
  rows: PrintRow[];
  other: PrintRow[];         // meetings outside the Tuesday grid (e.g. remote Monday)
  day1: string | null;       // "Golf — Gwen Preston, Taylor Ross"
  meetingCount: number;
}

/** "Darreck Enciso - Piggo's Trading Desk" → { person, firm } */
export function splitInvestor(firm: string | null, contact: string | null): { person: string; firm: string | null } {
  const f = (firm ?? "").trim(); const c = (contact ?? "").trim();
  if (f.includes(" - ")) { const [p, ...rest] = f.split(" - "); return { person: c || p.trim(), firm: rest.join(" - ").trim() || null }; }
  if (c && f && c.toLowerCase() !== f.toLowerCase()) return { person: c, firm: f };
  return { person: c || f || "Investor", firm: null };
}

export async function loadPrintSchedules(slug: string, side: Side, ids: string[] | "all"): Promise<{ conference: Conference; schedules: PrintSchedule[] } | null> {
  const svc = createServiceClient();
  const { data: conf } = await svc.from("conferences").select("*").eq("slug", slug).maybeSingle();
  if (!conf) return null;
  const conference = conf as Conference;
  const tz = conference.timezone;

  const [{ data: cos }, { data: invs }, { data: people }, { data: meetings }, { data: blocks }, { data: acts }] = await Promise.all([
    svc.from("companies").select("id, name, stage, category, primary_metal, meeting_table").eq("conference_id", conference.id),
    svc.from("investors").select("id, firm_name, contact_name, stage").eq("conference_id", conference.id),
    svc.from("attendee_profiles").select("lead_type, lead_id, full_name, day1_activity").eq("conference_id", conference.id),
    svc.from("meetings").select("id, company_id, investor_id, status, scheduled_time, location").eq("conference_id", conference.id)
      .eq("status", "accepted").not("scheduled_time", "is", null),
    svc.from("attendee_blocked_slots").select("lead_type, lead_id, slot_time, reason").eq("conference_id", conference.id),
    svc.from("conference_activities").select("kind, title").eq("conference_id", conference.id),
  ]);
  const program = await loadProgram(svc, conference.id);
  const extras = await loadExtraSlots(svc, conference.id);
  const coById = new Map((cos ?? []).map(c => [c.id as string, c as { id: string; name: string; stage: string; category: string | null; primary_metal: string | null; meeting_table: string | null }]));
  const invById = new Map((invs ?? []).map(i => [i.id as string, i as { id: string; firm_name: string | null; contact_name: string | null; stage: string }]));
  const peopleOf = (s: Side, id: string) => (people ?? []).filter(p => p.lead_type === s && p.lead_id === id)
    .map(p => (p.full_name as string | null)?.trim()).filter((n): n is string => !!n);
  const actTitle = new Map((acts ?? []).map(a => [a.kind as string, a.title as string]));

  const targets: string[] = ids === "all"
    ? (side === "company"
        ? (cos ?? []).filter(c => c.stage === "registered").sort((a, b) => String(a.name).localeCompare(String(b.name))).map(c => c.id as string)
        : (invs ?? []).filter(i => i.stage === "registered").sort((a, b) => splitInvestor(a.firm_name, a.contact_name).person.localeCompare(splitInvestor(b.firm_name, b.contact_name).person)).map(i => i.id as string))
    : ids;

  const slots = slotsForPlatform(conference);
  const dayHeading = slots[0]
    ? new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" }).format(slots[0].start)
    : "Meeting day";
  const doorsUtc = conference.doors_open_time ? conferenceWallClockToUtc(conference, conference.doors_open_time) : null;
  const doors = doorsUtc ? formatTimeInTz(doorsUtc.toISOString(), tz) : null;
  const meetingDay = conference.meeting_date ?? "";
  const programItems = program.published ? program.items.filter(i => i.day === meetingDay) : [];

  const schedules: PrintSchedule[] = [];
  for (const id of targets) {
    let name: string, subtitle: string;
    if (side === "company") {
      const c = coById.get(id); if (!c) continue;
      name = c.name;
      subtitle = ["Presenting company", [c.category, c.primary_metal].filter(Boolean).join(" · "), c.meeting_table].filter(Boolean).join("  ·  ");
    } else {
      const i = invById.get(id); if (!i) continue;
      const sp = splitInvestor(i.firm_name, i.contact_name);
      name = sp.person;
      subtitle = ["Investor", sp.firm].filter(Boolean).join("  ·  ");
    }
    const mine = (meetings ?? []).filter(m => (side === "company" ? m.company_id : m.investor_id) === id);
    const myBlocks = (blocks ?? []).filter(b => b.lead_type === side && b.lead_id === id);
    const describe = (m: { company_id: string; investor_id: string; location: string | null }) => {
      if (side === "company") {
        const i = invById.get(m.investor_id); const sp = splitInvestor(i?.firm_name ?? null, i?.contact_name ?? null);
        return { title: sp.person, sub: sp.firm ?? undefined, where: m.location ?? undefined };
      }
      const c = coById.get(m.company_id);
      const ppl = peopleOf("company", m.company_id);
      return { title: c?.name ?? "Company", sub: ppl.length ? `With ${ppl.join(", ")}` : undefined, where: m.location ?? c?.meeting_table ?? undefined };
    };

    const rows: PrintRow[] = [];
    let count = 0;
    for (const s of slots) {
      const label = formatSlotRange(s.start, s.end, tz);
      if (s.isLunch) {
        const end = (conference.meeting_lunch_end && conferenceWallClockToUtc(conference, conference.meeting_lunch_end)) || s.end;
        rows.push({ time: formatSlotRange(s.start, end, tz), kind: "lunch", title: "Lunch", sort: s.start.getTime() });
        continue;
      }
      const t0 = s.start.getTime(), t1 = s.end.getTime();
      const here = mine.filter(m => { const t = new Date(m.scheduled_time as string).getTime(); return t >= t0 && t < t1; });
      if (here.length) {
        here.forEach((m, k) => { const d = describe(m); rows.push({ time: label, kind: "meeting", ...d, sort: t0 + k }); count++; });
        continue;
      }
      const blk = myBlocks.find(b => { const t = new Date(b.slot_time as string).getTime(); return t >= t0 && t < t1; });
      if (blk) {
        const interview = /deep dive/i.test((blk.reason as string | null) ?? "");
        rows.push({ time: label, kind: "blocked", title: interview ? "The Deep Dive Interview" : "Not taking meetings",
          sub: interview ? ((blk.reason as string).split("·")[1]?.trim() ?? undefined) : undefined, sort: t0 });
        continue;
      }
      rows.push({ time: label, kind: "open", title: "Open", sort: t0 });
    }
    for (const it of programItems) {
      const at = conferenceWallClockToUtc(conference, it.start_time.slice(0, 5));
      if (!at) continue;
      rows.push({ time: fmtProgramRange(it.start_time.slice(0, 5), it.end_time?.slice(0, 5) ?? null), kind: "program",
        title: it.title, sub: it.note ?? undefined, where: it.location ?? undefined, sort: at.getTime() - 1 });
    }
    if (!program.published && conference.farewell_time) {
      const f = conferenceWallClockToUtc(conference, conference.farewell_time);
      if (f) rows.push({ time: formatTimeInTz(f.toISOString(), tz), kind: "program", title: "Farewell announcement", sort: f.getTime() });
    }
    rows.sort((a, b) => a.sort - b.sort);

    // Meetings outside the Tuesday grid (e.g. remote Monday)
    const inGrid = (t: number) => slots.some(s => t >= s.start.getTime() && t < s.end.getTime());
    const other: PrintRow[] = mine.filter(m => !inGrid(new Date(m.scheduled_time as string).getTime()))
      .map(m => {
        const t = new Date(m.scheduled_time as string);
        const x = extras.find(e => e.company_id === m.company_id && new Date(e.slot_time).getTime() === t.getTime());
        count++;
        return { time: extraSlotLabel(t.toISOString(), x?.duration_minutes ?? 25, tz), kind: "meeting" as const, ...describe(m), sort: t.getTime() };
      }).sort((a, b) => a.sort - b.sort);

    // Day 1 (per person)
    const d1 = (people ?? []).filter(p => p.lead_type === side && p.lead_id === id && (p.day1_activity === "golf" || p.day1_activity === "site_visit"));
    const day1 = d1.length
      ? Array.from(new Set(d1.map(p => p.day1_activity as string))).map(k =>
          `${actTitle.get(k) ?? (k === "golf" ? "Golf" : "Site visit")} — ${d1.filter(p => p.day1_activity === k).map(p => p.full_name).filter(Boolean).join(", ")}`).join("   ·   ")
      : null;

    schedules.push({ side, leadId: id, name, subtitle, people: peopleOf(side, id), dayHeading, doors, rows, other, day1, meetingCount: count });
  }
  return { conference, schedules };
}
