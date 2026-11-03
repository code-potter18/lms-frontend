import React, { useEffect, useState } from "react";
import API, { getActiveBranchId } from "../../../api/axios";
import { getUser } from "../../../utils/token";
import { encounterApi, type EncounterRecord } from "../../../api/encounter.api";
import { ALL_BRANCHES_VALUE, NO_BRANCH_VALUE, useBranchFilter } from "../../../context/BranchFilterContext";
import { computeBsa } from "../../../utils/vitals";

export interface ConsultationState {
  patientId?: string;
  appointmentId?: string;
  branchId?: string;
  appointmentDate?: string;
  appointmentTime?: string;
  consultedBy?: string;
}

export type SummaryPlanItem = {
  chemotherapy_plan_item_id: string;
  drug_role: string | null;
  protocol_dose: number | null;
  protocol_dose_unit: string | null;
  calculated_dose?: number | string | null;
  calculated_dose_unit?: string | null;
  formulation: string | null;
  dilution_volume: string | null;
  administration_route: string | null;
  frequency: string | null;
  remarks: string | null;
  cycle_day?: number | null;
  administration_day?: number | null;
  medicine_master: {
    medicine_name: string;
    generic_name: string | null;
    dosage_form: string | null;
    unit: string | null;
  } | null;
};

export type SummaryPlan = {
  chemotherapy_plan_id: string;
  patient_id: string;
  cancer_type: string | null;
  cancer_subtype: string | null;
  cancer_stage: string | null;
  protocol_name: string | null;
  regimen_name: string | null;
  regimen_code: string | null;
  source_protocol_id?: string | null;
  treatment_intent: string | null;
  treatment_goal: string | null;
  treatment_status: string | null;
  planned_cycles: number;
  completed_cycles: number | null;
  cycle_interval_days: number | null;
  treatment_start_date: string | null;
  expected_end_date: string | null;
  ecog_status?: number | string | null;
  karnofsky_score?: number | string | null;
  diagnosis_id?: string | null;
  staging_detail_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  employees?: {
    first_name?: string | null;
    last_name?: string | null;
  } | null;
  chemotherapy_cycle: {
    chemotherapy_cycle_id?: string;
    cycle_number: number;
    cycle_day?: number | null;
    planned_date?: string | null;
    actual_date?: string | null;
    next_cycle_date?: string | null;
    cycle_status?: string | null;
    completion_status?: string | null;
    remarks?: string | null;
    chemotherapy_administration?: {
      administration_day?: number | null;
      administration_date?: string | null;
      administration_status?: string | null;
      infusion_completed?: boolean | null;
      administered_by?: string | null;
    }[] | null;
  }[] | null;
  chemotherapy_plan_items: SummaryPlanItem[] | null;
  oncology_staging_detail: StagingDetailRecord | null;
  doctor_name?: string | null;
};

export type Tab = "Order Summary" | "Medications" | "Discharge" | "History" | "Notes & Documents";

export const tabs: Tab[] = [
  "Order Summary",
  "Medications",
  "Discharge",
  "History",
  "Notes & Documents",
];

export function StatusBadge({ children, warning = false }: { children: React.ReactNode; warning?: boolean }) {
  return (
    <span className={`inline-flex rounded-md px-2.5 py-1 text-[10px] font-bold uppercase ${
      warning ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
    }`}>
      {children}
    </span>
  );
}

export function SectionHeader({ icon, title, badge, badgeClass = "bg-blue-100 text-[#0052cc]" }: {
  icon: string; title: string; badge: string; badgeClass?: string;
}) {
  return (
    <div className="flex items-center border-b border-slate-100 bg-slate-50/50 px-6 py-4">
      <i className={`${icon} mr-3 text-sm text-slate-400`} />
      <h3 className="mr-3 text-lg font-bold text-slate-800">{title}</h3>
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badgeClass}`}>{badge}</span>
    </div>
  );
}

/* ============================================================
   PATIENT PROFILE PORTAL COMPONENT
   (combined from client/pages/doctor/profile patient .tsx —
    renamed MedicalPortalReplica → HMSPatientPortal to match the
    original file's component name, original file left untouched)
============================================================ */

export interface ChemoMatchingProtocol {
  id?: string;
  protocol_id: string;
  regimen_code: string;
  regimen_name: string;
  treatment_intent?: string | null;
  standard_cycles?: number | null;
  cycle_interval_days?: number | null;
}

/* ============================================================
   FULL STAGING DETAIL RECORDS (GET /oncology/staging-details/:id)
   Every field the backend can return for the selected patient.
   ============================================================ */

export interface StagingPatientBio {
  patient_id?: string;
  patient_first_name?: string | null;
  patient_last_name?: string | null;
  patient_dob?: string | null;
  patient_age?: number | string | null;
  patient_gender?: string | null;
}

export interface StagingIhcRecord {
  ihc_id?: string;
  er_status?: string | null;
  er_percent?: number | null;
  pr_status?: string | null;
  pr_percent?: number | null;
  her2_ihc?: string | null;
  her2_fish?: string | null;
  her2_fish_ratio?: number | string | null;
  her2_avg_copy?: number | string | null;
  ki67_percent?: number | null;
  pdl1_tps?: number | null;
  pdl1_cps?: number | null;
  pdl1_clone?: string | null;
  mmr_mlh1?: string | null;
  mmr_msh2?: string | null;
  mmr_msh6?: string | null;
  mmr_pms2?: string | null;
  mmr_overall?: string | null;
  p53_ihc?: string | null;
  ar_status?: string | null;
  mlh1_methylation?: string | null;
}

export interface StagingMolecularRecord {
  mol_id?: string;
  egfr_status?: string | null;
  egfr_mutation_type?: string | null;
  alk_status?: string | null;
  alk_test_method?: string | null;
  ros1_status?: string | null;
  kras_g12c?: string | null;
  kras_mutation?: string | null;
  braf_v600e?: string | null;
  brca1_germline?: string | null;
  brca2_germline?: string | null;
  brca_somatic?: string | null;
  hrd_status?: string | null;
  hrd_score?: number | string | null;
  hrd_assay?: string | null;
  msi_status?: string | null;
  msi_test_method?: string | null;
  tmb?: number | string | null;
  tmb_assay?: string | null;
  ngs_panel?: string | null;
  flt3_itd?: string | null;
  flt3_itd_allelic_ratio?: number | string | null;
  flt3_tkd?: string | null;
  npm1_mutation?: string | null;
  idh1_mutation?: string | null;
  idh2_mutation?: string | null;
  bcr_abl1?: number | string | null;
  bcr_abl1_transcript?: string | null;
}

export interface StagingDerivedRecord {
  ajcc_stage?: string | null;
  breast_mol_subtype?: string | null;
  icd10_auto?: string | null;
  icd_o3_auto?: string | null;
  pdl1_score_type?: string | null;
  germline_referral_flag?: boolean | null;
  lynch_syndrome_flag?: boolean | null;
  eln_risk?: string | null;
  lymphoma_deauville?: number | null;
  tnbc_subtype?: string | null;
  suggested_therapy?: string | null;
  recommended_tests?: string | null;
}

export interface StagingDetailRecord {
  id?: string;
  staging_detail_id?: string;
  patient_id?: string;
  diagnosis_id?: string | null;
  visit_date?: string | null;
  diagnosis_date?: string | null;
  biopsy_date?: string | null;
  consulting_oncologist?: string | null;
  icd10_code?: string | null;
  icd_o3_topo?: string | null;
  icd_o3_morpho?: string | null;
  staging_system?: string | null;
  clinical_stage?: string | null;
  pre_diagnosis?: string | null;
  disease_status?: string | null;
  notes?: string | null;
  t_stage?: string | null;
  n_stage?: string | null;
  m_stage?: string | null;
  metastasis_sites?: unknown;
  laterality?: string | null;
  performance_status?: number | null;
  employee_id?: string | null;
  branch_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  cancer_types?: { cancer_type?: string | null } | null;
  cancer_subtypes?: { subtype_name?: string | null } | null;
  ihc_results?: StagingIhcRecord | null;
  molecular_results?: StagingMolecularRecord | null;
  derived_fields?: StagingDerivedRecord | null;
  patient_bio_data?: StagingPatientBio | null;
  employees?: {
    first_name?: string | null;
    last_name?: string | null;
  } | null;
  her2_positive?: boolean | null;
}

export interface PatientAllergyRecord {
  id: string;
  allergy_id: string;
  reaction: string | null;
  severity: string | null;
  status: string | null;
  allergy_master?: {
    substance_name?: string | null;
    substance_type?: string | null;
    severity_level?: string | null;
  } | null;
}

export interface ChemotherapyVitalsRecord {
  height?: string | number | null;
  weight?: string | number | null;
  blood_pressure_systolic?: number | null;
  blood_pressure_diastolic?: number | null;
  pulse_rate?: number | null;
  body_temperature?: string | number | null;
  body_surface_area?: string | number | null;
  bmi?: string | number | null;
  spo2?: number | null;
}

export interface ChemotherapyAdverseEventRecord {
  adverse_event_name?: string | null;
  ctcae_grade?: number | string | null;
  event_date?: string | null;
}

export interface ChemotherapyCycleRecord {
  chemotherapy_cycle_id: string;
  cycle_number?: number | null;
  chemotherapy_vitals?: ChemotherapyVitalsRecord[];
  chemotherapy_adverse_event?: ChemotherapyAdverseEventRecord[];
}

export interface SavedPlanSummary {
  chemotherapy_plan_id: string;
  regimen_name?: string | null;
  treatment_intent?: string | null;
}

export interface ChemoPlanPreview {
  staging_detail_id: string;
  patient_id: string;
  cancer_type: string | null;
  cancer_subtype: string | null;
  clinical_stage: string | null;
  suggested_therapy: string | null;
  breast_mol_subtype: string | null;
  germline_referral_flag: boolean;
  matching_protocols: ChemoMatchingProtocol[];
}

/* ============================================================
   LATEST PLAN PREVIEW LOADER
   Resolves the selected patient's most recent staging detail
   (GET /oncology/staging-details, newest first) and then loads
   GET /chemotherapy/plans/preview?staging_detail_id=<latest>
   - the same chain the Order Summary panels render.

   The staging list endpoint FILTERS by the branchId query param
   but only AUTHORIZATES via the x-branch-id header. So when the
   active branch selection points somewhere else than where the
   diagnosis was saved - or nothing is selected at all - the
   strict call returns empty/403 even though data exists. Retry
   without the filter before giving up.
   ============================================================ */

export const loadLatestPlanPreview = async (
  patientId: string
): Promise<{
  preview: ChemoPlanPreview | null;
  staging: StagingDetailRecord | null;
  error: string;
}> => {
  const branchId = getActiveBranchId() ?? getUser()?.branch_id ?? undefined;

  const stagingAttempts: { params: Record<string, unknown> }[] = [
    { params: { patient_id: patientId, limit: 1, branchId } },
    { params: { patient_id: patientId, limit: 1 } },
  ];

  let lastError =
    "No staging details found for this patient yet. Complete the Diagnosis step to populate the Order Summary.";

  for (const attempt of stagingAttempts) {
    let stagingDetailId = "";

    try {
      const stagingResponse = await API.get<{
        success: boolean;
        data: { staging_detail_id: string }[];
      }>("/oncology/staging-details", attempt);
      stagingDetailId =
        stagingResponse.data?.data?.[0]?.staging_detail_id ?? "";
    } catch (error: any) {
      lastError =
        error?.response?.data?.message ||
        error?.message ||
        lastError;
      continue;
    }

    if (!stagingDetailId) continue;

    // Full record - every saved field (TNM, ICD codes, dates, IHC,
    // molecular results, derived fields, patient bio, oncologist).
    let fullStaging: StagingDetailRecord | null = null;
    try {
      const detailResponse = await API.get<{
        success: boolean;
        data: StagingDetailRecord;
      }>(`/oncology/staging-details/${encodeURIComponent(stagingDetailId)}`);
      fullStaging = detailResponse.data?.data ?? null;
    } catch {
      // The summary preview below still renders without it.
    }

    try {
      const previewResponse = await API.get<{
        success: boolean;
        data: ChemoPlanPreview;
      }>("/chemotherapy/plans/preview", {
        params: { staging_detail_id: stagingDetailId },
      });

      const preview = previewResponse.data?.data ?? null;

      // Only accept preview data for THIS selected patient.
      if (preview && preview.patient_id && preview.patient_id !== patientId) {
        return {
          preview: null,
          staging: null,
          error:
            "Saved diagnosis belongs to a different patient. Re-save the Diagnosis step for this patient.",
        };
      }

      const staging =
        fullStaging && fullStaging.patient_id === patientId
          ? fullStaging
          : null;

      return { preview, staging, error: "" };
    } catch (error: any) {
      return {
        preview: null,
        staging: null,
        error:
          error?.response?.data?.message ||
          error?.message ||
          "Failed to load chemotherapy plan preview.",
      };
    }
  }

  return { preview: null, staging: null, error: lastError };
};

/* ============================================================
   SHARED REAL-DATA LOADERS (used by the History / Discharge /
   Notes & Documents tabs so every table shows live records)

   - loadLatestChemoPlan: GET /chemotherapy/plans?patient_id=
     (branch filter first, retry without it - same fallback as
     the Order Summary loader above).
   - loadCycleDetail: GET /chemotherapy/cycles/:id - returns a
     cycle WITH its recorded chemotherapy_vitals and
     chemotherapy_adverse_event rows.
   ============================================================ */

export const loadLatestChemoPlan = async (
  patientId: string
): Promise<SummaryPlan | null> => {
  /* Mapping-scoped endpoint (GET /plans/latest-for-patient): access is
     resolved from the caller's ACTIVE user_branch_mapping on the
     backend (like /encounters/latest), so this works with or without
     a branch selection and never 403s multi-branch staff. */
  const response = await API.get<{
    success: boolean;
    data: SummaryPlan | null;
  }>("/chemotherapy/plans/latest-for-patient", {
    params: { patient_id: patientId },
  });
  return response.data?.data ?? null;
};

export interface ChemoVitalsEntry extends ChemotherapyVitalsRecord {
  vital_id?: string;
  recorded_at?: string | null;
  vital_stage?: string | null;
  oxygen_support?: boolean | null;
}

export interface ChemoAdverseEventEntry extends ChemotherapyAdverseEventRecord {
  adverse_event_id?: string;
  reaction_grade?: string | null;
  severity?: string | null;
  doctor_action?: string | null;
  nursing_action?: string | null;
  dose_reduced?: boolean | null;
  dose_delayed?: boolean | null;
  treatment_interrupted?: boolean | null;
  treatment_stopped?: boolean | null;
  hospitalization_required?: boolean | null;
}

export interface ChemoCycleDetail
  extends Omit<
    ChemotherapyCycleRecord,
    "chemotherapy_vitals" | "chemotherapy_adverse_event"
  > {
  cycle_day?: number | null;
  planned_date?: string | null;
  actual_date?: string | null;
  next_cycle_date?: string | null;
  cycle_status?: string | null;
  completion_status?: string | null;
  remarks?: string | null;
  chemotherapy_vitals?: ChemoVitalsEntry[];
  chemotherapy_adverse_event?: ChemoAdverseEventEntry[];
  chemotherapy_administration?: any[];
  [key: string]: any;
}

export const loadCycleDetail = async (
  cycleId: string
): Promise<ChemoCycleDetail | null> => {
  const response = await API.get<{ success: boolean; data: ChemoCycleDetail }>(
    `/chemotherapy/cycles/${encodeURIComponent(cycleId)}`
  );
  return response.data?.data ?? null;
};

export const loadCyclesForPlan = async (
  planId: string
): Promise<ChemoCycleDetail[]> => {
  try {
    const response = await API.get<{ success: boolean; data: ChemoCycleDetail[] }>(
      `/chemotherapy/plans/${encodeURIComponent(planId)}/cycles`
    );
    return response.data?.data ?? [];
  } catch (err) {
    console.warn(`loadCyclesForPlan failed for plan ${planId}:`, err);
    return [];
  }
};

export const loadAllPlansForPatient = async (
  patientId: string
): Promise<SummaryPlan[]> => {
  try {
    const response = await API.get<{ success: boolean; data: any }>(
      "/chemotherapy/plans",
      { params: { patient_id: patientId, limit: 50 } }
    );
    const data = response.data?.data;
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.rows)) return data.rows;
    return [];
  } catch (err) {
    console.warn(`loadAllPlansForPatient failed for ${patientId}:`, err);
    return [];
  }
};

/* ============================================================
   DISCHARGE (TAKE-HOME) MEDICINES LOADER
   GET /chemotherapy/regimen-protocols/:protocolId/discharge-medicines
   - real take-home rows saved on the patient's regimen protocol.
   ============================================================ */

export interface DischargeMedicineRecord {
  discharge_instruction_id?: string;
  protocol_id: string;
  medicine_id?: string | null;
  drug_sequence?: number | null;
  drug_from?: string | null;
  frequency?: string | null;
  composition?: string | null;
  duration?: string | null;
  patient_dose?: number | string | null;
  patient_dose_unit?: string | null;
  administration_detail?: string | null;
  dose_change?: number | string | null;
  comment?: string | null;
  medicine_master?: {
    medicine_name: string | null;
    generic_name?: string | null;
    dosage_form?: string | null;
    unit?: string | null;
  } | null;
}

export const loadDischargeMedicines = async (
  protocolId: string
): Promise<DischargeMedicineRecord[]> => {
  const response = await API.get<{
    success: boolean;
    data: DischargeMedicineRecord[];
  }>(
    `/chemotherapy/regimen-protocols/${encodeURIComponent(
      protocolId
    )}/discharge-medicines`
  );
  return response.data?.data ?? [];
};

export function useDischargeMedicines(protocolId: string) {
  const [rows, setRows] = useState<DischargeMedicineRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!protocolId) {
      setRows([]);
      setLoading(false);
      setError("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    loadDischargeMedicines(protocolId)
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((err: any) => {
        if (!cancelled) {
          setRows([]);
          setError(
            err?.response?.data?.message ||
              err?.message ||
              "Failed to load discharge medicines."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [protocolId]);

  return { rows, loading, error };
}

/* ============================================================
   LATEST PATIENT VITALS HOOK
   The freshest recorded vitals across BOTH sources for a
   patient, fetched once and shared by every portal that shows
   vitals (Order Summary header strip, Discharge portal):
   - latest OPD encounter via GET /encounters/latest
     (newest-first, branch-independent on the backend)
   - newest chemotherapy-cycle vitals row (recorded BSA source;
     missing BSA is derived from height & weight via utils/vitals)
   Merged per-field: encounter value first, chemo fallback.
   ============================================================ */

export interface LatestPatientVitalsValues {
  height: number | null;
  weight: number | null;
  bpSystolic: number | null;
  bpDiastolic: number | null;
  pulse: number | null;
  temp: number | null;
  spo2: number | null;
  bmi: number | null;
  bsa: number | null;
  painScore: number | null;
}

export interface UseLatestPatientVitalsResult {
  latestEncounter: EncounterRecord | null;
  latestChemoVitals: ChemoVitalsEntry | null;
  loading: boolean;
  adverseEventCount: number;
  vitals: LatestPatientVitalsValues;
  /** [label, display] pairs; "" means no recorded value. */
  vitalEntries: [string, string][];
  lastCheckedLabel: string;
  /** True when a fetch was blocked by branch-scope (403) - the UI
     should nudge the user to pick a branch in the header selector. */
  scopeHint: boolean;
}

export const formatLastChecked = (values: (string | null | undefined)[]) => {
  const timestamps = values
    .filter((value): value is string => !!value)
    .map((value) => new Date(value).getTime())
    .filter((time) => !Number.isNaN(time));
  if (timestamps.length === 0) return "";
  const d = new Date(Math.max(...timestamps));
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const meridiem = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `Last checked: ${String(hours).padStart(2, "0")}:${minutes} ${meridiem}`;
};

export function useLatestPatientVitals(
  patientId?: string,
  /** Changes when the user picks a different branch - triggers refetch
      so scoped calls use the fresh x-branch-id header. */
  scopeKey?: string
): UseLatestPatientVitalsResult {
  const [latestEncounter, setLatestEncounter] =
    useState<EncounterRecord | null>(null);
  const [encounterRows, setEncounterRows] =
    useState<EncounterRecord[]>([]);
  const [latestChemoVitals, setLatestChemoVitals] =
    useState<ChemoVitalsEntry | null>(null);
  const [adverseEventCount, setAdverseEventCount] = useState(0);
  const [scopeHint, setScopeHint] = useState(false);
  const [loading, setLoading] = useState(!!patientId);

  useEffect(() => {
    if (!patientId) {
      setLatestEncounter(null);
      setEncounterRows([]);
      setLatestChemoVitals(null);
      setAdverseEventCount(0);
      setScopeHint(false);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    /* Flag scope-style rejections so the UI can nudge the user to
       pick a branch ("Please select a branch first." / "No branch
       has been assigned to your account."). */
    const noteScopeError = (message?: string) => {
      if (/select a branch|branch has been assigned/i.test(message ?? "")) {
        if (!cancelled) setScopeHint(true);
      }
    };

    /* Latest OPD/encounter vitals via GET /encounters/latest
       (newest-first, branch-independent - access resolves from the
       caller's ACTIVE branch mappings server-side). Falls through to
       the branch-scoped encounter list when it fails OR comes back
       empty, so single-branch auto-scoping / a valid selection still
       shows vitals. */
    const loadEncounterVitals = async () => {
      let rows: EncounterRecord[] = [];
      let latest: EncounterRecord | null = null;
      try {
        const response = await encounterApi.getLatest(patientId, 20);
        const encs = response.data?.data?.encounters ?? [];
        rows = [...encs].sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime()
        );
        latest = rows[0] ?? null;
      } catch (error: any) {
        const message = error?.response?.data?.message;
        console.error(
          "Failed to load latest encounter vitals:",
          message ?? error
        );
        noteScopeError(message);
      }
      if (!latest || rows.length === 0) {
        try {
          const response = await encounterApi.getAll({
            patientId,
            limit: 20,
          });
          if (cancelled) return;
          rows = [...(response.data?.data?.encounters ?? [])].sort(
            (a, b) =>
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime()
          );
          latest = rows[0] ?? null;
        } catch (error: any) {
          const message = error?.response?.data?.message;
          console.error(
            "Encounter vitals fallback failed:",
            message ?? error
          );
          noteScopeError(message);
        }
      }
      if (!cancelled) {
        setLatestEncounter(latest);
        setEncounterRows(rows);
      }
    };
    loadEncounterVitals();

    /* Newest chemotherapy-cycle vitals + adverse-event count
       (single chain fetch, same as the Discharge portal used). */
    loadLatestChemoPlan(patientId)
      .then(async (loaded) => {
        const sortedCycles = [...(loaded?.chemotherapy_cycle ?? [])].sort(
          (a, b) =>
            (b.actual_date ?? b.planned_date ?? "").localeCompare(
              a.actual_date ?? a.planned_date ?? ""
            ) || b.cycle_number - a.cycle_number
        );
        const newestWithId = sortedCycles.find(
          (cycle) => cycle.chemotherapy_cycle_id
        );
        if (!newestWithId?.chemotherapy_cycle_id) return;
        try {
          const detail = await loadCycleDetail(
            newestWithId.chemotherapy_cycle_id as string
          );
          if (cancelled || !detail) return;
          const vitalsRows = (detail.chemotherapy_vitals ?? []).slice();
          vitalsRows.sort((a, b) =>
            (b.recorded_at ?? "").localeCompare(a.recorded_at ?? "")
          );
          setLatestChemoVitals(vitalsRows[0] ?? null);
          setAdverseEventCount(
            (detail.chemotherapy_adverse_event ?? []).length
          );
        } catch (error: any) {
          const message = error?.response?.data?.message;
          console.error(
            "Failed to load chemo cycle vitals:",
            message ?? error
          );
          noteScopeError(message);
          /* Vitals stay empty - panels show placeholders. */
        }
      })
      .catch((error: any) => {
        const message = error?.response?.data?.message;
        console.error(
          "Failed to load chemotherapy plan for vitals:",
          message ?? error
        );
        noteScopeError(message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [patientId, scopeKey]);

  const num = (value?: string | number | null) => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  };
  const encNum = (value: number | string | null | undefined) =>
    num(value ?? null);

  const firstNonNull = <T,>(rows: T[], getter: (r: T) => any) => {
    for (const r of rows) {
      const v = getter(r);
      if (v !== null && v !== undefined && v !== "") return v;
    }
    return null;
  };
  const firstEncounterValue = (getter: (e: EncounterRecord) => any) => {
    return firstNonNull(encounterRows, getter);
  };

  const heightValue =
    encNum(firstEncounterValue(e => e.height)) ?? num(latestChemoVitals?.height);
  const weightValue =
    encNum(firstEncounterValue(e => e.weight)) ?? num(latestChemoVitals?.weight);

  const vitals: LatestPatientVitalsValues = {
    height: heightValue,
    weight: weightValue,
    bpSystolic:
      encNum(firstEncounterValue(e => e.systolic_bp)) ??
      num(latestChemoVitals?.blood_pressure_systolic),
    bpDiastolic:
      encNum(firstEncounterValue(e => e.diastolic_bp)) ??
      num(latestChemoVitals?.blood_pressure_diastolic),
    pulse: encNum(firstEncounterValue(e => e.pulse)) ?? num(latestChemoVitals?.pulse_rate),
    temp:
      encNum(firstEncounterValue(e => e.temperature)) ??
      num(latestChemoVitals?.body_temperature),
    spo2: encNum(firstEncounterValue(e => e.spo2)) ?? num(latestChemoVitals?.spo2),
    bmi: encNum(firstEncounterValue(e => e.BMI)) ?? num(latestChemoVitals?.bmi),
    /* Recorded chemo value wins; otherwise derive from height & weight
        (Mosteller - see utils/vitals.ts). */
    bsa:
      num(latestChemoVitals?.body_surface_area) ??
      computeBsa(heightValue, weightValue),
    painScore: encNum(firstEncounterValue(e => e.pain_score)),
  };

  const vitalEntries: [string, string][] = [
    ["HEIGHT", vitals.height != null ? `${vitals.height} cm` : ""],
    [
      "BP",
      vitals.bpSystolic != null && vitals.bpDiastolic != null
        ? `${vitals.bpSystolic}/${vitals.bpDiastolic}`
        : "",
    ],
    ["WEIGHT", vitals.weight != null ? `${vitals.weight} kg` : ""],
    ["PULSE", vitals.pulse != null ? `${vitals.pulse} bpm` : ""],
    ["BSA", vitals.bsa != null ? `${vitals.bsa} m²` : ""],
    ["TEMP", vitals.temp != null ? `${vitals.temp} °C` : ""],
    ["BMI", vitals.bmi != null ? `${vitals.bmi}` : ""],
    ["SPO2", vitals.spo2 != null ? `${vitals.spo2}%` : ""],
    ["PAIN", vitals.painScore != null ? `${vitals.painScore}/10` : ""],
  ];

  const lastCheckedLabel = formatLastChecked([
    latestEncounter?.checkin_time,
    latestEncounter?.created_at,
    latestChemoVitals?.recorded_at,
  ]);

  return {
    latestEncounter,
    latestChemoVitals,
    loading,
    adverseEventCount,
    vitals,
    vitalEntries,
    lastCheckedLabel,
    scopeHint,
  };
}

/* Compact branch dropdown for the full-screen portals. They render
   OUTSIDE AppLayout, so the header BranchSelector isn't available and
   multi-branch users would otherwise 403 on every scoped call with no
   way to pick a branch on-page. Uses the real selectBranch, so the
   localStorage key and the axios x-branch-id header stay in sync with
   the rest of the app. */
export function InlineBranchPicker() {
  const { branches, loading, selectedBranchId, selectBranch } =
    useBranchFilter();
  const hasSelection =
    !!selectedBranchId &&
    selectedBranchId !== ALL_BRANCHES_VALUE &&
    selectedBranchId !== NO_BRANCH_VALUE;
  return (
    <select
      value={hasSelection ? selectedBranchId : ""}
      disabled={loading}
      onChange={(event) => selectBranch(event.target.value)}
      className="ml-2 rounded-md border border-amber-300 bg-white px-2 py-1 text-[10px] font-semibold text-[#1e293b] focus:outline-none"
    >
      {!hasSelection && <option value="">Select branch…</option>}
      {branches.map((branch) => (
        <option key={branch.id} value={branch.id}>
          {branch.name}
          {branch.area && branch.area !== "N/A" ? ` – ${branch.area}` : ""}
        </option>
      ))}
    </select>
  );
}
