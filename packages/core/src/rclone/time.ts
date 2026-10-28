const RFC3339 = /^(\d{4})-(\d{2})-(\d{2})[Tt ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:([Zz])|([+-])(\d{2}):?(\d{2}))?$/;

/**
 * Parse an RFC 3339 timestamp as returned by rclone (which may carry
 * nanosecond precision) into milliseconds since the epoch. Sub-millisecond
 * digits are truncated. Independent of `Date.parse` quirks across engines.
 */
export function parseRcloneTime(text: string): number {
  const m = RFC3339.exec(text);
  if (!m) {
    const fallback = Date.parse(text);
    return Number.isNaN(fallback) ? 0 : fallback;
  }
  const [, y, mo, d, h, mi, s, frac, , sign, oh, om] = m;
  const ms = frac ? Number(frac.slice(0, 3).padEnd(3, '0')) : 0;
  let time = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s), ms);
  if (sign) {
    const offset = (Number(oh) * 60 + Number(om)) * 60_000;
    time += sign === '+' ? -offset : offset;
  }
  return time;
}

/** rclone's "modification times not supported" precision (100 years, in ns). */
export const MODTIME_NOT_SUPPORTED_NS = 3_153_600_000_000_000_000;

/**
 * Convert a backend's modtime precision (nanoseconds) into a comparison
 * tolerance in ms, or null when the backend can't keep modification times.
 */
export function precisionToToleranceMs(...precisionsNs: number[]): number | null {
  let max = 1;
  for (const ns of precisionsNs) {
    if (ns >= 3_600_000_000_000) return null; // ≥ 1 hour: treat as unsupported
    max = Math.max(max, Math.ceil(ns / 1_000_000));
  }
  return max;
}
