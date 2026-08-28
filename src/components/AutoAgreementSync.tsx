"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** Fires a background bulk-refresh of SignWell agreement statuses for every
 *  in-flight (sent/viewed) agreement in this conference — mirrors AutoTddSync.
 *
 *  Runs once on mount. Refreshes the page when at least one status changed.
 *  Also exposes a manual "Refresh all" button so operators can force a sync
 *  on demand without waiting on the auto-run.
 */
export function AutoAgreementSync({
  conferenceId, inFlightCount,
}: {
  conferenceId: string;
  /** How many agreements are currently in sent/viewed state — passed from
   *  the server render so we can skip the fetch entirely when there's
   *  nothing to check. */
  inFlightCount: number;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [result, setResult] = useState<{ checked: number; changed: number; errored: number } | null>(null);
  const [manualBusy, setManualBusy] = useState(false);

  async function runSync(source: "auto" | "manual") {
    if (source === "manual") setManualBusy(true);
    setState("syncing");
    try {
      const res = await fetch("/api/signwell/refresh-all", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conference_id: conferenceId }),
      });
      if (!res.ok) { setState("error"); return; }
      const data = await res.json();
      setResult({
        checked: data.checked ?? 0,
        changed: data.changed ?? 0,
        errored: data.errored ?? 0,
      });
      setState("done");
      if ((data.changed ?? 0) > 0) router.refresh();
    } catch {
      setState("error");
    } finally {
      if (source === "manual") setManualBusy(false);
    }
  }

  useEffect(() => {
    if (inFlightCount === 0) return;
    runSync("auto");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conferenceId]);

  return (
    <div className="inline-flex items-center gap-3 text-[11px] uppercase tracking-widest2 text-muted">
      {state === "syncing" && (
        <>
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full" style={{ backgroundColor: "#C8102E" }}></span>
          Checking {inFlightCount} agreement{inFlightCount === 1 ? "" : "s"} with SignWell…
        </>
      )}
      {state === "done" && result && (
        <>
          {result.changed > 0
            ? <span className="text-emerald-700">↻ {result.changed} agreement{result.changed === 1 ? "" : "s"} updated</span>
            : <span>↻ {result.checked} agreement{result.checked === 1 ? "" : "s"} checked · none changed</span>}
          {result.errored > 0 && <span className="text-rose-700">· {result.errored} error{result.errored === 1 ? "" : "s"}</span>}
        </>
      )}
      {state === "error" && <span style={{ color: "#C8102E" }}>Agreement sync failed</span>}
      <button
        onClick={() => runSync("manual")}
        disabled={manualBusy || inFlightCount === 0}
        title={inFlightCount === 0 ? "No in-flight agreements to check" : "Force a fresh pull from SignWell"}
        className="border border-gray-300 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest2 hover:bg-cream disabled:opacity-40"
      >
        {manualBusy ? "Refreshing…" : "Refresh all"}
      </button>
    </div>
  );
}
