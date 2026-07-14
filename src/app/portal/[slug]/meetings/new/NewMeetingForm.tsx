"use client";
/**
 * NewMeetingForm — client component that renders the slot grid + notes textarea.
 * Slot generation is local; the parent server component provides the busy list
 * as UTC ISO strings so we can shade them out.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  generateSlots, groupSlotsByDay, busySlotStarts, formatDayHeading,
  type SlotConferenceInput,
} from "@/lib/slots";
import type { AttendeeSide } from "@/lib/types";

interface Props {
  slug: string;
  otherLeadId: string;
  otherLeadType: AttendeeSide;
  otherName: string;
  conference: SlotConferenceInput;
  busySlots: string[];             // UTC ISO strings
}

export function NewMeetingForm({
  slug, otherLeadId, otherLeadType, otherName, conference, busySlots,
}: Props) {
  const router = useRouter();

  const slots = useMemo(() => generateSlots(conference), [conference]);
  const grouped = useMemo(() => groupSlotsByDay(slots), [slots]);
  const busySet = useMemo(
    () => busySlotStarts(slots, busySlots.map(t => ({ scheduled_time: t }))),
    [slots, busySlots],
  );

  const [pickedIso, setPickedIso] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!pickedIso) { setError("Pick a time to propose."); return; }
    setSubmitting(true);
    const res = await fetch("/api/portal/meetings/propose", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        other_lead_type: otherLeadType,
        other_lead_id: otherLeadId,
        proposed_time: pickedIso,
        notes: notes || undefined,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setError(json.error ?? "Failed to send proposal."); setSubmitting(false); return; }
    router.push(`/portal/${slug}/meetings/${json.meeting_id}`);
    router.refresh();
  }

  if (slots.length === 0) {
    return (
      <div className="border border-line bg-white p-6 text-sm text-muted">
        Meeting scheduling isn&rsquo;t configured for this conference yet. Please contact the organizers.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="border border-line bg-utility p-4 text-xs text-muted">
        Pick any open time below. Greyed-out slots are already booked — either yours or {otherName}&rsquo;s.
        A proposal is sent to {otherName}; they can accept, counter, or decline.
      </div>

      {error && <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}

      <div className="space-y-6">
        {grouped.map(({ day, slots }) => (
          <div key={day}>
            <h3 className="text-[11px] font-semibold uppercase tracking-widest2 text-muted">
              {formatDayHeading(day, conference.timezone)}
            </h3>
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
              {slots.map(s => {
                const iso = s.start.toISOString();
                const isBusy = busySet.has(iso);
                const isPicked = pickedIso === iso;
                const isLunch = s.isLunch;
                const disabled = isBusy || isLunch;
                return (
                  <button
                    key={iso}
                    type="button"
                    disabled={disabled}
                    onClick={() => setPickedIso(iso)}
                    className={
                      isPicked ? "border border-brand-accent bg-brand-accent text-white px-2 py-2 text-xs font-semibold"
                      : disabled ? "border border-line bg-utility text-muted/60 px-2 py-2 text-xs cursor-not-allowed"
                      : "border border-line bg-white px-2 py-2 text-xs text-ink hover:border-ink"
                    }>
                    {s.label}{isLunch ? " · Lunch" : ""}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="border border-line bg-white p-6">
        <label className="block text-[10px] font-medium uppercase tracking-widest2 text-muted mb-2">
          Message to {otherName} (optional)
        </label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={4}
          className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm focus:border-brand-accent focus:outline-none"
          placeholder="A quick line about what you'd like to talk about." />

        <div className="mt-4 flex items-center justify-between">
          <div className="text-xs text-muted">
            {pickedIso
              ? "Proposal will be sent for the highlighted slot."
              : "Pick a slot above to enable send."}
          </div>
          <button onClick={submit} disabled={submitting || !pickedIso}
            className="bg-ink px-4 py-2 text-[11px] font-semibold uppercase tracking-widest2 text-white hover:bg-brand-accent disabled:opacity-50">
            {submitting ? "Sending…" : "Send proposal"}
          </button>
        </div>
      </div>
    </div>
  );
}
