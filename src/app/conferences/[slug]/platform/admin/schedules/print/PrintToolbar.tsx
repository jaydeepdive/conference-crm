"use client";
import Link from "next/link";

export function PrintToolbar({ count, backHref }: { count: number; backHref: string }) {
  return (
    <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
      <Link href={backHref} className="text-sm underline text-muted">← Back to schedules</Link>
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted">{count} schedule{count === 1 ? "" : "s"} · one per page (US Letter)</span>
        <button type="button" onClick={() => window.print()}
          className="bg-brand-accent px-5 py-2.5 text-xs font-semibold uppercase tracking-widest2 text-white">Print</button>
      </div>
    </div>
  );
}
