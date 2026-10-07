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
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-md px-5 py-10">
          <h1 className="text-xl font-semibold text-slate-900">{conference.name}</h1>
          <p className="mt-4 text-base text-slate-700">
            You&rsquo;re signed in as <span className="font-medium">{userEmail ?? "—"}</span>,
            but you&rsquo;re not registered as an attendee for this conference.
          </p>
          <p className="mt-3 text-sm text-slate-500">
            If this is wrong, check with the organizers that you were invited with
            the correct email address.
          </p>
          <div className="mt-6">
            <PlatformSignOut slug={slug} />
          </div>
        </div>
      </div>
    );
  }

  const { ctx } = result;
  const entity = leadDisplayName(ctx.lead, ctx.side);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 pb-20 sm:pb-0">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href={`/conferences/${slug}/platform`} className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-slate-900">
              {ctx.conference.name}
            </div>
            <div className="truncate text-xs text-slate-500">
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
