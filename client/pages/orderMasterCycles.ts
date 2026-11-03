import { format } from "date-fns";
import type { ChemoPlan } from "@/api/chemotherapy.api";

/*
 * Pure helpers behind the Chemotherapy Orders table (OrderMaster.tsx).
 *
 * They live in their own module - the same way consultation/doseCalculation.ts
 * sits next to its page - so the cycle maths can be unit-tested without
 * mounting the page (see orderMasterCycles.spec.ts).
 */

/* Avatar treatment matches Dashboard/Staff/Doctor/Appointments (same palette),
   but the colour comes from a hash of the patient id instead of the row index
   so a patient keeps their colour when the table is sorted or paged. */
export const AVATAR_PALETTE = [
  { avatarColor: "#00488D", initBg: "#D6E3FF" },
  { avatarColor: "#7B3200", initBg: "#FFDBCB" },
  { avatarColor: "#00C896", initBg: "rgba(0,200,150,0.12)" },
  { avatarColor: "#475C7F", initBg: "#E6E8EA" },
];

export function getInitials(name: string): string {
  const words = name.replace(/^Dr\.?\s*/i, "").trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}

export function avatarFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 100003;
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

/* Plan statuses that take no further orders. */
export const CLOSED_PLAN_STATUSES = ["COMPLETED", "CANCELLED", "DISCONTINUED"];
/* Cycle statuses that are finished either way. */
const CLOSED_CYCLE_STATUSES = ["COMPLETED", "CANCELLED"];

export interface CycleSummary {
  planned: number;
  completed: number;
  /* "Cycle 2 / Day 3", "Not started" or "-" */
  cycleLabel: string;
  /* "1 / 6 cycles done" or "-" */
  cyclesLabel: string;
  /* 0-100, completed / planned */
  progress: number;
  /* "" once the course is closed */
  nextCycleDate: string;
  /* the cycle the labs should be read from */
  currentCycleId: string;
}

/*
 * Everything the Cycle/Day column needs, read from the fields the plans list
 * actually returns:
 *   - chemotherapy_cycle[]  one row per cycle number (1..planned_cycles),
 *                           created up front by the backend
 *   - plan_orders[]         one row per saved cycle + day order
 *   - current_order         the backend's own "day being worked on" (first
 *                           still-ORDERED day, else latest IN_ADMINISTRATION,
 *                           else latest COMPLETED)
 *
 * chemotherapy_cycle.cycle_day is deliberately NOT used: it only records the
 * day last ordered, so it is null on a fresh plan and stale afterwards.
 * Reading cycle_number in descending order (the previous behavior) always
 * returned the LAST planned cycle - which is why a brand new 6-cycle plan
 * showed "Cycle 6" and the "0 / 6" branch was unreachable.
 */
export function summarizeCycles(plan: ChemoPlan): CycleSummary {
  const cycles = plan.chemotherapy_cycle ?? [];
  const orders = plan.plan_orders ?? [];
  const planned = plan.planned_cycles ?? 0;
  const completed = plan.completed_cycles ?? 0;

  const statusOf = (order: { order_status?: string | null }) =>
    String(order.order_status ?? "").toUpperCase();
  const currentOrder =
    orders.find((order) => statusOf(order) === "ORDERED") ??
    [...orders].reverse().find((order) => statusOf(order) === "IN_ADMINISTRATION") ??
    plan.current_order ??
    null;

  const cycleLabel = currentOrder
    ? `Cycle ${currentOrder.cycle_number} / Day ${currentOrder.cycle_day}`
    : planned > 0
      ? "Not started"
      : "—";

  const cyclesLabel = planned > 0 ? `${completed} / ${planned} cycles done` : "—";
  const progress = planned > 0 ? Math.min(100, Math.round((completed / planned) * 100)) : 0;

  // Next cycle to be treated: the first cycle that is neither COMPLETED nor
  // CANCELLED and sits beyond the completed count.
  const nextCycle = cycles.find(
    (cycle) =>
      (cycle.cycle_number ?? 0) > completed &&
      !CLOSED_CYCLE_STATUSES.includes(String(cycle.cycle_status ?? "").toUpperCase())
  );

  // expected_end_date is the end of the whole course, so it is never used as a
  // "next cycle" date (that made due-today/delayed light up on the projected
  // end date). Order: the cycle's own next date, its planned date, then the
  // schedule derived from start date + interval * completed.
  let derivedNext = "";
  const interval = plan.cycle_interval_days ?? 0;
  if (interval > 0 && plan.treatment_start_date) {
    const derived = new Date(plan.treatment_start_date);
    if (!Number.isNaN(derived.getTime())) {
      derived.setUTCDate(derived.getUTCDate() + completed * interval);
      derivedNext = derived.toISOString();
    }
  }

  const isClosed = CLOSED_PLAN_STATUSES.includes(
    String(plan.treatment_status ?? "").toUpperCase()
  );

  const nextCycleDate = isClosed
    ? ""
    : nextCycle?.next_cycle_date || nextCycle?.planned_date || derivedNext || "";

  // Lab reviews hang off a cycle, so the lookup key follows the cycle being
  // treated rather than the highest cycle number.
  const currentCycleId =
    currentOrder?.chemotherapy_cycle_id ||
    nextCycle?.chemotherapy_cycle_id ||
    cycles[cycles.length - 1]?.chemotherapy_cycle_id ||
    "";

  return { planned, completed, cycleLabel, cyclesLabel, progress, nextCycleDate, currentCycleId };
}

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return "—";
  // Date-only columns (treatment_start_date, next_cycle_date, planned_date)
  // arrive as UTC midnight - formatting those in local time would shift them
  // back a day for anyone west of UTC. Real timestamps (created_at) keep the
  // existing local-time formatting.
  const isDateOnly =
    parsed.getUTCHours() === 0 &&
    parsed.getUTCMinutes() === 0 &&
    parsed.getUTCSeconds() === 0 &&
    parsed.getUTCMilliseconds() === 0;
  if (!isDateOnly) return format(parsed, "MMM d, yyyy");
  return `${MONTHS_SHORT[parsed.getUTCMonth()]} ${parsed.getUTCDate()}, ${parsed.getUTCFullYear()}`;
}

export function toTime(iso: string | null | undefined): number {
  if (!iso) return 0;
  const time = new Date(iso).getTime();
  return Number.isNaN(time) ? 0 : time;
}

// The backend's appointment status sweep and the due-today/delayed counters
// this page mirrors both run on IST days, so both sides of the comparison are
// reduced to a whole IST day-number. The previous version did a
// (Date.UTC(...) - 5.5h) then (+ 5.5h) round trip, which cancelled itself out.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function istDayKey(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return null;
  return Math.floor((time + IST_OFFSET_MS) / DAY_MS);
}

export function todayIstKey(): number {
  return Math.floor((Date.now() + IST_OFFSET_MS) / DAY_MS);
}

export function isTodayIso(iso: string | null | undefined): boolean {
  return istDayKey(iso) === todayIstKey();
}

export function isOverdue(iso: string | null | undefined): boolean {
  const key = istDayKey(iso);
  return key !== null && key < todayIstKey();
}
