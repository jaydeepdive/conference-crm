import { requireConferenceRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MembershipManager } from "./MembershipManager";

export const dynamic = "force-dynamic";

export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireConferenceRole(slug, ["super_admin","conference_admin"]);
  const supabase = await createClient();

  const [{ data: memberships }, { data: profiles }] = await Promise.all([
    supabase.from("conference_memberships").select("*").eq("conference_id", ctx.conference.id),
    supabase.from("profiles").select("*").order("created_at", { ascending: true }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Team</h1>
        <p className="text-sm text-gray-500">Manage who can access {ctx.conference.name} and what role they have.</p>
      </div>
      <MembershipManager
        conferenceId={ctx.conference.id}
        profiles={profiles ?? []}
        memberships={memberships ?? []}
        isSuperAdmin={ctx.effectiveRole === "super_admin"}
      />
    </div>
  );
}
