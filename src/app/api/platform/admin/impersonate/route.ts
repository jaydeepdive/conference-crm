import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { IMPERSONATE_COOKIE } from "@/lib/platform";

export const runtime = "nodejs";

/**
 * POST /api/platform/admin/impersonate
 *   body: { attendee_profile_id: string } → sets the impersonation cookie
 *   body: { clear: true }                 → clears it (go back to own view)
 *
 * Super admin only. Everyone else gets 403.
 * The cookie drives `resolvePlatformContext` on every subsequent /platform
 * request — the super admin sees the platform through the impersonated
 * attendee's eyes.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles").select("is_super_admin").eq("id", user.id).single();
  if (!profile?.is_super_admin) {
    return NextResponse.json({ error: "Super admin only" }, { status: 403 });
  }

  let body: { attendee_profile_id?: string; clear?: boolean } = {};
  try { body = await request.json(); }
  catch { /* clearing is also allowed with no body */ }

  const cookieStore = await cookies();
  if (body.clear) {
    cookieStore.delete(IMPERSONATE_COOKIE);
    return NextResponse.json({ ok: true, cleared: true });
  }

  if (!body.attendee_profile_id) {
    return NextResponse.json({ error: "attendee_profile_id required" }, { status: 400 });
  }

  // 30-day cookie, httpOnly so client JS can't read it; sameSite=lax covers
  // the common same-site navigation case we need.
  cookieStore.set(IMPERSONATE_COOKIE, body.attendee_profile_id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return NextResponse.json({ ok: true, attendee_profile_id: body.attendee_profile_id });
}
