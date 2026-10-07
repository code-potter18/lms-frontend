import React, { useEffect, useRef, useState } from "react";
import { appointmentApi } from "../../../api/appointment.api";
import type { PatientRecord } from "../../../api/patient.api";
import { encounterApi, type EncounterRecord } from "../../../api/encounter.api";
import {
  consultationApi,
  type ConsultationOptionRecord,
  type ImmunizationRecord,
  type DrugConsumptionRecord,
  type PersonalHistoryItem,
} from "../../../api/consultation.api";
import type { LabTestMasterRecord } from "../../../api/labTestMaster.api";
import { Calendar } from "../../../components/ui/calendar";
import {
  ClinicalDetailsSection,
  type ClinicalDetailsSectionHandle,
} from "../../../components/hms/ClinicalDetailsSection";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../components/ui/popover";
import { MultiSelectDropdown } from "../../../components/ui/multi-select-dropdown";
import { SingleSelectDropdown } from "../../../components/ui/single-select-dropdown";
import VoiceToText from "@/components/ui/voicetotext";
import AdviceSection, {
  type AdviceSaveResult,
  type AdviceSectionHandle,
} from "./AdviceSection";
import type { ConsultationState } from "./types";
import { computeBmi, computeBsa } from "../../../utils/vitals";
import { printConsultationSummary } from "../../../utils/consultationSummaryPrint";
import {
  formatDateDMY,
  formatPickedDate,
  formatTimeAMPM,
  parsePickedDate,
  PAST_HISTORY_MARKER,
} from "./helpers";

/* ============================================================
   CONSULTATION STEP
   The Consultation tab of the patient consultation page: visit
   summary, history, examination, previous reports, investigations
   and Advice. The page keeps this step mounted (hidden on the
   other steps) so unsaved input survives step switches.
   ============================================================ */

/* Master option names plus any selected value that isn't in the master
   (e.g. an older free-text "Others" entry), so it still shows ticked. */
const withSelected = (names: string[], selected: string[]) => [
  ...names,
  ...selected.filter(
    (value) => !names.some((name) => name.toLowerCase() === value.toLowerCase())
  ),
];

/* Standard General Examination findings and the encounter column each is
   stored in (a positive finding is saved as a boolean). */
const GENERAL_EXAM_FLAGS = [
  { label: "Icterus", field: "general_examination_icterus" },
  { label: "Pallor", field: "general_examination_pallor" },
  { label: "Clubbing", field: "general_examination_clubbing" },
  { label: "Cyanosis", field: "general_examination_cyanosis" },
  { label: "Oedema", field: "general_examination_oedema" },
  {
    label: "Lymphadenopathy",
    field: "general_examination_lymphadenopathy",
  },
] as const;

const hasGeneralExamFinding = (selected: string[], label: string) =>
  selected.some((value) => value.toLowerCase() === label.toLowerCase());

interface ConsultationStepProps {
  consultationState: ConsultationState | null;
  patient: PatientRecord | null;
  patientName: string;
  patientDisplayId: string;
  encounter: EncounterRecord | null;
  encounterError: string;
  visitDate: string;
  onVisitDateChange: (value: string) => void;
  /* Investigations live in the page: Lab Review orders the selected tests. */
  labTests: LabTestMasterRecord[];
  labTestsLoading: boolean;
  labTestsError: string;
  selectedInvestigations: string[];
  onSelectedInvestigationsChange: React.Dispatch<React.SetStateAction<string[]>>;
  onToast: (message: string) => void;
  /* Called after the consultation is saved by Proceed to Next. */
  onProceed: () => void;
}

const ConsultationStep: React.FC<ConsultationStepProps> = ({
  consultationState,
  patient,
  patientName,
  patientDisplayId,
  encounter,
  encounterError,
  visitDate,
  onVisitDateChange: setVisitDate,
  labTests,
  labTestsLoading,
  labTestsError,
  selectedInvestigations,
  onSelectedInvestigationsChange: setSelectedInvestigations,
  onToast: showToast,
  onProceed,
}) => {
  const adviceSectionRef = useRef<AdviceSectionHandle>(null);

  /* Advice rows are saved together with the consultation. */
  const saveAdvice = (targetEncounter: EncounterRecord) =>
    adviceSectionRef.current?.save(targetEncounter) ??
    Promise.resolve<AdviceSaveResult>("empty");

  const [consultationNotes, setConsultationNotes] = useState("");

  const [historyOfPresentIllness, setHistoryOfPresentIllness] = useState("");

  const [patientHistory, setPatientHistory] = useState("");
  const [pastHistory, setPastHistory] = useState("");
  const [pastHistoryTreatmentType, setPastHistoryTreatmentType] = useState("");
  const [pastHistoryTreatmentDate, setPastHistoryTreatmentDate] = useState("");
  const [pastHistoryTreatmentNote, setPastHistoryTreatmentNote] = useState("");
  const [pastHistoryTreatmentResponse, setPastHistoryTreatmentResponse] =
    useState("");

  const [reportsTest, setReportsTest] = useState("");
  /* A test typed by hand when it isn't in lab_test_master; saved on this
     patient's report only (the master isn't changed). */
  const [reportsTestName, setReportsTestName] = useState("");
  const [reportsTestDate, setReportsTestDate] = useState("");
  const [reportsTestResult, setReportsTestResult] = useState("");
  const [reportsTestImpression, setReportsTestImpression] = useState("");

  /* Molecular Testing (moved here from the Diagnosis tab): one row per test
     per visit in encounter_molecular_test. A test that isn't listed is
     typed by hand and saved for this patient only. */
  const [molecularTestOptions, setMolecularTestOptions] = useState<string[]>(
    []
  );
  const [molecularTest, setMolecularTest] = useState("");
  const [molecularTestDate, setMolecularTestDate] = useState("");
  const [molecularTestResult, setMolecularTestResult] = useState("");
  const [molecularTestImpression, setMolecularTestImpression] = useState("");
  const [reportsText, setReportsText] = useState("");

  const [chiefComplaint, setChiefComplaint] = useState("");
  const [reasonOfVisit, setReasonOfVisit] = useState("");

  const [otherInvestigationExpanded, setOtherInvestigationExpanded] =
    useState(false);
  const [otherInvestigationName, setOtherInvestigationName] = useState("");
  const [customInvestigations, setCustomInvestigations] = useState<string[]>(
    []
  );

  const [investigationNotes, setInvestigationNotes] = useState<
    Record<string, string>
  >({});
  const [additionalInstructions, setAdditionalInstructions] = useState("");

  /* Standard General Examination findings (one row of checkbox -> one
     multi-select field). Persisted as per-finding booleans, so the
     selection is kept as the finding names. */
  const [generalExamFindings, setGeneralExamFindings] = useState<string[]>([]);
  /* Extra General Examination findings (general_examination_master). */
  const [generalExamOthers, setGeneralExamOthers] = useState<string[]>([]);
  const [generalExamOptions, setGeneralExamOptions] = useState<
    ConsultationOptionRecord[]
  >([]);
  const [treatmentTypeOptions, setTreatmentTypeOptions] = useState<
    ConsultationOptionRecord[]
  >([]);

  const [systemicCns, setSystemicCns] = useState("");
  const [systemicCvs, setSystemicCvs] = useState("");
  const [systemicRespiratory, setSystemicRespiratory] = useState("");
  const [systemicPerAbdomen, setSystemicPerAbdomen] = useState("");
  const [systemicClinicalFindings, setSystemicClinicalFindings] = useState("");
  const [allVitalsNormal, setAllVitalsNormal] = useState(false);

  const [immunizationOptions, setImmunizationOptions] = useState<
    ImmunizationRecord[]
  >([]);
  const [drugConsumptionOptions, setDrugConsumptionOptions] = useState<
    DrugConsumptionRecord[]
  >([]);
  const [dietTypeOptions, setDietTypeOptions] = useState<string[]>([]);
  const [selectedImmunizations, setSelectedImmunizations] = useState<string[]>(
    []
  );
  const [selectedDrugConsumptions, setSelectedDrugConsumptions] = useState<
    string[]
  >([]);
  const [dietType, setDietType] = useState("");

  const [proceeding, setProceeding] = useState(false);

  const clinicalDetailsRef = useRef<ClinicalDetailsSectionHandle>(null);

  /* ============================================================
     SYNC HISTORY OF PRESENT ILLNESS FROM ACTIVE ENCOUNTER
     Seed the free-text HOPI box with the encounter's saved
     symptoms when the encounter loads. Only applied on load so
     it never stomps in-progress typing after an update.
   ============================================================ */

  useEffect(() => {
    setHistoryOfPresentIllness(
      encounter?.history_of_present_illness ?? encounter?.symptoms ?? ""
    );
    setChiefComplaint(encounter?.chief_complaint ?? "");
    setPatientHistory(encounter?.chief_complaint ?? "");
    setSystemicCns(encounter?.cns_examination ?? "");
    setSystemicCvs(encounter?.cvs_examination ?? "");
    setSystemicPerAbdomen(encounter?.per_abdomen_examination ?? "");
    setSystemicRespiratory(encounter?.respiratory_examination ?? "");
    setSystemicClinicalFindings(encounter?.clinical_findings ?? "");

    setGeneralExamFindings(
      GENERAL_EXAM_FLAGS.filter((flag) =>
        Boolean(encounter?.[flag.field as keyof EncounterRecord])
      ).map((flag) => flag.label)
    );
    setGeneralExamOthers(
      (encounter?.general_examination_others ?? []).map(
        (finding) => finding.name
      )
    );

    /* Past History treatment + Previous Reports free text. */
    setPastHistoryTreatmentType(encounter?.past_history_treatment_type ?? "");
    setPastHistoryTreatmentDate(
      encounter?.past_history_treatment_date
        ? encounter.past_history_treatment_date.slice(0, 10)
        : ""
    );
    setPastHistoryTreatmentNote(encounter?.past_history_treatment_note ?? "");
    setPastHistoryTreatmentResponse(
      encounter?.past_history_treatment_response ?? ""
    );
    setReportsText(encounter?.previous_reports ?? "");

    /* Consultation Notes and Past History share the encounter's
       clinical_notes column, separated by a [Past History] marker
       (see proceedNext). A saved draft takes precedence over the
       encounter so in-session work is never clobbered. */
    let draftNotes = "";
    let draftPast = "";
    try {
      const draft = JSON.parse(
        localStorage.getItem("hms_consultation_draft") ?? "{}"
      );
      draftNotes = draft.consultationNotes ?? "";
      draftPast = draft.pastHistory ?? "";
    } catch {
      /* Malformed draft - fall back to the encounter. */
    }

    if (draftNotes) {
      setConsultationNotes(draftNotes);
      setPastHistory(draftPast);
      return;
    }

    const rawNotes = encounter?.clinical_notes ?? "";
    const markerIndex = rawNotes.indexOf(PAST_HISTORY_MARKER);
    if (markerIndex === -1) {
      setConsultationNotes(rawNotes);
      setPastHistory("");
    } else {
      setConsultationNotes(rawNotes.slice(0, markerIndex).trim());
      setPastHistory(
        rawNotes.slice(markerIndex + PAST_HISTORY_MARKER.length).trim()
      );
    }
  }, [encounter?.encounter_no]);

  /* ============================================================
     LOAD PERSONAL HISTORY MASTER DATA
     Immunization / drug consumption options + diet types from
     the consultation module, plus any values already saved for
     the active encounter.
   ============================================================ */

  useEffect(() => {
    let cancelled = false;
    consultationApi
      .getImmunizations()
      .then((response) => {
        if (!cancelled) setImmunizationOptions(response.data.data ?? []);
      })
      .catch((error) =>
        console.error("Failed to load immunization options:", error)
      );
    consultationApi
      .getDrugConsumptions()
      .then((response) => {
        if (!cancelled) setDrugConsumptionOptions(response.data.data ?? []);
      })
      .catch((error) =>
        console.error("Failed to load drug consumption options:", error)
      );
    consultationApi
      .getGeneralExaminationFindings()
      .then((response) => {
        if (!cancelled) setGeneralExamOptions(response.data.data ?? []);
      })
      .catch((error) =>
        console.error("Failed to load general examination findings:", error)
      );
    consultationApi
      .getTreatmentTypes()
      .then((response) => {
        if (!cancelled) setTreatmentTypeOptions(response.data.data ?? []);
      })
      .catch((error) =>
        console.error("Failed to load treatment types:", error)
      );
    consultationApi
      .getMolecularTestOptions()
      .then((response) => {
        if (!cancelled) setMolecularTestOptions(response.data.data ?? []);
      })
      .catch((error) =>
        console.error("Failed to load molecular test options:", error)
      );
    consultationApi
      .getDietTypes()
      .then((response) => {
        if (!cancelled) setDietTypeOptions(response.data.data ?? []);
      })
      .catch((error) => console.error("Failed to load diet types:", error));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const encounterNo = encounter?.encounter_no;
    if (!encounterNo) return;
    let cancelled = false;
    consultationApi
      .getPersonalHistory(encounterNo)
      .then((response) => {
        if (cancelled) return;
        const record = response.data.data;
        if (!record) return;

        /* Master values by name; older free-text "Others" entries by
           their typed text, shown as selected values of their own. */
        const toNames = (items: PersonalHistoryItem[]) =>
          items
            .map((item) => (item.others ? item.others : item.name))
            .filter(Boolean);
        setSelectedImmunizations(toNames(record.immunization ?? []));
        setSelectedDrugConsumptions(toNames(record.drug_consumption ?? []));

        setDietType(record.diet_type ?? "");
      })
      .catch((error) =>
        console.error("Failed to load personal history:", error)
      );
    return () => {
      cancelled = true;
    };
  }, [encounter?.encounter_no]);

  /* Master values are saved as {code, name}; a value that isn't in the
     master (an older free-text entry) keeps the "Others" item shape. */
  /* Show the visit's most recent saved molecular test, so a saved (or
     migrated) value is visible when the consultation is reopened. */
  useEffect(() => {
    const encounterNo = encounter?.encounter_no;
    if (!encounterNo) return;
    let cancelled = false;
    consultationApi
      .getMolecularTests(encounterNo)
      .then((response) => {
        if (cancelled) return;
        const rows = response.data.data ?? [];
        const latest = rows[rows.length - 1];
        setMolecularTest(latest?.test_name ?? "");
        setMolecularTestDate(latest?.test_date?.slice(0, 10) ?? "");
        setMolecularTestResult(latest?.result ?? "");
        setMolecularTestImpression(latest?.impression ?? "");
      })
      .catch((error) =>
        console.error("Failed to load molecular tests:", error)
      );
    return () => {
      cancelled = true;
    };
  }, [encounter?.encounter_no]);

  const buildPersonalHistoryItems = (
    selectedNames: string[],
    options: ImmunizationRecord[] | DrugConsumptionRecord[]
  ): PersonalHistoryItem[] =>
    selectedNames.map((name) => {
      const match = options.find(
        (option) => option.name.toLowerCase() === name.toLowerCase()
      );
      return match
        ? { code: match.code, name: match.name }
        : { code: "OTHERS", name: "Others", others: name };
    });

  const savePersonalHistory = async (encounterNo: string) => {
    await consultationApi.savePersonalHistory(encounterNo, {
      immunization: buildPersonalHistoryItems(
        selectedImmunizations,
        immunizationOptions
      ),
      drug_consumption: buildPersonalHistoryItems(
        selectedDrugConsumptions,
        drugConsumptionOptions
      ),
      diet_type: dietType || null,
    });
  };

  /* "+ Add" on a search with no match: the value is added to its master
     list (so every patient gets it as an option) and selected here. The
     backend returns the existing row when the name is already there. */
  const addMasterOption = async <T extends { code: string; name: string }>(
    create: () => Promise<{ data: { data: T } }>,
    setOptions: React.Dispatch<React.SetStateAction<T[]>>,
    select: (name: string) => void,
    label: string
  ) => {
    try {
      const record = (await create()).data.data;
      setOptions((previous) =>
        previous.some((option) => option.code === record.code)
          ? previous
          : [...previous, record]
      );
      select(record.name);
    } catch (error: any) {
      showToast(
        error?.response?.data?.message ?? `Failed to add the ${label}.`
      );
    }
  };

  const addToSelection =
    (setter: React.Dispatch<React.SetStateAction<string[]>>) =>
    (name: string) =>
      setter((previous) =>
        previous.some((value) => value.toLowerCase() === name.toLowerCase())
          ? previous
          : [...previous, name]
      );

  const registeredOn = patient
    ? formatDateDMY(patient.user_table?.created_at)
    : "";

  const visitTime = formatTimeAMPM(consultationState?.appointmentTime);

  /* ------------------------------------------------------------
     VISIT TYPE
     Primary source: visit_type passed by the Dashboard via router
     state (appointment_history.Patient_visit_type). If it was not
     supplied (or empty), fall back to the appointment linked to the
     active encounter.
  ------------------------------------------------------------ */

  const [fallbackVisitType, setFallbackVisitType] = useState("");

  useEffect(() => {
    const appointmentId = encounter?.appointment_id;
    if (!appointmentId) return;
    let cancelled = false;
    appointmentApi
      .getOne(appointmentId)
      .then((response) => {
        if (cancelled) return;
        if (!consultationState?.visit_type) {
          setFallbackVisitType(
            response.data?.data?.Patient_visit_type ?? ""
          );
        }
        setReasonOfVisit(response.data?.data?.reason_for_visit ?? "");
      })
      .catch((error) => {
        console.error("Failed to load appointment visit type:", error);
      });
    return () => {
      cancelled = true;
    };
  }, [consultationState?.visit_type, encounter?.appointment_id]);

  const visitType =
    consultationState?.visit_type || fallbackVisitType || "";

  const consultedBy = consultationState?.consultedBy || "";

/* ============================================================
     NOTIFICATIONS - Using global BellNotificationButton
   ============================================================ */

  /* ============================================================
     LOAD DRAFT
  ============================================================ */

  useEffect(() => {
    const saved = localStorage.getItem("hms_consultation_draft");

    if (!saved) return;

    try {
      const data = JSON.parse(saved);

      if (data.consultationNotes) {
        setConsultationNotes(data.consultationNotes);
      }
    } catch (error) {
      console.error("Draft loading failed", error);
    }
  }, []);

  /* ============================================================
     INVESTIGATION
  ============================================================ */

  /* Adds a user-typed custom investigation (Others... or the dropdown's
     "+ Add") as a selectable option. If the typed name matches a real
     lab test it just selects that test; otherwise it registers a custom
     option. */

  const addInvestigationByName = (name: string) => {
    const value = name.trim();
    if (!value) return;
    if (investigations.includes(value)) {
      setSelectedInvestigations((prev) =>
        prev.includes(value) ? prev : [...prev, value]
      );
    } else if (!customInvestigations.includes(value)) {
      setCustomInvestigations((prev) => [...prev, value]);
      setSelectedInvestigations((prev) =>
        prev.includes(value) ? prev : [...prev, value]
      );
    }
  };

  const addOtherInvestigation = () => {
    addInvestigationByName(otherInvestigationName);
    setOtherInvestigationName("");
    setOtherInvestigationExpanded(false);
  };

  /* The dropdown reports the full list of selected test names.
     Unselecting a custom investigation removes both its option and its
     selection (same behaviour as the old checkbox grid). */

  const handleInvestigationsChange = (names: string[]) => {
    setSelectedInvestigations(names);
    setCustomInvestigations((prev) => prev.filter((item) => names.includes(item)));
  };

  /* ============================================================
     PRINT
  ============================================================ */

  /* Prints a clean A4 report built from the current form values (see
     utils/consultationSummaryPrint.ts), not a screenshot of the form. */
  const printSummary = () => {
    const clinical = clinicalDetailsRef.current?.getPrintSummary();
    const vitalNumber = (value: number | string | null | undefined) => {
      const parsed = parseFloat(String(value ?? ""));
      return Number.isFinite(parsed) ? parsed : null;
    };
    const height = vitalNumber(encounter?.height);
    const weight = vitalNumber(encounter?.weight);
    const systolic = vitalNumber(encounter?.systolic_bp);
    const diastolic = vitalNumber(encounter?.diastolic_bp);
    const bmi = vitalNumber(encounter?.BMI) ?? computeBmi(height, weight);
    const bsa = computeBsa(height, weight);
    const withUnit = (value: number | null, unit: string) =>
      value === null ? "" : `${value}${unit}`;

    const reportTestName =
      reportsTestName.trim() ||
      labTests.find((test) => String(test.lab_test_id) === String(reportsTest))
        ?.test_name ||
      "";

    printConsultationSummary({
      hospitalName: patient?.branch?.branch_name ?? "",
      patient: {
        name: patientName,
        displayId: patientDisplayId,
        age:
          patient?.patient_age != null ? `${patient.patient_age} yrs` : "",
        gender: patient?.patient_gender ?? "",
        mobile: patient?.patient_primary_mobile ?? "",
      },
      visit: {
        date: visitDate,
        time: visitTime,
        type: visitType,
        consultedBy,
        encounterNo: encounter?.encounter_no ?? "",
        firstVisit: registeredOn,
      },
      vitals: [
        { label: "Height", value: withUnit(height, " cm") },
        { label: "Weight", value: withUnit(weight, " kg") },
        { label: "BMI", value: withUnit(bmi, "") },
        { label: "BSA", value: withUnit(bsa, " m²") },
        {
          label: "Blood Pressure",
          value:
            systolic !== null && diastolic !== null
              ? `${systolic}/${diastolic} mmHg`
              : "",
        },
        { label: "Pulse", value: withUnit(vitalNumber(encounter?.pulse), " bpm") },
        {
          label: "Temperature",
          value: withUnit(vitalNumber(encounter?.temperature), " °C"),
        },
        { label: "SpO2", value: withUnit(vitalNumber(encounter?.spo2), "%") },
        {
          label: "Respiratory Rate",
          value: withUnit(vitalNumber(encounter?.respiratory_rate), " /min"),
        },
        {
          label: "Pain Score",
          value: withUnit(vitalNumber(encounter?.pain_score), "/10"),
        },
      ],
      chiefComplaint,
      reasonOfVisit,
      consultationNotes,
      historyOfPresentIllness,
      performanceStatus: clinical?.performanceStatus ?? "",
      symptoms: clinical?.symptoms ?? [],
      allergies: clinical?.allergies ?? [],
      comorbidities: clinical?.comorbidities ?? [],
      personalHistory: [
        { label: "Immunization", value: selectedImmunizations.join(", ") },
        {
          label: "Drug Consumption",
          value: selectedDrugConsumptions.join(", "),
        },
        { label: "Diet Type", value: dietType },
      ],
      generalExamination: [...generalExamFindings, ...generalExamOthers],
      systemicExamination: [
        { label: "CNS", value: systemicCns },
        { label: "CVS", value: systemicCvs },
        { label: "Respiratory", value: systemicRespiratory },
        { label: "Per Abdomen", value: systemicPerAbdomen },
      ],
      clinicalFindings: systemicClinicalFindings,
      pastHistory,
      pastTreatment: {
        type: pastHistoryTreatmentType,
        date: formatDateDMY(pastHistoryTreatmentDate),
        note: pastHistoryTreatmentNote,
        response: pastHistoryTreatmentResponse,
      },
      previousReports: reportTestName
        ? [
            {
              test: reportTestName,
              date: formatDateDMY(reportsTestDate),
              result: reportsTestResult,
              impression: reportsTestImpression,
            },
          ]
        : [],
      previousReportsText: reportsText,
      molecularTests: molecularTest.trim()
        ? [
            {
              test: molecularTest,
              date: formatDateDMY(molecularTestDate),
              result: molecularTestResult,
              impression: molecularTestImpression,
            },
          ]
        : [],
      investigations: selectedInvestigations.map((name) => ({
        name,
        notes: investigationNotes[name] ?? "",
      })),
      investigationInstructions: additionalInstructions,
      medicines: (adviceSectionRef.current?.getDraftRows() ?? []).map(
        (row) => ({
          form: row.drugForm,
          name: row.drugName,
          dosage: row.dosage,
          frequency: row.frequency,
          duration: row.duration,
          instruction: row.instruction,
        })
      ),
      adviceDiscussion: adviceSectionRef.current?.getDraftDiscussion() ?? "",
    });
  };

  /* ============================================================
     SAVE DRAFT
  ============================================================ */

  const saveDraft = () => {
    const data = {
      patient: patientName,
      patientId: patientDisplayId,
      consultationNotes,
      pastHistory,
      adviceRows: adviceSectionRef.current?.getDraftRows() ?? [],
      adviceDiscussion: adviceSectionRef.current?.getDraftDiscussion() ?? "",
      investigations: selectedInvestigations,
    };

    localStorage.setItem(
      "hms_consultation_draft",
      JSON.stringify(data)
    );

    showToast("Consultation saved as draft");
  };

  /* ============================================================
     CANCEL
  ============================================================ */

  const cancelConsultation = () => {
    const result = window.confirm(
      "Are you sure you want to cancel this consultation?"
    );

    if (result) {
      showToast("Consultation cancelled");
    }
  };

  /* ============================================================
     NEXT
  ============================================================ */

  /* ============================================================
     CONSULTATION PERSIST (run by Proceed to Next)
     Builds the encounter update payload from the Consultation step
     form and writes it + personal history + reason of visit.
  ============================================================ */

  const buildConsultationSavePayload = () => {
    const payload: {
      clinical_notes?: string;
      symptoms?: string;
      chief_complaint?: string;
      history_of_present_illness?: string;
      cns_examination?: string;
      cvs_examination?: string;
      per_abdomen_examination?: string;
      clinical_findings?: string;
      respiratory_examination?: string;
      general_examination_icterus?: boolean;
      general_examination_pallor?: boolean;
      general_examination_clubbing?: boolean;
      general_examination_cyanosis?: boolean;
      general_examination_oedema?: boolean;
      general_examination_lymphadenopathy?: boolean;
      general_examination_others?: { code: string; name: string }[];
      past_history_treatment_type?: string;
      past_history_treatment_date?: string;
      past_history_treatment_note?: string;
      past_history_treatment_response?: string;
      previous_reports?: string;
    } = {};

    /* Consultation Notes + Past History are combined into the single
       clinical_notes column, separated by the [Past History] marker so
       they can be split back on load. */
    const combinedNotes = [
      consultationNotes.trim(),
      ...(pastHistory.trim()
        ? [`${PAST_HISTORY_MARKER}\n${pastHistory.trim()}`]
        : []),
    ]
      .filter(Boolean)
      .join("\n\n");
    if (combinedNotes) {
      payload.clinical_notes = combinedNotes;
    }
    if (historyOfPresentIllness.trim()) {
      payload.symptoms = historyOfPresentIllness;
      payload.history_of_present_illness = historyOfPresentIllness;
    }
    if (chiefComplaint.trim() || patientHistory.trim()) {
      payload.chief_complaint = chiefComplaint.trim() || patientHistory.trim();
    }
    if (systemicCns.trim()) {
      payload.cns_examination = systemicCns.trim();
    }
    if (systemicCvs.trim()) {
      payload.cvs_examination = systemicCvs.trim();
    }
    if (systemicPerAbdomen.trim()) {
      payload.per_abdomen_examination = systemicPerAbdomen.trim();
    }
    if (systemicRespiratory.trim()) {
      payload.respiratory_examination = systemicRespiratory.trim();
    }
    if (systemicClinicalFindings.trim()) {
      payload.clinical_findings = systemicClinicalFindings.trim();
    }

    /* General Examination (positive findings persisted as booleans). */
    GENERAL_EXAM_FLAGS.forEach((flag) => {
      payload[
        flag.field as
          | "general_examination_icterus"
          | "general_examination_pallor"
          | "general_examination_clubbing"
          | "general_examination_cyanosis"
          | "general_examination_oedema"
          | "general_examination_lymphadenopathy"
      ] = hasGeneralExamFinding(generalExamFindings, flag.label);
    });
    payload.general_examination_others = generalExamOthers.map((name) => {
      const match = generalExamOptions.find(
        (option) => option.name.toLowerCase() === name.toLowerCase()
      );
      return { code: match?.code ?? "", name: match?.name ?? name };
    });

    /* Past History treatment details (type/date/note/response). */
    if (pastHistoryTreatmentType.trim()) {
      payload.past_history_treatment_type = pastHistoryTreatmentType.trim();
    }
    if (pastHistoryTreatmentDate.trim()) {
      payload.past_history_treatment_date = pastHistoryTreatmentDate.trim();
    }
    if (pastHistoryTreatmentNote.trim()) {
      payload.past_history_treatment_note = pastHistoryTreatmentNote.trim();
    }
    if (pastHistoryTreatmentResponse.trim()) {
      payload.past_history_treatment_response =
        pastHistoryTreatmentResponse.trim();
    }
    if (reportsText.trim()) {
      payload.previous_reports = reportsText.trim();
    }

    return payload;
  };

  const persistConsultation = async (targetEncounter: EncounterRecord) => {
    await encounterApi.update(
      targetEncounter.encounter_no,
      buildConsultationSavePayload()
    );

    try {
      await savePersonalHistory(targetEncounter.encounter_no);
    } catch (personalHistoryError: any) {
      console.error(
        "Failed to save personal history:",
        personalHistoryError?.response?.data?.message ??
          personalHistoryError?.message
      );
    }

    /* Reason of Visit lives on the linked appointment, not the
       encounter, so it must be persisted there separately. */
    if (targetEncounter.appointment_id && reasonOfVisit.trim()) {
      try {
        await appointmentApi.update(targetEncounter.appointment_id, {
          reason_for_visit: reasonOfVisit,
        });
      } catch (appointmentError: any) {
        console.error(
          "Failed to save reason for visit:",
          appointmentError?.response?.data?.message ??
            appointmentError?.message
        );
      }
    }
  };

  /* Persists the "Reports (Previous)" form (test/date/result/impression)
     into encounter_report, upserting the row for the selected test so
     repeated saves never duplicate it. */
  const persistReportsPrevious = async (targetEncounterNo: string) => {
    const typedTest = reportsTestName.trim();
    if (!reportsTest && !typedTest) return;
    try {
      const existingReports = await consultationApi.getReports(
        targetEncounterNo
      );
      const rows = existingReports.data?.data ?? [];
      /* A master test matches on its id, a typed one on its name. */
      const existing = rows.find((report) =>
        reportsTest
          ? String(report.lab_test_id) === String(reportsTest)
          : !report.lab_test_id &&
            (report.test_name ?? "").toLowerCase() === typedTest.toLowerCase()
      );
      const payload = {
        ...(reportsTest
          ? { lab_test_id: reportsTest }
          : { test_name: typedTest }),
        report_completed_date: reportsTestDate || null,
        result: reportsTestResult || null,
        impression: reportsTestImpression || null,
      };
      if (existing) {
        await consultationApi.updateReport(
          existing.encounter_report_id,
          payload
        );
      } else {
        await consultationApi.addReport(targetEncounterNo, payload);
      }
    } catch (error: any) {
      console.error(
        "Failed to save previous reports:",
        error?.response?.data?.message ?? error?.message
      );
    }
  };

  /* Persists the Molecular Testing form into encounter_molecular_test,
     upserting the row for the selected test (matched by name) so repeated
     saves never duplicate it. */
  const persistMolecularTest = async (targetEncounterNo: string) => {
    const testName = molecularTest.trim();
    if (!testName) return;
    try {
      const existingTests = await consultationApi.getMolecularTests(
        targetEncounterNo
      );
      const existing = (existingTests.data?.data ?? []).find(
        (row) => row.test_name.toLowerCase() === testName.toLowerCase()
      );
      const payload = {
        test_name: testName,
        test_date: molecularTestDate || null,
        result: molecularTestResult || null,
        impression: molecularTestImpression || null,
      };
      if (existing) {
        await consultationApi.updateMolecularTest(
          existing.encounter_molecular_test_id,
          payload
        );
      } else {
        await consultationApi.addMolecularTest(targetEncounterNo, payload);
      }
    } catch (error: any) {
      console.error(
        "Failed to save molecular test:",
        error?.response?.data?.message ?? error?.message
      );
    }
  };

  /* ============================================================
     NEXT
     Saves the whole Consultation step, then moves on: the Clinical
     Details section (ECOG, symptoms, allergies, comorbidities), the
     encounter fields + personal history + reason of visit, the
     Reports (Previous) form, and the Advice section (medicines +
     Discussion). Every part is attempted; the step stays open when
     the clinical details or the Advice could not be saved so
     nothing is lost.
  ============================================================ */

  const proceedNext = async () => {
    if (proceeding) return;

    if (!encounter) {
      showToast(
        encounterError ||
          "No active encounter found. Cannot save consultation details."
      );
      return;
    }

    try {
      setProceeding(true);

      const clinicalSaved =
        (await clinicalDetailsRef.current?.handleSave()) ?? true;
      await persistConsultation(encounter);
      await persistReportsPrevious(encounter.encounter_no);
      await persistMolecularTest(encounter.encounter_no);
      const adviceResult = await saveAdvice(encounter);

      const failedParts = [
        ...(clinicalSaved ? [] : ["clinical details"]),
        ...(adviceResult === "failed" ? ["Advice"] : []),
      ];
      if (failedParts.length > 0) {
        showToast(
          `Consultation saved, but the ${failedParts.join(
            " and "
          )} could not be saved.`
        );
        return;
      }

      showToast("Consultation saved");

      onProceed();
    } catch (error: any) {
      console.error("Failed to save consultation details:", error);
      showToast(
        error?.response?.data?.message ||
          error?.message ||
          "Failed to save consultation details."
      );
    } finally {
      setProceeding(false);
    }
  };

  /* ============================================================
     INVESTIGATIONS
     Real test names pulled from the lab_test_master table via
     GET /lab-test-master (see client/api/labTestMaster.api.ts)
   ============================================================ */

  const investigations = labTests
    .filter((test) => test.test_status === null || test.test_status === 1)
    .map((test) => test.test_name);

  return (
    <div
        className="relative flex w-full flex-col gap-5"
      >
      {/* =================================================
      CONSULTATION SUMMARY
    ================================================= */}

    <section className="flex w-full flex-col gap-5 rounded-xl border border-slate-200 bg-white p-5">

    <div className="text-lg font-bold leading-7 text-slate-800">
      Consultation Summary
    </div>

    {/* SUMMARY GRID */}

    <div className="grid w-full grid-cols-4 gap-x-4">

      {/* DATE */}

      <div className="flex min-w-0 flex-col gap-1">

        <label className="text-xs font-bold leading-4 text-slate-500">
          Visit Date &amp; Time
        </label>

        <div className="flex w-full gap-2">

          <Popover>
            <PopoverTrigger asChild>
              <div className="relative min-w-0 flex-1 cursor-pointer">

                <input
                  className="h-[38px] w-full rounded-md border border-slate-200 bg-white px-[13px] pl-[33px] text-[9px] leading-5 text-slate-700 outline-none"
                  value={visitDate}
                  readOnly
                />

                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth="1.7"
                  className="pointer-events-none absolute left-2 top-2.5 h-4 w-4"
                >
                  <rect
                    x="3"
                    y="4"
                    width="18"
                    height="17"
                    rx="2"
                  />
                  <path d="M16 2v4" />
                  <path d="M8 2v4" />
                  <path d="M3 10h18" />
                </svg>

              </div>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={parsePickedDate(visitDate)}
                onSelect={(date) => {
                  if (date instanceof Date) {
                    setVisitDate(formatPickedDate(date));
                  }
                }}
              />
            </PopoverContent>
          </Popover>

          <div className="relative min-w-0 flex-1">

            <input
              className="h-[38px] w-full rounded-md border border-slate-200 bg-white px-[13px] pl-[33px] text-[11px] leading-5 text-slate-700 outline-none"
              value={visitTime}
              readOnly
            />

            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="#94a3b8"
              strokeWidth="1.7"
              className="pointer-events-none absolute left-2 top-2.5 h-4 w-4"
            >
              <circle
                cx="12"
                cy="12"
                r="9"
              />
              <path d="M12 7v5l3 2" />
            </svg>

          </div>

        </div>

      </div>

      {/* FIRST VISIT */}

      <div className="flex min-w-0 flex-col gap-1">

        <label className="text-xs font-bold leading-4 text-slate-500">
          First Visit for this Treatment
        </label>

        <input
          className="h-[38px] w-full rounded-md border border-slate-200 bg-white px-[13px] text-sm leading-5 text-slate-700 outline-none"
          value={registeredOn}
          readOnly
        />

      </div>

      {/* CONSULTED BY */}

      <div className="flex min-w-0 flex-col gap-1">

        <label className="text-xs font-bold leading-4 text-slate-500">
          Consulted By
        </label>

        <div className="relative h-[38px]">

          <select
            defaultValue={consultedBy}
            className="h-[38px] w-full appearance-none rounded-md border border-slate-200 bg-white px-[13px] pr-10 text-sm leading-5 text-slate-700 outline-none"
          >

            {consultedBy && (
              <option value={consultedBy}>
                {consultedBy}
              </option>
            )}

          </select>

          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="#94a3b8"
            strokeWidth="1.8"
            className="pointer-events-none absolute right-3 top-2.5 h-4 w-4"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>

        </div>

      </div>

      {/* VISIT TYPE */}

      <div className="flex min-w-0 flex-col gap-1">

        <label className="text-xs font-bold leading-4 text-slate-500">
          Visit Type
        </label>

        <div className="relative h-[38px]">
            <input
              className="h-[38px] w-full rounded-md border border-slate-200 bg-white px-[13px] pl-[33px] text-[11px] leading-5 text-slate-700 outline-none"
              value={visitType}
              placeholder="Not recorded"
              readOnly
            />

        </div>

      </div>

    </div>

    {/* LOWER */}

    <div className="grid w-full grid-cols-2 gap-x-6 pt-2">

      {/* NOTES */}

      <div className="flex flex-col gap-2">

        <label className="text-xs font-bold leading-4 text-slate-500">
          Consultation Notes
        </label>

        <VoiceToText
          value={consultationNotes}
          onChange={(text) => setConsultationNotes(text)}
          placeholder="Enter consultation notes..."
        />

        {/* CHIEF COMPLAINT (free text) + REASON OF VISIT.
            Styled like the Symptoms / Allergies sections in
            ClinicalDetailsSection (uppercase tracked label +
            white bordered container). */}

        <div className="flex flex-col gap-2">

          <div className="flex flex-col gap-1">

            <div className="text-[10px] font-bold uppercase leading-[15px] tracking-[0.5px] text-slate-400">
              Chief Complaint
            </div>

            <VoiceToText
              value={chiefComplaint}
              onChange={(text) => setChiefComplaint(text)}
              placeholder="Type the chief complaint..."
            />

          </div>


          </div>

      </div>

      {/* CLINICAL */}

      <div className="flex flex-col gap-4">

        {/* PERFORMANCE STATUS / SYMPTOMS / ALLERGIES /
            COMORBIDITIES ” backed by the Clinical Details
            API (see components/hms/ClinicalDetailsSection.tsx) */}

        {encounterError && (
          <div className="flex w-full flex-col gap-2 rounded-md border border-red-200 bg-red-50 p-3">
            <div className="text-xs font-medium leading-4 text-red-700">
              {encounterError}
            </div>
          </div>
        )}

        {encounter ? (
          <ClinicalDetailsSection
            ref={clinicalDetailsRef}
            patientId={consultationState?.patientId}
            encounterNo={encounter.encounter_no}
          />
        ) : (
          !encounterError && (
            <div className="flex items-center gap-2 text-xs leading-4 text-slate-500">
              Loading clinical details...
            </div>
          )
        )}

      </div>

    </div>

    </section>

    {/* =================================================
      PERSONAL HISTORY
    ================================================= */}

    <section className="flex w-full flex-col gap-5 rounded-xl border border-slate-200 bg-white p-5">

    <div className="text-lg font-bold leading-7 text-slate-800">
      Personal History
    </div>

    {/* PERSONAL HISTORY GRID */}

    <div className="grid w-full grid-cols-2 gap-x-6 gap-y-4 pt-2">

      {/* IMMUNIZATION */}

      <div className="flex flex-col gap-2">

        <label className="text-xs font-bold leading-4 text-slate-500">
          Immunization
        </label>

        <MultiSelectDropdown
          options={withSelected(
            immunizationOptions.map((option) => option.name),
            selectedImmunizations
          )}
          value={selectedImmunizations}
          onValueChange={setSelectedImmunizations}
          onCreateOption={(typed) =>
            addMasterOption(
              () => consultationApi.createCustomImmunization({ name: typed }),
              setImmunizationOptions,
              addToSelection(setSelectedImmunizations),
              "immunization"
            )
          }
          placeholder="Select immunization(s)"
        />

      </div>

      {/* DRUG CONSUMPTION */}

      <div className="flex flex-col gap-2">

        <label className="text-xs font-bold leading-4 text-slate-500">
          Drug Consumption
        </label>

        <MultiSelectDropdown
          options={withSelected(
            drugConsumptionOptions.map((option) => option.name),
            selectedDrugConsumptions
          )}
          value={selectedDrugConsumptions}
          onValueChange={setSelectedDrugConsumptions}
          onCreateOption={(typed) =>
            addMasterOption(
              () => consultationApi.createCustomDrugConsumption({ name: typed }),
              setDrugConsumptionOptions,
              addToSelection(setSelectedDrugConsumptions),
              "drug consumption"
            )
          }
          placeholder="Select drug consumption(s)"
        />

      </div>

      {/* DIET TYPE */}

      <div className="flex flex-col gap-2">

        <label className="text-xs font-bold leading-4 text-slate-500">
          Diet Type
        </label>

        <div className="relative h-[38px]">

          <select
            value={dietType}
            onChange={(event) => setDietType(event.target.value)}
            className="h-[38px] w-full appearance-none rounded-md border border-slate-200 bg-white px-[13px] pr-10 text-sm leading-5 text-slate-700 outline-none"
          >

            <option value="">
             Select 
            </option>

            {dietTypeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}

          </select>

          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="#94a3b8"
            strokeWidth="1.8"
            className="pointer-events-none absolute right-3 top-2.5 h-4 w-4"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>

        </div>

      </div>

      {/* PATIENT HISTORY (REASON OF VISIT) */}


    </div>

    </section>

    {/* =================================================
      GENERAL EXAMINATION
    ================================================= */}

    <section className="flex w-full flex-col gap-5 rounded-xl border border-slate-200 bg-white p-5">

    <div className="text-lg font-bold leading-7 text-slate-800">
      General Examination
    </div>

    <div className="flex flex-col gap-2 pt-2">
      <label className="text-xs font-bold leading-4 text-slate-500">
        Findings
      </label>
      <MultiSelectDropdown
        options={GENERAL_EXAM_FLAGS.map((flag) => flag.label)}
        value={generalExamFindings}
        onValueChange={setGeneralExamFindings}
        placeholder="Select findings"
      />
    </div>

    {/* Other findings: search general_examination_master; "+ Add" adds a
        finding to the master and ticks it for this patient. */}
    <div className="flex flex-col gap-2">
      <label className="text-xs font-bold leading-4 text-slate-500">
        Other Findings
      </label>
      <MultiSelectDropdown
        options={withSelected(
          generalExamOptions.map((option) => option.name),
          generalExamOthers
        )}
        value={generalExamOthers}
        onValueChange={setGeneralExamOthers}
        onCreateOption={(typed) =>
          addMasterOption(
            () =>
              consultationApi.createCustomGeneralExaminationFinding({
                name: typed,
              }),
            setGeneralExamOptions,
            addToSelection(setGeneralExamOthers),
            "finding"
          )
        }
        placeholder="Search or add other findings"
      />
    </div>

    </section>

    {/* =================================================
      SYSTEMIC EXAMINATION
    ================================================= */}

    <section className="flex w-full flex-col gap-5 rounded-xl border border-slate-200 bg-white p-5">

    <div className="text-lg font-bold leading-7 text-slate-800">
      Systemic Examination
    </div>

    <div className="grid w-full grid-cols-1 gap-x-5 gap-y-6 pt-2 sm:grid-cols-2 lg:grid-cols-4">

      {[
        { label: "CNS", value: systemicCns, onChange: setSystemicCns },
        { label: "CVS", value: systemicCvs, onChange: setSystemicCvs },
        { label: "Respiratory", value: systemicRespiratory, onChange: setSystemicRespiratory },
        { label: "Per Abdomen", value: systemicPerAbdomen, onChange: setSystemicPerAbdomen },
      ].map((item) => (
        <div key={item.label} className="flex flex-col gap-2">
          <label className="text-xs font-bold leading-4 text-slate-500">
            {item.label}
          </label>
          <input
            type="text"
            value={item.value}
            onChange={(event) => item.onChange(event.target.value)}
            placeholder={`Type ${item.label.toLowerCase()} findings...`}
    className="block w-full rounded-md border border-gray-300 bg-white py-3 pl-4 pr-10 text-sm text-gray-800 focus:border-[#1d4ed8] focus:outline-none focus:ring-[#1d4ed8]"
          />
        </div>
      ))}

    </div>

    <div className="flex flex-col gap-2 pt-2">
      <label className="text-xs font-bold leading-4 text-slate-500">
        Clinical Findings
      </label>
      <VoiceToText
        value={systemicClinicalFindings}
        onChange={(text) => setSystemicClinicalFindings(text)}
        placeholder="Type clinical findings..."
      />
    </div>

    <div className="flex items-center gap-4 pt-2">
      <label className="flex items-center gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={allVitalsNormal}
          onChange={(e) => setAllVitalsNormal(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-sm font-medium text-slate-700">
          All Vitals Looks Normal?
        </span>
      </label>

      <button
        type="button"
        onClick={() => {
          const normalText = "Normal";
          setSystemicCns(normalText);
          setSystemicCvs(normalText);
          setSystemicRespiratory(normalText);
          setSystemicPerAbdomen(normalText);
          setAllVitalsNormal(true);
        }}
        className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
      >
        Apply Normal To All
      </button>
    </div>

    </section>

    {/* =================================================
      PATIENT DETAILS
    ================================================= */}

    <section className="flex w-full flex-col gap-5 rounded-xl border border-slate-200 bg-white p-5">

    <div className="text-lg font-bold leading-7 text-slate-800">
      Patient Details
    </div>

    {/* PATIENT DETAILS GRID */}

    <div className="grid w-full grid-cols-2 gap-x-6 pt-2">

      {/* LEFT COLUMN: HOPI + REPORTS */}

      <div className="flex w-full flex-col gap-4">

      {/* HISTORY OF PRESENT ILLNESS (HOPI) */}

      <div className="flex flex-col gap-2">

        <label className="text-xs font-bold leading-4 text-slate-500">
          History of Present Illness(HOPI)
        </label>

        <VoiceToText
          value={historyOfPresentIllness}
          onChange={(text) => setHistoryOfPresentIllness(text)}
          placeholder="Type the history of present illness..."
        />

      </div>

      {/* REPORTS (PREVIOUS) */}

      <div className="flex flex-col gap-2">

        <label className="text-xs font-bold leading-4 text-slate-500">
          Reports (Previous)
        </label>

        <div className="flex w-full flex-col gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">

            {/* SELECT TEST */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase leading-[15px] tracking-[0.5px] text-slate-400">
                Select Test
              </label>

              {/* Not in the list: the typed name is used for this
                  patient's report only (lab_test_master is unchanged). */}
              <SingleSelectDropdown
                options={labTests.map((test) => ({
                  label: test.test_name,
                  value: test.lab_test_id,
                }))}
                value={reportsTest || reportsTestName}
                valueLabel={reportsTestName}
                onValueChange={(labTestId) => {
                  setReportsTest(labTestId);
                  setReportsTestName("");
                }}
                onCreateOption={(typed) => {
                  setReportsTest("");
                  setReportsTestName(typed);
                }}
                createLabel="Use"
                placeholder="Select or type a test"
                className="h-[38px] rounded-md border-slate-200 text-slate-700 shadow-none"
              />
            </div>

            {/* DATE / RESULT / IMPRESSION */}
            {(reportsTest || reportsTestName) && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase leading-[15px] tracking-[0.5px] text-slate-400">
                    Date
                  </label>
                  <input
                    type="date"
                    value={reportsTestDate}
                    onChange={(event) =>
                      setReportsTestDate(event.target.value)
                    }
                    className="h-[38px] w-full rounded-md border border-slate-200 bg-white px-[13px] text-sm leading-5 text-slate-700 outline-none focus:border-slate-400"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase leading-[15px] tracking-[0.5px] text-slate-400">
                    Enter Result
                  </label>
                  <VoiceToText
                    value={reportsTestResult}
                    onChange={(text) => setReportsTestResult(text)}
                    placeholder="Type the result..."
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase leading-[15px] tracking-[0.5px] text-slate-400">
                    Enter Impression
                  </label>
                  <VoiceToText
                    value={reportsTestImpression}
                    onChange={(text) => setReportsTestImpression(text)}
                    placeholder="Type the impression..."
                  />
                </div>
              </>
            )}

          </div>

        <VoiceToText
          value={reportsText}
          onChange={(text) => setReportsText(text)}
          placeholder="Type previous reports..."
        />

      </div>

      </div>

      {/* RIGHT COLUMN: PAST HISTORY */}

      <div className="flex w-full flex-col gap-4">

      {/* PAST HISTORY */}

      <div className="flex flex-col gap-2">

        <label className="text-xs font-bold leading-4 text-slate-500">
          Past History
        </label>

        <div className="flex w-full flex-col gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">

            {/* TREATMENT TYPE */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase leading-[15px] tracking-[0.5px] text-slate-400">
                Treatment Type
              </label>

              {/* treatment_type_master; "+ Add" adds a new type to it. */}
              <SingleSelectDropdown
                options={withSelected(
                  treatmentTypeOptions.map((option) => option.name),
                  pastHistoryTreatmentType ? [pastHistoryTreatmentType] : []
                )}
                value={pastHistoryTreatmentType}
                onValueChange={setPastHistoryTreatmentType}
                onCreateOption={(typed) =>
                  addMasterOption(
                    () =>
                      consultationApi.createCustomTreatmentType({
                        name: typed,
                      }),
                    setTreatmentTypeOptions,
                    setPastHistoryTreatmentType,
                    "treatment type"
                  )
                }
                placeholder="Select Treatment"
                className="h-[38px] rounded-md border-slate-200 text-slate-700 shadow-none"
              />
            </div>

            {/* DATE / BRIEF NOTE / TREATMENT RESPONSE */}
            {pastHistoryTreatmentType && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase leading-[15px] tracking-[0.5px] text-slate-400">
                    Date
                  </label>
                  <input
                    type="date"
                    value={pastHistoryTreatmentDate}
                    onChange={(event) =>
                      setPastHistoryTreatmentDate(
                        event.target.value
                      )
                    }
                    className="h-[38px] w-full rounded-md border border-slate-200 bg-white px-[13px] text-sm leading-5 text-slate-700 outline-none focus:border-slate-400"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase leading-[15px] tracking-[0.5px] text-slate-400">
                    Enter Brief Note
                  </label>
                  <VoiceToText
                    value={pastHistoryTreatmentNote}
                    onChange={(text) => setPastHistoryTreatmentNote(text)}
                    placeholder="Type a brief note..."
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase leading-[15px] tracking-[0.5px] text-slate-400">
                    Treatment Response
                  </label>
                  <VoiceToText
                    value={pastHistoryTreatmentResponse}
                    onChange={(text) => setPastHistoryTreatmentResponse(text)}
                    placeholder="Type the treatment response..."
                  />
                </div>
              </>
            )}

          </div>

        <VoiceToText
          value={pastHistory}
          onChange={(text) => setPastHistory(text)}
          placeholder="Type the patient's past history..."
        />

      </div>

      {/* MOLECULAR TESTING */}

      <div className="flex flex-col gap-2">

        <label className="text-xs font-bold leading-4 text-slate-500">
          Molecular Testing
        </label>

        <div className="flex w-full flex-col gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">

            {/* SELECT TEST */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase leading-[15px] tracking-[0.5px] text-slate-400">
                Select Test
              </label>

              {/* Not in the list: the typed name is used for this
                  patient only. */}
              <SingleSelectDropdown
                options={molecularTestOptions}
                value={molecularTest}
                onValueChange={setMolecularTest}
                onCreateOption={setMolecularTest}
                createLabel="Use"
                placeholder="Select or type a test"
                className="h-[38px] rounded-md border-slate-200 text-slate-700 shadow-none"
              />
            </div>

            {/* DATE / RESULT / IMPRESSION */}
            {molecularTest && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase leading-[15px] tracking-[0.5px] text-slate-400">
                    Date
                  </label>
                  <input
                    type="date"
                    value={molecularTestDate}
                    onChange={(event) =>
                      setMolecularTestDate(event.target.value)
                    }
                    className="h-[38px] w-full rounded-md border border-slate-200 bg-white px-[13px] text-sm leading-5 text-slate-700 outline-none focus:border-slate-400"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase leading-[15px] tracking-[0.5px] text-slate-400">
                    Enter Result
                  </label>
                  <VoiceToText
                    value={molecularTestResult}
                    onChange={(text) => setMolecularTestResult(text)}
                    placeholder="Type the result..."
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase leading-[15px] tracking-[0.5px] text-slate-400">
                    Enter Impression
                  </label>
                  <VoiceToText
                    value={molecularTestImpression}
                    onChange={(text) => setMolecularTestImpression(text)}
                    placeholder="Type the impression..."
                  />
                </div>
              </>
            )}

          </div>

      </div>

      </div>

    </div>

    </section>

    {/* =================================================
      INVESTIGATIONS
    ================================================= */}

    <section className="flex w-full flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5">

    <div className="text-lg font-bold leading-7 text-slate-800">
      Investigations / Scans
    </div>

    {labTestsLoading && (
      <div className="flex items-center gap-2 text-sm leading-5 text-slate-500">
        Loading investigations...
      </div>
    )}

    {!labTestsLoading && labTestsError && (
      <div className="flex w-full flex-col gap-1 rounded-md border border-red-200 bg-red-50 p-3">
        <div className="text-xs font-medium leading-4 text-red-700">
          {labTestsError}
        </div>
      </div>
    )}

    {!labTestsLoading && !labTestsError &&
      investigations.length === 0 &&
      customInvestigations.length === 0 && (
      <div className="flex items-center gap-2 text-sm leading-5 text-slate-500">
        No lab tests available.
      </div>
    )}

    {!labTestsLoading && !labTestsError &&
      (investigations.length > 0 ||
        customInvestigations.length > 0) && (
    <MultiSelectDropdown
      options={[
        ...investigations.map((name) => ({ value: name, label: name })),
        ...customInvestigations.map((name) => ({
          value: name,
          label: name,
          hint: "Custom",
        })),
      ]}
      value={selectedInvestigations}
      onValueChange={handleInvestigationsChange}
      onCreateOption={addInvestigationByName}
      placeholder="Search and select investigations / scans..."
      className="h-[38px] rounded-md border-slate-200 text-sm shadow-none"
    />
    )}

    {!labTestsLoading && !labTestsError && (
      <div className="flex w-full flex-col gap-1.5">
        <div className="flex w-full flex-wrap items-start gap-1.5">
          {!otherInvestigationExpanded && (
            <button
              type="button"
              onClick={() => setOtherInvestigationExpanded(true)}
              className="flex h-[26px] items-center rounded border border-slate-200 bg-slate-50 px-[9px] py-[3px] text-xs leading-4 text-slate-500 transition hover:bg-slate-100"
            >
              Others...
            </button>
          )}
        </div>

        {otherInvestigationExpanded && (
          <div className="flex w-full items-center gap-2">
            <input
              type="text"
              value={otherInvestigationName}
              onChange={(event) =>
                setOtherInvestigationName(event.target.value)
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addOtherInvestigation();
                }
              }}
              placeholder="Enter other investigation"
              className="h-7 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs leading-4 text-slate-600 outline-none focus:border-slate-400"
            />
            <button
              type="button"
              onClick={addOtherInvestigation}
              disabled={!otherInvestigationName.trim()}
              className="h-7 shrink-0 rounded-md border border-blue-600 bg-white px-3 text-xs font-semibold leading-4 text-blue-600 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                setOtherInvestigationName("");
                setOtherInvestigationExpanded(false);
              }}
              className="h-7 shrink-0 rounded-md border border-slate-200 bg-white px-2 text-xs leading-4 text-slate-500 transition hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        )}

      </div>
    )}

    {selectedInvestigations.length > 0 && (
      <div className="flex w-full flex-col gap-4 pt-2">

        {selectedInvestigations.map((investigation) => (

          <div
            key={investigation}
            className="flex flex-col gap-2"
          >

            <label className="text-xs font-bold leading-4 text-slate-500">
              Clinical Notes - {investigation}
            </label>

            <VoiceToText
              value={investigationNotes[investigation] ?? ""}
              onChange={(text) =>
                setInvestigationNotes((prev) => ({
                  ...prev,
                  [investigation]: text,
                }))
              }
              placeholder={`Enter clinical notes for ${investigation}`}
            />

          </div>

        ))}

      </div>
    )}

    <div className="flex w-full flex-col gap-2 pt-2">

      <label className="text-xs font-bold leading-4 text-slate-500">
        Additional Instructions (if any)
      </label>

      <VoiceToText
        value={additionalInstructions}
        onChange={(text) => setAdditionalInstructions(text)}
        placeholder="Enter any special instructions for the selected investigations"
      />

    </div>

    </section>

    {/* =================================================
      ADVICE (OPD PRESCRIPTION)
    ================================================= */}

    <AdviceSection
      ref={adviceSectionRef}
      encounter={encounter}
      patientId={consultationState?.patientId}
      onToast={showToast}
    />

    {/* =================================================
      ACTION BUTTONS
    ================================================= */}

    <div className="flex w-full items-center justify-between">

    {/* PRINT */}

    <div className="h-9 w-[213px]">

      <button
        onClick={printSummary}
        className="flex h-9 w-[213px] items-center justify-center gap-2 rounded-lg border-0 bg-blue-700 px-[25px] py-[9px] text-sm font-bold leading-5 text-white"
      >

        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-6 w-6"
        >
          <path d="M6 9V2h12v7" />

          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />

          <rect
            x="6"
            y="14"
            width="12"
            height="8"
          />
        </svg>

        <span>
          Print Summary
        </span>

      </button>

    </div>

    {/* RIGHT ACTIONS */}

    <div className="flex items-start gap-2.5">

      {/* CANCEL */}

      <button
        onClick={cancelConsultation}
        className="flex h-9 w-fit items-center justify-center rounded-lg border border-slate-300 bg-white px-[25px] py-[9px] text-sm font-bold leading-5 text-slate-600"
      >
        Cancel
      </button>

      {/* DRAFT */}

      <button
        onClick={saveDraft}
        className="flex h-9 w-fit items-center justify-center rounded-lg border border-blue-200 bg-white px-[25px] py-[9px] text-sm font-bold leading-5 text-blue-600 "
      >
        Save as Draft
      </button>

      {/* NEXT */}

      <button
        onClick={proceedNext}
        disabled={proceeding}
        className="flex h-9 w-[213px] items-center justify-center gap-2 rounded-lg border-0 bg-blue-700 px-[25px] py-[9px] text-sm font-bold leading-5 text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {proceeding ? (
          "Loading..."
        ) : (
          <>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
            <span>
              Proceed to Next
            </span>
          </>
        )}
      </button>

    </div>

    </div>

    </div>
  );
};

export default ConsultationStep;
