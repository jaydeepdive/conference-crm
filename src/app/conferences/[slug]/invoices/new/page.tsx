import Link from "next/link";
import { requireConferenceRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { InvoiceBuilder } from "./InvoiceBuilder";

export const dynamic = "force-dynamic";

export default async function NewInvoicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireConferenceRole(slug, ["super_admin","conference_admin","finance"]);
  const supabase = await createClient();

  const [{ data: companies }, { data: investors }] = await Promise.all([
    supabase.from("companies")
      .select("id,name,contact_name,email,amount_due,amount_paid,is_tdd_client,tdd_company_data")
      .eq("conference_id", ctx.conference.id).order("name"),
    supabase.from("investors")
      .select("id,firm_name,contact_name,email,amount_due,amount_paid,is_tdd_client,tdd_company_data")
      .eq("conference_id", ctx.conference.id).order("firm_name"),
  ]);

  const leads = [
    ...(companies ?? []).map(c => ({
      type: "company" as const, id: c.id, name: c.name,
      contact_name: c.contact_name, email: c.email,
      balance: Number(c.amount_due) - Number(c.amount_paid),
      is_tdd_client: !!c.is_tdd_client,
      tdd_ticker: c.tdd_company_data?.ticker ?? null,
    })),
    ...(investors ?? []).map(i => ({
      type: "investor" as const, id: i.id, name: i.firm_name,
      contact_name: i.contact_name, email: i.email,
      balance: Number(i.amount_due) - Number(i.amount_paid),
      is_tdd_client: !!i.is_tdd_client,
      tdd_ticker: i.tdd_company_data?.ticker ?? null,
    })),
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/conferences/${slug}/invoices`} className="text-xs uppercase tracking-widest2 text-ink/60 hover:text-ink">← Invoices</Link>
        <h1 className="mt-1 font-serif text-2xl font-bold text-ink">New invoice</h1>
      </div>
      <InvoiceBuilder slug={slug} conferenceId={ctx.conference.id} leads={leads}
        discountConfig={{
          type: ctx.conference.client_discount_type,
          value: ctx.conference.client_discount_value,
          label: ctx.conference.client_discount_label,
        }} />
    </div>
  );
}
