import { requireConferenceAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActivityFeed, type ActivityLeadInfo } from "@/components/ActivityFeed";

export const dynamic = "force-dynamic";

export default async function ActivityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireConferenceAccess(slug);
  const supabase = await createClient();

  const [{ data: activity }, { data: profiles }] = await Promise.all([
    supabase.from("activity_log").select("*").eq("conference_id", ctx.conference.id)
      .order("created_at", { ascending: false }).limit(200),
    supabase.from("profiles").select("*"),
  ]);

  // Current name / contact / email for every company/investor in the log.
  const coIds = Array.from(new Set((activity ?? []).filter(a => a.lead_type === "company").map(a => a.lead_id)));
  const invIds = Array.from(new Set((activity ?? []).filter(a => a.lead_type === "investor").map(a => a.lead_id)));
  const [{ data: cos }, { data: invs }] = await Promise.all([
    coIds.length ? supabase.from("companies").select("id, name, contact_name, email, stage").in("id", coIds) : Promise.resolve({ data: [] as { id: string; name: string; contact_name: string | null; email: string | null; stage: string | null }[] }),
    invIds.length ? supabase.from("investors").select("id, firm_name, contact_name, email, stage").in("id", invIds) : Promise.resolve({ data: [] as { id: string; firm_name: string; contact_name: string | null; email: string | null; stage: string | null }[] }),
  ]);
  const leads: Record<string, ActivityLeadInfo> = {};
  for (const c of cos ?? []) leads[c.id] = { name: c.name, contact: c.contact_name, email: c.email, stage: c.stage };
  for (const i of invs ?? []) leads[i.id] = { name: i.firm_name || i.contact_name || "", contact: i.contact_name, email: i.email, stage: i.stage };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Activity log</h1>
        <p className="text-sm text-gray-500">Last 200 events. Website sign-ups are marked New — click the name to open their record.</p>
      </div>
      <ActivityFeed entries={activity ?? []} profiles={profiles ?? []} slug={slug} leads={leads} />
    </div>
  );
}
