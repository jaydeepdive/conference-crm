import { createClient } from "@/lib/supabase/server";
import { TeamTable } from "./TeamTable";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const supabase = await createClient();
  const { data: profiles } = await supabase.from("profiles").select("*").order("created_at", { ascending: true });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Team</h1>
        <p className="text-sm text-gray-500">Admin only · grant or revoke CRM access</p>
      </div>
      <TeamTable profiles={profiles ?? []} />
    </div>
  );
}
