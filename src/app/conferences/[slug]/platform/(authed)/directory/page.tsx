/**
 * /conferences/[slug]/platform/directory — list of the OPPOSITE side.
 * Company attendees see investors; investor attendees see companies.
 * Only companies/investors that actually have people attending are listed.
 *
 * ?slot=<ISO start> (from tapping an open time on Schedule) narrows the list
 * to those FREE at that time, and the request form pre-selects that slot.
 */
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  publicLeadColumns, requirePlatformContext, slotsForPlatform, formatSlotRange,
  busySlotsByLead, attendingLeadIds,
} from "@/lib/platform";
import type { Company, Investor, Meeting, MeetingBlocklistEntry } from "@/lib/types";
import { DirectoryClient } from "./DirectoryClient";

export const dynamic = "force-dynamic";

export default async function DirectoryPage({
  params, searchParams,
}: { params: Promise<{ slug: string }>; searchParams: Promise<{ slot?: string }> }) {
  const { slug } = await params;
  const { slot } = await searchParams;
  const ctx = await requirePlatformContext(slug);
  const supabase = await createClient();

  const otherTable = ctx.side === "company" ? "investors" : "companies";
  const otherColumn = ctx.side === "company" ? "investor_id" : "company_id";
  const otherSide: "company" | "investor" = ctx.side === "company" ? "investor" : "company";
  const orderCol = otherSide === "company" ? "name" : "firm_name";

  const [{ data: peers }, attending] = await Promise.all([
    createServiceClient().from(otherTable).select(publicLeadColumns(otherSide))
      .eq("conference_id", ctx.conference.id).order(orderCol),
    attendingLeadIds(ctx.conference.id, otherSide),
  ]);

  const { data: meetings } = await supabase.from("meetings")
    .select("id, status, company_id, investor_id")
    .eq("conference_id", ctx.conference.id)
    .eq(ctx.side === "company" ? "company_id" : "investor_id", ctx.attendee.lead_id);

  const meetingByOther = new Map<string, Pick<Meeting, "id" | "status">>();
  for (const m of (meetings ?? [])) {
    const key = (m as unknown as Record<string, string>)[otherColumn];
    meetingByOther.set(key, { id: m.id as string, status: m.status as Meeting["status"] });
  }

  // Blocklist either direction involving me.
  const { data: blocklistRows } = await supabase.from("meeting_blocklist")
    .select("*")
    .eq("conference_id", ctx.conference.id)
    .or(
      `and(from_lead_type.eq.${ctx.side},from_lead_id.eq.${ctx.attendee.lead_id}),` +
      `and(to_lead_type.eq.${ctx.side},to_lead_id.eq.${ctx.attendee.lead_id})`,
    );
  const blockedOtherIds = new Set<string>();
  for (const b of (blocklistRows ?? []) as MeetingBlocklistEntry[]) {
    const otherId = b.from_lead_id === ctx.attendee.lead_id ? b.to_lead_id : b.from_lead_id;
    blockedOtherIds.add(otherId);
  }

  // Slot filter.
  const slotObj = slot ? slotsForPlatform(ctx.conference).find(s => !s.isLunch && s.start.toISOString() === slot) : undefined;
  let slotInfo: { iso: string; label: string; meBusy: boolean } | null = null;
  let otherBusy: Map<string, Set<string>> | null = null;
  if (slotObj) {
    const iso = slotObj.start.toISOString();
    const [ob, mine] = await Promise.all([
      busySlotsByLead(ctx.conference, otherSide),
      busySlotsByLead(ctx.conference, ctx.side),
    ]);
    otherBusy = ob;
    slotInfo = {
      iso,
      label: formatSlotRange(slotObj.start, slotObj.end, ctx.conference.timezone),
      meBusy: !!mine.get(ctx.attendee.lead_id)?.has(iso),
    };
  }

  type Peer = Company | Investor;
  interface Row {
    id: string;
    name: string;
    sub: string | null;
    about: string | null;
    meeting: { id: string; status: Meeting["status"] } | null;
    blocked: boolean;
  }
  const rows: Row[] = (peers ?? [])
    .map(p => p as unknown as Peer)
    .filter(peer => attending.has(peer.id))
    .filter(peer => {
      if (!slotInfo || !otherBusy) return true;
      if (blockedOtherIds.has(peer.id)) return false;
      const m = meetingByOther.get(peer.id);
      if (m && m.status !== "declined" && m.status !== "cancelled") return false;
      return !otherBusy.get(peer.id)?.has(slotInfo.iso);
    })
    .map(peer => {
      const isInvestor = otherSide === "investor";
      return {
        id: peer.id,
        name: isInvestor ? (peer as Investor).firm_name : (peer as Company).name,
        sub: isInvestor ? (peer as Investor).investor_type : (peer as Company).industry,
        about: isInvestor ? (peer as Investor).investment_criteria ?? peer.about : peer.about,
        meeting: meetingByOther.get(peer.id) ?? null,
        blocked: blockedOtherIds.has(peer.id),
      };
    });

  return <DirectoryClient slug={slug} otherSide={otherSide} rows={rows} slot={slotInfo} />;
}
