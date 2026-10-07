/**
 * POST /api/admin/users/[id]/password
 * Body: { password?: string }
 *
 * Super admin only. Sets a staff CRM user's password directly — no email.
 * If `password` is omitted, a readable one is generated. Returns it once.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { generateFriendlyPassword } from "@/lib/passwords";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).single();
  if (!me?.is_super_admin) return NextResponse.json({ error: "Super admin only" }, { status: 403 });

  let body: { password?: string } = {};
  try { body = await request.json(); } catch { /* empty body = generate */ }
  const password = (body.password ?? "").trim() || generateFriendlyPassword();
  if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });

  const svc = createServiceClient();
  const { data: target } = await svc.from("profiles").select("email").eq("id", id).maybeSingle();
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { error } = await svc.auth.admin.updateUserById(id, { password, email_confirm: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, email: target.email, password });
}
