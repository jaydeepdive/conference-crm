import { requireTeam } from "@/lib/auth";
import { Nav } from "@/components/Nav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireTeam();
  return (
    <>
      <Nav profile={profile} />
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </>
  );
}
