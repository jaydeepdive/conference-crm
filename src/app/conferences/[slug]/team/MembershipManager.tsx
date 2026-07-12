"use client";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CONFERENCE_ROLES } from "@/lib/constants";
import type { Profile, ConferenceMembership, ConferenceRole, ConfVisibility } from "@/lib/types";

export function MembershipManager({
  conferenceId, conferenceVisibility, profiles, memberships, isSuperAdmin,
}: {
  conferenceId: string;
  conferenceVisibility: ConfVisibility;
  profiles: Profile[];
  memberships: ConferenceMembership[];
  isSuperAdmin: boolean;
}) {
  const router = useRouter();
  const membershipByProfile = new Map(memberships.map(m => [m.profile_id, m]));
  const isPrivate = conferenceVisibility === "private";

  async function setRole(profileId: string, role: ConferenceRole | "default") {
    const supabase = createClient();
    const existing = membershipByProfile.get(profileId);
    if (role === "default") {
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
    <div className="space-y-4">
      <div className="rounded border border-line bg-utility p-4 text-sm">
        {isPrivate ? (
          <>
            <strong className="text-ink">This conference is PRIVATE.</strong> Only users you
            explicitly grant a role to below will see it. Everyone else is locked out.
            Change the visibility in <em>Admin → Conferences</em>.
          </>
        ) : (
          <>
            <strong className="text-ink">This conference is PUBLIC.</strong> Every user has
            full access by default. Pick a specific role below to restrict a user, or{" "}
            <span className="font-semibold">Hidden</span> to remove the conference from their
            view entirely. Change the visibility in <em>Admin → Conferences</em>.
          </>
        )}
      </div>

      <div className="overflow-x-auto border border-line bg-white">
        <table className="w-full text-sm">
          <thead className="bg-utility text-left text-[10px] font-medium uppercase tracking-widest2 text-muted">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              {isSuperAdmin && <th className="px-3 py-2">Super admin?</th>}
              <th className="px-3 py-2">Access</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map(p => {
              const m = membershipByProfile.get(p.id);
              const currentValue: ConferenceRole | "default" = m ? m.role : "default";
              const isHidden = m?.role === "hidden";
              const isLockedOut = isPrivate && !m;
              return (
                <tr key={p.id} className="border-t border-line">
                  <td className="px-3 py-2 font-medium">{p.full_name || "—"}</td>
                  <td className="px-3 py-2 text-muted">{p.email}</td>
                  {isSuperAdmin && (
                    <td className="px-3 py-2">
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest2"
                        style={{
                          backgroundColor: p.is_super_admin ? "#C8102E" : "#F5F5F5",
                          color: p.is_super_admin ? "#FFFFFF" : "#6B6B6B",
                        }}>
                        {p.is_super_admin ? "Yes" : "No"}
                      </span>
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <select className="rounded-md border border-line bg-white px-2 py-1 text-xs"
                      value={currentValue}
                      onChange={e => setRole(p.id, e.target.value as ConferenceRole | "default")}
                      style={
                        isHidden || isLockedOut
                          ? { color: "#C8102E", fontWeight: 600 }
                          : {}
                      }>
                      {isPrivate ? (
                        <>
                          <option value="default">🚫 No access (default)</option>
                          <option disabled>─── Grant a role ───</option>
                          {CONFERENCE_ROLES.filter(r => r.value !== "hidden").map(r => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </>
                      ) : (
                        <>
                          <option value="default">✓ Full access (default)</option>
                          <option disabled>─── Restrict to ───</option>
                          {CONFERENCE_ROLES.filter(r => r.value !== "hidden").map(r => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                          <option disabled>─────────────</option>
                          <option value="hidden">🚫 Hidden (no access)</option>
                        </>
                      )}
                    </select>
                    {m && (
                      <div className="mt-1 text-[10px] uppercase tracking-widest2 text-muted">
                        {CONFERENCE_ROLES.find(r => r.value === m.role)?.description}
                      </div>
                    )}
                    {isLockedOut && (
                      <div className="mt-1 text-[10px] uppercase tracking-widest2" style={{ color: "#C8102E" }}>
                        Currently locked out — pick a role to invite
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
