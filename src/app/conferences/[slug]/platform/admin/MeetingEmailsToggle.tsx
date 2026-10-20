"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function MeetingEmailsToggle({ slug, enabled }: { slug: string; enabled: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function flip() {
    const next = !on;
    if (next && !confirm("Turn ON meeting emails? Attendees will be emailed when someone requests a meeting, proposes a new time, or messages them.")) return;
    setBusy(true); setErr(null);
    const res = await fetch("/api/admin/meeting-emails", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, enabled: next }),
    });
    setBusy(false);
    if (!res.ok) { setErr("Could not update."); return; }
    setOn(next); router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 border border-line bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="font-display text-xl">Attendee notification emails</div>
        <div className="mt-1 text-sm text-muted">
          Emails the other party when someone requests a meeting, proposes a new time, or sends them a message (max one message email per conversation every 30 min).
          Sent from no-reply@abovebeyondsummit.com.
        </div>
        {err && <div className="mt-1 text-sm text-rose-700">{err}</div>}
      </div>
      <button onClick={flip} disabled={busy}
        className={`shrink-0 whitespace-nowrap px-5 py-3 text-xs font-semibold uppercase tracking-widest2 disabled:opacity-50 ${
          on ? "bg-emerald-700 text-white" : "border border-ink/30 bg-white text-ink"}`}>
        {busy ? "Saving…" : on ? "On — tap to turn off" : "Off — tap to turn on"}
      </button>
    </div>
  );
}
