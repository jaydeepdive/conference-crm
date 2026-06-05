"use client";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile, Entity } from "@/lib/types";

export function UsersAdmin({ profiles, entities }: { profiles: Profile[]; entities: Entity[] }) {
  const router = useRouter();

  async function toggleSuperAdmin(p: Profile) {
    const supabase = createClient();
    await supabase.from("profiles").update({ is_super_admin: !p.is_super_admin }).eq("id", p.id);
    router.refresh();
  }

  async function setEntity(p: Profile, entityId: string | null) {
    const supabase = createClient();
    await supabase.from("profiles").update({ entity_id: entityId }).eq("id", p.id);
    router.refresh();
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Email</th>
            <th className="px-3 py-2">Entity</th>
            <th className="px-3 py-2">Super admin?</th>
            <th className="px-3 py-2">Joined</th>
          </tr>
        </thead>
        <tbody>
          {profiles.map(p => (
            <tr key={p.id} className="border-t border-gray-100">
              <td className="px-3 py-2 font-medium">{p.full_name || "—"}</td>
              <td className="px-3 py-2 text-gray-600">{p.email}</td>
              <td className="px-3 py-2">
                <select className="rounded-md border border-gray-300 px-2 py-1 text-xs"
                  value={p.entity_id ?? ""}
                  onChange={e => setEntity(p, e.target.value || null)}>
                  <option value="">— None —</option>
                  {entities.map(en => <option key={en.id} value={en.id}>{en.name}</option>)}
                </select>
              </td>
              <td className="px-3 py-2">
                <button onClick={() => toggleSuperAdmin(p)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${p.is_super_admin ? "bg-brand text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                  {p.is_super_admin ? "Yes — click to revoke" : "No — click to grant"}
                </button>
              </td>
              <td className="px-3 py-2 text-xs text-gray-500">{new Date(p.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
