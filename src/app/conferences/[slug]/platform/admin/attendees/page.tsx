/**
 * /conferences/[slug]/platform-invites — "Attendees" (super admin).
 *
 * One row per person who can sign in to the attendee portal, joined to their
 * company / investor for display. Invite sends go through
 * /api/platform/invites/send; nothing is emailed automatically.
 */
import { requireConferenceAccess } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AttendeeProfile, Company, Investor } from "@/lib/types";
import { PageTitle } from "@/components/SectionHeader";
import { PlatformInvitesClient, type InviteRow, type MissingLead } from "./PlatformInvitesClient";
import type { LeadOption } from "./PersonDialog";

export const dynamic = "force-dynamic";

export default async function PlatformInvitesPage({
  params,
}: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireConferenceAccess(slug);
  if (ctx.effectiveRole !== "super_admin") redirect(`/conferences/${slug}/platform`);
  const supabase = await createClient();

  const { data: profiles } = await supabase.from("attendee_profiles").select("*")
    .eq("conference_id", ctx.conference.id)
    .order("created_at", { ascending: true });
  const list = (profiles ?? []) as AttendeeProfile[];

  const companyIds = list.filter(p => p.lead_type === "company").map(p => p.lead_id);
  const investorIds = list.filter(p => p.lead_type === "investor").map(p => p.lead_id);
  const [{ data: cos }, { data: invs }] = await Promise.all([
    companyIds.length ? supabase.from("companies").select("id, name").in("id", companyIds)
      : Promise.resolve({ data: [] as Pick<Company, "id" | "name">[] }),
    investorIds.length ? supabase.from("investors").select("id, firm_name").in("id", investorIds)
      : Promise.resolve({ data: [] as Pick<Investor, "id" | "firm_name">[] }),
  ]);
  const coById = new Map((cos ?? []).map(c => [c.id, c.name]));
  const invById = new Map((invs ?? []).map(i => [i.id, i.firm_name]));

  // Every company / investor in the conference, for the "Add person" picker.
  const [{ data: allCos }, { data: allInvs }] = await Promise.all([
    supabase.from("companies").select("id, name").eq("conference_id", ctx.conference.id),
    supabase.from("investors").select("id, firm_name, contact_name").eq("conference_id", ctx.conference.id),
  ]);
  const leads: LeadOption[] = [
    ...(allCos ?? []).map(c => ({ id: c.id as string, type: "company" as const, name: ((c.name as string) || "(no name)").trim() })),
    ...(allInvs ?? []).map(i => ({ id: i.id as string, type: "investor" as const, name: ((i.firm_name || i.contact_name || "(no name)") as string).trim() })),
  ].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

  // Registered companies/investors that have NO attendee row (usually: no
  // email on file, or their email is already used by another attendee).
  const { createServiceClient } = await import("@/lib/supabase/service");
  const svc = createServiceClient();
  const [{ data: regCos }, { data: regInvs }] = await Promise.all([
    svc.from("companies").select("id, name, email").eq("conference_id", ctx.conference.id).eq("stage", "registered"),
    svc.from("investors").select("id, firm_name, contact_name, email").eq("conference_id", ctx.conference.id).eq("stage", "registered"),
  ]);
  const hasRow = new Set(list.map(p => `${p.lead_type}:${p.lead_id}`));
  const emailOwner = new Map(list.filter(p => p.email).map(p => [(p.email as string).toLowerCase(), p]));
  const missing: MissingLead[] = [];
  const reasonFor = (email: string | null): string => {
    const e = (email ?? "").trim().toLowerCase();
    if (!e) return "No email on file";
    const owner = emailOwner.get(e);
    if (owner) {
      const ownerName = (owner.lead_type === "company" ? coById.get(owner.lead_id) : invById.get(owner.lead_id)) ?? "another attendee";
      return `Email ${e} is already used by ${ownerName} (${owner.lead_type})`;
    }
    return "Not synced yet — press Sync registered leads";
  };
  for (const c of regCos ?? []) if (!hasRow.has(`company:${c.id}`))
    missing.push({ lead_type: "company", lead_id: c.id as string, name: ((c.name as string) || "(no name)").trim(), reason: reasonFor(c.email as string | null) });
  for (const i of regInvs ?? []) if (!hasRow.has(`investor:${i.id}`))
    missing.push({ lead_type: "investor", lead_id: i.id as string, name: ((i.firm_name || i.contact_name || "(no name)") as string).trim(), reason: reasonFor(i.email as string | null) });
  missing.sort((a, b) => a.lead_type.localeCompare(b.lead_type) || a.name.localeCompare(b.name));

  const rows: InviteRow[] = list
    .map(p => ({
      id: p.id,
      lead_type: p.lead_type,
      lead_id: p.lead_id,
      lead_name: ((p.lead_type === "company" ? coById.get(p.lead_id) : invById.get(p.lead_id)) ?? "").trim() || "(no name)",
      full_name: p.full_name,
      email: p.email,
      invite_sent_at: p.invite_sent_at,
      accepted_at: p.accepted_at,
      user_id: p.user_id,
    }))
    .sort((a, b) =>
      a.lead_name.localeCompare(b.lead_name, "en", { sensitivity: "base" }) ||
      (a.full_name ?? a.email ?? "").localeCompare(b.full_name ?? b.email ?? "", "en", { sensitivity: "base" }));

  return (
    <div className="space-y-6">
      <PageTitle title="Attendees" sub="People who can sign in to the attendee portal. Companies can have as many people as you need; investors are one person each." />
      <PlatformInvitesClient rows={rows} slug={slug} conferenceId={ctx.conference.id} leads={leads} missing={missing} staffBase={`https://crm.thedeepdive.ca/conferences/${slug}`} />
    </div>
  );
}
