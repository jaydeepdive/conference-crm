/**
 * Mobile-first bottom tab bar (phone) / inline horizontal nav (sm+) for the
 * /conferences/[slug]/platform/* surface. Dark Above & Beyond styling:
 * ivory text on charcoal, gold for the active item.
 */
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const GOLD = "#c9a24b";
const IVORY = "#f5f0e6";
const GREY = "#b5b0a6";

export function PlatformNav({ slug }: { slug: string }) {
  const path = usePathname();
  const base = `/conferences/${slug}/platform`;
  const items = [
    { href: `${base}`,           label: "Schedule" },
    { href: `${base}/directory`, label: "Directory" },
    { href: `${base}/inbox`,     label: "Inbox" },
    { href: `${base}/settings`,  label: "Settings" },
  ].map(item => ({
    ...item,
    active: item.href === base ? path === base : path === item.href || path.startsWith(item.href + "/"),
  }));

  return (
    <>
      {/* Inline nav on sm+ screens */}
      <nav className="mx-auto hidden max-w-3xl gap-6 px-4 pb-2 text-xs uppercase tracking-[0.18em] sm:flex sm:px-6">
        {items.map(it => (
          <Link key={it.href} href={it.href}
            className="border-b-2 py-2"
            style={{
              color: it.active ? GOLD : IVORY,
              borderColor: it.active ? GOLD : "transparent",
            }}>
            {it.label}
          </Link>
        ))}
      </nav>
      {/* Bottom tab bar on small screens */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t sm:hidden"
        style={{ backgroundColor: "#141414", borderColor: "#2a2a2a" }}>
        {items.map(it => (
          <Link key={it.href} href={it.href}
            className="flex-1 py-3 text-center text-[11px] font-medium uppercase tracking-[0.12em]"
            style={{ minHeight: 48, color: it.active ? GOLD : GREY }}>
            {it.label}
            {it.active && <div className="mx-auto mt-1 h-0.5 w-6 rounded-full" style={{ backgroundColor: GOLD }} />}
          </Link>
        ))}
      </nav>
    </>
  );
}
