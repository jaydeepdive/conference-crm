"use client";

interface Row { time: string; company: string; person: string; others: string; email: string; phone: string }

export function InterviewActions({ rows }: { rows: Row[] }) {
  function download() {
    const esc = (s: string) => `"${(s ?? "").replace(/"/g, '""')}"`;
    const text = ["Time,Company,Interviewee,Also attending,Email,Phone",
      ...rows.map(r => [r.time, r.company, r.person, r.others, r.email, r.phone].map(esc).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    a.download = "deep-dive-interviews-nov-24.csv";
    a.click();
  }
  const btn = "border border-ink/20 bg-white px-3 py-2 text-[11px] font-semibold uppercase tracking-widest2 text-ink hover:border-ink disabled:opacity-40";
  return (
    <div className="no-print flex gap-2">
      <button type="button" onClick={() => window.print()} className={btn}>Print</button>
      <button type="button" onClick={download} disabled={rows.length === 0} className={btn}>Download</button>
    </div>
  );
}
