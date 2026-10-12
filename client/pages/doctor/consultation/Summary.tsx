import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Styles } from 'jspdf-autotable';
import API, { getActiveBranchId } from "../../../api/axios";
import { appointmentApi } from "../../../api/appointment.api";
import { getUser } from "../../../utils/token";
import { clinicalDetailsApi } from "../../../api/clinicalDetails.api";
import { patientApi } from "../../../api/patient.api";
import { employeeApi } from "../../../api/employee.api";
import { branchApi } from "../../../api/branch.api";
import { encounterApi } from "../../../api/encounter.api";
import {
  chemotherapyApi,
  isChemoPlanClosed,
  type ChemoPlanHydration,
  type ChemoPlanOrderHeader,
  type PharmacySlipRecord,
} from "../../../api/chemotherapy.api";
import {
  consultationApi,
  type PersonalHistoryItem,
  type EncounterReportRecord,
} from "../../../api/consultation.api";
import {
  labTestMasterApi,
  type LabTestMasterRecord,
} from "../../../api/labTestMaster.api";
import { UserProfileDropdown } from "../../../components/ui/User_profile_dropdown";
import type {
  ConsultationState,
  DischargeMedicineRecord,
  MeasurementValues,
  RegimenProtocolDetail,
} from "./types";
import {
  addDaysToIsoDate,
  COURSE_CLOSED_MESSAGE,
  computeProtocolNextVisitDate,
  dateOnlyDMY,
  findActiveEncounter,
  formatDateDMY,
  PAST_HISTORY_MARKER,
  protocolDayDilutions,
  resolveEffectiveStartDate,
} from "./helpers";

/* ============================================================
   SUMMARY COMPONENT
   (combined from client/pages/doctor/summary.tsx 
    renamed PatientSummary  Summary, Step helper moved inside
    the component to avoid colliding with other names in this
    file, embedded prop added so it can live in this file,
    original summary.tsx file left untouched)
============================================================ */

/* Compute and persist the protocol-driven next visit date for the
   patient. Shared by Follow Up and Summary so both steps stay in
   sync with the selected protocol's interval days. */
const computeNextVisitDateForPatient = async (
  patientId: string
): Promise<string> => {
  const protocolId =
    localStorage.getItem(`hms_selected_protocol_id_${patientId}`) ?? "";
  if (!protocolId) return "";

  try {
    const response = await API.get<{
      success: boolean;
      data: { cycle_interval_days: number | null };
    }>(`/chemotherapy/regimen-protocols/${encodeURIComponent(protocolId)}`);
    const intervalDays = response.data.data?.cycle_interval_days;
    const startDateValue = resolveEffectiveStartDate(patientId, intervalDays);
    if (!startDateValue) return "";

    const computed = computeProtocolNextVisitDate(startDateValue, intervalDays);
    if (computed) {
      localStorage.setItem(
        `hms_next_cycle_date_${patientId}`,
        computed
      );
    }
    return computed;
  } catch (error) {
    console.error("Failed to compute next visit date from protocol:", error);
    return "";
  }
};

/* A plan drug: a medicine, or (medicine_id null) a drug name the doctor
   typed for this patient. */
type SummaryPlanItem = {
  chemotherapy_plan_item_id: string;
  medicine_id?: string | null;
  drug_name?: string | null;
  drug_type?: string | null;
  drug_role: string | null;
  protocol_dose: number | null;
  protocol_dose_unit: string | null;
  calculated_dose?: number | string | null;
  calculated_dose_unit?: string | null;
  formulation: string | null;
  dilution_volume: string | null;
  dilution_solution?: string | null;
  administration_route: string | null;
  frequency: string | null;
  remarks: string | null;
  cycle_day?: number | null;
  administration_day?: number | null;
  drug_sequence?: number | null;
  infusion_type?: string | null;
  infusion_duration_minutes?: number | null;
  timing_relative_to_primary?: string | null;
  administration_detail?: string | null;
  medicine_master: {
    medicine_id?: string | null;
    medicine_name: string;
    generic_name: string | null;
    dosage_form: string | null;
    unit: string | null;
  } | null;
};

/* medicine_id for a medicine_master drug, else the typed drug_name. */
type PrescriptionMedicinePayload = {
  medicine_id?: string;
  drug_name?: string;
  drug_role?: string;
  drug_type?: string;
  dosage?: string;
  unit?: string;
  route?: string;
  frequency?: string;
  instruction?: string;
};

type StagingDetailRecord = {
  id?: string;
  staging_detail_id?: string;
  patient_id?: string;
  diagnosis_id?: string | null;
  clinical_stage?: string | null;
  /* Date of Diagnosis (a DATE column). */
  diagnosis_date?: string | null;
  cancer_types?: { cancer_type?: string | null } | null;
  derived_fields?: { ajcc_stage?: string | null } | null;
};

type SummaryPlan = {
  chemotherapy_plan_id: string;
  patient_id: string;
  cancer_type: string | null;
  cancer_subtype: string | null;
  cancer_stage: string | null;
  protocol_name: string | null;
  regimen_name: string | null;
  regimen_code: string | null;
  treatment_intent: string | null;
  treatment_goal: string | null;
  treatment_status: string | null;
  planned_cycles: number;
  completed_cycles: number | null;
  cycle_interval_days: number | null;
  treatment_start_date: string | null;
  expected_end_date: string | null;
  ecog_status?: number | string | null;
  karnofsky_score?: number | string | null;
  diagnosis_id?: string | null;
  staging_detail_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  employees?: {
    employee_id?: string | null;
    first_name?: string | null;
    last_name?: string | null;
  } | null;
  chemotherapy_cycle: {
    cycle_number: number;
    cycle_day: number | null;
    /* The cycle's start (DATE columns); a rescheduled date wins. */
    planned_date?: string | null;
    rescheduled_date?: string | null;
  }[] | null;
  chemotherapy_plan_items: SummaryPlanItem[] | null;
  oncology_staging_detail: StagingDetailRecord | null;
  /* Saved cycle day orders (by cycle / day) and the current one. */
  plan_orders?: ChemoPlanOrderHeader[] | null;
  current_order?: SummaryPlanOrder | null;
};

type SummaryPlanOrder = ChemoPlanOrderHeader & {
  chemotherapy_plan_items: SummaryPlanItem[];
  chemotherapy_plan_hydration?: ChemoPlanHydration[] | null;
};

/* A plan item's display name: its medicine, else the typed name. */
const planItemName = (item: SummaryPlanItem) =>
  item.medicine_master?.medicine_name ||
  item.medicine_master?.generic_name ||
  item.drug_name ||
  "";

/* "297.5 mg": the Dose Cal result (chemotherapy drugs only), "" if none. */
const patientDoseLabel = (item: SummaryPlanItem) =>
  item.calculated_dose != null && item.calculated_dose !== ""
    ? `${Number(item.calculated_dose)} ${
        item.calculated_dose_unit || item.protocol_dose_unit || ""
      }`.trim()
    : "";

/* "175 mg/m²": the protocol (ordered) dose, "" if none. */
const protocolDoseLabel = (item: SummaryPlanItem) =>
  item.protocol_dose != null
    ? `${Number(item.protocol_dose)} ${item.protocol_dose_unit ?? ""}`.trim()
    : "";

type ChemoOrderRow = {
  drug: string;
  form: string;
  /* The protocol dose and its unit. */
  dose: string;
  unit: string;
  /* The Dose Cal result with its unit ("" when not calculated). */
  patientDose: string;
};

/* A row of the visit order's Dilution tab. */
type DilutionRow = {
  drug: string;
  form: string;
  dose: string;
  diluent: string;
  volume: string;
  guidance: string;
};

/* A row of the printed Pharmacy Slip. */
type PharmacySlipRow = {
  drug: string;
  brand: string;
  dosage: string;
  quantity: string;
  type: string;
};

type PremedRow = {
  drug: string;
  dose: string;
  route: string;
  time: string;
};

type DischargeRow = {
  drug: string;
  form: string;
  dose: string;
  frequency: string;
  instruction: string;
  duration: string;
  comment: string;
};

/* A row of the order's Hydration tab. */
type HydrationSummaryRow = {
  stage: "PRE" | "POST";
  agent: string;
  diluent: string;
  volume: string;
  guidance: string;
};

/* A drug's administration details (the order's Admin Instructions tab). */
type AdminInstructionRow = {
  drug: string;
  category: string;
  route: string;
  infusion: string;
  frequency: string;
  timing: string;
  detail: string;
  remarks: string;
};

/* The Chemotherapy Order tab each drug role is listed on. */
const DRUG_ROLE_CATEGORY: Record<string, string> = {
  PRIMARY: "Chemotherapy",
  PREMEDICATION: "Premedication",
  SUPPORTIVE: "Supportive",
  POSTMEDICATION: "Post-medication",
  DILUTION: "Dilution",
};
const DRUG_ROLE_ORDER = ["PRIMARY", "PREMEDICATION", "SUPPORTIVE", "POSTMEDICATION", "DILUTION"];

/* A pharmacy slip row's Type: the drug's role (slips also carry the
   take-home DISCHARGE medicines). */
const slipTypeLabel = (role: string | null | undefined) => {
  const key = (role ?? "").toUpperCase();
  return key === "DISCHARGE" ? "Discharge" : DRUG_ROLE_CATEGORY[key] ?? role ?? "";
};

const CATEGORY_BADGE: Record<string, string> = {
  Chemotherapy: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  Premedication: "bg-sky-50 text-sky-700 ring-sky-200",
  Supportive: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "Post-medication": "bg-amber-50 text-amber-700 ring-amber-200",
  Dilution: "bg-violet-50 text-violet-700 ring-violet-200",
};

/* "500 mL" from a volume + unit (either may be missing). */
const volumeLabel = (
  volume: number | string | null | undefined,
  unit: string | null | undefined
) => {
  if (volume == null || volume === "") return "";
  const value = Number.isFinite(Number(volume)) ? String(Number(volume)) : String(volume);
  return unit ? `${value} ${unit}` : value;
};

const Summary: React.FC<{
  embedded?: boolean;
  patientId?: string;
  appointmentId?: string;
  encounterNo?: string;
  measurements?: MeasurementValues;
}> = ({
  embedded = false,
  patientId,
  appointmentId,
  encounterNo,
  measurements = { height: "", weight: "", bsa: "", bmi: "", bp: "", pulse: "", temp: "", spo2: "", painScore: "" },
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const statePatientId = (
    (location.state as ConsultationState | null)?.patientId ?? ""
  );
  const resolvedPatientId = patientId || statePatientId;

  const [userAvatarUrl, setUserAvatarUrl] = useState<string>(() => localStorage.getItem("user_photo") || "");
  const [avatarLoading, setAvatarLoading] = useState<boolean>(() => !localStorage.getItem("user_photo"));

  const [nextVisitDate, setNextVisitDate] = useState(() =>
    resolvedPatientId
      ? (localStorage.getItem(
          `hms_next_cycle_date_${resolvedPatientId}`
        ) ?? "")
      : ""
  );
  const [nextCycle] = useState(() =>
    resolvedPatientId
      ? (localStorage.getItem(
          `hms_next_cycle_${resolvedPatientId}`
        ) ?? "")
      : ""
  );

  const [plan, setPlan] = useState<SummaryPlan | null>(null);
  /* The cycle day order(s) saved in this visit's encounter. */
  const [encounterOrders, setEncounterOrders] = useState<SummaryPlanOrder[]>([]);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState("");
  const [dischargeMedications, setDischargeMedications] = useState<
    DischargeRow[]
  >([]);
  const [dischargeLoading, setDischargeLoading] = useState(false);
  const [dischargeError, setDischargeError] = useState("");
  const [dischargeProtocolId, setDischargeProtocolId] = useState("");
  /* The protocol, for its hydration template when the visit's order has
     no saved hydration list. */
  const [protocolDetail, setProtocolDetail] =
    useState<RegimenProtocolDetail | null>(null);
  const [patientName, setPatientName] = useState("");
  const [patientMeta, setPatientMeta] = useState({ age: "", gender: "" });
  /* Printed summary signature (the plan's doctor) and footer contact. */
  const [doctorInfo, setDoctorInfo] = useState({ name: "", regNo: "" });
  const [branchContact, setBranchContact] = useState("");

  const [summaryAllergies, setSummaryAllergies] = useState<string[]>([]);
  const [summarySymptoms, setSummarySymptoms] = useState<string[]>([]);
  const [summaryReasonForVisit, setSummaryReasonForVisit] = useState("");
  const [summaryDiscussion, setSummaryDiscussion] = useState("");
  const [summaryHopi, setSummaryHopi] = useState("");
  const [summaryClinicalFindings, setSummaryClinicalFindings] = useState("");
  const [summaryCns, setSummaryCns] = useState("");
  const [summaryCvs, setSummaryCvs] = useState("");
  const [summaryPerAbdomen, setSummaryPerAbdomen] = useState("");
  const [summaryRespiratory, setSummaryRespiratory] = useState("");
  const [summaryGenExam, setSummaryGenExam] = useState<string[]>([]);
  const [summaryPastHistoryTreatment, setSummaryPastHistoryTreatment] =
    useState<{
      type: string;
      date: string;
      note: string;
      response: string;
    } | null>(null);
  const [summaryPreviousReports, setSummaryPreviousReports] = useState("");
  const [summaryImmunization, setSummaryImmunization] = useState<
    PersonalHistoryItem[]
  >([]);
  const [summaryDrugConsumption, setSummaryDrugConsumption] = useState<
    PersonalHistoryItem[]
  >([]);
  const [summaryDietType, setSummaryDietType] = useState("");
  const [summaryReports, setSummaryReports] = useState<EncounterReportRecord[]>(
    []
  );
  const [summaryReportsLoading, setSummaryReportsLoading] = useState(false);
  const [reportForm, setReportForm] = useState({
    encounter_report_id: "",
    lab_test_id: "",
    report_completed_date: "",
    result: "",
    impression: "",
  });
  const [reportSaving, setReportSaving] = useState(false);
  const [reportMessage, setReportMessage] = useState("");
  const [reportLabTests, setReportLabTests] = useState<LabTestMasterRecord[]>(
    []
  );
  const [resolvedSummaryEncounterNo, setResolvedSummaryEncounterNo] =
    useState("");
  /* Date of Admission: the visit's appointment date, else the encounter's
     check-in time. */
  const [appointmentDate, setAppointmentDate] = useState("");
  const [encounterCheckIn, setEncounterCheckIn] = useState("");
  /* The visit's pharmacy slips (pharmacy_slip / pharmacy_slip_item). */
  const [pharmacySlips, setPharmacySlips] = useState<PharmacySlipRecord[]>([]);

  useEffect(() => {
    if (!appointmentId) return;
    let cancelled = false;
    appointmentApi
      .getOne(appointmentId)
      .then((response) => {
        if (cancelled) return;
        setSummaryReasonForVisit(
          response.data?.data?.reason_for_visit ?? ""
        );
        setAppointmentDate(response.data?.data?.appointment_date ?? "");
      })
      .catch((error) => {
        console.error("Failed to load reason for visit:", error);
      });
    return () => {
      cancelled = true;
    };
  }, [appointmentId]);

  useEffect(() => {
    if (!resolvedPatientId) return;
    let cancelled = false;
    const load = async () => {
      try {
        if (encounterNo) {
          const response = await clinicalDetailsApi.getEncounterClinicalDetails(
            encounterNo
          );
          if (cancelled) return;
          const data = response.data?.data;
          setSummaryAllergies(
            (data?.allergies ?? []).map((allergy) => allergy.substanceName)
          );
          setSummarySymptoms(
            (data?.symptoms ?? []).map((symptom) => symptom.symptomName)
          );
          return;
        }
      } catch {
        // Fall through to the patient-level allergies lookup below.
      }
      try {
        const allergyResponse = await API.get<{
          success: boolean;
          data: Array<{
            allergy_master?: { substance_name?: string | null } | null;
            substance_name?: string | null;
            substanceName?: string | null;
          }>;
        }>(`/clinical-details/patients/${resolvedPatientId}/allergies`);
        if (cancelled) return;
        const rows = allergyResponse.data?.data ?? [];
        setSummaryAllergies(
          rows.map(
            (item) =>
              item.substanceName ||
              item.allergy_master?.substance_name ||
              item.substance_name ||
              ""
          ).filter(Boolean)
        );
      } catch {
        // Leave allergies/symptoms empty when unavailable.
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [resolvedPatientId, encounterNo]);

  useEffect(() => {
    if (!encounterNo && !appointmentId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const response = encounterNo
          ? await encounterApi.getByNumber(encounterNo)
          : await encounterApi.getByAppointment(appointmentId!);
        if (cancelled) return;
        const enc = response.data?.data;
        const rawNotes = enc?.clinical_notes ?? "";
        const markerIndex = rawNotes.indexOf(PAST_HISTORY_MARKER);
        setSummaryDiscussion(
          markerIndex !== -1
            ? rawNotes.slice(0, markerIndex).trim()
            : rawNotes.trim()
        );
        setSummaryHopi(
          enc?.history_of_present_illness ?? enc?.symptoms ?? ""
        );
        setSummaryClinicalFindings(
          enc?.clinical_findings ?? enc?.chief_complaint ?? ""
        );
        setSummaryCns(enc?.cns_examination ?? "");
        setSummaryCvs(enc?.cvs_examination ?? "");
        setSummaryPerAbdomen(enc?.per_abdomen_examination ?? "");
        setSummaryRespiratory(enc?.respiratory_examination ?? "");
        setSummaryGenExam(
          [
            enc?.general_examination_icterus ? "Icterus" : "",
            enc?.general_examination_pallor ? "Pallor" : "",
            enc?.general_examination_clubbing ? "Clubbing" : "",
            enc?.general_examination_cyanosis ? "Cyanosis" : "",
            enc?.general_examination_oedema ? "Oedema" : "",
            enc?.general_examination_lymphadenopathy
              ? "Lymphadenopathy"
              : "",
            ...(enc?.general_examination_others ?? []).map(
              (finding) => finding.name
            ),
          ].filter(Boolean)
        );
        setSummaryPastHistoryTreatment(
          enc?.past_history_treatment_type ||
            enc?.past_history_treatment_date ||
            enc?.past_history_treatment_note ||
            enc?.past_history_treatment_response
            ? {
                type: enc?.past_history_treatment_type ?? "",
                date: enc?.past_history_treatment_date
                  ? enc.past_history_treatment_date.slice(0, 10)
                  : "",
                note: enc?.past_history_treatment_note ?? "",
                response: enc?.past_history_treatment_response ?? "",
              }
            : null
        );
        setSummaryPreviousReports(enc?.previous_reports ?? "");
        setResolvedSummaryEncounterNo(enc?.encounter_no ?? "");
        setEncounterCheckIn(enc?.encounter_ts ?? enc?.created_at ?? "");
      } catch (error) {
        console.error("Failed to load summary consultation details:", error);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [encounterNo, appointmentId]);

  useEffect(() => {
    const targetEncounterNo = resolvedSummaryEncounterNo;
    if (!targetEncounterNo) return;
    let cancelled = false;

    consultationApi
      .getPersonalHistory(targetEncounterNo)
      .then((response) => {
        if (cancelled) return;
        const record = response.data.data;
        setSummaryImmunization(record?.immunization ?? []);
        setSummaryDrugConsumption(record?.drug_consumption ?? []);
        setSummaryDietType(record?.diet_type ?? "");
      })
      .catch((error) =>
        console.error("Failed to load summary personal history:", error)
      );

    setSummaryReportsLoading(true);
    consultationApi
      .getReports(targetEncounterNo)
      .then((response) => {
        if (!cancelled) setSummaryReports(response.data.data ?? []);
      })
      .catch((error) =>
        console.error("Failed to load encounter reports:", error)
      )
      .finally(() => {
        if (!cancelled) setSummaryReportsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [resolvedSummaryEncounterNo]);

  useEffect(() => {
    labTestMasterApi
      .getAll()
      .then((response) => setReportLabTests(response.data.data ?? []))
      .catch((error) => console.error("Failed to load lab tests:", error));
  }, []);

  useEffect(() => {
    if (!resolvedPatientId) return;
    let cancelled = false;
    patientApi
      .getById(resolvedPatientId)
      .then((response) => {
        if (cancelled) return;
        const p = response.data.data;
        const name = [
          p?.patient_first_name,
          p?.patient_middle_name,
          p?.patient_last_name,
        ]
          .filter(Boolean)
          .join(" ");
        setPatientName(name);
        setPatientMeta({
          age: p?.patient_age != null ? String(p.patient_age) : "",
          gender: (p?.patient_gender ?? "").charAt(0).toUpperCase(),
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [resolvedPatientId]);

  /* Printed summary: the branch contact line for the footer. */
  useEffect(() => {
    const branchId = getActiveBranchId() ?? getUser()?.branch_id;
    if (!branchId) return;
    let cancelled = false;
    branchApi
      .getById(String(branchId))
      .then((response) => {
        if (cancelled) return;
        const branch = response.data.data;
        setBranchContact(
          [
            branch?.branch_name,
            branch?.emergency_no && `Emergency - ${branch.emergency_no}`,
            branch?.branch_email && `Email - ${branch.branch_email}`,
          ]
            .filter(Boolean)
            .join(", ")
        );
      })
      .catch((error) => console.error("Failed to load branch contact:", error));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!resolvedPatientId) return;
    let cancelled = false;
    setPlanLoading(true);
    setPlanError("");
    /* The patient's open plan (one course at a time), else their latest,
       with its cycle day orders. */
    API.get<{ success: boolean; data: SummaryPlan | null }>(
      "/chemotherapy/plans/latest-for-patient",
      { params: { patient_id: resolvedPatientId } }
    )
      .then((response) => {
        if (!cancelled) setPlan(response.data.data ?? null);
      })
      .catch((error) => {
        console.error("Failed to load chemotherapy plan:", error);
        if (!cancelled) {
          setPlanError(
            error?.response?.data?.message ||
              "Failed to load the chemotherapy plan."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setPlanLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [resolvedPatientId]);

  /* The logged-in doctor signs the printed summary (else the plan's doctor). */
  const signingDoctorId = getUser()?.employee_id ?? plan?.employees?.employee_id ?? "";
  useEffect(() => {
    if (!signingDoctorId) return;
    let cancelled = false;
    employeeApi
      .getOne(String(signingDoctorId))
      .then((response) => {
        if (cancelled) return;
        const detail = response.data.data;
        const employee = detail?.employee;
        const name = [employee?.first_name, employee?.last_name]
          .filter(Boolean)
          .join(" ");
        setDoctorInfo({
          name: name ? `Dr ${name.replace(/^dr\.?\s+/i, "")}` : "",
          regNo: employee?.license_no || detail?.doctorProfile?.license_no || "",
        });
      })
      .catch((error) => console.error("Failed to load doctor details:", error));
    return () => {
      cancelled = true;
    };
  }, [signingDoctorId]);

  /* This visit's cycle day order(s): those saved in its encounter. The
     current order is usually one of them; any other is fetched. */
  const visitEncounterNo = encounterNo || resolvedSummaryEncounterNo;
  useEffect(() => {
    if (!plan || !visitEncounterNo) {
      setEncounterOrders([]);
      return;
    }
    let cancelled = false;
    const headers = (plan.plan_orders ?? []).filter(
      (order) => order.encounter_no === visitEncounterNo
    );
    Promise.all(
      headers.map((header) =>
        plan.current_order?.plan_order_id === header.plan_order_id
          ? Promise.resolve(plan.current_order)
          : chemotherapyApi
              .getPlanOrder(plan.chemotherapy_plan_id, header.cycle_number, header.cycle_day)
              .then((response) => response.data.data as unknown as SummaryPlanOrder | null)
      )
    )
      .then((orders) => {
        if (!cancelled) {
          setEncounterOrders(
            orders.filter((order): order is SummaryPlanOrder => Boolean(order))
          );
        }
      })
      .catch((error) => {
        console.error("Failed to load this visit's chemotherapy order:", error);
        if (!cancelled) setEncounterOrders([]);
      });
    return () => {
      cancelled = true;
    };
  }, [plan, visitEncounterNo]);

  /* This visit's pharmacy slips, for the printed Pharmacy Slip page. */
  useEffect(() => {
    if (!visitEncounterNo) {
      setPharmacySlips([]);
      return;
    }
    let cancelled = false;
    chemotherapyApi
      .getPharmacySlips(visitEncounterNo)
      .then((response) => {
        if (!cancelled) setPharmacySlips(response.data.data ?? []);
      })
      .catch((error) => {
        console.error("Failed to load this visit's pharmacy slip:", error);
        if (!cancelled) setPharmacySlips([]);
      });
    return () => {
      cancelled = true;
    };
  }, [visitEncounterNo]);

  /* Keep the Next Visit Date in sync with the selected protocol's
     cycle interval and the treatment start date so the Summary reflects
     the exact interval days of the chosen protocol / cancer type. */
  useEffect(() => {
    if (!resolvedPatientId) return;
    let cancelled = false;

    computeNextVisitDateForPatient(resolvedPatientId).then((computed) => {
      if (!cancelled && computed) setNextVisitDate(computed);
    });

    return () => {
      cancelled = true;
    };
  }, [resolvedPatientId]);

  useEffect(() => {
    if (!resolvedPatientId) return;
    let cancelled = false;

    const resolveProtocolId = async (): Promise<string> => {
      const savedProtocolId = localStorage.getItem(
        `hms_selected_protocol_id_${resolvedPatientId}`
      );
      if (savedProtocolId) return savedProtocolId;

      try {
        const draft = JSON.parse(
          localStorage.getItem(`hms_treatment_plan_${resolvedPatientId}`) ??
            ""
        ) as { protocol?: string } | null;
        if (draft?.protocol) return draft.protocol;
      } catch {
        // Malformed draft - continue with the plan lookup.
      }

      try {
        const latest = await API.get<{
          success: boolean;
          data: {
            chemotherapy_regimen_protocol?: { protocol_id?: string } | null;
          } | null;
        }>("/chemotherapy/plans/latest-for-patient", {
          params: { patient_id: resolvedPatientId },
        });
        const plan = latest.data.data;
        if (plan?.chemotherapy_regimen_protocol?.protocol_id) {
          return plan.chemotherapy_regimen_protocol.protocol_id;
        }
      } catch (error: any) {
        console.warn(
          "Latest plan fallback failed:",
          error?.response?.data?.message ?? error?.message
        );
      }

      const response = await API.get<{
        success: boolean;
        data: {
          chemotherapy_regimen_protocol?: {
            protocol_id?: string;
          } | null;
        }[];
      }>("/chemotherapy/plans", {
        params: {
          patient_id: resolvedPatientId,
          branchId:
            getActiveBranchId() ?? getUser()?.branch_id ?? undefined,
        },
      });
      const planRow = response.data.data?.[0];
      return planRow?.chemotherapy_regimen_protocol?.protocol_id ?? "";
    };

    setDischargeLoading(true);
    setDischargeError("");
    setDischargeProtocolId("");

    resolveProtocolId()
      .then(async (protocolId) => {
        setDischargeProtocolId(protocolId);
        if (!protocolId) return [];

        const response = await API.get<{
          success: boolean;
          data: DischargeMedicineRecord[];
        }>(
          `/chemotherapy/regimen-protocols/${encodeURIComponent(
            protocolId
          )}/discharge-medicines`
        );

        return [...(response.data.data ?? [])].sort(
          (a, b) => (a.drug_sequence ?? 0) - (b.drug_sequence ?? 0)
        );
      })
      .then((records) => {
        if (cancelled) return;
        setDischargeMedications(
          records.map((item) => ({
            drug:
              item.medicine_master?.medicine_name ||
              item.medicine_master?.generic_name ||
              "",
            form: item.drug_from || item.medicine_master?.dosage_form || "",
            dose:
              item.patient_dose != null && item.patient_dose !== ""
                ? `${item.patient_dose} ${
                    item.patient_dose_unit ?? item.medicine_master?.unit ?? ""
                  }`.trim()
                : "",
            frequency: item.frequency || "",
            instruction:
              item.administration_detail ||
              item.comment ||
              item.composition ||
              "",
            duration: item.duration || "",
            /* Shown separately only when not already used as the instruction. */
            comment:
              item.comment && item.administration_detail ? item.comment : "",
          }))
        );
      })
      .catch((error: any) => {
        console.error("Failed to load discharge medicines:", error);
        if (cancelled) return;
        setDischargeMedications([]);
        setDischargeError(
          error?.response?.data?.message ||
            error?.message ||
            "Failed to load discharge medicines."
        );
      })
      .finally(() => {
        if (!cancelled) setDischargeLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [resolvedPatientId]);

  useEffect(() => {
    if (!dischargeProtocolId) {
      setProtocolDetail(null);
      return;
    }
    let cancelled = false;
    API.get<{ success: boolean; data: RegimenProtocolDetail }>(
      `/chemotherapy/regimen-protocols/${encodeURIComponent(dischargeProtocolId)}`
    )
      .then((response) => {
        if (!cancelled) setProtocolDetail(response.data.data ?? null);
      })
      .catch((error) => {
        console.error("Failed to load the protocol hydration template:", error);
        if (!cancelled) setProtocolDetail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [dischargeProtocolId]);

  /* This visit's drugs: the cycle day order(s) saved in this encounter,
     else the plan's current order, else its baseline (a plan saved before
     cycle day orders). A closed course orders nothing more. */
  const planClosed = isChemoPlanClosed(plan);
  const visitOrders: SummaryPlanOrder[] =
    encounterOrders.length > 0
      ? encounterOrders
      : !planClosed && plan?.current_order
        ? [plan.current_order]
        : [];
  const planItems: SummaryPlanItem[] =
    visitOrders.length > 0
      ? visitOrders.flatMap((order) => order.chemotherapy_plan_items ?? [])
      : planClosed
        ? []
        : plan?.chemotherapy_plan_items ?? [];
  const cycleDayLabel = (order: ChemoPlanOrderHeader) =>
    `Cycle ${order.cycle_number} / Day ${order.cycle_day}`;
  const orderOfItem = (item: SummaryPlanItem) =>
    visitOrders.find((order) =>
      (order.chemotherapy_plan_items ?? []).includes(item)
    );

  const chemotherapyOrders: ChemoOrderRow[] = planItems
    .filter((item) => item.drug_role === "PRIMARY")
    .map((item) => ({
      drug: planItemName(item),
      form:
        item.formulation || item.medicine_master?.dosage_form || "",
      dose: item.protocol_dose != null ? String(Number(item.protocol_dose)) : "",
      unit: item.protocol_dose_unit || item.medicine_master?.unit || "",
      patientDose: patientDoseLabel(item),
    }));

  const premedications: PremedRow[] = planItems
    .filter((item) => item.drug_role === "PREMEDICATION")
    .map((item) => ({
      drug: planItemName(item),
      dose: item.protocol_dose != null ? String(item.protocol_dose) : "",
      route: item.administration_route || "",
      time: item.frequency || "",
    }));

  /* The cycle day(s) this visit orders, e.g. "Cycle 1 / Day 1". */
  const visitCycleDay = visitOrders.map(cycleDayLabel).join(", ");

  /* Hydration: the visit order's saved list, else the protocol's
     hydration template (what the Chemotherapy Order tab shows for a day
     that wasn't saved). A closed course without an order has none. */
  const hydrationSaved = visitOrders.some((order) => order.hydration_saved);
  const hydrationRows: HydrationSummaryRow[] = hydrationSaved
    ? visitOrders
        .filter((order) => order.hydration_saved)
        .flatMap((order) => order.chemotherapy_plan_hydration ?? [])
        .map((row): HydrationSummaryRow => ({
          stage: row.hydration_stage === "POST" ? "POST" : "PRE",
          agent: row.agent_name ?? "",
          diluent: row.diluent ?? "",
          volume: volumeLabel(row.dilution_volume, row.dilution_volume_unit),
          guidance: row.guidance ?? "",
        }))
    : planClosed && visitOrders.length === 0
      ? []
      : (protocolDetail?.protocol_dilutions ?? [])
          .filter((dilution) => !!dilution.hydration_stage)
          .map((dilution): HydrationSummaryRow => ({
            stage:
              (dilution.hydration_stage ?? "").toUpperCase() === "POST" ? "POST" : "PRE",
            agent:
              dilution.medicine_master?.medicine_name || dilution.drug_brand_name || "",
            diluent: dilution.diluent ?? "",
            volume: volumeLabel(dilution.dilution_volume, dilution.dilution_volume_unit),
            guidance: dilution.comment ?? "",
          }))
          .sort(
            (a, b) =>
              (a.stage === "PRE" ? 0 : 1) - (b.stage === "PRE" ? 0 : 1) ||
              a.diluent.localeCompare(b.diluent)
          );

  /* Admin Instructions: every drug of the visit's order, in the order of
     the Chemotherapy Order tabs. */
  const roleRank = (role: string | null) => {
    const rank = DRUG_ROLE_ORDER.indexOf((role ?? "").toUpperCase());
    return rank === -1 ? DRUG_ROLE_ORDER.length : rank;
  };
  const sortedPlanItems = [...planItems].sort(
    (a, b) =>
      roleRank(a.drug_role) - roleRank(b.drug_role) ||
      (a.drug_sequence ?? 0) - (b.drug_sequence ?? 0)
  );
  const adminInstructionRows: AdminInstructionRow[] = sortedPlanItems
    .map((item) => ({
      drug: planItemName(item),
      category:
        DRUG_ROLE_CATEGORY[(item.drug_role ?? "").toUpperCase()] ?? item.drug_role ?? "",
      route: item.administration_route ?? "",
      infusion: [
        item.infusion_type,
        item.infusion_duration_minutes != null
          ? `${item.infusion_duration_minutes} min`
          : "",
      ]
        .filter(Boolean)
        .join(" · "),
      frequency: item.frequency ?? "",
      timing: item.timing_relative_to_primary ?? "",
      detail: item.administration_detail ?? "",
      remarks: item.remarks ?? "",
    }));

  /* Dilution: what the visit order's Dilution tab shows - its saved
     DILUTION rows (deduplicated the same way), else that day's protocol
     template (protocol-level dilutions + those of the day's drugs). */
  const savedDilutionItems = (() => {
    const seen = new Set<string>();
    return planItems
      .filter((item) => (item.drug_role ?? "").toUpperCase() === "DILUTION")
      .filter((item) => {
        const key = JSON.stringify([
          item.medicine_id ?? planItemName(item).trim().toLowerCase(),
          item.formulation || item.medicine_master?.dosage_form || "",
          item.protocol_dose ?? "",
          item.protocol_dose_unit ?? "",
          item.dilution_volume ?? "",
          item.dilution_solution ?? "",
          item.administration_detail ?? "",
        ]);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  })();
  const dilutionRows: DilutionRow[] = savedDilutionItems.some((item) =>
    planItemName(item).trim()
  )
    ? savedDilutionItems.map((item) => ({
        drug: planItemName(item),
        form: item.formulation || item.medicine_master?.dosage_form || "",
        dose: protocolDoseLabel(item),
        diluent: item.dilution_solution ?? "",
        volume: item.dilution_volume ?? "",
        guidance: item.administration_detail ?? "",
      }))
    : (() => {
        const days =
          visitOrders.length > 0
            ? [...new Set(visitOrders.map((order) => order.cycle_day))]
            : planClosed
              ? []
              : [1];
        const seen = new Set<string>();
        return days
          .flatMap((day) => protocolDayDilutions(protocolDetail, day))
          .filter(({ dilution }) => {
            if (seen.has(dilution.protocol_dilution_id)) return false;
            seen.add(dilution.protocol_dilution_id);
            return true;
          })
          .map(({ dilution, item }) => ({
            drug:
              dilution.medicine_master?.medicine_name ||
              dilution.drug_brand_name ||
              (!dilution.medicine_id || dilution.medicine_id === item?.medicine_id
                ? item?.medicine_master?.medicine_name ||
                  item?.medicine_master?.generic_name
                : "") ||
              "",
            form: dilution.form ?? "",
            dose: volumeLabel(dilution.dose, dilution.dose_unit),
            diluent: dilution.diluent ?? "",
            volume: volumeLabel(dilution.dilution_volume, dilution.dilution_volume_unit),
            guidance: dilution.comment ?? "",
          }));
      })();

  /* Chemo Instructions: the Chemotherapy Order's Post Chemo Instructions /
     Additional Notes saved with the visit's order(s). */
  const orderText = (pick: (order: SummaryPlanOrder) => string | null | undefined) => {
    const parts = visitOrders
      .map((order) => ({ order, text: (pick(order) ?? "").trim() }))
      .filter((part) => part.text);
    return parts
      .map((part) =>
        parts.length > 1 ? `${cycleDayLabel(part.order)}: ${part.text}` : part.text
      )
      .join("\n\n");
  };
  const chemoInstructions = orderText((order) => order.chemo_instructions);
  const additionalNotes = orderText((order) => order.additional_notes);

  /* Dates: Diagnosis (the plan's staging detail), Planned (the cycle's
     start - rescheduled if moved - plus the day offset; before the cycle
     rows exist, the treatment start + interval) and Admission (the visit's
     appointment date, else the encounter's check-in). */
  const diagnosisDate = dateOnlyDMY(plan?.oncology_staging_detail?.diagnosis_date);
  const plannedDateFor = (order: ChemoPlanOrderHeader) => {
    const cycle = (plan?.chemotherapy_cycle ?? []).find(
      (row) => row.cycle_number === order.cycle_number
    );
    const cycleStart =
      cycle?.rescheduled_date ||
      cycle?.planned_date ||
      (plan?.treatment_start_date
        ? addDaysToIsoDate(
            plan.treatment_start_date,
            (order.cycle_number - 1) * (plan.cycle_interval_days ?? 0)
          )
        : "");
    return cycleStart
      ? dateOnlyDMY(addDaysToIsoDate(cycleStart, order.cycle_day - 1))
      : "";
  };
  const visitPlannedDate = visitOrders.map(plannedDateFor).filter(Boolean).join(", ");
  const plannedCycleDayLabel = visitOrders
    .map((order) => {
      const date = plannedDateFor(order);
      return date ? `${date} (${cycleDayLabel(order)})` : cycleDayLabel(order);
    })
    .join(", ");
  const admissionDate =
    dateOnlyDMY(appointmentDate) || (encounterCheckIn ? formatDateDMY(encounterCheckIn) : "");

  /* Pharmacy Slip: the visit's slip items, else (no slip yet) the cycle
     day order's medicines with only their name and type. */
  const slipItems = pharmacySlips.flatMap((slip) => slip.pharmacy_slip_item ?? []);
  const pharmacySlipRows: PharmacySlipRow[] =
    slipItems.length > 0
      ? slipItems.map((item) => ({
          drug:
            item.drug_name ||
            item.medicine_master?.medicine_name ||
            item.medicine_master?.generic_name ||
            "",
          brand: item.brand_name || item.medicine_master?.brand_name || "",
          dosage: [item.dose, item.dose_unit].filter(Boolean).join(" "),
          quantity: item.quantity != null ? String(item.quantity) : "",
          type: slipTypeLabel(item.drug_role),
        }))
      : sortedPlanItems.map((item) => ({
          drug: planItemName(item),
          brand: "",
          dosage: "",
          quantity: "",
          type: slipTypeLabel(item.drug_role),
        }));

  const diagnosisSelectionFromStorage = (() => {
    try {
      const raw = localStorage.getItem("hms_diagnosis_selection");
      return raw
        ? (JSON.parse(raw) as {
            cancer_type?: string;
            subtype_name?: string;
          })
        : null;
    } catch {
      return null;
    }
  })();

  /* The plan's own cancer type first: with a multi-type diagnosis it is
     the cancer the chosen protocol treats, not necessarily the primary. */
  const cancerType =
    plan?.cancer_type ||
    diagnosisSelectionFromStorage?.cancer_type ||
    plan?.oncology_staging_detail?.cancer_types?.cancer_type ||
    "";

  const stage =
    plan?.cancer_stage ||
    plan?.oncology_staging_detail?.clinical_stage ||
    plan?.oncology_staging_detail?.derived_fields?.ajcc_stage ||
    "";

  const context = plan?.treatment_intent || plan?.treatment_goal || "";

  const protocolFromStorage = resolvedPatientId
    ? localStorage.getItem(`hms_selected_protocol_name_${resolvedPatientId}`)
    : null;

  const protocol =
    protocolFromStorage ||
    plan?.protocol_name ||
    (plan?.regimen_code
      ? `${plan.regimen_code} - ${plan.regimen_name}`
      : plan?.regimen_name) ||
    "";

  const duration = plan?.planned_cycles
    ? `${plan.planned_cycles} cycle${plan.planned_cycles > 1 ? "s" : ""}${
        plan.cycle_interval_days
          ? ` (every ${plan.cycle_interval_days} days)`
          : ""
      }`
    : "";

  const current = (() => {
    /* This visit's cycle day (every planned cycle row exists once the
       first day is ordered, so the last cycle row isn't the current one). */
    const cycleLabel = visitCycleDay;
    const status = plan?.treatment_status
      ? `${cycleLabel ? " " : ""}(${plan.treatment_status})`
      : "";
    return `${cycleLabel}${status}`;
  })();

  /* Printed / downloaded summary, laid out like the hospital's chemo
     sheets: the day's administration schedule + dilution table, the
     discharge advice, then the full drug list - each section with the
     patient header, the doctor's signature and the contact footer. */
  const handleDownloadSummary = (mode: "download" | "print" = "download") => {
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 40;
    /* Room below for the signature (every page) and the contact footer. */
    const contentBottom = pageHeight - 110;
    const BLACK: [number, number, number] = [17, 17, 17];
    const GREY: [number, number, number] = [100, 100, 100];

    const sheetTitle = protocol || "Chemotherapy Summary";
    const firstOrder = visitOrders[0];
    const cycleDay = firstOrder
      ? `${firstOrder.cycle_number}/${firstOrder.cycle_day}`
      : "";
    /* Date of Admission: the visit's date, else (not loaded) today. */
    const doa = admissionDate || formatDateDMY(new Date().toISOString());
    const ageSex = [patientMeta.age, patientMeta.gender].filter(Boolean).join("/");
    const patientLabel = `${(patientName || resolvedPatientId).toUpperCase()}${
      ageSex ? ` (${ageSex})` : ""
    }`;
    const bsaLabel = measurements.bsa ? `${measurements.bsa} m²` : "";

    /* Patient header. "full" adds intent / cycle / planned date / BSA /
       cancer type / diagnosis date (the first page of a section);
       continuation pages get name, UHID and the date of admission. */
    const drawHeader = (title: string, full: boolean) => {
      let y = 50;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(...BLACK);
      doc.text(title, pageWidth / 2, y, { align: "center" });
      y += 30;

      const rows: [string, string, string, string][] = full
        ? [
            ["Patient Name", patientLabel, "UHID", resolvedPatientId],
            ["Intent of Treatment", context, "Date of Admission", doa],
            ["Current Cycle/Day", cycleDay, "Planned Date", visitPlannedDate],
            ["Cancer Type", cancerType, "BSA", bsaLabel],
            ["Diagnosis Date", diagnosisDate, "", ""],
          ]
        : [
            ["Patient Name", patientLabel, "UHID", resolvedPatientId],
            ["Date of Admission", doa, "", ""],
          ];
      doc.setFontSize(10);
      rows.forEach(([leftLabel, leftValue, rightLabel, rightValue]) => {
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...GREY);
        doc.text(leftLabel, marginX, y);
        if (rightLabel) doc.text(rightLabel, 330, y);
        doc.setTextColor(...BLACK);
        doc.text(`:  ${leftValue || "-"}`, 150, y, { maxWidth: 175 });
        if (rightLabel) doc.text(`:  ${rightValue || "-"}`, 430, y);
        y += 18;
      });
      return y + 8;
    };

    /* Bottom-right signature, drawn on every page just above the footer
       (content stops at contentBottom, so it never overlaps). */
    const drawSignature = () => {
      if (!doctorInfo.name && !doctorInfo.regNo) return;
      const sigY = pageHeight - 90;
      const sigX = pageWidth - marginX - 100;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(...BLACK);
      if (doctorInfo.name) doc.text(doctorInfo.name, sigX, sigY, { align: "center" });
      if (doctorInfo.regNo) {
        doc.setTextColor(...GREY);
        doc.text(`Reg No. ${doctorInfo.regNo}`, sigX, sigY + 16, { align: "center" });
      }
    };

    const tableTheme = {
      theme: "grid" as const,
      styles: {
        font: "helvetica",
        fontSize: 9.5,
        cellPadding: 6,
        textColor: BLACK,
        lineColor: [225, 225, 225] as [number, number, number],
        lineWidth: 0.5,
        valign: "middle" as const,
        overflow: "linebreak" as const,
      },
      headStyles: {
        fillColor: [243, 243, 243] as [number, number, number],
        textColor: BLACK,
        fontStyle: "normal" as const,
        fontSize: 10,
      },
    };

    /* A grid table that redraws the short patient header on every page
       it spills onto. */
    const drawTable = (
      title: string,
      startY: number,
      head: string[],
      body: string[][],
      columnStyles?: Record<number, Partial<Styles>>,
      emptyCell = "-"
    ) => {
      autoTable(doc, {
        ...tableTheme,
        startY,
        head: [head],
        body: body.map((row) => row.map((cell) => cell || emptyCell)),
        columnStyles,
        margin: { left: marginX, right: marginX, top: 132, bottom: 110 },
        didDrawPage: (data) => {
          if (data.pageNumber > 1) drawHeader(title, false);
        },
      });
      return (doc as any).lastAutoTable?.finalY ?? startY;
    };

    const sectionHeading = (text: string, y: number) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...BLACK);
      doc.text(text, marginX, y);
      return y + 12;
    };

    /* ---------- Section 1: day schedule + dilution ---------- */
    let y = drawHeader(sheetTitle, true);

    const ensureSpace = (needed: number) => {
      if (y + needed > contentBottom) {
        doc.addPage();
        y = drawHeader(sheetTitle, false);
      }
    };
    const writeLines = (text: string, bold = false, gapAfter = 4, indent = 0) => {
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(bold ? 12 : 10.5);
      doc.setTextColor(...BLACK);
      const lines = doc.splitTextToSize(
        text,
        pageWidth - marginX * 2 - indent
      ) as string[];
      ensureSpace(lines.length * 15);
      doc.text(lines, marginX + indent, y);
      y += lines.length * 15 + gapAfter;
    };
    /* Ends a sentence with a full stop unless it already has one. */
    const sentence = (text: string) => (/[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`);

    /* ---------- Current Cycle / Day ---------- */
    y = sectionHeading(
      `Current Cycle / Day: ${
        visitOrders.length > 0 ? visitOrders.map(cycleDayLabel).join(", ") : "-"
      }${visitPlannedDate ? `  (Planned ${visitPlannedDate})` : ""}`,
      y
    );
    y += 6;

    /* The protocol diluent for a drug, when the plan item has none. */
    const diluentFor = (item: SummaryPlanItem) => {
      if (item.dilution_solution) return item.dilution_solution;
      const medicineId = item.medicine_id ?? item.medicine_master?.medicine_id;
      return (
        (protocolDetail?.protocol_dilutions ?? []).find(
          (dilution) =>
            !dilution.hydration_stage &&
            dilution.diluent &&
            ((medicineId && dilution.medicine_id === medicineId) ||
              dilution.medicine_master?.medicine_name === planItemName(item))
        )?.diluent ?? ""
      );
    };
    const formPrefix = (item: SummaryPlanItem) => {
      const form = item.formulation || item.medicine_master?.dosage_form || "";
      return /inj/i.test(form) || !form ? "Inj." : `${form}.`;
    };
    const infusionLabel = (item: SummaryPlanItem) => {
      const minutes = item.infusion_duration_minutes;
      if (minutes == null) return "";
      return minutes % 60 === 0
        ? `${minutes / 60} hour${minutes === 60 ? "" : "s"}`
        : `${minutes} mins`;
    };

    /* Every drug of the day's order except the dilutions (their own table
       below), in the order of the Chemotherapy Order tabs. */
    const scheduleItems = sortedPlanItems.filter(
      (item) => (item.drug_role ?? "").toUpperCase() !== "DILUTION"
    );
    const hydrationLine = (row: HydrationSummaryRow) =>
      [[row.agent, row.volume, row.diluent].filter(Boolean).join(" "), row.guidance]
        .filter(Boolean)
        .join(" - ");
    /* A saved dilution volume may already carry its unit ("500 mL"). */
    const volumeText = (volume: string) =>
      /[a-z]/i.test(volume) ? volume : `${volume} ml`;

    /* One readable sentence per drug, e.g. "2. Inj. Paclitaxel
       (Chemotherapy) - protocol dose 175 mg/m², patient dose 297.5 mg,
       given IV in 500 ml of NS over 3 hours as infusion, once." */
    const drugSentence = (item: SummaryPlanItem, index: number) => {
      const role = (item.drug_role ?? "").toUpperCase();
      const category = DRUG_ROLE_CATEGORY[role] ?? item.drug_role ?? "";
      const protocolDose = protocolDoseLabel(item);
      const patientDose = patientDoseLabel(item);
      const diluent = diluentFor(item);
      const duration = infusionLabel(item);
      const doses =
        role === "PRIMARY"
          ? [
              protocolDose ? `protocol dose ${protocolDose}` : "",
              patientDose ? `patient dose ${patientDose}` : "",
            ]
          : [protocolDose ? `dose ${protocolDose}` : ""];
      const administration = [
        item.administration_route ? `given ${item.administration_route}` : "",
        item.dilution_volume
          ? `in ${volumeText(item.dilution_volume)}${diluent ? ` of ${diluent}` : ""}`
          : diluent
            ? `in ${diluent}`
            : "",
        duration ? `over ${duration}` : "",
        item.infusion_type ? `as ${item.infusion_type}` : "",
      ]
        .filter(Boolean)
        .join(" ");
      const details = [
        ...doses,
        administration,
        item.frequency ?? "",
        item.timing_relative_to_primary ?? "",
      ]
        .filter(Boolean)
        .join(", ");
      return sentence(
        `${index + 1}. ${formPrefix(item)} ${planItemName(item)}${
          category ? ` (${category})` : ""
        }${details ? ` - ${details}` : ""}`
      );
    };

    hydrationRows
      .filter((row) => row.stage === "PRE")
      .forEach((row) => writeLines(hydrationLine(row)));

    scheduleItems.forEach((item, index) => {
      const notes = [
        item.administration_detail ? `Administration: ${sentence(item.administration_detail)}` : "",
        item.remarks ? `Remarks: ${sentence(item.remarks)}` : "",
      ].filter(Boolean);
      writeLines(drugSentence(item, index), false, notes.length > 0 ? 0 : 8);
      notes.forEach((note, noteIndex) =>
        writeLines(note, false, noteIndex === notes.length - 1 ? 8 : 0, 16)
      );
    });

    hydrationRows
      .filter((row) => row.stage === "POST")
      .forEach((row) => writeLines(hydrationLine(row)));

    if (scheduleItems.length === 0) {
      writeLines("No chemotherapy ordered for this visit.");
    }

    /* Dilution: what the visit order's Dilution tab shows. */
    if (dilutionRows.length > 0) {
      y += 14;
      ensureSpace(60);
      y = sectionHeading("Dilution", y);
      y = drawTable(
        sheetTitle,
        y,
        ["Sr.", "Drug Name", "Form", "Dose", "Diluent", "Dilution Volume", "Guidance"],
        dilutionRows.map((row, index) => [
          String(index + 1),
          row.drug,
          row.form,
          row.dose,
          row.diluent,
          row.volume,
          row.guidance,
        ]),
        { 0: { cellWidth: 32 } }
      );
    }

    /* Chemo Instructions saved with the order. */
    if (chemoInstructions || additionalNotes) {
      y += 24;
      ensureSpace(50);
      y = sectionHeading("Chemo Instructions", y) + 4;
      if (chemoInstructions) {
        writeLines("Post Chemo Instructions:", false, 0);
        writeLines(chemoInstructions, false, 8, 16);
      }
      if (additionalNotes) {
        writeLines("Additional Notes:", false, 0);
        writeLines(additionalNotes, false, 8, 16);
      }
    }

    /* ---------- Section 2: discharge advice ---------- */
    const dischargeTitle = `DISCHARGE ADVICE - ${sheetTitle}`;
    doc.addPage();
    y = drawHeader(dischargeTitle, true);
    y = sectionHeading("On Discharge Medication", y + 6);
    y = drawTable(
      dischargeTitle,
      y,
      ["Sr.", "DF", "Drug Name", "Dosage", "Freq", "Instruction", "Dur.", "Comment"],
      dischargeMedications.length > 0
        ? dischargeMedications.map((row, index) => [
            String(index + 1),
            row.form,
            row.drug,
            row.dose,
            row.frequency,
            row.instruction,
            row.duration,
            row.comment,
          ])
        : [["", "", "No discharge medication", "", "", "", "", ""]],
      { 0: { cellWidth: 32 } }
    );

    /* Post-chemo instructions: this visit's post-medications, then the
       next visit. */
    const postMeds = planItems.filter(
      (item) => (item.drug_role ?? "").toUpperCase() === "POSTMEDICATION"
    );
    const postLines = [
      ...postMeds.map((item, index) =>
        [
          `${index + 1}. ${planItemName(item)}`,
          item.protocol_dose != null
            ? `${item.protocol_dose} ${item.protocol_dose_unit ?? ""}`.trim()
            : "",
          item.frequency ? `- ${item.frequency}` : "",
          item.administration_detail ? `(${item.administration_detail})` : "",
        ]
          .filter(Boolean)
          .join(" ")
      ),
      nextVisitDate || nextCycle
        ? `Next visit: ${[nextVisitDate, nextCycle].filter(Boolean).join(" - ")}`
        : "",
    ].filter(Boolean);
    if (postLines.length > 0) {
      y += 30;
      const reset = () => drawHeader(dischargeTitle, false);
      if (y + 40 > contentBottom) {
        doc.addPage();
        y = reset();
      }
      y = sectionHeading("Post Chemo Instructions", y) + 4;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      doc.setTextColor(...BLACK);
      postLines.forEach((text) => {
        const lines = doc.splitTextToSize(text, pageWidth - marginX * 2) as string[];
        if (y + lines.length * 15 > contentBottom) {
          doc.addPage();
          y = reset();
          doc.setFont("helvetica", "normal");
          doc.setFontSize(10.5);
          doc.setTextColor(...BLACK);
        }
        doc.text(lines, marginX, y);
        y += lines.length * 15;
      });
    }

    /* ---------- Section 3: pharmacy slip ---------- */
    const slipTitle = `PHARMACY SLIP - ${sheetTitle}`;
    doc.addPage();
    y = drawHeader(slipTitle, false);
    y = sectionHeading("Pharmacy Slip", y + 6);
    y = drawTable(
      slipTitle,
      y,
      ["Sr.", "Drug Name", "Brand Name", "Dosage", "Quantity", "Type"],
      pharmacySlipRows.length > 0
        ? pharmacySlipRows.map((row, index) => [
            String(index + 1),
            row.drug,
            row.brand,
            row.dosage,
            row.quantity,
            row.type,
          ])
        : [["", "No medicines ordered for this visit", "", "", "", ""]],
      { 0: { cellWidth: 32 } },
      /* No slip yet: only the order's names and types, other cells blank. */
      slipItems.length > 0 ? "-" : ""
    );

    /* ---------- Last page: chemotherapy consent ---------- */
    doc.addPage();
    const consentStartPage = doc.getNumberOfPages();
    const consentTitle = "CONSENT FOR CHEMOTHERAPY TREATMENT";
    const drawConsentTitle = () => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(...BLACK);
      doc.text(consentTitle, pageWidth / 2, 50, { align: "center" });
      return 72;
    };
    y = drawConsentTitle();

    autoTable(doc, {
      theme: "plain",
      startY: y,
      margin: { left: marginX, right: marginX },
      styles: { font: "helvetica", fontSize: 9.5, cellPadding: 3, textColor: BLACK },
      columnStyles: {
        0: { textColor: GREY, cellWidth: 95 },
        2: { textColor: GREY, cellWidth: 95 },
      },
      body: [
        ["Patient Name", patientLabel, "UHID", resolvedPatientId || "-"],
        ["Cancer Type", cancerType || "-", "Diagnosis Date", diagnosisDate || "-"],
        ["Protocol", protocol || "-", "Cycle / Day", visitCycleDay || "-"],
        ["Date of Admission", doa || "-", "Planned Date", visitPlannedDate || "-"],
      ],
    });
    y = ((doc as any).lastAutoTable?.finalY ?? y) + 16;

    const consentWidth = pageWidth - marginX * 2;
    const writeConsent = (text: string, options: { bold?: boolean; indent?: number; gap?: number } = {}) => {
      const indent = options.indent ?? 0;
      doc.setFont("helvetica", options.bold ? "bold" : "normal");
      doc.setFontSize(10);
      doc.setTextColor(...BLACK);
      const lines = doc.splitTextToSize(text, consentWidth - indent) as string[];
      if (y + lines.length * 13.5 > contentBottom) {
        doc.addPage();
        y = drawConsentTitle();
        doc.setFont("helvetica", options.bold ? "bold" : "normal");
        doc.setFontSize(10);
      }
      doc.text(lines, marginX + indent, y);
      y += lines.length * 13.5 + (options.gap ?? 4);
    };

    writeConsent(
      "I, the undersigned patient / legal guardian of the above patient, have been informed by the treating oncologist about the diagnosis and the proposed chemotherapy, and I confirm that:",
      { gap: 8 }
    );
    [
      "The nature of my illness, the chemotherapy protocol, the number of cycles, the schedule and the expected benefits of the treatment have been explained to me in a language I understand.",
      "I understand that chemotherapy can cause side effects, commonly nausea, vomiting, loss of appetite, hair loss, tiredness, mouth sores, diarrhoea or constipation, and low blood counts with a higher risk of infection, bleeding and anaemia.",
      "I understand that serious and rarely life-threatening complications may occur, including severe allergic or infusion reactions, damage to the heart, lungs, kidneys, liver or nerves, leakage of the drug outside the vein (extravasation) and severe infection, and that the response to treatment cannot be guaranteed.",
      "The alternatives to chemotherapy, and the likely outcome without treatment, have been discussed with me.",
      "I agree to the blood tests, investigations, intravenous access and supportive medicines (anti-sickness, hydration, growth factors and others) needed to give the treatment safely, and to dose changes, delays or stopping of treatment when the doctor considers it necessary.",
      "I will follow the instructions given to me, take the prescribed medicines, attend the scheduled visits and tests, and report fever, bleeding, breathlessness, severe vomiting, diarrhoea or any new symptom to the hospital immediately.",
      "I have been advised to avoid pregnancy, or fathering a child, during treatment and for the period advised by the doctor, and to inform the doctor if pregnancy is suspected.",
      "I have had the opportunity to ask questions and they have been answered to my satisfaction. I understand that I may refuse or withdraw from treatment at any time, and that this will not affect my further care.",
    ].forEach((statement, index) =>
      writeConsent(`${index + 1}.  ${statement}`, { indent: 0, gap: 5 })
    );
    writeConsent(
      "I give my free and voluntary consent to receive chemotherapy as explained above.",
      { bold: true, gap: 10 }
    );

    /* Signature blocks: Patient / Guardian, Witness, Treating Doctor. */
    /* [label, prefilled value] - a blank value gets a line to write on. */
    const signatureBlocks: [string, [string, string][]][] = [
      [
        "Patient / Guardian",
        [["Signature", ""], ["Name", ""], ["Relationship", ""], ["Date & Time", ""]],
      ],
      ["Witness", [["Signature", ""], ["Name", ""], ["Date & Time", ""]]],
      [
        "Treating Doctor",
        [
          ["Signature", ""],
          ["Name", doctorInfo.name],
          ["Reg No.", doctorInfo.regNo],
          ["Date & Time", ""],
        ],
      ],
    ];
    const blockHeight = 18 + 4 * 20;
    if (y + blockHeight > contentBottom) {
      doc.addPage();
      y = drawConsentTitle();
    }
    const blockWidth = (consentWidth - 2 * 16) / 3;
    signatureBlocks.forEach(([heading, fields], index) => {
      const x = marginX + index * (blockWidth + 16);
      let fieldY = y + 6;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...BLACK);
      doc.text(heading, x, fieldY);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      fields.forEach(([label, value]) => {
        fieldY += 20;
        const labelText = `${label}:`;
        const valueX = x + doc.getTextWidth(labelText) + 4;
        doc.setTextColor(...GREY);
        doc.text(labelText, x, fieldY);
        if (value) {
          doc.setTextColor(...BLACK);
          doc.text(value, valueX, fieldY, { maxWidth: x + blockWidth - valueX });
        } else {
          doc.setDrawColor(160, 160, 160);
          doc.setLineWidth(0.5);
          doc.line(valueX, fieldY + 1, x + blockWidth, fieldY + 1);
        }
      });
    });
    y += blockHeight;

    /* Footer on every page: doctor's signature (not on the consent, which
       has its own blocks), contact strip + page x / n. */
    const pageCount = doc.getNumberOfPages();
    for (let page = 1; page <= pageCount; page++) {
      doc.setPage(page);
      if (page < consentStartPage) drawSignature();
      doc.setFillColor(243, 243, 243);
      doc.rect(marginX, pageHeight - 58, pageWidth - marginX * 2, 44, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...GREY);
      if (branchContact) {
        doc.text(`Contact: ${branchContact}`, marginX + 14, pageHeight - 40, {
          maxWidth: pageWidth - marginX * 2 - 90,
        });
      }
      doc.setFontSize(9);
      doc.text(`Page ${page} / ${pageCount}`, pageWidth - marginX - 14, pageHeight - 24, {
        align: "right",
      });
    }

    if (mode === "print") {
      // Open the same PDF in a new tab with the print dialog triggered.
      doc.autoPrint();
      const printUrl = URL.createObjectURL(doc.output("blob"));
      window.open(printUrl, "_blank");
      setTimeout(() => URL.revokeObjectURL(printUrl), 60_000);
      return;
    }

    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `chemotherapy-summary-${resolvedPatientId || "patient"}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const [submittingSummary, setSubmittingSummary] = useState(false);
  const [summarySubmitted, setSummarySubmitted] = useState(false);
  const [summarySubmitMessage, setSummarySubmitMessage] = useState("");

  /* ------------------------------------------------------------
     PRESCRIPTION (POST /api/prescriptions)
     Created on Submit against the current appointment's OPEN
     encounter, with every medicine on the chemotherapy plan:
     PRIMARY (chemo orders) + PREMEDICATION + SUPPORTIVE /
     POSTMEDICATION (discharge) of this visit's cycle day order. A drug
     name typed on the order goes as free text (drug_name). Duplicate
     medicine ids / names are skipped - the backend rejects duplicate
     medicines within one prescription.
  ------------------------------------------------------------ */

  const buildPrescriptionMedicines = (): PrescriptionMedicinePayload[] => {
    const seenDrugs = new Set<string>();
    const medicines: PrescriptionMedicinePayload[] = [];

    for (const item of planItems) {
      const medicineId =
        item.medicine_id ?? item.medicine_master?.medicine_id ?? "";
      const drugName = medicineId ? "" : (item.drug_name ?? "").trim();
      const drugKey = medicineId || `name:${drugName.toLowerCase()}`;
      if ((!medicineId && !drugName) || seenDrugs.has(drugKey)) continue;
      seenDrugs.add(drugKey);

      const order = orderOfItem(item);
      const instructionParts = [
        item.remarks ?? "",
        item.formulation ? `Formulation: ${item.formulation}` : "",
        item.dilution_volume
          ? `Dilution volume: ${item.dilution_volume}`
          : "",
        order
          ? cycleDayLabel(order)
          : item.cycle_day != null
            ? `Cycle day ${item.cycle_day}`
            : "",
      ].filter(Boolean);

      const hasPatientDose = item.calculated_dose != null;
      const unit =
        (hasPatientDose && item.calculated_dose_unit) ||
        item.protocol_dose_unit ||
        item.medicine_master?.unit ||
        "";

      medicines.push({
        ...(medicineId ? { medicine_id: medicineId } : { drug_name: drugName }),
        ...(item.drug_role ? { drug_role: item.drug_role } : {}),
        ...(item.drug_type ? { drug_type: item.drug_type } : {}),
        ...(hasPatientDose
          ? { dosage: String(Number(item.calculated_dose)) }
          : item.protocol_dose != null
            ? { dosage: String(item.protocol_dose) }
            : {}),
        ...(unit ? { unit } : {}),
        ...(item.administration_route
          ? { route: item.administration_route }
          : {}),
        ...(item.frequency ? { frequency: item.frequency } : {}),
        ...(instructionParts.length > 0
          ? { instruction: instructionParts.join(" | ") }
          : {}),
      });
    }

    return medicines;
  };

  /* ------------------------------------------------------------
     SAVE ADMIN INSTRUCTIONS
     Persists the selected regimen protocol's administration
     instructions (route, infusion, frequency, timing, remarks,
     administration detail) to localStorage keyed by patient so the
     patient-details Order Summary "Instructions" card can show them.
  ------------------------------------------------------------ */

  const saveAdminInstructions = async (): Promise<void> => {
    try {
      const savedProtocolId = localStorage.getItem(
        `hms_selected_protocol_id_${resolvedPatientId}`
      );
      let protocolId = savedProtocolId ?? "";

      if (!protocolId) {
        const planResponse = await API.get<{
          success: boolean;
          data: {
            chemotherapy_regimen_protocol?: {
              protocol_id?: string;
            } | null;
          }[];
        }>("/chemotherapy/plans", {
          params: {
            patient_id: resolvedPatientId,
            branchId:
              getActiveBranchId() ?? getUser()?.branch_id ?? undefined,
          },
        });
        protocolId =
          planResponse.data.data?.[0]?.chemotherapy_regimen_protocol
            ?.protocol_id ?? "";
      }

      if (!protocolId) return;

      const protocolResponse = await API.get<{
        success: boolean;
        data: RegimenProtocolDetail;
      }>(`/chemotherapy/regimen-protocols/${encodeURIComponent(protocolId)}`);

      const items =
        protocolResponse.data.data?.chemotherapy_regimen_protocol_items ??
        [];

      const adminInstructions = items
        .map((item) => ({
          medicineName:
            item.medicine_master?.medicine_name ||
            item.medicine_master?.generic_name ||
            "",
          route: item.administration_route || "",
          infusion: [
            item.infusion_type,
            item.infusion_duration_minutes != null
              ? `${item.infusion_duration_minutes} min`
              : "",
          ]
            .filter(Boolean)
            .join(" · "),
          dose: item.dosage != null ? String(item.dosage) : "",
          frequency: item.frequency || "",
          timing: item.timing_relative_to_primary || "",
          remarks: item.remarks || "",
          administrationDetail: item.administration_detail || "",
        }))
        .filter(
          (instruction) =>
            instruction.administrationDetail ||
            instruction.route ||
            instruction.frequency ||
            instruction.timing ||
            instruction.remarks
        );

      localStorage.setItem(
        `hms_admin_instructions_${resolvedPatientId}`,
        JSON.stringify(adminInstructions)
      );
    } catch (error) {
      console.error("Failed to save admin instructions:", error);
    }
  };

  const resetReportForm = () =>
    setReportForm({
      encounter_report_id: "",
      lab_test_id: "",
      report_completed_date: "",
      result: "",
      impression: "",
    });

  const reloadSummaryReports = async () => {
    if (!resolvedSummaryEncounterNo) return;
    const response = await consultationApi.getReports(
      resolvedSummaryEncounterNo
    );
    setSummaryReports(response.data.data ?? []);
  };

  const handleSaveReport = async () => {
    setReportMessage("");
    if (!resolvedSummaryEncounterNo) {
      setReportMessage("No active encounter found.");
      return;
    }
    if (!reportForm.lab_test_id) {
      setReportMessage("Select a lab test.");
      return;
    }
    try {
      setReportSaving(true);
      const payload = {
        lab_test_id: reportForm.lab_test_id,
        report_completed_date: reportForm.report_completed_date || null,
        result: reportForm.result || null,
        impression: reportForm.impression || null,
      };
      if (reportForm.encounter_report_id) {
        await consultationApi.updateReport(
          reportForm.encounter_report_id,
          payload
        );
      } else {
        await consultationApi.addReport(resolvedSummaryEncounterNo, payload);
      }
      await reloadSummaryReports();
      resetReportForm();
      setReportMessage("Report saved.");
    } catch (error: any) {
      setReportMessage(
        error?.response?.data?.message ||
          error?.message ||
          "Failed to save report."
      );
    } finally {
      setReportSaving(false);
    }
  };

  const handleEditReport = (report: EncounterReportRecord) => {
    setReportForm({
      encounter_report_id: report.encounter_report_id,
      lab_test_id: report.lab_test_id ?? "",
      report_completed_date: report.report_completed_date
        ? report.report_completed_date.slice(0, 10)
        : "",
      result: report.result ?? "",
      impression: report.impression ?? "",
    });
    setReportMessage("");
  };

  const handleDeleteReport = async (encounterReportId: string) => {
    if (!window.confirm("Remove this report?")) return;
    try {
      await consultationApi.removeReport(encounterReportId);
      await reloadSummaryReports();
      setReportMessage("Report removed.");
    } catch (error: any) {
      setReportMessage(
        error?.response?.data?.message || "Failed to remove report."
      );
    }
  };

  const closingCycleDay = () => {
    const pending = visitOrders.filter(
      (order) => order.order_status !== "COMPLETED"
    );
    const days = (plan?.chemotherapy_plan_items ?? []).map((item) => {
      const day = Number(item.administration_day ?? item.cycle_day ?? 1);
      return Number.isFinite(day) && day > 0 ? day : 1;
    });
    if (!plan || pending.length === 0 || days.length === 0) return null;
    const lastDay = Math.max(...days);
    const closing = pending.find((order) => order.cycle_day >= lastDay);
    if (!closing) return null;
    return {
      cycle: closing.cycle_number,
      label: cycleDayLabel(closing),
      closesCourse:
        (plan.completed_cycles ?? 0) + 1 >= (plan.planned_cycles ?? 0),
    };
  };

  const handleSubmitSummary = async () => {
    if (submittingSummary) return;

    if (!resolvedPatientId) {
      setSummarySubmitMessage(
        "Patient is not selected. Open this page from a patient consultation to continue."
      );
      return;
    }

    try {
      setSubmittingSummary(true);
      setSummarySubmitMessage("");

      let targetEncounterNo = encounterNo ?? "";

      if (!targetEncounterNo) {
        const { encounter: found } = await findActiveEncounter(
          resolvedPatientId,
          appointmentId
        );
        targetEncounterNo = found?.encounter_no ?? "";
      }

      if (!targetEncounterNo) {
        setSummarySubmitMessage(
          "No active encounter found for this appointment. A prescription can only be created against an open encounter."
        );
        return;
      }

      const medicines = buildPrescriptionMedicines();

      if (medicines.length === 0) {
        setSummarySubmitMessage(
          planClosed
            ? COURSE_CLOSED_MESSAGE
            : "No medicines found in the chemotherapy plan. Complete the Treatment Plan step first."
        );
        return;
      }

      /* Submitting completes this visit's cycle day order. Say so first
         when that closes a cycle - or the whole course. */
      const closing = closingCycleDay();
      if (
        closing &&
        !window.confirm(
          closing.closesCourse
            ? `This completes ${closing.label}, the last day of the last cycle. The chemotherapy course will be closed and no more orders can be added to it. Continue?`
            : `This completes ${closing.label}, the last day of Cycle ${closing.cycle}. Continue?`
        )
      ) {
        return;
      }

      await API.post("/prescriptions", {
        encounter_no: targetEncounterNo,
        ...(plan?.diagnosis_id ? { diagnosis_id: plan.diagnosis_id } : {}),
        medicines,
      });

      await saveAdminInstructions();

      /* The visit's cycle day order is now completed (read-only); its
         last day completes the cycle, the last cycle the course. */
      let completionNote = "";
      if (plan && !planClosed) {
        try {
          const completion = await chemotherapyApi.completePlanOrders(
            plan.chemotherapy_plan_id,
            targetEncounterNo
          );
          const result = completion.data.data;
          const done = (result?.completed_orders ?? []).map(
            (order) => `Cycle ${order.cycle_number} / Day ${order.cycle_day}`
          );
          completionNote = result?.plan_completed
            ? " The chemotherapy course is completed."
            : done.length > 0
              ? ` ${done.join(", ")} completed.`
              : "";
        } catch (completionError: any) {
          console.error("Failed to complete the cycle day order:", completionError);
          completionNote = ` The cycle day could not be marked completed: ${
            completionError?.response?.data?.message ??
            completionError?.message ??
            "please try again"
          }.`;
        }
      }

      localStorage.removeItem(`hms_diagnosis_form_${resolvedPatientId}`);
      setSummarySubmitted(true);
      setSummarySubmitMessage(
        `Prescription created successfully for this visit.${completionNote}`
      );
    } catch (error: any) {
      console.error("Failed to create prescription:", error);
      setSummarySubmitMessage(
        error?.response?.data?.message ||
          error?.message ||
          "Failed to create the prescription. Please try again."
      );
    } finally {
      setSubmittingSummary(false);
    }
  };

  const Step = ({
    label,
    active = false,
  }: {
    label: string;
    active?: boolean;
  }) => (
    <div className="relative z-10 flex w-48 flex-col items-center gap-3">
      <div
        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs text-white ${
          active ? "bg-green-500" : "bg-slate-400"
        }`}
      >
        
      </div>

      <span
        className={`text-center text-xs font-bold uppercase tracking-wider ${
          active ? "text-slate-800" : "text-slate-600"
        }`}
      >
        {label}
      </span>

      {active && (
        <div className="absolute -bottom-6 h-1 w-full rounded-t-sm bg-green-500" />
      )}
    </div>
  );

  /* =========================================================
     CONTENT (SUMMARY CARD + ACTION BUTTONS)
  ========================================================= */

  const content = (
    <>
      {/* ===================================================
          SUMMARY CARD
      ==================================================== */}
      <div className="mb-6 flex flex-1 flex-col rounded-b-xl border border-slate-200 bg-white shadow-sm">
        {/* Summary Heading */}
        <div className="flex justify-center border-b border-slate-100 p-4">
          <h2 className="text-xl font-semibold text-blue-700">
            Summary
          </h2>
        </div>

        <div className="flex flex-1 flex-col gap-10 p-8">
          {/* =================================================
              PATIENT INFORMATION
          ================================================== */}
          <section>
            {planLoading && (
              <div className="mb-4 text-sm text-slate-500">
                Loading chemotherapy plan...
              </div>
            )}
            {planError && (
              <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {planError}
              </div>
            )}
            {!planLoading && !planError && !plan && (
              <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                No chemotherapy plan found for this patient yet.
              </div>
            )}
            <div className="flex flex-col gap-10 lg:flex-row">
              <div className="flex flex-1 flex-col gap-6">
                <div className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <p className="mb-2 font-medium text-slate-900">
                      Cancer Type
                    </p>
                    <p className="text-sm text-slate-500">
                      {cancerType}
                    </p>
                  </div>

                  <div>
                    <p className="mb-2 font-medium text-slate-900">
                      Stage
                    </p>

                    <p className="flex items-center gap-2 text-sm text-slate-500">
                      {stage}
                      <span className="text-slate-400"></span>
                    </p>
                  </div>

                  <div>
                    <p className="mb-2 font-medium text-slate-900">
                      Context
                    </p>

                    <p className="text-sm text-slate-500">{context}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <p className="mb-2 font-medium text-slate-900">
                      Protocol
                    </p>

                    <p className="flex items-center gap-2 text-sm text-slate-500">
                      {protocol}
                      <span className="text-slate-400"></span>
                    </p>
                  </div>

                  <div>
                    <p className="mb-2 font-medium text-slate-900">
                      Duration
                    </p>

                    <p className="text-sm text-slate-500">
                      {duration}
                    </p>
                  </div>

                  <div>
                    <p className="mb-2 font-medium text-slate-900">
                      Current
                    </p>

                    <p className="text-sm text-slate-500">
                      {current}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <p className="mb-2 font-medium text-slate-900">
                      Diagnosis Date
                    </p>

                    <p className="text-sm text-slate-500">
                      {diagnosisDate || "Not recorded"}
                    </p>
                  </div>

                  <div>
                    <p className="mb-2 font-medium text-slate-900">
                      Planned Date (Cycle / Day)
                    </p>

                    <p className="text-sm text-slate-500">
                      {plannedCycleDayLabel || "Not planned"}
                    </p>
                  </div>

                  <div>
                    <p className="mb-2 font-medium text-slate-900">
                      Date of Admission
                    </p>

                    <p className="text-sm text-slate-500">
                      {admissionDate || "Not recorded"}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <p className="mb-2 font-medium text-slate-900">
                      Allergies
                    </p>

                    <p className="text-sm text-slate-500">
                      {summaryAllergies.length > 0
                        ? summaryAllergies.join(", ")
                        : "No allergies recorded"}
                    </p>
                  </div>

                  <div>
                    <p className="mb-2 font-medium text-slate-900">
                      Symptoms
                    </p>

                    <p className="text-sm text-slate-500">
                      {summarySymptoms.length > 0
                        ? summarySymptoms.join(", ")
                        : "No symptoms recorded"}
                    </p>
                  </div>

                  <div>
                    <p className="mb-2 font-medium text-slate-900">
                      Reason for Visit
                    </p>

                    <p className="text-sm text-slate-500">
                      {summaryReasonForVisit || "No reason recorded"}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <p className="mb-2 font-medium text-slate-900">
                      Discussion
                    </p>

                    <p className="text-sm text-slate-500">
                      {summaryDiscussion || "No discussion recorded"}
                    </p>
                  </div>

                  <div>
                    <p className="mb-2 font-medium text-slate-900">
                      HOPI
                    </p>

                    <p className="text-sm text-slate-500">
                      {summaryHopi || "No HOPI recorded"}
                    </p>
                  </div>

                  <div>
                    <p className="mb-2 font-medium text-slate-900">
                      Clinical findings
                    </p>

                    <p className="text-sm text-slate-500">
                      {summaryClinicalFindings || "No clinical findings recorded"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Vitals box - same vitals as shown in the patient header */}
              <aside className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 p-5 lg:w-72">
                <p className="mb-3 text-sm font-semibold text-slate-900">
                  Vitals
                </p>

                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  {[
                    { label: "HEIGHT", value: measurements.height },
                    { label: "WEIGHT", value: measurements.weight },
                    { label: "BSA", value: measurements.bsa },
                    { label: "BMI", value: measurements.bmi },
                    { label: "BP", value: measurements.bp },
                    { label: "PULSE", value: measurements.pulse },
                    { label: "TEMP", value: measurements.temp },
                    { label: "SPO2", value: measurements.spo2 },
                    { label: "PAIN", value: measurements.painScore },
                  ].map((item) => (
                    <div key={item.label} className="flex flex-col">
                      <div className="text-[10px] font-bold uppercase leading-[15px] tracking-[0.5px] text-slate-400">
                        {item.label}
                      </div>
                      <div className="truncate text-sm font-bold leading-5 text-slate-800">
                        {item.value || "—"}
                      </div>
                    </div>
                  ))}
                </div>
              </aside>
            </div>
          </section>

          {/* =================================================
              GENERAL EXAMINATION
          ================================================== */}
          <section>
            <h3 className="mb-4 text-lg font-medium text-indigo-900">
              General Examination
            </h3>

            <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <p className="mb-2 font-medium text-slate-900">CNS</p>
                <p className="text-sm text-slate-500">
                  {summaryCns || "Not recorded"}
                </p>
              </div>

              <div>
                <p className="mb-2 font-medium text-slate-900">CVS</p>
                <p className="text-sm text-slate-500">
                  {summaryCvs || "Not recorded"}
                </p>
              </div>

              <div>
                <p className="mb-2 font-medium text-slate-900">Respiratory</p>
                <p className="text-sm text-slate-500">
                  {summaryRespiratory || "Not recorded"}
                </p>
              </div>

              <div>
                <p className="mb-2 font-medium text-slate-900">Per Abdomen</p>
                <p className="text-sm text-slate-500">
                  {summaryPerAbdomen || "Not recorded"}
                </p>
              </div>

              <div>
                <p className="mb-2 font-medium text-slate-900">
                  General Examination Findings
                </p>
                <p className="text-sm text-slate-500">
                  {summaryGenExam.length > 0
                    ? summaryGenExam.join(", ")
                    : "No positive findings"}
                </p>
              </div>
            </div>
          </section>

          {/* =================================================
              PERSONAL HISTORY
          ================================================== */}
          <section>
            <h3 className="mb-4 text-lg font-medium text-indigo-900">
              Personal History
            </h3>

            <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <p className="mb-2 font-medium text-slate-900">Immunization</p>
                <p className="text-sm text-slate-500">
                  {summaryImmunization.length > 0
                    ? summaryImmunization
                        .map((item) => item.others || item.name)
                        .join(", ")
                    : "Not recorded"}
                </p>
              </div>

              <div>
                <p className="mb-2 font-medium text-slate-900">
                  Drug Consumption
                </p>
                <p className="text-sm text-slate-500">
                  {summaryDrugConsumption.length > 0
                    ? summaryDrugConsumption
                        .map((item) => item.others || item.name)
                        .join(", ")
                    : "Not recorded"}
                </p>
              </div>

              <div>
                <p className="mb-2 font-medium text-slate-900">Diet Type</p>
                <p className="text-sm text-slate-500">
                  {summaryDietType || "Not recorded"}
                </p>
              </div>
            </div>
          </section>

          {/* =================================================
              PAST HISTORY TREATMENT + PREVIOUS REPORTS
          ================================================== */}
          {(summaryPastHistoryTreatment || summaryPreviousReports) && (
            <section>
              {summaryPastHistoryTreatment && (
                <>
                  <h3 className="mb-4 text-lg font-medium text-indigo-900">
                    Past History Treatment
                  </h3>

                  <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <p className="mb-2 font-medium text-slate-900">
                        Treatment Type
                      </p>
                      <p className="text-sm text-slate-500">
                        {summaryPastHistoryTreatment.type || "Not recorded"}
                      </p>
                    </div>

                    <div>
                      <p className="mb-2 font-medium text-slate-900">Date</p>
                      <p className="text-sm text-slate-500">
                        {summaryPastHistoryTreatment.date || "Not recorded"}
                      </p>
                    </div>

                    <div>
                      <p className="mb-2 font-medium text-slate-900">
                        Brief Note
                      </p>
                      <p className="text-sm text-slate-500">
                        {summaryPastHistoryTreatment.note || "Not recorded"}
                      </p>
                    </div>

                    <div>
                      <p className="mb-2 font-medium text-slate-900">
                        Treatment Response
                      </p>
                      <p className="text-sm text-slate-500">
                        {summaryPastHistoryTreatment.response || "Not recorded"}
                      </p>
                    </div>
                  </div>
                </>
              )}

              {summaryPreviousReports && (
                <>
                  <h3 className="mb-4 text-lg font-medium text-indigo-900">
                    Previous Reports
                  </h3>
                  <p className="text-sm text-slate-500">
                    {summaryPreviousReports}
                  </p>
                </>
              )}
            </section>
          )}

          {/* =================================================
              REPORTS
          ================================================== */}
          <section>
            <h3 className="mb-4 text-lg font-medium text-indigo-900">
              Reports
            </h3>

            {summaryReportsLoading && (
              <div className="mb-4 text-sm text-slate-500">
                Loading reports...
              </div>
            )}



            <div className="overflow-x-auto">
              <table className="w-full min-w-[650px] text-left text-sm">
                <thead>
                  <tr>
                    <th className="w-1/4 pb-3 font-medium text-slate-900">
                      Lab Test
                    </th>
                    <th className="w-1/6 pb-3 font-medium text-slate-900">
                      Date
                    </th>
                    <th className="w-1/5 pb-3 font-medium text-slate-900">
                      Result
                    </th>
                    <th className="w-1/4 pb-3 font-medium text-slate-900">
                      Impression
                    </th>
                  </tr>
                </thead>
                <tbody className="text-slate-800">
                  {summaryReports.length === 0 ? (
                    <tr>
                      <td className="py-3 text-slate-500" colSpan={5}>
                        No reports recorded.
                      </td>
                    </tr>
                  ) : (
                    summaryReports.map((report) => (
                      <tr key={report.encounter_report_id}>
                        <td className="py-3">
                          {report.lab_test_master?.test_name ??
                            report.test_name ??
                            "—"}
                        </td>
                        <td className="py-3">
                          {report.report_completed_date
                            ? report.report_completed_date.slice(0, 10)
                            : "—"}
                        </td>
                        <td className="py-3">{report.result || "—"}</td>
                        <td className="py-3">{report.impression || "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* =================================================
              CHEMOTHERAPY ORDERS
          ================================================== */}
          <section>
            <h3 className="mb-4 text-lg font-medium text-indigo-900">
              Chemotherapy Orders
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[650px] text-left text-sm">
                <thead>
                  <tr>
                    <th className="w-1/4 pb-3 font-medium text-slate-900">
                      Drug Name
                    </th>

                    <th className="w-1/5 pb-3 font-medium text-slate-900">
                      Form
                    </th>

                    <th className="w-1/5 pb-3 font-medium text-slate-900">
                      Dose
                    </th>

                    <th className="w-1/6 pb-3 font-medium text-slate-900">
                      Unit
                    </th>

                    <th className="pb-3 font-medium text-slate-900">
                      Patient Dose
                    </th>
                  </tr>
                </thead>

                <tbody className="text-slate-500">
                  {chemotherapyOrders.map((item) => (
                    <tr key={item.drug}>
                      <td className="py-3">{item.drug}</td>
                      <td className="py-3">{item.form}</td>
                      <td className="py-3">{item.dose}</td>
                      <td className="py-3 text-xs uppercase">
                        {item.unit}
                      </td>
                      <td className="py-3 font-semibold text-slate-800">
                        {item.patientDose || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* =================================================
              DILUTION
          ================================================== */}
          <section>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-medium text-indigo-900">Dilution</h3>
              {visitCycleDay && (
                <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200">
                  {visitCycleDay}
                </span>
              )}
            </div>

            {dilutionRows.length === 0 ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                No dilution ordered for this visit.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead>
                    <tr>
                      <th className="w-1/5 pb-3 font-medium text-slate-900">Drug Name</th>
                      <th className="pb-3 font-medium text-slate-900">Form</th>
                      <th className="pb-3 font-medium text-slate-900">Dose</th>
                      <th className="pb-3 font-medium text-slate-900">Diluent</th>
                      <th className="pb-3 font-medium text-slate-900">Dilution Volume</th>
                      <th className="w-1/4 pb-3 font-medium text-slate-900">Guidance</th>
                    </tr>
                  </thead>

                  <tbody className="text-slate-800">
                    {dilutionRows.map((row, index) => (
                      <tr
                        key={`${row.drug}-${index}`}
                        className="border-t border-slate-100 align-top"
                      >
                        <td className="py-3 pr-4 font-medium text-slate-900">
                          {row.drug || "—"}
                        </td>
                        <td className="py-3 pr-4">{row.form || "—"}</td>
                        <td className="py-3 pr-4">{row.dose || "—"}</td>
                        <td className="py-3 pr-4">{row.diluent || "—"}</td>
                        <td className="py-3 pr-4">{row.volume || "—"}</td>
                        <td className="py-3 text-slate-600">{row.guidance || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* =================================================
              PREMEDICATION
          ================================================== */}
          <section>
            <h3 className="mb-4 text-lg font-medium text-indigo-900">
              Pre-medication
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead>
                  <tr>
                    <th className="w-1/4 pb-3 font-medium text-slate-900">
                      Drug Name
                    </th>

                    <th className="w-1/5 pb-3 font-medium text-slate-900">
                      Dose
                    </th>

                    <th className="w-1/5 pb-3 font-medium text-slate-900">
                      Route
                    </th>

                    <th className="pb-3 font-medium text-slate-900">
                      Time
                    </th>
                  </tr>
                </thead>

                <tbody className="text-slate-800">
                  {premedications.map((item) => (
                    <tr key={item.drug}>
                      <td className="py-3">{item.drug}</td>
                      <td className="py-3">{item.dose}</td>
                      <td className="py-3">{item.route}</td>
                      <td className="py-3">{item.time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* =================================================
              HYDRATION
          ================================================== */}
          <section>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-medium text-indigo-900">Hydration</h3>
              {visitCycleDay && (
                <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200">
                  {visitCycleDay}
                </span>
              )}
            </div>

            {hydrationRows.length === 0 ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                No hydration ordered for this visit.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-sm">
                  <thead>
                    <tr>
                      <th className="w-24 pb-3 font-medium text-slate-900">Stage</th>
                      <th className="w-1/5 pb-3 font-medium text-slate-900">Agent</th>
                      <th className="w-1/5 pb-3 font-medium text-slate-900">Diluent</th>
                      <th className="w-1/6 pb-3 font-medium text-slate-900">Volume</th>
                      <th className="pb-3 font-medium text-slate-900">Guidance</th>
                    </tr>
                  </thead>

                  <tbody className="text-slate-800">
                    {hydrationRows.map((row, index) => (
                      <tr
                        key={`${row.stage}-${row.agent}-${index}`}
                        className="border-t border-slate-100 align-top"
                      >
                        <td className="py-3 pr-4">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${
                              row.stage === "PRE"
                                ? "bg-blue-50 text-blue-700 ring-blue-200"
                                : "bg-amber-50 text-amber-700 ring-amber-200"
                            }`}
                          >
                            {row.stage}
                          </span>
                        </td>
                        <td className="py-3 pr-4 font-medium text-slate-900">
                          {row.agent || "—"}
                        </td>
                        <td className="py-3 pr-4">{row.diluent || "—"}</td>
                        <td className="py-3 pr-4">{row.volume || "—"}</td>
                        <td className="py-3 text-slate-600">{row.guidance || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* =================================================
              ADMINISTRATION INSTRUCTIONS
          ================================================== */}
          <section>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-medium text-indigo-900">
                Administration Instructions
              </h3>
              {visitCycleDay && (
                <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200">
                  {visitCycleDay}
                </span>
              )}
            </div>

            {adminInstructionRows.length === 0 ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                No administration instructions for this visit.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] text-left text-sm">
                  <thead>
                    <tr>
                      <th className="w-1/6 pb-3 font-medium text-slate-900">Drug Name</th>
                      <th className="pb-3 font-medium text-slate-900">Route</th>
                      <th className="pb-3 font-medium text-slate-900">Infusion</th>
                      <th className="pb-3 font-medium text-slate-900">Frequency</th>
                      <th className="pb-3 font-medium text-slate-900">Timing</th>
                      <th className="w-1/5 pb-3 font-medium text-slate-900">Admin Detail</th>
                      <th className="w-1/6 pb-3 font-medium text-slate-900">Remarks</th>
                    </tr>
                  </thead>

                  <tbody className="text-slate-800">
                    {adminInstructionRows.map((row, index) => (
                      <tr
                        key={`${row.category}-${row.drug}-${index}`}
                        className="border-t border-slate-100 align-top"
                      >
                        <td className="py-3 pr-4">
                          <p className="font-medium text-slate-900">{row.drug || "—"}</p>
                          {row.category && (
                            <span
                              className={`mt-1 inline-flex rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${
                                CATEGORY_BADGE[row.category] ??
                                "bg-slate-50 text-slate-600 ring-slate-200"
                              }`}
                            >
                              {row.category}
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-4">{row.route || "—"}</td>
                        <td className="py-3 pr-4">{row.infusion || "—"}</td>
                        <td className="py-3 pr-4">{row.frequency || "—"}</td>
                        <td className="py-3 pr-4">{row.timing || "—"}</td>
                        <td className="py-3 pr-4 text-slate-600">{row.detail || "—"}</td>
                        <td className="py-3 text-slate-600">{row.remarks || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* =================================================
              CHEMO INSTRUCTIONS
          ================================================== */}
          <section>
            <h3 className="mb-4 text-lg font-medium text-indigo-900">
              Chemo Instructions
            </h3>

            <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
              <div>
                <p className="mb-2 font-medium text-slate-900">
                  Post Chemo Instructions
                </p>
                <p className="whitespace-pre-line text-sm text-slate-500">
                  {chemoInstructions || "None recorded"}
                </p>
              </div>

              <div>
                <p className="mb-2 font-medium text-slate-900">
                  Additional Notes
                </p>
                <p className="whitespace-pre-line text-sm text-slate-500">
                  {additionalNotes || "None recorded"}
                </p>
              </div>
            </div>
          </section>

          {/* =================================================
              DISCHARGE MEDICATION
          ================================================== */}
          <section>
            <h3 className="mb-4 text-lg font-medium text-indigo-900">
              Discharge Medication
            </h3>

            {dischargeLoading && (
              <div className="mb-4 text-sm text-slate-500">
                Loading discharge medicines...
              </div>
            )}
            {dischargeError && (
              <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {dischargeError}
              </div>
            )}
            {!dischargeLoading && !dischargeError && dischargeMedications.length === 0 && (
              <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                {dischargeProtocolId
                  ? "No discharge medicines recorded on this patient's protocol yet."
                  : "No treatment protocol selected yet. Select a protocol in the Treatment Plan step to load its discharge medicines."}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead>
                  <tr>
                    <th className="w-1/5 pb-3 font-medium text-slate-900">
                      Drug Name
                    </th>

                    <th className="w-1/6 pb-3 font-medium text-slate-900">
                      Dose
                    </th>

                    <th className="w-1/6 pb-3 font-medium text-slate-900">
                      Frequency
                    </th>

                    <th className="w-1/4 pb-3 font-medium text-slate-900">
                      Instruction
                    </th>

                    <th className="pb-3 font-medium text-slate-900">
                      Duration
                    </th>
                  </tr>
                </thead>

                <tbody className="text-slate-800">
                  {dischargeMedications.map((item) => (
                    <tr key={item.drug}>
                      <td className="py-3">{item.drug}</td>
                      <td className="py-3">{item.dose}</td>
                      <td className="py-3">{item.frequency}</td>
                      <td className="py-3">{item.instruction}</td>
                      <td className="py-3">{item.duration}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* =================================================
              FOOTER DATES
          ================================================== */}
          <section className="grid grid-cols-1 gap-6 border-t border-slate-100 pt-6 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-900">
                Next Visit Date
              </p>

              <p className="text-slate-600">{nextVisitDate}</p>
            </div>

            <div className="sm:pl-8">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-900">
                Next Cycle
              </p>

              <p className="flex items-center gap-2 text-slate-600">
                {nextCycle}
                <span className="text-slate-400"></span>
              </p>
            </div>
          </section>
        </div>
      </div>

      {/* ===================================================
          ACTION BUTTONS
      ==================================================== */}
      {summarySubmitMessage && (
        <div
          className={`mb-4 flex justify-end ${
            summarySubmitted ? "text-green-600" : "text-red-600"
          } text-sm font-medium`}
        >
          {summarySubmitMessage}
        </div>
      )}
      <div className="mb-8 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => handleDownloadSummary("print")}
          className="mr-auto rounded-md border border-[#5624D0] bg-white px-8 py-3 font-medium text-[#5624D0] shadow-sm transition-colors hover:bg-[#5624D0]/5"
        >
          Print
        </button>

        <button
          type="button"
          onClick={handleSubmitSummary}
          disabled={submittingSummary}
          className="rounded-md bg-[#5624D0] px-8 py-3 font-medium text-white shadow-sm transition-colors hover:bg-[#4a1fb5] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submittingSummary ? "Submitting…" : summarySubmitted ? "Submitted" : "Submit"}
        </button>

        <button
          type="button"
          onClick={() => handleDownloadSummary("download")}
          className="rounded-md bg-[#5624D0] px-8 py-3 font-medium text-white shadow-sm transition-colors hover:bg-[#4a1fb5]"
        >
          Download Summary
        </button>
      </div>
    </>
  );

  if (embedded) {
    return content;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 font-sans text-slate-800">
      {/* =========================================================
          LEFT SIDEBAR
      ========================================================== */}
      <aside className="z-10 flex h-full w-[320px] shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white">
        {/* Patient Profile */}
        <div className="flex flex-col items-center border-b border-slate-100 p-8">
          <img
            src=""
            alt="Patient Avatar"
            className="mb-4 h-24 w-24 rounded-full border-2 border-white object-cover shadow-sm"
          />

          <h2 className="mb-1 text-xl font-bold text-slate-900">
            {""}
          </h2>

          <p className="mb-4 text-sm text-slate-500">{""}</p>

          <span className="mb-6 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {""}
          </span>

          <p className="text-center text-sm font-semibold tracking-wide text-blue-600">
            {""}
          </p>
        </div>

        {/* Contact Information */}
        <div className="flex flex-col gap-6 border-b border-slate-100 p-6">
          {/* Phone */}
          <div className="flex items-center gap-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-400">
              <span className="text-sm"></span>
            </div>

            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-400">
                Phone
              </p>

              <p className="text-sm font-medium text-slate-800">
                {""}
              </p>
            </div>
          </div>

          {/* Email */}
          <div className="flex items-center gap-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-400">
              <span className="text-sm"></span>
            </div>

            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-400">
                Email
              </p>

              <p className="text-sm font-medium text-slate-700">
                {""}
              </p>
            </div>
          </div>
        </div>

        {/* Vitals */}
        <div className="mb-6 grid grid-cols-2 gap-x-4 gap-y-6 p-6">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-400">
              Height
            </p>
            <p className="font-semibold text-slate-800">{measurements.height}</p>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-400">
              Weight
            </p>
            <p className="font-semibold text-slate-800">{measurements.weight}</p>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-400">
              BSA
            </p>
            <p className="font-semibold text-slate-800">{measurements.bsa}</p>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-400">
              BMI
            </p>
            <p className="font-semibold text-slate-800">{measurements.bmi}</p>
          </div>
        </div>

        {/* Profile Button */}
        <div className="px-6 pb-6">
          <button
            type="button"
            onClick={() => {
              if (!resolvedPatientId) return;
              navigate("/doctor/patient-details", {
                state: { patientId: resolvedPatientId },
              });
            }}
            className="w-full rounded-md border border-blue-600 px-4 py-2.5 font-medium text-blue-600 transition-colors hover:bg-blue-50"
          >
            View Full Profile
          </button>
        </div>
      </aside>

      {/* =========================================================
          MAIN CONTENT
      ========================================================== */}
      <main className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-slate-50">
        {/* =======================================================
            TOP NAVIGATION
        ======================================================== */}
        <header className="z-10 flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="text-slate-500 transition-colors hover:text-slate-700"
              aria-label="Back"
            >
              <span className="text-lg"></span>
            </button>

            <h1 className="text-xl font-semibold text-slate-800">
              Patients
            </h1>
          </div>

          <div className="flex items-center gap-6">
            {/* Notification */}
            <button
              type="button"
              className="relative text-slate-500 transition-colors hover:text-slate-700"
              aria-label="Notifications"
            >
              <span className="text-xl"></span>

              <span className="absolute right-0 top-0 h-2 w-2 rounded-full border border-white bg-red-500" />
            </button>

            {/* User */}
            <UserProfileDropdown
              userName={getUser()?.username || "Doctor"}
              userSubtext={getUser()?.role || "Doctor"}
              userAvatar={userAvatarUrl || undefined}
              avatarLoading={avatarLoading}
              onLogout={() => { localStorage.clear(); window.location.href = '/login'; }}
              profilePath="/doctor/profile"
              notificationsPath="/doctor/notifications"
            />
          </div>
        </header>

        {/* =======================================================
            SCROLLABLE CONTENT
        ======================================================== */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="mx-auto flex w-full max-w-[1000px] flex-col">
            {/* ===================================================
                PROGRESS STEPPER
            ==================================================== */}
            <div className="relative mb-px flex justify-between rounded-t-xl border border-slate-200 bg-white p-6">
              {/* Background connector */}
              <div className="absolute left-24 right-24 top-9 h-[2px] bg-slate-100" />

              {/* Green progress */}
              <div className="absolute left-24 top-9 h-[2px] w-1/2 bg-green-500" />

              <Step label="Discharge Medication" />

              <Step label="Follow Up" />

              <Step label="Summary" active />
            </div>

            {content}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Summary;
