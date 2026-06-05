import Link from "next/link";
import { notFound } from "next/navigation";
import { requireConferenceAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LeadEditor } from "@/components/LeadEditor";
import { ActivityFeed } from "@/components/ActivityFeed";
import { LeadNotes } from "@/components/LeadNotes";
import { LeadComps } from "@/components/LeadComps";
import { canEditLeads } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function InvestorDetailPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const ctx = await requireConferenceAccess(slug);
  const supabase = await createClient();

  const [{ data: inv }, { data: profiles }, { data: activity }, { data: notes }, { data: comps }, { data: compTypes }] = await Promise.all([
    supabase.from("investors").select("*").eq("id", id).eq("conference_id", ctx.conference.id).single(),
    supabase.from("profiles").select("*"),
    supabase.from("activity_log").select("*").eq("lead_type","investor").eq("lead_id", id).order("created_at",{ascending:false}),
    supabase.from("lead_notes").select("*").eq("lead_type","investor").eq("lead_id", id).order("created_at",{ascending:false}),
    supabase.from("lead_comps").select("*").eq("lead_type","investor").eq("lead_id", id).order("created_at",{ascending:false}),
    supabase.from("comp_types").select("*").eq("conference_id", ctx.conference.id).order("name"),
  ]);

  if (!inv) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/conferences/${slug}/investors`} className="text-sm text-gray-500 hover:text-gray-700">← Investors</Link>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">{inv.firm_name}</h1>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <LeadEditor kind="investor" conferenceSlug={slug} conferenceId={ctx.conference.id}
            role={ctx.effectiveRole} profiles={profiles ?? []} currentUserId={ctx.profile.id}
            initial={{
              id: inv.id, name: inv.firm_name, category: inv.investor_type,
              contact_name: inv.contact_name, contact_title: inv.contact_title,
              email: inv.email, phone: inv.phone, owner_id: inv.owner_id,
              stage: inv.stage, confirmed: inv.confirmed,
              payment_status: inv.payment_status,
              amount_due: Number(inv.amount_due), amount_paid: Number(inv.amount_paid),
              last_contact: inv.last_contact, next_action: inv.next_action,
              next_action_date: inv.next_action_date,
              source: inv.source, notes: inv.notes,
              check_size: inv.check_size, sector_focus: inv.sector_focus,
            }}
          />
          <LeadNotes notes={notes ?? []} profiles={profiles ?? []}
            leadType="investor" leadId={id} conferenceId={ctx.conference.id} currentUserId={ctx.profile.id} />
        </div>
        <div className="space-y-4">
          <LeadComps comps={comps ?? []} compTypes={compTypes ?? []}
            leadType="investor" leadId={id} conferenceId={ctx.conference.id}
            currentUserId={ctx.profile.id} canEdit={canEditLeads(ctx.effectiveRole)} />
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Activity</h2>
            <ActivityFeed entries={activity ?? []} profiles={profiles ?? []} />
          </div>
        </div>
      </div>
    </div>
  );
}
