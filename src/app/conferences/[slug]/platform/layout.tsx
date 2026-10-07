/**
 * /conferences/[slug]/platform — pass-through layout.
 *
 * The real session-guarded shell lives inside the (authed) route group so
 * that /login and /accept can render without the guard. Route groups don't
 * add path segments.
 */
export const dynamic = "force-dynamic";

export default function PlatformRootLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
