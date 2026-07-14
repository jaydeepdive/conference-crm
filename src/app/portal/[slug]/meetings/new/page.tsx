/**
 * /portal/[slug]/meetings/new?with=<other-lead-id> — request a new meeting.
 *
 * Loads:
 *   - The other party's public profile (for header context).
 *   - Every already-accepted meeting for the other party in this conference
 *     (their existing schedule). We serialize just the scheduled_time values
 *     so we don't leak *who* they're meeting with — the picker uses these
 *     purely to shade slots as unavailable.
 *   - The caller's own accepted meetings so they can't double-book themselves.
 *
 * Slot generation happens in the browser (in the client component) so it can
 * re-run when the user filters by day / clicks a slot.
 */
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortalContext, leadDisplayName } from "@/lib/portal";
import { PageTitle } from "@/components/SectionHeader";
import type { Company, Investor, Meeting } from "@/lib/types";
import { NewMeetingForm } from "./NewMeetingForm";

export const dynamic = "force-dynamic";

export default async function NewMeetingPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ with?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  if (!sp.with) notFound();
  const otherId: string = sp.with!;

  const ctx = await getPortalContext(slug);
  const supabase = await createClient();

  const otherTable = ctx.side === "company" ? "investors" : "companies";
  const { data: other } = await supabase.from(otherTable).select("*").eq("id", otherId)
    .eq("conference_id", ctx.conference.id).maybeSingle();
  if (!other) notFound();
  const otherLead = other as Company | Investor;
  const otherSide = ctx.side === "company" ? "investor" : "company";
  const otherName = leadDisplayName(otherLead, otherSide);

  // Already have a meeting with this counterparty? Bounce to it.
  const { data: existing } = await supabase.from("meetings").select("id")
    .eq("conference_id", ctx.conference.id)
    .eq("company_id", ctx.side === "company" ? ctx.attendee.lead_id : otherId)
    .eq("investor_id", ctx.side === "investor" ? ctx.attendee.lead_id : otherId)
    .maybeSingle();
  if (existing) redirect(`/portal/${slug}/meetings/${existing.id}`);

  // Busy times for both sides (only accepted meetings — proposals don't block).
  const { data: otherBusy } = await supabase.from("meetings").select("scheduled_time")
    .eq("conference_id", ctx.conference.id)
    .eq("status", "accepted")
    .eq(otherSide === "company" ? "company_id" : "investor_id", otherId);
  const { data: myBusy } = await supabase.from("meetings").select("scheduled_time")
    .eq("conference_id", ctx.conference.id)
    .eq("status", "accepted")
    .eq(ctx.side === "company" ? "company_id" : "investor_id", ctx.attendee.lead_id);

  const busy = [
    ...((otherBusy ?? []) as Pick<Meeting, "scheduled_time">[]),
    ...((myBusy ?? []) as Pick<Meeting, "scheduled_time">[]),
  ];

  return (
    <div className="space-y-8">
      <PageTitle title="Request a meeting" sub={`with ${otherName}`} />

      <NewMeetingForm
        slug={slug}
        otherLeadId={otherId}
        otherLeadType={otherSide}
        otherName={otherName}
        conference={{
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
        busySlots={busy.map(b => b.scheduled_time).filter((t): t is string => !!t)}
      />
    </div>
  );
}
