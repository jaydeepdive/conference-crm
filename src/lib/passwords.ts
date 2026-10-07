/**
 * Password helpers for admin-driven resets (no email required).
 *
 * Generated passwords are meant to be READ ALOUD or written down at the
 * conference desk, so they avoid look-alike characters (0/O, 1/l/I) and use
 * a Word-1234-Word shape that's easy to say and type on a phone.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const WORDS = [
  "Gold", "Silver", "Copper", "Desert", "Summit", "Canyon", "Mesa", "Quartz",
  "Granite", "Cactus", "Sunset", "Ridge", "Mineral", "Nugget", "Bronze", "Valley",
  "Falcon", "Cedar", "Amber", "Basalt", "Cobalt", "Harbor", "Lantern", "Pioneer",
];

function randInt(maxExclusive: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % maxExclusive;
}

/** e.g. "Copper-4827-Mesa" — 16ish chars, easy to read out loud. */
export function generateFriendlyPassword(): string {
  const a = WORDS[randInt(WORDS.length)];
  let b = WORDS[randInt(WORDS.length)];
  while (b === a) b = WORDS[randInt(WORDS.length)];
  const digits = String(1000 + randInt(9000)); // 1000–9999, no leading zero confusion
  return `${a}-${digits}-${b}`;
}

/** Find an auth.users id by email (case-insensitive). Paginates. */
export async function findAuthUserIdByEmail(
  svc: SupabaseClient, email: string,
): Promise<string | null> {
  const target = email.trim().toLowerCase();
  let page = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const match = data.users.find(u => (u.email ?? "").toLowerCase() === target);
    if (match) return match.id;
    if (data.users.length < 200) return null;
    page += 1;
  }
}
