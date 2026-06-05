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

  // If exactly one conference and no admin powers, auto-redirect into it
  if (conferences.length === 1 && !profile.is_super_admin) {
    redirect(`/conferences/${conferences[0].slug}`);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <h1 className="text-lg font-bold text-brand">Mining Summit CRM</h1>
          <div className="flex items-center gap-4">
            {profile.is_super_admin && (
              <Link href="/admin" className="text-sm font-medium text-brand hover:underline">Admin</Link>
            )}
            <span className="text-sm text-gray-600">{profile.full_name || profile.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h2 className="text-2xl font-bold text-gray-900">Your conferences</h2>
        <p className="mt-1 text-sm text-gray-500">Pick a conference to view its CRM and budget.</p>

        {conferences.length === 0 ? (
          <div className="mt-8 rounded-xl border border-gray-200 bg-white p-8 text-center">
            <p className="text-sm text-gray-600">You don&apos;t have access to any conferences yet.</p>
            {profile.is_super_admin && (
              <Link href="/admin/conferences" className="mt-4 inline-block rounded-md bg-brand px-4 py-2 text-sm font-medium text-white">
                + Create one
              </Link>
            )}
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {conferences.map(c => (
              <Link key={c.id} href={`/conferences/${c.slug}`}
                className="rounded-xl border border-gray-200 bg-white p-5 transition hover:border-brand hover:shadow-md">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">{c.name}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    c.status === "active" ? "bg-emerald-100 text-emerald-800"
                    : c.status === "planning" ? "bg-sky-100 text-sky-800"
                    : c.status === "past" ? "bg-gray-200 text-gray-700"
                    : "bg-gray-100 text-gray-500"
                  }`}>{c.status}</span>
                </div>
                {c.date_start && (
                  <p className="mt-2 text-sm text-gray-500">
                    {c.date_start}{c.date_end && c.date_end !== c.date_start ? ` → ${c.date_end}` : ""}
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
