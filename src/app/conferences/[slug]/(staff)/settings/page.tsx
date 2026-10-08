import { requireConferenceRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CompTypesManager } from "./CompTypesManager";
import { TddBulkSync } from "./TddBulkSync";
import { MeetingHoursForm } from "./MeetingHoursForm";
import { SignWellSettings } from "./SignWellSettings";
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
        <SectionHeader title="Attendee portal — meeting hours" meta="SCHEDULING" />
        <p className="mt-3 text-sm text-muted">
          Controls the slot grid the attendee portal shows. Store times in the
          conference&rsquo;s local timezone; the portal converts to UTC for storage
          and displays back in this same zone.
        </p>
        <div className="mt-4">
          <MeetingHoursForm conference={ctx.conference} />
        </div>
      </section>

      {ctx.effectiveRole === "super_admin" && (
        <section>
          <SectionHeader title="SignWell — Company Participation Agreement" meta="ESIGN" />
          <p className="mt-3 text-sm text-muted">
            Pick which SignWell template represents this conference&rsquo;s participation
            agreement, then map the template&rsquo;s Company Name field (and any others) to
            the CRM. From then on, each company detail page will have a &ldquo;Send agreement&rdquo;
            button that autofills these values.
          </p>
          <div className="mt-4">
            <SignWellSettings conference={ctx.conference} />
          </div>
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
