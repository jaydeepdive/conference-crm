/**
 * Client: directory search + rendering. Isolated so the server page can
 * stay simple and we can do live filtering without a round-trip.
 */
"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { MeetingStatus } from "@/lib/types";

interface Row {
  id: string;
  name: string;
  sub: string | null;
  about: string | null;
  meeting: { id: string; status: MeetingStatus } | null;
  blocked?: boolean;
  category?: string | null;
  metal?: string | null;
}

export function DirectoryClient({
  slug, otherSide, rows, slot = null,
}: {
  slug: string;
  otherSide: "company" | "investor";
  rows: Row[];
  slot?: { iso: string; label: string; meBusy: boolean } | null;
}) {
  const slotQs = slot ? `?slot=${encodeURIComponent(slot.iso)}` : "";
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [metal, setMetal] = useState("");
  const cats = useMemo(() => Array.from(new Set(rows.map(r => r.category).filter(Boolean) as string[])).sort(), [rows]);
  const metals = useMemo(() => Array.from(new Set(rows.map(r => r.metal).filter(Boolean) as string[])).sort(), [rows]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter(r =>
      (!cat || r.category === cat) && (!metal || r.metal === metal) && (!term
      || r.name.toLowerCase().includes(term)
      || (r.sub ?? "").toLowerCase().includes(term)
      || (r.about ?? "").toLowerCase().includes(term))
    );
  }, [q, rows, cat, metal]);

  const title = otherSide === "investor" ? "Investors" : "Companies";
  const kind = otherSide; // "company" or "investor"

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {slot ? `Free at ${slot.label}. Tap one to request that time.` : "Browse and tap to request a meeting."}
        </p>
      </div>

      {slot && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>
            {slot.meBusy
              ? `You already have ${slot.label} booked or blocked.`
              : `Showing ${title.toLowerCase()} available at ${slot.label}.`}
          </span>
          <Link href={`/conferences/${slug}/platform/directory`} className="shrink-0 font-semibold underline">Show all</Link>
        </div>
      )}

      <input className="w-full rounded-md border border-slate-300 px-3 py-3"
        style={{ fontSize: 16 }}
        placeholder={`Search ${title.toLowerCase()}…`}
        value={q} onChange={e => setQ(e.target.value)} />

      {otherSide === "company" && (cats.length > 0 || metals.length > 0) && (
        <div className="grid grid-cols-2 gap-2">
          <select value={cat} onChange={e => setCat(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2.5" style={{ fontSize: 16 }}>
            <option value="">All categories</option>
            {cats.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={metal} onChange={e => setMetal(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2.5" style={{ fontSize: 16 }}>
            <option value="">All metals</option>
            {metals.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-md border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
          {slot ? `No ${title.toLowerCase()} are free at ${slot.label}${q ? " that match that search" : ""}.` : `No ${title.toLowerCase()} match that search.`}
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
          {filtered.map(r => {
            if (r.blocked) {
              return (
                <li key={r.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-900">{r.name}</div>
                      {r.sub && <div className="truncate text-xs text-slate-500">{r.sub}</div>}
                    </div>
                    <span className="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-800">
                      ✕ not matched
                    </span>
                  </div>
                </li>
              );
            }
            const activeMeeting = r.meeting && !isTerminal(r.meeting.status);
            if (activeMeeting && r.meeting) {
              // Hide active meetings per spec — but spec also says to show
              // a link if they already have one; keep a soft entry.
              return (
                <li key={r.id} className="px-4 py-3">
                  <Link href={`/conferences/${slug}/platform/meetings/${r.meeting.id}`}
                    className="block" style={{ minHeight: 44 }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-slate-900">{r.name}</div>
                        {r.sub && <div className="truncate text-xs text-slate-500">{r.sub}</div>}
                      </div>
                      <StatusChip status={r.meeting.status} />
                    </div>
                  </Link>
                </li>
              );
            }
            // Open (no meeting, or terminated): show request CTA.
            return (
              <li key={r.id} className="px-4 py-3">
                <Link href={`/conferences/${slug}/platform/directory/${kind}/${r.id}${slotQs}`}
                  className="block" style={{ minHeight: 44 }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-900">{r.name}</div>
                      {r.sub && <div className="truncate text-xs text-slate-500">{r.sub}</div>}
                      {r.about && <p className="mt-1 line-clamp-2 text-xs text-slate-600">{r.about}</p>}
                    </div>
                    <div className="shrink-0 text-xs text-slate-900 underline">
                      {r.meeting ? "Request again" : "Request →"}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function isTerminal(s: MeetingStatus): boolean {
  return s === "declined" || s === "cancelled";
}

function StatusChip({ status }: { status: MeetingStatus }) {
  const t: Record<MeetingStatus, { label: string; cls: string }> = {
    proposed: { label: "Pending", cls: "bg-amber-100 text-amber-900" },
    countered: { label: "Pending", cls: "bg-amber-100 text-amber-900" },
    accepted: { label: "Confirmed", cls: "bg-emerald-100 text-emerald-900" },
    declined: { label: "Declined", cls: "bg-slate-100 text-slate-700" },
    cancelled: { label: "Cancelled", cls: "bg-slate-100 text-slate-700" },
  };
  const { label, cls } = t[status];
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{label}</span>;
}
