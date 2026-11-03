import React, { useEffect, useMemo, useState } from "react";
import {
  chemoPlanItemName,
  chemotherapyApi,
  isChemoPlanClosed,
  type ChemoPlanItem,
  type ChemoPlanOrderHeader,
  type ChemoPlanScheduleRow,
} from "../../../api/chemotherapy.api";
import type { SummaryPlan } from "./types";
import { useDischargeMedicines, useNextVisitBooking } from "./hooks";
import { doseText, fmtDate, fmtTime } from "./adminFormat";
import {
  buildPlanCycleDays,
  cycleDayLabel,
  CycleDayPicker,
  CycleDayStatusChip,
  MedicineStatusBadge,
  sheetMedicineRows,
  useCycleDaySheets,
  type DayMedicineRow,
  type PlanCycleDay,
} from "./cycleDays";

/* ============================================================
   MEDICATIONS TAB
   The medicines of one planned cycle day - by default the day in
   administration (it stays shown once completed) - grouped as
   premedications, chemotherapy drugs, supportive and discharge
   medicines with their real administration status; the next cycle
   day's appointment, the day's administration log and instructions.
   ============================================================ */

type MedicationsTabProps = {
  plan: SummaryPlan | null;
  /* Kept for the parent; the tab picks its cycle day itself. */
  selectedCycle?: number;
  cycleMedicationsMap?: Record<string, any[]>;
};

type DischargeSource = "day" | "plan" | "protocol";

const localTodayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const daysFromToday = (iso: string) => {
  const today = localTodayIso();
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
};

const relativeDay = (iso: string) => {
  if (!iso) return "";
  const diff = daysFromToday(iso);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff > 0) return `In ${diff} days`;
  return `Overdue by ${-diff} day${diff === -1 ? "" : "s"}`;
};

/* "2 given · 1 pending" for a group of medicines. */
const groupCounts = (rows: DayMedicineRow[]) => {
  const count = (status: string) => rows.filter((row) => row.status === status).length;
  return [
    count("GIVEN") ? `${count("GIVEN")} given` : "",
    count("PENDING") ? `${count("PENDING")} pending` : "",
    count("SKIPPED") ? `${count("SKIPPED")} skipped` : "",
    count("CANCELLED") ? `${count("CANCELLED")} cancelled` : "",
    count("NOT_RECORDED") ? `${count("NOT_RECORDED")} not recorded` : "",
  ]
    .filter(Boolean)
    .join(" · ");
};

function StatusCell({ row }: { row: DayMedicineRow }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <MedicineStatusBadge status={row.status} />
      {row.givenBy && <span className="text-center text-[10px] text-slate-500">{row.givenBy}</span>}
      {row.reason && <span className="text-center text-[10px] text-slate-500">{row.reason}</span>}
    </div>
  );
}

function SectionCard({
  title,
  icon,
  tone,
  count,
  subtitle,
  children,
}: {
  title: string;
  icon: string;
  tone: string;
  count: number;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-5 py-3.5">
        <div className="flex items-center gap-2">
          <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${tone}`}>
            <i className={`${icon} text-[11px]`} />
          </span>
          <h3 className="text-[11px] font-bold text-slate-800">{title}</h3>
          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200">{count}</span>
        </div>
        {subtitle && <span className="text-[10px] font-medium text-slate-500">{subtitle}</span>}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

const EmptyRow = ({ colSpan, text }: { colSpan: number; text: string }) => (
  <tr>
    <td colSpan={colSpan} className="px-6 py-6 text-center text-[10px] text-slate-400">
      {text}
    </td>
  </tr>
);

const TH = "px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-700";
const TD = "px-5 py-3 align-top text-[10px]";

const MedicationsTab: React.FC<MedicationsTabProps> = ({ plan }) => {
  const planId = plan?.chemotherapy_plan_id ?? "";
  const patientId = plan?.patient_id ?? "";
  const planClosed = isChemoPlanClosed(plan);

  /* The plan's cycle day orders + schedule (fetched once when the plan was
     loaded without them). */
  const [fetchedDays, setFetchedDays] = useState<{
    planId: string;
    orders: ChemoPlanOrderHeader[];
    schedule: ChemoPlanScheduleRow[];
  } | null>(null);
  useEffect(() => {
    if (!planId || plan?.plan_orders) return;
    let cancelled = false;
    chemotherapyApi
      .getPlan(planId)
      .then((response) => {
        if (cancelled) return;
        setFetchedDays({
          planId,
          orders: response.data?.data?.plan_orders ?? [],
          schedule: response.data?.data?.chemotherapy_plan_schedule ?? [],
        });
      })
      .catch((error) => console.error("Failed to load the plan's cycle days:", error));
    return () => {
      cancelled = true;
    };
  }, [planId, plan?.plan_orders]);
  const daysSource = fetchedDays?.planId === planId ? fetchedDays : null;
  const orders = plan?.plan_orders ?? daysSource?.orders ?? [];
  const schedule = plan?.chemotherapy_plan_schedule ?? daysSource?.schedule ?? [];

  const cycleDays = useMemo<PlanCycleDay[]>(
    () =>
      buildPlanCycleDays({
        orders,
        schedule,
        protocolItems: plan?.chemotherapy_plan_items,
        plannedCycles: plan?.planned_cycles,
        startDate: plan?.treatment_start_date,
        intervalDays: plan?.cycle_interval_days,
        planClosed,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orders, schedule, planClosed, plan?.chemotherapy_plan_items, plan?.planned_cycles, plan?.treatment_start_date, plan?.cycle_interval_days]
  );

  const days = useCycleDaySheets(planId, cycleDays);
  const { slot, sheetDay } = days;
  const rows = sheetMedicineRows(days.sheet, sheetDay);

  const premedications = rows.filter((row) => row.role === "PREMEDICATION");
  const chemoDrugs = rows.filter((row) => row.role === "PRIMARY");
  const supportive = rows.filter((row) => row.role === "SUPPORTIVE" || row.role === "POSTMEDICATION");
  const dayDischarge = rows.filter((row) => row.role === "DISCHARGE");

  /* Discharge: the day's take-home medicines, else the patient's own list
     on the plan, else the regimen protocol's. */
  const [planDischarge, setPlanDischarge] = useState<ChemoPlanItem[] | null>(null);
  useEffect(() => {
    setPlanDischarge(null);
    if (!planId) return;
    let cancelled = false;
    chemotherapyApi
      .listPlanDischargeMedicines(planId)
      .then((response) => {
        if (!cancelled) setPlanDischarge(response.data?.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setPlanDischarge([]);
      });
    return () => {
      cancelled = true;
    };
  }, [planId]);
  const {
    rows: protocolDischarge,
    loading: protocolDischargeLoading,
    error: protocolDischargeError,
  } = useDischargeMedicines(plan?.source_protocol_id || "");

  const discharge = useMemo(() => {
    if (dayDischarge.length > 0) {
      return {
        source: "day" as DischargeSource,
        rows: dayDischarge.map((row) => ({
          id: row.id,
          name: row.name,
          dose: row.dose,
          frequency: row.frequency,
          instruction: [row.route, row.detail].filter(Boolean).join(" · "),
          duration: row.timing,
        })),
      };
    }
    if (planDischarge && planDischarge.length > 0) {
      return {
        source: "plan" as DischargeSource,
        rows: planDischarge.map((item, index) => ({
          id: item.chemotherapy_plan_item_id ?? `plan-discharge-${index}`,
          name: chemoPlanItemName(item) || "—",
          dose: doseText(item.protocol_dose, item.protocol_dose_unit),
          frequency: item.frequency ?? "",
          instruction: [item.administration_route, item.administration_detail || item.remarks].filter(Boolean).join(" · "),
          duration: item.duration ?? "",
        })),
      };
    }
    return {
      source: "protocol" as DischargeSource,
      rows: protocolDischarge.map((item: any, index: number) => ({
        id: item.discharge_instruction_id ?? `${item.protocol_id}-${item.drug_sequence ?? index}`,
        name: item.medicine_master?.medicine_name ?? "—",
        dose:
          item.patient_dose != null && item.patient_dose !== ""
            ? `${item.patient_dose} ${item.patient_dose_unit ?? item.medicine_master?.unit ?? ""}`.trim()
            : "",
        frequency: item.frequency ?? "",
        instruction: item.administration_detail || item.comment || "",
        duration: item.duration ?? "",
      })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days.sheet, sheetDay, planDischarge, protocolDischarge]);
  const dischargeSourceLabel =
    discharge.source === "day" ? "This cycle day" : discharge.source === "plan" ? "Patient's discharge list" : "Regimen protocol";

  /* Next appointment: the next cycle day still to come after the selected one. */
  const booking = useNextVisitBooking(patientId, {
    planDoctorId: plan?.employee_id,
    treatmentStartDate: plan?.treatment_start_date,
  });
  const nextDay = useMemo<PlanCycleDay | null>(() => {
    if (planClosed) return null;
    if (slot?.kind === "unplanned") return slot.row;
    const selectedIndex = slot?.kind === "planned" ? cycleDays.findIndex((row) => row.key === slot.row.key) : -1;
    return (
      cycleDays.find(
        (row, index) =>
          index > selectedIndex && (row.status === "UPCOMING" || row.status === "CURRENT")
      ) ?? null
    );
  }, [cycleDays, slot, planClosed]);
  const bookedNext = booking.bookedOn(nextDay?.date);

  /* The day's administration log: given (in time order), then skipped /
     cancelled, then still pending. */
  const administered = rows.filter((row) => row.role !== "DISCHARGE");
  const givenLog = administered
    .filter((row) => row.status === "GIVEN")
    .sort((a, b) => String(a.givenAt ?? "").localeCompare(String(b.givenAt ?? "")));
  const notGivenLog = administered.filter((row) => row.status === "SKIPPED" || row.status === "CANCELLED");
  const pendingLog = administered.filter((row) => row.status === "PENDING");

  const summaryCards: [string, DayMedicineRow[], string, string][] = [
    ["Total Meds", administered, "fa-solid fa-pills", "bg-blue-50 text-[#0052cc]"],
    ["Premeds", premedications, "fa-solid fa-syringe", "bg-purple-50 text-purple-600"],
    ["Chemo", chemoDrugs, "fa-solid fa-hourglass-half", "bg-red-50 text-red-500"],
    ["Supportive", supportive, "fa-solid fa-heart-pulse", "bg-emerald-50 text-emerald-500"],
  ];

  const tableBodyState = (colSpan: number, groupRows: DayMedicineRow[], emptyText: string) => {
    if (!planId) return <EmptyRow colSpan={colSpan} text="No chemotherapy plan for this patient yet." />;
    if (slot?.kind === "unplanned") return <EmptyRow colSpan={colSpan} text={`${cycleDayLabel(slot.row.cycle, slot.row.day)} is not planned yet.`} />;
    if (slot?.kind === "end") return <EmptyRow colSpan={colSpan} text="No further cycle day is planned." />;
    if (!slot) return <EmptyRow colSpan={colSpan} text="No cycle day has been ordered yet." />;
    if (days.loading) {
      return (
        <tr>
          <td colSpan={colSpan} className="px-6 py-6 text-center text-[10px] text-slate-500">
            <i className="fa-solid fa-circle-notch fa-spin mr-2" />
            Loading the cycle day's medicines...
          </td>
        </tr>
      );
    }
    if (days.error) return <EmptyRow colSpan={colSpan} text={days.error} />;
    if (groupRows.length === 0) return <EmptyRow colSpan={colSpan} text={emptyText} />;
    return null;
  };

  const renderSimpleRows = (groupRows: DayMedicineRow[]) =>
    groupRows.map((row, index) => (
      <tr key={row.id} className="transition-colors hover:bg-slate-50">
        <td className={`${TD} w-10 text-center text-slate-400`}>{index + 1}</td>
        <td className={TD}>
          <p className="font-bold text-slate-800">{row.name}</p>
          {row.generic && <p className="text-[10px] text-slate-500">{row.generic}</p>}
          {row.detail && <p className="mt-0.5 text-[10px] text-slate-500">{row.detail}</p>}
        </td>
        <td className={`${TD} whitespace-nowrap text-slate-700`}>{row.patientDose || row.dose || "—"}</td>
        <td className={`${TD} whitespace-nowrap text-slate-700`}>{row.route || "—"}</td>
        <td className={`${TD} text-slate-700`}>{[row.frequency, row.timing].filter(Boolean).join(" · ") || "—"}</td>
        <td className={TD}><StatusCell row={row} /></td>
      </tr>
    ));

  return (
    <>
      {/* Cycle day context */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-[10px]">
          {slot?.kind === "planned" ? (
            <>
              <span className="text-[11px] font-bold text-slate-900">{cycleDayLabel(slot.row.cycle, slot.row.day)}</span>
              <CycleDayStatusChip status={slot.row.status} />
              <span className="text-slate-500">{fmtDate(sheetDay?.treatment_date || slot.row.date)}</span>
              {slot.row.status === "COMPLETED" && slot.row.order?.completed_at && (
                <span className="text-slate-500">Completed on {fmtDate(slot.row.order.completed_at)}</span>
              )}
              {sheetDay?.administered_by?.length ? (
                <span className="text-slate-500">By {sheetDay.administered_by.join(", ")}</span>
              ) : null}
            </>
          ) : slot?.kind === "unplanned" ? (
            <span className="text-slate-600">
              <span className="font-bold text-slate-800">{cycleDayLabel(slot.row.cycle, slot.row.day)}</span> is not planned
              yet - its medicines appear here once the doctor orders it in the Chemotherapy Order
              {slot.row.date ? ` (scheduled for ${fmtDate(slot.row.date)})` : ""}.
            </span>
          ) : slot?.kind === "end" ? (
            <span className="text-slate-600">
              No further cycle day is planned
              {slot.last ? ` - the treatment course ends with ${cycleDayLabel(slot.last.cycle, slot.last.day)}.` : "."}
            </span>
          ) : (
            <span className="text-slate-500">
              {planId ? "No cycle day has been ordered for this patient yet." : "No chemotherapy plan for this patient yet."}
            </span>
          )}
        </div>
        <CycleDayPicker slots={days.slots} slotIndex={days.slotIndex} slot={slot} onSelect={days.select} />
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 pt-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map(([label, groupRows, icon, cls]) => (
          <div key={label} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="min-w-0">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
              <p className="text-lg font-bold leading-6 text-slate-800">{sheetDay ? groupRows.length : "—"}</p>
              <p className="mt-0.5 truncate text-[10px] text-slate-500">{sheetDay ? groupCounts(groupRows) || "None ordered" : " "}</p>
            </div>
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${cls}`}>
              <i className={icon} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-6 lg:flex-row">
        <div className="min-w-0 flex-1 space-y-6">
          {/* Premedications */}
          <SectionCard title="Premedications" icon="fa-solid fa-syringe" tone="bg-purple-50 text-purple-600" count={premedications.length} subtitle={groupCounts(premedications)}>
            <table className="w-full min-w-[720px] text-left">
              <thead className="border-b border-slate-100">
                <tr>
                  <th className={`${TH} w-10 text-center`}>#</th>
                  <th className={TH}>Medication</th>
                  <th className={TH}>Dose</th>
                  <th className={TH}>Route</th>
                  <th className={TH}>Timing</th>
                  <th className={`${TH} text-center`}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {tableBodyState(6, premedications, "No premedications were ordered for this cycle day.") ?? renderSimpleRows(premedications)}
              </tbody>
            </table>
          </SectionCard>

          {/* Chemotherapy drugs */}
          <SectionCard title="Chemotherapy Drugs" icon="fa-solid fa-hourglass-half" tone="bg-red-50 text-red-500" count={chemoDrugs.length} subtitle={groupCounts(chemoDrugs)}>
            <table className="w-full min-w-[900px] text-left">
              <thead className="border-b border-slate-100">
                <tr>
                  <th className={`${TH} w-10 text-center`}>#</th>
                  <th className={TH}>Drug Name</th>
                  <th className={TH}>Protocol Dose</th>
                  <th className={TH}>Patient Dose</th>
                  <th className={TH}>Route</th>
                  <th className={TH}>Diluent</th>
                  <th className={TH}>Infusion</th>
                  <th className={`${TH} text-center`}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {tableBodyState(8, chemoDrugs, "No chemotherapy drugs were ordered for this cycle day.") ??
                  chemoDrugs.map((row, index) => (
                    <tr key={row.id} className="transition-colors hover:bg-slate-50">
                      <td className={`${TD} w-10 text-center text-slate-400`}>{index + 1}</td>
                      <td className={TD}>
                        <p className="font-bold text-[#0052cc]">{row.name}</p>
                        {row.generic && <p className="text-[10px] text-slate-500">{row.generic}</p>}
                        {row.detail && <p className="mt-0.5 text-[10px] text-slate-500">{row.detail}</p>}
                      </td>
                      <td className={`${TD} whitespace-nowrap text-slate-500`}>{row.dose || "—"}</td>
                      <td className={`${TD} whitespace-nowrap font-bold text-slate-800`}>{row.patientDose || row.dose || "—"}</td>
                      <td className={`${TD} whitespace-nowrap text-slate-700`}>{row.route || "—"}</td>
                      <td className={`${TD} text-slate-500`}>{row.diluent || "—"}</td>
                      <td className={`${TD} text-slate-700`}>{[row.infusion, row.timing].filter(Boolean).join(" · ") || "—"}</td>
                      <td className={TD}><StatusCell row={row} /></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </SectionCard>

          {/* Supportive */}
          <SectionCard title="Supportive Medications" icon="fa-solid fa-heart-pulse" tone="bg-emerald-50 text-emerald-600" count={supportive.length} subtitle={groupCounts(supportive)}>
            <table className="w-full min-w-[720px] text-left">
              <thead className="border-b border-slate-100">
                <tr>
                  <th className={`${TH} w-10 text-center`}>#</th>
                  <th className={TH}>Medication</th>
                  <th className={TH}>Dose</th>
                  <th className={TH}>Route</th>
                  <th className={TH}>Timing</th>
                  <th className={`${TH} text-center`}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {tableBodyState(6, supportive, "No supportive medicines were ordered for this cycle day.") ?? renderSimpleRows(supportive)}
              </tbody>
            </table>
          </SectionCard>

          {/* Discharge */}
          <SectionCard
            title="Discharge Medication"
            icon="fa-solid fa-capsules"
            tone="bg-orange-50 text-orange-500"
            count={discharge.rows.length}
            subtitle={discharge.rows.length > 0 ? dischargeSourceLabel : undefined}
          >
            <table className="w-full min-w-[720px] text-left">
              <thead className="border-b border-slate-100">
                <tr>
                  <th className={`${TH} w-10 text-center`}>#</th>
                  <th className={TH}>Medication</th>
                  <th className={TH}>Dose</th>
                  <th className={TH}>Frequency</th>
                  <th className={TH}>Instruction</th>
                  <th className={TH}>Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {discharge.rows.length === 0 && (protocolDischargeLoading || planDischarge === null) ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-6 text-center text-[10px] text-slate-400">
                      <i className="fa-solid fa-circle-notch fa-spin mr-2" />
                      Loading discharge medicines...
                    </td>
                  </tr>
                ) : discharge.rows.length === 0 ? (
                  <EmptyRow
                    colSpan={6}
                    text={protocolDischargeError || "No discharge medicines recorded for this patient yet."}
                  />
                ) : (
                  discharge.rows.map((row, index) => (
                    <tr key={row.id} className="transition-colors hover:bg-slate-50">
                      <td className={`${TD} w-10 text-center text-slate-400`}>{index + 1}</td>
                      <td className={`${TD} font-bold text-slate-800`}>{row.name}</td>
                      <td className={`${TD} whitespace-nowrap text-slate-700`}>{row.dose || "—"}</td>
                      <td className={`${TD} text-slate-700`}>{row.frequency || "—"}</td>
                      <td className={`${TD} text-slate-500`}>{row.instruction || "—"}</td>
                      <td className={`${TD} text-slate-700`}>{row.duration || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </SectionCard>
        </div>

        {/* Right sidebar */}
        <aside className="w-full shrink-0 space-y-6 lg:w-80">
          {/* Next appointment */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-[11px] font-bold text-slate-800">Next Appointment</h3>
            {planClosed ? (
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <i className="fa-solid fa-flag-checkered" />
                </div>
                <p className="text-[11px] font-bold text-slate-800">Treatment completed</p>
              </div>
            ) : nextDay ? (
              <>
                <div className="mb-4 flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#0052cc]">
                    <i className="fa-regular fa-calendar" />
                  </div>
                  <div className="min-w-0 text-[10px]">
                    <p className="text-[11px] font-bold text-slate-800">{fmtDate(nextDay.date)}</p>
                    <p className="font-medium text-[#0052cc]">
                      {cycleDayLabel(nextDay.cycle, nextDay.day)}
                      {nextDay.date ? ` · ${relativeDay(nextDay.date)}` : ""}
                    </p>
                    {bookedNext ? (
                      <p className="mt-0.5 font-semibold text-emerald-600">
                        Booked{bookedNext.appointment_time ? ` · ${String(bookedNext.appointment_time).slice(0, 5)}` : ""}
                        {bookedNext.doctor_name ? ` · ${bookedNext.doctor_name}` : ""}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-amber-600">Not booked yet</p>
                    )}
                  </div>
                </div>
                {bookedNext ? (
                  <button
                    type="button"
                    onClick={() => booking.reschedule(bookedNext)}
                    className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-[10px] font-bold text-slate-800 shadow-sm transition-colors hover:bg-slate-50"
                  >
                    <i className="fa-solid fa-calendar-days mr-1.5" />
                    Reschedule
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => booking.book(nextDay.date)}
                    className="w-full rounded-lg bg-[#0052cc] px-4 py-2.5 text-[10px] font-bold text-white shadow-sm transition-colors hover:bg-[#0041a3]"
                  >
                    <i className="fa-solid fa-calendar-plus mr-1.5" />
                    Book Appointment
                  </button>
                )}
              </>
            ) : (
              <p className="text-[10px] text-slate-500">
                {cycleDays.length > 0 ? "No further cycle day is scheduled after this one." : "No cycle schedule for this patient yet."}
              </p>
            )}
          </section>

          {/* Administration log */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center">
              <i className="fa-regular fa-clock mr-2 text-[#0052cc]" />
              <h3 className="text-[11px] font-bold text-slate-800">Medication Timeline</h3>
            </div>
            {slot?.kind !== "planned" || !sheetDay ? (
              <p className="text-[10px] text-slate-500">
                {slot?.kind === "planned" && days.loading
                  ? "Loading..."
                  : "No medication administration records for this cycle day."}
              </p>
            ) : slot.row.status === "CURRENT" ? (
              <p className="text-[10px] text-slate-500">
                Ordered - not sent for administration yet. Medicines are recorded here once the nurse gives them.
              </p>
            ) : givenLog.length + notGivenLog.length + pendingLog.length === 0 ? (
              <p className="text-[10px] text-slate-500">No medicines to administer on this cycle day.</p>
            ) : (
              <ol className="relative space-y-4 pl-5 before:absolute before:inset-y-1 before:left-[5px] before:w-px before:bg-slate-200">
                {givenLog.map((row) => (
                  <li key={row.id} className="relative">
                    <span className="absolute -left-5 top-1 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-4 ring-white" />
                    <p className="text-[10px] font-bold text-slate-800">
                      {row.givenAt ? fmtTime(row.givenAt) : "—"} · {row.name}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {[row.patientDose || row.dose, row.route].filter(Boolean).join(" · ")}
                      {row.givenByName ? ` — given by ${row.givenByName}` : " — given"}
                    </p>
                  </li>
                ))}
                {notGivenLog.map((row) => (
                  <li key={row.id} className="relative">
                    <span className={`absolute -left-5 top-1 h-2.5 w-2.5 rounded-full ring-4 ring-white ${row.status === "CANCELLED" ? "bg-red-400" : "bg-slate-400"}`} />
                    <p className="text-[10px] font-bold text-slate-700">
                      {row.name} · {row.status === "CANCELLED" ? "Cancelled" : "Skipped"}
                    </p>
                    {row.reason && <p className="text-[10px] text-slate-500">{row.reason}</p>}
                  </li>
                ))}
                {pendingLog.length > 0 && (
                  <li className="relative">
                    <span className="absolute -left-5 top-1 h-2.5 w-2.5 rounded-full bg-amber-400 ring-4 ring-white" />
                    <p className="text-[10px] font-bold text-amber-700">Pending ({pendingLog.length})</p>
                    <p className="text-[10px] text-slate-500">{pendingLog.map((row) => row.name).join(", ")}</p>
                  </li>
                )}
              </ol>
            )}
          </section>

          {/* Day instructions */}
          {(sheetDay?.chemo_instructions || sheetDay?.additional_notes) && (
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center">
                <i className="fa-regular fa-file-lines mr-2 text-[#0052cc]" />
                <h3 className="text-[11px] font-bold text-slate-800">Day Instructions</h3>
              </div>
              {sheetDay?.chemo_instructions && (
                <div className="mb-3">
                  <p className="mb-1 text-[10px] font-semibold uppercase text-slate-500">Post Chemo Instructions</p>
                  <p className="whitespace-pre-line text-[10px] text-slate-700">{sheetDay.chemo_instructions}</p>
                </div>
              )}
              {sheetDay?.additional_notes && (
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase text-slate-500">Additional Notes</p>
                  <p className="whitespace-pre-line text-[10px] text-slate-700">{sheetDay.additional_notes}</p>
                </div>
              )}
            </section>
          )}
        </aside>
      </div>
    </>
  );
};

export default MedicationsTab;
