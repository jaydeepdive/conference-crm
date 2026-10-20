/**
 * /conferences/[slug]/platform/messages — conversations with the other side.
 */
import Link from "next/link";
import { requirePlatformContext } from "@/lib/platform";
import { listThreads } from "@/lib/messages";

export const dynamic = "force-dynamic";

export default async function MessagesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requirePlatformContext(slug);
  const threads = await listThreads(ctx.conference.id, ctx.side, ctx.attendee.lead_id, ctx.attendee.id);
  const otherSide = ctx.side === "company" ? "investor" : "company";
  const tz = ctx.conference.timezone;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-stone-900">Messages</h1>
        <p className="mt-1 text-sm text-slate-500">
          Message any registered {otherSide === "investor" ? "investor" : "company"}. To start a new conversation, open them in the{" "}
          <Link href={`/conferences/${slug}/platform/directory`} className="underline">Directory</Link> and tap Message.
        </p>
      </div>

      {threads.length === 0 ? (
        <div className="rounded-md border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
          No messages yet.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
          {threads.map(t => (
            <li key={t.otherId}>
              <Link href={`/conferences/${slug}/platform/messages/${otherSide}/${t.otherId}`}
                className="flex items-start gap-3 px-4 py-3 active:bg-slate-50" style={{ minHeight: 56 }}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`truncate text-sm ${t.unread ? "font-semibold text-slate-900" : "font-medium text-slate-800"}`}>{t.otherName}</span>
                    <span className="shrink-0 text-[11px] text-slate-400">
                      {new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(t.last.created_at))}
                    </span>
                  </div>
                  <div className={`mt-0.5 truncate text-sm ${t.unread ? "text-slate-800" : "text-slate-500"}`}>
                    {t.last.sender_side === ctx.side ? "You: " : ""}{t.last.body}
                  </div>
                </div>
                {t.unread > 0 && (
                  <span className="mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold text-black" style={{ backgroundColor: "#c9a24b" }}>
                    {t.unread}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
