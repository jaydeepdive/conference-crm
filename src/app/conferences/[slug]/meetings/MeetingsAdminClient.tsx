"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MeetingStatus } from "@/lib/types";

export interface LeadLite { id: string; name: string }
export interface SlotOption { iso: string; label: string }

export interface MeetingRow {
  id: string;
  company_id: string;
  investor_id: string;
  company_name: string;
  investor_name: string;
  status: MeetingStatus;
  slot_label: string | null;
  current_slot_iso: string | null;
  location: string | null;
  notes: string | null;
}

const STATUS_PILL: Record<MeetingStatus, string> = {
  proposed:  "bg-slate-100 text-slate-700",
  countered: "bg-amber-100 text-amber-800",
  accepted:  "bg-emerald-100 text-emerald-800",
  declined:  "bg-rose-100 text-rose-800",
  cancelled: "bg-rose-100 text-rose-800",
};

export interface BlocklistInfo { reason: string | null }

export function MeetingsAdminClient({
  slug, rows, companies, investors, slotOptions, busyByCompany, busyByInvestor,
  blocklist,
}: {
  slug: string;
  rows: MeetingRow[];
  companies: LeadLite[];
  investors: LeadLite[];
  slotOptions: SlotOption[];
  busyByCompany: Record<string, string[]>;
  busyByInvestor: Record<string, string[]>;
  blocklist?: Record<string, BlocklistInfo>;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | MeetingStatus>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(r => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!needle) return true;
      return (
        r.company_name.toLowerCase().includes(needle) ||
        r.investor_name.toLowerCase().includes(needle) ||
        (r.location ?? "").toLowerCase().includes(needle)
      );
    });
  }, [rows, q, statusFilter]);

  async function patchMeeting(id: string, body: Record<string, unknown>) {
    setErr(null);
    setBusyRow(id);
    try {
      const r = await fetch(`/api/platform/meetings/${id}/admin-edit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErr((j as { error?: string }).error ?? `HTTP ${r.status}`);
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setBusyRow(null);
    }
  }

  async function cancelMeeting(id: string) {
    if (!confirm("Cancel this meeting? Both parties will see it as cancelled.")) return;
    await patchMeeting(id, { status: "cancelled" });
  }

  return (
    <div className="space-y-4">
      {err && (
        <div className="rounded border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">{err}</div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="text"
          placeholder="Search company, investor, or table…"
          value={q}
          onChange={e => setQ(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-base sm:max-w-xs"
          style={{ fontSize: 16 }}
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as "all" | MeetingStatus)}
          className="rounded-md border border-slate-300 px-3 py-2 text-base"
          style={{ fontSize: 16 }}
        >
          <option value="all">All statuses</option>
          <option value="proposed">Proposed</option>
          <option value="countered">Countered</option>
          <option value="accepted">Accepted</option>
          <option value="declined">Declined</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="rounded-md bg-rose-600 px-4 py-2 text-base font-semibold text-white hover:bg-rose-700"
          style={{ fontSize: 16 }}
        >
          + New meeting
        </button>
      </div>

      <div className="text-sm text-muted">
        {filtered.length} of {rows.length} meeting{rows.length === 1 ? "" : "s"}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-md border border-slate-200 md:block">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Company</th>
              <th className="px-3 py-2">Investor</th>
              <th className="px-3 py-2">Time slot</th>
              <th className="px-3 py-2">Table</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(row => (
              <RowDesktop
                key={row.id} row={row} slug={slug} slotOptions={slotOptions}
                busyByCompany={busyByCompany} busyByInvestor={busyByInvestor}
                editing={editingId === row.id}
                setEditing={v => setEditingId(v ? row.id : null)}
                busy={busyRow === row.id}
                patchMeeting={patchMeeting}
                cancelMeeting={cancelMeeting}
              />
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-muted">No meetings match.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="grid grid-cols-1 gap-3 md:hidden">
        {filtered.map(row => (
          <CardMobile
            key={row.id} row={row} slug={slug} slotOptions={slotOptions}
            busyByCompany={busyByCompany} busyByInvestor={busyByInvestor}
            editing={editingId === row.id}
            setEditing={v => setEditingId(v ? row.id : null)}
            busy={busyRow === row.id}
            patchMeeting={patchMeeting}
            cancelMeeting={cancelMeeting}
          />
        ))}
        {filtered.length === 0 && (
          <div className="rounded-md border border-slate-200 bg-white p-6 text-center text-sm text-muted">
            No meetings match.
          </div>
        )}
      </div>

      {showCreate && (
        <CreateModal
          slug={slug}
          companies={companies}
          investors={investors}
          slotOptions={slotOptions}
          busyByCompany={busyByCompany}
          busyByInvestor={busyByInvestor}
          blocklist={blocklist ?? {}}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); router.refresh(); }}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Row + editor used by both desktop table and mobile cards

interface RowProps {
  row: MeetingRow;
  slug: string;
  slotOptions: SlotOption[];
  busyByCompany: Record<string, string[]>;
  busyByInvestor: Record<string, string[]>;
  editing: boolean;
  setEditing: (v: boolean) => void;
  busy: boolean;
  patchMeeting: (id: string, body: Record<string, unknown>) => Promise<boolean>;
  cancelMeeting: (id: string) => Promise<void>;
}

function RowDesktop(p: RowProps) {
  const { row } = p;
  return (
    <>
      <tr className="border-t border-slate-100 align-top">
        <td className="px-3 py-2">
          <Link href={`/conferences/${p.slug}/companies/${row.company_id}`} className="text-sky-700 hover:underline">
            {row.company_name}
          </Link>
        </td>
        <td className="px-3 py-2">
          <Link href={`/conferences/${p.slug}/investors/${row.investor_id}`} className="text-sky-700 hover:underline">
            {row.investor_name}
          </Link>
        </td>
        <td className="px-3 py-2 whitespace-nowrap">{row.slot_label ?? <span className="text-muted">—</span>}</td>
        <td className="px-3 py-2">
          <LocationCell row={row} busy={p.busy} patchMeeting={p.patchMeeting} />
        </td>
        <td className="px-3 py-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_PILL[row.status]}`}>
            {row.status}
          </span>
        </td>
        <td className="px-3 py-2 text-right whitespace-nowrap">
          <button
            type="button"
            onClick={() => p.setEditing(!p.editing)}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium hover:bg-slate-50"
          >
            {p.editing ? "Close" : "Edit"}
          </button>
          <Link
            href={`/conferences/${p.slug}/platform/meetings/${row.id}`}
            className="ml-2 text-xs text-sky-700 hover:underline"
          >
            Jump
          </Link>
        </td>
      </tr>
      {p.editing && (
        <tr className="border-t border-slate-100 bg-slate-50">
          <td colSpan={6} className="px-3 py-3">
            <EditPanel {...p} />
          </td>
        </tr>
      )}
    </>
  );
}

function CardMobile(p: RowProps) {
  const { row } = p;
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium">
            <Link href={`/conferences/${p.slug}/companies/${row.company_id}`} className="text-sky-700 hover:underline">
              {row.company_name}
            </Link>
          </div>
          <div className="truncate text-muted">
            <Link href={`/conferences/${p.slug}/investors/${row.investor_id}`} className="hover:underline">
              {row.investor_name}
            </Link>
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_PILL[row.status]}`}>
          {row.status}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div><span className="text-muted">Slot:</span> {row.slot_label ?? "—"}</div>
        <div><span className="text-muted">Table:</span> {row.location ?? "—"}</div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => p.setEditing(!p.editing)}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium hover:bg-slate-50"
        >
          {p.editing ? "Close" : "Edit"}
        </button>
        <Link
          href={`/conferences/${p.slug}/platform/meetings/${row.id}`}
          className="text-xs text-sky-700 hover:underline"
        >
          Jump to history
        </Link>
      </div>
      {p.editing && <div className="mt-3"><EditPanel {...p} /></div>}
    </div>
  );
}

function LocationCell({
  row, busy, patchMeeting,
}: { row: MeetingRow; busy: boolean; patchMeeting: RowProps["patchMeeting"] }) {
  const [val, setVal] = useState(row.location ?? "");
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="rounded px-1 text-left hover:bg-slate-100"
        title="Click to edit"
      >
        {row.location ?? <span className="text-muted italic">add table</span>}
      </button>
    );
  }
  return (
    <input
      type="text"
      autoFocus
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={async () => {
        setEditing(false);
        if (val !== (row.location ?? "")) {
          await patchMeeting(row.id, { location: val === "" ? null : val });
        }
      }}
      onKeyDown={async e => {
        if (e.key === "Enter") { (e.currentTarget as HTMLInputElement).blur(); }
        if (e.key === "Escape") { setVal(row.location ?? ""); setEditing(false); }
      }}
      disabled={busy}
      className="w-24 rounded border border-slate-300 px-2 py-1 text-base"
      style={{ fontSize: 16 }}
      placeholder="Table"
    />
  );
}

function EditPanel(p: RowProps) {
  const { row } = p;
  const busyA = new Set(p.busyByCompany[row.company_id] ?? []);
  const busyB = new Set(p.busyByInvestor[row.investor_id] ?? []);
  const [slotIso, setSlotIso] = useState<string>(row.current_slot_iso ?? "");

  async function saveSlot() {
    if (!slotIso) return;
    await p.patchMeeting(row.id, { scheduled_time: slotIso });
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <label className="text-xs font-medium text-muted">Time slot</label>
      <select
        value={slotIso}
        onChange={e => setSlotIso(e.target.value)}
        className="rounded border border-slate-300 px-2 py-1 text-base"
        style={{ fontSize: 16 }}
      >
        <option value="">— pick a slot —</option>
        {p.slotOptions.map(o => {
          const bA = busyA.has(o.iso) && o.iso !== row.current_slot_iso;
          const bB = busyB.has(o.iso) && o.iso !== row.current_slot_iso;
          const tag = bA && bB ? " (busy — both)" : bA ? " (busy — company)" : bB ? " (busy — investor)" : "";
          return <option key={o.iso} value={o.iso}>{o.label}{tag}</option>;
        })}
      </select>
      <button
        type="button"
        onClick={saveSlot}
        disabled={p.busy || !slotIso || slotIso === row.current_slot_iso}
        className="rounded bg-slate-800 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
      >
        Save slot
      </button>
      <div className="flex-1" />
      {row.status !== "cancelled" && (
        <button
          type="button"
          onClick={() => p.cancelMeeting(row.id)}
          disabled={p.busy}
          className="rounded border border-rose-300 bg-white px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
        >
          Cancel meeting
        </button>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Create modal

function CreateModal({
  slug, companies, investors, slotOptions, busyByCompany, busyByInvestor,
  blocklist, onClose, onCreated,
}: {
  slug: string;
  companies: LeadLite[];
  investors: LeadLite[];
  slotOptions: SlotOption[];
  busyByCompany: Record<string, string[]>;
  busyByInvestor: Record<string, string[]>;
  blocklist: Record<string, BlocklistInfo>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [companyId, setCompanyId] = useState("");
  const [investorId, setInvestorId] = useState("");
  const [slotIso, setSlotIso] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const busyA = new Set(companyId ? busyByCompany[companyId] ?? [] : []);
  const busyB = new Set(investorId ? busyByInvestor[investorId] ?? [] : []);

  const blockWarning: BlocklistInfo | null = (() => {
    if (!companyId || !investorId) return null;
    const k = `company:${companyId}|investor:${investorId}`;
    return blocklist[k] ?? null;
  })();

  async function submit() {
    setErr(null);
    if (!companyId || !investorId || !slotIso) {
      setErr("Pick a company, investor, and time slot."); return;
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/meetings/create`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug,
          company_id: companyId,
          investor_id: investorId,
          scheduled_time: slotIso,
          location: location === "" ? null : location,
          notes: notes === "" ? null : notes,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErr((j as { error?: string }).error ?? `HTTP ${r.status}`); return;
      }
      onCreated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">New meeting</h2>
          <button type="button" onClick={onClose} className="text-sm text-muted hover:underline">Close</button>
        </div>
        {err && <div className="mb-3 rounded border border-rose-300 bg-rose-50 p-2 text-sm text-rose-900">{err}</div>}
        {blockWarning && (
          <div className="mb-3 rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="font-semibold">⚠ Blocklist</div>
            <div className="mt-0.5">
              One of these parties has marked the other as &ldquo;do not pair&rdquo;.
              Reason: {blockWarning.reason ? blockWarning.reason : "(no reason)"}.
            </div>
            <div className="mt-1 text-xs text-amber-800">
              You can still create this meeting as an admin override.
            </div>
          </div>
        )}
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">Company</span>
            <select
              value={companyId}
              onChange={e => setCompanyId(e.target.value)}
              className="mt-1 block w-full rounded border border-slate-300 px-2 py-2 text-base"
              style={{ fontSize: 16 }}
            >
              <option value="">— pick —</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">Investor</span>
            <select
              value={investorId}
              onChange={e => setInvestorId(e.target.value)}
              className="mt-1 block w-full rounded border border-slate-300 px-2 py-2 text-base"
              style={{ fontSize: 16 }}
            >
              <option value="">— pick —</option>
              {investors.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">Time slot</span>
            <select
              value={slotIso}
              onChange={e => setSlotIso(e.target.value)}
              className="mt-1 block w-full rounded border border-slate-300 px-2 py-2 text-base"
              style={{ fontSize: 16 }}
            >
              <option value="">— pick —</option>
              {slotOptions.map(o => {
                const bA = busyA.has(o.iso);
                const bB = busyB.has(o.iso);
                const tag = bA && bB ? " (busy — both)" : bA ? " (busy — company)" : bB ? " (busy — investor)" : "";
                return <option key={o.iso} value={o.iso}>{o.label}{tag}</option>;
              })}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">Table / location (optional)</span>
            <input
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              className="mt-1 block w-full rounded border border-slate-300 px-2 py-2 text-base"
              style={{ fontSize: 16 }}
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">Notes (optional)</span>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              className="mt-1 block w-full rounded border border-slate-300 px-2 py-2 text-base"
              style={{ fontSize: 16 }}
            />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="rounded bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create meeting"}
          </button>
        </div>
      </div>
    </div>
  );
}
