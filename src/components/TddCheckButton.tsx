"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { TddBadge } from "./TddBadge";
import type { LeadType } from "@/lib/types";

export function TddCheckButton({
  conferenceId, leadType, leadId, name, ticker, website,
  isClient, matchType, lastCheckedAt, tickerFromData,
}: {
  conferenceId: string;
  leadType: LeadType;
  leadId?: string;
  name: string;
  ticker?: string | null;
  website?: string | null;
  isClient?: boolean;
  matchType?: string | null;
  lastCheckedAt?: string | null;
  tickerFromData?: string | null;
}) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{ is_client: boolean; match_type: string; error?: string } | null>(null);

  async function check() {
    setChecking(true); setResult(null);
    try {
      const res = await fetch("/api/adsplatform/lookup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conference_id: conferenceId,
          lead_type: leadType, lead_id: leadId,
          company_name: name, ticker, website_url: website,
          persist: !!leadId,
        }),
      });
      const data = await res.json();
      setResult(data);
      if (leadId) router.refresh();
    } catch (e) {
      setResult({ is_client: false, match_type: "error", error: e instanceof Error ? e.message : "Lookup failed" });
    } finally {
      setChecking(false);
    }
  }

  const showResult = result ?? (isClient ? { is_client: true, match_type: matchType ?? "" } : null);

  return (
    <div className="flex items-center gap-2">
      <button onClick={check} disabled={checking || !name}
        className="border border-ink/20 px-3 py-1 text-xs uppercase tracking-widest2 hover:bg-cream disabled:opacity-50">
        {checking ? "Checking…" : "Check TDD"}
      </button>
      {showResult?.is_client && <TddBadge matchType={showResult.match_type} ticker={tickerFromData ?? ticker} />}
      {showResult && !showResult.is_client && (
        <span className="text-xs text-ink/50">Not a TDD client</span>
      )}
      {result?.error && <span className="text-xs text-rose-600">{result.error}</span>}
      {!result && lastCheckedAt && (
        <span className="text-xs text-ink/40">Last checked {new Date(lastCheckedAt).toLocaleDateString()}</span>
      )}
    </div>
  );
}
