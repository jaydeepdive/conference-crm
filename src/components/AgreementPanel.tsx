"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AgreementStatus, Company, SignWellTemplateConfig } from "@/lib/types";

/**
 * Company detail sidebar panel for the SignWell participation agreement.
 *
 * With multi-template support (v6.26+), the send modal now includes a
 * dropdown to pick which template variant (Pricing A, Pricing B, …) to send.
 * When the conference has exactly one template configured, the picker is
 * hidden and that template is used automatically.
 *
 * States handled:
 *   * templates.length === 0    → link to Settings, explain what's missing.
 *   * agreement_status='not_sent' → "Send agreement" button (opens a confirm
 *     dialog to pick template + tweak signer name/email + subject/message).
 *   * sent / viewed             → status + "Void & resend" (super admin).
 *   * signed                    → status + "View signed PDF" link.
 *   * declined / expired /
 *     voided                    → status + "Send again".
 */

const STATUS_LABEL: Record<AgreementStatus, string> = {
  not_sent: "Not sent",
  sent:     "Sent — awaiting signature",
  viewed:   "Viewed — awaiting signature",
  signed:   "Signed",
  declined: "Declined",
  voided:   "Voided",
  expired:  "Expired",
};
const STATUS_STYLE: Record<AgreementStatus, string> = {
  not_sent: "bg-gray-100 text-gray-700",
  sent:     "bg-amber-100 text-amber-800",
  viewed:   "bg-sky-100 text-sky-800",
  signed:   "bg-emerald-100 text-emerald-800",
  declined: "bg-rose-100 text-rose-800",
  voided:   "bg-gray-200 text-gray-600",
  expired:  "bg-rose-100 text-rose-800",
};

export function AgreementPanel({
  company, templates, isSuperAdmin,
}: {
  company: Pick<Company,
    | "id" | "name" | "contact_name" | "email" | "agreement_status"
    | "agreement_document_id" | "agreement_sent_at" | "agreement_viewed_at"
    | "agreement_completed_at" | "agreement_declined_at"
    | "agreement_signer_name" | "agreement_signer_email"
    | "agreement_template_id" | "agreement_template_name">;
  templates: SignWellTemplateConfig[];
  isSuperAdmin: boolean;
}) {
  const router = useRouter();
  const [showPrep, setShowPrep] = useState(false);
  const [templateId, setTemplateId] = useState<string>(templates[0]?.id ?? "");
  const [signerName, setSignerName] = useState(company.contact_name ?? "");
  const [signerEmail, setSignerEmail] = useState(company.email ?? "");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = company.agreement_status ?? "not_sent";
  const selectedTemplate = templates.find(t => t.id === templateId);

  async function send() {
    if (!templateId) { setError("Pick which template to send."); return; }
    if (!signerName.trim() || !signerEmail.trim()) {
      setError("Recipient name and email are required."); return;
    }
    if (!confirm(`Send "${selectedTemplate?.name ?? "agreement"}" to ${signerName} <${signerEmail}>?`)) return;
    setBusy(true); setError(null);
    const res = await fetch("/api/signwell/send", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company_id: company.id,
        template_id: templateId,
        signer_name: signerName.trim(),
        signer_email: signerEmail.trim(),
        subject: subject.trim() || undefined,
        message: message.trim() || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      // Enrich the error with any diagnostic fields the API returned
      // (observed_status, recipients, test_mode) so silent SignWell issues
      // don't stay silent.
      const bits: string[] = [data.error ?? "Send failed"];
      if (data.observed_status)  bits.push(`SignWell status: ${data.observed_status}`);
      if (data.test_mode)        bits.push(`test_mode: ${data.test_mode}`);
      if (Array.isArray(data.recipients_sent)) {
        bits.push(`Recipients: ${data.recipients_sent.map((r: { placeholder: string; email: string }) => `${r.placeholder}=${r.email}`).join(", ")}`);
      }
      setError(bits.join(" · "));
      setBusy(false); return;
    }
    setShowPrep(false); setBusy(false);
    router.refresh();
  }

  async function voidAndResend() {
    if (!confirm("Void the existing SignWell document and start over? The signer's link will stop working.")) return;
    setBusy(true); setError(null);
    const res = await fetch("/api/signwell/void", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company_id: company.id }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setError(data.error ?? "Void failed"); return; }
    setShowPrep(true);
    router.refresh();
  }

  if (templates.length === 0) {
    return (
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Participation Agreement</h2>
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          No SignWell templates configured for this conference yet. Ask a super admin to add one under Settings → SignWell.
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Participation Agreement</h2>

      <div className="space-y-3 rounded-md border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-widest2 ${STATUS_STYLE[status]}`}>
            {STATUS_LABEL[status]}
          </span>
          {company.agreement_signer_email && (
            <span className="text-[10px] uppercase tracking-widest2 text-muted">
              {company.agreement_signer_email}
            </span>
          )}
        </div>

        {company.agreement_template_name && (
          <div className="text-[10px] uppercase tracking-widest2 text-muted">
            Template: <span className="text-ink/80">{company.agreement_template_name}</span>
          </div>
        )}

        {(company.agreement_sent_at || company.agreement_completed_at || company.agreement_declined_at) && (
          <dl className="grid grid-cols-2 gap-1 text-[11px]">
            {company.agreement_sent_at && (<><dt className="text-muted">Sent</dt><dd>{fmt(company.agreement_sent_at)}</dd></>)}
            {company.agreement_viewed_at && (<><dt className="text-muted">Viewed</dt><dd>{fmt(company.agreement_viewed_at)}</dd></>)}
            {company.agreement_completed_at && (<><dt className="text-muted">Signed</dt><dd>{fmt(company.agreement_completed_at)}</dd></>)}
            {company.agreement_declined_at && (<><dt className="text-muted">Declined</dt><dd>{fmt(company.agreement_declined_at)}</dd></>)}
          </dl>
        )}

        {error && <div className="text-xs text-rose-700">{error}</div>}

        {status === "not_sent" && !showPrep && (
          <button
            onClick={() => setShowPrep(true)}
            style={{ backgroundColor: "#C8102E", color: "#FFFFFF" }}
            className="w-full px-3 py-2 text-xs font-semibold uppercase tracking-widest2 hover:opacity-90"
          >
            Prepare & send agreement
          </button>
        )}

        {status === "signed" && company.agreement_document_id && (
          <a
            href={`/api/signwell/document/${company.agreement_document_id}/pdf`}
            target="_blank" rel="noopener"
            className="block w-full border border-gray-300 px-3 py-2 text-center text-xs uppercase tracking-widest2 hover:bg-cream"
          >
            View signed PDF
          </a>
        )}

        {(status === "sent" || status === "viewed" || status === "signed") && isSuperAdmin && !showPrep && (
          <button
            onClick={voidAndResend}
            disabled={busy}
            className="w-full border border-rose-300 px-3 py-2 text-xs uppercase tracking-widest2 text-rose-700 hover:bg-rose-50 disabled:opacity-50"
          >
            {busy ? "Working…" : "Void & resend"}
          </button>
        )}

        {(status === "declined" || status === "expired" || status === "voided") && !showPrep && (
          <button
            onClick={() => setShowPrep(true)}
            style={{ backgroundColor: "#C8102E", color: "#FFFFFF" }}
            className="w-full px-3 py-2 text-xs font-semibold uppercase tracking-widest2 hover:opacity-90"
          >
            Send again
          </button>
        )}
      </div>

      {showPrep && (
        <div className="mt-3 space-y-2 rounded-md border border-gray-200 bg-cream/40 p-3">
          {/* Always show the picker when there's more than one template so
              it's impossible to accidentally send the wrong variant. Single
              template = show as a static label. */}
          {templates.length > 1 ? (
            <Field label={`Template (${templates.length} available)`}>
              <select className={input} value={templateId} onChange={e => setTemplateId(e.target.value)}>
                {templates.map(t => {
                  const missingMap = !(t.field_map ?? {}).company_name;
                  return (
                    <option key={t.id} value={t.id}>
                      {t.name}{missingMap ? " (⚠ company name unmapped)" : ""}
                    </option>
                  );
                })}
              </select>
            </Field>
          ) : (
            <p className="text-[10px] uppercase tracking-widest2 text-muted">
              Template: <span className="text-ink/80 normal-case">{templates[0].name}</span>
            </p>
          )}
          {selectedTemplate && !(selectedTemplate.field_map ?? {}).company_name && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">
              <strong>{selectedTemplate.name}</strong> is missing the Company Name field mapping.
              Send will fail until a super admin maps it under Settings → SignWell.
            </div>
          )}
          <p className="rounded-md bg-white/70 p-2 text-[10px] leading-relaxed text-muted">
            The name + email below are used <strong>only</strong> to address the SignWell email
            (Hi &lt;name&gt;, please sign…) and route it to the correct inbox.
            They do <strong>not</strong> pre-fill the Name field on the agreement PDF —
            that&rsquo;s left for the client to type in when they sign.
          </p>
          <Field label="Recipient name (email greeting only)">
            <input className={input} value={signerName} onChange={e => setSignerName(e.target.value)} />
          </Field>
          <Field label="Recipient email (SignWell sends the link here)">
            <input className={input} type="email" value={signerEmail} onChange={e => setSignerEmail(e.target.value)} />
          </Field>
          <Field label="Subject (optional)">
            <input className={input} placeholder="Defaults to “Participation Agreement — <conference>”"
              value={subject} onChange={e => setSubject(e.target.value)} />
          </Field>
          <Field label="Message (optional)">
            <textarea className={`${input} min-h-[80px]`} placeholder="Defaults to a polite one-liner."
              value={message} onChange={e => setMessage(e.target.value)} />
          </Field>
          <div className="flex gap-2">
            <button onClick={send} disabled={busy}
              style={{ backgroundColor: "#C8102E", color: "#FFFFFF" }}
              className="flex-1 px-3 py-2 text-xs font-semibold uppercase tracking-widest2 hover:opacity-90 disabled:opacity-50">
              {busy ? "Sending…" : "Send now"}
            </button>
            <button onClick={() => { setShowPrep(false); setError(null); }} disabled={busy}
              className="border border-gray-300 px-3 py-2 text-xs uppercase tracking-widest2 hover:bg-white disabled:opacity-50">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const input = "w-full rounded-md border border-gray-300 px-3 py-1.5 text-xs";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest2 text-muted">{label}</label>
      {children}
    </div>
  );
}

function fmt(iso: string): string {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}
