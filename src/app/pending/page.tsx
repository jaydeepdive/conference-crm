import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { SignOutButton } from "@/components/SignOutButton";

export const dynamic = "force-dynamic";

export default async function PendingPage() {
  const profile = await getCurrentProfile({ allowNonStaff: true });
  let portalHref: string | null = null;
  if (profile.account_type === "attendee") {
    const svc = createServiceClient();
    const { data: a } = await svc.from("attendee_profiles").select("conference_id").eq("user_id", profile.id).limit(1).maybeSingle();
    if (a) {
      const { data: c } = await svc.from("conferences").select("slug").eq("id", a.conference_id).maybeSingle();
      if (c) portalHref = `/conferences/${c.slug}/platform`;
    }
  }
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md border border-line bg-white p-8 text-center">
        {profile.account_type === "attendee" ? (
          <>
            <h1 className="font-display text-2xl font-bold text-ink">This is the staff CRM</h1>
            <p className="mt-3 text-sm text-muted">
              You&apos;re signed in as <span className="font-medium text-ink">{profile.email}</span>, which is an attendee login.
            </p>
            {portalHref && (
              <Link href={portalHref} className="mt-5 inline-block bg-brand-accent px-5 py-3 text-xs font-semibold uppercase tracking-widest2 text-white">
                Go to the attendee portal
              </Link>
            )}
          </>
        ) : (
          <>
            <h1 className="font-display text-2xl font-bold text-ink">Waiting for approval</h1>
            <p className="mt-3 text-sm text-muted">
              You&apos;re signed in as <span className="font-medium text-ink">{profile.email}</span>. An administrator needs to approve
              this account before it can access the CRM.
            </p>
          </>
        )}
        <div className="mt-6"><SignOutButton /></div>
      </div>
    </div>
  );
}
