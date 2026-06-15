export function SectionHeader({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="section-rule flex items-end justify-between">
      <h2 className="font-display text-[26px] font-bold leading-none text-ink">{title}</h2>
      {meta && <span className="text-[11px] font-medium uppercase tracking-widest2 text-muted">{meta}</span>}
    </div>
  );
}

export function PageTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div>
      <h1 className="font-display text-[40px] font-bold leading-none text-ink">{title}</h1>
      {sub && <p className="mt-2 text-sm text-muted">{sub}</p>}
    </div>
  );
}
