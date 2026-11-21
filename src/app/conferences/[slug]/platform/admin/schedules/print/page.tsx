/**
 * Admin console → Schedules → print view. Letter-size, one schedule per page,
 * Above & Beyond letterhead. ?side=company|investor&id=<uuid>[,<uuid>…] or &all=1
 */
import { notFound } from "next/navigation";
import { loadPrintSchedules, type Side, type PrintRow } from "@/lib/printSchedule";
import { PrintToolbar } from "./PrintToolbar";

export const dynamic = "force-dynamic";

const GOLD = "#b08a3a";
const INK = "#1c1a17";

export default async function PrintSchedulesPage({ params, searchParams }: {
  params: Promise<{ slug: string }>; searchParams: Promise<{ side?: string; id?: string; all?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const side: Side = sp.side === "investor" ? "investor" : "company";
  const ids = sp.all ? "all" as const : (sp.id ?? "").split(",").filter(Boolean);
  if (ids !== "all" && ids.length === 0) { notFound(); throw new Error("unreachable"); }
  const data = await loadPrintSchedules(slug, side, ids);
  if (!data) { notFound(); throw new Error("unreachable"); }
  const { conference, schedules } = data;
  const eventName = conference.public_name || "Above & Beyond Mining Summit";
  const printed = new Intl.DateTimeFormat("en-US", { timeZone: conference.timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date());

  return (
    <div className="print-root">
      <style>{`
        @page { size: Letter; margin: 0.4in; }
        @media print {
          html, body { background: #fff !important; }
          .ab-admin > header, .no-print { display: none !important; }
          .ab-admin > main { padding: 0 !important; max-width: none !important; }
          .sheet { box-shadow: none !important; margin: 0 !important; border: 0 !important; width: auto !important; min-height: auto !important; padding: 0 !important; }
          .sheet + .sheet { break-before: page; page-break-before: always; }
        }
        .print-root * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .sheet { width: 8.5in; min-height: 11in; margin: 0 auto 24px; background: #fff; padding: 0.4in; box-shadow: 0 2px 14px rgba(0,0,0,.12); color: ${INK}; }
        .sched td, .sched th { padding: 5px 8px; vertical-align: top; }
        .sched tr { break-inside: avoid; }
      `}</style>

      <PrintToolbar count={schedules.length} backHref={`/conferences/${slug}/platform/admin/schedules?side=${side}`} />

      {schedules.length === 0 && <div className="no-print py-10 text-center text-sm text-muted">Nothing to print.</div>}

      {schedules.map(s => (
        <section key={s.leadId} className="sheet font-sans">
          {/* Letterhead */}
          <div className="flex items-center justify-between gap-4 px-5 py-3" style={{ backgroundColor: "#0a0a0a", borderBottom: `3px solid ${GOLD}` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-transparent.png" alt="Above & Beyond Summit" style={{ height: 64, width: "auto" }} />
            <div className="text-right" style={{ color: "#f5f0e6" }}>
              <div className="font-serif text-[20px] leading-tight" style={{ color: "#e8cf8f" }}>{eventName}</div>
              <div className="mt-0.5 text-[11px] uppercase tracking-[0.2em]">November 22–24, 2026</div>
              <div className="text-[11px]" style={{ color: "#cfc6b4" }}>Andaz Scottsdale Resort &amp; Bungalows · Scottsdale, Arizona</div>
            </div>
          </div>

          {/* Who */}
          <div className="mt-5 flex items-end justify-between gap-4 border-b pb-3" style={{ borderColor: "#e4dccb" }}>
            <div className="min-w-0">
              <div className="text-[10px] font-medium uppercase tracking-[0.24em]" style={{ color: GOLD }}>1-on-1 Meeting Schedule</div>
              <h1 className="font-serif text-[32px] font-semibold leading-tight">{s.name}</h1>
              <div className="text-[12px] text-[#5d574c]">{s.subtitle}</div>
              {s.people.length > 0 && s.side === "company" && (
                <div className="mt-0.5 text-[12px] text-[#5d574c]">Attending: {s.people.join(", ")}</div>
              )}
            </div>
            <div className="shrink-0 text-right text-[12px] text-[#5d574c]">
              <div className="font-serif text-[18px] font-semibold" style={{ color: INK }}>{s.dayHeading}</div>
              {s.doors && <div>Doors open {s.doors}</div>}
              <div>{s.meetingCount} meeting{s.meetingCount === 1 ? "" : "s"} · times in Arizona time</div>
            </div>
          </div>

          {s.day1 && (
            <div className="mt-3 rounded-sm px-3 py-2 text-[12px]" style={{ backgroundColor: "#f7f1e3", borderLeft: `3px solid ${GOLD}` }}>
              <span className="font-medium">Sunday, November 22:</span> {s.day1}
            </div>
          )}

          <ScheduleTable rows={s.rows} side={s.side} />

          {s.other.length > 0 && (
            <>
              <div className="mt-4 text-[10px] font-medium uppercase tracking-[0.24em]" style={{ color: GOLD }}>Other meetings</div>
              <ScheduleTable rows={s.other} side={s.side} />
            </>
          )}

          <div className="mt-4 flex items-end justify-between gap-4 border-t pt-2 text-[10px] text-[#8a8274]" style={{ borderColor: "#e4dccb" }}>
            <div>Schedule changes? Visit the registration desk or crm.abovebeyondsummit.com</div>
            <div>Printed {printed}</div>
          </div>
        </section>
      ))}
    </div>
  );
}

function ScheduleTable({ rows, side }: { rows: PrintRow[]; side: Side }) {
  return (
    <table className="sched mt-3 w-full border-collapse text-[12.5px]">
      <thead>
        <tr className="text-left text-[9.5px] uppercase tracking-[0.18em]" style={{ color: "#8a8274", borderBottom: "1px solid #e4dccb" }}>
          <th className="w-[150px] font-medium">Time</th>
          <th className="font-medium">{side === "company" ? "Investor" : "Company"}</th>
          <th className="w-[150px] text-right font-medium">Location</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const muted = r.kind === "open" || r.kind === "lunch";
          const band = r.kind === "program" || r.kind === "lunch" ? "#faf6ec" : r.kind === "blocked" ? "#f7f1e3" : undefined;
          return (
            <tr key={i} style={{ borderBottom: "1px solid #efe9dc", backgroundColor: band }}>
              <td className="whitespace-nowrap tabular-nums" style={{ color: "#5d574c" }}>{r.time}</td>
              <td>
                <div className={r.kind === "meeting" ? "font-semibold" : muted ? "italic" : "font-medium"} style={{ color: muted ? "#9a9286" : "#1c1a17" }}>
                  {r.kind === "blocked" && r.title.includes("Deep Dive") ? "🎙 " : ""}{r.title}
                </div>
                {r.sub && <div className="text-[11px]" style={{ color: "#6f685c" }}>{r.sub}</div>}
              </td>
              <td className="text-right font-medium" style={{ color: r.kind === "meeting" ? "#1c1a17" : "#8a8274" }}>{r.where ?? ""}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
