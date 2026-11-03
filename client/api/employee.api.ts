import API from "./axios";

export type DayOfWeek = "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY";

export interface WorkingHourDto {
  branch_id: string;
  day_of_week: DayOfWeek;
  shift_name: string;
  start_time: string;
  end_time: string;
}

// Alias for backward compatibility
export type WorkingHourPayload = WorkingHourDto;

export interface CreateEmployeePayload {
  username: string;
  password: string;
  role_type: "DOCTOR" | "NURSE" | "LAB_TECHNICIAN" | "PHARMACIST" | "BRANCH_ADMIN" | "Admin" | "STAFF";
  first_name: string;
  middle_name?: string;
  last_name: string;
  dob?: string;
  gender?: string;
  email: string;
  mobile_no: string;
  blood_group?: string;
  nationality?: string;
  marital_status?: string;
  aadhaar_no?: string;
  pan_no?: string;
  passport_no?: string;
  permanent_address?: string;
  current_address?: string;
  employee_photo_URL?: string;
  employee_state?: string;
  employee_district?: string;
  employee_area?: string;
  employee_pincode?: number;
  permanent_employee_state?: string;
  permanent_employee_district?: string;
  permanent_employee_area?: string;
  permanent_employee_pincode?: number;
  employee_no_experence?: number;
  emergency_contact_name?: string;
  emergency_contact_relationship?: string;
  emergency_contact_number?: string;
  department_id: string;
  designation: string;
  specialization?: string;
  qualification?: string;
  license_no?: string;
  joining_date: string;
  emp_status: boolean;
  branch_ids: string[];
  consultation_minutes?: number;
  doctor_bio?: string;
  working_hours?: WorkingHourDto[];
}

export interface EmployeeRecord {
  employee_id: string;
  user_id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  blood_group: string | null;
  nationality: string | null;
  marital_status: string | null;
  mobile_no: string;
  parmanent_address: string | null;
  current_address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_relationship: string | null;
  emergency_contact_number: string | null;
  aadhaar_no: string | null;
  pan_no: string | null;
  passport_no: string | null;
  designation: string | null;
  specialization: string | null;
  qualification: string | null;
  license_no: string | null;
  joining_date: string;
  branch_id: string;
  emp_status: boolean | null;
  email: string;
  department_id: string;
  department_master?: 
  { department_name: string } | null;
  user_table: {
    role_type: string;
    user_status: number;
    created_at?: string | null;
  };
  branch: {
    branch_name: string;
    branch_area?: string | null;
  } | null;
  // Real branch assignments from user_branch_mapping (active mappings
  // only). The legacy `branch` field above is the denormalized
  // employees.branch_id column, which stays stale for multi-branch roles
  // like DOCTOR — this list is the source of truth, with has_schedule
  // flagging which assigned branches actually have an active schedule.
  branches?: {
    branch_id: string;
    branch_name: string | null;
    branch_area?: string | null;
    has_schedule: boolean;
  }[];
  photo?: string | null;
  employee_photo_URL?: string | null;
  employee_state?: string | null;
  employee_district?: string | null;
  employee_area?: string | null;
  employee_pincode?: string | number | null;
  employee_no_experence?: string | number | null;
  gender?: string | null;
  dob?: string | null;
  deleted_at?: string | null;
  // Backend-computed fields when `date` query param is provided
  doctor_status?: "ACTIVE" | "LEAVE" | "INACTIVE";
  total_slots?: number;
  booked_count?: number;
}

export interface EmployeeDetailResponse {
  employee: EmployeeRecord & {
    employee_photo_URL?: string | null;
    employee_no_experence?: number | null;
    current_address?: string | null;
    parmanent_address?: string | null;
  };
  user: { role_type: string; user_status: number } | null;
  branches: {
    branch_id: string;
    branch_name: string;
    status?: number;
    has_schedule?: boolean;
    assigned_date?: string | null;
  }[];
  doctorProfile?: {
    specialization: string | null;
    qualification: string | null;
    license_no: string | null;
    consultation_minutes: number | null;
    doctor_bio: string | null;
  } | null;
  doctorSchedules?: DoctorScheduleRecord[];
}

export interface DoctorScheduleRecord {
  schedule_id: string | number;
  employee_id: string;
  branch_id: string;
  day_of_week: string | null;
  shift_name: string | null;
  start_time: string | null;
  end_time: string | null;
  consultation_minutes: number | null;
  is_active: boolean;
  effective_from: string | null;
  effective_to: string | null;
  deleted_by: string | null;
  branch?: {
    branch_id: string;
    branch_name: string;
    branch_area: string | null;
  } | null;
}

export interface CreateEmployeeResponse {
  success: boolean;
  message: string;
  data: {
    user: {
      user_username: string;
      user_id: string;
      role_type: string;
      user_status: number;
    };
    employee: {
      employee_id: string;
      first_name: string;
      middle_name: string | null;
    };
  };
}

export interface AddScheduleSlotPayload {
  branch_id: string;
  day_of_week: DayOfWeek;
  shift_name?: string;
  start_time: string;
  end_time: string;
  consultation_minutes?: number;
  // Day-specific schedules: set effective_from === effective_to to the target
  // date. Omit (or null) for a repeating weekly template row.
  effective_from?: string | null;
  effective_to?: string | null;
}

export interface UpdateScheduleSlotPayload {
  branch_id: string;
  day_of_week: DayOfWeek;
  shift_name?: string;
  start_time: string;
  end_time: string;
  consultation_minutes?: number;
  effective_from?: string | null;
  effective_to?: string | null;
}

export interface AddScheduleSlotResponse {
  success: boolean;
  message: string;
  data: DoctorScheduleRecord;
}

export interface GetEmployeesParams {
  roleType?: string;
  role_type?: string;
  branchId?: string;
  branch_id?: string;
  department?: string;
  status?: boolean;
  includeDeleted?: boolean;
  search?: string;
  page?: number;
  limit?: number;
  date?: string;
  skipBranchScope?: boolean;
}

export interface UpdateEmployeePayload {
  username?: string;
  password?: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  email?: string;
  mobile_no?: string;
  blood_group?: string;
  nationality?: string;
  marital_status?: string;
  aadhaar_no?: string;
  pan_no?: string;
  passport_no?: string;
  permanent_address?: string;
  current_address?: string;
  employee_photo_URL?: string;
  employee_state?: string;
  employee_district?: string;
  employee_area?: string;
  employee_pincode?: number;
  permanent_employee_state?: string;
  permanent_employee_district?: string;
  permanent_employee_area?: string;
  permanent_employee_pincode?: number;
  employee_no_experence?: number;
  emergency_contact_name?: string;
  emergency_contact_relationship?: string;
  emergency_contact_number?: string;
  department_id?: string;
  designation?: string;
  specialization?: string;
  qualification?: string;
  license_no?: string;
  joining_date?: string;
  emp_status?: boolean;
  gender?: string;
  dob?: string;
  age?: number;
  branch_ids?: string[];
  consultation_minutes?: number;
  doctor_bio?: string;
  working_hours?: WorkingHourDto[];
}

export const employeeApi = {
  create: (data: CreateEmployeePayload) =>
    API.post<CreateEmployeeResponse>("/employees/create", data),

  getAll: (params?: GetEmployeesParams) => {
    const normalizedParams = params
      ? {
          ...params,
          roleType: params.roleType || params.role_type,
          branchId: params.branchId || params.branch_id,
        }
      : undefined;
    return API.get<{ success: boolean; data: { employees: EmployeeRecord[]; total: number; page: number; limit: number; totalPages: number } }>("/employees", { params: normalizedParams }).catch(err => {
      if (err?.response?.status === 403) {
        return { data: { success: true, data: { employees: [], total: 0, page: 1, limit: params?.limit ?? 1000, totalPages: 0 } } } as any;
      }
      throw err;
    });
  },

  getById: (employeeId: string) =>
    API.get<{ success: boolean; data: any }>(`/employees/${employeeId}`),

  getOne: (employeeId: string) =>
    API.get<{ success: boolean; data: EmployeeDetailResponse }>(`/employees/${employeeId}`),

  getMe: () =>
    API.get<{ success: boolean; data: EmployeeDetailResponse }>(`/employees/me`),

  update: (employeeId: string, data: UpdateEmployeePayload) =>
    API.put<{ success: boolean; data: any; message?: string }>(`/employees/${employeeId}`, data),

  updatePhoto: (employeeId: string, employee_photo_URL: string) =>
    API.patch<{ success: boolean; data: any; message?: string }>(
      `/employees/${employeeId}/photo`,
      { employee_photo_URL }
    ),

  remove: (employeeId: string) =>
    API.delete<{ success: boolean; message: string }>(`/employees/${employeeId}`),

  restore: (employeeId: string) =>
    API.post<{ success: boolean; message: string }>(`/employees/${employeeId}/restore`),

  addScheduleSlot: (employeeId: string, data: AddScheduleSlotPayload) =>
    API.post<AddScheduleSlotResponse>(`/doctor-schedule/recurring/slot/${employeeId}`, data),

  updateScheduleSlot: (employeeId: string, scheduleId: string | number, data: UpdateScheduleSlotPayload) =>
    API.put<AddScheduleSlotResponse>(`/doctor-schedule/recurring/slot/${employeeId}/${scheduleId}`, data),

  // Soft-deletes the schedule row via the backend's
  // DELETE /employees/:employeeId/:schedule_id endpoint, which flips
  // doctor_schedule.is_active to false and stamps deleted_by with the
  // acting user. Soft-deleted rows are excluded from every schedule query,
  // so the slot disappears from all pages once refetched.
  removeScheduleSlot: (employeeId: string, scheduleId: string | number) =>
    API.delete<{ success: boolean; message: string }>(
      `/employees/${employeeId}/${scheduleId}`,
    ),
};