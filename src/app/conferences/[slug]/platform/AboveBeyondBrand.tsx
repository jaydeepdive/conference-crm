/**
 * Shared Above & Beyond Summit branding header for the /platform surface.
 *
 * Scoped to the attendee site only — the staff CRM keeps its own masthead.
 * The mark is inlined (no network fetch at render) so it works offline and
 * dodges any cross-origin image fuss. The full-colour logo-official.jpg lives
 * at https://abovebeyondsummit.com/assets/logo-official.jpg if we ever want
 * to swap it in; for a small header the mark + wordmark reads better.
 */
export const BRAND_ACCENT = "#8B4513"; // deep bronze
export const BRAND_BG = "#f9f3ea";

/**
 * Inline Above & Beyond "mountain mark" — a stylised range in bronze on
 * cream. Rendered as a solid inline SVG so the attendee header never flashes
 * a broken image. The abovebeyondsummit.com asset path is kept here for
 * reference: `https://abovebeyondsummit.com/assets/mark.svg`.
 */
export function AboveBeyondMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"
      className={className} aria-hidden="true">
      <circle cx="32" cy="32" r="31" fill={BRAND_BG} stroke={BRAND_ACCENT} strokeWidth="2" />
      {/* far peaks */}
      <path d="M8 46 L22 24 L30 36 L40 20 L56 46 Z"
        fill={BRAND_ACCENT} opacity="0.85" />
      {/* near peak */}
      <path d="M14 48 L28 30 L42 48 Z" fill={BRAND_ACCENT} />
      {/* ground line */}
      <line x1="6" y1="48" x2="58" y2="48" stroke={BRAND_ACCENT} strokeWidth="1.5" />
    </svg>
  );
}

export function AboveBeyondHeader({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <AboveBeyondMark className={compact ? "h-8 w-8" : "h-10 w-10"} />
      <div className="min-w-0">
        <div className="font-serif text-base font-semibold leading-tight tracking-tight text-stone-900 sm:text-lg">
          Above &amp; Beyond Summit
        </div>
        <div className="truncate text-[11px] uppercase tracking-widest text-stone-600 sm:text-xs">
          November 22–24 · Scottsdale, Arizona
        </div>
      </div>
    </div>
  );
}

/** Full-bleed wrapper that paints the cream background used across the
 *  attendee surface. Pages that use the authed shell get this via the
 *  layout; the unauthed /login + /accept pages wrap themselves. */
export function AboveBeyondShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: BRAND_BG }}>
      {children}
    </div>
  );
}
