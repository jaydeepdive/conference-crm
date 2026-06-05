"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CONFERENCE_ROLES } from "@/lib/constants";
import type { Profile, ConferenceMembership, ConferenceRole } from "@/lib/types";

export function MembershipManager({ conferenceId, profiles, memberships, isSuperAdmin }: {
  conferenceId: string;
  profiles: Profile[];
  memberships: ConferenceMembership[];
  isSuperAdmin: boolean;
}) {
  const router = useRouter();

  const membershipByProfile = new Map(memberships.map(m => [m.profile_id, m]));

  async function setRole(profileId: string, role: ConferenceRole | "none") {
    const supabase = createClient();
    const existing = membershipByProfile.get(profileId);
    if (role === "none") {
      if (existing) await supabase.from("conference_memberships").delete().eq("id", existing.id);
    } else {
      if (existing) {
        await supabase.from("conference_memberships").update({ role }).eq("id", existing.id);
      } else {
        await supabase.from("conference_memberships").insert({
          profile_id: profileId, conference_id: conferenceId, role,
        });
      }
    }
    router.refresh();
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Email</th>
            {isSuperAdmin && <th className="px-3 py-2">Super admin?</th>}
            <th className="px-3 py-2">Role on this conference</th>
          </tr>
        </thead>
        <tbody>
          {profiles.map(p => {
            const m = membershipByProfile.get(p.id);
            return (
              <tr key={p.id} className="border-t border-gray-100">
                <td className="px-3 py-2 font-medium">{p.full_name || "—"}</td>
                <td className="px-3 py-2 text-gray-600">{p.email}</td>
                {isSuperAdmin && (
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.is_super_admin ? "bg-brand text-white" : "bg-gray-100 text-gray-600"}`}>
                      {p.is_super_admin ? "Yes" : "No"}
                    </span>
                  </td>
                )}
                <td className="px-3 py-2">
                  <select className="rounded-md border border-gray-300 px-2 py-1 text-xs"
                    value={m?.role ?? "none"}
                    onChange={e => setRole(p.id, e.target.value as ConferenceRole | "none")}>
                    <option value="none">— No access —</option>
                    {CONFERENCE_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                  {m && (
                    <div className="mt-1 text-xs text-gray-400">
                      {CONFERENCE_ROLES.find(r => r.value === m.role)?.description}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
