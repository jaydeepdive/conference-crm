/**
 * /conferences/[slug]/meetings — super-admin direct meetings admin.
 *
 * Lets a super admin manage every meeting in the conference without going
 * through the attendee /platform surface. Reads/writes delegate to the
 * existing /api/platform/meetings/[id]/admin-edit endpoint (for edits) and
 * the new /api/admin/meetings/create endpoint (for new rows).
 */
import { requireConferenceRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { slotsForPlatform, formatSlotRange } from "@/lib/platform";
import type { Company, Investor, Meeting } from "@/lib/types";
import { PageTitle } from "@/components/SectionHeader";
import { MeetingsAdminClient, type MeetingRow, type LeadLite, type SlotOption } from "./MeetingsAdminClient";

export const dynamic = "force-dynamic";

export default async function MeetingsAdminPage({
  params,
}: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireConferenceRole(slug, ["super_admin"]);
  const supabase = await createClient();

  const [{ data: meetingsRaw }, { data: cosRaw }, { data: invsRaw }] = await Promise.all([
    supabase.from("meetings").select("*")
      .eq("conference_id", ctx.conference.id)
      .order("scheduled_time", { ascending: true, nullsFirst: false }),
    supabase.from("companies").select("id, name")
      .eq("conference_id", ctx.conference.id)
      .order("name", { ascending: true }),
    supabase.from("investors").select("id, firm_name")
      .eq("conference_id", ctx.conference.id)
      .order("firm_name", { ascending: true }),
  ]);

  const meetings = (meetingsRaw ?? []) as Meeting[];
  const companies: LeadLite[] = ((cosRaw ?? []) as Pick<Company, "id" | "name">[])
    .map(c => ({ id: c.id, name: c.name || "—" }));
  const investors: LeadLite[] = ((invsRaw ?? []) as Pick<Investor, "id" | "firm_name">[])
    .map(i => ({ id: i.id, name: i.firm_name || "—" }));

  const coById = new Map(companies.map(c => [c.id, c.name]));
  const invById = new Map(investors.map(i => [i.id, i.name]));

  // Pre-compute slot options (14 slots in a typical conference).
  const slots = slotsForPlatform(ctx.conference).filter(s => !s.isLunch);
  const slotOptions: SlotOption[] = slots.map(s => ({
    iso: s.start.toISOString(),
    label: formatSlotRange(s.start, s.end, ctx.conference.timezone),
  }));

  function labelForTime(iso: string | null): string | null {
    if (!iso) return null;
    const t = new Date(iso).getTime();
    for (const s of slots) {
      if (t >= s.start.getTime() && t < s.end.getTime()) {
        return formatSlotRange(s.start, s.end, ctx.conference.timezone);
      }
    }
    return new Intl.DateTimeFormat("en-US", {
      timeZone: ctx.conference.timezone, dateStyle: "medium", timeStyle: "short",
    }).format(new Date(iso));
  }

  // Build "busy slots per lead" from accepted meetings — the create modal uses
  // this to flag collisions on either side.
  const busyByCompany: Record<string, string[]> = {};
  const busyByInvestor: Record<string, string[]> = {};
  for (const m of meetings) {
    if (m.status !== "accepted" || !m.scheduled_time) continue;
    const t = new Date(m.scheduled_time).getTime();
    let slotIso: string | null = null;
    for (const s of slots) {
      if (t >= s.start.getTime() && t < s.end.getTime()) { slotIso = s.start.toISOString(); break; }
    }
    if (!slotIso) continue;
    (busyByCompany[m.company_id] ??= []).push(slotIso);
    (busyByInvestor[m.investor_id] ??= []).push(slotIso);
  }

  const rows: MeetingRow[] = meetings.map(m => {
    const useProposed = !m.scheduled_time && !!m.proposed_time;
    const t = useProposed ? m.proposed_time : m.scheduled_time;
    const slotLabel = labelForTime(t);
    const currentIso = m.scheduled_time ?? null;
    let currentSlotIso: string | null = null;
    if (currentIso) {
      const ms = new Date(currentIso).getTime();
      for (const s of slots) {
        if (ms >= s.start.getTime() && ms < s.end.getTime()) { currentSlotIso = s.start.toISOString(); break; }
      }
    }
    return {
      id: m.id,
      company_id: m.company_id,
      investor_id: m.investor_id,
      company_name: coById.get(m.company_id) ?? "—",
      investor_name: invById.get(m.investor_id) ?? "—",
      status: m.status,
      slot_label: slotLabel ? (useProposed ? `${slotLabel} (proposed)` : slotLabel) : null,
      current_slot_iso: currentSlotIso,
      location: m.location,
      notes: m.notes,
    };
  });

  return (
    <div className="space-y-6">
      <PageTitle title="Meetings" sub={`${ctx.conference.name} · super admin`} />

      <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        Direct meetings management. Edits here write via the admin override
        endpoint and record an audit event, just like the /platform meeting
        page does — but without impersonation.
      </div>

      <MeetingsAdminClient
        slug={slug}
        rows={rows}
        companies={companies}
        investors={investors}
        slotOptions={slotOptions}
        busyByCompany={busyByCompany}
        busyByInvestor={busyByInvestor}
      />
    </div>
  );
}
