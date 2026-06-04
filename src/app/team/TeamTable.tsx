"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile, Role } from "@/lib/types";

const ROLES: { value: Role; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "team", label: "Team" },
  { value: "attendee", label: "Attendee" },
  { value: "pending", label: "Pending" },
];

const ROLE_COLORS: Record<Role, string> = {
  admin: "bg-brand text-white",
  team: "bg-emerald-100 text-emerald-800",
  attendee: "bg-sky-100 text-sky-800",
  pending: "bg-gray-100 text-gray-700",
};

export function TeamTable({ profiles }: { profiles: Profile[] }) {
  const router = useRouter();
  const [updating, setUpdating] = useState<string | null>(null);

  async function setRole(id: string, role: Role) {
    setUpdating(id);
    const supabase = createClient();
    await supabase.from("profiles").update({ role }).eq("id", id);
    router.refresh();
    setUpdating(null);
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Email</th>
            <th className="px-3 py-2">Current role</th>
            <th className="px-3 py-2">Change to</th>
            <th className="px-3 py-2">Joined</th>
          </tr>
        </thead>
        <tbody>
          {profiles.map(p => (
            <tr key={p.id} className="border-t border-gray-100">
              <td className="px-3 py-2 font-medium">{p.full_name || "—"}</td>
              <td className="px-3 py-2 text-gray-600">{p.email}</td>
              <td className="px-3 py-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[p.role]}`}>{p.role}</span>
              </td>
              <td className="px-3 py-2">
                <select disabled={updating === p.id}
                  value={p.role}
                  onChange={e => setRole(p.id, e.target.value as Role)}
                  className="rounded-md border border-gray-300 px-2 py-1 text-xs">
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </td>
              <td className="px-3 py-2 text-xs text-gray-500">{new Date(p.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
