/**
 * /portal/[slug]/invoices — invoices tied to the caller's own lead.
 * Split into unpaid + paid buckets. Each row links to the invoice PDF
 * (existing /api/invoices/[id]/pdf route).
 */
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPortalContext } from "@/lib/portal";
import { PageTitle } from "@/components/SectionHeader";
import type { Invoice } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PortalInvoicesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getPortalContext(slug);
  const supabase = await createClient();

  const { data } = await supabase.from("invoices").select("*")
    .eq("conference_id", ctx.conference.id)
    .eq("lead_type", ctx.attendee.lead_type)
    .eq("lead_id", ctx.attendee.lead_id)
    .order("invoice_number", { ascending: false });
  const invoices = (data ?? []) as Invoice[];

  const unpaid = invoices.filter(i => i.status !== "paid" && i.status !== "void");
  const paid = invoices.filter(i => i.status === "paid");
  const outstanding = unpaid.reduce((a, i) => a + Number(i.total ?? 0), 0);

  const usd = (n: number, cur: string) => `${cur} ${Number(n).toLocaleString()}`;

  return (
    <div className="space-y-8">
      <PageTitle title="Invoices" sub={`Billing history for ${ctx.conference.name}.`} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card label="Total invoices" value={String(invoices.length)} />
        <Card label="Unpaid" value={String(unpaid.length)} accent={unpaid.length > 0} />
        <Card label="Outstanding" value={outstanding > 0 ? `$${outstanding.toLocaleString()}` : "—"} accent={outstanding > 0} />
      </div>

      <InvoiceTable title="Awaiting payment" invoices={unpaid} usd={usd} empty="Nothing outstanding — nice." />
      <InvoiceTable title="Paid" invoices={paid} usd={usd} empty="No paid invoices yet." />
    </div>
  );
}

function Card({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`border p-4 ${accent ? "border-brand-accent bg-brand-accent/5" : "border-line bg-white"}`}>
      <div className="text-[10px] font-medium uppercase tracking-widest2 text-muted">{label}</div>
      <div className="mt-2 font-display text-2xl font-bold text-ink tabular-nums">{value}</div>
    </div>
  );
}

function InvoiceTable({
  title, invoices, usd, empty,
}: { title: string; invoices: Invoice[]; usd: (n: number, c: string) => string; empty: string }) {
  return (
    <section>
      <h2 className="font-display text-xl font-bold text-ink">{title}</h2>
      {invoices.length === 0 ? (
        <div className="mt-3 border border-line bg-white p-6 text-center text-sm text-muted">{empty}</div>
      ) : (
        <div className="mt-3 border border-line bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-[10px] uppercase tracking-widest2 text-muted">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Issued</th>
                <th className="px-4 py-3">Due</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">PDF</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(i => (
                <tr key={i.id} className="border-t border-line">
                  <td className="px-4 py-3 font-medium">#{i.invoice_number}</td>
                  <td className="px-4 py-3 text-xs">{i.issued_date ?? "—"}</td>
                  <td className="px-4 py-3 text-xs">{i.due_date ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{usd(i.total, i.currency)}</td>
                  <td className="px-4 py-3 text-[10px] uppercase tracking-widest2 text-muted">{i.status}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/api/invoices/${i.id}/pdf`} target="_blank"
                      className="text-[11px] text-brand-accent hover:underline">Open</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
