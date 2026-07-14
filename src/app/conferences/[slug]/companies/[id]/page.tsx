import Link from "next/link";
import { notFound } from "next/navigation";
import { requireConferenceAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LeadEditor } from "@/components/LeadEditor";
import { ActivityFeed } from "@/components/ActivityFeed";
import { LeadNotes } from "@/components/LeadNotes";
import { LeadComps } from "@/components/LeadComps";
import { LeadAttendees } from "@/components/LeadAttendees";
import { canEditLeads } from "@/lib/types";
import type { AttendeeProfile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CompanyDetailPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const ctx = await requireConferenceAccess(slug);
  const supabase = await createClient();

  const [{ data: company }, { data: profiles }, { data: activity }, { data: notes }, { data: comps }, { data: compTypes }, { data: attendees }] = await Promise.all([
    supabase.from("companies").select("*").eq("id", id).eq("conference_id", ctx.conference.id).single(),
    supabase.from("profiles").select("*"),
    supabase.from("activity_log").select("*").eq("lead_type","company").eq("lead_id", id).order("created_at",{ascending:false}),
    supabase.from("lead_notes").select("*").eq("lead_type","company").eq("lead_id", id).order("created_at",{ascending:false}),
    supabase.from("lead_comps").select("*").eq("lead_type","company").eq("lead_id", id).order("created_at",{ascending:false}),
    supabase.from("comp_types").select("*").eq("conference_id", ctx.conference.id).order("name"),
    supabase.from("attendee_profiles").select("*").eq("lead_type","company").eq("lead_id", id).order("created_at",{ascending:true}),
  ]);

  if (!company) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/conferences/${slug}/companies`} className="text-sm text-gray-500 hover:text-gray-700">← Companies</Link>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">{company.name}</h1>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <LeadEditor kind="company" conferenceSlug={slug} conferenceId={ctx.conference.id}
            role={ctx.effectiveRole} profiles={profiles ?? []} currentUserId={ctx.profile.id}
            initial={{
              id: company.id, name: company.name, category: company.industry,
              contact_name: company.contact_name, contact_title: company.contact_title,
              email: company.email, phone: company.phone, owner_id: company.owner_id,
              stage: company.stage, confirmed: company.confirmed,
              payment_status: company.payment_status,
              amount_due: Number(company.amount_due), amount_paid: Number(company.amount_paid),
              last_contact: company.last_contact, next_action: company.next_action,
              next_action_date: company.next_action_date,
              source: company.source, notes: company.notes,
              is_tdd_client: company.is_tdd_client,
            }}
          />
          <LeadNotes notes={notes ?? []} profiles={profiles ?? []}
            leadType="company" leadId={id} conferenceId={ctx.conference.id} currentUserId={ctx.profile.id} />
        </div>
        <div className="space-y-4">
          <LeadComps comps={comps ?? []} compTypes={compTypes ?? []}
            leadType="company" leadId={id} conferenceId={ctx.conference.id}
            currentUserId={ctx.profile.id} canEdit={canEditLeads(ctx.effectiveRole)} />
          <LeadAttendees conferenceId={ctx.conference.id} leadType="company" leadId={id}
            attendees={(attendees ?? []) as AttendeeProfile[]} />
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Activity</h2>
            <ActivityFeed entries={activity ?? []} profiles={profiles ?? []} />
          </div>
        </div>
      </div>
    </div>
  );
}
