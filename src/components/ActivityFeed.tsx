import Link from "next/link";
import type { ActivityEntry, Profile } from "@/lib/types";

export interface ActivityLeadInfo { name: string; contact: string | null; email: string | null; stage: string | null }

/**
 * Activity list. When `slug` + `leads` are passed (conference Activity page)
 * each entry shows WHO it's about — company/investor name linked to their
 * record, plus contact person + email — so new website registrations can be
 * actioned straight from the log.
 */
export function ActivityFeed({
  entries, profiles, slug, leads, showLead = true,
}: {
  entries: ActivityEntry[];
  profiles: Profile[];
  slug?: string;
  leads?: Record<string, ActivityLeadInfo>;
  showLead?: boolean;
}) {
  const who = (e: ActivityEntry) => {
    if (!e.user_id) return /via website/i.test(e.action) ? "Website" : "System";
    const p = profiles.find(x => x.id === e.user_id);
    return p?.full_name || p?.email || "—";
  };
  const when = (s: string) => new Date(s).toLocaleString();

  if (entries.length === 0) {
    return <p className="text-sm text-gray-500">No activity yet.</p>;
  }

  return (
    <ol className="space-y-3">
      {entries.map(e => {
        const live = leads?.[e.lead_id];
        const name = live?.name || e.lead_name || "(no name)";
        const href = slug && e.lead_id ? `/conferences/${slug}/${e.lead_type === "company" ? "companies" : "investors"}/${e.lead_id}` : null;
        const isNewWeb = /registered via website/i.test(e.action);
        return (
          <li key={e.id} className={`rounded-lg border bg-white p-3 text-sm ${isNewWeb ? "border-amber-300" : "border-gray-200"}`}>
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                {showLead && (
                  <div className="mb-0.5 flex flex-wrap items-center gap-2">
                    {href
                      ? <Link href={href} className="font-semibold text-ink underline-offset-2 hover:underline">{name}</Link>
                      : <span className="font-semibold text-ink">{name}</span>}
                    <span className="rounded-sm border border-gray-300 px-1.5 py-px text-[10px] uppercase tracking-wider text-gray-600">
                      {e.lead_type === "company" ? "Company" : "Investor"}
                    </span>
                    {isNewWeb && (
                      <span className="rounded-sm bg-amber-100 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-amber-900">New</span>
                    )}
                  </div>
                )}
                {showLead && live && (live.contact || live.email) && (
                  <div className="text-xs text-gray-600">
                    {live.contact && live.contact !== name ? live.contact : ""}
                    {live.contact && live.contact !== name && live.email ? " · " : ""}
                    {live.email && <a href={`mailto:${live.email}`} className="hover:underline">{live.email}</a>}
                  </div>
                )}
                <div className={showLead ? "mt-1" : ""}>
                  <span className="font-medium">{who(e)}</span>
                  <span className="text-gray-500"> · {e.action}</span>
                </div>
              </div>
              <span className="shrink-0 text-xs text-gray-500">{when(e.created_at)}</span>
            </div>
            {e.notes && <p className="mt-1 text-gray-700">{e.notes}</p>}
          </li>
        );
      })}
    </ol>
  );
}
