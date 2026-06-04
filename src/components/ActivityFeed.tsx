import type { ActivityEntry, Profile } from "@/lib/types";

export function ActivityFeed({ entries, profiles }: { entries: ActivityEntry[]; profiles: Profile[] }) {
  const who = (id: string | null) => {
    if (!id) return "—";
    const p = profiles.find(x => x.id === id);
    return p?.full_name || p?.email || "—";
  };
  const when = (s: string) => new Date(s).toLocaleString();

  if (entries.length === 0) {
    return <p className="text-sm text-gray-500">No activity yet.</p>;
  }

  return (
    <ol className="space-y-3">
      {entries.map(e => (
        <li key={e.id} className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <span className="font-medium">{who(e.user_id)}</span>
              <span className="text-gray-500"> · {e.action}</span>
            </div>
            <span className="text-xs text-gray-500">{when(e.created_at)}</span>
          </div>
          {e.notes && <p className="mt-1 text-gray-700">{e.notes}</p>}
        </li>
      ))}
    </ol>
  );
}
