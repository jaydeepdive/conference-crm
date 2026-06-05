import { requireConferenceRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BudgetClient } from "./BudgetClient";
import { KpiCard } from "@/components/KpiCard";
import { calculateFee, feeTermsLabel, type LeadCounts } from "@/lib/fees";

export const dynamic = "force-dynamic";

export default async function BudgetPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireConferenceRole(slug, ["super_admin","conference_admin","finance"]);
  const supabase = await createClient();

  const [{ data: companies }, { data: investors }, { data: expenses }, { data: comps }, { data: ce }, { data: entities }] = await Promise.all([
    supabase.from("companies").select("stage,payment_status,amount_due,amount_paid").eq("conference_id", ctx.conference.id),
    supabase.from("investors").select("stage,payment_status,amount_due,amount_paid").eq("conference_id", ctx.conference.id),
    supabase.from("expenses").select("*").eq("conference_id", ctx.conference.id).order("date", { ascending: false }),
    supabase.from("lead_comps").select("*").eq("conference_id", ctx.conference.id),
    supabase.from("conference_entities").select("*").eq("conference_id", ctx.conference.id),
    supabase.from("entities").select("*"),
  ]);

  const co = companies ?? [];
  const iv = investors ?? [];
  const ex = expenses ?? [];
  const cp = comps ?? [];

  const counts: LeadCounts = {
    signedUpCompanies: co.filter(c => c.stage !== "declined").length,
    signedUpInvestors: iv.filter(c => c.stage !== "declined").length,
    registeredCompanies: co.filter(c => c.stage === "registered").length,
    registeredInvestors: iv.filter(c => c.stage === "registered").length,
    paidCompanies: co.filter(c => c.payment_status === "paid").length,
    paidInvestors: iv.filter(c => c.payment_status === "paid").length,
  };

  const sumDue = [...co, ...iv].reduce((a, r) => a + Number(r.amount_due ?? 0), 0);
  const sumPaid = [...co, ...iv].reduce((a, r) => a + Number(r.amount_paid ?? 0), 0);
  const sumExpenses = ex.reduce((a, r) => a + Number(r.amount ?? 0), 0);
  const sumComps = cp.reduce((a, r) => a + Number(r.cost ?? 0), 0);

  // Management fees by entity
  const feeRows = (ce ?? []).map(link => {
    const ent = (entities ?? []).find(e => e.id === link.entity_id);
    const fee = calculateFee(link, counts);
    return { entity_name: ent?.name ?? "Unknown", link, fee };
  });
  const sumFees = feeRows.reduce((a, r) => a + r.fee, 0);

  const totalDeductions = sumExpenses + sumComps + sumFees;
  const net = sumPaid - totalDeductions;

  // Final entity shares: split % of net + their fee
  const finalShares = feeRows.map(r => ({
    entity_name: r.entity_name,
    split_percentage: Number(r.link.split_percentage),
    split_share: (Number(r.link.split_percentage) / 100) * net,
    fee: r.fee,
    total: (Number(r.link.split_percentage) / 100) * net + r.fee,
    fee_label: r.link.fee_label,
    fee_terms: feeTermsLabel(r.link),
  }));

  const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
  const showSplit = ctx.effectiveRole === "super_admin" && (ce ?? []).length > 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Budget</h1>
        <p className="text-sm text-gray-500">Revenue, expenses, comps, fees, and net split.</p>
      </div>

      <section className="grid gap-4 sm:grid-cols-4">
        <KpiCard label="Revenue (collected)" value={usd(sumPaid)} sublabel={`Outstanding: ${usd(sumDue - sumPaid)}`} accent="text-emerald-700" />
        <KpiCard label="Expenses + Comps" value={usd(sumExpenses + sumComps)} sublabel={`Exp ${usd(sumExpenses)} · Comps ${usd(sumComps)}`} accent="text-rose-700" />
        <KpiCard label="Management fees" value={usd(sumFees)} sublabel={`${feeRows.filter(r => r.fee > 0).length} entities earning`} accent="text-amber-700" />
        <KpiCard label="Net" value={usd(net)} accent={net >= 0 ? "text-emerald-700" : "text-rose-700"} />
      </section>

      {showSplit && feeRows.length > 0 && (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">JV split + management fees</h3>
          <table className="mt-3 w-full text-sm">
            <thead><tr className="text-left text-gray-500">
              <th className="py-1">Entity</th>
              <th className="py-1">Fee terms</th>
              <th className="py-1 text-right">Fee earned</th>
              <th className="py-1 text-right">Split %</th>
              <th className="py-1 text-right">Share of net</th>
              <th className="py-1 text-right">Total to entity</th>
            </tr></thead>
            <tbody>
              {finalShares.map((s, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="py-1.5 font-medium">{s.entity_name}</td>
                  <td className="py-1.5 text-xs text-gray-600">
                    {s.fee_terms}
                    {s.fee_label && <div className="text-gray-400">{s.fee_label}</div>}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{usd(s.fee)}</td>
                  <td className="py-1.5 text-right tabular-nums">{s.split_percentage.toFixed(1)}%</td>
                  <td className="py-1.5 text-right tabular-nums">{usd(s.split_share)}</td>
                  <td className="py-1.5 text-right tabular-nums font-semibold">{usd(s.total)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-gray-300 bg-gray-50">
                <td className="py-1.5 font-medium" colSpan={2}>Totals</td>
                <td className="py-1.5 text-right tabular-nums font-semibold">{usd(sumFees)}</td>
                <td className="py-1.5 text-right tabular-nums">{finalShares.reduce((a, s) => a + s.split_percentage, 0).toFixed(1)}%</td>
                <td className="py-1.5 text-right tabular-nums">{usd(finalShares.reduce((a, s) => a + s.split_share, 0))}</td>
                <td className="py-1.5 text-right tabular-nums font-semibold">{usd(finalShares.reduce((a, s) => a + s.total, 0))}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-xs text-gray-500">Management fees are deducted from revenue before computing the split. Configure terms under Admin → Conferences.</p>
        </section>
      )}

      {sumComps > 0 && (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Comps summary</h3>
          <p className="mt-1 text-xs text-gray-500">Comps assigned to leads, rolled up by expense category. These flow into the Net calculation above.</p>
          <table className="mt-3 w-full text-sm">
            <tbody>
              {Array.from(new Set(cp.map(c => c.expense_category))).sort().map(cat => {
                const items = cp.filter(c => c.expense_category === cat);
                const total = items.reduce((a, c) => a + Number(c.cost), 0);
                return (
                  <tr key={cat} className="border-t border-gray-100">
                    <td className="py-1.5">{cat}</td>
                    <td className="py-1.5 text-right text-xs text-gray-500">{items.length} item{items.length > 1 ? "s" : ""}</td>
                    <td className="py-1.5 text-right tabular-nums">{usd(total)}</td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-gray-300 font-semibold">
                <td className="py-1.5" colSpan={2}>Total comps</td>
                <td className="py-1.5 text-right tabular-nums">{usd(sumComps)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      <BudgetClient conferenceId={ctx.conference.id} expenses={ex} />
    </div>
  );
}
