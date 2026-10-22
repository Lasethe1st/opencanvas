/** Short control → full pill; taller → softer corners, never below 24px. */
export function dynamicPillRadius(height: number): string {
  if (height <= 52) return "var(--r-pill)";
  const r = Math.max(24, 28 - (height - 52) * 0.08);
  return `${Math.round(r)}px`;
}
