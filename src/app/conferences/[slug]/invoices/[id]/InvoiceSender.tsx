"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Invoice, EmailTemplate } from "@/lib/types";

export function InvoiceSender({ slug, invoice, conferenceName, recipient, templates, senderProfile }: {
  slug: string;
  invoice: Invoice;
  conferenceName: string;
  recipient: { name: string | null; email: string | null; organization: string };
  templates: EmailTemplate[];
  senderProfile: { name: string | null; email: string };
}) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState<string>("");
  const [subject, setSubject] = useState(`Invoice #${invoice.invoice_number} for ${conferenceName}`);
  const [body, setBody] = useState(`Hi ${recipient.name ?? "there"},\n\nPlease find attached invoice #${invoice.invoice_number} (${invoice.currency} ${Number(invoice.total).toFixed(2)})${invoice.due_date ? ` due ${invoice.due_date}` : ""}.\n\nLet me know if you have any questions.\n\nBest,\n${senderProfile.name ?? senderProfile.email}`);
  const [to, setTo] = useState(recipient.email ?? "");
  const [cc, setCc] = useState("");
  const [intent, setIntent] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAi, setShowAi] = useState(false);

  function applyTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find(x => x.id === id);
    if (!t) return;
    const fillVars = (s: string) => s
      .replace(/\{\{invoice_number\}\}/g, String(invoice.invoice_number))
      .replace(/\{\{total\}\}/g, `${invoice.currency} ${Number(invoice.total).toFixed(2)}`)
      .replace(/\{\{due_date\}\}/g, invoice.due_date ?? "TBD")
      .replace(/\{\{recipient_name\}\}/g, recipient.name ?? "there")
      .replace(/\{\{lead_name\}\}/g, recipient.organization)
      .replace(/\{\{sender_name\}\}/g, senderProfile.name ?? senderProfile.email);
    setSubject(fillVars(t.subject));
    setBody(fillVars(t.body));
  }

  async function generateAi() {
    setDrafting(true); setError(null);
    try {
      const t = templates.find(x => x.id === templateId);
      const res = await fetch("/api/ai/draft", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conference: { name: conferenceName },
          recipient: { name: recipient.name, email: recipient.email,
            lead_type: invoice.lead_type, lead_name: recipient.organization },
          template: t ? { subject: t.subject, body: t.body, kind: t.kind } : null,
          invoice: {
            invoice_number: invoice.invoice_number,
            total: Number(invoice.total), currency: invoice.currency,
            due_date: invoice.due_date,
            line_items: invoice.line_items,
          },
          sender: { name: senderProfile.name ?? undefined, email: senderProfile.email },
          user_intent: intent || "Send the invoice politely; mention the PDF is attached.",
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "AI draft failed");
      }
      const data = await res.json();
      setSubject(data.subject); setBody(data.body);
      setShowAi(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI draft failed");
    } finally { setDrafting(false); }
  }

  async function send() {
    if (!to) { setError("Recipient email is required"); return; }
    if (!confirm(`Send invoice #${invoice.invoice_number} to ${to}?`)) return;
    setSending(true); setError(null);

    try {
      // Fetch PDF as base64
      const pdfRes = await fetch(`/api/invoices/${invoice.id}/pdf`);
      if (!pdfRes.ok) throw new Error("Failed to generate PDF");
      const pdfBuf = await pdfRes.arrayBuffer();
      const pdfB64 = btoa(String.fromCharCode(...new Uint8Array(pdfBuf)));

      // Send email
      const res = await fetch("/api/email/send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conference_id: invoice.conference_id, kind: "invoice",
          subject, body,
          to: [{ email: to, name: recipient.name ?? undefined,
            lead_type: invoice.lead_type, lead_id: invoice.lead_id }],
          cc: cc ? cc.split(",").map(s => ({ email: s.trim() })).filter(c => c.email) : [],
          invoice_id: invoice.id,
          template_id: templateId || null,
          attachment: {
            filename: `invoice-${invoice.invoice_number}.pdf`,
            mimeType: "application/pdf",
            contentBase64: pdfB64,
          },
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Send failed");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally { setSending(false); }
  }

  const input = "w-full rounded-md border border-ink/20 bg-white px-3 py-1.5 text-sm focus:border-brand-accent focus:outline-none";
  const label = "block text-xs font-medium uppercase tracking-widest2 text-ink/60";

  return (
    <section className="border border-ink/20 bg-white p-5 space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-widest2 text-ink/60">Compose &amp; send</h3>
      {error && <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label}>Template (optional)</label>
          <select className={input} value={templateId} onChange={e => applyTemplate(e.target.value)}>
            <option value="">— blank —</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <button onClick={() => setShowAi(!showAi)}
            className="mt-5 border border-ink/20 px-3 py-1.5 text-xs uppercase tracking-widest2 hover:bg-cream">
            {showAi ? "Hide" : "✨ AI draft"}
          </button>
        </div>
      </div>

      {showAi && (
        <div className="rounded border border-amber-200 bg-amber-50 p-3">
          <label className={label}>What should this email do?</label>
          <textarea className={`${input} min-h-[60px]`} value={intent} onChange={e => setIntent(e.target.value)}
            placeholder="e.g., Polite first-touch invoice. Mention we offer net 30 terms. Sign off warmly." />
          <button onClick={generateAi} disabled={drafting}
            className="mt-2 bg-ink px-3 py-1.5 text-xs uppercase tracking-widest2 text-cream disabled:opacity-50">
            {drafting ? "Drafting…" : "Generate draft"}
          </button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className={label}>To</label><input className={input} value={to} onChange={e => setTo(e.target.value)} /></div>
        <div><label className={label}>CC (comma separated)</label><input className={input} value={cc} onChange={e => setCc(e.target.value)} /></div>
      </div>
      <div><label className={label}>Subject</label><input className={input} value={subject} onChange={e => setSubject(e.target.value)} /></div>
      <div><label className={label}>Body (plain text — PDF will be attached automatically)</label>
        <textarea className={`${input} min-h-[200px] font-mono`} value={body} onChange={e => setBody(e.target.value)} /></div>

      <div className="flex justify-end gap-3">
        <button onClick={send} disabled={sending || !to || !subject || !body}
          className="bg-brand-accent px-6 py-2 text-sm font-medium uppercase tracking-widest2 text-cream hover:bg-ink disabled:opacity-50">
          {sending ? "Sending…" : "Send invoice"}
        </button>
      </div>
    </section>
  );
}
