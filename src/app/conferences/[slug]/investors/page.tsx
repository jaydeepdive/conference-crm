import Link from "next/link";
import { requireConferenceAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LeadTable } from "@/components/LeadTable";
import { AutoTddSync } from "@/components/AutoTddSync";
import { canSeePayments, canEditLeads } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function InvestorsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireConferenceAccess(slug);
  const supabase = await createClient();

  const staleCutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const [{ data: investors }, { data: profiles }, { count: needsSyncCount }] = await Promise.all([
    supabase.from("investors").select("*").eq("conference_id", ctx.conference.id).order("updated_at", { ascending: false }),
    supabase.from("profiles").select("*"),
    supabase.from("investors").select("*", { count: "exact", head: true })
      .eq("conference_id", ctx.conference.id)
      .or(`tdd_last_checked_at.is.null,and(is_tdd_client.eq.false,tdd_last_checked_at.lt.${staleCutoff})`),
  ]);

  const rows = (investors ?? []).map(i => ({
    id: i.id, name: i.firm_name, industry_or_type: i.investor_type,
    contact_name: i.contact_name, email: i.email, owner_id: i.owner_id,
    stage: i.stage, confirmed: i.confirmed, payment_status: i.payment_status,
    amount_due: Number(i.amount_due), amount_paid: Number(i.amount_paid),
    next_action_date: i.next_action_date, next_action: i.next_action,
    is_tdd_client: i.is_tdd_client,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-[32px] font-bold leading-none text-ink">Investors</h1>
          <p className="mt-2 text-sm text-muted">{rows.length} leads</p>
          <div className="mt-2"><AutoTddSync conferenceId={ctx.conference.id} uncheckedCount={needsSyncCount ?? 0} /></div>
        </div>
        {canEditLeads(ctx.effectiveRole) && (
          <Link href={`/conferences/${slug}/investors/new`}
            style={{ backgroundColor: "#C8102E", color: "#FFFFFF" }}
            className="px-4 py-2 text-xs font-semibold uppercase tracking-widest2 hover:opacity-90">+ New investor</Link>
        )}
      </div>
      <LeadTable rows={rows} profiles={profiles ?? []} basePath={`/conferences/${slug}/investors`} showPayments={canSeePayments(ctx.effectiveRole)} />
    </div>
  );
}
