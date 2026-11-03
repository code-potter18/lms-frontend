import { describe, expect, it } from "vitest";
import type { ChemoPlan } from "@/api/chemotherapy.api";
import {
  avatarFor,
  fmtDate,
  getInitials,
  isOverdue,
  isTodayIso,
  summarizeCycles,
  toTime,
} from "./orderMasterCycles";

/* Minimal plan factory - only the fields the helpers read matter here. */
function plan(overrides: Partial<ChemoPlan> = {}): ChemoPlan {
  return {
    chemotherapy_plan_id: "CP0001",
    patient_id: "PT0001",
    patient_history_id: "PH0001",
    diagnosis_id: "DG0001",
    branch_id: "BR0001",
    treatment_start_date: "2026-01-05T00:00:00.000Z",
    planned_cycles: 6,
    completed_cycles: 0,
    cycle_interval_days: 21,
    treatment_status: "PLANNED",
    chemotherapy_cycle: [
      { chemotherapy_cycle_id: "CC1", cycle_number: 1, cycle_status: "PLANNED", planned_date: "2026-01-05T00:00:00.000Z" },
      { chemotherapy_cycle_id: "CC2", cycle_number: 2, cycle_status: "PLANNED", planned_date: "2026-01-26T00:00:00.000Z" },
      { chemotherapy_cycle_id: "CC3", cycle_number: 3, cycle_status: "PLANNED", planned_date: "2026-02-16T00:00:00.000Z" },
      { chemotherapy_cycle_id: "CC4", cycle_number: 4, cycle_status: "PLANNED", planned_date: "2026-03-09T00:00:00.000Z" },
      { chemotherapy_cycle_id: "CC5", cycle_number: 5, cycle_status: "PLANNED", planned_date: "2026-03-30T00:00:00.000Z" },
      { chemotherapy_cycle_id: "CC6", cycle_number: 6, cycle_status: "PLANNED", planned_date: "2026-04-20T00:00:00.000Z" },
    ],
    plan_orders: [],
    current_order: null,
    ...overrides,
  } as ChemoPlan;
}

describe("summarizeCycles", () => {
  it("reports 0 / 6 and 'Not started' for an untouched plan (never the last cycle)", () => {
    const s = summarizeCycles(plan());
    expect(s.cycleLabel).toBe("Not started");
    expect(s.cyclesLabel).toBe("0 / 6 cycles done");
    expect(s.progress).toBe(0);
    expect(s.nextCycleDate).toBe("2026-01-05T00:00:00.000Z");
    expect(s.currentCycleId).toBe("CC1");
  });

  it("reads the day being worked on from the first still-ORDERED order", () => {
    const s = summarizeCycles(
      plan({
        treatment_status: "ACTIVE",
        completed_cycles: 1,
        plan_orders: [
          { plan_order_id: "PO1", chemotherapy_plan_id: "CP0001", chemotherapy_cycle_id: "CC1", cycle_number: 1, cycle_day: 1, order_status: "COMPLETED", hydration_saved: false },
          { plan_order_id: "PO2", chemotherapy_plan_id: "CP0001", chemotherapy_cycle_id: "CC2", cycle_number: 2, cycle_day: 1, order_status: "ORDERED", hydration_saved: false },
        ],
      })
    );
    expect(s.cycleLabel).toBe("Cycle 2 / Day 1");
    expect(s.cyclesLabel).toBe("1 / 6 cycles done");
    expect(s.progress).toBe(17);
    expect(s.currentCycleId).toBe("CC2");
    expect(s.nextCycleDate).toBe("2026-01-26T00:00:00.000Z");
  });

  it("reads the day being administered when no day is still ORDERED", () => {
    const s = summarizeCycles(
      plan({
        treatment_status: "ACTIVE",
        plan_orders: [
          { plan_order_id: "PO1", chemotherapy_plan_id: "CP0001", chemotherapy_cycle_id: "CC1", cycle_number: 1, cycle_day: 1, order_status: "COMPLETED", hydration_saved: false },
          { plan_order_id: "PO2", chemotherapy_plan_id: "CP0001", chemotherapy_cycle_id: "CC1", cycle_number: 1, cycle_day: 2, order_status: "IN_ADMINISTRATION", hydration_saved: false },
        ],
      })
    );
    expect(s.cycleLabel).toBe("Cycle 1 / Day 2");
    expect(s.currentCycleId).toBe("CC1");
  });

  it("prefers a day still being ORDERED over one being administered", () => {
    const s = summarizeCycles(
      plan({
        treatment_status: "ACTIVE",
        plan_orders: [
          { plan_order_id: "PO1", chemotherapy_plan_id: "CP0001", chemotherapy_cycle_id: "CC1", cycle_number: 1, cycle_day: 1, order_status: "IN_ADMINISTRATION", hydration_saved: false },
          { plan_order_id: "PO2", chemotherapy_plan_id: "CP0001", chemotherapy_cycle_id: "CC1", cycle_number: 1, cycle_day: 2, order_status: "ORDERED", hydration_saved: false },
        ],
      })
    );
    expect(s.cycleLabel).toBe("Cycle 1 / Day 2");
  });

  it("falls back to the backend's current_order when no day is still ORDERED", () => {
    const s = summarizeCycles(
      plan({
        treatment_status: "COMPLETED",
        completed_cycles: 6,
        current_order: { plan_order_id: "PO9", chemotherapy_plan_id: "CP0001", chemotherapy_cycle_id: "CC6", cycle_number: 6, cycle_day: 1, order_status: "COMPLETED", hydration_saved: false, chemotherapy_plan_items: [], chemotherapy_plan_hydration: [] },
      })
    );
    expect(s.cycleLabel).toBe("Cycle 6 / Day 1");
    expect(s.cyclesLabel).toBe("6 / 6 cycles done");
    expect(s.progress).toBe(100);
    // A closed course has nothing upcoming.
    expect(s.nextCycleDate).toBe("");
  });

  it("skips cycles that are already COMPLETED or CANCELLED when picking the next one", () => {
    const s = summarizeCycles(
      plan({
        treatment_status: "ACTIVE",
        completed_cycles: 1,
        chemotherapy_cycle: [
          { chemotherapy_cycle_id: "CC1", cycle_number: 1, cycle_status: "COMPLETED", next_cycle_date: "2026-01-26T00:00:00.000Z", planned_date: "2026-01-05T00:00:00.000Z" },
          { chemotherapy_cycle_id: "CC2", cycle_number: 2, cycle_status: "CANCELLED", planned_date: "2026-01-26T00:00:00.000Z" },
          { chemotherapy_cycle_id: "CC3", cycle_number: 3, cycle_status: "PLANNED", next_cycle_date: "2026-02-16T00:00:00.000Z", planned_date: "2026-02-16T00:00:00.000Z" },
        ],
      })
    );
    expect(s.nextCycleDate).toBe("2026-02-16T00:00:00.000Z");
    expect(s.currentCycleId).toBe("CC3");
  });

  it("derives the next cycle date from start + interval * completed when no cycle rows exist", () => {
    const s = summarizeCycles(
      plan({ treatment_status: "ACTIVE", completed_cycles: 1, chemotherapy_cycle: [] })
    );
    expect(s.nextCycleDate).toBe("2026-01-26T00:00:00.000Z");
    expect(s.currentCycleId).toBe("");
  });

  it("never uses expected_end_date as the next cycle date", () => {
    const s = summarizeCycles(
      plan({ expected_end_date: "2026-04-20T00:00:00.000Z", chemotherapy_cycle: [] })
    );
    expect(s.nextCycleDate).not.toBe("2026-04-20T00:00:00.000Z");
  });

  it("handles a plan with no planned cycles at all", () => {
    const s = summarizeCycles(plan({ planned_cycles: 0, chemotherapy_cycle: [] }));
    expect(s.cycleLabel).toBe("—");
    expect(s.cyclesLabel).toBe("—");
    expect(s.progress).toBe(0);
  });
});

describe("fmtDate", () => {
  it("formats a date-only column in UTC (no off-by-one west of UTC)", () => {
    expect(fmtDate("2026-01-05T00:00:00.000Z")).toBe("Jan 5, 2026");
  });

  it("returns a dash for missing or invalid values", () => {
    expect(fmtDate(null)).toBe("—");
    expect(fmtDate("")).toBe("—");
    expect(fmtDate("not-a-date")).toBe("—");
  });
});

describe("due-today / overdue helpers", () => {
  it("treats today in IST as due today, not overdue", () => {
    const nowIst = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString();
    expect(isTodayIso(nowIst)).toBe(true);
    expect(isOverdue(nowIst)).toBe(false);
  });

  it("flags past days as overdue and ignores missing values", () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(isOverdue(threeDaysAgo)).toBe(true);
    expect(isOverdue(null)).toBe(false);
    expect(isTodayIso(undefined)).toBe(false);
  });

  it("sorts invalid dates to the epoch instead of NaN", () => {
    expect(toTime("not-a-date")).toBe(0);
    expect(toTime(null)).toBe(0);
  });
});

describe("patient avatar", () => {
  it("builds two-letter initials", () => {
    expect(getInitials("Ravi Kumar")).toBe("RK");
    expect(getInitials("Dr. Meera Nair")).toBe("MN");
    expect(getInitials("")).toBe("?");
  });

  it("picks the same palette entry for the same patient id", () => {
    expect(avatarFor("PT0001")).toEqual(avatarFor("PT0001"));
  });
});
