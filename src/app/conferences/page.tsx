import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/SignOutButton";
import { Footer } from "@/components/Footer";
import { TDD_LOGO } from "@/components/Masthead";
import { PageTitle, SectionHeader } from "@/components/SectionHeader";

export const dynamic = "force-dynamic";

function formatToday(): string {
  return new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }).toUpperCase();
}

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
    <div className="flex min-h-screen flex-col bg-white">
      <header className="border-b border-line bg-white">
        <div className="border-b border-line bg-utility">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-2 text-[11px] font-medium uppercase tracking-widest2 text-muted">
            <span>{formatToday()}</span>
            <span className="flex items-center gap-3">
              {profile.is_super_admin && (
                <Link href="/admin" className="text-brand-accent hover:underline">Admin</Link>
              )}
              <span>Mining Summit CRM · internal</span>
            </span>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-6 pt-10 pb-3 text-center">
          <Image src={TDD_LOGO} alt="The Deep Dive" width={420} height={66}
            priority unoptimized className="mx-auto h-12 w-auto sm:h-14" />
          <p className="mt-3 text-[11px] font-medium uppercase tracking-widest2 text-muted">Mining Summit CRM</p>
        </div>

        <div className="mx-auto max-w-7xl px-6"><div className="border-b border-ink"></div></div>

        <nav className="mx-auto max-w-7xl px-6 py-3">
          <div className="flex items-center justify-between text-[12px] uppercase tracking-widest2">
            <span className="font-semibold text-brand-accent">Conferences</span>
            <div className="flex items-center gap-4">
              <span className="normal-case tracking-normal text-muted">{profile.full_name || profile.email}</span>
              <SignOutButton />
            </div>
          </div>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
        <PageTitle title="Conferences" sub="Pick a conference to view its CRM and budget." />

        <div className="mt-8">
          <SectionHeader title="Your conferences" meta={`${conferences.length} TOTAL`} />

          {conferences.length === 0 ? (
            <div className="mt-6 border border-line bg-white p-8 text-center">
              <p className="text-sm text-muted">You don&apos;t have access to any conferences yet.</p>
              {profile.is_super_admin && (
                <Link href="/admin/conferences" className="mt-4 inline-block bg-ink px-4 py-2 text-[11px] uppercase tracking-widest2 text-white hover:bg-brand-accent">
                  + Create one
                </Link>
              )}
            </div>
          ) : (
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {conferences.map(c => (
                <Link key={c.id} href={`/conferences/${c.slug}`}
                  className="group border border-line bg-white p-5 transition hover:border-brand-accent">
                  <div className="flex items-start gap-3">
                    <span className="mt-2 inline-block h-2 w-2 rounded-full bg-brand-accent"></span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h3 className="font-display text-xl font-bold text-ink group-hover:text-brand-accent">{c.name}</h3>
                        <span className={`text-[11px] font-medium uppercase tracking-widest2 ${
                          c.status === "active" ? "text-brand-accent"
                          : c.status === "planning" ? "text-muted"
                          : "text-muted/70"
                        }`}>{c.status}</span>
                      </div>
                      {c.date_start && (
                        <p className="mt-1 text-[11px] uppercase tracking-widest2 text-muted">
                          {c.date_start}{c.date_end && c.date_end !== c.date_start ? ` — ${c.date_end}` : ""}
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
