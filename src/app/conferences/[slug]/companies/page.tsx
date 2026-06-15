import Link from "next/link";
import { requireConferenceAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LeadTable } from "@/components/LeadTable";
import { canSeePayments, canEditLeads } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CompaniesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireConferenceAccess(slug);
  const supabase = await createClient();

  const [{ data: companies }, { data: profiles }] = await Promise.all([
    supabase.from("companies").select("*").eq("conference_id", ctx.conference.id).order("updated_at", { ascending: false }),
    supabase.from("profiles").select("*"),
  ]);

  const rows = (companies ?? []).map(c => ({
    id: c.id, name: c.name, industry_or_type: c.industry,
    contact_name: c.contact_name, email: c.email, owner_id: c.owner_id,
    stage: c.stage, confirmed: c.confirmed, payment_status: c.payment_status,
    amount_due: Number(c.amount_due), amount_paid: Number(c.amount_paid),
    next_action_date: c.next_action_date, next_action: c.next_action,
    is_tdd_client: c.is_tdd_client, tdd_ticker: c.tdd_company_data?.ticker ?? null,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Companies</h1>
          <p className="text-sm text-gray-500">{rows.length} leads</p>
        </div>
        {canEditLeads(ctx.effectiveRole) && (
          <Link href={`/conferences/${slug}/companies/new`} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90">+ New company</Link>
        )}
      </div>
      <LeadTable rows={rows} profiles={profiles ?? []} basePath={`/conferences/${slug}/companies`} showPayments={canSeePayments(ctx.effectiveRole)} />
    </div>
  );
}
