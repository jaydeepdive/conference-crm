/**
 * POST /api/platform/profile/update
 *
 * Body: { full_name?, title?, phone?, about? }
 *
 * Updates the logged-in user's own attendee_profile(s) across every
 * conference they're invited to — ap_update RLS already restricts the
 * writeable rows to user_id = auth.uid().
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface Body {
  full_name?: string | null;
  title?: string | null;
  phone?: string | null;
  about?: string | null;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: Body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Body must be JSON" }, { status: 400 }); }

  const payload: Record<string, string | null> = {};
  if ("full_name" in body) payload.full_name = body.full_name ?? null;
  if ("title" in body)     payload.title     = body.title ?? null;
  if ("phone" in body)     payload.phone     = body.phone ?? null;
  if ("about" in body)     payload.about     = body.about ?? null;

  if (Object.keys(payload).length === 0)
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const { error } = await supabase.from("attendee_profiles")
    .update(payload).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
