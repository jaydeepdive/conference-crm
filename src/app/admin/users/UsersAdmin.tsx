"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile, Entity } from "@/lib/types";
import { SetPasswordDialog } from "@/components/SetPasswordDialog";

export type AccountRow = Profile & {
  account_type: "staff" | "attendee" | "pending";
  confirmed: boolean;
  last_sign_in_at: string | null;
  attendee_of: string | null;
};

const TYPE_STYLE: Record<AccountRow["account_type"], string> = {
  staff: "bg-ink text-white",
  attendee: "bg-amber-100 text-amber-900",
  pending: "bg-rose-100 text-rose-800",
};

function fmt(d: string | null) {
  return d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Never";
}

export function UsersAdmin({ rows, entities, currentUserId }: {
  rows: AccountRow[]; entities: Entity[]; currentUserId: string;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | AccountRow["account_type"]>("all");
  const order = { pending: 0, staff: 1, attendee: 2 } as const;
  const profiles = [...rows]
    .filter(r => filter === "all" || r.account_type === filter)
    .sort((a, b) => order[a.account_type] - order[b.account_type] || a.email.localeCompare(b.email));
  const counts = { all: rows.length, staff: 0, attendee: 0, pending: 0 } as Record<string, number>;
  rows.forEach(r => { counts[r.account_type]++; });

  async function setType(p: AccountRow, t: AccountRow["account_type"]) {
    if (t === "staff" && !confirm(`Give ${p.email} STAFF access to the CRM?`)) return;
    setError(null);
    const res = await fetch(`/api/admin/users/${encodeURIComponent(p.id)}/type`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ account_type: t }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error ?? "Could not update"); return; }
    router.refresh();
  }
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pwFor, setPwFor] = useState<AccountRow | null>(null);

  async function toggleSuperAdmin(p: AccountRow) {
    const supabase = createClient();
    await supabase.from("profiles").update({ is_super_admin: !p.is_super_admin }).eq("id", p.id);
    router.refresh();
  }

  async function setEntity(p: AccountRow, entityId: string | null) {
    const supabase = createClient();
    await supabase.from("profiles").update({ entity_id: entityId }).eq("id", p.id);
    router.refresh();
  }

  async function deleteUser(p: AccountRow) {
    const label = p.full_name ? `${p.full_name} (${p.email})` : p.email;
    if (!confirm(
      `Delete ${label}?\n\n` +
      `This removes their account entirely. Their attribution on invoices, activity, ` +
      `and leads becomes "—" but that data is preserved.\n\n` +
      `This cannot be undone.`
    )) return;

    setError(null); setDeletingId(p.id);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(p.id)}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Delete failed");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally { setDeletingId(null); }
  }

  return (
    <div className="space-y-3">
      {error && <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}

      <div className="flex flex-wrap gap-2">
        {(["all", "pending", "staff", "attendee"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`border px-3 py-2 text-xs font-semibold uppercase tracking-widest2 ${filter === f ? "border-ink bg-ink text-white" : "border-line bg-white text-ink"}`}>
            {f === "all" ? "All" : f === "pending" ? "Pending approval" : f === "staff" ? "Staff" : "Attendees"} ({counts[f]})
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Last sign-in</th>
              <th className="px-3 py-2">Entity</th>
              <th className="px-3 py-2">Super admin?</th>
              <th className="px-3 py-2">Joined</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {profiles.map(p => (
              <tr key={p.id} className="border-t border-gray-100">
                <td className="px-3 py-2 font-medium">
                  {p.full_name || "—"}
                  {p.id === currentUserId && <span className="ml-2 text-[10px] uppercase tracking-widest2 text-muted">(you)</span>}
                </td>
                <td className="px-3 py-2 text-gray-600">
                  {p.email}
                  {!p.confirmed && <div className="text-[11px] text-rose-700">Email never confirmed</div>}
                  {p.attendee_of && <div className="text-[11px] text-muted">{p.attendee_of}</div>}
                </td>
                <td className="px-3 py-2">
                  <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest2 ${TYPE_STYLE[p.account_type]}`}>
                    {p.account_type}
                  </span>
                  {p.id !== currentUserId && !p.is_super_admin && (
                    <div className="mt-1 flex gap-2 text-[11px]">
                      {p.account_type !== "staff" && <button onClick={() => setType(p, "staff")} className="font-semibold text-emerald-700 hover:underline">Make staff</button>}
                      {p.account_type === "staff" && <button onClick={() => setType(p, "pending")} className="font-semibold text-rose-700 hover:underline">Revoke CRM access</button>}
                      {p.account_type === "pending" && p.attendee_of && <button onClick={() => setType(p, "attendee")} className="font-semibold text-amber-800 hover:underline">Attendee only</button>}
                    </div>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-500">{fmt(p.last_sign_in_at)}</td>
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
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <div className="inline-flex items-center gap-4">
                    <button onClick={() => setPwFor(p)}
                      className="text-xs font-semibold uppercase tracking-widest2 text-ink hover:underline">
                      Set password
                    </button>
                    {p.id !== currentUserId && (
                      <button onClick={() => deleteUser(p)} disabled={deletingId === p.id}
                        className="text-xs font-semibold uppercase tracking-widest2 disabled:opacity-50"
                        style={{ color: "#C8102E" }}>
                        {deletingId === p.id ? "Deleting…" : "Delete"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SetPasswordDialog
        open={pwFor !== null}
        onClose={() => setPwFor(null)}
        who={pwFor?.full_name || pwFor?.email || ""}
        email={pwFor?.email ?? ""}
        endpoint={pwFor ? `/api/admin/users/${encodeURIComponent(pwFor.id)}/password` : ""}
      />
    </div>
  );
}
