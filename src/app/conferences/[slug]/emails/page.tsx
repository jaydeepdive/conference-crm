import Link from "next/link";
import { requireConferenceAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EmailsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireConferenceAccess(slug);
  const supabase = await createClient();

  const { data: sent } = await supabase.from("sent_emails")
    .select("*").eq("conference_id", ctx.conference.id).order("sent_at", { ascending: false }).limit(50);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold text-ink">Emails</h1>
          <p className="text-sm text-ink/60">Group + individual sends · all emails require an explicit click</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/conferences/${slug}/emails/templates`}
            className="border border-ink/20 px-4 py-2 text-xs uppercase tracking-widest2 hover:bg-cream">
            Templates
          </Link>
          <Link href={`/conferences/${slug}/emails/compose`}
            className="bg-ink px-4 py-2 text-xs uppercase tracking-widest2 text-cream hover:bg-brand-accent">
            + Compose
          </Link>
        </div>
      </div>

      <section className="border border-ink/20 bg-white p-5">
        <h3 className="text-xs font-semibold uppercase tracking-widest2 text-ink/60">Recent sends</h3>
        {(sent ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-ink/60">No emails sent yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {(sent ?? []).map(e => (
              <li key={e.id} className="rounded border border-ink/10 p-3 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="font-medium">{e.subject}</span>
                  <span className="text-xs text-ink/60">{new Date(e.sent_at).toLocaleString()}</span>
                </div>
                <div className="text-xs text-ink/60">
                  {e.kind} · {e.recipients.length} recipient{e.recipients.length === 1 ? "" : "s"}
                  {e.has_pdf_attachment && " · PDF attached"}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
