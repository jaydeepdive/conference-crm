/**
 * GET /api/platform/invites/preview?token=... — pre-auth preview of an
 * invite for the /platform accept page. Returns email, full_name, the
 * entity (company/investor) name and conference name — enough for a
 * meaningful "Hi X, you're invited to Y as Z" greeting without exposing
 * ids.
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
    .select("email, full_name, lead_type, lead_id, conference_id, user_id")
    .eq("invite_token", token).maybeSingle();
  if (!attendee) return NextResponse.json({ error: "This invite link is invalid or has already been used." }, { status: 404 });
  if (attendee.user_id) return NextResponse.json({ error: "This invite has already been accepted." }, { status: 409 });

  const { data: conf } = await svc.from("conferences")
    .select("name, slug").eq("id", attendee.conference_id).maybeSingle();

  let entityName: string | null = null;
  if (attendee.lead_type === "company") {
    const { data } = await svc.from("companies").select("name").eq("id", attendee.lead_id).maybeSingle();
    entityName = data?.name ?? null;
  } else if (attendee.lead_type === "investor") {
    const { data } = await svc.from("investors").select("firm_name").eq("id", attendee.lead_id).maybeSingle();
    entityName = data?.firm_name ?? null;
  }

  return NextResponse.json({
    email: attendee.email,
    full_name: attendee.full_name,
    entity_name: entityName,
    conference_name: conf?.name ?? null,
    slug: conf?.slug ?? null,
  });
}
