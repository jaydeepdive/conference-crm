"use client";
/**
 * MeetingActions — client-side negotiation controls for one meeting.
 *
 * Renders the current proposed time + a set of action buttons appropriate
 * to the state:
 *   - proposed / countered by THE OTHER SIDE  → Accept / Counter / Decline
 *   - proposed / countered by ME              → Cancel (my proposal)
 *   - accepted                                → Cancel
 *   - declined / cancelled                    → no actions
 *
 * The Counter action reveals a slot picker (same generator as /meetings/new).
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  generateSlots, groupSlotsByDay, busySlotStarts, formatDayHeading, formatMeetingDateTime,
  type SlotConferenceInput,
} from "@/lib/slots";
import type { AttendeeSide, Meeting } from "@/lib/types";

interface Props {
  slug: string;
  meeting: Meeting;
  mySide: AttendeeSide;
  timezone: string;
  conferenceForPicker: SlotConferenceInput;
  busySlots: string[];
}

export function MeetingActions({ slug, meeting, mySide, timezone, conferenceForPicker, busySlots }: Props) {
  const router = useRouter();
  const [counter, setCounter] = useState(false);
  const [pickedIso, setPickedIso] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<null | "accept" | "counter" | "decline" | "cancel">(null);
  const [error, setError] = useState<string | null>(null);

  const slots = useMemo(() => generateSlots(conferenceForPicker), [conferenceForPicker]);
  const grouped = useMemo(() => groupSlotsByDay(slots), [slots]);
  const busySet = useMemo(
    () => busySlotStarts(slots, busySlots.map(t => ({ scheduled_time: t }))),
    [slots, busySlots],
  );

  const activeProposal = meeting.status === "proposed" || meeting.status === "countered";
  const mine = meeting.proposed_by === mySide;
  const isOpen = meeting.status !== "declined" && meeting.status !== "cancelled";
  const isAccepted = meeting.status === "accepted";

  async function call(kind: "accept" | "counter" | "decline" | "cancel") {
    setBusy(kind); setError(null);
    const body: Record<string, unknown> = {};
    if (kind === "counter") {
      if (!pickedIso) { setError("Pick a new time first."); setBusy(null); return; }
      body.proposed_time = pickedIso;
    }
    if (notes.trim()) body.notes = notes.trim();
    const res = await fetch(`/api/portal/meetings/${meeting.id}/${kind}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setError(json.error ?? "Failed."); setBusy(null); return; }
    setBusy(null);
    setCounter(false);
    router.refresh();
  }

  const timeLabel = meeting.scheduled_time
    ? formatMeetingDateTime(new Date(meeting.scheduled_time), timezone)
    : meeting.proposed_time
      ? formatMeetingDateTime(new Date(meeting.proposed_time), timezone)
      : "—";

  return (
    <section className="border border-line bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-widest2 text-muted">
            {isAccepted ? "Confirmed time" : activeProposal ? (mine ? "Time you proposed" : "Time they proposed") : "Time"}
          </div>
          <div className="mt-1 font-display text-2xl font-bold text-ink">{timeLabel}</div>
          {meeting.notes && <p className="mt-2 whitespace-pre-line text-sm text-ink/70">{meeting.notes}</p>}
        </div>
      </div>

      {error && <div className="mt-4 rounded-md bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}

      {isOpen && (
        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-6">
          {activeProposal && !mine && (
            <>
              <button onClick={() => call("accept")} disabled={busy !== null}
                className="bg-ink px-4 py-2 text-[11px] font-semibold uppercase tracking-widest2 text-white hover:bg-brand-accent disabled:opacity-50">
                {busy === "accept" ? "…" : "Accept this time"}
              </button>
              <button onClick={() => setCounter(v => !v)}
                className="border border-line px-4 py-2 text-[11px] font-semibold uppercase tracking-widest2 text-ink hover:border-ink">
                {counter ? "Cancel counter" : "Counter with new time"}
              </button>
              <button onClick={() => call("decline")} disabled={busy !== null}
                className="border border-line px-4 py-2 text-[11px] font-semibold uppercase tracking-widest2 text-rose-700 hover:border-rose-700">
                {busy === "decline" ? "…" : "Decline"}
              </button>
            </>
          )}
          {activeProposal && mine && (
            <button onClick={() => call("cancel")} disabled={busy !== null}
              className="border border-line px-4 py-2 text-[11px] font-semibold uppercase tracking-widest2 text-rose-700 hover:border-rose-700">
              {busy === "cancel" ? "…" : "Cancel proposal"}
            </button>
          )}
          {isAccepted && (
            <button onClick={() => call("cancel")} disabled={busy !== null}
              className="border border-line px-4 py-2 text-[11px] font-semibold uppercase tracking-widest2 text-rose-700 hover:border-rose-700">
              {busy === "cancel" ? "…" : "Cancel meeting"}
            </button>
          )}
        </div>
      )}

      {counter && (
        <div className="mt-6 border-t border-line pt-6 space-y-4">
          <p className="text-xs text-muted">Pick a new slot; a counter-proposal will be sent to them.</p>
          {grouped.map(({ day, slots }) => (
            <div key={day}>
              <h4 className="text-[10px] font-semibold uppercase tracking-widest2 text-muted">
                {formatDayHeading(day, conferenceForPicker.timezone)}
              </h4>
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
                {slots.map(s => {
                  const iso = s.start.toISOString();
                  const isBusy = busySet.has(iso);
                  const isPicked = pickedIso === iso;
                  const disabled = isBusy || s.isLunch;
                  return (
                    <button key={iso} type="button" disabled={disabled}
                      onClick={() => setPickedIso(iso)}
                      className={
                        isPicked ? "border border-brand-accent bg-brand-accent text-white px-2 py-2 text-xs font-semibold"
                        : disabled ? "border border-line bg-utility text-muted/60 px-2 py-2 text-xs cursor-not-allowed"
                        : "border border-line bg-white px-2 py-2 text-xs text-ink hover:border-ink"
                      }>
                      {s.label}{s.isLunch ? " · Lunch" : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm focus:border-brand-accent focus:outline-none"
            placeholder="Optional note with your counter." />
          <div>
            <button onClick={() => call("counter")} disabled={busy !== null || !pickedIso}
              className="bg-ink px-4 py-2 text-[11px] font-semibold uppercase tracking-widest2 text-white hover:bg-brand-accent disabled:opacity-50">
              {busy === "counter" ? "…" : "Send counter"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
