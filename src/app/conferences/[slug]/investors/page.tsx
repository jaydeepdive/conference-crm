import Link from "next/link";
import { requireConferenceAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LeadTable } from "@/components/LeadTable";
import { canSeePayments, canEditLeads } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function InvestorsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireConferenceAccess(slug);
  const supabase = await createClient();

  const [{ data: investors }, { data: profiles }] = await Promise.all([
    supabase.from("investors").select("*").eq("conference_id", ctx.conference.id).order("updated_at", { ascending: false }),
    supabase.from("profiles").select("*"),
  ]);

  const rows = (investors ?? []).map(i => ({
    id: i.id, name: i.firm_name, industry_or_type: i.investor_type,
    contact_name: i.contact_name, email: i.email, owner_id: i.owner_id,
    stage: i.stage, confirmed: i.confirmed, payment_status: i.payment_status,
    amount_due: Number(i.amount_due), amount_paid: Number(i.amount_paid),
    next_action_date: i.next_action_date, next_action: i.next_action,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Investors</h1>
          <p className="text-sm text-gray-500">{rows.length} leads</p>
        </div>
        {canEditLeads(ctx.effectiveRole) && (
          <Link href={`/conferences/${slug}/investors/new`} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90">+ New investor</Link>
        )}
      </div>
      <LeadTable rows={rows} profiles={profiles ?? []} basePath={`/conferences/${slug}/investors`} showPayments={canSeePayments(ctx.effectiveRole)} />
    </div>
  );
}
