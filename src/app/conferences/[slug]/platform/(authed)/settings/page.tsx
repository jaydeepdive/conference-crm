/**
 * /conferences/[slug]/platform/settings — editable attendee profile fields,
 * plus a "People from {Company}" roster for company attendees. Reuses the
 * same CompanyContacts semantics via a client component.
 */
import { createClient } from "@/lib/supabase/server";
import { requirePlatformContext, leadDisplayName } from "@/lib/platform";
import type { Company, CompanyContact } from "@/lib/types";
import { ProfileForm } from "./ProfileForm";
import { PlatformCompanyContacts } from "./PlatformCompanyContacts";

export const dynamic = "force-dynamic";

export default async function PlatformSettingsPage({
  params,
}: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requirePlatformContext(slug);
  const supabase = await createClient();

  let contacts: CompanyContact[] = [];
  if (ctx.side === "company") {
    const { data } = await supabase.from("company_contacts").select("*")
      .eq("company_id", (ctx.lead as Company).id);
    contacts = (data ?? []) as CompanyContact[];
  }

  const entityName = leadDisplayName(ctx.lead, ctx.side);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Edit how you appear to other attendees.</p>
      </div>

      <section className="rounded-md border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold text-slate-900">Your profile</h2>
        <p className="text-xs text-slate-500">
          Email <span className="font-medium">{ctx.attendee.email}</span> is your sign-in and can&rsquo;t be changed here.
        </p>
        <ProfileForm attendee={{
          id: ctx.attendee.id,
          full_name: ctx.attendee.full_name,
          title: ctx.attendee.title,
          phone: ctx.attendee.phone,
          about: ctx.attendee.about,
        }} />
      </section>

      {ctx.side === "company" && (
        <section className="rounded-md border border-slate-200 bg-white p-4">
          <h2 className="text-base font-semibold text-slate-900">People attending from {entityName}</h2>
          <p className="mt-1 text-xs text-slate-500">
            These names show up on the other party&rsquo;s meeting cards when they view a confirmed meeting with you.
          </p>
          <PlatformCompanyContacts companyId={(ctx.lead as Company).id} contacts={contacts} />
        </section>
      )}

      {ctx.side === "investor" && (
        <section className="rounded-md border border-slate-200 bg-white p-4">
          <h2 className="text-base font-semibold text-slate-900">How companies see you</h2>
          <p className="mt-1 text-xs text-slate-500">
            Your display name and bio above are what shows up in the companies&rsquo; directory.
          </p>
        </section>
      )}
    </div>
  );
}
