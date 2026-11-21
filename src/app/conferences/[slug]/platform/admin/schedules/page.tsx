/**
 * Admin console → Schedules: pick any company or investor and print their
 * schedule (letterhead, one page each), or print everyone on one side.
 */
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { splitInvestor } from "@/lib/printSchedule";
import { SchedulePicker, type PickItem } from "./SchedulePicker";

export const dynamic = "force-dynamic";

export default async function SchedulesPage({ params, searchParams }: {
  params: Promise<{ slug: string }>; searchParams: Promise<{ side?: string }>;
}) {
  const { slug } = await params;
  const { side } = await searchParams;
  const svc = createServiceClient();
  const { data: conf } = await svc.from("conferences").select("id").eq("slug", slug).maybeSingle();
  if (!conf) { notFound(); throw new Error("unreachable"); }
  const [{ data: cos }, { data: invs }, { data: ms }] = await Promise.all([
    svc.from("companies").select("id, name, meeting_table").eq("conference_id", conf.id).eq("stage", "registered"),
    svc.from("investors").select("id, firm_name, contact_name").eq("conference_id", conf.id).eq("stage", "registered"),
    svc.from("meetings").select("company_id, investor_id").eq("conference_id", conf.id).eq("status", "accepted").not("scheduled_time", "is", null),
  ]);
  const cCount = new Map<string, number>(), iCount = new Map<string, number>();
  for (const m of ms ?? []) {
    cCount.set(m.company_id as string, (cCount.get(m.company_id as string) ?? 0) + 1);
    iCount.set(m.investor_id as string, (iCount.get(m.investor_id as string) ?? 0) + 1);
  }
  const companies: PickItem[] = (cos ?? []).map(c => ({ id: c.id as string, name: c.name as string, sub: (c.meeting_table as string | null) ?? "", count: cCount.get(c.id as string) ?? 0 }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const investors: PickItem[] = (invs ?? []).map(i => { const sp = splitInvestor(i.firm_name as string | null, i.contact_name as string | null); return { id: i.id as string, name: sp.person, sub: sp.firm ?? "", count: iCount.get(i.id as string) ?? 0 }; })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-brand-accent">Print</div>
        <h1 className="mt-1 font-display text-3xl font-medium sm:text-4xl">Schedules</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">Print any company&rsquo;s or investor&rsquo;s schedule on Above &amp; Beyond letterhead — one page each, with times, tables and their Deep Dive interview. Tick several to print them together.</p>
      </div>
      <SchedulePicker slug={slug} companies={companies} investors={investors} initialSide={side === "investor" ? "investor" : "company"} />
    </div>
  );
}
