import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  Droplet,
  Gauge,
  HeartPulse,
  PersonStanding,
  Ruler,
  Thermometer,
  Weight,
} from "lucide-react";
import { employeeApi } from "../../api/employee.api";
import { getUser } from "../../utils/token";
import { computeBmi, computeBsa } from "../../utils/vitals";
import { patientApi, type PatientRecord } from "../../api/patient.api";
import { encounterApi, type EncounterRecord } from "../../api/encounter.api";
import {
  labTestMasterApi,
  type LabTestMasterRecord,
} from "../../api/labTestMaster.api";
import { useCriticalPatients } from "../../hooks/useCriticalPatients";
import { BellNotificationButton } from "@/components/hms/BellNotificationButton";
import { UserProfileDropdown } from "../../components/ui/User_profile_dropdown";
import ConsultationStep from "./consultation/ConsultationStep";
import LabReview from "./consultation/LabReview";
import Diagnosis from "./consultation/Diagnosis";
import TreatmentPlan from "./consultation/TreatmentPlan";
import ChemotherapyOrder from "./consultation/ChemotherapyOrder";
import DischargeMedication from "./consultation/DischargeMedication";
import FollowUp from "./consultation/FollowUp";
import Summary from "./consultation/Summary";
import type {
  ConsultationState,
  InvestigationOrderDetail,
  MeasurementValues,
} from "./consultation/types";
import { findActiveEncounter, formatDateDMY } from "./consultation/helpers";

type ToastMessage = string;

const StepCheckLogo = ({ active = false }: { active?: boolean }) => (
  <svg
    className="h-6 w-6"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M11.9984 21.5984C17.2968 21.5984 21.5984 17.2968 21.5984 11.9984C21.5984 6.70005 17.2968 2.39844 11.9984 2.39844C6.70005 2.39844 2.39844 6.70005 2.39844 11.9984C2.39844 17.2968 6.70005 21.5984 11.9984 21.5984ZM16.4468 10.4468C16.9016 9.97598 16.8951 9.22754 16.4322 8.76466C15.9693 8.30177 15.2209 8.29527 14.75 8.75004L10.7984 12.7016L9.24684 11.15C8.77598 10.6953 8.02754 10.7018 7.56466 11.1647C7.10177 11.6275 7.09527 12.376 7.55004 12.8468L9.95004 15.2468C10.4186 15.7153 11.1782 15.7153 11.6468 15.2468L16.4468 10.4468Z"
      className={active ? "fill-green-500" : "fill-slate-400"}
    />
  </svg>
);

/* ============================================================
   LATEST VITALS / MEASUREMENTS
   Height, weight, BSA and BMI shown across the consult page
   sidebars are read from the active encounter record (triage
   vitals land on the same encounter via VitalsSignsPopover).
   ============================================================ */

const vitalNum = (
  value: number | string | null | undefined
): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
};

/* Pastel icon badges, matching the admin-side PatientVitalsPanel. */
type VitalTone = "danger" | "warning" | "success" | "purple" | "accent";

const VITAL_TONE_BADGE: Record<VitalTone, string> = {
  danger: "bg-[#FBEAE9] text-[#B5433E]",
  warning: "bg-[#FCF1DD] text-[#A8720F]",
  success: "bg-[#E7F4EE] text-[#2E7D5B]",
  purple: "bg-[#EEECF7] text-[#5A4E9C]",
  accent: "bg-[#E6F1F5] text-[#1D6E8C]",
};

/* ------------------------------------------------------------
   VITAL SEVERITY
   Normal (green) / Moderate (orange) / Critical (red). The BP,
   pulse, SpO2 and temperature bands match PatientVitalsPanel so
   doctor and admin sides agree. A vital with no severity (height,
   weight, BSA, or no reading) keeps its neutral tone.
------------------------------------------------------------ */

type VitalSeverity = "normal" | "moderate" | "critical";

const SEVERITY_BADGE: Record<VitalSeverity, string> = {
  normal: "bg-green-50 text-green-600",
  moderate: "bg-orange-50 text-orange-500",
  critical: "bg-red-50 text-red-600",
};

const SEVERITY_TEXT: Record<VitalSeverity, string> = {
  normal: "text-green-700",
  moderate: "text-orange-600",
  critical: "text-red-600",
};

const inRange = (value: number, low: number, high: number) =>
  value >= low && value <= high;

/* Green inside the normal band, orange inside the wider moderate band,
   red outside both. */
const bandSeverity = (
  value: number,
  normalLow: number,
  normalHigh: number,
  moderateLow: number,
  moderateHigh: number
): VitalSeverity =>
  inRange(value, normalLow, normalHigh)
    ? "normal"
    : inRange(value, moderateLow, moderateHigh)
      ? "moderate"
      : "critical";

const worstSeverity = (levels: VitalSeverity[]): VitalSeverity | undefined =>
  levels.includes("critical")
    ? "critical"
    : levels.includes("moderate")
      ? "moderate"
      : levels[0];

/* Reads the number out of a formatted measurement ("72 bpm" -> 72). */
const readingNum = (text: string): number | null => {
  const parsed = parseFloat(text);
  return Number.isFinite(parsed) ? parsed : null;
};

const bpSeverity = (bp: string): VitalSeverity | undefined => {
  const [systolic, diastolic] = bp.split("/").map(readingNum);
  const levels: VitalSeverity[] = [];
  if (systolic != null) levels.push(bandSeverity(systolic, 90, 119, 120, 139));
  if (diastolic != null) levels.push(bandSeverity(diastolic, 60, 79, 80, 89));
  return worstSeverity(levels);
};

const pulseSeverity = (pulse: number) => bandSeverity(pulse, 60, 100, 101, 110);

const spo2Severity = (spo2: number): VitalSeverity =>
  spo2 < 90 ? "critical" : spo2 < 95 ? "moderate" : "normal";

const temperatureSeverity = (celsius: number): VitalSeverity =>
  celsius >= 38 || celsius < 35.5
    ? "critical"
    : celsius > 37.2 || celsius < 36.1
      ? "moderate"
      : "normal";

/* BMI: 18.5-24.9 normal, 17-18.4 / 25-29.9 moderate, else critical. */
const bmiSeverity = (bmi: number) => bandSeverity(bmi, 18.5, 24.9, 17, 29.9);

/* Pain (0-10): 0-3 normal, 4-6 moderate, 7-10 critical. */
const painSeverity = (pain: number): VitalSeverity =>
  pain >= 7 ? "critical" : pain >= 4 ? "moderate" : "normal";

const severityOf = (
  text: string,
  rate: (value: number) => VitalSeverity
): VitalSeverity | undefined => {
  const value = readingNum(text);
  return value === null ? undefined : rate(value);
};

const buildMeasurements = (
  encounter: EncounterRecord | null | undefined,
  recentEncounters: EncounterRecord[] = []
): MeasurementValues => {
    const getField = (field: keyof EncounterRecord) => {
    // Prefer active encounter
    const activeVal = (encounter as any)?.[field];
    if (activeVal != null && activeVal !== "") return vitalNum(activeVal);
    // Fallback to recent encounters per-field
    for (const enc of recentEncounters) {
      const v = (enc as any)?.[field];
      if (v != null && v !== "") {
        const n = vitalNum(v);
        if (n !== null) return n;
      }
    }
    return null;
  };

  const height = getField("height");
  const weight = getField("weight");
  const systolic = getField("systolic_bp");
  const diastolic = getField("diastolic_bp");
  const pulse = getField("pulse");
  const temp = getField("temperature");
  const spo2 = getField("spo2");
  const painScore = getField("pain_score");
  const bmiStored = getField("BMI");

  const bsaValue = computeBsa(height, weight);
  const bmi =
    bmiStored !== null
      ? String(bmiStored)
      : String(computeBmi(height, weight) ?? "");

  const bp =
    systolic !== null && diastolic !== null
      ? `${systolic}/${diastolic}`
      : "";

  return {
    height: height !== null ? `${height} cm` : "",
    weight: weight !== null ? `${weight} kg` : "",
    bsa: bsaValue !== null ? `${bsaValue} m²` : "",
    bmi,
    bp,
    pulse: pulse !== null ? `${pulse} bpm` : "",
    temp: temp !== null ? `${temp} °C` : "",
    spo2: spo2 !== null ? `${spo2}%` : "",
    painScore: painScore !== null ? `${painScore}/10` : "",
  };
};

const Consultation: React.FC = () => {
  /* ============================================================
     STATE
  ============================================================ */

  const [toast, setToast] = useState<ToastMessage>("");
  const [userAvatarUrl, setUserAvatarUrl] = useState<string>(() => localStorage.getItem("user_photo") || "");
  const [avatarLoading, setAvatarLoading] = useState<boolean>(() => !localStorage.getItem("user_photo"));

  const [selectedInvestigations, setSelectedInvestigations] = useState<
    string[]
  >([]);
  /* Per-test notes / priority / target date (keyed by test name) and the
     Additional Instructions: entered in Consultation, sent by Lab Review on
     the lab_order_item rows and the lab_order. */
  const [investigationDetails, setInvestigationDetails] = useState<
    Record<string, InvestigationOrderDetail>
  >({});
  const [investigationInstructions, setInvestigationInstructions] =
    useState("");

  const [labTests, setLabTests] = useState<LabTestMasterRecord[]>([]);
  const [labTestsLoading, setLabTestsLoading] = useState(true);
  const [labTestsError, setLabTestsError] = useState("");

  const [showLabReview, setShowLabReview] = useState(false);
  const [activeStep, setActiveStep] = useState("CONSULTATION");
  const [tabsHovered, setTabsHovered] = useState(false);
  const tabsScrollRef = useRef<HTMLDivElement>(null);

  const slideTabs = (direction: 1 | -1) => {
    const el = tabsScrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * 298.66, behavior: "smooth" });
  };

  const STEP_ORDER = [
    "CONSULTATION",
    "LAB REPORT REVIEW",
    "DIAGNOSIS",
    "TREATMENT PLAN",
    "CHEMOTHERAPY ORDER",
    "DISCHARGE MEDICATION",
    "FOLLOW UP",
    "SUMMARY",
  ];

  const DIRECT_ACCESS_STEPS = [
    "DISCHARGE MEDICATION",
    "CHEMOTHERAPY ORDER",
    "FOLLOW UP",
    "DIAGNOSIS",
  ];

  const [completedSteps, setCompletedSteps] = useState<Set<string>>(
    () => new Set(["CONSULTATION", "LAB REPORT REVIEW"])
  );

  const markStepCompleted = (stepName: string): Set<string> => {
    const next = new Set(completedSteps);
    next.add(stepName);
    setCompletedSteps(next);
    return next;
  };

  const [orderedTestIds, setOrderedTestIds] = useState<Set<string>>(
    new Set()
  );

  /* ============================================================
     PATIENT DATA (from dashboard appointment click)
  ============================================================ */

  const location = useLocation();
  const navigate = useNavigate();
  const consultationState = location.state as ConsultationState | null;

  const [patient, setPatient] = useState<PatientRecord | null>(null);
  const [patientError, setPatientError] = useState("");

  const [encounter, setEncounter] = useState<EncounterRecord | null>(null);
  const [encounterError, setEncounterError] = useState("");
  const [recentEncounters, setRecentEncounters] = useState<EncounterRecord[]>([]);

  const patientAgeData = useMemo(() => {
    if (!patient) return [];
    return [{ patientId: patient.patient_id || "", age: patient.patient_age, dob: patient.patient_dob }];
  }, [patient]);
  const { getCriticalInfo } = useCriticalPatients(patientAgeData);
  const patientCriticalInfo = useMemo(() => {
    if (!patient) return { isCritical: false, reasons: [] as string[] };
    return getCriticalInfo(patient.patient_id || "");
  }, [patient, getCriticalInfo]);

  useEffect(() => {
    let mounted = true;
    const fetchAvatar = () => {
      employeeApi
        .getMe()
        .then((res) => {
          if (!mounted) return;
          const url = res.data?.data?.employee?.employee_photo_URL || "";
          setUserAvatarUrl(url);
          if (url) localStorage.setItem("user_photo", url);
          else localStorage.removeItem("user_photo");
          setAvatarLoading(false);
        })
        .catch(() => {
          if (mounted) setAvatarLoading(false);
        });
    };
    fetchAvatar();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const patientId = consultationState?.patientId;
    if (!patientId) return;
    let cancelled = false;
    setPatientError("");
    patientApi
      .getById(patientId)
      .then((response) => {
        if (cancelled) return;
        setPatient(response.data.data);
      })
      .catch((error) => {
        console.error("Failed to load patient:", error);
        if (!cancelled) {
          const message =
            error?.response?.data?.message ||
            error?.message ||
            "Failed to load patient data.";
          setPatientError(message);
          showToast(message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [consultationState?.patientId]);

  /* ============================================================
     LOAD ACTIVE ENCOUNTER
     Resolve the current open encounter for the consulted patient so
     the Clinical Details section can read/save encounter-specific
     (ECOG, symptoms) and patient-level (allergies, comorbidities)
     data. Only encounters belonging to the opened patient are used.
  ============================================================ */

  useEffect(() => {
    const patientId = consultationState?.patientId;
    if (!patientId) {
      setRecentEncounters([]);
      return;
    }
    let cancelled = false;
    setEncounterError("");
    findActiveEncounter(
      patientId,
      consultationState?.appointmentId,
      consultationState?.branchId,
    )
      .then(({ encounter: current, scopeError }) => {
        if (cancelled) return;
        setEncounter(current);
        if (!current) {
          setEncounterError(
            scopeError ||
              "No active encounter found for this patient. Clinical details cannot be loaded.",
          );
        }
      })
      .catch((error) => {
        console.error("Failed to load encounter:", error);
        if (!cancelled) {
          const message =
            error?.response?.data?.message ||
            error?.message ||
            "Failed to load encounter data.";
          setEncounterError(message);
        }
      });

    // Load recent encounters for per-field vitals fallback
    const loadRecent = async () => {
      try {
        const response = await encounterApi.getLatest(patientId, 10);
        const rows = [...(response.data?.data?.encounters ?? [])].sort(
          (a, b) =>
            new Date(b.created_at ?? 0).getTime() -
            new Date(a.created_at ?? 0).getTime()
        );
        if (!cancelled) setRecentEncounters(rows);
      } catch (e) {
        // Fallback to scoped list
        try {
          const response = await encounterApi.getAll({ patientId, limit: 10 });
          const rows = [...(response.data?.data?.encounters ?? [])].sort(
            (a, b) =>
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime()
          );
          if (!cancelled) setRecentEncounters(rows);
        } catch {
          if (!cancelled) setRecentEncounters([]);
        }
      }
    };
    loadRecent();

    return () => {
      cancelled = true;
    };
  }, [consultationState?.patientId, consultationState?.appointmentId]);

  /* ============================================================
     LOAD INVESTIGATION OPTIONS (lab_test_master table)
     Populates the Investigations / Scans checkboxes from the
     backend GET /lab-test-master API.
   ============================================================ */

  useEffect(() => {
    let cancelled = false;
    setLabTestsLoading(true);
    setLabTestsError("");
    labTestMasterApi
      .getAll()
      .then((response) => {
        if (cancelled) return;
        setLabTests(response.data.data ?? []);
      })
      .catch((error) => {
        console.error("Failed to load lab tests:", error);
        if (!cancelled) {
          const message =
            error?.response?.data?.message ||
            error?.message ||
            "Failed to load investigation options.";
          setLabTestsError(message);
        }
      })
      .finally(() => {
        if (!cancelled) setLabTestsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const patientName = patient
    ? [
        patient.patient_first_name,
        patient.patient_middle_name,
        patient.patient_last_name,
      ]
        .filter(Boolean)
        .join(" ")
    : "";

  const patientPhoto = patient?.patient_photo_url || "";

  const patientAgeSex = patient
    ? `${patient.patient_age ?? ""} Y / ${patient.patient_gender ?? ""}`
    : "";

  const patientDisplayId = patient?.patient_id || "";

  const patientPhone = patient?.patient_primary_mobile || "";

  const patientEmail = patient?.patient_email || "";

  const [visitDate, setVisitDate] = useState(
    formatDateDMY(consultationState?.appointmentDate)
  );

  /* ============================================================
     LATEST VITALS (from the active encounter record)
  ============================================================ */

  const measurements = useMemo(() => buildMeasurements(encounter, recentEncounters), [encounter, recentEncounters]);

  const measurementTiles: {
    label: string;
    icon: typeof Ruler;
    tone: VitalTone;
    value: string;
    severity?: VitalSeverity;
  }[] = [
    { label: "Height", icon: Ruler, tone: "accent", value: measurements.height },
    { label: "Weight", icon: Weight, tone: "accent", value: measurements.weight },
    { label: "BSA", icon: PersonStanding, tone: "accent", value: measurements.bsa },
    {
      label: "BMI",
      icon: Gauge,
      tone: "accent",
      value: measurements.bmi,
      severity: severityOf(measurements.bmi, bmiSeverity),
    },
    {
      label: "Blood Pressure",
      icon: Droplet,
      tone: "danger",
      value: measurements.bp ? `${measurements.bp} mmHg` : "",
      severity: bpSeverity(measurements.bp),
    },
    {
      label: "Pulse",
      icon: HeartPulse,
      tone: "danger",
      value: measurements.pulse,
      severity: severityOf(measurements.pulse, pulseSeverity),
    },
    {
      label: "Temperature",
      icon: Thermometer,
      tone: "warning",
      value: measurements.temp,
      severity: severityOf(measurements.temp, temperatureSeverity),
    },
    {
      label: "SPO2",
      icon: Activity,
      tone: "success",
      value: measurements.spo2,
      severity: severityOf(measurements.spo2, spo2Severity),
    },
    /* Pain Score is only shown once it has been recorded. */
    ...(measurements.painScore && measurements.painScore !== "—"
      ? [
          {
            label: "Pain Score",
            icon: Activity,
            tone: "purple" as VitalTone,
            value: measurements.painScore,
            severity: severityOf(measurements.painScore, painSeverity),
          },
        ]
      : []),
  ];

  /* ============================================================
     TOAST
  ============================================================ */

  const showToast = (message: string) => {
    setToast(message);

    window.setTimeout(() => {
      setToast("");
    }, 2200);
  };

  /* ============================================================
     BACK
  ============================================================ */

  const goBack = () => {
    navigate("/doctor-dashboard");
  };

  /* ============================================================
     STEP
  ============================================================ */

  const selectStep = (name: string, completedOverride?: Set<string>) => {
    const currentIndex = STEP_ORDER.indexOf(activeStep);
    const targetIndex = STEP_ORDER.indexOf(name);
    const checkComplete = completedOverride ?? completedSteps;

    if (targetIndex > currentIndex && !DIRECT_ACCESS_STEPS.includes(name)) {
      for (let i = currentIndex; i < targetIndex; i++) {
        if (!checkComplete.has(STEP_ORDER[i])) {
          showToast(
            "Please select or enter the important field in the previous form."
          );
          return;
        }
      }
    }

    setActiveStep(name);

    if (name === "LAB REPORT REVIEW") {
      setShowLabReview(true);
      return;
    }

    setShowLabReview(false);
    if (name !== activeStep) showToast(name);
  };

  /* Selected tests that have not been placed as lab_order_items yet.
     LabReview places these automatically when it opens. */

  const pendingLabTests = labTests.filter(
    (test) =>
      selectedInvestigations.includes(test.test_name) &&
      !orderedTestIds.has(test.lab_test_id)
  );

  const handleTestsOrdered = useCallback((testIds: string[]) => {
    setOrderedTestIds((prev) => {
      const next = new Set(prev);
      testIds.forEach((id) => next.add(id));
      return next;
    });
  }, []);

  /* ============================================================
     STEPS
  ============================================================ */

  const steps = [
    {
      name: "CONSULTATION",
      active: activeStep === "CONSULTATION",
      icon: <StepCheckLogo />,
    },
    {
      name: "LAB REPORT REVIEW",
      active: activeStep === "LAB REPORT REVIEW",
      icon:<StepCheckLogo />,
    },
    {
      name: "DIAGNOSIS",
      active: activeStep === "DIAGNOSIS",
      icon: <StepCheckLogo />,
        
    },
    {
      name: "TREATMENT PLAN",
      active: activeStep === "TREATMENT PLAN",
      icon: <StepCheckLogo />,
       
    },
    {
      name: "CHEMOTHERAPY ORDER",
      active: activeStep === "CHEMOTHERAPY ORDER",
       icon: <StepCheckLogo />,
    },
   
    {
      name: "DISCHARGE MEDICATION",
      active: activeStep === "DISCHARGE MEDICATION",
      icon: <StepCheckLogo />,
    },
    {
      name: "FOLLOW UP",
      active: activeStep === "FOLLOW UP",
      icon: <StepCheckLogo />,
    },
    {
      name: "SUMMARY",
      active: activeStep === "SUMMARY",
       icon: <StepCheckLogo />,

    },
    
  ];

  /* ============================================================
     JSX
  ============================================================ */

  return (
    <div className="min-h-screen w-full bg-slate-50 font-[Inter,sans-serif] text-slate-700 antialiased">

      {/* ========================================================
          APP
      ======================================================== */}

      <div className="mx-auto w-full bg-slate-50">

        <div className="relative flex w-full border border-slate-200 bg-slate-50">

          {/* ====================================================
              MAIN
          ==================================================== */}

          <main className="relative flex min-w-0 flex-1 flex-col bg-slate-50">

            {/* Top bar, patient details and step tabs stay pinned while the
                step content scrolls underneath. */}

            <div className="sticky top-0 z-30">

              {/* ==================================================
                  HEADER
              ================================================== */}

              <header className="z-30 flex h-16 w-full shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">

                <div className="flex items-center gap-4">

                  <button
                    onClick={goBack}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-transparent p-2 transition hover:bg-slate-50"
                  >

                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#334155"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-5 w-5"
                    >
                      <path d="M19 12H5" />
                      <path d="m12 19-7-7 7-7" />
                    </svg>

                  </button>

                  <div className="text-lg font-bold leading-7 text-slate-800">
                    Patients
                  </div>

                </div>

                <div className="flex items-center gap-6">

                  {/* NOTIFICATION (Global) */}

                  <BellNotificationButton size="md" />

                  {/* USER */}

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

              {/* ==================================================
                  PATIENT HEADER
              ================================================== */}

              <section className="w-full bg-slate-50">

                <div className="flex w-full flex-col gap-5">

                  <section className="flex w-full flex-col gap-5 bg-white p-5">

                    <div className="flex w-full items-center justify-between gap-4">

                      <div className="relative shrink-0">
                        <img
                          src={patientPhoto}
                          alt={patientName}
                          className={`h-20 w-20 rounded-full border-4 object-cover shadow-sm ${patientCriticalInfo.isCritical ? "border-red-500 animate-pulse" : "border-white"}`}
                        />
                        {patientCriticalInfo.isCritical && (
                          <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-red-500" />
                        )}
                      </div>

                      <div className="min-w-0">

                        <div className="mb-1 flex min-w-0 items-center space-x-2">

                          <h2 className="truncate text-xl font-bold leading-7 text-[#1e293b]">
                            {patientName}
                          </h2>
                          {patientCriticalInfo.isCritical && (
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500 animate-pulse" />
                          )}

                          <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-[#64748b]">
                            {patientDisplayId}
                          </span>

                        </div>

                        <div className="flex min-w-0 items-center space-x-2 text-sm leading-5 text-[#64748b]">

                          <span className="truncate">{patientAgeSex}</span>

                          <span className="h-1 w-1 shrink-0 rounded-full bg-slate-300" />

                          <span className="shrink-0 font-semibold text-[#1d4ed8]">
                            —
                          </span>

                        </div>

                      </div>

                     {/* PHONE + EMAIL (vertical stack) */}

                      <div className="flex flex-col gap-1">

                        <div className="flex items-center gap-2">

                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          className="h-4 w-4 shrink-0 text-slate-400"
                        >
                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                        </svg>

                        <div className="flex flex-col">

                          <div className="text-[10px] font-bold leading-[15px] tracking-[0.5px] text-slate-400">
                            PHONE
                          </div>

                          <div className="whitespace-nowrap text-sm font-medium leading-5 text-slate-700">
                            {patientPhone}
                          </div>

                        </div>

                      </div>

                        {/* EMAIL */}

                        <div className="flex items-center gap-2">

                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          className="h-4 w-4 shrink-0 text-slate-400"
                        >
                          <rect
                            x="3"
                            y="5"
                            width="18"
                            height="14"
                            rx="2"
                          />

                          <path d="m3 7 9 6 9-6" />
                        </svg>

                        <div className="flex flex-col">

                          <div className="text-[10px] font-bold leading-[15px] tracking-[0.5px] text-slate-400">
                            EMAIL
                          </div>

              <div className="whitespace-normal break-all text-sm font-medium leading-5 text-slate-700">
                          {patientEmail}
                        </div>

                        </div>

                      </div>

                      </div>

                      {/* MEASUREMENTS
                          Same tile style as the admin-side PatientVitalsPanel:
                          pastel circular icon, muted label, bold reading. */}

                      <div className="grid grid-cols-5 gap-x-6 gap-y-4">

                        {measurementTiles.map((tile) => {
                          const Icon = tile.icon;
                          return (
                            <div key={tile.label} className="flex items-start gap-3">
                              <div
                                className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                                  tile.severity
                                    ? SEVERITY_BADGE[tile.severity]
                                    : VITAL_TONE_BADGE[tile.tone]
                                }`}
                              >
                                <Icon className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="mb-1 text-xs text-slate-500">
                                  {tile.label}
                                </p>
                                <p
                                  className={`truncate text-sm font-semibold ${
                                    tile.severity
                                      ? SEVERITY_TEXT[tile.severity]
                                      : "text-slate-900"
                                  }`}
                                >
                                  {tile.value || "—"}
                                </p>
                              </div>
                            </div>
                          );
                        })}

                      </div>

                      {/* PROFILE */}

                      <button
                        onClick={() => {
                          const pid = consultationState?.patientId;
                          if (pid) {
                            localStorage.setItem("hms_last_viewed_patient_id", pid);
                          }
                          navigate("/doctor/patient-details", {
                            state: { patientId: pid },
                          });
                        }}
                        className="h-9 rounded-md border border-blue-600 bg-white px-4 text-sm font-semibold leading-5 text-blue-600 transition hover:bg-blue-50"
                      >
                        View Full Profile
                      </button>

                    </div>

                  </section>

                </div>

              </section>

              {/* ==================================================
                  STEPS
              ================================================== */}

              <div
                onMouseEnter={() => setTabsHovered(true)}
                onMouseLeave={() => setTabsHovered(false)}
                className="relative z-20 h-[88px] w-full shrink-0 overflow-hidden bg-white"
              >

                <div
                  ref={tabsScrollRef}
                  className="hide-scrollbar ml-0 flex h-[88.5px] w-full overflow-x-auto"
                >

                  {steps.map((step, index) => (

                    <button
                      key={step.name}
                      onClick={() => selectStep(step.name)}
                      className="relative h-[88.5px] w-[298.66px] shrink-0 bg-white"
                    >

                      {/* ICON */}

                      <div className="absolute left-1/2 top-0 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full bg-white">

                        {typeof step.icon === "string" ? (
                          <img
                            src={step.icon}
                            alt=""
                            className="h-6 w-6"
                          />
                        ) : (
                          <StepCheckLogo active={step.active} />
                        )}

                      </div>

                      {/* LABEL */}

                      <div className="absolute left-1/2 top-[47px] -translate-x-1/2 whitespace-nowrap text-[11px] font-bold uppercase leading-[16.5px] tracking-[1.1px] text-gray-800">

                        {step.name}

                      </div>

                      {/* BAR */}

                      <div
                        className={`absolute left-0 right-0 top-[80.5px] h-2 rounded-full ${
                          step.active
                            ? "bg-green-500"
                            : "bg-white"
                        }`}
                      />

                    </button>

                  ))}

                </div>

                {/* FLOATING BACK / NEXT ARROWS (near tabs, hover only) */}

                <div className={`pointer-events-none absolute left-2 top-1/2 z-30 -translate-y-1/2 transition-opacity duration-200 ${tabsHovered ? "pointer-events-auto opacity-100" : "opacity-0"}`}>

                  <button
                    onClick={() => slideTabs(-1)}
                    aria-label="Go back"
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-lg transition hover:bg-slate-50"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-5 w-5"
                    >
                      <path d="M19 12H5" />
                      <path d="m12 19-7-7 7-7" />
                    </svg>
                  </button>

                </div>

                <div className={`pointer-events-none absolute right-2 top-1/2 z-30 -translate-y-1/2 transition-opacity duration-200 ${tabsHovered ? "pointer-events-auto opacity-100" : "opacity-0"}`}>

                  <button
                    onClick={() => slideTabs(1)}
                    aria-label="Go to next tab"
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-lg transition hover:bg-slate-50"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-5 w-5"
                    >
                      <path d="M5 12h14" />
                      <path d="m12 5 7 7-7 7" />
                    </svg>
                  </button>

                </div>

              </div>

            </div>

            {/* ==================================================
                const tabs
            ================================================== */}

            <section className="w-full bg-slate-50 px-[22px] pb-7">

              <div className="flex w-full flex-col gap-5">

                {showLabReview ? (
                  <LabReview
                    embedded
                    patientId={consultationState?.patientId}
                    appointmentId={consultationState?.appointmentId}
                    branchId={consultationState?.branchId}
                    encounterNo={encounter?.encounter_no}
                    pendingTests={pendingLabTests}
                    testDetails={investigationDetails}
                    instructions={investigationInstructions}
                    onOrdered={handleTestsOrdered}
                    onNext={() => { selectStep("DIAGNOSIS", markStepCompleted("LAB REPORT REVIEW")); }}
                  />
                ) : activeStep === "DIAGNOSIS" ? (
                  <Diagnosis
                    embedded
                    patientId={patientDisplayId}
                    appointmentId={consultationState?.appointmentId}
                    encounterNo={encounter?.encounter_no}
                    visitDate={visitDate}
                    onVisitDateChange={setVisitDate}
                    onNext={() => { selectStep("TREATMENT PLAN", markStepCompleted("DIAGNOSIS")); }}
                  />
                ) : activeStep === "TREATMENT PLAN" ? (
                  <TreatmentPlan
                    embedded
                    patientId={patientDisplayId}
                    measurements={measurements}
                    onNext={() => { selectStep("CHEMOTHERAPY ORDER", markStepCompleted("TREATMENT PLAN")); }}
                  />
                ) : activeStep === "CHEMOTHERAPY ORDER" ? (
                  <ChemotherapyOrder
                    embedded
                    patientId={patientDisplayId}
                    measurements={measurements}
                    gender={patient?.patient_gender ?? ""}
                    age={patient?.patient_age ?? null}
                    onNext={() => { selectStep("DISCHARGE MEDICATION", markStepCompleted("CHEMOTHERAPY ORDER")); }}
                  />
                ) : activeStep === "DISCHARGE MEDICATION" ? (
                  <DischargeMedication
                    embedded
                    patientId={consultationState?.patientId}
                    appointmentId={consultationState?.appointmentId}
                    branchId={consultationState?.branchId}
                    encounterNo={encounter?.encounter_no}
                    measurements={measurements}
                    onNext={() => { selectStep("FOLLOW UP", markStepCompleted("DISCHARGE MEDICATION")); }}
                  />
                ) : activeStep === "FOLLOW UP" ? (
                  <FollowUp
                    embedded
                    patientId={patientDisplayId}
                    measurements={measurements}
                    onNext={() => { selectStep("SUMMARY", markStepCompleted("FOLLOW UP")); }}
                  />
) : activeStep === "SUMMARY" ? (
                  <Summary
                    embedded
                    patientId={patientDisplayId}
                    appointmentId={consultationState?.appointmentId}
                    encounterNo={encounter?.encounter_no}
                    measurements={measurements}
                  />
                ) : null}

                {/* Kept mounted (hidden on other steps) so unsaved Consultation
                    input survives switching steps. */}
                <div hidden={activeStep !== "CONSULTATION" || showLabReview}>
                  <ConsultationStep
                    consultationState={consultationState}
                    patient={patient}
                    patientName={patientName}
                    patientDisplayId={patientDisplayId}
                    encounter={encounter}
                    encounterError={encounterError}
                    visitDate={visitDate}
                    onVisitDateChange={setVisitDate}
                    labTests={labTests}
                    labTestsLoading={labTestsLoading}
                    labTestsError={labTestsError}
                    selectedInvestigations={selectedInvestigations}
                    onSelectedInvestigationsChange={setSelectedInvestigations}
                    investigationDetails={investigationDetails}
                    onInvestigationDetailsChange={setInvestigationDetails}
                    investigationInstructions={investigationInstructions}
                    onInvestigationInstructionsChange={setInvestigationInstructions}
                    onToast={showToast}
                    onProceed={() => { selectStep("LAB REPORT REVIEW", markStepCompleted("CONSULTATION")); }}
                  />
                </div>

              </div>

            </section>

          </main>

        </div>

      </div>

      {/* ========================================================
          TOAST
      ======================================================== */}

      <div
        className={`fixed bottom-6 right-6 z-[9999] min-w-[220px] rounded-lg bg-slate-800 px-4 py-3 text-sm text-white shadow-lg transition-all duration-200 ${
          toast
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-5 opacity-0"
        }`}
      >
        {toast}
      </div>

      {/* ========================================================
          PRINT STYLES
      ======================================================== */}

      <style>{`
        @media print {
          body {
            background: white !important;
          }

          button {
            cursor: default !important;
          }

          .fixed {
            display: none !important;
          }
        }
      `}</style>

    </div>
  );
};

export default Consultation;
