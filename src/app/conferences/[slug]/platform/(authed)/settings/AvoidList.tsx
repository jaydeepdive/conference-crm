/**
 * Mobile-first "Who should we not pair you with?" editor.
 * Writes via /api/platform/blocklist. Backend + request-flow enforce this.
 */
"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AttendeeSide } from "@/lib/types";

export interface DirectoryOption { id: string; name: string }
export interface BlockRow {
  id: string;
  to_lead_type: AttendeeSide;
  to_lead_id: string;
  to_name: string;
  reason: string | null;
}

export function AvoidList({
  slug, otherSide, options, rows,
}: {
  slug: string;
  otherSide: AttendeeSide;
  options: DirectoryOption[];
  rows: BlockRow[];
}) {
  const router = useRouter();
  const [pick, setPick] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blockedIds = useMemo(() => new Set(rows.map(r => r.to_lead_id)), [rows]);
  const availableOptions = useMemo(
    () => options.filter(o => !blockedIds.has(o.id)),
    [options, blockedIds],
  );

  async function add() {
    if (!pick) { setError("Pick someone to add."); return; }
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/platform/blocklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          to_lead_type: otherSide,
          to_lead_id: pick,
          reason: reason.trim() || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError((j as { error?: string }).error ?? "Could not add.");
        return;
      }
      setPick(""); setReason("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this block?")) return;
    setBusy(true); setError(null);
    try {
      const u = new URL("/api/platform/blocklist", window.location.origin);
      u.searchParams.set("id", id);
      const res = await fetch(u.toString(), { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError((j as { error?: string }).error ?? "Could not remove.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const input = "mt-1 w-full rounded-md border border-slate-300 px-3 py-2";
  const otherLabel = otherSide === "company" ? "company" : "investor";

  return (
    <div className="mt-3 space-y-4">
      <div className="rounded-md border border-slate-200 bg-slate-50/60 p-3">
        <label className="block text-sm font-medium text-slate-700">
          Who do you want to avoid?
        </label>
        <select className={input} style={{ fontSize: 16, minHeight: 44 }}
          value={pick} onChange={e => setPick(e.target.value)}>
          <option value="">— pick a {otherLabel} —</option>
          {availableOptions.map(o => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>

        <label className="mt-3 block text-sm font-medium text-slate-700">
          Reason <span className="text-slate-400">(optional, private to admin)</span>
        </label>
        <input className={input} style={{ fontSize: 16, minHeight: 44 }}
          value={reason} onChange={e => setReason(e.target.value)}
          placeholder="e.g. competitor" />

        {error && <div className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>}

        <button onClick={add} disabled={busy || !pick}
          className="mt-3 w-full rounded-md bg-slate-900 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          style={{ minHeight: 44 }}>
          {busy ? "Saving…" : "Add to avoid list"}
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">No one on your avoid list.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
          {rows.map(r => (
            <li key={r.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-900">{r.to_name}</div>
                {r.reason && <div className="truncate text-xs text-slate-500">{r.reason}</div>}
              </div>
              <button onClick={() => remove(r.id)} disabled={busy}
                className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                style={{ minHeight: 44 }}
                aria-label={`Remove ${r.to_name} from avoid list`}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
