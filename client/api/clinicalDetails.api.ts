import API from "./axios";

/* ============================================================
   MASTER / REFERENCE OPTIONS
   These come from the reference tables (performance_status_master,
   symptom_master, allergy_master, comorbidity_master). The snake_case fields
   match the raw Prisma records returned by the backend master lists.
============================================================ */

export interface PerformanceStatusOption {
  id: string;
  code: string;
  description: string;
  display_order: number;
  is_active: boolean;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface SymptomOption {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  category?: string | null;
  body_system?: string | null;
  is_active: boolean;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface AllergyOption {
  id: string;
  code: string;
  substance_name: string;
  substance_type: string;
  description?: string | null;
  severity_level?: string | null;
  is_active: boolean;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

/* A comorbidity_master row (ids are BigInt, serialised as strings). */
export interface ComorbidityOption {
  id: string;
  code: string;
  comorbidity_name: string;
  category: string | null;
  icd_code: string | null;
  is_custom: boolean;
  is_active: boolean;
}

/* ============================================================
   SAVED CLINICAL RECORDS
   These are the patient/encounter-level saved values returned by
   GET /api/clinical-details/encounters/:encounterNo (camelCase).
============================================================ */

export interface EncounterPerformanceStatus {
  id: string;
  code: string;
  description: string;
  assessedAt: string;
  assessedBy: string | null;
  clinicalNotes: string | null;
}

export type DurationUnit = "day" | "week" | "month" | "year";

export interface EncounterSymptom {
  id: string;
  symptomId: string;
  symptomCode: string;
  symptomName: string;
  severity: string | null;
  durationDays: number | null;
  /* The unit chosen in the editor; durationDays stays the canonical value. */
  durationUnit: string | null;
  onsetDate: string | null;
  clinicalNotes: string | null;
  status: string;
  recordedAt: string;
  recordedBy: string | null;
}

export interface PatientAllergy {
  id: string;
  allergyId: string;
  allergyCode: string;
  substanceName: string;
  substanceType: string;
  reaction: string | null;
  severity: string | null;
  durationValue: number | null;
  durationUnit: string | null;
  status: string;
  identifiedAt: string;
  identifiedBy: string | null;
  identifiedAtEncounterNo: string | null;
  /* Command(s) entered in the consultation (stored in clinical_notes). */
  clinicalNotes: string | null;
}

export interface PatientComorbidity {
  id: string;
  comorbidityId: string;
  comorbidityCode: string;
  comorbidityName: string;
  category: string | null;
  icdCode: string | null;
  status: string;
  onsetDate: string | null;
  durationValue: number | null;
  durationUnit: string | null;
  identifiedAt: string;
  identifiedBy: string | null;
  identifiedAtEncounterNo: string | null;
  /* Command(s) entered in the consultation (stored in clinical_notes). */
  clinicalNotes: string | null;
}

export interface EncounterClinicalDetails {
  encounter: {
    encounterNo: string;
    patientId: string;
    encounterTs: string;
    status: string;
  };
  performanceStatus: EncounterPerformanceStatus | null;
  symptoms: EncounterSymptom[];
  allergies: PatientAllergy[];
  comorbidities: PatientComorbidity[];
}

/* ============================================================
   SAVE PAYLOADS
============================================================ */

export interface SetPerformanceStatusPayload {
  performanceStatusId: number;
  clinicalNotes?: string;
}

export interface AddEncounterSymptomPayload {
  symptomId: number;
  severity?: string;
  durationDays?: number | null;
  durationUnit?: DurationUnit | null;
  onsetDate?: string | null;
  clinicalNotes?: string | null;
}

export interface UpdateEncounterSymptomPayload {
  severity?: string;
  durationDays?: number | null;
  durationUnit?: DurationUnit | null;
  onsetDate?: string | null;
  clinicalNotes?: string | null;
  status?: string;
}

export interface AddPatientAllergyPayload {
  allergyId: number;
  reaction?: string | null;
  severity?: string;
  durationValue?: number | null;
  durationUnit?: DurationUnit | null;
  status?: string;
  identifiedAtEncounterNo?: string;
  clinicalNotes?: string | null;
}

export interface UpdatePatientAllergyPayload {
  reaction?: string | null;
  severity?: string;
  durationValue?: number | null;
  durationUnit?: DurationUnit | null;
  status?: string;
  clinicalNotes?: string | null;
}

export interface AddPatientComorbidityPayload {
  comorbidityId: string;
  status?: string;
  onsetDate?: string | null;
  durationValue?: number | null;
  durationUnit?: DurationUnit | null;
  identifiedAtEncounterNo?: string;
  clinicalNotes?: string | null;
}

export interface UpdatePatientComorbidityPayload {
  status?: string;
  onsetDate?: string | null;
  durationValue?: number | null;
  durationUnit?: DurationUnit | null;
  clinicalNotes?: string | null;
}

export interface CreateCustomSymptomPayload {
  name: string;
}

export interface CreateCustomAllergyPayload {
  substanceName: string;
}

export interface CreateCustomComorbidityPayload {
  comorbidityName: string;
  category?: string;
  icdCode?: string;
}

/* ============================================================
   GENERIC RESPONSE SHAPES
============================================================ */

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: Array<{ msg?: string; [key: string]: unknown }>;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/* ============================================================
   API
============================================================ */

export const clinicalDetailsApi = {
  // ---------------- Master / reference data ----------------

  getPerformanceStatusOptions: () =>
    API.get<ApiResponse<PaginatedResponse<PerformanceStatusOption>>>(
      "/clinical-details/master/performance-status",
      { params: { page: 1, limit: 100, isActive: true } },
    ),

  getSymptomOptions: () =>
    API.get<ApiResponse<PaginatedResponse<SymptomOption>>>(
      "/clinical-details/master/symptoms",
      { params: { page: 1, limit: 100, isActive: true } },
    ),

  getAllergyOptions: () =>
    API.get<ApiResponse<PaginatedResponse<AllergyOption>>>(
      "/clinical-details/master/allergies",
      { params: { page: 1, limit: 100, isActive: true } },
    ),

  getComorbidityMaster: () =>
    API.get<ApiResponse<ComorbidityOption[]>>(
      "/clinical-details/master/comorbidities",
    ),

  // ---------------- Consolidated GET ----------------

  getEncounterClinicalDetails: (encounterNo: string) =>
    API.get<ApiResponse<EncounterClinicalDetails>>(
      `/clinical-details/encounters/${encounterNo}`,
    ),

  // ---------------- ECOG (encounter-specific) ----------------

  setEncounterPerformanceStatus: (
    encounterNo: string,
    data: SetPerformanceStatusPayload,
  ) =>
    API.put<ApiResponse<unknown>>(
      `/clinical-details/encounters/${encounterNo}/performance-status`,
      data,
    ),

  // ---------------- Symptoms (encounter-specific) ----------------

  addEncounterSymptom: (
    encounterNo: string,
    data: AddEncounterSymptomPayload,
  ) =>
    API.post<ApiResponse<unknown>>(
      `/clinical-details/encounters/${encounterNo}/symptoms`,
      data,
    ),

  updateEncounterSymptom: (
    encounterNo: string,
    symptomId: number,
    data: UpdateEncounterSymptomPayload,
  ) =>
    API.put<ApiResponse<unknown>>(
      `/clinical-details/encounters/${encounterNo}/symptoms/${symptomId}`,
      data,
    ),

  removeEncounterSymptom: (encounterNo: string, symptomId: number) =>
    API.delete<ApiResponse<unknown>>(
      `/clinical-details/encounters/${encounterNo}/symptoms/${symptomId}`,
    ),

  // ---------------- Allergies (patient-level, longitudinal) ----------------

  addPatientAllergy: (
    patientId: string,
    data: AddPatientAllergyPayload,
  ) =>
    API.post<ApiResponse<unknown>>(
      `/clinical-details/patients/${patientId}/allergies`,
      data,
    ),

  updatePatientAllergy: (
    patientId: string,
    recordId: number,
    data: UpdatePatientAllergyPayload,
  ) =>
    API.put<ApiResponse<unknown>>(
      `/clinical-details/patients/${patientId}/allergies/${recordId}`,
      data,
    ),

  removePatientAllergy: (patientId: string, recordId: number) =>
    API.delete<ApiResponse<unknown>>(
      `/clinical-details/patients/${patientId}/allergies/${recordId}`,
    ),

  // ---------------- Comorbidities (patient-level, longitudinal) ----------------

  addPatientComorbidity: (
    patientId: string,
    data: AddPatientComorbidityPayload,
  ) =>
    API.post<ApiResponse<unknown>>(
      `/clinical-details/patients/${patientId}/comorbidities`,
      data,
    ),

  updatePatientComorbidity: (
    patientId: string,
    recordId: number,
    data: UpdatePatientComorbidityPayload,
  ) =>
    API.put<ApiResponse<unknown>>(
      `/clinical-details/patients/${patientId}/comorbidities/${recordId}`,
      data,
    ),

  removePatientComorbidity: (patientId: string, recordId: number) =>
    API.delete<ApiResponse<unknown>>(
      `/clinical-details/patients/${patientId}/comorbidities/${recordId}`,
    ),

  // ---------------- Custom "Others" master creation ----------------

  createCustomSymptom: (data: CreateCustomSymptomPayload) =>
    API.post<ApiResponse<SymptomOption>>(
      "/clinical-details/master/symptoms/custom",
      data,
    ),

  createCustomAllergy: (data: CreateCustomAllergyPayload) =>
    API.post<ApiResponse<AllergyOption>>(
      "/clinical-details/master/allergies/custom",
      data,
    ),

  createCustomComorbidity: (data: CreateCustomComorbidityPayload) =>
    API.post<ApiResponse<ComorbidityOption>>(
      "/clinical-details/master/comorbidities/custom",
      data,
    ),
};

/* ============================================================
   ERROR MESSAGE HELPER
   Maps backend response statuses to useful user-facing messages.
============================================================ */

export function getApiErrorMessage(
  err: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  const error = err as {
    response?: {
      status?: number;
      data?: {
        message?: string;
        errors?: Array<{ msg?: string }>;
      };
    };
    message?: string;
  };

  const status = error?.response?.status;
  const serverMessage = error?.response?.data?.message;
  const errors = error?.response?.data?.errors;

  switch (status) {
    case 400:
      return serverMessage || "The request was invalid. Please review your input.";
    case 401:
      return "Your session has expired. Please log in again.";
    case 403:
      return serverMessage || "You do not have permission to perform this action.";
    case 404:
      return serverMessage || "The requested record was not found.";
    case 409:
      return serverMessage || "A record with this value already exists.";
    case 422:
      if (Array.isArray(errors) && errors.length > 0) {
        return errors
          .map((e) => e?.msg)
          .filter(Boolean)
          .join(", ");
      }
      return serverMessage || "Some of the submitted values are invalid.";
    case 500:
      return serverMessage || "The server encountered an error. Please try again.";
    default:
      return serverMessage || fallback;
  }
}