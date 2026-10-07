import API from "./axios";

export interface MedicineOption {
  medicine_id: string;
  medicine_name: string;
  generic_name?: string;
  strength?: string;
  dosage_form?: string;
  unit?: string;
  route?: string;
}

export interface RegimenProtocolDilution {
  protocol_dilution_id?: string;
  medicine_id?: string | null;
  drug_brand_name?: string | null;
  form?: string | null;
  dose?: string | number | null;
  dose_unit?: string | null;
  dilution_volume?: string | number | null;
  dilution_volume_unit?: string | null;
  diluent?: string | null;
  comment?: string | null;
}

export interface RegimenProtocolDilutionInput {
  protocol_dilution_id?: string;
  medicine_id?: string | null;
  drug_brand_name?: string | null;
  form?: string | null;
  dose?: string | number | null;
  dose_unit?: string | null;
  dilution_volume?: string | number | null;
  dilution_volume_unit?: string | null;
  diluent?: string | null;
  comment?: string | null;
}

export interface DischargeInstruction {
  discharge_instruction_id: string;
  protocol_id: string;
  medicine_id: string | null;
  drug_brand_name?: string | null;
  drug_sequence: number | null;
  drug_from: string | null;
  frequency: string | null;
  composition: string | null;
  duration: string | null;
  duration_days?: string | null;
  patient_dose: string | number | null;
  patient_dose_unit: string | null;
  administration_detail: string | null;
  dose_change: string | number | null;
  comment: string | null;
  source_resource_id: string | null;
  active_status: number | null;
  medicine_master: { medicine_name: string | null } | null;
}

export interface DischargeInstructionInput {
  discharge_instruction_id?: string;
  medicine_id?: string | null;
  drug_brand_name?: string | null;
  drug_sequence?: number | null;
  drug_from?: string | null;
  frequency: string | null;
  duration?: string | null;
  duration_days?: string | null;
  patient_dose?: number | null;
  patient_dose_unit?: string | null;
  administration_detail?: string | null;
  comment?: string | null;
}

export interface RegimenProtocolItem {
  protocol_item_id: string;
  medicine_id: string;
  drug_brand_name?: string | null;
  drug_role: string;
  drug_sequence: number;
  drug_type: string | null;
  dosage: string | null;
  dosage_unit: string | null;
  dose_calculation_method: string | null;
  administration_route: string | null;
  infusion_type: string | null;
  infusion_duration_minutes: number | null;
  administration_day: number | null;
  cycle_day: number | null;
  frequency: string | null;
  timing_relative_to_primary: string | null;
  patient_dose: string | null;
  patient_dose_unit: string | null;
  administration_detail: string | null;
  previous_toxicity: string | null;
  remarks: string | null;
  medicine_master: { medicine_name: string | null } | null;
  chemotherapy_protocol_dilutions?: RegimenProtocolDilution[] | null;
}

export interface RegimenProtocol {
  protocol_id: string;
  regimen_code: string;
  regimen_name: string;
  protocol_version: string | null;
  cancer_type_id: string;
  cancer_type_ids?: string[];
  subtype_id: string | null;
  subtype_ids?: string[];
  chemotherapy_protocol_cancers?: Array<{
    cancer_type_id: string;
    subtype_id: string | null;
    cancer_types?: { cancer_type: string | null } | null;
    cancer_subtypes?: { subtype_name: string | null } | null;
  }>;
  treatment_intent: string | null;
  standard_cycles: number | null;
  no_of_days: number | null;
  guideline_source: string | null;
  notes: string | null;
  active_status: number | null;
  created_at: string | null;
  updated_at: string | null;
  cancer_types: { cancer_type: string | null } | null;
  cancer_subtypes: { subtype_name: string | null } | null;
  chemotherapy_regimen_protocol_items: RegimenProtocolItem[];
  protocol_dilutions?: RegimenProtocolDilution[] | null;
  protocol_discharge_instructions?: DischargeInstruction[] | null;
}

export interface RegimenProtocolItemInput {
  medicine_id?: string;
  drug_role?: string;
  drug_type?: string | null;
  drug_sequence: number;
  dosage?: string | null;
  dosage_unit?: string | null;
  dose_calculation_method?: string | null;
  administration_route?: string | null;
  infusion_type?: string | null;
  infusion_duration_minutes?: number | null;
  administration_day?: number | null;
  cycle_day?: number | null;
  frequency?: string | null;
  timing_relative_to_primary?: string | null;
  patient_dose?: string | null;
  patient_dose_unit?: string | null;
  administration_detail?: string | null;
  previous_toxicity?: string | null;
  remarks?: string | null;
  drug_brand_name?: string | null;
  dilutions?: RegimenProtocolDilutionInput[] | null;
}

export interface ChemoPlanCycle {
  chemotherapy_cycle_id?: string;
  cycle_number: number;
  cycle_day?: number | null;
  planned_date?: string | null;
  actual_date?: string | null;
  next_cycle_date?: string | null;
  cycle_status?: string | null;
  completion_status?: string | null;
}

export interface ChemoPlan {
  chemotherapy_plan_id: string;
  patient_id: string;
  patient_history_id: string;
  encounter_no?: string | null;
  appointment_id?: string | null;
  diagnosis_id: string;
  branch_id: string;
  regimen_name?: string | null;
  regimen_code?: string | null;
  protocol_name?: string | null;
  protocol_version?: string | null;
  treatment_type?: string | null;
  treatment_intent?: string | null;
  cancer_stage?: string | null;
  cancer_type?: string | null;
  cancer_subtype?: string | null;
  ecog_status?: string | null;
  planned_cycles?: number | null;
  completed_cycles?: number | null;
  cycle_interval_days?: number | null;
  treatment_start_date?: string | null;
  expected_end_date?: string | null;
  treatment_status?: string | null;
  remarks?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  patient_bio_data?: {
    patient_id?: string;
    patient_first_name?: string | null;
    patient_last_name?: string | null;
  } | null;
  chemotherapy_regimen_protocol?: {
    protocol_id?: string;
    regimen_code?: string | null;
    regimen_name?: string | null;
  } | null;
  chemotherapy_cycle?: ChemoPlanCycle[] | null;
  /* The plan's saved cycle day orders (headers, by cycle / day) and its
     current one - the first still ORDERED day, else the latest COMPLETED -
     with that day's drugs and hydration. */
  plan_orders?: ChemoPlanOrderHeader[] | null;
  current_order?: ChemoPlanOrder | null;
}

/* A plan drug: a medicine from medicine_master, or (medicine_id null) a
   name the doctor typed for this patient, kept in drug_name. */
export interface ChemoPlanItem {
  chemotherapy_plan_item_id: string;
  medicine_id: string | null;
  drug_name?: string | null;
  plan_order_id?: string | null;
  drug_sequence: number;
  drug_role?: string | null;
  drug_type?: string | null;
  protocol_dose?: string | number | null;
  protocol_dose_unit?: string | null;
  dose_calculation_method?: string | null;
  calculated_dose?: string | number | null;
  calculated_dose_unit?: string | null;
  administration_route?: string | null;
  formulation?: string | null;
  infusion_type?: string | null;
  infusion_duration_minutes?: number | null;
  infusion_rate?: string | null;
  dilution_solution?: string | null;
  dilution_volume?: string | number | null;
  administration_day?: number | null;
  frequency?: string | null;
  timing_relative_to_primary?: string | null;
  administration_detail?: string | null;
  maximum_dose?: string | number | null;
  minimum_dose?: string | number | null;
  remarks?: string | null;
  duration?: string | null;
  medicine_master?: {
    medicine_id?: string;
    medicine_name?: string | null;
    brand_name?: string | null;
    generic_name?: string | null;
    dosage_form?: string | null;
    unit?: string | null;
  } | null;
}

/* One discharge medicine to save on a patient's plan. medicine_id when the
   drug came from the master list, otherwise drug_name (typed for this
   patient only - nothing is added to medicine_master). */
export interface ChemoDischargeMedicinePayload {
  medicine_id?: string | null;
  drug_name?: string | null;
  drug_sequence: number;
  drug_type?: string | null;
  dosage?: number | null;
  dosage_unit?: string | null;
  frequency?: string | null;
  administration_detail?: string | null;
  duration?: string | null;
  remarks?: string | null;
}

/* A cycle day's hydration row (chemotherapy_plan_hydration). */
export interface ChemoPlanHydration {
  plan_hydration_id: string;
  plan_order_id?: string | null;
  source_dilution_id: string | null;
  hydration_stage: string;
  agent_name: string | null;
  diluent: string | null;
  dilution_volume: number | string | null;
  dilution_volume_unit: string | null;
  guidance: string | null;
  display_order?: number | null;
}

/* One saved order per plan + cycle + day: ORDERED until the consultation
   is submitted, then COMPLETED (read-only). */
export interface ChemoPlanOrderHeader {
  plan_order_id: string;
  chemotherapy_plan_id: string;
  chemotherapy_cycle_id: string;
  cycle_number: number;
  cycle_day: number;
  order_status: "ORDERED" | "COMPLETED" | string;
  hydration_saved: boolean;
  copied_from_order_id?: string | null;
  encounter_no?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  chemotherapy_cycle?: { cycle_status: string | null } | null;
}

export interface ChemoPlanOrder extends ChemoPlanOrderHeader {
  dosing_height_cm?: number | string | null;
  dosing_weight_kg?: number | string | null;
  dosing_bsa?: number | string | null;
  dosing_serum_creatinine?: number | string | null;
  dosing_crcl?: number | string | null;
  chemotherapy_plan_items: ChemoPlanItem[];
  chemotherapy_plan_hydration: ChemoPlanHydration[];
}

/* PUT /chemotherapy/plans/:planId/orders/:cycle/:day. hydration left out
   keeps that day's hydration as it is. */
export interface ChemoPlanOrderPayload {
  items: Record<string, unknown>[];
  hydration?: {
    source_dilution_id?: string | null;
    hydration_stage: "PRE" | "POST";
    agent_name?: string | null;
    diluent?: string | null;
    dilution_volume?: number | null;
    dilution_volume_unit?: string | null;
    guidance?: string | null;
  }[];
  dosing?: {
    height_cm?: number | null;
    weight_kg?: number | null;
    bsa?: number | null;
    serum_creatinine?: number | null;
    crcl?: number | null;
  };
  encounter_no?: string | null;
  copied_from_order_id?: string | null;
}

export interface ChemoPlanOrderCompletion {
  completed_orders: { plan_order_id: string; cycle_number: number; cycle_day: number }[];
  completed_cycles: number[];
  plan_completed: boolean;
  treatment_status: string | null;
}

// Full single-plan fetch (GET /chemotherapy/plans/:planId) -- unlike ChemoPlan
// (the list-row shape), this includes the order's own medicine list, which is
// what a pharmacy slip should read from since it always exists for a plan
// regardless of whether the plan was derived from a saved regimen protocol.
export interface ChemoPlanDetail extends ChemoPlan {
  chemotherapy_plan_items?: ChemoPlanItem[] | null;
}

export const CHEMO_PLAN_CLOSED_STATUSES = ["COMPLETED", "DISCONTINUED", "CANCELLED"];

/* The plan is one course; a closed one takes no more orders. */
export const isChemoPlanClosed = (plan?: { treatment_status?: string | null } | null) =>
  CHEMO_PLAN_CLOSED_STATUSES.includes(String(plan?.treatment_status ?? "").toUpperCase());

/* A plan drug's display name: its medicine, else the name typed for it. */
export const chemoPlanItemName = (item?: {
  drug_name?: string | null;
  medicine_master?: { medicine_name?: string | null; generic_name?: string | null } | null;
} | null) =>
  item?.medicine_master?.medicine_name ||
  item?.medicine_master?.generic_name ||
  item?.drug_name ||
  "";

/* The drugs to show / print for a plan: its current cycle day order,
   else the plan's baseline (protocol copy). */
export const chemoPlanCurrentItems = <T = ChemoPlanItem>(plan?: {
  current_order?: { chemotherapy_plan_items?: unknown[] | null } | null;
  chemotherapy_plan_items?: unknown[] | null;
} | null): T[] => {
  const orderItems = plan?.current_order?.chemotherapy_plan_items;
  if (orderItems && orderItems.length > 0) return orderItems as T[];
  return (plan?.chemotherapy_plan_items ?? []) as T[];
};

export interface LabReviewRecord {
  lab_review_id?: string;
  chemotherapy_cycle_id?: string;
  review_date?: string | null;
  hemoglobin?: number | string | null;
  wbc?: number | string | null;
  platelet_count?: number | string | null;
  cbc_normal?: boolean | null;
  chemotherapy_fit?: boolean | null;
  review_notes?: string | null;
}

export const chemotherapyApi = {
  listRegimenProtocols: (params?: {
    cancer_type_id?: string;
    subtype_id?: string;
  }) =>
    API.get<{ success: boolean; message: string; data: RegimenProtocol[] }>(
      "/chemotherapy/regimen-protocols",
      { params }
    ),
  listPlans: (params?: {
    page?: number;
    limit?: number;
    status?: string;
    date_from?: string;
    date_to?: string;
  }) =>
    API.get<{
      success: boolean;
      message: string;
      data: ChemoPlan[];
      pagination: { total: number; page: number; limit: number };
    }>("/chemotherapy/plans", { params }),
  getPlan: (planId: string) =>
    API.get<{ success: boolean; message: string; data: ChemoPlanDetail }>(
      `/chemotherapy/plans/${planId}`
    ),
  getLatestPlanForPatient: (patientId: string) =>
    API.get<{ success: boolean; message: string; data: ChemoPlanDetail | null }>(
      "/chemotherapy/plans/latest-for-patient",
      { params: { patient_id: patientId } }
    ),
  listPlanOrders: (planId: string) =>
    API.get<{ success: boolean; message: string; data: ChemoPlanOrderHeader[] }>(
      `/chemotherapy/plans/${planId}/orders`
    ),
  getPlanOrder: (planId: string, cycleNumber: number, cycleDay: number) =>
    API.get<{ success: boolean; message: string; data: ChemoPlanOrder | null }>(
      `/chemotherapy/plans/${planId}/orders/${cycleNumber}/${cycleDay}`
    ),
  savePlanOrder: (
    planId: string,
    cycleNumber: number,
    cycleDay: number,
    payload: ChemoPlanOrderPayload
  ) =>
    API.put<{ success: boolean; message: string; data: ChemoPlanOrder }>(
      `/chemotherapy/plans/${planId}/orders/${cycleNumber}/${cycleDay}`,
      payload
    ),
  /* This patient's discharge (take-home) medicines. Stored on their chemo
     plan as plan items with drug_role DISCHARGE: a drug from medicine_master
     is kept by medicine_id, a typed name in drug_name. The regimen protocol's
     discharge instructions and medicine_master are never written. */
  listPlanDischargeMedicines: (planId: string) =>
    API.get<{ success: boolean; message: string; data: ChemoPlanItem[] }>(
      `/chemotherapy/plans/${planId}/discharge-medicines`
    ),
  addPlanDischargeMedicine: (planId: string, payload: ChemoDischargeMedicinePayload) =>
    API.post<{ success: boolean; message: string; data: ChemoPlanItem[] }>(
      `/chemotherapy/plans/${planId}/discharge-medicines`,
      payload
    ),
  updatePlanDischargeMedicine: (
    planId: string,
    planItemId: string,
    payload: Partial<ChemoDischargeMedicinePayload>
  ) =>
    API.put<{ success: boolean; message: string; data: ChemoPlanItem[] }>(
      `/chemotherapy/plans/${planId}/discharge-medicines/${planItemId}`,
      payload
    ),
  removePlanDischargeMedicine: (planId: string, planItemId: string) =>
    API.delete<{ success: boolean; message: string; data: ChemoPlanItem[] }>(
      `/chemotherapy/plans/${planId}/discharge-medicines/${planItemId}`
    ),
  /* Consultation submit: completes the order(s) saved in this encounter. */
  completePlanOrders: (planId: string, encounterNo: string) =>
    API.post<{ success: boolean; message: string; data: ChemoPlanOrderCompletion }>(
      `/chemotherapy/plans/${planId}/orders/complete`,
      { encounter_no: encounterNo }
    ),
  listLabReviews: (cycleId: string) =>
    API.get<{ success: boolean; message: string; data: LabReviewRecord[] }>(
      `/chemotherapy/cycles/${cycleId}/lab-review`
    ),
  changePlanStatus: (
    planId: string,
    payload: { status: string; reason?: string }
  ) =>
    API.patch<{ success: boolean; message: string; data: ChemoPlan }>(
      `/chemotherapy/plans/${planId}/status`,
      payload
    ),
  getRegimenProtocol: (protocolId: string) =>
    API.get<{ success: boolean; message: string; data: RegimenProtocol }>(
      `/chemotherapy/regimen-protocols/${protocolId}`
    ),
  createRegimenProtocol: (payload: {
    regimen_code: string;
    regimen_name: string;
    original_protocol?: string | null;
    protocol_version?: string | null;
    cancer_type_id: string;
    cancer_type_ids?: string[];
    subtype_id?: string | null;
    subtype_ids?: string[];
    treatment_intent?: string | null;
    standard_cycles?: number | null;
    cycle_interval_days?: number | null;
    no_of_days?: number | null;
    days?: Array<{
        protocol_day_id?: string;
        day_number: number;
        day_sequence?: number | null;
        same_as_day_one?: boolean | null;
        active_status?: number | null;
        source_day_resource_id?: string | null;
    }> | null;
    guideline_source?: string | null;
    notes?: string | null;
    items: Array<{
      medicine_id: string;
      drug_role?: string;
      drug_type?: string | null;
      drug_sequence: number;
      dosage?: string | null;
      dosage_unit?: string | null;
      dose_calculation_method?: string | null;
      administration_route?: string | null;
      frequency?: string | null;
      remarks?: string | null;
      patient_dose?: string | null;
      patient_dose_unit?: string | null;
      administration_detail?: string | null;
      previous_toxicity?: string | null;
      administration_day?: number | null;
      dilutions?: RegimenProtocolDilutionInput[] | null;
    }>;
    discharge_instructions?: DischargeInstructionInput[];
    dilutions?: RegimenProtocolDilutionInput[];
  }) =>
    API.post<{ success: boolean; message: string; data: RegimenProtocol }>(
      "/chemotherapy/regimen-protocols",
      payload
    ),
  updateRegimenProtocol: (
    protocolId: string,
    payload: {
      regimen_code?: string;
      regimen_name?: string;
      original_protocol?: string | null;
      protocol_version?: string | null;
      cancer_type_id?: string;
      cancer_type_ids?: string[];
      subtype_id?: string | null;
      subtype_ids?: string[];
      treatment_intent?: string | null;
      standard_cycles?: number | null;
      cycle_interval_days?: number | null;
      no_of_days?: number | null;
      days?: Array<{
        protocol_day_id?: string;
        day_number: number;
        day_sequence?: number | null;
        same_as_day_one?: boolean | null;
        active_status?: number | null;
        source_day_resource_id?: string | null;
      }> | null;
      guideline_source?: string | null;
      notes?: string | null;
      items?: Array<{
        medicine_id: string;
        drug_role?: string;
        drug_type?: string | null;
        drug_sequence: number;
        dosage?: string | null;
        dosage_unit?: string | null;
        dose_calculation_method?: string | null;
        administration_route?: string | null;
        frequency?: string | null;
        remarks?: string | null;
        patient_dose?: string | null;
        patient_dose_unit?: string | null;
        administration_detail?: string | null;
        previous_toxicity?: string | null;
        administration_day?: number | null;
        dilutions?: RegimenProtocolDilutionInput[] | null;
      }>;
      discharge_instructions?: DischargeInstructionInput[];
      dilutions?: RegimenProtocolDilutionInput[];
    }
  ) =>
    API.put<{ success: boolean; message: string; data: RegimenProtocol }>(
      `/chemotherapy/regimen-protocols/${protocolId}`,
      payload
    ),
  deleteRegimenProtocol: (protocolId: string) =>
    API.delete<{ success: boolean; message: string; data: RegimenProtocol }>(
      `/chemotherapy/regimen-protocols/${protocolId}`
    ),
  addRegimenProtocolItem: (
    protocolId: string,
    payload: RegimenProtocolItemInput & { medicine_id: string }
  ) =>
    API.post<{ success: boolean; message: string; data: RegimenProtocol }>(
      `/chemotherapy/regimen-protocols/${protocolId}/items`,
      payload
    ),
  updateRegimenProtocolItem: (
    protocolId: string,
    protocolItemId: string,
    payload: RegimenProtocolItemInput
  ) =>
    API.put<{ success: boolean; message: string; data: RegimenProtocol }>(
      `/chemotherapy/regimen-protocols/${protocolId}/items/${protocolItemId}`,
      payload
    ),
  removeRegimenProtocolItem: (protocolId: string, protocolItemId: string) =>
    API.delete<{ success: boolean; message: string; data: RegimenProtocol }>(
      `/chemotherapy/regimen-protocols/${protocolId}/items/${protocolItemId}`
    ),
  listCancerTypes: () =>
    API.get<{
      success: boolean;
      message: string;
      data: Array<{ cancer_type_id: string; cancer_type: string }>;
    }>("/oncology/reference/cancer-types"),
  listCancerSubtypes: (cancerTypeId: string) =>
    API.get<{
      success: boolean;
      message: string;
      data: Array<{ subtype_id: string; subtype_name: string; cancer_type_id: string }>;
    }>(`/oncology/reference/cancer-types/${cancerTypeId}/subtypes`),
  listMedicines: () =>
    API.get<{ success: boolean; message: string; data: MedicineOption[] }>(
      "/chemotherapy/medicines"
    ),
  listDilutionMedicines: () =>
    API.get<{ success: boolean; message: string; data: MedicineOption[] }>(
      "/chemotherapy/medicines/dilution-medicines"
    ),
  listMedicinesByRole: (drugRole: string) =>
    API.get<{ success: boolean; message: string; data: MedicineOption[] }>(
      "/chemotherapy/medicines/by-role",
      { params: { drug_role: drugRole } }
    ),
  getProtocolFieldOptions: () =>
    API.get<{
      success: boolean;
      message: string;
      data: {
        dosage_units: string[];
        dilution_forms: string[];
        dilution_dose_units: string[];
        dilution_volume_units: string[];
        diluents: string[];
        treatment_intents?: string[];
      };
    }>("/chemotherapy/protocol-field-options"),
  listTreatmentIntents: () =>
    API.get<{
      success: boolean;
      message: string;
      data: string[];
    }>("/chemotherapy/treatment-intents"),
  listMedicinesByCancerSubtype: (
    cancerTypeIds: string | string[],
    subtypeIds: string | string[] | undefined,
    drugRole: string
  ) => {
    const cancerParam = Array.isArray(cancerTypeIds) ? cancerTypeIds.join(",") : cancerTypeIds;
    const subtypeParam = Array.isArray(subtypeIds) ? subtypeIds.join(",") : subtypeIds;
    return API.get<{ success: boolean; message: string; data: MedicineOption[] }>(
      "/chemotherapy/medicines/by-cancer-subtype",
      { params: { cancer_type_ids: cancerParam, subtype_ids: subtypeParam || undefined, drug_role: drugRole } }
    );
  },
  addDischargeInstruction: (
    protocolId: string,
    payload: DischargeInstructionInput
  ) =>
    API.post<{ success: boolean; message: string; data: RegimenProtocol }>(
      `/chemotherapy/regimen-protocols/${protocolId}/discharge-instructions`,
      payload
    ),
  updateDischargeInstruction: (
    protocolId: string,
    dischargeInstructionId: string,
    payload: DischargeInstructionInput
  ) =>
    API.put<{ success: boolean; message: string; data: RegimenProtocol }>(
      `/chemotherapy/regimen-protocols/${protocolId}/discharge-instructions/${dischargeInstructionId}`,
      payload
    ),
  removeDischargeInstruction: (
    protocolId: string,
    dischargeInstructionId: string
  ) =>
    API.delete<{ success: boolean; message: string; data: RegimenProtocol }>(
      `/chemotherapy/regimen-protocols/${protocolId}/discharge-instructions/${dischargeInstructionId}`
    ),
};