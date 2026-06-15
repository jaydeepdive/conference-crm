import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/conferences";

  if (code) {
    const supabase = await createClient();
    const { error, data } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Capture Gmail tokens if present (only available right after sign-in)
      const session = data.session;
      const providerToken = session?.provider_token;
      const providerRefreshToken = session?.provider_refresh_token;
      if (session?.user && providerToken) {
        // Persist for later use by the user-initiated email send action
        await supabase.from("gmail_tokens").upsert({
          profile_id: session.user.id,
          access_token: providerToken,
          refresh_token: providerRefreshToken ?? null,
          expires_at: new Date(Date.now() + 55 * 60 * 1000).toISOString(), // ~55min
          scope: "https://www.googleapis.com/auth/gmail.send",
        }, { onConflict: "profile_id" });
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=oauth`);
}
