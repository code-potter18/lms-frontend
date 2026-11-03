import API from "./axios";

export interface LabTestParameterRecord {
  id?: number;
  lab_test_parameter_id: string;
  lab_test_id: string;
  parameter_name: string;
  unit?: string | null;
  ref_range_low?: number | string | null;
  ref_range_high?: number | string | null;
  ref_range_text?: string | null;
  gender?: string | null;
  age_min?: number | null;
  age_max?: number | null;
  sort_order?: number | null;
  lab_test_master?: {
    test_name?: string;
    test_code?: string;
    unit?: string | null;
    reference_range?: string | null;
    sample_type?: string | null;
  };
}

export interface LabResultRecord {
  id?: number;
  lab_result_id: string;
  sample_collection_id: string;
  lab_order_item_id: string;
  parameter_name: string;
  result_value?: string | null;
  abnormal_flag?: "NORMAL" | "LOW" | "HIGH" | "CRITICAL" | "BORDERLINE" | string | null;
  result_comment?: string | null;
  verified_by?: string | null;
  verified_datetime?: string | null;
  result_status?: string | null;
  lab_test_parameter_id?: string | null;
  lab_report_id?: string | null;
  lab_test_parameter?: LabTestParameterRecord | null;
}

export interface LabOrderRecord {
  id: number;
  lab_order_id: string;
  appointment_id?: string | null;
  doctor_employee_id: string;
  department_id?: string | null;
  order_datetime?: string | null;
  priority?: string | null;
  clinical_notes?: string | null;
  provisional_diagnosis?: string | null;
  order_status?: string | null;
  branch_id?: string | null;
  user_id?: string | null;
  patient_history_id?: string | null;
  /* Investigations advised at the visit that are not lab tests (typed by
     the doctor), as "Other investigations: A, B". */
  lab_description?: string | null;
  created_at?: string;
  updated_at?: string;
  patient_history?: {
    patient_history_id: string;
    patient_id: string;
    visit_type?: string | null;
    visit_status?: string | null;
    patient_bio_data?: {
      patient_id: string;
      patient_first_name?: string | null;
      patient_middle_name?: string | null;
      patient_last_name?: string | null;
      patient_dob?: string | null;
      patient_gender?: string | null;
      patient_primary_mobile?: string | null;
      patient_email?: string | null;
      Patient_address?: string | null;
      patient_photo_url?: string | null;
      patient_area?: string | null;
      patient_district?: string | null;
      patient_state?: string | null;
    } | null;
  } | null;
  employees?: {
    employee_id: string;
    first_name: string;
    last_name?: string | null;
    designation?: string | null;
  } | null;
  department_master?: {
    department_id: string;
    department_name: string;
  } | null;
  lab_order_item?: LabOrderItemRecord[];
}

export interface LabOrderItemRecord {
  id: number;
  lab_order_item_id: string;
  lab_order_id: string;
  lab_test_id: string;
  quantity?: number | null;
  price?: number | string | null;
  discount?: number | string | null;
  net_amount?: number | string | null;
  item_status?: string | null;
  remarks?: string | null;
  /* Doctor's per-test order details (Consultation > Investigations).
     `method` is the testing method for Molecular-category tests. */
  clinical_notes?: string | null;
  priority?: string | null;
  target_date?: string | null;
  method?: string | null;
  barcode?: string | null;
  sample_id?: string | null;
  specimen_type?: string | null;
  created_at?: string;
  updated_at?: string;
  branch_id?: string | null;
  user_id?: string | null;
  lab_order?: LabOrderRecord & {
    patient_history?: {
      patient_history_id: string;
      patient_id: string;
      visit_type?: string | null;
      visit_status?: string | null;
    } | null;
  };
  lab_test_master?: {
    lab_test_id: string;
    test_name: string;
    test_code?: string | null;
    unit?: string | null;
    sample_type?: string | null;
    reference_range?: string | null;
    tat_hours?: number | string | null;
    lab_test_parameter?: LabTestParameterRecord[];
  } | null;
  sample_collection?: {
    id?: number;
    sample_collection_id: string;
    lab_order_item_id: string;
    barcode?: string | null;
    container_type?: string | null;
    collection_datetime?: string | null;
    collection_status?: string | null;
    remarks?: string | null;
    collected_by?: string | null;
    created_at?: string | null;
  }[];
  lab_result?: LabResultRecord[];
}

export const labOrderApi = {
  create: (payload: {
    patient_id?: string;
    patient_history_id?: string;
    doctor_employee_id: string;
    department_id?: string;
    branch_id?: string;
    priority?: "Normal" | "Urgent" | "Stat";
    clinical_notes?: string;
    /* The visit the order belongs to. */
    appointment_id?: string;
    lab_description?: string;
  }) => API.post<{ success: boolean; data: LabOrderRecord }>("/lab-order", payload),

  /* The latest orders - all, or a patient's / one visit's (appointment or
     encounter). The filtered calls never return another patient's order. */
  getAll: (params?: {
    patientId?: string;
    appointmentId?: string;
    patientHistoryId?: string;
    limit?: number;
  }) =>
    API.get<{ success: boolean; data: LabOrderRecord[] }>("/lab-order", {
      params: params ?? {},
    }),

  getById: (id: string) =>
    API.get<{ success: boolean; data: LabOrderRecord }>(
      `/lab-order/${encodeURIComponent(id)}`
    ),

  update: (id: string, payload: Partial<LabOrderRecord>) =>
    API.put<{ success: boolean; data: LabOrderRecord }>(
      `/lab-order/${encodeURIComponent(id)}`,
      payload
    ),
};

export const labOrderItemApi = {
  create: (payload: {
    lab_order_id: string;
    lab_test_id: string;
    quantity?: number;
    remarks?: string;
    clinical_notes?: string;
    priority?: "Normal" | "Urgent" | "Stat";
    /* ISO date, YYYY-MM-DD. */
    target_date?: string;
    /* Molecular-category tests only: the testing method. */
    method?: string;
    branch_id?: string;
    user_id?: string;
  }) =>
    API.post<{ success: boolean; data: LabOrderItemRecord }>(
      "/lab-order-item",
      payload,
    ),

  /* The latest items - all, or a patient's / one visit's (appointment). */
  getAll: (params?: { patientId?: string; appointmentId?: string }) =>
    API.get<{ success: boolean; data: LabOrderItemRecord[] }>("/lab-order-item", {
      params: params ?? {},
    }),

  getById: (id: string) =>
    API.get<{ success: boolean; data: LabOrderItemRecord }>(
      `/lab-order-item/${encodeURIComponent(id)}`
    ),

  update: (id: string, payload: Partial<LabOrderItemRecord>) =>
    API.put<{ success: boolean; data: LabOrderItemRecord }>(
      `/lab-order-item/${encodeURIComponent(id)}`,
      payload
    ),

  generateBarcode: (items: { lab_order_item_id: string; barcode: string; sample_type?: string }[]) =>
    API.post<{ success: boolean; message: string; data: any }>(
      "/lab-order-item/generate-barcode",
      { items }
    ),
};


export const labResultApi = {
  batchSave: (payload: {
    lab_order_item_id: string;
    sample_collection_id?: string;
    barcode?: string;
    sample_type?: string;
    parameters: {
      lab_test_parameter_id?: string;
      parameter_name: string;
      result_value: string;
      abnormal_flag?: string;
      result_status?: string;
      result_comment?: string;
      unit?: string;
      reference_range?: string;
    }[];
    comments?: string;
    markCompleted?: boolean;
    verified_by?: string;
    branch_id?: string;
  }) =>
    API.post<{ success: boolean; message: string; data: any }>(
      "/lab-result/batch",
      payload
    ),

  getByOrderItemId: (orderItemId: string) =>
    API.get<{ success: boolean; data: LabResultRecord[] }>(
      `/lab-result/order-item/${encodeURIComponent(orderItemId)}`
    ),

  getById: (id: string) =>
    API.get<{ success: boolean; data: LabResultRecord }>(
      `/lab-result/${encodeURIComponent(id)}`
    ),
};
