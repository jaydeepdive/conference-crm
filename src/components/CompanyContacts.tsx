"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CompanyContact } from "@/lib/types";

/**
 * Contacts panel for a company detail page.
 *
 * Shows the full list of contacts, lets the operator add/edit/delete rows
 * inline, and lets them pick one as the "primary" — primary drives the
 * default SignWell signer and the invoice "Bill To" line.
 *
 * Uses the Supabase browser client directly; RLS gates access via
 * company_contacts policies from migration 0018.
 */

type DraftState =
  | { mode: "new" }
  | { mode: "edit"; id: string };

const BLANK = { name: "", title: "", email: "", phone: "", is_primary: false };

export function CompanyContacts({
  companyId, contacts, canEdit,
}: {
  companyId: string;
  contacts: CompanyContact[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [form, setForm] = useState({ ...BLANK });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sorted = [...contacts].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    return (a.name ?? "").localeCompare(b.name ?? "");
  });

  function startNew() {
    setForm({ ...BLANK, is_primary: contacts.length === 0 });
    setDraft({ mode: "new" });
    setError(null);
  }

  function startEdit(c: CompanyContact) {
    setForm({
      name: c.name ?? "",
      title: c.title ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      is_primary: c.is_primary,
    });
    setDraft({ mode: "edit", id: c.id });
    setError(null);
  }

  function cancel() { setDraft(null); setError(null); }

  async function save() {
    if (!form.name.trim()) { setError("Name is required."); return; }
    setBusy(true); setError(null);
    const supabase = createClient();

    // If this draft is being marked primary, clear is_primary on any
    // other row for the company — the partial unique index enforces the
    // single-primary invariant, so we clear BEFORE writing.
    if (form.is_primary) {
      const excludeId = draft?.mode === "edit" ? draft.id : "";
      await supabase.from("company_contacts")
        .update({ is_primary: false })
        .eq("company_id", companyId)
        .eq("is_primary", true)
        .neq("id", excludeId || "00000000-0000-0000-0000-000000000000");
    }

    const payload = {
      name: form.name.trim(),
      title: form.title.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      is_primary: form.is_primary,
    };

    if (draft?.mode === "edit") {
      const { error: err } = await supabase.from("company_contacts")
        .update(payload).eq("id", draft.id);
      if (err) { setError(err.message); setBusy(false); return; }
    } else {
      const { error: err } = await supabase.from("company_contacts")
        .insert({ ...payload, company_id: companyId });
      if (err) { setError(err.message); setBusy(false); return; }
    }
    setBusy(false); setDraft(null);
    router.refresh();
  }

  async function del(id: string) {
    if (!confirm("Delete this contact?")) return;
    setBusy(true); setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.from("company_contacts").delete().eq("id", id);
    setBusy(false);
    if (err) { setError(err.message); return; }
    router.refresh();
  }

  async function makePrimary(id: string) {
    setBusy(true); setError(null);
    const supabase = createClient();
    await supabase.from("company_contacts")
      .update({ is_primary: false })
      .eq("company_id", companyId)
      .eq("is_primary", true);
    const { error: err } = await supabase.from("company_contacts")
      .update({ is_primary: true }).eq("id", id);
    setBusy(false);
    if (err) { setError(err.message); return; }
    router.refresh();
  }

  const input = "w-full rounded-md border border-gray-300 px-2 py-1 text-xs";
  const label = "mb-0.5 block text-[10px] font-semibold uppercase tracking-widest2 text-muted";

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Contacts</h2>
      <div className="space-y-2 rounded-md border border-gray-200 bg-white p-3">
        {sorted.length === 0 && !draft && (
          <p className="text-xs text-muted">No contacts yet. Add one so SignWell + invoices know who to address.</p>
        )}

        {sorted.map(c => (
          <div key={c.id} className="rounded-md border border-gray-100 bg-cream/30 p-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold">{c.name}</span>
                  {c.is_primary && (
                    <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest2 text-emerald-800">
                      Primary
                    </span>
                  )}
                </div>
                {c.title && <div className="text-xs text-muted">{c.title}</div>}
                {c.email && <div className="truncate text-xs text-ink/80">{c.email}</div>}
                {c.phone && <div className="text-xs text-ink/60">{c.phone}</div>}
              </div>
              {canEdit && (
                <div className="flex flex-col items-end gap-1 text-[10px] uppercase tracking-widest2">
                  <button onClick={() => startEdit(c)} className="text-ink/60 hover:text-ink">Edit</button>
                  {!c.is_primary && (
                    <button onClick={() => makePrimary(c.id)} disabled={busy} className="text-emerald-700 hover:underline">Make primary</button>
                  )}
                  <button onClick={() => del(c.id)} disabled={busy} className="text-rose-600 hover:underline">Delete</button>
                </div>
              )}
            </div>
          </div>
        ))}

        {error && <div className="rounded-md bg-rose-50 p-2 text-xs text-rose-800">{error}</div>}

        {draft && (
          <div className="space-y-2 rounded-md border border-brand-accent/40 bg-brand-accent/5 p-2">
            <div>
              <label className={label}>Name *</label>
              <input className={input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={label}>Title</label>
                <input className={input} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
              </div>
              <div>
                <label className={label}>Phone</label>
                <input className={input} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div>
              <label className={label}>Email</label>
              <input className={input} type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={form.is_primary} onChange={e => setForm({ ...form, is_primary: e.target.checked })} />
              Primary contact (default signer + bill-to)
            </label>
            <div className="flex gap-2">
              <button onClick={save} disabled={busy}
                style={{ backgroundColor: "#C8102E", color: "#FFFFFF" }}
                className="flex-1 px-3 py-1.5 text-xs font-semibold uppercase tracking-widest2 hover:opacity-90 disabled:opacity-50">
                {busy ? "Saving…" : "Save contact"}
              </button>
              <button onClick={cancel} disabled={busy}
                className="border border-gray-300 px-3 py-1.5 text-xs uppercase tracking-widest2 hover:bg-white disabled:opacity-50">
                Cancel
              </button>
            </div>
          </div>
        )}

        {canEdit && !draft && (
          <button
            onClick={startNew}
            className="w-full border border-dashed border-gray-300 px-3 py-2 text-xs uppercase tracking-widest2 text-ink/60 hover:border-brand-accent hover:text-ink"
          >
            + Add contact
          </button>
        )}
      </div>
    </div>
  );
}
