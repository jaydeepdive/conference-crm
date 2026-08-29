import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderInvoicePdf } from "@/lib/pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { data: invoice } = await supabase.from("invoices").select("*").eq("id", id).single();
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: conference } = await supabase.from("conferences").select("*").eq("id", invoice.conference_id).single();
  const lead = invoice.lead_type === "company"
    ? (await supabase.from("companies").select("name,contact_name,email").eq("id", invoice.lead_id).single()).data
    : (await supabase.from("investors").select("firm_name,contact_name,email").eq("id", invoice.lead_id).single()).data;
  const { data: sender } = await supabase.from("profiles").select("full_name,email").eq("id", user.id).single();

  const orgName = invoice.lead_type === "company"
    ? (lead as { name?: string } | null)?.name ?? "Recipient"
    : (lead as { firm_name?: string } | null)?.firm_name ?? "Recipient";

  try {
    const pdf = await renderInvoicePdf({
      brand: {
        conferenceName: conference?.public_name ?? conference?.name ?? "",
        senderName: sender?.full_name ?? sender?.email ?? "",
        senderEmail: sender?.email ?? "",
        issuerName: conference?.invoice_issuer_name ?? null,
        issuerAddress: conference?.invoice_issuer_address ?? null,
        paymentInstructions: conference?.invoice_payment_instructions ?? null,
      },
      invoice: {
        number: invoice.invoice_number,
        issued_date: invoice.issued_date ?? new Date().toISOString().slice(0, 10),
        due_date: invoice.due_date,
        currency: invoice.currency,
        line_items: invoice.line_items,
        subtotal: Number(invoice.subtotal),
        discount_label: invoice.discount_label ?? null,
        discount_amount: Number(invoice.discount_amount ?? 0),
        tax_rate: Number(invoice.tax_rate),
        tax_amount: Number(invoice.tax_amount),
        total: Number(invoice.total),
        notes: invoice.notes,
        payment_terms: invoice.payment_terms,
      },
      recipient: {
        name: invoice.recipient_name ?? (lead as { contact_name?: string } | null)?.contact_name ?? null,
        email: invoice.recipient_email ?? (lead as { email?: string } | null)?.email ?? null,
        organization: orgName,
      },
    });

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="invoice-${invoice.invoice_number}.pdf"`,
      },
    });
  } catch (e) {
    // Surface the real error to the browser AND log to Vercel — the previous
    // uncaught-throw path was 500ing with no message, so both the "View PDF"
    // button and the invoice-send flow (which fetches the PDF as an
    // attachment) failed with a generic "Failed to generate PDF".
    console.error("[invoices/pdf] renderInvoicePdf threw:", e);
    return NextResponse.json({
      error: "PDF generation failed",
      detail: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack?.split("\n").slice(0, 5).join("\n") : undefined,
    }, { status: 500 });
  }
}
