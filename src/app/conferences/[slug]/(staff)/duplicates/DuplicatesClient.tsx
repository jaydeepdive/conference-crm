"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { DupPair, DupConfidence } from "@/lib/duplicates";

/** Duplicate scanner UI. Shows candidate pairs by confidence, offers a
 *  side-by-side comparison and a Merge button that POSTs to
 *  /api/admin/leads/merge with the user's chosen winner. */
export function DuplicatesClient({
  slug, companyPairs, investorPairs,
}: {
  slug: string;
  companyPairs: DupPair[];
  investorPairs: DupPair[];
}) {
  const [tab, setTab] = useState<"company" | "investor">(
    companyPairs.length >= investorPairs.length ? "company" : "investor"
  );

  const pairs = tab === "company" ? companyPairs : investorPairs;

  return (
    <div className="space-y-4">
      <div className="flex gap-4 border-b border-ink/20 text-xs uppercase tracking-widest2">
        <button
          onClick={() => setTab("company")}
          className={`pb-2 ${tab === "company" ? "border-b-2 border-brand-accent text-ink" : "text-muted"}`}
        >
          Companies ({companyPairs.length})
        </button>
        <button
          onClick={() => setTab("investor")}
          className={`pb-2 ${tab === "investor" ? "border-b-2 border-brand-accent text-ink" : "text-muted"}`}
        >
          Investors ({investorPairs.length})
        </button>
      </div>

      {pairs.length === 0 ? (
        <div className="border border-ink/20 bg-white p-8 text-center text-sm text-muted">
          No suspected duplicates. 🎯
        </div>
      ) : (
        <ul className="space-y-4">
          {pairs.map(pair => (
            <PairRow key={`${pair.a.id}-${pair.b.id}`} slug={slug} leadType={tab} pair={pair} />
          ))}
        </ul>
      )}
    </div>
  );
}

const confidenceStyle: Record<DupConfidence, string> = {
  high:   "bg-rose-100 text-rose-800",
  medium: "bg-amber-100 text-amber-800",
  low:    "bg-gray-100 text-gray-600",
};

function PairRow({ slug, leadType, pair }: {
  slug: string;
  leadType: "company" | "investor";
  pair: DupPair;
}) {
  const router = useRouter();
  const [winnerId, setWinnerId] = useState<string>(pair.a.id);
  const [merging, setMerging] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (dismissed) return null;

  const loserId = winnerId === pair.a.id ? pair.b.id : pair.a.id;
  const winner = winnerId === pair.a.id ? pair.a : pair.b;
  const loser  = winnerId === pair.a.id ? pair.b : pair.a;

  async function merge() {
    if (!confirm(
      `Merge "${loser.name}" INTO "${winner.name}"?\n\n` +
      `The loser row will be permanently deleted after transferring its invoices, notes, comps, activity, attendees, and meetings to the winner.\n\n` +
      `This cannot be undone.`
    )) return;
    setMerging(true); setError(null);
    const res = await fetch("/api/admin/leads/merge", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_type: leadType, winner_id: winnerId, loser_id: loserId }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Merge failed"); setMerging(false); return; }
    setDismissed(true);
    router.refresh();
  }

  const leadBase = `/conferences/${slug}/${leadType === "company" ? "companies" : "investors"}`;

  return (
    <li className="border border-ink/20 bg-white">
      <div className="flex items-center justify-between border-b border-ink/10 px-4 py-2">
        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest2 ${confidenceStyle[pair.confidence]}`}>
          {pair.confidence} confidence
        </span>
        <div className="text-xs text-muted">
          {pair.reasons.map((r, i) => <span key={i}>{i > 0 ? " · " : ""}{r}</span>)}
        </div>
      </div>

      <div className="grid gap-0 sm:grid-cols-2 sm:divide-x sm:divide-ink/10">
        <LeadCard lead={pair.a} baseHref={leadBase} isWinner={winnerId === pair.a.id} onPick={() => setWinnerId(pair.a.id)} />
        <LeadCard lead={pair.b} baseHref={leadBase} isWinner={winnerId === pair.b.id} onPick={() => setWinnerId(pair.b.id)} />
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-ink/10 px-4 py-2">
        <span className="text-xs text-muted">
          Keeping <strong>{winner.name}</strong>, discarding <strong>{loser.name}</strong>.
        </span>
        <div className="flex items-center gap-2">
          {error && <span className="text-xs text-rose-700">{error}</span>}
          <button
            onClick={() => setDismissed(true)}
            className="border border-ink/20 px-3 py-1.5 text-xs uppercase tracking-widest2 hover:bg-cream"
          >
            Ignore
          </button>
          <button
            onClick={merge}
            disabled={merging}
            style={{ backgroundColor: "#C8102E", color: "#FFFFFF" }}
            className="px-3 py-1.5 text-xs font-semibold uppercase tracking-widest2 hover:opacity-90 disabled:opacity-50"
          >
            {merging ? "Merging…" : "Merge"}
          </button>
        </div>
      </div>
    </li>
  );
}

function LeadCard({ lead, baseHref, isWinner, onPick }: {
  lead: { id: string; name: string; contact_name: string | null; email: string | null; phone: string | null; created_at: string };
  baseHref: string;
  isWinner: boolean;
  onPick: () => void;
}) {
  return (
    <div className={`p-4 ${isWinner ? "bg-cream/50" : ""}`}>
      <label className="flex items-start gap-3">
        <input
          type="radio"
          checked={isWinner}
          onChange={onPick}
          className="mt-1"
        />
        <div className="flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <Link href={`${baseHref}/${lead.id}`} target="_blank"
              className="font-display text-lg font-semibold text-ink hover:underline">
              {lead.name}
            </Link>
            <span className="text-[10px] uppercase tracking-widest2 text-muted">
              added {new Date(lead.created_at).toLocaleDateString()}
            </span>
          </div>
          <dl className="mt-2 space-y-1 text-xs">
            <Row label="Contact"  value={lead.contact_name} />
            <Row label="Email"    value={lead.email} />
            <Row label="Phone"    value={lead.phone} />
          </dl>
          <div className="mt-2 text-[10px] uppercase tracking-widest2 text-muted">
            {isWinner ? "Winner — this row survives" : "Click radio to make this the winner"}
          </div>
        </div>
      </label>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid grid-cols-[80px_1fr] gap-2">
      <dt className="text-[10px] uppercase tracking-widest2 text-muted">{label}</dt>
      <dd className="text-ink/90">{value ?? <span className="text-ink/40">—</span>}</dd>
    </div>
  );
}
