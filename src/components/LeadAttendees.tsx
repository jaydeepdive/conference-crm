"use client";
/**
 * LeadAttendees — staff-facing attendee-management panel embedded on the
 * lead detail page (companies/[id] and investors/[id]).
 *
 * Shows the list of attendee_profiles rows attached to this lead with:
 *   - status (invited vs accepted)
 *   - Copy invite link
 *   - Send invite email (via Gmail if the current user has creds; otherwise
 *     the URL is returned for manual paste)
 *   - Re-issue token (invalidate current link, generate fresh one)
 *   - Remove
 *
 * Plus a small form to add a new attendee.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AttendeeProfile } from "@/lib/types";

interface Props {
  conferenceId: string;
  leadType: "company" | "investor";
  leadId: string;
  attendees: AttendeeProfile[];
}

export function LeadAttendees({ conferenceId, leadType, leadId, attendees }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);            // attendee id currently working
  const [pendingLink, setPendingLink] = useState<string | null>(null); // shown when Gmail send fell back to a URL
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function addAttendee() {
    setError(null);
    if (!email.trim()) { setError("Email is required."); return; }
    setAdding(true);
    const res = await fetch("/api/portal/attendees/create", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conference_id: conferenceId, lead_type: leadType, lead_id: leadId,
        email: email.trim(), full_name: name.trim() || undefined,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setError(json.error ?? "Failed to add attendee."); setAdding(false); return; }
    setEmail(""); setName("");
    setPendingLink(json.accept_url ?? null);
    setAdding(false);
    router.refresh();
  }

  async function sendInvite(id: string) {
    setError(null); setBusy(id); setPendingLink(null);
    const res = await fetch("/api/portal/invites/send", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attendee_profile_id: id }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { setError(json.error ?? "Failed to send invite."); return; }
    if (!json.sent) {
      setPendingLink(json.accept_url);
      setError(json.reason ?? "Gmail not configured — copy the link and send it manually.");
    } else {
      setError(null);
    }
    router.refresh();
  }

  async function reissue(id: string) {
    setError(null); setBusy(id); setPendingLink(null);
    if (!confirm("Re-issue the invite token? The old link (if any) will stop working.")) {
      setBusy(null); return;
    }
    const res = await fetch("/api/portal/invites/send", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attendee_profile_id: id, resend_token: true }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { setError(json.error ?? "Failed."); return; }
    setPendingLink(json.accept_url);
    if (!json.sent) setError(json.reason ?? null);
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("Remove this attendee? They will lose portal access.")) return;
    setBusy(id);
    const res = await fetch("/api/portal/attendees/delete", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { setError(json.error ?? "Failed."); return; }
    router.refresh();
  }

  function copyLink(id: string, token: string | null) {
    if (!token) return;
    const url = `${window.location.origin}/portal/accept?token=${encodeURIComponent(token)}`;
    navigator.clipboard.writeText(url);
    setCopied(id);
    setTimeout(() => setCopied(c => (c === id ? null : c)), 2000);
  }

  return (
    <div className="rounded-none border border-line bg-white p-5">
      <h3 className="font-display text-lg font-bold text-ink">Portal attendees</h3>
      <p className="mt-1 text-xs text-muted">
        People who can log in to the attendee portal for this {leadType}. All attendees share the same meeting schedule.
      </p>

      {error && <div className="mt-3 rounded-md bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
      {pendingLink && (
        <div className="mt-3 rounded-md bg-emerald-50 p-3 text-xs text-emerald-800">
          <div>Accept link (copy & send manually if email failed):</div>
          <input readOnly value={pendingLink}
            onFocus={e => e.currentTarget.select()}
            className="mt-1 w-full rounded-md border border-emerald-200 bg-white px-2 py-1 text-xs" />
        </div>
      )}

      {attendees.length === 0 ? (
        <p className="mt-3 text-xs text-muted">No attendees yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {attendees.map(a => {
            const accepted = !!a.accepted_at;
            return (
              <li key={a.id} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-ink">{a.full_name || "(no name)"}</div>
                    <div className="text-xs text-muted">{a.email}</div>
                    <div className="mt-1 text-[10px] uppercase tracking-widest2 text-muted">
                      {accepted ? "Accepted" : a.invite_sent_at ? "Invited" : "Not yet sent"}
                      {a.invite_sent_at && <span className="ml-2 normal-case tracking-normal">· sent {new Date(a.invite_sent_at).toLocaleDateString()}</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {a.invite_token && (
                      <button onClick={() => copyLink(a.id, a.invite_token)}
                        className="border border-line px-2 py-1 text-[10px] uppercase tracking-widest2 text-ink hover:border-ink">
                        {copied === a.id ? "Copied!" : "Copy invite link"}
                      </button>
                    )}
                    {!accepted && (
                      <button onClick={() => sendInvite(a.id)} disabled={busy === a.id}
                        className="border border-line px-2 py-1 text-[10px] uppercase tracking-widest2 text-ink hover:border-ink disabled:opacity-50">
                        {busy === a.id ? "…" : "Send email"}
                      </button>
                    )}
                    <button onClick={() => reissue(a.id)} disabled={busy === a.id}
                      className="border border-line px-2 py-1 text-[10px] uppercase tracking-widest2 text-ink hover:border-ink disabled:opacity-50">
                      Re-issue token
                    </button>
                    <button onClick={() => remove(a.id)} disabled={busy === a.id}
                      className="border border-line px-2 py-1 text-[10px] uppercase tracking-widest2 text-rose-700 hover:border-rose-700 disabled:opacity-50">
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 border-t border-line pt-3">
        <h4 className="text-[11px] font-semibold uppercase tracking-widest2 text-muted">Add attendee</h4>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <input placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)}
            className="rounded-md border border-line bg-white px-3 py-2 text-sm focus:border-brand-accent focus:outline-none" />
          <input placeholder="Full name (optional)" value={name} onChange={e => setName(e.target.value)}
            className="rounded-md border border-line bg-white px-3 py-2 text-sm focus:border-brand-accent focus:outline-none" />
        </div>
        <div className="mt-2 flex items-center justify-end">
          <button onClick={addAttendee} disabled={adding || !email.trim()}
            className="bg-ink px-3 py-2 text-[10px] font-semibold uppercase tracking-widest2 text-white hover:bg-brand-accent disabled:opacity-50">
            {adding ? "Adding…" : "Add attendee"}
          </button>
        </div>
      </div>
    </div>
  );
}
