/**
 * /portal/[slug]/inbox — meetings currently awaiting the caller's response.
 * Includes: proposals + counter-proposals where the OTHER side made the last
 * move. Everything else lives on /schedule or /meetings.
 */
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPortalContext } from "@/lib/portal";
import { PageTitle } from "@/components/SectionHeader";
import { formatMeetingDateTime } from "@/lib/slots";
import type { Company, Investor, Meeting } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function InboxPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getPortalContext(slug);
  const supabase = await createClient();

  const sideColumn = ctx.side === "company" ? "company_id" : "investor_id";
  const { data: meetings } = await supabase.from("meetings").select("*")
    .eq("conference_id", ctx.conference.id)
    .eq(sideColumn, ctx.attendee.lead_id)
    .in("status", ["proposed", "countered"]);
  const list = (meetings ?? []) as Meeting[];

  const awaitingMe = list.filter(m => m.proposed_by !== null && m.proposed_by !== ctx.side);
  const awaitingOther = list.filter(m => m.proposed_by === ctx.side);

  // Resolve other-side names.
  const otherIds = list.map(m => ctx.side === "company" ? m.investor_id : m.company_id);
  const otherTable = ctx.side === "company" ? "investors" : "companies";
  const { data: others } = otherIds.length
    ? await supabase.from(otherTable).select("*").in("id", otherIds)
    : { data: [] as (Company | Investor)[] };
  const byId = new Map((others ?? []).map(o => [o.id, o as Company | Investor]));

  return (
    <div className="space-y-10">
      <PageTitle title="Inbox" sub="Meeting requests waiting on you." />

      <InboxSection title="Awaiting your response" meetings={awaitingMe} slug={slug}
        timezone={ctx.conference.timezone} side={ctx.side} byOther={byId}
        empty="You're all caught up." accent />

      <InboxSection title="Awaiting the other side" meetings={awaitingOther} slug={slug}
        timezone={ctx.conference.timezone} side={ctx.side} byOther={byId}
        empty="Nothing pending on your side." />
    </div>
  );
}

function InboxSection({
  title, meetings, slug, timezone, side, byOther, empty, accent,
}: {
  title: string;
  meetings: Meeting[];
  slug: string;
  timezone: string;
  side: "company" | "investor";
  byOther: Map<string, Company | Investor>;
  empty: string;
  accent?: boolean;
}) {
  return (
    <section>
      <div className="section-rule flex items-end justify-between">
        <h2 className="font-display text-[26px] font-bold leading-none text-ink">{title}</h2>
        <span className="text-[11px] font-medium uppercase tracking-widest2 text-muted">{meetings.length}</span>
      </div>
      {meetings.length === 0 ? (
        <div className="mt-4 border border-line bg-white p-6 text-center text-sm text-muted">{empty}</div>
      ) : (
        <ul className="mt-4 border border-line bg-white">
          {meetings.map(m => {
            const other = byOther.get(side === "company" ? m.investor_id : m.company_id);
            const name = other
              ? (side === "company" ? (other as Investor).firm_name : (other as Company).name)
              : "—";
            return (
              <li key={m.id} className={`flex items-start justify-between gap-4 border-t border-line px-5 py-4 first:border-t-0 ${accent ? "hover:bg-brand-accent/5" : "hover:bg-utility"}`}>
                <div>
                  <Link href={`/portal/${slug}/meetings/${m.id}`}
                    className="font-medium text-ink hover:text-brand-accent">{name}</Link>
                  <div className="mt-1 text-[10px] uppercase tracking-widest2 text-muted">
                    {m.status === "countered" ? "Counter-proposal" : "Proposal"} · {m.proposed_time ? formatMeetingDateTime(new Date(m.proposed_time), timezone) : "—"}
                  </div>
                  {m.notes && <p className="mt-2 text-xs text-ink/70 whitespace-pre-line">{m.notes}</p>}
                </div>
                <Link href={`/portal/${slug}/meetings/${m.id}`}
                  className="whitespace-nowrap border border-line bg-white px-3 py-2 text-[10px] font-semibold uppercase tracking-widest2 text-ink hover:border-ink">
                  Respond →
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
