/**
 * /conferences/[slug]/platform/messages/[kind]/[id] — one conversation with
 * a registered company/investor on the other side.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { requirePlatformContext, attendingLeadIds, leadDisplayName, publicLeadColumns } from "@/lib/platform";
import { loadThread, markThreadRead, pairBlocked } from "@/lib/messages";
import type { Company, Investor } from "@/lib/types";
import { ThreadClient } from "./ThreadClient";

export const dynamic = "force-dynamic";

export default async function ThreadPage({
  params,
}: { params: Promise<{ slug: string; kind: string; id: string }> }) {
  const { slug, kind, id } = await params;
  if (kind !== "company" && kind !== "investor") { notFound(); throw new Error("unreachable"); }
  const ctx = await requirePlatformContext(slug);
  const otherSide = kind as "company" | "investor";
  if (otherSide === ctx.side) { notFound(); throw new Error("unreachable"); }
  if (!(await attendingLeadIds(ctx.conference.id, otherSide)).has(id)) { notFound(); throw new Error("unreachable"); }

  const { data: otherRow } = await createServiceClient()
    .from(otherSide === "company" ? "companies" : "investors")
    .select(publicLeadColumns(otherSide)).eq("id", id).eq("conference_id", ctx.conference.id).maybeSingle();
  if (!otherRow) { notFound(); throw new Error("unreachable"); }
  const other = otherRow as unknown as Company | Investor;
  const otherName = leadDisplayName(other, otherSide);

  const [messages, blocked] = await Promise.all([
    loadThread(ctx.side, ctx.attendee.lead_id, id),
    pairBlocked(ctx.conference.id, ctx.side, ctx.attendee.lead_id, id),
  ]);
  // Admin previews don't mark someone else's messages as read.
  if (!ctx.isImpersonating) await markThreadRead(ctx.attendee.id, ctx.side, ctx.attendee.lead_id, id);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/conferences/${slug}/platform/messages`} className="text-xs uppercase tracking-wide text-slate-500 hover:text-slate-800">← Messages</Link>
          <h1 className="mt-1 truncate font-serif text-2xl font-semibold text-stone-900">{otherName}</h1>
          {other.contact_name && (
            <div className="text-sm text-slate-600">{other.contact_name}{other.contact_title ? ` · ${other.contact_title}` : ""}</div>
          )}
        </div>
        <Link href={`/conferences/${slug}/platform/directory/${otherSide}/${id}`}
          className="shrink-0 rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-800">
          Request meeting
        </Link>
      </div>

      <ThreadClient
        slug={slug}
        otherId={id}
        mySide={ctx.side}
        blocked={blocked}
        timezone={ctx.conference.timezone}
        messages={messages}
      />
    </div>
  );
}
