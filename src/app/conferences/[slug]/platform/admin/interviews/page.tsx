/**
 * Admin console → Interviews: The Deep Dive interview schedule (Nov 24),
 * read from the admin-locked blocked slots whose reason mentions
 * "Deep Dive Interview". Print / download. Read-only.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { InterviewActions } from "./InterviewActions";

export const dynamic = "force-dynamic";

export default async function InterviewsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const svc = createServiceClient();
  const { data: conf } = await svc.from("conferences").select("id").eq("slug", slug).maybeSingle();
  if (!conf) { notFound(); throw new Error("unreachable"); }
  const [{ data: blocks }, { data: cos }, { data: people }] = await Promise.all([
    svc.from("attendee_blocked_slots").select("lead_id, slot_time, reason")
      .eq("conference_id", conf.id).eq("lead_type", "company").ilike("reason", "%deep dive interview%"),
    svc.from("companies").select("id, name, contact_name, stage").eq("conference_id", conf.id),
    svc.from("attendee_profiles").select("lead_id, full_name, email, phone").eq("conference_id", conf.id).eq("lead_type", "company"),
  ]);
  const coById = new Map((cos ?? []).map(c => [c.id as string, c]));
  const peopleBy = new Map<string, { name: string; email: string | null; phone: string | null }[]>();
  for (const p of people ?? []) {
    const k = p.lead_id as string;
    if (!peopleBy.has(k)) peopleBy.set(k, []);
    peopleBy.get(k)!.push({ name: (p.full_name as string | null) ?? "", email: p.email as string | null, phone: p.phone as string | null });
  }
  // "The Deep Dive Interview · 8:15–8:30 AM" → "8:15–8:30 AM"
  const timeOf = (reason: string | null) => (reason ?? "").split("·")[1]?.trim() ?? "";
  // Sort by the 30-min slot, then first/second 15-min half (":15"/":45" starts come second).
  const sortKey = (slotIso: string, t: string) => {
    const m = t.match(/^\d{1,2}:(\d{2})/);
    const second = m ? Number(m[1]) % 30 === 15 : false;
    return new Date(slotIso).getTime() + (second ? 15 * 60000 : 0);
  };
  const rows = (blocks ?? []).map(b => {
    const co = coById.get(b.lead_id as string);
    const ppl = peopleBy.get(b.lead_id as string) ?? [];
    const contact = (co?.contact_name as string | null) ?? "";
    const main = ppl.find(p => p.name && p.name.toLowerCase() === contact.toLowerCase()) ?? ppl[0];
    return {
      time: timeOf(b.reason as string | null),
      sort: sortKey(b.slot_time as string, timeOf(b.reason as string | null)),
      company: (co?.name as string) ?? "—",
      person: contact || main?.name || "",
      others: ppl.filter(p => p !== main).map(p => p.name).filter(Boolean).join(", "),
      email: main?.email ?? "",
      phone: main?.phone ?? "",
    };
  }).sort((a, b) => a.sort - b.sort);
  const scheduled = new Set((blocks ?? []).map(b => b.lead_id as string));
  const without = (cos ?? []).filter(c => c.stage === "registered" && !scheduled.has(c.id as string))
    .map(c => c.name as string).sort((a, b) => a.localeCompare(b));

  return (
    <div className="space-y-5">
      <style>{`@media print {
        body * { visibility: hidden !important; }
        #interviews-roster, #interviews-roster * { visibility: visible !important; }
        #interviews-roster { position: absolute; left: 0; top: 0; width: 100%; }
        .no-print { display: none !important; }
      }`}</style>
      <div id="interviews-roster" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-brand-accent">Day 3 · Tuesday, November 24</div>
            <h1 className="mt-1 font-display text-3xl font-medium sm:text-4xl">The Deep Dive interviews</h1>
            <p className="mt-1 text-sm text-muted">{rows.length} interviews · 15 minutes each · blocked on each company&rsquo;s schedule (locked).</p>
          </div>
          <InterviewActions rows={rows.map(({ sort: _s, ...r }) => r)} />
        </div>

        {rows.length === 0 ? (
          <div className="border border-line bg-white px-4 py-10 text-center text-sm text-muted">No interviews scheduled yet.</div>
        ) : (
          <>
            <table className="hidden w-full border border-line bg-white text-sm md:table print:table">
              <thead className="bg-utility text-left text-[11px] uppercase tracking-widest2 text-muted">
                <tr><th className="px-3 py-2">Time</th><th className="px-3 py-2">Company</th><th className="px-3 py-2">Interviewee</th>
                  <th className="px-3 py-2">Also attending</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Phone</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="whitespace-nowrap px-3 py-2 font-semibold tabular-nums text-ink">{r.time}</td>
                    <td className="px-3 py-2 font-semibold text-ink">{r.company}</td>
                    <td className="px-3 py-2">{r.person || <span className="text-muted">—</span>}</td>
                    <td className="px-3 py-2 text-muted">{r.others || "—"}</td>
                    <td className="px-3 py-2">{r.email || <span className="text-muted">—</span>}</td>
                    <td className="whitespace-nowrap px-3 py-2">{r.phone || <span className="text-muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="divide-y divide-line border border-line bg-white md:hidden print:hidden">
              {rows.map((r, i) => (
                <li key={i} className="px-4 py-3">
                  <div className="text-xs font-semibold tabular-nums text-muted">{r.time}</div>
                  <div className="font-semibold text-ink">{r.company}</div>
                  <div className="text-sm text-ink">{r.person}{r.others ? <span className="text-muted"> · also {r.others}</span> : null}</div>
                  {(r.email || r.phone) && (
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs">
                      {r.email && <a href={`mailto:${r.email}`} className="underline">{r.email}</a>}
                      {r.phone && <a href={`tel:${r.phone}`} className="underline">{r.phone}</a>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        {without.length > 0 && (
          <div className="border border-line bg-white px-4 py-3">
            <div className="text-[11px] font-medium uppercase tracking-widest2 text-muted">Attending companies with no interview time ({without.length})</div>
            <div className="mt-1 text-sm text-ink">{without.join(" · ")}</div>
          </div>
        )}
      </div>
      <p className="no-print text-xs text-muted">
        To see a slot on the full grid, open <Link href={`/conferences/${slug}/platform/admin/meetings`} className="underline">Meetings</Link>.
      </p>
    </div>
  );
}
