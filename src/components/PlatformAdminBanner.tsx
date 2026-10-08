"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

/**
 * Red/orange banner shown at the top of /platform when the viewer is a
 * super admin impersonating an attendee. Lets them switch to another
 * attendee or exit impersonation.
 */
export function PlatformAdminBanner({
  slug, impersonatedName, impersonatedEntity,
}: {
  slug: string;
  impersonatedName: string;
  impersonatedEntity: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function exit() {
    setBusy(true);
    await fetch("/api/platform/admin/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clear: true }),
    });
    setBusy(false);
    router.push(`/conferences/${slug}/platform/admin`);
    router.refresh();
  }

  return (
    <div className="bg-amber-500 text-black">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs sm:px-6">
        <div className="min-w-0 flex-1 truncate">
          <span className="font-semibold uppercase tracking-wide">Previewing</span>
          <span className="ml-2">
            as <strong>{impersonatedName}</strong>{" "}
            <span className="opacity-70">({impersonatedEntity})</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/conferences/${slug}/platform/admin/attendees`}
            className="rounded border border-black/20 bg-white/80 px-2 py-1 font-semibold uppercase tracking-wide hover:bg-white"
          >
            Switch
          </Link>
          <button
            onClick={exit}
            disabled={busy}
            className="rounded border border-black/20 bg-white/80 px-2 py-1 font-semibold uppercase tracking-wide hover:bg-white disabled:opacity-50"
          >
            {busy ? "…" : "← Back to admin"}
          </button>
        </div>
      </div>
    </div>
  );
}
