/**
 * /conferences/[slug]/platform-invites — super-admin surface for sending
 * attendee invites in bulk. One row per attendee_profile in the conference,
 * joined to its lead for a lead name. Buttons post to
 * /api/platform/invites/send.
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

  const rows: InviteRow[] = list.map(p => ({
    id: p.id,
    lead_name: (p.lead_type === "company" ? coById.get(p.lead_id) : invById.get(p.lead_id)) ?? "—",
    full_name: p.full_name,
    email: p.email,
    invite_sent_at: p.invite_sent_at,
    accepted_at: p.accepted_at,
    user_id: p.user_id,
  }));

  return (
    <div className="space-y-6">
      <PageTitle title="Platform invites" sub={`${ctx.conference.name} · super admin`} />

      <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Sending here is the ONLY way an invite email goes out. Nothing is sent
        automatically on attendee creation. Review the list carefully before
        hitting &ldquo;Send to all unsent&rdquo;.
      </div>

      <PlatformInvitesClient rows={rows} slug={slug} />
    </div>
  );
}
