import API from "./axios";

export interface ImmunizationRecord {
  id: number;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

export interface DrugConsumptionRecord {
  id: number;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

/* general_examination_master / treatment_type_master rows. */
export interface ConsultationOptionRecord {
  id: number;
  code: string;
  name: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
}

export interface PersonalHistoryRecord {
  personal_history_id: string;
  encounter_no: string;
  immunization: PersonalHistoryItem[] | null;
  drug_consumption: PersonalHistoryItem[] | null;
  diet_type: string | null;
}

export interface PersonalHistoryItem {
  code: string;
  name: string;
  others?: string;
}

export interface PersonalHistoryPayload {
  immunization?: PersonalHistoryItem[] | null;
  drug_consumption?: PersonalHistoryItem[] | null;
  diet_type?: string | null;
}

export interface EncounterReportRecord {
  encounter_report_id: string;
  encounter_no: string;
  /* Either a lab_test_master test, or a test typed by hand (test_name). */
  lab_test_id: string | null;
  test_name: string | null;
  report_completed_date: string | null;
  result: string | null;
  impression: string | null;
  lab_test_master?: {
    lab_test_id: string;
    test_name: string | null;
    test_code?: string | null;
  } | null;
}

/* Consultation > Patient Details > Molecular Testing (one row per test
   per visit). test_name is a listed test or one typed by hand. */
export interface EncounterMolecularTestRecord {
  encounter_molecular_test_id: string;
  encounter_no: string;
  test_name: string;
  test_date: string | null;
  result: string | null;
  impression: string | null;
}

export interface EncounterMolecularTestPayload {
  test_name: string;
  test_date?: string | null;
  result?: string | null;
  impression?: string | null;
}

export interface EncounterReportPayload {
  lab_test_id?: string | null;
  test_name?: string | null;
  report_completed_date?: string | null;
  result?: string | null;
  impression?: string | null;
}

/* Consultation > Personal History > Immunization details: one row per
   selected immunization per visit (date + response), related to the
   encounter. The selected immunization names still live in
   patient_personal_history.immunization. */
export interface EncounterImmunizationRecord {
  encounter_immunization_id: string;
  encounter_no: string;
  immunization_code: string | null;
  immunization_name: string;
  immunization_date: string | null;
  response: string | null;
}

export interface EncounterImmunizationPayload {
  immunization_name: string;
  immunization_code?: string | null;
  immunization_date?: string | null;
  response?: string | null;
}

/* Consultation > Past History treatments: one row per selected Treatment
   Type per visit (date + brief note + treatment response), related to the
   encounter. */
export interface EncounterPastTreatmentRecord {
  encounter_past_treatment_id: string;
  encounter_no: string;
  treatment_type_code: string | null;
  treatment_type: string;
  treatment_date: string | null;
  note: string | null;
  treatment_response: string | null;
}

export interface EncounterPastTreatmentPayload {
  treatment_type: string;
  treatment_type_code?: string | null;
  treatment_date?: string | null;
  note?: string | null;
  treatment_response?: string | null;
}

export const consultationApi = {
  // ---------------- Master data ----------------
  getImmunizations: (search?: string) =>
    API.get<{ success: boolean; data: ImmunizationRecord[] }>(
      "/consultation/masters/immunizations",
      { params: search ? { search } : undefined },
    ),

  createCustomImmunization: (data: { name: string; description?: string }) =>
    API.post<{ success: boolean; message: string; data: ImmunizationRecord }>(
      "/consultation/masters/immunizations/custom",
      data,
    ),

  getDrugConsumptions: (search?: string) =>
    API.get<{ success: boolean; data: DrugConsumptionRecord[] }>(
      "/consultation/masters/drug-consumptions",
      { params: search ? { search } : undefined },
    ),

  createCustomDrugConsumption: (data: { name: string; description?: string }) =>
    API.post<{ success: boolean; message: string; data: DrugConsumptionRecord }>(
      "/consultation/masters/drug-consumptions/custom",
      data,
    ),

  getGeneralExaminationFindings: () =>
    API.get<{ success: boolean; data: ConsultationOptionRecord[] }>(
      "/consultation/masters/general-examination-findings",
      { params: { isActive: true } },
    ),

  createCustomGeneralExaminationFinding: (data: { name: string; description?: string }) =>
    API.post<{ success: boolean; message: string; data: ConsultationOptionRecord }>(
      "/consultation/masters/general-examination-findings/custom",
      data,
    ),

  getTreatmentTypes: () =>
    API.get<{ success: boolean; data: ConsultationOptionRecord[] }>(
      "/consultation/masters/treatment-types",
      { params: { isActive: true } },
    ),

  createCustomTreatmentType: (data: { name: string; description?: string }) =>
    API.post<{ success: boolean; message: string; data: ConsultationOptionRecord }>(
      "/consultation/masters/treatment-types/custom",
      data,
    ),

  getMolecularTestOptions: () =>
    API.get<{ success: boolean; data: string[] }>(
      "/consultation/masters/molecular-tests",
    ),

  getDietTypes: () =>
    API.get<{ success: boolean; data: string[] }>("/consultation/masters/diet-types"),

  // ---------------- Personal history ----------------
  getPersonalHistory: (encounterNo: string) =>
    API.get<{ success: boolean; data: PersonalHistoryRecord | null }>(
      `/consultation/encounters/${encounterNo}/personal-history`,
    ),

  savePersonalHistory: (encounterNo: string, data: PersonalHistoryPayload) =>
    API.put<{ success: boolean; message: string; data: PersonalHistoryRecord }>(
      `/consultation/encounters/${encounterNo}/personal-history`,
      data,
    ),

  // ---------------- Encounter reports ----------------
  getReports: (encounterNo: string) =>
    API.get<{ success: boolean; data: EncounterReportRecord[] }>(
      `/consultation/encounters/${encounterNo}/reports`,
    ),

  addReport: (encounterNo: string, data: EncounterReportPayload) =>
    API.post<{ success: boolean; message: string; data: EncounterReportRecord }>(
      `/consultation/encounters/${encounterNo}/reports`,
      data,
    ),

  updateReport: (encounterReportId: string, data: Partial<EncounterReportPayload>) =>
    API.put<{ success: boolean; message: string; data: EncounterReportRecord }>(
      `/consultation/reports/${encounterReportId}`,
      data,
    ),

  removeReport: (encounterReportId: string) =>
    API.delete<{ success: boolean; message: string }>(
      `/consultation/reports/${encounterReportId}`,
    ),

  // ---------------- Encounter molecular tests ----------------
  getMolecularTests: (encounterNo: string) =>
    API.get<{ success: boolean; data: EncounterMolecularTestRecord[] }>(
      `/consultation/encounters/${encounterNo}/molecular-tests`,
    ),

  addMolecularTest: (encounterNo: string, data: EncounterMolecularTestPayload) =>
    API.post<{ success: boolean; message: string; data: EncounterMolecularTestRecord }>(
      `/consultation/encounters/${encounterNo}/molecular-tests`,
      data,
    ),

  updateMolecularTest: (
    encounterMolecularTestId: string,
    data: Partial<EncounterMolecularTestPayload>,
  ) =>
    API.put<{ success: boolean; message: string; data: EncounterMolecularTestRecord }>(
      `/consultation/molecular-tests/${encounterMolecularTestId}`,
      data,
    ),

  removeMolecularTest: (encounterMolecularTestId: string) =>
    API.delete<{ success: boolean; message: string }>(
      `/consultation/molecular-tests/${encounterMolecularTestId}`,
    ),

  // ---------------- Encounter immunization details ----------------
  getEncounterImmunizations: (encounterNo: string) =>
    API.get<{ success: boolean; data: EncounterImmunizationRecord[] }>(
      `/consultation/encounters/${encounterNo}/immunizations`,
    ),

  /* Sends the full set of selected immunizations; rows missing from the
     list are removed server-side (one bulk sync). */
  saveEncounterImmunizations: (
    encounterNo: string,
    rows: EncounterImmunizationPayload[],
  ) =>
    API.put<{ success: boolean; message: string; data: EncounterImmunizationRecord[] }>(
      `/consultation/encounters/${encounterNo}/immunizations`,
      { rows },
    ),

  // ---------------- Encounter past history treatments ----------------
  getEncounterPastTreatments: (encounterNo: string) =>
    API.get<{ success: boolean; data: EncounterPastTreatmentRecord[] }>(
      `/consultation/encounters/${encounterNo}/past-treatments`,
    ),

  /* Sends the full set of selected treatment types; rows missing from the
     list are removed server-side (one bulk sync). */
  saveEncounterPastTreatments: (
    encounterNo: string,
    rows: EncounterPastTreatmentPayload[],
  ) =>
    API.put<{ success: boolean; message: string; data: EncounterPastTreatmentRecord[] }>(
      `/consultation/encounters/${encounterNo}/past-treatments`,
      { rows },
    ),
};
