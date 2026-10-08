/**
 * /conferences/[slug]/platform/(authed) — attendee shell.
 *
 * Visual structure (Above & Beyond):
 *   - Dark charcoal header with the gold AB mark, ivory/gold nav.
 *   - Light ivory content area so every inner page (cards, tables, forms)
 *     stays readable — dark-text-on-black was unreadable.
 *
 * Super admins who aren't attendees themselves (and haven't chosen to
 * "View as" someone) get an admin landing with live counts pulled from
 * the CRM and direct links into the staff scheduling tools.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { resolvePlatformContext, leadDisplayName } from "@/lib/platform";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { PlatformNav } from "../PlatformNav";
import { PlatformSignOut } from "../PlatformSignOut";
import { PlatformAdminBanner } from "@/components/PlatformAdminBanner";
import {
  AboveBeyondHeader,
  BRAND_BLACK, BRAND_CHARC, BRAND_CARD, BRAND_BORDER,
  BRAND_GOLD, BRAND_GOLD_L, BRAND_IVORY,
} from "../AboveBeyondBrand";

export const dynamic = "force-dynamic";

/** Light grey that's actually readable on #0a0a0a / #1a1a1a. */
const TEXT_MUTED = "#c8c2b6";

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

    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    let isSuperAdmin = false;
    if (user) {
      const { data: prof } = await sb.from("profiles").select("is_super_admin").eq("id", user.id).maybeSingle();
      isSuperAdmin = !!(prof as { is_super_admin?: boolean } | null)?.is_super_admin;
    }

    // Organizers who aren't attendees go to the Above & Beyond admin console.
    if (isSuperAdmin) { redirect(`/conferences/${slug}/platform/admin`); throw new Error("unreachable"); }

    return (
      <div className="min-h-screen" style={{ backgroundColor: BRAND_BLACK, color: BRAND_IVORY }}>
        <div className="mx-auto max-w-md px-5 py-10">
          <div className="mb-8"><AboveBeyondHeader /></div>
          {(

            <>
              <h1 className="font-serif text-3xl font-medium" style={{ color: BRAND_IVORY }}>
                {conference.public_name ?? conference.name}
              </h1>
              <p className="mt-4 text-base" style={{ color: BRAND_IVORY }}>
                You&rsquo;re signed in as <span style={{ color: BRAND_GOLD_L }}>{userEmail ?? "—"}</span>,
                but you&rsquo;re not registered as an attendee for this conference.
              </p>
              <p className="mt-3 text-sm" style={{ color: TEXT_MUTED }}>
                If this is wrong, contact the organizers to confirm the email address on your registration.
              </p>
              <div className="mt-8"><PlatformSignOut slug={slug} /></div>
            </>
          )}
        </div>
      </div>
    );
  }

  const { ctx } = result;
  const entity = leadDisplayName(ctx.lead, ctx.side);

  return (
    <div className="flex min-h-screen flex-col pb-20 sm:pb-0" style={{ backgroundColor: BRAND_IVORY }}>
      {ctx.isImpersonating && (
        <PlatformAdminBanner
          slug={slug}
          impersonatedName={ctx.attendee.full_name ?? ctx.attendee.email}
          impersonatedEntity={entity}
        />
      )}
      <header className="border-b" style={{ backgroundColor: BRAND_CHARC, borderColor: BRAND_BORDER }}>
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href={`/conferences/${slug}/platform`} className="min-w-0 flex-1">
            <AboveBeyondHeader compact />
            <div className="mt-1 truncate text-xs" style={{ color: TEXT_MUTED }}>
              {ctx.attendee.full_name ?? ctx.attendee.email}
              {entity ? ` · ${entity}` : ""}
            </div>
          </Link>
          <div className="flex shrink-0 items-center gap-4">
            {ctx.isAdmin && (
              <Link href={`/conferences/${slug}/platform/admin`}
                className="text-xs uppercase tracking-[0.18em] hover:opacity-80" style={{ color: BRAND_GOLD }}>
                Admin
              </Link>
            )}
            <PlatformSignOut slug={slug} compact />
          </div>
        </div>
        <PlatformNav slug={slug} />
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5 text-stone-900 sm:px-6">{children}</main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-sm border px-4 py-3" style={{ backgroundColor: BRAND_CARD, borderColor: BRAND_BORDER }}>
      <div className="text-[10px] uppercase tracking-[0.2em]" style={{ color: TEXT_MUTED }}>{label}</div>
      <div className="mt-1 font-serif text-3xl" style={{ color: BRAND_GOLD_L }}>{value}</div>
    </div>
  );
}
