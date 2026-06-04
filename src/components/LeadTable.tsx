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

export function LeadTable({ rows, profiles, basePath }: {
  rows: Row[]; profiles: Profile[]; basePath: "/companies" | "/investors";
}) {
  const [stageFilter, setStageFilter] = useState<Stage | "all">("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => rows.filter(r => {
    if (stageFilter !== "all" && r.stage !== stageFilter) return false;
    if (ownerFilter === "unclaimed" && r.owner_id) return false;
    if (ownerFilter !== "all" && ownerFilter !== "unclaimed" && r.owner_id !== ownerFilter) return false;
    if (query && !`${r.name} ${r.contact_name ?? ""} ${r.email ?? ""}`.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  }), [rows, stageFilter, ownerFilter, query]);

  const ownerName = (id: string | null) => {
    if (!id) return <span className="text-rose-500">Unclaimed</span>;
    const p = profiles.find(x => x.id === id);
    return p?.full_name || p?.email || "—";
  };

  const isOverdue = (d: string | null, s: Stage) =>
    d && new Date(d) < new Date() && s !== "registered" && s !== "declined";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text" value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search name, contact, email…"
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        />
        <select value={stageFilter} onChange={e => setStageFilter(e.target.value as Stage | "all")}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm">
          <option value="all">All stages</option>
          {STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm">
          <option value="all">All owners</option>
          <option value="unclaimed">Unclaimed</option>
          {profiles.filter(p => p.role === "team" || p.role === "admin").map(p =>
            <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
        </select>
        <div className="ml-auto text-xs text-gray-500">{filtered.length} of {rows.length}</div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Contact</th>
              <th className="px-3 py-2">Owner</th>
              <th className="px-3 py-2">Stage</th>
              <th className="px-3 py-2">Confirmed</th>
              <th className="px-3 py-2">Payment</th>
              <th className="px-3 py-2 text-right">Balance</th>
              <th className="px-3 py-2">Next action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2 font-medium">
                  <Link href={`${basePath}/${r.id}`} className="hover:underline">{r.name}</Link>
                  {r.industry_or_type && <div className="text-xs text-gray-500">{r.industry_or_type}</div>}
                </td>
                <td className="px-3 py-2">
                  {r.contact_name && <div>{r.contact_name}</div>}
                  {r.email && <div className="text-xs text-gray-500">{r.email}</div>}
                </td>
                <td className="px-3 py-2 text-xs">{ownerName(r.owner_id)}</td>
                <td className="px-3 py-2"><StageBadge stage={r.stage} /></td>
                <td className="px-3 py-2"><ConfirmedBadge value={r.confirmed} /></td>
                <td className="px-3 py-2"><PaymentBadge value={r.payment_status} /></td>
                <td className="px-3 py-2 text-right tabular-nums">${(r.amount_due - r.amount_paid).toLocaleString()}</td>
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
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-sm text-gray-500">No leads match your filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
