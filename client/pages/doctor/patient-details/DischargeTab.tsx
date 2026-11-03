import React, { useEffect, useState } from "react";
import { useBranchFilter } from "../../../context/BranchFilterContext";
import type {
  SummaryPlan,
  StagingDetailRecord,
  ChemoPlanPreview,
  UseLatestPatientVitalsResult,
} from "./types";
import { loadLatestPlanPreview } from "./api";
import { useDischargeMedicines } from "./hooks";

/* ============================================================
   DISCHARGE TAB
   Discharge status, take-home medications, final vital signs and
   the discharge checklist of the patient's chemotherapy plan.
   ============================================================ */

type DischargeTabProps = {
  patientId: string;
  plan: SummaryPlan | null;
  /* The page header's latest vitals (one shared fetch). */
  latestVitals: UseLatestPatientVitalsResult;
};

const DischargeTab: React.FC<DischargeTabProps> = ({
  patientId,
  plan: dischargePlan,
  latestVitals,
}) => {
  const {
    latestEncounter,
    latestChemoVitals,
    adverseEventCount: reactionCount,
    vitals: mergedVitals,
    lastCheckedLabel,
  } = latestVitals;
  const { selectedBranchId } = useBranchFilter();

  /* The latest diagnosis preview: its staging detail names the admitting
     physician and its first matching protocol is the discharge medicines'
     fallback when the plan has no source protocol. */
  const [planPreview, setPlanPreview] = useState<ChemoPlanPreview | null>(null);
  const [stagingDetail, setStagingDetail] =
    useState<StagingDetailRecord | null>(null);

  useEffect(() => {
    if (!patientId) {
      setPlanPreview(null);
      setStagingDetail(null);
      return;
    }
    let cancelled = false;
    loadLatestPlanPreview(patientId)
      .then(({ preview, staging }) => {
        if (cancelled) return;
        setPlanPreview(preview);
        setStagingDetail(staging);
      })
      .catch(() => {
        /* Physician / protocol fall back to the plan and empty states. */
      });
    return () => {
      cancelled = true;
    };
  }, [patientId, selectedBranchId]);

  const sd = stagingDetail;

  /* Take-home medications: REAL rows fetched from
     GET /chemotherapy/regimen-protocols/:protocolId/discharge-medicines -
     the protocol is the saved plan's source protocol, falling back to
     the first matching protocol of the diagnosis preview. */
  const dischargeProtocolId =
    dischargePlan?.source_protocol_id ||
    planPreview?.matching_protocols?.[0]?.protocol_id ||
    "";
  const {
    rows: dischargeMedicineRows,
    loading: dischargeMedsLoading,
    error: dischargeMedsError,
  } = useDischargeMedicines(dischargeProtocolId);

  const medications = dischargeMedicineRows.map((item) => ({
    id:
      item.discharge_instruction_id ??
      `${item.protocol_id}-${item.drug_sequence ?? ""}`,
    medication: item.medicine_master?.medicine_name ?? "—",
    composition:
      item.composition || item.medicine_master?.generic_name || "—",
    dose:
      item.patient_dose != null && item.patient_dose !== ""
        ? `${item.patient_dose} ${
            item.patient_dose_unit ?? item.medicine_master?.unit ?? ""
          }`.trim()
        : "—",
    frequency: item.frequency || "—",
    duration: item.duration || "—",
  }));

  /* Final vital signs - freshest recorded values (encounter first,
     chemo-cycle fallback per field). */
  const vitals = [
    {
      label: "BP",
      value:
        mergedVitals.bpSystolic != null && mergedVitals.bpDiastolic != null
          ? `${mergedVitals.bpSystolic}/${mergedVitals.bpDiastolic}`
          : "—",
      status:
        latestEncounter?.systolic_bp != null ||
        latestEncounter?.diastolic_bp != null
          ? "Recorded"
          : latestChemoVitals?.vital_stage || "Not recorded",
    },
    {
      label: "Pulse",
      value: mergedVitals.pulse != null ? `${mergedVitals.pulse} bpm` : "—",
      status: "Recorded",
    },
    {
      label: "Temp",
      value: mergedVitals.temp != null ? `${mergedVitals.temp} °C` : "—",
      status: "Recorded",
    },
    {
      label: "SpO2",
      value: mergedVitals.spo2 != null ? `${mergedVitals.spo2}%` : "—",
      status: latestChemoVitals?.oxygen_support ? "On Support" : "Room Air",
    },
    {
      label: "Pain Score",
      value: mergedVitals.painScore != null ? `${mergedVitals.painScore}/10` : "—",
      status: latestEncounter?.pain_score != null ? "Recorded" : "Not recorded",
    },
  ];

  /* Cycle stats computed from the saved plan + its cycles. */
  const allDischargeCycles = dischargePlan?.chemotherapy_cycle ?? [];
  const administeredCount = allDischargeCycles.filter((cycle) =>
    ((cycle.cycle_status ?? "")).toUpperCase() === "COMPLETED"
  ).length;
  const treatmentDurationLabel = (() => {
    const start = dischargePlan?.treatment_start_date
      ? new Date(dischargePlan.treatment_start_date)
      : null;
    const endCandidates = allDischargeCycles
      .map((cycle) => cycle.actual_date ?? cycle.planned_date)
      .filter(Boolean)
      .sort();
    const end = endCandidates.length
      ? new Date(endCandidates[endCandidates.length - 1])
      : dischargePlan?.expected_end_date
      ? new Date(dischargePlan.expected_end_date)
      : null;
    if (
      !start ||
      !end ||
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime())
    ) {
      return "";
    }
    const days = Math.max(
      0,
      Math.round((end.getTime() - start.getTime()) / 86400000)
    );
    return `${days} day${days === 1 ? "" : "s"}`;
  })();
  const checklist: string[] = [];

  return (
          <div className="grid gap-6 xl:grid-cols-3">
            {/* ===================================================
                LEFT COLUMN
            ==================================================== */}
            <div className="space-y-6 xl:col-span-2">
              {/* =================================================
                  DISCHARGE STATUS SUMMARY
              ================================================== */}
              <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                {/* Section Header */}
                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
                  <h3 className="text-[10px] font-medium text-gray-900">
                    Discharge Status Summary
                  </h3>

                  {((dischargePlan?.treatment_status ?? "").toUpperCase() === "COMPLETED") ? (
                    <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-[10px] font-medium text-green-700">
                      <i className="fa-regular fa-circle-check mr-1.5" />
                      Protocol Completed
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-[10px] font-medium text-amber-700">
                      <i className="fa-regular fa-clock mr-1.5" />
                      {dischargePlan ? "Treatment In Progress" : "Not Recorded"}
                    </span>
                  )}
                </div>

                {/* Section Body */}
                <div className="flex flex-col gap-6 p-6 lg:flex-row">
                  {/* Details */}
                  <div className="flex-1 space-y-5">
                    {/* Treatment Outcome */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-[10px] text-gray-500">
                        Treatment
                        <br />
                        Outcome
                      </div>

                      <div className={`col-span-2 text-[10px] font-semibold ${((dischargePlan?.treatment_status ?? "").toUpperCase() === "COMPLETED") ? "text-green-700" : "text-gray-500"}`}>
                        {dischargePlan?.treatment_status || "Not recorded"}
                      </div>
                    </div>

                    {/* Discharge Date */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="flex items-center text-[10px] text-gray-500">
                        Discharge Date
                      </div>

                      <div className="col-span-2 flex items-center font-bold text-gray-900">
                        Not recorded
                      </div>
                    </div>

                    {/* Discharge Time */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="flex items-center text-[10px] text-gray-500">
                        Discharge Time
                      </div>

                      <div className="col-span-2 flex items-center font-bold text-gray-900">
                        Not recorded
                      </div>
                    </div>

                    {/* Physician */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="flex items-center text-[10px] text-gray-500">
                        Admitting Physician
                      </div>

                      <div className="col-span-2 flex items-center font-semibold text-gray-900">
                        {sd?.consulting_oncologist ||
                          (sd?.employees
                            ? [
                                sd.employees.first_name,
                                sd.employees.last_name,
                              ]
                                .filter(Boolean)
                                .join(" ")
                            : "") ||
                          (dischargePlan?.employees
                            ? [
                                dischargePlan.employees.first_name,
                                dischargePlan.employees.last_name,
                              ]
                                .filter(Boolean)
                                .join(" ")
                            : "") ||
                          "—"}
                      </div>
                    </div>
                  </div>

                  {/* Treatment Cycle Stats */}
                  <div className="w-full rounded-lg border border-dashed border-gray-300 bg-white p-5 lg:w-80">
                    <h4 className="mb-4 text-[10px] font-bold uppercase tracking-wider text-gray-900">
                      Treatment Cycle Stats
                    </h4>

                    <div className="grid gap-y-4 sm:grid-cols-2">
                      {/* Planned */}
                      <div>
                        <p className="mb-1 text-[10px] font-bold text-slate-800">
                          Cycles Planned
                        </p>
                        <p className="text-[10px] font-medium text-gray-900">
                          {dischargePlan?.planned_cycles ?? 0}
                        </p>
                      </div>

                      {/* Administered */}
                      <div>
                        <p className="mb-1 text-[10px] font-bold text-slate-800">
                          Cycles Administered
                        </p>
                        <p className="text-[10px] font-medium text-blue-800">
                          {administeredCount}
                        </p>
                      </div>

                      {/* Duration */}
                      <div>
                        <p className="mb-1 text-[10px] font-bold text-slate-800">
                          Total Duration
                        </p>
                        <p className="text-[10px] text-gray-900">{treatmentDurationLabel || "—"}</p>
                      </div>

                      {/* Reactions */}
                      <div>
                        <p className="mb-1 text-[10px] font-bold text-slate-800">
                          Adverse Reactions
                        </p>
                        <p className={`text-[10px] font-medium ${reactionCount > 0 ? "text-red-600" : "text-green-700"}`}>
                          {reactionCount > 0 ? reactionCount : "None"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* =================================================
                  TAKE HOME MEDICATIONS
              ================================================== */}
              <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                  <h3 className="text-[10px] font-medium text-gray-900">
                    Take-Home Medications{" "}
                    {!dischargeMedsLoading && medications.length > 0 && (
                      <span className="ml-1 rounded-full bg-blue-100 px-2 py-0.5 align-middle text-[10px] font-bold text-blue-700">
                        {medications.length}
                      </span>
                    )}
                  </h3>

                  <button
                    type="button"
                    className="flex items-center text-[10px] font-medium text-blue-800 transition hover:underline"
                    onClick={() => window.print()}
                  >
                    <i className="fa-solid fa-print mr-2" />
                    Print Rx
                  </button>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="whitespace-nowrap px-6 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-900">
                          Medication
                        </th>

                        <th className="whitespace-nowrap px-6 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-900">
                          Composition
                        </th>

                        <th className="whitespace-nowrap px-6 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-900">
                          Dose
                        </th>

                        <th className="whitespace-nowrap px-6 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-900">
                          Frequency
                        </th>

                        <th className="whitespace-nowrap px-6 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-900">
                          Duration
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-gray-200 bg-white">
                      {dischargeMedsLoading ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-6 text-center text-[10px] text-slate-400">
                            <i className="fa-solid fa-circle-notch fa-spin mr-2" /> Loading discharge medicines…
                          </td>
                        </tr>
                      ) : dischargeMedsError ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-6 text-center text-[10px] text-red-500">
                            <i className="fa-solid fa-triangle-exclamation mr-2" /> {dischargeMedsError}
                          </td>
                        </tr>
                      ) : medications.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-6 text-center text-[10px] text-slate-400">
                            {dischargeProtocolId
                              ? "No discharge medicines recorded on this patient's regimen protocol yet."
                              : "No regimen protocol linked to this patient's plan yet."}
                          </td>
                        </tr>
                      ) : (
                        medications.map((medication) => (
                        <tr key={medication.id}>
                          <td className="whitespace-nowrap px-6 py-4 font-medium text-gray-900">
                            {medication.medication}
                          </td>

                          <td className="whitespace-nowrap px-6 py-4 text-[10px] text-gray-500">
                            {medication.composition}
                          </td>

                          <td className="whitespace-nowrap px-6 py-4 text-[10px] text-gray-900">
                            {medication.dose}
                          </td>

                          <td className="whitespace-nowrap px-6 py-4 text-[10px] text-gray-900">
                            {medication.frequency}
                          </td>

                          <td className="whitespace-nowrap px-6 py-4 text-[10px] text-gray-900">
                            {medication.duration}
                          </td>
                        </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            {/* ===================================================
                RIGHT COLUMN
            ==================================================== */}
            <div className="space-y-6">
              {/* =================================================
                  FINAL VITAL SIGNS
              ================================================== */}
              <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-5 flex items-end justify-between">
                  <h3 className="text-[10px] font-medium text-gray-900">
                    Final Vital Signs
                  </h3>

                  <span className="text-[10px] text-gray-500">
                    {lastCheckedLabel || "No vitals recorded"}
                  </span>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {vitals.map((vital) => (
                    <div
                      key={vital.label}
                      className="rounded-lg bg-slate-50 p-4"
                    >
                      <p className="mb-1 text-[10px] font-bold text-slate-800">
                        {vital.label}
                      </p>

                      <p className="text-[10px] font-bold text-gray-900">
                        {vital.value}
                      </p>

                      <p className="mt-1 text-[10px] font-medium uppercase text-green-700">
                        {vital.status}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              {/* =================================================
                  CHECKLIST
              ================================================== */}
              <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-5 flex items-center justify-between">
                  <h3 className="text-[10px] font-medium text-gray-900">
                    Checklist
                  </h3>

                  <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-[10px] font-medium text-blue-700">
                    {checklist.length}/{checklist.length} Done
                  </span>
                </div>

                <ul className="space-y-4">
                  {checklist.length === 0 ? (
                    <li className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-[10px] text-slate-400">
                      No discharge checklist recorded for this patient yet.
                    </li>
                  ) : (
                    checklist.map((item, index) => (
                      <li key={index} className="flex items-start">
                        <i className="fa-solid fa-circle-check mr-3 mt-0.5 text-[10px] text-green-500" />

                        <span className="text-[10px] text-gray-700">{item}</span>
                      </li>
                    ))
                  )}
                </ul>
              </section>
            </div>
          </div>
  );
};

export default DischargeTab;
