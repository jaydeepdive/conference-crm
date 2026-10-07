/**
 * /conferences/[slug]/platform — the dashboard / schedule home.
 *
 * Shows a greeting, inbox badge, and the day's 14 slot grid with the
 * attendee's status in each slot. Lunch + farewell rows are rendered
 * alongside the real meeting slots.
 */
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  requirePlatformContext, leadDisplayName, slotsForPlatform,
  formatPlatformDayHeading, formatSlotRange, conferenceWallClockToUtc,
  formatTimeInTz,
} from "@/lib/platform";
import type { Company, Investor, Meeting } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PlatformDashboardPage({
  params,
}: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requirePlatformContext(slug);
  const supabase = await createClient();

  const sideColumn = ctx.side === "company" ? "company_id" : "investor_id";
  const otherSide = ctx.side === "company" ? "investor" : "company";

  const { data: meetings } = await supabase.from("meetings").select("*")
    .eq("conference_id", ctx.conference.id)
    .eq(sideColumn, ctx.attendee.lead_id);
  const list = (meetings ?? []) as Meeting[];

  // Resolve other-party names.
  const otherIds = list.map(m => ctx.side === "company" ? m.investor_id : m.company_id);
  const otherTable = otherSide === "company" ? "companies" : "investors";
  const { data: others } = otherIds.length
    ? await supabase.from(otherTable).select("id, name, firm_name").in("id", otherIds)
    : { data: [] as Array<Pick<Company, "id" | "name"> | Pick<Investor, "id" | "firm_name">> };
  const otherById = new Map((others ?? []).map(o => [o.id as string, o as Pick<Company, "id" | "name"> | Pick<Investor, "id" | "firm_name">]));

  const slots = slotsForPlatform(ctx.conference);
  const byStart = new Map<string, Meeting>();
  for (const m of list) {
    const t = m.scheduled_time ?? m.proposed_time;
    if (!t) continue;
    const ts = new Date(t).getTime();
    for (const s of slots) {
      if (ts >= s.start.getTime() && ts < s.end.getTime()) {
        byStart.set(s.start.toISOString(), m);
        break;
      }
    }
  }

  const inboxCount = list.filter(m => {
    if (m.status !== "proposed" && m.status !== "countered") return false;
    return m.proposed_by !== null && m.proposed_by !== ctx.side;
  }).length;

  const entity = leadDisplayName(ctx.lead, ctx.side);
  const dayHeading = formatPlatformDayHeading(ctx.conference);
  const farewellUtc = ctx.conference.farewell_time
    ? conferenceWallClockToUtc(ctx.conference, ctx.conference.farewell_time)
    : null;

  // Build the render list: slot rows + a lunch pseudo-row + a farewell pseudo-row.
  interface Row {
    key: string;
    label: string;
    kind: "slot" | "lunch" | "farewell";
    meeting?: Meeting;
    sortKey: number;
  }
  const rows: Row[] = slots.filter(s => !s.isLunch).map(s => ({
    key: s.start.toISOString(),
    label: formatSlotRange(s.start, s.end, ctx.conference.timezone),
    kind: "slot" as const,
    meeting: byStart.get(s.start.toISOString()),
    sortKey: s.start.getTime(),
  }));
  const lunchSlot = slots.find(s => s.isLunch);
  if (lunchSlot) {
    rows.push({
      key: `lunch-${lunchSlot.start.toISOString()}`,
      label: formatSlotRange(lunchSlot.start, lunchSlot.end, ctx.conference.timezone),
      kind: "lunch", sortKey: lunchSlot.start.getTime(),
    });
  }
  if (farewellUtc) {
    rows.push({
      key: `farewell-${farewellUtc.toISOString()}`,
      label: formatTimeInTz(farewellUtc.toISOString(), ctx.conference.timezone),
      kind: "farewell", sortKey: farewellUtc.getTime(),
    });
  }
  rows.sort((a, b) => a.sortKey - b.sortKey);

  return (
    <div className="space-y-5">
      <section>
        <h1 className="font-serif text-2xl font-semibold text-stone-900">
          Hi, {ctx.attendee.full_name ?? "there"}.
        </h1>
        <p className="mt-1 text-sm text-stone-700">
          You&rsquo;re here as {entity}.
        </p>
      </section>

      <section className="rounded-md border border-stone-300 bg-white/70 p-4"
        style={{ borderLeft: "4px solid #8B4513" }}>
        <div className="font-serif text-sm font-semibold text-stone-900">
          Andaz Scottsdale Resort · Scottsdale, Arizona
        </div>
        <div className="mt-1 text-sm text-stone-700">
          Meeting day is November 24. Doors open at 8 AM.
        </div>
      </section>

      {inboxCount > 0 && (
        <Link href={`/conferences/${slug}/platform/inbox`}
          className="block rounded-md border border-amber-200 bg-amber-50 px-4 py-3"
          style={{ minHeight: 44 }}>
          <div className="text-sm font-medium text-amber-900">
            {inboxCount} meeting {inboxCount === 1 ? "request" : "requests"} waiting for you
          </div>
          <div className="text-xs text-amber-700">Tap to review in your inbox →</div>
        </Link>
      )}

      <section className="rounded-md border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-900">Your schedule</h2>
          <p className="text-xs text-slate-500">{dayHeading}</p>
        </div>
        {rows.length === 0 ? (
          <div className="px-4 py-6 text-sm text-slate-500">
            The meeting day isn&rsquo;t configured yet. Check with the organizers.
          </div>
        ) : (
          <ul>
            {rows.map(r => <ScheduleRow key={r.key} row={r} slug={slug} ctx={ctx} otherById={otherById} />)}
          </ul>
        )}
      </section>
    </div>
  );
}

interface Ctx {
  side: "company" | "investor";
  conference: { timezone: string };
}

function ScheduleRow({
  row, slug, ctx, otherById,
}: {
  row: {
    key: string; label: string; kind: "slot" | "lunch" | "farewell";
    meeting?: Meeting; sortKey: number;
  };
  slug: string;
  ctx: Ctx;
  otherById: Map<string, Pick<Company, "id" | "name"> | Pick<Investor, "id" | "firm_name">>;
}) {
  if (row.kind === "lunch") {
    return (
      <li className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 first:border-t-0">
        <div className="w-28 shrink-0 text-sm tabular-nums text-slate-500">{row.label}</div>
        <div className="flex-1 text-sm italic text-slate-500">Lunch break</div>
      </li>
    );
  }
  if (row.kind === "farewell") {
    return (
      <li className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
        <div className="w-28 shrink-0 text-sm tabular-nums text-slate-500">{row.label}</div>
        <div className="flex-1 text-sm font-medium text-slate-700">Farewell announcement</div>
      </li>
    );
  }
  const m = row.meeting;
  if (m) {
    const otherId = ctx.side === "company" ? m.investor_id : m.company_id;
    const other = otherById.get(otherId);
    const name = other && "firm_name" in other ? other.firm_name : (other?.name ?? "Meeting");
    let label: string;
    let tone: string;
    if (m.status === "accepted") { label = name; tone = "text-slate-900 font-medium"; }
    else if (m.status === "proposed" || m.status === "countered") {
      label = `${name} — pending`;
      tone = "text-amber-800";
    } else {
      // declined / cancelled — show nothing in that slot
      return (
        <li className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
          <div className="w-28 shrink-0 text-sm tabular-nums text-slate-500">{row.label}</div>
          <Link href={`/conferences/${slug}/platform/directory`} className="flex-1 text-sm text-slate-500 underline">
            Open — browse directory →
          </Link>
        </li>
      );
    }
    return (
      <li className="border-t border-slate-100 first:border-t-0">
        <Link href={`/conferences/${slug}/platform/meetings/${m.id}`}
          className="flex items-center justify-between gap-3 px-4 py-3 active:bg-slate-50"
          style={{ minHeight: 48 }}>
          <div className="w-28 shrink-0 text-sm tabular-nums text-slate-500">{row.label}</div>
          <div className={`flex-1 text-sm ${tone}`}>{label}</div>
          <div className="text-slate-300">›</div>
        </Link>
      </li>
    );
  }
  return (
    <li className="border-t border-slate-100 first:border-t-0">
      <Link href={`/conferences/${slug}/platform/directory`}
        className="flex items-center justify-between gap-3 px-4 py-3 active:bg-slate-50"
        style={{ minHeight: 48 }}>
        <div className="w-28 shrink-0 text-sm tabular-nums text-slate-500">{row.label}</div>
        <div className="flex-1 text-sm text-slate-500">Open — browse directory →</div>
      </Link>
    </li>
  );
}
