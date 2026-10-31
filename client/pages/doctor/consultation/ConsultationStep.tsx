import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { appointmentApi } from "../../../api/appointment.api";
import type { PatientRecord } from "../../../api/patient.api";
import { encounterApi, type EncounterRecord } from "../../../api/encounter.api";
import {
  consultationApi,
  type ConsultationOptionRecord,
  type ImmunizationRecord,
  type DrugConsumptionRecord,
  type FamilyDegree,
  type FamilyHistoryEntry,
  type FamilyHistoryStatus,
  type PersonalHistoryItem,
  type RelativeTypeOption,
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
import VoiceToText, { VoiceInput } from "@/components/ui/voicetotext";
import DurationInput from "@/components/ui/duration-input";
import {
  DEFAULT_DURATION_UNIT,
  normalizeDurationUnit,
  toDurationPayload,
  type DurationUnit,
} from "@/utils/duration";
import AdviceSection, {
  type AdviceSaveResult,
  type AdviceSectionHandle,
} from "./AdviceSection";
import InvestigationOrderCard, {
  EMPTY_INVESTIGATION_DETAIL,
} from "./InvestigationOrderCard";
import type { ConsultationState, InvestigationOrderDetail } from "./types";
import {
  formatDateDMY,
  formatPickedDate,
  formatTimeAMPM,
  parsePickedDate,
  PAST_HISTORY_MARKER,
  targetDateError,
  readConsultationDraft,
  writeConsultationDraft,
  clearConsultationDraft,
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

/* Per-selection detail fields of the multi-select history inputs. */
type PastTreatmentDetail = { date: string; note: string; response: string };
type TestResultDetail = { date: string; result: string; impression: string };
type DrugConsumptionDetail = {
  durationValue: string;
  durationUnit: DurationUnit;
  commands: string;
};
/* One Family History relative being edited. `id` is local only (list keys +
   updates) and is stripped before saving. */
type FamilyHistoryDraft = {
  id: string;
  degree: FamilyDegree | "";
  relativeType: string;
  condition: string;
  ageAtDiagnosis: string;
  remarks: string;
};

const FAMILY_DEGREES: { value: FamilyDegree; label: string }[] = [
  { value: "1st", label: "1st Degree" },
  { value: "2nd", label: "2nd Degree" },
  { value: "3rd", label: "3rd Degree" },
];

let familyEntrySeq = 0;
const newFamilyHistoryDraft = (): FamilyHistoryDraft => ({
  id: `family-${Date.now()}-${familyEntrySeq++}`,
  degree: "",
  relativeType: "",
  condition: "",
  ageAtDiagnosis: "",
  remarks: "",
});

const EMPTY_PAST_TREATMENT: PastTreatmentDetail = {
  date: "",
  note: "",
  response: "",
};
const EMPTY_TEST_RESULT: TestResultDetail = {
  date: "",
  result: "",
  impression: "",
};
const EMPTY_DRUG_CONSUMPTION_DETAIL: DrugConsumptionDetail = {
  durationValue: "",
  durationUnit: DEFAULT_DURATION_UNIT,
  commands: "",
};

/* Keeps a details map in step with a multi-select's full selection:
   seeds blanks for new selections and drops deselected ones. */
const syncDetails = <T,>(
  previous: Record<string, T>,
  names: string[],
  empty: T
) => {
  const next: Record<string, T> = {};
  names.forEach((name) => {
    next[name] = previous[name] ?? empty;
  });
  return next;
};

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
  /* Per-test notes / priority / target date (by test name) and the
     Additional Instructions; Lab Review sends them with the order. */
  investigationDetails: Record<string, InvestigationOrderDetail>;
  onInvestigationDetailsChange: React.Dispatch<
    React.SetStateAction<Record<string, InvestigationOrderDetail>>
  >;
  investigationInstructions: string;
  onInvestigationInstructionsChange: (value: string) => void;
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
  investigationDetails,
  onInvestigationDetailsChange: setInvestigationDetails,
  investigationInstructions: additionalInstructions,
  onInvestigationInstructionsChange: setAdditionalInstructions,
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
  /* Past History treatments: the selected Treatment Types and, per type,
     Date / Brief Note / Treatment Response. Persisted to
     encounter_past_treatment. */
  const [selectedTreatmentTypes, setSelectedTreatmentTypes] = useState<
    string[]
  >([]);
  const [treatmentDetails, setTreatmentDetails] = useState<
    Record<string, PastTreatmentDetail>
  >({});

  /* Reports (Previous): the selected tests - a lab_test_master id, or a
     test typed by hand (saved on this patient's report only, the master
     isn't changed) - and, per test, Date / Result / Impression. Persisted
     to encounter_report. */
  const [selectedReports, setSelectedReports] = useState<string[]>([]);
  const [reportDetails, setReportDetails] = useState<
    Record<string, TestResultDetail>
  >({});

  /* Molecular Testing (moved here from the Diagnosis tab): one row per test
     per visit in encounter_molecular_test. A test that isn't listed is
     typed by hand and saved for this patient only. */
  const [molecularTestOptions, setMolecularTestOptions] = useState<string[]>(
    []
  );
  const [selectedMolecularTests, setSelectedMolecularTests] = useState<
    string[]
  >([]);
  const [molecularTestDetails, setMolecularTestDetails] = useState<
    Record<string, TestResultDetail>
  >({});
  const [reportsText, setReportsText] = useState("");

  /* The encounter whose saved past treatments / reports / molecular tests
     were loaded. Save syncs (and removes deselected rows) only after a
     successful load, so a failed load never wipes what is saved. */
  const loadedDetailsRef = useRef<{
    pastTreatments?: string;
    reports?: string;
    molecularTests?: string;
  }>({});

  const [chiefComplaint, setChiefComplaint] = useState("");
  const [reasonOfVisit, setReasonOfVisit] = useState("");

  const [otherInvestigationExpanded, setOtherInvestigationExpanded] =
    useState(false);
  const [otherInvestigationName, setOtherInvestigationName] = useState("");
  const [customInvestigations, setCustomInvestigations] = useState<string[]>(
    []
  );

  /* Typed investigations restored with a reopened visit show as custom
     options again. */
  useEffect(() => {
    if (labTestsLoading) return;
    const labNames = new Set(labTests.map((test) => test.test_name));
    const missing = selectedInvestigations.filter((name) => !labNames.has(name));
    if (missing.length === 0) return;
    setCustomInvestigations((current) => {
      const added = missing.filter((name) => !current.includes(name));
      return added.length > 0 ? [...current, ...added] : current;
    });
  }, [selectedInvestigations, labTests, labTestsLoading]);

  const investigationDetail = (name: string) =>
    investigationDetails[name] ?? EMPTY_INVESTIGATION_DETAIL;

  /* A selected investigation is Molecular when its lab test master row
     belongs to a "Molecular" category. The master groups molecular tests
     under names like "Molecular - Breast Cancer" / "Molecular - Lung
     Cancer", so the category name is matched by prefix, case-insensitively.
     Custom (typed) tests have no master row, so they never show the
     testing Method dropdown. */
  const isMolecularTest = (name: string) => {
    const test = labTests.find(
      (item) => (item.test_name ?? "").toLowerCase() === name.toLowerCase()
    );
    return (test?.lab_test_category?.category_name ?? "")
      .trim()
      .toLowerCase()
      .startsWith("molecular");
  };

  const updateInvestigationDetail = (
    name: string,
    patch: Partial<InvestigationOrderDetail>
  ) =>
    setInvestigationDetails((prev) => ({
      ...prev,
      [name]: { ...(prev[name] ?? EMPTY_INVESTIGATION_DETAIL), ...patch },
    }));

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
  /* Per-immunization Date + Response, keyed by the selected value (master
     name or typed "Others" text). Persisted to encounter_immunization. */
  const [immunizationDetails, setImmunizationDetails] = useState<
    Record<string, { date: string; response: string }>
  >({});
  const [selectedDrugConsumptions, setSelectedDrugConsumptions] = useState<
    string[]
  >([]);
  /* Per-drug Duration + Command(s), keyed by the selected value (master
     name or typed "Others" text). Persisted in the drug_consumption JSON. */
  const [drugConsumptionDetails, setDrugConsumptionDetails] = useState<
    Record<string, DrugConsumptionDetail>
  >({});
  const [dietType, setDietType] = useState("");

  /* Family History: neither status is preselected so an unanswered form is
     never saved as a false NOT PRESENT. Rows only exist for PRESENT. */
  const [familyHistoryStatus, setFamilyHistoryStatus] = useState<
    FamilyHistoryStatus | ""
  >("");
  const [familyHistoryEntries, setFamilyHistoryEntries] = useState<
    FamilyHistoryDraft[]
  >([]);
  const [relativeTypeOptions, setRelativeTypeOptions] = useState<
    RelativeTypeOption[]
  >([]);
  /* The family-history column must not be overwritten when its load failed
     (or hasn't finished): ready flips on a successful GET, or when the doctor
     starts answering. */
  const familyHistoryReadyRef = useRef(false);

  const [proceeding, setProceeding] = useState(false);

  const [expandedSections, setExpandedSections] = useState<{
    summary: boolean;
    personalHistory: boolean;
    generalExamination: boolean;
    systemicExamination: boolean;
    patientDetails: boolean;
    investigations: boolean;
    advice: boolean;
  }>({
    summary: true,
    personalHistory: false,
    generalExamination: false,
    systemicExamination: false,
    patientDetails: false,
    investigations: false,
    advice: false,
  });

  const toggleSection = (key: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const expandAll = () => {
    setExpandedSections({
      summary: true,
      personalHistory: true,
      generalExamination: true,
      systemicExamination: true,
      patientDetails: true,
      investigations: true,
      advice: true,
    });
  };

  const collapseAll = () => {
    setExpandedSections({
      summary: false,
      personalHistory: false,
      generalExamination: false,
      systemicExamination: false,
      patientDetails: false,
      investigations: false,
      advice: false,
    });
  };

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

    /* Previous Reports free text. */
    setReportsText(encounter?.previous_reports ?? "");

    /* Consultation Notes and Past History share the encounter's
       clinical_notes column, separated by a [Past History] marker
       (see proceedNext). A saved draft takes precedence over the
       encounter so in-session work is never clobbered. */
    const draft = readConsultationDraft(encounter?.encounter_no, patientDisplayId);
    const draftNotes: string = draft.consultationNotes ?? "";
    const draftPast: string = draft.pastHistory ?? "";

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
    consultationApi
      .getRelativeTypes()
      .then((response) => {
        if (!cancelled) setRelativeTypeOptions(response.data.data ?? []);
      })
      .catch((error) =>
        console.error("Failed to load relative types:", error)
      );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const encounterNo = encounter?.encounter_no;
    if (!encounterNo) return;
    let cancelled = false;

    /* Start unanswered until this encounter's saved family history is known;
       ready only after a successful GET (or a doctor edit). */
    familyHistoryReadyRef.current = false;
    setFamilyHistoryStatus("");
    setFamilyHistoryEntries([]);

    const toFamilyDrafts = (familyRows: FamilyHistoryEntry[] | null | undefined) =>
      (familyRows ?? []).map((entry) => {
        const degree: FamilyDegree | "" =
          entry.degree === "1st" || entry.degree === "2nd" || entry.degree === "3rd"
            ? entry.degree
            : "";
        return {
          id: `family-${Date.now()}-${familyEntrySeq++}`,
          degree,
          relativeType: entry.relative_type ?? "",
          condition: entry.condition ?? "",
          ageAtDiagnosis: entry.age_at_diagnosis ?? "",
          remarks: entry.remarks ?? "",
        };
      });

    consultationApi
      .getPersonalHistory(encounterNo)
      .then((response) => {
        if (cancelled) return;
        const record = response.data.data;
        if (!record) {
          setSelectedImmunizations([]);
          setSelectedDrugConsumptions([]);
          setDrugConsumptionDetails({});
          setDietType("");
          setFamilyHistoryStatus("");
          setFamilyHistoryEntries([]);
          familyHistoryReadyRef.current = true;
          return;
        }

        /* Master values by name; older free-text "Others" entries by
           their typed text, shown as selected values of their own. */
        const toNames = (items: PersonalHistoryItem[]) =>
          items
            .map((item) => (item.others ? item.others : item.name))
            .filter(Boolean);
        setSelectedImmunizations(toNames(record.immunization ?? []));
        setSelectedDrugConsumptions(toNames(record.drug_consumption ?? []));

        const drugDetails: Record<string, DrugConsumptionDetail> = {};
        (record.drug_consumption ?? []).forEach((item) => {
          const key = item.others ? item.others : item.name;
          if (!key) return;
          drugDetails[key] = {
            durationValue:
              item.duration_value != null ? String(item.duration_value) : "",
            durationUnit: normalizeDurationUnit(item.duration_unit),
            commands: item.commands ?? "",
          };
        });
        setDrugConsumptionDetails(drugDetails);

        setDietType(record.diet_type ?? "");

        const family = record.family_history;
        if (family && (family.status === "PRESENT" || family.status === "NOT_PRESENT")) {
          setFamilyHistoryStatus(family.status);
          setFamilyHistoryEntries(
            family.status === "PRESENT" ? toFamilyDrafts(family.entries) : []
          );
        } else {
          /* null = not answered yet; keep neither option selected. */
          setFamilyHistoryStatus("");
          setFamilyHistoryEntries([]);
        }
        familyHistoryReadyRef.current = true;
      })
      .catch((error) =>
        console.error("Failed to load personal history:", error)
      );
    return () => {
      cancelled = true;
    };
  }, [encounter?.encounter_no]);

  /* ============================================================
     LOAD IMMUNIZATION DETAILS
     Date + Response per selected immunization (encounter_immunization),
     keyed by the immunization name so the fields line up with the
     selections above.
   ============================================================ */

  useEffect(() => {
    const encounterNo = encounter?.encounter_no;
    if (!encounterNo) return;
    let cancelled = false;
    consultationApi
      .getEncounterImmunizations(encounterNo)
      .then((response) => {
        if (cancelled) return;
        const map: Record<string, { date: string; response: string }> = {};
        (response.data.data ?? []).forEach((row) => {
          map[row.immunization_name] = {
            date: row.immunization_date ? row.immunization_date.slice(0, 10) : "",
            response: row.response ?? "",
          };
        });
        setImmunizationDetails(map);
      })
      .catch((error) =>
        console.error("Failed to load immunization details:", error)
      );
    return () => {
      cancelled = true;
    };
  }, [encounter?.encounter_no]);

  /* ============================================================
     LOAD PAST TREATMENTS / PREVIOUS REPORTS / MOLECULAR TESTS
     The visit's saved rows, one selection (with its detail fields)
     per row, so they show when the consultation is reopened.
   ============================================================ */

  useEffect(() => {
    const encounterNo = encounter?.encounter_no;
    setSelectedTreatmentTypes([]);
    setTreatmentDetails({});
    setSelectedReports([]);
    setReportDetails({});
    setSelectedMolecularTests([]);
    setMolecularTestDetails({});
    loadedDetailsRef.current = {};
    if (!encounterNo) return;
    let cancelled = false;

    consultationApi
      .getEncounterPastTreatments(encounterNo)
      .then((response) => {
        if (cancelled) return;
        const rows = response.data.data ?? [];
        const map: Record<string, PastTreatmentDetail> = {};
        rows.forEach((row) => {
          map[row.treatment_type] = {
            date: row.treatment_date ? row.treatment_date.slice(0, 10) : "",
            note: row.note ?? "",
            response: row.treatment_response ?? "",
          };
        });
        setSelectedTreatmentTypes(Object.keys(map));
        setTreatmentDetails(map);
        loadedDetailsRef.current.pastTreatments = encounterNo;
      })
      .catch((error) =>
        console.error("Failed to load past treatments:", error)
      );

    consultationApi
      .getReports(encounterNo)
      .then((response) => {
        if (cancelled) return;
        const map: Record<string, TestResultDetail> = {};
        (response.data.data ?? []).forEach((row) => {
          const key = row.lab_test_id ? String(row.lab_test_id) : row.test_name;
          if (!key) return;
          map[key] = {
            date: row.report_completed_date
              ? row.report_completed_date.slice(0, 10)
              : "",
            result: row.result ?? "",
            impression: row.impression ?? "",
          };
        });
        setSelectedReports(Object.keys(map));
        setReportDetails(map);
        loadedDetailsRef.current.reports = encounterNo;
      })
      .catch((error) =>
        console.error("Failed to load previous reports:", error)
      );

    consultationApi
      .getMolecularTests(encounterNo)
      .then((response) => {
        if (cancelled) return;
        const map: Record<string, TestResultDetail> = {};
        (response.data.data ?? []).forEach((row) => {
          map[row.test_name] = {
            date: row.test_date ? row.test_date.slice(0, 10) : "",
            result: row.result ?? "",
            impression: row.impression ?? "",
          };
        });
        setSelectedMolecularTests(Object.keys(map));
        setMolecularTestDetails(map);
        loadedDetailsRef.current.molecularTests = encounterNo;
      })
      .catch((error) =>
        console.error("Failed to load molecular tests:", error)
      );

    return () => {
      cancelled = true;
    };
  }, [encounter?.encounter_no]);

  /* Master values are saved as {code, name}; a value that isn't in the
     master (an older free-text entry) keeps the "Others" item shape. */

  const buildPersonalHistoryItems = (
    selectedNames: string[],
    options: ImmunizationRecord[] | DrugConsumptionRecord[],
    details?: Record<string, DrugConsumptionDetail>
  ): PersonalHistoryItem[] =>
    selectedNames.map((name) => {
      const match = options.find(
        (option) => option.name.toLowerCase() === name.toLowerCase()
      );
      const base: PersonalHistoryItem = match
        ? { code: match.code, name: match.name }
        : { code: "OTHERS", name: "Others", others: name };

      const detail = details?.[name];
      if (!detail) return base;

      const duration = toDurationPayload(
        detail.durationValue,
        detail.durationUnit
      );

      return {
        ...base,
        duration_value: duration.value,
        duration_unit: duration.unit,
        commands: detail.commands.trim() || null,
      };
    });

  /* Family History -> API payload. Rows without a Relative Type are dropped
     so a stray empty row never reaches the chart. */
  const buildFamilyHistoryPayload = () => {
    if (!familyHistoryStatus) return null;
    if (familyHistoryStatus === "NOT_PRESENT") {
      return { status: familyHistoryStatus, entries: [] as FamilyHistoryEntry[] };
    }

    const entries: FamilyHistoryEntry[] = familyHistoryEntries
      .filter((entry) => entry.relativeType.trim())
      .map((entry) => ({
        degree: (entry.degree || "") as FamilyDegree,
        relative_type: entry.relativeType.trim(),
        condition: entry.condition.trim() || null,
        age_at_diagnosis: entry.ageAtDiagnosis.trim() || null,
        remarks: entry.remarks.trim() || null,
      }));

    return { status: familyHistoryStatus, entries };
  };

  const savePersonalHistory = async (encounterNo: string) => {
    await consultationApi.savePersonalHistory(encounterNo, {
      immunization: buildPersonalHistoryItems(
        selectedImmunizations,
        immunizationOptions
      ),
      drug_consumption: buildPersonalHistoryItems(
        selectedDrugConsumptions,
        drugConsumptionOptions,
        drugConsumptionDetails
      ),
      diet_type: dietType || null,
      /* Omitted when the family-history load failed, so a failed GET can
         never wipe what the doctor saved earlier. */
      ...(familyHistoryReadyRef.current
        ? { family_history: buildFamilyHistoryPayload() }
        : {}),
    });
  };

  /* PRESENT / NOT PRESENT toggle. Clicking the active status clears it back
     to unanswered; switching to PRESENT seeds the first relative row. */
  const handleFamilyHistoryStatusChange = (status: FamilyHistoryStatus) => {
    familyHistoryReadyRef.current = true;
    setFamilyHistoryStatus((previous) => (previous === status ? "" : status));
    if (status === "PRESENT" && familyHistoryStatus !== "PRESENT") {
      setFamilyHistoryEntries((previous) =>
        previous.length > 0 ? previous : [newFamilyHistoryDraft()]
      );
    }
  };

  const updateFamilyHistoryEntry = (
    id: string,
    patch: Partial<FamilyHistoryDraft>
  ) => {
    familyHistoryReadyRef.current = true;
    setFamilyHistoryEntries((previous) =>
      previous.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry))
    );
  };

  /* Picking a relative type auto-fills its usual degree (still editable). */
  const handleRelativeTypeChange = (id: string, relativeType: string) => {
    const suggested = relativeTypeOptions.find(
      (option) => option.name.toLowerCase() === relativeType.toLowerCase()
    );
    updateFamilyHistoryEntry(id, {
      relativeType,
      ...(suggested?.degree ? { degree: suggested.degree } : {}),
    });
  };

  const addFamilyHistoryEntry = () => {
    familyHistoryReadyRef.current = true;
    setFamilyHistoryEntries((previous) => [...previous, newFamilyHistoryDraft()]);
  };

  const removeFamilyHistoryEntry = (id: string) => {
    familyHistoryReadyRef.current = true;
    setFamilyHistoryEntries((previous) =>
      previous.filter((entry) => entry.id !== id)
    );
  };

  /* The drug-consumption multi-select reports the full selected list. Keep
     each value's Duration / Command(s) in step: seed blanks for new
     selections and drop deselected ones. */
  const handleDrugConsumptionsChange = (names: string[]) => {
    setSelectedDrugConsumptions(names);
    setDrugConsumptionDetails((previous) =>
      syncDetails(previous, names, EMPTY_DRUG_CONSUMPTION_DETAIL)
    );
  };

  /* "+ Add" on the drug search: select the value and seed its row. */
  const selectDrugConsumption = (name: string) => {
    addToSelection(setSelectedDrugConsumptions)(name);
    setDrugConsumptionDetails((previous) =>
      previous[name]
        ? previous
        : { ...previous, [name]: EMPTY_DRUG_CONSUMPTION_DETAIL }
    );
  };

  const updateDrugConsumptionDetail = (
    name: string,
    patch: Partial<DrugConsumptionDetail>
  ) =>
    setDrugConsumptionDetails((previous) => ({
      ...previous,
      [name]: {
        ...(previous[name] ?? EMPTY_DRUG_CONSUMPTION_DETAIL),
        ...patch,
      },
    }));

  /* The immunization multi-select reports the full selected list. Keep the
     Date/Response entries in step: seed blanks for new selections and drop
     deselected ones (they are removed from encounter_immunization on save). */
  const handleImmunizationsChange = (names: string[]) => {
    setSelectedImmunizations(names);
    setImmunizationDetails((previous) => {
      const next: Record<string, { date: string; response: string }> = {};
      names.forEach((name) => {
        next[name] = previous[name] ?? { date: "", response: "" };
      });
      return next;
    });
  };

  /* "+ Add" on the immunization search: select the value and seed its row. */
  const selectImmunization = (name: string) => {
    setSelectedImmunizations((previous) =>
      previous.some((value) => value.toLowerCase() === name.toLowerCase())
        ? previous
        : [...previous, name]
    );
    setImmunizationDetails((previous) =>
      previous[name]
        ? previous
        : { ...previous, [name]: { date: "", response: "" } }
    );
  };

  const updateImmunizationDetail = (
    name: string,
    patch: Partial<{ date: string; response: string }>
  ) =>
    setImmunizationDetails((previous) => ({
      ...previous,
      [name]: { ...(previous[name] ?? { date: "", response: "" }), ...patch },
    }));

  /* Persists Date + Response per selected immunization into
     encounter_immunization (one bulk sync; deselected rows are removed). */
  const persistImmunizationDetails = async (encounterNo: string) => {
    try {
      await consultationApi.saveEncounterImmunizations(
        encounterNo,
        selectedImmunizations.map((name) => {
          const match = immunizationOptions.find(
            (option) => option.name.toLowerCase() === name.toLowerCase()
          );
          const detail = immunizationDetails[name];
          return {
            immunization_name: name,
            immunization_code: match?.code ?? null,
            immunization_date: detail?.date || null,
            response: detail?.response || null,
          };
        })
      );
    } catch (error: any) {
      console.error(
        "Failed to save immunization details:",
        error?.response?.data?.message ?? error?.message
      );
    }
  };

  /* Past History / Reports (Previous) / Molecular Testing multi-selects:
     same model as Immunization - each selection gets its own detail
     fields, kept in step with the selected list. */
  const handleTreatmentTypesChange = (names: string[]) => {
    setSelectedTreatmentTypes(names);
    setTreatmentDetails((previous) =>
      syncDetails(previous, names, EMPTY_PAST_TREATMENT)
    );
  };

  /* "+ Add" on the treatment type search: select the value and seed its row. */
  const selectTreatmentType = (name: string) => {
    setSelectedTreatmentTypes((previous) =>
      previous.some((value) => value.toLowerCase() === name.toLowerCase())
        ? previous
        : [...previous, name]
    );
    setTreatmentDetails((previous) =>
      previous[name] ? previous : { ...previous, [name]: EMPTY_PAST_TREATMENT }
    );
  };

  const updateTreatmentDetail = (
    name: string,
    patch: Partial<PastTreatmentDetail>
  ) =>
    setTreatmentDetails((previous) => ({
      ...previous,
      [name]: { ...(previous[name] ?? EMPTY_PAST_TREATMENT), ...patch },
    }));

  const handleReportsChange = (keys: string[]) => {
    setSelectedReports(keys);
    setReportDetails((previous) =>
      syncDetails(previous, keys, EMPTY_TEST_RESULT)
    );
  };

  /* "Use" on the report test search: a listed test is selected by its id,
     anything else by the typed name (this patient's report only). */
  const selectReportTest = (typed: string) => {
    const match = labTests.find(
      (test) => (test.test_name ?? "").toLowerCase() === typed.toLowerCase()
    );
    const key = match ? String(match.lab_test_id) : typed;
    if (!selectedReports.includes(key)) {
      handleReportsChange([...selectedReports, key]);
    }
  };

  const updateReportDetail = (key: string, patch: Partial<TestResultDetail>) =>
    setReportDetails((previous) => ({
      ...previous,
      [key]: { ...(previous[key] ?? EMPTY_TEST_RESULT), ...patch },
    }));

  /* A selected report key's display name: its lab test, else the typed name. */
  const reportTestName = (key: string) =>
    labTests.find((test) => String(test.lab_test_id) === key)?.test_name ?? key;

  const handleMolecularTestsChange = (names: string[]) => {
    setSelectedMolecularTests(names);
    setMolecularTestDetails((previous) =>
      syncDetails(previous, names, EMPTY_TEST_RESULT)
    );
  };

  const selectMolecularTest = (name: string) => {
    if (
      !selectedMolecularTests.some(
        (value) => value.toLowerCase() === name.toLowerCase()
      )
    ) {
      handleMolecularTestsChange([...selectedMolecularTests, name]);
    }
  };

  const updateMolecularTestDetail = (
    name: string,
    patch: Partial<TestResultDetail>
  ) =>
    setMolecularTestDetails((previous) => ({
      ...previous,
      [name]: { ...(previous[name] ?? EMPTY_TEST_RESULT), ...patch },
    }));

  /* Persists the selected Past History treatments into
     encounter_past_treatment (one bulk sync; deselected rows are removed). */
  const persistPastTreatments = async (encounterNo: string) => {
    if (loadedDetailsRef.current.pastTreatments !== encounterNo) return;
    try {
      await consultationApi.saveEncounterPastTreatments(
        encounterNo,
        selectedTreatmentTypes.map((name) => {
          const match = treatmentTypeOptions.find(
            (option) => option.name.toLowerCase() === name.toLowerCase()
          );
          const detail = treatmentDetails[name];
          return {
            treatment_type: name,
            treatment_type_code: match?.code ?? null,
            treatment_date: detail?.date || null,
            note: detail?.note || null,
            treatment_response: detail?.response || null,
          };
        })
      );
    } catch (error: any) {
      console.error(
        "Failed to save past treatments:",
        error?.response?.data?.message ?? error?.message
      );
    }
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

  /* The visit's draft is restored with the encounter (above). */

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
      adviceFollowUpDate: adviceSectionRef.current?.getDraftFollowUpDate() ?? "",
      investigations: selectedInvestigations,
    };

    writeConsultationDraft(encounter?.encounter_no, patientDisplayId, data);

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

    /* Past History treatments are saved to encounter_past_treatment
       (persistPastTreatments). */
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

  /* Persists the "Reports (Previous)" selections (test/date/result/
     impression) into encounter_report: upserts the row of each selected
     test so repeated saves never duplicate it, and removes the rows of
     deselected tests. */
  const persistReportsPrevious = async (targetEncounterNo: string) => {
    if (loadedDetailsRef.current.reports !== targetEncounterNo) return;
    try {
      const existingReports = await consultationApi.getReports(
        targetEncounterNo
      );
      const rows = existingReports.data?.data ?? [];
      /* A master test matches on its id, a typed one on its name. */
      const isMasterTest = (key: string) =>
        labTests.some((test) => String(test.lab_test_id) === key);
      const matchesKey = (
        report: (typeof rows)[number],
        key: string
      ) =>
        isMasterTest(key)
          ? String(report.lab_test_id) === key
          : !report.lab_test_id &&
            (report.test_name ?? "").toLowerCase() === key.toLowerCase();

      for (const report of rows) {
        if (!selectedReports.some((key) => matchesKey(report, key))) {
          await consultationApi.removeReport(report.encounter_report_id);
        }
      }

      for (const key of selectedReports) {
        const detail = reportDetails[key] ?? EMPTY_TEST_RESULT;
        const existing = rows.find((report) => matchesKey(report, key));
        const payload = {
          ...(isMasterTest(key) ? { lab_test_id: key } : { test_name: key }),
          report_completed_date: detail.date || null,
          result: detail.result || null,
          impression: detail.impression || null,
        };
        if (existing) {
          await consultationApi.updateReport(
            existing.encounter_report_id,
            payload
          );
        } else {
          await consultationApi.addReport(targetEncounterNo, payload);
        }
      }
    } catch (error: any) {
      console.error(
        "Failed to save previous reports:",
        error?.response?.data?.message ?? error?.message
      );
    }
  };

  /* Persists the Molecular Testing selections into
     encounter_molecular_test: upserts the row of each selected test
     (matched by name) so repeated saves never duplicate it, and removes
     the rows of deselected tests. */
  const persistMolecularTests = async (targetEncounterNo: string) => {
    if (loadedDetailsRef.current.molecularTests !== targetEncounterNo) return;
    try {
      const existingTests = await consultationApi.getMolecularTests(
        targetEncounterNo
      );
      const rows = existingTests.data?.data ?? [];
      const isSelected = (name: string) =>
        selectedMolecularTests.some(
          (value) => value.toLowerCase() === name.toLowerCase()
        );

      for (const row of rows) {
        if (!isSelected(row.test_name)) {
          await consultationApi.removeMolecularTest(
            row.encounter_molecular_test_id
          );
        }
      }

      for (const name of selectedMolecularTests) {
        const detail = molecularTestDetails[name] ?? EMPTY_TEST_RESULT;
        const existing = rows.find(
          (row) => row.test_name.toLowerCase() === name.toLowerCase()
        );
        const payload = {
          test_name: name,
          test_date: detail.date || null,
          result: detail.result || null,
          impression: detail.impression || null,
        };
        if (existing) {
          await consultationApi.updateMolecularTest(
            existing.encounter_molecular_test_id,
            payload
          );
        } else {
          await consultationApi.addMolecularTest(targetEncounterNo, payload);
        }
      }
    } catch (error: any) {
      console.error(
        "Failed to save molecular tests:",
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

    /* Lab Review orders the selected tests next, so a mistyped Target
       Date is caught here rather than silently dropped. */
    for (const name of selectedInvestigations) {
      const dateError = targetDateError(investigationDetail(name).targetDate);
      if (dateError) {
        showToast(`Target Date for ${name}: ${dateError}`);
        return;
      }
    }

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
      await persistPastTreatments(encounter.encounter_no);
      await persistReportsPrevious(encounter.encounter_no);
      await persistMolecularTests(encounter.encounter_no);
      await persistImmunizationDetails(encounter.encounter_no);
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
      /* Saved to the visit: the draft would only shadow it on reopen. */
      clearConsultationDraft(encounter.encounter_no, patientDisplayId);

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

    <button
      type="button"
      onClick={() => toggleSection("summary")}
      className="flex w-full items-center justify-between gap-2 px-2 py-1.5 border-b border-slate-100"
    >
      <div className="flex items-center gap-2">
        <div className="text-[14px] font-bold uppercase leading-7 text-slate-800 tracking-wide">
          Consultation Summary
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 transition-transform duration-200",
            expandedSections.summary && "rotate-180",
          )}
        />
      </div>
    </button>
    {expandedSections.summary && (
      <div className="pt-4">

      {/* SUMMARY GRID */}

    <div className="grid w-full grid-cols-4 gap-x-4">

      {/* DATE */}

      <div className="flex min-w-0 flex-col gap-1">

        <label className="text-[10px] uppercase leading-4 text-slate-800">
          Visit Date &amp; Time
        </label>

        <div className="flex w-full gap-2">

          <Popover>
            <PopoverTrigger asChild>
              <div className="relative min-w-0 flex-1 cursor-pointer">

                <input
                  className="h-[38px] w-full rounded-md border border-slate-200 bg-white px-[13px] pl-[33px] text-[10px] leading-5 text-slate-700 outline-none"
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
              className="h-[38px] w-full rounded-md border border-slate-200 bg-white px-[13px] pl-[33px] text-[10px] leading-5 text-slate-700 outline-none"
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

        <label className="text-[10px] uppercase leading-4 text-slate-800">
          First Visit for this Treatment
        </label>

        <input
          className="h-[38px] w-full rounded-md border border-slate-200 bg-white px-[13px] text-[10px] leading-5 text-slate-700 outline-none"
          value={registeredOn}
          readOnly
        />

      </div>

      {/* CONSULTED BY */}

      <div className="flex min-w-0 flex-col gap-1">

        <label className="text-[10px] uppercase leading-4 text-slate-800">
          Consulted By
        </label>

        <div className="relative h-[38px]">

          <select
            defaultValue={consultedBy}
            className="h-[38px] w-full appearance-none rounded-md border border-slate-200 bg-white px-[13px] pr-10 text-[10px] leading-5 text-slate-700 outline-none"
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

        <label className="text-[10px] uppercase leading-4 text-slate-800">
          Visit Type
        </label>

        <div className="relative h-[38px]">
            <input
              className="h-[38px] w-full rounded-md border border-slate-200 bg-white px-[13px] pl-[33px] text-[10px] leading-5 text-slate-700 outline-none"
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

        <label className="text-[10px] uppercase leading-4 text-slate-800">
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

            <div className="text-[10px] uppercase leading-[15px] tracking-[0.5px] text-slate-800">
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
            <div className="text-[10px] font-medium leading-4 text-red-700">
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
            <div className="flex items-center gap-2 text-[10px] leading-4 text-slate-500">
              Loading clinical details...
            </div>
          )
        )}

      </div>

    </div>
    </div>
    )}
    </section>

    {/* =================================================
      EXPAND ALL / COLLAPSE ALL CONTROLS
    ================================================= */}
    <div className="flex w-full items-center justify-between gap-2 px-2 py-2 border-b border-slate-100">
      <button
        type="button"
        onClick={expandAll}
        className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-semibold leading-4 text-slate-700 transition hover:bg-slate-50"
      >
        <ChevronsDownUp className="h-3.5 w-3.5 shrink-0" />
        <span>Expand All</span>
      </button>
      <button
        type="button"
        onClick={collapseAll}
        className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-semibold leading-4 text-slate-700 transition hover:bg-slate-50"
      >
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0" />
        <span>Collapse All</span>
      </button>
    </div>

    {/* =================================================
      PERSONAL HISTORY
    ================================================= */}

    <section className="flex w-full flex-col gap-5 rounded-xl border border-slate-200 bg-white p-5">

    <button
      type="button"
      onClick={() => toggleSection("personalHistory")}
      className="flex w-full items-center justify-between gap-2 px-2 py-1.5 border-b border-slate-100"
    >
      <div className="flex items-center gap-2">
        <div className="text-[14px] font-bold uppercase leading-7 text-slate-800 tracking-wide">
          Personal History
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 transition-transform duration-200",
            expandedSections.personalHistory && "rotate-180",
          )}
        />
      </div>
    </button>
    {expandedSections.personalHistory && (
      <div className="pt-4">

      {/* PERSONAL HISTORY GRID */}

    <div className="grid w-full grid-cols-2 gap-x-6 gap-y-4 pt-2">

      {/* IMMUNIZATION */}

      <div className="flex flex-col gap-2">

        <label className="text-[10px] uppercase leading-4 text-slate-800">
          Immunization
        </label>

        <MultiSelectDropdown
          options={withSelected(
            immunizationOptions.map((option) => option.name),
            selectedImmunizations
          )}
          value={selectedImmunizations}
          onValueChange={handleImmunizationsChange}
          onCreateOption={(typed) =>
            addMasterOption(
              () => consultationApi.createCustomImmunization({ name: typed }),
              setImmunizationOptions,
              selectImmunization,
              "immunization"
            )
          }
          placeholder="Select immunization(s)"
        />

        {/* DATE + RESPONSE per selected immunization (encounter_immunization). */}

        {selectedImmunizations.length > 0 && (
          <div className="flex w-full flex-col gap-3 pt-1">

            {selectedImmunizations.map((name) => (
              <div
                key={name}
                className="flex flex-col gap-2 rounded-md border border-slate-200 bg-slate-50 p-3"
              >

                <div className="text-[10px] uppercase leading-[15px] tracking-[0.5px] text-slate-800">
                  {name}
                </div>

                <div className="flex flex-col gap-1.5">

                  <label className="text-[10px] uppercase leading-[15px] tracking-[0.5px] text-slate-800">
                    Date
                  </label>

                  <input
                    type="date"
                    value={immunizationDetails[name]?.date ?? ""}
                    onChange={(event) =>
                      updateImmunizationDetail(name, { date: event.target.value })
                    }
                    className="h-[38px] w-full rounded-md border border-slate-200 bg-white px-[13px] text-[10px] leading-5 text-slate-700 outline-none focus:border-slate-400"
                  />

                </div>

                <div className="flex flex-col gap-1.5">

                  <label className="text-[10px] uppercase leading-[15px] tracking-[0.5px] text-slate-800">
                    Response
                  </label>

                  <VoiceToText
                    value={immunizationDetails[name]?.response ?? ""}
                    onChange={(text) =>
                      updateImmunizationDetail(name, { response: text })
                    }
                    placeholder="Type the response..."
                  />

                </div>

              </div>
            ))}

          </div>
        )}

      </div>

      {/* DRUG CONSUMPTION */}

      <div className="flex flex-col gap-2">

        <label className="text-[10px] uppercase leading-4 text-slate-800">
          Drug Consumption
        </label>

        <MultiSelectDropdown
          options={withSelected(
            drugConsumptionOptions.map((option) => option.name),
            selectedDrugConsumptions
          )}
          value={selectedDrugConsumptions}
          onValueChange={handleDrugConsumptionsChange}
          onCreateOption={(typed) =>
            addMasterOption(
              () => consultationApi.createCustomDrugConsumption({ name: typed }),
              setDrugConsumptionOptions,
              selectDrugConsumption,
              "drug consumption"
            )
          }
          placeholder="Select drug consumption(s)"
        />

        {/* Per-drug Duration + Command(s) */}
        {selectedDrugConsumptions.length > 0 && (
          <div className="flex w-full flex-col gap-1.5">
            {selectedDrugConsumptions.map((name) => {
              const detail =
                drugConsumptionDetails[name] ?? EMPTY_DRUG_CONSUMPTION_DETAIL;

              return (
                <div
                  key={name}
                  className="flex w-full flex-col gap-2 rounded-md border border-slate-200 bg-slate-50 p-3"
                >
                  <div className="text-[10px] uppercase leading-[15px] tracking-[0.5px] text-slate-800">
                    {name}
                  </div>

                  <DurationInput
                    value={detail.durationValue}
                    unit={detail.durationUnit}
                    onValueChange={(value) =>
                      updateDrugConsumptionDetail(name, {
                        durationValue: value,
                      })
                    }
                    onUnitChange={(unit) =>
                      updateDrugConsumptionDetail(name, { durationUnit: unit })
                    }
                  />

                  <VoiceInput
                    value={detail.commands}
                    onChange={(text) =>
                      updateDrugConsumptionDetail(name, { commands: text })
                    }
                    placeholder="Command(s)"
                  />
                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* DIET TYPE */}

      <div className="flex flex-col gap-2">

        <label className="text-[10px] uppercase leading-4 text-slate-800">
          Diet Type
        </label>

        <div className="relative h-[38px]">

          <select
            value={dietType}
            onChange={(event) => setDietType(event.target.value)}
            className="h-[38px] w-full appearance-none rounded-md border border-slate-200 bg-white px-[13px] pr-10 text-[10px] leading-5 text-slate-700 outline-none"
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

    {/* FAMILY HISTORY */}

    <div className="flex w-full flex-col gap-3 border-t border-slate-200 pt-4">

      <div className="flex flex-wrap items-center justify-between gap-2">

        <label className="text-[10px] uppercase leading-4 text-slate-800">
          Family History
        </label>

        <div className="flex items-center gap-0.5 rounded-md border border-slate-200 bg-slate-50 p-0.5">

          {([
            { value: "PRESENT", label: "Present" },
            { value: "NOT_PRESENT", label: "Not Present" },
          ] as const).map((option) => {
            const active = familyHistoryStatus === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => handleFamilyHistoryStatusChange(option.value)}
                className={`rounded px-3 py-1.5 text-[10px] font-semibold uppercase leading-4 transition-colors ${
                  active
                    ? "bg-[#004785] text-white shadow-sm"
                    : "text-slate-600 hover:bg-white hover:text-slate-800"
                }`}
              >
                {option.label}
              </button>
            );
          })}

        </div>

      </div>

      {familyHistoryStatus === "" && (
        <p className="text-[10px] leading-4 text-slate-500">
          Select Present or Not Present. Leave both unselected if not asked.
        </p>
      )}

      {familyHistoryStatus === "NOT_PRESENT" && (
        <p className="text-[10px] leading-4 text-slate-500">
          No family history recorded for this patient.
        </p>
      )}

      {familyHistoryStatus === "PRESENT" && (
        <div className="flex w-full flex-col gap-3">

          {familyHistoryEntries.length === 0 && (
            <p className="text-[10px] leading-4 text-slate-500">
              Add each relative with a family history of disease.
            </p>
          )}

          {familyHistoryEntries.map((entry, index) => (
            <div
              key={entry.id}
              className="flex w-full flex-col gap-3 rounded-md border border-slate-200 bg-slate-50 p-3"
            >

              <div className="flex items-center justify-between gap-2">

                <div className="text-[10px] uppercase leading-[15px] tracking-[0.5px] text-slate-800">
                  Relative {index + 1}
                </div>

                <button
                  type="button"
                  onClick={() => removeFamilyHistoryEntry(entry.id)}
                  className="rounded px-1.5 py-0.5 text-[10px] font-semibold leading-4 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  × Remove
                </button>

              </div>

              <div className="grid w-full grid-cols-2 gap-3">

                <div className="flex flex-col gap-1.5">

                  <label className="text-[10px] uppercase leading-[15px] tracking-[0.5px] text-slate-800">
                    Degree of Relatives
                  </label>

                  <div className="relative h-[38px]">

                    <select
                      value={entry.degree}
                      onChange={(event) =>
                        updateFamilyHistoryEntry(entry.id, {
                          degree: event.target.value as FamilyDegree | "",
                        })
                      }
                      className="h-[38px] w-full appearance-none rounded-md border border-slate-200 bg-white px-[13px] pr-10 text-[10px] leading-5 text-slate-700 outline-none focus:border-slate-400"
                    >
                      <option value="">Select</option>
                      {FAMILY_DEGREES.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
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

                <div className="flex flex-col gap-1.5">

                  <label className="text-[10px] uppercase leading-[15px] tracking-[0.5px] text-slate-800">
                    Relative Type
                  </label>

                  <SingleSelectDropdown
                    options={relativeTypeOptions.map((option) => ({
                      label: option.name,
                      value: option.name,
                      hint: option.degree ? `${option.degree} degree` : undefined,
                    }))}
                    value={entry.relativeType}
                    valueLabel={entry.relativeType}
                    onValueChange={(value) =>
                      handleRelativeTypeChange(entry.id, value)
                    }
                    onCreateOption={(typed) =>
                      handleRelativeTypeChange(entry.id, typed)
                    }
                    createLabel="+ Add relative"
                    placeholder="Select relative type"
                    className="h-[38px] rounded-md px-[13px] text-[10px]"
                  />

                </div>

              </div>

              <div className="flex flex-col gap-1.5">

                <label className="text-[10px] uppercase leading-[15px] tracking-[0.5px] text-slate-800">
                  Condition
                </label>

                <VoiceInput
                  value={entry.condition}
                  onChange={(text) =>
                    updateFamilyHistoryEntry(entry.id, {
                      condition: text.slice(0, 200),
                    })
                  }
                  placeholder="e.g. Breast Cancer, Diabetes, Hypertension"
                />

              </div>

              <div className="grid w-full grid-cols-3 gap-3">

                <div className="flex flex-col gap-1.5">

                  <label className="text-[10px] uppercase leading-[15px] tracking-[0.5px] text-slate-800">
                    Age at Diagnosis
                  </label>

                  <input
                    type="number"
                    min={0}
                    max={150}
                    inputMode="numeric"
                    value={entry.ageAtDiagnosis}
                    onChange={(event) =>
                      updateFamilyHistoryEntry(entry.id, {
                        ageAtDiagnosis: event.target.value,
                      })
                    }
                    placeholder="Years"
                    className="h-[38px] w-full rounded-md border border-slate-200 bg-white px-[13px] text-[10px] leading-5 text-slate-700 outline-none focus:border-slate-400"
                  />

                </div>

                <div className="col-span-2 flex flex-col gap-1.5">

                  <label className="text-[10px] uppercase leading-[15px] tracking-[0.5px] text-slate-800">
                    Remarks
                  </label>

                  <VoiceInput
                    value={entry.remarks}
                    onChange={(text) =>
                      updateFamilyHistoryEntry(entry.id, {
                        remarks: text.slice(0, 500),
                      })
                    }
                    placeholder="Optional notes"
                  />

                </div>

              </div>

            </div>
          ))}

          <div className="flex flex-wrap items-center justify-between gap-2">

            <button
              type="button"
              onClick={addFamilyHistoryEntry}
              className="rounded-md border border-[#004785] bg-white px-3 py-1.5 text-[10px] font-semibold uppercase leading-4 text-[#004785] transition-colors hover:bg-[#004785] hover:text-white"
            >
              + Add Relative
            </button>

            <span className="text-[10px] leading-4 text-slate-500">
              {familyHistoryEntries.filter((entry) => entry.relativeType.trim())
                .length}{" "}
              relative(s) recorded
            </span>

          </div>

        </div>
      )}

    </div>
    </div>
    )}
    </section>

    {/* =================================================
      GENERAL EXAMINATION
    ================================================= */}

    <section className="flex w-full flex-col gap-5 rounded-xl border border-slate-200 bg-white p-5">

    <button
      type="button"
      onClick={() => toggleSection("generalExamination")}
      className="flex w-full items-center justify-between gap-2 px-2 py-1.5 border-b border-slate-100"
    >
      <div className="flex items-center gap-2">
        <div className="text-[14px] font-bold uppercase leading-7 text-slate-800 tracking-wide">
          General Examination
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 transition-transform duration-200",
            expandedSections.generalExamination && "rotate-180",
          )}
        />
      </div>
    </button>
    {expandedSections.generalExamination && (
      <div className="pt-4">

    <div className="flex flex-col gap-2 pt-2">
      <label className="text-[10px] uppercase leading-4 text-slate-800">
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
      <label className="text-[10px] uppercase leading-4 text-slate-800">
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
    </div>
    )}
    </section>

    {/* =================================================
      SYSTEMIC EXAMINATION
    ================================================= */}

    <section className="flex w-full flex-col gap-5 rounded-xl border border-slate-200 bg-white p-5">

    <button
      type="button"
      onClick={() => toggleSection("systemicExamination")}
      className="flex w-full items-center justify-between gap-2 px-2 py-1.5 border-b border-slate-100"
    >
      <div className="flex items-center gap-2">
        <div className="text-[14px] font-bold uppercase leading-7 text-slate-800 tracking-wide">
          Systemic Examination
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 transition-transform duration-200",
            expandedSections.systemicExamination && "rotate-180",
          )}
        />
      </div>
    </button>
    {expandedSections.systemicExamination && (
      <div className="pt-4">

    <div className="grid w-full grid-cols-1 gap-x-5 gap-y-6 pt-2 sm:grid-cols-2 lg:grid-cols-4">

      {[
        { label: "CNS", value: systemicCns, onChange: setSystemicCns },
        { label: "CVS", value: systemicCvs, onChange: setSystemicCvs },
        { label: "Respiratory", value: systemicRespiratory, onChange: setSystemicRespiratory },
        { label: "Per Abdomen", value: systemicPerAbdomen, onChange: setSystemicPerAbdomen },
      ].map((item) => (
        <div key={item.label} className="flex flex-col gap-2">
          <label className="text-[10px] uppercase leading-4 text-slate-800">
            {item.label}
          </label>
          <input
            type="text"
            value={item.value}
            onChange={(event) => item.onChange(event.target.value)}
            placeholder={`Type ${item.label.toLowerCase()} findings...`}
    className="block w-full rounded-md border border-gray-300 bg-white py-3 pl-4 pr-10 text-[10px] text-gray-800 focus:border-[#1d4ed8] focus:outline-none focus:ring-[#1d4ed8]"
          />
        </div>
      ))}

    </div>

    <div className="flex flex-col gap-2 pt-2">
      <label className="text-[10px] uppercase leading-4 text-slate-800">
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
        <span className="text-[10px] font-medium text-slate-700">
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
        className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-slate-50 px-4 py-2 text-[10px] font-medium text-slate-700 transition-colors hover:bg-slate-100"
      >
        Apply Normal To All
      </button>
    </div>
    </div>
    )}
    </section>

    {/* =================================================
      PATIENT DETAILS
    ================================================= */}

    <section className="flex w-full flex-col gap-5 rounded-xl border border-slate-200 bg-white p-5">

    <button
      type="button"
      onClick={() => toggleSection("patientDetails")}
      className="flex w-full items-center justify-between gap-2 px-2 py-1.5 border-b border-slate-100"
    >
      <div className="flex items-center gap-2">
        <div className="text-[14px] font-bold uppercase leading-7 text-slate-800 tracking-wide">
          Patient Details
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 transition-transform duration-200",
            expandedSections.patientDetails && "rotate-180",
          )}
        />
      </div>
    </button>
    {expandedSections.patientDetails && (
      <div className="pt-4">

    {/* PATIENT DETAILS GRID */}

    <div className="grid w-full grid-cols-2 gap-x-6 pt-2">

      {/* LEFT COLUMN: HOPI + REPORTS */}

      <div className="flex w-full flex-col gap-4">

      {/* HISTORY OF PRESENT ILLNESS (HOPI) */}

      <div className="flex flex-col gap-2">

        <label className="text-[10px] uppercase leading-4 text-slate-800">
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

        <label className="text-[10px] uppercase leading-4 text-slate-800">
          Reports (Previous)
        </label>

        {/* Not in the list: the typed name is used for this patient's
            report only (lab_test_master is unchanged). */}
        <MultiSelectDropdown
          options={[
            ...labTests.map((test) => ({
              label: test.test_name,
              value: String(test.lab_test_id),
            })),
            ...selectedReports
              .filter(
                (key) =>
                  !labTests.some((test) => String(test.lab_test_id) === key)
              )
              .map((key) => ({ label: key, value: key, hint: "Custom" })),
          ]}
          value={selectedReports}
          onValueChange={handleReportsChange}
          onCreateOption={selectReportTest}
          createLabel="Use"
          placeholder="Select or type test(s)"
        />

        {/* DATE / RESULT / IMPRESSION per selected test (encounter_report). */}

        {selectedReports.length > 0 && (
          <div className="flex w-full flex-col gap-3 pt-1">

            {selectedReports.map((key) => (
              <div
                key={key}
                className="flex flex-col gap-2 rounded-md border border-slate-200 bg-slate-50 p-3"
              >

                <div className="text-[10px] uppercase leading-[15px] tracking-[0.5px] text-slate-500">
                  {reportTestName(key)}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase leading-[15px] tracking-[0.5px] text-slate-800">
                    Date
                  </label>
                  <input
                    type="date"
                    value={reportDetails[key]?.date ?? ""}
                    onChange={(event) =>
                      updateReportDetail(key, { date: event.target.value })
                    }
                    className="h-[38px] w-full rounded-md border border-slate-200 bg-white px-[13px] text-[10px] leading-5 text-slate-700 outline-none focus:border-slate-400"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase leading-[15px] tracking-[0.5px] text-slate-800">
                    Enter Result
                  </label>
                  <VoiceToText
                    value={reportDetails[key]?.result ?? ""}
                    onChange={(text) => updateReportDetail(key, { result: text })}
                    placeholder="Type the result..."
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase leading-[15px] tracking-[0.5px] text-slate-800">
                    Enter Impression
                  </label>
                  <VoiceToText
                    value={reportDetails[key]?.impression ?? ""}
                    onChange={(text) =>
                      updateReportDetail(key, { impression: text })
                    }
                    placeholder="Type the impression..."
                  />
                </div>

              </div>
            ))}

          </div>
        )}

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

        <label className="text-[10px] uppercase leading-4 text-slate-800">
          Past History
        </label>

        {/* treatment_type_master; "+ Add" adds a new type to it. */}
        <MultiSelectDropdown
          options={withSelected(
            treatmentTypeOptions.map((option) => option.name),
            selectedTreatmentTypes
          )}
          value={selectedTreatmentTypes}
          onValueChange={handleTreatmentTypesChange}
          onCreateOption={(typed) =>
            addMasterOption(
              () => consultationApi.createCustomTreatmentType({ name: typed }),
              setTreatmentTypeOptions,
              selectTreatmentType,
              "treatment type"
            )
          }
          placeholder="Select treatment(s)"
        />

        {/* DATE / BRIEF NOTE / TREATMENT RESPONSE per selected treatment
            (encounter_past_treatment). */}

        {selectedTreatmentTypes.length > 0 && (
          <div className="flex w-full flex-col gap-3 pt-1">

            {selectedTreatmentTypes.map((name) => (
              <div
                key={name}
                className="flex flex-col gap-2 rounded-md border border-slate-200 bg-slate-50 p-3"
              >

                <div className="text-[10px] uppercase leading-[15px] tracking-[0.5px] text-slate-500">
                  {name}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase leading-[15px] tracking-[0.5px] text-slate-800">
                    Date
                  </label>
                  <input
                    type="date"
                    value={treatmentDetails[name]?.date ?? ""}
                    onChange={(event) =>
                      updateTreatmentDetail(name, { date: event.target.value })
                    }
                    className="h-[38px] w-full rounded-md border border-slate-200 bg-white px-[13px] text-[10px] leading-5 text-slate-700 outline-none focus:border-slate-400"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase leading-[15px] tracking-[0.5px] text-slate-800">
                    Enter Brief Note
                  </label>
                  <VoiceToText
                    value={treatmentDetails[name]?.note ?? ""}
                    onChange={(text) => updateTreatmentDetail(name, { note: text })}
                    placeholder="Type a brief note..."
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase leading-[15px] tracking-[0.5px] text-slate-800">
                    Treatment Response
                  </label>
                  <VoiceToText
                    value={treatmentDetails[name]?.response ?? ""}
                    onChange={(text) =>
                      updateTreatmentDetail(name, { response: text })
                    }
                    placeholder="Type the treatment response..."
                  />
                </div>

              </div>
            ))}

          </div>
        )}

        <VoiceToText
          value={pastHistory}
          onChange={(text) => setPastHistory(text)}
          placeholder="Type the patient's past history..."
        />

      </div>

      {/* MOLECULAR TESTING */}

      <div className="flex flex-col gap-2">

        <label className="text-[10px] uppercase leading-4 text-slate-800">
          Molecular Testing
        </label>

        {/* Not in the list: the typed name is used for this patient only. */}
        <MultiSelectDropdown
          options={withSelected(molecularTestOptions, selectedMolecularTests)}
          value={selectedMolecularTests}
          onValueChange={handleMolecularTestsChange}
          onCreateOption={selectMolecularTest}
          createLabel="Use"
          placeholder="Select or type test(s)"
        />

        {/* DATE / RESULT / IMPRESSION per selected test
            (encounter_molecular_test). */}

        {selectedMolecularTests.length > 0 && (
          <div className="flex w-full flex-col gap-3 pt-1">

            {selectedMolecularTests.map((name) => (
              <div
                key={name}
                className="flex flex-col gap-2 rounded-md border border-slate-200 bg-slate-50 p-3"
              >

                <div className="text-[10px] uppercase leading-[15px] tracking-[0.5px] text-slate-500">
                  {name}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase leading-[15px] tracking-[0.5px] text-slate-800">
                    Date
                  </label>
                  <input
                    type="date"
                    value={molecularTestDetails[name]?.date ?? ""}
                    onChange={(event) =>
                      updateMolecularTestDetail(name, { date: event.target.value })
                    }
                    className="h-[38px] w-full rounded-md border border-slate-200 bg-white px-[13px] text-[10px] leading-5 text-slate-700 outline-none focus:border-slate-400"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase leading-[15px] tracking-[0.5px] text-slate-800">
                    Enter Result
                  </label>
                  <VoiceToText
                    value={molecularTestDetails[name]?.result ?? ""}
                    onChange={(text) =>
                      updateMolecularTestDetail(name, { result: text })
                    }
                    placeholder="Type the result..."
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase leading-[15px] tracking-[0.5px] text-slate-800">
                    Enter Impression
                  </label>
                  <VoiceToText
                    value={molecularTestDetails[name]?.impression ?? ""}
                    onChange={(text) =>
                      updateMolecularTestDetail(name, { impression: text })
                    }
                    placeholder="Type the impression..."
                  />
                </div>

              </div>
            ))}

          </div>
        )}

      </div>

      </div>

    </div>
    </div>
    )}
    </section>

    {/* =================================================
      INVESTIGATIONS
    ================================================= */}

    <section className="flex w-full flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5">

    <button
      type="button"
      onClick={() => toggleSection("investigations")}
      className="flex w-full items-center justify-between gap-2 px-2 py-1.5 border-b border-slate-100"
    >
      <div className="flex items-center gap-2">
        <div className="text-[14px] font-bold uppercase leading-7 text-slate-800 tracking-wide">
          Investigations / Scans
        </div>
        {selectedInvestigations.length > 0 && (
          <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-semibold leading-4 text-blue-700">
            {selectedInvestigations.length} selected
          </span>
        )}
      </div>
      <ChevronDown
        className={cn(
          "h-4 w-4 shrink-0 transition-transform duration-200",
          expandedSections.investigations && "rotate-180",
        )}
      />
    </button>
    {expandedSections.investigations && (
      <div className="pt-4">

    {labTestsLoading && (
      <div className="flex items-center gap-2 text-[10px] leading-5 text-slate-500">
        Loading investigations...
      </div>
    )}

    {!labTestsLoading && labTestsError && (
      <div className="flex w-full flex-col gap-1 rounded-md border border-red-200 bg-red-50 p-3">
        <div className="text-[10px] font-medium leading-4 text-red-700">
          {labTestsError}
        </div>
      </div>
    )}

    {!labTestsLoading && !labTestsError &&
      investigations.length === 0 &&
      customInvestigations.length === 0 && (
      <div className="flex items-center gap-2 text-[10px] leading-5 text-slate-500">
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
      className="h-[38px] rounded-md border-slate-200 text-[10px] shadow-none"
    />
    )}

    {!labTestsLoading && !labTestsError && (
      <div className="flex w-full flex-col gap-1.5">
        <div className="flex w-full flex-wrap items-start gap-1.5">
          {!otherInvestigationExpanded && (
            <button
              type="button"
              onClick={() => setOtherInvestigationExpanded(true)}
              className="flex h-[26px] items-center rounded border border-slate-200 bg-slate-50 px-[9px] py-[3px] text-[10px] leading-4 text-slate-500 transition hover:bg-slate-100"
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
              className="h-7 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-[10px] leading-4 text-slate-600 outline-none focus:border-slate-400"
            />
            <button
              type="button"
              onClick={addOtherInvestigation}
              disabled={!otherInvestigationName.trim()}
              className="h-7 shrink-0 rounded-md border border-blue-600 bg-white px-3 text-[10px] font-semibold leading-4 text-blue-600 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                setOtherInvestigationName("");
                setOtherInvestigationExpanded(false);
              }}
              className="h-7 shrink-0 rounded-md border border-slate-200 bg-white px-2 text-[10px] leading-4 text-slate-500 transition hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        )}

      </div>
    )}

    {selectedInvestigations.length > 0 && (
      <div className="flex w-full flex-col gap-2.5 pt-1">

        {selectedInvestigations.map((investigation, index) => (
          <InvestigationOrderCard
            key={investigation}
            index={index}
            name={investigation}
            detail={investigationDetail(investigation)}
            showMethod={isMolecularTest(investigation)}
            onChange={(patch) =>
              updateInvestigationDetail(investigation, patch)
            }
            onRemove={() =>
              handleInvestigationsChange(
                selectedInvestigations.filter((name) => name !== investigation)
              )
            }
          />
        ))}

      </div>
    )}

    <div className="flex w-full flex-col gap-2 pt-2">

      <label className="text-[10px] uppercase leading-4 text-slate-800">
        Additional Instructions (if any)
      </label>

      <VoiceToText
        value={additionalInstructions}
        onChange={(text) => setAdditionalInstructions(text)}
        placeholder="Enter any special instructions for the selected investigations"
      />

    </div>
    </div>
    )}
    </section>

    {/* =================================================
      ADVICE (OPD PRESCRIPTION)
    ================================================= */}

    <AdviceSection
      ref={adviceSectionRef}
      encounter={encounter}
      patientId={consultationState?.patientId}
      onToast={showToast}
      expanded={expandedSections.advice}
      onToggle={() => toggleSection("advice")}
    />

    {/* =================================================
      ACTION BUTTONS
    ================================================= */}

    {/* The visit's printout lives on the Summary step ("Add To Print"). */}
    <div className="flex w-full items-center justify-end">

    {/* RIGHT ACTIONS */}

    <div className="flex items-start gap-2.5">

      {/* CANCEL */}

      <button
        onClick={cancelConsultation}
        className="flex h-9 w-fit items-center justify-center rounded-lg border border-slate-300 bg-white px-[25px] py-[9px] text-[10px] font-bold leading-5 text-slate-600"
      >
        Cancel
      </button>

      {/* DRAFT */}

      <button
        onClick={saveDraft}
        className="flex h-9 w-fit items-center justify-center rounded-lg border border-blue-200 bg-white px-[25px] py-[9px] text-[10px] font-bold leading-5 text-blue-600 "
      >
        Save as Draft
      </button>

      {/* NEXT */}

      <button
        onClick={proceedNext}
        disabled={proceeding}
        className="flex h-9 w-[213px] items-center justify-center gap-2 rounded-lg border-0 bg-blue-700 px-[25px] py-[9px] text-[10px] font-bold leading-5 text-white disabled:cursor-not-allowed disabled:opacity-60"
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
