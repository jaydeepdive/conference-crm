/**
 * /conferences/[slug]/platform/admin/* — Above & Beyond admin console.
 * Super admins only. Charcoal header with the A&B mark + admin nav;
 * warm ivory content area (.ab-admin re-skins the shared CRM components).
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AboveBeyondHeader, BRAND_CHARC, BRAND_BORDER, BRAND_IVORY } from "../AboveBeyondBrand";
import { PlatformSignOut } from "../PlatformSignOut";
import { AdminNav } from "./AdminNav";

export const dynamic = "force-dynamic";

export default async function PlatformAdminLayout({
  children, params,
}: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) { redirect(`/conferences/${slug}/platform/login`); throw new Error("unreachable"); }
  const { data: prof } = await sb.from("profiles").select("is_super_admin").eq("id", user.id).maybeSingle();
  if (!(prof as { is_super_admin?: boolean } | null)?.is_super_admin) {
    redirect(`/conferences/${slug}/platform`); throw new Error("unreachable");
  }

  return (
    <div className="ab-admin flex min-h-screen flex-col" style={{ backgroundColor: BRAND_IVORY }}>
      <header className="border-b" style={{ backgroundColor: BRAND_CHARC, borderColor: BRAND_BORDER }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href={`/conferences/${slug}/platform/admin`} className="min-w-0 flex-1">
            <AboveBeyondHeader compact />
          </Link>
          <div className="flex items-center gap-4">
            <span className="hidden text-[10px] uppercase tracking-[0.22em] sm:inline" style={{ color: "#c9a24b" }}>
              Admin console
            </span>
            <PlatformSignOut slug={slug} compact />
          </div>
        </div>
        <AdminNav slug={slug} />
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 text-ink sm:px-6">{children}</main>
    </div>
  );
}
