"use client";
import { useMemo, useState } from "react";

export interface PickItem { id: string; name: string; sub: string; count: number }

export function SchedulePicker({ slug, companies, investors, initialSide }: {
  slug: string; companies: PickItem[]; investors: PickItem[]; initialSide: "company" | "investor";
}) {
  const [side, setSide] = useState<"company" | "investor">(initialSide);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const list = side === "company" ? companies : investors;
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return list.filter(x => !n || x.name.toLowerCase().includes(n) || x.sub.toLowerCase().includes(n));
  }, [list, q]);
  const base = `/conferences/${slug}/platform/admin/schedules/print?side=${side}`;
  const toggle = (id: string) => setPicked(p => { const s = new Set(p); if (s.has(id)) s.delete(id); else s.add(id); return s; });
  const tab = (v: "company" | "investor", label: string) => (
    <button type="button" onClick={() => { setSide(v); setPicked(new Set()); setQ(""); }}
      className={`border px-4 py-2 text-[11px] font-semibold uppercase tracking-widest2 ${side === v ? "border-ink bg-ink text-white" : "border-ink/20 bg-white text-muted"}`}>{label}</button>
  );
  const btn = "border border-ink/20 bg-white px-3 py-2 text-[11px] font-semibold uppercase tracking-widest2 text-ink hover:border-ink";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {tab("company", `Companies (${companies.length})`)}
        {tab("investor", `Investors (${investors.length})`)}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={`Search ${side === "company" ? "companies" : "investors"}`}
          className="w-full border border-ink/20 bg-white px-3 py-2 text-base md:text-sm sm:max-w-sm" />
        <div className="flex flex-wrap gap-2">
          {picked.size > 0 && <a href={`${base}&id=${Array.from(picked).join(",")}`} className="bg-brand-accent px-4 py-2 text-[11px] font-semibold uppercase tracking-widest2 text-white">Print selected ({picked.size})</a>}
          <a href={`${base}&all=1`} className={btn}>Print all {side === "company" ? "companies" : "investors"}</a>
        </div>
      </div>
      <ul className="divide-y divide-line border border-line bg-white">
        {shown.map(x => (
          <li key={x.id} className="flex items-center gap-3 px-4 py-2.5">
            <input type="checkbox" checked={picked.has(x.id)} onChange={() => toggle(x.id)} className="h-5 w-5 shrink-0" aria-label={`Select ${x.name}`} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-ink">{x.name}</div>
              <div className="truncate text-xs text-muted">{[x.sub, `${x.count} meeting${x.count === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}</div>
            </div>
            <a href={`${base}&id=${x.id}`} className={btn}>Print</a>
          </li>
        ))}
        {shown.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">No matches.</li>}
      </ul>
    </div>
  );
}
