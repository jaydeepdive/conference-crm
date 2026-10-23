/**
 * Admin console → Day 1 (Sunday Nov 22): site visit or golf tournament.
 * Edit each activity's details and assign every attendee.
 */
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { Day1Client, type Day1Person, type Day1Activity } from "./Day1Client";

export const dynamic = "force-dynamic";

export default async function Day1Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const svc = createServiceClient();
  const { data: conf } = await svc.from("conferences").select("id").eq("slug", slug).maybeSingle();
  if (!conf) { notFound(); throw new Error("unreachable"); }
  const [{ data: acts }, { data: people }, { data: cos }, { data: invs }] = await Promise.all([
    svc.from("conference_activities").select("kind, title, when_text, location, details").eq("conference_id", conf.id),
    svc.from("attendee_profiles").select("id, full_name, email, phone, lead_type, lead_id, day1_activity").eq("conference_id", conf.id),
    svc.from("companies").select("id, name").eq("conference_id", conf.id),
    svc.from("investors").select("id, firm_name, contact_name").eq("conference_id", conf.id),
  ]);
  const co = new Map((cos ?? []).map(c => [c.id, c.name as string]));
  const inv = new Map((invs ?? []).map(i => [i.id, (i.firm_name || i.contact_name) as string]));
  const rows: Day1Person[] = (people ?? []).map(p => ({
    id: p.id as string,
    name: (p.full_name as string | null) ?? null,
    email: (p.email as string | null) ?? null,
    phone: (p.phone as string | null) ?? null,
    side: p.lead_type as "company" | "investor",
    org: (p.lead_type === "company" ? co.get(p.lead_id) : inv.get(p.lead_id)) ?? "—",
    activity: (p.day1_activity as Day1Person["activity"]) ?? null,
  })).sort((a, b) => a.org.localeCompare(b.org) || (a.name ?? "").localeCompare(b.name ?? ""));
  const activities = (acts ?? []) as Day1Activity[];
  return (
    <div className="space-y-5">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-brand-accent">Day 1 · Sunday, November 22</div>
        <h1 className="mt-1 font-display text-3xl font-medium sm:text-4xl">Site visit &amp; golf</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Write the details for each activity, then assign people. Everyone at a company shares one schedule — assigning one contact assigns the whole company. Attendees see their activity and its details on their portal Schedule. No emails are sent.
        </p>
      </div>
      <Day1Client conferenceId={conf.id as string} activities={activities} people={rows} />
    </div>
  );
}
