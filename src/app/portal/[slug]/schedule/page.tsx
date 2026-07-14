/**
 * /portal/[slug]/schedule — day-by-day grid of every slot for the conference,
 * with the caller's confirmed meetings filled in (linkable). Empty slots read
 * "Open" — reserved for lunch or unavailable if outside/on lunch break.
 */
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPortalContext, leadDisplayName } from "@/lib/portal";
import { PageTitle } from "@/components/SectionHeader";
import { generateSlots, groupSlotsByDay, formatDayHeading } from "@/lib/slots";
import type { Company, Investor, Meeting } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SchedulePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getPortalContext(slug);
  const supabase = await createClient();

  const sideColumn = ctx.side === "company" ? "company_id" : "investor_id";
  const { data: meetings } = await supabase.from("meetings").select("*")
    .eq("conference_id", ctx.conference.id)
    .eq(sideColumn, ctx.attendee.lead_id)
    .eq("status", "accepted");
  const list = (meetings ?? []) as Meeting[];

  // Resolve other-party names for confirmed meetings.
  const investorIds = ctx.side === "company" ? list.map(m => m.investor_id) : [];
  const companyIds = ctx.side === "investor" ? list.map(m => m.company_id) : [];
  const [{ data: invs }, { data: cos }] = await Promise.all([
    investorIds.length ? supabase.from("investors").select("id, firm_name, contact_name").in("id", investorIds) : Promise.resolve({ data: [] as (Pick<Investor, "id" | "firm_name" | "contact_name">)[] }),
    companyIds.length ? supabase.from("companies").select("id, name, contact_name").in("id", companyIds) : Promise.resolve({ data: [] as (Pick<Company, "id" | "name" | "contact_name">)[] }),
  ]);
  const invById = new Map((invs ?? []).map(i => [i.id, i]));
  const coById = new Map((cos ?? []).map(c => [c.id, c]));

  const slots = generateSlots({
    date_start: ctx.conference.date_start,
    date_end: ctx.conference.date_end,
    timezone: ctx.conference.timezone,
    meeting_start_time: ctx.conference.meeting_start_time,
    meeting_end_time: ctx.conference.meeting_end_time,
    meeting_lunch_start: ctx.conference.meeting_lunch_start,
    meeting_lunch_end: ctx.conference.meeting_lunch_end,
    meeting_slot_minutes: ctx.conference.meeting_slot_minutes,
    meeting_slot_stride_minutes: ctx.conference.meeting_slot_stride_minutes,
  });
  const grouped = groupSlotsByDay(slots);

  // Bucket confirmed meetings by slot start.
  const byStart = new Map<string, Meeting>();
  for (const m of list) {
    if (!m.scheduled_time) continue;
    const t = new Date(m.scheduled_time).getTime();
    for (const s of slots) {
      if (t >= s.start.getTime() && t < s.end.getTime()) {
        byStart.set(s.start.toISOString(), m);
        break;
      }
    }
  }

  const displayName = leadDisplayName(ctx.lead, ctx.side);

  return (
    <div className="space-y-8">
      <PageTitle title="Your schedule"
        sub={`${displayName} · ${ctx.conference.timezone}`} />

      {grouped.length === 0 && (
        <div className="border border-line bg-white p-8 text-center text-sm text-muted">
          The conference date range isn&rsquo;t set. Contact the organizers.
        </div>
      )}

      {grouped.map(({ day, slots }) => (
        <section key={day}>
          <h2 className="font-display text-xl font-bold text-ink">
            {formatDayHeading(day, ctx.conference.timezone)}
          </h2>
          <div className="mt-3 border border-line bg-white">
            <table className="w-full text-sm">
              <tbody>
                {slots.map(s => {
                  const iso = s.start.toISOString();
                  const m = byStart.get(iso);
                  const other = m
                    ? (ctx.side === "company"
                      ? invById.get(m.investor_id)
                      : coById.get(m.company_id))
                    : undefined;
                  return (
                    <tr key={iso} className="border-t border-line first:border-t-0">
                      <td className="w-32 px-4 py-3 text-[11px] uppercase tracking-widest2 text-muted">{s.label}</td>
                      <td className="px-4 py-3">
                        {s.isLunch ? (
                          <span className="text-xs italic text-muted">Lunch break</span>
                        ) : m && other ? (
                          <Link href={`/portal/${slug}/meetings/${m.id}`}
                            className="block hover:text-brand-accent">
                            <div className="font-medium text-ink">
                              {"firm_name" in other ? other.firm_name : other.name}
                            </div>
                            {other.contact_name && (
                              <div className="text-xs text-muted">{other.contact_name}</div>
                            )}
                          </Link>
                        ) : (
                          <span className="text-xs text-muted">Open</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
