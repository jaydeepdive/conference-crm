/**
 * Admin console → Program: the event program for all days. Hidden from
 * attendees until published; preview it as any attendee first.
 */
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { loadProgram } from "@/lib/program";
import { ProgramClient, type PreviewOption } from "./ProgramClient";

export const dynamic = "force-dynamic";

export default async function ProgramPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const svc = createServiceClient();
  const { data: conf } = await svc.from("conferences").select("id, meeting_date, date_start, date_end").eq("slug", slug).maybeSingle();
  if (!conf) { notFound(); throw new Error("unreachable"); }
  const program = await loadProgram(svc, conf.id as string);

  const [{ data: people }, { data: cos }, { data: invs }] = await Promise.all([
    svc.from("attendee_profiles").select("id, full_name, lead_type, lead_id").eq("conference_id", conf.id),
    svc.from("companies").select("id, name").eq("conference_id", conf.id),
    svc.from("investors").select("id, firm_name, contact_name").eq("conference_id", conf.id),
  ]);
  const co = new Map((cos ?? []).map(c => [c.id as string, c.name as string]));
  const inv = new Map((invs ?? []).map(i => [i.id as string, (i.firm_name || i.contact_name) as string]));
  const seen = new Set<string>();
  const previewOptions: PreviewOption[] = [];
  for (const p of people ?? []) {
    const k = `${p.lead_type}:${p.lead_id}`;
    if (seen.has(k)) continue; seen.add(k);
    const org = (p.lead_type === "company" ? co.get(p.lead_id as string) : inv.get(p.lead_id as string)) ?? "—";
    previewOptions.push({ id: p.id as string, label: `${org}${p.full_name && p.full_name !== org ? ` — ${p.full_name}` : ""}`, side: p.lead_type as "company" | "investor" });
  }
  previewOptions.sort((a, b) => a.side.localeCompare(b.side) || a.label.localeCompare(b.label));

  const meetingDay = (conf.meeting_date as string | null) ?? null;
  const tableMissing = program.items.length === 0 && !program.published;

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-brand-accent">All three days</div>
        <h1 className="mt-1 font-display text-3xl font-medium sm:text-4xl">Event program</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          These items appear on every attendee&rsquo;s Schedule page — the meeting-day items slot in around their 1-on-1 meetings.
          Nothing is shown to attendees until you press Publish. No emails are sent.
        </p>
      </div>
      <ProgramClient slug={slug} conferenceId={conf.id as string} meetingDay={meetingDay}
        published={program.published} items={program.items} previewOptions={previewOptions} emptyHint={tableMissing} />
    </div>
  );
}
