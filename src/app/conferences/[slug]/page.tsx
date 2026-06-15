import Link from "next/link";
import { requireConferenceAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { STAGES } from "@/lib/constants";
import { canSeePayments } from "@/lib/types";
import { PageTitle, SectionHeader } from "@/components/SectionHeader";
import { getConferenceTasks, type HubTask } from "@/lib/hub";

export const dynamic = "force-dynamic";

export default async function ConferenceDashboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireConferenceAccess(slug);
  const supabase = await createClient();

  // Hub tasks: fetch on the server, fall back gracefully if Hub is unreachable.
  let openTasks: HubTask[] = [];
  let hubError: string | null = null;
  let hasProject = false;
  try {
    const data = await getConferenceTasks(slug, false);
    hasProject = !!data.project;
    openTasks = (data.tasks ?? []).filter(t => t.status !== "done");
  } catch (e) {
    hubError = e instanceof Error ? e.message : "Hub unreachable";
  }

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

  // Sort tasks: high priority first, then by due date
  const prioRank = (p?: string | null) => p === "high" ? 0 : p === "medium" ? 1 : 2;
  const sortedTasks = [...openTasks].sort((a, b) => {
    const pr = prioRank(a.priority) - prioRank(b.priority);
    if (pr !== 0) return pr;
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
    if (a.due_date) return -1;
    if (b.due_date) return 1;
    return 0;
  });
  const topTasks = sortedTasks.slice(0, 6);

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

      {/* Pipeline (left) + Needs attention (right) */}
      <div className="grid gap-10 lg:grid-cols-2">
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

        <section>
          <div className="section-rule flex items-end justify-between">
            <h2 className="font-display text-[26px] font-bold leading-none text-ink">Needs attention</h2>
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-medium uppercase tracking-widest2 text-muted">
                {openTasks.length} OPEN
              </span>
              <Link href={`/conferences/${slug}/tasks`}
                className="border border-line bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-widest2 hover:border-ink"
                style={{ color: "#0E0E0E" }}>
                Show all
              </Link>
            </div>
          </div>

          <div className="mt-4">
            {hubError && (
              <div className="border border-line bg-white p-4 text-sm text-muted">
                Hub unreachable — task list temporarily unavailable.
              </div>
            )}
            {!hubError && !hasProject && (
              <div className="border border-line bg-white p-4 text-sm text-muted">
                No Hub project linked for this conference yet. Link one in the Project Hub using slug <code>{slug}</code>.
              </div>
            )}
            {!hubError && hasProject && topTasks.length === 0 && (
              <div className="border border-line bg-white p-6 text-center text-sm text-muted">
                Nothing on the list. Nice.
              </div>
            )}
            {!hubError && hasProject && topTasks.length > 0 && (
              <ul className="border border-line bg-white">
                {topTasks.map(t => (
                  <li key={t.id} className="flex items-start gap-3 border-t border-line px-4 py-3 first:border-t-0">
                    <span className="mt-1.5 inline-block h-2 w-2 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: t.priority === "high" ? "#C8102E" : t.priority === "low" ? "#A0A0A0" : "#0E0E0E" }}></span>
                    <div className="flex-1">
                      <Link href={`/conferences/${slug}/tasks`} className="block text-sm font-medium text-ink hover:underline">
                        {t.title}
                      </Link>
                      <div className="mt-1 flex flex-wrap gap-2 text-[10px] uppercase tracking-widest2 text-muted">
                        {t.priority && <span>{t.priority}</span>}
                        {t.due_date && <span>· Due {t.due_date}</span>}
                        {t.source && <span>· {t.source}</span>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

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
