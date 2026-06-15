import { requireConferenceAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { STAGES } from "@/lib/constants";
import { canSeePayments } from "@/lib/types";
import { PageTitle, SectionHeader } from "@/components/SectionHeader";

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

  const dateLabel = ctx.conference.date_start
    ? `${ctx.conference.date_start}${ctx.conference.date_end && ctx.conference.date_end !== ctx.conference.date_start ? ` — ${ctx.conference.date_end}` : ""}`
    : "";

  return (
    <div className="space-y-10">
      <PageTitle title={ctx.conference.name} sub={`${dateLabel}${dateLabel ? " · " : ""}${ctx.conference.status}`} />

      <div className="grid gap-10 lg:grid-cols-2">
        <section>
          <SectionHeader title="Companies" meta={`${co.length} TOTAL`} />
          <div className={`mt-6 grid gap-4 ${showMoney ? "grid-cols-3" : "grid-cols-2"}`}>
            <Kpi label="Registered" value={count(co, r => r.stage === "registered")} />
            <Kpi label="In pipeline" value={count(co, r => r.stage !== "registered" && r.stage !== "declined")} />
            {showMoney && <Kpi label="Paid" value={count(co, r => r.payment_status === "paid")} />}
          </div>
        </section>

        <section>
          <SectionHeader title="Investors" meta={`${iv.length} TOTAL`} />
          <div className={`mt-6 grid gap-4 ${showMoney ? "grid-cols-3" : "grid-cols-2"}`}>
            <Kpi label="Registered" value={count(iv, r => r.stage === "registered")} />
            <Kpi label="In pipeline" value={count(iv, r => r.stage !== "registered" && r.stage !== "declined")} />
            {showMoney && <Kpi label="Paid" value={count(iv, r => r.payment_status === "paid")} />}
          </div>
        </section>
      </div>

      <section>
        <SectionHeader title="Pipeline by stage" meta="ACROSS BOTH" />
        <div className="mt-4 border border-line bg-white">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-[10px] uppercase tracking-widest2 text-muted">
              <th className="px-4 py-2">Stage</th>
              <th className="px-4 py-2 text-right">Companies</th>
              <th className="px-4 py-2 text-right">Investors</th>
              <th className="px-4 py-2 text-right">Total</th>
            </tr></thead>
            <tbody>
              {STAGES.map(s => {
                const c = count(co, r => r.stage === s.value);
                const i = count(iv, r => r.stage === s.value);
                return (
                  <tr key={s.value} className="border-t border-line">
                    <td className="px-4 py-2">{s.label}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{c}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{i}</td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums">{c + i}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {showMoney && (
        <section>
          <SectionHeader title="Payments" meta="ALL LEADS" />
          <div className="mt-4 border border-line bg-white">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-line text-left text-[10px] uppercase tracking-widest2 text-muted">
                <th className="px-4 py-2"></th>
                <th className="px-4 py-2 text-right">Companies</th>
                <th className="px-4 py-2 text-right">Investors</th>
                <th className="px-4 py-2 text-right">Total</th>
              </tr></thead>
              <tbody>
                <tr className="border-t border-line"><td className="px-4 py-2">Billed</td>
                  <td className="px-4 py-2 text-right tabular-nums">{usd(sum(co, "amount_due"))}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{usd(sum(iv, "amount_due"))}</td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">{usd(sum(co, "amount_due") + sum(iv, "amount_due"))}</td>
                </tr>
                <tr className="border-t border-line"><td className="px-4 py-2">Collected</td>
                  <td className="px-4 py-2 text-right tabular-nums">{usd(sum(co, "amount_paid"))}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{usd(sum(iv, "amount_paid"))}</td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">{usd(sum(co, "amount_paid") + sum(iv, "amount_paid"))}</td>
                </tr>
                <tr className="border-t border-line"><td className="px-4 py-2">Outstanding</td>
                  <td className="px-4 py-2 text-right tabular-nums">{usd(sum(co, "amount_due") - sum(co, "amount_paid"))}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{usd(sum(iv, "amount_due") - sum(iv, "amount_paid"))}</td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">{usd((sum(co, "amount_due") + sum(iv, "amount_due")) - (sum(co, "amount_paid") + sum(iv, "amount_paid")))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-line bg-white p-4">
      <div className="text-[10px] font-medium uppercase tracking-widest2 text-muted">{label}</div>
      <div className="mt-2 font-display text-[34px] font-bold leading-none text-ink tabular-nums">{value}</div>
    </div>
  );
}
