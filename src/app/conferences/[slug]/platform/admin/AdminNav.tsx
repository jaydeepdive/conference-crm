"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const GOLD = "#c9a24b";
const IVORY = "#f5f0e6";

export function AdminNav({ slug }: { slug: string }) {
  const path = usePathname();
  const base = `/conferences/${slug}/platform/admin`;
  const items = [
    { href: base, label: "Overview", exact: true as boolean },
    { href: `${base}/meetings`, label: "Meetings", exact: false },
    { href: `${base}/attendees`, label: "Attendees", exact: false },
    { href: `${base}/profiles`, label: "Company profiles", exact: false },
    { href: `${base}/day1`, label: "Day 1", exact: false },
    { href: `${base}/accounts`, label: "Accounts", exact: false },
  ];
  return (
    <nav className="mx-auto flex max-w-7xl gap-5 overflow-x-auto px-4 text-xs uppercase tracking-[0.18em] sm:gap-7 sm:px-6">
      {items.map(it => {
        const active = it.exact ? path === it.href : path === it.href || path.startsWith(it.href + "/");
        return (
          <Link key={it.href} href={it.href}
            className="shrink-0 whitespace-nowrap border-b-2 py-3"
            style={{ color: active ? GOLD : IVORY, borderColor: active ? GOLD : "transparent" }}>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
