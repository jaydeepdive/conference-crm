/**
 * /conferences/[slug]/platform/meetings/[id] — one meeting's negotiation
 * view. Shows status, actions appropriate to who moved last, and the full
 * event history timeline.
 */
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  requirePlatformContext, leadDisplayName, slotsForPlatform, formatSlotRange,
} from "@/lib/platform";
import type { Company, Investor, Meeting, MeetingEvent } from "@/lib/types";
import { MeetingActions } from "./MeetingActions";
import { AdminMeetingControls } from "./AdminMeetingControls";

export const dynamic = "force-dynamic";

export default async function PlatformMeetingPage({
  params,
}: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const ctx = await requirePlatformContext(slug);
  const supabase = await createClient();

  const { data: meetingRow } = await supabase.from("meetings").select("*")
    .eq("id", id).eq("conference_id", ctx.conference.id).maybeSingle();
  if (!meetingRow) notFound();
  const meeting = meetingRow as Meeting;

  const otherId = ctx.side === "company" ? meeting.investor_id : meeting.company_id;
  const otherTable = ctx.side === "company" ? "investors" : "companies";
  const otherSide: "company" | "investor" = ctx.side === "company" ? "investor" : "company";
  const { data: otherRow } = await supabase.from(otherTable).select("*").eq("id", otherId).maybeSingle();
  const other = (otherRow ?? null) as Company | Investor | null;
  const otherName = other ? leadDisplayName(other, otherSide) : "—";

  const { data: events } = await supabase.from("meeting_events")
    .select("*").eq("meeting_id", id).order("created_at", { ascending: true });
  const log = (events ?? []) as MeetingEvent[];

  // Busy times on both sides, so the Counter picker can hide them.
  const [{ data: otherBusy }, { data: myBusy }] = await Promise.all([
    supabase.from("meetings").select("scheduled_time")
      .eq("conference_id", ctx.conference.id)
      .eq("status", "accepted").neq("id", meeting.id)
      .eq(otherSide === "company" ? "company_id" : "investor_id", otherId),
    supabase.from("meetings").select("scheduled_time")
      .eq("conference_id", ctx.conference.id)
      .eq("status", "accepted").neq("id", meeting.id)
      .eq(ctx.side === "company" ? "company_id" : "investor_id", ctx.attendee.lead_id),
  ]);
  const busyIsoSet = new Set<string>();
  const slots = slotsForPlatform(ctx.conference);
  for (const b of [...(otherBusy ?? []), ...(myBusy ?? [])] as Pick<Meeting, "scheduled_time">[]) {
    if (!b.scheduled_time) continue;
    const t = new Date(b.scheduled_time).getTime();
    for (const s of slots) {
      if (t >= s.start.getTime() && t < s.end.getTime()) { busyIsoSet.add(s.start.toISOString()); break; }
    }
  }
  const slotOptions = slots.filter(s => !s.isLunch).map(s => ({
    iso: s.start.toISOString(),
    label: formatSlotRange(s.start, s.end, ctx.conference.timezone),
    busy: busyIsoSet.has(s.start.toISOString()),
  }));

  function slotLabel(iso: string | null): string {
    if (!iso) return "—";
    const t = new Date(iso).getTime();
    for (const s of slots) {
      if (t >= s.start.getTime() && t < s.end.getTime()) {
        return formatSlotRange(s.start, s.end, ctx.conference.timezone);
      }
    }
    return new Intl.DateTimeFormat("en-US", {
      timeZone: ctx.conference.timezone, dateStyle: "medium", timeStyle: "short",
    }).format(new Date(iso));
  }

  const isMine = meeting.proposed_by === ctx.side;

  return (
    <div className="space-y-5">
      <section>
        <div className="text-xs uppercase tracking-wide text-slate-500">
          {otherSide === "investor" ? "Investor" : "Company"}
        </div>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">{otherName}</h1>
        {other?.contact_name && (
          <div className="mt-1 text-sm text-slate-600">
            {other.contact_name}{other.contact_title ? ` · ${other.contact_title}` : ""}
          </div>
        )}
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-4">
        <StatusLine meeting={meeting} isMine={isMine} slotLabel={slotLabel} />
        <MeetingActions
          slug={slug}
          meeting={meeting}
          mySide={ctx.side}
          slotOptions={slotOptions}
        />
      </section>

      {ctx.isAdmin && (
        <AdminMeetingControls
          meetingId={meeting.id}
          currentLocation={meeting.location ?? null}
          slotOptions={slotOptions}
        />
      )}

      <section className="rounded-md border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">History</h2>
        </div>
        {log.length === 0 ? (
          <div className="px-4 py-5 text-sm text-slate-500">No events yet.</div>
        ) : (
          <ol className="divide-y divide-slate-100">
            {log.map(e => (
              <li key={e.id} className="px-4 py-3">
                <div className="text-sm font-medium text-slate-900">{eventLabel(e.kind)}</div>
                <div className="text-xs text-slate-500">
                  {e.actor_side && (
                    <span className="mr-2 uppercase tracking-wide">
                      {e.actor_side === ctx.side ? "You" : e.actor_side}
                    </span>
                  )}
                  {new Date(e.created_at).toLocaleString()}
                </div>
                {e.proposed_time && (
                  <div className="mt-1 text-xs text-slate-700">
                    Proposed: {slotLabel(e.proposed_time)}
                  </div>
                )}
                {e.body && <p className="mt-1 whitespace-pre-line text-xs text-slate-600">{e.body}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function StatusLine({
  meeting, isMine, slotLabel,
}: {
  meeting: Meeting; isMine: boolean; slotLabel: (iso: string | null) => string;
}) {
  if (meeting.status === "accepted") {
    return (
      <div>
        <div className="text-sm text-slate-500">Confirmed for</div>
        <div className="mt-1 text-lg font-semibold text-slate-900">{slotLabel(meeting.scheduled_time)}</div>
        <div className="mt-1 text-sm text-slate-600">
          {meeting.location ? `Location: ${meeting.location}` : "Table TBA"}
        </div>
      </div>
    );
  }
  if (meeting.status === "declined") {
    return <div className="text-sm text-slate-700">This request was declined.</div>;
  }
  if (meeting.status === "cancelled") {
    return <div className="text-sm text-slate-700">This meeting was cancelled.</div>;
  }
  // proposed / countered
  return (
    <div>
      <div className="text-sm text-slate-500">
        {isMine ? "You proposed" : "They proposed"}
      </div>
      <div className="mt-1 text-lg font-semibold text-slate-900">{slotLabel(meeting.proposed_time)}</div>
      {meeting.notes && (
        <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{meeting.notes}</p>
      )}
    </div>
  );
}

function eventLabel(k: MeetingEvent["kind"]): string {
  return k === "propose" ? "Proposed a time"
    : k === "counter"  ? "Countered with a new time"
    : k === "accept"   ? "Accepted"
    : k === "decline"  ? "Declined"
    : k === "cancel"   ? "Cancelled"
    : "Note";
}
