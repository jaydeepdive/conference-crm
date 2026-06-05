"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "./SignOutButton";
import { canSeePayments, canManageTeam, type Profile, type Conference, type ConferenceRole } from "@/lib/types";

type Role = ConferenceRole | "super_admin";

export function ConferenceNav({ profile, conference, role }: {
  profile: Profile; conference: Conference; role: Role;
}) {
  const path = usePathname();
  const base = `/conferences/${conference.slug}`;

  const nav: { href: string; label: string; show: boolean }[] = [
    { href: base, label: "Dashboard", show: true },
    { href: `${base}/companies`, label: "Companies", show: true },
    { href: `${base}/investors`, label: "Investors", show: true },
    { href: `${base}/activity`, label: "Activity", show: true },
    { href: `${base}/budget`, label: "Budget", show: canSeePayments(role) },
    { href: `${base}/team`, label: "Team", show: canManageTeam(role) },
    { href: `${base}/settings`, label: "Settings", show: canSeePayments(role) },
  ].filter(n => n.show);

  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href="/conferences" className="text-sm text-gray-500 hover:text-gray-900">← All conferences</Link>
          <div className="border-l border-gray-200 pl-6">
            <Link href={base} className="text-lg font-bold text-brand">{conference.name}</Link>
          </div>
          <div className="flex items-center gap-1">
            {nav.map(item => {
              const active = path === item.href || (item.href !== base && path.startsWith(item.href + "/"));
              const isDashboard = item.href === base;
              const matches = isDashboard ? path === base : active;
              return (
                <Link key={item.href} href={item.href}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${matches ? "bg-brand-light text-brand" : "text-gray-600 hover:bg-gray-100"}`}>
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-4">
          {profile.is_super_admin && (
            <Link href="/admin" className="text-sm font-medium text-brand hover:underline">Admin</Link>
          )}
          <span className="text-sm text-gray-600">{profile.full_name || profile.email}</span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">{role.replace("_", " ")}</span>
          <SignOutButton />
        </div>
      </div>
    </nav>
  );
}
