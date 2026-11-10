"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtProgramRange, fmtProgramDay, type ProgramItem } from "@/lib/program";

export interface PreviewOption { id: string; label: string; side: "company" | "investor" }

const LABEL = "block text-[11px] font-medium uppercase tracking-widest2 text-muted";
const INPUT = "mt-1 w-full border border-ink/20 bg-white px-3 py-2 text-base text-ink focus:border-ink focus:outline-none md:text-sm";
const BTN = "border border-ink/20 bg-white px-3 py-2 text-[11px] font-semibold uppercase tracking-widest2 text-ink hover:border-ink disabled:opacity-50";
const DAYS = ["2026-11-22", "2026-11-23", "2026-11-24"];

interface Draft { id?: string; day: string; start_time: string; end_time: string; title: string; note: string; location: string }

export function ProgramClient({ slug, conferenceId, meetingDay, published, items, previewOptions, emptyHint }: {
  slug: string; conferenceId: string; meetingDay: string | null; published: boolean;
  items: ProgramItem[]; previewOptions: PreviewOption[]; emptyHint: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState(previewOptions[0]?.id ?? "");

  const days = useMemo(() => {
    const set = new Set([...DAYS, ...items.map(i => i.day)]);
    return Array.from(set).sort().map(day => ({ day, items: items.filter(i => i.day === day) }));
  }, [items]);

  async function post(body: Record<string, unknown>) {
    setBusy(true); setErr(null);
    const res = await fetch("/api/platform/admin/program", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(j.error ?? "Could not save."); return false; }
    router.refresh(); return true;
  }

  async function togglePublish() {
    if (!published && !confirm("Publish the event program? Every attendee will see it on their Schedule page right away. (No emails are sent.)")) return;
    if (published && !confirm("Hide the event program from attendees again?")) return;
    await post({ action: "publish", conference_id: conferenceId, published: !published });
  }

  async function preview() {
    if (!previewId) return;
    setBusy(true);
    const res = await fetch("/api/platform/admin/impersonate", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attendee_profile_id: previewId }),
    });
    setBusy(false);
    if (!res.ok) { setErr("Couldn't open the preview."); return; }
    window.location.href = `/conferences/${slug}/platform`;
  }

  return (
    <div className="space-y-6">
      {/* Status + publish */}
      <div className={`flex flex-col gap-3 border px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${published ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}>
        <div>
          <div className="font-display text-xl">{published ? "Published — attendees can see the program" : "Not published — attendees can't see this yet"}</div>
          <div className="mt-1 text-sm text-muted">
            {published ? "Changes you make below show up for attendees immediately." : "Preview it as an attendee first, then publish when it's right."}
          </div>
        </div>
        <button onClick={togglePublish} disabled={busy || items.length === 0}
          className={`shrink-0 whitespace-nowrap px-5 py-3 text-xs font-semibold uppercase tracking-widest2 disabled:opacity-50 ${published ? "border border-ink/30 bg-white text-ink" : "bg-emerald-700 text-white"}`}>
          {published ? "Unpublish" : "Publish to attendees"}
        </button>
      </div>

      {/* Preview */}
      <div className="flex flex-col gap-2 border border-line bg-white px-5 py-4 sm:flex-row sm:items-end">
        <label className="flex-1"><span className={LABEL}>Preview exactly what this attendee sees</span>
          <select className={INPUT} value={previewId} onChange={e => setPreviewId(e.target.value)}>
            {previewOptions.map(o => <option key={o.id} value={o.id}>{o.side === "company" ? "Company" : "Investor"} · {o.label}</option>)}
          </select>
        </label>
        <button onClick={preview} disabled={busy || !previewId} className="bg-ink px-5 py-3 text-xs font-semibold uppercase tracking-widest2 text-white disabled:opacity-50">
          Open preview
        </button>
      </div>

      {err && <div className="bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</div>}
      {emptyHint && <div className="border border-line bg-white px-4 py-6 text-sm text-muted">No program items yet.</div>}

      {/* Days */}
      <div className="grid gap-5 lg:grid-cols-3">
        {days.map(d => (
          <div key={d.day} className="border border-line bg-white">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div>
                <div className="font-display text-xl">{fmtProgramDay(d.day)}</div>
                {d.day === meetingDay && <div className="text-[11px] uppercase tracking-widest2 text-muted">1-on-1 meeting day · shown around meetings</div>}
              </div>
              <button className={BTN} onClick={() => setDraft({ day: d.day, start_time: "", end_time: "", title: "", note: "", location: "" })}>+ Add</button>
            </div>
            <ul className="divide-y divide-line">
              {d.items.map(it => (
                <li key={it.id} className="flex items-start gap-3 px-4 py-2.5">
                  <div className="w-32 shrink-0 text-sm tabular-nums text-muted">{fmtProgramRange(it.start_time.slice(0, 5), it.end_time?.slice(0, 5) ?? null)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-ink">{it.title}</div>
                    {it.location && <div className="text-xs text-muted">📍 {it.location}</div>}
                    {it.note && <div className="text-xs text-muted">{it.note}</div>}
                  </div>
                  <button className="text-xs underline text-muted" onClick={() => setDraft({
                    id: it.id, day: it.day, start_time: it.start_time.slice(0, 5), end_time: it.end_time?.slice(0, 5) ?? "",
                    title: it.title, note: it.note ?? "", location: it.location ?? "" })}>Edit</button>
                </li>
              ))}
              {d.items.length === 0 && <li className="px-4 py-4 text-sm text-muted">Nothing yet.</li>}
            </ul>
          </div>
        ))}
      </div>

      {draft && <ItemDialog draft={draft} busy={busy} err={err} onClose={() => { setDraft(null); setErr(null); }}
        onSave={async d => { if (await post({ action: "save", conference_id: conferenceId, ...d })) setDraft(null); }}
        onDelete={draft.id ? async () => { if (confirm(`Delete "${draft.title}"?`) && await post({ action: "delete", id: draft.id })) setDraft(null); } : undefined} />}
    </div>
  );
}

function ItemDialog({ draft, busy, err, onClose, onSave, onDelete }: {
  draft: Draft; busy: boolean; err: string | null; onClose: () => void; onSave: (d: Draft) => void; onDelete?: () => void;
}) {
  const [d, setD] = useState(draft);
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setD({ ...d, [k]: e.target.value });
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-lg border border-line bg-white p-5 shadow-xl sm:rounded-sm" onClick={e => e.stopPropagation()}>
        <div className={LABEL}>{draft.id ? "Edit program item" : "Add program item"}</div>
        <label className="mt-3 block"><span className={LABEL}>Day</span>
          <select className={INPUT} value={d.day} onChange={set("day")}>
            {DAYS.map(x => <option key={x} value={x}>{fmtProgramDay(x)}</option>)}
          </select>
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label><span className={LABEL}>Start</span><input type="time" className={INPUT} value={d.start_time} onChange={set("start_time")} /></label>
          <label><span className={LABEL}>End (optional)</span><input type="time" className={INPUT} value={d.end_time} onChange={set("end_time")} /></label>
        </div>
        <label className="mt-3 block"><span className={LABEL}>Title</span><input className={INPUT} value={d.title} onChange={set("title")} placeholder="Breakfast Buffet" /></label>
        <label className="mt-3 block"><span className={LABEL}>Location / address (optional)</span><input className={INPUT} value={d.location} onChange={set("location")} /></label>
        <label className="mt-3 block"><span className={LABEL}>Small note under the title (optional)</span>
          <textarea className={`${INPUT} min-h-[70px]`} value={d.note} onChange={set("note")} /></label>
        {err && <div className="mt-3 bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</div>}
        <div className="mt-5 flex gap-2">
          <button onClick={() => onSave(d)} disabled={busy} className="flex-1 bg-brand-accent px-4 py-3 text-xs font-semibold uppercase tracking-widest2 text-white disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
          {onDelete && <button onClick={onDelete} disabled={busy} className="border border-rose-300 px-4 py-3 text-xs font-semibold uppercase tracking-widest2 text-rose-700">Delete</button>}
          <button onClick={onClose} className="border border-ink/20 px-4 py-3 text-xs font-semibold uppercase tracking-widest2 text-ink">Cancel</button>
        </div>
      </div>
    </div>
  );
}
