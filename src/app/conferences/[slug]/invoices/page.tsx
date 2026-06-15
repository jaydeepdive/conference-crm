import Link from "next/link";
import { requireConferenceRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function InvoicesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireConferenceRole(slug, ["super_admin","conference_admin","finance"]);
  const supabase = await createClient();
  const { data: invoices } = await supabase.from("invoices")
    .select("*").eq("conference_id", ctx.conference.id).order("created_at", { ascending: false });

  const usd = (n: number, cur: string) => `${cur} ${Number(n).toLocaleString()}`;
  const statusColor: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700",
    sent: "bg-amber-100 text-amber-800",
    viewed: "bg-sky-100 text-sky-800",
    paid: "bg-emerald-100 text-emerald-800",
    overdue: "bg-rose-100 text-rose-800",
    void: "bg-gray-200 text-gray-500",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold text-ink">Invoices</h1>
          <p className="text-sm text-ink/60">{(invoices ?? []).length} total</p>
        </div>
        <Link href={`/conferences/${slug}/invoices/new`}
          className="bg-ink px-4 py-2 text-sm font-medium uppercase tracking-widest2 text-cream hover:bg-brand-accent">
          + New invoice
        </Link>
      </div>

      <div className="overflow-x-auto border border-ink/20 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-cream text-left text-xs uppercase tracking-widest2 text-ink/60">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Recipient</th>
              <th className="px-3 py-2">Issued</th>
              <th className="px-3 py-2">Due</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {(invoices ?? []).map(i => (
              <tr key={i.id} className="border-t border-ink/10 hover:bg-cream/50">
                <td className="px-3 py-2 font-medium">
                  <Link href={`/conferences/${slug}/invoices/${i.id}`} className="hover:underline">#{i.invoice_number}</Link>
                </td>
                <td className="px-3 py-2">
                  <div>{i.recipient_name ?? "—"}</div>
                  <div className="text-xs text-ink/50">{i.recipient_email}</div>
                </td>
                <td className="px-3 py-2 text-xs">{i.issued_date ?? "—"}</td>
                <td className="px-3 py-2 text-xs">{i.due_date ?? "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{usd(i.total, i.currency)}</td>
                <td className="px-3 py-2">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[i.status] ?? statusColor.draft}`}>
                    {i.status}
                  </span>
                </td>
              </tr>
            ))}
            {(invoices ?? []).length === 0 && (
              <tr><td colSpan={6} className="px-3 py-12 text-center text-sm text-ink/50">No invoices yet. Click &ldquo;New invoice&rdquo; to draft one.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
