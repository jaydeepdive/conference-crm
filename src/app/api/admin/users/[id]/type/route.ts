/** POST { account_type: "staff" | "attendee" | "pending" } — super admin only. */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await sb.from("profiles").select("is_super_admin").eq("id", user.id).maybeSingle();
  if (!me?.is_super_admin) return NextResponse.json({ error: "Super admin only" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { account_type?: string };
  if (!["staff", "attendee", "pending"].includes(body.account_type ?? ""))
    return NextResponse.json({ error: "account_type must be staff, attendee or pending" }, { status: 400 });
  if (id === user.id) return NextResponse.json({ error: "You can't change your own account type" }, { status: 400 });
  const { error } = await createServiceClient().from("profiles").update({ account_type: body.account_type }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
