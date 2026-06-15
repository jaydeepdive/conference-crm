import { requireSuperAdmin } from "@/lib/auth";
import { AdminNav } from "@/components/AdminNav";
import { Footer } from "@/components/Footer";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireSuperAdmin();
  return (
    <>
      <AdminNav profile={profile} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">{children}</main>
      <Footer />
    </>
  );
}
