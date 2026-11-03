/**
 * parseDate - Parse a date string in various formats into a Date object.
 * Supported formats:
 *   - YYYY-MM-DD / YYYY-MM-DDTHH:mm:ss.sssZ (ISO)  e.g., "2024-06-13", "2024-06-13T00:00:00.000Z"
 *   - DD-MM-YYYY                                    e.g., "13-06-2024"
 *   - MM/DD/YYYY                                    e.g., "06/13/2024"
 *   - DD/MM/YYYY                                    e.g., "13/06/2024"
 * Returns null if the string cannot be parsed or is invalid.
 */
export function parseDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;

  const trimmed = String(dateStr).trim();
  if (trimmed === "") return null;

  // 1. Try ISO format (YYYY-MM-DD or YYYY/MM/DD, with optional time/timezone)
  const isoMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s].*)?$/);
  if (isoMatch) {
    // If it includes time or timezone info, let native Date parse it first
    if (trimmed.includes("T") || trimmed.includes(":") || trimmed.endsWith("Z")) {
      const d = new Date(trimmed);
      if (!isNaN(d.getTime())) {
        return d;
      }
    }

    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1; // JS months are 0-indexed
    const day = parseInt(isoMatch[3], 10);
    const d = new Date(year, month, day);
    if (d.getFullYear() === year && d.getMonth() === month && d.getDate() === day) {
      return d;
    }
  }

  // 2. DD-MM-YYYY format: "13-06-2024" (with optional time component)
  const dmyHyphenMatch = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})(?:[T\s].*)?$/);
  if (dmyHyphenMatch) {
    const day = parseInt(dmyHyphenMatch[1], 10);
    const month = parseInt(dmyHyphenMatch[2], 10) - 1;
    const year = parseInt(dmyHyphenMatch[3], 10);
    if (day >= 1 && day <= 31 && month >= 0 && month <= 11 && year >= 1900) {
      const d = new Date(year, month, day);
      if (
        d.getFullYear() === year &&
        d.getMonth() === month &&
        d.getDate() === day
      ) {
        return d;
      }
    }
  }

  // 3. Slash formats: MM/DD/YYYY or DD/MM/YYYY (with optional time component)
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[T\s].*)?$/);
  if (slashMatch) {
    const a = parseInt(slashMatch[1], 10);
    const b = parseInt(slashMatch[2], 10);
    const year = parseInt(slashMatch[3], 10);

    // If a > 12, likely DD/MM/YYYY
    if (a > 12 && b <= 12) {
      const day = a;
      const month = b - 1;
      const d = new Date(year, month, day);
      if (
        d.getFullYear() === year &&
        d.getMonth() === month &&
        d.getDate() === day
      ) {
        return d;
      }
    } else if (b > 12 && a <= 12) {
      // If b > 12, likely MM/DD/YYYY
      const month = a - 1;
      const day = b;
      const d = new Date(year, month, day);
      if (
        d.getFullYear() === year &&
        d.getMonth() === month &&
        d.getDate() === day
      ) {
        return d;
      }
    } else if (a <= 12 && b <= 12) {
      // Ambiguous - try MM/DD/YYYY first
      const d1 = new Date(year, a - 1, b);
      if (
        d1.getFullYear() === year &&
        d1.getMonth() === a - 1 &&
        d1.getDate() === b
      ) {
        return d1;
      }
      // Try DD/MM/YYYY
      const d2 = new Date(year, b - 1, a);
      if (
        d2.getFullYear() === year &&
        d2.getMonth() === b - 1 &&
        d2.getDate() === a
      ) {
        return d2;
      }
    }
  }

  // 4. Fallback: try native Date parsing if it represents a valid date
  const fallback = new Date(trimmed);
  if (!isNaN(fallback.getTime())) {
    return fallback;
  }

  return null;
}

/**
 * toLocalISODate - Format a Date as YYYY-MM-DD using its LOCAL calendar fields.
 * Unlike `date.toISOString().slice(0, 10)`, this does not shift the day for
 * timezones ahead of UTC (e.g. local Monday 00:00 in IST is Sunday in UTC).
 */
export function toLocalISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * calculateYearsSince - Calculate full completed years between a given date and today.
 * Returns 0 if the date is in the future, invalid, or missing.
 */
export function calculateYearsSince(date: Date | string | null | undefined): number {
  if (!date) return 0;
  const d = typeof date === "string" ? parseDate(date) : date;
  if (!d || isNaN(d.getTime())) return 0;

  const today = new Date();
  let years = today.getFullYear() - d.getFullYear();
  const monthDiff = today.getMonth() - d.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < d.getDate())) {
    years--;
  }
  return Math.max(0, years);
}