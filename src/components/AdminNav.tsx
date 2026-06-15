"use client";
import { usePathname } from "next/navigation";
import { Masthead } from "./Masthead";
import type { Profile } from "@/lib/types";

export function AdminNav({ profile }: { profile: Profile }) {
  const path = usePathname();
  const items = [
    { href: "/admin", label: "Overview", active: path === "/admin" },
    { href: "/admin/conferences", label: "Conferences", active: path.startsWith("/admin/conferences") },
    { href: "/admin/entities", label: "Entities", active: path.startsWith("/admin/entities") },
    { href: "/admin/users", label: "Users", active: path.startsWith("/admin/users") },
  ];
  return <Masthead profile={profile} title="Mining Summit CRM" subtitle="Super admin" navItems={items} />;
}
