"use client";
/**
 * Company portal profile: website, blurb, category, primary metal.
 * Shown to investors in the attendee portal directory.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { COMPANY_CATEGORIES, PRIMARY_METALS } from "@/lib/constants";

export interface CompanyProfileValues {
  id: string;
  name?: string;
  website: string | null;
  about: string | null;
  category: string | null;
  primary_metal: string | null;
}

const LABEL = "block text-[11px] font-medium uppercase tracking-widest2 text-muted";
const INPUT = "mt-1 w-full border border-ink/20 bg-white px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none";

export function CompanyProfileEditor({ company, onSaved, compact = false }: {
  company: CompanyProfileValues; onSaved?: () => void; compact?: boolean;
}) {
  const router = useRouter();
  const [website, setWebsite] = useState(company.website ?? "");
  const [about, setAbout] = useState(company.about ?? "");
  const [category, setCategory] = useState(company.category ?? "");
  const [metal, setMetal] = useState(company.primary_metal ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setBusy(true); setMsg(null);
    const res = await fetch(`/api/admin/companies/${company.id}/profile`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ website, about, category, primary_metal: metal }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg({ ok: false, text: j.error ?? "Could not save." }); return; }
    setMsg({ ok: true, text: "Saved — live in the attendee portal." });
    router.refresh();
    onSaved?.();
  }

  return (
    <div className={compact ? "" : "border border-line bg-white p-5"}>
      {!compact && (
        <>
          <h3 className="font-display text-lg font-bold text-ink">Portal profile</h3>
          <p className="mt-1 text-xs text-muted">What investors see about this company in the attendee portal.</p>
        </>
      )}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={LABEL}>Category</span>
          <select className={INPUT} value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">— Not set —</option>
            {COMPANY_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="block">
          <span className={LABEL}>Primary metal</span>
          <select className={INPUT} value={metal} onChange={e => setMetal(e.target.value)}>
            <option value="">— None / leave blank —</option>
            {PRIMARY_METALS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className={LABEL}>Website</span>
          <input className={INPUT} value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://company.com" />
        </label>
        <label className="block sm:col-span-2">
          <span className={LABEL}>About the company</span>
          <textarea className={`${INPUT} min-h-[120px]`} value={about} onChange={e => setAbout(e.target.value)} maxLength={3000}
            placeholder="A short description investors will read in the directory." />
          <span className="mt-1 block text-right text-[11px] text-muted">{about.length}/3000</span>
        </label>
      </div>
      {msg && <div className={`mt-2 px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>{msg.text}</div>}
      <div className="mt-3 flex justify-end">
        <button onClick={save} disabled={busy}
          className="bg-ink px-4 py-2.5 text-xs font-semibold uppercase tracking-widest2 text-white hover:bg-brand-accent disabled:opacity-50">
          {busy ? "Saving…" : "Save profile"}
        </button>
      </div>
    </div>
  );
}
