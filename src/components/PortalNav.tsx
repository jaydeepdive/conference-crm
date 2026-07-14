"use client";
/**
 * PortalNav — highlights the current /portal/[slug]/... route in the shared
 * PortalMasthead. Client component so it can call usePathname().
 */
import { usePathname } from "next/navigation";
import { PortalMasthead } from "./PortalMasthead";

export function PortalNav({
  conferenceName, slug, subtitle, viewerLabel,
}: {
  conferenceName: string;
  slug: string;
  subtitle?: string;
  viewerLabel: string;
}) {
  const path = usePathname();
  const base = `/portal/${slug}`;
  const items = [
    { href: base, label: "Home" },
    { href: `${base}/profile`, label: "Profile" },
    { href: `${base}/schedule`, label: "Schedule" },
    { href: `${base}/inbox`, label: "Inbox" },
    { href: `${base}/meetings`, label: "Meetings" },
    { href: `${base}/invoices`, label: "Invoices" },
  ].map(item => {
    const active = item.href === base ? path === base : (path === item.href || path.startsWith(item.href + "/"));
    return { ...item, active };
  });

  return (
    <PortalMasthead
      conferenceName={conferenceName}
      subtitle={subtitle}
      navItems={items}
      viewerLabel={viewerLabel}
    />
  );
}
