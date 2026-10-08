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
import { PlatformInvitesClient, type InviteRow } from "./PlatformInvitesClient";

export const dynamic = "force-dynamic";

export default async function PlatformInvitesPage({
  params,
}: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireConferenceAccess(slug);
  if (ctx.effectiveRole !== "super_admin") redirect(`/conferences/${slug}`);
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
      (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email, "en", { sensitivity: "base" }));

  return (
    <div className="space-y-6">
      <PageTitle title="Attendees" sub="People who can sign in to the Above & Beyond attendee portal" />
      <PlatformInvitesClient rows={rows} slug={slug} />
    </div>
  );
}
