/**
 * /conferences/[slug]/platform/inbox — meetings awaiting the viewer's reply.
 * The "latest move" is encoded in meetings.proposed_by. We show rows where
 * status is proposed|countered AND proposed_by != our side.
 */
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requirePlatformContext, formatSlotRange, slotsForPlatform } from "@/lib/platform";
import type { Company, Investor, Meeting } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function InboxPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requirePlatformContext(slug);
  const supabase = await createClient();

  const sideColumn = ctx.side === "company" ? "company_id" : "investor_id";
  const otherSide = ctx.side === "company" ? "investor" : "company";

  const { data: meetings } = await supabase.from("meetings").select("*")
    .eq("conference_id", ctx.conference.id)
    .eq(sideColumn, ctx.attendee.lead_id)
    .in("status", ["proposed", "countered"]);
  const list = (meetings ?? []) as Meeting[];
  const waiting = list.filter(m => m.proposed_by !== null && m.proposed_by !== ctx.side);

  const otherIds = waiting.map(m => ctx.side === "company" ? m.investor_id : m.company_id);
  const otherTable = otherSide === "company" ? "companies" : "investors";
  const { data: others } = otherIds.length
    ? await supabase.from(otherTable).select("id, name, firm_name").in("id", otherIds)
    : { data: [] as Array<Pick<Company, "id" | "name"> | Pick<Investor, "id" | "firm_name">> };
  const byId = new Map((others ?? []).map(o => [o.id as string, o as Pick<Company, "id" | "name"> | Pick<Investor, "id" | "firm_name">]));

  const slots = slotsForPlatform(ctx.conference);
  function slotLabel(iso: string | null): string {
    if (!iso) return "—";
    const t = new Date(iso).getTime();
    for (const s of slots) {
      if (t >= s.start.getTime() && t < s.end.getTime()) {
        return formatSlotRange(s.start, s.end, ctx.conference.timezone);
      }
    }
    return new Intl.DateTimeFormat("en-US", {
      timeZone: ctx.conference.timezone, hour: "numeric", minute: "2-digit", hour12: true,
    }).format(new Date(iso));
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Inbox</h1>
        <p className="mt-1 text-sm text-slate-500">Meeting requests waiting on you.</p>
      </div>

      {waiting.length === 0 ? (
        <div className="rounded-md border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
          You&rsquo;re all caught up.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
          {waiting.map(m => {
            const otherId = ctx.side === "company" ? m.investor_id : m.company_id;
            const o = byId.get(otherId);
            const name = o && "firm_name" in o ? o.firm_name : (o?.name ?? "Meeting");
            return (
              <li key={m.id}>
                <Link href={`/conferences/${slug}/platform/meetings/${m.id}`}
                  className="block px-4 py-3 active:bg-slate-50" style={{ minHeight: 48 }}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-900">{name}</div>
                      <div className="text-xs text-slate-500">
                        {m.status === "countered" ? "Countered" : "Proposed"} · {slotLabel(m.proposed_time)}
                      </div>
                      {m.notes && (
                        <p className="mt-1 line-clamp-2 text-xs text-slate-600">{m.notes}</p>
                      )}
                    </div>
                    <div className="text-slate-300">›</div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
