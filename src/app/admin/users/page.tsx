import { createClient } from "@/lib/supabase/server";
import { UsersAdmin } from "./UsersAdmin";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const supabase = await createClient();
  const [{ data: profiles }, { data: entities }] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at", { ascending: true }),
    supabase.from("entities").select("*"),
  ]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Users</h1>
        <p className="text-sm text-gray-500">All users who have signed in. Promote super admins, tag entities.</p>
      </div>
      <UsersAdmin profiles={profiles ?? []} entities={entities ?? []} />
    </div>
  );
}
