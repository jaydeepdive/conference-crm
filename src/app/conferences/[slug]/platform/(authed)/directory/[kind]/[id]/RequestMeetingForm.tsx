/**
 * Mobile-first slot picker + confirm sheet for requesting a meeting.
 */
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface SlotOpt { iso: string; label: string; busy: boolean }

export function RequestMeetingForm({
  slug, otherLeadType, otherLeadId, otherName, slots,
}: {
  slug: string;
  otherLeadType: "company" | "investor";
  otherLeadId: string;
  otherName: string;
  slots: SlotOpt[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<SlotOpt | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!pending) return;
    setBusy(true); setError(null);
    const res = await fetch("/api/platform/meetings/propose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        other_lead_type: otherLeadType,
        other_lead_id: otherLeadId,
        proposed_time: pending.iso,
        notes: notes.trim() || undefined,
      }),
    });
    const j = await res.json();
    setBusy(false);
    if (!res.ok) { setError(j.error ?? "Could not request meeting."); return; }
    router.push(`/conferences/${slug}/platform/meetings/${j.meeting_id}`);
    router.refresh();
  }

  return (
    <section className="rounded-md border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-base font-semibold text-slate-900">Request a meeting</h2>
        <p className="text-xs text-slate-500">Tap an open slot below.</p>
      </div>

      {slots.length === 0 ? (
        <div className="px-4 py-5 text-sm text-slate-500">No slots configured yet.</div>
      ) : (
        <ul>
          {slots.map(s => (
            <li key={s.iso} className="border-t border-slate-100 first:border-t-0">
              <button type="button" disabled={s.busy}
                onClick={() => { setPending(s); setNotes(""); setError(null); }}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left disabled:cursor-not-allowed active:bg-slate-50"
                style={{ minHeight: 48 }}>
                <div className="w-28 shrink-0 text-sm tabular-nums text-slate-500">{s.label}</div>
                {s.busy
                  ? <div className="flex-1 text-sm text-slate-400">Not available</div>
                  : <div className="flex-1 text-sm text-slate-900">Open — tap to request</div>}
                {!s.busy && <div className="text-slate-300">›</div>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {pending && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-slate-900/40 sm:items-center">
          <div className="w-full max-w-md rounded-t-xl bg-white p-5 sm:rounded-xl">
            <h3 className="text-base font-semibold text-slate-900">
              Request meeting with {otherName}
            </h3>
            <p className="mt-1 text-sm text-slate-600">at {pending.label}</p>

            <label className="mt-4 block text-sm font-medium text-slate-700">
              Note <span className="text-slate-400">(optional)</span>
            </label>
            <textarea className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              style={{ fontSize: 16 }}
              rows={3} value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Would love to talk about your Series A." />

            {error && <div className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>}

            <div className="mt-5 flex gap-3">
              <button onClick={() => setPending(null)} disabled={busy}
                className="flex-1 rounded-md border border-slate-300 py-3 text-base font-medium text-slate-700"
                style={{ minHeight: 48 }}>
                Cancel
              </button>
              <button onClick={submit} disabled={busy}
                className="flex-1 rounded-md bg-slate-900 py-3 text-base font-medium text-white disabled:opacity-50"
                style={{ minHeight: 48 }}>
                {busy ? "Sending…" : "Send request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
