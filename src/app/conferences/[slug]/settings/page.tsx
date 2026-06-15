import { requireConferenceRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CompTypesManager } from "./CompTypesManager";
import { TddBulkSync } from "./TddBulkSync";
import { PageTitle, SectionHeader } from "@/components/SectionHeader";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireConferenceRole(slug, ["super_admin","conference_admin","finance"]);
  const supabase = await createClient();
  const [{ data: compTypes }, { count: companiesCount }, { count: investorsCount }, { count: checkedCount }] = await Promise.all([
    supabase.from("comp_types").select("*").eq("conference_id", ctx.conference.id).order("name"),
    supabase.from("companies").select("*", { count: "exact", head: true }).eq("conference_id", ctx.conference.id),
    supabase.from("investors").select("*", { count: "exact", head: true }).eq("conference_id", ctx.conference.id),
    supabase.from("companies").select("*", { count: "exact", head: true }).eq("conference_id", ctx.conference.id).not("tdd_last_checked_at", "is", null),
  ]);

  const canBulk = ctx.effectiveRole === "super_admin" || ctx.effectiveRole === "conference_admin";

  return (
    <div className="space-y-10">
      <PageTitle title="Settings" sub={ctx.conference.name} />

      {canBulk && (
        <section>
          <SectionHeader title="TDD client sync" meta="ADSPLATFORM" />
          <p className="mt-3 text-sm text-muted">
            Every new lead is checked automatically when saved. Use this to re-check existing leads in bulk
            — e.g. after adding tickers, or after TDD adds/removes a sponsor.
          </p>
          <TddBulkSync conferenceId={ctx.conference.id}
            totalLeads={(companiesCount ?? 0) + (investorsCount ?? 0)}
            checkedLeads={checkedCount ?? 0} />
        </section>
      )}

      <section>
        <SectionHeader title="Comp catalog" meta="ASSIGNABLE TO LEADS" />
        <div className="mt-4">
          <CompTypesManager conferenceId={ctx.conference.id} compTypes={compTypes ?? []} />
        </div>
      </section>
    </div>
  );
}
