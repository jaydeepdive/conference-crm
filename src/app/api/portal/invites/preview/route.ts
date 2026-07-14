/**
 * GET /api/portal/invites/preview?token=... — return a redacted preview of the
 * invite (email + conference name) so the accept page can confirm to the user
 * what they're about to accept before they type a password. Uses the service
 * role because the anon key can't read attendee_profiles without a session.
 * This deliberately does NOT return the attendee's id.
 */
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = (searchParams.get("token") ?? "").trim();
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const svc = createServiceClient();
  const { data: attendee } = await svc.from("attendee_profiles")
    .select("email, conference_id, user_id").eq("invite_token", token).maybeSingle();
  if (!attendee) return NextResponse.json({ error: "This invite link is invalid or has already been used." }, { status: 404 });
  if (attendee.user_id) return NextResponse.json({ error: "This invite has already been accepted." }, { status: 409 });

  const { data: conf } = await svc.from("conferences")
    .select("name, slug").eq("id", attendee.conference_id).maybeSingle();

  return NextResponse.json({
    email: attendee.email,
    conference_name: conf?.name ?? null,
    slug: conf?.slug ?? null,
  });
}
