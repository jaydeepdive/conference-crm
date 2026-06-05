import { requireConferenceAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { KpiCard } from "@/components/KpiCard";
import { STAGES } from "@/lib/constants";
import { canSeePayments } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ConferenceDashboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireConferenceAccess(slug);
  const supabase = await createClient();

  const [{ data: companies }, { data: investors }] = await Promise.all([
    supabase.from("companies").select("stage,confirmed,payment_status,amount_due,amount_paid,owner_id").eq("conference_id", ctx.conference.id),
    supabase.from("investors").select("stage,confirmed,payment_status,amount_due,amount_paid,owner_id").eq("conference_id", ctx.conference.id),
  ]);

  const co = companies ?? [];
  const iv = investors ?? [];
  const count = (rows: typeof co, fn: (r: typeof co[number]) => boolean) => rows.filter(fn).length;
  const sum = (rows: typeof co, key: "amount_due" | "amount_paid") =>
    rows.reduce((a, r) => a + Number(r[key] ?? 0), 0);
  const usd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  const showMoney = canSeePayments(ctx.effectiveRole);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{ctx.conference.name}</h1>
        <p className="text-sm text-gray-500">
          {ctx.conference.date_start ? `${ctx.conference.date_start}` : ""}
          {ctx.conference.date_end && ctx.conference.date_end !== ctx.conference.date_start ? ` → ${ctx.conference.date_end}` : ""}
          {" · "}<span className="capitalize">{ctx.conference.status}</span>
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Companies</h2>
        <div className="grid gap-4 sm:grid-cols-4">
          <KpiCard label="Registered" value={count(co, r => r.stage === "registered")} />
          <KpiCard label="In pipeline" value={count(co, r => r.stage !== "registered" && r.stage !== "declined")} />
          {showMoney && <KpiCard label="Paid" value={count(co, r => r.payment_status === "paid")} />}
          <KpiCard label="Total" value={co.length} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Investors</h2>
        <div className="grid gap-4 sm:grid-cols-4">
          <KpiCard label="Registered" value={count(iv, r => r.stage === "registered")} />
          <KpiCard label="In pipeline" value={count(iv, r => r.stage !== "registered" && r.stage !== "declined")} />
          {showMoney && <KpiCard label="Paid" value={count(iv, r => r.payment_status === "paid")} />}
          <KpiCard label="Total" value={iv.length} />
        </div>
      </section>

      <section className={showMoney ? "grid gap-6 lg:grid-cols-2" : ""}>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Pipeline by stage</h3>
          <table className="mt-3 w-full text-sm">
            <thead><tr className="text-left text-gray-500">
              <th className="py-1">Stage</th><th className="py-1 text-right">Companies</th><th className="py-1 text-right">Investors</th><th className="py-1 text-right">Total</th>
            </tr></thead>
            <tbody>
              {STAGES.map(s => {
                const c = count(co, r => r.stage === s.value);
                const i = count(iv, r => r.stage === s.value);
                return (
                  <tr key={s.value} className="border-t border-gray-100">
                    <td className="py-1.5">{s.label}</td>
                    <td className="py-1.5 text-right tabular-nums">{c}</td>
                    <td className="py-1.5 text-right tabular-nums">{i}</td>
                    <td className="py-1.5 text-right font-semibold tabular-nums">{c + i}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {showMoney && (
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Payments</h3>
            <table className="mt-3 w-full text-sm">
              <thead><tr className="text-left text-gray-500">
                <th className="py-1"></th><th className="py-1 text-right">Companies</th><th className="py-1 text-right">Investors</th><th className="py-1 text-right">Total</th>
              </tr></thead>
              <tbody>
                <tr className="border-t border-gray-100"><td className="py-1.5">Billed</td>
                  <td className="py-1.5 text-right tabular-nums">{usd(sum(co, "amount_due"))}</td>
                  <td className="py-1.5 text-right tabular-nums">{usd(sum(iv, "amount_due"))}</td>
                  <td className="py-1.5 text-right font-semibold tabular-nums">{usd(sum(co, "amount_due") + sum(iv, "amount_due"))}</td>
                </tr>
                <tr className="border-t border-gray-100"><td className="py-1.5">Collected</td>
                  <td className="py-1.5 text-right tabular-nums">{usd(sum(co, "amount_paid"))}</td>
                  <td className="py-1.5 text-right tabular-nums">{usd(sum(iv, "amount_paid"))}</td>
                  <td className="py-1.5 text-right font-semibold tabular-nums">{usd(sum(co, "amount_paid") + sum(iv, "amount_paid"))}</td>
                </tr>
                <tr className="border-t border-gray-100"><td className="py-1.5">Outstanding</td>
                  <td className="py-1.5 text-right tabular-nums">{usd(sum(co, "amount_due") - sum(co, "amount_paid"))}</td>
                  <td className="py-1.5 text-right tabular-nums">{usd(sum(iv, "amount_due") - sum(iv, "amount_paid"))}</td>
                  <td className="py-1.5 text-right font-semibold tabular-nums">{usd((sum(co, "amount_due") + sum(iv, "amount_due")) - (sum(co, "amount_paid") + sum(iv, "amount_paid")))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
