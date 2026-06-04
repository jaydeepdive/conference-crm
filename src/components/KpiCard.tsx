export function KpiCard({ label, value, sublabel, accent }: {
  label: string; value: string | number; sublabel?: string; accent?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className={`text-xs font-medium uppercase tracking-wide ${accent || "text-brand"}`}>{label}</div>
      <div className="mt-2 text-3xl font-bold text-gray-900">{value}</div>
      {sublabel && <div className="mt-1 text-xs text-gray-500">{sublabel}</div>}
    </div>
  );
}
