export function TddBadge({ matchType, ticker, size = "sm" }: {
  matchType?: string | null; ticker?: string | null;
  size?: "sm" | "md";
}) {
  const label = ticker ? `TDD · ${ticker}` : "TDD Client";
  const tooltip = matchType ? `Matched on ${matchType.replace("_", " ")}` : "Active client of The Deep Dive";
  const cls = size === "md"
    ? "inline-flex items-center gap-1 rounded-full bg-brand-accent px-2 py-0.5 text-xs font-medium uppercase tracking-widest2 text-cream"
    : "inline-flex items-center gap-1 rounded-full bg-brand-accent px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-widest2 text-cream";
  return <span title={tooltip} className={cls}>{label}</span>;
}
