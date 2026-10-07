/**
 * GET /auth/confirm?token_hash=...&type=recovery|magiclink&next=/path
 * Verifies a one-time token (from an admin-generated link or an email
 * template) server-side, sets the session cookie, then redirects to `next`.
 */
import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = (searchParams.get("type") ?? "recovery") as EmailOtpType;
  const rawNext = searchParams.get("next") ?? "/reset-password";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/reset-password";
  if (token_hash) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/login?error=link_expired`);
}
