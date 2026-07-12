import { requireConferenceRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MembershipManager } from "./MembershipManager";
import { PageTitle } from "@/components/SectionHeader";

export const dynamic = "force-dynamic";

export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireConferenceRole(slug, ["super_admin"]);
  const supabase = await createClient();

  const [{ data: memberships }, { data: profiles }] = await Promise.all([
    supabase.from("conference_memberships").select("*").eq("conference_id", ctx.conference.id),
    supabase.from("profiles").select("*").order("created_at", { ascending: true }),
  ]);

  return (
    <div className="space-y-6">
      <PageTitle
        title="Team"
        sub={`Manage access to ${ctx.conference.name} · Currently: ${(ctx.conference.visibility ?? "public") === "public" ? "PUBLIC (everyone has access by default)" : "PRIVATE (only invited users have access)"}`}
      />
      <MembershipManager
        conferenceId={ctx.conference.id}
        conferenceVisibility={ctx.conference.visibility ?? "public"}
        profiles={profiles ?? []}
        memberships={memberships ?? []}
        isSuperAdmin={ctx.effectiveRole === "super_admin"}
      />
    </div>
  );
}
