/**
 * Above & Beyond Summit branding components, cribbed from the live
 * abovebeyondsummit.com stylesheet. Tokens below mirror their CSS vars so
 * nothing drifts if we ever vendor another asset:
 *
 *   --black     #0a0a0a    (page background)
 *   --charcoal  #141414    (nav/surface above black)
 *   --card      #1a1a1a    (card surfaces)
 *   --gold      #c9a24b    (primary accent — buttons, dividers, mark gradient mid)
 *   --gold-lt   #e8cf8f
 *   --gold-dk   #8f6f2a
 *   --ivory     #f5f0e6    (body text on black)
 *   --grey      #9a9a9a
 *   --border    #2a2a2a
 *   serif       Cormorant Garamond
 *   sans        Jost
 *
 * Scoped to the /platform surface only — the staff CRM is untouched.
 */
import Image from "next/image";

export const BRAND_BLACK  = "#0a0a0a";
export const BRAND_CHARC  = "#141414";
export const BRAND_CARD   = "#1a1a1a";
export const BRAND_GOLD   = "#c9a24b";
export const BRAND_GOLD_L = "#e8cf8f";
export const BRAND_GOLD_D = "#8f6f2a";
export const BRAND_IVORY  = "#f5f0e6";
export const BRAND_GREY   = "#9a9a9a";
export const BRAND_BORDER = "#2a2a2a";

// Back-compat aliases some existing files still import.
export const BRAND_ACCENT = BRAND_GOLD;
export const BRAND_BG     = BRAND_BLACK;

/**
 * The actual AB mountain mark from abovebeyondsummit.com. Served from
 * /public/brand/mark.svg so there's no cross-origin fetch at render time.
 */
export function AboveBeyondMark({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <Image
      src="/brand/mark.svg"
      alt="Above & Beyond Summit"
      width={48}
      height={48}
      className={className}
      priority
      unoptimized
    />
  );
}

/**
 * The full centered logo-wordmark lockup used in the public hero. Larger
 * JPEG with the AB mountain + "ABOVE & BEYOND SUMMIT" + "MINING |
 * INVESTMENTS | OPPORTUNITIES" tag. Use on login / accept hero sections.
 */
export function AboveBeyondLogoLockup({ className = "h-48 w-auto" }: { className?: string }) {
  return (
    <Image
      src="/brand/logo-official.jpg"
      alt="Above & Beyond Summit — Mining, Investments, Opportunities"
      width={990}
      height={667}
      className={className}
      priority
      unoptimized
    />
  );
}

/**
 * Dark compact top-of-page bar used on the signed-in attendee shell.
 * Visually matches the public site's sticky nav: dark charcoal with the
 * mark on the left and a slim ivory wordmark next to it.
 */
export function AboveBeyondHeader({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3" style={{ color: BRAND_IVORY }}>
      <AboveBeyondMark className={compact ? "h-7 w-7" : "h-9 w-9"} />
      <div className="min-w-0">
        <div className="font-serif text-base font-semibold leading-tight tracking-wide sm:text-lg">
          Above &amp; Beyond
        </div>
        <div className="truncate text-[10px] uppercase tracking-[0.22em] text-stone-400 sm:text-xs">
          Nov 22–24 · Scottsdale, AZ
        </div>
      </div>
    </div>
  );
}

/**
 * Full-bleed hero used by /platform/login and /platform/accept. Centers
 * the full logo lockup over a black field with gold-divider date line and
 * a slot for whatever auth card the caller passes in via children.
 */
export function AboveBeyondHero({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col"
      style={{ backgroundColor: BRAND_BLACK, color: BRAND_IVORY }}>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-5 py-10">
        <div className="mb-6 flex justify-center">
          <AboveBeyondLogoLockup className="h-40 w-auto sm:h-48" />
        </div>
        <div className="mb-8 flex items-center justify-center gap-3 text-center text-[11px] uppercase tracking-[0.22em]"
          style={{ color: BRAND_GOLD_L }}>
          <span>November 22–24</span>
          <span style={{ color: BRAND_GOLD }}>|</span>
          <span>Andaz Scottsdale</span>
          <span style={{ color: BRAND_GOLD }}>|</span>
          <span>Scottsdale, AZ</span>
        </div>
        <div className="w-full rounded-sm border px-6 py-8"
          style={{ backgroundColor: BRAND_CARD, borderColor: BRAND_BORDER }}>
          {children}
        </div>
        <div className="mt-8 text-center text-[10px] uppercase tracking-[0.22em]"
          style={{ color: BRAND_GREY }}>
          Presented by The Deep Dive
        </div>
      </main>
    </div>
  );
}

/**
 * Full-bleed wrapper for signed-in pages — black background, ivory text.
 */
export function AboveBeyondShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col"
      style={{ backgroundColor: BRAND_BLACK, color: BRAND_IVORY }}>
      {children}
    </div>
  );
}
