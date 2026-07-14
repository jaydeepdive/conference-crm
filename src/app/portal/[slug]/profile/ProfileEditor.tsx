"use client";
/**
 * ProfileEditor — client component with two independently-saveable forms.
 *
 * Both submit to server routes so we can:
 *   1. Enforce which columns an attendee is allowed to touch on their lead
 *      entity (about / website / investment_criteria only — never stage or
 *      payment fields).
 *   2. Keep the RLS on companies/investors staff-only for writes.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AttendeeProfile, AttendeeSide, Company, Investor } from "@/lib/types";

interface Props {
  slug: string;
  attendee: AttendeeProfile;
  side: AttendeeSide;
  lead: Company | Investor;
  leadName: string;
}

export function ProfileEditor({ slug, attendee, side, lead, leadName }: Props) {
  const router = useRouter();

  // ---- Personal ----
  const [full_name, setFullName] = useState(attendee.full_name ?? "");
  const [title, setTitle] = useState(attendee.title ?? "");
  const [phone, setPhone] = useState(attendee.phone ?? "");
  const [about, setAbout] = useState(attendee.about ?? "");
  const [personalSaving, setPersonalSaving] = useState(false);
  const [personalMsg, setPersonalMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // ---- Entity ----
  const [entityAbout, setEntityAbout] = useState(lead.about ?? "");
  const [website, setWebsite] = useState((side === "company" ? (lead as Company).website : "") ?? "");
  const [investmentCriteria, setInvestmentCriteria] = useState(
    side === "investor" ? ((lead as Investor).investment_criteria ?? "") : "",
  );
  const [entitySaving, setEntitySaving] = useState(false);
  const [entityMsg, setEntityMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function savePersonal() {
    setPersonalSaving(true); setPersonalMsg(null);
    const res = await fetch(`/api/portal/profile/personal`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name, title, phone, about }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setPersonalMsg({ ok: false, text: json.error ?? "Save failed" });
    else { setPersonalMsg({ ok: true, text: "Saved." }); router.refresh(); }
    setPersonalSaving(false);
  }

  async function saveEntity() {
    setEntitySaving(true); setEntityMsg(null);
    const body: Record<string, unknown> = { slug, about: entityAbout };
    if (side === "company") body.website = website;
    if (side === "investor") body.investment_criteria = investmentCriteria;
    const res = await fetch(`/api/portal/profile/entity`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setEntityMsg({ ok: false, text: json.error ?? "Save failed" });
    else { setEntityMsg({ ok: true, text: "Saved." }); router.refresh(); }
    setEntitySaving(false);
  }

  const input = "w-full rounded-md border border-line bg-white px-3 py-2 text-sm focus:border-brand-accent focus:outline-none";
  const label = "block text-[10px] font-medium uppercase tracking-widest2 text-muted mb-1 mt-3";

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <Card title="Personal" subtitle="Shown next to your name in the directory + inbox.">
        {personalMsg && <MsgBanner msg={personalMsg} />}
        <div>
          <label className={label}>Full name</label>
          <input className={input} value={full_name} onChange={e => setFullName(e.target.value)} />

          <label className={label}>Title</label>
          <input className={input} value={title} onChange={e => setTitle(e.target.value)} placeholder="CEO, Managing Partner, etc." />

          <label className={label}>Phone</label>
          <input className={input} value={phone} onChange={e => setPhone(e.target.value)} type="tel" />

          <label className={label}>About you</label>
          <textarea className={`${input} min-h-[110px]`} value={about} onChange={e => setAbout(e.target.value)}
            placeholder="A short bio — background, what brought you to this conference." />
        </div>
        <div className="mt-4 border-t border-line pt-4">
          <button onClick={savePersonal} disabled={personalSaving}
            className="bg-ink px-4 py-2 text-[11px] font-semibold uppercase tracking-widest2 text-white hover:bg-brand-accent disabled:opacity-50">
            {personalSaving ? "Saving…" : "Save personal"}
          </button>
        </div>
      </Card>

      <Card
        title={side === "company" ? `Company — ${leadName}` : `Firm — ${leadName}`}
        subtitle={side === "company"
          ? "The public description that investors see when they browse the directory."
          : "What you're looking for — sectors, cheque size, criteria. Companies use this to decide whether to request a meeting."}
      >
        {entityMsg && <MsgBanner msg={entityMsg} />}
        <div>
          <label className={label}>{side === "company" ? "About the company" : "About the firm"}</label>
          <textarea className={`${input} min-h-[140px]`} value={entityAbout} onChange={e => setEntityAbout(e.target.value)}
            placeholder={side === "company"
              ? "What do you build? Who's the team? Stage, traction, story."
              : "Firm background, portfolio, style."} />

          {side === "company" && (
            <>
              <label className={label}>Website</label>
              <input className={input} value={website} onChange={e => setWebsite(e.target.value)}
                placeholder="https://example.com" />
            </>
          )}

          {side === "investor" && (
            <>
              <label className={label}>Investment criteria</label>
              <textarea className={`${input} min-h-[110px]`} value={investmentCriteria}
                onChange={e => setInvestmentCriteria(e.target.value)}
                placeholder="Stage, sector, cheque size, geography." />
            </>
          )}
        </div>
        <div className="mt-4 border-t border-line pt-4">
          <button onClick={saveEntity} disabled={entitySaving}
            className="bg-ink px-4 py-2 text-[11px] font-semibold uppercase tracking-widest2 text-white hover:bg-brand-accent disabled:opacity-50">
            {entitySaving ? "Saving…" : side === "company" ? "Save company" : "Save firm"}
          </button>
        </div>
      </Card>
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="border border-line bg-white p-6">
      <h3 className="font-display text-xl font-bold text-ink">{title}</h3>
      {subtitle && <p className="mt-1 text-xs text-muted">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function MsgBanner({ msg }: { msg: { ok: boolean; text: string } }) {
  return (
    <div className={`mb-3 rounded-md p-3 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
      {msg.text}
    </div>
  );
}
