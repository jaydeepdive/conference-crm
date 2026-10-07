/**
 * Interactive table for the super-admin platform-invites surface. Each row
 * has a per-attendee send button; a batch button sends to every unsent row
 * at once. Writes land on /api/platform/invites/send.
 */
"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export interface InviteRow {
  id: string;
  lead_name: string;
  full_name: string | null;
  email: string;
  invite_sent_at: string | null;
  accepted_at: string | null;
  user_id: string | null;
}

type Status = "accepted" | "invited" | "unsent";

function rowStatus(r: InviteRow): Status {
  if (r.accepted_at || r.user_id) return "accepted";
  if (r.invite_sent_at) return "invited";
  return "unsent";
}

export function PlatformInvitesClient({ rows, slug }: { rows: InviteRow[]; slug: string }) {
  const router = useRouter();
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const unsent = useMemo(() => rows.filter(r => rowStatus(r) === "unsent"), [rows]);

  async function viewAs(id: string) {
    // Set the impersonation cookie, then navigate the admin into the
    // attendee platform as this person.
    await fetch("/api/platform/admin/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attendee_profile_id: id }),
    });
    router.push(`/conferences/${slug}/platform`);
  }

  const [syncBusy, setSyncBusy] = useState(false);
  async function syncFromRegistered() {
    setSyncBusy(true); setError(null); setResult(null);
    const res = await fetch("/api/platform/invites/sync-from-registered", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    const j = await res.json();
    setSyncBusy(false);
    if (!res.ok) { setError(j.error ?? "Sync failed"); return; }
    setResult(`Synced from registered leads: ${j.created} new attendee${j.created === 1 ? "" : "s"} (${j.after} total). No emails sent.`);
    router.refresh();
  }

  async function sendMany(ids: string[]) {
    if (ids.length === 0) return;
    setError(null); setResult(null);
    setBusyIds(prev => { const next = new Set(prev); ids.forEach(id => next.add(id)); return next; });
    const res = await fetch("/api/platform/invites/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile_ids: ids }),
    });
    const j = await res.json();
    setBusyIds(prev => { const next = new Set(prev); ids.forEach(id => next.delete(id)); return next; });
    if (!res.ok) { setError(j.error ?? "Send failed"); return; }
    setResult(`${j.sent_count} / ${j.total} sent.`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => sendMany(unsent.map(r => r.id))}
          disabled={unsent.length === 0 || busyIds.size > 0}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          Send to all unsent ({unsent.length})
        </button>
        <button onClick={syncFromRegistered}
          disabled={syncBusy}
          title="Pull every registered lead (and their contacts) into the attendee list. No emails sent."
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 disabled:opacity-50">
          {syncBusy ? "Syncing…" : "↻ Sync registered leads"}
        </button>
        {result && <span className="text-sm text-emerald-700">{result}</span>}
        {error && <span className="text-sm text-rose-700">{error}</span>}
      </div>

      <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Lead</th>
              <th className="px-3 py-2">Attendee</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 w-32"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const st = rowStatus(r);
              const busy = busyIds.has(r.id);
              return (
                <tr key={r.id} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-2">{r.lead_name}</td>
                  <td className="px-3 py-2">{r.full_name ?? "—"}</td>
                  <td className="px-3 py-2">{r.email}</td>
                  <td className="px-3 py-2">
                    {st === "accepted" && (
                      <span className="text-emerald-700">Accepted{r.accepted_at ? ` ${new Date(r.accepted_at).toLocaleDateString()}` : ""}</span>
                    )}
                    {st === "invited" && (
                      <span className="text-slate-700">Invited {r.invite_sent_at ? new Date(r.invite_sent_at).toLocaleDateString() : ""}</span>
                    )}
                    {st === "unsent" && <span className="text-amber-700">Not sent</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => viewAs(r.id)}
                        disabled={busy}
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-800 disabled:opacity-50"
                        title="View the attendee platform as this person"
                      >
                        View as
                      </button>
                      {st !== "accepted" && (
                        <button onClick={() => sendMany([r.id])} disabled={busy}
                          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-800 disabled:opacity-50">
                          {busy ? "…" : st === "invited" ? "Resend" : "Send invite"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-500">No attendees yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
