/**
 * Staff CRM shell for /conferences/[slug]/* (route group — no URL segment).
 * The attendee platform (/platform/*) lives OUTSIDE this group, so Next swaps
 * layouts correctly on client-side navigation between the two surfaces.
 */
import { requireConferenceAccess } from "@/lib/auth";
import { ConferenceNav } from "@/components/ConferenceNav";
import { Footer } from "@/components/Footer";

export default async function ConferenceStaffLayout({
  children, params,
}: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireConferenceAccess(slug);
  return (
    <>
      <ConferenceNav profile={ctx.profile} conference={ctx.conference} role={ctx.effectiveRole} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">{children}</main>
      <Footer />
    </>
  );
}
