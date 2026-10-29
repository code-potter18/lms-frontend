import API from "./axios";

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
  created_at?: string;
  updated_at?: string;
  patient_history?: {
    patient_history_id: string;
    patient_id: string;
    visit_type?: string | null;
    visit_status?: string | null;
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
  } | null;
  sample_collection?: {
    id?: number;
    sample_collection_id: string;
    lab_order_item_id: string;
    barcode?: string | null;
    container_type?: string | null;
    collection_status?: string | null;
    remarks?: string | null;
    collected_by?: string | null;
  }[];
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
  }) => API.post<{ success: boolean; data: LabOrderRecord }>("/lab-order", payload),

  getAll: (params?: {
    priority?: string;
    branch_id?: string;
    limit?: number;
  }) =>
    API.get<{ success: boolean; data: LabOrderRecord[] }>("/lab-order", {
      params,
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

  getAll: () =>
    API.get<{ success: boolean; data: LabOrderItemRecord[] }>("/lab-order-item"),

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
