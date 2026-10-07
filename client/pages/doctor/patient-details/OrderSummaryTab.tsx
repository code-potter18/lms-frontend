import React, { useEffect, useState } from "react";
import API from "../../../api/axios";
import { labOrderItemApi, type LabOrderItemRecord } from "../../../api/labOrder.api";
import { useBranchFilter } from "../../../context/BranchFilterContext";
import { chemoPlanCurrentItems, chemoPlanItemName } from "../../../api/chemotherapy.api";
import type { SummaryPlanItem, SummaryPlan } from "./types";
import { loadLatestChemoPlan } from "./api";
import { useDischargeMedicines } from "./hooks";
import { StatusBadge, SectionHeader } from "./ui";

/* ============================================================
   ORDER SUMMARY TAB
   Diagnosis & staging, the treatment timeline with the day
   selector, next appointment / progress, lab validation and the
   selected day's premedications, chemo orders, supportive and
   discharge medicines, plus the administration instructions.
   ============================================================ */

type OrderSummaryTabProps = {
  patientId: string;
  savedPlan: SummaryPlan | null;
  /* Shown when the patient has no chemotherapy plan yet. */
  planNotice: string;
  selectedCycle: number;
  cycleMedicationsMap: Record<string, any[]>;
};

const OrderSummaryTab: React.FC<OrderSummaryTabProps> = ({
  patientId: resolvedPatientId,
  savedPlan,
  planNotice,
  selectedCycle,
  cycleMedicationsMap,
}) => {
  const [selectedDay, setSelectedDay] = useState("Day 1");
  const [regimenProtocol, setRegimenProtocol] = useState<any | null>(null);
  const [regimenLoading, setRegimenLoading] = useState(false);
  const [regimenError, setRegimenError] = useState("");
  const [currentPlan, setCurrentPlan] = useState<any | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState("");
  const [cycleMedications, setCycleMedications] = useState<any[]>([]);
  const [nextAppointment, setNextAppointment] = useState<{
    date: string;
    detail: string;
  } | null>(null);

  const [adminInstructions, setAdminInstructions] = useState<
    {
      medicineName: string;
      route: string;
      infusion: string;
      dose: string;
      frequency: string;
      timing: string;
      remarks: string;
      administrationDetail: string;
    }[]
  >([]);

  const { selectedBranchId } = useBranchFilter();

  const [labItems, setLabItems] = useState<LabOrderItemRecord[]>([]);
  const [labItemsLoading, setLabItemsLoading] = useState(false);
  const [labItemsError, setLabItemsError] = useState("");

  useEffect(() => {
    const pid = resolvedPatientId;
    if (!pid) return;
    let cancelled = false;
    setLabItemsLoading(true);
    setLabItemsError("");

    const storedItemIds: string[] = (() => {
      try {
        return JSON.parse(localStorage.getItem(`hms_lab_item_ids_${pid}`) || "[]");
      } catch {
        return [];
      }
    })();

    if (storedItemIds.length > 0) {
      Promise.all(
        storedItemIds.map((id) =>
          labOrderItemApi.getById(id).then((r) => r.data.data).catch(() => null)
        )
      )
        .then((results) => {
          if (cancelled) return;
          const items = results.filter(Boolean) as LabOrderItemRecord[];
          if (items.length > 0) {
            setLabItems(items);
            return;
          }
          fetchAllAndFilter();
        })
        .catch(() => { fetchAllAndFilter(); })
        .finally(() => { if (!cancelled) setLabItemsLoading(false); });
    } else {
      fetchAllAndFilter();
    }

    function fetchAllAndFilter() {
      labOrderItemApi
        .getAll()
        .then((response) => {
          if (cancelled) return;
          const allItems = response.data.data ?? [];
          const forPatient = allItems.filter(
            (item) => item.lab_order?.patient_history?.patient_id === pid
          );
          setLabItems(forPatient);
        })
        .catch((error: any) => {
          if (!cancelled) {
            setLabItemsError(
              error?.response?.data?.message ||
                error?.message ||
                "Failed to load lab investigations."
            );
          }
        })
        .finally(() => {
          if (!cancelled) setLabItemsLoading(false);
        });
    }

    return () => { cancelled = true; };
  }, [resolvedPatientId]);

  useEffect(() => {
    const protocolId = savedPlan?.source_protocol_id;
    if (!protocolId) {
      setRegimenProtocol(null);
      setRegimenError("");
      return;
    }
    let cancelled = false;
    const loadRegimenProtocol = async () => {
      setRegimenLoading(true);
      setRegimenError("");
      try {
        const response = await API.get<{ success: boolean; data: any }>(
          `/chemotherapy/regimen-protocols/${encodeURIComponent(protocolId)}`
        );
        if (cancelled) return;
        setRegimenProtocol(response.data?.data ?? null);
      } catch (err: any) {
        if (cancelled) return;
        setRegimenError(err?.response?.data?.message ?? "Failed to load regimen protocol");
        setRegimenProtocol(null);
      } finally {
        if (!cancelled) setRegimenLoading(false);
      }
    };
    loadRegimenProtocol();
    return () => {
      cancelled = true;
    };
  }, [savedPlan?.source_protocol_id]);

  useEffect(() => {
    const planId = savedPlan?.chemotherapy_plan_id;
    if (!planId) {
      setCurrentPlan(null);
      setPlanError("");
      return;
    }
    let cancelled = false;
    const loadPlanDetails = async () => {
      setPlanLoading(true);
      setPlanError("");
      try {
        const response = await API.get<{ success: boolean; data: any }>(
          `/chemotherapy/plans/${encodeURIComponent(planId)}`
        );
        if (cancelled) return;
        setCurrentPlan(response.data?.data ?? null);
      } catch (err: any) {
        if (cancelled) return;
        setPlanError(err?.response?.data?.message ?? "Failed to load plan details");
        setCurrentPlan(null);
      } finally {
        if (!cancelled) setPlanLoading(false);
      }
    };
    loadPlanDetails();
    return () => {
      cancelled = true;
    };
  }, [savedPlan?.chemotherapy_plan_id]);

  useEffect(() => {
    const cycle = savedPlan?.chemotherapy_cycle?.find(
      (c) => c.cycle_number === Number(selectedCycle)
    );
    if (!cycle?.chemotherapy_cycle_id) {
      setCycleMedications([]);
      return;
    }
    const items = cycleMedicationsMap?.[cycle.chemotherapy_cycle_id] ?? [];
    setCycleMedications(items);
  }, [selectedCycle, savedPlan?.chemotherapy_cycle, cycleMedicationsMap]);

  useEffect(() => {
    const patientId = resolvedPatientId;
    if (!patientId) return;
    let cancelled = false;

    /* NEXT APPOINTMENT for the selected patient - read from the
       GET /chemotherapy/plans?patient_id=<id> payload. Priority:
       upcoming cycle planned_date -> recorded next_cycle_date ->
       next cycle derived from start date + cycle interval. */
    const loadNextAppointment = async () => {
      /* Mapping-scoped endpoint (GET /plans/latest-for-patient) - one
         clean call, works with or without a branch selection. */
      try {
        const plan = await loadLatestChemoPlan(patientId);
        if (cancelled) return;
        const cycles = plan?.chemotherapy_cycle ?? [];
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const todayTs = startOfToday.getTime();

        const toDate = (value?: string | null) => {
          if (!value) return null;
          const d = new Date(value);
          return Number.isNaN(d.getTime()) ? null : d;
        };
        const fmt = (d: Date) =>
          `${String(d.getDate()).padStart(2, "0")}-${String(
            d.getMonth() + 1,
          ).padStart(2, "0")}-${d.getFullYear()}`;
        const describe = (date: Date, cycleNumber: number) => {
          const dayDiff = Math.round(
            (date.getTime() - todayTs) / 86400000,
          );
          const cycleLabel = `Cycle ${cycleNumber}`;
          if (dayDiff === 0) return `${cycleLabel} · Today`;
          if (dayDiff > 0)
            return `${cycleLabel} · In ${dayDiff} day${dayDiff === 1 ? "" : "s"}`;
          return cycleLabel;
        };

        /* 1. Earliest upcoming scheduled cycle date. */
        const upcoming = cycles
          .filter((cycle) => toDate(cycle.planned_date))
          .sort(
            (a, b) =>
              (toDate(a.planned_date) as Date).getTime() -
              (toDate(b.planned_date) as Date).getTime(),
          )
          .find(
            (cycle) =>
              (toDate(cycle.planned_date) as Date).getTime() >= todayTs,
          );

        if (upcoming) {
          setNextAppointment({
            date: fmt(toDate(upcoming.planned_date) as Date),
            detail: describe(
              toDate(upcoming.planned_date) as Date,
              upcoming.cycle_number,
            ),
          });
          return;
        }

        /* 2. Explicitly recorded next_cycle_date on any cycle. */
        const withNextDate = cycles.filter((cycle) =>
          toDate(cycle.next_cycle_date),
        );
        if (withNextDate.length > 0) {
          const latest = withNextDate.reduce((a, b) =>
            (toDate(b.next_cycle_date) as Date).getTime() >=
            (toDate(a.next_cycle_date) as Date).getTime()
              ? b
              : a,
          );
          setNextAppointment({
            date: fmt(toDate(latest.next_cycle_date) as Date),
            detail: describe(
              toDate(latest.next_cycle_date) as Date,
              latest.cycle_number + 1,
            ),
          });
          return;
        }

        /* 3. Derive the next cycle date from the plan schedule
              (start date + interval), capped at the planned cycles. */
        const startDate = toDate(plan?.treatment_start_date);
        const interval = plan?.cycle_interval_days ?? 0;
        if (startDate && interval > 0) {
          const plannedCycles = plan?.planned_cycles ?? 0;
          const daysElapsed = Math.floor(
            (todayTs - startDate.getTime()) / 86400000,
          );
          const stepsAhead =
            daysElapsed < 0 ? 0 : Math.floor(daysElapsed / interval) + 1;
          const maxStep = plannedCycles > 0 ? plannedCycles - 1 : stepsAhead;
          if (stepsAhead <= maxStep) {
            const derived = new Date(
              startDate.getTime() + stepsAhead * interval * 86400000,
            );
            setNextAppointment({
              date: fmt(derived),
              detail: describe(derived, stepsAhead + 1),
            });
            return;
          }
        }

        setNextAppointment(null);
      } catch (error: any) {
        console.error(
          "Failed to load next appointment:",
          error?.response?.data?.message ?? error
        );
        if (!cancelled) setNextAppointment(null);
      }
    };

    loadNextAppointment();
    return () => {
      cancelled = true;
    };
  }, [resolvedPatientId, selectedBranchId]);

  useEffect(() => {
    const patientId = resolvedPatientId;
    if (!patientId) {
      setAdminInstructions([]);
      return;
    }
    try {
      const stored = localStorage.getItem(`hms_admin_instructions_${patientId}`);
      const parsed = stored ? JSON.parse(stored) : [];
      setAdminInstructions(Array.isArray(parsed) ? parsed : []);
    } catch {
      setAdminInstructions([]);
    }
  }, [resolvedPatientId]);

  const recentCancerType =
    [savedPlan?.cancer_type, savedPlan?.cancer_subtype]
      .filter(Boolean)
      .join(" ");

  const recentStage = savedPlan?.cancer_stage || "";

  const recentTherapy = savedPlan?.regimen_name || "";

  const recentIntent = savedPlan?.treatment_intent || "";

  /* ============================================================
     ORDER SUMMARY - all recent details of the selected patient
     resolved from the fetched staging record + saved chemo plan.
     ============================================================ */
  const fmtOrderDate = (value?: string | null) => {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return `${String(d.getDate()).padStart(2, "0")}-${String(
      d.getMonth() + 1
    ).padStart(2, "0")}-${d.getFullYear()}`;
  };

  const orderTherapy = savedPlan?.regimen_name || recentTherapy;
  const orderIntent = savedPlan?.treatment_intent || recentIntent;

  const planCycles = (savedPlan?.chemotherapy_cycle ?? []).filter(
    (cycle) => typeof cycle.cycle_number === "number"
  );
  const latestPlanCycle =
    planCycles.length > 0
      ? planCycles.reduce((a, b) =>
          (b.cycle_number as number) >= (a.cycle_number as number) ? b : a
        )
      : null;

  const derivedCycleInfo = (() => {
    if (!savedPlan?.treatment_start_date || !savedPlan?.cycle_interval_days) {
      return null;
    }
    const start = new Date(savedPlan.treatment_start_date);
    if (Number.isNaN(start.getTime())) return null;
    const daysElapsed = Math.floor(
      (Date.now() - start.getTime()) / 86400000,
    );
    const interval = savedPlan.cycle_interval_days;
    if (interval <= 0) return null;
    if (daysElapsed < 0) return { cycle: 1, day: 1 };
    const cycle = Math.floor(daysElapsed / interval) + 1;
    const planned = savedPlan.planned_cycles || 0;
    if (planned > 0 && cycle > planned) return null;
    return { cycle, day: (daysElapsed % interval) + 1 };
  })();

  const displayCycleNumber =
    latestPlanCycle?.cycle_number ?? derivedCycleInfo?.cycle ?? null;
  const displayCycleDay =
    latestPlanCycle?.cycle_day ?? derivedCycleInfo?.day ?? null;

  /* Plan items split by drug_role and the SELECTED DAY: PREMEDICATION
     drugs render in the Premedications table, PRIMARY drugs render in
     Chemo Orders - both only for the day picked in the Select Day
     control (items without an explicit day belong to Day 1). */
  const selectedDayNumber =
    Number(selectedDay.replace("Day ", "")) || 1;

  // Use regimen protocol items if available, otherwise fall back to saved plan items
  const protocolItemsRaw = regimenProtocol?.chemotherapy_regimen_protocol_items ?? [];
  const mapProtocolItem = (item: any) => ({
    chemotherapy_plan_item_id: item.id || item.protocol_item_id,
    drug_role: item.drug_role,
    medicine_master: item.medicine_master,
    protocol_dose: item.patient_dose ? Number(item.patient_dose) : null,
    protocol_dose_unit: item.patient_dose_unit,
    administration_route: item.administration_detail ?? item.administration_route ?? '',
    frequency: item.frequency ?? item.remarks ?? '',
    remarks: item.remarks ?? '',
    cycle_day: item.cycle_day,
    administration_day: item.administration_day,
    dilution_volume: '',
  });
  const protocolItems = protocolItemsRaw.map(mapProtocolItem);
  const planItems = chemoPlanCurrentItems<any>(currentPlan);
  const savedItems = chemoPlanCurrentItems<SummaryPlanItem>(savedPlan);
  const sourceItems = cycleMedications.length > 0 ? cycleMedications : (protocolItems.length > 0 ? protocolItems : (planItems.length > 0 ? planItems : savedItems));

  const matchesCycleAndDay = (item: any) => {
    const itemDay = item.administration_day ?? item.cycle_day ?? 1;
    return itemDay === selectedDayNumber;
  };

  const premedicationItems = sourceItems.filter(
    (item) =>
      (item.drug_role ?? "").toUpperCase() === "PREMEDICATION" &&
      matchesCycleAndDay(item),
  );
  const primaryChemoItems = sourceItems.filter(
    (item) =>
      (item.drug_role ?? "").toUpperCase() === "PRIMARY" &&
      matchesCycleAndDay(item),
  );
  const supportiveItems = sourceItems.filter(
    (item) => {
      const role = (item.drug_role ?? "").toUpperCase();
      return (
        role !== "PREMEDICATION" &&
        role !== "PRIMARY" &&
        matchesCycleAndDay(item)
      );
    },
  );

  /* Treatment timeline: one node per CYCLE, Cycle 1 through the final
     planned cycle of the selected protocol. Day counting / interval
     stays hidden - each node just shows its real start date and is
     done/current/future. The follow-up node shows the plan's expected
     end date. */
  const todayOrder = new Date();
  todayOrder.setHours(0, 0, 0, 0);

  const timelineCycles = (() => {
    if (
      !savedPlan?.treatment_start_date ||
      !savedPlan?.planned_cycles ||
      !savedPlan?.cycle_interval_days
    ) {
      return [];
    }
    const start = new Date(savedPlan.treatment_start_date);
    if (Number.isNaN(start.getTime())) return [];
    const interval = savedPlan.cycle_interval_days || 1;
    return Array.from({ length: savedPlan.planned_cycles }, (_, idx) => {
      const cycle = idx + 1;
      const dStart = new Date(start);
      dStart.setDate(dStart.getDate() + idx * interval);
      const dEnd = new Date(dStart);
      dEnd.setDate(dEnd.getDate() + interval);
      const t = todayOrder.getTime();
      return {
        label: `Cycle ${cycle}`,
        num: cycle,
        date: fmtOrderDate(dStart.toISOString()),
        done: dEnd.getTime() <= t,
        isCurrent: dStart.getTime() <= t && t < dEnd.getTime(),
        active: cycle === selectedCycle,
      };
    });
  })();
  const timelineFollowUpDate = savedPlan?.expected_end_date
    ? fmtOrderDate(savedPlan.expected_end_date)
    : "";

  /* Selectable days for the current cycle, driven by the regimen protocol's
     day count (no_of_days) or, failing that, the distinct administration
     days present across the protocol items. Fallback to Day 1..3. */
  const protocolDaysCount = (() => {
    const explicit = Number(regimenProtocol?.no_of_days);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    const adminDays = new Set<number>();
    (protocolItemsRaw ?? []).forEach((item: any) => {
      const d = Number(item.administration_day ?? item.cycle_day);
      if (Number.isFinite(d) && d > 0) adminDays.add(d);
    });
    return adminDays.size > 0 ? Math.max(...adminDays) : 3;
  })();
  const timelineDays = Array.from({ length: protocolDaysCount }, (_, idx) => {
    const day = idx + 1;
    return { label: `Day ${day}`, num: day };
  });

  const totalTreatmentDays =
    savedPlan?.planned_cycles && savedPlan?.cycle_interval_days
      ? savedPlan.planned_cycles * savedPlan.cycle_interval_days
      : null;
  const completedTreatmentDays =
    savedPlan?.completed_cycles != null && savedPlan?.cycle_interval_days
      ? Math.min(savedPlan.completed_cycles, savedPlan.planned_cycles || savedPlan.completed_cycles) *
        savedPlan.cycle_interval_days
      : null;
  const remainingTreatmentDays =
    totalTreatmentDays != null && completedTreatmentDays != null
      ? Math.max(totalTreatmentDays - completedTreatmentDays, 0)
      : null;
  const progressPercent =
    savedPlan?.planned_cycles && savedPlan?.completed_cycles != null
      ? Math.min(
          Math.round(
            (savedPlan.completed_cycles / savedPlan.planned_cycles) * 100
          ),
          100
        )
      : null;

  const buildOrderEntries = (pairs: [string, unknown][]): [string, string][] =>
    pairs
      .map(([label, value]) => {
        let v: unknown = value;
        if (v === null || v === undefined || v === "") return null;
        if (typeof v === "object") v = JSON.stringify(v);
        return [label, String(v)] as [string, string];
      })
      .filter((p): p is [string, string] => p !== null);

  /* Embedded staging snapshot comes straight from the plan response. */
  const osd = savedPlan?.oncology_staging_detail ?? null;

  /* Discharge medication card: REAL rows from
     GET /chemotherapy/regimen-protocols/:protocolId/discharge-medicines,
     resolved through the saved plan's source protocol. */
  const {
    rows: orderDischargeMeds,
    loading: orderDischargeMedsLoading,
    error: orderDischargeMedsError,
  } = useDischargeMedicines(savedPlan?.source_protocol_id || "");

  const diagnosisOrderEntries = buildOrderEntries([
    ["Cancer Type", osd?.cancer_types?.cancer_type ?? savedPlan?.cancer_type],
    ["Subtype", osd?.histopathology || osd?.cancer_subtypes?.subtype_name || savedPlan?.cancer_subtype],
    ["Clinical Stage", osd?.clinical_stage ?? savedPlan?.cancer_stage],
    ["Staging System", osd?.staging_system],
    ["T Stage", osd?.t_stage],
    ["N Stage", osd?.n_stage],
    ["M Stage", osd?.m_stage],
    ["Laterality", osd?.laterality],
    ["Performance Status", osd?.performance_status],
    ["Metastasis Sites", osd?.metastasis_sites],
    ["ICD-10", osd?.icd10_code],
    ["ICD-O-3 Topography", osd?.icd_o3_topo],
    ["ICD-O-3 Morphology", osd?.icd_o3_morpho],
    ["Visit Date", fmtOrderDate(osd?.visit_date)],
    ["Diagnosis Date", fmtOrderDate(osd?.diagnosis_date)],
    ["Biopsy Date", fmtOrderDate(osd?.biopsy_date)],
    [
      "Consulting Oncologist",
      osd?.consulting_oncologist ||
        (savedPlan?.employees
          ? [
              savedPlan.employees.first_name,
              savedPlan.employees.last_name,
            ]
              .filter(Boolean)
              .join(" ")
          : ""),
    ],
    ["Diagnosis ID", osd?.diagnosis_id ?? savedPlan?.diagnosis_id],
    ["Staging Detail ID", osd?.staging_detail_id ?? savedPlan?.staging_detail_id],
    ["Treatment Status", savedPlan?.treatment_status],
    ["ECOG Status", savedPlan?.ecog_status],
    ["Karnofsky Score", savedPlan?.karnofsky_score],
    ["Saved On", fmtOrderDate(osd?.created_at)],
  ]);

  const renderOrderEntryGrid = (entries: [string, string][]) => (
    <div className="grid gap-x-8 gap-y-3 px-6 py-5 grid-cols-[auto_auto_auto]">
      {entries.map(([label, value]) => (
        <div key={label}>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#64748b] mb-0.5">
            {label}
          </div>
          <div className="text-sm font-medium text-[#1e293b] break-words">
            {value}
          </div>
        </div>
      ))}
    </div>
  );

  return (
<>
{planNotice && (
<div className="mb-6 flex items-center rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
<i className="fa-solid fa-triangle-exclamation mr-2"></i> {planNotice}
</div>
)}
{/* BEGIN: Recent Details Sections (fetched for the selected patient) */}
{diagnosisOrderEntries.length > 0 && (
<section className="mb-6 overflow-hidden rounded-[16px] shadow-sm border border-[#e2e8f0] bg-white">
  <SectionHeader icon="fa-solid fa-file-medical" title={`Diagnosis & Staging — ${[osd?.cancer_types?.cancer_type, osd?.histopathology || osd?.cancer_subtypes?.subtype_name].filter(Boolean).join(" — ") || orderTherapy || "—"}`} badge={osd?.clinical_stage || savedPlan?.cancer_stage || "—"} />
  {renderOrderEntryGrid(diagnosisOrderEntries)}
</section>
)}
{/* END: Recent Details Sections */}
<div className="flex space-x-6 mb-8">
{/* Left Side (Timeline & Day Selector) */}
<div className="flex-1 space-y-6">
{/* BEGIN: Treatment Timeline */}
<div className="bg-white rounded-[16px] shadow-sm border border-[#e2e8f0] p-6 h-[200px]">
<div className="flex items-center mb-8">
<h3 className="text-lg font-bold text-[#1e293b]">Cycle {selectedCycle || displayCycleNumber || "—"}</h3>
<div className="ml-3 text-sm text-[#64748b] flex items-center cursor-pointer hover:text-[#1e293b]">
                  {orderIntent || savedPlan?.treatment_status || "—"} <i className="fa-solid fa-chevron-down text-[10px] ml-2"></i>
</div>
</div>
{timelineCycles.length > 0 ? (
<div className="relative mt-4 overflow-x-auto hide-scrollbar">
<div className="relative min-w-max px-8">
<div className="absolute top-[18px] left-[40px] right-[40px] h-[2px] bg-slate-200"></div>
<div className="relative z-10 flex gap-x-12 min-w-max justify-between">
{timelineCycles.map((cycle) => (
<div key={cycle.label} className="flex flex-col items-center" title={`${cycle.label} · starts ${cycle.date}`}>
<div className={`w-10 h-10 rounded-full ${cycle.active || cycle.isCurrent ? "bg-[#1d4ed8] text-white ring-4 ring-[#1d4ed8]/20" : cycle.done ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-400"} flex items-center justify-center font-bold ring-[6px] ring-white`}>{cycle.num}</div>
<div className="mt-3 text-center">
<div className={`text-sm ${cycle.active || cycle.isCurrent ? "font-semibold text-[#1e293b]" : "font-medium text-[#64748b]"}`}>{cycle.label}</div>
<div className={`text-[11px] mt-1 ${cycle.done ? "text-[#64748b]" : "text-slate-400"}`}>{cycle.date}</div>
</div>
</div>
))}
<div className="flex flex-col items-center">
<div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center font-bold ring-[6px] ring-white"><i className="fa-regular fa-map"></i></div>
<div className="mt-3 text-center">
<div className="text-sm font-medium text-[#64748b]">Follow-up</div>
<div className="text-[11px] text-slate-400 mt-1">{timelineFollowUpDate || "—"}</div>
</div>
</div>
</div>
</div>
</div>
) : (
<div className="relative px-8 mt-4">
<div className="absolute top-[18px] left-[60px] right-[60px] h-[2px] bg-slate-200"></div>
<div className="flex justify-between relative z-10">
{["1", "2", "3"].map((num) => (
<div key={num} className="flex flex-col items-center">
<div className={`w-10 h-10 rounded-full ${num === "1" ? "bg-[#1d4ed8] text-white" : "bg-slate-100 text-slate-400"} flex items-center justify-center font-bold ring-[6px] ring-white`}>{num}</div>
<div className="mt-3 text-center">
<div className={`text-sm ${num === "1" ? "font-semibold text-[#1e293b]" : "font-medium text-[#64748b]"}`}>Day {num}</div>
<div className="text-[11px] text-slate-400 mt-1">—</div>
</div>
</div>
))}
<div className="flex flex-col items-center">
<div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center font-bold ring-[6px] ring-white"><i className="fa-regular fa-map"></i></div>
<div className="mt-3 text-center">
<div className="text-sm font-medium text-[#64748b]">Follow-up</div>
<div className="text-[11px] text-slate-400 mt-1">{timelineFollowUpDate || "—"}</div>
</div>
</div>
</div>
</div>
)}
</div>
{/* END: Treatment Timeline */}
{/* BEGIN: Day Selector */}
<div className="flex items-center">
<span className="text-sm font-semibold text-[#1e293b] mr-4 shrink-0">Select Day</span>
<div className="flex bg-white rounded-[12px] border border-[#e2e8f0] shadow-sm p-1 overflow-x-auto hide-scrollbar max-w-full">
{timelineDays.map((day) => (
<button key={day.label} type="button" onClick={() => setSelectedDay(day.label)} className={`px-6 py-2 rounded-[8px] shadow-sm text-center min-w-[100px] transition-colors ${selectedDay === day.label ? "bg-[#1d4ed8] text-white" : "text-[#1e293b] hover:bg-slate-50"}`}>
<div className="text-sm font-semibold whitespace-nowrap">{day.label}</div>
</button>
))}
</div>
</div>
{/* END: Day Selector */}
</div>
{/* Right Side (Cards) */}
<div className="flex space-x-6">
{/* BEGIN: Next Appointment */}
<div className="bg-white rounded-[16px] shadow-sm border border-[#e2e8f0] p-6 w-[220px] h-[200px] flex flex-col justify-between">
<div>
<h4 className="text-sm font-bold text-[#1e293b] mb-5">Next Appointment</h4>
<div className="flex items-start">
<div className="w-10 h-10 rounded-[10px] bg-blue-50 flex items-center justify-center text-[#1d4ed8] shrink-0 mr-3">
<i className="fa-regular fa-calendar text-lg"></i>
</div>
<div>
<div className="text-sm font-bold text-[#1e293b]">
  {nextAppointment?.date || "—"}
</div>
<div className="text-xs text-[#64748b] mt-1">
  {nextAppointment?.detail || "—"}
</div>
<div className="text-xs text-[#64748b] mt-1">Chemotherapy session</div>
</div>
</div>
</div>
<button className="w-full py-2 border border-[#e2e8f0] rounded-[8px] text-sm font-semibold text-[#1e293b] hover:bg-slate-50 transition-colors">Reschedule</button>
</div>
{/* END: Next Appointment */}
{/* BEGIN: Treatment Progress */}
<div className="bg-white rounded-[16px] shadow-sm border border-[#e2e8f0] p-6 w-[220px] h-[200px] flex flex-col justify-between">
<h4 className="text-sm font-bold text-[#1e293b] mb-2">Treatment Progress</h4>
<div className="flex items-center justify-between">
<div className="relative w-16 h-16 rounded-full bg-[conic-gradient(#e2e8f0_0%_100%)] flex items-center justify-center" style={progressPercent != null ? { backgroundImage: `conic-gradient(#1d4ed8 ${progressPercent}%, #e2e8f0 ${progressPercent}% 100%)` } : undefined}>
<div className="absolute inset-[6px] rounded-full bg-white"></div>
<span className="relative z-10 text-sm font-bold text-[#1e293b]">{progressPercent != null ? `${progressPercent}%` : "—"}</span>
</div>
<div className="text-right">
<div className="text-[10px] text-[#64748b] uppercase tracking-wide font-semibold mb-1">Completed</div>
<div className="text-sm font-bold text-[#1e293b] mb-3">{completedTreatmentDays ?? "—"} <span className="text-xs font-medium text-[#64748b] normal-case tracking-normal">Days</span></div>
<div className="text-[10px] text-[#64748b] uppercase tracking-wide font-semibold mb-1">Remaining</div>
<div className="text-sm font-bold text-[#1e293b]">—</div>
</div>
</div>
<div className="pt-4 flex justify-between items-center text-xs">
<span className="text-[#64748b] font-medium">Next Visit</span>
<span className="font-bold text-[#1e293b]">—</span>
</div>
</div>
{/* END: Treatment Progress */}
</div>
</div>
{/* BEGIN: Bottom Grid */}
<div className="grid grid-cols-12 gap-6">
{/* Left Column */}
<div className="col-span-3 space-y-6">
<div className="bg-white rounded-[16px] shadow-sm border border-[#e2e8f0] p-5">
<h4 className="text-sm font-bold text-[#1e293b] mb-4">Cycle &amp; Schedule</h4>
        <div className="grid gap-4 mb-5 grid-cols-[auto_auto_auto]">
          <div>
            <div className="text-[10px] text-[#64748b] font-semibold uppercase mb-1">CYCLE</div>
            <div className="font-bold text-sm">{displayCycleNumber ? `${displayCycleNumber}${savedPlan?.planned_cycles ? ` / ${savedPlan.planned_cycles}` : ""}` : "—"}</div>
          </div>
          <div>
            <div className="text-[10px] text-[#64748b] font-semibold uppercase mb-1">DAY</div>
            <div className="font-bold text-sm">{displayCycleDay ?? "—"}</div>
          </div>
          <div>
            <div className="text-[10px] text-[#64748b] font-semibold uppercase mb-1">TOTAL DAYS</div>
            <div className="font-bold text-sm">{totalTreatmentDays ?? "—"}</div>
          </div>
        </div>
        <div className="grid gap-4 grid-cols-[auto_auto_auto]">
<div>
<div className="text-[10px] text-[#64748b] font-semibold uppercase mb-1">START DATE</div>
<div className="font-bold text-sm">{fmtOrderDate(savedPlan?.treatment_start_date) || "—"}<br/></div>
</div>
<div>
<div className="text-[10px] text-[#64748b] font-semibold uppercase mb-1">END DATE</div>
<div className="font-bold text-sm">{fmtOrderDate(savedPlan?.expected_end_date) || "—"}<br/></div>
</div>
<div>
<div className="text-[10px] text-[#64748b] font-semibold uppercase mb-1">INTERVAL</div>
<div className="font-bold text-sm">{savedPlan?.cycle_interval_days ? `${savedPlan.cycle_interval_days} days` : "—"}</div>
</div>
</div>
</div>
<div className="bg-white rounded-[16px] shadow-sm border border-[#e2e8f0] p-5">
<h4 className="text-sm font-bold text-[#1e293b] mb-4">Clinical Info</h4>
<div className="grid gap-4 mb-5 grid-cols-[auto_auto]">
<div>
<div className="text-[10px] text-[#64748b] font-semibold uppercase mb-1">TYPE</div>
<div className="font-bold text-sm">{recentCancerType || "—"}</div>
</div>
<div>
<div className="text-[10px] text-[#64748b] font-semibold uppercase mb-1">STAGE</div>
<div className="font-bold text-sm">{recentStage || "—"}</div>
</div>
</div>
<div>
<div className="text-[10px] text-[#64748b] font-semibold uppercase mb-1">GRADE</div>
<div className="font-bold text-sm">—</div>
</div>
</div>
</div>
{/* Middle Column */}
<div className="col-span-9 space-y-6">
<div className="bg-white rounded-[16px] shadow-sm border border-[#e2e8f0] p-5">
<div className="flex items-center mb-4">
<h4 className="text-sm font-bold text-[#1e293b] mr-3">Lab Validation</h4>
<span className="px-2 py-0.5 bg-slate-50 text-[#64748b] text-[10px] font-bold uppercase rounded border border-slate-200">{labItemsLoading ? "Loading…" : `${labItems.length} Test(s)`}</span>
</div>
{labItemsError && (
  <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">{labItemsError}</div>
)}
{labItemsLoading ? (
  <div className="py-6 text-center text-xs text-[#64748b]">
    <i className="fa-solid fa-circle-notch fa-spin mr-1" />Loading lab investigations…
  </div>
) : labItems.length === 0 ? (
  <table className="w-full text-left text-sm mb-4">
    <thead>
      <tr className="text-[10px] text-[#64748b] uppercase border-b border-slate-100">
        <th className="pb-2 font-semibold">PARAMETER</th>
        <th className="pb-2 font-semibold">RESULT</th>
        <th className="pb-2 font-semibold">RANGE</th>
        <th className="pb-2 font-semibold">STATUS</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td colSpan={4} className="py-6 text-center text-xs text-[#64748b]">No lab validation records found.</td>
      </tr>
    </tbody>
  </table>
) : (
  <table className="w-full text-left text-sm mb-4">
    <thead>
      <tr className="text-[10px] text-[#64748b] uppercase border-b border-slate-100">
        <th className="pb-2 font-semibold">TEST NAME</th>
        <th className="pb-2 font-semibold">TEST CODE</th>
        <th className="pb-2 font-semibold">UNIT</th>
        <th className="pb-2 font-semibold">REFERENCE RANGE</th>
        <th className="pb-2 font-semibold">STATUS</th>
      </tr>
    </thead>
    <tbody>
      {labItems.map((item) => (
        <tr key={item.lab_order_item_id} className="border-b border-slate-50">
          <td className="py-2 font-bold text-sm">{item.lab_test_master?.test_name ?? "—"}</td>
          <td className="py-2 text-sm">{item.lab_test_master?.test_code ?? "—"}</td>
          <td className="py-2 text-sm">{item.lab_test_master?.unit ?? "—"}</td>
          <td className="py-2 text-sm">{item.lab_test_master?.reference_range ?? "—"}</td>
          <td className="py-2">
            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
              item.item_status === "Completed"
                ? "bg-emerald-100 text-emerald-700"
                : item.item_status === "Ordered"
                ? "bg-blue-100 text-blue-700"
                : "bg-slate-100 text-slate-600"
            }`}>
              {item.item_status ?? "Ordered"}
            </span>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
)}
<div className="border-t border-slate-100 pt-3 flex justify-between items-center text-sm">
<span className="text-[#64748b]">Chemo Clearance :</span>
<span className="font-bold text-[#64748b] uppercase">—</span>
</div>
</div>
</div>
</div>
<div className="bg-white rounded-[16px] shadow-sm border border-[#e2e8f0] overflow-hidden mt-6">
<div className="px-5 py-4 border-b border-[#e2e8f0] flex items-center justify-between text-[#1d4ed8]">
<div className="flex items-center">
<i className="fa-solid fa-flask mr-2"></i>
<h4 className="text-sm font-bold">PROTOCOL: {orderTherapy || "—"}</h4>
</div>
<a className="text-xs text-[#1d4ed8] font-medium hover:underline flex items-center" href="#">View Protocol <i className="fa-solid fa-chevron-right text-[10px] ml-1"></i></a>
</div>
<div className="p-5">
<table className="w-full text-left text-sm">
<thead>
<tr className="text-[10px] text-[#64748b] uppercase border-b border-slate-100">
<th className="pb-2 font-semibold">DOSE</th>
<th className="pb-2 font-semibold">PATIENT DOSE</th>
<th className="pb-2 font-semibold">ROUTE</th>
<th className="pb-2 font-semibold">DILUENT</th>
<th className="pb-2 font-semibold">VOLUME</th>
<th className="pb-2 font-semibold">INF. TIME</th>
</tr>
</thead>
<tbody>
<tr className="border-b border-slate-50">
<td className="py-2 whitespace-nowrap">—</td>
<td className="py-2 whitespace-nowrap">—</td>
<td className="py-2 whitespace-nowrap">—</td>
<td className="py-2 whitespace-nowrap">—</td>
<td className="py-2 whitespace-nowrap">—</td>
<td className="py-2 whitespace-nowrap">—</td>
</tr>
</tbody>
</table>
</div>
</div>
{/* BEGIN: Medication Orders Row */}
<div className="mt-6 space-y-6">
<div className="bg-white rounded-[16px] shadow-sm border border-[#e2e8f0] overflow-hidden">
<div className="px-5 py-4 border-b border-[#e2e8f0] flex items-center text-purple-600">
<i className="fa-solid fa-pills mr-2"></i>
<h4 className="text-sm font-bold">Premedications</h4>
</div>
<div className="p-5">
<table className="w-full text-left text-sm">
<thead>
<tr className="text-[10px] text-[#64748b] uppercase border-b border-slate-100">
<th className="pb-2 font-semibold w-8">#</th>
<th className="pb-2 font-semibold">DRUG</th>
<th className="pb-2 font-semibold">DOSE</th>
<th className="pb-2 font-semibold">ROUTE</th>
<th className="pb-2 font-semibold">TIMING</th>
<th className="pb-2 font-semibold text-right">STATUS</th>
</tr>
</thead>
<tbody>
{premedicationItems.length === 0 ? (
<tr>
<td colSpan={6} className="py-6 text-center text-xs text-[#64748b]">No premedications found.</td>
</tr>
) : (
premedicationItems.map((item, index) => (
<tr key={item.chemotherapy_plan_item_id} className="border-b border-slate-50 last:border-0">
<td className="py-2 whitespace-nowrap">{index + 1}</td>
<td className="py-2 font-medium text-[#1e293b] whitespace-nowrap">{chemoPlanItemName(item) || "—"}</td>
<td className="py-2 whitespace-nowrap">{item.protocol_dose != null ? `${item.protocol_dose} ${item.protocol_dose_unit ?? ""}`.trim() : "—"}</td>
<td className="py-2 whitespace-nowrap">{item.administration_route ?? "—"}</td>
<td className="py-2 whitespace-nowrap">{item.frequency ?? item.remarks ?? "—"}</td>
<td className="py-2 whitespace-nowrap text-right"><StatusBadge>{item.drug_role || "PREMEDICATION"}</StatusBadge></td>
</tr>
))
)}
</tbody>
</table>
</div>
</div>
<div className="bg-white rounded-[16px] shadow-sm border border-[#e2e8f0] overflow-hidden">
<div className="px-5 py-4 border-b border-[#e2e8f0] flex items-center text-[#1d4ed8]">
<i className="fa-solid fa-prescription-bottle-medical mr-2"></i>
<h4 className="text-sm font-bold">Chemo Orders</h4>
</div>
<div className="p-5">
<table className="w-full text-left text-sm">
<thead>
<tr className="text-[10px] text-[#64748b] uppercase border-b border-slate-100">
<th className="pb-2 font-semibold w-8">#</th>
<th className="pb-2 font-semibold">DRUG</th>
<th className="pb-2 font-semibold">DOSE</th>
<th className="pb-2 font-semibold">ROUTE</th>
<th className="pb-2 font-semibold">DILUENT</th>
<th className="pb-2 font-semibold text-right">STATUS</th>
</tr>
</thead>
<tbody>
{primaryChemoItems.length === 0 ? (
<tr>
<td colSpan={6} className="py-6 text-center text-xs text-[#64748b]">No chemo orders found.</td>
</tr>
) : (
primaryChemoItems.map((item, index) => (
<tr key={item.chemotherapy_plan_item_id} className="border-b border-slate-50 last:border-0">
<td className="py-2 whitespace-nowrap">{index + 1}</td>
<td className="py-2 font-medium text-[#1e293b] whitespace-nowrap">{chemoPlanItemName(item) || "—"}</td>
<td className="py-2 whitespace-nowrap">{item.protocol_dose != null ? `${item.protocol_dose} ${item.protocol_dose_unit ?? ""}`.trim() : "—"}</td>
<td className="py-2 whitespace-nowrap">{item.administration_route ?? "—"}</td>
<td className="py-2 whitespace-nowrap">{item.dilution_volume ?? "—"}</td>
<td className="py-2 whitespace-nowrap text-right"><StatusBadge>{item.drug_role || "ORDERED"}</StatusBadge></td>
</tr>
))
)}
</tbody>
</table>
</div>
</div>
<div className="bg-white rounded-[16px] shadow-sm border border-[#e2e8f0] overflow-hidden">
<div className="px-5 py-4 border-b border-[#e2e8f0] flex items-center text-emerald-600">
<i className="fa-solid fa-heart-pulse mr-2"></i>
<h4 className="text-sm font-bold">Supportive Medicines</h4>
</div>
<div className="p-5">
<table className="w-full text-left text-sm">
<thead>
<tr className="text-[10px] text-[#64748b] uppercase border-b border-slate-100">
<th className="pb-2 font-semibold w-8">#</th>
<th className="pb-2 font-semibold">DRUG</th>
<th className="pb-2 font-semibold">DOSE</th>
<th className="pb-2 font-semibold">ROUTE</th>
<th className="pb-2 font-semibold">TIMING</th>
<th className="pb-2 font-semibold text-right">STATUS</th>
</tr>
</thead>
<tbody>
{supportiveItems.length === 0 ? (
<tr>
<td colSpan={6} className="py-6 text-center text-xs text-[#64748b]">No supportive medicines found.</td>
</tr>
) : (
supportiveItems.map((item, index) => (
<tr key={item.chemotherapy_plan_item_id} className="border-b border-slate-50 last:border-0">
<td className="py-2 whitespace-nowrap">{index + 1}</td>
<td className="py-2 font-medium text-[#1e293b] whitespace-nowrap">{chemoPlanItemName(item) || "—"}</td>
<td className="py-2 whitespace-nowrap">{item.protocol_dose != null ? `${item.protocol_dose} ${item.protocol_dose_unit ?? ""}`.trim() : "—"}</td>
<td className="py-2 whitespace-nowrap">{item.administration_route ?? "—"}</td>
<td className="py-2 whitespace-nowrap">{item.frequency ?? item.remarks ?? "—"}</td>
<td className="py-2 whitespace-nowrap text-right"><StatusBadge>{item.drug_role || "SUPPORTIVE"}</StatusBadge></td>
</tr>
))
)}
</tbody>
</table>
</div>
</div>
<div className="bg-white rounded-[16px] shadow-sm border border-[#e2e8f0] overflow-hidden">
<div className="px-5 py-4 border-b border-[#e2e8f0] flex items-center text-orange-500">
<i className="fa-solid fa-capsules mr-2"></i>
<h4 className="text-sm font-bold">Discharge Medication</h4>
</div>
<div className="p-5">
<table className="w-full text-left text-sm">
<thead>
<tr className="text-[10px] text-[#64748b] uppercase border-b border-slate-100">
<th className="pb-2 font-semibold w-8">#</th>
<th className="pb-2 font-semibold">DRUG</th>
<th className="pb-2 font-semibold">DOSE</th>
<th className="pb-2 font-semibold">FREQUENCY</th>
<th className="pb-2 font-semibold">INSTRUCTION</th>
<th className="pb-2 font-semibold text-right">DURATION</th>
</tr>
</thead>
<tbody>
{orderDischargeMedsLoading ? (
<tr>
<td colSpan={6} className="py-6 text-center text-xs text-[#64748b]"><i className="fa-solid fa-circle-notch fa-spin mr-2"></i>Loading discharge medicines…</td>
</tr>
) : orderDischargeMedsError ? (
<tr>
<td colSpan={6} className="py-6 text-center text-xs text-red-500"><i className="fa-solid fa-triangle-exclamation mr-2"></i>{orderDischargeMedsError}</td>
</tr>
) : orderDischargeMeds.length === 0 ? (
<tr>
<td colSpan={6} className="py-6 text-center text-xs text-[#64748b]">{savedPlan?.source_protocol_id ? "No discharge medicines recorded on this patient's regimen protocol yet." : "No regimen protocol linked to this patient's plan yet."}</td>
</tr>
) : (
orderDischargeMeds.map((item, index) => (
<tr key={item.discharge_instruction_id ?? `${item.protocol_id}-${item.drug_sequence ?? index}`} className="border-b border-slate-50 last:border-0">
<td className="py-2">{index + 1}</td>
<td className="py-2 font-medium text-[#1e293b] whitespace-nowrap">{item.medicine_master?.medicine_name ?? "—"}</td>
<td className="py-2 whitespace-nowrap">{item.patient_dose != null && item.patient_dose !== "" ? `${item.patient_dose} ${item.patient_dose_unit ?? item.medicine_master?.unit ?? ""}`.trim() : "—"}</td>
<td className="py-2 whitespace-nowrap">{item.frequency || "—"}</td>
<td className="py-2 text-xs text-[#64748b]">{item.administration_detail || item.comment || "—"}</td>
<td className="py-2 whitespace-nowrap text-right">{item.duration || "—"}</td>
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
<div className="mt-6 bg-white rounded-[16px] shadow-sm border border-[#e2e8f0] p-6 flex justify-between items-start">
<div>
<div className="flex items-center text-[#1d4ed8] mb-4">
<i className="fa-regular fa-file-lines mr-2"></i>
<h4 className="text-sm font-bold">Instructions</h4>
</div>
<p className="text-sm text-[#64748b] mb-3">Administration instructions from the selected regimen protocol:</p>
{adminInstructions.length === 0 ? (
<ul className="space-y-2 text-sm text-[#1e293b] font-medium list-disc list-inside">
<li>No instructions recorded.</li>
</ul>
) : (
<ul className="space-y-3 text-sm text-[#1e293b]">
{adminInstructions.map((instruction, index) => (
<li key={index} className="border border-slate-100 rounded-[12px] p-3">
<div className="flex items-start justify-between gap-3">
<span className="font-bold text-[#1e293b]">{instruction.medicineName || `Item ${index + 1}`}</span>
{instruction.dose ? (
<span className="text-xs text-[#64748b] whitespace-nowrap">{instruction.dose}</span>
) : null}
</div>
{(instruction.route || instruction.infusion || instruction.frequency || instruction.timing) ? (
<div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#64748b]">
{instruction.route ? <span>Route: {instruction.route}</span> : null}
{instruction.infusion ? <span>Infusion: {instruction.infusion}</span> : null}
{instruction.frequency ? <span>Frequency: {instruction.frequency}</span> : null}
{instruction.timing ? <span>Timing: {instruction.timing}</span> : null}
</div>
) : null}
{instruction.administrationDetail ? (
<p className="mt-1.5 text-xs text-[#475569]">{instruction.administrationDetail}</p>
) : null}
{instruction.remarks ? (
<p className="mt-1.5 text-xs italic text-[#64748b]">{instruction.remarks}</p>
) : null}
</li>
))}
</ul>
)}
<a className="inline-block mt-4 text-sm font-semibold text-[#1d4ed8] underline" href="#">Investigation for Next Cycle: —</a>
</div>
<div className="bg-slate-50 border border-slate-200 rounded-[12px] p-5 flex flex-col items-center justify-center w-[160px] h-full">
<div className="text-[10px] text-[#1d4ed8] font-bold uppercase tracking-wider mb-2">NEXT CYCLE</div>
<div className="flex items-center text-sm font-bold text-[#1d4ed8]">
<i className="fa-regular fa-calendar mr-2"></i> —
              </div>
</div>
</div>
{/* END: Instructions Card */}
</>
  );
};

export default OrderSummaryTab;
