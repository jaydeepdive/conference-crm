"use client";
/**
 * Add / edit one person (attendee login) for a company or investor.
 * Never sends email — invites still go out only via the Send buttons.
 */
import { useMemo, useState } from "react";

export interface LeadOption { id: string; type: "company" | "investor"; name: string }
export interface PersonDraft {
  id?: string;
  lead_type: "company" | "investor";
  lead_id: string;
  full_name: string;
  email: string;
  signed_in?: boolean;
}

const INPUT = "mt-1 block w-full rounded-sm border border-ink/20 bg-white px-3 py-2.5 text-base text-ink focus:border-ink focus:outline-none md:text-sm";
const LABEL = "text-[11px] font-medium uppercase tracking-widest2 text-muted";

export function PersonDialog({ open, onClose, onSaved, conferenceId, leads, initial }: {
  open: boolean;
  onClose: () => void;
  onSaved: (msg: string) => void;
  conferenceId: string;
  leads: LeadOption[];
  initial: PersonDraft | null;
}) {
  if (!open || !initial) return null;
  return <Inner key={initial.id ?? `${initial.lead_type}:${initial.lead_id}`} {...{ onClose, onSaved, conferenceId, leads, initial }} />;
}

function Inner({ onClose, onSaved, conferenceId, leads, initial }: {
  onClose: () => void; onSaved: (msg: string) => void; conferenceId: string; leads: LeadOption[]; initial: PersonDraft;
}) {
  const editing = !!initial.id;
  const side = initial.lead_type;
  const [leadId, setLeadId] = useState(initial.lead_id);
  const [search, setSearch] = useState("");
  const [name, setName] = useState(initial.full_name);
  const [email, setEmail] = useState(initial.email);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = useMemo(() => {
    const n = search.trim().toLowerCase();
    return leads.filter(l => l.type === side && (!n || l.name.toLowerCase().includes(n)));
  }, [leads, side, search]);
  const chosen = leads.find(l => l.id === leadId);

  async function save() {
    setError(null);
    if (!editing && !leadId) { setError(`Choose the ${side}.`); return; }
    if (!email.trim()) { setError("Email is required."); return; }
    setBusy(true);
    const res = await fetch("/api/platform/admin/attendees", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing
        ? { action: "update", id: initial.id, full_name: name, email }
        : { action: "create", conference_id: conferenceId, lead_type: side, lead_id: leadId, full_name: name, email }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(j.error ?? "Could not save."); return; }
    onSaved(editing ? "Saved." : `Added ${name.trim() || email.trim()} to ${chosen?.name ?? "the list"}. No email was sent.`);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-lg border border-line bg-white p-5 shadow-xl sm:rounded-sm"
        onClick={e => e.stopPropagation()}>
        <div className={LABEL}>{editing ? "Edit person" : "Add person"}</div>
        <div className="mt-1 font-display text-2xl text-ink">
          {editing ? (initial.full_name || initial.email) : "Add someone to a company"}
        </div>

        {!editing && (
          <>
            <label className={`mt-4 block ${LABEL}`}>{side === "company" ? "Company" : "Investor"}</label>
            {chosen && chosen.type === side ? (
              <div className="mt-1 flex items-center justify-between border border-ink/20 bg-utility px-3 py-2.5 text-sm">
                <span className="font-semibold text-ink">{chosen.name}</span>
                <button type="button" onClick={() => setLeadId("")} className="text-xs underline text-muted">Change</button>
              </div>
            ) : (
              <>
                <input className={INPUT} placeholder={`Search ${side === "company" ? "companies" : "investors"}…`}
                  value={search} onChange={e => setSearch(e.target.value)} autoFocus />
                <div className="mt-1 max-h-48 overflow-y-auto border border-line">
                  {options.slice(0, 100).map(o => (
                    <button key={o.id} type="button" onClick={() => setLeadId(o.id)}
                      className="block w-full border-b border-line px-3 py-2 text-left text-sm text-ink last:border-b-0 hover:bg-utility">
                      {o.name}
                    </button>
                  ))}
                  {options.length === 0 && <div className="px-3 py-3 text-sm text-muted">No matches.</div>}
                </div>
              </>
            )}
          </>
        )}

        <label className={`mt-4 block ${LABEL}`}>Full name</label>
        <input className={INPUT} value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" />
        <label className={`mt-4 block ${LABEL}`}>Email</label>
        <input className={INPUT} type="email" value={email} onChange={e => setEmail(e.target.value)}
          placeholder="jane@company.com" disabled={editing && initial.signed_in} />
        {editing && initial.signed_in && (
          <p className="mt-1 text-xs text-muted">This person has already signed in, so their email can&rsquo;t change. Remove them and add the new email instead.</p>
        )}
        {editing && !initial.signed_in && (
          <p className="mt-1 text-xs text-muted">Changing the email cancels any invite link already sent.</p>
        )}

        {error && <div className="mt-3 border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>}
        <p className="mt-3 text-xs text-muted">No email is sent. Use Send on the Attendees list when you&rsquo;re ready.</p>

        <div className="mt-5 flex gap-2">
          <button type="button" onClick={save} disabled={busy}
            className="flex-1 bg-brand-accent px-4 py-3 text-xs font-semibold uppercase tracking-widest2 text-white disabled:opacity-50">
            {busy ? "Saving…" : editing ? "Save" : "Add person"}
          </button>
          <button type="button" onClick={onClose}
            className="border border-ink/20 px-4 py-3 text-xs font-semibold uppercase tracking-widest2 text-ink">Cancel</button>
        </div>
      </div>
    </div>
  );
}
