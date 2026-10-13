/** POST { slug, enabled } — super admin toggles meeting-notification emails. */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(request: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await sb.from("profiles").select("is_super_admin").eq("id", user.id).maybeSingle();
  if (!me?.is_super_admin) return NextResponse.json({ error: "Super admin only" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { slug?: string; enabled?: boolean };
  if (!body.slug || typeof body.enabled !== "boolean") return NextResponse.json({ error: "slug and enabled required" }, { status: 400 });
  const { error } = await createServiceClient().from("conferences")
    .update({ meeting_emails_enabled: body.enabled }).eq("slug", body.slug);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, enabled: body.enabled });
}
