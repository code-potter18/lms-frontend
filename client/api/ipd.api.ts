import type { AxiosRequestConfig } from "axios";
import API from "./axios";

export interface CreateAdmissionPayload {
  patient_id: string;
  appointment_id?: string;
  branch_id: string;
  department_id?: string;
  employee_id?: string;
  admission_type?: string;
  ward_id?: string;
  bed_id?: string;
  is_daycare?: boolean;
  payment_mode?: string;
  insurance_provider?: string;
  insurance_policy_no?: string;
  expected_stay_days?: number;
  advance_amount?: number;
  provisional_diagnosis?: string;
  admission_date?: string;
  status?: string;
}

export interface UpdateAdmissionPayload {
  ward_id?: string;
  bed_id?: string;
  department_id?: string;
  employee_id?: string;
  admission_type?: string;
  payment_mode?: string;
  insurance_provider?: string;
  insurance_policy_no?: string;
  expected_stay_days?: number;
  advance_amount?: number;
  provisional_diagnosis?: string;
  is_daycare?: boolean;
  admission_date?: string;
  discharge_date?: string;
  discharge_type?: string;
  discharge_summary?: string;
  status?: string;
}

export interface TransferAdmissionPayload {
  targetWardId: string;
  targetBedId: string;
  reason?: string;
}

export interface DischargeAdmissionPayload {
  discharge_type?: string;
  discharge_summary?: string;
  discharge_date?: string;
}

export interface AdmissionTransferLog {
  id: string | number;
  transfer_log_id: string;
  admission_id: string;
  from_ward_id: string | null;
  from_bed_id: string | null;
  to_ward_id: string;
  to_bed_id: string;
  reason: string | null;
  transferred_by: string | null;
  transferred_at: string;
}

export interface AdmissionRecord {
  id: string | number;
  admission_id: string;
  ip_number: string;
  patient_id: string;
  appointment_id: string | null;
  encounter_no: string | null;
  branch_id: string;
  department_id: string | null;
  employee_id: string | null;
  admission_type: string;
  provisional_diagnosis: string | null;
  ward_id: string | null;
  bed_id: string | null;
  is_daycare: boolean;
  payment_mode: string | null;
  insurance_provider: string | null;
  insurance_policy_no: string | null;
  admission_date: string;
  expected_stay_days: number | null;
  discharge_date: string | null;
  discharge_type: string | null;
  discharge_summary: string | null;
  advance_amount: number | string | null;
  status: "PLANNED" | "ADMITTED" | "DISCHARGED" | "TRANSFERRED" | "CANCELLED" | "NO_SHOW" | string;
  cancellation_reason?: string | null;
  /** Display name for updated_by (details view only); null when the nightly sweep made the change. */
  updated_by_name?: string | null;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
  patient_bio_data: {
    patient_id: string;
    patient_first_name: string;
    patient_middle_name: string | null;
    patient_last_name: string | null;
    patient_gender: string | null;
    patient_contact_number?: string | null;
    patient_DOB?: string | null;
    patient_primary_mobile?: string | null;
    patient_uhid_number?: string | null;
  } | null;
  branch: {
    branch_id: string;
    branch_name: string;
    branch_area?: string | null;
  } | null;
  department_master: {
    department_id: string;
    department_name: string;
  } | null;
  employees: {
    employee_id: string;
    first_name: string;
    middle_name?: string | null;
    last_name: string;
    specialization?: string | null;
    mobile_no?: string | null;
  } | null;
  ward_master: {
    ward_id: string;
    ward_name: string;
  } | null;
  bed_master: {
    bed_id: string;
    bed_number: string;
    bed_type?: string | null;
    status?: BedStatus;
    reserved_admission_id?: string | null;
    reserved_until?: string | null;
  } | null;
  admission_transfer_log?: AdmissionTransferLog[];
}

export interface WardRecord {
  ward_id: string;
  ward_name: string;
  ward_type: string;
  floor?: string | null;
  tariff?: number | string | null;
  branch_id: string;
  total_beds: number;
  active_status: number;
  branch?: {
    branch_id: string;
    branch_name: string;
  };
  _count?: {
    bed_master: number;
    admission: number;
  };
}

// AVAILABLE -> RESERVED -> OCCUPIED -> CLEANING -> AVAILABLE (+ MAINTENANCE)
export type BedStatus = "AVAILABLE" | "RESERVED" | "OCCUPIED" | "CLEANING" | "MAINTENANCE" | string;

/** Patient summary attached to a bed on the bed board. */
export interface BedPatientSummary {
  admission_id: string;
  ip_number: string;
  admission_date: string;
  patient_bio_data: {
    patient_id: string;
    patient_first_name: string;
    patient_last_name: string | null;
    patient_gender: string | null;
  } | null;
}

export interface BedRecord {
  bed_id: string;
  ward_id: string;
  branch_id: string;
  bed_number: string;
  bed_type: string;
  tariff?: number | string | null;
  status: BedStatus;
  reserved_admission_id?: string | null;
  reserved_until?: string | null;
  remarks?: string | null;
  active_status: number;
  /** Admitted patient in this bed (OCCUPIED beds). */
  occupant?: BedPatientSummary | null;
  /** Planned admission holding this bed (RESERVED beds). */
  reserved_for?: BedPatientSummary | null;
  ward_master?: {
    ward_id: string;
    ward_name: string;
    branch_id: string;
  };
}

export interface UpdateBedStatusPayload {
  status: "AVAILABLE" | "CLEANING" | "MAINTENANCE";
  remarks?: string;
}

// Daycare booking: doctor OPD slot + PLANNED daycare admission (ward required,
// bed optional, expected_stay_days > 0 and <= 1).
export interface CreateDaycarePayload {
  patient_id: string;
  branch_id: string;
  department_id: string;
  employee_id: string;
  appointment_date: string; // yyyy-MM-dd
  appointment_time: string; // HH:mm
  ward_id: string;
  bed_id?: string;
  expected_stay_days: number;
  payment_mode?: string;
  advance_amount?: number;
  provisional_diagnosis?: string;
  reason_for_visit?: string;
}

/** Capacity of a daycare ward on one day and the sessions already booked in it. */
export interface DaycareOccupancy {
  ward_id: string;
  date: string;
  capacity: number;
  bookings: { ip_number: string; status: string; start: string; end: string }[];
}

export interface GetAdmissionsParams {
  branchId?: string;
  status?: string;
  wardId?: string;
  patientId?: string;
  date?: string;
  search?: string;
  page?: number;
  limit?: number;
  sortField?: string;
  sortDirection?: "asc" | "desc";
}

export interface CreateWardPayload {
  branch_id: string;
  ward_name: string;
  ward_type?: string;
  floor?: string;
  total_beds?: number;
  tariff?: number;
}

export interface CreateBedPayload {
  ward_id: string;
  branch_id?: string;
  bed_number: string;
  bed_type?: string;
  tariff?: number;
  status?: string;
}

export interface UpdateWardPayload {
  ward_name?: string;
  ward_type?: string;
  floor?: string;
  tariff?: number;
  active_status?: number;
}

export interface UpdateBedPayload {
  bed_number?: string;
  bed_type?: string;
  tariff?: number;
  ward_id?: string;
  active_status?: number;
}

export const ipdApi = {
  create: (data: CreateAdmissionPayload) =>
    API.post<{ success: boolean; message: string; data: AdmissionRecord }>("/ipd", data),

  getAll: (params?: GetAdmissionsParams, config?: AxiosRequestConfig) =>
    API.get<{
      success: boolean;
      message: string;
      data: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
        admissions: AdmissionRecord[];
      };
    }>("/ipd", { params, ...config }),

  getByIpNumber: (ipNumber: string, config?: AxiosRequestConfig) =>
    API.get<{ success: boolean; message?: string; data: AdmissionRecord }>(`/ipd/${ipNumber}`, config),

  update: (id: string, data: UpdateAdmissionPayload) =>
    API.patch<{ success: boolean; message: string; data: AdmissionRecord }>(`/ipd/${id}`, data),

  // PLANNED -> ADMITTED: occupies the bed, stamps the admit time and opens the
  // IPD encounter in one backend transaction. ward_id/bed_id override the
  // requested ones.
  admit: (id: string, data: { ward_id?: string; bed_id?: string } = {}) =>
    API.post<{ success: boolean; message: string; data: AdmissionRecord }>(`/ipd/${id}/admit`, data),

  cancel: (id: string, reason?: string) =>
    API.post<{ success: boolean; message: string; data: AdmissionRecord }>(`/ipd/${id}/cancel`, { reason }),

  noShow: (id: string, reason?: string) =>
    API.post<{ success: boolean; message: string; data: AdmissionRecord }>(`/ipd/${id}/no-show`, { reason }),

  // Holds a bed for a planned admission until the end of its planned day.
  reserve: (id: string, data: { ward_id?: string; bed_id?: string } = {}) =>
    API.post<{ success: boolean; message: string; data: AdmissionRecord }>(`/ipd/${id}/reserve`, data),

  createDaycare: (data: CreateDaycarePayload) =>
    API.post<{ success: boolean; message: string; data: AdmissionRecord }>("/ipd/daycare", data),

  getDaycareOccupancy: (wardId: string, date: string) =>
    API.get<{ success: boolean; data: DaycareOccupancy }>("/ipd/daycare/occupancy", { params: { wardId, date } }),

  releaseReservation: (id: string) =>
    API.post<{ success: boolean; message: string; data: AdmissionRecord }>(`/ipd/${id}/release-reservation`),

  discharge: (id: string, data: DischargeAdmissionPayload) =>
    API.post<{ success: boolean; message: string; data: AdmissionRecord }>(`/ipd/${id}/discharge`, data),

  transfer: (id: string, data: TransferAdmissionPayload) =>
    API.post<{ success: boolean; message: string; data: any }>(`/ipd/${id}/transfer`, data),

  getTodayStats: (branchId?: string) =>
    API.get<{ success: boolean; message: string; data: { totalPatients: number } }>("/ipd/stats/patients-today", {
      params: branchId ? { branchId } : undefined,
    }),

  getOverview: (branchId?: string) =>
    API.get<{
      success: boolean;
      message: string;
      data: { totalPatients: number; bedsOccupied: number; totalBeds: number };
    }>("/ipd/stats/overview", {
      params: branchId ? { branchId } : undefined,
    }),

  getWards: (branchId?: string) =>
    API.get<{ success: boolean; message: string; data: WardRecord[] }>("/ipd/wards", {
      params: branchId ? { branchId } : undefined,
    }),

  createWard: (data: CreateWardPayload) =>
    API.post<{ success: boolean; message: string; data: WardRecord }>("/ipd/wards", data),

  updateWard: (wardId: string, data: UpdateWardPayload) =>
    API.patch<{ success: boolean; message: string; data: WardRecord }>(`/ipd/wards/${wardId}`, data),

  deleteWard: (wardId: string) =>
    API.delete<{ success: boolean; message: string; data: WardRecord }>(`/ipd/wards/${wardId}`),

  getBeds: (wardId?: string, branchId?: string) =>
    API.get<{ success: boolean; message: string; data: BedRecord[] }>("/ipd/beds", {
      params: { ...(wardId ? { wardId } : {}), ...(branchId ? { branchId } : {}) },
    }),

  createBed: (data: CreateBedPayload) =>
    API.post<{ success: boolean; message: string; data: BedRecord }>("/ipd/beds", data),

  updateBed: (bedId: string, data: UpdateBedPayload) =>
    API.patch<{ success: boolean; message: string; data: BedRecord }>(`/ipd/beds/${bedId}`, data),

  deleteBed: (bedId: string) =>
    API.delete<{ success: boolean; message: string; data: BedRecord }>(`/ipd/beds/${bedId}`),

  updateBedStatus: (bedId: string, data: UpdateBedStatusPayload) =>
    API.patch<{ success: boolean; message: string; data: BedRecord }>(`/ipd/beds/${bedId}/status`, data),
};

