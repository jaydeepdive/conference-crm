import { requireSuperAdmin } from "@/lib/auth";
import { AdminNav } from "@/components/AdminNav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireSuperAdmin();
  return (
    <>
      <AdminNav profile={profile} />
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </>
  );
}
