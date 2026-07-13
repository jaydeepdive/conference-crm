import Link from "next/link";
import { notFound } from "next/navigation";
import { requireConferenceRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { InvoiceSender } from "./InvoiceSender";
import { InvoiceActions } from "./InvoiceActions";

export const dynamic = "force-dynamic";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const ctx = await requireConferenceRole(slug, ["super_admin","conference_admin","finance"]);
  const supabase = await createClient();

  const { data: invoice } = await supabase.from("invoices").select("*").eq("id", id).single();
  if (!invoice) notFound();

  const { data: templates } = await supabase.from("email_templates")
    .select("*").eq("conference_id", ctx.conference.id).in("kind", ["invoice","reminder"]);

  const lead = invoice.lead_type === "company"
    ? (await supabase.from("companies").select("id,name,contact_name,email").eq("id", invoice.lead_id).single()).data
    : (await supabase.from("investors").select("id,firm_name,contact_name,email").eq("id", invoice.lead_id).single()).data;

  const orgName = invoice.lead_type === "company"
    ? (lead as { name?: string } | null)?.name ?? "—"
    : (lead as { firm_name?: string } | null)?.firm_name ?? "—";

  const { data: sentEmails } = await supabase.from("sent_emails")
    .select("*").eq("invoice_id", id).order("sent_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <Link href={`/conferences/${slug}/invoices`} className="text-xs uppercase tracking-widest2 text-ink/60 hover:text-ink">← Invoices</Link>
          <h1 className="mt-1 font-serif text-2xl font-bold text-ink">Invoice #{invoice.invoice_number}</h1>
          <p className="text-sm text-ink/60">
            {orgName} · {invoice.currency} {Number(invoice.total).toFixed(2)} · {invoice.status}
            {Number(invoice.discount_amount) > 0 && (
              <span className="ml-2 text-brand-accent">
                ({invoice.discount_label}: −{invoice.currency} {Number(invoice.discount_amount).toFixed(2)})
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href={`/api/invoices/${id}/pdf`} target="_blank" rel="noopener"
            className="border border-ink/20 px-3 py-2 text-xs uppercase tracking-widest2 hover:bg-cream">
            View PDF
          </a>
          <InvoiceActions
            slug={slug}
            invoiceId={invoice.id}
            invoiceNumber={invoice.invoice_number}
            status={invoice.status}
          />
        </div>
      </div>

      {/* Salutation rules:
       *   - Companies: use the contact person's name.
       *   - Investors: use the investor (firm) name.
       * Falls back to any explicit recipient_name saved on the invoice, then null. */}
      <InvoiceSender slug={slug} invoice={invoice}
        conferenceName={ctx.conference.name}
        publicName={ctx.conference.invoice_issuer_name ?? ""}
        recipient={{
          name: invoice.lead_type === "company"
            ? ((lead as { contact_name?: string } | null)?.contact_name ?? invoice.recipient_name ?? null)
            : ((lead as { firm_name?: string } | null)?.firm_name ?? invoice.recipient_name ?? null),
          email: invoice.recipient_email ?? (lead as { email?: string } | null)?.email ?? null,
          organization: orgName,
        }}
        templates={templates ?? []}
        senderProfile={{ name: ctx.profile.full_name, email: ctx.profile.email }}
      />

      <section className="border border-ink/20 bg-white p-5">
        <h3 className="text-xs font-semibold uppercase tracking-widest2 text-ink/60">Send history</h3>
        {(sentEmails ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-ink/60">Not sent yet.</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm">
            {(sentEmails ?? []).map(e => (
              <li key={e.id} className="rounded border border-ink/10 p-2">
                <div className="flex justify-between">
                  <span className="font-medium">{e.subject}</span>
                  <span className="text-xs text-ink/60">{new Date(e.sent_at).toLocaleString()}</span>
                </div>
                <div className="text-xs text-ink/60">To: {e.recipients.map((r: { email: string }) => r.email).join(", ")}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
