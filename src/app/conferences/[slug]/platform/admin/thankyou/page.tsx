/**
 * Admin console → Thank-you emails (post-event). Companies get the investors
 * they met (email); investors get the companies they met (contact, email,
 * phone). Nothing is sent until the admin presses Send.
 */
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { buildThankYous, renderThankYou } from "@/lib/thankyou";
import { ThankYouClient, type TyRow } from "./ThankYouClient";

export const dynamic = "force-dynamic";

export default async function ThankYouPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const svc = createServiceClient();
  const { data: conf } = await svc.from("conferences").select("id").eq("slug", slug).maybeSingle();
  if (!conf) { notFound(); throw new Error("unreachable"); }
  const list = await buildThankYous(svc, conf.id as string);
  let sent = new Set<string>();
  try {
    const { data } = await svc.from("thankyou_sends").select("lead_type, email").eq("conference_id", conf.id);
    sent = new Set((data ?? []).map(d => `${d.lead_type}|${String(d.email).toLowerCase()}`));
  } catch { /* table not there yet */ }
  const rows: TyRow[] = list.map(r => {
    const o = renderThankYou(r);
    return { side: r.side, org: r.org, name: r.name, email: r.email, count: r.items.length, subject: o.subject, html: o.html,
      sent: sent.has(`${r.side}|${r.email.toLowerCase()}`) };
  });
  return (
    <div className="space-y-5">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-brand-accent">After the summit</div>
        <h1 className="mt-1 font-display text-3xl font-medium sm:text-4xl">Thank-you emails</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Each company gets the investors it met (email only); each investor gets the companies they met (contact, email, phone) — based on meetings that went ahead.
          Nothing is sent until you press Send. Replies come to you. Each person only ever gets theirs once.
        </p>
      </div>
      <ThankYouClient slug={slug} rows={rows} />
    </div>
  );
}
