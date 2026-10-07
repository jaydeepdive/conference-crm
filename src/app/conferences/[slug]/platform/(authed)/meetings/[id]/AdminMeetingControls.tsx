"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Super-admin override controls, injected into the meeting detail page
 * below the normal attendee actions. Lets the operator:
 *   - Force the meeting into a different time slot (status → accepted).
 *   - Set / clear the table / location string.
 *   - Force cancel regardless of state.
 *
 * All actions hit /api/platform/meetings/[id]/admin-edit which writes a
 * meeting_events "admin override" line so the history reflects the action.
 */
export function AdminMeetingControls({
  meetingId, currentLocation, slotOptions,
}: {
  meetingId: string;
  currentLocation: string | null;
  slotOptions: { iso: string; label: string; busy: boolean }[];
}) {
  const router = useRouter();
  const [slotIso, setSlotIso] = useState<string>("");
  const [location, setLocation] = useState<string>(currentLocation ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function post(body: Record<string, unknown>, successLabel: string) {
    setBusy(true); setError(null); setOk(null);
    const res = await fetch(`/api/platform/meetings/${meetingId}/admin-edit`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setError(data.error ?? "Failed"); return; }
    setOk(successLabel);
    router.refresh();
  }

  async function assignSlot() {
    if (!slotIso) { setError("Pick a time first."); return; }
    await post({ scheduled_time: slotIso }, "Time assigned.");
    setSlotIso("");
  }
  async function saveLocation() {
    await post({ location: location.trim() || null }, "Location saved.");
  }
  async function forceCancel() {
    if (!confirm("Force cancel this meeting? This bypasses the normal flow and logs an admin override.")) return;
    await post({ status: "cancelled" }, "Cancelled.");
  }

  return (
    <section className="rounded-md border-2 border-amber-400 bg-amber-50 p-4">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-amber-900">
        Admin override — attendees never see these controls
      </div>

      {error && <div className="mb-2 rounded bg-rose-100 px-3 py-2 text-xs text-rose-900">{error}</div>}
      {ok && <div className="mb-2 rounded bg-emerald-100 px-3 py-2 text-xs text-emerald-900">{ok}</div>}

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-amber-900">Force a time slot</label>
          <div className="flex gap-2">
            <select
              value={slotIso}
              onChange={e => setSlotIso(e.target.value)}
              className="flex-1 rounded border border-amber-300 bg-white px-2 py-1.5 text-sm"
            >
              <option value="">— pick a time —</option>
              {slotOptions.map(s => (
                <option key={s.iso} value={s.iso}>
                  {s.label}{s.busy ? " (busy — will overlap)" : ""}
                </option>
              ))}
            </select>
            <button
              onClick={assignSlot}
              disabled={busy || !slotIso}
              className="rounded bg-amber-700 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white hover:bg-amber-800 disabled:opacity-50"
            >
              {busy ? "…" : "Assign"}
            </button>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-amber-900">Table / location</label>
          <div className="flex gap-2">
            <input
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="e.g. Table 12"
              className="flex-1 rounded border border-amber-300 bg-white px-2 py-1.5 text-sm"
            />
            <button
              onClick={saveLocation}
              disabled={busy}
              className="rounded bg-amber-700 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white hover:bg-amber-800 disabled:opacity-50"
            >
              {busy ? "…" : "Save"}
            </button>
          </div>
        </div>

        <div>
          <button
            onClick={forceCancel}
            disabled={busy}
            className="w-full rounded border border-rose-400 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-rose-700 hover:bg-rose-50 disabled:opacity-50"
          >
            Force cancel this meeting
          </button>
        </div>
      </div>
    </section>
  );
}
