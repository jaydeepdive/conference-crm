/**
 * POST /api/admin/companies/[id]/profile
 * { website?, about?, category?, primary_metal? } — the company's public
 * portal profile. Staff only (RLS: staff with conference access).
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { COMPANY_CATEGORIES, PRIMARY_METALS } from "@/lib/constants";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const b = await request.json().catch(() => ({})) as Record<string, string | null | undefined>;

  const clean = (v: string | null | undefined) => (v ?? "").trim() || null;
  let website = clean(b.website);
  if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
  const category = clean(b.category);
  const metal = clean(b.primary_metal);
  if (category && !(COMPANY_CATEGORIES as readonly string[]).includes(category))
    return NextResponse.json({ error: "Unknown category" }, { status: 400 });
  if (metal && !(PRIMARY_METALS as readonly string[]).includes(metal))
    return NextResponse.json({ error: "Unknown metal" }, { status: 400 });
  const about = clean(b.about);
  if (about && about.length > 3000) return NextResponse.json({ error: "Blurb is too long (3,000 characters max)." }, { status: 400 });

  const { data, error } = await sb.from("companies")
    .update({ website, about, category, primary_metal: metal }).eq("id", id).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not allowed or not found" }, { status: 403 });
  return NextResponse.json({ ok: true });
}
