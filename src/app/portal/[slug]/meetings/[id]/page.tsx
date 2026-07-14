/**
 * /portal/[slug]/meetings/[id] — negotiation view for one meeting.
 * Shows current status, other-party info, full event log, and the action
 * buttons appropriate to the current state (Accept / Counter / Decline /
 * Cancel). The Counter action lets the user pick a new time from the same
 * slot picker as /meetings/new.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortalContext, leadDisplayName } from "@/lib/portal";
import { PageTitle } from "@/components/SectionHeader";
import type { Company, Investor, Meeting, MeetingEvent } from "@/lib/types";
import { MeetingActions } from "./MeetingActions";

export const dynamic = "force-dynamic";

export default async function MeetingDetailPage({
  params,
}: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const ctx = await getPortalContext(slug);
  const supabase = await createClient();

  const { data: meetingRow } = await supabase.from("meetings").select("*")
    .eq("id", id).eq("conference_id", ctx.conference.id).maybeSingle();
  if (!meetingRow) notFound();
  const meeting = meetingRow as Meeting;

  // Which side is the other party?
  const otherId = ctx.side === "company" ? meeting.investor_id : meeting.company_id;
  const otherTable = ctx.side === "company" ? "investors" : "companies";
  const { data: otherRow } = await supabase.from(otherTable).select("*").eq("id", otherId).maybeSingle();
  const otherLead = (otherRow ?? null) as Company | Investor | null;
  const otherSide = ctx.side === "company" ? "investor" : "company";
  const otherName = otherLead ? leadDisplayName(otherLead, otherSide) : "—";

  const { data: events } = await supabase.from("meeting_events")
    .select("*").eq("meeting_id", id).order("created_at", { ascending: true });
  const log = (events ?? []) as MeetingEvent[];

  // Other party's busy schedule (accepted meetings only), so the Counter picker
  // can shade them out.
  const { data: otherBusy } = await supabase.from("meetings").select("scheduled_time")
    .eq("conference_id", ctx.conference.id)
    .eq("status", "accepted")
    .neq("id", meeting.id)
    .eq(otherSide === "company" ? "company_id" : "investor_id", otherId);
  const { data: myBusy } = await supabase.from("meetings").select("scheduled_time")
    .eq("conference_id", ctx.conference.id)
    .eq("status", "accepted")
    .neq("id", meeting.id)
    .eq(ctx.side === "company" ? "company_id" : "investor_id", ctx.attendee.lead_id);
  const busy = [
    ...((otherBusy ?? []) as { scheduled_time: string | null }[]),
    ...((myBusy ?? []) as { scheduled_time: string | null }[]),
  ].map(b => b.scheduled_time).filter((t): t is string => !!t);

  return (
    <div className="space-y-8">
      <div>
        <Link href={`/portal/${slug}/meetings`} className="text-[11px] uppercase tracking-widest2 text-muted hover:text-ink">
          ← Meetings directory
        </Link>
        <PageTitle title={`Meeting with ${otherName}`}
          sub={`Status: ${statusText(meeting.status)}${meeting.proposed_by ? ` · last move by ${meeting.proposed_by === ctx.side ? "you" : "them"}` : ""}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <MeetingActions
            slug={slug}
            meeting={meeting}
            mySide={ctx.side}
            timezone={ctx.conference.timezone}
            conferenceForPicker={{
              date_start: ctx.conference.date_start,
              date_end: ctx.conference.date_end,
              timezone: ctx.conference.timezone,
              meeting_start_time: ctx.conference.meeting_start_time,
              meeting_end_time: ctx.conference.meeting_end_time,
              meeting_lunch_start: ctx.conference.meeting_lunch_start,
              meeting_lunch_end: ctx.conference.meeting_lunch_end,
              meeting_slot_minutes: ctx.conference.meeting_slot_minutes,
              meeting_slot_stride_minutes: ctx.conference.meeting_slot_stride_minutes,
            }}
            busySlots={busy}
          />

          <section className="border border-line bg-white p-6">
            <h3 className="text-[11px] font-semibold uppercase tracking-widest2 text-muted">Event log</h3>
            <ol className="mt-3 space-y-3">
              {log.map(e => (
                <li key={e.id} className="border-l-2 border-line pl-3">
                  <div className="text-xs font-medium text-ink">
                    {eventLabel(e.kind)}
                    {e.actor_side && <span className="ml-2 text-[10px] uppercase tracking-widest2 text-muted">{e.actor_side}</span>}
                  </div>
                  <div className="text-[10px] uppercase tracking-widest2 text-muted">{new Date(e.created_at).toLocaleString()}</div>
                  {e.proposed_time && (
                    <div className="mt-1 text-xs text-ink">Proposed time: {new Intl.DateTimeFormat("en-US", { timeZone: ctx.conference.timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(e.proposed_time))}</div>
                  )}
                  {e.body && <p className="mt-1 whitespace-pre-line text-xs text-ink/80">{e.body}</p>}
                </li>
              ))}
              {log.length === 0 && <li className="text-xs text-muted">No events yet.</li>}
            </ol>
          </section>
        </div>

        <aside className="space-y-6">
          <div className="border border-line bg-white p-5">
            <div className="text-[10px] uppercase tracking-widest2 text-muted">
              {otherSide === "investor" ? "Investor" : "Company"}
            </div>
            <div className="mt-1 font-display text-lg font-bold text-ink">{otherName}</div>
            {otherLead?.contact_name && <div className="mt-2 text-sm text-ink">{otherLead.contact_name}</div>}
            {otherLead?.contact_title && <div className="text-xs text-muted">{otherLead.contact_title}</div>}
            {otherLead?.about && <p className="mt-3 whitespace-pre-line text-xs text-ink/70">{otherLead.about}</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}

function statusText(s: Meeting["status"]): string {
  return s === "proposed" ? "Proposed"
    : s === "countered" ? "Countered"
    : s === "accepted" ? "Confirmed"
    : s === "declined" ? "Declined"
    : "Cancelled";
}
function eventLabel(k: MeetingEvent["kind"]): string {
  return k === "propose" ? "Proposed a time"
    : k === "counter" ? "Countered with a new time"
    : k === "accept" ? "Accepted"
    : k === "decline" ? "Declined"
    : k === "cancel" ? "Cancelled"
    : "Note";
}
