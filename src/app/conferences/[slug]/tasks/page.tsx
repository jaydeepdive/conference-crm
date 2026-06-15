import { requireConferenceAccess } from "@/lib/auth";
import { getConferenceTasks } from "@/lib/hub";
import { TasksClient } from "./TasksClient";

export const dynamic = "force-dynamic";

export default async function TasksPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireConferenceAccess(slug);

  let project = null;
  let tasks: { id: string; title: string; status: string; priority?: string | null; due_date?: string | null; notes?: string | null; source?: string }[] = [];
  let hubError: string | null = null;

  try {
    const data = await getConferenceTasks(slug, false);
    project = data.project;
    tasks = data.tasks;
  } catch (e) {
    hubError = e instanceof Error ? e.message : "Hub request failed";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold text-ink">Tasks</h1>
          {project && <p className="text-sm text-ink/60">Linked Hub project: <span className="font-medium">{project.title ?? project.name ?? project.id}</span></p>}
          {!project && !hubError && <p className="text-sm text-ink/60">No Hub project linked yet. Open this conference in the Project Hub and link it (uses slug <code>{slug}</code>).</p>}
        </div>
      </div>

      {hubError && (
        <div className="rounded-md bg-rose-50 p-4 text-sm text-rose-800">
          <strong>Hub unreachable:</strong> {hubError}
          <p className="mt-1 text-xs">Check that <code>HUB_BASE_URL</code> and <code>HUB_API_KEY</code> are set in Vercel and that the Hub is responding.</p>
        </div>
      )}

      <TasksClient slug={slug} initialTasks={tasks} hasProject={!!project} />
    </div>
  );
}
