/** POST /api/platform/new-password { password } — signed-in attendee sets a new password (server-side). */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const b = await request.json().catch(() => ({})) as { password?: string };
  if (!b.password || b.password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Your reset link has expired. Request a new one from the sign-in page." }, { status: 401 });
  const { error } = await sb.auth.updateUser({ password: b.password });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
