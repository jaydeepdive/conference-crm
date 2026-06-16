"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** Fires a background TDD lookup for any leads in this conference that need it:
 *  - Never checked (tdd_last_checked_at IS NULL), or
 *  - Currently not flagged AND last checked > 1 hour ago.
 *  Runs once per page mount. Refreshes the page so badges appear automatically. */
export function AutoTddSync({ conferenceId, uncheckedCount }: {
  conferenceId: string;
  uncheckedCount: number;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [result, setResult] = useState<{ updated: number; clients: number; companies: number; investors: number } | null>(null);

  useEffect(() => {
    if (uncheckedCount === 0) return;
    let cancelled = false;
    setState("syncing");

    fetch("/api/adsplatform/sync-all", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conference_id: conferenceId, only_stale: true }),
    }).then(async res => {
      if (cancelled) return;
      if (!res.ok) { setState("error"); return; }
      const data = await res.json();
      setResult({
        updated: data.updated ?? 0, clients: data.clients ?? 0,
        companies: data.companiesProcessed ?? 0, investors: data.investorsProcessed ?? 0,
      });
      setState("done");
      router.refresh();
    }).catch(() => { if (!cancelled) setState("error"); });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conferenceId]);

  if (state === "idle" || uncheckedCount === 0) return null;
  if (state === "syncing") {
    return (
      <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-widest2 text-muted">
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full" style={{ backgroundColor: "#C8102E" }}></span>
        Checking {uncheckedCount} {uncheckedCount === 1 ? "lead" : "leads"} against TDD AdsPlatform…
      </div>
    );
  }
  if (state === "done" && result) {
    return (
      <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-widest2 text-muted">
        Synced {result.updated} ({result.companies} co · {result.investors} inv) · {result.clients} TDD client{result.clients === 1 ? "" : "s"} flagged
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-widest2"
        style={{ color: "#C8102E" }}>
        TDD sync failed (check AdsPlatform setup)
      </div>
    );
  }
  return null;
}
