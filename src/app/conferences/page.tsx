import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/SignOutButton";

export const dynamic = "force-dynamic";

export default async function ConferencesPage() {
  const profile = await getCurrentProfile();
  const supabase = await createClient();
  const { data: confs } = await supabase
    .from("conferences").select("*").order("date_start", { ascending: false, nullsFirst: false });

  const conferences = confs ?? [];

  if (conferences.length === 1 && !profile.is_super_admin) {
    redirect(`/conferences/${conferences[0].slug}`);
  }

  return (
    <div className="min-h-screen bg-cream">
      <header className="border-b border-ink bg-cream">
        <div className="border-b border-ink/20">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-2 text-xs uppercase tracking-widest2 text-ink/60">
            <span>Welcome</span>
            <div className="flex items-center gap-4">
              {profile.is_super_admin && (
                <Link href="/admin" className="text-brand-accent hover:underline">Admin</Link>
              )}
              <span className="text-ink/70 normal-case tracking-normal">{profile.full_name || profile.email}</span>
              <SignOutButton />
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-6 pt-10 pb-6 text-center">
          <h1 className="text-4xl font-serif font-black uppercase tracking-tight text-ink sm:text-5xl">Mining Summit CRM</h1>
          <p className="mt-2 text-xs uppercase tracking-widest2 text-ink/60">All conferences</p>
        </div>

        <div className="mx-auto max-w-7xl px-6">
          <div className="masthead-rule" />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <h2 className="font-serif text-2xl font-bold text-ink">Your conferences</h2>
        <p className="mt-1 text-sm text-ink/60">Pick a conference to view its CRM and budget.</p>

        {conferences.length === 0 ? (
          <div className="mt-8 rounded-lg border border-ink/20 bg-white p-8 text-center">
            <p className="text-sm text-ink/70">You don&apos;t have access to any conferences yet.</p>
            {profile.is_super_admin && (
              <Link href="/admin/conferences" className="mt-4 inline-block bg-ink px-4 py-2 text-sm font-medium uppercase tracking-widest2 text-cream hover:bg-brand-accent">
                + Create one
              </Link>
            )}
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {conferences.map(c => (
              <Link key={c.id} href={`/conferences/${c.slug}`}
                className="group border border-ink/20 bg-white p-5 transition hover:border-brand-accent">
                <div className="flex items-center justify-between">
                  <h3 className="font-serif text-xl font-semibold text-ink group-hover:text-brand-accent">{c.name}</h3>
                  <span className={`text-xs font-medium uppercase tracking-widest2 ${
                    c.status === "active" ? "text-brand-accent"
                    : c.status === "planning" ? "text-ink/70"
                    : c.status === "past" ? "text-ink/50"
                    : "text-ink/40"
                  }`}>{c.status}</span>
                </div>
                {c.date_start && (
                  <p className="mt-2 text-xs uppercase tracking-widest2 text-ink/50">
                    {c.date_start}{c.date_end && c.date_end !== c.date_start ? ` — ${c.date_end}` : ""}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
