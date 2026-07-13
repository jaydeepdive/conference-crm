"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

/** Edit / Delete controls for an existing invoice.
 *  - Edit is a plain link to /invoices/[id]/edit.
 *  - Delete confirms twice for sent invoices, then hard-deletes the row.
 *    A Postgres trigger (0010_invoice_lead_sync) re-syncs the underlying
 *    lead's payment_status / amount_due after the row is removed. */
export function InvoiceActions({
  slug, invoiceId, invoiceNumber, status,
}: {
  slug: string;
  invoiceId: string;
  invoiceNumber: number;
  status: string;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function del() {
    const first = confirm(`Delete invoice #${invoiceNumber}? This can't be undone.`);
    if (!first) return;
    if (status !== "draft") {
      const second = confirm(
        `This invoice was already ${status}. Deleting it removes the record from the CRM but does NOT recall the email that was sent. Continue?`
      );
      if (!second) return;
    }
    setDeleting(true); setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.from("invoices").delete().eq("id", invoiceId);
    if (err) { setError(err.message); setDeleting(false); return; }
    router.push(`/conferences/${slug}/invoices`);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href={`/conferences/${slug}/invoices/${invoiceId}/edit`}
        className="border border-ink/20 px-3 py-2 text-xs uppercase tracking-widest2 hover:bg-cream"
      >
        Edit
      </Link>
      <button
        onClick={del}
        disabled={deleting}
        className="border border-rose-300 px-3 py-2 text-xs uppercase tracking-widest2 text-rose-700 hover:bg-rose-50 disabled:opacity-50"
      >
        {deleting ? "Deleting…" : "Delete"}
      </button>
      {error && <span className="text-xs text-rose-700">{error}</span>}
    </div>
  );
}
