import type { Dispatch, SetStateAction } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FlaskConical,
  Loader2,
  Pill,
  ShieldPlus,
  Syringe,
  Trash2,
  X,
} from "lucide-react";
import type { MedicineOption } from "@/api/chemotherapy.api";
import {
  inferDosingBasisForMedicine,
  convertUnit,
  convertMassToVolume,
  getRecommendedUnitsForDoseCalc,
} from "@/utils/chemoCalculations";
import { ProtocolSelect } from "./ProtocolSelect";
import {
  DOSE_CALC_OPTIONS,
  PROTOCOL_FREQUENCY_OPTIONS,
  PROTOCOL_INSTRUCTION_OPTIONS,
  Req,
  drawerInputCls,
  drawerLabelCls,
  drawerTextareaCls,
  getDoseDropdownOptions,
  getDropdownOptions,
  getDurationUnitCode,
  getDurationUnitOptions,
  getFormDropdownOptions,
} from "./protocolCore";
import type {
  ChemoPlan,
  DilutionDetail,
  GenericCatalog,
  PostTreatment,
  Premed,
  ProtocolFieldOptions,
  SupportiveCare,
} from "./protocolCore";

export interface DrawerSectionState {
  section: "premeds" | "chemo" | "supportive" | "dilution" | "post";
  index: number;
}

export interface ProtocolDrawerProps {
  activeDrawer: DrawerSectionState | null;
  setActiveDrawer: Dispatch<SetStateAction<DrawerSectionState | null>>;
  disabled: boolean;
  premeds: Premed[];
  setPremeds: (list: Premed[]) => void;
  chemoPlans: ChemoPlan[];
  setChemoPlans: (list: ChemoPlan[]) => void;
  supportive: SupportiveCare[];
  setSupportive: (list: SupportiveCare[]) => void;
  dilution: DilutionDetail[];
  setDilution: (list: DilutionDetail[]) => void;
  post: PostTreatment[];
  setPost: (list: PostTreatment[]) => void;
  premedMeds: MedicineOption[];
  chemoMeds: MedicineOption[];
  supportiveMeds: MedicineOption[];
  dilutionMeds: MedicineOption[];
  dischargeMeds: MedicineOption[];
  loadingPremedMeds: boolean;
  loadingChemoMeds: boolean;
  loadingSupportiveMeds: boolean;
  loadingDilutionMeds: boolean;
  loadingDischargeMeds: boolean;
  fieldOptions: ProtocolFieldOptions;
  genericCatalog: GenericCatalog;
  getMedName: (medId: string | undefined, list: MedicineOption[]) => string;
  getDilutionMedName: (medId?: string) => string;
  getPostMedName: (medId?: string) => string;
  allAvailableDilutionMeds: { label: string; value: string }[];
  savingDrawer: boolean;
  onDone: () => void;
  onDelete: () => void;
  getActiveSectionItemsCount: () => number;
}

export function ProtocolDrawer({
  activeDrawer,
  setActiveDrawer,
  disabled,
  premeds,
  setPremeds,
  chemoPlans,
  setChemoPlans,
  supportive,
  setSupportive,
  dilution,
  setDilution,
  post,
  setPost,
  premedMeds,
  chemoMeds,
  supportiveMeds,
  dilutionMeds,
  dischargeMeds,
  loadingPremedMeds,
  loadingChemoMeds,
  loadingSupportiveMeds,
  loadingDilutionMeds,
  loadingDischargeMeds,
  fieldOptions,
  genericCatalog,
  getMedName,
  getDilutionMedName,
  getPostMedName,
  allAvailableDilutionMeds,
  savingDrawer,
  onDone,
  onDelete,
  getActiveSectionItemsCount,
}: ProtocolDrawerProps) {
  if (!activeDrawer) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden"
      aria-labelledby="slide-over-title"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop blur overlay */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
        onClick={() => setActiveDrawer(null)}
      />

      <div className="fixed inset-y-0 right-0 pl-10 max-w-full flex">
        <div className="w-screen max-w-md sm:max-w-lg bg-white shadow-2xl flex flex-col h-full border-l border-slate-200 animate-in slide-in-from-right duration-200">
          {/* Header */}
          <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-9 h-9 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center font-bold shrink-0">
                {activeDrawer.section === "premeds" && <Pill className="w-4 h-4 text-sky-600" />}
                {activeDrawer.section === "chemo" && <Syringe className="w-4 h-4 text-indigo-600" />}
                {activeDrawer.section === "supportive" && <ShieldPlus className="w-4 h-4 text-emerald-600" />}
                {activeDrawer.section === "dilution" && <FlaskConical className="w-4 h-4 text-amber-600" />}
                {activeDrawer.section === "post" && <ClipboardList className="w-4 h-4 text-rose-600" />}
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-900 truncate">
                  {activeDrawer.section === "premeds" && "Edit Pre-medication Details"}
                  {activeDrawer.section === "chemo" && "Edit Chemotherapy Drug"}
                  {activeDrawer.section === "supportive" && "Edit Supportive Care"}
                  {activeDrawer.section === "dilution" && "Edit Dilution Details"}
                  {activeDrawer.section === "post" && "Edit Discharge Medication"}
                </h3>
                <p className="text-xs text-slate-500 truncate">
                  {activeDrawer.section === "premeds" && (premeds[activeDrawer.index]?.medicineName || getMedName(premeds[activeDrawer.index]?.medication, premedMeds) || `Row #${activeDrawer.index + 1}`)}
                  {activeDrawer.section === "chemo" && (chemoPlans[activeDrawer.index]?.medicineName || getMedName(chemoPlans[activeDrawer.index]?.medication, chemoMeds) || `Row #${activeDrawer.index + 1}`)}
                  {activeDrawer.section === "supportive" && (supportive[activeDrawer.index]?.medicineName || getMedName(supportive[activeDrawer.index]?.medication, supportiveMeds) || `Row #${activeDrawer.index + 1}`)}
                  {activeDrawer.section === "dilution" && (dilution[activeDrawer.index]?.medicineName || getDilutionMedName(dilution[activeDrawer.index]?.medication) || `Row #${activeDrawer.index + 1}`)}
                  {activeDrawer.section === "post" && (post[activeDrawer.index]?.medicineName || getPostMedName(post[activeDrawer.index]?.medication) || `Row #${activeDrawer.index + 1}`)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Stepper Navigation */}
              <div className="flex items-center gap-1 border border-slate-200 rounded-lg bg-white px-1 py-0.5 shadow-2xs">
                <button
                  type="button"
                  disabled={activeDrawer.index <= 0}
                  onClick={() => setActiveDrawer({ ...activeDrawer, index: activeDrawer.index - 1 })}
                  className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition"
                  title="Previous item"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-[11px] font-medium text-slate-500 px-1 font-mono">
                  {activeDrawer.index + 1} / {getActiveSectionItemsCount()}
                </span>
                <button
                  type="button"
                  disabled={activeDrawer.index >= getActiveSectionItemsCount() - 1}
                  onClick={() => setActiveDrawer({ ...activeDrawer, index: activeDrawer.index + 1 })}
                  className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition"
                  title="Next item"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => setActiveDrawer(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
                title="Close drawer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Drawer Body - Scrollable Form Fields */}
          <div className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
            {/* PREMEDS FORM */}
            {activeDrawer.section === "premeds" && premeds[activeDrawer.index] && (() => {
              const row = premeds[activeDrawer.index];
              const idx = activeDrawer.index;
              return (
                <>
                  <div>
                    <label className={drawerLabelCls}>Drug Formulation</label>
                    <ProtocolSelect
                      options={getFormDropdownOptions(row.medication, row.form, premedMeds, genericCatalog)}
                      value={row.form}
                      allowCreate
                      onValueChange={(v) => {
                        const n = [...premeds];
                        n[idx].form = v;
                        setPremeds(n);
                      }}
                      placeholder="Select formulation"
                      emptyMessage="No forms found"
                      disabled={disabled}
                      className="h-9"
                    />
                  </div>

                  <div>
                    <label className={drawerLabelCls}>
                      Medication / Generic Name <Req />
                    </label>
                    <ProtocolSelect
                      editableChip
                      displayValue={row.medicineName || getMedName(row.medication, premedMeds)}
                      onEditValue={(text) => {
                        const n = [...premeds];
                        n[idx].medicineName = text;
                        if (!n[idx].medication) {
                          n[idx].medication = text;
                        }
                        setPremeds(n);
                      }}
                      options={getDropdownOptions(premedMeds, row.medication, row.medicineName)}
                      value={row.medication}
                      allowCreate
                      onValueChange={(v) => {
                        const n = [...premeds];
                        n[idx].medication = v;
                        const med = premedMeds.find((m) => m.medicine_id === v);
                        const gid = med?.generic_id;
                        const availableForms = (gid && genericCatalog[gid]?.forms) || (med?.dosage_form ? [med.dosage_form] : []);
                        if (availableForms.length === 1 && !n[idx].form) {
                          n[idx].form = availableForms[0];
                        } else if (!n[idx].form && med?.dosage_form) {
                          n[idx].form = med.dosage_form;
                        }
                        if (med) {
                          n[idx].medicineName = med.generic_name || med.medicine_name;
                        } else if (v) {
                          n[idx].medicineName = v;
                        }
                        setPremeds(n);
                      }}
                      placeholder={
                        loadingPremedMeds
                          ? "Loading premedications..."
                          : "Select or type generic medication"
                      }
                      emptyMessage="No premedications found"
                      loading={loadingPremedMeds}
                      disabled={disabled}
                      className="h-9"
                    />
                  </div>

                  {/* Brand Name field cleared from UI per clinical protocol design */}
                  <div>
                    <label className={drawerLabelCls}>Dosage & Unit</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <ProtocolSelect
                        options={getDoseDropdownOptions(premeds, row.dose)}
                        value={row.dose}
                        onValueChange={(v) => {
                          const n = [...premeds];
                          n[idx].dose = v;
                          setPremeds(n);
                        }}
                        placeholder="Dose"
                        emptyMessage="No dose options"
                        disabled={disabled}
                        className="h-9"
                      />
                      <ProtocolSelect
                        options={Array.from(new Set([...fieldOptions.dosage_units, row.unit].filter(Boolean)))}
                        value={row.unit}
                        onValueChange={(v) => {
                          const n = [...premeds];
                          n[idx].unit = v;
                          setPremeds(n);
                        }}
                        placeholder="Unit"
                        emptyMessage="No units found"
                        disabled={disabled}
                        className="h-9"
                      />
                    </div>
                  </div>

                  <div>
                    <label className={drawerLabelCls}>Admin Notes</label>
                    <textarea
                      rows={3}
                      value={row.adminNotes}
                      onChange={(e) => {
                        const n = [...premeds];
                        n[idx].adminNotes = e.target.value;
                        setPremeds(n);
                      }}
                      placeholder="e.g. Administer slow IV push over 3-5 mins in 50ml NS"
                      className={drawerTextareaCls}
                      disabled={disabled}
                    />
                  </div>

                  <div>
                    <label className={drawerLabelCls}>Clinical Remarks</label>
                    <textarea
                      rows={2}
                      value={row.remarks}
                      onChange={(e) => {
                        const n = [...premeds];
                        n[idx].remarks = e.target.value;
                        setPremeds(n);
                      }}
                      placeholder="e.g. Pre-chemo antiemetic protocol"
                      className={drawerTextareaCls}
                      disabled={disabled}
                    />
                  </div>
                </>
              );
            })()}

            {/* CHEMOTHERAPY FORM */}
            {activeDrawer.section === "chemo" && chemoPlans[activeDrawer.index] && (() => {
              const row = chemoPlans[activeDrawer.index];
              const idx = activeDrawer.index;
              return (
                <>
                  <div>
                    <label className={drawerLabelCls}>Drug Formulation</label>
                    <ProtocolSelect
                      options={getFormDropdownOptions(row.medication, row.form, chemoMeds, genericCatalog)}
                      value={row.form}
                      allowCreate
                      onValueChange={(v) => {
                        const n = [...chemoPlans];
                        n[idx].form = v;
                        setChemoPlans(n);
                      }}
                      placeholder="Select form"
                      emptyMessage="No forms found"
                      disabled={disabled}
                      className="h-9"
                    />
                  </div>

                  <div>
                    <label className={drawerLabelCls}>
                      Chemotherapy Medicine (Generic Name) <Req />
                    </label>
                    <ProtocolSelect
                      editableChip
                      displayValue={row.medicineName || getMedName(row.medication, chemoMeds)}
                      onEditValue={(text) => {
                        const n = [...chemoPlans];
                        n[idx].medicineName = text;
                        if (!n[idx].medication) {
                          n[idx].medication = text;
                        }
                        setChemoPlans(n);
                      }}
                      options={getDropdownOptions(chemoMeds, row.medication, row.medicineName)}
                      value={row.medication}
                      allowCreate
                      onValueChange={(v) => {
                        const n = [...chemoPlans];
                        n[idx].medication = v;
                        const medObj = chemoMeds.find((m) => m.medicine_id === v);
                        if (medObj && !n[idx].doseCalc) {
                          const inferred = inferDosingBasisForMedicine(medObj.medicine_name);
                          if (inferred === "AUC") n[idx].doseCalc = "AUC (Calvert)";
                          else if (inferred === "Weight") n[idx].doseCalc = "Weight (mg/kg)";
                          else n[idx].doseCalc = "BSA (mg/m²)";
                        }
                        const gid = medObj?.generic_id;
                        const availableForms = (gid && genericCatalog[gid]?.forms) || (medObj?.dosage_form ? [medObj.dosage_form] : []);
                        if (availableForms.length === 1 && !n[idx].form) {
                          n[idx].form = availableForms[0];
                        } else if (!n[idx].form && medObj?.dosage_form) {
                          n[idx].form = medObj.dosage_form;
                        }
                        if (medObj) {
                          n[idx].medicineName = medObj.generic_name || medObj.medicine_name;
                        } else if (v) {
                          n[idx].medicineName = v;
                        }
                        setChemoPlans(n);
                      }}
                      placeholder={
                        loadingChemoMeds
                          ? "Loading chemo drugs..."
                          : "Select or type chemo generic drug"
                      }
                      emptyMessage="No chemo medicines found"
                      loading={loadingChemoMeds}
                      disabled={disabled}
                      className="h-9"
                    />
                  </div>

                  {/* Brand Name field cleared from UI per clinical protocol design */}
                  <div>
                    <label className={drawerLabelCls}>Dose Calculation Basis</label>
                    <ProtocolSelect
                      options={DOSE_CALC_OPTIONS}
                      value={row.doseCalc}
                      onValueChange={(v) => {
                        const n = [...chemoPlans];
                        n[idx].doseCalc = v;
                        const recommended = getRecommendedUnitsForDoseCalc(v);
                        if (!n[idx].unit || v) {
                          n[idx].unit = recommended.unit;
                        }
                        setChemoPlans(n);
                      }}
                      placeholder="Select dose calc"
                      disabled={disabled}
                      className="h-9"
                    />
                  </div>

                  <div>
                    <label className={drawerLabelCls}>Protocol Dose & Unit</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <ProtocolSelect
                        options={getDoseDropdownOptions(chemoPlans, row.dose)}
                        value={row.dose}
                        onValueChange={(v) => {
                          const n = [...chemoPlans];
                          n[idx].dose = v;
                          setChemoPlans(n);
                        }}
                        placeholder="Dose"
                        emptyMessage="No dose options"
                        disabled={disabled}
                        className="h-9"
                      />
                      <ProtocolSelect
                        options={Array.from(new Set([...fieldOptions.dosage_units, row.unit, "mg/m²", "mg/kg", "AUC", "mg", "g", "mcg"].filter(Boolean)))}
                        value={row.unit}
                        onValueChange={(v) => {
                          const n = [...chemoPlans];
                          const oldUnit = n[idx].unit;
                          n[idx].unit = v;
                          const numDose = parseFloat(n[idx].dose);
                          if (!isNaN(numDose) && numDose > 0 && oldUnit && oldUnit !== v) {
                            const converted = convertUnit(numDose, oldUnit, v);
                            if (converted != null) {
                              n[idx].dose = String(converted);
                            }
                          }
                          setChemoPlans(n);
                        }}
                        placeholder="Unit"
                        emptyMessage="No units found"
                        disabled={disabled}
                        className="h-9"
                      />
                    </div>
                  </div>

                  <div>
                    <label className={drawerLabelCls}>Admin Notes</label>
                    <textarea
                      rows={3}
                      value={row.adminNotes}
                      onChange={(e) => {
                        const n = [...chemoPlans];
                        n[idx].adminNotes = e.target.value;
                        setChemoPlans(n);
                      }}
                      placeholder="e.g. Infuse over 2 hours in 500ml D5W. Protect from light."
                      className={drawerTextareaCls}
                      disabled={disabled}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={drawerLabelCls}>Previous Toxicity</label>
                      <input
                        type="text"
                        value={row.toxicity}
                        onChange={(e) => {
                          const n = [...chemoPlans];
                          n[idx].toxicity = e.target.value;
                          setChemoPlans(n);
                        }}
                        placeholder="e.g. Neuropathy grade 1"
                        className={drawerInputCls}
                        disabled={disabled}
                      />
                    </div>
                    <div>
                      <label className={drawerLabelCls}>Clinical Remarks</label>
                      <input
                        type="text"
                        value={row.remarks}
                        onChange={(e) => {
                          const n = [...chemoPlans];
                          n[idx].remarks = e.target.value;
                          setChemoPlans(n);
                        }}
                        placeholder="Remarks"
                        className={drawerInputCls}
                        disabled={disabled}
                      />
                    </div>
                  </div>
                </>
              );
            })()}

            {/* SUPPORTIVE CARE FORM */}
            {activeDrawer.section === "supportive" && supportive[activeDrawer.index] && (() => {
              const row = supportive[activeDrawer.index];
              const idx = activeDrawer.index;
              return (
                <>
                  <div>
                    <label className={drawerLabelCls}>Drug Formulation</label>
                    <ProtocolSelect
                      options={getFormDropdownOptions(row.medication, row.form, supportiveMeds, genericCatalog)}
                      value={row.form}
                      allowCreate
                      onValueChange={(v) => {
                        const n = [...supportive];
                        n[idx].form = v;
                        setSupportive(n);
                      }}
                      placeholder="Select form"
                      emptyMessage="No forms found"
                      disabled={disabled}
                      className="h-9"
                    />
                  </div>

                  <div>
                    <label className={drawerLabelCls}>
                      Supportive Medicine (Generic Name) <Req />
                    </label>
                    <ProtocolSelect
                      editableChip
                      displayValue={row.medicineName || getMedName(row.medication, supportiveMeds)}
                      onEditValue={(text) => {
                        const n = [...supportive];
                        n[idx].medicineName = text;
                        if (!n[idx].medication) {
                          n[idx].medication = text;
                        }
                        setSupportive(n);
                      }}
                      options={getDropdownOptions(supportiveMeds, row.medication, row.medicineName)}
                      value={row.medication}
                      allowCreate
                      onValueChange={(v) => {
                        const n = [...supportive];
                        n[idx].medication = v;
                        const med = supportiveMeds.find((m) => m.medicine_id === v);
                        const gid = med?.generic_id;
                        const availableForms = (gid && genericCatalog[gid]?.forms) || (med?.dosage_form ? [med.dosage_form] : []);
                        if (availableForms.length === 1 && !n[idx].form) {
                          n[idx].form = availableForms[0];
                        } else if (!n[idx].form && med?.dosage_form) {
                          n[idx].form = med.dosage_form;
                        }
                        if (med) {
                          n[idx].medicineName = med.generic_name || med.medicine_name;
                        } else if (v) {
                          n[idx].medicineName = v;
                        }
                        setSupportive(n);
                      }}
                      placeholder={
                        loadingSupportiveMeds
                          ? "Loading supportive drugs..."
                          : "Select or type supportive drug (Generic)"
                      }
                      emptyMessage="No supportive medicines found"
                      loading={loadingSupportiveMeds}
                      disabled={disabled}
                      className="h-9"
                    />
                  </div>

                  {/* Brand Name field cleared from UI per clinical protocol design */}
                  <div>
                    <label className={drawerLabelCls}>Dosage & Unit</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <ProtocolSelect
                        options={getDoseDropdownOptions(supportive, row.dose)}
                        value={row.dose ?? ""}
                        onValueChange={(v) => {
                          const n = [...supportive];
                          n[idx].dose = v;
                          setSupportive(n);
                        }}
                        placeholder="Dose"
                        emptyMessage="No dose options"
                        disabled={disabled}
                        className="h-9"
                      />
                      <ProtocolSelect
                        options={Array.from(new Set([...fieldOptions.dosage_units, row.unit].filter(Boolean)))}
                        value={row.unit ?? ""}
                        onValueChange={(v) => {
                          const n = [...supportive];
                          n[idx].unit = v;
                          setSupportive(n);
                        }}
                        placeholder="Unit"
                        emptyMessage="No units found"
                        disabled={disabled}
                        className="h-9"
                      />
                    </div>
                  </div>

                  <div>
                    <label className={drawerLabelCls}>Admin Notes</label>
                    <textarea
                      rows={3}
                      value={row.adminNotes}
                      onChange={(e) => {
                        const n = [...supportive];
                        n[idx].adminNotes = e.target.value;
                        setSupportive(n);
                      }}
                      placeholder="e.g. Take with food or as directed"
                      className={drawerTextareaCls}
                      disabled={disabled}
                    />
                  </div>

                  <div>
                    <label className={drawerLabelCls}>Clinical Remarks</label>
                    <textarea
                      rows={2}
                      value={row.remarks}
                      onChange={(e) => {
                        const n = [...supportive];
                        n[idx].remarks = e.target.value;
                        setSupportive(n);
                      }}
                      placeholder="Clinical remarks"
                      className={drawerTextareaCls}
                      disabled={disabled}
                    />
                  </div>
                </>
              );
            })()}

            {/* DILUTION FORM */}
            {activeDrawer.section === "dilution" && dilution[activeDrawer.index] && (() => {
              const row = dilution[activeDrawer.index];
              const idx = activeDrawer.index;
              return (
                <>
                  <div>
                    <label className={drawerLabelCls}>Drug Formulation</label>
                    <ProtocolSelect
                      options={getFormDropdownOptions(row.medication, row.form, dilutionMeds, genericCatalog)}
                      value={row.form}
                      allowCreate
                      onValueChange={(v) => {
                        const n = [...dilution];
                        n[idx].form = v;
                        setDilution(n);
                      }}
                      placeholder="Select form"
                      emptyMessage="No forms found"
                      disabled={disabled}
                      className="h-9"
                    />
                  </div>

                  <div>
                    <label className={drawerLabelCls}>Medication / Generic Name</label>
                    <ProtocolSelect
                      editableChip
                      displayValue={row.medicineName || getDilutionMedName(row.medication)}
                      onEditValue={(text) => {
                        const n = [...dilution];
                        n[idx].medicineName = text;
                        if (!n[idx].medication) {
                          n[idx].medication = text;
                        }
                        setDilution(n);
                      }}
                      options={allAvailableDilutionMeds}
                      value={row.medication}
                      allowCreate
                      onValueChange={(v) => {
                        const n = [...dilution];
                        n[idx].medication = v;
                        const med = dilutionMeds.find((m) => m.medicine_id === v) || chemoMeds.find((m) => m.medicine_id === v) || premedMeds.find((m) => m.medicine_id === v);
                        const gid = med?.generic_id;
                        const availableForms = (gid && genericCatalog[gid]?.forms) || (med?.dosage_form ? [med.dosage_form] : []);
                        if (availableForms.length === 1 && !n[idx].form) {
                          n[idx].form = availableForms[0];
                        } else if (!n[idx].form && med?.dosage_form) {
                          n[idx].form = med.dosage_form;
                        }
                        if (med) {
                          n[idx].medicineName = med.generic_name || med.medicine_name;
                        } else if (v) {
                          n[idx].medicineName = v;
                        }
                        setDilution(n);
                      }}
                      placeholder={loadingDilutionMeds ? "Loading medicines..." : "Select medicine"}
                      emptyMessage="No medicines found"
                      loading={loadingDilutionMeds}
                      disabled={disabled}
                      className="h-9"
                    />
                  </div>

                  {/* Brand Name field cleared from UI per clinical protocol design */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={drawerLabelCls}>Dose & Unit</label>
                      <div className="grid grid-cols-2 gap-1.5">
                        <ProtocolSelect
                          options={getDoseDropdownOptions(dilution, row.dose)}
                          value={row.dose}
                          onValueChange={(v) => {
                            const n = [...dilution];
                            n[idx].dose = v;
                            const numDose = parseFloat(v);
                            if (!isNaN(numDose) && numDose > 0 && n[idx].unit) {
                              const vol = convertMassToVolume(numDose, n[idx].unit, n[idx].volumeUnit || "CC");
                              if (vol != null) {
                                n[idx].volume = String(vol);
                                if (!n[idx].volumeUnit) n[idx].volumeUnit = "CC";
                              }
                            }
                            setDilution(n);
                          }}
                          placeholder="Dose"
                          emptyMessage="No dose options"
                          disabled={disabled}
                          className="h-9"
                        />
                        <ProtocolSelect
                          options={Array.from(new Set([...fieldOptions.dilution_dose_units, row.unit, "mg", "g", "mcg", "kg"].filter(Boolean)))}
                          value={row.unit}
                          onValueChange={(v) => {
                            const n = [...dilution];
                            const oldUnit = n[idx].unit;
                            n[idx].unit = v;
                            const numDose = parseFloat(n[idx].dose);
                            if (!isNaN(numDose) && numDose > 0) {
                              if (oldUnit && oldUnit !== v) {
                                const convertedDose = convertUnit(numDose, oldUnit, v);
                                if (convertedDose != null) {
                                  n[idx].dose = String(convertedDose);
                                }
                              }
                              const currentDose = parseFloat(n[idx].dose) || numDose;
                              const vol = convertMassToVolume(currentDose, v, n[idx].volumeUnit || "CC");
                              if (vol != null) {
                                n[idx].volume = String(vol);
                                if (!n[idx].volumeUnit) n[idx].volumeUnit = "CC";
                              }
                            }
                            setDilution(n);
                          }}
                          placeholder="Unit"
                          emptyMessage="No units found"
                          disabled={disabled}
                          className="h-9"
                        />
                      </div>
                    </div>

                    <div>
                      <label className={drawerLabelCls}>Dilution Volume & Unit</label>
                      <div className="grid grid-cols-2 gap-1.5">
                        <input
                          type="text"
                          value={row.volume}
                          onChange={(e) => {
                            const n = [...dilution];
                            n[idx].volume = e.target.value;
                            setDilution(n);
                          }}
                          placeholder="100"
                          className={drawerInputCls}
                          disabled={disabled}
                        />
                        <ProtocolSelect
                          options={Array.from(new Set([...fieldOptions.dilution_volume_units, row.volumeUnit, "CC", "mL", "L"].filter(Boolean)))}
                          value={row.volumeUnit}
                          onValueChange={(v) => {
                            const n = [...dilution];
                            const oldVolUnit = n[idx].volumeUnit;
                            n[idx].volumeUnit = v;
                            const numVol = parseFloat(n[idx].volume);
                            if (!isNaN(numVol) && numVol > 0 && oldVolUnit && oldVolUnit !== v) {
                              const convertedVol = convertUnit(numVol, oldVolUnit, v);
                              if (convertedVol != null) {
                                n[idx].volume = String(convertedVol);
                              }
                            }
                            setDilution(n);
                          }}
                          placeholder="Unit"
                          emptyMessage="No units found"
                          disabled={disabled}
                          className="h-9"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className={drawerLabelCls}>Diluent</label>
                    <ProtocolSelect
                      options={fieldOptions.diluents}
                      value={row.diluent}
                      onValueChange={(v) => {
                        const n = [...dilution];
                        n[idx].diluent = v;
                        setDilution(n);
                      }}
                      placeholder="Select diluent"
                      emptyMessage="No diluents found"
                      disabled={disabled}
                      className="h-9"
                    />
                  </div>
                </>
              );
            })()}

            {/* POST-TREATMENT (DISCHARGE) FORM */}
            {activeDrawer.section === "post" && post[activeDrawer.index] && (() => {
              const row = post[activeDrawer.index];
              const idx = activeDrawer.index;
              const isDurationFilledWithNumber = /^\d+(\.\d+)?$/.test(String(row.duration ?? "").trim());
              return (
                <>
                  <div>
                    <label className={drawerLabelCls}>Drug Formulation</label>
                    <ProtocolSelect
                      options={getFormDropdownOptions(row.medication, row.form, dischargeMeds.length > 0 ? dischargeMeds : premedMeds, genericCatalog)}
                      value={row.form}
                      allowCreate
                      onValueChange={(v) => {
                        const n = [...post];
                        n[idx].form = v;
                        setPost(n);
                      }}
                      placeholder="Select form"
                      emptyMessage="No forms found"
                      disabled={disabled}
                      className="h-9"
                    />
                  </div>

                  <div>
                    <label className={drawerLabelCls}>Medication / Generic Name (On Discharge) <Req /></label>
                    <ProtocolSelect
                      editableChip
                      displayValue={row.medicineName || getPostMedName(row.medication)}
                      onEditValue={(text) => {
                        const n = [...post];
                        n[idx].medicineName = text;
                        if (!n[idx].medication) {
                          n[idx].medication = text;
                        }
                        setPost(n);
                      }}
                      options={getDropdownOptions(dischargeMeds.length > 0 ? dischargeMeds : premedMeds, row.medication, row.medicineName)}
                      value={row.medication}
                      allowCreate
                      onValueChange={(v) => {
                        const n = [...post];
                        n[idx].medication = v;
                        const medList = dischargeMeds.length > 0 ? dischargeMeds : premedMeds;
                        const med = medList.find((m) => m.medicine_id === v) || chemoMeds.find((m) => m.medicine_id === v);
                        const gid = med?.generic_id;
                        const availableForms = (gid && genericCatalog[gid]?.forms) || (med?.dosage_form ? [med.dosage_form] : []);
                        if (availableForms.length === 1 && !n[idx].form) {
                          n[idx].form = availableForms[0];
                        } else if (!n[idx].form && med?.dosage_form) {
                          n[idx].form = med.dosage_form;
                        }
                        if (med) {
                          n[idx].medicineName = med.generic_name || med.medicine_name;
                        } else if (v) {
                          n[idx].medicineName = v;
                        }
                        setPost(n);
                      }}
                      placeholder={
                        loadingDischargeMeds
                          ? "Loading discharge drugs..."
                          : "Select or type discharge generic drug"
                      }
                      emptyMessage="No discharge medicines found"
                      loading={loadingDischargeMeds}
                      disabled={disabled}
                      className="h-9"
                    />
                  </div>

                  {/* Brand Name field cleared from UI per clinical protocol design */}
                  <div>
                    <label className={drawerLabelCls}>Dose & Unit</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        type="text"
                        value={row.dose}
                        onChange={(e) => {
                          const n = [...post];
                          n[idx].dose = e.target.value;
                          setPost(n);
                        }}
                        placeholder="e.g. 4"
                        className={drawerInputCls}
                        disabled={disabled}
                      />
                      <input
                        type="text"
                        value={row.unit}
                        onChange={(e) => {
                          const n = [...post];
                          n[idx].unit = e.target.value;
                          setPost(n);
                        }}
                        placeholder="e.g. mg"
                        className={drawerInputCls}
                        disabled={disabled}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={drawerLabelCls}>Frequency</label>
                      <ProtocolSelect
                        options={Array.from(new Set([...PROTOCOL_FREQUENCY_OPTIONS, row.frequency].filter(Boolean)))}
                        value={row.frequency}
                        allowCreate
                        onValueChange={(v) => {
                          const n = [...post];
                          n[idx].frequency = v;
                          setPost(n);
                        }}
                        placeholder="Select frequency"
                        emptyMessage="No frequency options"
                        disabled={disabled}
                        className="h-9"
                      />
                    </div>
                    <div>
                      <label className={drawerLabelCls}>Duration</label>
                      <div className="grid grid-cols-2 gap-1.5">
                        <ProtocolSelect
                          options={["1", "2", "3", "5", "7", "10", "14", "21", "28"]}
                          value={row.duration}
                          allowCreate
                          onValueChange={(v) => {
                            const n = [...post];
                            n[idx].duration = v;
                            setPost(n);
                          }}
                          placeholder="Duration"
                          emptyMessage="No duration options"
                          disabled={disabled}
                          className="h-9"
                        />
                        <ProtocolSelect
                          options={getDurationUnitOptions(row.duration, row.durationDays)}
                          value={getDurationUnitCode(row.durationDays)}
                          onValueChange={(v) => {
                            const n = [...post];
                            n[idx].durationDays = v;
                            setPost(n);
                          }}
                          placeholder={parseInt(String(row.duration ?? "").trim(), 10) === 1 ? "Day" : "Days"}
                          disabled={disabled || !isDurationFilledWithNumber}
                          className="h-9"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className={drawerLabelCls}>Administration Instructions</label>
                    <ProtocolSelect
                      options={Array.from(new Set([...PROTOCOL_INSTRUCTION_OPTIONS, row.instructions].filter(Boolean)))}
                      value={row.instructions}
                      allowCreate
                      onValueChange={(v) => {
                        const n = [...post];
                        n[idx].instructions = v;
                        setPost(n);
                      }}
                      placeholder="Select or type administration instructions"
                      emptyMessage="No instruction options"
                      disabled={disabled}
                      className="h-9"
                    />
                  </div>

                  <div>
                    <label className={drawerLabelCls}>Clinical Remarks</label>
                    <textarea
                      rows={2}
                      value={row.remarks}
                      onChange={(e) => {
                        const n = [...post];
                        n[idx].remarks = e.target.value;
                        setPost(n);
                      }}
                      placeholder="Remarks"
                      className={drawerTextareaCls}
                      disabled={disabled}
                    />
                  </div>
                </>
              );
            })()}
          </div>

          {/* Drawer Footer */}
          <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
            <div>
              {!disabled && (
                <button
                  type="button"
                  onClick={onDelete}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-lg text-xs font-semibold transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Row</span>
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveDrawer(null)}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-100 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingDrawer}
                onClick={onDone}
                className="px-4 py-2 bg-[#12335c] text-white rounded-lg text-xs font-semibold hover:bg-[#0e2848] shadow-xs transition disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {savingDrawer && <Loader2 className="w-3 h-3 animate-spin" />}
                <span>Done / Save</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
