import Link from "next/link";
import { notFound } from "next/navigation";
import { requireConferenceRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { InvoiceBuilder } from "../../new/InvoiceBuilder";

export const dynamic = "force-dynamic";

export default async function EditInvoicePage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const ctx = await requireConferenceRole(slug, ["super_admin","conference_admin","finance"]);
  const supabase = await createClient();

  const { data: invoice } = await supabase.from("invoices").select("*").eq("id", id).single();
  if (!invoice) notFound();

  const [{ data: companies }, { data: investors }] = await Promise.all([
    supabase.from("companies")
      .select("id,name,contact_name,email,amount_due,amount_paid,is_tdd_client")
      .eq("conference_id", ctx.conference.id).order("name"),
    supabase.from("investors")
      .select("id,firm_name,contact_name,email,amount_due,amount_paid,is_tdd_client")
      .eq("conference_id", ctx.conference.id).order("firm_name"),
  ]);

  const leads = [
    ...(companies ?? []).map(c => ({
      type: "company" as const, id: c.id, name: c.name,
      contact_name: c.contact_name, email: c.email,
      balance: Number(c.amount_due) - Number(c.amount_paid),
      is_tdd_client: !!c.is_tdd_client,
    })),
    ...(investors ?? []).map(i => ({
      type: "investor" as const, id: i.id, name: i.firm_name,
      contact_name: i.contact_name, email: i.email,
      balance: Number(i.amount_due) - Number(i.amount_paid),
      is_tdd_client: !!i.is_tdd_client,
    })),
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/conferences/${slug}/invoices/${id}`} className="text-xs uppercase tracking-widest2 text-ink/60 hover:text-ink">← Invoice #{invoice.invoice_number}</Link>
        <h1 className="mt-1 font-serif text-2xl font-bold text-ink">Edit invoice #{invoice.invoice_number}</h1>
        {invoice.status !== "draft" && (
          <p className="mt-1 text-xs text-amber-700">
            This invoice has already been sent. Edits will change the record and any newly generated PDF, but previously sent copies are unaffected.
          </p>
        )}
      </div>
      <InvoiceBuilder
        slug={slug}
        conferenceId={ctx.conference.id}
        leads={leads}
        existing={invoice}
        discountConfig={{
          type: ctx.conference.client_discount_type,
          value: ctx.conference.client_discount_value,
          label: ctx.conference.client_discount_label,
        }}
      />
    </div>
  );
}
