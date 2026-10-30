/** Map auth user id → last_sign_in_at (null if they have never signed in). */
import { createServiceClient } from "@/lib/supabase/service";

export async function lastSignIns(): Promise<Map<string, string | null>> {
  const svc = createServiceClient();
  const out = new Map<string, string | null>();
  for (let page = 1; page < 20; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data) break;
    for (const u of data.users) out.set(u.id, u.last_sign_in_at ?? null);
    if (data.users.length < 200) break;
  }
  return out;
}
