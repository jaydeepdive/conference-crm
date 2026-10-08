import { redirect } from "next/navigation";
// Moved into the Above & Beyond admin console.
export default async function Moved({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/conferences/${slug}/platform/admin/meetings/auto-match`);
}
