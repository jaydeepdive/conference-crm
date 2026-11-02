/**
 * Admin console → Day 1 → attendee list for one activity (site visit / golf).
 * Read-only roster: open on a phone, print, or download. No emails.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { RosterActions } from "./RosterActions";

export const dynamic = "force-dynamic";

export default async function Day1ListPage({ params, searchParams }: {
  params: Promise<{ slug: string }>; searchParams: Promise<{ kind?: string }>;
}) {
  const { slug } = await params;
  const { kind: k } = await searchParams;
  const kind: "site_visit" | "golf" = k === "golf" ? "golf" : "site_visit";
  const svc = createServiceClient();
  const { data: conf } = await svc.from("conferences").select("id").eq("slug", slug).maybeSingle();
  if (!conf) { notFound(); throw new Error("unreachable"); }
  const [{ data: act }, { data: people }, { data: cos }, { data: invs }] = await Promise.all([
    svc.from("conference_activities").select("title, when_text, location").eq("conference_id", conf.id).eq("kind", kind).maybeSingle(),
    svc.from("attendee_profiles").select("id, full_name, email, phone, title, lead_type, lead_id")
      .eq("conference_id", conf.id).eq("day1_activity", kind),
    svc.from("companies").select("id, name").eq("conference_id", conf.id),
    svc.from("investors").select("id, firm_name, contact_name").eq("conference_id", conf.id),
  ]);
  const co = new Map((cos ?? []).map(c => [c.id as string, c.name as string]));
  const inv = new Map((invs ?? []).map(i => [i.id as string, (i.firm_name || i.contact_name) as string]));
  const rows = (people ?? []).map(p => ({
    id: p.id as string,
    name: (p.full_name as string | null) ?? "",
    title: (p.title as string | null) ?? "",
    email: (p.email as string | null) ?? "",
    phone: (p.phone as string | null) ?? "",
    side: p.lead_type === "company" ? "Company" : "Investor",
    org: (p.lead_type === "company" ? co.get(p.lead_id as string) : inv.get(p.lead_id as string)) ?? "—",
  })).sort((a, b) => a.org.localeCompare(b.org) || a.name.localeCompare(b.name));

  const label = (act?.title as string | undefined) || (kind === "golf" ? "Golf tournament" : "Site visit");
  const nCo = rows.filter(r => r.side === "Company").length;
  const other = kind === "golf" ? "site_visit" : "golf";

  return (
    <div className="space-y-5">
      <style>{`@media print {
        body * { visibility: hidden !important; }
        #day1-roster, #day1-roster * { visibility: visible !important; }
        #day1-roster { position: absolute; left: 0; top: 0; width: 100%; }
        .no-print { display: none !important; }
      }`}</style>

      <div className="no-print flex flex-wrap items-center gap-3 text-xs">
        <Link href={`/conferences/${slug}/platform/admin/day1`} className="underline text-muted">← Day 1</Link>
        <Link href={`/conferences/${slug}/platform/admin/day1/list?kind=${other}`} className="underline text-muted">
          {other === "golf" ? "Golf list" : "Site visit list"} →
        </Link>
      </div>

      <div id="day1-roster" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-brand-accent">Day 1 · Sunday, November 22</div>
            <h1 className="mt-1 font-display text-3xl font-medium sm:text-4xl">{label} — attendees</h1>
            <p className="mt-1 text-sm text-muted">
              {rows.length} {rows.length === 1 ? "person" : "people"} · {rows.length - nCo} investor{rows.length - nCo === 1 ? "" : "s"} · {nCo} company {nCo === 1 ? "person" : "people"}
              {act?.when_text ? ` · ${act.when_text}` : ""}{act?.location ? ` · ${act.location}` : ""}
            </p>
          </div>
          <RosterActions kind={kind} rows={rows} />
        </div>

        {rows.length === 0 ? (
          <div className="border border-line bg-white px-4 py-10 text-center text-sm text-muted">
            No one is assigned yet. Assign people on the <Link href={`/conferences/${slug}/platform/admin/day1`} className="underline">Day 1</Link> tab.
          </div>
        ) : (
          <>
            {/* Desktop / print */}
            <table className="hidden w-full border border-line bg-white text-sm md:table print:table">
              <thead className="bg-utility text-left text-[11px] uppercase tracking-widest2 text-muted">
                <tr><th className="px-3 py-2 w-10">#</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Organization</th>
                  <th className="px-3 py-2">Type</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Phone</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r, i) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 text-muted">{i + 1}</td>
                    <td className="px-3 py-2 font-semibold text-ink">{r.name || <span className="italic font-normal text-muted">No name</span>}
                      {r.title && <div className="text-xs font-normal text-muted">{r.title}</div>}</td>
                    <td className="px-3 py-2">{r.org}</td>
                    <td className="px-3 py-2">{r.side}</td>
                    <td className="px-3 py-2">{r.email || <span className="text-muted">—</span>}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.phone || <span className="text-muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Phone */}
            <ul className="divide-y divide-line border border-line bg-white md:hidden print:hidden">
              {rows.map((r, i) => (
                <li key={r.id} className="px-4 py-3">
                  <div className="font-semibold text-ink"><span className="mr-2 text-muted">{i + 1}.</span>{r.name || "No name"}</div>
                  <div className="text-xs text-muted">{r.org} · {r.side}</div>
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
      </div>
    </div>
  );
}
