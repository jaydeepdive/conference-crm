/**
 * Sign-out button for the /platform surface. Calls supabase.auth.signOut()
 * and bounces to the platform login page for THIS conference.
 * Styled for the dark Above & Beyond header (light text).
 */
"use client";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function PlatformSignOut({ slug, compact }: { slug: string; compact?: boolean }) {
  const router = useRouter();
  async function signOut() {
    await fetch("/api/platform/logout", { method: "POST" }).catch(() => null);
    await createClient().auth.signOut().catch(() => null);
    router.push(`/conferences/${slug}/platform/login`);
    router.refresh();
  }
  return (
    <button onClick={signOut}
      className={`shrink-0 text-xs uppercase tracking-[0.18em] hover:opacity-80 ${compact ? "" : "underline"}`}
      style={{ minHeight: compact ? undefined : 44, color: "#e8cf8f" }}>
      Sign out
    </button>
  );
}
