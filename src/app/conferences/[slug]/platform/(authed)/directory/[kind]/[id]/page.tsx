/**
 * /conferences/[slug]/platform/directory/[kind]/[id] — other-party detail
 * and a slot-picker to request a meeting.
 *
 * The slot picker shades slots that overlap:
 *   * the OTHER party's accepted meetings (anonymized — just "Busy")
 *   * the viewer's own accepted meetings
 * Only "accepted" meetings count as busy — pending proposals don't block.
 */
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  requirePlatformContext, leadDisplayName, slotsForPlatform, formatSlotRange,
} from "@/lib/platform";
import type { Company, Investor, Meeting } from "@/lib/types";
import { RequestMeetingForm } from "./RequestMeetingForm";

export const dynamic = "force-dynamic";

export default async function DirectoryDetailPage({
  params,
}: { params: Promise<{ slug: string; kind: string; id: string }> }) {
  const { slug, kind, id } = await params;
  if (kind !== "company" && kind !== "investor") notFound();
  const otherSide = kind as "company" | "investor";

  const ctx = await requirePlatformContext(slug);
  if (ctx.side === otherSide) notFound(); // Must be opposite side.
  const supabase = await createClient();

  const otherTable = otherSide === "company" ? "companies" : "investors";
  const { data: otherRow } = await supabase.from(otherTable).select("*")
    .eq("id", id).eq("conference_id", ctx.conference.id).maybeSingle();
  if (!otherRow) notFound();
  const other = otherRow as Company | Investor;
  const otherName = leadDisplayName(other, otherSide);

  // Existing active meeting? Bounce to its detail page.
  const { data: existing } = await supabase.from("meetings").select("id, status")
    .eq("conference_id", ctx.conference.id)
    .eq("company_id", ctx.side === "company" ? ctx.attendee.lead_id : id)
    .eq("investor_id", ctx.side === "investor" ? ctx.attendee.lead_id : id)
    .maybeSingle();
  if (existing && existing.status !== "declined" && existing.status !== "cancelled") {
    redirect(`/conferences/${slug}/platform/meetings/${existing.id}`);
  }

  // Busy times: only accepted meetings on either side.
  const [{ data: otherBusy }, { data: myBusy }] = await Promise.all([
    supabase.from("meetings").select("scheduled_time")
      .eq("conference_id", ctx.conference.id).eq("status", "accepted")
      .eq(otherSide === "company" ? "company_id" : "investor_id", id),
    supabase.from("meetings").select("scheduled_time")
      .eq("conference_id", ctx.conference.id).eq("status", "accepted")
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

  return (
    <div className="space-y-5">
      <section>
        <h1 className="text-xl font-semibold text-slate-900">{otherName}</h1>
        {other.contact_name && (
          <div className="mt-1 text-sm text-slate-600">
            {other.contact_name}{other.contact_title ? ` · ${other.contact_title}` : ""}
          </div>
        )}
        {other.about && (
          <p className="mt-3 whitespace-pre-line text-sm text-slate-700">{other.about}</p>
        )}
        {otherSide === "investor" && (other as Investor).investment_criteria && (
          <p className="mt-3 whitespace-pre-line text-sm italic text-slate-700">
            Looking for: {(other as Investor).investment_criteria}
          </p>
        )}
      </section>

      <RequestMeetingForm
        slug={slug}
        otherLeadType={otherSide}
        otherLeadId={id}
        otherName={otherName}
        slots={slotOptions}
      />
    </div>
  );
}
