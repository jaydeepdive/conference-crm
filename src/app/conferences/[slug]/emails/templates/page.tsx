import Link from "next/link";
import { requireConferenceAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TemplatesManager } from "./TemplatesManager";

export const dynamic = "force-dynamic";

export default async function TemplatesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireConferenceAccess(slug);
  const supabase = await createClient();
  const { data: templates } = await supabase.from("email_templates")
    .select("*").eq("conference_id", ctx.conference.id).order("kind").order("name");

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/conferences/${slug}/emails`} className="text-xs uppercase tracking-widest2 text-ink/60 hover:text-ink">← Emails</Link>
        <h1 className="mt-1 font-serif text-2xl font-bold text-ink">Email templates</h1>
      </div>
      <TemplatesManager conferenceId={ctx.conference.id} templates={templates ?? []} />
    </div>
  );
}
