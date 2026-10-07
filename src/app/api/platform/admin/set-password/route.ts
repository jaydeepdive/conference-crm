/**
 * POST /api/platform/admin/set-password
 * Body: { attendee_profile_id: string, password?: string }
 *
 * Super admin only. Sets an attendee's portal password directly — no email.
 * Built for the conference desk: someone walks up, can't log in, you tap
 * "Set password", read them the new one, done.
 *
 * - If `password` is omitted, a readable one is generated (Word-1234-Word).
 * - If the attendee has never signed in, their login is created on the spot
 *   and bound to this attendee row (same as accepting an invite).
 * - Returns the password ONCE so the admin can share it.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { generateFriendlyPassword, findAuthUserIdByEmail } from "@/lib/passwords";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await supabase.from("profiles")
    .select("is_super_admin, full_name, email").eq("id", user.id).single();
  if (!me?.is_super_admin) return NextResponse.json({ error: "Super admin only" }, { status: 403 });

  let body: { attendee_profile_id?: string; password?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Body must be JSON" }, { status: 400 }); }
  if (!body.attendee_profile_id) return NextResponse.json({ error: "attendee_profile_id required" }, { status: 400 });

  const password = (body.password ?? "").trim() || generateFriendlyPassword();
  if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });

  const svc = createServiceClient();
  const { data: attendee } = await svc.from("attendee_profiles")
    .select("id, email, full_name, user_id, conference_id").eq("id", body.attendee_profile_id).maybeSingle();
  if (!attendee) return NextResponse.json({ error: "Attendee not found" }, { status: 404 });

  const email = String(attendee.email);
  let userId: string | null = attendee.user_id as string | null;

  try {
    if (!userId) userId = await findAuthUserIdByEmail(svc, email);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Lookup failed" }, { status: 500 });
  }

  if (userId) {
    const { error } = await svc.auth.admin.updateUserById(userId, { password, email_confirm: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { data, error } = await svc.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name: attendee.full_name ?? null },
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    userId = data.user?.id ?? null;
  }
  if (!userId) return NextResponse.json({ error: "Could not create login" }, { status: 500 });

  // Bind this attendee row (and any other unclaimed rows for the same email).
  const now = new Date().toISOString();
  await svc.from("attendee_profiles")
    .update({ user_id: userId, accepted_at: now, invite_token: null })
    .eq("id", attendee.id);
  await svc.from("attendee_profiles")
    .update({ user_id: userId, accepted_at: now, invite_token: null })
    .eq("email", email).is("user_id", null);

  const { data: conf } = await svc.from("conferences").select("slug").eq("id", attendee.conference_id).maybeSingle();

  return NextResponse.json({
    ok: true,
    email,
    password,
    login_url: conf?.slug ? `/conferences/${conf.slug}/platform/login` : null,
    set_by: me.full_name ?? me.email,
  });
}
