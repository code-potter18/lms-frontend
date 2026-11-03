import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import API from "../../../api/axios";
import { getUser } from "../../../utils/token";
import { encounterApi } from "../../../api/encounter.api";
import { chemotherapyApi } from "../../../api/chemotherapy.api";
import { Calendar } from "../../../components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../components/ui/popover";
import { UserProfileDropdown } from "../../../components/ui/User_profile_dropdown";
import VoiceToText from "@/components/ui/voicetotext";
import type {
  ConsultationState,
  MeasurementValues,
  RegimenProtocolDetail,
} from "./types";
import {
  findActiveEncounter,
  formatPickedDate,
  dmyToIsoStrict,
  parsePickedDate,
  fetchScheduledDate,
  dateOnlyDMY,
  FOLLOW_UP_BLOCK_PATTERN,
  followUpAdviceLines,
  parseFollowUpAdvice,
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
   FOLLOW UP COMPONENT
   (combined from client/pages/doctor/Follow.tsx 
    renamed FollowUpScreen  FollowUp, duplicate React import
    removed, icons scoped inside the component to avoid
    colliding with the module-level icons above, embedded prop
    added so it can live in this file, original Follow.tsx file
    left untouched)
============================================================ */

type FollowUpStep = 1 | 2 | 3;

/* The Next Cycle value when no cycle day of the plan is left. */
const TREATMENT_ENDS = "Treatment ends";

const FollowUp: React.FC<{
  embedded?: boolean;
  patientId?: string;
  measurements?: MeasurementValues;
  onNext?: () => void;
  /* The consultation's encounter - the follow-up is saved in it. */
  encounterNo?: string;
}> = ({
  embedded = false,
  patientId,
  measurements,
  onNext,
  encounterNo,
}) => {
  const location = useLocation();
  const statePatientId = (
    (location.state as ConsultationState | null)?.patientId ?? ""
  );
  const resolvedPatientId = patientId || statePatientId;
  // Set when opened on an inpatient's admission encounter (doctor dashboard).
  const stateEncounterNo = (location.state as ConsultationState | null)?.encounterNo ?? "";
  const [userAvatarUrl, setUserAvatarUrl] = useState<string>(() => localStorage.getItem("user_photo") || "");
  const [avatarLoading, setAvatarLoading] = useState<boolean>(() => !localStorage.getItem("user_photo"));

  const [activeStep, setActiveStep] = useState<FollowUpStep>(1);
  const visitEncounterNo = encounterNo || stateEncounterNo;
  const [nextVisitDate, setNextVisitDate] = useState("");
  /* The Next Visit Date was saved on the visit or set by the doctor: the
     chosen cycle day's planned date no longer replaces it (picking another
     Next Cycle re-derives it). */
  const dateTouchedRef = useRef(false);
  const [nextCycle, setNextCycle] = useState("");
  /* The plan's cycle days ("Cycle N / Day M"), completed ones disabled,
     then "Treatment ends". */
  const [cycleOptions, setCycleOptions] = useState<{ value: string; completed: boolean }[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [plan, setPlan] = useState("");
  const [notes, setNotes] = useState("");
  const [newVisit, setNewVisit] = useState("");
  const [submittingFollowUp, setSubmittingFollowUp] = useState(false);
  const [followUpError, setFollowUpError] = useState("");

  const treatmentEnds = nextCycle === TREATMENT_ENDS;

  const applyVisitDate = (value: string) => {
    setNextVisitDate(value);
    if (resolvedPatientId && value) {
      localStorage.setItem(`hms_next_cycle_date_${resolvedPatientId}`, value);
    }
  };

  /* The patient's plan (its cycle days and orders) and this visit's saved
     Follow Up values. The next cycle day defaults to the one after the
     cycle day ordered in this visit. */
  useEffect(() => {
    if (!resolvedPatientId) return;
    let cancelled = false;
    setOptionsLoading(true);

    const load = async () => {
      const [planResult, encounterResult] = await Promise.allSettled([
        chemotherapyApi.getLatestPlanForPatient(resolvedPatientId),
        visitEncounterNo ? encounterApi.getByNumber(visitEncounterNo) : Promise.resolve(null),
      ]);
      const chemoPlan = planResult.status === "fulfilled" ? planResult.value.data?.data ?? null : null;
      const encounter = encounterResult.status === "fulfilled" ? encounterResult.value?.data?.data ?? null : null;
      const saved = parseFollowUpAdvice(encounter?.advice);

      const orders = chemoPlan?.plan_orders ?? [];
      const statusOf = (cycle: number, day: number) =>
        orders.find((order) => order.cycle_number === cycle && order.cycle_day === day)?.order_status;

      /* Cycle days: the plan's schedule (medication days, or days with an
         order); without one, the protocol's cycles x medication days. */
      let days = (chemoPlan?.chemotherapy_plan_schedule ?? [])
        .filter((row) => row.medication_day !== false || statusOf(row.cycle_number, row.cycle_day))
        .map((row) => ({ cycle: row.cycle_number, day: row.cycle_day }));
      if (days.length === 0) {
        const protocolId =
          (chemoPlan as { source_protocol_id?: string | null } | null)?.source_protocol_id ||
          chemoPlan?.chemotherapy_regimen_protocol?.protocol_id ||
          localStorage.getItem(`hms_selected_protocol_id_${resolvedPatientId}`) ||
          "";
        if (protocolId) {
          try {
            const protocol = (
              await API.get<{ success: boolean; data: RegimenProtocolDetail }>(
                `/chemotherapy/regimen-protocols/${encodeURIComponent(protocolId)}`
              )
            ).data.data;
            const medicationDays = [
              ...new Set(
                (protocol.chemotherapy_regimen_protocol_items ?? [])
                  .map((item) => Number(item.administration_day ?? item.cycle_day))
                  .filter((d) => Number.isFinite(d) && d > 0)
              ),
            ].sort((a, b) => a - b);
            const perCycle =
              medicationDays.length > 0
                ? medicationDays
                : Array.from({ length: protocol.no_of_days && protocol.no_of_days > 0 ? protocol.no_of_days : 1 }, (_, i) => i + 1);
            const cycles = chemoPlan?.planned_cycles || protocol.standard_cycles || 1;
            for (let cycle = 1; cycle <= cycles; cycle += 1) {
              perCycle.forEach((day) => days.push({ cycle, day }));
            }
          } catch (error) {
            console.error("Failed to load the follow-up protocol:", error);
          }
        }
      }
      days = days.sort((a, b) => a.cycle - b.cycle || a.day - b.day);
      const labelOf = (entry: { cycle: number; day: number }) => `Cycle ${entry.cycle} / Day ${entry.day}`;

      /* This visit's cycle day: its own order, else the one in progress. */
      const current =
        orders.find((order) => visitEncounterNo && order.encounter_no === visitEncounterNo) ??
        [...orders].reverse().find((order) => order.order_status === "IN_ADMINISTRATION" || order.order_status === "ORDERED");
      let followingDay = "";
      if (current) {
        const after = days.find(
          (entry) =>
            entry.cycle > current.cycle_number ||
            (entry.cycle === current.cycle_number && entry.day > current.cycle_day)
        );
        followingDay = after ? labelOf(after) : TREATMENT_ENDS;
      }

      const options = days.map((entry) => ({
        value: labelOf(entry),
        completed: statusOf(entry.cycle, entry.day) === "COMPLETED",
      }));
      const isOption = (value: string) => value === TREATMENT_ENDS || options.some((option) => option.value === value);
      const stored = localStorage.getItem(`hms_next_cycle_${resolvedPatientId}`) ?? "";
      const picked =
        saved.nextCycle ||
        followingDay ||
        (stored && isOption(stored) ? stored : "") ||
        options.find((option) => !option.completed)?.value ||
        "";
      if (picked && !isOption(picked)) options.unshift({ value: picked, completed: false });
      options.push({ value: TREATMENT_ENDS, completed: false });

      if (cancelled) return;
      setCycleOptions(options);
      const savedDate = dateOnlyDMY(encounter?.follow_up_date) || saved.nextVisit;
      if (savedDate) {
        dateTouchedRef.current = true;
        applyVisitDate(savedDate);
      }
      setNextCycle(picked);
      setPlan(saved.plan || (picked === TREATMENT_ENDS ? "Complete Treatment" : "Continue Treatment"));
      setNewVisit(saved.newVisit);
      setNotes(saved.notes);
    };

    load()
      .catch((error) => console.error("Failed to load the follow-up details:", error))
      .finally(() => {
        if (!cancelled) setOptionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedPatientId, visitEncounterNo]);

  /* The chosen cycle day's planned date becomes the Next Visit Date (it
     follows an edited Start Date) - unless the date was saved / set. */
  useEffect(() => {
    if (!resolvedPatientId || !nextCycle || treatmentEnds || dateTouchedRef.current) return;
    let cancelled = false;
    fetchScheduledDate(resolvedPatientId, nextCycle).then((scheduled) => {
      if (!cancelled && scheduled && !dateTouchedRef.current) applyVisitDate(scheduled);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextCycle, resolvedPatientId]);

  /* Keep the stored next cycle in sync with this selection - other steps
     (Summary, the next visit's Chemotherapy Order) read it. */
  useEffect(() => {
    if (!resolvedPatientId || !nextCycle.trim()) return;
    localStorage.setItem(`hms_next_cycle_${resolvedPatientId}`, nextCycle);
  }, [nextCycle, resolvedPatientId]);

  const changeNextCycle = (value: string) => {
    /* Picking a cycle day re-derives its date. */
    dateTouchedRef.current = false;
    setNextCycle(value);
    if (value === TREATMENT_ENDS && plan === "Continue Treatment") setPlan("Complete Treatment");
    if (value !== TREATMENT_ENDS && plan === "Complete Treatment") setPlan("Continue Treatment");
  };

  const handleBack = () => {
    window.history.back();
  };

  const handleSubmit = async () => {
    if (submittingFollowUp) return;

    if (!resolvedPatientId) {
      setFollowUpError(
        "Patient is not selected. Open this page from a patient consultation to continue."
      );
      return;
    }

    const hasAnyData = nextVisitDate.trim() || nextCycle || notes.trim();

    if (!hasAnyData) {
      setFollowUpError(
        "Please select or enter the important field in the previous form."
      );
      return;
    }

    setFollowUpError("");
    setSubmittingFollowUp(true);

    try {
      const encounter = visitEncounterNo
        ? (await encounterApi.getByNumber(visitEncounterNo)).data?.data
        : (await findActiveEncounter(resolvedPatientId)).encounter;

      if (encounter?.encounter_no) {
        // Next Visit Date is the single source of the follow-up date. For an
        // inpatient encounter the backend copies it onto the admission's
        // review date, so the discharge details show the same date.
        const hasReviewDate = nextVisitDate.trim();

        const followUpLines = followUpAdviceLines({
          nextVisit: nextVisitDate,
          nextCycle,
          plan,
          newVisit: treatmentEnds ? newVisit : "",
          notes,
        });

        const existingAdvice = encounter.advice ?? "";
        const cleanedAdvice = existingAdvice.replace(FOLLOW_UP_BLOCK_PATTERN, "").trimEnd();
        const parts = [cleanedAdvice];
        if (followUpLines.length > 0) {
          parts.push("[Follow Up]", ...followUpLines);
        }

        const payload: { advice?: string; follow_up_date?: string } = {
          advice: parts.filter(Boolean).join("\n\n").trim(),
        };
        // The real structured column (previously unused -- this text line
        // above was the only record of it).
        // The picker holds DD-MM-YYYY; the API takes YYYY-MM-DD.
        if (hasReviewDate) {
          const isoDate = dmyToIsoStrict(nextVisitDate) ?? (/^\d{4}-\d{2}-\d{2}$/.test(nextVisitDate.trim()) ? nextVisitDate.trim() : undefined);
          if (!isoDate) throw new Error("Enter the Next Visit Date as DD-MM-YYYY");
          payload.follow_up_date = isoDate;
        }

        await encounterApi.update(encounter.encounter_no, payload);
      }

      onNext?.();
    } catch (err: any) {
      console.error("Failed to save follow-up:", err);
      setFollowUpError(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to save follow-up details. Please try again."
      );
    } finally {
      setSubmittingFollowUp(false);
    }
  };

  const handleViewProfile = () => {
    console.log("View Full Profile clicked");
  };

  /* Icons (scoped inside the component to avoid colliding
     with the module-level icons defined above) */

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
        d="M18 8a6 6 0 00-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  const PhoneIcon = () => (
    <svg
      className="mt-1 h-4 w-4 shrink-0 text-gray-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.12.9.33 1.78.62 2.63a2 2 0 01-.45 2.11L8 9.73a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.85.29 1.73.5 2.63.62A2 2 0 0122 16.92z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  const EmailIcon = () => (
    <svg
      className="mt-1 h-4 w-4 shrink-0 text-gray-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <rect
        x="3"
        y="5"
        width="18"
        height="14"
        rx="2"
      />
      <path
        d="M3 7l9 6 9-6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  const CalendarIcon = () => (
    <svg
      className="h-5 w-5 text-gray-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
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
      className="h-4 w-4 text-gray-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path
        d="M6 9l6 6 6-6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  const CheckIcon = () => (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
    >
      <path
        d="M5 12l4 4L19 6"
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
        d="M6 7l5 5-5 5M13 7l5 5-5 5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  /* =========================================================
     CONTENT (FOLLOW UP FORM + ACTION)
  ========================================================= */

  const content = (
    <>
      {/* FOLLOW UP FORM */}
      <div className="mb-6 flex-grow rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
          className="space-y-8"
        >
          {/* Row 1 */}
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            {/* Next Visit Date */}
            <div>
              <label
                htmlFor="nextVisitDate"
                className="mb-2 block text-[10px] font-semibold text-gray-800"
              >
                Next Visit Date
              </label>

              <Popover>
                <PopoverTrigger asChild>
                  <div className="relative cursor-pointer">
                    <input
                      id="nextVisitDate"
                      type="text"
                      value={nextVisitDate}
                      onChange={(event) => {
                        dateTouchedRef.current = true;
                        applyVisitDate(event.target.value);
                      }}
                      className="block w-full rounded-lg border border-gray-300 bg-white py-3 pl-4 pr-10 text-[10px] text-gray-700 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    />

                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4">
                      <CalendarIcon />
                    </div>
                  </div>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={parsePickedDate(nextVisitDate)}
                    onSelect={(date) => {
                      if (date instanceof Date) {
                        dateTouchedRef.current = true;
                        applyVisitDate(formatPickedDate(date));
                      }
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Next Cycle */}
            <div>
              <label
                htmlFor="nextCycle"
                className="mb-2 block text-[10px] font-semibold text-gray-800"
              >
                Next Cycle
              </label>

<div className="relative">
          <select
            id="nextCycle"
            value={nextCycle}
            onChange={(event) => changeNextCycle(event.target.value)}
            className="block w-full cursor-pointer appearance-none rounded-lg border border-gray-300 bg-white py-3 pl-4 pr-10 text-[10px] text-gray-700 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="">
              {optionsLoading ? "Loading cycles..." : cycleOptions.length > 1 ? "Select Next Cycle" : "No planned cycles"}
            </option>
            {cycleOptions.map((option) => (
              <option key={option.value} value={option.value} disabled={option.completed}>
                {option.completed ? `${option.value} (Completed)` : option.value}
              </option>
            ))}
</select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4">
            <ChevronDownIcon />
          </div>
        </div>
</div>
    </div>
{/* Plan + New Visit (when treatment ends) */}
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            <div className="w-full md:pr-4">
              <label
                htmlFor="plan"
                className="mb-2 block text-[10px] font-semibold text-gray-800"
              >
                Plan
              </label>

              <div className="relative">
                <select
                  id="plan"
                  value={plan}
                  onChange={(event) =>
                    setPlan(event.target.value)
                  }
                  className="block w-full cursor-pointer appearance-none rounded-lg border border-gray-300 bg-white py-3 pl-4 pr-10 text-[10px] text-gray-700 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="">Select Plan</option>
                  <option>Continue Treatment</option>
                  <option>Complete Treatment</option>
                  <option>Hold Treatment</option>
                  <option>Refer for Review</option>
                </select>

                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4">
                  <ChevronDownIcon />
                </div>
              </div>
            </div>

            {treatmentEnds && (
              <div className="w-full md:pl-4">
                <label
                  htmlFor="newVisit"
                  className="mb-2 block text-[10px] font-semibold text-gray-800"
                >
                  New Visit
                </label>
                <div className="relative">
                  <select
                    id="newVisit"
                    value={newVisit}
                    onChange={(event) =>
                      setNewVisit(event.target.value)
                    }
                    className="block w-full cursor-pointer appearance-none rounded-lg border border-gray-300 bg-white py-3 pl-4 pr-10 text-[10px] text-gray-700 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="">Select Visit Type</option>
                    <option>New visit</option>
                    <option>Follow-up</option>
                    <option>Review visit</option>
                    <option>Routine visit</option>
                    <option>Emergency Visit</option>
                    <option>Referral Visit</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4">
                    <ChevronDownIcon />
                  </div>
                </div>
              </div>
            )}
</div>

          {/* Notes */}
          <div>
            <label
              htmlFor="notes"
              className="mb-2 block text-[10px] font-semibold text-gray-800"
            >
              Notes
            </label>

            <VoiceToText
              value={notes}
              onChange={setNotes}
              placeholder="Enter notes..."
            />
          </div>
        </form>
      </div>

      {/* FORM ACTION */}
      <div className="flex flex-col items-end gap-2">
        {followUpError && (
          <div className="text-[10px] font-medium text-red-600">
            {followUpError}
          </div>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submittingFollowUp}
          className="inline-flex items-center justify-center rounded-lg border border-transparent bg-[#2557D6] px-8 py-3 text-[10px] font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <DoubleArrowIcon />
          {submittingFollowUp ? "Submitting" : "Submit"}
        </button>
      </div>
    </>
  );

  if (embedded) {
    return content;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 font-sans text-gray-800 antialiased">

      {/* =========================================================
          LEFT SIDEBAR - PATIENT PROFILE
      ========================================================= */}

      <aside className="flex h-full w-[300px] shrink-0 flex-col overflow-y-auto border-r border-gray-200 bg-white">

        {/* Profile Header */}
        <div className="flex flex-col items-center border-b border-gray-100 p-6">

          <img
            src=""
            alt="Patient Photo"
            className="mb-4 h-[110px] w-[110px] rounded-full object-cover shadow-sm"
          />

          <h2 className="mb-1 text-[10px] font-bold text-gray-900">
            {""}
          </h2>

          <p className="mb-3 text-[10px] text-gray-500">
            {""}
          </p>

          <span className="mb-4 rounded-md bg-gray-100 px-3 py-1 text-[10px] font-bold text-gray-900">
            {""}
          </span>

          <h3 className="text-center text-[10px] font-bold uppercase tracking-wide text-blue-600">
            {""}
          </h3>
        </div>

        {/* Contact Info */}
        <div className="space-y-5 border-b border-gray-100 p-6">

          <div className="flex items-start">
            <PhoneIcon />

            <div className="ml-4">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-900">
                Phone
              </p>

              <p className="text-[10px] font-medium text-gray-800">
                {""}
              </p>
            </div>
          </div>

          <div className="flex items-start">
            <EmailIcon />

            <div className="ml-4">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-900">
                Email
              </p>

              <p className="text-[10px] font-medium text-gray-800">
                {""}
              </p>
            </div>
          </div>

        </div>

        {/* Vitals */}
        <div className="grid grid-cols-2 gap-y-6 border-b border-gray-100 p-6">

          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-900">
              Height
            </p>
            <p className="text-[10px] font-bold text-gray-900">
              {measurements.height}
            </p>
          </div>

          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-900">
              Weight
            </p>
            <p className="text-[10px] font-bold text-gray-900">
              {measurements.weight}
            </p>
          </div>

          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-900">
              BSA
            </p>
            <p className="text-[10px] font-bold text-gray-900">
              {measurements.bsa}
            </p>
          </div>

          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-900">
              BMI
            </p>
            <p className="text-[10px] font-bold text-gray-900">
              {measurements.bmi}
            </p>
          </div>

        </div>

        {/* Profile Button */}
        <div className="mt-auto p-6">
          <button
            type="button"
            onClick={handleViewProfile}
            className="w-full rounded-lg border border-blue-500 px-4 py-2.5 text-[10px] font-semibold text-blue-600 transition-colors hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            View Full Profile
          </button>
        </div>
      </aside>

      {/* =========================================================
          MAIN CONTENT
      ========================================================= */}

      <main className="flex min-w-0 flex-1 flex-col">

        {/* =======================================================
            TOP HEADER
        ======================================================== */}

        <header className="z-10 flex h-16 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6 shadow-sm">

          {/* Left */}
          <div className="flex items-center">

            <button
              type="button"
              onClick={handleBack}
              className="mr-4 text-gray-500 transition-colors hover:text-gray-700 focus:outline-none"
              aria-label="Go back"
            >
              <ArrowLeftIcon />
            </button>

            <h1 className="text-[10px] font-bold text-gray-900">
              Patients
            </h1>

          </div>

          {/* Right */}
          <div className="flex items-center space-x-6">

            {/* Notification */}
            <button
              type="button"
              className="relative text-gray-400 transition-colors hover:text-gray-600"
              aria-label="Notifications"
            >
              <BellIcon />

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

        <div className="flex-1 overflow-y-auto bg-slate-50 p-6">

          <div className="mx-auto flex h-full max-w-5xl flex-col">

            {/* ===================================================
                PROGRESS STEPPER
            ==================================================== */}

            <div className="mb-8 px-4">

              <div className="relative flex items-center justify-between">

                {/* Step 1 */}
                <button
                  type="button"
                  onClick={() => setActiveStep(1)}
                  className="group relative z-10 flex flex-1 cursor-pointer flex-col items-center text-center"
                >
                  <div
                    className={`z-10 mb-3 flex h-8 w-8 items-center justify-center rounded-full text-white shadow-sm ${
                      activeStep >= 1
                        ? "bg-green-500"
                        : "bg-gray-400"
                    }`}
                  >
                    <CheckIcon />
                  </div>

                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-800">
                    Discharge Medication
                  </span>
                </button>

                {/* Connecting Line 1 */}
                <div
                  className={`pointer-events-none absolute left-[16%] right-[50%] top-4 z-0 h-[3px] rounded-full ${
                    activeStep >= 2
                      ? "bg-green-500"
                      : "bg-gray-200"
                  }`}
                />

                {/* Step 2 */}
                <button
                  type="button"
                  onClick={() => setActiveStep(2)}
                  className="group relative z-10 flex flex-1 cursor-pointer flex-col items-center text-center"
                >
                  <div
                    className={`z-10 mb-3 flex h-8 w-8 items-center justify-center rounded-full text-white shadow-sm ${
                      activeStep === 2
                        ? "bg-green-500 ring-4 ring-green-100"
                        : activeStep > 2
                        ? "bg-green-500"
                        : "bg-gray-400"
                    }`}
                  >
                    <CheckIcon />
                  </div>

                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-800">
                    Follow Up
                  </span>
                </button>

                {/* Connecting Line 2 */}
                <div
                  className={`pointer-events-none absolute left-[50%] right-[16%] top-4 z-0 h-[3px] rounded-full ${
                    activeStep >= 3
                      ? "bg-green-500"
                      : "bg-gray-200"
                  }`}
                />

                {/* Step 3 */}
                <button
                  type="button"
                  onClick={() => setActiveStep(3)}
                  className="group relative z-10 flex flex-1 cursor-pointer flex-col items-center text-center"
                >
                  <div
                    className={`z-10 mb-3 flex h-8 w-8 items-center justify-center rounded-full text-white shadow-sm ${
                      activeStep >= 3
                        ? "bg-green-500"
                        : "bg-gray-400"
                    }`}
                  >
                    <CheckIcon />
                  </div>

                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-800">
                    Summary
                  </span>
                </button>

              </div>
            </div>

            {content}

          </div>
        </div>
      </main>
    </div>
  );
};

export default FollowUp;
