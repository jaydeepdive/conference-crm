/**
 * /conferences/[slug]/platform/directory — list of the OPPOSITE side.
 * Company attendees see investors; investor attendees see companies.
 * Rows the viewer already has an active meeting with are hidden; declined/
 * cancelled meetings show a "Request again" affordance.
 */
import { createClient } from "@/lib/supabase/server";
import { requirePlatformContext } from "@/lib/platform";
import type { Company, Investor, Meeting, MeetingBlocklistEntry } from "@/lib/types";
import { DirectoryClient } from "./DirectoryClient";

export const dynamic = "force-dynamic";

export default async function DirectoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requirePlatformContext(slug);
  const supabase = await createClient();

  const otherTable = ctx.side === "company" ? "investors" : "companies";
  const otherColumn = ctx.side === "company" ? "investor_id" : "company_id";
  const otherSide: "company" | "investor" = ctx.side === "company" ? "investor" : "company";
  const orderCol = otherSide === "company" ? "name" : "firm_name";

  const { data: peers } = await supabase.from(otherTable).select("*")
    .eq("conference_id", ctx.conference.id).order(orderCol);

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

  type Peer = Company | Investor;
  interface Row {
    id: string;
    name: string;
    sub: string | null;
    about: string | null;
    meeting: { id: string; status: Meeting["status"] } | null;
    blocked: boolean;
  }
  const rows: Row[] = (peers ?? []).map(p => {
    const peer = p as Peer;
    const isInvestor = otherSide === "investor";
    return {
      id: peer.id,
      name: isInvestor ? (peer as Investor).firm_name : (peer as Company).name,
      sub: isInvestor
        ? (peer as Investor).investor_type
        : (peer as Company).industry,
      about: isInvestor
        ? (peer as Investor).investment_criteria ?? peer.about
        : peer.about,
      meeting: meetingByOther.get(peer.id) ?? null,
      blocked: blockedOtherIds.has(peer.id),
    };
  });

  return <DirectoryClient slug={slug} otherSide={otherSide} rows={rows} />;
}
