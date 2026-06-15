import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateEmailDraft, type DraftContext } from "@/lib/anthropic";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  try {
    const ctx = (await request.json()) as DraftContext;
    const draft = await generateEmailDraft(ctx);
    return NextResponse.json(draft);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Draft failed" }, { status: 500 });
  }
}
