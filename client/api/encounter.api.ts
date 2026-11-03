import type { AxiosRequestConfig } from "axios";
import API from "./axios";

export interface CreateEncounterPayload {
  appointment_id: string;
}

export interface CreateIpdEncounterPayload {
  admission_id: string;
}

export interface VitalsLogEntry {
  entry_id?: string;
  recorded_at: string;
  recorded_by?: string | null;
  recorded_by_name?: string | null;
  systolic_bp?: number | null;
  diastolic_bp?: number | null;
  pulse?: number | null;
  respiratory_rate?: number | null;
  spo2?: number | null;
  temperature?: number | null;
  height?: number | null;
  weight?: number | null;
  bmi?: number | null;
  blood_sugar?: number | string | null;
  pain_score?: number | string | null;
  remarks?: string | null;
}

export interface EncounterRecord {
  encounter_id: string;
  encounter_no: string;
  patient_id: string;
  branch_id: string;
  department_id: string | null;
  appointment_id: string;
  employee_id: string;
  schedule_id: string | number;
  encounter_type: string;
  encounter_ts?: string | null;
  status: string;
  chief_complaint: string | null;
  symptoms: string | null;
  diagnosis_id: string | null;
  diagnosis_text?: string | null;
  clinical_notes: string | null;
  advice: string | null;
  /* Consultation > Advice > Discussion: the doctor's remarks for the visit. */
  notes?: string | null;
  follow_up_date: string | null;
  history_of_present_illness: string | null;
  cns_examination: string | null;
  cvs_examination: string | null;
  per_abdomen_examination: string | null;
  clinical_findings: string | null;
  respiratory_examination: string | null;
  general_examination_icterus: boolean | null;
  general_examination_pallor: boolean | null;
  general_examination_clubbing: boolean | null;
  general_examination_cyanosis: boolean | null;
  general_examination_oedema: boolean | null;
  general_examination_lymphadenopathy: boolean | null;
  /* Extra findings ticked from general_examination_master. */
  general_examination_others?: { code: string; name: string }[] | null;
  past_history_treatment_type: string | null;
  past_history_treatment_date: string | null;
  past_history_treatment_note: string | null;
  past_history_treatment_response: string | null;
  previous_reports: string | null;
   height: number | null;
   weight: number | null;
   pulse: number | null;
   systolic_bp: number | null;
   diastolic_bp: number | null;
   temperature: number | null;
   respiratory_rate: number | null;
   spo2: number | null;
   blood_sugar: number | string | null;
   pain_score: number | string | null;
   BMI: number | string | null;
   remarks?: string | null;
   vitals_log?: VitalsLogEntry[] | null;
  checkin_time: string | null;
  checkout_time: string | null;
  closed_by: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  patient_bio_data: {
    patient_id: string;
    patient_first_name: string;
    patient_middle_name: string | null;
    patient_last_name: string | null;
    patient_gender: string | null;
    patient_primary_mobile: string | null;
  } | null;
  employees: {
    employee_id: string;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    specialization: string | null;
    mobile_no: string;
  } | null;
  branch: {
    branch_id: string;
    branch_name: string;
    branch_area: string | null;
  } | null;
  department_master: {
    department_id: string;
    department_name: string;
  } | null;
  appointment: {
    appointment_id: string;
    appointment_date: string;
    appointment_time: string;
    status: string | null;
  } | null;
}

export interface GetEncountersParams {
  branchId?: string;
  doctorId?: string;
  patientId?: string;
  appointmentId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export interface PatientHistoryPayload {
  patientId: string;
  appointmentId?: string;
  systolicBp?: number;
  diastolicBp?: number;
  pulse?: number;
  respiratoryRate?: number;
  temperature?: number;
  oxygenSaturation?: number;
  bloodSugar?: string;
  weight?: number;
  height?: number;
  painScore?: number;
  severity?: number;
  clinicalNotes?: string;
}

export interface PatientHistoryResponse {
  patientHistoryId: string;
  patientId: string;
  appointmentId: string | null;
  visitDate: string;
  systolicBp: number | null;
  diastolicBp: number | null;
  pulse: number | null;
  respiratoryRate: number | null;
  temperature: number | null;
  oxygenSaturation: number | null;
  bloodSugar: string | null;
  weight: number | null;
  height: number | null;
  bmi: number | null;
  painScore: number | null;
  severity: number | null;
  visitType: string;
  visitStatus: string;
  clinicalNotes: string | null;
}

export const encounterApi = {
  create: (data: CreateEncounterPayload) =>
    API.post<{ success: boolean; message: string; data: EncounterRecord }>("/encounters", data),

  createIpd: (data: CreateIpdEncounterPayload) =>
    API.post<{ success: boolean; message: string; data: EncounterRecord }>(
      "/encounters/ipd",
      data,
    ),

  getAll: (params?: GetEncountersParams, config?: AxiosRequestConfig) =>
    API.get<{
      success: boolean;
      message: string;
      data: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
        encounters: EncounterRecord[];
      };
    }>("/encounters", { params, ...config }),

  getByNumber: (encounterNo: string, config?: AxiosRequestConfig) =>
    API.get<{ success: boolean; data: EncounterRecord }>(`/encounters/${encounterNo}`, config),

  /**
   * Selection-independent lookup used by clinical flows. The backend checks
   * the caller's active branch mappings against the encounter's branch, so
   * this works for multi-branch doctors even when no branch is selected.
   */
  getByAppointment: (appointmentId: string) =>
    API.get<{ success: boolean; data: EncounterRecord }>(
      `/encounters/by-appointment/${appointmentId}`,
    ),

  // Direct lookup by encounter number (GET /encounters/:encounterNo) -- used
  // where there's no appointment to key off, e.g. an IPD encounter created
  // from an admission rather than a check-in.
  getByEncounterNo: (encounterNo: string) =>
    API.get<{ success: boolean; data: EncounterRecord }>(
      `/encounters/${encounterNo}`,
    ),

  /**
   * Newest-first encounters for a patient (GET /encounters/latest).
   * Branch-independent on the backend - access is resolved from the
   * caller's active branch mappings, so this works for multi-branch
   * staff even when no branch is selected.
   */
  getLatest: (patientId: string, limit?: number) =>
    API.get<{
      success: boolean;
      message: string;
      data: { encounters: EncounterRecord[] };
    }>("/encounters/latest", {
      params: { patientId, ...(limit ? { limit } : {}) },
    }),

  update: (encounterNo: string, data: Partial<EncounterRecord>) =>
    API.put<{ success: boolean; message: string; data: EncounterRecord }>(
      `/encounters/${encounterNo}`,
      data,
    ),

  updateVitalsEntry: (encounterNo: string, entryId: string, data: any) =>
    API.put<{ success: boolean; message: string; data: EncounterRecord }>(
      `/encounters/${encounterNo}/vitals-log/${encodeURIComponent(entryId)}`,
      data,
    ),

  deleteVitalsEntry: (encounterNo: string, entryId: string) =>
    API.delete<{ success: boolean; message: string; data: EncounterRecord }>(
      `/encounters/${encounterNo}/vitals-log/${encodeURIComponent(entryId)}`,
    ),

  close: (encounterNo: string, closedBy: string) =>
    API.put<{ success: boolean; message: string; data: EncounterRecord }>(
      `/encounters/${encounterNo}/close`,
      { closedBy },
    ),

  createPatientHistory: (data: PatientHistoryPayload) =>
    API.post<{ success: boolean; data: PatientHistoryResponse }>("/patients/history", data),
};