import { Pill, Syringe, FlaskConical } from "lucide-react";
import type {
  MedicineOption,
  RegimenProtocolDilutionInput,
  DischargeInstructionInput,
} from "@/api/chemotherapy.api";

// Styling tokens - merged from the mFOLFOX6 "Protocol Builder" mockup:
// soft grey canvas, white cards with hairline borders, muted uppercase grid
// headers, borderless cell inputs that reveal a border on hover/focus.
export const cardCls = "bg-white border border-[#e1e7ee] rounded-2xl overflow-hidden w-full";
export const inputCls =
  "w-full h-10 px-3.5 bg-[#f8fafc] border border-[#dde4ec] rounded-[11px] text-[13.5px] text-[#17212e] placeholder:text-[#a7b2bf] outline-none transition-all duration-150 hover:border-[#c7d2dd] hover:bg-[#f5f8fb] focus:border-[#12335c] focus:bg-white focus:ring-[3px] focus:ring-[#12335c]/15 disabled:bg-[#f1f3f5] disabled:text-[#9aa5b1] disabled:cursor-not-allowed";
export const labelCls = "block text-[12.5px] font-semibold text-[#5b6b7c] mb-[7px]";
export const Req = () => <span className="text-[#c0374a] ml-0.5">*</span>;

export const drawerLabelCls = "block text-xs font-semibold text-slate-700 mb-1.5";
export const drawerInputCls =
  "w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-xs focus:bg-white focus:border-[#12335c] focus:outline-none focus:ring-2 focus:ring-[#12335c]/10 transition disabled:bg-slate-100 disabled:text-slate-400";
export const drawerTextareaCls =
  "w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-xs focus:bg-white focus:border-[#12335c] focus:outline-none focus:ring-2 focus:ring-[#12335c]/10 transition resize-none disabled:bg-slate-100 disabled:text-slate-400";

export const getFormIcon = (form?: string) => {
  const f = (form || "").toLowerCase();
  if (f.includes("inject") || f.includes("infus")) return <Syringe className="w-3 h-3 text-indigo-600 shrink-0" />;
  if (f.includes("tab") || f.includes("cap")) return <Pill className="w-3 h-3 text-emerald-600 shrink-0" />;
  if (f.includes("sol") || f.includes("susp") || f.includes("syr")) return <FlaskConical className="w-3 h-3 text-amber-600 shrink-0" />;
  return <Pill className="w-3 h-3 text-slate-500 shrink-0" />;
};

export interface DilutionDetail {
  dilutionId: string;
  id: string;
  medication: string;
  medicineName?: string;
  brandName?: string;
  form: string;
  dose: string;
  unit: string;
  volume: string;
  volumeUnit: string;
  diluent: string;
}

export const isLegacyDilution = (item: any) =>
  item.drug_role === "SUPPORTIVE" &&
  (item.dosage != null || item.dosage_unit != null) &&
  !item.administration_detail &&
  !item.remarks;

export interface Premed {
  id: string;
  medication: string;
  medicineName?: string;
  brandName?: string;
  form: string;
  dose: string;
  unit: string;
  adminNotes: string;
  remarks: string;
  dilutions?: DilutionDetail[];
}

export interface ChemoPlan {
  id: string;
  medication: string;
  medicineName?: string;
  brandName?: string;
  form: string;
  doseCalc: string;
  dose: string;
  unit: string;
  patientDose?: string;
  patientUnit?: string;
  adminNotes: string;
  toxicity: string;
  remarks: string;
  dilutions?: DilutionDetail[];
}

export interface SupportiveCare {
  id: string;
  medication: string;
  medicineName?: string;
  brandName?: string;
  form: string;
  dose?: string;
  unit?: string;
  adminNotes: string;
  remarks: string;
  dilutions?: DilutionDetail[];
}

export interface PostTreatment {
  id: string;
  form: string;
  medication: string;
  medicineName?: string;
  brandName?: string;
  dose: string;
  unit: string;
  frequency: string;
  instructions: string;
  duration: string;
  durationDays?: string;
  remarks: string;
}

export interface ProtocolDay {
  dayNumber: number;
  protocolDayId?: string;
  sameAsDay?: number;
}

export const emptyPremed = (): Premed => ({ id: "", medication: "", medicineName: "", brandName: "", form: "", dose: "", unit: "", adminNotes: "", remarks: "", dilutions: [] });
export const emptyChemo = (): ChemoPlan => ({ id: "", medication: "", medicineName: "", brandName: "", form: "", doseCalc: "", dose: "", unit: "", adminNotes: "", toxicity: "", remarks: "", dilutions: [] });
export const emptySupportive = (): SupportiveCare => ({ id: "", medication: "", medicineName: "", brandName: "", form: "", dose: "", unit: "", adminNotes: "", remarks: "", dilutions: [] });
export const emptyDilution = (): DilutionDetail => ({ dilutionId: "", id: "", medication: "", medicineName: "", brandName: "", form: "", dose: "", unit: "", volume: "", volumeUnit: "", diluent: "" });
export const emptyPost = (): PostTreatment => ({ id: "", form: "", medication: "", medicineName: "", brandName: "", dose: "", unit: "", frequency: "", instructions: "", duration: "", durationDays: "D", remarks: "" });

export const getDurationUnitCode = (unit?: string | null): string => {
  if (!unit) return "D";
  const u = unit.trim().toLowerCase();
  if (u === "d" || u === "day" || u === "days" || u === "day's") return "D";
  if (u === "wk" || u === "wks" || u === "week" || u === "weeks" || u === "week's") return "Wk";
  if (u === "mo" || u === "mos" || u === "month" || u === "months" || u === "month's") return "Mo";
  return unit;
};

export const getDurationUnitOptions = (
  durationValue: string | number | undefined | null,
  currentUnit?: string | null
) => {
  const num = parseInt(String(durationValue ?? "").trim(), 10);
  const isSingular = num === 1;
  const options = [
    { value: "D", label: isSingular ? "Day" : "Days" },
    { value: "Wk", label: isSingular ? "Week" : "Weeks" },
    { value: "Mo", label: isSingular ? "Month" : "Months" },
  ];
  const unit = currentUnit?.trim();
  if (unit) {
    const code = getDurationUnitCode(unit);
    if (!options.some((o) => o.value === code)) {
      options.push({ value: unit, label: unit });
    }
  }
  return options;
};

export const DOSAGE_FORM_OPTIONS = [
  "Injection",
  "Infusion",
  "Tablet",
  "Capsule",
  "Oral Solution",
  "Oral Suspension",
  "Cream",
  "Gel",
  "Ointment",
  "Powder for Injection",
  "Powder for Infusion",
  "Concentrate for Infusion",
];

// Legacy protocol items store the role name in drug_type; a real dosage form
// replaces that value while drug_role keeps PREMEDICATION/PRIMARY/SUPPORTIVE.
const ROLE_DRUG_TYPES = new Set(["PREMEDICATION", "PRIMARY", "SUPPORTIVE"]);
export const formFromDrugType = (drugType?: string | null): string =>
  drugType && !ROLE_DRUG_TYPES.has(drugType) ? drugType : "";

export const OTHERS_LABEL = "Others";
/* FORM / MEDICATION / BRAND no longer offer "Others" - a typed value that
   matches no option is offered as "+ Add" instead (allowCreate). Any
   "Others" still supplied by a master list is stripped here. */
export const stripOthersStr = (opts: string[]): string[] =>
  opts.filter((o) => o !== OTHERS_LABEL);
export function stripOthersOpts<T extends { label: string; value: string }>(
  opts: T[],
): T[] {
  return opts.filter((o) => o.label !== OTHERS_LABEL && o.value !== OTHERS_LABEL);
}

export const PROTOCOL_OTHERS_INPUT_CLS =
  "w-full h-9 pl-3 pr-8 bg-[#f8fafc] border border-[#dde4ec] rounded-[11px] text-[13.5px] text-[#17212e] placeholder:text-[#a7b2bf] outline-none transition-all duration-150 hover:border-[#c7d2dd] hover:bg-[#f5f8fb] focus:border-[#12335c] focus:bg-white focus:ring-3 focus:ring-[#12335c]/15 disabled:bg-[#f1f3f5] disabled:text-[#9aa5b1] disabled:cursor-not-allowed";

export const DOSE_CALC_OPTIONS = [
  "BSA (mg/m²)",
  "Weight (mg/kg)",
  "AUC (Calvert)",
  "Fixed Dose",
  "BSA",
  "IBW",
  "BMI",
  "AUC 1.5",
  "AUC 2",
  "AUC 5",
  "KG",
];

export const COMMON_PROTOCOL_DOSES = [
  "0.5", "1", "1.5", "2", "2.5", "4", "5", "7.5", "8", "10", "12.5", "15",
  "20", "25", "30", "40", "50", "60", "75", "80", "100", "120", "125", "140",
  "150", "160", "200", "210", "250", "300", "350", "400", "450", "500", "600",
  "750", "800", "1000", "1200", "1400", "1500", "2000", "2500", "3000", "3500", "4000",
];

export const PROTOCOL_FREQUENCY_OPTIONS = [
  "0-0-1", "0-1-0", "1-0-0", "0-1-1", "1-0-1", "1-1-0", "1-1-1",
  "0-0-2", "0-2-0", "2-0-0", "0-1-2", "0-2-1", "1-0-2", "1-2-0",
  "2-0-1", "2-1-0", "1-1-2", "1-2-1", "2-1-1", "2-2-1", "2-1-2",
  "1-2-2", "2-2-2", "0-0-0",
  "1-1-1-1", "1-0-0-1", "1-0-1-0", "1-1-0-1", "1-1-1-0", "0-1-1-1",
  "1-0-1-1", "1-1-0-0", "0-1-1-0", "2-0-0-2", "2-0-2-0", "2-2-2-2",
];

export const PROTOCOL_INSTRUCTION_OPTIONS = [
  "Before Food", "After Food", "With Food", "Without Food",
  "Before Breakfast", "After Breakfast", "Before Lunch", "After Lunch",
  "Before Dinner", "After Dinner", "At Bedtime", "Early Morning",
  "Morning", "Afternoon", "Evening", "Night",
  "Empty Stomach", "Between Meals", "With or After Food",
];

export const getMedName = (medId: string | undefined, list: MedicineOption[]) => {
  if (!medId) return "";
  const found = list.find((m) => m.medicine_id === medId);
  return found ? (found.generic_name || found.medicine_name) : medId;
};

export const resolveDilutionMedName = (
  medId: string,
  allAvailableDilutionMeds: { label: string; value: string }[],
  catalogs: MedicineOption[][],
  dilutionRows: DilutionDetail[],
) => {
  if (!medId) return "";
  const found = allAvailableDilutionMeds.find((m) => m.value === medId);
  if (found) return found.label;
  const inCatalog = catalogs.flat().find((m) => m.medicine_id === medId);
  if (inCatalog) return inCatalog.generic_name || inCatalog.medicine_name;
  const inDilutionRows = dilutionRows.find((d) => d.medication === medId);
  return inDilutionRows?.medicineName || medId;
};

export const resolvePostMedName = (
  medId: string,
  medLists: MedicineOption[][],
  postRows: PostTreatment[],
) => {
  if (!medId) return "";
  const found = medLists.flat().find((m) => m.medicine_id === medId);
  if (found) return found.generic_name || found.medicine_name;
  const inPostRows = postRows.find((p) => p.medication === medId);
  return inPostRows?.medicineName || medId;
};

/* Medication options. Groups identical generic_id into a single entry
   so duplicate generic entries are collapsed. Uncatalogued items (GEN_NOT_SPECIFIED)
   or custom typed drugs remain visible as individual items. */
export const getDropdownOptions = (meds: MedicineOption[], selectedVal?: string, fallbackName?: string) => {
  const seenGenerics = new Set<string>();
  const opts: { label: string; value: string }[] = [];

  for (const m of meds) {
    if (m.generic_id && m.generic_id !== "GEN_NOT_SPECIFIED") {
      if (!seenGenerics.has(m.generic_id)) {
        seenGenerics.add(m.generic_id);
        const label = m.generic_name || m.medicine_name;
        opts.push({ label, value: m.medicine_id });
      }
    } else {
      opts.push({ label: m.medicine_name, value: m.medicine_id });
    }
  }

  if (selectedVal && !opts.some((o) => o.value === selectedVal)) {
    const match = meds.find((m) => m.medicine_id === selectedVal || m.medicine_name === selectedVal);
    const cleanLabel = match
      ? (match.generic_name || match.medicine_name)
      : (fallbackName && fallbackName.trim() ? fallbackName.trim() : selectedVal);
    opts.unshift({
      label: cleanLabel,
      value: selectedVal,
    });
  }

  return stripOthersOpts(opts);
};

export type GenericCatalog = Record<
  string,
  { generic_name: string; forms: string[]; brandsByForm: Record<string, string[]> }
>;

/* Form options filtered by the selected medication's generic formulation in the catalog.
   Forms matching the generic appear first, followed by the standard 12 dosage forms. */
export const getFormDropdownOptions = (
  selectedMedication: string | undefined,
  currentForm: string | undefined,
  meds: MedicineOption[] = [],
  genericCatalog: GenericCatalog = {},
) => {
  const med = meds.find((m) => m.medicine_id === selectedMedication || m.medicine_name === selectedMedication);
  const gid = med?.generic_id;
  const formsFromCatalog = (gid && genericCatalog[gid]?.forms) || (med?.dosage_form ? [med.dosage_form] : []);
  const validCatalogForms = formsFromCatalog.filter((f) => DOSAGE_FORM_OPTIONS.includes(f));

  const forms = Array.from(new Set([
    ...validCatalogForms,
    ...DOSAGE_FORM_OPTIONS,
    ...(currentForm ? [currentForm] : []),
  ])).filter(Boolean);

  return stripOthersStr(forms);
};

// Shared DOSE dropdown options: current value + doses used in the section +
// common protocol doses (always searchable/filterable).
export const getDoseDropdownOptions = (rows: Array<{ dose?: string }>, current?: string) => {
  const seen = new Set<string>();
  const opts: string[] = [];
  const push = (v?: string | null) => {
    const t = String(v ?? "").trim();
    if (t && !seen.has(t)) {
      seen.add(t);
      opts.push(t);
    }
  };
  push(current);
  rows.forEach((r) => push(r.dose));
  COMMON_PROTOCOL_DOSES.forEach((d) => push(d));
  return opts;
};

export interface ProtocolFieldOptions {
  dosage_units: string[];
  dilution_forms: string[];
  dilution_dose_units: string[];
  dilution_volume_units: string[];
  diluents: string[];
}

export interface ProtocolItemInput {
  protocol_item_id?: string;
  medicine_id: string;
  medicine_name?: string | null;
  generic_name?: string | null;
  drug_role: string;
  drug_type?: string | null;
  drug_sequence: number;
  dosage?: string | null;
  dosage_unit?: string | null;
  dose_calculation_method?: string | null;
  frequency?: string | null;
  remarks?: string | null;
  patient_dose?: string | null;
  patient_dose_unit?: string | null;
  administration_detail?: string | null;
  previous_toxicity?: string | null;
  drug_brand_name?: string | null;
  administration_day?: number | null;
  dilutions?: RegimenProtocolDilutionInput[];
}

export const buildProtocolItems = ({
  days,
  premedsByDay,
  chemoPlansByDay,
  supportiveByDay,
  premedMeds,
  chemoMeds,
  supportiveMeds,
}: {
  days: ProtocolDay[];
  premedsByDay: Record<number, Premed[]>;
  chemoPlansByDay: Record<number, ChemoPlan[]>;
  supportiveByDay: Record<number, SupportiveCare[]>;
  premedMeds: MedicineOption[];
  chemoMeds: MedicineOption[];
  supportiveMeds: MedicineOption[];
}): ProtocolItemInput[] => {
  const items: ProtocolItemInput[] = [];
  let seq = 1;
  for (const day of days) {
    const dayNum = day.dayNumber;
    for (const row of premedsByDay[dayNum] ?? []) {
      if (!row.medication.trim()) continue;
      items.push({
        protocol_item_id: row.id || undefined,
        medicine_id: row.medication.trim(),
        medicine_name: row.medicineName?.trim() || null,
        generic_name: row.medicineName?.trim() || getMedName(row.medication, premedMeds) || row.medication.trim(),
        drug_brand_name: null,
        drug_role: "PREMEDICATION",
        drug_type: row.form?.trim() || null,
        drug_sequence: seq++,
        patient_dose: row.dose || null,
        patient_dose_unit: row.unit || null,
        administration_detail: row.adminNotes || null,
        remarks: row.remarks || null,
        administration_day: dayNum,
        dilutions: (row.dilutions ?? []).map((d) => ({
          protocol_dilution_id: d.dilutionId || undefined,
          medicine_id: d.medication.trim(),
          drug_brand_name: null,
          form: d.form || null,
          dose: d.dose || null,
          dose_unit: d.unit || null,
          dilution_volume: d.volume || null,
          dilution_volume_unit: d.volumeUnit || null,
          diluent: d.diluent || null,
          comment: d.diluent || null,
        })),
      });
    }
    for (const row of chemoPlansByDay[dayNum] ?? []) {
      if (!row.medication.trim()) continue;
      items.push({
        protocol_item_id: row.id || undefined,
        medicine_id: row.medication.trim(),
        medicine_name: row.medicineName?.trim() || null,
        generic_name: row.medicineName?.trim() || getMedName(row.medication, chemoMeds) || row.medication.trim(),
        drug_brand_name: null,
        drug_role: "PRIMARY",
        drug_type: row.form?.trim() || null,
        drug_sequence: seq++,
        dosage: row.dose || null,
        dosage_unit: row.unit || null,
        patient_dose: row.dose || null,
        patient_dose_unit: row.unit || null,
        dose_calculation_method: row.doseCalc || null,
        previous_toxicity: row.toxicity || null,
        administration_detail: row.adminNotes || null,
        remarks: row.remarks || null,
        administration_day: dayNum,
        dilutions: (row.dilutions ?? []).map((d) => ({
          protocol_dilution_id: d.dilutionId || undefined,
          medicine_id: d.medication.trim(),
          drug_brand_name: null,
          form: d.form || null,
          dose: d.dose || null,
          dose_unit: d.unit || null,
          dilution_volume: d.volume || null,
          dilution_volume_unit: d.volumeUnit || null,
          diluent: d.diluent || null,
          comment: d.diluent || null,
        })),
      });
    }
    for (const row of supportiveByDay[dayNum] ?? []) {
      if (!row.medication.trim()) continue;
      items.push({
        protocol_item_id: row.id || undefined,
        medicine_id: row.medication.trim(),
        medicine_name: row.medicineName?.trim() || null,
        generic_name: row.medicineName?.trim() || getMedName(row.medication, supportiveMeds) || row.medication.trim(),
        drug_brand_name: null,
        drug_role: "SUPPORTIVE",
        drug_type: row.form?.trim() || null,
        drug_sequence: seq++,
        dosage: row.dose || null,
        dosage_unit: row.unit || null,
        administration_detail: row.adminNotes || null,
        remarks: row.remarks || null,
        administration_day: dayNum,
        dilutions: (row.dilutions ?? []).map((d) => ({
          protocol_dilution_id: d.dilutionId || undefined,
          medicine_id: d.medication.trim(),
          drug_brand_name: null,
          form: d.form || null,
          dose: d.dose || null,
          dose_unit: d.unit || null,
          dilution_volume: d.volume || null,
          dilution_volume_unit: d.volumeUnit || null,
          diluent: d.diluent || null,
          comment: d.diluent || null,
        })),
      });
    }
  }
  // NOTE: POST-TREATMENT (ON DISCHARGE) medications are NOT protocol items;
  // they are persisted separately as chemotherapy_discharge_instructions
  // (see buildDischargeInstructions below).
  return items;
};

export const buildDischargeInstructions = (
  post: PostTreatment[],
  resolveName: (medId: string) => string,
): DischargeInstructionInput[] => {
  return post
    .filter((row) => row.medication?.trim())
    .map((row, idx) => ({
      discharge_instruction_id: row.id || undefined,
      medicine_id: row.medication.trim(),
      medicine_name: row.medicineName?.trim() || null,
      generic_name: row.medicineName?.trim() || resolveName(row.medication) || row.medication.trim(),
      drug_brand_name: null,
      drug_sequence: idx + 1,
      drug_from: row.form || null,
      frequency: row.frequency || null,
      duration: row.duration || null,
      duration_days: getDurationUnitCode(row.durationDays) || "D",
      patient_dose: row.dose ? Number(row.dose) : null,
      patient_dose_unit: row.unit || null,
      administration_detail: row.instructions || null,
      comment: row.remarks || null,
    }));
};

export const buildDilutions = (
  dilution: DilutionDetail[],
  resolveName: (medId: string) => string,
): RegimenProtocolDilutionInput[] => {
  return dilution
    .filter((row) => row.medication?.trim())
    .map((row) => ({
      protocol_dilution_id: row.dilutionId || undefined,
      medicine_id: row.medication.trim(),
      medicine_name: row.medicineName?.trim() || null,
      generic_name: row.medicineName?.trim() || resolveName(row.medication) || row.medication.trim(),
      drug_brand_name: null,
      form: row.form || null,
      dose: row.dose || null,
      dose_unit: row.unit || null,
      dilution_volume: row.volume || null,
      dilution_volume_unit: row.volumeUnit || null,
      diluent: row.diluent || null,
      comment: row.diluent || null,
    }));
};

export interface ParsedProtocolItems {
  premedsByDay: Record<number, Premed[]>;
  chemoPlansByDay: Record<number, ChemoPlan[]>;
  supportiveByDay: Record<number, SupportiveCare[]>;
  dilution: DilutionDetail[];
  post: PostTreatment[];
}

export interface ParsedProtocol {
  regimenCode: string;
  regimenName: string;
  treatmentIntent: string;
  cancerTypeIds: string[];
  subtypeIds: string[];
  standardCycles: number;
  cycleIntervalDays: number;
  notes: string;
  days: ProtocolDay[];
  loadedItemIds: string[];
  itemsData?: ParsedProtocolItems;
}

export const parseProtocolPayload = (p: any): ParsedProtocol => {
  const regimenCode = p.regimen_code ?? "";
  const regimenName = p.regimen_name ?? (p as any).original_protocol ?? "";
  const treatmentIntent = p.treatment_intent ?? "";

  const loadedCancerTypeIds = Array.isArray(p.cancer_type_ids) && p.cancer_type_ids.length > 0
    ? p.cancer_type_ids
    : Array.isArray(p.chemotherapy_protocol_cancers) && p.chemotherapy_protocol_cancers.length > 0
      ? Array.from(new Set(p.chemotherapy_protocol_cancers.map((c: any) => c.cancer_type_id).filter(Boolean)))
      : (p.cancer_type_id ? [p.cancer_type_id] : []);

  const loadedSubtypeIds = Array.isArray(p.subtype_ids) && p.subtype_ids.length > 0
    ? p.subtype_ids
    : Array.isArray(p.chemotherapy_protocol_cancers) && p.chemotherapy_protocol_cancers.length > 0
      ? Array.from(new Set(p.chemotherapy_protocol_cancers.map((c: any) => c.subtype_id).filter(Boolean)))
      : (p.subtype_id ? [p.subtype_id] : []);

  const dbDays: any[] = p.chemotherapy_regimen_protocol_days ?? [];
  const items: any[] = p.chemotherapy_regimen_protocol_items ?? [];
  const protocolDilutions: any[] = p.protocol_dilutions ?? [];
  const protocolDischarge: any[] = p.protocol_discharge_instructions ?? p.chemotherapy_discharge_instructions ?? [];
  const uniqueDayNumbers = Array.from(
    new Set(
      dbDays
        .map((d: any) => d.day_number)
        .filter((n: any) => typeof n === "number" && n >= 1)
    )
  ).sort((a: number, b: number) => a - b);
  const maxAdminDay = items.reduce((m: number, x: any) => Math.max(m, x.administration_day ?? 1), 1);
  const numDaysFromDb = Math.max(
    p.no_of_days ?? 1,
    uniqueDayNumbers.length > 0 ? Math.max(...uniqueDayNumbers) : 1
  );
  const dayCount = Math.max(1, Math.min(Math.max(numDaysFromDb, maxAdminDay), 30));
  const loadedDays: ProtocolDay[] = Array.from({ length: dayCount }, (_, i) => {
    const dbDay = dbDays.find((x: any) => x.day_number === i + 1);
    return {
      dayNumber: i + 1,
      protocolDayId: dbDay?.protocol_day_id ?? "",
      sameAsDay: dbDay?.same_as_day_one ? 1 : undefined,
    };
  });
  const loadedItemIds = items.filter((x: any) => x.protocol_item_id).map((x: any) => x.protocol_item_id as string);

  const result: ParsedProtocol = {
    regimenCode,
    regimenName,
    treatmentIntent,
    cancerTypeIds: loadedCancerTypeIds,
    subtypeIds: loadedSubtypeIds,
    standardCycles: p.standard_cycles ?? 6,
    cycleIntervalDays: p.cycle_interval_days ?? p.no_of_days ?? 21,
    notes: p.notes ?? (p as any).guideline_source ?? "",
    days: loadedDays,
    loadedItemIds,
  };

  if (!(items.length || protocolDilutions.length || protocolDischarge.length)) {
    return result;
  }

  const dayOf = (x: any) => Math.min(x.administration_day ?? 1, dayCount);
  const premedsM: Record<number, Premed[]> = {};
  const chemoM: Record<number, ChemoPlan[]> = {};
  const suppM: Record<number, SupportiveCare[]> = {};
  for (const x of items) {
    const dayIndex = dayOf(x);
    if (x.drug_role === "PREMEDICATION") {
      const xs: any[] = x.chemotherapy_protocol_dilutions ?? [];
      (premedsM[dayIndex] = premedsM[dayIndex] ?? []).push({
        id: (x.protocol_item_id as string) ?? "",
        medication: x.medicine_id ?? x.medicine_master?.medicine_name ?? "",
        medicineName: x.generic_name || x.medicine_master?.generic_name || x.medicine_master?.medicine_name || "",
        brandName: x.drug_brand_name ?? "",
        form: formFromDrugType(x.drug_type) || x.medicine_master?.dosage_form || "",
        dose: (x.patient_dose as any) ?? "",
        unit: x.patient_dose_unit ?? "",
        adminNotes: x.administration_detail ?? "",
        remarks: x.remarks ?? "",
        dilutions: xs.map((d) => ({
          dilutionId: (d.protocol_dilution_id as string) ?? "",
          id: (x.protocol_item_id as string) ?? "",
          medication: d.medicine_id ?? x.medicine_id ?? "",
          form: d.form ?? "",
          dose: d.dose != null ? String(d.dose) : "",
          unit: d.dose_unit ?? "",
          volume: d.dilution_volume != null ? String(d.dilution_volume) : "",
          volumeUnit: d.dilution_volume_unit ?? "",
          diluent: d.diluent ?? "",
        })),
      });
    } else if (x.drug_role === "PRIMARY") {
      const xs: any[] = x.chemotherapy_protocol_dilutions ?? [];
      (chemoM[dayIndex] = chemoM[dayIndex] ?? []).push({
        id: (x.protocol_item_id as string) ?? "",
        medication: x.medicine_id ?? "",
        medicineName: x.generic_name || x.medicine_master?.generic_name || x.medicine_master?.medicine_name || "",
        brandName: x.drug_brand_name ?? "",
        form: formFromDrugType(x.drug_type) || x.medicine_master?.dosage_form || "",
        doseCalc: (x as any).dose_calculation_method ?? "",
        dose: (x.dosage != null ? String(x.dosage) : (x.patient_dose != null ? String(x.patient_dose) : "")),
        unit: x.dosage_unit ?? x.patient_dose_unit ?? "",
        adminNotes: x.administration_detail ?? "",
        toxicity: x.previous_toxicity ?? "",
        remarks: x.remarks ?? "",
        dilutions: xs.map((d) => ({
          dilutionId: (d.protocol_dilution_id as string) ?? "",
          id: (x.protocol_item_id as string) ?? "",
          medication: d.medicine_id ?? x.medicine_id ?? "",
          form: d.form ?? "",
          dose: d.dose != null ? String(d.dose) : "",
          unit: d.dose_unit ?? "",
          volume: d.dilution_volume != null ? String(d.dilution_volume) : "",
          volumeUnit: d.dilution_volume_unit ?? "",
          diluent: d.diluent ?? "",
        })),
      });
    } else if (x.drug_role === "SUPPORTIVE") {
      const xs: any[] = x.chemotherapy_protocol_dilutions ?? [];
      if (xs.length) {
        (suppM[dayIndex] = suppM[dayIndex] ?? []).push({
          id: (x.protocol_item_id as string) ?? "",
          medication: x.medicine_id ?? "",
          medicineName: x.generic_name || x.medicine_master?.generic_name || x.medicine_master?.medicine_name || "",
          brandName: x.drug_brand_name ?? "",
          form: formFromDrugType(x.drug_type) || x.medicine_master?.dosage_form || "",
          dose: x.dosage != null ? String(x.dosage) : "",
          unit: x.dosage_unit ?? "",
          adminNotes: x.administration_detail ?? "",
          remarks: x.remarks ?? "",
          dilutions: xs.map((d) => ({
            dilutionId: (d.protocol_dilution_id as string) ?? "",
            id: (x.protocol_item_id as string) ?? "",
            medication: d.medicine_id ?? x.medicine_id ?? "",
            form: d.form ?? "",
            dose: d.dose != null ? String(d.dose) : "",
            unit: d.dose_unit ?? "",
            volume: d.dilution_volume != null ? String(d.dilution_volume) : "",
            volumeUnit: d.dilution_volume_unit ?? "",
            diluent: d.diluent ?? "",
          })),
        });
      } else if (isLegacyDilution(x)) {
        const diluent =
          (x.administration_detail ?? "").trim() ||
          (typeof x.remarks === "string" ? x.remarks.replace(/^Diluent:\s*/i, "").trim() : "");
        (suppM[dayIndex] = suppM[dayIndex] ?? []).push({
          id: (x.protocol_item_id as string) ?? "",
          medication: x.medicine_id ?? "",
          medicineName: x.generic_name || x.medicine_master?.generic_name || x.medicine_master?.medicine_name || "",
          brandName: x.drug_brand_name ?? "",
          form: formFromDrugType(x.drug_type) || x.medicine_master?.dosage_form || "",
          dose: x.dosage != null ? String(x.dosage) : "",
          unit: x.dosage_unit ?? "",
          adminNotes: x.administration_detail ?? "",
          remarks: x.remarks ?? "",
          dilutions: [{
            dilutionId: "",
            id: (x.protocol_item_id as string) ?? "",
            medication: x.medicine_id ?? "",
            form: "",
            dose: x.dosage != null ? String(x.dosage) : "",
            unit: x.dosage_unit ?? "",
            volume: "",
            volumeUnit: "",
            diluent,
          }],
        });
      } else {
        (suppM[dayIndex] = suppM[dayIndex] ?? []).push({
          id: (x.protocol_item_id as string) ?? "",
          medication: x.medicine_id ?? "",
          medicineName: x.generic_name || x.medicine_master?.generic_name || x.medicine_master?.medicine_name || "",
          brandName: x.drug_brand_name ?? "",
          form: formFromDrugType(x.drug_type) || x.medicine_master?.dosage_form || "",
          dose: x.dosage != null ? String(x.dosage) : "",
          unit: x.dosage_unit ?? "",
          adminNotes: x.administration_detail ?? "",
          remarks: x.remarks ?? "",
          dilutions: [],
        });
      }
    }
  }
  // POST-TREATMENT (ON DISCHARGE) medications are persisted in the
  // chemotherapy_discharge_instructions table (surfaced as
  // protocol_discharge_instructions). Protocols created before that
  // switch still carry them as POSTMEDICATION items - fall back to
  // those so nothing disappears on edit.
  const dischargeRows: any[] = protocolDischarge;
  const loadedPost: PostTreatment[] = [];
  if (dischargeRows.length) {
    for (const d of dischargeRows) {
      loadedPost.push({
        id: (d.discharge_instruction_id as string) ?? "",
        form: d.drug_from ?? "Tab",
        medication: d.medicine_id ?? "",
        medicineName: d.generic_name || d.medicine_master?.generic_name || d.medicine_master?.medicine_name || (d.drug_brand_name || ""),
        brandName: d.drug_brand_name ?? "",
        dose: d.patient_dose != null ? String(d.patient_dose) : "",
        unit: d.patient_dose_unit ?? "",
        frequency: d.frequency ?? "",
        instructions: d.administration_detail ?? "",
        duration: d.duration != null ? String(d.duration) : "",
        durationDays: d.duration_days != null ? getDurationUnitCode(String(d.duration_days)) : "D",
        remarks: d.comment ?? "",
      });
    }
  } else {
    for (const x of items.filter((x: any) => x.drug_role === "POSTMEDICATION")) {
      loadedPost.push({
        id: (x.protocol_item_id as string) ?? "",
        form: "Tab",
        medication: x.medicine_id ?? "",
        medicineName: x.generic_name || x.medicine_master?.generic_name || x.medicine_master?.medicine_name || (x.drug_brand_name || ""),
        brandName: x.drug_brand_name ?? "",
        dose: (x.dosage as any) ?? "",
        unit: x.dosage_unit ?? "",
        frequency: x.frequency ?? "",
        instructions: x.administration_detail ?? "",
        duration: x.administration_day != null ? "Day " + x.administration_day : "",
        durationDays: "D",
        remarks: typeof x.remarks === "string" ? x.remarks : "",
      });
    }
  }

  const protoDils: any[] = protocolDilutions;
  const loadedDilutions: DilutionDetail[] = [];
  if (protoDils.length) {
    for (const d of protoDils) {
      loadedDilutions.push({
        dilutionId: (d.protocol_dilution_id as string) ?? "",
        id: (d.protocol_item_id as string) ?? "",
        medication: d.medicine_id ?? "",
        medicineName: d.medicine_master?.medicine_name ?? (d.drug_brand_name || ""),
        brandName: d.drug_brand_name ?? "",
        form: d.form ?? "",
        dose: d.dose != null ? String(d.dose) : "",
        unit: d.dose_unit ?? "",
        volume: d.dilution_volume != null ? String(d.dilution_volume) : "",
        volumeUnit: d.dilution_volume_unit ?? "",
        diluent: d.diluent ?? "",
      });
    }
  } else {
    for (const x of items) {
      for (const d of (x.chemotherapy_protocol_dilutions ?? [])) {
        loadedDilutions.push({
          dilutionId: (d.protocol_dilution_id as string) ?? "",
          id: (d.protocol_item_id as string) ?? "",
          medication: d.medicine_id ?? x.medicine_id ?? "",
          medicineName: d.medicine_master?.medicine_name ?? x?.medicine_master?.medicine_name ?? (d.drug_brand_name || ""),
          brandName: d.drug_brand_name ?? "",
          form: d.form ?? "",
          dose: d.dose != null ? String(d.dose) : "",
          unit: d.dose_unit ?? "",
          volume: d.dilution_volume != null ? String(d.dilution_volume) : "",
          volumeUnit: d.dilution_volume_unit ?? "",
          diluent: d.diluent ?? "",
        });
      }
    }
  }

  result.itemsData = {
    premedsByDay: premedsM,
    chemoPlansByDay: chemoM,
    supportiveByDay: suppM,
    dilution: loadedDilutions.length > 0 ? loadedDilutions : [emptyDilution()],
    post: loadedPost.length > 0 ? loadedPost : [emptyPost()],
  };

  return result;
};
