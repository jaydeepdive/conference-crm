/**
 * /conferences/[slug]/meetings/auto-match — admin bulk auto-matcher.
 *
 * Server page: loads the pool (companies, investors), the current busy map
 * (accepted meetings + attendee self-blocks + blocklist), computes slot ISOs,
 * runs the greedy matcher once, and hands the proposal list to the client
 * component which lets the admin confirm or regenerate.
 */
import { requireConferenceRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { slotsForPlatform, formatSlotRange } from "@/lib/platform";
import { autoMatch } from "@/lib/match";
import type {
  AttendeeBlockedSlot, Company, Investor, Meeting, MeetingBlocklistEntry,
} from "@/lib/types";
import { PageTitle } from "@/components/SectionHeader";
import { AutoMatchClient, type SlotLabel, type ProposalRow } from "./AutoMatchClient";

export const dynamic = "force-dynamic";

export default async function AutoMatchPage({
  params,
}: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireConferenceRole(slug, ["super_admin"]);
  const supabase = await createClient();

  const [
    { data: cosRaw }, { data: invsRaw },
    { data: meetingsRaw }, { data: blockedSlotsRaw }, { data: blocklistRaw },
  ] = await Promise.all([
    supabase.from("companies").select("id, name")
      .eq("conference_id", ctx.conference.id).order("name", { ascending: true }),
    supabase.from("investors").select("id, firm_name")
      .eq("conference_id", ctx.conference.id).order("firm_name", { ascending: true }),
    supabase.from("meetings").select("*")
      .eq("conference_id", ctx.conference.id),
    supabase.from("attendee_blocked_slots").select("*")
      .eq("conference_id", ctx.conference.id),
    supabase.from("meeting_blocklist").select("*")
      .eq("conference_id", ctx.conference.id),
  ]);

  const companies = ((cosRaw ?? []) as Pick<Company, "id" | "name">[])
    .map(c => ({ id: c.id, name: c.name || "—" }));
  const investors = ((invsRaw ?? []) as Pick<Investor, "id" | "firm_name">[])
    .map(i => ({ id: i.id, name: i.firm_name || "—" }));

  // 14 real meeting slots (lunch excluded).
  const slots = slotsForPlatform(ctx.conference).filter(s => !s.isLunch);
  const slotIsos = slots.map(s => s.start.toISOString());
  const slotLabels: SlotLabel[] = slots.map(s => ({
    iso: s.start.toISOString(),
    label: formatSlotRange(s.start, s.end, ctx.conference.timezone),
  }));

  // Bucket existing meetings into slot ISOs.
  const acceptedMeetings: Array<{ company_id: string; investor_id: string; slot_iso: string }> = [];
  for (const m of (meetingsRaw ?? []) as Meeting[]) {
    if (m.status !== "accepted" || !m.scheduled_time) continue;
    const t = new Date(m.scheduled_time).getTime();
    for (const s of slots) {
      if (t >= s.start.getTime() && t < s.end.getTime()) {
        acceptedMeetings.push({
          company_id: m.company_id, investor_id: m.investor_id,
          slot_iso: s.start.toISOString(),
        });
        break;
      }
    }
  }

  const blockedSlots: Array<{ lead_type: "company" | "investor"; lead_id: string; slot_iso: string }> = [];
  for (const bs of (blockedSlotsRaw ?? []) as AttendeeBlockedSlot[]) {
    const t = new Date(bs.slot_time).getTime();
    for (const s of slots) {
      if (t >= s.start.getTime() && t < s.end.getTime()) {
        blockedSlots.push({ lead_type: bs.lead_type, lead_id: bs.lead_id, slot_iso: s.start.toISOString() });
        break;
      }
    }
  }

  const blocklist = ((blocklistRaw ?? []) as MeetingBlocklistEntry[]).map(b => ({
    from_lead_type: b.from_lead_type, from_lead_id: b.from_lead_id,
    to_lead_type: b.to_lead_type, to_lead_id: b.to_lead_id,
  }));

  // Run matcher once with seed=1 for initial render.
  const result = autoMatch({
    companies, investors, acceptedMeetings, blockedSlots, blocklist,
    slotIsos, seed: 1, replaceAll: false,
  });

  const initialProposals: ProposalRow[] = result.proposals.map(p => ({
    company_id: p.company_id, company_name: p.company_name,
    investor_id: p.investor_id, investor_name: p.investor_name,
    slot_iso: p.slot_iso,
  }));

  return (
    <div className="space-y-5">
      <PageTitle title="Auto-match meetings" sub="Fill open slots automatically, then review before saving" />
      <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        Proposes meeting assignments for every unmatched (company, investor) pair.
        Review the preview, then <strong>Confirm all</strong> to write them as accepted
        meetings. <strong>Regenerate</strong> re-shuffles the ordering so you can
        preview a different distribution. Existing accepted meetings and
        blocklist entries are respected.
      </div>

      <AutoMatchClient
        slug={slug}
        conferenceId={ctx.conference.id}
        slotLabels={slotLabels}
        slotIsos={slotIsos}
        companies={companies}
        investors={investors}
        acceptedMeetings={acceptedMeetings}
        blockedSlots={blockedSlots}
        blocklist={blocklist}
        initialProposals={initialProposals}
        initialCompanyCounts={result.companyMeetingCount}
        initialInvestorCounts={result.investorMeetingCount}
      />
    </div>
  );
}
