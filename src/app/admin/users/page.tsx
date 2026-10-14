/**
 * /admin/users — ALL ACCOUNTS (staff CRM version). Same data as the admin
 * console's Accounts tab.
 */
import { UsersAdmin } from "./UsersAdmin";
import { loadAccounts } from "./loadAccounts";
import { requireSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const profile = await requireSuperAdmin();
  const { rows, entities } = await loadAccounts();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">Accounts</h1>
        <p className="text-sm text-muted">
          Every login that exists. <strong>Staff</strong> can use the CRM. <strong>Attendee</strong> logins only reach the
          Above &amp; Beyond portal. <strong>Pending</strong> accounts signed themselves up and have no access until you approve them.
        </p>
      </div>
      <UsersAdmin rows={rows} entities={entities ?? []} currentUserId={profile.id} />
    </div>
  );
}
