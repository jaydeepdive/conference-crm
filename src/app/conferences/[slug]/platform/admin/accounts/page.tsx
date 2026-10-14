/**
 * Admin console → Accounts. Every login that exists (staff, attendee,
 * pending sign-ups). Super admin only (enforced by the admin layout).
 */
import { createClient } from "@/lib/supabase/server";
import { UsersAdmin } from "@/app/admin/users/UsersAdmin";
import { loadAccounts } from "@/app/admin/users/loadAccounts";

export const dynamic = "force-dynamic";

export default async function ConsoleAccountsPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  const { rows, entities } = await loadAccounts();
  return (
    <div className="space-y-5">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-brand-accent">Admin</div>
        <h1 className="mt-1 font-display text-3xl font-medium sm:text-4xl">Accounts</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Every login that exists. <strong>Staff</strong> can use the CRM. <strong>Attendee</strong> logins only reach this
          portal. <strong>Pending</strong> accounts signed themselves up and have no access until you approve them.
        </p>
      </div>
      <UsersAdmin rows={rows} entities={entities} currentUserId={user?.id ?? ""} />
    </div>
  );
}
