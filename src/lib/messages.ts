/**
 * Direct messages between registered companies and investors (portal).
 * One thread per company↔investor pair; shared by everyone attending for
 * that company/investor. Tables are service-only — callers must already
 * have resolved the acting attendee (requirePlatformContext /
 * findActingAttendee).
 */
import { createServiceClient } from "@/lib/supabase/service";
import type { AttendeeSide } from "@/lib/types";

export interface PortalMessage {
  id: string;
  sender_side: AttendeeSide;
  sender_name: string | null;
  body: string;
  created_at: string;
}

export interface ThreadSummary {
  otherId: string;
  otherName: string;
  last: PortalMessage;
  unread: number;
}

export function pairFor(mySide: AttendeeSide, myLeadId: string, otherId: string) {
  return mySide === "company"
    ? { company_id: myLeadId, investor_id: otherId }
    : { company_id: otherId, investor_id: myLeadId };
}

export async function loadThread(mySide: AttendeeSide, myLeadId: string, otherId: string): Promise<PortalMessage[]> {
  const pair = pairFor(mySide, myLeadId, otherId);
  const { data } = await createServiceClient().from("portal_messages")
    .select("id, sender_side, sender_name, body, created_at")
    .eq("company_id", pair.company_id).eq("investor_id", pair.investor_id)
    .order("created_at", { ascending: true }).limit(500);
  return (data ?? []) as PortalMessage[];
}

export async function markThreadRead(attendeeId: string, mySide: AttendeeSide, myLeadId: string, otherId: string) {
  const pair = pairFor(mySide, myLeadId, otherId);
  await createServiceClient().from("portal_thread_reads").upsert({
    attendee_id: attendeeId, ...pair, last_read_at: new Date().toISOString(),
  });
}

/** All threads for my company/investor, newest first, with my unread counts. */
export async function listThreads(
  conferenceId: string, mySide: AttendeeSide, myLeadId: string, attendeeId: string,
): Promise<ThreadSummary[]> {
  const svc = createServiceClient();
  const myCol = mySide === "company" ? "company_id" : "investor_id";
  const otherCol = mySide === "company" ? "investor_id" : "company_id";
  const otherSide: AttendeeSide = mySide === "company" ? "investor" : "company";
  const [{ data: msgs }, { data: reads }] = await Promise.all([
    svc.from("portal_messages").select("id, company_id, investor_id, sender_side, sender_name, body, created_at")
      .eq("conference_id", conferenceId).eq(myCol, myLeadId).order("created_at", { ascending: false }).limit(2000),
    svc.from("portal_thread_reads").select("company_id, investor_id, last_read_at").eq("attendee_id", attendeeId),
  ]);
  const readAt = new Map((reads ?? []).map(r => [`${r.company_id}:${r.investor_id}`, new Date(r.last_read_at as string).getTime()]));
  const byOther = new Map<string, { last: PortalMessage; unread: number }>();
  for (const m of (msgs ?? []) as (PortalMessage & { company_id: string; investor_id: string })[]) {
    const otherId = (m as unknown as Record<string, string>)[otherCol];
    const key = `${m.company_id}:${m.investor_id}`;
    const isUnread = m.sender_side !== mySide && new Date(m.created_at).getTime() > (readAt.get(key) ?? 0);
    const cur = byOther.get(otherId);
    if (!cur) byOther.set(otherId, { last: m, unread: isUnread ? 1 : 0 });
    else if (isUnread) cur.unread++;
  }
  if (byOther.size === 0) return [];
  const table = otherSide === "company" ? "companies" : "investors";
  const { data: names } = await svc.from(table).select(otherSide === "company" ? "id, name" : "id, firm_name, contact_name")
    .in("id", Array.from(byOther.keys()));
  const nameOf = new Map(((names ?? []) as unknown as Record<string, string>[]).map(n => [n.id, n.name || n.firm_name || n.contact_name || "—"]));
  return Array.from(byOther.entries()).map(([otherId, v]) => ({
    otherId, otherName: nameOf.get(otherId) ?? "—", last: v.last, unread: v.unread,
  }));
}

export async function unreadTotal(conferenceId: string, mySide: AttendeeSide, myLeadId: string, attendeeId: string): Promise<number> {
  const threads = await listThreads(conferenceId, mySide, myLeadId, attendeeId);
  return threads.reduce((n, t) => n + t.unread, 0);
}

/** True if either side has put the other on their do-not-meet list. */
export async function pairBlocked(conferenceId: string, mySide: AttendeeSide, myLeadId: string, otherId: string): Promise<boolean> {
  const otherSide: AttendeeSide = mySide === "company" ? "investor" : "company";
  const { data } = await createServiceClient().from("meeting_blocklist").select("id")
    .eq("conference_id", conferenceId)
    .or(
      `and(from_lead_type.eq.${mySide},from_lead_id.eq.${myLeadId},to_lead_type.eq.${otherSide},to_lead_id.eq.${otherId}),` +
      `and(from_lead_type.eq.${otherSide},from_lead_id.eq.${otherId},to_lead_type.eq.${mySide},to_lead_id.eq.${myLeadId})`,
    ).limit(1);
  return !!(data && data.length);
}
