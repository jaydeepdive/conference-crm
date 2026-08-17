import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listTemplates, getTemplate, SignWellError } from "@/lib/signwell";

export const runtime = "nodejs";

/**
 * GET /api/signwell/templates
 *   → list all templates on the SignWell workspace.
 *
 * GET /api/signwell/templates?id=<templateId>
 *   → fetch a single template with its fields + placeholders.
 *
 * Super-admin only. Used by the conference Settings page to let the operator
 * pick which template + field to use for the participation agreement.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).single();
  if (!profile?.is_super_admin) return NextResponse.json({ error: "Super admin only" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  try {
    if (id) {
      const template = await getTemplate(id);
      return NextResponse.json({ template });
    }
    const templates = await listTemplates();
    return NextResponse.json({ templates });
  } catch (e) {
    const status = e instanceof SignWellError ? e.status : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status });
  }
}
