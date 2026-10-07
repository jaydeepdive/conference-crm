/**
 * Attendees list for super admins: search, filter, send / resend portal
 * invites, sync registered leads in, and preview the portal as a person.
 * Writes land on /api/platform/invites/send and
 * /api/platform/invites/sync-from-registered.
 */
"use client";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { AttendeeSide } from "@/lib/types";
import { SetPasswordDialog } from "@/components/SetPasswordDialog";

export interface InviteRow {
  id: string;
  lead_type: AttendeeSide;
  lead_id: string;
  lead_name: string;
  full_name: string | null;
  email: string;
  invite_sent_at: string | null;
  accepted_at: string | null;
  user_id: string | null;
}

type Status = "signed_in" | "invited" | "not_invited";
type Filter = "all" | "company" | "investor" | Status;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "company", label: "Companies" },
  { value: "investor", label: "Investors" },
  { value: "not_invited", label: "Not invited" },
  { value: "invited", label: "Invited" },
  { value: "signed_in", label: "Signed in" },
];

const LABEL = "text-[11px] font-medium uppercase tracking-widest2 text-muted";
const BTN_BASE =
  "inline-flex min-h-[44px] items-center justify-center whitespace-nowrap px-4 text-xs font-semibold uppercase tracking-widest2 transition disabled:cursor-not-allowed disabled:opacity-50 md:min-h-0 md:py-2";
const BTN_PRIMARY = `${BTN_BASE} bg-brand-accent text-white hover:opacity-90`;
const BTN_SECONDARY = `${BTN_BASE} border border-ink/20 bg-white text-ink hover:border-ink`;
const BTN_COMPACT =
  "inline-flex items-center justify-center whitespace-nowrap border border-ink/20 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-widest2 text-ink hover:border-ink disabled:cursor-not-allowed disabled:opacity-50";

function rowStatus(r: InviteRow): Status {
  if (r.accepted_at || r.user_id) return "signed_in";
  if (r.invite_sent_at) return "invited";
  return "not_invited";
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function StatusPill({ row }: { row: InviteRow }) {
  const st = rowStatus(row);
  const base = "inline-flex items-center whitespace-nowrap rounded-sm px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ring-1 ring-inset";
  if (st === "signed_in") return <span className={`${base} bg-emerald-50 text-emerald-800 ring-emerald-200`}>Signed in</span>;
  if (st === "invited") {
    return (
      <span className={`${base} bg-amber-50 text-amber-800 ring-amber-200`}>
        Invited{row.invite_sent_at ? ` · ${shortDate(row.invite_sent_at)}` : ""}
      </span>
    );
  }
  return <span className={`${base} bg-utility text-muted ring-line`}>Not invited</span>;
}

function SidePill({ side }: { side: AttendeeSide }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-sm border border-line px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-muted">
      {side === "company" ? "Company" : "Investor"}
    </span>
  );
}

function StatCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="border border-line bg-white px-4 py-3">
      <div className={LABEL}>{label}</div>
      <div className="mt-1 font-display text-[28px] font-bold leading-none text-ink">{value}</div>
    </div>
  );
}

export function PlatformInvitesClient({ rows, slug }: { rows: InviteRow[]; slug: string }) {
  const router = useRouter();
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [syncBusy, setSyncBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [pwFor, setPwFor] = useState<InviteRow | null>(null);

  const stats = useMemo(() => {
    const orgs = (side: AttendeeSide) => new Set(rows.filter(r => r.lead_type === side).map(r => r.lead_id)).size;
    return {
      total: rows.length,
      companies: orgs("company"),
      investors: orgs("investor"),
      invited: rows.filter(r => rowStatus(r) === "invited").length,
      signedIn: rows.filter(r => rowStatus(r) === "signed_in").length,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(r => {
      if (filter === "company" || filter === "investor") { if (r.lead_type !== filter) return false; }
      else if (filter !== "all" && rowStatus(r) !== filter) return false;
      if (!needle) return true;
      return (
        (r.full_name ?? "").toLowerCase().includes(needle) ||
        r.email.toLowerCase().includes(needle) ||
        r.lead_name.toLowerCase().includes(needle)
      );
    });
  }, [rows, q, filter]);

  const toSend = useMemo(() => filtered.filter(r => rowStatus(r) === "not_invited"), [filtered]);

  async function preview(id: string) {
    setPreviewBusy(id);
    setError(null);
    const res = await fetch("/api/platform/admin/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attendee_profile_id: id }),
    });
    if (!res.ok) {
      setPreviewBusy(null);
      setError("Couldn't open the preview. Try again.");
      return;
    }
    router.push(`/conferences/${slug}/platform`);
  }

  async function syncFromRegistered() {
    setSyncBusy(true); setError(null); setResult(null);
    try {
      const res = await fetch("/api/platform/invites/sync-from-registered", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; created?: number; after?: number };
      if (!res.ok) { setError(j.error ?? "Sync failed."); return; }
      const n = j.created ?? 0;
      setResult(n === 0
        ? "Already up to date — no new attendees. No emails were sent."
        : `Added ${n} new attendee${n === 1 ? "" : "s"} from registered leads. No emails were sent.`);
      router.refresh();
    } finally {
      setSyncBusy(false);
    }
  }

  async function sendMany(ids: string[]) {
    if (ids.length === 0) return;
    setError(null); setResult(null);
    setBusyIds(prev => { const next = new Set(prev); ids.forEach(id => next.add(id)); return next; });
    try {
      const res = await fetch("/api/platform/invites/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_ids: ids }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; sent_count?: number; total?: number };
      if (!res.ok) { setError(j.error ?? "Sending failed."); return; }
      const sent = j.sent_count ?? 0;
      const total = j.total ?? ids.length;
      setResult(sent === total
        ? `Sent ${sent} invite email${sent === 1 ? "" : "s"}.`
        : `Sent ${sent} of ${total} invite emails. Check the ones still marked "Not invited".`);
      router.refresh();
    } finally {
      setBusyIds(prev => { const next = new Set(prev); ids.forEach(id => next.delete(id)); return next; });
    }
  }

  function sendBatch() {
    const n = toSend.length;
    if (n === 0) return;
    if (!confirm(`Send ${n} invite email${n === 1 ? "" : "s"}? This cannot be undone.`)) return;
    void sendMany(toSend.map(r => r.id));
  }

  function sendOne(r: InviteRow) {
    const resend = rowStatus(r) === "invited";
    const who = r.full_name ?? r.email;
    if (!confirm(`${resend ? "Resend" : "Send"} the invite email to ${who}?`)) return;
    void sendMany([r.id]);
  }

  const anyBusy = busyIds.size > 0;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Companies" value={stats.companies} />
        <StatCard label="Investors" value={stats.investors} />
        <StatCard label="Invited" value={stats.invited} />
        <StatCard label="Signed in" value={stats.signedIn} />
      </div>

      {/* Info note */}
      <p className="border-l-2 border-ink/20 pl-3 text-sm text-muted">
        Invite emails only go out when you press Send. Registered leads are added here automatically.
      </p>

      {/* Toolbar */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <input
            type="search"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search name, email or company"
            className="block w-full min-h-[44px] rounded-sm border border-ink/20 bg-white px-3 py-2 text-base text-ink focus:border-ink focus:outline-none md:min-h-0 md:text-sm lg:max-w-sm"
          />
          <div className="grid grid-cols-2 gap-2 sm:flex lg:ml-auto">
            <button type="button" onClick={syncFromRegistered} disabled={syncBusy} className={BTN_SECONDARY}
              title="Add every registered lead and their contacts. No emails are sent.">
              {syncBusy ? "Syncing…" : "↻ Sync registered leads"}
            </button>
            <button type="button" onClick={sendBatch} disabled={toSend.length === 0 || anyBusy} className={BTN_PRIMARY}>
              {anyBusy ? "Sending…" : `Send invites (${toSend.length})`}
            </button>
          </div>
        </div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {FILTERS.map(f => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={`min-h-[44px] shrink-0 whitespace-nowrap border px-3 text-[11px] font-semibold uppercase tracking-widest2 md:min-h-0 md:py-1.5 ${
                filter === f.value ? "border-ink bg-ink text-white" : "border-ink/20 bg-white text-muted hover:text-ink"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {result && <div className="border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{result}</div>}
        {error && <div className="border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">{error}</div>}
        <div className="text-xs text-muted">{filtered.length} of {rows.length} attendee{rows.length === 1 ? "" : "s"}</div>
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto border border-line bg-white md:block">
        <table className="w-full text-sm">
          <thead className="bg-utility text-left">
            <tr>
              <th className={`px-4 py-2 ${LABEL}`}>Attendee</th>
              <th className={`px-4 py-2 ${LABEL}`}>Organization</th>
              <th className={`px-4 py-2 ${LABEL}`}>Status</th>
              <th className={`px-4 py-2 text-right ${LABEL}`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => {
              const st = rowStatus(r);
              const busy = busyIds.has(r.id);
              const newOrg = i === 0 || filtered[i - 1].lead_id !== r.lead_id;
              return (
                <Fragment key={r.id}>
                  <tr className={`${newOrg ? "border-t border-line" : ""} hover:bg-utility/60`}>
                    <td className="px-4 py-2.5">
                      <div className="font-semibold text-ink">{r.full_name ?? <span className="font-normal italic text-muted">No name</span>}</div>
                      <div className="text-xs text-muted">{r.email}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      {newOrg ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-ink">{r.lead_name}</span>
                          <SidePill side={r.lead_type} />
                        </div>
                      ) : (
                        <span className="sr-only">{r.lead_name}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5"><StatusPill row={r} /></td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button type="button" onClick={() => preview(r.id)} disabled={previewBusy !== null}
                          className={BTN_COMPACT} title="Open the attendee portal as this person sees it">
                          {previewBusy === r.id ? "Opening…" : "Preview"}
                        </button>
                        <button type="button" onClick={() => setPwFor(r)} className={BTN_COMPACT}
                          title="Set a password directly — no email">
                          Password
                        </button>
                        {st !== "signed_in" && (
                          <button type="button" onClick={() => sendOne(r)} disabled={busy} className={BTN_COMPACT}>
                            {busy ? "Sending…" : st === "invited" ? "Resend" : "Send"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                </Fragment>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-muted">
                {rows.length === 0
                  ? "No attendees yet. Press “Sync registered leads” to add everyone who has registered."
                  : "No attendees match this filter."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {filtered.map(r => {
          const st = rowStatus(r);
          const busy = busyIds.has(r.id);
          return (
            <div key={r.id} className="border border-line bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-ink">{r.full_name ?? "No name"}</div>
                  <div className="truncate text-sm text-muted">{r.email}</div>
                </div>
                <StatusPill row={r} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-ink">{r.lead_name}</span>
                <SidePill side={r.lead_type} />
              </div>
              <div className={`mt-3 grid gap-2 ${st === "signed_in" ? "grid-cols-2" : "grid-cols-3"}`}>
                <button type="button" onClick={() => preview(r.id)} disabled={previewBusy !== null} className={BTN_SECONDARY}>
                  {previewBusy === r.id ? "Opening…" : "Preview"}
                </button>
                <button type="button" onClick={() => setPwFor(r)} className={BTN_SECONDARY}>
                  Password
                </button>
                {st !== "signed_in" && (
                  <button type="button" onClick={() => sendOne(r)} disabled={busy}
                    className={st === "invited" ? BTN_SECONDARY : BTN_PRIMARY}>
                    {busy ? "Sending…" : st === "invited" ? "Resend" : "Send"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="border border-line bg-white p-6 text-center text-sm text-muted">
            {rows.length === 0
              ? "No attendees yet. Press “Sync registered leads” to add everyone who has registered."
              : "No attendees match this filter."}
          </div>
        )}
      </div>
      <SetPasswordDialog
        open={pwFor !== null}
        onClose={() => { setPwFor(null); router.refresh(); }}
        who={pwFor?.full_name ?? pwFor?.email ?? ""}
        email={pwFor?.email ?? ""}
        endpoint="/api/platform/admin/set-password"
        body={{ attendee_profile_id: pwFor?.id }}
      />
    </div>
  );
}
