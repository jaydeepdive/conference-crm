"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { autoMatch, type MatchLead } from "@/lib/match";

export interface SlotLabel { iso: string; label: string }
export interface ProposalRow {
  company_id: string;
  company_name: string;
  investor_id: string;
  investor_name: string;
  slot_iso: string;
}

interface Props {
  slug: string;
  conferenceId: string;
  slotLabels: SlotLabel[];
  slotIsos: string[];
  companies: MatchLead[];
  investors: MatchLead[];
  acceptedMeetings: Array<{ company_id: string; investor_id: string; slot_iso: string }>;
  blockedSlots: Array<{ lead_type: "company" | "investor"; lead_id: string; slot_iso: string }>;
  blocklist: Array<{
    from_lead_type: "company" | "investor"; from_lead_id: string;
    to_lead_type: "company" | "investor"; to_lead_id: string;
  }>;
  initialProposals: ProposalRow[];
  initialCompanyCounts: Record<string, number>;
  initialInvestorCounts: Record<string, number>;
}

export function AutoMatchClient(props: Props) {
  const router = useRouter();
  const [proposals, setProposals] = useState<ProposalRow[]>(props.initialProposals);
  const [companyCounts, setCompanyCounts] = useState<Record<string, number>>(props.initialCompanyCounts);
  const [investorCounts, setInvestorCounts] = useState<Record<string, number>>(props.initialInvestorCounts);
  const [seed, setSeed] = useState(1);
  const [replaceAll, setReplaceAll] = useState(false);
  const [doubleConfirm, setDoubleConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  const slotLabelByIso = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of props.slotLabels) m.set(s.iso, s.label);
    return m;
  }, [props.slotLabels]);

  const sorted = useMemo(() => {
    return proposals.slice().sort((a, b) => {
      if (a.slot_iso !== b.slot_iso) return a.slot_iso < b.slot_iso ? -1 : 1;
      return a.company_name.localeCompare(b.company_name);
    });
  }, [proposals]);

  function regenerate(nextReplaceAll: boolean) {
    const nextSeed = Math.floor(Math.random() * 1_000_000) + 2;
    setSeed(nextSeed);
    const r = autoMatch({
      companies: props.companies,
      investors: props.investors,
      acceptedMeetings: props.acceptedMeetings,
      blockedSlots: props.blockedSlots,
      blocklist: props.blocklist,
      slotIsos: props.slotIsos,
      seed: nextSeed,
      replaceAll: nextReplaceAll,
    });
    setProposals(r.proposals.map(p => ({
      company_id: p.company_id, company_name: p.company_name,
      investor_id: p.investor_id, investor_name: p.investor_name,
      slot_iso: p.slot_iso,
    })));
    setCompanyCounts(r.companyMeetingCount);
    setInvestorCounts(r.investorMeetingCount);
    setResultMsg(null); setError(null);
  }

  function onToggleReplaceAll(v: boolean) {
    setReplaceAll(v);
    setDoubleConfirm(false);
    regenerate(v);
  }

  async function confirmAll() {
    setBusy(true); setError(null); setResultMsg(null);
    try {
      const res = await fetch("/api/admin/meetings/auto-match-commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conference_id: props.conferenceId,
          proposals: proposals.map(p => ({
            company_id: p.company_id, investor_id: p.investor_id, scheduled_time: p.slot_iso,
          })),
        }),
      });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? "Commit failed."); setBusy(false); return; }
      const skipped = Array.isArray(j.skipped) ? j.skipped.length : 0;
      setResultMsg(`Created ${j.created} meetings${skipped ? ` (${skipped} skipped).` : "."}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Commit failed.");
    } finally {
      setBusy(false);
    }
  }

  const totalCompanies = props.companies.length;
  const totalInvestors = props.investors.length;
  const slotCapacity = props.slotIsos.length; // typically 14
  const avgCo = totalCompanies > 0
    ? Object.values(companyCounts).reduce((a, b) => a + b, 0) / totalCompanies
    : 0;
  const avgInv = totalInvestors > 0
    ? Object.values(investorCounts).reduce((a, b) => a + b, 0) / totalInvestors
    : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => regenerate(replaceAll)}
          disabled={busy}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:border-brand-accent disabled:opacity-50">
          Regenerate (seed {seed})
        </button>

        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={replaceAll}
            onChange={e => onToggleReplaceAll(e.target.checked)} />
          Replace all existing (dangerous)
        </label>

        {replaceAll && (
          <label className="inline-flex items-center gap-2 text-sm text-rose-700">
            <input type="checkbox" checked={doubleConfirm}
              onChange={e => setDoubleConfirm(e.target.checked)} />
            I understand this will overwrite existing accepted meetings.
          </label>
        )}
      </div>

      <div className="rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-700">
        <div>Would create <strong>{proposals.length}</strong> new accepted meetings.</div>
        <div>
          Company utilization avg <strong>{avgCo.toFixed(1)}</strong> of {slotCapacity} ·{" "}
          Investor utilization avg <strong>{avgInv.toFixed(1)}</strong> of {slotCapacity}
        </div>
      </div>

      {error && <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>}
      {resultMsg && <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{resultMsg}</div>}

      <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Slot</th>
              <th className="px-3 py-2 font-medium">Company</th>
              <th className="px-3 py-2 font-medium">Investor</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-sm text-slate-500">
                  No new matches to propose — every eligible pair is either already
                  scheduled or blocklisted.
                </td>
              </tr>
            ) : (
              sorted.map((p, i) => (
                <tr key={`${p.slot_iso}-${p.company_id}-${p.investor_id}-${i}`}>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700 tabular-nums">
                    {slotLabelByIso.get(p.slot_iso) ?? p.slot_iso}
                  </td>
                  <td className="px-3 py-2 text-slate-900">{p.company_name}</td>
                  <td className="px-3 py-2 text-slate-900">{p.investor_name}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                      proposed
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={confirmAll}
          disabled={busy || proposals.length === 0 || (replaceAll && !doubleConfirm)}
          className="rounded-md bg-brand-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          style={{ minHeight: 44 }}>
          {busy ? "Committing…" : `Confirm all (${proposals.length})`}
        </button>
      </div>
    </div>
  );
}
