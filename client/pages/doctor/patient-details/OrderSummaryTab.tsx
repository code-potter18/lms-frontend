import React, { useEffect, useMemo, useRef, useState } from "react";
import { labOrderItemApi, type LabOrderItemRecord } from "../../../api/labOrder.api";
import { labReportApi, parseReportComment } from "../../../api/labReport.api";
import {
  chemotherapyApi,
  chemoPlanCurrentItems,
  chemoPlanItemName,
  isChemoPlanClosed,
  type ChemoAdministrationSheet,
  type ChemoPlanOrder,
} from "../../../api/chemotherapy.api";
import type { SummaryPlanItem, SummaryPlan } from "./types";
import { useDischargeMedicines, useNextVisitBooking } from "./hooks";

/* ============================================================
   ORDER SUMMARY TAB
   The patient's live treatment state: the cycle / day timeline (opens on
   the day in administration; any day can be picked - a completed day
   shows what was actually given), the selected day's medicines by type
   with their administration status, the next cycle day appointment
   (Book / Reschedule), progress by completed cycles, the schedule, lab
   validation with chemo clearance and the clinical info.
   ============================================================ */

type OrderSummaryTabProps = {
  patientId: string;
  savedPlan: SummaryPlan | null;
  /* Shown when the patient has no chemotherapy plan yet. */
  planNotice: string;
  /* Kept for the parent; the tab picks its cycle / day itself. */
  selectedCycle?: number;
  cycleMedicationsMap?: Record<string, any[]>;
};

type CycleDay = { cycle: number; day: number };
type DayRow = CycleDay & { date: string; medication: boolean };

type MedicineRow = {
  id: string;
  /* PREMEDICATION / PRIMARY / SUPPORTIVE ... */
  role: string;
  name: string;
  dose: string;
  patientDose: string;
  route: string;
  diluent: string;
  infusion: string;
  timing: string;
  detail: string;
  status: string;
  statusNote: string;
};

type DischargeRow = { id: string; name: string; dose: string; frequency: string; instruction: string; duration: string };

type LabRow = {
  key: string;
  name: string;
  result: string;
  unit: string;
  range: string;
  status: string;
  date: string;
};

type DayDetail = { sheet?: ChemoAdministrationSheet | null; order?: ChemoPlanOrder | null; error?: string };

/* ---------------- helpers ---------------- */

const isoDay = (value?: string | null) => (value ? String(value).slice(0, 10) : "");

const fmtDate = (value?: string | null) => {
  const match = isoDay(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : "—";
};

const fmtDateTime = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

const localTodayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const addDaysIso = (iso: string, days: number) => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

const dayKey = (cycle: number, day: number) => `${cycle}-${day}`;

const joinParts = (...parts: (string | number | null | undefined)[]) =>
  parts.map((part) => (part == null ? "" : String(part).trim())).filter(Boolean).join(" · ");

const doseText = (value?: number | string | null, unit?: string | null) =>
  value == null || value === "" ? "" : `${value} ${unit ?? ""}`.trim();

const roleOf = (role?: string | null) => String(role ?? "").toUpperCase();

const STATUS_BADGE: Record<string, [string, string]> = {
  GIVEN: ["Given", "bg-emerald-100 text-emerald-700"],
  PENDING: ["Pending", "bg-amber-100 text-amber-700"],
  SKIPPED: ["Skipped", "bg-orange-100 text-orange-700"],
  CANCELLED: ["Cancelled", "bg-red-100 text-red-600"],
  NOT_RECORDED: ["Not recorded", "bg-slate-100 text-slate-600"],
  ORDERED: ["Ordered", "bg-blue-100 text-blue-700"],
  PLANNED: ["Planned", "bg-slate-100 text-slate-600"],
};

const DAY_STATE: Record<string, { label: string; cls: string }> = {
  COMPLETED: { label: "Completed", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  IN_ADMINISTRATION: { label: "In administration", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  ORDERED: { label: "Ordered", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  PLANNED: { label: "Planned — not yet ordered", cls: "bg-slate-50 text-slate-600 border-slate-200" },
};

const LAB_STATUS_CLS = (status: string) =>
  status === "Critical"
    ? "bg-red-100 text-red-700"
    : status === "Abnormal"
      ? "bg-amber-100 text-amber-700"
      : status === "Normal" || status === "Completed"
        ? "bg-emerald-100 text-emerald-700"
        : status === "Ordered"
          ? "bg-blue-100 text-blue-700"
          : "bg-slate-100 text-slate-600";

function Badge({ status }: { status: string }) {
  const [label, cls] = STATUS_BADGE[status] ?? [status || "—", "bg-slate-100 text-slate-600"];
  return <span className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${cls}`}>{label}</span>;
}

function InfoTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-800">{label}</div>
      <div className="break-words text-[10px] font-bold text-slate-800">{value || "—"}</div>
    </div>
  );
}

function MedicineTable({
  title,
  icon,
  tone,
  rows,
  empty,
}: {
  title: string;
  icon: string;
  tone: string;
  rows: MedicineRow[];
  empty: string;
}) {
  return (
    <div className="overflow-hidden rounded-[16px] border border-[#e2e8f0] bg-white shadow-sm">
      <div className={`flex items-center border-b border-[#e2e8f0] px-5 py-4 ${tone}`}>
        <i className={`${icon} mr-2`} />
        <h4 className="text-[10px] font-bold text-slate-800">{title}</h4>
        <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{rows.length}</span>
      </div>
      <div className="overflow-x-auto p-5">
        <table className="w-full text-left text-[10px]">
          <thead>
            <tr className="border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-400">
              <th className="w-8 pb-2 font-bold">#</th>
              <th className="pb-2 font-bold">DRUG</th>
              <th className="pb-2 font-bold">DOSE</th>
              <th className="pb-2 font-bold">PATIENT DOSE</th>
              <th className="pb-2 font-bold">ROUTE</th>
              <th className="pb-2 font-bold">DILUENT / VOLUME</th>
              <th className="pb-2 font-bold">INFUSION / TIMING</th>
              <th className="pb-2 text-right font-bold">STATUS</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-6 text-center text-[10px] text-slate-400">{empty}</td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={row.id} className="border-b border-slate-50 align-top last:border-0">
                  <td className="py-2">{index + 1}</td>
                  <td className="py-2 font-bold text-slate-800">
                    {row.name || "—"}
                    {row.detail && <div className="mt-0.5 text-[10px] text-slate-500">{row.detail}</div>}
                  </td>
                  <td className="whitespace-nowrap py-2">{row.dose || "—"}</td>
                  <td className="whitespace-nowrap py-2">{row.patientDose || "—"}</td>
                  <td className="whitespace-nowrap py-2">{row.route || "—"}</td>
                  <td className="py-2">{row.diluent || "—"}</td>
                  <td className="py-2">{joinParts(row.infusion, row.timing) || "—"}</td>
                  <td className="py-2 text-right">
                    <Badge status={row.status} />
                    {row.statusNote && <div className="mt-1 text-[10px] text-slate-500">{row.statusNote}</div>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const OrderSummaryTab: React.FC<OrderSummaryTabProps> = ({
  patientId: resolvedPatientId,
  savedPlan,
  planNotice,
}) => {
  const today = localTodayIso();
  const planId = savedPlan?.chemotherapy_plan_id ?? "";
  const planClosed = isChemoPlanClosed(savedPlan);

  /* ---------------- schedule + orders ---------------- */

  const orderMap = useMemo(
    () => new Map((savedPlan?.plan_orders ?? []).map((order) => [dayKey(order.cycle_number, order.cycle_day), order])),
    [savedPlan?.plan_orders]
  );

  /* Every cycle day with its planned date: the plan's schedule, else
     start date + interval (days from the plan's medicines). Saved orders
     missing from the schedule are added. */
  const scheduleRows = useMemo<DayRow[]>(() => {
    let rows: DayRow[] = (savedPlan?.chemotherapy_plan_schedule ?? []).map((row) => ({
      cycle: row.cycle_number,
      day: row.cycle_day,
      date: isoDay(row.planned_date),
      medication: row.medication_day !== false,
    }));
    if (rows.length === 0) {
      const start = isoDay(savedPlan?.treatment_start_date);
      const planned = savedPlan?.planned_cycles ?? 0;
      const interval = savedPlan?.cycle_interval_days ?? 0;
      if (start && planned > 0) {
        const items = chemoPlanCurrentItems<SummaryPlanItem>(savedPlan);
        const days = Math.max(1, ...items.map((item) => Number(item.administration_day ?? item.cycle_day ?? 1) || 1));
        for (let cycle = 1; cycle <= planned; cycle += 1) {
          for (let day = 1; day <= days; day += 1) {
            rows.push({ cycle, day, date: addDaysIso(start, (cycle - 1) * interval + (day - 1)), medication: true });
          }
        }
      }
    }
    const known = new Set(rows.map((row) => dayKey(row.cycle, row.day)));
    orderMap.forEach((order, key) => {
      if (!known.has(key)) {
        rows.push({ cycle: order.cycle_number, day: order.cycle_day, date: isoDay(order.planned_date), medication: true });
      }
    });
    rows = rows.sort((a, b) => a.cycle - b.cycle || a.day - b.day);
    return rows;
  }, [savedPlan, orderMap]);

  /* The days that can be picked: medication days (or ordered ones). */
  const medicationRows = useMemo(
    () => scheduleRows.filter((row) => row.medication || orderMap.has(dayKey(row.cycle, row.day))),
    [scheduleRows, orderMap]
  );

  const statusOf = (cycle: number, day: number) => orderMap.get(dayKey(cycle, day))?.order_status ?? "PLANNED";
  const rowOf = (cycle: number, day: number) => scheduleRows.find((row) => row.cycle === cycle && row.day === day);

  const cycleRecordOf = (cycle: number) =>
    (savedPlan?.chemotherapy_cycle ?? []).find((record) => record.cycle_number === cycle) ?? null;

  /* One timeline node per cycle. */
  const timelineCycles = useMemo(() => {
    const numbers = new Set<number>(scheduleRows.map((row) => row.cycle));
    for (let cycle = 1; cycle <= (savedPlan?.planned_cycles ?? 0); cycle += 1) numbers.add(cycle);
    return [...numbers].sort((a, b) => a - b).map((cycle) => {
      const days = medicationRows.filter((row) => row.cycle === cycle);
      const statuses = days.map((row) => statusOf(row.cycle, row.day));
      const cycleStatus = String(cycleRecordOf(cycle)?.cycle_status ?? "").toUpperCase();
      const done = cycleStatus === "COMPLETED" || (statuses.length > 0 && statuses.every((status) => status === "COMPLETED"));
      const inProgress =
        !done &&
        (cycleStatus === "IN_PROGRESS" || statuses.some((status) => status === "IN_ADMINISTRATION" || status === "ORDERED"));
      return { cycle, date: days[0]?.date || scheduleRows.find((row) => row.cycle === cycle)?.date || "", done, inProgress };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleRows, medicationRows, savedPlan]);

  /* Without the administration sheet: the first day not completed. */
  const fallbackCurrent = useMemo<CycleDay | null>(() => {
    const open = medicationRows.find((row) => statusOf(row.cycle, row.day) !== "COMPLETED");
    const pick = open ?? medicationRows[medicationRows.length - 1];
    return pick ? { cycle: pick.cycle, day: pick.day } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medicationRows]);

  /* ---------------- current / selected day ---------------- */

  const [sheetCurrent, setSheetCurrent] = useState<CycleDay | null>(null);
  const [initialLoading, setInitialLoading] = useState(false);
  const [picked, setPicked] = useState<CycleDay | null>(null);
  const [dayDetails, setDayDetails] = useState<Record<string, DayDetail>>({});
  const requested = useRef<Set<string>>(new Set());

  const current = sheetCurrent ?? fallbackCurrent;
  const selected = picked ?? current;
  const selectedKey = selected ? dayKey(selected.cycle, selected.day) : "";

  /* The administration sheet without a day opens on the day in
     administration (else the open ordered day, else the latest completed). */
  useEffect(() => {
    requested.current = new Set();
    setDayDetails({});
    setPicked(null);
    setSheetCurrent(null);
    if (!planId) return;
    let cancelled = false;
    setInitialLoading(true);
    chemotherapyApi
      .getAdministrationSheet(planId)
      .then((response) => {
        if (cancelled) return;
        const sheet = response.data?.data;
        if (sheet?.day) {
          const key = dayKey(sheet.day.cycle_number, sheet.day.cycle_day);
          requested.current.add(`${key}:sheet`);
          setDayDetails((prev) => ({ ...prev, [key]: { ...prev[key], sheet } }));
          setSheetCurrent({ cycle: sheet.day.cycle_number, day: sheet.day.cycle_day });
        }
      })
      .catch(() => {
        /* No saved order yet - the schedule decides the current day. */
      })
      .finally(() => {
        if (!cancelled) setInitialLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [planId, savedPlan]);

  /* The selected day's administration sheet + saved order (cached). */
  useEffect(() => {
    if (!planId || !selected || !orderMap.has(selectedKey)) return;
    const { cycle, day } = selected;
    const key = selectedKey;
    if (!requested.current.has(`${key}:sheet`)) {
      requested.current.add(`${key}:sheet`);
      chemotherapyApi
        .getAdministrationSheet(planId, { cycle_number: cycle, cycle_day: day })
        .then((response) => setDayDetails((prev) => ({ ...prev, [key]: { ...prev[key], sheet: response.data?.data ?? null } })))
        .catch((error: any) =>
          setDayDetails((prev) => ({
            ...prev,
            [key]: { ...prev[key], sheet: null, error: error?.response?.data?.message ?? "Couldn't load the administration details." },
          }))
        );
    }
    if (!requested.current.has(`${key}:order`)) {
      requested.current.add(`${key}:order`);
      chemotherapyApi
        .getPlanOrder(planId, cycle, day)
        .then((response) => setDayDetails((prev) => ({ ...prev, [key]: { ...prev[key], order: response.data?.data ?? null } })))
        .catch(() => setDayDetails((prev) => ({ ...prev, [key]: { ...prev[key], order: null } })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, selectedKey, orderMap]);

  const detail = dayDetails[selectedKey] ?? {};
  const selectedStatus = selected ? statusOf(selected.cycle, selected.day) : "PLANNED";
  const selectedRow = selected ? rowOf(selected.cycle, selected.day) : undefined;
  const sheetDay =
    detail.sheet?.day && selected && detail.sheet.day.cycle_number === selected.cycle && detail.sheet.day.cycle_day === selected.day
      ? detail.sheet.day
      : null;
  const selectedOrder = detail.order ?? null;
  const dayLoading =
    Boolean(selected) && selectedStatus !== "PLANNED" && (detail.sheet === undefined || detail.order === undefined) && !detail.error;

  /* ---------------- medicines of the selected day ---------------- */

  const medicineRows = useMemo<MedicineRow[]>(() => {
    if (!selected) return [];
    if (sheetDay) {
      return sheetDay.items.map((item) => ({
        id: item.administration_id ?? item.chemotherapy_plan_item_id,
        role: roleOf(item.drug_role),
        name: item.drug_name || item.generic_name || item.brand_name || "",
        dose: doseText(item.protocol_dose, item.protocol_dose_unit),
        patientDose: doseText(item.calculated_dose, item.calculated_dose_unit),
        route: item.administration_route ?? "",
        diluent: joinParts(item.dilution_solution, item.dilution_volume),
        infusion: joinParts(
          item.infusion_type,
          item.infusion_duration_minutes ? `${item.infusion_duration_minutes} min` : "",
          item.infusion_rate
        ),
        timing: joinParts(item.frequency, item.timing_relative_to_primary),
        detail: item.administration_detail ?? "",
        status: item.status,
        statusNote:
          item.status === "GIVEN"
            ? joinParts(item.administered_by_name ? `by ${item.administered_by_name}` : "", fmtDateTime(item.given_at))
            : item.status === "SKIPPED" || item.status === "CANCELLED"
              ? item.status_reason ?? ""
              : "",
      }));
    }
    const fromOrder = selectedOrder?.chemotherapy_plan_items;
    const planned =
      fromOrder && fromOrder.length > 0
        ? fromOrder
        : selectedStatus === "PLANNED"
          ? ((savedPlan?.chemotherapy_plan_items ?? []).length > 0
              ? savedPlan?.chemotherapy_plan_items ?? []
              : chemoPlanCurrentItems<SummaryPlanItem>(savedPlan)
            ).filter((item: any) => Number(item.administration_day ?? item.cycle_day ?? 1) === selected.day)
          : [];
    return (planned as any[]).map((item) => ({
      id: item.chemotherapy_plan_item_id,
      role: roleOf(item.drug_role),
      name: chemoPlanItemName(item),
      dose: doseText(item.protocol_dose, item.protocol_dose_unit),
      patientDose: doseText(item.calculated_dose, item.calculated_dose_unit),
      route: item.administration_route ?? "",
      diluent: joinParts(item.dilution_solution, item.dilution_volume),
      infusion: joinParts(
        item.infusion_type,
        item.infusion_duration_minutes ? `${item.infusion_duration_minutes} min` : "",
        item.infusion_rate
      ),
      timing: joinParts(item.frequency, item.timing_relative_to_primary),
      detail: item.administration_detail ?? "",
      status: selectedStatus === "PLANNED" ? "PLANNED" : selectedStatus === "COMPLETED" ? "NOT_RECORDED" : "ORDERED",
      statusNote: "",
    }));
  }, [selected, sheetDay, selectedOrder, selectedStatus, savedPlan]);

  const premedications = medicineRows.filter((row) => row.role === "PREMEDICATION");
  const chemoOrders = medicineRows.filter((row) => row.role === "PRIMARY");
  const supportive = medicineRows.filter((row) =>
    ["SUPPORTIVE", "POSTMEDICATION", ""].includes(row.role)
  );

  /* Discharge: the day's discharge medicines, else the protocol's. */
  const {
    rows: protocolDischarge,
    loading: protocolDischargeLoading,
    error: protocolDischargeError,
  } = useDischargeMedicines(savedPlan?.source_protocol_id || "");

  const dischargeRows = useMemo<DischargeRow[]>(() => {
    const fromSheet = detail.sheet?.post_medications ?? [];
    if (sheetDay && fromSheet.length > 0) {
      return fromSheet.map((item) => ({
        id: item.chemotherapy_plan_item_id,
        name: item.drug_name || item.brand_name || "",
        dose: doseText(item.protocol_dose, item.protocol_dose_unit),
        frequency: item.frequency ?? "",
        instruction: joinParts(item.administration_route, item.remarks),
        duration: item.duration ?? "",
      }));
    }
    const fromOrder = (selectedOrder?.chemotherapy_plan_items ?? []).filter((item) => roleOf(item.drug_role) === "DISCHARGE");
    if (fromOrder.length > 0) {
      return fromOrder.map((item: any) => ({
        id: item.chemotherapy_plan_item_id,
        name: chemoPlanItemName(item),
        dose: doseText(item.protocol_dose, item.protocol_dose_unit),
        frequency: item.frequency ?? "",
        instruction: joinParts(item.administration_detail, item.remarks),
        duration: item.duration ?? "",
      }));
    }
    return protocolDischarge.map((item: any, index: number) => ({
      id: item.discharge_instruction_id ?? `${item.protocol_id}-${item.drug_sequence ?? index}`,
      name: item.medicine_master?.medicine_name ?? "",
      dose:
        item.patient_dose != null && item.patient_dose !== ""
          ? `${item.patient_dose} ${item.patient_dose_unit ?? item.medicine_master?.unit ?? ""}`.trim()
          : "",
      frequency: item.frequency ?? "",
      instruction: item.administration_detail || item.comment || "",
      duration: item.duration ?? "",
    }));
  }, [detail.sheet, sheetDay, selectedOrder, protocolDischarge]);

  /* ---------------- appointments, encounter, patient ---------------- */

  const { activeAppointments, latestEncounter, bookedOn, book, reschedule } = useNextVisitBooking(
    resolvedPatientId,
    { planDoctorId: savedPlan?.employee_id, treatmentStartDate: savedPlan?.treatment_start_date }
  );

  /* Next visit: the first cycle day not given yet (from today). */
  const nextVisit = useMemo<DayRow | null>(() => {
    if (planClosed) return null;
    const pending = medicationRows.filter((row) => {
      const status = statusOf(row.cycle, row.day);
      return status !== "COMPLETED" && status !== "IN_ADMINISTRATION";
    });
    return pending.find((row) => row.date && row.date >= today) ?? pending[0] ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medicationRows, planClosed, today]);

  const bookedNext = bookedOn(nextVisit?.date);

  const followUpDate =
    latestEncounter?.follow_up_date && isoDay(latestEncounter.follow_up_date) >= today
      ? isoDay(latestEncounter.follow_up_date)
      : "";

  const relativeDay = (iso: string) => {
    if (!iso) return "";
    const diff = daysBetween(today, iso);
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    if (diff > 0) return `In ${diff} days`;
    return `Overdue by ${-diff} day${diff === -1 ? "" : "s"}`;
  };

  const bookNextVisit = () => {
    if (nextVisit) book(nextVisit.date);
  };

  const rescheduleNextVisit = () => {
    if (bookedNext) reschedule(bookedNext);
  };

  /* ---------------- progress + schedule ---------------- */

  const plannedCycles = savedPlan?.planned_cycles || timelineCycles.length;
  const completedCycles = Math.min(
    Math.max(timelineCycles.filter((cycle) => cycle.done).length, savedPlan?.completed_cycles ?? 0),
    plannedCycles || Infinity
  );
  const progressPercent = plannedCycles > 0 ? Math.min(Math.round((completedCycles / plannedCycles) * 100), 100) : null;
  const completedDays = (savedPlan?.plan_orders ?? []).filter((order) => order.order_status === "COMPLETED").length;
  const remainingCycles = plannedCycles > 0 ? Math.max(plannedCycles - completedCycles, 0) : null;

  const firstDate = scheduleRows[0]?.date || isoDay(savedPlan?.treatment_start_date);
  const lastDate = scheduleRows[scheduleRows.length - 1]?.date || isoDay(savedPlan?.expected_end_date);
  const totalDays =
    firstDate && lastDate
      ? daysBetween(firstDate, lastDate) + 1
      : savedPlan?.planned_cycles && savedPlan?.cycle_interval_days
        ? savedPlan.planned_cycles * savedPlan.cycle_interval_days
        : null;
  const daysInCycle = (cycle: number) => medicationRows.filter((row) => row.cycle === cycle).length;
  const currentCycleStatus = current ? cycleRecordOf(current.cycle)?.cycle_status ?? null : null;
  const nextCycleDate = current
    ? scheduleRows.find((row) => row.cycle === current.cycle + 1)?.date ||
      isoDay(detail.sheet?.current_cycle?.next_cycle_date) ||
      ""
    : "";

  /* ---------------- clinical info ---------------- */

  const osd = savedPlan?.oncology_staging_detail ?? null;
  const cancerType = [osd?.cancer_types?.cancer_type ?? savedPlan?.cancer_type, osd?.histopathology || osd?.cancer_subtypes?.subtype_name || savedPlan?.cancer_subtype]
    .filter(Boolean)
    .join(" — ");
  const tnm = [osd?.t_stage, osd?.n_stage, osd?.m_stage].filter(Boolean).join(" ");
  const oncologist =
    osd?.consulting_oncologist ||
    [savedPlan?.employees?.first_name, savedPlan?.employees?.last_name].filter(Boolean).join(" ");
  const performance = joinParts(
    savedPlan?.ecog_status != null && savedPlan.ecog_status !== "" ? `ECOG ${savedPlan.ecog_status}` : "",
    savedPlan?.karnofsky_score != null && savedPlan.karnofsky_score !== "" ? `KPS ${savedPlan.karnofsky_score}` : ""
  );

  /* ---------------- lab validation ---------------- */

  const [labItems, setLabItems] = useState<LabOrderItemRecord[]>([]);
  const [labRows, setLabRows] = useState<LabRow[]>([]);
  const [labLoading, setLabLoading] = useState(false);
  const [labError, setLabError] = useState("");

  useEffect(() => {
    const pid = resolvedPatientId;
    if (!pid) return;
    let cancelled = false;
    setLabLoading(true);
    setLabError("");

    const loadItems = async (): Promise<LabOrderItemRecord[]> => {
      let storedIds: string[] = [];
      try {
        storedIds = JSON.parse(localStorage.getItem(`hms_lab_item_ids_${pid}`) || "[]");
      } catch {
        storedIds = [];
      }
      if (storedIds.length > 0) {
        const results = await Promise.all(
          storedIds.map((id) => labOrderItemApi.getById(id).then((r) => r.data.data).catch(() => null))
        );
        const items = results.filter(Boolean) as LabOrderItemRecord[];
        if (items.length > 0) return items;
      }
      const response = await labOrderItemApi.getAll({ patientId: pid });
      return (response.data.data ?? []).filter((item) => item.lab_order?.patient_history?.patient_id === pid);
    };

    (async () => {
      try {
        const items = await loadItems();
        if (cancelled) return;
        setLabItems(items);
        /* Results live on each order's lab report. */
        const orderIds = [...new Set(items.map((item) => item.lab_order_id).filter(Boolean))];
        const reports = await Promise.all(
          orderIds.map((orderId) =>
            labReportApi
              .getByOrderId(orderId)
              .then((r) => r.data?.data ?? null)
              .catch(() => null)
          )
        );
        if (cancelled) return;
        const rows: LabRow[] = [];
        const reported = new Set<string>();
        reports.forEach((report) => {
          if (!report) return;
          const parameters = parseReportComment(report.report_comment).meta?.parameters ?? [];
          if (parameters.length === 0) return;
          reported.add(report.lab_order_id);
          const date = isoDay(report.approved_datetime || report.generated_datetime || report.created_at);
          parameters.forEach((parameter: any, index: number) =>
            rows.push({
              key: `${report.lab_report_id}-${parameter.id ?? index}`,
              name: parameter.parameter ?? "—",
              result: parameter.result != null ? String(parameter.result) : "",
              unit: parameter.unit ?? "",
              range: parameter.referenceRange ?? "",
              status: parameter.status ?? "",
              date,
            })
          );
        });
        items
          .filter((item) => !reported.has(item.lab_order_id))
          .forEach((item) =>
            rows.push({
              key: item.lab_order_item_id,
              name: item.lab_test_master?.test_name ?? "—",
              result: "",
              unit: item.lab_test_master?.unit ?? "",
              range: item.lab_test_master?.reference_range ?? "",
              status: item.item_status ?? "Ordered",
              date: isoDay(item.updated_at || item.created_at),
            })
          );
        rows.sort((a, b) => b.date.localeCompare(a.date));
        setLabRows(rows);
      } catch (error: any) {
        if (!cancelled) {
          setLabError(error?.response?.data?.message || error?.message || "Failed to load lab investigations.");
        }
      } finally {
        if (!cancelled) setLabLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resolvedPatientId]);

  /* Chemo clearance: the selected (else current) day's appointment chemo
     fitness; without one, the lab results decide. */
  const clearanceDate = selectedRow?.date || (current ? rowOf(current.cycle, current.day)?.date : "") || today;
  const fitnessAppointment = activeAppointments.find(
    (appointment) => isoDay(appointment.appointment_date) === clearanceDate && appointment.chemo_fitness
  );
  const resultRows = labRows.filter((row) => row.result);
  const clearance = (() => {
    const fitness = String(fitnessAppointment?.chemo_fitness ?? "").toUpperCase();
    if (fitness === "FIT") return { label: "Cleared", cls: "text-emerald-600", note: "Chemo fitness" };
    if (fitness === "UNFIT")
      return { label: "Not cleared", cls: "text-red-600", note: fitnessAppointment?.chemo_unfit_reason || "Chemo fitness" };
    if (resultRows.some((row) => row.status === "Critical" || row.status === "Abnormal"))
      return { label: "Review required", cls: "text-amber-600", note: "Abnormal lab results" };
    if (resultRows.length > 0) return { label: "Cleared", cls: "text-emerald-600", note: "Lab results normal" };
    return { label: "Pending", cls: "text-slate-500", note: fitness === "PENDING" ? "Chemo fitness pending" : "No results yet" };
  })();

  /* ---------------- instructions ---------------- */

  const [storedInstructions, setStoredInstructions] = useState<
    { medicineName: string; route: string; infusion: string; dose: string; frequency: string; timing: string; remarks: string; administrationDetail: string }[]
  >([]);

  useEffect(() => {
    if (!resolvedPatientId) {
      setStoredInstructions([]);
      return;
    }
    try {
      const stored = localStorage.getItem(`hms_admin_instructions_${resolvedPatientId}`);
      const parsed = stored ? JSON.parse(stored) : [];
      setStoredInstructions(Array.isArray(parsed) ? parsed : []);
    } catch {
      setStoredInstructions([]);
    }
  }, [resolvedPatientId]);

  const chemoInstructions = sheetDay?.chemo_instructions ?? selectedOrder?.chemo_instructions ?? "";
  const additionalNotes = sheetDay?.additional_notes ?? selectedOrder?.additional_notes ?? "";
  const medicineInstructions = medicineRows.filter((row) => row.detail || row.infusion || row.timing);
  const hydration = selectedOrder?.chemotherapy_plan_hydration ?? [];

  /* ---------------- render ---------------- */

  const dayState = DAY_STATE[selectedStatus] ?? DAY_STATE.PLANNED;
  const summary = sheetDay?.summary;

  return (
<>
{planNotice && (
<div className="mb-6 flex items-center rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-3 text-[10px] text-amber-700">
<i className="fa-solid fa-triangle-exclamation mr-2"></i> {planNotice}
</div>
)}
{/* Left Side (Timeline & Day Selector) */}
<div className="min-w-0 flex-1 space-y-6">
{/* BEGIN: Treatment Timeline */}
<div className="rounded-[16px] border border-[#e2e8f0] bg-white p-6 shadow-sm">
<div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1">
<h3 className="text-lg font-bold text-slate-800">Cycle {selected?.cycle ?? "—"}{plannedCycles ? <span className="text-[10px] font-medium text-slate-500"> / {plannedCycles}</span> : null}</h3>
<span className="text-[10px] text-slate-500">{savedPlan?.treatment_intent || savedPlan?.treatment_status || "—"}</span>
{initialLoading && <span className="text-[10px] text-slate-500"><i className="fa-solid fa-circle-notch fa-spin mr-1" />Loading…</span>}
</div>
{timelineCycles.length > 0 ? (
<div className="hide-scrollbar relative overflow-x-auto">
<div className="relative min-w-max px-4">
<div className="absolute left-[36px] right-[36px] top-[18px] h-[2px] bg-slate-200"></div>
<div className="relative z-10 flex min-w-max justify-between gap-x-10">
{timelineCycles.map((cycle) => {
  const isSelected = selected?.cycle === cycle.cycle;
  const isCurrent = current?.cycle === cycle.cycle;
  return (
<button
  key={cycle.cycle}
  type="button"
  onClick={() => {
    const days = medicationRows.filter((row) => row.cycle === cycle.cycle);
    const preferred =
      (current && current.cycle === cycle.cycle ? days.find((row) => row.day === current.day) : undefined) ??
      days.find((row) => statusOf(row.cycle, row.day) === "IN_ADMINISTRATION") ??
      days.find((row) => statusOf(row.cycle, row.day) !== "COMPLETED") ??
      days[days.length - 1];
    if (preferred) setPicked({ cycle: preferred.cycle, day: preferred.day });
  }}
  className="flex flex-col items-center ou<line-none"
  title={`Cycle ${cycle.cycle} · starts ${fmtDate(cycle.date)}${cycle.done ? " · completed" : cycle.inProgress ? " · in progress" : ""}`}
>
<div className={`flex h-10 w-10 items-center justify-center rounded-full font-bold ring-[6px] ${isSelected ? "ring-[#1d4ed8]/25" : "ring-white"} ${cycle.done ? "bg-emerald-500 text-white" : cycle.inProgress || isCurrent ? "bg-[#1d4ed8] text-white" : "bg-slate-100 text-slate-400"}`}>
{cycle.done ? <i className="fa-solid fa-check text-[10px]" /> : cycle.cycle}
</div>
<div className="mt-3 text-center">
<div className={`text-[10px] ${isSelected ? "font-bold text-[#1d4ed8]" : cycle.inProgress || isCurrent ? "font-bold text-slate-800" : "font-medium text-slate-600"}`}>Cycle {cycle.cycle}</div>
<div className="mt-1 text-[10px] text-slate-400">{fmtDate(cycle.date)}</div>
</div>
</button>
  );
})}
<div className="flex flex-col items-center">
<div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 font-bold text-slate-400 ring-[6px] ring-white"><i className="fa-regular fa-map"></i></div>
<div className="mt-3 text-center">
<div className="text-[10px] font-medium text-slate-600">Follow-up</div>
<div className="mt-1 text-[10px] text-slate-400">{fmtDate(savedPlan?.expected_end_date || lastDate)}</div>
</div>
</div>
</div>
</div>
</div>
) : (
<p className="py-6 text-center text-[10px] text-slate-400">No cycle schedule available for this patient yet.</p>
)}
</div>
{/* END: Treatment Timeline */}
{/* BEGIN: Day Selector */}
{selected && (
<div className="flex items-center">
<span className="mr-4 shrink-0 text-[10px] font-bold text-slate-800">Select Day</span>
<div className="hide-scrollbar flex max-w-full overflow-x-auto rounded-[12px] border border-[#e2e8f0] bg-white p-1 shadow-sm">
{medicationRows.filter((row) => row.cycle === selected.cycle).map((row) => {
  const status = statusOf(row.cycle, row.day);
  const active = selected.day === row.day;
  const isCurrentDay = current?.cycle === row.cycle && current?.day === row.day;
  return (
<button key={row.day} type="button" onClick={() => setPicked({ cycle: row.cycle, day: row.day })} className={`min-w-[96px] rounded-[8px] px-4 py-1.5 text-center transition-colors ${active ? "bg-[#1d4ed8] text-white shadow-sm" : "text-slate-800 hover:bg-slate-50"}`}>
<div className="flex items-center justify-center gap-1.5 whitespace-nowrap text-[10px] font-bold">
{status === "COMPLETED" ? <i className={`fa-solid fa-circle-check text-[10px] ${active ? "text-white" : "text-emerald-500"}`} /> : status === "IN_ADMINISTRATION" ? <i className={`fa-solid fa-circle text-[8px] ${active ? "text-amber-200" : "text-amber-500"}`} /> : status === "ORDERED" ? <i className={`fa-regular fa-circle text-[9px] ${active ? "text-white" : "text-blue-500"}`} /> : null}
Day {row.day}
</div>
<div className={`text-[10px] ${active ? "text-blue-100" : "text-slate-500"}`}>{fmtDate(row.date)}{isCurrentDay ? " · Current" : ""}</div>
</button>
  );
})}
</div>
</div>
)}
{/* END: Day Selector */}
</div>
{/* Sub-cards: Cycle & Schedule · Next Appointment · Treatment Progress · Clinical Info · Lab Validation */}
<div className="grid grid-cols-1 gap-6 mt-2 md:grid-cols-2 xl:grid-cols-6">
{/* BEGIN: Cycle & Schedule */}
<div className="flex h-full min-h-[200px] flex-col rounded-[16px] border border-[#e2e8f0] bg-white p-5 shadow-sm xl:col-span-2">
<h4 className="mb-4 text-[10px] font-bold text-slate-800">Cycle &amp; Schedule</h4>
<div className="grid grid-cols-2 gap-4">
<InfoTile label="Cycle" value={current ? `${current.cycle}${plannedCycles ? ` / ${plannedCycles}` : ""}` : ""} />
<InfoTile label="Day" value={current ? `${current.day}${daysInCycle(current.cycle) ? ` / ${daysInCycle(current.cycle)}` : ""}` : ""} />
<InfoTile label="Start Date" value={fmtDate(firstDate)} />
<InfoTile label="End Date" value={fmtDate(lastDate)} />
<InfoTile label="Interval" value={savedPlan?.cycle_interval_days ? `${savedPlan.cycle_interval_days} days` : ""} />
<InfoTile label="Total Days" value={totalDays ?? ""} />
<InfoTile label="Cycle Status" value={currentCycleStatus ? String(currentCycleStatus).replace(/_/g, " ") : ""} />
<InfoTile label="Next Cycle" value={nextCycleDate ? fmtDate(nextCycleDate) : ""} />
</div>
</div>
{/* END: Cycle & Schedule */}
{/* BEGIN: Next Appointment */}
<div className="flex h-full min-h-[200px] flex-col justify-between rounded-[16px] border border-[#e2e8f0] bg-white p-5 shadow-sm xl:col-span-2">
<div>
<h4 className="mb-4 text-[10px] font-bold text-slate-800">Next Appointment</h4>
{planClosed ? (
<div className="flex items-start">
<div className="mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-emerald-50 text-emerald-600"><i className="fa-solid fa-flag-checkered text-lg"></i></div>
<div>
<div className="text-[10px] font-bold text-slate-800">Treatment completed</div>
{followUpDate && <div className="mt-1 text-[10px] text-slate-500">Follow-up {fmtDate(followUpDate)}</div>}
</div>
</div>
) : (
<div className="flex items-start">
<div className="mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-blue-50 text-[#1d4ed8]"><i className="fa-regular fa-calendar text-lg"></i></div>
<div className="min-w-0">
<div className="text-[10px] font-bold text-slate-800">{nextVisit ? fmtDate(nextVisit.date) : "—"}</div>
{!nextVisit && <div className="mt-1 text-[10px] text-slate-500">{timelineCycles.length > 0 ? "No further cycle day to book" : "No schedule yet"}</div>}
<div className="mt-1 text-[10px] text-slate-500">{nextVisit ? `Cycle ${nextVisit.cycle} / Day ${nextVisit.day}` : "—"}{nextVisit?.date ? ` · ${relativeDay(nextVisit.date)}` : ""}</div>
{!nextVisit ? null : bookedNext ? (
<div className="mt-1 text-[10px] font-bold text-emerald-600">Booked{bookedNext.appointment_time ? ` · ${String(bookedNext.appointment_time).slice(0, 5)}` : ""}{bookedNext.doctor_name ? ` · ${bookedNext.doctor_name}` : ""}</div>
) : (
<div className="mt-1 text-[10px] text-amber-600">Not booked yet</div>
)}
{followUpDate && <div className="mt-1 text-[10px] text-slate-500">Follow-up {fmtDate(followUpDate)}</div>}
</div>
</div>
)}
</div>
{!planClosed && nextVisit && (
bookedNext ? (
<button type="button" onClick={rescheduleNextVisit} className="mt-4 w-full rounded-[8px] border border-[#e2e8f0] py-2 text-[10px] font-bold text-slate-800 transition-colors hover:bg-slate-50">
<i className="fa-solid fa-calendar-days mr-1.5" />Reschedule
</button>
) : (
<button type="button" onClick={bookNextVisit} className="mt-4 w-full rounded-[8px] bg-[#1d4ed8] py-2 text-[10px] font-bold text-white transition-colors hover:bg-[#1e40af]">
<i className="fa-solid fa-calendar-plus mr-1.5" />Book Appointment
</button>
)
)}
</div>
{/* END: Next Appointment */}
{/* BEGIN: Treatment Progress */}
<div className="flex h-full min-h-[200px] flex-col justify-between rounded-[16px] border border-[#e2e8f0] bg-white p-5 shadow-sm xl:col-span-2">
<h4 className="mb-4 text-[10px] font-bold text-slate-800">Treatment Progress</h4>
<div className="flex items-center justify-between gap-3">
<div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[conic-gradient(#e2e8f0_0%_100%)]" style={progressPercent != null ? { backgroundImage: `conic-gradient(#10b981 ${progressPercent}%, #e2e8f0 ${progressPercent}% 100%)` } : undefined}>
<div className="absolute inset-[6px] rounded-full bg-white"></div>
<span className="relative z-10 text-[10px] font-bold text-slate-800">{progressPercent != null ? `${progressPercent}%` : "—"}</span>
</div>
<div className="text-right">
<div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-800">Completed</div>
<div className="mb-2 text-[10px] font-bold text-slate-800">{plannedCycles ? `${completedCycles} / ${plannedCycles}` : "—"} <span className="text-[10px] font-medium text-slate-500">cycles</span></div>
<div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-800">Remaining</div>
<div className="text-[10px] font-bold text-slate-800">{remainingCycles ?? "—"} <span className="text-[10px] font-medium text-slate-500">cycles</span></div>
</div>
</div>
<div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-[10px]">
<div className="flex items-center justify-between"><span className="font-medium text-slate-500">Days given</span><span className="font-bold text-slate-800">{completedDays}</span></div>
<div className="flex items-center justify-between"><span className="font-medium text-slate-500">Current</span><span className="font-bold text-slate-800">{current && !planClosed ? `Cycle ${current.cycle} / Day ${current.day}` : planClosed ? "Completed" : "—"}</span></div>
<div className="flex items-center justify-between"><span className="font-medium text-slate-500">Next Visit</span><span className="font-bold text-slate-800">{nextVisit ? fmtDate(nextVisit.date) : "—"}</span></div>
</div>
</div>
{/* END: Treatment Progress */}
{/* BEGIN: Clinical Info */}
<div className="flex h-full flex-col rounded-[16px] border border-[#e2e8f0] bg-white p-5 shadow-sm xl:col-span-2">
<h4 className="mb-4 text-[10px] font-bold text-slate-800">Clinical Info</h4>
<div className="grid grid-cols-2 gap-4">
<div className="col-span-2"><InfoTile label="Type" value={cancerType} /></div>
<InfoTile label="Stage" value={osd?.clinical_stage || savedPlan?.cancer_stage || ""} />
<InfoTile label="TNM" value={tnm} />
<InfoTile label="Grade" value={joinParts(osd?.grade, osd?.grade_system)} />
<InfoTile label="Site / Laterality" value={joinParts(osd?.site, osd?.laterality)} />
<InfoTile label="Intent" value={savedPlan?.treatment_intent || ""} />
<InfoTile label="Performance" value={performance} />
<div className="col-span-2"><InfoTile label="Consulting Oncologist" value={oncologist} /></div>
</div>
</div>
{/* BEGIN: Lab Validation */}
<div className="flex h-full flex-col rounded-[16px] border border-[#e2e8f0] bg-white p-5 shadow-sm md:col-span-2 xl:col-span-4">
<div className="mb-4 flex items-center">
<h4 className="mr-3 text-[10px] font-bold text-slate-800">Lab Validation</h4>
<span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500">{labLoading ? "Loading…" : `${labItems.length} Test(s)`}</span>
</div>
{labError && (
  <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-[10px] text-red-700">{labError}</div>
)}
{labLoading ? (
  <div className="py-6 text-center text-[10px] text-slate-400"><i className="fa-solid fa-circle-notch fa-spin mr-1" />Loading lab investigations…</div>
) : (
  <div className="max-h-[260px] overflow-auto">
  <table className="mb-4 w-full text-left text-[10px]">
    <thead className="sticky top-0 bg-white">
      <tr className="border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-400">
        <th className="pb-2 font-bold">PARAMETER</th>
        <th className="pb-2 font-bold">RESULT</th>
        <th className="pb-2 font-bold">RANGE</th>
        <th className="pb-2 font-bold">DATE</th>
        <th className="pb-2 font-bold">STATUS</th>
      </tr>
    </thead>
    <tbody>
      {labRows.length === 0 ? (
        <tr><td colSpan={5} className="py-6 text-center text-[10px] text-slate-400">No lab validation records found.</td></tr>
      ) : (
        labRows.map((row) => (
          <tr key={row.key} className="border-b border-slate-50">
            <td className="py-2 text-[10px] font-bold">{row.name}</td>
            <td className={`py-2 ${row.status === "Critical" ? "font-bold text-red-600" : row.status === "Abnormal" ? "font-bold text-amber-600" : ""}`}>{row.result ? `${row.result} ${row.unit}`.trim() : "—"}</td>
            <td className="py-2 text-[10px]">{row.range || "—"}</td>
            <td className="whitespace-nowrap py-2 text-[10px]">{fmtDate(row.date)}</td>
            <td className="py-2"><span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${LAB_STATUS_CLS(row.status)}`}>{row.status || "—"}</span></td>
          </tr>
        ))
      )}
    </tbody>
  </table>
  </div>
)}
<div className="flex items-center justify-between border-t border-slate-100 pt-3 text-[10px]">
<span className="text-slate-500">Chemo Clearance <span className="text-[10px]">({fmtDate(clearanceDate)})</span> :</span>
<span className="text-right">
<span className={`font-bold uppercase ${clearance.cls}`}>{clearance.label}</span>
<span className="block text-[10px] text-slate-500">{clearance.note}</span>
</span>
</div>
</div>
</div>
{/* BEGIN: Selected day banner */}
{selected && (
<div className={`mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border px-5 py-3 ${dayState.cls}`}>
<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
<span className="font-bold">Cycle {selected.cycle} / Day {selected.day}</span>
<span>{fmtDate(sheetDay?.treatment_date || selectedRow?.date)}</span>
<span className="font-bold">{dayState.label}{selectedStatus === "COMPLETED" && (sheetDay?.completed_at || orderMap.get(selectedKey)?.completed_at) ? ` on ${fmtDate(sheetDay?.completed_at || orderMap.get(selectedKey)?.completed_at)}` : ""}</span>
{dayLoading && <span className="text-[10px]"><i className="fa-solid fa-circle-notch fa-spin mr-1" />Loading…</span>}
{detail.error && <span className="text-[10px] text-red-600">{detail.error}</span>}
</div>
{summary && summary.total > 0 && (
<div className="flex flex-wrap gap-3 text-[10px] font-bold">
<span className="text-emerald-700">{summary.given} given</span>
<span className="text-amber-700">{summary.pending} pending</span>
{summary.skipped > 0 && <span className="text-orange-700">{summary.skipped} skipped</span>}
{summary.cancelled > 0 && <span className="text-red-600">{summary.cancelled} cancelled</span>}
{sheetDay?.administered_by?.length ? <span className="text-slate-600">by {sheetDay.administered_by.join(", ")}</span> : null}
</div>
)}
</div>
)}
{/* END: Selected day banner */}
<div className="mt-6 overflow-hidden rounded-[16px] border border-[#e2e8f0] bg-white shadow-sm">
<div className="flex items-center border-b border-[#e2e8f0] px-5 py-4 text-[#1d4ed8]">
<i className="fa-solid fa-flask mr-2"></i>
<h4 className="text-[10px] font-bold">PROTOCOL: {savedPlan?.regimen_name || savedPlan?.protocol_name || "—"}</h4>
{savedPlan?.protocol_name && savedPlan?.regimen_name && savedPlan.protocol_name !== savedPlan.regimen_name && (
<span className="ml-2 text-[10px] text-slate-500">{savedPlan.protocol_name}</span>
)}
</div>
<div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3 lg:grid-cols-6">
<InfoTile label="Height" value={selectedOrder?.dosing_height_cm != null ? `${selectedOrder.dosing_height_cm} cm` : ""} />
<InfoTile label="Weight" value={selectedOrder?.dosing_weight_kg != null ? `${selectedOrder.dosing_weight_kg} kg` : ""} />
<InfoTile label="BSA" value={selectedOrder?.dosing_bsa != null ? `${selectedOrder.dosing_bsa} m²` : ""} />
<InfoTile label="Serum Creatinine" value={selectedOrder?.dosing_serum_creatinine != null ? `${selectedOrder.dosing_serum_creatinine} mg/dL` : ""} />
<InfoTile label="CrCl" value={selectedOrder?.dosing_crcl != null ? `${selectedOrder.dosing_crcl} mL/min` : ""} />
<InfoTile label="Chemo Drugs" value={chemoOrders.length ? String(chemoOrders.length) : ""} />
</div>
{hydration.length > 0 && (
<div className="border-t border-slate-100 px-5 py-4">
<div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-800">Hydration</div>
<ul className="space-y-1 text-[10px] text-slate-700">
{hydration.map((row, index) => (
<li key={row.plan_hydration_id ?? index}>
<span className="font-bold">{row.hydration_stage === "POST" ? "Post" : "Pre"}:</span>{" "}
{joinParts(row.agent_name, row.diluent, row.dilution_volume != null ? `${row.dilution_volume} ${row.dilution_volume_unit ?? ""}`.trim() : "", row.guidance) || "—"}
</li>
))}
</ul>
</div>
)}
</div>
{/* BEGIN: Medication Orders Row */}
<div className="mt-6 space-y-6">
<MedicineTable title="Premedications" icon="fa-solid fa-pills" tone="text-purple-600" rows={premedications} empty="No premedications for this day." />
<MedicineTable title="Chemo Orders" icon="fa-solid fa-prescription-bottle-medical" tone="text-[#1d4ed8]" rows={chemoOrders} empty="No chemo orders for this day." />
<MedicineTable title="Supportive Medicines" icon="fa-solid fa-heart-pulse" tone="text-emerald-600" rows={supportive} empty="No supportive medicines for this day." />
<div className="overflow-hidden rounded-[16px] border border-[#e2e8f0] bg-white shadow-sm">
<div className="flex items-center border-b border-[#e2e8f0] px-5 py-4 text-orange-500">
<i className="fa-solid fa-capsules mr-2"></i>
<h4 className="text-[10px] font-bold">Discharge Medication</h4>
</div>
<div className="overflow-x-auto p-5">
<table className="w-full text-left text-[10px]">
<thead>
<tr className="border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-400">
<th className="w-8 pb-2 font-bold">#</th>
<th className="pb-2 font-bold">DRUG</th>
<th className="pb-2 font-bold">DOSE</th>
<th className="pb-2 font-bold">FREQUENCY</th>
<th className="pb-2 font-bold">INSTRUCTION</th>
<th className="pb-2 text-right font-bold">DURATION</th>
</tr>
</thead>
<tbody>
{dischargeRows.length === 0 && protocolDischargeLoading ? (
<tr><td colSpan={6} className="py-6 text-center text-[10px] text-slate-400"><i className="fa-solid fa-circle-notch fa-spin mr-2"></i>Loading discharge medicines…</td></tr>
) : dischargeRows.length === 0 && protocolDischargeError ? (
<tr><td colSpan={6} className="py-6 text-center text-[10px] text-red-500"><i className="fa-solid fa-triangle-exclamation mr-2"></i>{protocolDischargeError}</td></tr>
) : dischargeRows.length === 0 ? (
<tr><td colSpan={6} className="py-6 text-center text-[10px] text-slate-400">No discharge medicines recorded.</td></tr>
) : (
dischargeRows.map((item, index) => (
<tr key={item.id} className="border-b border-slate-50 last:border-0">
<td className="py-2">{index + 1}</td>
<td className="whitespace-nowrap py-2 font-bold text-slate-800">{item.name || "—"}</td>
<td className="whitespace-nowrap py-2">{item.dose || "—"}</td>
<td className="whitespace-nowrap py-2">{item.frequency || "—"}</td>
<td className="py-2 text-[10px] text-slate-500">{item.instruction || "—"}</td>
<td className="whitespace-nowrap py-2 text-right">{item.duration || "—"}</td>
</tr>
))
)}
</tbody>
</table>
</div>
</div>
</div>
{/* END: Medication Orders Row */}
{/* END: Bottom Grid */}
{/* BEGIN: Instructions Card */}
<div className="mt-6 flex flex-col justify-between gap-6 rounded-[16px] border border-[#e2e8f0] bg-white p-6 shadow-sm md:flex-row md:items-start">
<div className="min-w-0 flex-1">
<div className="mb-4 flex items-center text-[#1d4ed8]">
<i className="fa-regular fa-file-lines mr-2"></i>
<h4 className="text-[10px] font-bold">Instructions</h4>
<span className="ml-2 text-[10px] text-slate-500">{selected ? `Cycle ${selected.cycle} / Day ${selected.day}` : ""}</span>
</div>
{chemoInstructions && (
<div className="mb-3">
<div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-800">Post Chemo Instructions</div>
<p className="whitespace-pre-line text-[10px] text-slate-700">{chemoInstructions}</p>
</div>
)}
{additionalNotes && (
<div className="mb-3">
<div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-800">Additional Notes</div>
<p className="whitespace-pre-line text-[10px] text-slate-700">{additionalNotes}</p>
</div>
)}
{medicineInstructions.length > 0 ? (
<ul className="space-y-3 text-[10px] text-slate-700">
{medicineInstructions.map((row) => (
<li key={row.id} className="rounded-[12px] border border-slate-100 p-3">
<div className="flex items-start justify-between gap-3">
<span className="font-bold text-slate-800">{row.name || "—"}</span>
{row.patientDose || row.dose ? <span className="whitespace-nowrap text-[10px] text-slate-500">{row.patientDose || row.dose}</span> : null}
</div>
<div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500">
{row.route ? <span>Route: {row.route}</span> : null}
{row.infusion ? <span>Infusion: {row.infusion}</span> : null}
{row.timing ? <span>Timing: {row.timing}</span> : null}
</div>
{row.detail ? <p className="mt-1.5 text-[10px] text-slate-600">{row.detail}</p> : null}
</li>
))}
</ul>
) : !chemoInstructions && !additionalNotes && storedInstructions.length > 0 ? (
<ul className="space-y-3 text-[10px] text-slate-700">
{storedInstructions.map((instruction, index) => (
<li key={index} className="rounded-[12px] border border-slate-100 p-3">
<div className="flex items-start justify-between gap-3">
<span className="font-bold text-slate-800">{instruction.medicineName || `Item ${index + 1}`}</span>
{instruction.dose ? <span className="whitespace-nowrap text-[10px] text-slate-500">{instruction.dose}</span> : null}
</div>
{instruction.administrationDetail ? <p className="mt-1.5 text-[10px] text-slate-600">{instruction.administrationDetail}</p> : null}
{instruction.remarks ? <p className="mt-1.5 text-[10px] italic text-slate-500">{instruction.remarks}</p> : null}
</li>
))}
</ul>
) : !chemoInstructions && !additionalNotes ? (
<p className="text-[10px] text-slate-400">No instructions recorded for this day.</p>
) : null}
</div>
<div className="flex w-full flex-col items-center justify-center rounded-[12px] border border-slate-200 bg-slate-50 p-5 md:w-[180px]">
<div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#1d4ed8]">NEXT CYCLE</div>
<div className="flex items-center text-[10px] font-bold text-[#1d4ed8]">
<i className="fa-regular fa-calendar mr-2"></i> {nextCycleDate ? fmtDate(nextCycleDate) : "—"}
</div>
{current && nextCycleDate && <div className="mt-1 text-[10px] text-slate-500">Cycle {current.cycle + 1} · {relativeDay(nextCycleDate)}</div>}
</div>
</div>
{/* END: Instructions Card */}
</>
  );
};

export default OrderSummaryTab;
