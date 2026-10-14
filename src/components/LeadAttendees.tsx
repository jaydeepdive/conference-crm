"use client";
/**
 * LeadAttendees — staff CRM panel on company / investor detail pages.
 * Lists every person (email) who can sign in to the Above & Beyond portal for
 * this company/investor; add, edit, remove. NEVER sends email — invites go
 * out only from the admin console's Attendees page.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AttendeeProfile } from "@/lib/types";
import { PORTAL_ORIGIN } from "@/lib/portalDomain";

interface Props {
  conferenceId: string;
  leadType: "company" | "investor";
  leadId: string;
  attendees: AttendeeProfile[];
  conferenceSlug?: string;
}

const INPUT = "w-full border border-line bg-white px-3 py-2 text-sm focus:border-brand-accent focus:outline-none";
const SMALL = "border border-line px-2 py-1 text-[10px] uppercase tracking-widest2 hover:border-ink disabled:opacity-50";

export function LeadAttendees({ conferenceId, leadType, leadId, attendees, conferenceSlug = "mining-summit-2026" }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");

  async function call(payload: Record<string, unknown>, key: string): Promise<boolean> {
    setError(null); setBusy(key);
    const res = await fetch("/api/platform/admin/attendees", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { setError(res.status === 403 ? "Only super admins can change attendees." : (j.error ?? "Failed.")); return false; }
    router.refresh();
    return true;
  }

  async function add() {
    if (!email.trim()) { setError("Email is required."); return; }
    if (await call({ action: "create", conference_id: conferenceId, lead_type: leadType, lead_id: leadId, email, full_name: name }, "add")) {
      setEmail(""); setName("");
    }
  }

  async function saveEdit(a: AttendeeProfile) {
    if (await call({ action: "update", id: a.id, full_name: editName, email: editEmail }, a.id)) setEditId(null);
  }

  async function remove(a: AttendeeProfile) {
    if (!confirm(`Remove ${a.full_name || a.email}? They lose access to the attendee portal. Meetings are not affected.`)) return;
    await call({ action: "remove", id: a.id }, a.id);
  }

  return (
    <div className="rounded-none border border-line bg-white p-5">
      <h3 className="font-display text-lg font-bold text-ink">Portal attendees</h3>
      <p className="mt-1 text-xs text-muted">
        Everyone who can sign in to the Above &amp; Beyond portal for this {leadType}. {leadType === "company" ? "Add as many people as you need — they share one meeting schedule." : "Investors are one person each."} Adding someone does <strong>not</strong> email them; send invites from the{" "}
        <a className="underline" target="_blank" rel="noopener"
          href={`${PORTAL_ORIGIN}/conferences/${conferenceSlug}/platform/admin/attendees`}>admin console</a>.
      </p>

      {error && <div className="mt-3 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}

      {attendees.length === 0 ? (
        <p className="mt-3 text-xs text-muted">No attendees yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {attendees.map(a => {
            const signedIn = !!(a.accepted_at || a.user_id);
            const editing = editId === a.id;
            return (
              <li key={a.id} className="py-3">
                {editing ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input className={INPUT} value={editName} onChange={e => setEditName(e.target.value)} placeholder="Full name" />
                    <input className={INPUT} value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="Email"
                      disabled={signedIn} title={signedIn ? "Already signed in — remove and re-add to change email" : ""} />
                    <div className="flex gap-2 sm:col-span-2">
                      <button onClick={() => saveEdit(a)} disabled={busy === a.id} className={`${SMALL} bg-ink text-white`}>Save</button>
                      <button onClick={() => setEditId(null)} className={`${SMALL} text-ink`}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-ink">{a.full_name || "(no name)"}</div>
                      <div className="text-xs text-muted">{a.email}</div>
                      <div className="mt-1 text-[10px] uppercase tracking-widest2 text-muted">
                        {signedIn ? "Signed in" : a.invite_sent_at ? `Invited ${new Date(a.invite_sent_at).toLocaleDateString()}` : "Not invited yet"}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { setEditId(a.id); setEditName(a.full_name ?? ""); setEditEmail(a.email); }}
                        className={`${SMALL} text-ink`}>Edit</button>
                      <button onClick={() => remove(a)} disabled={busy === a.id} className={`${SMALL} text-rose-700 hover:border-rose-700`}>Remove</button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {(leadType === "company" || attendees.length === 0) && (
      <div className="mt-4 border-t border-line pt-3">
        <h4 className="text-[11px] font-semibold uppercase tracking-widest2 text-muted">Add a person</h4>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <input placeholder="Full name" value={name} onChange={e => setName(e.target.value)} className={INPUT} />
          <input placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} className={INPUT} />
        </div>
        <div className="mt-2 flex justify-end">
          <button onClick={add} disabled={busy === "add" || !email.trim()}
            className="bg-ink px-3 py-2 text-[10px] font-semibold uppercase tracking-widest2 text-white hover:bg-brand-accent disabled:opacity-50">
            {busy === "add" ? "Adding…" : "Add person"}
          </button>
        </div>
      </div>
      )}
    </div>
  );
}
