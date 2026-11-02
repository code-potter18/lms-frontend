/* ============================================================
   DURATION HELPERS
   Shared by Clinical Details (Symptoms / Allergies / Comorbidities)
   and Personal History (Drug Consumption). A duration is stored as a
   numeric value plus a unit; encounter_symptom still keeps its
   canonical duration_days column, so those are converted here.
============================================================ */

export type DurationUnit = "day" | "week" | "month" | "year";

export interface DurationUnitOption {
  value: DurationUnit;
  singular: string;
  plural: string;
  days: number;
}

export const DURATION_UNIT_OPTIONS: DurationUnitOption[] = [
  { value: "day", singular: "day", plural: "Days", days: 1 },
  { value: "week", singular: "week", plural: "Weeks", days: 7 },
  { value: "month", singular: "month", plural: "Months", days: 30 },
  { value: "year", singular: "year", plural: "Years", days: 365 },
];

export const DEFAULT_DURATION_UNIT: DurationUnit = "day";

export function normalizeDurationUnit(unit?: string | null): DurationUnit {
  const match = DURATION_UNIT_OPTIONS.find(
    (option) => option.value === String(unit ?? "").toLowerCase(),
  );
  return match ? match.value : DEFAULT_DURATION_UNIT;
}

export function durationUnitOption(unit?: string | null): DurationUnitOption {
  const normalized = normalizeDurationUnit(unit);
  return (
    DURATION_UNIT_OPTIONS.find((option) => option.value === normalized) ??
    DURATION_UNIT_OPTIONS[0]
  );
}

const parseDurationNumber = (
  value: string | number | null | undefined,
): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;

  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return null;

  return Math.max(0, Math.min(9999, Math.trunc(numeric)));
};

/* For payloads: a blank value means "no duration" (null), never 0. */
export function toDurationPayload(
  value: string | number | null | undefined,
  unit?: string | null,
): { value: number | null; unit: DurationUnit | null } {
  const numeric = parseDurationNumber(value);

  if (numeric === null) {
    return { value: null, unit: null };
  }

  return { value: numeric, unit: normalizeDurationUnit(unit) };
}

/* Canonical days (encounter_symptom.duration_days). */
export function durationToDays(
  value: string | number | null | undefined,
  unit?: string | null,
): number | null {
  const numeric = parseDurationNumber(value);
  if (numeric === null) return null;

  return numeric * durationUnitOption(unit).days;
}

/* Rebuild the value + unit shown in the editor from stored days. Falls
   back to plain days when the stored number does not divide evenly by
   the stored unit (e.g. legacy rows). */
export function durationFromDays(
  days: number | null | undefined,
  unit?: string | null,
): { value: string; unit: DurationUnit } {
  if (days === null || days === undefined || !Number.isFinite(Number(days))) {
    return { value: "", unit: normalizeDurationUnit(unit) };
  }

  const normalized = normalizeDurationUnit(unit);
  const option = durationUnitOption(normalized);
  const numeric = Math.max(0, Math.trunc(Number(days)));

  if (option.value !== "day" && numeric % option.days === 0) {
    return { value: String(numeric / option.days), unit: normalized };
  }

  return { value: String(numeric), unit: "day" };
}

/* Human-readable, e.g. "2 weeks", "1 month". Blank when no value. */
export function formatDuration(
  value: string | number | null | undefined,
  unit?: string | null,
): string {
  const numeric = parseDurationNumber(value);
  if (numeric === null) return "";

  const option = durationUnitOption(unit);
  return `${numeric} ${numeric === 1 ? option.singular : option.value}s`;
}

/* For symptom rows that store canonical days + the chosen unit. */
export function formatDaysDuration(
  days: number | null | undefined,
  unit?: string | null,
): string {
  if (days === null || days === undefined) return "";

  const duration = durationFromDays(days, unit);
  return formatDuration(duration.value, duration.unit);
}
