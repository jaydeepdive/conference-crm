/**
 * Post-event thank-you emails. Companies get the investors they met (email
 * only); investors get the companies they met (contact, email, phone).
 * Based on meetings that stayed confirmed (status accepted, with a time).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { brandedEmail, isPlausibleEmail } from "@/lib/resend";

export type TySide = "company" | "investor";
export interface TyItem { title: string; detail: string }
export interface TyRecipient {
  side: TySide; leadId: string; org: string; name: string; email: string;
  items: TyItem[];
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c] ?? c));

function splitInvestor(firm: string | null, contact: string | null): { person: string; firm: string | null } {
  const f = (firm ?? "").trim(); const c = (contact ?? "").trim();
  if (f.includes(" - ")) { const [p, ...rest] = f.split(" - "); return { person: c || p.trim(), firm: rest.join(" - ").trim() || null }; }
  if (c && f && c.toLowerCase() !== f.toLowerCase()) return { person: c, firm: f };
  return { person: c || f, firm: null };
}
const tidyName = (s: string) => s.replace(/\s+/g, " ").trim();

export async function buildThankYous(svc: SupabaseClient, conferenceId: string): Promise<TyRecipient[]> {
  const [{ data: ms }, { data: cos }, { data: invs }, { data: att }, { data: contacts }] = await Promise.all([
    svc.from("meetings").select("company_id, investor_id").eq("conference_id", conferenceId).eq("status", "accepted").not("scheduled_time", "is", null),
    svc.from("companies").select("id, name, contact_name, email, phone").eq("conference_id", conferenceId),
    svc.from("investors").select("id, firm_name, contact_name, email, phone").eq("conference_id", conferenceId),
    svc.from("attendee_profiles").select("lead_type, lead_id, full_name, email, phone").eq("conference_id", conferenceId),
    svc.from("company_contacts").select("company_id, name, email, phone, is_primary"),
  ]);
  const coById = new Map((cos ?? []).map(c => [c.id as string, c as { id: string; name: string; contact_name: string | null; email: string | null; phone: string | null }]));
  const invById = new Map((invs ?? []).map(i => [i.id as string, i as { id: string; firm_name: string | null; contact_name: string | null; email: string | null; phone: string | null }]));
  const attOf = (side: TySide, id: string) => (att ?? []).filter(a => a.lead_type === side && a.lead_id === id);
  const coMet = new Map<string, Set<string>>(), invMet = new Map<string, Set<string>>();
  for (const m of ms ?? []) {
    const c = m.company_id as string, i = m.investor_id as string;
    if (!coMet.has(c)) coMet.set(c, new Set()); coMet.get(c)!.add(i);
    if (!invMet.has(i)) invMet.set(i, new Set()); invMet.get(i)!.add(c);
  }

  const investorEmail = (id: string) => {
    const i = invById.get(id);
    const e = (i?.email ?? "").trim() || ((attOf("investor", id).find(a => isPlausibleEmail(a.email as string | null))?.email as string | undefined) ?? "");
    return isPlausibleEmail(e) ? e : "";
  };
  const companyContact = (id: string) => {
    const c = coById.get(id)!;
    const cc = (contacts ?? []).filter(x => x.company_id === id);
    const name = (c.contact_name ?? "").trim() || ((cc.find(x => x.is_primary)?.name as string | undefined) ?? "");
    const email = (c.email ?? "").trim() || ((cc.find(x => x.is_primary)?.email as string | undefined) ?? "");
    const match = cc.find(x => (x.email ?? "").toLowerCase() === email.toLowerCase());
    const phone = (c.phone ?? "").trim() || ((match?.phone as string | undefined) ?? "") || ((cc.find(x => x.phone)?.phone as string | undefined) ?? "");
    return { name: tidyName(name), email, phone };
  };

  const out: TyRecipient[] = [];
  // Companies → each attending person with an email
  for (const [cid, set] of coMet) {
    const c = coById.get(cid); if (!c) continue;
    const items: TyItem[] = Array.from(set).map(iid => {
      const i = invById.get(iid); const sp = splitInvestor(i?.firm_name ?? null, i?.contact_name ?? null);
      return { title: tidyName(sp.person) + (sp.firm ? ` (${sp.firm})` : ""), detail: investorEmail(iid) || "email not on file" };
    }).sort((a, b) => a.title.localeCompare(b.title));
    const people = attOf("company", cid).filter(a => isPlausibleEmail(a.email as string | null));
    const seen = new Set<string>();
    const recips = people.length ? people.map(p => ({ name: (p.full_name as string | null) ?? "", email: String(p.email) }))
      : (isPlausibleEmail(c.email) ? [{ name: c.contact_name ?? "", email: c.email as string }] : []);
    for (const r of recips) {
      const e = r.email.trim().toLowerCase(); if (seen.has(e)) continue; seen.add(e);
      out.push({ side: "company", leadId: cid, org: c.name, name: tidyName(r.name), email: r.email.trim(), items });
    }
  }
  // Investors
  for (const [iid, set] of invMet) {
    const i = invById.get(iid); if (!i) continue;
    const sp = splitInvestor(i.firm_name, i.contact_name);
    const items: TyItem[] = Array.from(set).map(cid => {
      const c = coById.get(cid)!; const k = companyContact(cid);
      return { title: c.name, detail: [k.name, k.email, k.phone].filter(Boolean).join(" · ") };
    }).sort((a, b) => a.title.localeCompare(b.title));
    const email = investorEmail(iid);
    if (!email) continue;
    out.push({ side: "investor", leadId: iid, org: sp.firm ?? "", name: tidyName(sp.person), email, items });
  }
  return out.sort((a, b) => a.side.localeCompare(b.side) || a.org.localeCompare(b.org) || a.name.localeCompare(b.name));
}

export function renderThankYou(r: TyRecipient): { subject: string; html: string; text: string } {
  const first = r.name.split(" ")[0] || "";
  const company = r.side === "company";
  const subject = company ? "Thank you for joining the Above & Beyond Mining Summit" : "Thank you for attending the Above & Beyond Mining Summit";
  const p1 = company
    ? `Thank you for presenting at the inaugural Above &amp; Beyond Mining Summit in Scottsdale. It was a pleasure having ${esc(r.org)} with us, and we hope the week was a valuable one.`
    : "Thank you for joining us at the inaugural Above &amp; Beyond Mining Summit in Scottsdale. We hope you found the company meetings and presentations worthwhile.";
  const p2 = company
    ? "To help you keep the conversations going, here are the investors you met with:"
    : "Here are the contacts for the companies you met with, should you wish to follow up:";
  const p3 = "Thank you again for being part of the first Above &amp; Beyond. We hope to see you next year.";
  const list = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e6dfcf;background:#faf8f3;margin:4px 0 18px;">${
    r.items.map((it, k) => `<tr><td style="padding:10px 14px;${k ? "border-top:1px solid #e6dfcf;" : ""}font:15px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1c1a16;">
      <strong>${esc(it.title)}</strong><br><span style="color:#5d574c;font-size:14px;">${esc(it.detail)}</span></td></tr>`).join("")}</table>`;
  const bodyHtml = `<p style="margin:0 0 14px;">${p2}</p>${list}<p style="margin:0 0 14px;">${p3}</p><p style="margin:0;">Warm regards,<br>The Above &amp; Beyond Mining Summit team</p>`;
  const bodyText = [p2.replace(/&amp;/g, "&"), "", ...r.items.map(it => `- ${it.title}: ${it.detail}`), "", p3.replace(/&amp;/g, "&"), "", "Warm regards,", "The Above & Beyond Mining Summit team"].join("\n");
  const { html, text } = brandedEmail({
    heading: "Thank you", greeting: first ? `Hi ${first},` : "Hello,", paragraphs: [p1],
    bodyHtml, bodyText, buttonLabel: "", url: "", preheader: subject,
  });
  return { subject, html, text };
}
