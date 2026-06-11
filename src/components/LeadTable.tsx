"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import { StageBadge, ConfirmedBadge, PaymentBadge } from "./StageBadge";
import { STAGES } from "@/lib/constants";
import type { Profile, Stage } from "@/lib/types";

interface Row {
  id: string;
  name: string;
  industry_or_type: string | null;
  contact_name: string | null;
  email: string | null;
  owner_id: string | null;
  stage: Stage;
  confirmed: "no" | "tentative" | "yes";
  payment_status: "not_invoiced" | "invoiced" | "partial" | "paid" | "waived";
  amount_due: number;
  amount_paid: number;
  next_action_date: string | null;
  next_action: string | null;
}

type SortKey =
  | "name" | "industry_or_type" | "contact_name" | "email" | "owner"
  | "stage" | "confirmed" | "payment_status" | "balance" | "next_action_date" | "next_action";
type SortDir = "asc" | "desc";

const STAGE_ORDER: Record<Stage, number> = {
  not_contacted: 0, reaching_out: 1, in_discussion: 2,
  verbal_commit: 3, registered: 4, declined: 5,
};
const CONFIRMED_ORDER: Record<Row["confirmed"], number> = { no: 0, tentative: 1, yes: 2 };
const PAYMENT_ORDER: Record<Row["payment_status"], number> = {
  not_invoiced: 0, invoiced: 1, partial: 2, paid: 3, waived: 4,
};

export function LeadTable({ rows, profiles, basePath, showPayments = true }: {
  rows: Row[]; profiles: Profile[]; basePath: string; showPayments?: boolean;
}) {
  const [stageFilter, setStageFilter] = useState<Stage | "all">("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const ownerNameOf = (id: string | null) => {
    if (!id) return "";
    const p = profiles.find(x => x.id === id);
    return p?.full_name || p?.email || "";
  };

  const filtered = useMemo(() => rows.filter(r => {
    if (stageFilter !== "all" && r.stage !== stageFilter) return false;
    if (ownerFilter === "unclaimed" && r.owner_id) return false;
    if (ownerFilter !== "all" && ownerFilter !== "unclaimed" && r.owner_id !== ownerFilter) return false;
    if (query && !`${r.name} ${r.contact_name ?? ""} ${r.email ?? ""}`.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  }), [rows, stageFilter, ownerFilter, query]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const get = (r: Row): string | number | null => {
        switch (sortKey) {
          case "name": return r.name.toLowerCase();
          case "industry_or_type": return (r.industry_or_type ?? "").toLowerCase();
          case "contact_name": return (r.contact_name ?? "").toLowerCase();
          case "email": return (r.email ?? "").toLowerCase();
          case "owner": return ownerNameOf(r.owner_id).toLowerCase();
          case "stage": return STAGE_ORDER[r.stage];
          case "confirmed": return CONFIRMED_ORDER[r.confirmed];
          case "payment_status": return PAYMENT_ORDER[r.payment_status];
          case "balance": return r.amount_due - r.amount_paid;
          case "next_action_date": return r.next_action_date ?? "";
          case "next_action": return (r.next_action ?? "").toLowerCase();
        }
      };
      const av = get(a); const bv = get(b);
      const aEmpty = av === null || av === "" || av === undefined;
      const bEmpty = bv === null || bv === "" || bv === undefined;
      if (aEmpty && !bEmpty) return 1;  // empties always last
      if (!aEmpty && bEmpty) return -1;
      if (aEmpty && bEmpty) return 0;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sortKey, sortDir]);

  function clickHeader(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const ownerCell = (id: string | null) => {
    if (!id) return <span className="text-rose-500">Unclaimed</span>;
    const p = profiles.find(x => x.id === id);
    return p?.full_name || p?.email || "—";
  };

  const isOverdue = (d: string | null, s: Stage) =>
    d && new Date(d) < new Date() && s !== "registered" && s !== "declined";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input type="text" value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search name, contact, email…"
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm" />
        <select value={stageFilter} onChange={e => setStageFilter(e.target.value as Stage | "all")}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm">
          <option value="all">All stages</option>
          {STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm">
          <option value="all">All owners</option>
          <option value="unclaimed">Unclaimed</option>
          {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
        </select>
        {sortKey && (
          <button onClick={() => { setSortKey(null); setSortDir("asc"); }}
            className="text-xs text-gray-500 hover:text-gray-900 underline">Clear sort</button>
        )}
        <div className="ml-auto text-xs text-gray-500">{sorted.length} of {rows.length}</div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <SortHeader label="Name" sortKey="name" active={sortKey} dir={sortDir} onClick={clickHeader} />
              <SortHeader label="Contact" sortKey="contact_name" active={sortKey} dir={sortDir} onClick={clickHeader} />
              <SortHeader label="Owner" sortKey="owner" active={sortKey} dir={sortDir} onClick={clickHeader} />
              <SortHeader label="Stage" sortKey="stage" active={sortKey} dir={sortDir} onClick={clickHeader} />
              <SortHeader label="Confirmed" sortKey="confirmed" active={sortKey} dir={sortDir} onClick={clickHeader} />
              {showPayments && <SortHeader label="Payment" sortKey="payment_status" active={sortKey} dir={sortDir} onClick={clickHeader} />}
              {showPayments && <SortHeader label="Balance" sortKey="balance" active={sortKey} dir={sortDir} onClick={clickHeader} align="right" />}
              <SortHeader label="Next action" sortKey="next_action_date" active={sortKey} dir={sortDir} onClick={clickHeader} />
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => (
              <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2 font-medium">
                  <Link href={`${basePath}/${r.id}`} className="hover:underline">{r.name}</Link>
                  {r.industry_or_type && <div className="text-xs text-gray-500">{r.industry_or_type}</div>}
                </td>
                <td className="px-3 py-2">
                  {r.contact_name && <div>{r.contact_name}</div>}
                  {r.email && <div className="text-xs text-gray-500">{r.email}</div>}
                </td>
                <td className="px-3 py-2 text-xs">{ownerCell(r.owner_id)}</td>
                <td className="px-3 py-2"><StageBadge stage={r.stage} /></td>
                <td className="px-3 py-2"><ConfirmedBadge value={r.confirmed} /></td>
                {showPayments && <td className="px-3 py-2"><PaymentBadge value={r.payment_status} /></td>}
                {showPayments && <td className="px-3 py-2 text-right tabular-nums">${(r.amount_due - r.amount_paid).toLocaleString()}</td>}
                <td className="px-3 py-2 text-xs">
                  {r.next_action_date && (
                    <div className={isOverdue(r.next_action_date, r.stage) ? "text-rose-600 font-medium" : "text-gray-500"}>
                      {r.next_action_date}
                    </div>
                  )}
                  <div className="truncate max-w-[200px]">{r.next_action}</div>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={showPayments ? 8 : 6} className="px-3 py-8 text-center text-sm text-gray-500">No leads match your filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SortHeader({ label, sortKey, active, dir, onClick, align = "left" }: {
  label: string;
  sortKey: SortKey;
  active: SortKey | null;
  dir: SortDir;
  onClick: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const isActive = active === sortKey;
  return (
    <th className={`px-3 py-2 ${align === "right" ? "text-right" : "text-left"}`}>
      <button onClick={() => onClick(sortKey)}
        className={`group inline-flex items-center gap-1 uppercase tracking-wide ${isActive ? "text-brand" : "text-gray-500 hover:text-gray-900"}`}>
        {label}
        <span className={`text-[10px] ${isActive ? "opacity-100" : "opacity-30 group-hover:opacity-60"}`}>
          {isActive ? (dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}
