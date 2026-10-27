import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useToast } from "@/hooks/use-toast";
import { useClinicalDetails } from "@/hooks/useClinicalDetails";
import {
  MultiSelectDropdown,
  type MultiSelectOption,
} from "@/components/ui/multi-select-dropdown";
import { VoiceInput } from "@/components/ui/voicetotext";
import DurationInput from "@/components/ui/duration-input";
import {
  DEFAULT_DURATION_UNIT,
  durationFromDays,
  durationToDays,
  formatDuration,
  normalizeDurationUnit,
  toDurationPayload,
  type DurationUnit,
} from "@/utils/duration";

/* ============================================================
   Severity choices mirror the backend enums
   (SYMPTOM_SEVERITY / ALLERGY_SEVERITY) from the API contract.
============================================================ */

const SYMPTOM_SEVERITIES = ["MILD", "MODERATE", "SEVERE", "CRITICAL"];
const ALLERGY_SEVERITIES = ["MILD", "MODERATE", "SEVERE", "ANAPHYLACTIC"];

interface SymptomSelection {
  symptomId: string;
  symptomName: string;
  severity: string;
  durationValue: string;
  durationUnit: DurationUnit;
  clinicalNotes: string;
}

interface AllergySelection {
  allergyId: string;
  substanceName: string;
  severity: string;
  reaction: string;
  durationValue: string;
  durationUnit: DurationUnit;
  commands: string;
}

interface ComorbiditySelection {
  /* comorbidity_master.id */
  comorbidityId: string;
  comorbidityName: string;
  durationValue: string;
  durationUnit: DurationUnit;
  commands: string;
  onsetDate: string;
}

interface ClinicalDetailsSectionProps {
  patientId?: string;
  encounterNo?: string | null;
  onSaveStateChange?: (state: {
    saving: boolean;
    disabled: boolean;
    saveError: string | null;
    saveSuccess: boolean;
  }) => void;
}

export interface ClinicalDetailsSectionSaveState {
  saving: boolean;
  disabled: boolean;
  saveError: string | null;
  saveSuccess: boolean;
}

export interface ClinicalDetailsSectionHandle {
  /* Resolves true when the clinical details were saved (or there was
     nothing editable to save yet), false when any write failed. */
  handleSave: () => Promise<boolean>;
  /* Current selections, for the printed consultation summary. */
  getPrintSummary: () => ClinicalDetailsPrintSummary;
}

export interface ClinicalDetailsPrintSummary {
  performanceStatus: string;
  symptoms: {
    name: string;
    severity: string;
    duration: string;
    notes: string;
  }[];
  allergies: {
    name: string;
    severity: string;
    reaction: string;
    duration: string;
    commands: string;
  }[];
  comorbidities: {
    name: string;
    onsetDate: string;
    duration: string;
    commands: string;
  }[];
}

const ChevronDownIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="#94a3b8"
    strokeWidth="1.8"
    className="pointer-events-none absolute right-3 top-2.5 h-4 w-4"
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const Spinner = () => (
  <svg
    className="h-4 w-4 animate-spin text-blue-600"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
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
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

export const ClinicalDetailsSection = forwardRef<
  ClinicalDetailsSectionHandle,
  ClinicalDetailsSectionProps
>(function ClinicalDetailsSection(
  { patientId, encounterNo, onSaveStateChange },
  ref,
) {
  const { toast } = useToast();

  const {
    loading,
    error,
    retry,
    performanceStatusOptions,
    symptomOptions,
    allergyOptions,
    comorbidityOptions,
    comorbidityCategories,
    saved,
    saving,
    saveError,
    saveSuccess,
    saveClinicalDetails,
    createSymptom,
    createAllergy,
    createComorbidity,
  } = useClinicalDetails({ patientId, encounterNo });

  const [ecogId, setEcogId] = useState("");
  const [symptomSelections, setSymptomSelections] = useState<
    SymptomSelection[]
  >([]);
  const [allergySelections, setAllergySelections] = useState<
    AllergySelection[]
  >([]);
  const [comorbiditySelections, setComorbiditySelections] = useState<
    ComorbiditySelection[]
  >([]);

  /* "Others" free-text capture state for Symptoms / Allergies / Comorbidities */
  const [otherSymptom, setOtherSymptom] = useState(false);
  const [otherSymptomName, setOtherSymptomName] = useState("");
  const [otherSymptomBusy, setOtherSymptomBusy] = useState(false);

  const [otherAllergy, setOtherAllergy] = useState(false);
  const [otherAllergyName, setOtherAllergyName] = useState("");
  const [otherAllergyBusy, setOtherAllergyBusy] = useState(false);

  const [otherComorbidity, setOtherComorbidity] = useState(false);
  const [otherComorbidityName, setOtherComorbidityName] = useState("");
  const [otherComorbidityCategory, setOtherComorbidityCategory] = useState(
    "",
  );
  const [otherComorbidityBusy, setOtherComorbidityBusy] = useState(false);

  const disabled = loading || saving || !encounterNo || !patientId;

  /* ============================================================
     Sync local form state from the backend's saved records.
     Master lists are the available choices; `saved` holds the
     patient/encounter's actual values.
  ============================================================ */
  useEffect(() => {
    if (loading) return;

    if (saved) {
      setEcogId(
        saved.performanceStatus
          ? String(saved.performanceStatus.id)
          : "",
      );
      setSymptomSelections(
        saved.symptoms.map((symptom) => {
          const duration = durationFromDays(
            symptom.durationDays,
            symptom.durationUnit,
          );
          return {
            symptomId: String(symptom.symptomId),
            symptomName: symptom.symptomName,
            severity: symptom.severity ?? "",
            durationValue: duration.value,
            durationUnit: duration.unit,
            clinicalNotes: symptom.clinicalNotes ?? "",
          };
        }),
      );
      setAllergySelections(
        saved.allergies.map((allergy) => ({
          allergyId: String(allergy.allergyId),
          substanceName: allergy.substanceName,
          severity: allergy.severity ?? "",
          reaction: allergy.reaction ?? "",
          durationValue:
            allergy.durationValue != null ? String(allergy.durationValue) : "",
          durationUnit: normalizeDurationUnit(allergy.durationUnit),
          commands: allergy.clinicalNotes ?? "",
        })),
      );
      setComorbiditySelections(
        saved.comorbidities.map((comorbidity) => ({
          comorbidityId: String(comorbidity.comorbidityId),
          comorbidityName: comorbidity.comorbidityName,
          durationValue:
            comorbidity.durationValue != null
              ? String(comorbidity.durationValue)
              : "",
          durationUnit: normalizeDurationUnit(comorbidity.durationUnit),
          commands: comorbidity.clinicalNotes ?? "",
          onsetDate: comorbidity.onsetDate
            ? String(comorbidity.onsetDate).slice(0, 10)
            : "",
        })),
      );
    } else {
      setEcogId("");
      setSymptomSelections([]);
      setAllergySelections([]);
      setComorbiditySelections([]);
    }
  }, [saved, loading]);

  /* ============================================================
     Available choices for the "add" controls (active master values
     that have not already been selected).
  ============================================================ */
  const availableSymptoms = useMemo(
    () =>
      symptomOptions.filter(
        (option) =>
          !symptomSelections.some(
            (selection) => selection.symptomId === option.id,
          ),
      ),
    [symptomOptions, symptomSelections],
  );

  const availableAllergies = useMemo(
    () =>
      allergyOptions.filter(
        (option) =>
          !allergySelections.some(
            (selection) => selection.allergyId === option.id,
          ),
      ),
    [allergyOptions, allergySelections],
  );

  /* Comorbidity picker options (search, multi-select, category + ICD-10
     hint). A saved comorbidity missing from the active list (e.g. since
     deactivated) is kept so its chip still shows its name. */
  const comorbidityDropdownOptions = useMemo<MultiSelectOption[]>(() => {
    const options: MultiSelectOption[] = comorbidityOptions.map((option) => ({
      value: String(option.id),
      label: option.comorbidity_name,
      hint:
        [option.category, option.icd_code].filter(Boolean).join(" · ") ||
        undefined,
    }));
    for (const selection of comorbiditySelections) {
      if (!options.some((option) => option.value === selection.comorbidityId)) {
        options.push({
          value: selection.comorbidityId,
          label: selection.comorbidityName,
        });
      }
    }
    return options;
  }, [comorbidityOptions, comorbiditySelections]);

  /* ============================================================
     Local selection handlers (no backend writes until Save)
  ============================================================ */

  const addSymptom = (symptomId: string) => {
    if (!symptomId) return;
    setSymptomSelections((previous) => {
      if (previous.some((selection) => selection.symptomId === symptomId)) {
        return previous;
      }
      const option = symptomOptions.find((item) => item.id === symptomId);
      return [
        ...previous,
        {
          symptomId,
          symptomName: option?.name ?? symptomId,
          severity: "",
          durationValue: "",
          durationUnit: DEFAULT_DURATION_UNIT,
          clinicalNotes: "",
        },
      ];
    });
  };

  const removeSymptom = (symptomId: string) => {
    setSymptomSelections((previous) =>
      previous.filter((selection) => selection.symptomId !== symptomId),
    );
  };

  const updateSymptom = <K extends keyof Omit<SymptomSelection, "symptomId" | "symptomName">>(
    symptomId: string,
    field: K,
    value: SymptomSelection[K],
  ) => {
    setSymptomSelections((previous) =>
      previous.map((selection) =>
        selection.symptomId === symptomId
          ? { ...selection, [field]: value }
          : selection,
      ),
    );
  };

  const addAllergy = (allergyId: string) => {
    if (!allergyId) return;
    setAllergySelections((previous) => {
      if (previous.some((selection) => selection.allergyId === allergyId)) {
        return previous;
      }
      const option = allergyOptions.find((item) => item.id === allergyId);
      return [
        ...previous,
        {
          allergyId,
          substanceName: option?.substance_name ?? allergyId,
          severity: "",
          reaction: "",
          durationValue: "",
          durationUnit: DEFAULT_DURATION_UNIT,
          commands: "",
        },
      ];
    });
  };

  const removeAllergy = (allergyId: string) => {
    setAllergySelections((previous) =>
      previous.filter((selection) => selection.allergyId !== allergyId),
    );
  };

  const updateAllergy = <K extends keyof Omit<AllergySelection, "allergyId" | "substanceName">>(
    allergyId: string,
    field: K,
    value: AllergySelection[K],
  ) => {
    setAllergySelections((previous) =>
      previous.map((selection) =>
        selection.allergyId === allergyId
          ? { ...selection, [field]: value }
          : selection,
      ),
    );
  };

  const updateComorbidity = <K extends keyof Omit<ComorbiditySelection, "comorbidityId" | "comorbidityName">>(
    comorbidityId: string,
    field: K,
    value: ComorbiditySelection[K],
  ) => {
    setComorbiditySelections((previous) =>
      previous.map((selection) =>
        selection.comorbidityId === comorbidityId
          ? { ...selection, [field]: value }
          : selection,
      ),
    );
  };

  /* The picker reports the full list of ticked ids; keep each name. */
  const handleComorbidityChange = (comorbidityIds: string[]) => {
    setComorbiditySelections((previous) =>
      comorbidityIds.map((comorbidityId) => {
        const existing = previous.find(
          (selection) => selection.comorbidityId === comorbidityId,
        );
        if (existing) return existing;
        const option = comorbidityOptions.find(
          (item) => String(item.id) === comorbidityId,
        );
        return {
          comorbidityId,
          comorbidityName: option?.comorbidity_name ?? comorbidityId,
          durationValue: "",
          durationUnit: DEFAULT_DURATION_UNIT,
          commands: "",
          onsetDate: "",
        };
      }),
    );
  };

  /* ============================================================
     "Others" custom-create handlers
     Create a new master/reference record from free text and
     immediately add it to the current selection.
  ============================================================ */
  const handleCreateSymptom = async () => {
    const name = otherSymptomName.trim();
    if (!name || otherSymptomBusy || disabled) return;
    setOtherSymptomBusy(true);
    try {
      const created = await createSymptom(name);
      if (created) {
        setSymptomSelections((previous) =>
          previous.some(
            (selection) => selection.symptomId === String(created.id),
          )
            ? previous
            : [
                ...previous,
                {
                  symptomId: String(created.id),
                  symptomName: created.name,
                  severity: "",
                  durationValue: "",
                  durationUnit: DEFAULT_DURATION_UNIT,
                  clinicalNotes: "",
                },
              ],
        );
        setOtherSymptomName("");
        setOtherSymptom(false);
      }
    } catch {
      // Error surfaced via hook's error state / toast below.
    } finally {
      setOtherSymptomBusy(false);
    }
  };

  const handleCreateAllergy = async () => {
    const substanceName = otherAllergyName.trim();
    if (!substanceName || otherAllergyBusy || disabled) return;
    setOtherAllergyBusy(true);
    try {
      const created = await createAllergy(substanceName);
      if (created) {
        setAllergySelections((previous) =>
          previous.some(
            (selection) => selection.allergyId === String(created.id),
          )
            ? previous
            : [
                ...previous,
                {
                  allergyId: String(created.id),
                  substanceName: created.substance_name,
                  severity: "",
                  reaction: "",
                  durationValue: "",
                  durationUnit: DEFAULT_DURATION_UNIT,
                  commands: "",
                },
              ],
        );
        setOtherAllergyName("");
        setOtherAllergy(false);
      }
    } catch {
      // Error surfaced via hook's error state / toast below.
    } finally {
      setOtherAllergyBusy(false);
    }
  };

  const handleCreateComorbidity = async () => {
    const comorbidityName = otherComorbidityName.trim();
    if (!comorbidityName || otherComorbidityBusy || disabled) return;
    setOtherComorbidityBusy(true);
    try {
      // Adds it to comorbidity_master (or returns the existing entry with
      // the same name) and ticks it.
      const created = await createComorbidity({
        comorbidityName,
        category: otherComorbidityCategory || undefined,
      });
      if (created) {
        const createdId = String(created.id);
        setComorbiditySelections((previous) =>
          previous.some((selection) => selection.comorbidityId === createdId)
            ? previous
            : [
                ...previous,
                {
                  comorbidityId: createdId,
                  comorbidityName: created.comorbidity_name,
                  durationValue: "",
                  durationUnit: DEFAULT_DURATION_UNIT,
                  commands: "",
                  onsetDate: "",
                },
              ],
        );
        setOtherComorbidityName("");
        setOtherComorbidityCategory("");
        setOtherComorbidity(false);
      }
    } catch {
      // Error surfaced via hook's error state / toast below.
    } finally {
      setOtherComorbidityBusy(false);
    }
  };

  /* ============================================================
     Save: controlled operation sending the current local state to
     the backend (ordered diff-based sync inside the hook).
  ============================================================ */
  const handleSave = async (): Promise<boolean> => {
    // Still loading, or no patient/encounter: nothing editable to save.
    if (disabled) return true;

    return saveClinicalDetails({
      performanceStatusId: ecogId ? Number(ecogId) : null,
      symptoms: symptomSelections.map((selection) => {
        const duration = toDurationPayload(
          selection.durationValue,
          selection.durationUnit,
        );
        return {
          symptomId: Number(selection.symptomId),
          severity: selection.severity || undefined,
          durationDays: durationToDays(
            selection.durationValue,
            selection.durationUnit,
          ),
          durationUnit: duration.unit,
          clinicalNotes: selection.clinicalNotes || null,
        };
      }),
      allergies: allergySelections.map((selection) => {
        const duration = toDurationPayload(
          selection.durationValue,
          selection.durationUnit,
        );
        return {
          allergyId: Number(selection.allergyId),
          severity: selection.severity || undefined,
          reaction: selection.reaction || null,
          durationValue: duration.value,
          durationUnit: duration.unit,
          clinicalNotes: selection.commands || null,
        };
      }),
      comorbidities: comorbiditySelections.map((selection) => {
        const duration = toDurationPayload(
          selection.durationValue,
          selection.durationUnit,
        );
        return {
          comorbidityId: selection.comorbidityId,
          onsetDate: selection.onsetDate || null,
          durationValue: duration.value,
          durationUnit: duration.unit,
          clinicalNotes: selection.commands || null,
        };
      }),
    });
  };

  /* ============================================================
     Toast feedback driven by the hook's save state, so the current
     save result is always reflected (avoids stale closures).
  ============================================================ */
  const prevSaveError = useRef(saveError);
  useEffect(() => {
    if (saveError && saveError !== prevSaveError.current) {
      toast({
        title: "Failed to save clinical details",
        description: saveError,
        variant: "destructive",
      });
    }
    prevSaveError.current = saveError;
  }, [saveError, toast]);

  const prevSaveSuccess = useRef(saveSuccess);
  useEffect(() => {
    if (saveSuccess && !prevSaveSuccess.current) {
      toast({
        title: "Clinical details saved",
        description: "The clinical details were saved successfully.",
      });
    }
    prevSaveSuccess.current = saveSuccess;
  }, [saveSuccess, toast]);

  /* ============================================================
     Expose the save action so the Consultation step can run it
     from "Proceed to Next", and report the live save state
     (saving/disabled/messages) to an optional listener (a ref
     alone would never trigger re-renders).
  ============================================================ */
  useImperativeHandle(ref, () => ({
    handleSave,
    getPrintSummary: () => {
      const ecog = performanceStatusOptions.find(
        (option) => String(option.id) === String(ecogId),
      );
      return {
        performanceStatus: ecog
          ? `${ecog.code} - ${ecog.description}`
          : "",
        symptoms: symptomSelections.map((item) => ({
          name: item.symptomName,
          severity: item.severity,
          duration: formatDuration(item.durationValue, item.durationUnit),
          notes: item.clinicalNotes,
        })),
        allergies: allergySelections.map((item) => ({
          name: item.substanceName,
          severity: item.severity,
          reaction: item.reaction,
          duration: formatDuration(item.durationValue, item.durationUnit),
          commands: item.commands,
        })),
        comorbidities: comorbiditySelections.map((item) => ({
          name: item.comorbidityName,
          onsetDate: item.onsetDate,
          duration: formatDuration(item.durationValue, item.durationUnit),
          commands: item.commands,
        })),
      };
    },
  }));

  useEffect(() => {
    onSaveStateChange?.({ saving, disabled, saveError, saveSuccess });
  }, [saving, disabled, saveError, saveSuccess, onSaveStateChange]);

  return (
    <div className="flex flex-col gap-4">
      {/* CLINICAL DETAILS HEADER */}
      <div className="text-xs font-bold leading-4 text-slate-700">
        Clinical Details
      </div>

      {error && (
        <div className="flex w-full flex-col gap-2 rounded-md border border-red-200 bg-red-50 p-3">
          <div className="text-xs font-medium leading-4 text-red-700">
            {error}
          </div>
          <button
            type="button"
            onClick={retry}
            className="h-7 w-fit rounded-md border border-red-200 bg-white px-3 text-xs font-semibold leading-4 text-red-700 transition hover:bg-red-100"
          >
            Retry
          </button>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-xs leading-4 text-slate-500">
          <Spinner />
          Loading clinical details...
        </div>
      )}

      {/* ======================================================
          PERFORMANCE STATUS (ECOG)
          Single select — value is the master id, label is the
          backend-provided description.
      ====================================================== */}
      <div className="flex flex-col gap-1">
        <div className="text-[10px] font-bold uppercase leading-[15px] tracking-[0.5px] text-slate-400">
          Performance Status (ECOG)
        </div>

        <div className="relative h-[38px]">
          <select
            value={ecogId}
            onChange={(event) => setEcogId(event.target.value)}
            disabled={disabled}
            className="h-[38px] w-full appearance-none rounded-md border border-slate-200 bg-white px-[13px] pr-10 text-sm leading-5 text-slate-700 outline-none disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
          >
            <option value="">Select ECOG</option>
            {performanceStatusOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.code} - {option.description}
              </option>
            ))}
          </select>
          <ChevronDownIcon />
        </div>
      </div>

      {/* ======================================================
          SYMPTOMS
          Multi-select from symptom_master, stored per encounter.
      ====================================================== */}
      <div className="flex flex-col gap-1">
        <div className="text-[10px] font-bold uppercase leading-[15px] tracking-[0.5px] text-slate-400">
          Symptoms
        </div>

        <div className="flex min-h-[60px] w-full flex-wrap items-start gap-1.5 rounded-md border border-slate-200 bg-white p-1.5">
          {symptomSelections.map((selection) => (
            <div
              key={selection.symptomId}
              className="flex h-[26px] items-center gap-1 rounded border border-blue-100 bg-blue-50 px-[9px] py-[3px] text-xs leading-4 text-blue-700"
            >
              <span>{selection.symptomName}</span>
              <button
                type="button"
                onClick={() => removeSymptom(selection.symptomId)}
                disabled={disabled}
                className="border-0 bg-transparent p-0 text-xs leading-4 text-blue-700 disabled:cursor-not-allowed disabled:text-blue-300"
              >
                ×
              </button>
            </div>
          ))}

          <select
            value=""
            onChange={(event) => {
              if (event.target.value === "__OTHER__") {
                setOtherSymptom(true);
              } else {
                addSymptom(event.target.value);
              }
            }}
            disabled={disabled}
            className="h-[26px] w-full appearance-none rounded border border-slate-200 bg-white px-2 text-xs leading-4 text-slate-500 outline-none sm:w-40 disabled:cursor-not-allowed disabled:bg-slate-50"
          >
            <option value="">
              {availableSymptoms.length === 0
                ? "No more symptoms"
                : "Add symptom..."}
            </option>
            {availableSymptoms.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
            <option value="__OTHER__">Others...</option>
          </select>
        </div>

        {/* "Others" free-text input for Symptoms */}
        {otherSymptom && (
          <div className="flex w-full items-center gap-2">
            <input
              type="text"
              value={otherSymptomName}
              onChange={(event) => setOtherSymptomName(event.target.value)}
              disabled={disabled}
              placeholder="Enter new symptom"
              className="h-7 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs leading-4 text-slate-600 outline-none disabled:bg-slate-50"
            />
            <button
              type="button"
              onClick={handleCreateSymptom}
              disabled={disabled || otherSymptomBusy || !otherSymptomName.trim()}
              className="h-7 shrink-0 rounded-md border border-blue-600 bg-white px-3 text-xs font-semibold leading-4 text-blue-600 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {otherSymptomBusy ? "Adding..." : "Add"}
            </button>
            <button
              type="button"
              onClick={() => setOtherSymptom(false)}
              disabled={disabled}
              className="h-7 shrink-0 rounded-md border border-slate-200 bg-white px-2 text-xs leading-4 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Symptom-specific fields (severity / duration / notes) */}
        {symptomSelections.length > 0 && (
          <div className="flex w-full flex-col gap-1.5 pt-1">
            {symptomSelections.map((selection) => (
              <div
                key={selection.symptomId}
                className="flex w-full flex-col gap-1.5 rounded-md border border-slate-100 bg-slate-50/60 p-2"
              >
                <div className="flex w-full items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs font-medium leading-4 text-slate-600">
                    {selection.symptomName}
                  </span>

                  <select
                    value={selection.severity}
                    onChange={(event) =>
                      updateSymptom(
                        selection.symptomId,
                        "severity",
                        event.target.value,
                      )
                    }
                    disabled={disabled}
                    className="h-7 w-24 shrink-0 appearance-none rounded-md border border-slate-200 bg-white px-2 text-xs leading-4 text-slate-600 outline-none disabled:bg-slate-50"
                  >
                    <option value="">Severity</option>
                    {SYMPTOM_SEVERITIES.map((severity) => (
                      <option key={severity} value={severity}>
                        {severity}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex w-full items-center gap-2">
                  <DurationInput
                    value={selection.durationValue}
                    unit={selection.durationUnit}
                    onValueChange={(value) =>
                      updateSymptom(selection.symptomId, "durationValue", value)
                    }
                    onUnitChange={(unit) =>
                      updateSymptom(selection.symptomId, "durationUnit", unit)
                    }
                    disabled={disabled}
                  />

                  <VoiceInput
                    value={selection.clinicalNotes}
                    onChange={(value) =>
                      updateSymptom(selection.symptomId, "clinicalNotes", value)
                    }
                    disabled={disabled}
                    placeholder="Clinical notes"
                    className="min-w-0 flex-1"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ======================================================
          ALLERGIES
          Existing patient allergies shown separately from the
          available allergy master options (longitudinal data).
      ====================================================== */}
      <div className="flex flex-col gap-1">
        <div className="text-[10px] font-bold uppercase leading-[15px] tracking-[0.5px] text-slate-400">
          Allergies
        </div>

        <div className="flex min-h-[38px] w-full flex-wrap items-start gap-1.5 rounded-md border border-slate-200 bg-white p-1.5">
          {allergySelections.map((selection) => (
            <div
              key={selection.allergyId}
              className="flex h-[26px] items-center gap-1 rounded border border-blue-100 bg-blue-50 px-[9px] py-[3px] text-xs leading-4 text-blue-700"
            >
              <span>{selection.substanceName}</span>

              <button
                type="button"
                onClick={() => removeAllergy(selection.allergyId)}
                disabled={disabled}
                className="bg-transparent p-0 text-blue-700 disabled:cursor-not-allowed disabled:text-blue-300"
              >
                ×
              </button>
            </div>
          ))}

          <select
            value=""
            onChange={(event) => {
              if (event.target.value === "__OTHER__") {
                setOtherAllergy(true);
              } else {
                addAllergy(event.target.value);
              }
            }}
            disabled={disabled}
            className="h-[26px] w-full appearance-none rounded border border-slate-200 bg-white px-2 text-xs leading-4 text-slate-500 outline-none sm:w-40 disabled:cursor-not-allowed disabled:bg-slate-50"
          >
            <option value="">
              {availableAllergies.length === 0
                ? "No more allergies"
                : "Add allergy..."}
            </option>
            {availableAllergies.map((option) => (
              <option key={option.id} value={option.id}>
                {option.substance_name}
              </option>
            ))}
            <option value="__OTHER__">Others...</option>
          </select>
        </div>

        {/* "Others" free-text input for Allergies */}
        {otherAllergy && (
          <div className="flex w-full items-center gap-2">
            <input
              type="text"
              value={otherAllergyName}
              onChange={(event) => setOtherAllergyName(event.target.value)}
              disabled={disabled}
              placeholder="Enter new allergy substance"
              className="h-7 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs leading-4 text-slate-600 outline-none disabled:bg-slate-50"
            />
            <button
              type="button"
              onClick={handleCreateAllergy}
              disabled={disabled || otherAllergyBusy || !otherAllergyName.trim()}
              className="h-7 shrink-0 rounded-md border border-blue-600 bg-white px-3 text-xs font-semibold leading-4 text-blue-600 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {otherAllergyBusy ? "Adding..." : "Add"}
            </button>
            <button
              type="button"
              onClick={() => setOtherAllergy(false)}
              disabled={disabled}
              className="h-7 shrink-0 rounded-md border border-slate-200 bg-white px-2 text-xs leading-4 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Allergy-specific fields (severity / duration / reaction / commands) */}
        {allergySelections.length > 0 && (
          <div className="flex w-full flex-col gap-1.5 pt-1">
            {allergySelections.map((selection) => (
              <div
                key={selection.allergyId}
                className="flex w-full flex-col gap-1.5 rounded-md border border-slate-100 bg-slate-50/60 p-2"
              >
                <div className="flex w-full items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs font-medium leading-4 text-slate-600">
                    {selection.substanceName}
                  </span>

                  <select
                    value={selection.severity}
                    onChange={(event) =>
                      updateAllergy(
                        selection.allergyId,
                        "severity",
                        event.target.value,
                      )
                    }
                    disabled={disabled}
                    className="h-7 w-24 shrink-0 appearance-none rounded-md border border-slate-200 bg-white px-2 text-xs leading-4 text-slate-600 outline-none disabled:bg-slate-50"
                  >
                    <option value="">Severity</option>
                    {ALLERGY_SEVERITIES.map((severity) => (
                      <option key={severity} value={severity}>
                        {severity}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex w-full items-center gap-2">
                  <DurationInput
                    value={selection.durationValue}
                    unit={selection.durationUnit}
                    onValueChange={(value) =>
                      updateAllergy(selection.allergyId, "durationValue", value)
                    }
                    onUnitChange={(unit) =>
                      updateAllergy(selection.allergyId, "durationUnit", unit)
                    }
                    disabled={disabled}
                  />

                  <input
                    type="text"
                    value={selection.reaction}
                    onChange={(event) =>
                      updateAllergy(
                        selection.allergyId,
                        "reaction",
                        event.target.value,
                      )
                    }
                    disabled={disabled}
                    placeholder="Reaction"
                    className="h-7 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs leading-4 text-slate-600 outline-none disabled:bg-slate-50"
                  />
                </div>

                <VoiceInput
                  value={selection.commands}
                  onChange={(value) =>
                    updateAllergy(selection.allergyId, "commands", value)
                  }
                  disabled={disabled}
                  placeholder="Command(s)"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ======================================================
          COMORBIDITIES
          Patient-level (longitudinal) comorbidities picked from
          comorbidity_master: type to search, tick several. A search
          with no match offers "+ Add", which opens the panel below.
      ====================================================== */}
      <div className="flex flex-col gap-1">
        <div className="text-[10px] font-bold uppercase leading-[15px] tracking-[0.5px] text-slate-400">
          Comorbidities
        </div>

        <MultiSelectDropdown
          options={comorbidityDropdownOptions}
          value={comorbiditySelections.map((selection) => selection.comorbidityId)}
          onValueChange={handleComorbidityChange}
          onCreateOption={(typed) => {
            setOtherComorbidityName(typed);
            setOtherComorbidity(true);
          }}
          placeholder="Search and select comorbidities..."
          disabled={disabled}
          className="h-[38px] rounded-md border-slate-200 text-xs shadow-none"
        />

        {/* "+ Add" panel: new comorbidity for the master, with a category */}
        {otherComorbidity && (
          <div className="flex w-full flex-col gap-2">
            <div className="flex w-full items-center gap-2">
              <input
                type="text"
                value={otherComorbidityName}
                onChange={(event) => setOtherComorbidityName(event.target.value)}
                disabled={disabled}
                placeholder="Enter new comorbidity"
                className="h-7 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs leading-4 text-slate-600 outline-none disabled:bg-slate-50"
              />
              <select
                value={otherComorbidityCategory}
                onChange={(event) =>
                  setOtherComorbidityCategory(event.target.value)
                }
                disabled={disabled}
                className="h-7 w-40 shrink-0 appearance-none rounded-md border border-slate-200 bg-white px-2 text-xs leading-4 text-slate-600 outline-none disabled:bg-slate-50"
              >
                <option value="">Select category</option>
                {comorbidityCategories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex w-full items-center gap-2">
              <button
                type="button"
                onClick={handleCreateComorbidity}
                disabled={
                  disabled ||
                  otherComorbidityBusy ||
                  !otherComorbidityName.trim()
                }
                className="h-7 shrink-0 rounded-md border border-blue-600 bg-white px-3 text-xs font-semibold leading-4 text-blue-600 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {otherComorbidityBusy ? "Adding..." : "Add"}
              </button>
              <button
                type="button"
                onClick={() => setOtherComorbidity(false)}
                disabled={disabled}
                className="h-7 shrink-0 rounded-md border border-slate-200 bg-white px-2 text-xs leading-4 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Comorbidity-specific fields (duration / onset date / commands) */}
        {comorbiditySelections.length > 0 && (
          <div className="flex w-full flex-col gap-1.5 pt-1">
            {comorbiditySelections.map((selection) => (
              <div
                key={selection.comorbidityId}
                className="flex w-full flex-col gap-1.5 rounded-md border border-slate-100 bg-slate-50/60 p-2"
              >
                <span className="min-w-0 truncate text-xs font-medium leading-4 text-slate-600">
                  {selection.comorbidityName}
                </span>

                <div className="flex w-full items-center gap-2">
                  <DurationInput
                    value={selection.durationValue}
                    unit={selection.durationUnit}
                    onValueChange={(value) =>
                      updateComorbidity(
                        selection.comorbidityId,
                        "durationValue",
                        value,
                      )
                    }
                    onUnitChange={(unit) =>
                      updateComorbidity(
                        selection.comorbidityId,
                        "durationUnit",
                        unit,
                      )
                    }
                    disabled={disabled}
                  />

                  <label className="flex min-w-0 flex-1 items-center gap-2 text-[10px] uppercase leading-4 tracking-[0.5px] text-slate-500">
                    <span className="shrink-0">Onset</span>
                    <input
                      type="date"
                      value={selection.onsetDate}
                      onChange={(event) =>
                        updateComorbidity(
                          selection.comorbidityId,
                          "onsetDate",
                          event.target.value,
                        )
                      }
                      disabled={disabled}
                      className="h-7 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs leading-4 text-slate-600 outline-none disabled:bg-slate-50"
                    />
                  </label>
                </div>

                <VoiceInput
                  value={selection.commands}
                  onChange={(value) =>
                    updateComorbidity(
                      selection.comorbidityId,
                      "commands",
                      value,
                    )
                  }
                  disabled={disabled}
                  placeholder="Command(s)"
                />
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
});