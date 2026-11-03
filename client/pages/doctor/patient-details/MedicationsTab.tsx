import React from "react";
import { chemoPlanCurrentItems, chemoPlanItemName } from "../../../api/chemotherapy.api";
import type { SummaryPlanItem, SummaryPlan } from "./types";
import { useDischargeMedicines } from "./hooks";
import { StatusBadge, SectionHeader } from "./ui";

/* ============================================================
   MEDICATIONS TAB
   The patient's current cycle day order - premedications,
   chemotherapy drugs, discharge medication - with the next
   appointment and the medication timeline.
   ============================================================ */

type MedicationsTabProps = {
  plan: SummaryPlan | null;
  selectedCycle?: number;
  cycleMedicationsMap?: Record<string, any[]>;
};

const MedicationsTab: React.FC<MedicationsTabProps> = ({
  plan,
  selectedCycle,
  cycleMedicationsMap,
}) => {
  /* Recent medication details for THIS selected patient, sourced from
      the fetched chemotherapy plan (GET /chemotherapy/plans?patient_id=). */
  const cycleId = plan?.chemotherapy_cycle?.find(c => c.cycle_number === selectedCycle)?.chemotherapy_cycle_id;
  const medPlanItems = cycleId && cycleMedicationsMap?.[cycleId]?.length
    ? cycleMedicationsMap[cycleId]
    : chemoPlanCurrentItems<SummaryPlanItem>(plan);
  const medPremedications = medPlanItems.filter(
    (item) => (item.drug_role ?? "").toUpperCase() === "PREMEDICATION",
  );
  const medChemoDrugs = medPlanItems.filter(
    (item) => (item.drug_role ?? "").toUpperCase() === "PRIMARY",
  );
  const medSupportiveCount = medPlanItems.filter(
    (item) =>
      !["PREMEDICATION", "PRIMARY"].includes(
        (item.drug_role ?? "").toUpperCase(),
      ),
  ).length;

  /* Currently running cycle of the fetched plan + its real start date. */
  const medFmtDate = (value?: string | null) => {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return `${String(d.getDate()).padStart(2, "0")}-${String(
      d.getMonth() + 1,
    ).padStart(2, "0")}-${d.getFullYear()}`;
  };
  const medCurrentCycleInfo = (() => {
    if (!plan?.treatment_start_date || !plan?.cycle_interval_days) return null;
    const start = new Date(plan.treatment_start_date);
    if (Number.isNaN(start.getTime())) return null;
    const interval = plan.cycle_interval_days || 1;
    const planned = plan.planned_cycles || 1;
    const daysElapsed = Math.floor(
      (Date.now() - start.getTime()) / 86400000,
    );
    let cycle = daysElapsed < 0 ? 1 : Math.floor(daysElapsed / interval) + 1;
    if (planned > 0 && cycle > planned) cycle = planned;
    const d = new Date(start);
    d.setDate(d.getDate() + (cycle - 1) * interval);
    return { cycle, date: medFmtDate(d.toISOString()) };
  })();

  /* Discharge medication table: REAL rows from
     GET /chemotherapy/regimen-protocols/:protocolId/discharge-medicines,
     resolved through the plan's source protocol. */
  const {
    rows: portalDischargeMeds,
    loading: portalDischargeMedsLoading,
    error: portalDischargeMedsError,
  } = useDischargeMedicines(plan?.source_protocol_id || "");

  return (
              <>
                {/* Summary cards */}
                <div className="grid gap-4 pt-4 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    ["TOTAL MEDS", String(medPlanItems.length), "fa-solid fa-pills", "bg-blue-50 text-[#0052cc]"],
                    ["PREMEDS", String(medPremedications.length), "fa-solid fa-syringe", "bg-purple-50 text-purple-600"],
                    ["CHEMO", String(medChemoDrugs.length), "fa-solid fa-hourglass-half", "bg-red-50 text-red-500"],
                    ["OTHER", String(medSupportiveCount), "fa-solid fa-heart-pulse", "bg-emerald-50 text-emerald-500"],
                  ].map(([label, value, icon, cls]) => (
                    <div key={label} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div>
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-800">{label}</p>
                        <p className="text-[10px] font-bold text-slate-800">{value}</p>
                      </div>
                      <div className={`flex h-10 w-10 items-center justify-center rounded-full ${cls}`}>
                        <i className={icon} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex flex-col gap-6 lg:flex-row">
                  <div className="min-w-0 flex-1 space-y-6">
                    {/* Premeds */}
                    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                      <SectionHeader icon="fa-solid fa-chevron-down" title="Premedications" badge={`${medPremedications.length} Prescribed`} />
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[700px] text-left text-[10px]">
                          <thead className="border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-400">
                            <tr>
                              <th className="w-12 px-6 py-4 text-center font-bold text-gray-900">#</th>
                              <th className="px-6 py-4 font-bold text-gray-900">MEDICATION</th>
                              <th className="px-6 py-4 font-bold text-gray-900">DOSE</th>
                              <th className="px-6 py-4 font-bold text-gray-900">ROUTE</th>
                              <th className="px-6 py-4 font-bold text-gray-900">TIMING</th>
                              <th className="px-6 py-4 text-center font-bold text-gray-900">STATUS</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {medPremedications.length === 0 ? (
                              <tr>
                                <td colSpan={6} className="px-6 py-6 text-center text-[10px] text-slate-400">No premedications found for this patient.</td>
                              </tr>
                            ) : (
                              medPremedications.map((item, index) => (
                                <tr key={item.chemotherapy_plan_item_id} className="transition-colors hover:bg-slate-50">
                                  <td className="px-6 py-4 text-center text-slate-400">{index + 1}</td>
                                  <td className="px-6 py-4">
                                    <p className="font-bold text-slate-800">{chemoPlanItemName(item) || "—"}</p>
                                    {item.medicine_master?.generic_name && <p className="text-[10px] text-slate-500">{item.medicine_master.generic_name}</p>}
                                  </td>
                                  <td className="px-6 py-4 text-slate-700">{item.protocol_dose != null ? `${item.protocol_dose} ${item.protocol_dose_unit ?? ""}`.trim() : "—"}</td>
                                  <td className="px-6 py-4 text-slate-700">{item.administration_route ?? "—"}</td>
                                  <td className="px-6 py-4 text-slate-700">{item.frequency ?? item.remarks ?? "—"}</td>
                                  <td className="px-6 py-4 text-center"><StatusBadge>{item.drug_role || "PRESCRIBED"}</StatusBadge></td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </section>

                    {/* Chemo */}
                    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                      <SectionHeader icon="fa-solid fa-chevron-down" title="Chemotherapy Drugs" badge={`${medChemoDrugs.length} Prescribed`} badgeClass="border border-red-100 bg-red-50 text-red-600" />
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[850px] text-left text-[10px]">
                          <thead className="border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-400">
                            <tr>
                              <th className="w-12 px-6 py-4 text-center">#</th>
                              <th className="px-6 py-4">DRUG NAME</th>
                              <th className="px-6 py-4">CALC.<br />DOSE</th>
                              <th className="px-6 py-4">ACTUAL<br />DOSE</th>
                              <th className="px-6 py-4">ROUTE</th>
                              <th className="px-6 py-4">DILUENT</th>
                              <th className="px-6 py-4 text-center">STATUS</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {medChemoDrugs.length === 0 ? (
                              <tr>
                                <td colSpan={7} className="px-6 py-6 text-center text-[10px] text-slate-400">No chemotherapy drugs found for this patient.</td>
                              </tr>
                            ) : (
                              medChemoDrugs.map((item, index) => (
                                <tr key={item.chemotherapy_plan_item_id} className="transition-colors hover:bg-slate-50">
                                  <td className="px-6 py-4 text-center text-slate-400">{index + 1}</td>
                                  <td className="px-6 py-4"><span className="font-bold text-[#0052cc]">{chemoPlanItemName(item) || "—"}</span></td>
                                  <td className="px-6 py-4 text-[10px] text-slate-500">{item.protocol_dose != null ? `${item.protocol_dose}${item.protocol_dose_unit ? ` ${item.protocol_dose_unit}` : ""}` : "—"}</td>
                                  <td className="px-6 py-4 font-bold text-slate-800">{item.calculated_dose ?? item.protocol_dose ?? "—"}</td>
                                  <td className="px-6 py-4 text-slate-700">{item.administration_route ?? "—"}</td>
                                  <td className="px-6 py-4 text-[10px] text-slate-500">{item.dilution_volume ?? "—"}</td>
                                  <td className="px-6 py-4 text-center"><StatusBadge>{item.drug_role || "PLANNED"}</StatusBadge></td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </section>

                    {/* Discharge */}
                    <section className="mb-8 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                      <SectionHeader icon="fa-solid fa-chevron-down" title="Discharge Medication" badge={`${portalDischargeMeds.length} Prescribed`} />
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[750px] text-left text-[10px]">
                          <thead className="border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-400">
                            <tr>
                              <th className="w-12 px-6 py-4 text-center font-bold text-gray-900">#</th>
                              <th className="px-6 py-4 font-bold text-gray-900">MEDICATION</th>
                              <th className="px-6 py-4 font-bold text-gray-900">DOSE</th>
                              <th className="px-6 py-4 font-bold text-gray-900">FREQUENCY</th>
                              <th className="px-6 py-4 font-bold text-gray-900">INSTRUCTION</th>
                              <th className="px-6 py-4 font-bold text-gray-900">DURATION</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {portalDischargeMedsLoading ? (
                              <tr>
                                <td colSpan={6} className="px-6 py-6 text-center text-[10px] text-slate-400"><i className="fa-solid fa-circle-notch fa-spin mr-2" />Loading discharge medicines…</td>
                              </tr>
                            ) : portalDischargeMedsError ? (
                              <tr>
                                <td colSpan={6} className="px-6 py-6 text-center text-[10px] text-red-500"><i className="fa-solid fa-triangle-exclamation mr-2" />{portalDischargeMedsError}</td>
                              </tr>
                            ) : portalDischargeMeds.length === 0 ? (
                              <tr>
                                <td colSpan={6} className="px-6 py-6 text-center text-[10px] text-slate-400">{plan?.source_protocol_id ? "No discharge medicines recorded on this patient's regimen protocol yet." : "No regimen protocol linked to this patient's plan yet."}</td>
                              </tr>
                            ) : (
                              portalDischargeMeds.map((item, index) => (
                                <tr key={item.discharge_instruction_id ?? `${item.protocol_id}-${item.drug_sequence ?? index}`} className="transition-colors hover:bg-slate-50">
                                  <td className="px-6 py-4 text-center text-slate-400">{index + 1}</td>
                                  <td className="px-6 py-4 font-bold text-slate-800">{item.medicine_master?.medicine_name ?? "—"}</td>
                                  <td className="px-6 py-4 text-slate-700">{item.patient_dose != null && item.patient_dose !== "" ? `${item.patient_dose} ${item.patient_dose_unit ?? item.medicine_master?.unit ?? ""}`.trim() : "—"}</td>
                                  <td className="px-6 py-4 text-slate-700">{item.frequency || "—"}</td>
                                  <td className="px-6 py-4 text-[10px] text-slate-500">{item.administration_detail || item.comment || "—"}</td>
                                  <td className="px-6 py-4 text-slate-700">{item.duration || "—"}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  </div>

                  {/* Right sidebar */}
                  <aside className="w-full shrink-0 space-y-6 lg:w-80">
                    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                      <h3 className="mb-6 text-[10px] font-bold text-slate-800">Next Appointment</h3>
                      <div className="mb-6 flex items-start">
                        <div className="mr-4 flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#0052cc]">
                          <i className="fa-regular fa-calendar text-[10px]" />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-800">{medCurrentCycleInfo?.date || "—"}</p>
                          <p className="mb-1 text-[10px] text-slate-500">—</p>
                          <p className="text-[10px] font-medium text-[#0052cc]">{medCurrentCycleInfo ? `Cycle ${medCurrentCycleInfo.cycle}` : "—"}</p>
                        </div>
                      </div>
                      <button className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-[10px] font-bold text-slate-800 shadow-sm transition-colors hover:bg-slate-50">
                        Reschedule
                      </button>
                    </section>

                    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                      <div className="mb-6 flex items-center">
                        <i className="fa-regular fa-clock mr-2 text-[#0052cc]" />
                        <h3 className="text-[10px] font-bold text-slate-800">Medication Timeline</h3>
                      </div>
                      <div className="relative space-y-8 pl-4 before:absolute before:inset-y-0 before:left-5 before:w-px before:bg-slate-200">
                        <div className="relative">
                          <span className="absolute -left-6 top-1.5 h-2.5 w-2.5 rounded-full bg-slate-300 ring-4 ring-white" />
                          <p className="mb-0.5 text-[10px] font-bold text-slate-800">—</p>
                          <p className="text-[10px] text-slate-600">No medication administration records found for this patient yet.</p>
                        </div>
                      </div>
                    </section>
                  </aside>
                </div>
              </>
  );
};

export default MedicationsTab;
