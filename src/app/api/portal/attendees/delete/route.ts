/**
 * POST /api/portal/attendees/delete — remove an attendee row.
 * Only staff (conference_admin / super_admin) can delete; RLS enforces this.
 * Body: { id }
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { id?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Body must be JSON" }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await supabase.from("attendee_profiles").delete().eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
