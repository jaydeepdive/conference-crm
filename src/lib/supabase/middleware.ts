import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/**
 * Refresh the Supabase session on every request AND gate access to the two
 * front-ends:
 *   * Staff CRM  — anything not under /portal, /login, /auth, /api/portal/invites
 *                  redirects unauth'd users to /login.
 *   * Attendee portal — anything under /portal/* (except /portal/login and
 *                  /portal/accept) redirects unauth'd users to /portal/login.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  // Expose the current pathname to server components (layouts/pages read it
  // via `headers()`). Lets the staff conference layout detect /platform/
  // sub-routes and skip its auth guard for attendee pages.
  request.headers.set("x-pathname", path);
  supabaseResponse = NextResponse.next({ request });

  const isPortal = path.startsWith("/portal");
  const isPortalPublic = path === "/portal/login" || path === "/portal/accept";

  // v6.51 — attendee /platform surface lives at /conferences/<slug>/platform/*.
  // login + accept are the pre-auth entry points.
  const platformMatch = path.match(/^\/conferences\/([^/]+)\/platform(\/.*)?$/);
  const isPlatform = !!platformMatch;
  const platformSub = platformMatch?.[2] ?? "";
  const isPlatformPublic = isPlatform && (platformSub === "/login" || platformSub === "/accept");

  const isPublic =
       path === "/login"
    || path.startsWith("/auth")
    || path.startsWith("/_next")
    || path === "/favicon.ico"
    || isPortalPublic
    || isPlatformPublic
    // Public webhook / intake surface — auth handled per-route via API keys
    // or (for webhooks) via signature verification / metadata routing.
    || path.startsWith("/api/intake")
    || path === "/api/signwell/webhook"
    // Vercel cron pings this without a user session; the route enforces
    // a CRON_SECRET Bearer check itself.
    || path === "/api/signwell/refresh-all"
    // Invite-accept flow is pre-auth (the whole point is to create the user).
    || path === "/api/portal/accept"
    || path.startsWith("/api/portal/invites/preview")
    || path === "/api/platform/accept"
    || path.startsWith("/api/platform/invites/preview")
    || path === "/api/platform/invites/resend";

  if (!user && !isPublic) {
    // API routes get a 401 (not an HTML redirect) so client fetches don't
    // follow a redirect and receive the login page.
    if (path.startsWith("/api/")) {
      return new NextResponse(JSON.stringify({ error: "Not signed in" }), {
        status: 401, headers: { "Content-Type": "application/json" },
      });
    }
    const url = request.nextUrl.clone();
    // Route unauth'd attendees hitting /platform/* to the branded
    // Above & Beyond login — NOT the staff /login screen.
    if (isPlatform && platformMatch) {
      url.pathname = `/conferences/${platformMatch[1]}/platform/login`;
    } else if (isPortal) {
      url.pathname = "/portal/login";
    } else {
      url.pathname = "/login";
    }
    return NextResponse.redirect(url);
  }

  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  if (user && path === "/portal/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/portal";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
