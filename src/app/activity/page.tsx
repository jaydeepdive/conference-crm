import { createClient } from "@/lib/supabase/server";
import { ActivityFeed } from "@/components/ActivityFeed";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const supabase = await createClient();
  const [{ data: activity }, { data: profiles }] = await Promise.all([
    supabase.from("activity_log").select("*").order("created_at", { ascending: false }).limit(200),
    supabase.from("profiles").select("*"),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Activity log</h1>
        <p className="text-sm text-gray-500">Last 200 events across all leads</p>
      </div>
      <ActivityFeed entries={activity ?? []} profiles={profiles ?? []} />
    </div>
  );
}
