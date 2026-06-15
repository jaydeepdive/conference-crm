/** TDD Client indicator. Three sizes, in order of subtlety:
 *  - "dot"  → tiny red dot, hover tooltip. Used in list rows where the badge would be noise.
 *  - "sm"   → small pill. Used in compact contexts (e.g. lead detail header).
 *  - "md"   → larger pill. Used where the discount eligibility decision needs to be obvious
 *             (invoice builder recipient picker). */
export function TddBadge({ size = "sm" }: { size?: "dot" | "sm" | "md" }) {
  if (size === "dot") {
    return (
      <span
        title="TDD Client"
        aria-label="TDD Client"
        style={{ backgroundColor: "#C8102E" }}
        className="inline-block h-1.5 w-1.5 rounded-full align-middle"
      />
    );
  }
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
