"use client";
import Link from "next/link";
import { SignOutButton } from "./SignOutButton";
import type { Profile } from "@/lib/types";

/** Editorial-style masthead: centered logo over horizontal nav, with profile in the corner.
 *  Models the thedeepdive.ca front-page layout. */
export function Masthead({
  profile, title, subtitle, navItems, rightSlot, showAdminLink = false,
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
      {/* Top bar: small utility links left, profile right */}
      <div className="border-b border-ink/20">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-2 text-xs uppercase tracking-widest2 text-ink/60">
          <Link href="/conferences" className="hover:text-ink">All conferences</Link>
          <div className="flex items-center gap-4">
            {showAdminLink && profile.is_super_admin && (
              <Link href="/admin" className="text-brand-accent hover:underline">Admin</Link>
            )}
            <span className="text-ink/70 normal-case tracking-normal">{profile.full_name || profile.email}</span>
            <SignOutButton />
          </div>
        </div>
      </div>

      {/* Centered logo + subtitle */}
      <div className="mx-auto max-w-7xl px-6 pt-10 pb-6 text-center">
        <Link href="/conferences" className="inline-block">
          <h1 className="text-4xl font-serif font-black uppercase tracking-tight text-ink sm:text-5xl">
            {title}
          </h1>
        </Link>
        {subtitle && (
          <p className="mt-2 text-xs uppercase tracking-widest2 text-ink/60">{subtitle}</p>
        )}
      </div>

      {/* Decorative double-rule */}
      <div className="mx-auto max-w-7xl px-6">
        <div className="masthead-rule" />
      </div>

      {/* Horizontal navigation across the width */}
      <nav className="mx-auto max-w-7xl px-6 pb-3">
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-xs font-medium uppercase tracking-widest2">
          {navItems.map(item => (
            <Link key={item.href} href={item.href}
              className={`relative py-1 transition-colors ${item.active ? "text-brand-accent" : "text-ink hover:text-brand-accent"}`}>
              {item.label}
              {item.active && <span className="absolute inset-x-0 -bottom-0.5 h-0.5 bg-brand-accent" />}
            </Link>
          ))}
        </div>
        {rightSlot && <div className="mt-2 flex justify-end">{rightSlot}</div>}
      </nav>
    </header>
  );
}
