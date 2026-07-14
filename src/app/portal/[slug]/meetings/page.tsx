/**
 * /portal/[slug]/meetings — directory of the OPPOSITE side.
 *   * Companies see investors, investors see companies.
 *   * Each row is expandable-by-visit: click Request meeting →
 *     /portal/[slug]/meetings/new?with=<id>. If an existing meeting exists
 *     with the other party, the row links to it instead.
 *
 * Kept as a straightforward server-rendered table for the MVP; the
 * "expandable" bio is inline under each row so an attendee can scan the
 * whole list without extra clicks.
 */
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPortalContext } from "@/lib/portal";
import { PageTitle } from "@/components/SectionHeader";
import type { Company, Investor, Meeting } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MeetingsDirectoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getPortalContext(slug);
  const supabase = await createClient();

  const otherTable = ctx.side === "company" ? "investors" : "companies";
  const otherColumn = ctx.side === "company" ? "investor_id" : "company_id";
  const oppositeLabel = ctx.side === "company" ? "Investors" : "Companies";

  const { data: peers } = await supabase.from(otherTable).select("*")
    .eq("conference_id", ctx.conference.id).order(ctx.side === "company" ? "firm_name" : "name");

  // Existing meetings on this side, keyed by the OTHER lead id.
  const { data: meetings } = await supabase.from("meetings").select("*")
    .eq("conference_id", ctx.conference.id)
    .eq(ctx.side === "company" ? "company_id" : "investor_id", ctx.attendee.lead_id);

  const byOther = new Map<string, Meeting>();
  for (const m of ((meetings ?? []) as Meeting[])) {
    const key = m[otherColumn as keyof Meeting] as string;
    byOther.set(key, m);
  }

  const peerList = (peers ?? []) as (Company | Investor)[];

  return (
    <div className="space-y-6">
      <PageTitle title={oppositeLabel}
        sub={`Browse ${oppositeLabel.toLowerCase()} attending this conference and request meetings.`} />

      {peerList.length === 0 ? (
        <div className="border border-line bg-white p-8 text-center text-sm text-muted">
          No {oppositeLabel.toLowerCase()} listed yet. Check back closer to the event.
        </div>
      ) : (
        <div className="border border-line bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-[10px] uppercase tracking-widest2 text-muted">
              <tr>
                <th className="px-4 py-3">{ctx.side === "company" ? "Firm" : "Company"}</th>
                <th className="px-4 py-3 hidden md:table-cell">Contact</th>
                <th className="px-4 py-3 w-64 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {peerList.map(p => {
                const isCompanySide = ctx.side === "investor"; // rendering companies for investor
                const name = isCompanySide ? (p as Company).name : (p as Investor).firm_name;
                const meeting = byOther.get(p.id);
                return (
                  <tr key={p.id} className="border-t border-line align-top">
                    <td className="px-4 py-4">
                      <div className="font-display text-base font-bold text-ink">{name}</div>
                      {isCompanySide
                        ? (p as Company).industry && <div className="text-[10px] uppercase tracking-widest2 text-muted">{(p as Company).industry}</div>
                        : (p as Investor).investor_type && <div className="text-[10px] uppercase tracking-widest2 text-muted">{(p as Investor).investor_type}</div>}
                      {p.about && <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-ink/80">{p.about}</p>}
                      {isCompanySide && (p as Company).website && (
                        <a href={(p as Company).website ?? undefined} target="_blank" rel="noreferrer"
                          className="mt-2 inline-block text-[11px] text-brand-accent hover:underline">
                          {(p as Company).website}
                        </a>
                      )}
                      {!isCompanySide && (p as Investor).investment_criteria && (
                        <p className="mt-2 text-xs italic text-ink/70 whitespace-pre-line">
                          Looking for: {(p as Investor).investment_criteria}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-4 hidden md:table-cell">
                      <div className="text-sm text-ink">{p.contact_name ?? "—"}</div>
                      <div className="text-xs text-muted">{p.contact_title ?? ""}</div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      {meeting
                        ? (
                          <Link href={`/portal/${slug}/meetings/${meeting.id}`}
                            className="inline-block border border-line bg-white px-3 py-2 text-[10px] font-semibold uppercase tracking-widest2 text-ink hover:border-ink">
                            {statusLabel(meeting.status)} →
                          </Link>
                        )
                        : (
                          <Link href={`/portal/${slug}/meetings/new?with=${p.id}`}
                            className="inline-block bg-ink px-3 py-2 text-[10px] font-semibold uppercase tracking-widest2 text-white hover:bg-brand-accent">
                            Request meeting
                          </Link>
                        )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function statusLabel(s: Meeting["status"]): string {
  return s === "proposed" ? "Proposed"
    : s === "countered"  ? "Countered"
    : s === "accepted"   ? "Confirmed"
    : s === "declined"   ? "Declined"
    : "Cancelled";
}
