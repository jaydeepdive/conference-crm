/**
 * Mobile-first per-slot toggle: "I'm not available at this time."
 * Writes via /api/platform/blocked-slots. The other side's directory
 * request page hides toggled-on slots as "unavailable".
 */
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export interface SlotToggle {
  iso: string;
  label: string;
  blocked: boolean;
}

export function BlockedSlots({ slug, slots }: { slug: string; slots: SlotToggle[] }) {
  const router = useRouter();
  const [busyIso, setBusyIso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(s: SlotToggle) {
    setBusyIso(s.iso); setError(null);
    try {
      let res: Response;
      if (s.blocked) {
        const u = new URL("/api/platform/blocked-slots", window.location.origin);
        u.searchParams.set("slot_time", s.iso);
        u.searchParams.set("slug", slug);
        res = await fetch(u.toString(), { method: "DELETE" });
      } else {
        res = await fetch("/api/platform/blocked-slots", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slot_time: s.iso, slug }),
        });
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError((j as { error?: string }).error ?? "Could not update slot.");
        return;
      }
      router.refresh();
    } finally {
      setBusyIso(null);
    }
  }

  return (
    <div className="mt-3">
      {error && <div className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>}
      <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
        {slots.map(s => (
          <li key={s.iso} className="flex items-center justify-between gap-3 px-4 py-3" style={{ minHeight: 48 }}>
            <div className="text-sm tabular-nums text-slate-800">{s.label}</div>
            <button
              type="button"
              disabled={busyIso === s.iso}
              onClick={() => toggle(s)}
              aria-pressed={s.blocked}
              className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium ${
                s.blocked
                  ? "bg-rose-100 text-rose-800"
                  : "bg-emerald-100 text-emerald-800"
              } disabled:opacity-50`}
              style={{ minHeight: 44, minWidth: 108 }}
            >
              {busyIso === s.iso ? "…" : s.blocked ? "Blocked" : "Available"}
            </button>
          </li>
        ))}
        {slots.length === 0 && (
          <li className="px-4 py-6 text-sm text-slate-500">No slots configured yet.</li>
        )}
      </ul>
    </div>
  );
}
