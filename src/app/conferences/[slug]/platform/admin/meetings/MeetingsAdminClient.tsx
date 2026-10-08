"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MeetingStatus } from "@/lib/types";

export interface LeadLite { id: string; name: string; active?: boolean }
export interface SlotOption { iso: string; label: string; short: string }
export interface BlocklistInfo { reason: string | null }

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

type SlotMap = Record<string, string[]>;
type Axis = "company" | "investor";
type View = "grid" | "list";
type StatusFilter = "all" | "confirmed" | "pending" | "closed";

interface CreateDraft { companyId: string; investorId: string; slotIso: string }

// -----------------------------------------------------------------------------
// Shared styles (match the CRM's editorial look)

const LABEL = "text-[11px] font-medium uppercase tracking-widest2 text-muted";
const BTN_BASE =
  "inline-flex min-h-[44px] items-center justify-center whitespace-nowrap px-4 text-xs font-semibold uppercase tracking-widest2 transition disabled:cursor-not-allowed disabled:opacity-50 md:min-h-0 md:py-2";
const BTN_PRIMARY = `${BTN_BASE} bg-brand-accent text-white hover:opacity-90`;
const BTN_SECONDARY = `${BTN_BASE} border border-ink/20 bg-white text-ink hover:border-ink`;
const BTN_DANGER = `${BTN_BASE} border border-rose-300 bg-white text-rose-700 hover:bg-rose-50`;
const INPUT =
  "block w-full min-h-[44px] rounded-sm border border-ink/20 bg-white px-3 py-2 text-base text-ink focus:border-ink focus:outline-none md:min-h-0 md:text-sm";
const HATCH = {
  backgroundImage:
    "repeating-linear-gradient(135deg, rgba(14,14,14,0.07) 0 6px, transparent 6px 12px)",
};

function statusPill(s: MeetingStatus): { label: string; cls: string } {
  switch (s) {
    case "accepted":  return { label: "Confirmed", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200" };
    case "proposed":
    case "countered": return { label: "Pending",   cls: "bg-amber-50 text-amber-800 ring-amber-200" };
    case "declined":  return { label: "Declined",  cls: "bg-utility text-muted ring-line" };
    case "cancelled": return { label: "Cancelled", cls: "bg-utility text-muted ring-line" };
  }
}

function StatusPill({ status }: { status: MeetingStatus }) {
  const p = statusPill(status);
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-sm px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ring-1 ring-inset ${p.cls}`}>
      {p.label}
    </span>
  );
}

function Segmented<T extends string>({
  options, value, onChange, label,
}: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex w-full border border-ink/20 bg-white sm:w-auto">
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-[44px] flex-1 whitespace-nowrap px-4 text-xs font-semibold uppercase tracking-widest2 md:min-h-0 md:py-2 ${
            i > 0 ? "border-l border-ink/20" : ""
          } ${value === o.value ? "bg-ink text-white" : "text-muted hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="border border-line bg-white px-4 py-3">
      <div className={LABEL}>{label}</div>
      <div className="mt-1 font-display text-[28px] font-bold leading-none text-ink">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Drawer (desktop) / bottom sheet (mobile)

function Sheet({
  title, sub, onClose, children, footer,
}: { title: string; sub?: ReactNode; onClose: () => void; children: ReactNode; footer: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[92vh] flex-col rounded-t-md bg-white shadow-2xl md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[460px] md:rounded-none">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line md:hidden" />
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-display text-[24px] font-bold leading-tight text-ink">{title}</h2>
            {sub && <div className="mt-1 text-sm text-muted">{sub}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center text-xl text-muted hover:text-ink"
          >
            ×
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">{children}</div>
        <div className="border-t border-line bg-utility px-5 py-4">{footer}</div>
      </div>
    </div>
  );
}

function ErrorNote({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <div className="border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">{msg}</div>;
}

// -----------------------------------------------------------------------------
// Main

export function MeetingsAdminClient({
  slug, header, rows, companies, investors, slotOptions,
  busyByCompany, busyByInvestor, blockedByCompany, blockedByInvestor, blocklist,
}: {
  slug: string;
  header: ReactNode;
  rows: MeetingRow[];
  companies: LeadLite[];
  investors: LeadLite[];
  slotOptions: SlotOption[];
  busyByCompany: SlotMap;
  busyByInvestor: SlotMap;
  blockedByCompany: SlotMap;
  blockedByInvestor: SlotMap;
  blocklist: Record<string, BlocklistInfo>;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>("grid");
  const [axis, setAxis] = useState<Axis>("company");
  const [showAll, setShowAll] = useState(false);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [editing, setEditing] = useState<MeetingRow | null>(null);
  const [creating, setCreating] = useState<CreateDraft | null>(null);
  const [mobileEntity, setMobileEntity] = useState<string>("");

  // Leads shown as grid rows: people at the event, unless "show all" is on.
  const gridCompanies = useMemo(() => {
    const act = companies.filter(c => c.active);
    return showAll || act.length === 0 ? companies : act;
  }, [companies, showAll]);
  const gridInvestors = useMemo(() => {
    const act = investors.filter(i => i.active);
    return showAll || act.length === 0 ? investors : act;
  }, [investors, showAll]);
  const hiddenCount = axis === "company"
    ? companies.length - companies.filter(c => c.active).length
    : investors.length - investors.filter(i => i.active).length;

  // Confirmed meetings keyed by "leadId|slotIso".
  const { byCompanySlot, byInvestorSlot } = useMemo(() => {
    const a = new Map<string, MeetingRow>();
    const b = new Map<string, MeetingRow>();
    for (const r of rows) {
      if (r.status !== "accepted" || !r.current_slot_iso) continue;
      a.set(`${r.company_id}|${r.current_slot_iso}`, r);
      b.set(`${r.investor_id}|${r.current_slot_iso}`, r);
    }
    return { byCompanySlot: a, byInvestorSlot: b };
  }, [rows]);

  const stats = useMemo(() => {
    const confirmed = rows.filter(r => r.status === "accepted").length;
    const pending = rows.filter(r => r.status === "proposed" || r.status === "countered").length;
    const withMeeting = new Set(rows.filter(r => r.status === "accepted").map(r => r.company_id));
    const covered = gridCompanies.filter(c => withMeeting.has(c.id)).length;
    let open = 0;
    for (const c of gridCompanies) {
      const busy = new Set(busyByCompany[c.id] ?? []);
      const blocked = new Set(blockedByCompany[c.id] ?? []);
      for (const s of slotOptions) if (!busy.has(s.iso) && !blocked.has(s.iso)) open++;
    }
    return { confirmed, pending, covered, total: gridCompanies.length, open };
  }, [rows, gridCompanies, busyByCompany, blockedByCompany, slotOptions]);

  const nothingScheduled = stats.confirmed === 0 && stats.pending === 0;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(r => {
      if (statusFilter === "confirmed" && r.status !== "accepted") return false;
      if (statusFilter === "pending" && r.status !== "proposed" && r.status !== "countered") return false;
      if (statusFilter === "closed" && r.status !== "declined" && r.status !== "cancelled") return false;
      if (!needle) return true;
      return (
        r.company_name.toLowerCase().includes(needle) ||
        r.investor_name.toLowerCase().includes(needle) ||
        (r.location ?? "").toLowerCase().includes(needle)
      );
    });
  }, [rows, q, statusFilter]);

  const openCreate = (d: Partial<CreateDraft> = {}) =>
    setCreating({ companyId: d.companyId ?? "", investorId: d.investorId ?? "", slotIso: d.slotIso ?? "" });

  const entities = axis === "company" ? gridCompanies : gridInvestors;
  const mobileId = entities.some(e => e.id === mobileEntity) ? mobileEntity : (entities[0]?.id ?? "");

  return (
    <div className="space-y-6">
      {/* 1. Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        {header}
        <div className="grid grid-cols-2 gap-2 md:flex md:gap-3">
          <button type="button" onClick={() => openCreate()} className={BTN_PRIMARY}>+ New meeting</button>
          <Link href={`/conferences/${slug}/platform/admin/meetings/auto-match`} className={BTN_SECONDARY}>Auto-match</Link>
        </div>
      </div>

      {/* 2. Summary strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Confirmed" value={stats.confirmed} hint="meetings booked" />
        <StatCard label="Pending" value={stats.pending} hint="awaiting a reply" />
        <StatCard
          label="Companies booked"
          value={<>{stats.covered}<span className="text-lg text-muted"> / {stats.total}</span></>}
          hint="with at least one meeting"
        />
        <StatCard label="Open slots" value={stats.open} hint="company slots still free" />
      </div>

      {/* 4. Empty state */}
      {nothingScheduled && (
        <div className="flex flex-col gap-4 border border-line bg-utility px-5 py-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="font-display text-xl font-bold text-ink">No meetings scheduled yet.</div>
            <p className="mt-1 text-sm text-muted">
              Start by adding one, or let Auto-match fill the open slots. You can also click any empty cell below.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 md:flex md:shrink-0 md:gap-3">
            <button type="button" onClick={() => openCreate()} className={BTN_PRIMARY}>+ New meeting</button>
            <Link href={`/conferences/${slug}/platform/admin/meetings/auto-match`} className={BTN_SECONDARY}>Auto-match</Link>
          </div>
        </div>
      )}

      {/* 3. View toggle */}
      <div className="flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-center sm:justify-between">
        <Segmented<View>
          label="View"
          value={view}
          onChange={setView}
          options={[{ value: "grid", label: "Schedule grid" }, { value: "list", label: "List" }]}
        />
        {view === "grid" && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <span className={`${LABEL} hidden sm:inline`}>Rows</span>
            <Segmented<Axis>
              label="Rows"
              value={axis}
              onChange={setAxis}
              options={[{ value: "company", label: "Companies" }, { value: "investor", label: "Investors" }]}
            />
          </div>
        )}
      </div>

      {view === "grid" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <div className="flex flex-wrap items-center gap-4">
              <Legend swatch={<span className="inline-block h-3 w-3 border-l-2 border-brand-accent bg-brand-accent/10" />} text="Booked" />
              <Legend swatch={<span className="inline-block h-3 w-3 border border-line" style={HATCH} />} text="Blocked by attendee" />
              <Legend swatch={<span className="inline-block h-3 w-3 border border-dashed border-ink/20" />} text="Open — click to book" />
            </div>
            {hiddenCount > 0 && (
              <button type="button" onClick={() => setShowAll(v => !v)} className="min-h-[44px] underline hover:text-ink md:min-h-0">
                {showAll
                  ? `Only show ${axis === "company" ? "companies" : "investors"} at the event`
                  : `Show all ${axis === "company" ? "companies" : "investors"} (+${hiddenCount})`}
              </button>
            )}
          </div>

          {/* Desktop matrix */}
          <div className="hidden overflow-x-auto border border-line bg-white md:block">
            <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className={`sticky left-0 z-20 min-w-[200px] border-b border-r border-line bg-utility px-3 py-2 text-left ${LABEL}`}>
                    {axis === "company" ? "Company" : "Investor"}
                  </th>
                  {slotOptions.map(s => (
                    <th key={s.iso} title={s.label}
                      className={`min-w-[112px] border-b border-line bg-utility px-2 py-2 text-left ${LABEL} tabular-nums`}>
                      {s.short}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entities.map(ent => {
                  const blocked = new Set((axis === "company" ? blockedByCompany : blockedByInvestor)[ent.id] ?? []);
                  const map = axis === "company" ? byCompanySlot : byInvestorSlot;
                  return (
                    <tr key={ent.id} className="group">
                      <th scope="row"
                        className="sticky left-0 z-10 max-w-[240px] border-b border-r border-line bg-white px-3 py-2 text-left font-semibold text-ink group-hover:bg-utility">
                        <Link
                          href={`/conferences/${slug}/${axis === "company" ? "companies" : "investors"}/${ent.id}`}
                          className="block truncate hover:underline" title={ent.name}
                        >
                          {ent.name}
                        </Link>
                      </th>
                      {slotOptions.map(s => {
                        const m = map.get(`${ent.id}|${s.iso}`);
                        if (m) {
                          const other = axis === "company" ? m.investor_name : m.company_name;
                          return (
                            <td key={s.iso} className="border-b border-line p-1">
                              <button
                                type="button"
                                onClick={() => setEditing(m)}
                                title={`${other}${m.location ? ` · ${m.location}` : ""} — click to edit`}
                                className="flex h-12 w-full flex-col justify-center border-l-2 border-brand-accent bg-brand-accent/10 px-2 text-left hover:bg-brand-accent/20"
                              >
                                <span className="block w-full truncate text-xs font-semibold text-ink">{other}</span>
                                {m.location && <span className="block w-full truncate text-[11px] text-muted">{m.location}</span>}
                              </button>
                            </td>
                          );
                        }
                        if (blocked.has(s.iso)) {
                          return (
                            <td key={s.iso} className="border-b border-line p-1">
                              <div className="flex h-12 items-center justify-center text-[11px] uppercase tracking-wider text-muted" style={HATCH}>
                                Blocked
                              </div>
                            </td>
                          );
                        }
                        return (
                          <td key={s.iso} className="border-b border-line p-1">
                            <button
                              type="button"
                              aria-label={`Book ${ent.name} at ${s.label}`}
                              onClick={() => openCreate(axis === "company"
                                ? { companyId: ent.id, slotIso: s.iso }
                                : { investorId: ent.id, slotIso: s.iso })}
                              className="flex h-12 w-full items-center justify-center border border-dashed border-transparent text-lg text-ink/15 hover:border-ink/30 hover:text-brand-accent"
                            >
                              +
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {entities.length === 0 && (
                  <tr>
                    <td colSpan={slotOptions.length + 1} className="px-3 py-8 text-center text-sm text-muted">
                      No {axis === "company" ? "companies" : "investors"} yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile: one entity at a time */}
          <div className="space-y-3 md:hidden">
            <label className="block">
              <span className={LABEL}>Choose a {axis === "company" ? "company" : "investor"}</span>
              <select value={mobileId} onChange={e => setMobileEntity(e.target.value)} className={`${INPUT} mt-1`}>
                {entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </label>
            {mobileId && (
              <ul className="divide-y divide-line border border-line bg-white">
                {slotOptions.map(s => {
                  const m = (axis === "company" ? byCompanySlot : byInvestorSlot).get(`${mobileId}|${s.iso}`);
                  const blocked = ((axis === "company" ? blockedByCompany : blockedByInvestor)[mobileId] ?? []).includes(s.iso);
                  return (
                    <li key={s.iso} className="flex min-h-[56px] items-stretch">
                      <div className="flex w-20 shrink-0 items-center border-r border-line px-3 text-sm font-semibold tabular-nums text-ink">
                        {s.short}
                      </div>
                      <div className="flex min-w-0 flex-1 items-center p-1.5">
                        {m ? (
                          <button type="button" onClick={() => setEditing(m)}
                            className="flex min-h-[44px] w-full flex-col justify-center border-l-2 border-brand-accent bg-brand-accent/10 px-3 text-left">
                            <span className="block truncate text-sm font-semibold text-ink">
                              {axis === "company" ? m.investor_name : m.company_name}
                            </span>
                            {m.location && <span className="block truncate text-xs text-muted">{m.location}</span>}
                          </button>
                        ) : blocked ? (
                          <div className="flex min-h-[44px] w-full items-center px-3 text-xs uppercase tracking-wider text-muted" style={HATCH}>
                            Blocked
                          </div>
                        ) : (
                          <button type="button"
                            onClick={() => openCreate(axis === "company"
                              ? { companyId: mobileId, slotIso: s.iso }
                              : { investorId: mobileId, slotIso: s.iso })}
                            className="flex min-h-[44px] w-full items-center px-3 text-left text-xs font-semibold uppercase tracking-widest2 text-muted hover:text-brand-accent">
                            + Add
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <ListView
          slug={slug}
          rows={rows}
          filtered={filtered}
          q={q} setQ={setQ}
          statusFilter={statusFilter} setStatusFilter={setStatusFilter}
          onEdit={setEditing}
        />
      )}

      {editing && (
        <EditSheet
          key={editing.id}
          row={editing}
          slug={slug}
          slotOptions={slotOptions}
          busyByCompany={busyByCompany}
          busyByInvestor={busyByInvestor}
          blockedByCompany={blockedByCompany}
          blockedByInvestor={blockedByInvestor}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }}
        />
      )}

      {creating && (
        <CreateSheet
          slug={slug}
          initial={creating}
          companies={companies}
          investors={investors}
          slotOptions={slotOptions}
          busyByCompany={busyByCompany}
          busyByInvestor={busyByInvestor}
          blockedByCompany={blockedByCompany}
          blockedByInvestor={blockedByInvestor}
          blocklist={blocklist}
          onClose={() => setCreating(null)}
          onCreated={() => { setCreating(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

function Legend({ swatch, text }: { swatch: ReactNode; text: string }) {
  return <span className="inline-flex items-center gap-1.5 whitespace-nowrap">{swatch}{text}</span>;
}

// -----------------------------------------------------------------------------
// List view

function ListView({
  slug, rows, filtered, q, setQ, statusFilter, setStatusFilter, onEdit,
}: {
  slug: string;
  rows: MeetingRow[];
  filtered: MeetingRow[];
  q: string; setQ: (v: string) => void;
  statusFilter: StatusFilter; setStatusFilter: (v: StatusFilter) => void;
  onEdit: (r: MeetingRow) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="search"
          placeholder="Search company, investor or table"
          value={q}
          onChange={e => setQ(e.target.value)}
          className={`${INPUT} sm:max-w-xs`}
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as StatusFilter)}
          className={`${INPUT} sm:w-48`}
        >
          <option value="all">All statuses</option>
          <option value="confirmed">Confirmed</option>
          <option value="pending">Pending</option>
          <option value="closed">Declined / cancelled</option>
        </select>
        <div className="text-xs text-muted sm:ml-auto">
          {filtered.length} of {rows.length} meeting{rows.length === 1 ? "" : "s"}
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto border border-line bg-white md:block">
        <table className="w-full text-sm">
          <thead className="bg-utility text-left">
            <tr>
              {["Company", "Investor", "Time", "Table", "Status", ""].map((h, i) => (
                <th key={i} className={`px-3 py-2 ${LABEL} ${i === 5 ? "text-right" : ""}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} className="border-t border-line hover:bg-utility/60">
                <td className="px-3 py-2.5 font-semibold text-ink">
                  <Link href={`/conferences/${slug}/companies/${r.company_id}`} className="hover:underline">{r.company_name}</Link>
                </td>
                <td className="px-3 py-2.5">
                  <Link href={`/conferences/${slug}/investors/${r.investor_id}`} className="hover:underline">{r.investor_name}</Link>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{r.slot_label ?? <span className="text-muted">Not set</span>}</td>
                <td className="px-3 py-2.5">{r.location ?? <span className="text-muted">—</span>}</td>
                <td className="px-3 py-2.5"><StatusPill status={r.status} /></td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right">
                  <button type="button" onClick={() => onEdit(r)}
                    className="whitespace-nowrap border border-ink/20 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-widest2 hover:border-ink">
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-muted">
                {rows.length === 0 ? "No meetings yet." : "No meetings match your search."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {filtered.map(r => (
          <div key={r.id} className="border border-line bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-semibold text-ink">{r.company_name}</div>
                <div className="truncate text-sm text-muted">with {r.investor_name}</div>
              </div>
              <StatusPill status={r.status} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div><dt className={LABEL}>Time</dt><dd className="mt-0.5 tabular-nums">{r.slot_label ?? "Not set"}</dd></div>
              <div><dt className={LABEL}>Table</dt><dd className="mt-0.5">{r.location ?? "—"}</dd></div>
            </dl>
            <button type="button" onClick={() => onEdit(r)} className={`${BTN_SECONDARY} mt-3 w-full`}>Edit</button>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="border border-line bg-white p-6 text-center text-sm text-muted">
            {rows.length === 0 ? "No meetings yet." : "No meetings match your search."}
          </div>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Edit drawer

function slotTag(iso: string, parts: { set: Set<string>; text: string }[]): string {
  const hits = parts.filter(p => p.set.has(iso)).map(p => p.text);
  return hits.length ? ` — ${hits.join(", ")}` : "";
}

function EditSheet({
  row, slug, slotOptions, busyByCompany, busyByInvestor, blockedByCompany, blockedByInvestor, onClose, onSaved,
}: {
  row: MeetingRow;
  slug: string;
  slotOptions: SlotOption[];
  busyByCompany: SlotMap;
  busyByInvestor: SlotMap;
  blockedByCompany: SlotMap;
  blockedByInvestor: SlotMap;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [slotIso, setSlotIso] = useState(row.current_slot_iso ?? "");
  const [location, setLocation] = useState(row.location ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const withoutCurrent = (xs: string[] | undefined) =>
    new Set((xs ?? []).filter(x => x !== row.current_slot_iso));
  const parts = [
    { set: withoutCurrent(busyByCompany[row.company_id]), text: "company booked" },
    { set: withoutCurrent(busyByInvestor[row.investor_id]), text: "investor booked" },
    { set: new Set(blockedByCompany[row.company_id] ?? []), text: "company blocked" },
    { set: new Set(blockedByInvestor[row.investor_id] ?? []), text: "investor blocked" },
  ];

  async function patch(body: Record<string, unknown>) {
    setErr(null); setBusy(true);
    try {
      const r = await fetch(`/api/platform/meetings/${row.id}/admin-edit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        setErr(j.error ?? `Something went wrong (${r.status}).`);
        return;
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const body: Record<string, unknown> = {};
    if (slotIso && slotIso !== row.current_slot_iso) body.scheduled_time = slotIso;
    const loc = location.trim();
    if (loc !== (row.location ?? "")) body.location = loc === "" ? null : loc;
    if (Object.keys(body).length === 0) { onClose(); return; }
    await patch(body);
  }

  async function cancelMeeting() {
    if (!confirm("Cancel this meeting? Both sides will see it as cancelled.")) return;
    await patch({ status: "cancelled" });
  }

  const conflict = slotIso && slotIso !== row.current_slot_iso ? slotTag(slotIso, parts) : "";

  return (
    <Sheet
      title={`${row.company_name} × ${row.investor_name}`}
      sub={
        <span className="flex flex-wrap items-center gap-2">
          <StatusPill status={row.status} />
          <span className="tabular-nums">{row.slot_label ?? "No time set"}</span>
        </span>
      }
      onClose={onClose}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          {row.status !== "cancelled" && (
            <button type="button" onClick={cancelMeeting} disabled={busy} className={`${BTN_DANGER} w-full sm:w-auto`}>
              Cancel meeting
            </button>
          )}
          <div className="hidden flex-1 sm:block" />
          <button type="button" onClick={onClose} className={`${BTN_SECONDARY} w-full sm:w-auto`}>Close</button>
          <button type="button" onClick={save} disabled={busy} className={`${BTN_PRIMARY} w-full sm:w-auto`}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      }
    >
      <ErrorNote msg={err} />
      <label className="block">
        <span className={LABEL}>Time slot</span>
        <select value={slotIso} onChange={e => setSlotIso(e.target.value)} className={`${INPUT} mt-1`}>
          <option value="">Choose a time…</option>
          {slotOptions.map(o => (
            <option key={o.iso} value={o.iso}>{o.label}{slotTag(o.iso, parts)}</option>
          ))}
        </select>
        {conflict && <span className="mt-1 block text-xs text-amber-800">Heads up{conflict}.</span>}
        {row.status !== "accepted" && (
          <span className="mt-1 block text-xs text-muted">Saving a time marks this meeting as confirmed.</span>
        )}
      </label>
      <label className="block">
        <span className={LABEL}>Table / location</span>
        <input type="text" value={location} onChange={e => setLocation(e.target.value)}
          placeholder="e.g. Table 12" className={`${INPUT} mt-1`} />
      </label>
      {row.notes && (
        <div>
          <div className={LABEL}>Notes</div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{row.notes}</p>
        </div>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-4 text-sm">
        <Link href={`/conferences/${slug}/companies/${row.company_id}`} className="underline hover:text-brand-accent">Company profile</Link>
        <Link href={`/conferences/${slug}/investors/${row.investor_id}`} className="underline hover:text-brand-accent">Investor profile</Link>
        <Link href={`/conferences/${slug}/platform/meetings/${row.id}`} className="underline hover:text-brand-accent">Meeting history</Link>
      </div>
    </Sheet>
  );
}

// -----------------------------------------------------------------------------
// New meeting drawer

function LeadSelect({ value, onChange, leads, placeholder }: {
  value: string; onChange: (v: string) => void; leads: LeadLite[]; placeholder: string;
}) {
  const active = leads.filter(l => l.active);
  const other = leads.filter(l => !l.active);
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={`${INPUT} mt-1`}>
      <option value="">{placeholder}</option>
      {active.length > 0 && other.length > 0 ? (
        <>
          <optgroup label="At the event">
            {active.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </optgroup>
          <optgroup label="Other leads">
            {other.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </optgroup>
        </>
      ) : (
        leads.map(l => <option key={l.id} value={l.id}>{l.name}</option>)
      )}
    </select>
  );
}

function CreateSheet({
  slug, initial, companies, investors, slotOptions,
  busyByCompany, busyByInvestor, blockedByCompany, blockedByInvestor, blocklist, onClose, onCreated,
}: {
  slug: string;
  initial: CreateDraft;
  companies: LeadLite[];
  investors: LeadLite[];
  slotOptions: SlotOption[];
  busyByCompany: SlotMap;
  busyByInvestor: SlotMap;
  blockedByCompany: SlotMap;
  blockedByInvestor: SlotMap;
  blocklist: Record<string, BlocklistInfo>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [companyId, setCompanyId] = useState(initial.companyId);
  const [investorId, setInvestorId] = useState(initial.investorId);
  const [slotIso, setSlotIso] = useState(initial.slotIso);
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const parts = [
    { set: new Set(companyId ? busyByCompany[companyId] ?? [] : []), text: "company booked" },
    { set: new Set(investorId ? busyByInvestor[investorId] ?? [] : []), text: "investor booked" },
    { set: new Set(companyId ? blockedByCompany[companyId] ?? [] : []), text: "company blocked" },
    { set: new Set(investorId ? blockedByInvestor[investorId] ?? [] : []), text: "investor blocked" },
  ];
  const conflict = slotIso ? slotTag(slotIso, parts) : "";
  const blockWarning: BlocklistInfo | null =
    companyId && investorId ? blocklist[`company:${companyId}|investor:${investorId}`] ?? null : null;

  async function submit() {
    setErr(null);
    if (!companyId || !investorId || !slotIso) {
      setErr("Pick a company, an investor and a time."); return;
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
          location: location.trim() === "" ? null : location.trim(),
          notes: notes.trim() === "" ? null : notes.trim(),
        }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        setErr(j.error ?? `Something went wrong (${r.status}).`); return;
      }
      onCreated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      title="New meeting"
      sub="Booked meetings show up as confirmed for both sides."
      onClose={onClose}
      footer={
        <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          <button type="button" onClick={onClose} className={BTN_SECONDARY}>Cancel</button>
          <button type="button" onClick={submit} disabled={busy} className={BTN_PRIMARY}>
            {busy ? "Booking…" : "Book meeting"}
          </button>
        </div>
      }
    >
      <ErrorNote msg={err} />
      {blockWarning && (
        <div className="border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900">
          <div className="font-semibold">These two asked not to be paired.</div>
          <div className="mt-0.5">
            Reason: {blockWarning.reason ? blockWarning.reason : "none given"}. You can still book it if you&rsquo;re sure.
          </div>
        </div>
      )}
      <label className="block">
        <span className={LABEL}>Company</span>
        <LeadSelect value={companyId} onChange={setCompanyId} leads={companies} placeholder="Choose a company…" />
      </label>
      <label className="block">
        <span className={LABEL}>Investor</span>
        <LeadSelect value={investorId} onChange={setInvestorId} leads={investors} placeholder="Choose an investor…" />
      </label>
      <label className="block">
        <span className={LABEL}>Time slot</span>
        <select value={slotIso} onChange={e => setSlotIso(e.target.value)} className={`${INPUT} mt-1`}>
          <option value="">Choose a time…</option>
          {slotOptions.map(o => (
            <option key={o.iso} value={o.iso}>{o.label}{slotTag(o.iso, parts)}</option>
          ))}
        </select>
        {conflict && <span className="mt-1 block text-xs text-amber-800">Heads up{conflict}.</span>}
      </label>
      <label className="block">
        <span className={LABEL}>Table / location <span className="normal-case tracking-normal">(optional)</span></span>
        <input type="text" value={location} onChange={e => setLocation(e.target.value)}
          placeholder="e.g. Table 12" className={`${INPUT} mt-1`} />
      </label>
      <label className="block">
        <span className={LABEL}>Notes <span className="normal-case tracking-normal">(optional)</span></span>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className={`${INPUT} mt-1`} />
      </label>
    </Sheet>
  );
}
