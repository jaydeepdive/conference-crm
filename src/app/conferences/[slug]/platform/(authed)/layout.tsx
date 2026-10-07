/**
 * /conferences/[slug]/platform/(authed) — mobile-first attendee shell.
 *
 * Everything inside this route group requires a logged-in user whose
 * attendee_profile matches this conference.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { resolvePlatformContext, leadDisplayName } from "@/lib/platform";
import { PlatformNav } from "../PlatformNav";
import { PlatformSignOut } from "../PlatformSignOut";
import { PlatformAdminBanner } from "@/components/PlatformAdminBanner";
import { AboveBeyondHeader, BRAND_BG } from "../AboveBeyondBrand";

export const dynamic = "force-dynamic";

export default async function PlatformAuthedLayout({
  children, params,
}: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await resolvePlatformContext(slug);

  if (!result) { redirect("/conferences"); throw new Error("unreachable"); }
  if (result.kind === "no-session") {
    redirect(`/conferences/${slug}/platform/login`);
    throw new Error("unreachable");
  }

  if (result.kind === "not-attendee") {
    const conference = result.conference;
    const userEmail = result.userEmail;
    // Check whether this user is a super admin — if so, don't bounce them
    // into a dead end; link them directly to the staff admin tools.
    const { createClient } = await import("@/lib/supabase/server");
    const sb = await createClient();
    const { data: { user: u2 } } = await sb.auth.getUser();
    let isSuperAdmin = false;
    if (u2) {
      const { data: prof } = await sb.from("profiles").select("is_super_admin").eq("id", u2.id).maybeSingle();
      isSuperAdmin = !!(prof as { is_super_admin?: boolean } | null)?.is_super_admin;
    }
    return (
      <div className="min-h-screen" style={{ backgroundColor: BRAND_BG }}>
        <div className="mx-auto max-w-md px-5 py-10">
          <div className="mb-6"><AboveBeyondHeader /></div>
          <h1 className="text-xl font-semibold text-slate-900">{conference.name}</h1>
          {isSuperAdmin ? (
            <>
              <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <strong>Admin:</strong> no attendees exist in this conference yet. The attendee
                /platform surface needs at least one attendee_profile to render.
              </div>
              <p className="mt-4 text-sm text-slate-700">
                You can manage the whole schedule directly from the staff CRM — no attendee login required:
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <Link href={`/conferences/${slug}/meetings`}
                    className="block rounded-md border border-slate-300 bg-white px-3 py-2 font-medium text-slate-900 hover:border-brand-accent">
                    → Open Meetings admin (create, edit, assign tables)
                  </Link>
                </li>
                <li>
                  <Link href={`/conferences/${slug}/platform-invites`}
                    className="block rounded-md border border-slate-300 bg-white px-3 py-2 font-medium text-slate-900 hover:border-brand-accent">
                    → Add attendees + send invite emails
                  </Link>
                </li>
                <li>
                  <Link href={`/conferences/${slug}`}
                    className="block rounded-md border border-slate-300 bg-white px-3 py-2 font-medium text-slate-900 hover:border-brand-accent">
                    → Back to the conference dashboard
                  </Link>
                </li>
              </ul>
              <div className="mt-6">
                <PlatformSignOut slug={slug} />
              </div>
            </>
          ) : (
            <>
              <p className="mt-4 text-base text-slate-700">
                You&rsquo;re signed in as <span className="font-medium">{userEmail ?? "—"}</span>,
                but you&rsquo;re not registered as an attendee for this conference.
              </p>
              <p className="mt-3 text-sm text-slate-500">
                If this is wrong, check with the organizers that you were invited
                with the correct email address.
              </p>
              <div className="mt-6">
                <PlatformSignOut slug={slug} />
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  const { ctx } = result;
  const entity = leadDisplayName(ctx.lead, ctx.side);

  return (
    <div className="flex min-h-screen flex-col pb-20 sm:pb-0" style={{ backgroundColor: BRAND_BG }}>
      {ctx.isImpersonating && (
        <PlatformAdminBanner
          slug={slug}
          impersonatedName={ctx.attendee.full_name ?? ctx.attendee.email}
          impersonatedEntity={entity}
        />
      )}
      <header className="border-b border-stone-300/70" style={{ backgroundColor: "#fcf7ef" }}>
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href={`/conferences/${slug}/platform`} className="min-w-0 flex-1">
            <AboveBeyondHeader compact />
            <div className="mt-1 truncate text-xs text-stone-600">
              {ctx.attendee.full_name ?? ctx.attendee.email}
              {entity ? ` · ${entity}` : ""}
            </div>
          </Link>
          <PlatformSignOut slug={slug} compact />
        </div>
        <PlatformNav slug={slug} />
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5 sm:px-6">{children}</main>
    </div>
  );
}
