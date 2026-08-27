import Link from "next/link";
import { requireConferenceAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LeadTable } from "@/components/LeadTable";
import { AutoTddSync } from "@/components/AutoTddSync";
import { canSeePayments, canEditLeads } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CompaniesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireConferenceAccess(slug);
  const supabase = await createClient();

  const staleCutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const [{ data: companies }, { data: profiles }, { count: needsSyncCount }] = await Promise.all([
    supabase.from("companies").select("*").eq("conference_id", ctx.conference.id).order("updated_at", { ascending: false }),
    supabase.from("profiles").select("*"),
    supabase.from("companies").select("*", { count: "exact", head: true })
      .eq("conference_id", ctx.conference.id)
      .or(`tdd_last_checked_at.is.null,and(is_tdd_client.eq.false,tdd_last_checked_at.lt.${staleCutoff})`),
  ]);

  const rows = (companies ?? []).map(c => ({
    id: c.id, name: c.name, industry_or_type: c.industry,
    contact_name: c.contact_name, email: c.email, owner_id: c.owner_id,
    stage: c.stage, confirmed: c.confirmed, payment_status: c.payment_status,
    amount_due: Number(c.amount_due), amount_paid: Number(c.amount_paid),
    next_action_date: c.next_action_date, next_action: c.next_action,
    is_tdd_client: c.is_tdd_client,
    agreement_status: c.agreement_status ?? "not_sent",
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-[32px] font-bold leading-none text-ink">Companies</h1>
          <p className="mt-2 text-sm text-muted">{rows.length} leads</p>
          <div className="mt-2"><AutoTddSync conferenceId={ctx.conference.id} uncheckedCount={needsSyncCount ?? 0} /></div>
        </div>
        {canEditLeads(ctx.effectiveRole) && (
          <Link href={`/conferences/${slug}/companies/new`}
            style={{ backgroundColor: "#C8102E", color: "#FFFFFF" }}
            className="px-4 py-2 text-xs font-semibold uppercase tracking-widest2 hover:opacity-90">+ New company</Link>
        )}
      </div>
      <LeadTable rows={rows} profiles={profiles ?? []}
        basePath={`/conferences/${slug}/companies`}
        showPayments={canSeePayments(ctx.effectiveRole)}
        showAgreement />
    </div>
  );
}
