/**
 * /portal — landing page.
 * Redirects to the attendee's one conference (typical case), or shows a picker
 * if they attend multiple.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAttendeeProfilesForCurrentUser } from "@/lib/portal";
import { PortalFooter } from "@/components/PortalFooter";
import type { Conference } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PortalHomePage() {
  const profiles = await getAttendeeProfilesForCurrentUser();
  if (profiles.length === 0) {
    // Signed in, but no attendee_profile — likely a staff-only user landed here.
    // Send them home to the staff app.
    redirect("/conferences");
  }

  const supabase = await createClient();
  const { data: confs } = await supabase
    .from("conferences").select("*")
    .in("id", profiles.map(p => p.conference_id));
  const list = ((confs ?? []) as Conference[]).sort((a, b) => a.name.localeCompare(b.name));

  if (list.length === 1) redirect(`/portal/${list[0].slug}`);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-white py-6 text-center">
        <p className="text-[11px] font-medium uppercase tracking-widest2 text-muted">Attendee portal</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-ink">Choose a conference</h1>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <div className="grid gap-4">
          {list.map(c => (
            <Link key={c.id} href={`/portal/${c.slug}`}
              className="group border border-line bg-white p-5 transition hover:border-brand-accent">
              <h3 className="font-display text-xl font-bold text-ink group-hover:text-brand-accent">{c.name}</h3>
              {c.date_start && (
                <p className="mt-1 text-[11px] uppercase tracking-widest2 text-muted">
                  {c.date_start}{c.date_end && c.date_end !== c.date_start ? ` — ${c.date_end}` : ""}
                </p>
              )}
            </Link>
          ))}
        </div>
      </main>
      <PortalFooter />
    </div>
  );
}
