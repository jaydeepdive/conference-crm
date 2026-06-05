import { createClient } from "@/lib/supabase/server";
import { ConferencesAdmin } from "./ConferencesAdmin";

export const dynamic = "force-dynamic";

export default async function AdminConferencesPage() {
  const supabase = await createClient();
  const [{ data: conferences }, { data: entities }, { data: links }] = await Promise.all([
    supabase.from("conferences").select("*").order("date_start", { ascending: false, nullsFirst: false }),
    supabase.from("entities").select("*"),
    supabase.from("conference_entities").select("*"),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Conferences</h1>
      <ConferencesAdmin conferences={conferences ?? []} entities={entities ?? []} links={links ?? []} />
    </div>
  );
}
