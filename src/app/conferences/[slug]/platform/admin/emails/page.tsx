/**
 * Admin console → Emails. Send a branded email to registered companies,
 * investors, or everyone in the portal. Nothing sends until Send is pressed.
 */
import { EmailsClient } from "./EmailsClient";

export const dynamic = "force-dynamic";

export default async function EmailsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <div className="space-y-5">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-brand-accent">Admin</div>
        <h1 className="mt-1 font-display text-3xl font-medium sm:text-4xl">Email attendees</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Sends from <strong>no-reply@abovebeyondsummit.com</strong> with the Above &amp; Beyond design. Replies come to you.
          Goes only to registered attendees with an email on file — nothing is sent until you press Send.
        </p>
      </div>
      <EmailsClient slug={slug} />
    </div>
  );
}
