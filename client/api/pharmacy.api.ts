import type { AxiosRequestConfig } from "axios";
import API from "./axios";

export type PharmacySlipStatus = "DRAFT" | "ISSUED" | "CANCELLED";

/*
 * One medicine line as the backend resolves it from a chemotherapy plan.
 *
 * `dose` is the clinical dose the doctor ordered; `quantity` is the whole-pack
 * count the pharmacy fills in. They are different quantities of the same drug,
 * so a chemo order leaves `quantity` empty for the pharmacist.
 */
export interface ResolvedMedicationLine {
  medicine_id?: string | null;
  drug_name?: string | null;
  brand_name?: string | null;
  dose?: string | null;
  dose_unit?: string | null;
  quantity?: number | null;
  drug_role?: string | null;
  route?: string | null;
  frequency?: string | null;
  duration?: string | null;
  instructions?: string | null;
}

export interface SlipPreview {
  lines: ResolvedMedicationLine[];
  patient_id: string;
  branch_id: string;
  encounter_no?: string | null;
  appointment_id?: string | null;
  plan_order_id?: string | null;
  cycle_number?: number | null;
  cycle_day?: number | null;
  protocol_name?: string | null;
  regimen_name?: string | null;
  // The live slip already covering this cycle day's order, if any. When
  // present the page shows that slip instead of a fresh resolve, so a dispensed
  // document is never silently replaced by a re-resolve.
  existing_slip?: PharmacySlipRecord | null;
}

export interface PharmacySlipItem {
  pharmacy_slip_item_id: string;
  pharmacy_slip_id: string;
  display_order: number;
  medicine_id: string | null;
  drug_name: string | null;
  brand_name: string | null;
  dose: string | null;
  dose_unit: string | null;
  quantity: number | null;
  drug_role: string | null;
  route: string | null;
  frequency: string | null;
  duration: string | null;
  instructions: string | null;
}

export interface PharmacySlipRecord {
  pharmacy_slip_id: string;
  patient_id: string;
  branch_id: string;
  encounter_no: string | null;
  appointment_id: string | null;
  plan_order_id: string | null;
  cycle_number: number | null;
  cycle_day: number | null;
  protocol_name: string | null;
  regimen_name: string | null;
  slip_status: PharmacySlipStatus | string;
  issued_at: string | null;
  issued_by: string | null;
  printed_at: string | null;
  printed_by: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_by: string | null;
  updated_at: string | null;
  patient_bio_data?: {
    patient_id?: string;
    patient_first_name?: string | null;
    patient_last_name?: string | null;
  } | null;
  pharmacy_slip_item?: PharmacySlipItem[];
}

export interface UpdateSlipItemsPayload {
  items: {
    pharmacy_slip_item_id: string;
    quantity?: number | null;
  }[];
}

export interface GetSlipsParams {
  status?: PharmacySlipStatus;
  plan_id?: string;
  patient_id?: string;
  branch_id?: string;
  appointment_id?: string;
  cycle_number?: number;
  date_from?: string;
  date_to?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export const pharmacyApi = {
  previewFromPlan: (planId: string, config?: AxiosRequestConfig) =>
    API.get<{ success: boolean; message: string; data: SlipPreview }>(`/pharmacy/slips/preview/plan/${planId}`, config),

  createFromPlan: (data: { plan_id: string }) =>
    API.post<{ success: boolean; message: string; data: PharmacySlipRecord }>("/pharmacy/slips/from-plan", data),

  getAll: (params?: GetSlipsParams, config?: AxiosRequestConfig) =>
    API.get<{
      success: boolean;
      message: string;
      rows: PharmacySlipRecord[];
      total: number;
      page: number;
      limit: number;
    }>("/pharmacy/slips", { params, ...config }),

  getById: (pharmacySlipId: string, config?: AxiosRequestConfig) =>
    API.get<{ success: boolean; message: string; data: PharmacySlipRecord }>(
      `/pharmacy/slips/${pharmacySlipId}`,
      config
    ),

  // Lines omitted from `items` are deleted, which is how the UI's delete
  // button persists.
  updateItems: (pharmacySlipId: string, data: UpdateSlipItemsPayload) =>
    API.put<{ success: boolean; message: string; data: PharmacySlipRecord }>(
      `/pharmacy/slips/${pharmacySlipId}/items`,
      data
    ),

  cancel: (pharmacySlipId: string, data: { reason: string }) =>
    API.post<{ success: boolean; message: string; data: PharmacySlipRecord }>(
      `/pharmacy/slips/${pharmacySlipId}/cancel`,
      data
    ),

  // Printing finalises a DRAFT: it moves to ISSUED and freezes the lines. A
  // reprint only restamps printed_at.
  markPrinted: (pharmacySlipId: string, data: { printed_by?: string | null } = {}) =>
    API.post<{ success: boolean; message: string; data: PharmacySlipRecord }>(
      `/pharmacy/slips/${pharmacySlipId}/print`,
      data
    ),
};