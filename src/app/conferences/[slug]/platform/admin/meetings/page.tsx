/**
 * /conferences/[slug]/meetings — super-admin meetings schedule.
 *
 * Loads every meeting, company, investor, self-blocked slot and do-not-pair
 * entry for the conference and hands it to MeetingsAdminClient, which renders
 * the schedule grid / list. Writes go through /api/admin/meetings/create and
 * /api/platform/meetings/[id]/admin-edit.
 */
import { requireConferenceRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { slotsForPlatform, formatSlotRange } from "@/lib/platform";
import type {
  AttendeeBlockedSlot, Company, Investor, Meeting, MeetingBlocklistEntry,
} from "@/lib/types";
import { PageTitle } from "@/components/SectionHeader";
import {
  MeetingsAdminClient, type MeetingRow, type LeadLite, type SlotOption, type BlocklistInfo,
} from "./MeetingsAdminClient";

export const dynamic = "force-dynamic";

export default async function MeetingsAdminPage({
  params,
}: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireConferenceRole(slug, ["super_admin"]);
  const supabase = await createClient();
  const tz = ctx.conference.timezone;

  const [
    { data: meetingsRaw }, { data: cosRaw }, { data: invsRaw },
    { data: blocklistRaw }, { data: blockedSlotsRaw }, { data: profilesRaw },
  ] = await Promise.all([
    supabase.from("meetings").select("*")
      .eq("conference_id", ctx.conference.id)
      .order("scheduled_time", { ascending: true, nullsFirst: false }),
    supabase.from("companies").select("id, name, stage")
      .eq("conference_id", ctx.conference.id)
      .order("name", { ascending: true }),
    supabase.from("investors").select("id, firm_name, stage")
      .eq("conference_id", ctx.conference.id)
      .order("firm_name", { ascending: true }),
    supabase.from("meeting_blocklist").select("*")
      .eq("conference_id", ctx.conference.id),
    supabase.from("attendee_blocked_slots").select("*")
      .eq("conference_id", ctx.conference.id),
    supabase.from("attendee_profiles").select("lead_type, lead_id")
      .eq("conference_id", ctx.conference.id),
  ]);

  const meetings = (meetingsRaw ?? []) as Meeting[];
  const coRows = (cosRaw ?? []) as Pick<Company, "id" | "name" | "stage">[];
  const invRows = (invsRaw ?? []) as Pick<Investor, "id" | "firm_name" | "stage">[];
  const byName = (a: LeadLite, b: LeadLite) => a.name.localeCompare(b.name, "en", { sensitivity: "base" });

  // "Participants" = leads that are actually at the meeting day: registered,
  // or already have an attendee login, or already have a meeting. These are
  // the grid rows; the pickers still list every lead.
  const activeCo = new Set<string>();
  const activeInv = new Set<string>();
  for (const c of coRows) if (c.stage === "registered") activeCo.add(c.id);
  for (const i of invRows) if (i.stage === "registered") activeInv.add(i.id);
  for (const p of (profilesRaw ?? []) as { lead_type: string; lead_id: string }[]) {
    (p.lead_type === "company" ? activeCo : activeInv).add(p.lead_id);
  }
  for (const m of meetings) {
    if (m.status === "declined" || m.status === "cancelled") continue;
    activeCo.add(m.company_id);
    activeInv.add(m.investor_id);
  }

  const companies: LeadLite[] = coRows
    .map(c => ({ id: c.id, name: c.name?.trim() || "(no name)", active: activeCo.has(c.id) }))
    .sort(byName);
  const investors: LeadLite[] = invRows
    .map(i => ({ id: i.id, name: i.firm_name?.trim() || "(no name)", active: activeInv.has(i.id) }))
    .sort(byName);

  const coById = new Map(companies.map(c => [c.id, c.name]));
  const invById = new Map(investors.map(i => [i.id, i.name]));

  // The 14 meeting slots (lunch excluded).
  const slots = slotsForPlatform(ctx.conference).filter(s => !s.isLunch);
  const shortFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true,
  });
  const slotOptions: SlotOption[] = slots.map(s => ({
    iso: s.start.toISOString(),
    label: formatSlotRange(s.start, s.end, tz),
    short: shortFmt.format(s.start).replace(/\s?(AM|PM)$/i, ""),
  }));

  function slotIsoFor(iso: string | null): string | null {
    if (!iso) return null;
    const t = new Date(iso).getTime();
    for (const s of slots) {
      if (t >= s.start.getTime() && t < s.end.getTime()) return s.start.toISOString();
    }
    return null;
  }
  function labelForTime(iso: string | null): string | null {
    if (!iso) return null;
    const t = new Date(iso).getTime();
    for (const s of slots) {
      if (t >= s.start.getTime() && t < s.end.getTime()) return formatSlotRange(s.start, s.end, tz);
    }
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz, dateStyle: "medium", timeStyle: "short",
    }).format(new Date(iso));
  }

  // Slots each side has booked (confirmed meetings only).
  const busyByCompany: Record<string, string[]> = {};
  const busyByInvestor: Record<string, string[]> = {};
  for (const m of meetings) {
    if (m.status !== "accepted") continue;
    const slotIso = slotIsoFor(m.scheduled_time);
    if (!slotIso) continue;
    (busyByCompany[m.company_id] ??= []).push(slotIso);
    (busyByInvestor[m.investor_id] ??= []).push(slotIso);
  }

  // Slots each side has blocked themselves.
  const blockedByCompany: Record<string, string[]> = {};
  const blockedByInvestor: Record<string, string[]> = {};
  for (const bs of (blockedSlotsRaw ?? []) as AttendeeBlockedSlot[]) {
    const slotIso = slotIsoFor(bs.slot_time);
    if (!slotIso) continue;
    if (bs.lead_type === "company") (blockedByCompany[bs.lead_id] ??= []).push(slotIso);
    else (blockedByInvestor[bs.lead_id] ??= []).push(slotIso);
  }

  // Do-not-pair list as a bidirectional lookup keyed "ltype:lid|rtype:rid".
  const blocklistMap: Record<string, BlocklistInfo> = {};
  for (const b of (blocklistRaw ?? []) as MeetingBlocklistEntry[]) {
    const k1 = `${b.from_lead_type}:${b.from_lead_id}|${b.to_lead_type}:${b.to_lead_id}`;
    const k2 = `${b.to_lead_type}:${b.to_lead_id}|${b.from_lead_type}:${b.from_lead_id}`;
    blocklistMap[k1] = { reason: b.reason };
    if (!blocklistMap[k2]) blocklistMap[k2] = { reason: b.reason };
  }

  const rows: MeetingRow[] = meetings.map(m => {
    const useProposed = !m.scheduled_time && !!m.proposed_time;
    const slotLabel = labelForTime(useProposed ? m.proposed_time : m.scheduled_time);
    return {
      id: m.id,
      company_id: m.company_id,
      investor_id: m.investor_id,
      company_name: coById.get(m.company_id) ?? "—",
      investor_name: invById.get(m.investor_id) ?? "—",
      status: m.status,
      slot_label: slotLabel ? (useProposed ? `${slotLabel} (proposed)` : slotLabel) : null,
      current_slot_iso: slotIsoFor(m.scheduled_time),
      location: m.location,
      notes: m.notes,
    };
  });

  const day = ctx.conference.meeting_date ?? ctx.conference.date_start;
  let dayLabel = "";
  if (day) {
    const [y, mo, d] = day.split("-").map(Number);
    dayLabel = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "long", day: "numeric" })
      .format(new Date(Date.UTC(y, mo - 1, d, 12)));
  }

  return (
    <MeetingsAdminClient
        slug={slug}
        header={<PageTitle title="Meetings" sub={dayLabel ? `${dayLabel} · 1-on-1 schedule` : "1-on-1 schedule"} />}
        rows={rows}
        companies={companies}
        investors={investors}
        slotOptions={slotOptions}
        busyByCompany={busyByCompany}
        busyByInvestor={busyByInvestor}
        blockedByCompany={blockedByCompany}
        blockedByInvestor={blockedByInvestor}
        blocklist={blocklistMap}
      />
  );
}
