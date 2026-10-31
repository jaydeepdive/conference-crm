/** POST /api/platform/logout — clears the session cookies server-side. */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const sb = await createClient();
  await sb.auth.signOut().catch(() => null);
  return NextResponse.json({ ok: true });
}
