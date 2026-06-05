import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const supabase = await createClient();
  const [{ count: confCount }, { count: entCount }, { count: userCount }] = await Promise.all([
    supabase.from("conferences").select("*", { count: "exact", head: true }),
    supabase.from("entities").select("*", { count: "exact", head: true }),
    supabase.from("profiles").select("*", { count: "exact", head: true }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Super Admin</h1>
        <p className="text-sm text-gray-500">Global controls for all conferences, entities, and users.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <AdminCard href="/admin/conferences" title="Conferences" count={confCount ?? 0} blurb="Create + configure conferences. Set JV revenue splits." />
        <AdminCard href="/admin/entities" title="Entities" count={entCount ?? 0} blurb="Parent organizations / JV partners. Visible to super admins only." />
        <AdminCard href="/admin/users" title="Users" count={userCount ?? 0} blurb="Promote super admins, tag entities, manage global access." />
      </div>
    </div>
  );
}

function AdminCard({ href, title, count, blurb }: { href: string; title: string; count: number; blurb: string }) {
  return (
    <Link href={href} className="rounded-xl border border-gray-200 bg-white p-5 transition hover:border-brand hover:shadow-md">
      <div className="flex items-baseline justify-between">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <span className="text-2xl font-bold text-brand">{count}</span>
      </div>
      <p className="mt-2 text-sm text-gray-500">{blurb}</p>
    </Link>
  );
}
