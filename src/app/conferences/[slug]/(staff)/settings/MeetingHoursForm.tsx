"use client";
/**
 * MeetingHoursForm — staff-facing editor for the conference's meeting scheduling
 * config: timezone, meeting window, optional lunch break, slot length + stride.
 *
 * These fields drive the slot picker + schedule grid in the attendee portal.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Conference } from "@/lib/types";

// Trim seconds ("09:00:00" → "09:00") so the <input type="time"> is happy.
function trimTime(t: string | null): string {
  if (!t) return "";
  return t.length >= 5 ? t.slice(0, 5) : t;
}

export function MeetingHoursForm({ conference }: { conference: Conference }) {
  const router = useRouter();
  const [tz, setTz] = useState(conference.timezone);
  const [start, setStart] = useState(trimTime(conference.meeting_start_time));
  const [end, setEnd] = useState(trimTime(conference.meeting_end_time));
  const [lunchStart, setLunchStart] = useState(trimTime(conference.meeting_lunch_start));
  const [lunchEnd, setLunchEnd] = useState(trimTime(conference.meeting_lunch_end));
  const [slotMinutes, setSlotMinutes] = useState(conference.meeting_slot_minutes);
  const [strideMinutes, setStrideMinutes] = useState(conference.meeting_slot_stride_minutes);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setSaving(true); setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.from("conferences").update({
      timezone: tz.trim() || "America/Toronto",
      meeting_start_time: start || "09:00",
      meeting_end_time: end || "16:00",
      meeting_lunch_start: lunchStart || null,
      meeting_lunch_end: lunchEnd || null,
      meeting_slot_minutes: Number(slotMinutes) || 15,
      meeting_slot_stride_minutes: Number(strideMinutes) || 20,
    }).eq("id", conference.id);
    setSaving(false);
    if (error) setMsg({ ok: false, text: error.message });
    else { setMsg({ ok: true, text: "Saved." }); router.refresh(); }
  }

  const input = "rounded-md border border-line bg-white px-3 py-2 text-sm focus:border-brand-accent focus:outline-none";
  const label = "block text-[10px] font-medium uppercase tracking-widest2 text-muted mb-1";

  return (
    <div className="border border-line bg-white p-5">
      {msg && (
        <div className={`mb-3 rounded-md p-3 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
          {msg.text}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={label}>Timezone (IANA)</label>
          <input className={`${input} w-full`} value={tz} onChange={e => setTz(e.target.value)}
            placeholder="America/Toronto" />
          <p className="mt-1 text-[11px] text-muted">Used for slot display + day headings in the attendee portal.</p>
        </div>

        <div>
          <label className={label}>Meeting day start</label>
          <input type="time" className={`${input} w-full`} value={start} onChange={e => setStart(e.target.value)} />
        </div>
        <div>
          <label className={label}>Meeting day end</label>
          <input type="time" className={`${input} w-full`} value={end} onChange={e => setEnd(e.target.value)} />
        </div>

        <div>
          <label className={label}>Lunch start (optional)</label>
          <input type="time" className={`${input} w-full`} value={lunchStart} onChange={e => setLunchStart(e.target.value)} />
        </div>
        <div>
          <label className={label}>Lunch end (optional)</label>
          <input type="time" className={`${input} w-full`} value={lunchEnd} onChange={e => setLunchEnd(e.target.value)} />
        </div>

        <div>
          <label className={label}>Meeting length (minutes)</label>
          <input type="number" min={5} step={5} className={`${input} w-full`}
            value={slotMinutes} onChange={e => setSlotMinutes(Number(e.target.value))} />
        </div>
        <div>
          <label className={label}>Stride between slot starts (minutes)</label>
          <input type="number" min={5} step={5} className={`${input} w-full`}
            value={strideMinutes} onChange={e => setStrideMinutes(Number(e.target.value))} />
          <p className="mt-1 text-[11px] text-muted">
            Total = meeting length + buffer. E.g. 15 + 5 buffer = 20.
          </p>
        </div>
      </div>

      <div className="mt-4 flex justify-end border-t border-line pt-4">
        <button onClick={save} disabled={saving}
          className="bg-ink px-4 py-2 text-[11px] font-semibold uppercase tracking-widest2 text-white hover:bg-brand-accent disabled:opacity-50">
          {saving ? "Saving…" : "Save meeting hours"}
        </button>
      </div>
    </div>
  );
}
