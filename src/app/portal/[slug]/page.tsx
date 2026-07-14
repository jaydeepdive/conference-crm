/**
 * /portal/[slug] — the attendee's home dashboard.
 * Greeting + quick counts: inbox waiting on you, upcoming meetings today,
 * unpaid invoices. Everything is a link into the deeper page.
 */
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPortalContext, leadDisplayName } from "@/lib/portal";
import { PageTitle, SectionHeader } from "@/components/SectionHeader";
import { formatMeetingDateTime } from "@/lib/slots";
import type { Meeting, MeetingStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PortalDashboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getPortalContext(slug);
  const supabase = await createClient();

  const sideColumn = ctx.side === "company" ? "company_id" : "investor_id";

  const [{ data: meetings }, { data: invoices }] = await Promise.all([
    supabase.from("meetings").select("*")
      .eq("conference_id", ctx.conference.id)
      .eq(sideColumn, ctx.attendee.lead_id),
    supabase.from("invoices").select("id,invoice_number,status,total,currency,due_date")
      .eq("lead_type", ctx.attendee.lead_type).eq("lead_id", ctx.attendee.lead_id),
  ]);

  const list = (meetings ?? []) as Meeting[];
  const counts: Record<MeetingStatus, number> = {
    proposed: 0, countered: 0, accepted: 0, declined: 0, cancelled: 0,
  };
  for (const m of list) counts[m.status] += 1;

  // Inbox = meetings where the other side just made the most recent move.
  const inboxCount = list.filter(m => {
    if (m.status !== "proposed" && m.status !== "countered") return false;
    return m.proposed_by !== null && m.proposed_by !== ctx.side;
  }).length;

  const now = Date.now();
  const upcoming = list.filter(m => m.status === "accepted" && m.scheduled_time && new Date(m.scheduled_time).getTime() >= now - 60 * 60 * 1000)
    .sort((a, b) => (a.scheduled_time ?? "").localeCompare(b.scheduled_time ?? ""))
    .slice(0, 5);

  const unpaidInvoices = (invoices ?? []).filter(i => i.status !== "paid" && i.status !== "void");
  const totalUnpaid = unpaidInvoices.reduce((a, i) => a + Number(i.total ?? 0), 0);

  const displayName = leadDisplayName(ctx.lead, ctx.side);

  return (
    <div className="space-y-10">
      <PageTitle title={`Welcome, ${ctx.attendee.full_name ?? ctx.attendee.email}`}
        sub={`${displayName} · ${ctx.conference.name}`} />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          href={`/portal/${slug}/inbox`}
          label="Inbox — awaiting your reply"
          value={inboxCount}
          accent={inboxCount > 0} />
        <StatCard
          href={`/portal/${slug}/schedule`}
          label="Upcoming meetings"
          value={counts.accepted} />
        <StatCard
          href={`/portal/${slug}/invoices`}
          label="Unpaid invoices"
          value={unpaidInvoices.length}
          hint={totalUnpaid > 0 ? `$${totalUnpaid.toLocaleString()} outstanding` : undefined} />
      </div>

      <section>
        <SectionHeader title="Your next meetings" meta={upcoming.length > 0 ? undefined : "None scheduled"} />
        {upcoming.length === 0 ? (
          <div className="mt-4 border border-line bg-white p-8 text-center text-sm text-muted">
            You have no confirmed meetings yet. Head to{" "}
            <Link href={`/portal/${slug}/meetings`} className="text-brand-accent hover:underline">Meetings</Link>{" "}
            to browse the directory and send a request.
          </div>
        ) : (
          <ul className="mt-4 border border-line bg-white">
            {upcoming.map(m => (
              <li key={m.id} className="flex items-center justify-between border-t border-line px-4 py-3 first:border-t-0">
                <div>
                  <Link href={`/portal/${slug}/meetings/${m.id}`}
                    className="text-sm font-medium text-ink hover:underline">
                    Meeting #{m.id.slice(0, 6)}
                  </Link>
                  <div className="text-[10px] uppercase tracking-widest2 text-muted">
                    {m.scheduled_time ? formatMeetingDateTime(new Date(m.scheduled_time), ctx.conference.timezone) : "—"}
                  </div>
                </div>
                <Link href={`/portal/${slug}/meetings/${m.id}`}
                  className="text-[10px] uppercase tracking-widest2 text-brand-accent hover:underline">Open →</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionHeader title="Meeting status overview" />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <MiniStat label="Proposed" value={counts.proposed} />
          <MiniStat label="Countered" value={counts.countered} />
          <MiniStat label="Accepted" value={counts.accepted} />
          <MiniStat label="Declined" value={counts.declined} />
          <MiniStat label="Cancelled" value={counts.cancelled} />
        </div>
      </section>
    </div>
  );
}

function StatCard({
  href, label, value, accent, hint,
}: {
  href: string; label: string; value: number; accent?: boolean; hint?: string;
}) {
  return (
    <Link href={href}
      className={`block border p-4 transition hover:border-brand-accent ${accent && value > 0 ? "border-brand-accent bg-brand-accent/5" : "border-line bg-white"}`}>
      <div className="text-[10px] font-medium uppercase tracking-widest2 text-muted">{label}</div>
      <div className="mt-2 font-display text-[34px] font-bold leading-none text-ink tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </Link>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-line bg-white p-3">
      <div className="text-[10px] font-medium uppercase tracking-widest2 text-muted">{label}</div>
      <div className="mt-1 font-display text-2xl font-bold text-ink tabular-nums">{value}</div>
    </div>
  );
}
