/**
 * Client actions for a meeting — Accept / Counter / Decline / Cancel.
 * Which buttons render depends on who moved last and current status.
 */
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AttendeeSide, Meeting } from "@/lib/types";

interface SlotOpt { iso: string; label: string; busy: boolean }

export function MeetingActions({
  slug, meeting, mySide, slotOptions,
}: {
  slug: string;
  meeting: Meeting;
  mySide: AttendeeSide;
  slotOptions: SlotOpt[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCounter, setShowCounter] = useState(false);
  const [counterSlot, setCounterSlot] = useState<SlotOpt | null>(null);
  const [counterNotes, setCounterNotes] = useState("");

  async function act(kind: "accept" | "decline" | "cancel", body?: Record<string, unknown>) {
    if (kind === "decline" && !confirm("Decline this request?")) return;
    if (kind === "cancel" && !confirm(meeting.status === "accepted"
      ? "Cancel this confirmed meeting?"
      : "Withdraw this proposal?")) return;
    setBusy(kind); setError(null);
    const res = await fetch(`/api/platform/meetings/${meeting.id}/${kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const j = await res.json();
    setBusy(null);
    if (!res.ok) { setError(j.error ?? "Something went wrong."); return; }
    router.refresh();
  }

  async function submitCounter() {
    if (!counterSlot) return;
    setBusy("counter"); setError(null);
    const res = await fetch(`/api/platform/meetings/${meeting.id}/counter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposed_time: counterSlot.iso, notes: counterNotes.trim() || undefined }),
    });
    const j = await res.json();
    setBusy(null);
    if (!res.ok) { setError(j.error ?? "Something went wrong."); return; }
    setShowCounter(false); setCounterSlot(null); setCounterNotes("");
    router.refresh();
  }

  const isPending = meeting.status === "proposed" || meeting.status === "countered";
  const isMine = meeting.proposed_by === mySide;

  return (
    <div className="mt-4">
      {isPending && !isMine && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <button onClick={() => act("accept")} disabled={busy !== null}
            className="flex-1 rounded-md bg-emerald-600 py-3 text-base font-medium text-white disabled:opacity-50"
            style={{ minHeight: 48 }}>
            {busy === "accept" ? "…" : "Accept"}
          </button>
          <button onClick={() => setShowCounter(true)} disabled={busy !== null}
            className="flex-1 rounded-md border border-slate-300 py-3 text-base font-medium text-slate-900"
            style={{ minHeight: 48 }}>
            Counter
          </button>
          <button onClick={() => act("decline")} disabled={busy !== null}
            className="flex-1 rounded-md border border-rose-300 py-3 text-base font-medium text-rose-700"
            style={{ minHeight: 48 }}>
            {busy === "decline" ? "…" : "Decline"}
          </button>
        </div>
      )}

      {isPending && isMine && (
        <div>
          <p className="text-sm text-slate-500">Waiting for them to respond.</p>
          <button onClick={() => act("cancel")} disabled={busy !== null}
            className="mt-3 w-full rounded-md border border-rose-300 py-3 text-base font-medium text-rose-700 sm:w-auto sm:px-6"
            style={{ minHeight: 48 }}>
            {busy === "cancel" ? "…" : "Withdraw request"}
          </button>
        </div>
      )}

      {meeting.status === "accepted" && (
        <button onClick={() => act("cancel")} disabled={busy !== null}
          className="w-full rounded-md border border-rose-300 py-3 text-base font-medium text-rose-700 sm:w-auto sm:px-6"
          style={{ minHeight: 48 }}>
          {busy === "cancel" ? "…" : "Cancel meeting"}
        </button>
      )}

      {error && <div className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>}

      {showCounter && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-slate-900/40 sm:items-center">
          <div className="w-full max-w-md rounded-t-xl bg-white p-5 sm:rounded-xl">
            <h3 className="text-base font-semibold text-slate-900">Counter with a new time</h3>
            <p className="mt-1 text-xs text-slate-500">
              Only slots open for both of you are shown.
            </p>

            <ul className="mt-3 max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200">
              {slotOptions.filter(s => !s.busy).map(s => (
                <li key={s.iso}>
                  <button type="button"
                    onClick={() => setCounterSlot(s)}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left ${counterSlot?.iso === s.iso ? "bg-slate-100" : ""}`}
                    style={{ minHeight: 44 }}>
                    <span className="text-sm text-slate-900">{s.label}</span>
                    {counterSlot?.iso === s.iso && <span className="text-xs text-slate-500">Selected</span>}
                  </button>
                </li>
              ))}
              {slotOptions.filter(s => !s.busy).length === 0 && (
                <li className="px-3 py-3 text-sm text-slate-500">No overlapping open slots.</li>
              )}
            </ul>

            <label className="mt-3 block text-sm font-medium text-slate-700">
              Note <span className="text-slate-400">(optional)</span>
            </label>
            <textarea className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              style={{ fontSize: 16 }} rows={2}
              value={counterNotes} onChange={e => setCounterNotes(e.target.value)} />

            <div className="mt-4 flex gap-3">
              <button onClick={() => { setShowCounter(false); setCounterSlot(null); }}
                disabled={busy !== null}
                className="flex-1 rounded-md border border-slate-300 py-3 text-base font-medium text-slate-700"
                style={{ minHeight: 48 }}>
                Cancel
              </button>
              <button onClick={submitCounter} disabled={!counterSlot || busy !== null}
                className="flex-1 rounded-md bg-slate-900 py-3 text-base font-medium text-white disabled:opacity-50"
                style={{ minHeight: 48 }}>
                {busy === "counter" ? "Sending…" : "Send counter"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
