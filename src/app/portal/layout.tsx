/**
 * /portal layout — outer shell for the attendee-facing portal.
 * The per-conference nav (Home, Profile, Schedule, ...) lives in
 * /portal/[slug]/layout.tsx. This outer layout only provides the
 * gray-white background so children can render freely.
 */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen flex-col bg-white">{children}</div>;
}
