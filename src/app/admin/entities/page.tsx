import { createClient } from "@/lib/supabase/server";
import { EntitiesAdmin } from "./EntitiesAdmin";

export const dynamic = "force-dynamic";

export default async function AdminEntitiesPage() {
  const supabase = await createClient();
  const { data: entities } = await supabase.from("entities").select("*").order("created_at", { ascending: true });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Entities</h1>
        <p className="text-sm text-gray-500">Parent organizations / JV partners. Only super admins see these tags.</p>
      </div>
      <EntitiesAdmin entities={entities ?? []} />
    </div>
  );
}
