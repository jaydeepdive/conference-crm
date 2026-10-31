/**
 * POST /api/platform/login { email, password }
 * Attendee sign-in done server-side on our own domain, so browsers / ad
 * blockers / office networks that block the database host can still log in.
 * Sets the normal session cookies on success.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const b = await request.json().catch(() => ({})) as { email?: string; password?: string };
  const email = (b.email ?? "").trim().toLowerCase();
  if (!email || !b.password) return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
  const sb = await createClient();
  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = await sb.auth.signInWithPassword({ email, password: b.password });
    if (!error) return NextResponse.json({ ok: true });
    lastErr = error.message;
    if (/invalid login|invalid credentials|email not confirmed/i.test(error.message)) break; // don't retry real failures
  }
  const friendly = /invalid login|invalid credentials/i.test(lastErr)
    ? "That email and password don't match. Try again, or use “Email me a link” below."
    : /email not confirmed/i.test(lastErr) ? "This account isn't activated yet — use “Email me a link” below."
    : "We couldn't sign you in just now. Please try again in a moment.";
  return NextResponse.json({ error: friendly }, { status: 401 });
}
