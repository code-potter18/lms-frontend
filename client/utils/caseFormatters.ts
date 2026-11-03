/**
 * Preserved clinical abbreviations and acronyms that should maintain uppercase casing.
 */
const PRESERVED_ACRONYMS = new Set([
  "IV",
  "PO",
  "SC",
  "IM",
  "IT",
  "AUC",
  "IU",
  "DNA",
  "RNA",
  "NAB",
  "HER2",
  "BSA",
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
  "X",
]);

/**
 * Converts text from ALL CAPS (CC) or all lowercase (cc) into Proper / Title Case (Cc).
 * Examples:
 * - "CC" -> "Cc"
 * - "cc" -> "Cc"
 * - "CIPLA" -> "Cipla"
 * - "panacea biotech" -> "Panacea Biotech"
 * - "nab-paclitaxel" -> "NAB-Paclitaxel"
 */
export function toProperCase(text: string | null | undefined): string {
  if (!text) return "";
  const trimmed = text.trim();
  if (!trimmed) return "";

  return trimmed
    .split(/\s+/)
    .map((word) => {
      // Split on delimiters like hyphens, slashes, or open parenthesis
      return word
        .split(/([-/(])/g)
        .map((segment) => {
          if (!segment || /^[-/(]$/.test(segment)) return segment;
          const upper = segment.toUpperCase();
          if (PRESERVED_ACRONYMS.has(upper)) {
            return upper;
          }
          return segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase();
        })
        .join("");
    })
    .join(" ");
}

