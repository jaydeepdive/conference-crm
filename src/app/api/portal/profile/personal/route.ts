/**
 * POST /api/portal/profile/personal
 *
 * Updates the caller's own attendee_profiles row (name, title, phone, about).
 * Uses the caller's session; RLS `ap_update` allows self-updates.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface Body { full_name?: string; title?: string; phone?: string; about?: string }

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: Body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Body must be JSON" }, { status: 400 }); }

  const patch = {
    full_name: (body.full_name ?? "").trim() || null,
    title: (body.title ?? "").trim() || null,
    phone: (body.phone ?? "").trim() || null,
    about: (body.about ?? "").trim() || null,
  };

  const { error } = await supabase.from("attendee_profiles")
    .update(patch).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
