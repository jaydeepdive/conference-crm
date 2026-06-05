import { requireConferenceRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CompTypesManager } from "./CompTypesManager";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireConferenceRole(slug, ["super_admin","conference_admin","finance"]);
  const supabase = await createClient();
  const { data: compTypes } = await supabase.from("comp_types")
    .select("*").eq("conference_id", ctx.conference.id).order("name");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500">Configure comp types for {ctx.conference.name}.</p>
      </div>
      <CompTypesManager conferenceId={ctx.conference.id} compTypes={compTypes ?? []} />
    </div>
  );
}
