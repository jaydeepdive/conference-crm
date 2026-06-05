import { requireConferenceRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BudgetClient } from "./BudgetClient";
import { KpiCard } from "@/components/KpiCard";

export const dynamic = "force-dynamic";

export default async function BudgetPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireConferenceRole(slug, ["super_admin","conference_admin","finance"]);
  const supabase = await createClient();

  const [{ data: companies }, { data: investors }, { data: expenses }, { data: ce }, { data: entities }] = await Promise.all([
    supabase.from("companies").select("amount_due,amount_paid").eq("conference_id", ctx.conference.id),
    supabase.from("investors").select("amount_due,amount_paid").eq("conference_id", ctx.conference.id),
    supabase.from("expenses").select("*").eq("conference_id", ctx.conference.id).order("date", { ascending: false }),
    supabase.from("conference_entities").select("*").eq("conference_id", ctx.conference.id),
    supabase.from("entities").select("*"),
  ]);

  const sumDue = [...(companies ?? []), ...(investors ?? [])].reduce((a, r) => a + Number(r.amount_due ?? 0), 0);
  const sumPaid = [...(companies ?? []), ...(investors ?? [])].reduce((a, r) => a + Number(r.amount_paid ?? 0), 0);
  const sumExpenses = (expenses ?? []).reduce((a, r) => a + Number(r.amount ?? 0), 0);
  const net = sumPaid - sumExpenses;

  const usd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

  // JV split (only super_admin sees this)
  const showSplit = ctx.effectiveRole === "super_admin" && (ce ?? []).length > 0;
  const splits = (ce ?? []).map(link => {
    const ent = (entities ?? []).find(e => e.id === link.entity_id);
    return {
      entity_name: ent?.name ?? "Unknown",
      split_percentage: Number(link.split_percentage),
      share: (Number(link.split_percentage) / 100) * net,
    };
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Budget</h1>
        <p className="text-sm text-gray-500">Revenue from CRM payments, expenses you log, and net result.</p>
      </div>

      <section className="grid gap-4 sm:grid-cols-4">
        <KpiCard label="Revenue (collected)" value={usd(sumPaid)} sublabel={`Outstanding: ${usd(sumDue - sumPaid)}`} accent="text-emerald-700" />
        <KpiCard label="Expenses" value={usd(sumExpenses)} sublabel={`${(expenses ?? []).length} line items`} accent="text-rose-700" />
        <KpiCard label="Net" value={usd(net)} accent={net >= 0 ? "text-emerald-700" : "text-rose-700"} />
        <KpiCard label="Billed total" value={usd(sumDue)} />
      </section>

      {showSplit && (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">JV revenue split</h3>
          <table className="mt-3 w-full text-sm">
            <thead><tr className="text-left text-gray-500">
              <th className="py-1">Entity</th>
              <th className="py-1 text-right">Split %</th>
              <th className="py-1 text-right">Share of net</th>
            </tr></thead>
            <tbody>
              {splits.map((s, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="py-1.5">{s.entity_name}</td>
                  <td className="py-1.5 text-right tabular-nums">{s.split_percentage.toFixed(1)}%</td>
                  <td className="py-1.5 text-right tabular-nums font-semibold">{usd(s.share)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-gray-500">Configure entities + splits in the Admin panel → Conferences.</p>
        </section>
      )}

      <BudgetClient conferenceId={ctx.conference.id} expenses={expenses ?? []} />
    </div>
  );
}
