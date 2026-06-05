"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "./SignOutButton";
import type { Profile } from "@/lib/types";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/companies", label: "Companies" },
  { href: "/investors", label: "Investors" },
  { href: "/activity", label: "Activity" },
];

export function Nav({ profile }: { profile: Profile }) {
  const path = usePathname();
  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="text-lg font-bold text-brand">Mining Summit CRM</Link>
          <div className="flex items-center gap-1">
            {NAV.map(item => {
              const active = path === item.href || path.startsWith(item.href + "/");
              return (
                <Link key={item.href} href={item.href}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${active ? "bg-brand-light text-brand" : "text-gray-600 hover:bg-gray-100"}`}>
                  {item.label}
                </Link>
              );
            })}
            {profile.role === "admin" && (
              <Link href="/team" className={`rounded-md px-3 py-1.5 text-sm font-medium ${path.startsWith("/team") ? "bg-brand-light text-brand" : "text-gray-600 hover:bg-gray-100"}`}>
                Team
              </Link>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">{profile.full_name || profile.email}</span>
          <SignOutButton />
        </div>
      </div>
    </nav>
  );
}
