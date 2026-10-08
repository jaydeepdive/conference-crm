import { redirect } from "next/navigation";
import { requireConferenceAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { findDuplicates, type DupLead } from "@/lib/duplicates";
import { DuplicatesClient } from "./DuplicatesClient";

export const dynamic = "force-dynamic";

/**
 * Super-admin-only page to scan for and resolve duplicate leads within a
 * conference. Runs the (heuristic) detection at request time on the server,
 * hands the pair list to a client component for review + merge.
 */
export default async function DuplicatesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireConferenceAccess(slug);
  if (ctx.effectiveRole !== "super_admin") redirect(`/conferences/${slug}`);

  const supabase = await createClient();
  const [{ data: companies }, { data: investors }] = await Promise.all([
    supabase.from("companies")
      .select("id,name,contact_name,email,phone,created_at")
      .eq("conference_id", ctx.conference.id),
    supabase.from("investors")
      .select("id,firm_name,contact_name,email,phone,created_at")
      .eq("conference_id", ctx.conference.id),
  ]);

  const companyLeads: DupLead[] = (companies ?? []).map(c => ({
    id: c.id, name: c.name, contact_name: c.contact_name,
    email: c.email, phone: c.phone, created_at: c.created_at,
  }));
  const investorLeads: DupLead[] = (investors ?? []).map(i => ({
    id: i.id, name: i.firm_name, contact_name: i.contact_name,
    email: i.email, phone: i.phone, created_at: i.created_at,
  }));

  const companyPairs = findDuplicates(companyLeads);
  const investorPairs = findDuplicates(investorLeads);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[32px] font-bold leading-none text-ink">Duplicates</h1>
        <p className="mt-2 text-sm text-muted">
          {companyPairs.length + investorPairs.length} suspected pair{companyPairs.length + investorPairs.length === 1 ? "" : "s"} across
          {" "}{companyLeads.length} companies and {investorLeads.length} investors.
          Merging combines all invoices, notes, comps, activity, attendees, and meetings from the loser into the winner, then deletes the loser row.
        </p>
      </div>

      <DuplicatesClient
        slug={slug}
        companyPairs={companyPairs}
        investorPairs={investorPairs}
      />
    </div>
  );
}
