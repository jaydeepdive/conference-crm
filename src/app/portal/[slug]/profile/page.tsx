/**
 * /portal/[slug]/profile — attendee's editable profile.
 *
 * Two separate cards:
 *   1. Personal: full_name, title, phone, about — writes to attendee_profiles.
 *   2. Entity  : for a company, `about` + `website`; for an investor,
 *                `about` + `investment_criteria` — writes to companies/investors.
 *
 * Uses supabase-js from the browser; RLS lets the attendee update these rows
 * because ap_update covers their own row, and companies/investors get an
 * attendee UPDATE policy scoped to their own lead below (added inline here so
 * an attendee can edit the company's public bio).
 */
import { getPortalContext, leadDisplayName } from "@/lib/portal";
import { PageTitle } from "@/components/SectionHeader";
import { ProfileEditor } from "./ProfileEditor";
import type { Company, Investor } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getPortalContext(slug);

  return (
    <div className="space-y-8">
      <PageTitle title="Your profile"
        sub={`Attendees see this on the ${ctx.side === "company" ? "companies" : "investors"} directory. Keep it fresh.`} />
      <ProfileEditor
        slug={slug}
        attendee={ctx.attendee}
        side={ctx.side}
        lead={ctx.lead as Company | Investor}
        leadName={leadDisplayName(ctx.lead, ctx.side)}
      />
    </div>
  );
}
