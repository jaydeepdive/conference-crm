import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/** Service-role Supabase client for server-to-server endpoints (bypasses RLS).
 *  ONLY use inside API routes that are already protected by a shared secret. */
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
