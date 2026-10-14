/**
 * Loads every login (staff, attendee, pending) enriched with Supabase Auth
 * confirmed / last-sign-in info. Shared by /admin/users (staff CRM) and the
 * A&B admin console Accounts tab. Caller must already be a super admin.
 */
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { Profile, Entity } from "@/lib/types";
import type { AccountRow } from "./UsersAdmin";

export async function loadAccounts(): Promise<{ rows: AccountRow[]; entities: Entity[] }> {
  const supabase = await createClient();
  const svc = createServiceClient();

  const authUsers: { id: string; email_confirmed_at?: string | null; last_sign_in_at?: string | null; created_at: string }[] = [];
  for (let page = 1; page < 20; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data) break;
    authUsers.push(...data.users);
    if (data.users.length < 200) break;
  }
  const authById = new Map(authUsers.map(u => [u.id, u]));

  const [{ data: profiles }, { data: entities }, { data: atts }, { data: cos }, { data: invs }] = await Promise.all([
    svc.from("profiles").select("*").order("created_at", { ascending: true }),
    supabase.from("entities").select("*"),
    svc.from("attendee_profiles").select("user_id, lead_type, lead_id").not("user_id", "is", null),
    svc.from("companies").select("id, name"),
    svc.from("investors").select("id, firm_name, contact_name"),
  ]);
  const coName = new Map((cos ?? []).map(c => [c.id, c.name as string]));
  const invName = new Map((invs ?? []).map(i => [i.id, (i.firm_name || i.contact_name || "Investor") as string]));
  const attendeeOf = new Map<string, string>();
  for (const a of atts ?? []) {
    const n = a.lead_type === "company" ? coName.get(a.lead_id) : invName.get(a.lead_id);
    if (a.user_id && n) attendeeOf.set(a.user_id, `${a.lead_type === "company" ? "Company" : "Investor"} · ${n}`);
  }

  const rows: AccountRow[] = ((profiles ?? []) as Profile[]).map(p => {
    const u = authById.get(p.id);
    return {
      ...p,
      account_type: p.account_type ?? "pending",
      confirmed: !!u?.email_confirmed_at,
      last_sign_in_at: u?.last_sign_in_at ?? null,
      attendee_of: attendeeOf.get(p.id) ?? null,
    };
  });
  return { rows, entities: (entities ?? []) as Entity[] };
}
