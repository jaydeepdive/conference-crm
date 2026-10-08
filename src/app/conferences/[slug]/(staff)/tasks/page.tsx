import { requireConferenceAccess } from "@/lib/auth";
import { getFullProject, getConferenceNotes, type FullProjectResponse, type HubNote } from "@/lib/hub";
import { ProjectHubClient } from "./ProjectHubClient";
import { PageTitle } from "@/components/SectionHeader";
import { canSeePayments } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TasksPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireConferenceAccess(slug);

  let full: FullProjectResponse | null = null;
  let notes: HubNote[] = [];
  let hubError: string | null = null;

  try {
    full = await getFullProject(slug, { includeComments: true, includeDone: true });
  } catch (e) {
    hubError = e instanceof Error ? e.message : "Hub request failed";
  }

  if (full?.project) {
    notes = await getConferenceNotes(slug);
  }

  const showFinancials = canSeePayments(ctx.effectiveRole);

  return (
    <div className="space-y-8">
      <PageTitle title="Project Hub" sub={full?.project ? `${full.project.title ?? full.project.name ?? full.project.id} · Mining Summit Hub link` : "Tasks, schedule, team, and financials — synced with The Deep Dive Hub"} />

      {hubError && (
        <div className="rounded-md bg-rose-50 p-4 text-sm text-rose-800">
          <strong>Hub unreachable:</strong> {hubError}
          <p className="mt-1 text-xs">Check that <code>HUB_BASE_URL</code> and <code>HUB_API_KEY</code> are set in Vercel and that the Hub is responding.</p>
        </div>
      )}

      <ProjectHubClient
        slug={slug}
        initialFullProject={full}
        initialNotes={notes}
        showFinancials={showFinancials}
      />
    </div>
  );
}
