import type { EncounterRecord } from "../../../api/encounter.api";

/* ============================================================
   PATIENT DETAILS - shared types
   Records the patient details page and its tabs read from the API.
   ============================================================ */

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
  drug_name?: string | null;
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
  current_order?: { chemotherapy_plan_items?: SummaryPlanItem[] | null } | null;
  oncology_staging_detail: StagingDetailRecord | null;
  doctor_name?: string | null;
};

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
  /* The visit (encounter) it was recorded in - one staging detail per visit. */
  encounter_no?: string | null;
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
  /* The doctor's own wording of the histopathology for this patient;
     null = the subtype's name. */
  histopathology?: string | null;
  ihc_results?: StagingIhcRecord | null;
  molecular_results?: StagingMolecularRecord | null;
  derived_fields?: StagingDerivedRecord | null;
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

/* A take-home (discharge) medicine saved on a regimen protocol. */
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

/* Latest recorded vitals, merged per field (see useLatestPatientVitals). */
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

/* The patient details page tabs, in display order. */
export type PatientDetailTab = "Order Summary" | "Medications" | "Discharge" | "History" | "Notes & Documents";

export const PATIENT_DETAIL_TABS: PatientDetailTab[] = [
  "Order Summary",
  "Medications",
  "Discharge",
  "History",
  "Notes & Documents",
];
