"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { LeadType, InvoiceLineItem } from "@/lib/types";

interface Lead {
  type: LeadType; id: string; name: string;
  contact_name: string | null; email: string | null; balance: number;
}

export function InvoiceBuilder({ slug, conferenceId, leads }: {
  slug: string; conferenceId: string; leads: Lead[];
}) {
  const router = useRouter();
  const [leadId, setLeadId] = useState<string>("");
  const [items, setItems] = useState<InvoiceLineItem[]>([
    { description: "Conference registration", quantity: 1, unit_price: 0 },
  ]);
  const [taxRate, setTaxRate] = useState("0");
  const [dueDate, setDueDate] = useState("");
  const [issuedDate, setIssuedDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("Net 30 — wire transfer details on request");
  const [currency, setCurrency] = useState("USD");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = leads.find(l => `${l.type}:${l.id}` === leadId);

  const subtotal = useMemo(() =>
    items.reduce((a, li) => a + (Number(li.quantity) * Number(li.unit_price)), 0)
  , [items]);
  const taxAmt = useMemo(() => (subtotal * Number(taxRate)) / 100, [subtotal, taxRate]);
  const total = subtotal + taxAmt;

  function updateItem(i: number, k: keyof InvoiceLineItem, v: string | number) {
    setItems(items.map((it, idx) => idx === i ? { ...it, [k]: k === "description" ? v : Number(v) } : it));
  }
  function addItem() { setItems([...items, { description: "", quantity: 1, unit_price: 0 }]); }
  function removeItem(i: number) { setItems(items.filter((_, idx) => idx !== i)); }

  async function saveDraft() {
    if (!selected) { setError("Pick a recipient first"); return; }
    if (items.some(i => !i.description)) { setError("All line items need a description"); return; }
    setSaving(true); setError(null);
    const supabase = createClient();

    const { data, error: err } = await supabase.from("invoices").insert({
      conference_id: conferenceId,
      lead_type: selected.type, lead_id: selected.id,
      line_items: items,
      subtotal, tax_rate: Number(taxRate), tax_amount: taxAmt, total,
      currency, status: "draft",
      issued_date: issuedDate, due_date: dueDate || null,
      recipient_email: selected.email, recipient_name: selected.contact_name,
      notes: notes || null, payment_terms: paymentTerms || null,
    }).select().single();

    if (err) { setError(err.message); setSaving(false); return; }
    router.push(`/conferences/${slug}/invoices/${data.id}`);
  }

  const input = "w-full rounded-md border border-ink/20 bg-white px-3 py-1.5 text-sm focus:border-brand-accent focus:outline-none";
  const label = "block text-xs font-medium uppercase tracking-widest2 text-ink/60";
  const usd = (n: number) => `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6">
      {error && <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}

      <section className="border border-ink/20 bg-white p-5">
        <h3 className="text-xs font-semibold uppercase tracking-widest2 text-ink/60">Recipient</h3>
        <select className={`${input} mt-3`} value={leadId} onChange={e => setLeadId(e.target.value)}>
          <option value="">— pick a lead —</option>
          <optgroup label="Companies">
            {leads.filter(l => l.type === "company").map(l => (
              <option key={`${l.type}:${l.id}`} value={`${l.type}:${l.id}`}>
                {l.name} {l.balance > 0 ? `(balance ${usd(l.balance)})` : ""}
              </option>
            ))}
          </optgroup>
          <optgroup label="Investors">
            {leads.filter(l => l.type === "investor").map(l => (
              <option key={`${l.type}:${l.id}`} value={`${l.type}:${l.id}`}>
                {l.name} {l.balance > 0 ? `(balance ${usd(l.balance)})` : ""}
              </option>
            ))}
          </optgroup>
        </select>
        {selected && (
          <p className="mt-2 text-xs text-ink/60">
            Will be sent to {selected.contact_name ?? "—"} &lt;{selected.email ?? "no email on file"}&gt;
          </p>
        )}
      </section>

      <section className="border border-ink/20 bg-white p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-widest2 text-ink/60">Line items</h3>
          <button onClick={addItem} className="text-xs text-brand-accent hover:underline">+ Add line</button>
        </div>
        <table className="mt-3 w-full text-sm">
          <thead><tr className="text-left text-xs text-ink/60">
            <th className="py-1">Description</th><th className="py-1 w-20 text-right">Qty</th>
            <th className="py-1 w-32 text-right">Unit price</th><th className="py-1 w-32 text-right">Amount</th><th></th>
          </tr></thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-t border-ink/10">
                <td className="py-1.5"><input className={input} value={it.description}
                  onChange={e => updateItem(i, "description", e.target.value)} placeholder="What is this for?" /></td>
                <td className="py-1.5"><input className={`${input} text-right`} type="number" value={it.quantity}
                  onChange={e => updateItem(i, "quantity", e.target.value)} /></td>
                <td className="py-1.5"><input className={`${input} text-right`} type="number" step="0.01" value={it.unit_price}
                  onChange={e => updateItem(i, "unit_price", e.target.value)} /></td>
                <td className="py-1.5 text-right tabular-nums">{usd(it.quantity * it.unit_price)}</td>
                <td className="py-1.5 text-right">{items.length > 1 && (
                  <button onClick={() => removeItem(i)} className="text-xs text-rose-600">×</button>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 flex justify-end">
          <div className="w-72 space-y-1 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{usd(subtotal)}</span></div>
            <div className="flex items-center justify-between">
              <span>Tax %</span>
              <input className={`${input} w-20 text-right`} type="number" step="0.1" value={taxRate}
                onChange={e => setTaxRate(e.target.value)} />
            </div>
            <div className="flex justify-between"><span>Tax</span><span className="tabular-nums">{usd(taxAmt)}</span></div>
            <div className="mt-2 flex justify-between border-t border-ink pt-2 font-semibold">
              <span>Total</span><span className="tabular-nums">{usd(total)}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 border border-ink/20 bg-white p-5 sm:grid-cols-2">
        <div><label className={label}>Issued date</label><input className={input} type="date" value={issuedDate} onChange={e => setIssuedDate(e.target.value)} /></div>
        <div><label className={label}>Due date</label><input className={input} type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></div>
        <div><label className={label}>Currency</label><input className={input} value={currency} onChange={e => setCurrency(e.target.value)} /></div>
        <div className="sm:col-span-2"><label className={label}>Payment terms</label><input className={input} value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} /></div>
        <div className="sm:col-span-2"><label className={label}>Notes (optional)</label><textarea className={`${input} min-h-[80px]`} value={notes} onChange={e => setNotes(e.target.value)} /></div>
      </section>

      <div className="flex justify-end gap-3">
        <button onClick={() => router.back()} className="border border-ink/20 px-4 py-2 text-sm">Cancel</button>
        <button onClick={saveDraft} disabled={saving || !selected}
          className="bg-ink px-4 py-2 text-sm font-medium uppercase tracking-widest2 text-cream hover:bg-brand-accent disabled:opacity-50">
          {saving ? "Saving…" : "Save draft + go to send"}
        </button>
      </div>
    </div>
  );
}
