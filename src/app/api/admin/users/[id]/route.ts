import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

/**
 * DELETE /api/admin/users/[id]
 * Only super_admins can call this. Removes the user from auth.users;
 * profiles + memberships + gmail_tokens cascade because of ON DELETE CASCADE.
 * Data they touched (invoices they sent, activity they logged, leads they owned)
 * has ON DELETE SET NULL — the records survive, their attribution goes to "—".
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  // Prevent self-deletion
  if (user.id === id) {
    return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
  }

  // Must be super admin
  const { data: profile } = await supabase
    .from("profiles").select("is_super_admin").eq("id", user.id).single();
  if (!profile?.is_super_admin) {
    return NextResponse.json({ error: "Only super admins can delete users." }, { status: 403 });
  }

  // Look up the target for a clearer confirmation message
  const { data: target } = await supabase
    .from("profiles").select("email, full_name, is_super_admin").eq("id", id).single();
  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  // Delete via the admin API (requires service role key)
  const admin = createServiceClient();
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) {
    return NextResponse.json({ error: `Supabase deletion failed: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    deleted: { id, email: target.email, full_name: target.full_name },
  });
}
