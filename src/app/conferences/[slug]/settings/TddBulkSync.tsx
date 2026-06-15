"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function TddBulkSync({ conferenceId, totalLeads }: {
  conferenceId: string;
  totalLeads: number;
  checkedLeads: number;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ total: number; updated: number; clients: number; errors: number; errorSample?: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(onlyUnchecked: boolean) {
    setRunning(true); setError(null); setResult(null);
    try {
      const res = await fetch("/api/adsplatform/sync-all", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conference_id: conferenceId, only_unchecked: onlyUnchecked }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Sync failed");
      }
      setResult(await res.json());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally { setRunning(false); }
  }

  return (
    <div className="mt-4 border border-line bg-white p-5">
      <div className="flex items-center gap-3">
        <button onClick={() => run(false)} disabled={running}
          className="bg-ink px-4 py-2 text-[11px] uppercase tracking-widest2 text-white hover:bg-brand-accent disabled:opacity-50">
          {running ? "Syncing…" : `Re-check all ${totalLeads} leads`}
        </button>
        <button onClick={() => run(true)} disabled={running}
          className="border border-line px-4 py-2 text-[11px] uppercase tracking-widest2 text-ink hover:border-brand-accent disabled:opacity-50">
          Only check unchecked
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-md bg-rose-50 p-3 text-sm text-rose-800">
          <strong>Sync failed:</strong> {error}
          {error.includes("503") && (
            <p className="mt-2 text-xs">
              HTTP 503 from TDD means their AdsPlatform API key isn&apos;t set on their server (this is a
              config issue on TDD&apos;s WordPress, not on our side). Contact whoever runs TDD to enable
              the conference lookup API.
            </p>
          )}
        </div>
      )}

      {result && (
        <div className="mt-3 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">
          Synced <strong>{result.updated}</strong> of {result.total} leads.{" "}
          Found <strong>{result.clients}</strong> TDD client{result.clients === 1 ? "" : "s"}.
          {result.errors > 0 && <span className="text-amber-700"> {result.errors} failed.</span>}
          {result.errorSample && result.errorSample.length > 0 && (
            <p className="mt-1 text-xs">First error: {result.errorSample[0]}</p>
          )}
        </div>
      )}
    </div>
  );
}
