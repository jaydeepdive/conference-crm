"use client";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { Profile } from "@/lib/types";

const TDD_LOGO = "https://thedeepdive.ca/wp-content/uploads/2025/04/thedeepdive_full.png";

function formatToday(): string {
  return new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }).toUpperCase();
}

/** Masthead modeled after hub.thedeepdive.ca:
 *  top utility strip with DATE left / "INTERNAL" right,
 *  centered TDD logo + product name,
 *  thin rule,
 *  horizontal nav with sign-out on the far right. */
export function Masthead({
  profile, title, subtitle, navItems, showAdminLink = false,
}: {
  profile: Profile;
  title: string;
  subtitle?: string;
  navItems: { href: string; label: string; active?: boolean }[];
  rightSlot?: React.ReactNode;
  showAdminLink?: boolean;
}) {
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-line bg-white">
      {/* Utility strip — bg-utility, date left, internal label right */}
      <div className="border-b border-line bg-utility">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-2 text-[11px] font-medium uppercase tracking-widest2 text-muted">
          <span>{formatToday()}</span>
          <span className="flex items-center gap-3">
            {showAdminLink && profile.is_super_admin && (
              <Link href="/admin" className="text-brand-accent hover:underline">Admin</Link>
            )}
            <span>Mining Summit CRM · internal</span>
          </span>
        </div>
      </div>

      {/* Centered logo + product name */}
      <div className="mx-auto max-w-7xl px-6 pt-10 pb-3 text-center">
        <Link href="/conferences" className="inline-block" aria-label="Home">
          <Image
            src={TDD_LOGO}
            alt="The Deep Dive"
            width={420} height={66}
            priority unoptimized
            className="mx-auto h-12 w-auto sm:h-14"
          />
        </Link>
        <p className="mt-3 text-[11px] font-medium uppercase tracking-widest2 text-muted">{title}</p>
        {subtitle && (
          <p className="mt-1 text-[11px] uppercase tracking-widest2 text-muted/80">{subtitle}</p>
        )}
      </div>

      {/* Thin rule */}
      <div className="mx-auto max-w-7xl px-6">
        <div className="border-b border-ink"></div>
      </div>

      {/* Horizontal nav — items left, sign-out + name right */}
      <nav className="mx-auto max-w-7xl px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-x-7 gap-y-1 text-[12px] font-semibold uppercase tracking-widest2">
            {navItems.map(item => (
              <Link key={item.href} href={item.href}
                className={`relative py-1 transition-colors ${item.active ? "text-brand-accent" : "text-ink hover:text-brand-accent"}`}>
                {item.label}
                {item.active && <span className="absolute inset-x-0 -bottom-[7px] h-[2px] bg-brand-accent" />}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-4 text-[12px] uppercase tracking-widest2">
            <span className="normal-case tracking-normal text-muted">{profile.full_name || profile.email}</span>
            <button onClick={signOut} className="font-semibold text-ink hover:text-brand-accent">Sign out</button>
          </div>
        </div>
      </nav>
    </header>
  );
}

export { TDD_LOGO };
