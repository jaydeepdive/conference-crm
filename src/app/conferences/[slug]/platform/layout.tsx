/**
 * /conferences/[slug]/platform — pass-through layout plus the Above & Beyond
 * fonts (Cormorant Garamond serif + Jost sans), scoped to attendee routes
 * via a CSS variable + a wrapper div. Tailwind's `font-serif` is remapped
 * only INSIDE this wrapper so staff pages elsewhere keep their Cardo.
 */
import { Cormorant_Garamond, Jost } from "next/font/google";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ab-serif",
  display: "swap",
});
const jost = Jost({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-ab-sans",
  display: "swap",
});

export const dynamic = "force-dynamic";

export default function PlatformRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${cormorant.variable} ${jost.variable} ab-platform-root`}
      style={{ fontFamily: "var(--font-ab-sans), Jost, 'Segoe UI', sans-serif" }}
    >
      {/* Scoped font remap — only inside this wrapper does Tailwind's
          font-serif resolve to Cormorant Garamond. Staff CRM pages keep Cardo. */}
      <style>{`
        .ab-platform-root .font-serif {
          font-family: var(--font-ab-serif), 'Cormorant Garamond', Georgia, serif;
        }
      `}</style>
      {children}
    </div>
  );
}
