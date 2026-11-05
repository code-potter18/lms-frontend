import API from "./axios";

export interface TransferWorkingHour {
  branch_id: string;
  day_of_week: string;
  shift_name: string;
  start_time: string;
  end_time: string;
}

export type TransferMode = "TRANSFER" | "ADD_BRANCH";

export interface InitiateTransferPayload {
  mode: TransferMode;
  // Required when mode === "TRANSFER" — the branch the doctor is leaving.
  old_branch_id?: string;
  // Slot-level move (schedule grid): close EXACTLY these schedule rows and
  // nothing else. Mutually exclusive with old_branch_id.
  close_schedule_ids?: number[];
  new_branch_id: string;
  new_department_id?: string;
  effective_date: string;
  transfer_reason: string;
  working_hours?: TransferWorkingHour[];
  consultation_minutes?: number;

  // Date-specific schedule change routed through the transfer flow so
  // ADD/OVERRIDE/CANCEL notes get the appointment-protection popup.
  schedule_change?: {
    action: "CREATE" | "UPDATE" | "DELETE";
    mode: "ADD" | "OVERRIDE" | "CANCEL";
    branch_id: string;
    change_date: string;
    start_time?: string;
    end_time?: string;
    reason?: string;
    change_id?: number;
    consultation_minutes?: number;
  };
}

export interface TransferAppointmentSummary {
  appointment_id: string;
  patient_id: string;
  patient_name: string;
  patient_mobile: string | null;
  branch_id: string | null;
  department_id: string | null;
  schedule_id: string | number | null;
  appointment_date: string;
  appointment_time: string;
  status: string | null;
  eligible_replacement_doctors?: { employee_id: string; name: string }[];
}

export interface InitiateTransferResult {
  transfer_id: string;
  status: string;
  message: string;
  affected_appointment_count: number;
  appointments?: TransferAppointmentSummary[];
  actions_required?: string[];
}

export type TransferAction = "TRANSFER" | "RESCHEDULE" | "CANCEL";

export interface ConfirmTransferPayload {
  transfer_id: string;
  action: TransferAction;
  // Source branch of the transfer, carried from the initiate step so the
  // backend can close that branch's mapping/schedules on confirmation.
  old_branch_id?: string;
  replacement_employee_id?: string;
  replacement_branch_id?: string;
  confirm?: boolean;
  notify_channels?: string[];
  priority?: string;
  reason?: string;
}

export interface ConfirmTransferResult {
  transfer_id: string;
  action: TransferAction;
  status: string;
  summary: {
    total: number;
    successful: number;
    conflicts: number;
    queued: number;
    cancelled: number;
  };
  successful: { appointment_id: string; reason: string }[];
  conflicts: { appointment_id: string; reason: string }[];
}

export interface FutureAppointmentsPreview {
  employee_id: string;
  effective_date: string;
  affected_appointment_count: number;
  appointments: TransferAppointmentSummary[];
}

export interface RescheduleQueueEntry {
  queue_id: string;
  appointment_id: string;
  patient_id: string;
  employee_id: string;
  branch_id: string;
  department_id: string | null;
  old_schedule_id: string | number | null;
  old_appointment_date: string;
  old_appointment_time: string;
  transfer_id: string | null;
  priority: string;
  reason: string | null;
  status: string;
  assigned_employee_id?: string | null;
  assigned_branch_id?: string | null;
  assigned_schedule_id?: string | number | null;
  assigned_date?: string | null;
  assigned_time?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string | null;
  appointment_history?: {
    appointment_id: string;
    appointment_date: string;
    appointment_time: string;
    status: string | null;
  } | null;
  patient_bio_data?: {
    patient_id: string;
    patient_first_name: string;
    patient_last_name: string | null;
    patient_primary_mobile: string | null;
  } | null;
  branch?: { branch_id: string; branch_name: string } | null;
}

export interface RescheduleQueueResult {
  data: { entries: RescheduleQueueEntry[]; total: number; page: number; limit: number; totalPages: number };
}

export type RescheduleQueueAction = "ASSIGN" | "CONFIRM" | "CANCEL";

export interface ProcessRescheduleActionPayload {
  action: RescheduleQueueAction;
  employee_id?: string;
  branch_id?: string;
  appointment_date?: string;
  appointment_time?: string;
  reason?: string;
}

export const doctorTransferApi = {
  initiateTransfer: (employeeId: string, data: InitiateTransferPayload, bypassPending?: boolean) =>
    API.post<{ success: boolean; message: string; data: InitiateTransferResult }>(
      `/doctors/${employeeId}/transfer`,
      data,
      { headers: bypassPending ? { "X-Bypass-Pending-Transfer": "true" } : undefined }
    ),

  confirmTransfer: (employeeId: string, data: ConfirmTransferPayload) =>
    API.post<{ success: boolean; message: string; data: ConfirmTransferResult }>(
      `/doctors/${employeeId}/transfer/confirm`,
      data
    ),

  getFutureAppointments: (employeeId: string, effectiveDate?: string) =>
    API.get<{ success: boolean; data: FutureAppointmentsPreview }>(
      `/doctors/${employeeId}/future-appointments`,
      { params: { effective_date: effectiveDate } }
    ),

  getRescheduleQueue: (params?: { branchId?: string; patientId?: string; status?: string; priority?: string; page?: number; limit?: number }) =>
    API.get<RescheduleQueueResult>("/appointments/reschedule-queue", { params }),

  processRescheduleAction: (appointmentId: string, data: ProcessRescheduleActionPayload) =>
    API.put<{ success: boolean; message: string; data: { queue_id: string; status: string } }>(
      `/appointments/reschedule/${appointmentId}`,
      data
    ),
};
