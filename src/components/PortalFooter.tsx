/**
 * PortalFooter — outward-facing footer for the attendee portal.
 * Matches the staff Footer visually but doesn't mark "internal".
 */
export function PortalFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-white py-4">
      <div className="mx-auto flex max-w-7xl items-center justify-center px-6 text-[11px] font-medium uppercase tracking-widest2 text-muted">
        The Deep Dive · Attendee Portal
      </div>
    </footer>
  );
}
