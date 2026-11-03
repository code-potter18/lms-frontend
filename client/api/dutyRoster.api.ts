import API from "./axios";

export interface AvailableStaffMember {
  employee_id: string;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  role_type: string;
  specialization?: string | null;
  shift_code: string;
  source: "ROSTER" | "TEMPLATE" | "OVERRIDE";
  active_patients_count: number;
}

export interface AvailableStaffQuery {
  branchId: string;
  dutyDate: string; // YYYY-MM-DD
  shiftCode: string;
  roleInDuty: "DUTY_DOCTOR" | "DUTY_NURSE";
  includeAllBranch?: boolean;
}

export interface BranchShift {
  id: string | number;
  shift_id: string;
  branch_id: string;
  shift_code: string;
  shift_name: string;
  start_time: string;
  end_time: string;
  is_overnight: boolean;
  display_order: number;
  is_active: boolean;
}

export interface UpdateBranchShiftPayload {
  shift_name?: string;
  start_time?: string;
  end_time?: string;
  is_overnight?: boolean;
  display_order?: number;
  is_active?: boolean;
}

export interface DutyTemplate {
  id: string | number;
  template_id: string;
  branch_id: string;
  employee_id: string;
  day_of_week: "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY";
  shift_code: string;
  role_in_duty: "DUTY_DOCTOR" | "DUTY_NURSE";
  is_active: boolean;
  employees?: {
    employee_id: string;
    first_name: string;
    middle_name?: string | null;
    last_name: string;
    specialization?: string | null;
    user_table?: {
      role_type?: string | null;
    } | null;
  };
}

export interface UpsertTemplatePayload {
  employee_id: string;
  branch_id: string;
  day_of_week: string;
  shift_code: string;
  role_in_duty: "DUTY_DOCTOR" | "DUTY_NURSE";
}

export interface DutyRosterEntry {
  id: string | number;
  roster_id: string;
  branch_id: string;
  employee_id: string;
  duty_date: string;
  shift_code: string;
  role_in_duty: "DUTY_DOCTOR" | "DUTY_NURSE";
  status: string;
  remarks?: string | null;
  employees?: {
    employee_id: string;
    first_name: string;
    middle_name?: string | null;
    last_name: string;
    specialization?: string | null;
    user_table?: {
      role_type?: string | null;
    } | null;
  };
}

export interface UpsertRosterPayload {
  employee_id: string;
  branch_id: string;
  duty_date: string; // YYYY-MM-DD
  shift_code: string;
  role_in_duty: "DUTY_DOCTOR" | "DUTY_NURSE";
  start_time?: string;
  end_time?: string;
  status?: string;
  remarks?: string;
}

export const dutyRosterApi = {
  // Query roster-guided available staff (Mode B)
  getAvailableStaff: (params: AvailableStaffQuery) =>
    API.get<{ success: boolean; data: AvailableStaffMember[] }>("/ipd/duty-roster/available", {
      params,
    }),

  // Branch shift master
  getBranchShifts: (branchId: string) =>
    API.get<{ success: boolean; data: BranchShift[] }>("/ipd/duty-roster/branch-shifts", {
      params: { branchId },
    }),

  createBranchShift: (data: {
    branch_id: string;
    shift_code: string;
    shift_name: string;
    start_time: string;
    end_time: string;
    is_overnight?: boolean;
    display_order?: number;
  }) =>
    API.post<{ success: boolean; data: BranchShift }>("/ipd/duty-roster/branch-shifts", data),

  updateBranchShift: (shiftId: string, data: UpdateBranchShiftPayload) =>
    API.patch<{ success: boolean; data: BranchShift }>(`/ipd/duty-roster/branch-shifts/${shiftId}`, data),

  // Weekly templates
  getTemplates: (branchId: string) =>
    API.get<{ success: boolean; data: DutyTemplate[] }>("/ipd/duty-roster/templates", {
      params: { branchId },
    }),

  upsertTemplate: (data: UpsertTemplatePayload) =>
    API.post<{ success: boolean; data: DutyTemplate }>("/ipd/duty-roster/templates", data),

  deleteTemplate: (templateId: string) =>
    API.delete<{ success: boolean; message: string }>(`/ipd/duty-roster/templates/${templateId}`),

  // Date range roster
  getRoster: (branchId: string, fromDate: string, toDate: string) =>
    API.get<{ success: boolean; data: DutyRosterEntry[] }>("/ipd/duty-roster/roster", {
      params: { branchId, fromDate, toDate },
    }),

  upsertRosterEntry: (data: UpsertRosterPayload) =>
    API.post<{ success: boolean; data: DutyRosterEntry }>("/ipd/duty-roster/roster", data),

  deleteRosterEntry: (rosterId: string) =>
    API.delete<{ success: boolean; message: string }>(`/ipd/duty-roster/roster/${rosterId}`),
};

