import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from "react";
import API from "../../../api/axios";
import { encounterApi, type EncounterRecord } from "../../../api/encounter.api";
import VoiceToText from "@/components/ui/voicetotext";
import DateInputField from "./DateInputField";
import { dateOnlyDMY, dmyToIsoStrict, targetDateError } from "./helpers";

/* ============================================================
   ADVICE (OPD PRESCRIPTION)
   The Consultation step's Advice table lets the doctor prescribe
   take-home medicines for a routine visit without going through
   the oncology steps. The rows are saved as one prescription per
   encounter (POST /prescriptions); Drug Name links to
   medicine_master via GET/POST /prescriptions/medicines. Values
   added to the other columns' dropdowns are remembered per
   browser in localStorage.
   ============================================================ */

type AdviceOptionField =
  | "drugForm"
  | "dosage"
  | "frequency"
  | "instruction"
  | "duration";

interface AdviceMedicineRow {
  rowId: string;
  /* prescription_item_id once the row has been saved. */
  itemId?: string;
  /* Payload key at the last save/load - a different current key means
     the row was edited since. */
  savedKey?: string;
  drugForm: string;
  drugName: string;
  medicineId: string;
  dosage: string;
  frequency: string;
  instruction: string;
  duration: string;
}

export type AdviceSaveResult = "saved" | "unchanged" | "cleared" | "empty" | "failed";

interface ComboOption {
  value: string;
  hint?: string;
  key?: string;
}

interface MedicineSearchOption {
  medicine_id: string;
  medicine_name: string;
  generic_name: string | null;
  brand_name: string | null;
  strength: string | null;
  dosage_form: string | null;
  unit: string | null;
  route: string | null;
}

interface AdvicePrescriptionItemRecord {
  prescription_item_id: string;
  medicine_id: string;
  dosage: string | null;
  unit: string | null;
  frequency: string | null;
  duration: string | null;
  days: number | null;
  instruction: string | null;
  drug_role: string | null;
  drug_type: string | null;
  medicine_master?: {
    medicine_name: string;
    dosage_form: string | null;
  } | null;
}

interface AdvicePrescriptionRecord {
  prescription_id: string;
  prescription_status: string | null;
  prescription_items?: AdvicePrescriptionItemRecord[];
}

/* drug_role stamped on Advice items so the consultation prescription can
   be told apart from the chemotherapy prescription created at Summary. */
const ADVICE_DRUG_ROLE = "ADVICE";

const ADVICE_CUSTOM_OPTIONS_KEY = "hms_advice_custom_options";

const adviceStorageKey = (encounterNo: string) =>
  `hms_advice_prescription_${encounterNo}`;

const DRUG_FORM_OPTIONS: ComboOption[] = [
  { value: "Tab", hint: "Tablet" },
  { value: "Cap", hint: "Capsule" },
  { value: "Syp", hint: "Syrup" },
  { value: "Susp", hint: "Suspension" },
  { value: "Inj", hint: "Injection" },
  { value: "Inf", hint: "Infusion" },
  { value: "Drops", hint: "Oral drops" },
  { value: "Eye Drops" },
  { value: "Ear Drops" },
  { value: "Nasal Drops" },
  { value: "Nasal Spray" },
  { value: "Inhaler", hint: "MDI / DPI" },
  { value: "Rotacap", hint: "Inhalation capsule" },
  { value: "Respule", hint: "Nebulisation" },
  { value: "Oint", hint: "Ointment" },
  { value: "Cream" },
  { value: "Gel" },
  { value: "Lotion" },
  { value: "Powder" },
  { value: "Sachet" },
  { value: "Granules" },
  { value: "Soln", hint: "Solution" },
  { value: "Mouthwash" },
  { value: "Lozenge" },
  { value: "Supp", hint: "Suppository" },
  { value: "Patch", hint: "Transdermal patch" },
  { value: "Spray" },
  { value: "Shampoo" },
  { value: "Soap" },
];

const DOSAGE_OPTIONS: ComboOption[] = [
  "2.5 mg",
  "5 mg",
  "10 mg",
  "20 mg",
  "25 mg",
  "40 mg",
  "50 mg",
  "75 mg",
  "100 mg",
  "150 mg",
  "250 mg",
  "500 mg",
  "650 mg",
  "1 g",
  "2.5 ml",
  "5 ml",
  "10 ml",
  "15 ml",
  "1 drop",
  "2 drops",
  "1 puff",
  "2 puffs",
].map((value) => ({ value }));

const FREQUENCY_OPTIONS: ComboOption[] = [
  { value: "1-0-0", hint: "Once daily - morning" },
  { value: "0-1-0", hint: "Once daily - afternoon" },
  { value: "0-0-1", hint: "Once daily - night" },
  { value: "1-0-1", hint: "Twice daily - morning & night" },
  { value: "1-1-0", hint: "Twice daily - morning & afternoon" },
  { value: "0-1-1", hint: "Twice daily - afternoon & night" },
  { value: "1-1-1", hint: "Thrice daily" },
  { value: "1-1-1-1", hint: "Four times daily" },
  { value: "OD", hint: "Once daily" },
  { value: "BD", hint: "Twice daily" },
  { value: "TDS", hint: "Thrice daily" },
  { value: "QID", hint: "Four times daily" },
  { value: "HS", hint: "At bedtime" },
  { value: "SOS", hint: "When required" },
  { value: "STAT", hint: "Immediately, once" },
  { value: "Q4H", hint: "Every 4 hours" },
  { value: "Q6H", hint: "Every 6 hours" },
  { value: "Q8H", hint: "Every 8 hours" },
  { value: "Q12H", hint: "Every 12 hours" },
  { value: "Alternate days" },
  { value: "Once a week" },
];

const INSTRUCTION_OPTIONS: ComboOption[] = [
  "After food",
  "Before food",
  "With food",
  "Empty stomach",
  "Before breakfast",
  "After breakfast",
  "Before dinner",
  "After dinner",
  "At bedtime",
  "When required",
  "Apply locally",
  "Apply a thin layer",
  "Shake well before use",
  "Dissolve in water",
  "Chew and swallow",
  "Swallow whole - do not crush",
  "Keep under the tongue",
  "Gargle and spit",
].map((value) => ({ value }));

const DURATION_OPTIONS: ComboOption[] = [
  "1 day",
  "3 days",
  "5 days",
  "7 days",
  "10 days",
  "14 days",
  "15 days",
  "21 days",
  "1 month",
  "2 months",
  "3 months",
  "6 months",
  "Continue",
  "SOS",
].map((value) => ({ value }));

const ADVICE_BASE_OPTIONS: Record<AdviceOptionField, ComboOption[]> = {
  drugForm: DRUG_FORM_OPTIONS,
  dosage: DOSAGE_OPTIONS,
  frequency: FREQUENCY_OPTIONS,
  instruction: INSTRUCTION_OPTIONS,
  duration: DURATION_OPTIONS,
};

/* [singular, plural] units offered when a bare number is typed. */
const DOSAGE_UNIT_WORDS: [string, string][] = [
  ["mg", "mg"],
  ["mcg", "mcg"],
  ["g", "g"],
  ["ml", "ml"],
  ["IU", "IU"],
  ["unit", "units"],
  ["drop", "drops"],
  ["puff", "puffs"],
  ["tsp", "tsp"],
];

const DURATION_UNIT_WORDS: [string, string][] = [
  ["day", "days"],
  ["week", "weeks"],
  ["month", "months"],
];

/* A bare number typed into Dosage / Duration expands into one suggestion
   per unit ("500" -> "500 mg", "500 ml", ...). */
const expandNumberSuggestions = (
  query: string,
  units: [string, string][]
): ComboOption[] => {
  const number = query.trim();
  if (!/^(\d+(\.\d+)?|\d+\/\d+)$/.test(number)) return [];
  return units.map(([singular, plural]) => ({
    value: `${number} ${number === "1" ? singular : plural}`,
  }));
};

/* Leading options win; later options with the same value are dropped. */
const mergeComboOptions = (...lists: ComboOption[][]): ComboOption[] => {
  const seen = new Set<string>();
  return lists.flat().filter((option) => {
    const key = option.value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const loadAdviceCustomOptions = (): Record<AdviceOptionField, string[]> => {
  const options: Record<AdviceOptionField, string[]> = {
    drugForm: [],
    dosage: [],
    frequency: [],
    instruction: [],
    duration: [],
  };
  try {
    const stored = JSON.parse(
      localStorage.getItem(ADVICE_CUSTOM_OPTIONS_KEY) ?? "{}"
    ) as Partial<Record<AdviceOptionField, unknown>>;
    (Object.keys(options) as AdviceOptionField[]).forEach((field) => {
      const values = stored?.[field];
      if (Array.isArray(values)) {
        options[field] = values.filter(
          (value): value is string => typeof value === "string"
        );
      }
    });
  } catch {
    // Malformed storage - start from the built-in lists only.
  }
  return options;
};

/* medicine_master.dosage_form spelled out ("Tablet") -> the short form
   used in the Drug Form column ("Tab"). */
const normalizeDrugForm = (value?: string | null): string => {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  const match = DRUG_FORM_OPTIONS.find(
    (option) =>
      option.value.toLowerCase() === lower ||
      option.hint?.toLowerCase() === lower
  );
  return match?.value ?? trimmed;
};

const createAdviceRow = (): AdviceMedicineRow => ({
  rowId: `advice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  drugForm: "",
  drugName: "",
  medicineId: "",
  dosage: "",
  frequency: "",
  instruction: "",
  duration: "",
});

const isAdviceRowEmpty = (row: AdviceMedicineRow) =>
  ![
    row.drugForm,
    row.drugName,
    row.dosage,
    row.frequency,
    row.instruction,
    row.duration,
  ].some((value) => value.trim());

/* "500 mg" -> dosage "500" + unit "mg", the split the prescription
   viewers join back together. Free text stays whole in dosage. */
const splitDosage = (value: string): { dosage?: string; unit?: string } => {
  const trimmed = value.trim();
  if (!trimmed) return {};
  const match = trimmed.match(/^(\d+(?:\.\d+)?(?:\/\d+)?)\s*([^\d\s].*)$/);
  return match
    ? { dosage: match[1], unit: match[2].trim() }
    : { dosage: trimmed };
};

/* medicine_master.strength is loosely filled ("500 mg", "500" with the
   unit in its own column, "4 + 8", "Not specified"); only a single
   dose with a known unit is usable as a Dosage. */
const strengthAsDosage = (
  strength?: string | null,
  unit?: string | null
): string => {
  const value = strength?.trim() ?? "";
  if (/^\d+(\.\d+)?\s*[a-zA-Zµ%]/.test(value)) return value;
  if (/^\d+(\.\d+)?$/.test(value) && unit?.trim()) {
    return `${value} ${unit.trim()}`;
  }
  return "";
};

/* "1-0-1" style (and OD / BD / TDS / HS) frequencies -> the morning /
   afternoon / night flags on prescription_items plus doses per day. */
const frequencySlots = (
  value: string
): {
  morning: boolean;
  afternoon: boolean;
  night: boolean;
  dosesPerDay: number;
} | null => {
  const trimmed = value.trim().toUpperCase();
  const pattern = trimmed.match(
    /^(\d+(?:\.\d+)?|½)-(\d+(?:\.\d+)?|½)-(\d+(?:\.\d+)?|½)$/
  );
  if (pattern) {
    const [morning, afternoon, night] = pattern
      .slice(1)
      .map((part) => (part === "½" ? 0.5 : Number(part)));
    return {
      morning: morning > 0,
      afternoon: afternoon > 0,
      night: night > 0,
      dosesPerDay: morning + afternoon + night,
    };
  }
  const named: Record<string, [boolean, boolean, boolean]> = {
    OD: [true, false, false],
    BD: [true, false, true],
    TDS: [true, true, true],
    HS: [false, false, true],
  };
  const slots = named[trimmed];
  return slots
    ? {
        morning: slots[0],
        afternoon: slots[1],
        night: slots[2],
        dosesPerDay: slots.filter(Boolean).length,
      }
    : null;
};

/* "5 days" / "2 weeks" / "1 month" -> number of days. */
const durationDays = (value: string): number | undefined => {
  const match = value
    .trim()
    .match(/^(\d+)\s*(d|days?|w|wks?|weeks?|m|mos?|months?)$/i);
  if (!match) return undefined;
  const count = Number(match[1]);
  const unit = match[2].toLowerCase();
  const days = unit.startsWith("w")
    ? count * 7
    : unit.startsWith("m")
    ? count * 30
    : count;
  return days >= 1 ? days : undefined;
};

/* Instruction text -> the before_after_food values the backend accepts. */
const instructionFoodTiming = (value: string): string | undefined => {
  if (/\bafter\s+(food|meals?|breakfast|lunch|dinner)\b/i.test(value)) {
    return "After Food";
  }
  if (
    /\bbefore\s+(food|meals?|breakfast|lunch|dinner)\b|empty stomach/i.test(
      value
    )
  ) {
    return "Before Food";
  }
  if (/\bwith\s+(food|meals?)\b/i.test(value)) return "With Food";
  return undefined;
};

const buildAdviceItemPayload = (row: AdviceMedicineRow) => {
  const { dosage, unit } = splitDosage(row.dosage);
  const slots = frequencySlots(row.frequency);
  const days = durationDays(row.duration);
  const beforeAfterFood = instructionFoodTiming(row.instruction);
  const quantity =
    slots && days ? Math.ceil(slots.dosesPerDay * days) : undefined;
  return {
    medicine_id: row.medicineId,
    ...(dosage ? { dosage } : {}),
    ...(unit ? { unit } : {}),
    ...(row.frequency.trim() ? { frequency: row.frequency.trim() } : {}),
    ...(slots
      ? {
          morning: slots.morning,
          afternoon: slots.afternoon,
          night: slots.night,
        }
      : {}),
    ...(days ? { days } : {}),
    ...(quantity && quantity >= 1 ? { quantity } : {}),
    ...(row.duration.trim() ? { duration: row.duration.trim() } : {}),
    ...(row.instruction.trim()
      ? { instruction: row.instruction.trim() }
      : {}),
    ...(beforeAfterFood ? { before_after_food: beforeAfterFood } : {}),
    ...(row.drugForm.trim() ? { drug_type: row.drugForm.trim() } : {}),
    drug_role: ADVICE_DRUG_ROLE,
  };
};

const adviceRowKey = (row: AdviceMedicineRow) =>
  JSON.stringify(buildAdviceItemPayload(row));

/* Identifies the saved state of a set of rows (item ids + contents). */
const adviceSnapshot = (rows: AdviceMedicineRow[]) =>
  JSON.stringify(rows.map((row) => [row.itemId ?? "", adviceRowKey(row)]));

/* prescription_item_id numbers are not zero-padded past 3 digits, so
   order by the numeric part to keep the prescribed order. */
const prescriptionItemNumber = (id: string) =>
  Number(id.replace(/\D/g, "")) || 0;

const adviceRowsFromPrescription = (
  record: AdvicePrescriptionRecord
): AdviceMedicineRow[] =>
  [...(record.prescription_items ?? [])]
    .sort(
      (a, b) =>
        prescriptionItemNumber(a.prescription_item_id) -
        prescriptionItemNumber(b.prescription_item_id)
    )
    .map((item) => {
      const row: AdviceMedicineRow = {
        ...createAdviceRow(),
        itemId: item.prescription_item_id,
        drugForm:
          item.drug_type || normalizeDrugForm(item.medicine_master?.dosage_form),
        drugName: item.medicine_master?.medicine_name ?? "",
        medicineId: item.medicine_id,
        dosage: [item.dosage, item.unit].filter(Boolean).join(" "),
        frequency: item.frequency ?? "",
        instruction: item.instruction ?? "",
        duration: item.duration || (item.days ? `${item.days} days` : ""),
      };
      return { ...row, savedKey: adviceRowKey(row) };
    });

const matchesEveryWord = (text: string, query: string) => {
  const haystack = text.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
};

/* Text input with a dropdown button beside it. Typing filters the list;
   a typed value that is not in the list is offered as "+ Add". */
const AdviceComboField: React.FC<{
  value: string;
  options: ComboOption[];
  ariaLabel: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onSelect: (option: ComboOption) => void;
  onAdd?: (value: string) => void;
  /* Server-filtered lists (Drug Name) pass false and search in onSearch,
     which must be a stable callback. */
  filterLocally?: boolean;
  onSearch?: (query: string) => void;
  loading?: boolean;
  busy?: boolean;
  warning?: string;
  menuClassName?: string;
}> = ({
  value,
  options,
  ariaLabel,
  placeholder,
  onChange,
  onSelect,
  onAdd,
  filterLocally = true,
  onSearch,
  loading = false,
  busy = false,
  warning,
  menuClassName = "min-w-[180px]",
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  /* Opened from the dropdown button: list everything, ignore the text. */
  const [showAll, setShowAll] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  const typed = value.trim();
  const query = showAll ? "" : typed;

  const visibleOptions = useMemo(() => {
    if (!filterLocally || !query) return options;
    const lower = query.toLowerCase();
    const matches = options.filter((option) =>
      matchesEveryWord(`${option.value} ${option.hint ?? ""}`, query)
    );
    return [
      ...matches.filter((option) => option.value.toLowerCase().startsWith(lower)),
      ...matches.filter((option) => !option.value.toLowerCase().startsWith(lower)),
    ];
  }, [filterLocally, options, query]);

  const canAdd =
    Boolean(onAdd) &&
    !showAll &&
    !loading &&
    typed.length > 0 &&
    !options.some((option) => option.value.toLowerCase() === typed.toLowerCase());

  const itemCount = visibleOptions.length + (canAdd ? 1 : 0);

  useEffect(() => {
    if (open && onSearch) onSearch(query);
  }, [open, query, onSearch]);

  useEffect(() => {
    setHighlight(-1);
  }, [open, query, visibleOptions.length]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setShowAll(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (highlight < 0) return;
    listRef.current
      ?.querySelectorAll<HTMLElement>("[data-combo-item]")
      [highlight]?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  const close = () => {
    setOpen(false);
    setShowAll(false);
  };

  const choose = (option: ComboOption) => {
    onSelect(option);
    close();
  };

  const add = () => {
    onAdd?.(typed);
    close();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setHighlight((current) =>
        itemCount === 0 ? -1 : (current + 1) % itemCount
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((current) =>
        itemCount === 0 ? -1 : current <= 0 ? itemCount - 1 : current - 1
      );
    } else if (event.key === "Enter") {
      if (!open) return;
      event.preventDefault();
      if (highlight >= 0 && highlight < visibleOptions.length) {
        choose(visibleOptions[highlight]);
      } else if (canAdd && highlight === visibleOptions.length) {
        add();
      } else {
        close();
      }
    } else if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        close();
      }
    } else if (event.key === "Tab") {
      close();
    }
  };

  return (
    <div ref={containerRef} className="relative w-full" title={warning}>

      <div
        className={`flex h-[34px] w-full items-stretch overflow-hidden rounded-md border bg-white transition focus-within:border-slate-400 ${
          warning ? "border-amber-400" : "border-slate-200"
        }`}
      >

        <input
          ref={inputRef}
          type="text"
          value={value}
          aria-label={ariaLabel}
          placeholder={placeholder}
          disabled={busy}
          onChange={(event) => {
            onChange(event.target.value);
            setShowAll(false);
            setOpen(true);
          }}
          onClick={() => {
            if (open) return;
            setShowAll(!typed);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          className="min-w-0 flex-1 bg-transparent px-2 text-[10px] leading-5 text-slate-700 outline-none placeholder:text-slate-400 disabled:text-slate-400"
        />

        <button
          type="button"
          tabIndex={-1}
          aria-label={`Show ${ariaLabel} options`}
          disabled={busy}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (open && showAll) {
              close();
              return;
            }
            setShowAll(true);
            setOpen(true);
            inputRef.current?.focus();
          }}
          className="flex w-7 shrink-0 items-center justify-center border-l border-slate-200 bg-slate-50 text-slate-500 transition hover:bg-slate-100"
        >
          {busy ? (
            <svg
              className="h-3.5 w-3.5 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          ) : (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`h-3.5 w-3.5 transition-transform ${
                open ? "rotate-180" : ""
              }`}
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          )}
        </button>

      </div>

      {open && (
        <div
          ref={listRef}
          role="listbox"
          className={`absolute left-0 top-full z-40 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg ${menuClassName}`}
        >

          {loading && (
            <div className="px-3 py-1.5 text-[10px] leading-4 text-slate-400">
              Searching...
            </div>
          )}

          {!loading && itemCount === 0 && (
            <div className="px-3 py-1.5 text-[10px] leading-4 text-slate-400">
              {query ? "No matches" : "No options"}
            </div>
          )}

          {visibleOptions.map((option, index) => (
            <button
              key={option.key ?? option.value}
              type="button"
              role="option"
              aria-selected={index === highlight}
              data-combo-item
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setHighlight(index)}
              onClick={() => choose(option)}
              className={`flex w-full flex-col items-start px-3 py-1.5 text-left ${
                index === highlight ? "bg-blue-50" : ""
              }`}
            >
              <span className="text-[10px] leading-5 text-slate-700">
                {option.value}
              </span>
              {option.hint && (
                <span className="text-[10px] leading-4 text-slate-400">
                  {option.hint}
                </span>
              )}
            </button>
          ))}

          {canAdd && (
            <button
              type="button"
              data-combo-item
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setHighlight(visibleOptions.length)}
              onClick={add}
              className={`flex w-full items-center gap-1 border-t border-slate-100 px-3 py-2 text-left text-[10px] font-semibold leading-5 text-blue-600 ${
                highlight === visibleOptions.length ? "bg-blue-50" : ""
              }`}
            >
              <span className="shrink-0">+ Add</span>
              <span className="truncate">"{typed}"</span>
            </button>
          )}

        </div>
      )}

    </div>
  );
};

/* Drug Name cell: searches medicine_master as the doctor types and adds a
   typed drug to the master through "+ Add". */
const AdviceDrugNameField: React.FC<{
  row: AdviceMedicineRow;
  onChange: (drugName: string, medicine: MedicineSearchOption | null) => void;
  onNotify: (message: string) => void;
}> = ({ row, onChange, onNotify }) => {
  const [results, setResults] = useState<MedicineSearchOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const requestRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const search = useCallback((query: string) => {
    window.clearTimeout(timerRef.current);
    const requestId = ++requestRef.current;
    setLoading(true);
    timerRef.current = window.setTimeout(
      () => {
        API.get<{ success: boolean; data: MedicineSearchOption[] }>(
          "/prescriptions/medicines",
          { params: { ...(query ? { search: query } : {}), limit: 50 } }
        )
          .then((response) => {
            if (requestId === requestRef.current) {
              setResults(response.data.data ?? []);
            }
          })
          .catch((error) => {
            console.error("Failed to search medicines:", error);
            if (requestId === requestRef.current) setResults([]);
          })
          .finally(() => {
            if (requestId === requestRef.current) setLoading(false);
          });
      },
      query ? 250 : 0
    );
  }, []);

  const options = useMemo<ComboOption[]>(
    () =>
      results.map((medicine) => ({
        key: medicine.medicine_id,
        value: medicine.medicine_name,
        hint:
          [
            medicine.generic_name &&
            medicine.generic_name.toLowerCase() !==
              medicine.medicine_name.toLowerCase()
              ? medicine.generic_name
              : "",
            strengthAsDosage(medicine.strength, medicine.unit),
          ]
            .filter(Boolean)
            .join(" · ") || undefined,
      })),
    [results]
  );

  const addToMaster = async (name: string) => {
    setAdding(true);
    try {
      const { unit } = splitDosage(row.dosage);
      const response = await API.post<{
        success: boolean;
        data: MedicineSearchOption;
      }>("/prescriptions/medicines", {
        medicine_name: name,
        ...(row.drugForm.trim() ? { dosage_form: row.drugForm.trim() } : {}),
        ...(unit ? { unit } : {}),
      });
      const medicine = response.data.data;
      onChange(medicine.medicine_name, medicine);
      setResults((prev) =>
        prev.some((item) => item.medicine_id === medicine.medicine_id)
          ? prev
          : [medicine, ...prev]
      );
      onNotify(
        response.status === 201
          ? `${medicine.medicine_name} added to the medicine list`
          : `${medicine.medicine_name} is already in the medicine list`
      );
    } catch (error: any) {
      onNotify(
        error?.response?.data?.message ||
          "Failed to add the drug to the medicine list."
      );
    } finally {
      setAdding(false);
    }
  };

  return (
    <AdviceComboField
      value={row.drugName}
      options={options}
      ariaLabel="Drug name"
      placeholder="Search drug"
      filterLocally={false}
      onSearch={search}
      loading={loading}
      busy={adding}
      warning={
        row.drugName.trim() && !row.medicineId
          ? "Not linked to the medicine list yet - pick it from the dropdown or use + Add"
          : undefined
      }
      menuClassName="min-w-[280px]"
      onChange={(value) => onChange(value, null)}
      onSelect={(option) => {
        const medicine = results.find(
          (item) => item.medicine_id === option.key
        );
        if (medicine) onChange(medicine.medicine_name, medicine);
      }}
      onAdd={addToMaster}
    />
  );
};

export interface AdviceSectionHandle {
  /* Saves the Advice rows as this encounter's prescription and the
     Discussion on the encounter. */
  save: (targetEncounter: EncounterRecord) => Promise<AdviceSaveResult>;
  /* Filled rows without saved ids, for Save as Draft. */
  getDraftRows: () => Omit<AdviceMedicineRow, "itemId" | "savedKey">[];
  /* Current Discussion text, for Save as Draft. */
  getDraftDiscussion: () => string;
  /* Current Follow-up Date (DD-MM-YYYY), for Save as Draft and the print. */
  getDraftFollowUpDate: () => string;
}

interface AdviceSectionProps {
  encounter: EncounterRecord | null;
  /* Unsaved draft rows are only restored for the patient they belong to. */
  patientId?: string;
  onToast: (message: string) => void;
}

/* The Consultation step's Advice section: the medicines table and the
   Discussion. It has no save button of its own: the step saves it
   through the handle when the doctor clicks Proceed to Next. */
const AdviceSection = forwardRef<
  AdviceSectionHandle,
  AdviceSectionProps
>(function AdviceSection(
  { encounter, patientId, onToast: showToast },
  ref,
) {
  /* Advice (OPD prescription). The refs mirror what an in-flight save
     must read even when it was started from an older render. */
  const [adviceRows, setAdviceRows] = useState<AdviceMedicineRow[]>([]);
  const adviceRowsRef = useRef<AdviceMedicineRow[]>([]);
  adviceRowsRef.current = adviceRows;
  const [advicePrescriptionId, setAdvicePrescriptionId] = useState("");
  const advicePrescriptionIdRef = useRef("");
  const adviceSavedSnapshotRef = useRef("");
  const adviceSaveRef = useRef<Promise<AdviceSaveResult> | null>(null);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [adviceSaving, setAdviceSaving] = useState(false);
  const [adviceError, setAdviceError] = useState("");
  const [adviceCustomOptions, setAdviceCustomOptions] = useState(
    loadAdviceCustomOptions
  );

  /* Discussion: the doctor's remarks for this visit. Saved on the
     encounter (encounter.notes), independent of the medicines. */
  const [discussion, setDiscussion] = useState("");
  const discussionRef = useRef("");
  discussionRef.current = discussion;
  const [savedDiscussion, setSavedDiscussion] = useState("");
  const savedDiscussionRef = useRef("");

  const markDiscussionSaved = (value: string) => {
    savedDiscussionRef.current = value;
    setSavedDiscussion(value);
  };

  /* Follow-up Date (DD-MM-YYYY): when the patient should come back. Saved
     on the encounter (encounter.follow_up_date) - the same value as the
     Follow Up step's Next Visit Date. */
  const [followUpDate, setFollowUpDate] = useState("");
  const followUpDateRef = useRef("");
  followUpDateRef.current = followUpDate;
  const [savedFollowUpDate, setSavedFollowUpDate] = useState("");
  const savedFollowUpDateRef = useRef("");

  const markFollowUpDateSaved = (value: string) => {
    savedFollowUpDateRef.current = value;
    setSavedFollowUpDate(value);
  };

  /* ============================================================
     ADVICE ROWS
  ============================================================ */

  const addAdviceRow = () => {
    setAdviceRows((prev) => [...prev, createAdviceRow()]);
  };

  const updateAdviceRow = (
    rowId: string,
    changes: Partial<AdviceMedicineRow>
  ) => {
    setAdviceRows((prev) =>
      prev.map((row) => (row.rowId === rowId ? { ...row, ...changes } : row))
    );
  };

  const removeAdviceRow = (rowId: string) => {
    setAdviceRows((prev) => prev.filter((row) => row.rowId !== rowId));
  };

  /* Selecting a drug also fills Drug Form / Dosage from the master when
     the doctor has not entered them yet. */
  const handleAdviceDrugChange = (
    row: AdviceMedicineRow,
    drugName: string,
    medicine: MedicineSearchOption | null
  ) => {
    const masterDosage = medicine
      ? strengthAsDosage(medicine.strength, medicine.unit)
      : "";
    updateAdviceRow(row.rowId, {
      drugName,
      medicineId: medicine?.medicine_id ?? "",
      ...(medicine && !row.drugForm.trim() && medicine.dosage_form
        ? { drugForm: normalizeDrugForm(medicine.dosage_form) }
        : {}),
      ...(masterDosage && !row.dosage.trim() ? { dosage: masterDosage } : {}),
    });
  };

  const addAdviceCustomOption = (field: AdviceOptionField, value: string) => {
    const trimmed = value.trim();
    if (
      !trimmed ||
      adviceCustomOptions[field].some(
        (item) => item.toLowerCase() === trimmed.toLowerCase()
      )
    ) {
      return;
    }
    const next = {
      ...adviceCustomOptions,
      [field]: [...adviceCustomOptions[field], trimmed],
    };
    setAdviceCustomOptions(next);
    try {
      localStorage.setItem(ADVICE_CUSTOM_OPTIONS_KEY, JSON.stringify(next));
    } catch {
      // Storage full/blocked - the value still applies to this row.
    }
  };

  const adviceFieldOptions = useMemo(() => {
    const withCustom = (field: AdviceOptionField) =>
      mergeComboOptions(
        ADVICE_BASE_OPTIONS[field],
        adviceCustomOptions[field].map((value) => ({ value, hint: "Custom" }))
      );
    return {
      drugForm: withCustom("drugForm"),
      dosage: withCustom("dosage"),
      frequency: withCustom("frequency"),
      instruction: withCustom("instruction"),
      duration: withCustom("duration"),
    };
  }, [adviceCustomOptions]);

  const setAdvicePrescription = (prescriptionId: string, encounterNo: string) => {
    advicePrescriptionIdRef.current = prescriptionId;
    setAdvicePrescriptionId(prescriptionId);
    try {
      if (prescriptionId) {
        localStorage.setItem(adviceStorageKey(encounterNo), prescriptionId);
      } else {
        localStorage.removeItem(adviceStorageKey(encounterNo));
      }
    } catch {
      // Storage blocked - the appointment lookup still finds it on reload.
    }
  };

  /* Writes item ids / saved keys onto the rows by rowId, keeping any edits
     the doctor made while the save was running. */
  const applyAdviceRowUpdates = (
    updates: Record<string, Partial<AdviceMedicineRow>>
  ) => {
    if (Object.keys(updates).length === 0) return;
    const merge = (rows: AdviceMedicineRow[]) =>
      rows.map((row) =>
        updates[row.rowId] ? { ...row, ...updates[row.rowId] } : row
      );
    adviceRowsRef.current = merge(adviceRowsRef.current);
    setAdviceRows(merge);
  };

  /* Seed the Discussion and the Follow-up Date from the encounter. With
     nothing saved yet, restore this patient's unsaved draft values. */
  useEffect(() => {
    if (!encounter?.encounter_no) return;
    const saved = encounter.notes ?? "";
    const savedFollowUp = dateOnlyDMY(encounter.follow_up_date);
    markDiscussionSaved(saved);
    markFollowUpDateSaved(savedFollowUp);
    let initial = saved;
    let initialFollowUp = savedFollowUp;
    try {
      const draft = JSON.parse(
        localStorage.getItem("hms_consultation_draft") ?? "{}"
      );
      if (draft.patientId && draft.patientId === patientId) {
        if (!saved && typeof draft.adviceDiscussion === "string") {
          initial = draft.adviceDiscussion;
        }
        if (!savedFollowUp && typeof draft.adviceFollowUpDate === "string") {
          initialFollowUp = draft.adviceFollowUpDate;
        }
      }
    } catch {
      // Malformed draft - start from the saved values.
    }
    setDiscussion(initial);
    setFollowUpDate(initialFollowUp);
  }, [encounter?.encounter_no]);

  /* ============================================================
     LOAD ADVICE PRESCRIPTION
     Re-opens the Advice rows already saved for this encounter: the
     prescription id remembered for the encounter first, else the
     appointment's prescription carrying ADVICE items. With nothing
     on the server, this patient's unsaved draft rows are restored.
  ============================================================ */

  useEffect(() => {
    const encounterNo = encounter?.encounter_no;
    if (!encounterNo) return;
    const appointmentId = encounter?.appointment_id;
    let cancelled = false;

    const findSavedPrescription =
      async (): Promise<AdvicePrescriptionRecord | null> => {
        const storedId = localStorage.getItem(adviceStorageKey(encounterNo));
        if (storedId) {
          try {
            const response = await API.get<{
              success: boolean;
              data: AdvicePrescriptionRecord;
            }>(`/prescriptions/${encodeURIComponent(storedId)}`);
            const record = response.data.data;
            if (record && record.prescription_status !== "CANCELLED") {
              return record;
            }
          } catch (error) {
            console.error("Failed to load the saved Advice prescription:", error);
          }
        }
        if (!appointmentId) return null;
        const response = await API.get<{
          success: boolean;
          data: { prescriptions: AdvicePrescriptionRecord[] };
        }>("/prescriptions", {
          params: {
            appointmentId,
            sortBy: "created_at",
            sortOrder: "desc",
            limit: 20,
          },
        });
        return (
          (response.data.data?.prescriptions ?? []).find(
            (record) =>
              record.prescription_status !== "CANCELLED" &&
              (record.prescription_items ?? []).some(
                (item) => item.drug_role === ADVICE_DRUG_ROLE
              )
          ) ?? null
        );
      };

    setAdviceLoading(true);
    findSavedPrescription()
      .then((record) => {
        if (cancelled) return;
        if (record) {
          const rows = adviceRowsFromPrescription(record);
          setAdvicePrescription(record.prescription_id, encounterNo);
          adviceSavedSnapshotRef.current = adviceSnapshot(rows);
          adviceRowsRef.current = rows;
          setAdviceRows(rows);
          return;
        }
        setAdvicePrescription("", encounterNo);
        try {
          const draft = JSON.parse(
            localStorage.getItem("hms_consultation_draft") ?? "{}"
          );
          if (
            draft.patientId &&
            draft.patientId === patientId &&
            Array.isArray(draft.adviceRows) &&
            draft.adviceRows.length > 0
          ) {
            setAdviceRows(
              (draft.adviceRows as Partial<AdviceMedicineRow>[]).map((row) => ({
                ...createAdviceRow(),
                drugForm: row.drugForm ?? "",
                drugName: row.drugName ?? "",
                medicineId: row.medicineId ?? "",
                dosage: row.dosage ?? "",
                frequency: row.frequency ?? "",
                instruction: row.instruction ?? "",
                duration: row.duration ?? "",
              }))
            );
          }
        } catch {
          // Malformed draft - start with an empty Advice table.
        }
      })
      .catch((error) =>
        console.error("Failed to load the Advice prescription:", error)
      )
      .finally(() => {
        if (!cancelled) setAdviceLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [encounter?.encounter_no]);

  /* ============================================================
     SAVE ADVICE PRESCRIPTION
     First save creates the prescription (POST /prescriptions);
     later saves sync its items so there is one prescription per
     encounter. Unchanged leading rows are kept and everything from
     the first changed row on is re-added, so the saved order
     always matches the table.
  ============================================================ */

  const runAdviceSave = async (
    targetEncounter: EncounterRecord
  ): Promise<AdviceSaveResult> => {
    setAdviceError("");
    const encounterNo = targetEncounter.encounter_no;
    const rows = adviceRowsRef.current.filter((row) => !isAdviceRowEmpty(row));
    let prescriptionId = advicePrescriptionIdRef.current;

    if (rows.length === 0 && !prescriptionId) return "empty";

    /* 1. Link typed drug names that exactly match a medicine_master row. */
    const linked: Record<string, Partial<AdviceMedicineRow>> = {};
    for (const row of rows) {
      if (row.medicineId) continue;
      const name = row.drugName.trim();
      if (!name) {
        setAdviceError(
          "Enter a drug name for every medicine row, or remove the row."
        );
        return "failed";
      }
      try {
        const response = await API.get<{
          success: boolean;
          data: MedicineSearchOption[];
        }>("/prescriptions/medicines", { params: { search: name, limit: 20 } });
        const match = (response.data.data ?? []).find(
          (medicine) =>
            medicine.medicine_name.trim().toLowerCase() === name.toLowerCase()
        );
        if (match) {
          linked[row.rowId] = {
            drugName: match.medicine_name,
            medicineId: match.medicine_id,
          };
          continue;
        }
      } catch (error) {
        console.error("Failed to look up medicine:", error);
      }
      setAdviceError(
        `"${name}" is not in the medicine list. Pick it from the Drug Name dropdown or use "+ Add" to add it.`
      );
      return "failed";
    }
    applyAdviceRowUpdates(linked);
    const linkedRows = rows.map((row) =>
      linked[row.rowId] ? { ...row, ...linked[row.rowId] } : row
    );

    /* 2. The backend rejects the same medicine twice on one prescription. */
    const seenMedicineIds = new Set<string>();
    for (const row of linkedRows) {
      if (seenMedicineIds.has(row.medicineId)) {
        setAdviceError(
          `${row.drugName} is added more than once. Remove the duplicate row.`
        );
        return "failed";
      }
      seenMedicineIds.add(row.medicineId);
    }

    if (
      prescriptionId &&
      adviceSnapshot(linkedRows) === adviceSavedSnapshotRef.current
    ) {
      return "unchanged";
    }

    const updates: Record<string, Partial<AdviceMedicineRow>> = {};
    try {
      let serverItems: AdvicePrescriptionItemRecord[] = [];
      if (prescriptionId) {
        try {
          const response = await API.get<{
            success: boolean;
            data: AdvicePrescriptionRecord;
          }>(`/prescriptions/${encodeURIComponent(prescriptionId)}`);
          const record = response.data.data;
          if (!record || record.prescription_status === "CANCELLED") {
            prescriptionId = "";
          } else if (record.prescription_status !== "DRAFT") {
            setAdviceError(
              "This prescription is finalized and can no longer be edited here."
            );
            return "failed";
          } else {
            serverItems = record.prescription_items ?? [];
          }
        } catch (error: any) {
          if (error?.response?.status !== 404) throw error;
          prescriptionId = "";
        }
      }

      let result: AdviceSaveResult = "saved";

      if (!prescriptionId) {
        if (linkedRows.length === 0) {
          setAdvicePrescription("", encounterNo);
          adviceSavedSnapshotRef.current = "";
          return "cleared";
        }
        const response = await API.post<{
          success: boolean;
          data: AdvicePrescriptionRecord;
        }>("/prescriptions", {
          encounter_no: encounterNo,
          medicines: linkedRows.map(buildAdviceItemPayload),
        });
        const record = response.data.data;
        prescriptionId = record.prescription_id;
        setAdvicePrescription(prescriptionId, encounterNo);
        const itemIdByMedicine = new Map(
          (record.prescription_items ?? []).map((item) => [
            item.medicine_id,
            item.prescription_item_id,
          ])
        );
        linkedRows.forEach((row) => {
          updates[row.rowId] = {
            itemId: itemIdByMedicine.get(row.medicineId),
            savedKey: adviceRowKey(row),
          };
        });
      } else if (linkedRows.length === 0) {
        /* Every row was removed - cancel the now-empty prescription. */
        await API.delete(`/prescriptions/${encodeURIComponent(prescriptionId)}`);
        setAdvicePrescription("", encounterNo);
        result = "cleared";
      } else {
        const serverItemIds = new Set(
          serverItems.map((item) => item.prescription_item_id)
        );
        let firstChanged = linkedRows.findIndex(
          (row) =>
            !row.itemId ||
            !serverItemIds.has(row.itemId) ||
            row.savedKey !== adviceRowKey(row)
        );
        if (firstChanged === -1) firstChanged = linkedRows.length;
        const keptItemIds = new Set(
          linkedRows.slice(0, firstChanged).map((row) => row.itemId)
        );
        for (const item of serverItems) {
          if (keptItemIds.has(item.prescription_item_id)) continue;
          await API.delete(
            `/prescriptions/${encodeURIComponent(
              prescriptionId
            )}/items/${encodeURIComponent(item.prescription_item_id)}`
          );
        }
        for (const row of linkedRows.slice(firstChanged)) {
          const response = await API.post<{
            success: boolean;
            data: AdvicePrescriptionItemRecord;
          }>(
            `/prescriptions/${encodeURIComponent(prescriptionId)}/items`,
            buildAdviceItemPayload(row)
          );
          updates[row.rowId] = {
            itemId: response.data.data?.prescription_item_id,
            savedKey: adviceRowKey(row),
          };
        }
      }

      applyAdviceRowUpdates(updates);
      adviceSavedSnapshotRef.current =
        result === "cleared"
          ? ""
          : adviceSnapshot(
              linkedRows.map((row) => ({ ...row, ...updates[row.rowId] }))
            );
      return result;
    } catch (error: any) {
      /* Keep ids of the items that did save so the next save resumes. */
      applyAdviceRowUpdates(updates);
      console.error("Failed to save the Advice prescription:", error);
      setAdviceError(
        error?.response?.data?.message ||
          error?.message ||
          "Failed to save the prescription."
      );
      return "failed";
    }
  };

  /* Saves the Discussion to the encounter when it changed since the
     last save/load. */
  const saveDiscussion = async (
    targetEncounter: EncounterRecord
  ): Promise<"saved" | "unchanged" | "failed"> => {
    const value = discussionRef.current.trim();
    if (value === savedDiscussionRef.current.trim()) return "unchanged";
    try {
      await encounterApi.update(targetEncounter.encounter_no, { notes: value });
      markDiscussionSaved(value);
      return "saved";
    } catch (error: any) {
      console.error("Failed to save the Advice discussion:", error);
      setAdviceError(
        error?.response?.data?.message ||
          error?.message ||
          "Failed to save the discussion."
      );
      return "failed";
    }
  };

  /* Saves the Follow-up Date on the encounter when it changed since the
     last save/load (cleared -> null). An invalid or past date stops the
     save with the reason, so nothing is lost. */
  const saveFollowUpDate = async (
    targetEncounter: EncounterRecord
  ): Promise<"saved" | "unchanged" | "failed"> => {
    const value = followUpDateRef.current.trim();
    if (value === savedFollowUpDateRef.current.trim()) return "unchanged";
    const invalid = targetDateError(value);
    if (invalid) {
      showToast(`Follow-up Date: ${invalid}`);
      return "failed";
    }
    try {
      await encounterApi.update(targetEncounter.encounter_no, {
        follow_up_date: value ? dmyToIsoStrict(value) ?? null : null,
      });
      markFollowUpDateSaved(value);
      /* The later steps (Follow Up, Summary) show the same date. */
      if (patientId && value) {
        localStorage.setItem(`hms_next_cycle_date_${patientId}`, value);
      }
      return "saved";
    } catch (error: any) {
      console.error("Failed to save the Follow-up Date:", error);
      setAdviceError(
        error?.response?.data?.message ||
          error?.message ||
          "Failed to save the Follow-up Date."
      );
      return "failed";
    }
  };

  /* Saves the whole section: the medicines as the encounter's
     prescription, then the Discussion and the Follow-up Date. Serialised so overlapping calls
     can never give one encounter two prescriptions. */
  const saveAdviceSection = async (
    targetEncounter: EncounterRecord
  ): Promise<AdviceSaveResult> => {
    while (adviceSaveRef.current) {
      await adviceSaveRef.current;
    }
    const run = (async (): Promise<AdviceSaveResult> => {
      setAdviceSaving(true);
      try {
        const medicines = await runAdviceSave(targetEncounter);
        const discussionResult = await saveDiscussion(targetEncounter);
        const followUpResult = await saveFollowUpDate(targetEncounter);
        if (
          medicines === "failed" ||
          discussionResult === "failed" ||
          followUpResult === "failed"
        ) {
          return "failed";
        }
        if (
          (discussionResult === "saved" || followUpResult === "saved") &&
          (medicines === "empty" || medicines === "unchanged")
        ) {
          return "saved";
        }
        return medicines;
      } finally {
        setAdviceSaving(false);
      }
    })();
    adviceSaveRef.current = run;
    try {
      return await run;
    } finally {
      adviceSaveRef.current = null;
    }
  };

  const adviceFilledRows = adviceRows.filter((row) => !isAdviceRowEmpty(row));
  const adviceDirty =
    (adviceFilledRows.length > 0 || Boolean(advicePrescriptionId)) &&
    adviceSnapshot(adviceFilledRows) !== adviceSavedSnapshotRef.current;
  const discussionDirty = discussion.trim() !== savedDiscussion.trim();
  const followUpDirty = followUpDate.trim() !== savedFollowUpDate.trim();
  /* A saved date is shown as it is, even once it has passed. */
  const followUpError = followUpDirty ? targetDateError(followUpDate) : "";

  /* Save feedback for the section; saving itself happens on Proceed to
     Next, so failures are explained here. */
  const adviceStatus = adviceError ? (
    <span className="text-red-600">{adviceError}</span>
  ) : adviceSaving ? (
    <span className="text-slate-500">Saving...</span>
  ) : adviceDirty || discussionDirty || followUpDirty ? (
    <span className="text-slate-500">
      Unsaved changes, saved when you click Proceed to Next
    </span>
  ) : advicePrescriptionId ? (
    <span className="text-green-600">
      Saved to prescription {advicePrescriptionId}
    </span>
  ) : savedDiscussion.trim() ? (
    <span className="text-green-600">Discussion saved</span>
  ) : null;

  const renderAdviceOptionField = (
    row: AdviceMedicineRow,
    field: AdviceOptionField,
    ariaLabel: string,
    placeholder: string,
    suggestions: ComboOption[] = []
  ) => (
    <AdviceComboField
      value={row[field]}
      options={
        suggestions.length > 0
          ? mergeComboOptions(suggestions, adviceFieldOptions[field])
          : adviceFieldOptions[field]
      }
      ariaLabel={ariaLabel}
      placeholder={placeholder}
      onChange={(value) => updateAdviceRow(row.rowId, { [field]: value })}
      onSelect={(option) =>
        updateAdviceRow(row.rowId, { [field]: option.value })
      }
      onAdd={(value) => {
        addAdviceCustomOption(field, value);
        updateAdviceRow(row.rowId, { [field]: value });
      }}
    />
  );

  useImperativeHandle(ref, () => ({
    save: saveAdviceSection,
    getDraftRows: () =>
      adviceRowsRef.current
        .filter((row) => !isAdviceRowEmpty(row))
        .map(({ itemId: _itemId, savedKey: _savedKey, ...row }) => row),
    getDraftDiscussion: () => discussionRef.current,
    getDraftFollowUpDate: () => followUpDateRef.current,
  }));

  return (
    <section className="flex w-full flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5">

      <div className="flex w-full items-center justify-between gap-4">

        <div className="flex flex-col">
          <div className="text-[10px] font-bold leading-4 text-slate-800">
            Advice
          </div>
          <div className="text-[10px] leading-4 text-slate-500">
            Medicines prescribed to the patient for this visit
          </div>
        </div>

        <button
          type="button"
          onClick={addAdviceRow}
          disabled={adviceLoading}
          className="flex h-9 w-fit items-center justify-center gap-1.5 rounded-lg border border-blue-600 bg-white px-4 text-sm font-bold leading-5 text-blue-600 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
          <span>Add Medicine</span>
        </button>

      </div>

      {adviceLoading ? (
        <div className="text-[10px] leading-5 text-slate-500">
          Loading prescribed medicines...
        </div>
      ) : adviceRows.length === 0 ? (
        <div className="flex w-full items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-[10px] leading-5 text-slate-500">
          No medicines prescribed yet. Click "Add Medicine" to prescribe.
        </div>
      ) : (
        <table className="w-full table-fixed border-separate border-spacing-0 text-left">

          <colgroup>
            <col className="w-10" />
            <col className="w-[11%]" />
            <col />
            <col className="w-[13%]" />
            <col className="w-[13%]" />
            <col className="w-[17%]" />
            <col className="w-[12%]" />
            <col className="w-11" />
          </colgroup>

          <thead>
            <tr>
              {[
                "#",
                "Drug Form",
                "Drug Name",
                "Dosage",
                "Frequency",
                "Instruction",
                "Duration",
              ].map((heading) => (
                <th
                  key={heading}
                  className="border-y border-slate-200 bg-slate-50 px-2 py-2 text-[10px] font-bold leading-4 text-slate-800 first:rounded-tl-md first:border-l"
                >
                  {heading}
                </th>
              ))}
              <th className="rounded-tr-md border-y border-r border-slate-200 bg-slate-50 px-2 py-2">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {adviceRows.map((row, index) => (
              <tr key={row.rowId} className="align-top">

                <td className="border-b border-slate-100 px-2 py-2 text-[10px] leading-[34px] text-slate-500">
                  {index + 1}
                </td>

                <td className="border-b border-slate-100 px-2 py-2">
                  {renderAdviceOptionField(row, "drugForm", "Drug form", "Tab")}
                </td>

                <td className="border-b border-slate-100 px-2 py-2">
                  <AdviceDrugNameField
                    row={row}
                    onChange={(drugName, medicine) =>
                      handleAdviceDrugChange(row, drugName, medicine)
                    }
                    onNotify={showToast}
                  />
                </td>

                <td className="border-b border-slate-100 px-2 py-2">
                  {renderAdviceOptionField(
                    row,
                    "dosage",
                    "Dosage",
                    "500 mg",
                    expandNumberSuggestions(row.dosage, DOSAGE_UNIT_WORDS)
                  )}
                </td>

                <td className="border-b border-slate-100 px-2 py-2">
                  {renderAdviceOptionField(row, "frequency", "Frequency", "1-0-1")}
                </td>

                <td className="border-b border-slate-100 px-2 py-2">
                  {renderAdviceOptionField(row, "instruction", "Instruction", "After food")}
                </td>

                <td className="border-b border-slate-100 px-2 py-2">
                  {renderAdviceOptionField(
                    row,
                    "duration",
                    "Duration",
                    "5 days",
                    expandNumberSuggestions(row.duration, DURATION_UNIT_WORDS)
                  )}
                </td>

                <td className="border-b border-slate-100 px-1 py-2 text-center">
                  <button
                    type="button"
                    onClick={() => removeAdviceRow(row.rowId)}
                    aria-label={`Remove medicine ${index + 1}`}
                    title="Remove"
                    className="inline-flex h-[34px] w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-4 w-4"
                    >
                      <path d="M3 6h18" />
                      <path d="M8 6V4h8v2" />
                      <path d="M19 6l-1 14H6L5 6" />
                      <path d="M10 11v6" />
                      <path d="M14 11v6" />
                    </svg>
                  </button>
                </td>

              </tr>
            ))}
          </tbody>

        </table>
      )}

      {/* FOLLOW-UP DATE */}

      <div className="flex w-full flex-col gap-2 sm:max-w-xs">

        <div className="flex items-center justify-between gap-2">
          <label
            htmlFor="advice-follow-up-date"
            className="text-[10px] font-bold leading-4 text-slate-500"
          >
            Follow-up Date
          </label>
          {followUpDate && (
            <button
              type="button"
              onClick={() => setFollowUpDate("")}
              className="text-[10px] font-medium text-slate-400 transition-colors hover:text-red-500"
            >
              Clear
            </button>
          )}
        </div>

        <DateInputField
          id="advice-follow-up-date"
          value={followUpDate}
          onChange={setFollowUpDate}
          error={followUpError}
          ariaLabel="Pick follow-up date"
        />

        {!followUpError && (
          <span className="text-[10px] leading-[14px] text-slate-400">
            {followUpDirty
              ? "Unsaved change - saved when you click Proceed to Next"
              : savedFollowUpDate
                ? "Saved for this visit"
                : "Type DD-MM-YYYY or pick from the calendar"}
          </span>
        )}

      </div>

      {/* DISCUSSION */}

      <div className="flex w-full flex-col gap-2">

        <label className="text-[10px] font-bold leading-4 text-slate-800">
          Discussion
        </label>

        <VoiceToText
          value={discussion}
          onChange={(text) => setDiscussion(text)}
          placeholder="Type the discussion with the patient..."
        />

      </div>

      {!adviceLoading && adviceStatus && (
        <div className="text-[10px] font-medium leading-4">
          {adviceStatus}
        </div>
      )}

    </section>
  );
});

export default AdviceSection;
