/**
 * POST /api/platform/accept
 *
 * Body: { token, password }
 *
 * - Looks up attendee_profiles by invite_token.
 * - If an auth user with that email already exists (person is attendee for
 *   multiple conferences), updates their password and binds this row.
 * - Otherwise creates a fresh auth user via service role, sets the password.
 * - Clears invite_token on this row AND auto-binds any other unclaimed
 *   attendee_profiles with the same email across conferences.
 * - Returns the email for the client to sign-in with.
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
  if (attendee.user_id) return NextResponse.json({
    error: "This invite has already been accepted. Sign in instead.",
  }, { status: 409 });

  const email = attendee.email as string;
  let userId: string | null = null;

  // See if the email already has an auth.users row.
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
    const { error } = await svc.auth.admin.updateUserById(userId, {
      password, email_confirm: true,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { data, error } = await svc.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name: attendee.full_name ?? null },
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    userId = data.user?.id ?? null;
  }
  if (!userId) return NextResponse.json({ error: "Failed to create user" }, { status: 500 });

  const { error: linkErr } = await svc.from("attendee_profiles").update({
    user_id: userId,
    accepted_at: new Date().toISOString(),
    invite_token: null,
  }).eq("id", attendee.id);
  if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 });

  // Bind any other unclaimed profiles for the same email (multi-conference).
  await svc.from("attendee_profiles")
    .update({ user_id: userId, accepted_at: new Date().toISOString(), invite_token: null })
    .eq("email", email).is("user_id", null);

  const { data: conf } = await svc.from("conferences")
    .select("slug").eq("id", attendee.conference_id).maybeSingle();

  return NextResponse.json({ ok: true, email, slug: conf?.slug ?? null });
}
