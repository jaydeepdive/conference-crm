/** Red pill, white text — same red as the thedeepdive.ca logo accent (#C8102E).
 *  Uses inline styles to guarantee colors render correctly regardless of Tailwind purge. */
export function TddBadge({ size = "sm" }: { size?: "sm" | "md" }) {
  const isSmall = size === "sm";
  return (
    <span
      style={{ backgroundColor: "#C8102E", color: "#FFFFFF" }}
      className={`inline-block rounded-full font-semibold uppercase tracking-widest2 ${
        isSmall ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-0.5 text-[11px]"
      }`}
      title="Active client of The Deep Dive"
    >
      TDD Client
    </span>
  );
}
