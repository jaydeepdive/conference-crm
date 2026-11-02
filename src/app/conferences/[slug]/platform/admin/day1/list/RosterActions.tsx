"use client";

interface Row { name: string; title: string; org: string; side: string; email: string; phone: string }

export function RosterActions({ kind, rows }: { kind: "site_visit" | "golf"; rows: Row[] }) {
  function download() {
    const esc = (s: string) => `"${(s ?? "").replace(/"/g, '""')}"`;
    const text = ["Name,Title,Organization,Type,Email,Phone",
      ...rows.map(r => [r.name, r.title, r.org, r.side, r.email, r.phone].map(esc).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    a.download = kind === "golf" ? "day1-golf.csv" : "day1-site-visit.csv";
    a.click();
  }
  const btn = "border border-ink/20 bg-white px-3 py-2 text-[11px] font-semibold uppercase tracking-widest2 text-ink hover:border-ink";
  return (
    <div className="no-print flex gap-2">
      <button type="button" onClick={() => window.print()} className={btn}>Print</button>
      <button type="button" onClick={download} disabled={rows.length === 0} className={`${btn} disabled:opacity-40`}>Download</button>
    </div>
  );
}
