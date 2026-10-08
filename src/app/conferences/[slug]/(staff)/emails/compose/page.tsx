import Link from "next/link";
import { requireConferenceAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { canSendGeneralEmail } from "@/lib/types";
import { redirect } from "next/navigation";
import { EmailComposer } from "./EmailComposer";

export const dynamic = "force-dynamic";

export default async function ComposePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireConferenceAccess(slug);
  if (!canSendGeneralEmail(ctx.effectiveRole)) redirect(`/conferences/${slug}`);
  const supabase = await createClient();

  const [{ data: companies }, { data: investors }, { data: templates }] = await Promise.all([
    supabase.from("companies").select("id,name,contact_name,email,stage,confirmed,payment_status").eq("conference_id", ctx.conference.id),
    supabase.from("investors").select("id,firm_name,contact_name,email,stage,confirmed,payment_status").eq("conference_id", ctx.conference.id),
    supabase.from("email_templates").select("*").eq("conference_id", ctx.conference.id),
  ]);

  const allLeads = [
    ...(companies ?? []).map(c => ({
      type: "company" as const, id: c.id, name: c.name,
      contact_name: c.contact_name, email: c.email,
      stage: c.stage, confirmed: c.confirmed, payment_status: c.payment_status,
    })),
    ...(investors ?? []).map(i => ({
      type: "investor" as const, id: i.id, name: i.firm_name,
      contact_name: i.contact_name, email: i.email,
      stage: i.stage, confirmed: i.confirmed, payment_status: i.payment_status,
    })),
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/conferences/${slug}/emails`} className="text-xs uppercase tracking-widest2 text-ink/60 hover:text-ink">← Emails</Link>
        <h1 className="mt-1 font-serif text-2xl font-bold text-ink">Compose</h1>
      </div>
      <EmailComposer slug={slug} conferenceId={ctx.conference.id} conferenceName={ctx.conference.name}
        leads={allLeads} templates={templates ?? []}
        senderProfile={{ name: ctx.profile.full_name, email: ctx.profile.email }} />
    </div>
  );
}
