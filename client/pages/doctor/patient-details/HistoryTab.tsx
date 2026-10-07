import React, { useEffect, useMemo, useRef, useState } from "react";
import API, { getActiveBranchId } from "../../../api/axios";
import { encounterApi, type EncounterRecord } from "../../../api/encounter.api";
import { getUser } from "../../../utils/token";
import { chemoPlanCurrentItems, chemoPlanItemName } from "../../../api/chemotherapy.api";
import { generatePrescriptionPdf } from "../../../utils/prescriptionPdf";
import { BellNotificationButton } from "@/components/hms/BellNotificationButton";
import {
  LineChart,
  Grid as ChartGrid,
  XAxis as ChartXAxis,
  YAxis as ChartYAxis,
  Line as ChartLine,
  Tooltip as ChartTooltip,
  ReferenceBand as ChartReferenceBand,
} from "@/components/hms/LineChart";
import type {
  SummaryPlanItem,
  SummaryPlan,
  StagingDetailRecord,
  ChemoCycleDetail,
} from "./types";
import {
  loadLatestChemoPlan,
  loadCycleDetail,
  loadCyclesForPlan,
  loadAllPlansForPatient,
} from "./api";
import { useLatestPatientVitals } from "./hooks";
import { consultationNotesOf } from "../consultation/helpers";

/* ============================================================
   HISTORY TAB
   The patient's treatment history: every cycle of the chemotherapy
   plan with its medicines, vitals and adverse events, and past
   prescriptions. `embedded` renders it inside the patient details
   page; without it, it renders as a full page.
   ============================================================ */

/* One visit of the Patient 360 history: an oncology diagnosis visit (its
   staging detail) or an outpatient consultation (what the doctor recorded
   in the Consultation tab). `date` is the visit date. */
type Patient360Visit = {
  key: string;
  date: string;
  staging: StagingDetailRecord | null;
  consultation: {
    chiefComplaint: string;
    consultationNotes: string;
    clinicalFindings: string;
    discussion: string;
  } | null;
};

/* A saved Investigation Results value (patient_investigation_result, from
   the Diagnosis tab) with its test and the test's cancer type. */
type InvestigationResultRow = {
  investigation_result_id: string;
  encounter_no: string;
  parameter_id: string;
  report_date: string;
  value_text: string;
  value_numeric: string | number | null;
  is_abnormal: boolean;
  investigation_parameter?: {
    parameter_id: string;
    parameter_name: string;
    chart_name: string;
    input_type: string;
    unit: string | null;
    normal_min: string | number | null;
    normal_max: string | number | null;
    range_label: string | null;
    display_order: number | null;
    cancer_type_id: string;
    cancer_types?: { cancer_type_id: string; cancer_type: string } | null;
  } | null;
};

/* Treatment Trend: one reading of a test, one test's series, and a cancer
   type's tests. */
type TrendPoint = { date: Date; value: number; status: "High" | "Low" | null };
type TrendChart = {
  parameterId: string;
  name: string;
  chartName: string;
  unit: string | null;
  rangeLabel: string | null;
  min: number | null;
  max: number | null;
  order: number;
  points: TrendPoint[];
};
type TrendGroup = { cancerTypeId: string; cancerType: string; charts: TrendChart[] };

const TREND_LINE_COLOR = "#004785";
const TREND_OUT_OF_RANGE_COLOR = "#DC2626";

const toNumberOrNull = (value: string | number | null | undefined) =>
  value === null || value === undefined || value === "" || !Number.isFinite(Number(value))
    ? null
    : Number(value);

/* The patient's number tests as one series each (oldest reading first),
   grouped per cancer type: the diagnosis's primary cancer type first,
   then the others by name. */
function buildTreatmentTrends(
  rows: InvestigationResultRow[],
  primaryCancerTypeId?: string | null
): TrendGroup[] {
  const groups = new Map<string, TrendGroup>();

  for (const row of rows) {
    const parameter = row.investigation_parameter;
    const value = toNumberOrNull(row.value_numeric);
    if (!parameter || parameter.input_type !== "NUMBER" || value === null) continue;
    const date = new Date(row.report_date);
    if (Number.isNaN(date.getTime())) continue;

    const cancerTypeId = parameter.cancer_type_id;
    const group = groups.get(cancerTypeId) ?? {
      cancerTypeId,
      cancerType: parameter.cancer_types?.cancer_type || "Cancer type",
      charts: [],
    };
    groups.set(cancerTypeId, group);

    let chart = group.charts.find((item) => item.parameterId === parameter.parameter_id);
    if (!chart) {
      chart = {
        parameterId: parameter.parameter_id,
        name: parameter.parameter_name,
        chartName: parameter.chart_name,
        unit: parameter.unit,
        rangeLabel: parameter.range_label,
        min: toNumberOrNull(parameter.normal_min),
        max: toNumberOrNull(parameter.normal_max),
        order: parameter.display_order ?? 0,
        points: [],
      };
      group.charts.push(chart);
    }

    chart.points.push({
      date,
      value,
      status:
        chart.max !== null && value > chart.max
          ? "High"
          : chart.min !== null && value < chart.min
            ? "Low"
            : null,
    });
  }

  const list = [...groups.values()];
  list.forEach((group) => {
    group.charts.forEach((chart) => chart.points.sort((a, b) => a.date.getTime() - b.date.getTime()));
    group.charts.sort(
      (a, b) => a.chartName.localeCompare(b.chartName) || a.order - b.order
    );
  });
  return list.sort((a, b) => {
    if (a.cancerTypeId === primaryCancerTypeId) return -1;
    if (b.cancerTypeId === primaryCancerTypeId) return 1;
    return a.cancerType.localeCompare(b.cancerType);
  });
}

const formatTrendValue = (value: number) =>
  value.toLocaleString(undefined, { maximumFractionDigits: 2 });
const formatTrendDate = (date: Date) =>
  date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });

/* Where the latest reading sits against the normal range - an icon and a
   word with the color, never the color alone. */
function TrendStatusChip({ status, hasRange }: { status: TrendPoint["status"]; hasRange: boolean }) {
  if (!hasRange) return null;
  return status ? (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 ring-1 ring-inset ring-red-200">
      <i className={`fa-solid ${status === "High" ? "fa-arrow-up" : "fa-arrow-down"} text-[10px]`} />
      {status === "High" ? "Above normal" : "Below normal"}
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
      <i className="fa-solid fa-check text-[10px]" />
      Within range
    </span>
  );
}

/* One test's trend: the latest value with its change since the previous
   reading, a smooth line over the visits with the normal range shaded and
   out-of-range readings marked, and the values as a table. */
function TrendChartCard({ chart }: { chart: TrendChart }) {
  const [showValues, setShowValues] = useState(false);
  const latest = chart.points[chart.points.length - 1];
  const previous = chart.points.length > 1 ? chart.points[chart.points.length - 2] : null;
  const delta = previous ? latest.value - previous.value : null;
  const hasRange = chart.min !== null || chart.max !== null;
  const rangeText =
    chart.rangeLabel ||
    (chart.min !== null && chart.max !== null
      ? `${chart.min}–${chart.max}`
      : chart.min !== null
        ? `≥${chart.min}`
        : chart.max !== null
          ? `≤${chart.max}`
          : null);
  const unitSuffix = chart.unit ? ` ${chart.unit}` : "";

  /* Keep the normal limits in view, and start non-negative markers at 0. */
  const include = [chart.min, chart.max].filter((value): value is number => value !== null);
  if (Math.min(...chart.points.map((point) => point.value), ...include) >= 0) include.push(0);

  const rows = chart.points.map((point) => ({
    date: point.date,
    value: point.value,
    status: point.status,
  }));

  return (
    <div className="flex flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="truncate text-sm font-bold text-gray-900">{chart.name} Trend</h4>
          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-gray-500">
            {rangeText && (
              <>
                {/* Key for the shaded normal band in the chart. */}
                <span
                  aria-hidden="true"
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm bg-[#00A87E]/15 ring-1 ring-inset ring-[#00A87E]/60"
                />
                <span className="shrink-0">Normal {rangeText}</span>
                <span aria-hidden="true">·</span>
              </>
            )}
            <span className="truncate">{chart.chartName}</span>
          </p>
        </div>
        <TrendStatusChip status={latest.status} hasRange={hasRange} />
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-2xl font-semibold text-gray-900">{formatTrendValue(latest.value)}</span>
        {chart.unit && <span className="text-sm font-medium text-gray-500">{chart.unit}</span>}
        {delta !== null && previous && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500">
            <i
              className={`fa-solid ${
                delta > 0 ? "fa-arrow-trend-up" : delta < 0 ? "fa-arrow-trend-down" : "fa-minus"
              } text-[11px]`}
            />
            {delta > 0 ? "+" : ""}
            {formatTrendValue(delta)} since {formatTrendDate(previous.date)}
          </span>
        )}
      </div>

      <div className="mt-2">
        <LineChart
          data={rows}
          x="date"
          height={200}
          margin={{ top: 14, right: 40, bottom: 30, left: 44 }}
          yInclude={include}
        >
          <ChartGrid />
          <ChartReferenceBand from={chart.min} to={chart.max} />
          <ChartXAxis maxTicks={6} />
          <ChartYAxis />
          <ChartLine
            y="value"
            name={chart.name}
            color={TREND_LINE_COLOR}
            strokeWidth={2}
            curve="smooth"
            area={!hasRange}
            areaOpacity={0.12}
            markerRadius={4}
            pointColor={(row) => (row.status ? TREND_OUT_OF_RANGE_COLOR : undefined)}
          />
          <ChartTooltip
            formatY={(value) => `${formatTrendValue(value)}${unitSuffix}`}
            detail={(row) =>
              row.status
                ? `${row.status} - outside the normal range`
                : hasRange
                  ? "Within the normal range"
                  : null
            }
          />
        </LineChart>
        {chart.points.length === 1 && (
          <p className="text-center text-xs text-gray-400">The trend line appears after the next reading.</p>
        )}
      </div>

      <button
        type="button"
        onClick={() => setShowValues((open) => !open)}
        aria-expanded={showValues}
        className="mt-2 self-start text-xs font-semibold text-[#004785] hover:underline focus:outline-none focus-visible:underline"
      >
        {showValues ? "Hide values" : `Show values (${chart.points.length})`}
      </button>
      {showValues && (
        <table className="mt-2 w-full text-left text-xs">
          <thead>
            <tr className="border-b border-gray-100 text-gray-500">
              <th className="py-1.5 pr-3 font-semibold">Report date</th>
              <th className="py-1.5 pr-3 text-right font-semibold">Value</th>
              <th className="py-1.5 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {[...chart.points].reverse().map((point, index) => (
              <tr key={`${point.date.getTime()}-${index}`}>
                <td className="py-1.5 pr-3 text-gray-700">{formatTrendDate(point.date)}</td>
                <td
                  className="py-1.5 pr-3 text-right font-semibold text-gray-900"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {formatTrendValue(point.value)}
                  {unitSuffix}
                </td>
                <td className={`py-1.5 ${point.status ? "font-semibold text-red-700" : "text-gray-500"}`}>
                  {point.status ? `${point.status}` : hasRange ? "Normal" : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const HistoryTab: React.FC<{
  embedded?: boolean;
  patientId?: string;
  initialPlan?: SummaryPlan | null;
}> = ({ embedded = false, patientId: propPatientId, initialPlan }) => {
  const patientId = propPatientId || '';
  const [plan, setPlan] = useState<SummaryPlan | null>(initialPlan ?? null);
  const [cycleDetails, setCycleDetails] = useState<ChemoCycleDetail[]>([]);
  const [regimenProtocol, setRegimenProtocol] = useState<any>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [prescriptionsLoading, setPrescriptionsLoading] = useState(false);
  const [prescriptionsError, setPrescriptionsError] = useState("");
  const [selectedPrescription, setSelectedPrescription] = useState<any | null>(null);
  const [prescriptionIndex, setPrescriptionIndex] = useState<number | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const { vitals: patientVitals } = useLatestPatientVitals(patientId);
  const [timelineViewMode, setTimelineViewMode] = useState<"one-by-one" | "list">("one-by-one");
  const [activeCycleIndex, setActiveCycleIndex] = useState<number>(0);
  const [barTooltip, setBarTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [activeVitalChart, setActiveVitalChart] = useState<
    "weight" | "bp" | "pulse" | "temp" | "painscore"
  >("weight");
  const timelineScrollRef = useRef<HTMLDivElement>(null);

  /* Patient 360: the patient's visits - every saved staging detail
     (GET /oncology/staging-details?patient_id=, newest visit first) and
     the recent encounters (GET /encounters/latest) for the outpatient
     consultations. The latest visit is shown on the card; the popup lists
     all of them oldest first. */
  const [stagingDetails, setStagingDetails] = useState<StagingDetailRecord[]>([]);
  const [visitEncounters, setVisitEncounters] = useState<EncounterRecord[]>([]);
  const [stagingDetailsLoading, setStagingDetailsLoading] = useState(false);
  const [stagingHistoryOpen, setStagingHistoryOpen] = useState(false);
  const stagingHistoryScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!patientId) return;
    let cancelled = false;
    setStagingDetailsLoading(true);
    const branchId = getActiveBranchId() ?? getUser()?.branch_id ?? undefined;

    const attempts: { params: Record<string, unknown> }[] = [
      { params: { patient_id: patientId, limit: 100, branchId } },
      { params: { patient_id: patientId, limit: 100 } },
    ];

    const loadStaging = async (): Promise<StagingDetailRecord[]> => {
      for (const attempt of attempts) {
        try {
          const res = await API.get<{
            success: boolean;
            data: StagingDetailRecord[];
          }>("/oncology/staging-details", attempt);
          const rows = res.data?.data ?? [];
          /* An empty body is not proof of absence: the branch-scoped
             attempt filters by the caller's active branch, so rows saved
             under a different branch legitimately come back empty. Fall
             through to the branchless attempt before declaring none. */
          if (rows.length === 0) continue;
          return rows;
        } catch (err: any) {
          const message =
            err?.response?.data?.message || err?.message || "";
          const isScopeBlock = /select a branch|branch has been assigned/i.test(
            message
          );
          if (isScopeBlock) continue;
          console.warn("Failed to load Patient 360 staging history:", err);
          return [];
        }
      }
      return [];
    };

    /* Recent visits, newest first (branch-independent on the backend). */
    const loadEncounters = encounterApi
      .getLatest(patientId, 50)
      .then((res) => res.data?.data?.encounters ?? [])
      .catch((err) => {
        console.warn("Failed to load Patient 360 visits:", err);
        return [] as EncounterRecord[];
      });

    Promise.all([loadStaging(), loadEncounters])
      .then(([rows, encounters]) => {
        if (cancelled) return;
        setStagingDetails(rows);
        setVisitEncounters(encounters);
      })
      .finally(() => {
        if (!cancelled) setStagingDetailsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [patientId]);

  /* One entry per visit, oldest first, dated by the visit date:
     - a visit (encounter) with a staging detail is an oncology diagnosis
       visit - Diagnosis name, Notes, Disease Status;
     - a visit without one is an outpatient consultation - Chief
       Complaint, Consultation Notes, Clinical Findings, Discussion -
       listed when any of those was recorded;
     - a staging detail not linked to a loaded visit (saved before visits
       were linked) is its own visit. */
  const patient360Visits: Patient360Visit[] = (() => {
    const loadedVisits = new Set(visitEncounters.map((encounter) => encounter.encounter_no));
    const stagingByVisit = new Map(
      stagingDetails
        .filter((record) => record.encounter_no)
        .map((record) => [record.encounter_no as string, record])
    );

    const encounterVisits = visitEncounters.flatMap((encounter): Patient360Visit[] => {
      const staging = stagingByVisit.get(encounter.encounter_no) ?? null;
      if (staging) {
        return [{
          key: encounter.encounter_no,
          date: staging.visit_date || encounter.encounter_ts || encounter.created_at || "",
          staging,
          consultation: null,
        }];
      }
      const consultation = {
        chiefComplaint: (encounter.chief_complaint ?? "").trim(),
        consultationNotes: consultationNotesOf(encounter.clinical_notes),
        clinicalFindings: (encounter.clinical_findings ?? "").trim(),
        discussion: (encounter.notes ?? "").trim(),
      };
      if (!Object.values(consultation).some(Boolean)) return [];
      return [{
        key: encounter.encounter_no,
        date: encounter.encounter_ts || encounter.created_at || "",
        staging: null,
        consultation,
      }];
    });

    const unlinkedStaging = stagingDetails
      .filter((record) => !record.encounter_no || !loadedVisits.has(record.encounter_no))
      .map((record): Patient360Visit => ({
        key: record.staging_detail_id || `${record.visit_date}-${record.created_at}`,
        date: record.visit_date || record.created_at || "",
        staging: record,
        consultation: null,
      }));

    const time = (value: string) => {
      const t = new Date(value).getTime();
      return Number.isNaN(t) ? 0 : t;
    };
    return [...encounterVisits, ...unlinkedStaging].sort(
      (a, b) => time(a.date) - time(b.date)
    );
  })();
  const latestVisit = patient360Visits[patient360Visits.length - 1] ?? null;

  /* Default focus on the most recent record when the popup opens: the list is
     ascending so the newest card sits at the bottom - scroll it into view. */
  useEffect(() => {
    if (!stagingHistoryOpen) return;
    const el = stagingHistoryScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [stagingHistoryOpen, stagingDetails, visitEncounters]);

  useEffect(() => {
    const protocolId = plan?.source_protocol_id;
    if (!protocolId) {
      setRegimenProtocol(null);
      return;
    }
    let cancelled = false;
    API.get(`/chemotherapy/regimen-protocols/${encodeURIComponent(protocolId)}`)
      .then((res) => {
        if (!cancelled) {
          setRegimenProtocol(res.data?.data ?? null);
        }
      })
      .catch((err) => {
        console.warn("Failed to load regimen protocol in HistoryTab:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [plan?.source_protocol_id]);


  /* Real treatment history for THIS selected patient:
      latest chemo plan (GET /chemotherapy/plans?patient_id=) plus
      each cycle's recorded vitals + adverse events
      (GET /chemotherapy/cycles/:id). */
  const buildPrescriptionData = (p: any): any => {
    return {
      prescription_id: p.prescription_id,
      prescription_date: p.prescription_date,
      advice: p.advice,
      patient_history: {
        patient_first_name: p.patient_history?.patient_bio_data?.patient_first_name || '',
        patient_last_name: p.patient_history?.patient_bio_data?.patient_last_name || '',
        patient_id: p.patient_history?.patient_bio_data?.patient_id || '',
        patient_display_id: p.patient_history?.patient_bio_data?.patient_id || '',
      },
      employees: {
        first_name: p.employees?.first_name || '',
        last_name: p.employees?.last_name || '',
        specialization: p.employees?.specialization || '',
      },
      patient_vitals: null,
      patient_allergies: null,
      patient_symptoms: null,
      prescription_items: (p.prescription_items || []).map((it: any) => ({
        medicine_name: it.medicine_master?.medicine_name || it.drug_name || '',
        medicine_master: it.medicine_master,
        dosage: it.dosage,
        unit: it.unit,
        route: it.route,
        frequency: it.frequency,
        instruction: it.instruction,
        drug_role: it.drug_role,
      })),
    };
  };

  const openPrescriptionPdf = async (p: any, index: number) => {
    try {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      const patientId = p.patient_history?.patient_bio_data?.patient_id;
      const prescriptionDate = p.prescription_date;
      let vitals = null;
      let allergies = null;
      let symptoms = null;
      if (patientId) {
        try {
          // Fetch latest encounter for patient and pick one matching prescription date
          const encRes = await API.get('/encounters/latest', { params: { patientId, limit: 10 } });
          const encounters = encRes.data?.data?.encounters || encRes.data?.encounters || encRes.data || [];
          const targetDate = prescriptionDate ? new Date(prescriptionDate).toISOString().slice(0,10) : null;
          const enc = encounters.find((e:any) => {
            const eDate = e.encounter_ts ? new Date(e.encounter_ts).toISOString().slice(0,10) : null;
            return !targetDate || eDate === targetDate;
          }) || encounters[0];
          if (enc) {
            vitals = {
              bp: enc.systolic_bp && enc.diastolic_bp ? `${enc.systolic_bp}/${enc.diastolic_bp}` : enc.bp || '',
              pulse: enc.pulse,
              temperature: enc.temperature,
              weight: enc.weight,
              height: enc.height,
              spo2: enc.spo2,
            };
            // Fetch allergies
            try {
              const allergyRes = await API.get(`/clinical-details/patients/${patientId}/allergies`);
              allergies = allergyRes.data?.data || [];
            } catch {}
            // Fetch encounter symptoms if encounterNo exists
            if (enc.encounter_no) {
              try {
                const symRes = await API.get(`/clinical-details/encounters/${enc.encounter_no}`);
                const complete = symRes.data?.data || {};
                symptoms = complete.symptoms || symRes.data?.data?.symptoms || [];
              } catch {}
            }
          }
        } catch (e) {
          console.warn('Vitals fetch failed', e);
        }
      }
      const data = buildPrescriptionData(p);
      data.patient_vitals = vitals;
      data.patient_allergies = allergies;
      data.patient_symptoms = symptoms;
      const { url } = await generatePrescriptionPdf(data as any);
      setSelectedPrescription(p);
      setPrescriptionIndex(index);
      setPdfUrl(url);
    } catch (e) {
      console.error('Failed to generate PDF', e);
    }
  };

  const closePdfModal = () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl(null);
    setSelectedPrescription(null);
    setPrescriptionIndex(null);
  };

  useEffect(() => {
    const resolvedPid = patientId || propPatientId || localStorage.getItem("hms_last_patient_id") || "";
    if (!resolvedPid) {
      setPlan(null);
      setCycleDetails([]);
      setHistoryError(
        "No patient selected. Open this page from a patient consultation to load history."
      );
      return;
    }
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError("");

    const fetchChemoHistory = async () => {
      try {
        // 1. Fetch latest chemotherapy plan and all patient plans
        let activePlan: SummaryPlan | null = null;
        try {
          activePlan = await loadLatestChemoPlan(resolvedPid);
        } catch (err) {
          console.warn("loadLatestChemoPlan failed, trying all plans listing", err);
        }

        const patientPlans = await loadAllPlansForPatient(resolvedPid);
        if (!activePlan && patientPlans.length > 0) {
          activePlan = patientPlans[0];
        }
        if (!activePlan && initialPlan) {
          activePlan = initialPlan;
        }

        // 2. Fetch all recorded chemotherapy cycles from backend
        const allCycles: ChemoCycleDetail[] = [];
        const planIds = new Set<string>();
        if (activePlan?.chemotherapy_plan_id) {
          planIds.add(activePlan.chemotherapy_plan_id);
        }
        if (initialPlan?.chemotherapy_plan_id) {
          planIds.add(initialPlan.chemotherapy_plan_id);
        }
        patientPlans.forEach((p) => {
          if (p?.chemotherapy_plan_id) planIds.add(p.chemotherapy_plan_id);
        });

        for (const pid of planIds) {
          const cycles = await loadCyclesForPlan(pid);
          if (cycles.length > 0) {
            allCycles.push(...cycles);
          }
        }

        // Also fetch individual cycle details for any cycles referenced in activePlan or initialPlan
        const fetchedIds = new Set(allCycles.map((c) => c.chemotherapy_cycle_id).filter(Boolean));
        const combinedRefCycles = [
          ...(activePlan?.chemotherapy_cycle ?? []),
          ...(initialPlan?.chemotherapy_cycle ?? []),
        ];
        const extraCycles = combinedRefCycles.filter(
          (c) => c.chemotherapy_cycle_id && !fetchedIds.has(c.chemotherapy_cycle_id)
        );

        if (extraCycles.length > 0) {
          const loadedExtra = await Promise.all(
            extraCycles.map((c) =>
              loadCycleDetail(c.chemotherapy_cycle_id as string).catch(() => null)
            )
          );
          allCycles.push(...loadedExtra.filter((d): d is ChemoCycleDetail => d !== null));
        }

        // Deduplicate cycles by cycle ID or cycle number
        const dedupedMap = new Map<string, ChemoCycleDetail>();
        allCycles.forEach((c) => {
          const key = c.chemotherapy_cycle_id || `cycle-${c.cycle_number}`;
          if (!dedupedMap.has(key)) {
            dedupedMap.set(key, c);
          }
        });
        const finalCycles = Array.from(dedupedMap.values()).sort(
          (a, b) => (a.cycle_number ?? 0) - (b.cycle_number ?? 0)
        );

        if (cancelled) return;

        // 3. Update plan with fully fetched cycle records
        if (activePlan) {
          const formattedCycles = finalCycles.map((c) => ({
            chemotherapy_cycle_id: c.chemotherapy_cycle_id,
            cycle_number: c.cycle_number,
            cycle_day: c.cycle_day,
            planned_date: c.planned_date,
            actual_date: c.actual_date,
            next_cycle_date: c.next_cycle_date,
            cycle_status: c.cycle_status,
            completion_status: c.completion_status,
            remarks: c.remarks,
          }));

          setPlan({
            ...activePlan,
            chemotherapy_cycle:
              formattedCycles.length > 0
                ? formattedCycles
                : activePlan.chemotherapy_cycle ?? [],
          });
        } else {
          setPlan(null);
        }

        setCycleDetails(finalCycles);
      } catch (err: any) {
        if (!cancelled) {
          setHistoryError(err?.message || "Failed to load treatment history.");
        }
      } finally {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      }
    };

    fetchChemoHistory();
    return () => {
      cancelled = true;
    };
  }, [patientId, initialPlan]);

  useEffect(() => {
    if (!patientId) {
      setPrescriptions([]);
      setPrescriptionsError("");
      return;
    }
    let cancelled = false;
    setPrescriptionsLoading(true);
    setPrescriptionsError("");
    API.get(`/prescriptions/patient/${patientId}`)
      .then((res) => {
        if (cancelled) return;
        const data = res.data?.data?.prescriptions ?? [];
        setPrescriptions(data);
      })
      .catch((err) => {
        if (!cancelled) setPrescriptionsError(err?.response?.data?.message || "Failed to load prescriptions");
      })
      .finally(() => {
        if (!cancelled) setPrescriptionsLoading(false);
      });
    return () => { cancelled = true; };
  }, [patientId]);

  // Auto-load first prescription when list arrives
  useEffect(() => {
    if (prescriptions.length > 0 && prescriptionIndex === null) {
      openPrescriptionPdf(prescriptions[0], 0);
    }
    // Reset when patient changes
    if (prescriptions.length === 0) {
      closePdfModal();
    }
  }, [prescriptions]);

  const fmtHistoryDate = (value?: string | null) => {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return `${String(d.getDate()).padStart(2, "0")}-${String(
      d.getMonth() + 1
    ).padStart(2, "0")}-${d.getFullYear()}`;
  };

  const stagingDiagnosisName = (record: StagingDetailRecord) =>
    record.histopathology ||
    record.cancer_subtypes?.subtype_name ||
    record.pre_diagnosis ||
    record.cancer_types?.cancer_type ||
    "—";

  /* A Patient 360 card row: icon, label and value. */
  const renderPatient360Row = (
    icon: string,
    tone: string,
    label: string,
    value: string,
    strong = false
  ) => (
    <div className="flex items-start">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mr-3 ${tone}`}>
        <i className={`${icon} text-sm`} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">
          {label}
        </p>
        <p className={strong ? "font-semibold text-gray-800" : "text-gray-700 line-clamp-3 whitespace-pre-line"}>
          {value}
        </p>
      </div>
    </div>
  );

  /* A labelled line of a visit in the history popup. */
  const renderVisitField = (label: string, value: string, strong = false) => (
    <div className="flex">
      <span className="w-36 shrink-0 text-[11px] uppercase tracking-wide text-gray-400 font-semibold pt-0.5">
        {label}
      </span>
      <span className={strong ? "font-semibold text-gray-800" : "text-gray-700 whitespace-pre-line"}>
        {value || "—"}
      </span>
    </div>
  );

  const planCyclesSorted = [...(plan?.chemotherapy_cycle ?? [])].sort(
    (a, b) =>
      (b.planned_date ?? "").localeCompare(a.planned_date ?? "") ||
      b.cycle_number - a.cycle_number
  );

  const currentCycleInfo = (() => {
    if (!plan?.treatment_start_date || !plan?.cycle_interval_days) return null;
    const start = new Date(plan.treatment_start_date);
    if (Number.isNaN(start.getTime())) return null;
    const interval = plan.cycle_interval_days || 1;
    const planned = plan.planned_cycles || 1;
    const daysElapsed = Math.floor(
      (Date.now() - start.getTime()) / 86400000,
    );
    let cycle = daysElapsed < 0 ? 1 : Math.floor(daysElapsed / interval) + 1;
    if (planned > 0 && cycle > planned) cycle = planned;
    // Day-within-current-cycle: 1-based offset from this cycle's start,
    // clamped to at least 1 (also valid pre-treatment).
    const cycleStartOffset = (cycle - 1) * interval;
    const day =
      daysElapsed < cycleStartOffset
        ? 1
        : (daysElapsed - cycleStartOffset) % interval + 1;
    const d = new Date(start);
    d.setDate(d.getDate() + cycleStartOffset);
    return { cycle, day, date: fmtHistoryDate(d.toISOString()) };
  })();

  /* Cycle-history table rows: agent/dose come from the plan's
     PRIMARY items (or all items if not tagged); outcome is the real cycle_status. */
  const planDrugItems = chemoPlanCurrentItems<SummaryPlanItem>(plan);
  const primaryPlanItems = planDrugItems.filter(
    (item) => (item.drug_role ?? "").toUpperCase() === "PRIMARY"
  );
  const relevantPlanItems =
    primaryPlanItems.length > 0
      ? primaryPlanItems
      : planDrugItems;

  const cyclesToDisplay =
    planCyclesSorted.length > 0
      ? [...planCyclesSorted].sort((a, b) => a.cycle_number - b.cycle_number)
      : plan?.planned_cycles
      ? Array.from({ length: plan.planned_cycles }, (_, idx) => {
          const cNum = idx + 1;
          const interval = plan?.cycle_interval_days || 21;
          const start = plan?.treatment_start_date ? new Date(plan.treatment_start_date) : null;
          let pDate: string | null = null;
          if (start && !Number.isNaN(start.getTime())) {
            const d = new Date(start);
            d.setDate(start.getDate() + idx * interval);
            pDate = d.toISOString();
          }
          return {
            chemotherapy_cycle_id: undefined,
            cycle_number: cNum,
            cycle_day: 1,
            planned_date: pDate,
            actual_date: null,
            next_cycle_date: null,
            cycle_status: "PLANNED",
            completion_status: "PENDING",
            remarks: null,
          };
        })
      : [];

  const cycleHistoryRows = cyclesToDisplay.map((cycle) => {
    const detail = cycleDetails.find(
      (entry) =>
        (entry.chemotherapy_cycle_id &&
          entry.chemotherapy_cycle_id === cycle.chemotherapy_cycle_id) ||
        entry.cycle_number === cycle.cycle_number
    );
    const status = (
      detail?.cycle_status ??
      cycle.cycle_status ??
      "PLANNED"
    ).toUpperCase();

    const plannedDoseStr =
      relevantPlanItems
        .map((item) => {
          const dose = item.protocol_dose ?? item.calculated_dose;
          if (!dose) return null;
          const name = chemoPlanItemName(item);
          const unit = item.protocol_dose_unit || item.calculated_dose_unit || "";
          return relevantPlanItems.length > 1 && name
            ? `${name}: ${dose} ${unit}`.trim()
            : `${dose} ${unit}`.trim();
        })
        .filter(Boolean)
        .join("; ") ||
      (relevantPlanItems[0]?.protocol_dose != null
        ? `${relevantPlanItems[0].protocol_dose} ${
            relevantPlanItems[0].protocol_dose_unit ?? ""
          }`.trim()
        : "—");

    const administeredDoseStr = (detail?.chemotherapy_administration ?? [])
      .map((adm: any) => {
        if (adm.administered_dose == null) return null;
        return `${adm.administered_dose} ${adm.administered_dose_unit ?? ""}`.trim();
      })
      .filter(Boolean)
      .join("; ");

    const actualDoseStr =
      administeredDoseStr || relevantPlanItems[0]?.calculated_dose || "—";

    return {
      cycle: `CYCLE ${String(cycle.cycle_number).padStart(2, "0")}`,
      dates: [
        fmtHistoryDate(detail?.planned_date || cycle.planned_date),
        fmtHistoryDate(detail?.actual_date || cycle.actual_date) ||
          fmtHistoryDate(detail?.next_cycle_date || cycle.next_cycle_date),
      ]
        .filter(Boolean)
        .join(" - "),
      agent:
        relevantPlanItems
          .map((item) => chemoPlanItemName(item))
          .filter(Boolean)
          .join(", ") ||
        plan?.regimen_name ||
        "—",
      plannedDose: plannedDoseStr,
      actualDose: actualDoseStr,
      status,
    };
  });

  /* Medication history rows from the plan's saved items. */
  const medicationRows = planDrugItems.map((item) => ({
    medication: chemoPlanItemName(item) || "—",
    start: fmtHistoryDate(plan?.treatment_start_date),
    end:
      (plan?.treatment_status ?? "").toUpperCase() === "COMPLETED"
        ? fmtHistoryDate(plan?.expected_end_date) || "—"
        : "Ongoing",
    dosage:
      item.protocol_dose != null
        ? `${item.protocol_dose} ${item.protocol_dose_unit ?? ""}`.trim()
        : item.formulation || "—",
    route: item.administration_route || "—",
    active:
      (plan?.treatment_status ?? "").toUpperCase() === "COMPLETED"
        ? false
        : true,
  }));

  /* Adverse events aggregated across the fetched cycles. */
  interface AdverseEventRow {
    id: string;
    date: string;
    event: string;
    grade: string;
    action: string;
    outcome: string;
  }
  const adverseEventRows: AdverseEventRow[] = [];
  planCyclesSorted.forEach((cycle) => {
    const detail = cycleDetails.find(
      (entry) => entry.chemotherapy_cycle_id === cycle.chemotherapy_cycle_id
    );
    (detail?.chemotherapy_adverse_event ?? []).forEach((event, idx) => {
      adverseEventRows.push({
        id: event.adverse_event_id ?? `${cycle.chemotherapy_cycle_id}-${idx}`,
        date: fmtHistoryDate(event.event_date),
        event: event.adverse_event_name || "—",
        grade:
          String(
            event.ctcae_grade || event.reaction_grade || event.severity || "—"
          ),
        action:
          event.doctor_action ||
          event.nursing_action ||
          (event.dose_reduced
            ? "Dose reduced"
            : event.dose_delayed
            ? "Dose delayed"
            : event.treatment_interrupted
            ? "Treatment interrupted"
            : "None recorded"),
        outcome: event.treatment_stopped
          ? "STOPPED"
          : event.hospitalization_required
          ? "HOSPITALIZED"
          : "ONGOING",
      });
    });
  });
  adverseEventRows.sort((a, b) => b.date.localeCompare(a.date));

  /* One bar per calendar day — group encounter weights by date, last recorded value per day wins. */
  const weightTrend = (() => {
    const byDay = new Map<string, number>();
    [...visitEncounters]
      .filter((enc) => enc.weight != null && Number(enc.weight) > 0)
      .sort((a, b) =>
        (a.encounter_ts || a.created_at || "").localeCompare(
          b.encounter_ts || b.created_at || ""
        )
      )
      .forEach((enc) => {
        const raw = enc.encounter_ts || enc.created_at || "";
        const day = raw ? raw.slice(0, 10) : "";
        if (day) byDay.set(day, Number(enc.weight));
      });
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, weight]) => ({ date: day, weight }));
  })();
  const weightTrendMax = Math.max(...weightTrend.map((e) => e.weight), 1);
  const weightTrendAvg =
    weightTrend.length > 0
      ? weightTrend.reduce((sum, entry) => sum + entry.weight, 0) /
        weightTrend.length
      : null;

  /* Per-day BP trend */
  const bpTrend = (() => {
    const byDay = new Map<string, { systolic: number; diastolic: number }>();
    [...visitEncounters]
      .filter((enc) => enc.systolic_bp != null && enc.diastolic_bp != null)
      .sort((a, b) => (a.encounter_ts || a.created_at || "").localeCompare(b.encounter_ts || b.created_at || ""))
      .forEach((enc) => {
        const raw = enc.encounter_ts || enc.created_at || "";
        const day = raw ? raw.slice(0, 10) : "";
        if (day) byDay.set(day, { systolic: Number(enc.systolic_bp), diastolic: Number(enc.diastolic_bp) });
      });
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, bp]) => ({ date: day, ...bp }));
  })();

  /* Per-day Pulse trend */
  const pulseTrend = (() => {
    const byDay = new Map<string, number>();
    [...visitEncounters]
      .filter((enc) => enc.pulse != null && Number(enc.pulse) > 0)
      .sort((a, b) => (a.encounter_ts || a.created_at || "").localeCompare(b.encounter_ts || b.created_at || ""))
      .forEach((enc) => {
        const raw = enc.encounter_ts || enc.created_at || "";
        const day = raw ? raw.slice(0, 10) : "";
        if (day) byDay.set(day, Number(enc.pulse));
      });
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, value]) => ({ date: day, value }));
  })();

  /* Per-day Temperature trend */
  const tempTrend = (() => {
    const byDay = new Map<string, number>();
    [...visitEncounters]
      .filter((enc) => enc.temperature != null && Number(enc.temperature) > 0)
      .sort((a, b) => (a.encounter_ts || a.created_at || "").localeCompare(b.encounter_ts || b.created_at || ""))
      .forEach((enc) => {
        const raw = enc.encounter_ts || enc.created_at || "";
        const day = raw ? raw.slice(0, 10) : "";
        if (day) byDay.set(day, Number(enc.temperature));
      });
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, value]) => ({ date: day, value }));
  })();

  /* Per-day Pain score trend (0-10). `pain_score` may arrive as a string. */
  const painTrend = (() => {
    const byDay = new Map<string, number>();
    [...visitEncounters]
      .filter((enc) => enc.pain_score != null && String(enc.pain_score).trim() !== "")
      .sort((a, b) => (a.encounter_ts || a.created_at || "").localeCompare(b.encounter_ts || b.created_at || ""))
      .forEach((enc) => {
        const raw = enc.encounter_ts || enc.created_at || "";
        const day = raw ? raw.slice(0, 10) : "";
        const score = Number(enc.pain_score);
        if (day && !Number.isNaN(score)) byDay.set(day, score);
      });
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, value]) => ({ date: day, value }));
  })();

  const fmtTimelineDate = (value?: string | Date | null): string => {
    if (!value) return "";
    const d = typeof value === "string" ? new Date(value) : value;
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  };

  const historyTimelineRange = (() => {
    const dates = planCyclesSorted
      .map((cycle) => cycle.actual_date || cycle.planned_date)
      .filter(Boolean)
      .sort();

    if (dates.length > 0) {
      const first = fmtTimelineDate(dates[0]);
      const last = fmtTimelineDate(dates[dates.length - 1]);
      return first === last ? first : `${first} - ${last}`;
    }

    if (plan?.treatment_start_date) {
      const d = new Date(plan.treatment_start_date);
      if (!Number.isNaN(d.getTime())) {
        const startMonthYear = d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
        if ((plan?.treatment_status ?? "").toUpperCase() === "COMPLETED" && plan?.expected_end_date) {
          const endD = new Date(plan.expected_end_date);
          const endMonthYear = !Number.isNaN(endD.getTime())
            ? endD.toLocaleDateString("en-GB", { month: "short", year: "numeric" })
            : "";
          return endMonthYear ? `${startMonthYear} - ${endMonthYear}` : `${startMonthYear} - Present`;
        }
        return `${startMonthYear} - Present`;
      }
    }

    return "No treatment dates recorded";
  })();

  /* Timeline entries straight from the patient's plan and saved cycles with clear status categories.
     If a cycle spans multiple days, each day is rendered as its own distinct card
     (e.g., CYCLE 01 DAY 01, CYCLE 01 DAY 02) to provide complete clarity. */
  const timelineItems = (() => {
    if (!plan && planCyclesSorted.length === 0 && !currentCycleInfo) {
      return [];
    }

    const isPlanCompleted =
      (plan?.treatment_status ?? "").toUpperCase() === "COMPLETED" ||
      (plan?.planned_cycles != null &&
        plan?.completed_cycles != null &&
        plan.completed_cycles >= plan.planned_cycles);

    const inProgressCycle = planCyclesSorted.find(
      (c) => (c.cycle_status ?? "").toUpperCase() === "IN_PROGRESS"
    );
    const activeCycleNum = isPlanCompleted
      ? null
      : inProgressCycle
      ? inProgressCycle.cycle_number
      : currentCycleInfo?.cycle ?? (plan?.completed_cycles ? plan.completed_cycles + 1 : 1);

    const maxRecordedCycle = planCyclesSorted.reduce(
      (max, c) => Math.max(max, c.cycle_number || 0),
      0
    );

    const totalCycles = Math.max(
      plan?.planned_cycles || (maxRecordedCycle > 0 ? maxRecordedCycle : 6),
      plan?.completed_cycles || 0,
      maxRecordedCycle,
      activeCycleNum || 0,
      1
    );

    const interval = plan?.cycle_interval_days || 21;
    const startDate = plan?.treatment_start_date ? new Date(plan.treatment_start_date) : null;

    const existingMap = new Map();
    const existingDayMap = new Map();
    planCyclesSorted.forEach((c) => {
      if (c.cycle_number != null) {
        existingMap.set(c.cycle_number, c);
        const dayKey = `${c.cycle_number}-${c.cycle_day ?? 1}`;
        if (!existingDayMap.has(dayKey)) {
          existingDayMap.set(dayKey, c);
        }
      }
    });

    const getDaysForCycle = (cNum: number): number[] => {
      const set = new Set<number>();
      const explicitDays = Number(regimenProtocol?.no_of_days);
      if (Number.isFinite(explicitDays) && explicitDays > 0) {
        for (let d = 1; d <= explicitDays; d++) set.add(d);
      }
      (regimenProtocol?.chemotherapy_regimen_protocol_days ?? []).forEach((d: any) => {
        const num = Number(d.day_number);
        if (Number.isFinite(num) && num > 0) set.add(num);
      });
      (regimenProtocol?.chemotherapy_regimen_protocol_items ?? []).forEach((item: any) => {
        const num = Number(item.administration_day ?? item.cycle_day);
        if (Number.isFinite(num) && num > 0) set.add(num);
      });
      planDrugItems.forEach((item) => {
        const num = Number(item.administration_day ?? item.cycle_day);
        if (Number.isFinite(num) && num > 0) set.add(num);
      });
      const matchingCycles = planCyclesSorted.filter((c) => c.cycle_number === cNum);
      matchingCycles.forEach((c) => {
        if (c.cycle_day != null && Number(c.cycle_day) > 0) set.add(Number(c.cycle_day));
        (c.chemotherapy_administration ?? []).forEach((adm: any) => {
          if (adm.administration_day != null && Number(adm.administration_day) > 0) {
            set.add(Number(adm.administration_day));
          }
        });
      });
      const sorted = Array.from(set).sort((a, b) => a - b);
      return sorted.length > 0 ? sorted : [1];
    };

    const items: Array<{
      id: string;
      cycle: string;
      date: string;
      description: string;
      final: boolean;
      status: string;
      category: "COMPLETED" | "CURRENT" | "UPCOMING";
      cycleNumber: number;
      dayNumber: number;
    }> = [];

    // Reverse order from totalCycles down to Cycle 1 (Cycle 6 at top, Cycle 1 at bottom)
    for (let cNum = totalCycles; cNum >= 1; cNum--) {
      const existing = existingMap.get(cNum);
      const detail = existing
        ? cycleDetails.find((d) => d.chemotherapy_cycle_id === existing.chemotherapy_cycle_id)
        : null;

      const isCompleted =
        isPlanCompleted ||
        (existing && (existing.cycle_status ?? "").toUpperCase() === "COMPLETED") ||
        (plan?.completed_cycles != null && cNum <= plan.completed_cycles) ||
        (activeCycleNum != null && cNum < activeCycleNum);

      const isCurrent =
        !isCompleted &&
        Boolean(
          (existing && (existing.cycle_status ?? "").toUpperCase() === "IN_PROGRESS") ||
            (activeCycleNum && cNum === activeCycleNum)
        );

      const cycleDaysAsc = getDaysForCycle(cNum);
      const hasManyDays = cycleDaysAsc.length > 1;
      const isFinalCycle = cNum === totalCycles;
      const maxCycleDay = cycleDaysAsc[cycleDaysAsc.length - 1];
      // Highest day on top and lowest day of the cycle at bottom
      const cycleDaysDescending = [...cycleDaysAsc].sort((a, b) => b - a);

      for (const dNum of cycleDaysDescending) {
        const isFinalDay = dNum === maxCycleDay;
        const isFinalCard = isFinalCycle && isFinalDay;

        const specificCycleDay = existingDayMap.get(`${cNum}-${dNum}`);
        const specificDetail = specificCycleDay
          ? cycleDetails.find((d) => d.chemotherapy_cycle_id === specificCycleDay.chemotherapy_cycle_id)
          : null;

        // Determine category for this day
        let dayCategory: "COMPLETED" | "CURRENT" | "UPCOMING" = "UPCOMING";
        if (
          isCompleted ||
          (specificCycleDay && (specificCycleDay.cycle_status ?? "").toUpperCase() === "COMPLETED")
        ) {
          dayCategory = "COMPLETED";
        } else if (activeCycleNum != null && cNum > activeCycleNum) {
          dayCategory = "UPCOMING";
        } else if (isCurrent) {
          const dayAdmin = (detail?.chemotherapy_administration ?? existing?.chemotherapy_administration ?? []).find(
            (adm: any) => Number(adm.administration_day) === dNum
          );
          if (dayAdmin && (dayAdmin.administration_status === "Completed" || dayAdmin.infusion_completed)) {
            dayCategory = "COMPLETED";
          } else if (currentCycleInfo?.day != null && hasManyDays) {
            if (dNum < currentCycleInfo.day) {
              dayCategory = "COMPLETED";
            } else if (dNum === currentCycleInfo.day) {
              dayCategory = "CURRENT";
            } else {
              dayCategory = "UPCOMING";
            }
          } else {
            dayCategory = dNum === 1 || !hasManyDays ? "CURRENT" : "UPCOMING";
          }
        } else {
          dayCategory = "UPCOMING";
        }

        // Dynamic real date for this day
        let dayDateStr = "";
        if (specificCycleDay?.actual_date || specificCycleDay?.planned_date) {
          const act = fmtTimelineDate(specificDetail?.actual_date || specificCycleDay.actual_date);
          const pln = fmtTimelineDate(specificDetail?.planned_date || specificCycleDay.planned_date);
          if (act && pln && act !== pln) {
            dayDateStr = `${pln} - ${act}`;
          } else {
            dayDateStr = act || pln || "";
          }
        }

        if (!dayDateStr) {
          const dayAdmin = (detail?.chemotherapy_administration ?? existing?.chemotherapy_administration ?? []).find(
            (adm: any) => Number(adm.administration_day) === dNum
          );
          if (dayAdmin?.administration_date) {
            dayDateStr = fmtTimelineDate(dayAdmin.administration_date);
          }
        }

        if (!dayDateStr && (detail?.actual_date || existing?.actual_date || detail?.planned_date || existing?.planned_date)) {
          const baseDateVal = detail?.actual_date || existing?.actual_date || detail?.planned_date || existing?.planned_date;
          const baseDate = new Date(baseDateVal as string);
          if (!Number.isNaN(baseDate.getTime())) {
            if (dNum === 1 || !hasManyDays) {
              const plannedStr = fmtTimelineDate(detail?.planned_date || existing?.planned_date);
              const actualStr = fmtTimelineDate(detail?.actual_date || existing?.actual_date);
              if (plannedStr && actualStr && plannedStr !== actualStr) {
                dayDateStr = `${plannedStr} - ${actualStr}`;
              } else {
                dayDateStr = actualStr || plannedStr || fmtTimelineDate(baseDate);
              }
            } else {
              const offsetDate = new Date(baseDate);
              offsetDate.setDate(offsetDate.getDate() + (dNum - 1));
              dayDateStr = fmtTimelineDate(offsetDate);
            }
          }
        }

        if (!dayDateStr && startDate && !Number.isNaN(startDate.getTime())) {
          const d = new Date(startDate);
          d.setDate(startDate.getDate() + (cNum - 1) * interval + (dNum - 1));
          dayDateStr = fmtTimelineDate(d);
        }

        // Title: CYCLE 01 DAY 01, CYCLE 01 DAY 02 if multi-day, else CYCLE 01
        let cycleTitle = hasManyDays
          ? `CYCLE ${String(cNum).padStart(2, "0")} DAY ${String(dNum).padStart(2, "0")}`
          : `CYCLE ${String(cNum).padStart(2, "0")}`;

        if (isFinalCard) {
          cycleTitle += " (FINAL)";
        }

        // Dynamic description from drugs scheduled for this day, remarks, or adverse events
        const dayMedicines = planDrugItems
          .filter((item) => {
            if (!hasManyDays) return true;
            const itemDay = Number(item.administration_day ?? item.cycle_day ?? 1);
            return itemDay === dNum;
          })
          .map((item) => chemoPlanItemName(item))
          .filter(Boolean);

        let description = "";
        if (dayMedicines.length > 0) {
          description = `Administered: ${dayMedicines.join(", ")}.`;
        }

        const remarksText =
          specificDetail?.remarks ||
          detail?.remarks ||
          specificCycleDay?.remarks ||
          existing?.remarks;
        if (remarksText?.trim()) {
          description = description
            ? `${description} ${remarksText.trim()}`
            : remarksText.trim();
        }

        if (!description) {
          const adverseEvents =
            specificDetail?.chemotherapy_adverse_event ??
            detail?.chemotherapy_adverse_event ??
            existing?.chemotherapy_adverse_event ??
            [];
          if (adverseEvents.length > 0) {
            const names = adverseEvents
              .map((ae) => {
                const grade = ae.ctcae_grade || ae.reaction_grade || ae.severity;
                return `${ae.adverse_event_name || "Adverse event"}${
                  grade ? ` (Grade ${grade})` : ""
                }`;
              })
              .join(", ");
            description = `Adverse events: ${names}.`;
          }
        }

        if (!description) {
          const dayLabel = hasManyDays
            ? `Day ${String(dNum).padStart(2, "0")}`
            : "Cycle";
          if (dayCategory === "CURRENT") {
            description = plan?.regimen_name
              ? `${dayLabel} in progress per ${plan.regimen_name} protocol.`
              : `${dayLabel} in progress as scheduled.`;
          } else if (dayCategory === "COMPLETED") {
            const comp =
              specificDetail?.completion_status ||
              detail?.completion_status ||
              existing?.completion_status;
            description = comp
              ? `${dayLabel} completed (${comp.replace(/_/g, " ")}).`
              : isFinalCard
              ? "Protocol completed. All planned cycles successfully administered."
              : `${dayLabel} completed as scheduled.`;
          } else {
            description = hasManyDays
              ? `Scheduled for Day ${String(dNum).padStart(2, "0")} administration per protocol.`
              : "Scheduled per treatment protocol.";
          }
        }

        const status = (
          specificCycleDay?.cycle_status ||
          (dayCategory === "COMPLETED"
            ? "COMPLETED"
            : dayCategory === "CURRENT"
            ? "IN_PROGRESS"
            : "SCHEDULED")
        ).toUpperCase();

        items.push({
          id: `cycle-${cNum}-day-${dNum}`,
          cycle: cycleTitle,
          date: dayDateStr,
          description,
          final: isFinalCard,
          status,
          category: dayCategory,
          cycleNumber: cNum,
          dayNumber: dNum,
        });
      }
    }

    return items;
  })();

  /* Treatment Trend: the Investigation Results the Diagnosis tab saved on
     each visit, as one trend per number test, grouped per cancer type. */
  const [investigationResults, setInvestigationResults] = useState<InvestigationResultRow[]>([]);
  const [investigationLoading, setInvestigationLoading] = useState(false);

  useEffect(() => {
    if (!patientId) return;
    let cancelled = false;
    setInvestigationLoading(true);
    API.get<{ success: boolean; data: InvestigationResultRow[] }>(
      "/oncology/investigation-results",
      { params: { patient_id: patientId } }
    )
      .then((response) => {
        if (!cancelled) setInvestigationResults(response.data?.data ?? []);
      })
      .catch((error) => {
        console.warn("Failed to load investigation results for the trends:", error);
        if (!cancelled) setInvestigationResults([]);
      })
      .finally(() => {
        if (!cancelled) setInvestigationLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  const treatmentTrends = useMemo(
    () =>
      buildTreatmentTrends(
        investigationResults,
        (stagingDetails[0] as { cancer_type_id?: string | null } | undefined)?.cancer_type_id
      ),
    [investigationResults, stagingDetails]
  );
  const trendTestCount = treatmentTrends.reduce((sum, group) => sum + group.charts.length, 0);
  const trendReadingCount = treatmentTrends.reduce(
    (sum, group) => sum + group.charts.reduce((count, chart) => count + chart.points.length, 0),
    0
  );

  /* =========================================================
     CONTENT (PATIENT HEADER + HISTORY SECTIONS + ACTIONS)
  ========================================================= */

  const content = (
    <>
      {/* LIVE DATA STATUS */}
      {(historyLoading || historyError) && (
        <div className="p-6 pb-0">
          {historyLoading && (
            <div className="flex items-center rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
              <i className="fa-solid fa-circle-notch fa-spin mr-2" /> Loading
              treatment history…
            </div>
          )}
          {!historyLoading && historyError && (
            <div className="flex items-center rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              <i className="fa-solid fa-triangle-exclamation mr-2" />{" "}
              {historyError}
            </div>
          )}
        </div>
      )}

      {/* TIMELINE + RIGHT COLUMN */}
      <div className="p-6 grid lg:grid-cols-3 gap-6 bg-slate-50/50">
        {/* LEFT */}
        <div className="lg:col-span-2">
          <div id="treatment-timeline-section" className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-chart-line text-blue-600" />

                <h2 className="text-lg font-bold text-gray-900">
                  Treatment Timeline
                </h2>
              </div>

              <span className="text-sm font-medium text-gray-500">
                {historyTimelineRange || "No treatment dates recorded"}
              </span>
            </div>

            {/* Timeline */}
            <div className="relative pl-4 space-y-4 max-h-[560px] overflow-y-auto pr-2" style={{ scrollbarWidth: "thin", scrollbarColor: "#2563eb #f1f5f9" }}>
              {timelineItems.length > 0 && (
                <div
                  aria-hidden="true"
                  className="absolute left-[21px] top-4 bottom-4 w-px bg-gray-200"
                />
              )}

              {timelineItems.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-500">
                  No chemotherapy cycles found for this patient yet. Save a
                  Treatment Plan and record cycles to build the timeline.
                </div>
              ) : (
                timelineItems.map((item) => {
                  const isCompleted = item.category === "COMPLETED";
                  const isCurrent = item.category === "CURRENT";
                  const isUpcoming = item.category === "UPCOMING";

                  return (
                    <div
                      key={item.id}
                      className="relative flex items-start"
                    >
                      {/* Node circle on the vertical line with status colors */}
                      <div
                        className={`absolute left-[11px] top-3.5 w-5 h-5 rounded-full flex items-center justify-center ring-4 z-10 shadow-sm ${
                          isCompleted
                            ? "bg-emerald-600 ring-white"
                            : isCurrent
                            ? "bg-blue-600 ring-blue-100"
                            : "bg-slate-300 ring-white"
                        }`}
                      >
                        {isCompleted ? (
                          <i className="fa-solid fa-check text-white text-[10px]" />
                        ) : isCurrent ? (
                          <i className="fa-solid fa-play text-white text-[9px] ml-0.5" />
                        ) : (
                          <i className="fa-regular fa-calendar text-slate-600 text-[10px]" />
                        )}
                      </div>

                      {/* Clean timeline card matching design with green/blue/grey colors */}
                      <div
                        className={`ml-8 w-full rounded-xl p-4 transition hover:shadow-sm ${
                          isCompleted
                            ? "bg-white border border-emerald-200"
                            : isCurrent
                            ? "bg-blue-50/60 border border-blue-200"
                            : "bg-slate-50/60 border border-dashed border-slate-200"
                        }`}
                      >
                        <div className="flex justify-between items-center mb-1.5 flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <h3
                              className={`font-bold text-sm ${
                                isCompleted
                                  ? "text-emerald-900"
                                  : isCurrent
                                  ? "text-blue-700"
                                  : "text-slate-600"
                              }`}
                            >
                              {item.cycle}
                            </h3>

                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${
                                isCompleted
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : isCurrent
                                  ? "bg-blue-100 text-blue-700 border-blue-200"
                                  : "bg-slate-100 text-slate-500 border-slate-200"
                              }`}
                            >
                              {isCompleted
                                ? "Completed"
                                : isCurrent
                                ? "Current"
                                : "Upcoming"}
                            </span>
                          </div>

                          <span
                            className={`text-xs sm:text-sm font-medium ${
                              isCurrent
                                ? "text-blue-600 font-semibold"
                                : isCompleted
                                ? "text-gray-500"
                                : "text-slate-400"
                            }`}
                          >
                            {item.date || "—"}
                          </span>
                        </div>

                        <p
                          className={`text-xs sm:text-sm leading-relaxed ${
                            isCompleted
                              ? "text-gray-600"
                              : isCurrent
                              ? "text-gray-700 font-medium"
                              : "text-slate-500"
                          }`}
                        >
                          {item.description}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div className="space-y-6">
          {/* PATIENT 360 */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <h2 className="text-base font-bold text-gray-900 mb-4">
              Patient 360
            </h2>

            {stagingDetailsLoading ? (
              <div className="flex items-center text-sm text-gray-500">
                <i className="fa-solid fa-circle-notch fa-spin mr-2" />
                Loading visit history...
              </div>
            ) : latestVisit ? (
              <>
                <div className="space-y-3 text-sm">
                  {renderPatient360Row(
                    "fa-regular fa-calendar",
                    "bg-blue-50 text-blue-600",
                    "Visited date",
                    fmtHistoryDate(latestVisit.date) || "—",
                    true
                  )}
                  {latestVisit.staging ? (
                    <>
                      {renderPatient360Row(
                        "fa-solid fa-disease",
                        "bg-violet-50 text-violet-600",
                        "Diagnosis name",
                        stagingDiagnosisName(latestVisit.staging),
                        true
                      )}
                      {renderPatient360Row(
                        "fa-regular fa-note-sticky",
                        "bg-amber-50 text-amber-600",
                        "Notes",
                        latestVisit.staging.notes || "—"
                      )}
                      {renderPatient360Row(
                        "fa-solid fa-heart-pulse",
                        "bg-emerald-50 text-emerald-600",
                        "Disease Status",
                        latestVisit.staging.disease_status || "—",
                        true
                      )}
                    </>
                  ) : latestVisit.consultation ? (
                    <>
                      {renderPatient360Row(
                        "fa-solid fa-comment-medical",
                        "bg-rose-50 text-rose-600",
                        "Chief Complaint",
                        latestVisit.consultation.chiefComplaint || "—",
                        true
                      )}
                      {renderPatient360Row(
                        "fa-regular fa-note-sticky",
                        "bg-amber-50 text-amber-600",
                        "Consultation Notes",
                        latestVisit.consultation.consultationNotes || "—"
                      )}
                      {renderPatient360Row(
                        "fa-solid fa-stethoscope",
                        "bg-sky-50 text-sky-600",
                        "Clinical Findings",
                        latestVisit.consultation.clinicalFindings || "—"
                      )}
                      {renderPatient360Row(
                        "fa-regular fa-comments",
                        "bg-emerald-50 text-emerald-600",
                        "Discussion",
                        latestVisit.consultation.discussion || "—"
                      )}
                    </>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={() => setStagingHistoryOpen(true)}
                  className="mt-4 w-full py-2.5 rounded-lg bg-[#004785] hover:bg-[#003A6B] active:scale-[0.98] text-white text-sm font-semibold transition-all shadow-sm"
                >
                  View History
                </button>
              </>
            ) : (
              <p className="text-sm text-gray-500">
                No visits recorded for this patient yet.
              </p>
            )}
          </div>

          {/* VITAL TREND */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <h2 className="text-base font-bold text-gray-900 mb-4">
              Vitals Trend History
            </h2>

            <div className="flex flex-wrap gap-2 mb-4">
              {([
                { key: "weight", label: "Weight" },
                { key: "bp", label: "BP" },
                { key: "pulse", label: "Pulse" },
                { key: "temp", label: "Temp" },
                { key: "painscore", label: "Painscore" },
              ] as const).map((chart) => (
                <button
                  key={chart.key}
                  type="button"
                  onClick={() => setActiveVitalChart(chart.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                    activeVitalChart === chart.key
                      ? "bg-[#004785] border-[#004785] text-white shadow-sm"
                      : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-[#004785]"
                  }`}
                >
                  {chart.label}
                </button>
              ))}
            </div>

            {activeVitalChart === "weight" && (
            <div className="mb-4">
              <div className="flex justify-between text-xs text-gray-500 uppercase font-semibold mb-2">
                <span>WEIGHT (KG)</span>
                <span>
                  {weightTrendAvg != null
                    ? `Avg ${weightTrendAvg.toFixed(1)}`
                    : "No data"}
                </span>
              </div>

              <div className="flex items-end h-16 gap-1.5">
                {weightTrend.length === 0 ? (
                  <p className="text-xs text-gray-400">
                    No weight recorded for any visit yet.
                  </p>
                ) : (
                  weightTrend.map((entry, idx) => (
                    <div
                      key={entry.date || idx}
                      className="flex-1 min-w-[10px] max-w-[40px] bg-blue-500 rounded-t-md cursor-pointer hover:bg-blue-700 transition-colors"
                      style={{
                        height: `${Math.max(
                          12,
                          Math.round((entry.weight / weightTrendMax) * 100)
                        )}%`,
                      }}
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const label = entry.date
                          ? new Date(entry.date + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                          : "Visit";
                        setBarTooltip({ text: `${label}: ${entry.weight.toFixed(1)} kg`, x: rect.left + rect.width / 2, y: rect.top });
                      }}
                      onMouseLeave={() => setBarTooltip(null)}
                    />
                  ))
                )}
              </div>
            </div>
            )}

            {activeVitalChart !== "weight" && (
              <div className="mt-4 space-y-5 border-t border-gray-100 pt-4">

                {/* Blood Pressure */}
                {activeVitalChart === "bp" && (
                <div>
                  <div className="flex justify-between text-xs text-gray-500 uppercase font-semibold mb-2">
                    <span>Blood Pressure (mmHg)</span>
                    {bpTrend.length > 0 && (
                      <span>
                        Avg {Math.round(bpTrend.reduce((s, e) => s + e.systolic, 0) / bpTrend.length)}/
                        {Math.round(bpTrend.reduce((s, e) => s + e.diastolic, 0) / bpTrend.length)}
                      </span>
                    )}
                  </div>
                  {bpTrend.length === 0 ? (
                    <p className="text-xs text-gray-400">No BP recorded yet.</p>
                  ) : (
                    <>
                      <div className="flex items-end h-20 gap-2">
                        {(() => {
                          const maxSys = Math.max(...bpTrend.map((e) => e.systolic), 1);
                          return bpTrend.map((entry, idx) => {
                            const label = new Date(entry.date + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
                            const tip = `${label}: ${entry.systolic}/${entry.diastolic} mmHg`;
                            return (
                              <div key={entry.date || idx} className="flex items-end gap-0.5 flex-1 min-w-[16px] max-w-[48px] h-full">
                                <div
                                  className="flex-1 bg-blue-600 rounded-t cursor-pointer hover:bg-blue-700 transition-colors"
                                  style={{ height: `${Math.max(10, Math.round((entry.systolic / maxSys) * 100))}%` }}
                                  onMouseEnter={(e) => { const r = e.currentTarget.getBoundingClientRect(); setBarTooltip({ text: tip, x: r.left + r.width / 2, y: r.top }); }}
                                  onMouseLeave={() => setBarTooltip(null)}
                                />
                                <div
                                  className="flex-1 bg-blue-300 rounded-t cursor-pointer hover:bg-blue-400 transition-colors"
                                  style={{ height: `${Math.max(10, Math.round((entry.diastolic / maxSys) * 100))}%` }}
                                  onMouseEnter={(e) => { const r = e.currentTarget.getBoundingClientRect(); setBarTooltip({ text: tip, x: r.left + r.width / 2, y: r.top }); }}
                                  onMouseLeave={() => setBarTooltip(null)}
                                />
                              </div>
                            );
                          });
                        })()}
                      </div>
                      <div className="flex gap-3 mt-1.5 text-[10px] text-gray-500">
                        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-blue-600" />Systolic</span>
                        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-blue-300" />Diastolic</span>
                      </div>
                    </>
                  )}
                </div>
                )}

                {/* Pulse */}
                {activeVitalChart === "pulse" && (
                <div>
                  <div className="flex justify-between text-xs text-gray-500 uppercase font-semibold mb-2">
                    <span>Pulse (bpm)</span>
                    {pulseTrend.length > 0 && (
                      <span>Avg {Math.round(pulseTrend.reduce((s, e) => s + e.value, 0) / pulseTrend.length)}</span>
                    )}
                  </div>
                  {pulseTrend.length === 0 ? (
                    <p className="text-xs text-gray-400">No pulse recorded yet.</p>
                  ) : (
                    <div className="flex items-end h-16 gap-1.5">
                      {(() => {
                        const max = Math.max(...pulseTrend.map((e) => e.value), 1);
                        return pulseTrend.map((entry, idx) => (
                          <div
                            key={entry.date || idx}
                            className="flex-1 min-w-[10px] max-w-[40px] bg-rose-500 rounded-t-md cursor-pointer hover:bg-rose-600 transition-colors"
                            style={{ height: `${Math.max(12, Math.round((entry.value / max) * 100))}%` }}
                            onMouseEnter={(e) => {
                              const r = e.currentTarget.getBoundingClientRect();
                              const label = new Date(entry.date + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
                              setBarTooltip({ text: `${label}: ${entry.value} bpm`, x: r.left + r.width / 2, y: r.top });
                            }}
                            onMouseLeave={() => setBarTooltip(null)}
                          />
                        ));
                      })()}
                    </div>
                  )}
                </div>
                )}

                {/* Temperature */}
                {activeVitalChart === "temp" && (
                <div>
                  <div className="flex justify-between text-xs text-gray-500 uppercase font-semibold mb-2">
                    <span>Temperature (°C)</span>
                    {tempTrend.length > 0 && (
                      <span>Avg {(tempTrend.reduce((s, e) => s + e.value, 0) / tempTrend.length).toFixed(1)}</span>
                    )}
                  </div>
                  {tempTrend.length === 0 ? (
                    <p className="text-xs text-gray-400">No temperature recorded yet.</p>
                  ) : (
                    <div className="flex items-end h-16 gap-1.5">
                      {(() => {
                        const max = Math.max(...tempTrend.map((e) => e.value), 1);
                        return tempTrend.map((entry, idx) => (
                          <div
                            key={entry.date || idx}
                            className="flex-1 min-w-[10px] max-w-[40px] bg-orange-400 rounded-t-md cursor-pointer hover:bg-orange-500 transition-colors"
                            style={{ height: `${Math.max(12, Math.round((entry.value / max) * 100))}%` }}
                            onMouseEnter={(e) => {
                              const r = e.currentTarget.getBoundingClientRect();
                              const label = new Date(entry.date + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
                              setBarTooltip({ text: `${label}: ${entry.value.toFixed(1)} °C`, x: r.left + r.width / 2, y: r.top });
                            }}
                            onMouseLeave={() => setBarTooltip(null)}
                          />
                        ));
                      })()}
                    </div>
                  )}
                </div>
                )}

                {/* Pain Score */}
                {activeVitalChart === "painscore" && (
                <div>
                  <div className="flex justify-between text-xs text-gray-500 uppercase font-semibold mb-2">
                    <span>Pain Score (0-10)</span>
                    {painTrend.length > 0 && (
                      <span>Avg {(painTrend.reduce((s, e) => s + e.value, 0) / painTrend.length).toFixed(1)}</span>
                    )}
                  </div>
                  {painTrend.length === 0 ? (
                    <p className="text-xs text-gray-400">No pain score recorded yet.</p>
                  ) : (
                    <div className="flex items-end h-16 gap-1.5">
                      {(() => {
                        const max = Math.max(...painTrend.map((e) => e.value), 1);
                        return painTrend.map((entry, idx) => (
                          <div
                            key={entry.date || idx}
                            className="flex-1 min-w-[10px] max-w-[40px] bg-red-500 rounded-t-md cursor-pointer hover:bg-red-600 transition-colors"
                            style={{ height: `${Math.max(12, Math.round((entry.value / max) * 100))}%` }}
                            onMouseEnter={(e) => {
                              const r = e.currentTarget.getBoundingClientRect();
                              const label = new Date(entry.date + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
                              const score = Number.isInteger(entry.value) ? String(entry.value) : entry.value.toFixed(1);
                              setBarTooltip({ text: `${label}: ${score}/10`, x: r.left + r.width / 2, y: r.top });
                            }}
                            onMouseLeave={() => setBarTooltip(null)}
                          />
                        ));
                      })()}
                    </div>
                  )}
                </div>
                )}

              </div>
            )}

            {barTooltip && (
              <div
                className="fixed z-50 pointer-events-none bg-gray-900 text-white text-xs font-medium rounded px-2.5 py-1 whitespace-nowrap shadow-lg"
                style={{ left: barTooltip.x, top: barTooltip.y - 8, transform: "translate(-50%, -100%)" }}
              >
                {barTooltip.text}
              </div>
            )}
          </div>

          {/* DOCUMENT HISTORY */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-base font-bold text-gray-900">
                Document History
              </h2>
            </div>

            {prescriptionsLoading ? (
              <div className="text-xs text-gray-500">Loading prescriptions…</div>
            ) : prescriptionsError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{prescriptionsError}</div>
            ) : prescriptions.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/50 p-4 text-center text-xs text-gray-400">
                No prescriptions found for this patient yet.
              </div>
            ) : (
                  <div className="space-y-3">
                {selectedPrescription && pdfUrl && (
                  <>
                    <div className="rounded-lg border border-gray-200 bg-white p-4">
                      <div className="flex items-start justify-between mb-2">
                            <div>
                              <div className="text-base font-bold text-red-800">{selectedPrescription.diagnosis?.diagnosis_name || '—'}</div>
                              {selectedPrescription.chief_complaint && (
                                <div className="text-xs text-red-700 mt-1">{selectedPrescription.chief_complaint}</div>
                              )}
                            </div>
                            <div className="text-xs text-red-600">
                              {selectedPrescription.prescription_date ? new Date(selectedPrescription.prescription_date).toLocaleDateString() : '—'}
                            </div>
                          </div>
                        <div className="flex items-center justify-end gap-2">
                          <a
                            href={pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs px-3 py-1.5 rounded bg-red-600 text-white hover:bg-red-700"
                          >
                            View
                          </a>
                          <button
                            type="button"
                            className="text-xs px-3 py-1.5 rounded border border-red-300 text-red-700 hover:bg-red-50"
                            onClick={async () => {
                              try {
                                const data = buildPrescriptionData(selectedPrescription);
                                const { url } = await generatePrescriptionPdf(data as any);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `prescription-${selectedPrescription.prescription_id}.pdf`;
                                a.click();
                                URL.revokeObjectURL(url);
                              } catch (err) {
                                console.error(err);
                              }
                            }}
                          >
                            Download
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center justify-center gap-3">
                        <button
                          type="button"
                          className="text-[10px] px-2 py-1 rounded border border-gray-300 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                          disabled={prescriptionIndex === null || prescriptionIndex <= 0}
                          onClick={() => {
                            if (prescriptionIndex !== null && prescriptionIndex > 0) {
                              const newIdx = prescriptionIndex - 1;
                              openPrescriptionPdf(prescriptions[newIdx], newIdx);
                            }
                          }}
                        >
                          Previous
                        </button>
                        <span className="text-[10px] text-gray-600">
                          {prescriptions.length > 0 && prescriptionIndex !== null ? `${prescriptionIndex + 1} / ${prescriptions.length}` : '0 / 0'}
                        </span>
                        <button
                          type="button"
                          className="text-[10px] px-2 py-1 rounded border border-gray-300 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                          disabled={prescriptionIndex === null || prescriptionIndex >= prescriptions.length - 1}
                          onClick={() => {
                            if (prescriptionIndex !== null && prescriptionIndex < prescriptions.length - 1) {
                              const newIdx = prescriptionIndex + 1;
                              openPrescriptionPdf(prescriptions[newIdx], newIdx);
                            }
                          }}
                        >
                          Next
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

      {/* TREATMENT TREND - the patient's Investigation Results over the
          visits: one chart per test, grouped per cancer type. */}
      <section id="treatment-trend-section" className="px-6 pb-6">
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="flex flex-wrap justify-between items-center gap-3 p-5 border-b border-gray-200 bg-gray-50/50">
            <div>
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-chart-line text-[#004785]" />
                <h2 className="text-lg font-bold text-gray-900">Treatment Trend</h2>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Investigation Results from the Diagnosis tab, per cancer type, oldest to newest visit.
              </p>
            </div>
            {trendReadingCount > 0 && (
              <span className="text-xs font-semibold text-[#004785] bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-full">
                {trendTestCount} test{trendTestCount === 1 ? "" : "s"} · {trendReadingCount} reading
                {trendReadingCount === 1 ? "" : "s"}
              </span>
            )}
          </div>

          <div className={`space-y-7 p-5 transition-opacity ${investigationLoading && treatmentTrends.length > 0 ? "opacity-60" : ""}`}>
            {investigationLoading && treatmentTrends.length === 0 ? (
              <div className="flex items-center justify-center py-10 text-sm text-gray-500">
                <i className="fa-solid fa-circle-notch fa-spin mr-2" />
                Loading investigation results...
              </div>
            ) : treatmentTrends.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50/60 px-6 py-10 text-center">
                <i className="fa-solid fa-chart-line mb-3 text-2xl text-gray-300" />
                <p className="text-sm font-semibold text-gray-700">No investigation results yet</p>
                <p className="mt-1 max-w-md text-xs text-gray-500">
                  Values entered in the Diagnosis tab's Investigation Results (PSA, CEA, CA-125 and
                  others) appear here as a trend for each test.
                </p>
              </div>
            ) : (
              treatmentTrends.map((group, index) => (
                <div key={group.cancerTypeId}>
                  <div className="mb-3 flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#004785] text-xs font-bold text-white">
                      {index + 1}
                    </span>
                    <h3 className="text-sm font-bold text-gray-900">{group.cancerType}</h3>
                    <span className="text-xs text-gray-400">
                      {group.charts.length} test{group.charts.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {group.charts.map((chart) => (
                      <TrendChartCard key={chart.parameterId} chart={chart} />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* CHEMOTHERAPY CYCLE HISTORY */}
      <section id="chemotherapy-cycle-history" className="px-6 pb-6">
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="flex justify-between items-center p-5 border-b border-gray-200 bg-gray-50/50">
            <h2 className="text-lg font-bold text-gray-900">
              Chemotherapy Cycle History
            </h2>

            <button
              type="button"
              onClick={() => {
                document.getElementById("treatment-timeline-section")?.scrollIntoView({ behavior: "smooth" });
              }}
              className="text-sm text-blue-600 font-bold hover:underline"
            >
              View Protocol Details
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 font-semibold">
                    Cycle
                  </th>

                  <th className="px-6 py-3 font-semibold">
                    Dates
                  </th>

                  <th className="px-6 py-3 font-semibold">
                    Agent
                  </th>

                  <th className="px-6 py-3 font-semibold">
                    Planned Dose
                  </th>

                  <th className="px-6 py-3 font-semibold">
                    Actual Dose
                  </th>

                  <th className="px-6 py-3 font-semibold text-right">
                    Outcome
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {cycleHistoryRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-6 text-center text-xs text-gray-400"
                    >
                      No chemotherapy cycles recorded for this patient yet.
                    </td>
                  </tr>
                ) : (
                  cycleHistoryRows.map((row) => (
                    <tr
                      key={row.cycle}
                      className="hover:bg-gray-50"
                    >
                      <td className="px-6 py-4 font-medium text-gray-900">
                        {row.cycle}
                      </td>

                      <td className="px-6 py-4 text-gray-500">
                        {row.dates || "—"}
                      </td>

                      <td className="px-6 py-4 text-gray-700">
                        {row.agent}
                      </td>

                      <td className="px-6 py-4 text-gray-700">
                        {row.plannedDose}
                      </td>

                      <td className="px-6 py-4 text-gray-700">
                        {row.actualDose}
                      </td>

                      <td className="px-6 py-4 text-right">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            row.status === "COMPLETED"
                              ? "bg-green-100 text-green-800"
                              : row.status === "IN_PROGRESS" ||
                                row.status === "ADMINISTERED"
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {row.status === "COMPLETED"
                            ? "SUCCESSFUL"
                            : row.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* MEDICATION HISTORY */}
      <section className="px-6 pb-6">
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="flex justify-between items-center p-5 border-b border-gray-200 bg-gray-50/50">
            <h2 className="text-lg font-bold text-gray-900">
              Medication History
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 font-semibold">
                    Medication
                  </th>

                  <th className="px-6 py-3 font-semibold">
                    Start Date
                  </th>

                  <th className="px-6 py-3 font-semibold">
                    End Date
                  </th>

                  <th className="px-6 py-3 font-semibold">
                    Dosage
                  </th>

                  <th className="px-6 py-3 font-semibold">
                    Route
                  </th>

                  <th className="px-6 py-3 font-semibold text-right">
                    Status
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {medicationRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-6 text-center text-xs text-gray-400"
                    >
                      No medications prescribed for this patient yet.
                    </td>
                  </tr>
                ) : (
                  medicationRows.map((medication) => (
                    <tr
                      key={medication.medication}
                      className="hover:bg-gray-50"
                    >
                      <td className="px-6 py-4 font-medium text-gray-900">
                        {medication.medication}
                      </td>

                      <td className="px-6 py-4 text-gray-500">
                        {medication.start || "—"}
                      </td>

                      <td className="px-6 py-4 text-gray-500">
                        {medication.end}
                      </td>

                      <td className="px-6 py-4 text-gray-700">
                        {medication.dosage}
                      </td>

                      <td className="px-6 py-4 text-gray-700">
                        {medication.route}
                      </td>

                      <td className="px-6 py-4 text-right">
                        {medication.active ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            ACTIVE
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                            COMPLETED
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ADVERSE EVENTS */}
      <section className="px-6 pb-6">
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="flex justify-between items-center p-5 border-b border-gray-200 bg-gray-50/50">
            <h2 className="text-lg font-bold text-gray-900">
              Adverse Events History
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 font-semibold">
                    Date
                  </th>

                  <th className="px-6 py-3 font-semibold">
                    Event
                  </th>

                  <th className="px-6 py-3 font-semibold">
                    Grade
                  </th>

                  <th className="px-6 py-3 font-semibold">
                    Action Taken
                  </th>

                  <th className="px-6 py-3 font-semibold text-right">
                    Outcome
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {adverseEventRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-6 text-center text-xs text-gray-400"
                    >
                      No adverse events recorded for this patient yet.
                    </td>
                  </tr>
                ) : (
                  adverseEventRows.map((event) => (
                    <tr key={event.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-gray-500">
                        {event.date || "—"}
                      </td>

                      <td className="px-6 py-4 font-medium text-gray-900">
                        {event.event}
                      </td>

                      <td className="px-6 py-4 text-gray-700">
                        {event.grade}
                      </td>

                      <td className="px-6 py-4 text-gray-700">
                        {event.action}
                      </td>

                      <td className="px-6 py-4 text-right">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            event.outcome === "ONGOING"
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {event.outcome}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ACTION BUTTONS */}
      <div className="px-6 pb-8 flex justify-end gap-4">
        <button
          type="button"
          className="px-6 py-2.5 border border-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors text-sm"
        >
          Save &amp; Exit
        </button>

        <button
          type="button"
          className="px-6 py-2.5 border border-blue-600 text-blue-600 font-semibold rounded-lg hover:bg-blue-50 transition-colors text-sm"
        >
          Generate Report
        </button>

        <button
          type="button"
          className="px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm text-sm"
        >
          Submit Review
        </button>
      </div>

      {/* PATIENT 360 - VISIT HISTORY POPUP */}
      {stagingHistoryOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Visit history"
          onClick={() => setStagingHistoryOpen(false)}
        >
          <div
            className="mt-6 w-full max-w-xl animate-[p360-pop_0.25s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rounded-2xl bg-white shadow-2xl overflow-hidden border border-gray-200">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-[#F7F9FB]">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#004785] text-white flex items-center justify-center">
                    <i className="fa-solid fa-user" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-gray-900">
                      Patient 360 Visit History
                    </h3>
                    <p className="text-xs text-gray-500">
                      {patient360Visits.length} visit
                      {patient360Visits.length === 1 ? "" : "s"} · oldest
                      first
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setStagingHistoryOpen(false)}
                  className="w-8 h-8 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-800 flex items-center justify-center transition-colors"
                  aria-label="Close visit history"
                >
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>

              {/* Scrollable list - max 4 in view, scroll up (or down) the Y
                  axis to browse, default scroll lands on the most recent. */}
              <div
                ref={stagingHistoryScrollRef}
                className="max-h-[330px] overflow-y-auto px-4 py-4 space-y-3 bg-gray-50/60"
                style={{ scrollbarWidth: "thin" }}
              >
                {patient360Visits.length === 0 ? (
                  <p className="text-sm text-gray-500 py-6 text-center">
                    No visits recorded for this patient yet.
                  </p>
                ) : (
                  patient360Visits.map((visit, index) => {
                    const isLatest = index === patient360Visits.length - 1;
                    return (
                      <div
                        key={visit.key}
                        className={`rounded-xl border bg-white p-4 shadow-sm transition-all ${
                          isLatest
                            ? "border-[#004785] ring-1 ring-[#004785]/30"
                            : "border-gray-200"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs ${
                                isLatest
                                  ? "bg-[#004785] text-white"
                                  : "bg-[#D6E3FF] text-[#00488D]"
                              }`}
                            >
                              <i className="fa-regular fa-calendar" />
                            </div>
                            <span className="text-sm font-bold text-gray-900">
                              {fmtHistoryDate(visit.date) || "—"}
                            </span>
                            <span
                              className={`text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full ring-1 ring-inset ${
                                visit.staging
                                  ? "bg-violet-50 text-violet-700 ring-violet-200"
                                  : "bg-sky-50 text-sky-700 ring-sky-200"
                              }`}
                            >
                              {visit.staging ? "Oncology diagnosis" : "Outpatient consultation"}
                            </span>
                          </div>
                          {isLatest && (
                            <span className="text-[10px] uppercase tracking-wide font-bold px-2 py-1 rounded-full bg-[#004785] text-white">
                              Most recent
                            </span>
                          )}
                        </div>

                        <div className="space-y-2 text-sm">
                          {visit.staging ? (
                            <>
                              {renderVisitField("Diagnosis name", stagingDiagnosisName(visit.staging), true)}
                              {renderVisitField("Notes", visit.staging.notes || "")}
                              {renderVisitField("Disease Status", visit.staging.disease_status || "", true)}
                            </>
                          ) : visit.consultation ? (
                            <>
                              {renderVisitField("Chief Complaint", visit.consultation.chiefComplaint, true)}
                              {renderVisitField("Consultation Notes", visit.consultation.consultationNotes)}
                              {renderVisitField("Clinical Findings", visit.consultation.clinicalFindings)}
                              {renderVisitField("Discussion", visit.consultation.discussion)}
                            </>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t border-gray-100 bg-[#F7F9FB] flex items-center justify-between text-xs text-gray-500">
                <span>
                  <i className="fa-solid fa-arrow-up mr-1" />
                  Scroll up to see older visits
                </span>
                <button
                  type="button"
                  onClick={() => setStagingHistoryOpen(false)}
                  className="px-4 py-1.5 rounded-lg border border-gray-300 text-gray-700 font-semibold hover:bg-gray-100 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (embedded) {
    return (
      <>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
        />
        <div className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {content}
        </div>
      </>
    );
  }

  return (
    <>
      <link
        rel="stylesheet"
        href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
      />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
      />
      <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800 font-sans">
        {/* TOP HEADER */}
        <header className="bg-[#f2f4f7] border-b border-gray-200 px-6 py-3 flex items-center justify-between">
          

          <div className="flex items-center gap-6">
            <BellNotificationButton size="md" />

            <span className="text-blue-600 font-semibold text-sm">
              HMS
            </span>

            <div className="w-8 h-8 rounded-full bg-slate-800 border-2 border-slate-300 flex items-center justify-center overflow-hidden">
              <i className="fa-solid fa-user text-white text-xs" />
            </div>
          </div>
        </header>

        {/* MAIN CONTENT */}
        <main className="max-w-[1400px] mx-auto bg-white flex-grow pb-12 w-full shadow-sm">
          {content}
        </main>

        {/* FOOTER */}
        <footer className="bg-white border-t border-gray-200 mt-auto">
          <div className="max-w-[1400px] mx-auto px-6 py-6 flex flex-col md:flex-row justify-between items-center text-sm text-gray-500">
            <div className="mb-4 md:mb-0">
              © 2026 Hospital Management System. All rights reserved.
            </div>

            <div className="flex gap-6">
              <button className="hover:text-gray-900 transition-colors">
                Privacy Policy
              </button>

              <button className="hover:text-gray-900 transition-colors">
                Terms of Service
              </button>

              <button className="hover:text-gray-900 transition-colors">
                Help Center
              </button>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
};

export default HistoryTab;
