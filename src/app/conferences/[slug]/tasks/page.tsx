import { requireConferenceAccess } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function TasksPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireConferenceAccess(slug);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold text-ink">Tasks</h1>
        <p className="text-sm text-ink/60">Project management for this conference</p>
      </div>
      <div className="border border-ink/20 bg-white p-8 text-center">
        <p className="font-serif text-xl text-ink">Coming soon</p>
        <p className="mt-2 text-sm text-ink/60">
          Tasks will pull from your project management platform once it&apos;s live.
        </p>
        <p className="mt-1 text-xs text-ink/50">
          API endpoint reserved: <code>/api/tasks/sync</code>
        </p>
      </div>
    </div>
  );
}
