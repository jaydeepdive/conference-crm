import { getCurrentProfile } from "@/lib/auth";
import { SignOutButton } from "@/components/SignOutButton";

export default async function PendingPage() {
  const profile = await getCurrentProfile();
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md rounded-2xl bg-white p-8 shadow text-center">
        <h1 className="text-xl font-bold text-brand">Waiting for approval</h1>
        <p className="mt-3 text-sm text-gray-600">
          You&apos;re signed in as <span className="font-medium">{profile.email}</span> but haven&apos;t been granted access to the CRM yet. Ask an admin to set your role to <span className="font-mono">team</span>.
        </p>
        <div className="mt-6"><SignOutButton /></div>
      </div>
    </div>
  );
}
