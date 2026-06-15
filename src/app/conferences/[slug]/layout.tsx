import { requireConferenceAccess } from "@/lib/auth";
import { ConferenceNav } from "@/components/ConferenceNav";
import { Footer } from "@/components/Footer";

export default async function ConferenceLayout({
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
