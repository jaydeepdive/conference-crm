/**
 * POST /api/portal/accept
 *
 * Body: { token: string, password: string }
 *
 * Redeems an attendee invite token:
 *   1. Look up attendee_profiles by invite_token (service role).
 *   2. If user_id is already set, the invite is already accepted — bounce with 409.
 *   3. Create an auth.users row via service role (or update password if the email
 *      already has an account — happens when an attendee is invited to a 2nd
 *      conference and reuses the same email).
 *   4. Link attendee_profiles.user_id, stamp accepted_at, clear invite_token.
 *   5. Sign the user in (return the credentials — the client uses signInWithPassword
 *      right after with the plain password to establish the session cookie).
 *
 * We keep the sign-in step client-side so cookies land on the correct request.
 */
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { token?: string; password?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Body must be JSON" }, { status: 400 }); }

  const token = (body.token ?? "").trim();
  const password = body.password ?? "";
  if (!token) return NextResponse.json({ error: "Missing invite token" }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });

  const svc = createServiceClient();

  const { data: attendee, error: aErr } = await svc.from("attendee_profiles")
    .select("*").eq("invite_token", token).maybeSingle();
  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });
  if (!attendee) return NextResponse.json({ error: "Invite is invalid or has already been used." }, { status: 404 });
  if (attendee.user_id) {
    return NextResponse.json({
      error: "This invite has already been accepted. Sign in from the portal login page.",
    }, { status: 409 });
  }

  const email = attendee.email as string;
  let userId: string | null = null;

  // 1) See if there is already an auth.users row for this email (multi-conference reuse).
  //    admin.listUsers doesn't accept a filter, so we page until we find or exhaust.
  //    In practice conference DBs are small; this is fine.
  {
    let page = 1;
    while (true) {
      const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 200 });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const match = data.users.find(u => (u.email ?? "").toLowerCase() === email.toLowerCase());
      if (match) { userId = match.id; break; }
      if (data.users.length < 200) break;
      page += 1;
    }
  }

  if (userId) {
    // Existing user — reset their password to the one they just picked.
    const { error } = await svc.auth.admin.updateUserById(userId, {
      password, email_confirm: true,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    // Fresh user — create.
    const { data, error } = await svc.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name: attendee.full_name ?? null },
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    userId = data.user?.id ?? null;
  }

  if (!userId) return NextResponse.json({ error: "Failed to create user" }, { status: 500 });

  // Link every attendee_profile row for this email (same person, multiple confs).
  const { error: linkErr } = await svc.from("attendee_profiles")
    .update({
      user_id: userId,
      accepted_at: new Date().toISOString(),
      invite_token: null,
    })
    .eq("id", attendee.id);
  if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 });

  // Auto-link any OTHER attendee rows with the same email (across conferences)
  // that haven't been claimed yet — one accept = you're in everywhere you were invited.
  await svc.from("attendee_profiles")
    .update({ user_id: userId, accepted_at: new Date().toISOString(), invite_token: null })
    .eq("email", email).is("user_id", null);

  // Return the conference slug so the client can redirect straight into it.
  const { data: conf } = await svc.from("conferences")
    .select("slug").eq("id", attendee.conference_id).maybeSingle();

  return NextResponse.json({
    email, slug: conf?.slug ?? null,
  });
}
