"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { EmailTemplate, EmailKind, LeadType } from "@/lib/types";

interface Lead {
  type: LeadType; id: string; name: string;
  contact_name: string | null; email: string | null;
  stage: string; confirmed: string; payment_status: string;
}

type Segment = "all" | "all_companies" | "all_investors" | "confirmed" | "registered" | "unpaid" | "custom";

const SEGMENTS: { value: Segment; label: string; predicate: (l: Lead) => boolean }[] = [
  { value: "all", label: "All leads", predicate: () => true },
  { value: "all_companies", label: "All companies", predicate: l => l.type === "company" },
  { value: "all_investors", label: "All investors", predicate: l => l.type === "investor" },
  { value: "confirmed", label: "Confirmed attendees", predicate: l => l.confirmed === "yes" },
  { value: "registered", label: "Registered only", predicate: l => l.stage === "registered" },
  { value: "unpaid", label: "Unpaid (invoiced but not paid)",
    predicate: l => ["invoiced", "partial"].includes(l.payment_status) },
];

export function EmailComposer({ slug, conferenceId, conferenceName, leads, templates, senderProfile }: {
  slug: string;
  conferenceId: string;
  conferenceName: string;
  leads: Lead[];
  templates: EmailTemplate[];
  senderProfile: { name: string | null; email: string };
}) {
  const router = useRouter();
  const [segment, setSegment] = useState<Segment>("custom");
  const [customSelections, setCustomSelections] = useState<Set<string>>(new Set());
  const [kind, setKind] = useState<EmailKind>("general");
  const [templateId, setTemplateId] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [intent, setIntent] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ sent: number; total: number } | null>(null);
  const [personalize, setPersonalize] = useState(true);
  const [showAi, setShowAi] = useState(false);

  const recipients = useMemo(() => {
    if (segment === "custom") {
      return leads.filter(l => customSelections.has(`${l.type}:${l.id}`) && l.email);
    }
    const seg = SEGMENTS.find(s => s.value === segment);
    return seg ? leads.filter(l => seg.predicate(l) && l.email) : [];
  }, [segment, customSelections, leads]);

  function applyTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find(x => x.id === id);
    if (!t) return;
    setKind(t.kind);
    setSubject(t.subject);
    setBody(t.body);
  }

  function fillVars(s: string, lead: Lead): string {
    return s
      .replace(/\{\{lead_name\}\}/g, lead.name)
      .replace(/\{\{recipient_name\}\}/g, lead.contact_name ?? "there")
      .replace(/\{\{sender_name\}\}/g, senderProfile.name ?? senderProfile.email)
      .replace(/\{\{conference_name\}\}/g, conferenceName);
  }

  async function generateAi() {
    if (recipients.length === 0) { setError("Pick at least one recipient first"); return; }
    setDrafting(true); setError(null);
    try {
      const t = templates.find(x => x.id === templateId);
      const sample = recipients[0];
      const res = await fetch("/api/ai/draft", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conference: { name: conferenceName },
          recipient: { name: sample.contact_name, email: sample.email,
            lead_type: sample.type, lead_name: sample.name },
          template: t ? { subject: t.subject, body: t.body, kind: t.kind } : null,
          sender: { name: senderProfile.name ?? undefined, email: senderProfile.email },
          user_intent: intent,
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

  async function sendAll() {
    if (recipients.length === 0) { setError("No recipients selected"); return; }
    if (!subject || !body) { setError("Subject and body are required"); return; }
    const recipientsWithEmail = recipients.filter(r => r.email);
    if (!confirm(`Send "${subject}" to ${recipientsWithEmail.length} recipient${recipientsWithEmail.length === 1 ? "" : "s"}?\n\nEach email is sent individually${personalize ? " (personalized)" : ""}.`)) return;

    setSending(true); setError(null); setProgress({ sent: 0, total: recipientsWithEmail.length });

    try {
      for (let i = 0; i < recipientsWithEmail.length; i++) {
        const r = recipientsWithEmail[i];
        const personalSubject = personalize ? fillVars(subject, r) : subject;
        const personalBody = personalize ? fillVars(body, r) : body;
        const res = await fetch("/api/email/send", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conference_id: conferenceId, kind,
            subject: personalSubject, body: personalBody,
            to: [{ email: r.email!, name: r.contact_name ?? undefined,
              lead_type: r.type, lead_id: r.id }],
            template_id: templateId || null,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(`${r.email}: ${err.error ?? "send failed"}`);
        }
        setProgress({ sent: i + 1, total: recipientsWithEmail.length });
      }
      router.push(`/conferences/${slug}/emails`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bulk send failed");
    } finally { setSending(false); }
  }

  function toggleCustom(key: string) {
    const next = new Set(customSelections);
    if (next.has(key)) next.delete(key); else next.add(key);
    setCustomSelections(next);
  }

  const input = "w-full rounded-md border border-ink/20 bg-white px-3 py-1.5 text-sm focus:border-brand-accent focus:outline-none";
  const label = "block text-xs font-medium uppercase tracking-widest2 text-ink/60";

  return (
    <div className="space-y-6">
      {error && <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
      {progress && <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">
        Sending… {progress.sent} of {progress.total}
      </div>}

      <section className="border border-ink/20 bg-white p-5 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest2 text-ink/60">Recipients</h3>
        <div className="flex flex-wrap gap-2">
          {SEGMENTS.map(s => (
            <button key={s.value} onClick={() => setSegment(s.value)}
              className={`border px-3 py-1.5 text-xs uppercase tracking-widest2 ${segment === s.value ? "bg-ink text-cream border-ink" : "border-ink/20 hover:bg-cream"}`}>
              {s.label}
            </button>
          ))}
          <button onClick={() => setSegment("custom")}
            className={`border px-3 py-1.5 text-xs uppercase tracking-widest2 ${segment === "custom" ? "bg-ink text-cream border-ink" : "border-ink/20 hover:bg-cream"}`}>
            Custom
          </button>
        </div>
        <p className="text-xs text-ink/60">{recipients.length} will receive this email{segment !== "custom" && leads.some(l => !l.email) ? ` (excluding ${leads.filter(l => SEGMENTS.find(s=>s.value===segment)?.predicate(l) && !l.email).length} without an email on file)` : ""}.</p>

        {segment === "custom" && (
          <div className="max-h-64 overflow-y-auto rounded border border-ink/20 p-2">
            {leads.map(l => (
              <label key={`${l.type}:${l.id}`} className="flex items-center gap-2 py-1 text-sm">
                <input type="checkbox" checked={customSelections.has(`${l.type}:${l.id}`)}
                  onChange={() => toggleCustom(`${l.type}:${l.id}`)} disabled={!l.email} />
                <span className="font-medium">{l.name}</span>
                <span className="text-xs text-ink/50">{l.type}{l.email ? "" : " · no email"}</span>
              </label>
            ))}
          </div>
        )}
      </section>

      <section className="border border-ink/20 bg-white p-5 space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={label}>Kind</label>
            <select className={input} value={kind} onChange={e => setKind(e.target.value as EmailKind)}>
              <option value="general">General</option>
              <option value="marketing">Marketing</option>
              <option value="reminder">Reminder</option>
              <option value="welcome">Welcome</option>
              <option value="registration">Registration</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Template (optional)</label>
            <select className={input} value={templateId} onChange={e => applyTemplate(e.target.value)}>
              <option value="">— blank —</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.kind})</option>)}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={personalize} onChange={e => setPersonalize(e.target.checked)} />
            Personalize per recipient (replaces &#123;&#123;lead_name&#125;&#125;, &#123;&#123;recipient_name&#125;&#125;, etc.)
          </label>
          <button onClick={() => setShowAi(!showAi)}
            className="ml-auto border border-ink/20 px-3 py-1.5 uppercase tracking-widest2 hover:bg-cream">
            {showAi ? "Hide" : "✨ AI draft"}
          </button>
        </div>

        {showAi && (
          <div className="rounded border border-amber-200 bg-amber-50 p-3">
            <label className={label}>What should this email do?</label>
            <textarea className={`${input} min-h-[60px]`} value={intent} onChange={e => setIntent(e.target.value)}
              placeholder="e.g., Reminder that early-bird registration ends Friday. Warm tone." />
            <button onClick={generateAi} disabled={drafting || recipients.length === 0}
              className="mt-2 bg-ink px-3 py-1.5 text-xs uppercase tracking-widest2 text-cream disabled:opacity-50">
              {drafting ? "Drafting…" : "Generate draft (using first recipient as sample)"}
            </button>
          </div>
        )}

        <div><label className={label}>Subject</label><input className={input} value={subject} onChange={e => setSubject(e.target.value)} /></div>
        <div><label className={label}>Body (plain text)</label>
          <textarea className={`${input} min-h-[240px] font-mono`} value={body} onChange={e => setBody(e.target.value)} />
        </div>
        <p className="text-xs text-ink/60">Variables you can use (auto-filled when Personalize is on): <code>&#123;&#123;lead_name&#125;&#125;</code>, <code>&#123;&#123;recipient_name&#125;&#125;</code>, <code>&#123;&#123;sender_name&#125;&#125;</code>, <code>&#123;&#123;conference_name&#125;&#125;</code>.</p>
      </section>

      <div className="flex justify-end gap-3">
        <button onClick={sendAll} disabled={sending || recipients.length === 0 || !subject || !body}
          className="bg-brand-accent px-6 py-2 text-sm font-medium uppercase tracking-widest2 text-cream hover:bg-ink disabled:opacity-50">
          {sending ? "Sending…" : `Send to ${recipients.length}`}
        </button>
      </div>
    </div>
  );
}
