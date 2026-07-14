/**
 * POST /api/portal/profile/entity
 *
 * Updates the caller's own lead entity (company or investor) but ONLY the
 * public-profile columns (about, website, investment_criteria). We use the
 * service role so we can bypass the staff-only write policy on companies /
 * investors — the API itself enforces "you can only touch YOUR OWN lead" by
 * looking up attendee_profiles.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

interface Body {
  slug?: string;
  about?: string;
  website?: string;             // company only
  investment_criteria?: string; // investor only
}

export async function POST(request: Request) {
  const userClient = await createClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: Body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Body must be JSON" }, { status: 400 }); }
  const slug = (body.slug ?? "").trim();
  if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

  const svc = createServiceClient();

  // Look up the conference id from slug.
  const { data: conf } = await svc.from("conferences").select("id").eq("slug", slug).maybeSingle();
  if (!conf) return NextResponse.json({ error: "Unknown conference" }, { status: 404 });

  // Confirm the caller has an attendee_profile in this conference and grab
  // (lead_type, lead_id). Anything else is forbidden.
  const { data: attendee } = await svc.from("attendee_profiles")
    .select("lead_type, lead_id")
    .eq("user_id", user.id).eq("conference_id", conf.id).maybeSingle();
  if (!attendee) return NextResponse.json({ error: "You are not an attendee of this conference." }, { status: 403 });

  const patch: Record<string, string | null> = { about: (body.about ?? "").trim() || null };
  if (attendee.lead_type === "company") {
    patch.website = (body.website ?? "").trim() || null;
  } else {
    patch.investment_criteria = (body.investment_criteria ?? "").trim() || null;
  }

  const table = attendee.lead_type === "company" ? "companies" : "investors";
  const { error } = await svc.from(table).update(patch).eq("id", attendee.lead_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
