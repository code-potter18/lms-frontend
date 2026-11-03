import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  chemotherapyApi,
  type ChemoAdministrationDay,
  type ChemoAdministrationSheet,
  type ChemoPlanOrderHeader,
  type ChemoPlanScheduleRow,
} from "../../../api/chemotherapy.api";
import {
  ADMIN_ROLE_SECTIONS,
  ADMIN_STATUS_LABEL,
  doseText,
  fmtDate,
  fmtTime,
  infusionText,
} from "./adminFormat";

/* Shared by the History and Medications tabs: the plan's cycle days with
   their real status, one day's medicines from its administration sheet,
   and the cycle-day picker. */

/* ================= Cycle day status (timeline + Medication History) =================
   A cycle day's status comes from the plan's saved order for it - never
   from the date - so a day the doctor skipped is never shown as done. */
export type CycleDayStatus = "COMPLETED" | "IN_ADMINISTRATION" | "CURRENT" | "UPCOMING" | "SKIPPED";

export type PlanCycleDay = {
  key: string;
  cycle: number;
  day: number;
  /* Planned date (YYYY-MM-DD). */
  date: string;
  order: ChemoPlanOrderHeader | null;
  status: CycleDayStatus;
};

export const cycleDayKey = (cycle: number, day: number) => `${cycle}-${day}`;
export const cycleDayLabel = (cycle: number, day: number) => `Cycle ${cycle} / Day ${day}`;

export const DAY_STATUS_STYLE: Record<
  CycleDayStatus,
  { label: string; icon: string; node: string; chip: string; card: string; title: string; text: string }
> = {
  COMPLETED: {
    label: "Completed",
    icon: "fa-solid fa-check",
    node: "bg-emerald-600 text-white ring-white",
    chip: "bg-emerald-50 text-emerald-700 border-emerald-200",
    card: "bg-white border border-emerald-200",
    title: "text-emerald-900",
    text: "text-gray-600",
  },
  IN_ADMINISTRATION: {
    label: "In Administration",
    icon: "fa-solid fa-syringe",
    node: "bg-amber-500 text-white ring-amber-100",
    chip: "bg-amber-50 text-amber-700 border-amber-200",
    card: "bg-amber-50/60 border border-amber-200",
    title: "text-amber-800",
    text: "text-gray-700 font-medium",
  },
  CURRENT: {
    label: "Current",
    icon: "fa-solid fa-play",
    node: "bg-blue-600 text-white ring-blue-100",
    chip: "bg-blue-100 text-blue-700 border-blue-200",
    card: "bg-blue-50/60 border border-blue-200",
    title: "text-blue-700",
    text: "text-gray-700 font-medium",
  },
  UPCOMING: {
    label: "Upcoming",
    icon: "fa-regular fa-calendar",
    node: "bg-slate-200 text-slate-600 ring-white",
    chip: "bg-slate-100 text-slate-500 border-slate-200",
    card: "bg-slate-50/60 border border-slate-200",
    title: "text-slate-600",
    text: "text-slate-500",
  },
  SKIPPED: {
    label: "Skipped",
    icon: "fa-solid fa-forward",
    node: "bg-white text-slate-400 ring-white border border-dashed border-slate-300",
    chip: "bg-white text-slate-400 border-dashed border-slate-300",
    card: "bg-white border border-dashed border-slate-200 opacity-80",
    title: "text-slate-400",
    text: "text-slate-400 italic",
  },
};

export const MED_STATUS_STYLE: Record<string, { icon: string; className: string }> = {
  GIVEN: { icon: "fa-circle-check", className: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
  PENDING: { icon: "fa-clock", className: "bg-amber-50 text-amber-700 border border-amber-200" },
  SKIPPED: { icon: "fa-forward", className: "bg-slate-100 text-slate-600 border border-slate-300" },
  CANCELLED: { icon: "fa-circle-xmark", className: "bg-red-50 text-red-600 border border-red-200" },
  NOT_RECORDED: { icon: "fa-minus", className: "bg-white text-slate-400 border border-dashed border-slate-300" },
  TAKE_HOME: { icon: "fa-house-medical", className: "bg-orange-50 text-orange-700 border border-orange-200" },
};

export const MED_ROLE_BADGE: Record<string, { label: string; className: string }> = {
  PREMEDICATION: { label: "Pre-med", className: "bg-purple-50 text-purple-700" },
  PRIMARY: { label: "Chemo", className: "bg-blue-50 text-blue-700" },
  SUPPORTIVE: { label: "Supportive", className: "bg-emerald-50 text-emerald-700" },
  DISCHARGE: { label: "Discharge", className: "bg-orange-50 text-orange-700" },
};

export function CycleDayStatusChip({ status }: { status: CycleDayStatus }) {
  const style = DAY_STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${style.chip}`}>
      <i className={`${style.icon} text-[9px]`} />
      {style.label}
    </span>
  );
}

export function MedicineStatusBadge({ status }: { status: string }) {
  const style = MED_STATUS_STYLE[status] ?? MED_STATUS_STYLE.PENDING;
  const label = status === "TAKE_HOME" ? "Take-home" : ADMIN_STATUS_LABEL[status] ?? status;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${style.className}`}>
      <i className={`fa-solid ${style.icon} text-[9px]`} />
      {label}
    </span>
  );
}

/* ================= The plan's cycle days =================
   Every scheduled medication day (or day with an order), with the status of
   its saved order. Without a schedule (older plans), the protocol's
   medication days per cycle. */
export function buildPlanCycleDays({
  orders,
  schedule,
  protocolItems,
  plannedCycles,
  startDate,
  intervalDays,
  planClosed,
}: {
  orders: ChemoPlanOrderHeader[];
  schedule: ChemoPlanScheduleRow[];
  protocolItems?: { administration_day?: number | string | null; cycle_day?: number | string | null }[] | null;
  plannedCycles?: number | null;
  startDate?: string | null;
  intervalDays?: number | null;
  planClosed: boolean;
}): PlanCycleDay[] {
  const isoOf = (value?: string | null) => (value ? String(value).slice(0, 10) : "");
  const orderMap = new Map(orders.map((order) => [cycleDayKey(order.cycle_number, order.cycle_day), order]));
  const rows = new Map<string, Omit<PlanCycleDay, "status">>();
  const addRow = (cycle: number, day: number, date: string) => {
    const key = cycleDayKey(cycle, day);
    if (rows.has(key)) return;
    rows.set(key, { key, cycle, day, date, order: orderMap.get(key) ?? null });
  };

  schedule.forEach((row) => {
    if (row.medication_day !== false || orderMap.has(cycleDayKey(row.cycle_number, row.cycle_day))) {
      addRow(row.cycle_number, row.cycle_day, isoOf(row.planned_date));
    }
  });
  orders.forEach((order) => addRow(order.cycle_number, order.cycle_day, isoOf(order.planned_date)));

  if (schedule.length === 0) {
    const protocolDays = new Set<number>();
    (protocolItems ?? []).forEach((item) => {
      const day = Number(item.administration_day ?? item.cycle_day);
      if (Number.isFinite(day) && day > 0) protocolDays.add(day);
    });
    if (protocolDays.size === 0) protocolDays.add(1);
    const maxOrderedCycle = orders.reduce((max, order) => Math.max(max, order.cycle_number), 0);
    const cycles = Math.max(plannedCycles || 0, maxOrderedCycle);
    const start = isoOf(startDate);
    const interval = intervalDays || 0;
    for (let cycle = 1; cycle <= cycles; cycle += 1) {
      [...protocolDays].forEach((day) => {
        let date = "";
        if (start) {
          const d = new Date(`${start}T00:00:00Z`);
          d.setUTCDate(d.getUTCDate() + (cycle - 1) * interval + (day - 1));
          date = d.toISOString().slice(0, 10);
        }
        addRow(cycle, day, date);
      });
    }
  }

  const list = [...rows.values()].sort((a, b) => a.cycle - b.cycle || a.day - b.day);
  const lastPlannedIndex = list.reduce((last, row, index) => (row.order ? index : last), -1);
  /* A cycle closed by its last day (or cancelled) takes no more orders. */
  const closedCycles = new Set<number>();
  orders.forEach((order) => {
    if (["COMPLETED", "CANCELLED"].includes(String(order.chemotherapy_cycle?.cycle_status ?? "").toUpperCase())) {
      closedCycles.add(order.cycle_number);
    }
  });

  return list.map((row, index) => {
    const orderStatus = String(row.order?.order_status ?? "").toUpperCase();
    let status: CycleDayStatus;
    if (orderStatus === "COMPLETED") status = "COMPLETED";
    else if (orderStatus === "IN_ADMINISTRATION") status = "IN_ADMINISTRATION";
    else if (row.order) status = "CURRENT";
    else if (index < lastPlannedIndex || planClosed || closedCycles.has(row.cycle)) status = "SKIPPED";
    else status = "UPCOMING";
    return { ...row, status };
  });
}

/* ================= One cycle day's medicines ================= */
export type DayMedicineRow = {
  id: string;
  /* PREMEDICATION / PRIMARY / SUPPORTIVE / POSTMEDICATION / DISCHARGE */
  role: string;
  name: string;
  generic: string;
  dose: string;
  patientDose: string;
  route: string;
  diluent: string;
  infusion: string;
  frequency: string;
  timing: string;
  detail: string;
  givenByName: string;
  givenAt: string | null;
  /* "Nurse · 21-Oct-2026 10:30" for a given medicine. */
  givenBy: string;
  status: string;
  reason: string;
};

export function sheetMedicineRows(
  sheet: ChemoAdministrationSheet | null | undefined,
  day: ChemoAdministrationDay | null
): DayMedicineRow[] {
  if (!day) return [];
  const roleOrder = ADMIN_ROLE_SECTIONS.map((section) => section.role);
  const administered = [...day.items]
    .sort((a, b) => {
      const ra = roleOrder.indexOf(String(a.drug_role).toUpperCase());
      const rb = roleOrder.indexOf(String(b.drug_role).toUpperCase());
      return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb) || a.drug_sequence - b.drug_sequence;
    })
    .map((item) => {
      const infusion = infusionText(item);
      return {
        id: item.administration_id ?? item.chemotherapy_plan_item_id,
        role: String(item.drug_role ?? "").toUpperCase(),
        name: item.drug_name || item.brand_name || item.generic_name || "—",
        generic: item.generic_name && item.generic_name !== item.drug_name ? item.generic_name : "",
        dose: doseText(item.protocol_dose, item.protocol_dose_unit),
        patientDose: doseText(item.calculated_dose, item.calculated_dose_unit),
        route: item.administration_route ?? "",
        diluent: [item.dilution_solution, item.dilution_volume].filter(Boolean).join(" · "),
        infusion: infusion !== "—" ? infusion : "",
        frequency: item.frequency ?? "",
        timing: item.timing_relative_to_primary ?? "",
        detail: item.administration_detail ?? "",
        givenByName: item.administered_by_name ?? "",
        givenAt: item.given_at,
        givenBy:
          item.status === "GIVEN"
            ? [item.administered_by_name, item.given_at ? `${fmtDate(item.given_at)} ${fmtTime(item.given_at)}` : ""]
                .filter(Boolean)
                .join(" · ")
            : "",
        status: item.status,
        reason: item.status === "SKIPPED" || item.status === "CANCELLED" ? item.status_reason ?? "" : "",
      };
    });
  const discharge = (sheet?.post_medications ?? []).map((item) => ({
    id: `discharge-${item.chemotherapy_plan_item_id}`,
    role: "DISCHARGE",
    name: item.drug_name || item.brand_name || "—",
    generic: "",
    dose: doseText(item.protocol_dose, item.protocol_dose_unit),
    patientDose: "",
    route: item.administration_route ?? "",
    diluent: "",
    infusion: "",
    frequency: item.frequency ?? "",
    timing: item.duration ?? "",
    detail: item.remarks ?? "",
    givenByName: "",
    givenAt: null,
    givenBy: "",
    status: "TAKE_HOME",
    reason: "",
  }));
  return [...administered, ...discharge];
}

/* ================= Picking a cycle day =================
   The planned days, then one more slot: the next scheduled day ("not planned
   yet"), or the end of the course. Opens on the day in administration (the
   administration sheet's own default), else the current, else the latest
   completed; one sheet is fetched and cached per day. */
export type CycleDaySlot =
  | { kind: "planned"; row: PlanCycleDay }
  | { kind: "unplanned"; row: PlanCycleDay }
  | { kind: "end"; last: PlanCycleDay | null };

export const cycleDaySlotKey = (slot: CycleDaySlot) => (slot.kind === "end" ? "end" : slot.row.key);

export function useCycleDaySheets(planId: string, cycleDays: PlanCycleDay[]) {
  const [sheets, setSheets] = useState<Record<string, ChemoAdministrationSheet | null>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState("");
  const requestedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    requestedRef.current = new Set();
    setSheets({});
    setErrors({});
    setSelected("");
    if (!planId) return;
    let cancelled = false;
    chemotherapyApi
      .getAdministrationSheet(planId)
      .then((response) => {
        const sheet = response.data?.data;
        if (cancelled || !sheet?.day) return;
        const key = cycleDayKey(sheet.day.cycle_number, sheet.day.cycle_day);
        requestedRef.current.add(key);
        setSheets((prev) => ({ ...prev, [key]: sheet }));
        setSelected((prev) => prev || key);
      })
      .catch(() => {
        /* No saved order yet - the default slot decides. */
      });
    return () => {
      cancelled = true;
    };
  }, [planId]);

  const slots = useMemo<CycleDaySlot[]>(() => {
    const list: CycleDaySlot[] = cycleDays.filter((row) => row.order).map((row) => ({ kind: "planned", row }));
    const nextUnplanned = cycleDays.find((row) => row.status === "UPCOMING");
    if (nextUnplanned) list.push({ kind: "unplanned", row: nextUnplanned });
    else if (cycleDays.length > 0) list.push({ kind: "end", last: cycleDays[cycleDays.length - 1] });
    return list;
  }, [cycleDays]);

  const defaultIndex = (() => {
    const byStatus = (status: CycleDayStatus) =>
      slots.findIndex((slot) => slot.kind === "planned" && slot.row.status === status);
    const inAdministration = byStatus("IN_ADMINISTRATION");
    if (inAdministration !== -1) return inAdministration;
    const current = byStatus("CURRENT");
    if (current !== -1) return current;
    const lastCompleted = slots.reduce(
      (last, slot, index) => (slot.kind === "planned" && slot.row.status === "COMPLETED" ? index : last),
      -1
    );
    return lastCompleted !== -1 ? lastCompleted : 0;
  })();
  const pickedIndex = slots.findIndex((slot) => cycleDaySlotKey(slot) === selected);
  const slotIndex = pickedIndex !== -1 ? pickedIndex : defaultIndex;
  const slot: CycleDaySlot | null = slots[slotIndex] ?? null;
  const plannedKey = slot?.kind === "planned" ? slot.row.key : "";

  useEffect(() => {
    if (!planId || slot?.kind !== "planned") return;
    const { key, cycle, day } = slot.row;
    if (requestedRef.current.has(key)) return;
    requestedRef.current.add(key);
    chemotherapyApi
      .getAdministrationSheet(planId, { cycle_number: cycle, cycle_day: day })
      .then((response) => setSheets((prev) => ({ ...prev, [key]: response.data?.data ?? null })))
      .catch((error: any) => {
        setSheets((prev) => ({ ...prev, [key]: null }));
        setErrors((prev) => ({
          ...prev,
          [key]: error?.response?.data?.message ?? "Couldn't load this cycle day's medicines.",
        }));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, plannedKey]);

  const sheet = plannedKey ? sheets[plannedKey] : undefined;
  const sheetDay =
    sheet?.day && slot?.kind === "planned" && sheet.day.cycle_number === slot.row.cycle && sheet.day.cycle_day === slot.row.day
      ? sheet.day
      : null;

  return {
    slots,
    slotIndex,
    slot,
    select: setSelected,
    /* Every sheet loaded so far, by cycle day key. */
    sheets,
    sheet,
    sheetDay,
    loading: Boolean(plannedKey) && sheet === undefined,
    error: plannedKey ? errors[plannedKey] ?? "" : "",
  };
}

/* ‹ jump list › control for the cycle days. */
export function CycleDayPicker({
  slots,
  slotIndex,
  slot,
  onSelect,
}: {
  slots: CycleDaySlot[];
  slotIndex: number;
  slot: CycleDaySlot | null;
  onSelect: (key: string) => void;
}) {
  if (slots.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => slotIndex > 0 && onSelect(cycleDaySlotKey(slots[slotIndex - 1]))}
        disabled={slotIndex <= 0}
        aria-label="Previous cycle day"
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <i className="fa-solid fa-chevron-left text-[10px]" />
      </button>

      <div className="relative">
        <select
          value={slot ? cycleDaySlotKey(slot) : ""}
          onChange={(event) => onSelect(event.target.value)}
          aria-label="Cycle day"
          className="h-8 min-w-[180px] cursor-pointer appearance-none rounded-lg border border-gray-200 bg-white pl-3 pr-8 text-[10px] font-semibold text-gray-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        >
          {slots.map((option) => (
            <option key={cycleDaySlotKey(option)} value={cycleDaySlotKey(option)}>
              {option.kind === "end"
                ? "End of treatment course"
                : `${cycleDayLabel(option.row.cycle, option.row.day)} · ${
                    option.kind === "unplanned" ? "Not planned yet" : DAY_STATUS_STYLE[option.row.status].label
                  }`}
            </option>
          ))}
        </select>
        <i className="fa-solid fa-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-gray-400" />
      </div>

      <button
        type="button"
        onClick={() => slotIndex < slots.length - 1 && onSelect(cycleDaySlotKey(slots[slotIndex + 1]))}
        disabled={slotIndex >= slots.length - 1}
        aria-label="Next cycle day"
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <i className="fa-solid fa-chevron-right text-[10px]" />
      </button>
    </div>
  );
}
