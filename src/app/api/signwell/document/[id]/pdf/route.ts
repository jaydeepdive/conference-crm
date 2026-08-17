import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { downloadCompletedPdf, SignWellError } from "@/lib/signwell";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/signwell/document/[id]/pdf
 *
 * Streams the completed PDF for the given SignWell document id. Requires the
 * caller to be logged in AND to have any role on the conference that owns
 * the company row (we look it up by document id).
 *
 * We proxy the download through the CRM so the SignWell API key never
 * touches the browser.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  // The RLS-scoped client only returns rows the user can see, so this doubles
  // as the auth check.
  const { data: company } = await supabase.from("companies")
    .select("id, name, agreement_status")
    .eq("agreement_document_id", id).maybeSingle();
  if (!company) {
    return NextResponse.json({ error: "Document not found or access denied" }, { status: 404 });
  }
  if (company.agreement_status !== "signed") {
    return NextResponse.json({ error: "Document is not yet completed" }, { status: 409 });
  }

  try {
    const pdf = await downloadCompletedPdf(id);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="participation-agreement-${company.name.replace(/[^a-z0-9-]+/gi, "_")}.pdf"`,
      },
    });
  } catch (e) {
    const status = e instanceof SignWellError ? e.status : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status });
  }
}
