"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";

type Row = {
  id: string;
  full_name: string;
  email: string;
  entity: string;
  side: "company" | "investor";
  accepted: boolean;
};

export function AdminSwitchClient({ slug, rows }: { slug: string; rows: Row[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(r =>
      r.full_name.toLowerCase().includes(needle) ||
      r.email.toLowerCase().includes(needle) ||
      r.entity.toLowerCase().includes(needle),
    );
  }, [q, rows]);

  async function viewAs(id: string) {
    setBusyId(id);
    await fetch("/api/platform/admin/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attendee_profile_id: id }),
    });
    router.push(`/conferences/${slug}/platform`);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Search by name, email, or company…"
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base"
      />

      <ul className="divide-y divide-slate-200 overflow-hidden rounded-md border border-slate-200 bg-white">
        {filtered.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-slate-500">
            No attendees match.
          </li>
        )}
        {filtered.map(r => (
          <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-slate-900">{r.full_name}</div>
              <div className="truncate text-xs text-slate-500">
                {r.entity} · {r.side === "company" ? "Company" : "Investor"} · {r.email}
                {!r.accepted && <span className="ml-2 rounded bg-amber-100 px-1.5 text-[10px] uppercase tracking-wide text-amber-800">pending invite</span>}
              </div>
            </div>
            <button
              onClick={() => viewAs(r.id)}
              disabled={busyId !== null}
              className="whitespace-nowrap rounded border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide hover:bg-slate-100 disabled:opacity-50"
            >
              {busyId === r.id ? "…" : "View as"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
