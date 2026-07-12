"use client";
import { usePathname } from "next/navigation";
import { Masthead } from "./Masthead";
import { canSeePayments, canManageTeam, canSendInvoices, canSendGeneralEmail, type Profile, type Conference, type ConferenceRole } from "@/lib/types";

type Role = ConferenceRole | "super_admin";

export function ConferenceNav({ profile, conference, role }: {
  profile: Profile; conference: Conference; role: Role;
}) {
  const path = usePathname();
  const base = `/conferences/${conference.slug}`;

  const items = [
    { href: base, label: "Dashboard", show: true },
    { href: `${base}/companies`, label: "Companies", show: true },
    { href: `${base}/investors`, label: "Investors", show: true },
    { href: `${base}/activity`, label: "Activity", show: true },
    { href: `${base}/invoices`, label: "Invoices", show: canSendInvoices(role) },
    { href: `${base}/emails`, label: "Emails", show: canSendGeneralEmail(role) },
    { href: `${base}/budget`, label: "Budget", show: canSeePayments(role) },
    { href: `${base}/tasks`, label: "Tasks", show: true },
    { href: `${base}/team`, label: "Team", show: canManageTeam(role) },
    { href: `${base}/settings`, label: "Settings", show: canSeePayments(role) },
  ].filter(n => n.show).map(item => {
    const active = item.href === base ? path === base : path === item.href || path.startsWith(item.href + "/");
    return { href: item.href, label: item.label, active };
  });

  const dateLine = conference.date_start
    ? `${conference.date_start}${conference.date_end && conference.date_end !== conference.date_start ? ` — ${conference.date_end}` : ""}`
    : "";

  // Only super admins see the role label. Everyone else just sees the conference name + dates.
  const subtitle = role === "super_admin"
    ? `${conference.name}${dateLine ? ` · ${dateLine}` : ""} · super admin`
    : `${conference.name}${dateLine ? ` · ${dateLine}` : ""}`;

  return (
    <Masthead profile={profile} title="Mining Summit CRM"
      subtitle={subtitle}
      navItems={items} showAdminLink={true} />
  );
}
