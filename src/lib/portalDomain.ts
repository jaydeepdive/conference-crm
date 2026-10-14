/**
 * The attendee-facing domain. On this host ONLY the Above & Beyond portal is
 * reachable — the staff CRM (thedeepdive.ca branded) never renders here.
 */
export const PORTAL_ORIGIN = "https://crm.abovebeyondsummit.com";
export const PORTAL_DEFAULT_SLUG = "mining-summit-2026";

export function isPortalHost(host: string | null | undefined): boolean {
  return !!host && host.toLowerCase().split(":")[0].endsWith("abovebeyondsummit.com");
}
