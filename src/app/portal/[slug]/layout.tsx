/**
 * /portal/[slug] layout — conference-scoped shell for the attendee portal.
 * Resolves the portal context (denies with a redirect if the current auth user
 * has no attendee_profile for this conference) and wraps the child page in
 * PortalNav + PortalFooter.
 */
import { getPortalContext, leadDisplayName } from "@/lib/portal";
import { PortalNav } from "@/components/PortalNav";
import { PortalFooter } from "@/components/PortalFooter";

export default async function PortalConferenceLayout({
  children, params,
}: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getPortalContext(slug);
  const dateLine = ctx.conference.date_start
    ? `${ctx.conference.date_start}${ctx.conference.date_end && ctx.conference.date_end !== ctx.conference.date_start ? ` — ${ctx.conference.date_end}` : ""}`
    : "";
  const sideLabel = ctx.side === "company" ? "Company" : "Investor";
  const subtitle = `${dateLine ? dateLine + " · " : ""}${sideLabel}: ${leadDisplayName(ctx.lead, ctx.side)}`;

  return (
    <>
      <PortalNav
        conferenceName={ctx.conference.name}
        slug={slug}
        subtitle={subtitle}
        viewerLabel={ctx.attendee.full_name ?? ctx.attendee.email}
      />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
      <PortalFooter />
    </>
  );
}
