/**
 * POST /api/portal/attendees/create
 *
 * Body: { conference_id, lead_type: 'company'|'investor', lead_id, email, full_name? }
 *
 * Super-admin (or conference_admin) action: creates an attendee_profiles row
 * with a fresh invite_token for the specified lead. Doesn't send the email —
 * the client can call invites/send after if it wants to.
 *
 * Returns the row + a fully-qualified accept URL for the operator to paste.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateInviteToken } from "@/lib/portal";

export const runtime = "nodejs";

interface Body {
  conference_id?: string;
  lead_type?: "company" | "investor";
  lead_id?: string;
  email?: string;
  full_name?: string;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: Body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Body must be JSON" }, { status: 400 }); }

  if (!body.conference_id) return NextResponse.json({ error: "Missing conference_id" }, { status: 400 });
  if (!body.lead_type || !["company","investor"].includes(body.lead_type))
    return NextResponse.json({ error: "lead_type must be 'company' or 'investor'" }, { status: 400 });
  if (!body.lead_id) return NextResponse.json({ error: "Missing lead_id" }, { status: 400 });
  const email = (body.email ?? "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });

  const token = generateInviteToken();
  const { data: inserted, error } = await supabase.from("attendee_profiles").insert({
    conference_id: body.conference_id,
    lead_type: body.lead_type,
    lead_id: body.lead_id,
    email,
    full_name: body.full_name?.trim() || null,
    invite_token: token,
    invite_sent_at: null,
  }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const origin = new URL(request.url).origin;
  return NextResponse.json({
    attendee: inserted,
    accept_url: `${origin}/portal/accept?token=${encodeURIComponent(token)}`,
  });
}
