import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import API from "../../../api/axios";
import { isChemoPlanClosed } from "../../../api/chemotherapy.api";
import { getUser } from "../../../utils/token";
import { Calendar } from "../../../components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../components/ui/popover";
import { UserProfileDropdown } from "../../../components/ui/User_profile_dropdown";
import VoiceToText from "@/components/ui/voicetotext";
import type { ConsultationState, MeasurementValues } from "./types";
import {
  createChemotherapyPlanForPatient,
  formatPickedDate,
  parsePickedDate,
  toIsoDate,
} from "./helpers";
import {
  ArrowLeftIcon,
  BellIcon,
  CheckIcon,
  ChevronDownIcon,
  DoubleArrowIcon,
  PhoneIcon,
} from "./icons";

/* ============================================================
   TREATMENT PLAN COMPONENT
   (combined from client/pages/doctor/Treatement.tsx 
    TreatmentPlan given the same embedded pattern as
    LabReview / Diagnosis / ChemotherapyOrder,
    icons kept scoped inside the component to avoid colliding
    with the module-level icons defined above,
    original Treatement.tsx file left untouched)
============================================================ */

/* Immediately push a newly selected protocol onto any existing
   chemotherapy plan for the patient. Called by the Treatment Plan
   Protocol dropdown so a switch between already-assigned protocols is
   reflected on the plan (and therefore patient-details) right away,
   not only after the step is saved. */
const syncExistingPlanProtocol = async (
  patientId: string,
  protocolId: string
): Promise<void> => {
  if (!patientId || !protocolId) return;
  try {
    /* Use the mapping-scoped /plans/latest-for-patient endpoint (the same
       one patient-details reads) instead of the branch-scoped list so the
       plan we update is the plan being displayed and multi-branch staff /
       admins don't get a silent 403 that leaves it unchanged. */
    const existing = await API.get<{
      success: boolean;
      data: { chemotherapy_plan_id: string; treatment_status?: string | null } | null;
    }>("/chemotherapy/plans/latest-for-patient", {
      params: { patient_id: patientId },
    });
    const existingPlanId = existing.data.data?.chemotherapy_plan_id;
    /* A completed / discontinued course keeps its protocol; Save starts
       the next course with the new one. */
    if (!existingPlanId || isChemoPlanClosed(existing.data.data)) return;

    /* The server copies the protocol's regimen name / code / cycles. */
    await API.put(`/chemotherapy/plans/${existingPlanId}`, {
      source_protocol_id: protocolId,
    });
  } catch (error: any) {
    console.error(
      "Failed to instantly sync protocol onto existing plan:",
      error?.response?.data?.message ?? error?.message
    );
  }
};

type TreatmentType =
  | "Chemotherapy"
  | "Surgery"
  | "Radiation"
  | "Targeted Therapy"
  | "Immunotherapy"
  | "Radioiodine therapy";

interface RegimenProtocol {
  protocol_id: string;
  regimen_code: string;
  regimen_name: string;
  protocol_version?: string | null;
  cancer_type_id: string;
  subtype_id?: string | null;
  treatment_intent?: string | null;
  standard_cycles?: number | null;
  cycle_interval_days?: number | null;
  guideline_source?: string | null;
  notes?: string | null;
}

const TreatmentPlan: React.FC<{
  embedded?: boolean;
  patientId?: string;
  measurements?: MeasurementValues;
  onNext?: () => void;
  appointmentId?: string;
  encounterNo?: string;
}> = ({ embedded = false, patientId, measurements, onNext, appointmentId, encounterNo }) => {
  const location = useLocation();
  const statePatientId = (
    (location.state as ConsultationState | null)?.patientId ?? ""
  );
  const resolvedPatientId = patientId || statePatientId;

  const [userAvatarUrl, setUserAvatarUrl] = useState<string>(() => localStorage.getItem("user_photo") || "");
  const [avatarLoading, setAvatarLoading] = useState<boolean>(() => !localStorage.getItem("user_photo"));

  const [treatmentIntent, setTreatmentIntent] =
    useState("");

  const [treatmentTypes, setTreatmentTypes] = useState<
    TreatmentType[]
  >([]);

  const [lineOfTherapy, setLineOfTherapy] =
    useState("");

  const [plannedStartDate, setPlannedStartDate] =
    useState("");

  const [protocol, setProtocol] =
    useState("");

  const [remarks, setRemarks] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [protocols, setProtocols] = useState<RegimenProtocol[]>([]);
  const [protocolsLoading, setProtocolsLoading] = useState(false);
  const [protocolsError, setProtocolsError] = useState("");

  const [activeStep, setActiveStep] = useState(2);

  const planDraftKey = `hms_treatment_plan_${resolvedPatientId}`;

  useEffect(() => {
    if (!resolvedPatientId) return;
    const saved = localStorage.getItem(planDraftKey);

    if (!saved) return;

    try {
      const data = JSON.parse(saved) as {
        treatmentIntent?: string;
        treatmentTypes?: TreatmentType[];
        lineOfTherapy?: string;
        plannedStartDate?: string;
        protocol?: string;
        remarks?: string;
      };

      if (data.treatmentIntent) setTreatmentIntent(data.treatmentIntent);
      if (Array.isArray(data.treatmentTypes)) {
        /* Treatment Type is single-select - keep at most one entry. */
        setTreatmentTypes(data.treatmentTypes.slice(0, 1));
      }
      if (data.lineOfTherapy) setLineOfTherapy(data.lineOfTherapy);
      if (data.plannedStartDate) {
        setPlannedStartDate(data.plannedStartDate);
      }
      if (data.protocol) setProtocol(data.protocol);
      if (data.remarks) setRemarks(data.remarks);
    } catch (error) {
      console.error("Failed to restore treatment plan draft:", error);
    }
  }, [planDraftKey, resolvedPatientId]);

  useEffect(() => {
    if (!resolvedPatientId) return;
    localStorage.setItem(
      planDraftKey,
      JSON.stringify({
        treatmentIntent,
        treatmentTypes,
        lineOfTherapy,
        plannedStartDate,
        protocol,
        remarks,
      })
    );
  }, [
    treatmentIntent,
    treatmentTypes,
    lineOfTherapy,
    plannedStartDate,
    protocol,
    remarks,
    planDraftKey,
    resolvedPatientId,
  ]);

  const treatmentOptions: TreatmentType[] = [
    "Chemotherapy",
    "Surgery",
    "Radiation",
    "Targeted Therapy",
    "Immunotherapy",
    "Radioiodine therapy",
  ];

  /* Chemo-specific inputs (Line of Therapy, Planned Start Date,
     Protocol) stay hidden unless Chemotherapy is selected above. */
  const isChemotherapySelected =
    treatmentTypes.includes("Chemotherapy");

  useEffect(() => {
    let cancelled = false;

    const loadRegimenProtocols = async () => {
      /* Every Cancer Type and Histopathology selected in the Diagnosis
         step (older selections only carry the single primary ids). */
      let cancerTypeIds: string[] = [];
      let subtypeIds: string[] = [];

      const saved = localStorage.getItem(
        "hms_diagnosis_selection"
      );

      if (saved) {
        try {
          const selection = JSON.parse(saved) as {
            patient_id?: string;
            cancer_type_id?: string;
            subtype_id?: string;
            cancer_type_ids?: string[];
            subtype_ids?: string[];
          } | null;
          /* The selection key is shared across patients; ignore one that
             was saved for a different patient. */
          const forThisPatient =
            !selection?.patient_id ||
            !resolvedPatientId ||
            selection.patient_id === resolvedPatientId;
          if (selection && forThisPatient) {
            cancerTypeIds = Array.isArray(selection.cancer_type_ids)
              ? selection.cancer_type_ids.filter(Boolean)
              : selection.cancer_type_id
                ? [selection.cancer_type_id]
                : [];
            subtypeIds = Array.isArray(selection.subtype_ids)
              ? selection.subtype_ids.filter(Boolean)
              : selection.subtype_id
                ? [selection.subtype_id]
                : [];
          }
        } catch (error) {
          console.error(
            "Failed to parse diagnosis selection:",
            error
          );
        }
      }

      if (cancerTypeIds.length === 0) {
        setProtocolsError(
          "Cancer type not found. Complete the Diagnosis step first."
        );
        return;
      }

      setProtocolsLoading(true);
      setProtocolsError("");

      try {
        const response = await API.get<{
          success: boolean;
          data: RegimenProtocol[];
        }>("/chemotherapy/regimen-protocols", {
          params: {
            cancer_type_ids: cancerTypeIds.join(","),
            ...(subtypeIds.length > 0
              ? { subtype_ids: subtypeIds.join(",") }
              : {}),
          },
        });

        if (cancelled) return;

        const fetched = response.data?.data ?? [];
        setProtocols(fetched);

        if (fetched.length === 0) {
          setProtocolsError(
            "No protocols found for the selected cancer type and histopathology."
          );
        }
      } catch (error: any) {
        console.error(
          "Failed to load regimen protocols:",
          error
        );
        if (!cancelled) {
          setProtocolsError(
            error?.response?.data?.message ||
              "Failed to load protocols. Please try again."
          );
        }
      } finally {
        if (!cancelled) {
          setProtocolsLoading(false);
        }
      }
    };

    loadRegimenProtocols();

    return () => {
      cancelled = true;
    };
  }, [resolvedPatientId]);

  /* A protocol restored from the draft that no longer matches the current
     Diagnosis selection is kept (downstream steps may already use it) but
     flagged so the doctor re-picks it. */
  const staleProtocol =
    Boolean(protocol) &&
    !protocolsLoading &&
    protocols.length > 0 &&
    !protocols.some((item) => item.protocol_id === protocol);

  const handleNext = async () => {
    if (saving) return;

    if (!resolvedPatientId) {
      setSaveError(
        "Patient is not selected. Open this page from a patient consultation to continue."
      );
      return;
    }

    const hasAnyData =
      treatmentIntent ||
      treatmentTypes.length > 0 ||
      plannedStartDate ||
      protocol ||
      lineOfTherapy ||
      remarks.trim();

    if (!hasAnyData) {
      setSaveError(
        "Please select or enter the important field in the previous form."
      );
      return;
    }

    setSaveError("");
    setSaving(true);

    try {
      const planStartDate =
        toIsoDate(plannedStartDate) ||
        toIsoDate(new Date().toISOString());

      /* The only step that may start a new course once the previous
         plan is completed / discontinued / cancelled. */
      const { error } = await createChemotherapyPlanForPatient(
        resolvedPatientId,
        planStartDate,
        undefined,
        undefined,
        undefined,
        undefined,
        { allowNewCourse: true, encounterNo }
      );

      if (error) {
        setSaveError(error);
        return;
      }

      onNext?.();
    } catch (err: any) {
      console.error("Failed to save treatment plan:", err);
      setSaveError(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to save treatment plan. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    window.history.back();
  };

  const handleViewProfile = () => {
    console.log("View Full Profile clicked");
  };

  /* =========================================================
     ICONS (scoped inside the component to avoid colliding
     with the module-level icons defined above)
  ========================================================= */

  const ArrowLeftIcon = () => (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path
        d="M19 12H5M12 19l-7-7 7-7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  const BellIcon = () => (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path
        d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 21h4"
        strokeLinecap="round"
      />
    </svg>
  );

  const PhoneIcon = () => (
    <svg
      className="mr-2 h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path
        d="M22 16.92v3a2 2 0 0 1-2.18 2
        19.79 19.79 0 0 1-8.63-3.07
        19.5 19.5 0 0 1-6-6
        A19.79 19.79 0 0 1 2.12 4.18
        2 2 0 0 1 4.11 2h3
        a2 2 0 0 1 2 1.72
        c.12.9.33 1.78.62 2.63
        a2 2 0 0 1-.45 2.11L8 9.73
        a16 16 0 0 0 6 6l1.27-1.27
        a2 2 0 0 1 2.11-.45
        c.85.29 1.73.5 2.63.62
        A2 2 0 0 1 22 16.92z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  const EnvelopeIcon = () => (
    <svg
      className="mr-2 h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect
        x="3"
        y="5"
        width="18"
        height="14"
        rx="2"
      />
      <path
        d="m3 7 9 6 9-6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  const CalendarIcon = () => (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <rect
        x="3"
        y="4"
        width="18"
        height="17"
        rx="2"
      />
      <path
        d="M16 2v4M8 2v4M3 10h18"
        strokeLinecap="round"
      />
    </svg>
  );

  const ChevronDownIcon = () => (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path
        d="m6 9 6 6 6-6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  const CheckIcon = () => (
    <svg
      className="h-3 w-3"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
    >
      <path
        d="m5 12 4 4L19 6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  const DoubleArrowIcon = () => (
    <svg
      className="mr-2 h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <path
        d="m6 7 5 5-5 5M13 7l5 5-5 5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  /* =========================================================
     CONTENT (TREATMENT PLAN FORM + ACTION)
  ========================================================= */

  const content = (
    <div className="mb-8 rounded-xl border border-slate-200 bg-white shadow-sm">

      <div className="space-y-8 p-8">

        {/* ============================================
            TREATMENT INTENT + TREATMENT TYPE
        ============================================= */}

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">

        <div>

          <label
            htmlFor="treatmentIntent"
            className="mb-2 block text-[10px] font-bold text-slate-800"
          >
            Treatment Intent
          </label>

          <div className="relative w-full">

            <select
              id="treatmentIntent"
              value={treatmentIntent}
              onChange={(event) =>
                setTreatmentIntent(event.target.value)
              }
              className="block w-full appearance-none rounded-lg border border-slate-300 bg-white p-3 text-[10px] text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="">
                Select Treatment Intent
              </option>

              {[
                "Curative",
                "Adjuvant",
                "Neoadjuvant",
                "Palliative",
                "Definitive",
                "Maintenance",
                "Salvage",
                "Supportive / Symptom Control",
                "Prophylactic",
                "Diagnostic",
                "Other",
              ].map((intent) => (
                <option key={intent} value={intent}>
                  {intent}
                </option>
              ))}
            </select>

            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
              <ChevronDownIcon />
            </div>

          </div>
        </div>

        {/* Treatment Type (single-select) */}
        <div>

          <label
            htmlFor="treatmentType"
            className="mb-3 block text-[10px] font-bold text-slate-800"
          >
            Treatment Type
          </label>

          <div className="relative w-full">

            <select
              id="treatmentType"
              value={treatmentTypes[0] ?? ""}
              onChange={(event) =>
                setTreatmentTypes(
                  event.target.value
                    ? [event.target.value as TreatmentType]
                    : []
                )
              }
              className="block w-full appearance-none rounded-lg border border-slate-300 bg-white p-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="">
                Select Treatment Type
              </option>

              {treatmentOptions.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>

            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
              <ChevronDownIcon />
            </div>

          </div>
        </div>

        </div>

        {/* ============================================
            LINE + START DATE  (chemotherapy only)
        ============================================= */}

        {isChemotherapySelected && (
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">

          {/* Line of Therapy */}
          <div>

            <label
              htmlFor="lineOfTherapy"
              className="mb-2 block text-[10px] font-bold text-slate-800"
            >
              Line of Therapy
            </label>

            <div className="relative">

              <select
                id="lineOfTherapy"
                value={lineOfTherapy}
                onChange={(event) =>
                  setLineOfTherapy(event.target.value)
                }
                className="block w-full appearance-none rounded-lg border border-slate-300 bg-white p-3 text-[10px] text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="First Line">
                  First Line
                </option>

                <option value="Second Line">
                  Second Line
                </option>
              </select>

              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                <ChevronDownIcon />
              </div>

            </div>
          </div>

          {/* Planned Start Date */}
          <div>

            <label
              htmlFor="plannedStartDate"
              className="mb-2 block text-[10px] font-bold text-slate-800"
            >
              Planned Start Date
            </label>

            <Popover>
              <PopoverTrigger asChild>
                <div className="relative cursor-pointer">

                  <input
                    id="plannedStartDate"
                    type="text"
                    value={plannedStartDate}
                    onChange={(event) => {
                      const value = event.target.value;
                      setPlannedStartDate(value);
                      if (resolvedPatientId) {
                        localStorage.setItem(
                          `hms_planned_start_date_${resolvedPatientId}`,
                          value
                        );
                      }
                    }}
                    className="block w-full rounded-lg border border-slate-300 bg-white p-3 pr-12 text-[10px] text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  />

                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4 text-slate-400">
                    <CalendarIcon />
                  </div>

                </div>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={parsePickedDate(plannedStartDate)}
                  disabled={(date) => {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    return date < today;
                  }}
                  onSelect={(date) => {
                    if (date instanceof Date) {
                      const value = formatPickedDate(date);
                      setPlannedStartDate(value);
                      if (resolvedPatientId) {
                        localStorage.setItem(
                          `hms_planned_start_date_${resolvedPatientId}`,
                          value
                        );
                      }
                    }
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
        )}

        {/* ============================================
            PROTOCOL  (chemotherapy only)
        ============================================= */}

        {isChemotherapySelected && (
        <div>

          <div className="mb-2 flex items-center justify-between">

            <label
              htmlFor="protocol"
              className="block text-[10px] font-bold text-slate-800"
            >
              Protocol
            </label>

            <button
              type="button"
              onClick={() =>
                console.log("View Protocol clicked")
              }
              className="text-[10px] font-semibold text-blue-700 hover:underline"
            >
            
            </button>

          </div>

          <div className="relative">

            <select
              id="protocol"
              value={protocol}
              onChange={(event) => {
                const value = event.target.value;
                setProtocol(value);
                if (value) {
                  localStorage.setItem(
                    `hms_selected_protocol_id_${resolvedPatientId}`,
                    value
                  );
                  const selected = protocols.find(
                    (p) => p.protocol_id === value
                  );
                  if (selected) {
                    const label = `${selected.regimen_code} - ${selected.regimen_name}`;
                    localStorage.setItem(
                      `hms_selected_protocol_name_${resolvedPatientId}`,
                      label
                    );
                    window.dispatchEvent(
                      new CustomEvent("protocol-changed", {
                        detail: { patientId: resolvedPatientId, protocolName: label },
                      })
                    );
                  }
                  /* Push the newly selected protocol onto any existing
                     plan immediately so patient-details shows the new
                     protocol + days/cycle without waiting for the step
                     to be saved. */
                  void syncExistingPlanProtocol(resolvedPatientId, value);
                } else {
                  localStorage.removeItem(
                    `hms_selected_protocol_id_${resolvedPatientId}`
                  );
                  localStorage.removeItem(
                    `hms_selected_protocol_name_${resolvedPatientId}`
                  );
                  window.dispatchEvent(
                    new CustomEvent("protocol-changed", {
                      detail: { patientId: resolvedPatientId, protocolName: "" },
                    })
                  );
                }
              }}
              className="block w-full appearance-none rounded-lg border border-slate-300 bg-white p-3 text-[10px] text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="">
                {protocolsLoading
                  ? "Loading protocols"
                  : "Select Protocol"}
              </option>

              {protocols.map((item) => (
                <option
                  key={item.protocol_id}
                  value={item.protocol_id}
                >
                  {item.regimen_code} - {item.regimen_name}
                </option>
              ))}
            </select>

            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
              <ChevronDownIcon />
            </div>

          </div>

          {protocolsError && (
            <div className="mt-2 text-[10px] font-medium text-red-600">
              {protocolsError}
            </div>
          )}

          {staleProtocol && (
            <div className="mt-2 text-[10px] font-medium text-amber-600">
              The previously selected protocol doesn't match the current
              cancer type / histopathology. Please select a protocol again.
            </div>
          )}
        </div>
        )}

        {/* ============================================
            REMARKS
        ============================================= */}

        <div>

          <label
            htmlFor="remarks"
            className="mb-2 block text-[10px] font-bold text-slate-800"
          >
            Remarks
          </label>

          <VoiceToText
            value={remarks}
            onChange={setRemarks}
            placeholder="Enter remarks..."
          />

        </div>

      </div>

      {/* ================================================
          FORM FOOTER
      ================================================= */}

      <div className="flex flex-col items-end gap-3 rounded-b-xl border-t border-slate-200 bg-slate-50 p-6">

        {saveError && (
          <div className="text-[10px] font-medium text-red-600">
            {saveError}
          </div>
        )}

        <button
          type="button"
          onClick={handleNext}
          disabled={saving}
          className="flex items-center rounded-lg bg-[#1d4ed8] px-6 py-2.5 font-semibold text-white transition-colors hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <DoubleArrowIcon />
          {saving ? "Saving" : "Next"}
        </button>

      </div>
    </div>
  );

  if (embedded) {
    return (
      <div className="w-full">
        {content}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-white text-slate-800 antialiased">

      {/* =======================================================
          LEFT SIDEBAR
      ======================================================== */}

      <aside className="flex w-[320px] shrink-0 flex-col border-r border-slate-200 bg-white">

        {/* Patient Profile */}
        <div className="flex flex-col items-center border-b border-slate-200 p-8">

          <img
            src=""
            alt="Patient Photo"
            className="mb-4 h-32 w-32 rounded-full border border-slate-100 object-cover object-[50%_10%] shadow-sm"
          />

          <h2 className="mb-1 text-[10px] font-bold text-slate-900">
            {""}
          </h2>

          <p className="mb-3 text-[10px] text-slate-500">
            {""}
          </p>

          <div className="mb-4 rounded-md bg-slate-100 px-3 py-1 text-[10px] font-medium text-slate-600">
            {""}
          </div>

          <p className="text-center text-[10px] font-bold tracking-wide text-blue-700">
            {""}
          </p>
        </div>

        {/* Patient Information */}
        <div className="flex-1 space-y-6 overflow-y-auto p-8">

          {/* Phone */}
          <div>
            <div className="mb-1 flex items-center text-[10px] font-bold uppercase tracking-wider text-slate-800">
              <PhoneIcon />
              PHONE
            </div>

            <p className="text-[10px] text-slate-900">
              {""}
            </p>
          </div>

          {/* Email */}
          <div>
            <div className="mb-1 flex items-center text-[10px] font-bold uppercase tracking-wider text-slate-800">
              <EnvelopeIcon />
              EMAIL
            </div>

            <p className="text-[10px] text-slate-900">
              {""}
            </p>
          </div>

          {/* Vitals */}
          <div className="grid grid-cols-2 gap-y-6 pt-2">

            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-800">
                HEIGHT
              </div>
              <p className="text-[10px] font-semibold text-slate-900">
                {measurements.height}
              </p>
            </div>

            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-800">
                WEIGHT
              </div>
              <p className="text-[10px] font-semibold text-slate-900">
                {measurements.weight}
              </p>
            </div>

            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-800">
                BSA
              </div>
              <p className="text-[10px] font-semibold text-slate-900">
                {measurements.bsa}
              </p>
            </div>

            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-800">
                BMI
              </div>
              <p className="text-[10px] font-semibold text-slate-900">
                {measurements.bmi}
              </p>
            </div>

          </div>
        </div>

        {/* Profile Button */}
        <div className="p-6">

          <button
            type="button"
            onClick={handleViewProfile}
            className="w-full rounded-lg border-2 border-blue-600 py-2.5 text-[10px] font-semibold text-blue-600 transition-colors hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            View Full Profile
          </button>

        </div>
      </aside>

      {/* =======================================================
          MAIN CONTENT
      ======================================================== */}

      <main className="flex min-w-0 flex-1 flex-col bg-[#fafafa]">

        {/* =====================================================
            TOP NAVIGATION
        ====================================================== */}

        <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-slate-200 bg-white px-8">

          {/* Left */}
          <div className="flex items-center">

            <button
              type="button"
              onClick={handleBack}
              className="mr-4 text-slate-500 transition-colors hover:text-slate-700 focus:outline-none"
              aria-label="Go back"
            >
              <ArrowLeftIcon />
            </button>

            <h1 className="text-[10px] font-bold text-slate-900">
              Patients
            </h1>

          </div>

          {/* Right */}
          <div className="flex items-center space-x-6">

            <button
              type="button"
              className="relative text-slate-400 transition-colors hover:text-slate-600"
              aria-label="Notifications"
            >
              <BellIcon />

              <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-red-500" />
            </button>

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

        {/* =====================================================
            SCROLLABLE MAIN AREA
        ====================================================== */}

        <div className="flex-1 overflow-y-auto">

          <div className="mx-auto max-w-[1200px] p-8">

            {/* =================================================
                STEPPER
            ================================================== */}

            <div className="mb-8 rounded-xl border border-slate-200 bg-white p-8 shadow-sm">

              <div className="relative mx-auto flex max-w-4xl items-start justify-between">

                {/* Connecting Line */}
                <div className="absolute left-[16.66%] right-[16.66%] top-3 hidden h-0.5 bg-slate-200 md:block" />

                {/* Step 1 */}
                <button
                  type="button"
                  onClick={() => setActiveStep(1)}
                  className="relative z-10 flex w-1/3 flex-col items-center"
                >

                  <div
                    className={`mb-3 flex h-6 w-6 items-center justify-center rounded-full text-white ${
                      activeStep >= 1
                        ? "bg-green-500"
                        : "bg-slate-400"
                    }`}
                  >
                    <CheckIcon />
                  </div>

                  <span className="text-[10px] font-bold tracking-wider text-slate-900">
                    DIAGNOSIS
                  </span>

                </button>

                {/* Step 2 */}
                <button
                  type="button"
                  onClick={() => setActiveStep(2)}
                  className="relative z-10 flex w-1/3 flex-col items-center"
                >

                  <div
                    className={`mb-3 flex h-6 w-6 items-center justify-center rounded-full text-white shadow-md ring-4 ring-white ${
                      activeStep >= 2
                        ? "bg-green-500"
                        : "bg-slate-400"
                    }`}
                  >
                    <CheckIcon />
                  </div>

                  <span className="mb-2 text-[10px] font-bold tracking-wider text-slate-900">
                    TREATMENT PLAN
                  </span>

                  {activeStep === 2 && (
                    <div className="h-1.5 w-48 max-w-full rounded-full bg-green-500" />
                  )}

                </button>

                {/* Step 3 */}
                <button
                  type="button"
                  onClick={() => setActiveStep(3)}
                  className="relative z-10 flex w-1/3 flex-col items-center"
                >

                  <div
                    className={`mb-3 flex h-6 w-6 items-center justify-center rounded-full text-white ${
                      activeStep >= 3
                        ? "bg-green-500"
                        : "bg-slate-400"
                    }`}
                  >
                    <CheckIcon />
                  </div>

                  <span className="text-center text-[10px] font-bold tracking-wider text-slate-900">
                    CHEMOTHERAPY ORDER
                  </span>

                </button>

              </div>
            </div>

            {/* =================================================
                FORM AREA
            ================================================== */}

            {content}

          </div>
        </div>
      </main>
    </div>
  );
};

export default TreatmentPlan;
