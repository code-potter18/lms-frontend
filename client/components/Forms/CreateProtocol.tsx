import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  Save,
  Trash2,
  Pill,
  Syringe,
  ShieldPlus,
  FlaskConical,
  ClipboardList,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Check,
  Eye,
  Plus,
  Copy,
  Calculator,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { FormProtocolDropdown } from "@/components/ui/form-protocol-dropdown";
import { FormProtocolMultiSelect } from "@/components/ui/form-protocol-multiselect";
import { ConfirmationDialog } from "@/components/ui/ConfirmationDialog";
import { chemotherapyApi, MedicineOption, RegimenProtocolDilutionInput, DischargeInstructionInput } from "@/api/chemotherapy.api";
import { DoseCalculationModal } from "@/components/chemo/DoseCalculationModal";
import {
  inferDosingBasisForMedicine,
  convertUnit,
  convertMassToVolume,
  getRecommendedUnitsForDoseCalc,
} from "@/utils/chemoCalculations";

// Styling tokens - merged from the mFOLFOX6 "Protocol Builder" mockup:
// soft grey canvas, white cards with hairline borders, muted uppercase grid
// headers, borderless cell inputs that reveal a border on hover/focus.
const cardCls = "bg-white border border-[#e1e7ee] rounded-2xl overflow-hidden w-full";
const inputCls =
  "w-full h-10 px-3.5 bg-[#f8fafc] border border-[#dde4ec] rounded-[11px] text-[13.5px] text-[#17212e] placeholder:text-[#a7b2bf] outline-none transition-all duration-150 hover:border-[#c7d2dd] hover:bg-[#f5f8fb] focus:border-[#12335c] focus:bg-white focus:ring-[3px] focus:ring-[#12335c]/15 disabled:bg-[#f1f3f5] disabled:text-[#9aa5b1] disabled:cursor-not-allowed";
const labelCls = "block text-[12.5px] font-semibold text-[#5b6b7c] mb-[7px]";
const Req = () => <span className="text-[#c0374a] ml-0.5">*</span>;

const drawerLabelCls = "block text-xs font-semibold text-slate-700 mb-1.5";
const drawerInputCls =
  "w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-xs focus:bg-white focus:border-[#12335c] focus:outline-none focus:ring-2 focus:ring-[#12335c]/10 transition disabled:bg-slate-100 disabled:text-slate-400";
const drawerTextareaCls =
  "w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-xs focus:bg-white focus:border-[#12335c] focus:outline-none focus:ring-2 focus:ring-[#12335c]/10 transition resize-none disabled:bg-slate-100 disabled:text-slate-400";

const getFormIcon = (form?: string) => {
  const f = (form || "").toLowerCase();
  if (f.includes("inject") || f.includes("infus")) return <Syringe className="w-3 h-3 text-indigo-600 shrink-0" />;
  if (f.includes("tab") || f.includes("cap")) return <Pill className="w-3 h-3 text-emerald-600 shrink-0" />;
  if (f.includes("sol") || f.includes("susp") || f.includes("syr")) return <FlaskConical className="w-3 h-3 text-amber-600 shrink-0" />;
  return <Pill className="w-3 h-3 text-slate-500 shrink-0" />;
};

const ptGridWrap = "overflow-x-auto w-full px-5 pt-4 scrollbar-hide";
const ptGridBox = "min-w-[1300px] border border-[#edf1f5] rounded-xl bg-white";
const ptGridHead =
  "grid items-center gap-2.5 px-4 py-3 bg-[#f7f9fb] border-b border-[#edf1f5] text-[10.5px] font-bold uppercase tracking-[0.05em] text-[#8a97a6] whitespace-nowrap";
const ptGridRow =
  "grid items-center gap-2.5 px-4 py-3 border-b border-[#edf1f5] last:border-0 hover:bg-[#f8f9fb] transition-colors";
const ptInput =
  "w-full h-[34px] px-2.5 bg-white border border-[#dde4ec] rounded-lg text-[12.5px] text-[#17212e] placeholder:text-[#aeb8c3] transition-all duration-150 hover:border-[#c7d2dd] hover:bg-[#f8fafc] focus:border-[#12335c] focus:bg-white focus:ring-[3px] focus:ring-[#12335c]/15 focus:outline-none disabled:bg-[#f1f3f5] disabled:text-[#5b6b7c] disabled:cursor-not-allowed";

function ProtocolGridTable({
  columns,
  template,
  rows,
  addLabel,
  onAdd,
  disabled,
  addClassName = "text-[#12335c] hover:bg-[#eaf0f7]",
  boxClassName = ptGridBox,
}: {
  columns: string[];
  template: string;
  rows: React.ReactNode[][];
  addLabel: string;
  onAdd: () => void;
  disabled?: boolean;
  addClassName?: string;
  boxClassName?: string;
}) {
  return (
    <>
      <div className={ptGridWrap} style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        <div className={boxClassName}>
          <div className={ptGridHead} style={{ gridTemplateColumns: template }}>
            {columns.map((c, i) => (
              <div key={i} className={`${i === 0 ? "text-center" : ""} whitespace-nowrap`}>
                {c}
              </div>
            ))}
          </div>
          {rows.map((cells, ri) => (
            <div key={ri} className={ptGridRow} style={{ gridTemplateColumns: template }}>
              {cells.map((cell, ci) => (
                <div key={ci} className={ci === 0 ? "text-center font-semibold text-[#8a97a6]" : ""}>
                  {cell}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div
        className={`text-center py-[13px] bg-[#fafbfc] font-bold text-[13px] cursor-pointer border-t border-[#edf1f5] transition-colors ${addClassName}`}
        onClick={() => !disabled && onAdd()}
      >
        {addLabel}
      </div>
    </>
  );
}

interface DilutionDetail {
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

const isLegacyDilution = (item: any) =>
  item.drug_role === "SUPPORTIVE" &&
  (item.dosage != null || item.dosage_unit != null) &&
  !item.administration_detail &&
  !item.remarks;

interface Premed {
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
interface ChemoPlan {
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
interface SupportiveCare {
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
interface PostTreatment {
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

const getDurationUnitCode = (unit?: string | null): string => {
  if (!unit) return "D";
  const u = unit.trim().toLowerCase();
  if (u === "d" || u === "day" || u === "days" || u === "day's") return "D";
  if (u === "wk" || u === "wks" || u === "week" || u === "weeks" || u === "week's") return "Wk";
  if (u === "mo" || u === "mos" || u === "month" || u === "months" || u === "month's") return "Mo";
  return unit;
};

const getDurationUnitOptions = (
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

const DOSAGE_FORM_OPTIONS = [
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
const formFromDrugType = (drugType?: string | null): string =>
  drugType && !ROLE_DRUG_TYPES.has(drugType) ? drugType : "";

const OTHERS_LABEL = "Others";
/* FORM / MEDICATION / BRAND no longer offer "Others" - a typed value that
   matches no option is offered as "+ Add" instead (allowCreate). Any
   "Others" still supplied by a master list is stripped here. */
const stripOthersStr = (opts: string[]): string[] =>
  opts.filter((o) => o !== OTHERS_LABEL);
const stripOthersOpts = <T extends { label: string; value: string }>(
  opts: T[],
): T[] =>
  opts.filter((o) => o.label !== OTHERS_LABEL && o.value !== OTHERS_LABEL);

const PROTOCOL_OTHERS_INPUT_CLS =
  "w-full h-9 pl-3 pr-8 bg-[#f8fafc] border border-[#dde4ec] rounded-[11px] text-[13.5px] text-[#17212e] placeholder:text-[#a7b2bf] outline-none transition-all duration-150 hover:border-[#c7d2dd] hover:bg-[#f5f8fb] focus:border-[#12335c] focus:bg-white focus:ring-3 focus:ring-[#12335c]/15 disabled:bg-[#f1f3f5] disabled:text-[#9aa5b1] disabled:cursor-not-allowed";

type ProtocolSelectOption = string | { label: string; value: string };

interface ProtocolSelectProps {
  options: ProtocolSelectOption[];
  value?: string;
  onValueChange?: (value: string) => void;
  /* Offer a "+ Add '<typed>'" row when the typed text matches no option. */
  allowCreate?: boolean;
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}

function ProtocolSelect({
  options,
  value,
  onValueChange,
  allowCreate,
  placeholder,
  emptyMessage,
  disabled,
  loading,
  className,
}: ProtocolSelectProps) {
  const [othersMode, setOthersMode] = useState(value === OTHERS_LABEL);
  const [customText, setCustomText] = useState("");

  useEffect(() => {
    if (value === OTHERS_LABEL) setOthersMode(true);
  }, [value]);

  if (othersMode && !loading) {
    const shown = value === OTHERS_LABEL ? customText : value ?? "";
    return (
      <div className="relative w-full">
        <input
          value={shown}
          onChange={(e) => {
            const v = e.target.value;
            setCustomText(v);
            onValueChange?.(v === "" ? OTHERS_LABEL : v);
          }}
          placeholder="Type other..."
          disabled={disabled}
          className={`${PROTOCOL_OTHERS_INPUT_CLS} ${className ?? ""}`}
        />
        {!disabled ? (
          <button
            type="button"
            tabIndex={-1}
            aria-label="Back to options"
            onClick={() => {
              setOthersMode(false);
              setCustomText("");
              onValueChange?.("");
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <FormProtocolDropdown
      options={options}
      value={value}
      onValueChange={(v) => {
        if (v === OTHERS_LABEL) {
          setOthersMode(true);
          setCustomText("");
        } else {
          setOthersMode(false);
          setCustomText("");
        }
        onValueChange?.(v);
      }}
      onCreateOption={
        allowCreate && !disabled && !loading
          ? (typed) => {
              setOthersMode(false);
              setCustomText("");
              onValueChange?.(typed);
            }
          : undefined
      }
      placeholder={placeholder}
      emptyMessage={emptyMessage}
      disabled={disabled}
      loading={loading}
      className={className}
    />
  );
}

interface ProtocolMultiSelectProps {
  options: { label: string; value: string; group?: string }[];
  values: string[];
  onValuesChange: (values: string[]) => void;
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}

function ProtocolMultiSelect({
  options,
  values,
  onValuesChange,
  placeholder,
  emptyMessage,
  disabled,
  loading,
  className,
}: ProtocolMultiSelectProps) {
  const [customOpts, setCustomOpts] = useState<{ label: string; value: string }[]>([]);
  const [customText, setCustomText] = useState("");
  const merged = [
    ...options,
    ...customOpts.filter((c) => !options.some((o) => o.value === c.value)),
  ];
  const showOthersInput = values.includes(OTHERS_LABEL);

  const addCustom = () => {
    const t = customText.trim();
    if (!t) return;
    setCustomOpts((prev) => [
      ...prev.filter((c) => c.value !== t),
      { label: t, value: t },
    ]);
    onValuesChange(values.filter((v) => v !== OTHERS_LABEL).concat(t));
    setCustomText("");
  };

  return (
    <div className="w-full">
      <FormProtocolMultiSelect
        options={merged}
        values={values}
        onValuesChange={onValuesChange}
        placeholder={placeholder}
        emptyMessage={emptyMessage}
        disabled={disabled}
        loading={loading}
        className={className}
      />
      {showOthersInput && !disabled ? (
        <div className="flex items-center gap-1.5 mt-1.5">
          <input
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
            placeholder="Type other..."
            className={`${PROTOCOL_OTHERS_INPUT_CLS} flex-1`}
          />
          <button
            type="button"
            onClick={addCustom}
            className="h-9 px-3 rounded-[11px] text-[12.5px] font-semibold bg-[#12335c] text-white hover:bg-[#0d2748] transition-colors focus:outline-none"
          >
            Add
          </button>
          <button
            type="button"
            aria-label="Remove others"
            onClick={() => {
              setCustomText("");
              onValuesChange(values.filter((v) => v !== OTHERS_LABEL));
            }}
            className="h-9 w-9 grid place-items-center rounded-[11px] border border-[#dde4ec] text-gray-400 hover:text-gray-600 hover:bg-[#f5f8fb] transition-colors focus:outline-none"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

const DOSE_CALC_OPTIONS = [
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

export default function CreateProtocol() {
  const navigate = useNavigate();
  const { protocolId } = useParams<{ protocolId: string }>();
  const location = useLocation();
  const { toast } = useToast();

  const isViewMode = location.pathname.includes("/view/");
  const isEditMode = location.pathname.includes("/edit/");
  const isCreateMode = !protocolId && !isViewMode && !isEditMode;
  const disabled = isViewMode;

  // Calculation Modal State
  const [calcModalOpen, setCalcModalOpen] = useState(false);

  // Pattern 5 Slide-Over Drawer State
  const [activeDrawer, setActiveDrawer] = useState<{
    section: "premeds" | "chemo" | "supportive" | "dilution" | "post";
    index: number;
  } | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && activeDrawer !== null) {
        setActiveDrawer(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeDrawer]);

  const getMedName = (medId: string, list: MedicineOption[]) => {
    if (!medId) return "";
    const found = list.find((m) => m.medicine_id === medId);
    return found ? found.medicine_name : medId;
  };

  const getDilutionMedName = (medId: string) => {
    if (!medId) return "";
    const found = allAvailableDilutionMeds.find((m) => m.value === medId);
    if (found) return found.label;
    const inCatalog = chemoMeds.find((m) => m.medicine_id === medId) || dilutionMeds.find((m) => m.medicine_id === medId) || premedMeds.find((m) => m.medicine_id === medId);
    if (inCatalog) return inCatalog.medicine_name;
    const inDilutionRows = dilution.find((d) => d.medication === medId);
    return inDilutionRows?.medicineName || medId;
  };

  const getPostMedName = (medId: string) => {
    if (!medId) return "";
    const medList = [...dischargeMeds, ...premedMeds, ...chemoMeds];
    const found = medList.find((m) => m.medicine_id === medId);
    if (found) return found.medicine_name;
    const inPostRows = post.find((p) => p.medication === medId);
    return inPostRows?.medicineName || medId;
  };

  const getActiveSectionItemsCount = () => {
    if (!activeDrawer) return 0;
    switch (activeDrawer.section) {
      case "premeds": return premeds.length;
      case "chemo": return chemoPlans.length;
      case "supportive": return supportive.length;
      case "dilution": return dilution.length;
      case "post": return post.length;
      default: return 0;
    }
  };

  const handleDeleteFromDrawer = () => {
    if (disabled || !activeDrawer) return;
    const { section, index } = activeDrawer;
    if (section === "premeds") removePremed(index);
    else if (section === "chemo") removeChemoPlan(index);
    else if (section === "supportive") removeSupportive(index);
    else if (section === "dilution") removeDilution(index);
    else if (section === "post") removePost(index);
    setActiveDrawer(null);
  };
  const [calcTargetRow, setCalcTargetRow] = useState<{
    index: number;
    drug: string;
    dose: string;
    doseCalc: string;
  } | null>(null);

  // --- Protocol header fields --- regimen_code = Regime_name, regimen_name = Protocol Title (original_protocol)
  const [regimenCode, setRegimenCode] = useState("");
  const [regimenName, setRegimenName] = useState("");
  const [cancerTypeIds, setCancerTypeIds] = useState<string[]>([]);
  const [subtypeIds, setSubtypeIds] = useState<string[]>([]);
  const [loadingSubtypes, setLoadingSubtypes] = useState(false);
  const [treatmentIntent, setTreatmentIntent] = useState("");
  const [treatmentIntentOptions, setTreatmentIntentOptions] = useState<string[]>([]);
  const [loadingTreatmentIntents, setLoadingTreatmentIntents] = useState(false);
  
  const [standardCycles, setStandardCycles] = useState<number>(6);
  const [cycleIntervalDays, setCycleIntervalDays] = useState<number>(21);
  const [notes, setNotes] = useState("");
  const [days, setDays] = useState<Array<{ dayNumber: number; protocolDayId?: string; sameAsDay?: number }>>([{ dayNumber: 1 }]);
  const [activeDay, setActiveDay] = useState(1);

  const emptyPremed = (): Premed => ({ id: "", medication: "", medicineName: "", brandName: "", form: "", dose: "", unit: "", adminNotes: "", remarks: "", dilutions: [] });
  const emptyChemo = (): ChemoPlan => ({ id: "", medication: "", medicineName: "", brandName: "", form: "", doseCalc: "", dose: "", unit: "", adminNotes: "", toxicity: "", remarks: "", dilutions: [] });
  const emptySupportive = (): SupportiveCare => ({ id: "", medication: "", medicineName: "", brandName: "", form: "", dose: "", unit: "", adminNotes: "", remarks: "", dilutions: [] });
    const emptyDilution = (): DilutionDetail => ({ dilutionId: "", id: "", medication: "", medicineName: "", brandName: "", form: "", dose: "", unit: "", volume: "", volumeUnit: "", diluent: "" });
    const emptyPost = (): PostTreatment => ({ id: "", form: "", medication: "", medicineName: "", brandName: "", dose: "", unit: "", frequency: "", instructions: "", duration: "", durationDays: "D", remarks: "" });

    // Per-day maps for protocol items (each day owns its own rows; preserves
    // administration_day per item so repeated edits never re-stamp items onto
    // a single active day).
    const [premedsByDay, setPremedsByDay] = useState<Record<number, Premed[]>>({ 1: [emptyPremed()] });
    const [chemoPlansByDay, setChemoPlansByDay] = useState<Record<number, ChemoPlan[]>>({ 1: [emptyChemo()] });
    const [supportiveByDay, setSupportiveByDay] = useState<Record<number, SupportiveCare[]>>({ 1: [emptySupportive()] });
    const [dilution, setDilution] = useState<DilutionDetail[]>([emptyDilution()]);
    const [post, setPost] = useState<PostTreatment[]>([emptyPost()]);

  // Active-day views + setters - Pre-medications, Primary Chemo, and Supportive
  // Care are partitioned per day. Dilution Details and Post-treatment (On Discharge)
  // medications are protocol-level (not tied to any administration day).
  const premeds = premedsByDay[activeDay] ?? [];
  const setPremeds = (list: Premed[]) => setPremedsByDay((prev) => ({ ...prev, [activeDay]: list }));
  const chemoPlans = chemoPlansByDay[activeDay] ?? [];
  const setChemoPlans = (list: ChemoPlan[]) => setChemoPlansByDay((prev) => ({ ...prev, [activeDay]: list }));
  const supportive = supportiveByDay[activeDay] ?? [];
  const setSupportive = (list: SupportiveCare[]) => setSupportiveByDay((prev) => ({ ...prev, [activeDay]: list }));

  const [cancerTypes, setCancerTypes] = useState<Array<{ cancer_type_id: string; cancer_type: string }>>([]);
  const [subtypes, setSubtypes] = useState<Array<{ subtype_id: string; subtype_name: string; group?: string }>>([]);
  const [filterByCancerAndSubtype, setFilterByCancerAndSubtype] = useState(true);
  const [allHospitalMeds, setAllHospitalMeds] = useState<MedicineOption[]>([]);
  const [loadingAllMeds, setLoadingAllMeds] = useState(false);
  const [premedMeds, setPremedMeds] = useState<MedicineOption[]>([]);
  const [chemoMeds, setChemoMeds] = useState<MedicineOption[]>([]);
  const [supportiveMeds, setSupportiveMeds] = useState<MedicineOption[]>([]);
  const [dischargeMeds, setDischargeMeds] = useState<MedicineOption[]>([]);
  const [dilutionMeds, setDilutionMeds] = useState<MedicineOption[]>([]);
  const [loadingPremedMeds, setLoadingPremedMeds] = useState(false);
  const [loadingChemoMeds, setLoadingChemoMeds] = useState(false);
  const [loadingSupportiveMeds, setLoadingSupportiveMeds] = useState(false);
  const [loadingDischargeMeds, setLoadingDischargeMeds] = useState(false);
  const [loadingDilutionMeds, setLoadingDilutionMeds] = useState(false);
  const [genericCatalog, setGenericCatalog] = useState<
    Record<string, { generic_name: string; forms: string[]; brandsByForm: Record<string, string[]> }>
  >({});

  /* Medication options. Groups identical generic_id into a single entry
     so duplicate generic entries are collapsed. Uncatalogued items (GEN_NOT_SPECIFIED)
     or custom typed drugs remain visible as individual items. */
  const getDropdownOptions = (meds: MedicineOption[], selectedVal?: string) => {
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
      opts.unshift({
        label: match ? (match.generic_name || match.medicine_name) : selectedVal,
        value: selectedVal,
      });
    }

    return stripOthersOpts(opts);
  };

  /* Form options filtered by the selected medication's generic formulation in the catalog.
     Forms matching the generic appear first, followed by the standard 12 dosage forms. */
  const getFormDropdownOptions = (selectedMedication?: string, currentForm?: string, meds: MedicineOption[] = []) => {
    const med = meds.find((m) => m.medicine_id === selectedMedication);
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

  /* Brand options dynamically filtered by the selected medication's generic AND formulation.
     Always preserves the current/legacy brand so existing protocol data is never lost. */
  const getBrandDropdownOptions = (
    rows: Array<{ brandName?: string }>,
    current: string | undefined,
    meds: MedicineOption[] = [],
    selectedMedId?: string,
    selectedForm?: string,
  ) => {
    const seen = new Set<string>();
    const opts: string[] = [];
    const push = (v?: string | null) => {
      const t = (v ?? "").trim();
      if (t && !seen.has(t)) {
        seen.add(t);
        opts.push(t);
      }
    };

    const med = meds.find((m) => m.medicine_id === selectedMedId);
    const gid = med?.generic_id;
    if (gid && genericCatalog[gid]) {
      const brandsByForm = genericCatalog[gid].brandsByForm;
      if (selectedForm && brandsByForm[selectedForm]) {
        brandsByForm[selectedForm].forEach(push);
      } else {
        Object.values(brandsByForm).flat().forEach(push);
      }
    }

    push(current);
    rows.forEach((r) => push(r.brandName));
    return stripOthersStr(opts);
  };

  const COMMON_PROTOCOL_DOSES = [
    "0.5", "1", "1.5", "2", "2.5", "4", "5", "7.5", "8", "10", "12.5", "15",
    "20", "25", "30", "40", "50", "60", "75", "80", "100", "120", "125", "140",
    "150", "160", "200", "210", "250", "300", "350", "400", "450", "500", "600",
    "750", "800", "1000", "1200", "1400", "1500", "2000", "2500", "3000", "3500", "4000",
  ];

  const PROTOCOL_FREQUENCY_OPTIONS = [
    "0-0-1", "0-1-0", "1-0-0", "0-1-1", "1-0-1", "1-1-0", "1-1-1",
    "0-0-2", "0-2-0", "2-0-0", "0-1-2", "0-2-1", "1-0-2", "1-2-0",
    "2-0-1", "2-1-0", "1-1-2", "1-2-1", "2-1-1", "2-2-1", "2-1-2",
    "1-2-2", "2-2-2", "0-0-0",
    "1-1-1-1", "1-0-0-1", "1-0-1-0", "1-1-0-1", "1-1-1-0", "0-1-1-1",
    "1-0-1-1", "1-1-0-0", "0-1-1-0", "2-0-0-2", "2-0-2-0", "2-2-2-2",
  ];

  const PROTOCOL_INSTRUCTION_OPTIONS = [
    "Before Food", "After Food", "With Food", "Without Food",
    "Before Breakfast", "After Breakfast", "Before Lunch", "After Lunch",
    "Before Dinner", "After Dinner", "At Bedtime", "Early Morning",
    "Morning", "Afternoon", "Evening", "Night",
    "Empty Stomach", "Between Meals", "With or After Food",
  ];

  // Shared DOSE dropdown options: current value + doses used in the section +
  // common protocol doses (always searchable/filterable).
  const getDoseDropdownOptions = (rows: Array<{ dose?: string }>, current?: string) => {
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
  const [fieldOptions, setFieldOptions] = useState<{
    dosage_units: string[];
    dilution_forms: string[];
    dilution_dose_units: string[];
    dilution_volume_units: string[];
    diluents: string[];
  }>({ dosage_units: [], dilution_forms: [], dilution_dose_units: [], dilution_volume_units: [], diluents: [] });
  const loadedItemIdsRef = useRef<string[]>([]);
  const [loadingCancerTypes, setLoadingCancerTypes] = useState(false);
  const [loadingProtocol, setLoadingProtocol] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  const [sections, setSections] = useState({
    premeds: true,
    chemo: true,
    supportive: true,
    dilution: true,
    post: true,
  });
  const toggleSection = (section: keyof typeof sections) => {
    setSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // Fetch cancer types on mount
  useEffect(() => {
    setLoadingCancerTypes(true);
    chemotherapyApi
      .listCancerTypes()
      .then((res) => {
        const data = (res.data as any)?.data ?? res.data;
        if (Array.isArray(data)) setCancerTypes(data);
        else if (Array.isArray((res.data as any)?.data)) setCancerTypes((res.data as any).data);
      })
      .catch(() => {})
      .finally(() => setLoadingCancerTypes(false));
  }, []);

  // Fetch dilution medicines once on mount - NOT filtered by cancer types.
  useEffect(() => {
    setLoadingDilutionMeds(true);
    chemotherapyApi
      .listDilutionMedicines()
      .then((res) => {
        const data = (res.data as any)?.data ?? res.data;
        setDilutionMeds(Array.isArray(data) ? data : []);
      })
      .catch(() => setDilutionMeds([]))
      .finally(() => setLoadingDilutionMeds(false));
  }, []);

  // Fetch distinct option values (FORM / DOSE UNIT / VOLUME UNIT / dosage
  // unit / treatment intents) from the backend for the protocol-builder dropdowns.
  useEffect(() => {
    setLoadingTreatmentIntents(true);
    chemotherapyApi
      .getProtocolFieldOptions()
      .then((res) => {
        const data = (res.data as any)?.data;
        setFieldOptions({
          dosage_units: Array.isArray(data?.dosage_units) ? data.dosage_units : [],
          dilution_forms: Array.isArray(data?.dilution_forms) ? data.dilution_forms : [],
          dilution_dose_units: Array.isArray(data?.dilution_dose_units) ? data.dilution_dose_units : [],
          dilution_volume_units: Array.isArray(data?.dilution_volume_units) ? data.dilution_volume_units : [],
          diluents: Array.isArray(data?.diluents) ? data.diluents : [],
        });
        if (Array.isArray(data?.treatment_intents) && data.treatment_intents.length > 0) {
          setTreatmentIntentOptions(data.treatment_intents);
        } else {
          chemotherapyApi
            .listTreatmentIntents()
            .then((r) => {
              const intents = (r.data as any)?.data ?? r.data;
              if (Array.isArray(intents)) setTreatmentIntentOptions(intents);
            })
            .catch(() => {});
        }
      })
      .catch(() => {
        setFieldOptions({ dosage_units: [], dilution_forms: [], dilution_dose_units: [], dilution_volume_units: [], diluents: [] });
        chemotherapyApi
          .listTreatmentIntents()
          .then((r) => {
            const intents = (r.data as any)?.data ?? r.data;
            if (Array.isArray(intents)) setTreatmentIntentOptions(intents);
          })
          .catch(() => {});
      })
      .finally(() => setLoadingTreatmentIntents(false));

    chemotherapyApi
      .getGenericFormsAndBrands()
      .then((res) => {
        const data = (res.data as any)?.data ?? res.data;
        if (data && typeof data === "object") setGenericCatalog(data);
      })
      .catch((err) => console.error("Failed to load generic forms and brands:", err));
  }, []);

  // Fetch subtypes for all selected cancer types. Subtypes belonging to
  // unselected cancer types are excluded. Prunes any selected subtypeIds
  // that no longer belong to the active cancer types.
  useEffect(() => {
    if (!cancerTypeIds || cancerTypeIds.length === 0) {
      setSubtypes([]);
      setSubtypeIds([]);
      return;
    }
    setLoadingSubtypes(true);
    Promise.all(
      cancerTypeIds.map((typeId) =>
        chemotherapyApi
          .listCancerSubtypes(typeId)
          .then((res) => {
            const data = (res.data as any)?.data ?? res.data;
            const cancerTypeObj = cancerTypes.find((c) => c.cancer_type_id === typeId);
            const list = Array.isArray(data) ? data : [];
            return list.map((s: any) => ({
              ...s,
              group: cancerTypeObj?.cancer_type || "Cancer Subtypes",
            }));
          })
          .catch(() => [])
      )
    )
      .then((results) => {
        const flattened = results.flat();
        const seen = new Map<string, any>();
        for (const s of flattened) {
          if (!seen.has(s.subtype_id)) seen.set(s.subtype_id, s);
        }
        const combined = Array.from(seen.values());
        setSubtypes(combined);
        setSubtypeIds((prev) => prev.filter((id) => combined.some((s) => s.subtype_id === id)));
      })
      .finally(() => setLoadingSubtypes(false));
  }, [cancerTypeIds, cancerTypes]);

  // Fetch all hospital medicines on demand when filter is disabled
  useEffect(() => {
    if (!filterByCancerAndSubtype && allHospitalMeds.length === 0) {
      setLoadingAllMeds(true);
      chemotherapyApi
        .listMedicines()
        .then((res) => {
          const data = (res.data as any)?.data ?? res.data;
          setAllHospitalMeds(Array.isArray(data) ? data : []);
        })
        .catch(() => setAllHospitalMeds([]))
        .finally(() => setLoadingAllMeds(false));
    }
  }, [filterByCancerAndSubtype, allHospitalMeds.length]);

  // Fetch medicines dynamically based on clinical scope:
  // PREMEDICATION, PRIMARY (chemo), SUPPORTIVE, and DISCHARGE (post-treatment).
  useEffect(() => {
    if (!filterByCancerAndSubtype) {
      if (allHospitalMeds.length > 0) {
        setPremedMeds(allHospitalMeds);
        setChemoMeds(allHospitalMeds);
        setSupportiveMeds(allHospitalMeds);
        setDischargeMeds(allHospitalMeds);
      }
      return;
    }

    setLoadingPremedMeds(true);
    chemotherapyApi
      .listMedicinesByRole("PREMEDICATION")
      .then((res) => {
        const data = (res.data as any)?.data ?? res.data;
        setPremedMeds(Array.isArray(data) ? data : []);
      })
      .catch(() => setPremedMeds([]))
      .finally(() => setLoadingPremedMeds(false));

    setLoadingChemoMeds(true);
    chemotherapyApi
      .listMedicinesByRole("PRIMARY")
      .then((res) => {
        const data = (res.data as any)?.data ?? res.data;
        setChemoMeds(Array.isArray(data) ? data : []);
      })
      .catch(() => setChemoMeds([]))
      .finally(() => setLoadingChemoMeds(false));

    setLoadingSupportiveMeds(true);
    chemotherapyApi
      .listMedicinesByRole("SUPPORTIVE")
      .then((res) => {
        const data = (res.data as any)?.data ?? res.data;
        setSupportiveMeds(Array.isArray(data) ? data : []);
      })
      .catch(() => setSupportiveMeds([]))
      .finally(() => setLoadingSupportiveMeds(false));

    setLoadingDischargeMeds(true);
    chemotherapyApi
      .listMedicinesByRole("DISCHARGE")
      .then((res) => {
        const data = (res.data as any)?.data ?? res.data;
        setDischargeMeds(Array.isArray(data) ? data : []);
      })
      .catch(() => setDischargeMeds([]))
      .finally(() => setLoadingDischargeMeds(false));

  }, [filterByCancerAndSubtype, allHospitalMeds]);

  // Load existing protocol for edit/view
  useEffect(() => {
    if (!protocolId || isCreateMode) return;
    setLoadingProtocol(true);
    chemotherapyApi
      .getRegimenProtocol(protocolId)
      .then((res) => {
        const p: any = (res.data as any)?.data ?? res.data;
        if (!p) return;
        setRegimenCode(p.regimen_code ?? "");
        setRegimenName(p.regimen_name ?? (p as any).original_protocol ?? "");
        if (p.treatment_intent) {
          setTreatmentIntent(p.treatment_intent);
          setTreatmentIntentOptions((prev) =>
            prev.includes(p.treatment_intent) ? prev : [p.treatment_intent, ...prev]
          );
        } else {
          setTreatmentIntent("");
        }
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

        setCancerTypeIds(loadedCancerTypeIds);
        setSubtypeIds(loadedSubtypeIds);
        setStandardCycles(p.standard_cycles ?? 6);
        setCycleIntervalDays(p.cycle_interval_days ?? p.no_of_days ?? 21);
        setNotes(p.notes ?? (p as any).guideline_source ?? "");
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
        const loadedDays = Array.from({ length: dayCount }, (_, i) => {
          const dbDay = dbDays.find((x: any) => x.day_number === i + 1);
          return {
            dayNumber: i + 1,
            protocolDayId: dbDay?.protocol_day_id ?? "",
            sameAsDay: dbDay?.same_as_day_one ? 1 : undefined,
          };
        });
        setDays(loadedDays);
        loadedItemIdsRef.current = items.filter((x: any) => x.protocol_item_id).map((x: any) => x.protocol_item_id as string);
        if (items.length || protocolDilutions.length || protocolDischarge.length) {
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
                        medicineName: x.medicine_master?.medicine_name ?? "",
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
                        medicineName: x.medicine_master?.medicine_name ?? "",
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
                          medicineName: x.medicine_master?.medicine_name ?? "",
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
                          medicineName: x.medicine_master?.medicine_name ?? "",
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
                          medicineName: x.medicine_master?.medicine_name ?? "",
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
                        medicineName: d.medicine_master?.medicine_name ?? (d.drug_brand_name || ""),
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
                        medicineName: x.medicine_master?.medicine_name ?? (x.drug_brand_name || ""),
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

                  setPremedsByDay(premedsM);
                  setChemoPlansByDay(chemoM);
                  setSupportiveByDay(suppM);
                  setDilution(loadedDilutions.length > 0 ? loadedDilutions : [emptyDilution()]);
                  setPost(loadedPost.length > 0 ? loadedPost : [emptyPost()]);
                }
      })
      .catch((e: any) => {
        toast({ title: "Failed to load protocol", description: e.response?.data?.message ?? e.message, variant: "destructive" });
      })
      .finally(() => setLoadingProtocol(false));
  }, [protocolId]);

  const isDirty =
    !disabled &&
    (regimenCode.trim() !== "" ||
      regimenName.trim() !== "" ||
      cancerTypeIds.length > 0 ||
      notes.trim() !== "" ||
      days.length > 1 ||
      Object.values(premedsByDay).some((r) => r.some((rd) => rd.medication.trim() !== "")) ||
      Object.values(chemoPlansByDay).some((r) => r.some((rd) => rd.medication.trim() !== "")) ||
      Object.values(supportiveByDay).some((r) => r.some((rd) => rd.medication.trim() !== "")) ||
      dilution.some((r) => r.medication.trim() !== "") ||
      post.some((r) => r.medication.trim() !== ""));

  const handleBack = () => {
    if (isDirty) setShowLeaveConfirm(true);
    else navigate(-1);
  };

  const handleAddDay = () => {
    if (disabled) return;
    const nextNum = days.length + 1;
    setDays([...days, { dayNumber: nextNum }]);
    setPremedsByDay((prev) => ({ ...prev, [nextNum]: [emptyPremed()] }));
    setChemoPlansByDay((prev) => ({ ...prev, [nextNum]: [emptyChemo()] }));
    setSupportiveByDay((prev) => ({ ...prev, [nextNum]: [emptySupportive()] }));
    setActiveDay(nextNum);
  };

  const handleCopyFromDay = (sourceDay: number, targetDay: number) => {
    if (disabled || sourceDay === targetDay) return;

    const srcPremeds = premedsByDay[sourceDay] ?? [];
    const clonedPremeds: Premed[] = srcPremeds.map((p) => ({
      ...p,
      id: "",
      dilutions: (p.dilutions ?? []).map((d) => ({ ...d, dilutionId: "", id: "" })),
    }));

    const srcChemo = chemoPlansByDay[sourceDay] ?? [];
    const clonedChemo: ChemoPlan[] = srcChemo.map((c) => ({
      ...c,
      id: "",
      dilutions: (c.dilutions ?? []).map((d) => ({ ...d, dilutionId: "", id: "" })),
    }));

    const srcSupportive = supportiveByDay[sourceDay] ?? [];
    const clonedSupportive: SupportiveCare[] = srcSupportive.map((s) => ({
      ...s,
      id: "",
      dilutions: (s.dilutions ?? []).map((d) => ({ ...d, dilutionId: "", id: "" })),
    }));

    setPremedsByDay((prev) => ({
      ...prev,
      [targetDay]: clonedPremeds.length > 0 ? clonedPremeds : [emptyPremed()],
    }));
    setChemoPlansByDay((prev) => ({
      ...prev,
      [targetDay]: clonedChemo.length > 0 ? clonedChemo : [emptyChemo()],
    }));
    setSupportiveByDay((prev) => ({
      ...prev,
      [targetDay]: clonedSupportive.length > 0 ? clonedSupportive : [emptySupportive()],
    }));

    setDays((prev) =>
      prev.map((d) => (d.dayNumber === targetDay ? { ...d, sameAsDay: sourceDay } : d))
    );

    toast({
      title: "Medications Copied",
      description: `Copied all medications from Day ${sourceDay} to Day ${targetDay}.`,
    });
  };
  const handleRemoveDay = (dayNumber: number) => {
    if (disabled || days.length === 1) return;
    const filtered = days.filter((d) => d.dayNumber !== dayNumber).map((d, i) => ({ ...d, dayNumber: i + 1 }));
    setDays(filtered);
    const oldNumbers = filtered.map((d) => d.dayNumber);
    const shift = <T,>(map: Record<number, T[]>): Record<number, T[]> =>
      Object.fromEntries(oldNumbers.map((old, i) => [i + 1, map[old] ?? []]));
    setPremedsByDay((prev) => shift(prev));
    setChemoPlansByDay((prev) => shift(prev));
    setSupportiveByDay((prev) => shift(prev));
    if (activeDay === dayNumber) setActiveDay(filtered[0].dayNumber);
    else if (activeDay > dayNumber) setActiveDay(activeDay - 1);
  };

  const buildItems = () => {
      const items: Array<{
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
      }> = [];
      let seq = 1;
      for (const day of days) {
        const dayNum = day.dayNumber;
        for (const row of premedsByDay[dayNum] ?? []) {
          if (!row.medication.trim()) continue;
          items.push({
            protocol_item_id: row.id || undefined,
            medicine_id: row.medication.trim(),
            medicine_name: row.medicineName?.trim() || null,
            generic_name: getMedName(row.medication, premedMeds) || row.medication.trim(),
            drug_brand_name: row.brandName?.trim() || null,
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
              drug_brand_name: d.brandName?.trim() || null,
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
            generic_name: getMedName(row.medication, chemoMeds) || row.medication.trim(),
            drug_brand_name: row.brandName?.trim() || null,
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
              drug_brand_name: d.brandName?.trim() || null,
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
            generic_name: getMedName(row.medication, supportiveMeds) || row.medication.trim(),
            drug_brand_name: row.brandName?.trim() || null,
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
              drug_brand_name: d.brandName?.trim() || null,
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

  const buildDischargeInstructions = (): DischargeInstructionInput[] => {
    return post
      .filter((row) => row.medication?.trim())
      .map((row, idx) => ({
        discharge_instruction_id: row.id || undefined,
        medicine_id: row.medication.trim(),
        medicine_name: row.medicineName?.trim() || null,
        generic_name: getMedName(row.medication, dischargeMeds.length > 0 ? dischargeMeds : premedMeds) || row.medication.trim(),
        drug_brand_name: row.brandName?.trim() || null,
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

  const buildDilutions = (): RegimenProtocolDilutionInput[] => {
    return dilution
      .filter((row) => row.medication?.trim())
      .map((row) => ({
        protocol_dilution_id: row.dilutionId || undefined,
        medicine_id: row.medication.trim(),
        medicine_name: row.medicineName?.trim() || null,
        generic_name: getMedName(row.medication, dilutionMeds.length > 0 ? dilutionMeds : chemoMeds) || row.medication.trim(),
        drug_brand_name: row.brandName?.trim() || null,
        form: row.form || null,
        dose: row.dose || null,
        dose_unit: row.unit || null,
        dilution_volume: row.volume || null,
        dilution_volume_unit: row.volumeUnit || null,
        diluent: row.diluent || null,
        comment: row.diluent || null,
      }));
  };

  const handleSave = async () => {
    if (isViewMode) {
      navigate("/protocol");
      return;
    }
    if (!regimenName.trim()) {
      toast({ title: "Missing required field", description: "Protocol Title (Regimen Name / Original Protocol) is required.", variant: "destructive" });
      return;
    }
    if (cancerTypeIds.length === 0) {
      toast({ title: "Missing required field", description: "Please select at least one cancer type.", variant: "destructive" });
      return;
    }
    const items = buildItems();
    if (items.length === 0) {
      toast({ title: "Missing drugs", description: "Add at least one drug with Medication filled.", variant: "destructive" });
      return;
    }
    const dilutions = buildDilutions();
    const dischargeInstructions = buildDischargeInstructions();
    setIsSubmitting(true);
    try {
      const payload: any = {
        regimen_name: regimenName.trim(),
        original_protocol: regimenName.trim(),
        ...(isEditMode ? { regimen_code: regimenCode.trim() } : {}),
        cancer_type_id: cancerTypeIds[0] || null,
        cancer_type_ids: cancerTypeIds,
        subtype_id: subtypeIds[0] || null,
        subtype_ids: subtypeIds,
        treatment_intent: treatmentIntent.trim() || null,
        standard_cycles: standardCycles || null,
        cycle_interval_days: cycleIntervalDays || null,
        no_of_days: days.length,
        days: days.map((d) => ({
          protocol_day_id: d.protocolDayId || undefined,
          day_number: d.dayNumber,
          same_as_day_one: d.sameAsDay === 1,
        })),
        notes: notes || null,
        items,
        dilutions,
        discharge_instructions: dischargeInstructions,
      };
      let res: any;
      if (isEditMode && protocolId) {
        const headerPayload: any = { ...payload };
        delete headerPayload.items;
        res = await chemotherapyApi.updateRegimenProtocol(protocolId, headerPayload);

        const keptIds = new Set<string>();
        for (const it of items as any[]) {
          const itemPayload: any = { ...it };
          const protocol_item_id: string | undefined = itemPayload.protocol_item_id;
          delete itemPayload.protocol_item_id;
          if (protocol_item_id) {
            keptIds.add(protocol_item_id);
            await chemotherapyApi.updateRegimenProtocolItem(protocolId, protocol_item_id, itemPayload);
          } else {
            await chemotherapyApi.addRegimenProtocolItem(protocolId, itemPayload);
          }
        }
        const removedIds = loadedItemIdsRef.current.filter((id) => !keptIds.has(id));
        for (const id of removedIds) {
          await chemotherapyApi.removeRegimenProtocolItem(protocolId, id);
        }
      } else {
        res = await chemotherapyApi.createRegimenProtocol(payload);
      }
      if ((res.data as any)?.success === false) throw new Error((res.data as any)?.message);
      toast({ title: isEditMode ? "Protocol updated" : "Protocol created", description: `${regimenName} has been ${isEditMode ? "updated" : "saved"} successfully.` });
      navigate("/protocol");
    } catch (error: any) {
      const msg = error.response?.data?.message || error.message || "Failed to save protocol.";
      toast({ title: isEditMode ? "Failed to update protocol" : "Failed to create protocol", description: msg, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const addPremed = () => setPremeds([...premeds, { id: "", medication: "", form: "", dose: "", unit: "", adminNotes: "", remarks: "" }]);
  const removePremed = (idx: number) => setPremeds(premeds.filter((_, i) => i !== idx));
  const addChemoPlan = () =>
    setChemoPlans([...chemoPlans, { id: "", medication: "", form: "", doseCalc: "", dose: "", unit: "", adminNotes: "", toxicity: "", remarks: "" }]);
  const removeChemoPlan = (idx: number) => setChemoPlans(chemoPlans.filter((_, i) => i !== idx));
  const addSupportive = () => setSupportive([...supportive, { id: "", medication: "", form: "", dose: "", unit: "", adminNotes: "", remarks: "" }]);
  const removeSupportive = (idx: number) => setSupportive(supportive.filter((_, i) => i !== idx));
  const addDilution = () => setDilution([...dilution, { dilutionId: "", id: "", medication: "", form: "", dose: "", unit: "", volume: "", volumeUnit: "", diluent: "" }]);
  const removeDilution = (idx: number) => setDilution(dilution.filter((_, i) => i !== idx));
  const addPost = () => setPost([...post, emptyPost()]);
  const removePost = (idx: number) => setPost(post.filter((_, i) => i !== idx));



  const allAvailableDilutionMeds = (() => {
    const map = new Map<string, string>();
    for (const m of dilutionMeds) {
      if (m?.medicine_id && m?.medicine_name) map.set(m.medicine_id, m.medicine_name);
    }
    for (const dayNum of Object.keys(premedsByDay)) {
      for (const row of premedsByDay[Number(dayNum)] ?? []) {
        if (row.medication) {
          const label = row.medicineName || getMedName(row.medication, premedMeds);
          if (label && label !== row.medication) map.set(row.medication, label);
        }
      }
    }
    for (const dayNum of Object.keys(chemoPlansByDay)) {
      for (const row of chemoPlansByDay[Number(dayNum)] ?? []) {
        if (row.medication) {
          const label = row.medicineName || getMedName(row.medication, chemoMeds);
          if (label && label !== row.medication) map.set(row.medication, label);
        }
      }
    }
    for (const dayNum of Object.keys(supportiveByDay)) {
      for (const row of supportiveByDay[Number(dayNum)] ?? []) {
        if (row.medication) {
          const label = row.medicineName || getMedName(row.medication, supportiveMeds);
          if (label && label !== row.medication) map.set(row.medication, label);
        }
      }
    }
    for (const m of chemoMeds) {
      if (m?.medicine_id && m?.medicine_name && !map.has(m.medicine_id)) map.set(m.medicine_id, m.medicine_name);
    }
    for (const m of premedMeds) {
      if (m?.medicine_id && m?.medicine_name && !map.has(m.medicine_id)) map.set(m.medicine_id, m.medicine_name);
    }
    return stripOthersOpts(
      Array.from(map.entries())
        .map(([value, label]) => ({ label, value }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    );
  })();

  const selectedCancerTypeName = cancerTypes
    .filter((c) => cancerTypeIds.includes(c.cancer_type_id))
    .map((c) => c.cancer_type)
    .join(", ") || "—";
  const pageTitle = isViewMode ? "View Protocol" : isEditMode ? "Edit Protocol" : "Create Protocol";
  const pageSubtitle = isViewMode
    ? "View chemotherapy regimen details (read-only)."
    : isEditMode
      ? "Update the existing regimen. Changes will be saved to the same protocol."
      : "Define a new chemotherapy regimen template. All drugs below will be saved as protocol items.";
  const saveLabel = isViewMode ? "Back to Protocols" : isEditMode ? "Update protocol" : "Save protocol";

  if (loadingProtocol) {
    return (
      <div className="min-h-screen bg-[#f4f6f9] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#12335c]" />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-[#f4f6f9] w-full"
      style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}
    >
      <div className="max-w-[1400px] mx-auto w-full px-10 pt-7 pb-16">
        {/* Top Header */}
        <div className="flex justify-between items-start gap-4 mb-[22px] w-full">
          <div className="flex gap-3.5 items-start">
            <button
              onClick={handleBack}
              className="w-[38px] h-[38px] shrink-0 flex items-center justify-center rounded-[11px] border border-transparent hover:bg-white hover:border-[#e1e7ee] text-[#5b6b7c] hover:text-[#12335c] transition-colors mt-0.5"
              aria-label="Go back"
            >
              <ArrowLeft className="w-[19px] h-[19px]" />
            </button>
            <div>
              <h1 className="text-[23px] font-extrabold text-[#17212e] m-0 tracking-[-0.01em]">{pageTitle}</h1>
              <p className="text-[#5b6b7c] text-[13.5px] mt-[5px] max-w-[46ch]">{pageSubtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setCalcTargetRow(null);
                setCalcModalOpen(true);
              }}
              className="bg-white border border-[#dde4ec] text-[#12335c] rounded-xl px-4 py-3 text-[13.5px] font-semibold flex items-center gap-2 shadow-xs hover:bg-[#f8fafc] hover:border-[#c7d2dd] transition-colors whitespace-nowrap"
              title="Open Medicine Dosage Calculator & Clinical Reference Info"
            >
              <Calculator className="h-4 w-4 text-[#12335c]" />
              <span>Calculation Info & Calculator</span>
            </button>
            <button
              onClick={handleSave}
              disabled={isSubmitting}
              className="bg-[#12335c] text-white border-none rounded-xl px-[22px] py-3 text-[13.5px] font-semibold flex items-center gap-2 shadow-[0_1px_2px_rgba(18,51,92,0.15)] hover:bg-[#0e2848] transition-colors disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving...
                </>
              ) : isViewMode ? (
                <>
                  <Eye className="h-4 w-4" /> {saveLabel}
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" /> {saveLabel}
                </>
              )}
            </button>
          </div>
        </div>

        {/* Info Bar - dynamic */}
        <div className="bg-white border border-[#e1e7ee] rounded-2xl px-[26px] py-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-5 w-full">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-[38px] h-[38px] rounded-[11px] bg-[#eaf0f7] flex items-center justify-center text-[#12335c] shrink-0">
              <Pill className="w-[17px] h-[17px]" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-[#17212e] leading-tight truncate">{regimenName || "New Protocol"}</div>
              <div className="text-xs text-[#8a97a6] mt-0.5">Regimen: {regimenCode || "—"}</div>
            </div>
          </div>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-[38px] h-[38px] rounded-[11px] bg-[#eaf0f7] flex items-center justify-center text-[#12335c] shrink-0">
              <ClipboardList className="w-[17px] h-[17px]" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-[#17212e] leading-tight truncate">{selectedCancerTypeName}</div>
              <div className="text-xs text-[#8a97a6] mt-0.5">Cancer Type</div>
            </div>
          </div>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-[38px] h-[38px] rounded-[11px] bg-[#eaf0f7] flex items-center justify-center text-[#12335c] shrink-0">
              <Syringe className="w-[17px] h-[17px]" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-[#17212e] leading-tight truncate">
                {standardCycles} cycle{standardCycles !== 1 ? "s" : ""} × {cycleIntervalDays} Days
              </div>
              <div className="text-xs text-[#8a97a6] mt-0.5">Regimen Schedule</div>
            </div>
          </div>
        </div>

        <div className="w-full">
          <div className="flex gap-5 items-start w-full mb-5">
            <div className="flex-1 min-w-0">
              {/* Top form card */}
            <div className={cardCls + " mb-5"}>
              <div className="px-[26px] py-6 w-full">
                <div className="border-b border-[#edf1f5] pb-5 mb-[22px] w-full">
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <label className={labelCls + " mb-0"}>Protocol Days</label>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#f1f5f9] text-[#64748b]">
                        {days.length} day{days.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {activeDay > 1 && days.length > 1 && !disabled && (
                      <div className="flex items-center gap-2 bg-[#f8fafc] border border-[#dde4ec] rounded-lg px-2.5 py-1">
                        <Copy className="w-3.5 h-3.5 text-[#12335c]" />
                        <span className="text-xs font-semibold text-[#5b6b7c]">Same as:</span>
                        <select
                          value={days.find((d) => d.dayNumber === activeDay)?.sameAsDay ?? ""}
                          onChange={(e) => {
                            const src = Number(e.target.value);
                            if (src) handleCopyFromDay(src, activeDay);
                          }}
                          className="text-xs bg-white border border-[#c7d2dd] rounded-md px-2 py-0.5 text-[#12335c] font-semibold focus:outline-none focus:ring-1 focus:ring-[#12335c] cursor-pointer"
                        >
                          <option value="" disabled>Select day...</option>
                          {days
                            .filter((d) => d.dayNumber !== activeDay)
                            .map((d) => (
                              <option key={d.dayNumber} value={d.dayNumber}>
                                Day {d.dayNumber}
                              </option>
                            ))}
                        </select>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {days.map((d) => {
                      const isActive = d.dayNumber === activeDay;
                      return (
                        <div key={d.dayNumber} className="relative group">
                          {days.length > 1 && !disabled && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveDay(d.dayNumber);
                              }}
                              title={`Remove Day ${d.dayNumber}`}
                              aria-label={`Remove Day ${d.dayNumber}`}
                              className="absolute -top-1.5 -right-1.5 z-10 w-4 h-4 rounded-full bg-white border border-[#e3e8ee] shadow-xs flex items-center justify-center text-[#c0374a] text-[11px] leading-none opacity-0 group-hover:opacity-100 hover:bg-[#c0374a] hover:border-[#c0374a] hover:text-white hover:scale-110 transition-all duration-150"
                            >
                              ×
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setActiveDay(d.dayNumber)}
                            className={`w-[74px] h-[44px] flex flex-col items-center justify-center rounded-xl border transition-all duration-200 ${
                              isActive
                                ? "border-[#12335c] bg-gradient-to-b from-[#1c4a80] to-[#12335c] text-white shadow-sm shadow-[#12335c]/25"
                                : "border-[#e3e8ee] bg-white text-[#1b2530] hover:border-[#9db4cc] hover:bg-[#f8fafc] hover:-translate-y-0.5"
                            }`}
                          >
                            <span
                              className={`text-[9px] font-bold uppercase tracking-[0.14em] leading-none ${
                                isActive ? "text-blue-100/80" : "text-[#8a97a6]"
                              }`}
                            >
                              Day
                            </span>
                            <span
                              className={`mt-0.5 text-[17px] font-extrabold leading-tight ${
                                isActive ? "text-white" : "text-[#1b2530]"
                              }`}
                            >
                              {d.dayNumber}
                            </span>
                          </button>
                        </div>
                      );
                    })}
                    {!disabled && (
                      <button
                        type="button"
                        onClick={handleAddDay}
                        className="h-[44px] px-3.5 rounded-xl border border-dashed border-[#9db4cc] text-[#12335c] bg-[#f8fafc] hover:bg-[#eef2f6] hover:border-[#12335c] transition-all duration-200 flex items-center justify-center gap-1.5 font-bold text-xs"
                        title="Add next protocol day"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Day</span>
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 w-full">
                  <div className="lg:col-span-1">
                    <label className={labelCls}>
                      Protocol Title (Regimen Name / Original Protocol) <Req />
                    </label>
                    <input
                      type="text"
                      value={regimenName}
                      onChange={(e) => setRegimenName(e.target.value)}
                      className={inputCls}
                      placeholder="e.g. Carboplatin AUC 5 - Original Protocol"
                      disabled={disabled}
                    />
                    <p className="text-[11px] text-[#8a97a6] mt-1">DB: regimen_name / original_protocol</p>
                  </div>
                  {(isEditMode || isViewMode) && (
                    <div>
                      <label className={labelCls}>
                        Regime Name (Regimen Code)
                      </label>
                      <input
                        type="text"
                        value={regimenCode}
                        onChange={(e) => setRegimenCode(e.target.value)}
                        className={inputCls}
                        placeholder="e.g. CARBO-AUC5"
                        disabled={disabled || isEditMode}
                      />
                      <p className="text-[11px] text-[#8a97a6] mt-1">DB: regimen_code / auto = protocol_id</p>
                    </div>
                  )}
                  <div>
                    <label className={labelCls}>
                      Cancer Type(s) <Req />
                    </label>
                    <ProtocolMultiSelect
                      options={cancerTypes.map((c) => ({ label: c.cancer_type, value: c.cancer_type_id }))}
                      values={cancerTypeIds}
                      onValuesChange={setCancerTypeIds}
                      placeholder={loadingCancerTypes ? "Loading..." : "Select cancer type(s)"}
                      disabled={disabled || loadingCancerTypes}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Cancer Subtype(s)</label>
                    <ProtocolMultiSelect
                      options={subtypes.map((s) => ({ label: s.subtype_name, value: s.subtype_id, group: s.group }))}
                      values={subtypeIds}
                      onValuesChange={setSubtypeIds}
                      placeholder={cancerTypeIds.length === 0 ? "Select cancer type(s) first" : loadingSubtypes ? "Loading subtypes..." : subtypes.length ? "Select subtype(s)" : "No subtypes"}
                      disabled={disabled || cancerTypeIds.length === 0 || loadingSubtypes || subtypes.length === 0}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Treatment Plan</label>
                    <ProtocolSelect
                      options={treatmentIntentOptions.map((t) => ({ label: t, value: t }))}
                      value={treatmentIntent}
                      onValueChange={setTreatmentIntent}
                      placeholder={loadingTreatmentIntents ? "Loading..." : "Select treatment plan"}
                      emptyMessage="No treatment plans found"
                      disabled={disabled}
                      loading={loadingTreatmentIntents}
                    />
                    <p className="text-[11px] text-[#8a97a6] mt-1">DB: treatment_intent</p>
                  </div>
                  <div>
                    <label className={labelCls}>Standard Cycles</label>
                    <div className="flex items-center border border-[#dde4ec] rounded-[11px] overflow-hidden h-10 bg-[#f8fafc]">
                      <button
                        type="button"
                        onClick={() => !disabled && setStandardCycles(Math.max(1, standardCycles - 1))}
                        className="bg-[#fafbfc] w-10 h-full text-base text-[#5b6b7c] hover:bg-[#eef2f6] transition-colors disabled:opacity-50"
                        disabled={disabled}
                      >
                        −
                      </button>
                      <div className="flex-1 text-center text-sm font-semibold">{standardCycles}</div>
                      <button
                        type="button"
                        onClick={() => !disabled && setStandardCycles(standardCycles + 1)}
                        className="bg-[#fafbfc] w-10 h-full text-base text-[#5b6b7c] hover:bg-[#eef2f6] transition-colors disabled:opacity-50"
                        disabled={disabled}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Cycle Interval (days)</label>
                    <div className="flex items-center border border-[#dde4ec] rounded-[11px] overflow-hidden h-10 bg-[#f8fafc]">
                      <button
                        type="button"
                        onClick={() => !disabled && setCycleIntervalDays(Math.max(1, cycleIntervalDays - 1))}
                        className="bg-[#fafbfc] w-10 h-full text-base text-[#5b6b7c] hover:bg-[#eef2f6] transition-colors disabled:opacity-50"
                        disabled={disabled}
                      >
                        −
                      </button>
                      <div className="flex-1 text-center text-sm font-semibold">{cycleIntervalDays}</div>
                      <button
                        type="button"
                        onClick={() => !disabled && setCycleIntervalDays(cycleIntervalDays + 1)}
                        className="bg-[#fafbfc] w-10 h-full text-base text-[#5b6b7c] hover:bg-[#eef2f6] transition-colors disabled:opacity-50"
                        disabled={disabled}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="lg:col-span-3">
                    <label className={labelCls}>Notes / Guideline Source</label>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className={inputCls}
                      placeholder="e.g. NCCN 2024, optional"
                      disabled={disabled}
                    />
                  </div>

                  <div className="lg:col-span-3 flex flex-wrap items-center justify-between gap-2 pt-3 mt-1 border-t border-[#edf1f5] text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[#5b6b7c]">Medicine Scope:</span>
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${
                        filterByCancerAndSubtype
                          ? "bg-[#eaf0f7] text-[#12335c] border border-[#d2dfef]"
                          : "bg-[#fef3c7] text-[#92400e] border border-[#fde68a]"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${filterByCancerAndSubtype ? "bg-[#12335c]" : "bg-[#d97706]"}`} />
                        {filterByCancerAndSubtype
                          ? "Filtered by Clinical Role (Premeds / Primary Chemo / Supportive)"
                          : `Showing ALL hospital medicines (${allHospitalMeds.length || "catalog"})`}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => !disabled && setFilterByCancerAndSubtype(!filterByCancerAndSubtype)}
                      disabled={disabled || loadingAllMeds}
                      className="text-xs font-medium text-[#12335c] hover:underline"
                    >
                      {loadingAllMeds ? (
                        <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Loading all medicines...</span>
                      ) : filterByCancerAndSubtype ? (
                        "Need an uncatalogued drug? Show all hospital medicines"
                      ) : (
                        "← Switch back to Role-filtered medicines"
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right sidebar */}
          <div className="w-[280px] shrink-0">
            <div className={cardCls + " sticky top-5"}>
              <div className="bg-[#eaf0f7] px-6 py-5 flex justify-between items-start">
                <div className="text-[15px] font-extrabold leading-[1.3] text-[#12335c]">
                  PROTOCOL
                  <br />
                  SUMMARY
                </div>
                <ClipboardList className="w-[18px] h-[18px] text-[#12335c] shrink-0" />
              </div>
              <div className="px-6 pt-1 pb-5">
                <div className="py-4 border-b border-[#e3e8ee]">
                  <div className="text-[10.5px] font-bold tracking-wide text-[#8a97a6] mb-1.5">REGIMEN CODE</div>
                  <div className="text-sm font-bold text-[#1b2530] truncate">{regimenCode || "—"}</div>
                </div>
                <div className="py-4 border-b border-[#e3e8ee]">
                  <div className="text-[10.5px] font-bold tracking-wide text-[#8a97a6] mb-1.5">PROTOCOL NAME</div>
                  <div className="text-sm font-bold text-[#1b2530] leading-tight">{regimenName || "—"}</div>
                </div>
                <div className="py-4 border-b border-[#e3e8ee]">
                  <div className="text-[10.5px] font-bold tracking-wide text-[#8a97a6] mb-1.5">CANCER TYPE</div>
                  <div className="text-sm font-bold text-[#1b2530]">{selectedCancerTypeName}</div>
                </div>
                <div className="py-4 border-b border-[#e3e8ee]">
                  <div className="text-[10.5px] font-bold tracking-wide text-[#8a97a6] mb-1.5">TREATMENT PLAN</div>
                  <div className="text-sm font-bold text-[#1b2530] truncate">{treatmentIntent || "—"}</div>
                </div>
                <div className="py-4 border-b border-[#e3e8ee]">
                  <div className="text-[10.5px] font-bold tracking-wide text-[#8a97a6] mb-1.5">CYCLE SCHEDULE</div>
                  <div className="text-sm font-bold text-[#1b2530]">
                    {standardCycles} cycle{standardCycles !== 1 ? "s" : ""} × {cycleIntervalDays} days
                  </div>
                </div>
                <div className="py-4 border-b border-[#e3e8ee]">
                  <div className="text-[10.5px] font-bold tracking-wide text-[#8a97a6] mb-1.5">PROTOCOL DAYS</div>
                  <div className="text-sm font-bold text-[#1b2530]">{days.length} day{days.length !== 1 ? "s" : ""}</div>
                </div>
                <div className="py-4">
                  <div className="text-[10.5px] font-bold tracking-wide text-[#8a97a6] mb-1.5">TOTAL DRUGS</div>
                  <div className="text-sm font-bold text-[#1b2530]">
                    {[...premeds, ...chemoPlans, ...supportive, ...dilution, ...post, ...days.flatMap((d) => (d.dayNumber === activeDay ? [] : [...(premedsByDay[d.dayNumber] ?? []), ...(chemoPlansByDay[d.dayNumber] ?? []), ...(supportiveByDay[d.dayNumber] ?? [])]))].filter((r: any) => (r.medication || r.item)?.trim()).length} item(s)
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* =========================================================================
            PATTERN 5: SLIDE DRAWER GRID - PRE-MEDICATIONS
           ========================================================================= */}
        <div className={cardCls + " mb-5"}>
          <div
            className="flex items-center justify-between px-6 py-[17px] cursor-pointer hover:bg-[#f8f9fb] transition-colors"
            onClick={() => toggleSection("premeds")}
          >
            <div className="flex items-center gap-2.5 text-[13.5px] font-bold text-[#17212e]">
              <div className="w-7 h-7 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
                <Pill className="w-4 h-4" />
              </div>
              <span>Pre-medications</span>
              <span className="px-2 py-0.5 text-[11px] font-semibold bg-slate-100 text-slate-600 rounded-full">
                {premeds.length} {premeds.length === 1 ? "drug" : "drugs"}
              </span>
            </div>
            {sections.premeds ? <ChevronUp className="w-4 h-4 text-[#8a97a6]" /> : <ChevronDown className="w-4 h-4 text-[#8a97a6]" />}
          </div>

          {sections.premeds && (
            <div className="p-5 pt-0">
              {premeds.length === 0 ? (
                <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-xl my-2">
                  <div className="w-10 h-10 rounded-full bg-sky-50 text-sky-600 flex items-center justify-center mx-auto mb-2">
                    <Pill className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-semibold text-slate-700">No pre-medications added</p>
                  <p className="text-[11px] text-slate-400 mt-1">Click the "Add Medication Row" button below to create one.</p>
                </div>
              ) : (
                <div className="overflow-hidden border border-slate-200 rounded-xl bg-white shadow-2xs">
                  <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <span>Prescription Overview (Click row to edit details)</span>
                    <span>Status</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {premeds.map((row, idx) => {
                      const medName = getMedName(row.medication, premedMeds);
                      const isReady = !!row.medication?.trim();
                      return (
                        <div
                          key={idx}
                          onClick={() => setActiveDrawer({ section: "premeds", index: idx })}
                          className="p-3.5 hover:bg-sky-50/50 cursor-pointer transition flex items-center justify-between group gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-xs font-mono text-slate-400 font-semibold w-6 shrink-0">
                              {String(idx + 1).padStart(2, "0")}
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-slate-900 group-hover:text-sky-700 transition truncate">
                                  {medName || <span className="italic text-slate-400 font-normal">Select medication...</span>}
                                </span>
                                {row.form && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200/80">
                                    {getFormIcon(row.form)}
                                    <span>{row.form}</span>
                                  </span>
                                )}
                                {row.brandName && (
                                  <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                                    {row.brandName}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 mt-1 truncate">
                                {row.dose ? `${row.dose} ${row.unit || ""}` : "No dose specified"}
                                {row.adminNotes ? ` • ${row.adminNotes}` : ""}
                                {row.remarks ? ` (Remark: ${row.remarks})` : ""}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2.5 shrink-0">
                            {isReady ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <Check className="w-3 h-3 text-emerald-600" /> Ready
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                Incomplete
                              </span>
                            )}

                            {!disabled && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removePremed(idx);
                                }}
                                title="Delete row"
                                className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition opacity-60 group-hover:opacity-100"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}

                            <div className="w-7 h-7 rounded-lg bg-slate-100 group-hover:bg-sky-100 group-hover:text-sky-700 text-slate-400 flex items-center justify-center transition">
                              <ChevronRight className="w-3.5 h-3.5" />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Bottom Add Bar */}
              <div className="px-5 py-3.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-center mt-3 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    if (disabled) return;
                    const newIdx = premeds.length;
                    addPremed();
                    setActiveDrawer({ section: "premeds", index: newIdx });
                  }}
                  disabled={disabled}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-600 hover:text-sky-700 bg-white hover:bg-sky-50 border border-sky-200 px-4 py-2 rounded-lg shadow-2xs transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Medication Row</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* =========================================================================
            PATTERN 5: SLIDE DRAWER GRID - CHEMOTHERAPY PLAN
           ========================================================================= */}
        <div className={cardCls + " mb-5"}>
          <div className="flex items-center justify-between px-6 py-[17px] hover:bg-[#f8f9fb] transition-colors">
            <div
              className="flex items-center gap-2.5 text-[13.5px] font-bold text-[#17212e] cursor-pointer flex-1"
              onClick={() => toggleSection("chemo")}
            >
              <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Syringe className="w-4 h-4" />
              </div>
              <span>Chemotherapy Plan</span>
              <span className="px-2 py-0.5 text-[11px] font-semibold bg-slate-100 text-slate-600 rounded-full">
                {chemoPlans.length} {chemoPlans.length === 1 ? "drug" : "drugs"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCalcTargetRow(null);
                  setCalcModalOpen(true);
                }}
                className="text-xs font-semibold text-[#12335c] bg-[#eaf0f7] hover:bg-[#dbe7f4] px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-colors"
                title="Open Medicine Dosage Calculator & Formulas Reference"
              >
                <Calculator className="w-3.5 h-3.5" />
                <span>Formulas & Dose Calculator</span>
              </button>
              <div
                className="cursor-pointer p-1"
                onClick={() => toggleSection("chemo")}
              >
                {sections.chemo ? <ChevronUp className="w-4 h-4 text-[#8a97a6]" /> : <ChevronDown className="w-4 h-4 text-[#8a97a6]" />}
              </div>
            </div>
          </div>

          {sections.chemo && (
            <div className="p-5 pt-0">
              {chemoPlans.length === 0 ? (
                <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-xl my-2">
                  <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-2">
                    <Syringe className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-semibold text-slate-700">No chemotherapy drugs added</p>
                  <p className="text-[11px] text-slate-400 mt-1">Click the "Add Chemotherapy Drug" button below to create one.</p>
                </div>
              ) : (
                <div className="overflow-hidden border border-slate-200 rounded-xl bg-white shadow-2xs">
                  <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <span>Prescription Overview (Click row to edit details)</span>
                    <span>Status</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {chemoPlans.map((row, idx) => {
                      const medName = getMedName(row.medication, chemoMeds);
                      const isReady = !!row.medication?.trim();
                      return (
                        <div
                          key={idx}
                          onClick={() => setActiveDrawer({ section: "chemo", index: idx })}
                          className="p-3.5 hover:bg-sky-50/50 cursor-pointer transition flex items-center justify-between group gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-xs font-mono text-slate-400 font-semibold w-6 shrink-0">
                              {String(idx + 1).padStart(2, "0")}
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-slate-900 group-hover:text-indigo-700 transition truncate">
                                  {medName || <span className="italic text-slate-400 font-normal">Select chemo drug...</span>}
                                </span>
                                {row.form && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200/80">
                                    {getFormIcon(row.form)}
                                    <span>{row.form}</span>
                                  </span>
                                )}
                                {row.brandName && (
                                  <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                                    {row.brandName}
                                  </span>
                                )}
                                {row.doseCalc && (
                                  <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-2 py-0.5 rounded-full">
                                    {row.doseCalc}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 mt-1 truncate">
                                <span className="font-medium text-slate-700">
                                  {row.dose ? `${row.dose} ${row.unit || ""}` : "No dose"}
                                </span>
                                {row.adminNotes ? ` • ${row.adminNotes}` : ""}
                                {row.toxicity ? ` (Toxicity: ${row.toxicity})` : ""}
                                {row.remarks ? ` (Remark: ${row.remarks})` : ""}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCalcTargetRow({
                                  index: idx,
                                  drug: medName || row.brandName || "",
                                  dose: row.dose || "",
                                  doseCalc: row.doseCalc || "",
                                });
                                setCalcModalOpen(true);
                              }}
                              title="Calculate Dose (BSA / Weight / Calvert AUC)"
                              className="w-7 h-7 rounded-lg bg-sky-50 hover:bg-[#12335c] text-[#12335c] hover:text-white flex items-center justify-center transition shadow-2xs"
                            >
                              <Calculator className="w-3.5 h-3.5" />
                            </button>

                            {isReady ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <Check className="w-3 h-3 text-emerald-600" /> Ready
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                Incomplete
                              </span>
                            )}

                            {!disabled && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeChemoPlan(idx);
                                }}
                                title="Delete row"
                                className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition opacity-60 group-hover:opacity-100"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}

                            <div className="w-7 h-7 rounded-lg bg-slate-100 group-hover:bg-indigo-100 group-hover:text-indigo-700 text-slate-400 flex items-center justify-center transition">
                              <ChevronRight className="w-3.5 h-3.5" />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Bottom Add Bar */}
              <div className="px-5 py-3.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-center mt-3 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    if (disabled) return;
                    const newIdx = chemoPlans.length;
                    addChemoPlan();
                    setActiveDrawer({ section: "chemo", index: newIdx });
                  }}
                  disabled={disabled}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 bg-white hover:bg-indigo-50 border border-indigo-200 px-4 py-2 rounded-lg shadow-2xs transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Chemotherapy Drug</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* =========================================================================
            PATTERN 5: SLIDE DRAWER GRID - SUPPORTIVE CARE
           ========================================================================= */}
        <div className={cardCls + " mb-5"}>
          <div
            className="flex items-center justify-between px-6 py-[17px] cursor-pointer hover:bg-[#f8f9fb] transition-colors"
            onClick={() => toggleSection("supportive")}
          >
            <div className="flex items-center gap-2.5 text-[13.5px] font-bold text-[#17212e]">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <ShieldPlus className="w-4 h-4" />
              </div>
              <span>Supportive Care</span>
              <span className="px-2 py-0.5 text-[11px] font-semibold bg-slate-100 text-slate-600 rounded-full">
                {supportive.length} {supportive.length === 1 ? "drug" : "drugs"}
              </span>
            </div>
            {sections.supportive ? <ChevronUp className="w-4 h-4 text-[#8a97a6]" /> : <ChevronDown className="w-4 h-4 text-[#8a97a6]" />}
          </div>

          {sections.supportive && (
            <div className="p-5 pt-0">
              {supportive.length === 0 ? (
                <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-xl my-2">
                  <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-2">
                    <ShieldPlus className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-semibold text-slate-700">No supportive care medications added</p>
                  <p className="text-[11px] text-slate-400 mt-1">Click the "Add Supportive Medicine" button below to create one.</p>
                </div>
              ) : (
                <div className="overflow-hidden border border-slate-200 rounded-xl bg-white shadow-2xs">
                  <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <span>Prescription Overview (Click row to edit details)</span>
                    <span>Status</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {supportive.map((row, idx) => {
                      const medName = getMedName(row.medication, supportiveMeds);
                      const isReady = !!row.medication?.trim();
                      return (
                        <div
                          key={idx}
                          onClick={() => setActiveDrawer({ section: "supportive", index: idx })}
                          className="p-3.5 hover:bg-emerald-50/40 cursor-pointer transition flex items-center justify-between group gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-xs font-mono text-slate-400 font-semibold w-6 shrink-0">
                              {String(idx + 1).padStart(2, "0")}
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-slate-900 group-hover:text-emerald-700 transition truncate">
                                  {medName || <span className="italic text-slate-400 font-normal">Select supportive medicine...</span>}
                                </span>
                                {row.form && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200/80">
                                    {getFormIcon(row.form)}
                                    <span>{row.form}</span>
                                  </span>
                                )}
                                {row.brandName && (
                                  <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                                    {row.brandName}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 mt-1 truncate">
                                {row.dose ? `${row.dose} ${row.unit || ""}` : "No dose specified"}
                                {row.adminNotes ? ` • ${row.adminNotes}` : ""}
                                {row.remarks ? ` (Remark: ${row.remarks})` : ""}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2.5 shrink-0">
                            {isReady ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <Check className="w-3 h-3 text-emerald-600" /> Ready
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                Incomplete
                              </span>
                            )}

                            {!disabled && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeSupportive(idx);
                                }}
                                title="Delete row"
                                className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition opacity-60 group-hover:opacity-100"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}

                            <div className="w-7 h-7 rounded-lg bg-slate-100 group-hover:bg-emerald-100 group-hover:text-emerald-700 text-slate-400 flex items-center justify-center transition">
                              <ChevronRight className="w-3.5 h-3.5" />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Bottom Add Bar */}
              <div className="px-5 py-3.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-center mt-3 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    if (disabled) return;
                    const newIdx = supportive.length;
                    addSupportive();
                    setActiveDrawer({ section: "supportive", index: newIdx });
                  }}
                  disabled={disabled}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 bg-white hover:bg-emerald-50 border border-emerald-200 px-4 py-2 rounded-lg shadow-2xs transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Supportive Medicine</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* =========================================================================
            PATTERN 5: SLIDE DRAWER GRID - DILUTION DETAILS
           ========================================================================= */}
        <div className={cardCls + " mb-5"}>
          <div
            className="flex items-center justify-between px-6 py-[17px] cursor-pointer hover:bg-[#f8f9fb] transition-colors"
            onClick={() => toggleSection("dilution")}
          >
            <div className="flex items-center gap-2.5 text-[13.5px] font-bold text-[#17212e]">
              <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <FlaskConical className="w-4 h-4" />
              </div>
              <span>Dilution Details</span>
              <span className="px-2 py-0.5 text-[11px] font-semibold bg-slate-100 text-slate-600 rounded-full">
                {dilution.length} {dilution.length === 1 ? "dilution" : "dilutions"}
              </span>
            </div>
            {sections.dilution ? <ChevronUp className="w-4 h-4 text-[#8a97a6]" /> : <ChevronDown className="w-4 h-4 text-[#8a97a6]" />}
          </div>

          {sections.dilution && (
            <div className="p-5 pt-0">
              {dilution.length === 0 ? (
                <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-xl my-2">
                  <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-2">
                    <FlaskConical className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-semibold text-slate-700">No dilution details added</p>
                  <p className="text-[11px] text-slate-400 mt-1">Click the "Add Dilution Row" button below to create one.</p>
                </div>
              ) : (
                <div className="overflow-hidden border border-slate-200 rounded-xl bg-white shadow-2xs">
                  <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <span>Prescription Overview (Click row to edit details)</span>
                    <span>Status</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {dilution.map((row, idx) => {
                      const medName = getDilutionMedName(row.medication);
                      const isReady = !!row.medication?.trim();
                      return (
                        <div
                          key={idx}
                          onClick={() => setActiveDrawer({ section: "dilution", index: idx })}
                          className="p-3.5 hover:bg-amber-50/40 cursor-pointer transition flex items-center justify-between group gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-xs font-mono text-slate-400 font-semibold w-6 shrink-0">
                              {String(idx + 1).padStart(2, "0")}
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-slate-900 group-hover:text-amber-700 transition truncate">
                                  {medName || <span className="italic text-slate-400 font-normal">Select dilution drug...</span>}
                                </span>
                                {row.form && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200/80">
                                    {getFormIcon(row.form)}
                                    <span>{row.form}</span>
                                  </span>
                                )}
                                {row.brandName && (
                                  <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                                    {row.brandName}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 mt-1 truncate">
                                <span className="font-medium text-slate-700">
                                  {row.dose ? `${row.dose} ${row.unit || ""}` : "No dose"}
                                </span>
                                {row.volume ? (
                                  <span className="text-amber-800">
                                    {` in ${row.volume} ${row.volumeUnit || "CC"}`}
                                  </span>
                                ) : ""}
                                {row.diluent ? (
                                  <span className="text-slate-600 font-medium">
                                    {` (${row.diluent})`}
                                  </span>
                                ) : ""}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2.5 shrink-0">
                            {isReady ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <Check className="w-3 h-3 text-emerald-600" /> Ready
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                Incomplete
                              </span>
                            )}

                            {!disabled && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeDilution(idx);
                                }}
                                title="Delete row"
                                className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition opacity-60 group-hover:opacity-100"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}

                            <div className="w-7 h-7 rounded-lg bg-slate-100 group-hover:bg-amber-100 group-hover:text-amber-700 text-slate-400 flex items-center justify-center transition">
                              <ChevronRight className="w-3.5 h-3.5" />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Bottom Add Bar */}
              <div className="px-5 py-3.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-center mt-3 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    if (disabled) return;
                    const newIdx = dilution.length;
                    addDilution();
                    setActiveDrawer({ section: "dilution", index: newIdx });
                  }}
                  disabled={disabled}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 hover:text-amber-800 bg-white hover:bg-amber-50 border border-amber-200 px-4 py-2 rounded-lg shadow-2xs transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Dilution Row</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* =========================================================================
            PATTERN 5: SLIDE DRAWER GRID - POST-TREATMENT (ON DISCHARGE)
           ========================================================================= */}
        <div className={cardCls + " mb-5"}>
          <div
            className="flex items-center justify-between px-6 py-[17px] cursor-pointer hover:bg-[#f8f9fb] transition-colors"
            onClick={() => toggleSection("post")}
          >
            <div className="flex items-center gap-2.5 text-[13.5px] font-bold text-[#c0374a]">
              <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                <ClipboardList className="w-4 h-4" />
              </div>
              <span>Post-treatment Medications (On Discharge)</span>
              <span className="px-2 py-0.5 text-[11px] font-semibold bg-slate-100 text-slate-600 rounded-full">
                {post.length} {post.length === 1 ? "medication" : "medications"}
              </span>
            </div>
            {sections.post ? <ChevronUp className="w-4 h-4 text-[#8a97a6]" /> : <ChevronDown className="w-4 h-4 text-[#8a97a6]" />}
          </div>

          {sections.post && (
            <div className="p-5 pt-0">
              {post.length === 0 ? (
                <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-xl my-2">
                  <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-2">
                    <ClipboardList className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-semibold text-slate-700">No post-treatment medications added</p>
                  <p className="text-[11px] text-slate-400 mt-1">Click the "Add Discharge Medication" button below to create one.</p>
                </div>
              ) : (
                <div className="overflow-hidden border border-slate-200 rounded-xl bg-white shadow-2xs">
                  <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <span>Prescription Overview (Click row to edit details)</span>
                    <span>Status</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {post.map((row, idx) => {
                      const medName = getPostMedName(row.medication);
                      const isReady = !!row.medication?.trim();
                      return (
                        <div
                          key={idx}
                          onClick={() => setActiveDrawer({ section: "post", index: idx })}
                          className="p-3.5 hover:bg-rose-50/40 cursor-pointer transition flex items-center justify-between group gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-xs font-mono text-slate-400 font-semibold w-6 shrink-0">
                              {String(idx + 1).padStart(2, "0")}
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-slate-900 group-hover:text-rose-700 transition truncate">
                                  {medName || <span className="italic text-slate-400 font-normal">Select discharge medication...</span>}
                                </span>
                                {row.form && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200/80">
                                    {getFormIcon(row.form)}
                                    <span>{row.form}</span>
                                  </span>
                                )}
                                {row.brandName && (
                                  <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                                    {row.brandName}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 mt-1 truncate">
                                <span className="font-medium text-slate-700">
                                  {row.dose ? `${row.dose} ${row.unit || ""}` : "No dose"}
                                </span>
                                {row.frequency ? ` • ${row.frequency}` : ""}
                                {row.duration ? ` • ${row.duration} ${row.durationDays || "D"}` : ""}
                                {row.instructions ? ` • ${row.instructions}` : ""}
                                {row.remarks ? ` (Remark: ${row.remarks})` : ""}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2.5 shrink-0">
                            {isReady ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <Check className="w-3 h-3 text-emerald-600" /> Ready
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                Incomplete
                              </span>
                            )}

                            {!disabled && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removePost(idx);
                                }}
                                title="Delete row"
                                className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition opacity-60 group-hover:opacity-100"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}

                            <div className="w-7 h-7 rounded-lg bg-slate-100 group-hover:bg-rose-100 group-hover:text-rose-700 text-slate-400 flex items-center justify-center transition">
                              <ChevronRight className="w-3.5 h-3.5" />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Bottom Add Bar */}
              <div className="px-5 py-3.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-center mt-3 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    if (disabled) return;
                    const newIdx = post.length;
                    addPost();
                    setActiveDrawer({ section: "post", index: newIdx });
                  }}
                  disabled={disabled}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-white hover:bg-rose-50 border border-rose-200 px-4 py-2 rounded-lg shadow-2xs transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Discharge Medication</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>

      <ConfirmationDialog
        open={showLeaveConfirm}
        title="Leave without saving?"
        description="You have unsaved changes. Are you sure you want to leave? Your changes will be lost."
        type="warning"
        confirmText="Leave"
        cancelText="Stay"
        onConfirm={() => {
          setShowLeaveConfirm(false);
          navigate(-1);
        }}
        onCancel={() => setShowLeaveConfirm(false)}
      />

      <DoseCalculationModal
        open={calcModalOpen}
        onOpenChange={setCalcModalOpen}
        initialDrugName={calcTargetRow?.drug ?? ""}
        initialDose={calcTargetRow?.dose ?? ""}
        initialDoseCalc={calcTargetRow?.doseCalc ?? ""}
      />

      {/* =========================================================================
          PATTERN 5: SLIDE-OVER EDIT DRAWER
         ========================================================================= */}
      {activeDrawer && (
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
                      {activeDrawer.section === "premeds" && (getMedName(premeds[activeDrawer.index]?.medication, premedMeds) || `Row #${activeDrawer.index + 1}`)}
                      {activeDrawer.section === "chemo" && (getMedName(chemoPlans[activeDrawer.index]?.medication, chemoMeds) || `Row #${activeDrawer.index + 1}`)}
                      {activeDrawer.section === "supportive" && (getMedName(supportive[activeDrawer.index]?.medication, supportiveMeds) || `Row #${activeDrawer.index + 1}`)}
                      {activeDrawer.section === "dilution" && (getDilutionMedName(dilution[activeDrawer.index]?.medication) || `Row #${activeDrawer.index + 1}`)}
                      {activeDrawer.section === "post" && (getPostMedName(post[activeDrawer.index]?.medication) || `Row #${activeDrawer.index + 1}`)}
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
                          options={getFormDropdownOptions(row.medication, row.form, premedMeds)}
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
                          options={getDropdownOptions(premedMeds, row.medication)}
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
                            if (med && !n[idx].medicineName) {
                              n[idx].medicineName = med.medicine_name;
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

                      <div>
                        <label className={drawerLabelCls}>
                          Medicine / Formulary Name (Display Title)
                        </label>
                        <input
                          type="text"
                          value={row.medicineName ?? ""}
                          onChange={(e) => {
                            const n = [...premeds];
                            n[idx].medicineName = e.target.value;
                            setPremeds(n);
                          }}
                          placeholder={
                            row.medication
                              ? (row.form
                                  ? (row.form + " " + getMedName(row.medication, premedMeds))
                                  : getMedName(row.medication, premedMeds))
                              : "Auto-generated from generic name if left blank"
                          }
                          disabled={disabled}
                          className={drawerInputCls}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={drawerLabelCls}>Brand Name (Recommended)</label>
                          <ProtocolSelect
                            options={getBrandDropdownOptions(premeds, row.brandName, premedMeds, row.medication, row.form)}
                            value={row.brandName ?? ""}
                            allowCreate
                            onValueChange={(v) => {
                              const n = [...premeds];
                              n[idx].brandName = v;
                              setPremeds(n);
                            }}
                            placeholder="Select brand (Optional - Recommended)"
                            emptyMessage="No brand options"
                            disabled={disabled}
                            className="h-9"
                          />
                        </div>
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
                  const selectedMed = chemoMeds.find((m) => m.medicine_id === row.medication)?.medicine_name || row.medication;
                  return (
                    <>
                      <div>
                        <label className={drawerLabelCls}>Drug Formulation</label>
                        <ProtocolSelect
                          options={getFormDropdownOptions(row.medication, row.form, chemoMeds)}
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
                          options={getDropdownOptions(chemoMeds, row.medication)}
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
                            if (medObj && !n[idx].medicineName) {
                              n[idx].medicineName = medObj.medicine_name;
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

                      <div>
                        <label className={drawerLabelCls}>
                          Medicine / Formulary Name (Display Title)
                        </label>
                        <input
                          type="text"
                          value={row.medicineName ?? ""}
                          onChange={(e) => {
                            const n = [...chemoPlans];
                            n[idx].medicineName = e.target.value;
                            setChemoPlans(n);
                          }}
                          placeholder={
                            row.medication
                              ? (row.form
                                  ? (row.form + " " + getMedName(row.medication, chemoMeds))
                                  : getMedName(row.medication, chemoMeds))
                              : "Auto-generated from generic name if left blank"
                          }
                          disabled={disabled}
                          className={drawerInputCls}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={drawerLabelCls}>Brand Name (Recommended)</label>
                          <ProtocolSelect
                            options={getBrandDropdownOptions(chemoPlans, row.brandName, chemoMeds, row.medication, row.form)}
                            value={row.brandName ?? ""}
                            allowCreate
                            onValueChange={(v) => {
                              const n = [...chemoPlans];
                              n[idx].brandName = v;
                              setChemoPlans(n);
                            }}
                            placeholder="Select brand (Optional - Recommended)"
                            emptyMessage="No brand options"
                            disabled={disabled}
                            className="h-9"
                          />
                        </div>
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

                      <div className="bg-sky-50/70 border border-sky-100 rounded-xl p-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Calculator className="w-4 h-4 text-sky-600" />
                          <span className="text-xs font-semibold text-sky-900">Need patient BSA or AUC formula?</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setCalcTargetRow({
                              index: idx,
                              drug: selectedMed || row.brandName || "",
                              dose: row.dose || "",
                              doseCalc: row.doseCalc || "",
                            });
                            setCalcModalOpen(true);
                          }}
                          className="text-xs font-bold text-sky-700 hover:text-sky-900 underline"
                        >
                          Open Calculator
                        </button>
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
                          options={getFormDropdownOptions(row.medication, row.form, supportiveMeds)}
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
                          options={getDropdownOptions(supportiveMeds, row.medication)}
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
                            if (med && !n[idx].medicineName) {
                              n[idx].medicineName = med.medicine_name;
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

                      <div>
                        <label className={drawerLabelCls}>
                          Medicine / Formulary Name (Display Title)
                        </label>
                        <input
                          type="text"
                          value={row.medicineName ?? ""}
                          onChange={(e) => {
                            const n = [...supportive];
                            n[idx].medicineName = e.target.value;
                            setSupportive(n);
                          }}
                          placeholder={
                            row.medication
                              ? (row.form
                                  ? (row.form + " " + getMedName(row.medication, supportiveMeds))
                                  : getMedName(row.medication, supportiveMeds))
                              : "Auto-generated from generic name if left blank"
                          }
                          disabled={disabled}
                          className={drawerInputCls}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={drawerLabelCls}>Brand Name (Recommended)</label>
                          <ProtocolSelect
                            options={getBrandDropdownOptions(supportive, row.brandName, supportiveMeds, row.medication, row.form)}
                            value={row.brandName ?? ""}
                            allowCreate
                            onValueChange={(v) => {
                              const n = [...supportive];
                              n[idx].brandName = v;
                              setSupportive(n);
                            }}
                            placeholder="Select brand (Optional - Recommended)"
                            emptyMessage="No brand options"
                            disabled={disabled}
                            className="h-9"
                          />
                        </div>
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
                          options={getFormDropdownOptions(row.medication, row.form, dilutionMeds)}
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
                            if (med && !n[idx].medicineName) {
                              n[idx].medicineName = med.medicine_name;
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

                      <div>
                        <label className={drawerLabelCls}>
                          Medicine / Formulary Name (Display Title)
                        </label>
                        <input
                          type="text"
                          value={row.medicineName ?? ""}
                          onChange={(e) => {
                            const n = [...dilution];
                            n[idx].medicineName = e.target.value;
                            setDilution(n);
                          }}
                          placeholder={
                            row.medication
                              ? (row.form
                                  ? (row.form + " " + getDilutionMedName(row.medication))
                                  : getDilutionMedName(row.medication))
                              : "Auto-generated from generic name if left blank"
                          }
                          disabled={disabled}
                          className={drawerInputCls}
                        />
                      </div>

                      <div>
                        <label className={drawerLabelCls}>Brand Name (Recommended)</label>
                        <ProtocolSelect
                          options={getBrandDropdownOptions(dilution, row.brandName, dilutionMeds, row.medication, row.form)}
                          value={row.brandName ?? ""}
                          allowCreate
                          onValueChange={(v) => {
                            const n = [...dilution];
                            n[idx].brandName = v;
                            setDilution(n);
                          }}
                          placeholder="Select brand (Optional - Recommended)"
                          emptyMessage="No brand options"
                          disabled={disabled}
                          className="h-9"
                        />
                      </div>

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
                          options={getFormDropdownOptions(row.medication, row.form, dischargeMeds.length > 0 ? dischargeMeds : premedMeds)}
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
                          options={getDropdownOptions(dischargeMeds.length > 0 ? dischargeMeds : premedMeds, row.medication)}
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
                            if (med && !n[idx].medicineName) {
                              n[idx].medicineName = med.medicine_name;
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

                      <div>
                        <label className={drawerLabelCls}>
                          Medicine / Formulary Name (Display Title)
                        </label>
                        <input
                          type="text"
                          value={row.medicineName ?? ""}
                          onChange={(e) => {
                            const n = [...post];
                            n[idx].medicineName = e.target.value;
                            setPost(n);
                          }}
                          placeholder={
                            row.medication
                              ? (row.form
                                  ? (row.form + " " + getPostMedName(row.medication))
                                  : getPostMedName(row.medication))
                              : "Auto-generated from generic name if left blank"
                          }
                          disabled={disabled}
                          className={drawerInputCls}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={drawerLabelCls}>Brand Name (Recommended)</label>
                          <ProtocolSelect
                            options={getBrandDropdownOptions(post, row.brandName, dischargeMeds.length > 0 ? dischargeMeds : premedMeds, row.medication, row.form)}
                            value={row.brandName ?? ""}
                            allowCreate
                            onValueChange={(v) => {
                              const n = [...post];
                              n[idx].brandName = v;
                              setPost(n);
                            }}
                            placeholder="Select brand (Optional - Recommended)"
                            emptyMessage="No brand options"
                            disabled={disabled}
                            className="h-9"
                          />
                        </div>
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
                          <label className={drawerLabelCls}>Duration & Unit</label>
                          <div className="grid grid-cols-2 gap-1.5">
                            <ProtocolSelect
                              options={Array.from(new Set([...PROTOCOL_INSTRUCTION_OPTIONS, row.duration].filter(Boolean)))}
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
                        <textarea
                          rows={3}
                          value={row.instructions}
                          onChange={(e) => {
                            const n = [...post];
                            n[idx].instructions = e.target.value;
                            setPost(n);
                          }}
                          placeholder="e.g. Take after food with plenty of water"
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
                      onClick={handleDeleteFromDrawer}
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
                    onClick={() => setActiveDrawer(null)}
                    className="px-4 py-2 bg-[#12335c] text-white rounded-lg text-xs font-semibold hover:bg-[#0e2848] shadow-xs transition"
                  >
                    Done / Save
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}