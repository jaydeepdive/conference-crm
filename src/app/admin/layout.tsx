import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { SignOutButton } from "@/components/SignOutButton";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireSuperAdmin();
  return (
    <>
      <nav className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <Link href="/conferences" className="text-sm text-gray-500 hover:text-gray-900">← Back to conferences</Link>
            <div className="border-l border-gray-200 pl-6">
              <Link href="/admin" className="text-lg font-bold text-brand">Super Admin</Link>
            </div>
            <div className="flex items-center gap-1">
              <AdminLink href="/admin/conferences" label="Conferences" />
              <AdminLink href="/admin/entities" label="Entities" />
              <AdminLink href="/admin/users" label="Users" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{profile.full_name || profile.email}</span>
            <SignOutButton />
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </>
  );
}

function AdminLink({ href, label }: { href: string; label: string }) {
  return <Link href={href} className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100">{label}</Link>;
}
