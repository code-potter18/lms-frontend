import API from "./axios";

// Matches the real backend `CreatePatientRequest`
// (Backend/HMS_Backend/src/modules/patient/patient.types.ts) — plain field
// names. The "patient_" prefix only exists on the patient_bio_data DB
// columns; the service maps these plain names onto those columns itself.
export interface CreatePatientPayload {
  username: string;
  password: string;
  first_name: string;
  middle_name?: string;
  last_name?: string;
  gender?: string;
  dob?: string;
  age?: number;
  blood_group?: string;
  mobile: string;
  alternate_mobile?: string;
  email?: string;
  marital_status?: string;
  nationality?: string;
  patient_type?: string;
  patient_state?: string;
  patient_district?: string;
  patient_area?: string;
  patient_pincode?: number;
  current_address?: string;
  emergency_name?: string;
  emergency_relation?: string;
  emergency_mobile?: string;
  // Referral details — sent as null unless patient_type === "Referral"
  referral_type?: string | null;
  referred_by?: string | null;
  referral_contact?: string | null;
  referral_notes?: string | null;
  referral_address?: string | null;
  referral_mail?: string | null;
  referral_branch_name?: string | null;
  photo?: string;
  branch_id: string;
  created_by: string;
}

export interface PatientResponse {
  patient_id: string;
  username: string;
  first_name: string;
  middle_name?: string;
  last_name?: string;
  gender?: string;
  dob?: string;
  age?: number;
  blood_group?: string;
  mobile: string;
  alternate_mobile?: string;
  email?: string;
  marital_status?: string;
  nationality?: string;
  patient_type?: string;
  photo?: string;
  branch_id: string;
  current_address?: string;
  permanent_address?: string;
  emergency_mobile?: string;
  emergency_name?: string;
  emergency_relation?: string;
  created_at: string;
  updated_at: string;
}

export interface UpdatePatientPayload {
  branch_id: string;
  first_name: string;
  middle_name?: string;
  last_name?: string;
  gender?: string;
  dob?: string;
  blood_group?: string;
  mobile: string;
  alternate_mobile?: string;
  email?: string;
  marital_status?: string;
  nationality?: string;
  patient_type?: string;
  patient_state?: string;
  patient_district?: string;
  patient_area?: string;
  patient_pincode?: number;
  current_address?: string;
  emergency_name?: string;
  emergency_relation?: string;
  emergency_mobile?: string;
  // Referral details — sent as null unless patient_type === "Referral"
  referral_type?: string | null;
  referred_by?: string | null;
  referral_contact?: string | null;
  referral_notes?: string | null;
  referral_address?: string | null;
  referral_mail?: string | null;
  referral_branch_name?: string | null;
  photo?: string;
}

// Shape actually returned by GET /patients — matches the real `patient_bio_data`
// columns plus the `branch`/`user_table` relations the repository includes
// (see Backend/HMS_Backend patient.repository.ts getPatients). Note this does
// NOT include diagnosis or assigned-doctor info — getPatients doesn't join
// patient_history/appointment_history, so that data isn't available yet.
export interface PatientRecord {
  patient_id: string;
  user_id: string | null;
  branch_id: string | null;
  patient_first_name: string;
  patient_middle_name: string | null;
  patient_last_name: string | null;
  patient_gender: string | null;
  patient_dob: string | null;
  patient_age: number | null;
  patient_blood_group: string | null;
  patient_primary_mobile: string | null;
  patient_alternate_mobile: string | null;
  patient_email: string | null;
  patient_marital_status: string | null;
  patient_nationality: string | null;
  patient_photo_url: string | null;
  patient_type: string | null;
  patient_active: string | null;
  patient_state: string | null;
  patient_district: string | null;
  patient_area: string | null;
  patient_pincode: number | null;
  Patient_address?: string | null;
  patient_address?: string | null;
  current_address?: string | null;
  // Referral details columns on patient_bio_data
  referral_type?: string | null;
  referred_by?: string | null;
  referral_contact?: string | null;
  referral_notes?: string | null;
  referral_address?: string | null;
  referral_mail?: string | null;
  referral_branch_name?: string | null;
  branch: { branch_name: string | null } | null;
  user_table: { role_type: string | null; user_status: number | null; created_at?: string | null } | null;
}

export interface GetPatientsParams {
  branchId?: string;
  patientType?: string;
  status?: string;
  search?: string;
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string;   // YYYY-MM-DD
  page?: number;
  limit?: number;
}

export const patientApi = {
  // Real route is POST /api/patients/create (see patient.routes.ts).
  create: (data: CreatePatientPayload) =>
    API.post<{ success: boolean; message: string; data?: unknown }>("/patients/create", data),

  getAll: (params?: GetPatientsParams) => {
    const { branchId, ...rest } = params ?? {};
    return API.get<{
      success: boolean;
      message: string;
      data: { total: number; page: number; limit: number; totalPages: number; patients: PatientRecord[] };
    }>("/patients", { params: rest }).catch(err => {
      if (err?.response?.status === 403) {
        return { data: { success: true, message: '', data: { total: 0, page: 1, limit: rest.limit ?? 1000, totalPages: 0, patients: [] } } } as any;
      }
      throw err;
    });
  },

  getById: (patientId: string, config?: { signal?: AbortSignal }) =>
    API.get<{ success: boolean; data: PatientRecord }>(`/patients/${patientId}`, config),

  update: (patientId: string, data: UpdatePatientPayload) =>
    API.put<{ success: boolean; message: string; data?: unknown }>(`/patients/${patientId}`, data),
};
