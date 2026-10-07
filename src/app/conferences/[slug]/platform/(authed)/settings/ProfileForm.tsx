/**
 * Mobile-first editable form for the attendee's own display name / title /
 * phone / about blurb. Writes via /api/platform/profile/update.
 */
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Attendee {
  id: string;
  full_name: string | null;
  title: string | null;
  phone: string | null;
  about: string | null;
}

export function ProfileForm({ attendee }: { attendee: Attendee }) {
  const router = useRouter();
  const [form, setForm] = useState({
    full_name: attendee.full_name ?? "",
    title: attendee.title ?? "",
    phone: attendee.phone ?? "",
    about: attendee.about ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true); setError(null); setSaved(false);
    const res = await fetch("/api/platform/profile/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: form.full_name.trim() || null,
        title: form.title.trim() || null,
        phone: form.phone.trim() || null,
        about: form.about.trim() || null,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: "Save failed" }));
      setError(j.error ?? "Save failed");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  const input = "mt-1 w-full rounded-md border border-slate-300 px-3 py-2";
  const label = "mt-3 block text-sm font-medium text-slate-700";

  return (
    <div className="mt-3">
      <label className={label}>Display name</label>
      <input className={input} style={{ fontSize: 16 }} value={form.full_name}
        onChange={e => setForm({ ...form, full_name: e.target.value })} />
      <label className={label}>Title</label>
      <input className={input} style={{ fontSize: 16 }} value={form.title}
        onChange={e => setForm({ ...form, title: e.target.value })} />
      <label className={label}>Phone</label>
      <input className={input} style={{ fontSize: 16 }} value={form.phone}
        onChange={e => setForm({ ...form, phone: e.target.value })}
        type="tel" autoComplete="tel" />
      <label className={label}>Short bio (optional)</label>
      <textarea className={input} style={{ fontSize: 16 }} rows={3} value={form.about}
        onChange={e => setForm({ ...form, about: e.target.value })} />

      {error && <div className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>}
      {saved && <div className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Saved.</div>}

      <button onClick={save} disabled={busy}
        className="mt-4 w-full rounded-md bg-slate-900 py-3 text-base font-medium text-white disabled:opacity-50 sm:w-auto sm:px-6"
        style={{ minHeight: 48 }}>
        {busy ? "Saving…" : "Save changes"}
      </button>
    </div>
  );
}
