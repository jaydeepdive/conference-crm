/**
 * Mobile-first list + inline add/edit/delete UI for `company_contacts`.
 *
 * Mirrors the staff CompanyContacts semantics but with a layout that
 * works on phones. Writes directly via the Supabase browser client —
 * RLS from 0018 lets attendees of the company edit their own roster.
 */
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CompanyContact } from "@/lib/types";

interface Form { name: string; title: string; email: string; phone: string }
const BLANK: Form = { name: "", title: "", email: "", phone: "" };

export function PlatformCompanyContacts({
  companyId, contacts,
}: {
  companyId: string;
  contacts: CompanyContact[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<Form>({ ...BLANK });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sorted = [...contacts].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    return (a.name ?? "").localeCompare(b.name ?? "");
  });

  function startNew() { setForm({ ...BLANK }); setAdding(true); setEditingId(null); setError(null); }
  function startEdit(c: CompanyContact) {
    setForm({ name: c.name ?? "", title: c.title ?? "", email: c.email ?? "", phone: c.phone ?? "" });
    setEditingId(c.id); setAdding(false); setError(null);
  }
  function cancel() { setAdding(false); setEditingId(null); setError(null); }

  async function save() {
    if (!form.name.trim()) { setError("Name is required."); return; }
    setBusy(true); setError(null);
    const supabase = createClient();
    const payload = {
      name: form.name.trim(),
      title: form.title.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
    };
    if (editingId) {
      const { error: err } = await supabase.from("company_contacts").update(payload).eq("id", editingId);
      if (err) { setError(err.message); setBusy(false); return; }
    } else {
      const { error: err } = await supabase.from("company_contacts")
        .insert({ ...payload, company_id: companyId, is_primary: contacts.length === 0 });
      if (err) { setError(err.message); setBusy(false); return; }
    }
    setBusy(false); cancel(); router.refresh();
  }

  async function del(id: string) {
    if (!confirm("Delete this person?")) return;
    setBusy(true); setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.from("company_contacts").delete().eq("id", id);
    setBusy(false);
    if (err) { setError(err.message); return; }
    router.refresh();
  }

  const input = "mt-1 w-full rounded-md border border-slate-300 px-3 py-2";

  return (
    <div className="mt-3 space-y-3">
      {sorted.length === 0 && !adding && (
        <p className="text-sm text-slate-500">No one added yet.</p>
      )}

      {sorted.map(c => (
        <div key={c.id} className="rounded-md border border-slate-200 bg-slate-50/60 p-3">
          {editingId === c.id ? (
            <ContactEditor form={form} setForm={setForm} input={input}
              onCancel={cancel} onSave={save} busy={busy} error={error} />
          ) : (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-slate-900">{c.name}</span>
                  {c.is_primary && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">Primary</span>}
                </div>
                {c.title && <div className="text-xs text-slate-500">{c.title}</div>}
                {c.email && <div className="truncate text-xs text-slate-500">{c.email}</div>}
                {c.phone && <div className="text-xs text-slate-500">{c.phone}</div>}
              </div>
              <div className="flex flex-col items-end gap-1 text-xs">
                <button onClick={() => startEdit(c)} className="text-slate-700 underline">Edit</button>
                <button onClick={() => del(c.id)} disabled={busy} className="text-rose-600 underline disabled:opacity-50">Delete</button>
              </div>
            </div>
          )}
        </div>
      ))}

      {adding && (
        <div className="rounded-md border border-slate-200 bg-slate-50/60 p-3">
          <ContactEditor form={form} setForm={setForm} input={input}
            onCancel={cancel} onSave={save} busy={busy} error={error} />
        </div>
      )}

      {!adding && !editingId && (
        <button onClick={startNew}
          className="w-full rounded-md border border-dashed border-slate-300 py-3 text-sm text-slate-700"
          style={{ minHeight: 44 }}>
          + Add person
        </button>
      )}
    </div>
  );
}

function ContactEditor({
  form, setForm, input, onCancel, onSave, busy, error,
}: {
  form: Form;
  setForm: (f: Form) => void;
  input: string;
  onCancel: () => void;
  onSave: () => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">Name</label>
      <input className={input} style={{ fontSize: 16 }} value={form.name}
        onChange={e => setForm({ ...form, name: e.target.value })} />
      <label className="mt-2 block text-sm font-medium text-slate-700">Title</label>
      <input className={input} style={{ fontSize: 16 }} value={form.title}
        onChange={e => setForm({ ...form, title: e.target.value })} />
      <label className="mt-2 block text-sm font-medium text-slate-700">Email</label>
      <input className={input} style={{ fontSize: 16 }} type="email" value={form.email}
        onChange={e => setForm({ ...form, email: e.target.value })} />
      <label className="mt-2 block text-sm font-medium text-slate-700">Phone</label>
      <input className={input} style={{ fontSize: 16 }} type="tel" value={form.phone}
        onChange={e => setForm({ ...form, phone: e.target.value })} />
      {error && <div className="mt-2 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>}
      <div className="mt-3 flex gap-2">
        <button onClick={onCancel} disabled={busy}
          className="flex-1 rounded-md border border-slate-300 py-2.5 text-sm font-medium text-slate-700"
          style={{ minHeight: 44 }}>Cancel</button>
        <button onClick={onSave} disabled={busy}
          className="flex-1 rounded-md bg-slate-900 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          style={{ minHeight: 44 }}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
