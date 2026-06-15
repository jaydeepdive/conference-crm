"use client";
import Link from "next/link";
import Image from "next/image";
import { SignOutButton } from "./SignOutButton";
import type { Profile } from "@/lib/types";

const TDD_LOGO = "https://thedeepdive.ca/wp-content/uploads/2025/04/thedeepdive_full.png";
const TDD_LOGO_SMALL = "https://thedeepdive.ca/wp-content/uploads/2025/04/thedeepdive_full-300x47.png";

/** Editorial-style masthead modeled on hub.thedeepdive.ca: top "internal" strip,
 *  centered logo + product name, horizontal nav, profile in the corner. */
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
  return (
    <header className="border-b border-ink bg-cream">
      {/* Top utility strip: "internal" tag left, profile + signout right */}
      <div className="border-b border-ink/15">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-2 text-[10px] uppercase tracking-widest2">
          <span className="flex items-center gap-2 text-ink/70">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-accent"></span>
            Mining Summit CRM · internal
          </span>
          <div className="flex items-center gap-4">
            {showAdminLink && profile.is_super_admin && (
              <Link href="/admin" className="text-brand-accent hover:underline">Admin</Link>
            )}
            <span className="normal-case tracking-normal text-ink/70">{profile.full_name || profile.email}</span>
            <SignOutButton />
          </div>
        </div>
      </div>

      {/* Centered logo (the TDD wordmark) */}
      <div className="mx-auto max-w-7xl px-6 pt-8 pb-4 text-center">
        <Link href="/conferences" className="inline-block" aria-label="Home">
          <Image
            src={TDD_LOGO}
            alt="The Deep Dive"
            width={420} height={66}
            priority unoptimized
            className="mx-auto h-12 w-auto sm:h-14"
          />
        </Link>
        <h1 className="mt-3 font-serif text-2xl font-black uppercase tracking-tight text-ink sm:text-3xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-xs uppercase tracking-widest2 text-ink/60">{subtitle}</p>
        )}
      </div>

      {/* Masthead double-rule */}
      <div className="mx-auto max-w-7xl px-6">
        <div className="masthead-rule" />
      </div>

      {/* Horizontal navigation */}
      <nav className="mx-auto max-w-7xl px-6 pb-3">
        <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-1 text-xs font-medium uppercase tracking-widest2">
          {navItems.map(item => (
            <Link key={item.href} href={item.href}
              className={`relative py-1 transition-colors ${item.active ? "text-brand-accent" : "text-ink hover:text-brand-accent"}`}>
              {item.label}
              {item.active && <span className="absolute inset-x-0 -bottom-0.5 h-0.5 bg-brand-accent" />}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}

export { TDD_LOGO, TDD_LOGO_SMALL };
