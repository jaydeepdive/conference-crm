/**
 * Mobile-first bottom tab bar (phone) / inline horizontal nav (sm+) for the
 * /conferences/[slug]/platform/* surface. Pure client component so it can
 * highlight the current route via usePathname().
 */
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function PlatformNav({ slug }: { slug: string }) {
  const path = usePathname();
  const base = `/conferences/${slug}/platform`;
  const items = [
    { href: `${base}`,          label: "Schedule" },
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
      <nav className="mx-auto hidden max-w-3xl gap-4 px-4 pb-2 text-sm sm:flex sm:px-6">
        {items.map(it => (
          <Link key={it.href} href={it.href}
            className={`rounded-md px-3 py-1.5 ${it.active ? "bg-slate-900 text-white" : "text-slate-700 hover:text-slate-900"}`}>
            {it.label}
          </Link>
        ))}
      </nav>
      {/* Bottom tab bar on small screens */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-slate-200 bg-white sm:hidden">
        {items.map(it => (
          <Link key={it.href} href={it.href}
            className={`flex-1 py-3 text-center text-xs font-medium ${it.active ? "text-slate-900" : "text-slate-500"}`}
            style={{ minHeight: 44 }}>
            {it.label}
            {it.active && <div className="mx-auto mt-1 h-0.5 w-6 rounded-full bg-slate-900" />}
          </Link>
        ))}
      </nav>
    </>
  );
}
