/**
 * Extract the horizontal measurement angle from a response filename.
 * Recognised patterns (case-insensitive): "hor15", "hor_15", "15deg",
 * "deg15". Returns null when no angle marker is present — callers treat a
 * single unmarked file as the on-axis (0°) response.
 */
export function angleFromFilename(name: string): number | null {
  const m =
    name.match(/hor[\s_-]?(\d{1,3})/i) ??
    name.match(/(\d{1,3})\s*deg/i) ??
    name.match(/deg[\s_-]?(\d{1,3})/i);
  if (!m) return null;
  const angle = Number(m[1]);
  return angle <= 180 ? angle : null;
}
