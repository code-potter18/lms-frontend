import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import API from "../../../api/axios";
import { isChemoPlanClosed } from "../../../api/chemotherapy.api";
import { getUser } from "../../../utils/token";
import { BellNotificationButton } from "@/components/hms/BellNotificationButton";
import { MultiSelectDropdown } from "../../../components/ui/multi-select-dropdown";
import { UserProfileDropdown } from "../../../components/ui/User_profile_dropdown";
import VoiceToText from "@/components/ui/voicetotext";
import { Calendar } from "../../../components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../components/ui/popover";
import type { ConsultationState, FormData } from "./types";
import {
  findActiveEncounter,
  findLatestStagingDetailId,
  findStagingDetailForEncounter,
  formatPickedDate,
  parsePickedDate,
  resolveDiagnosisId,
  toIsoDate,
} from "./helpers";
import {
  BackIcon,
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  DoubleArrowIcon,
} from "./icons";

/* ============================================================
   DIAGNOSIS COMPONENT
   (combined from client/pages/doctor/diagonisis.tsx ”
    renamed App ’ Diagnosis, duplicate React import removed,
    CheckIcon / BackIcon / NotificationIcon reused from above)
============================================================ */

/* Normalize an API date (ISO "YYYY-MM-DD..." or DD-MM-YYYY) to the
   YYYY-MM-DD value expected by <input type="date">. */
const toDateInputValue = (value: string): string => {
  const trimmed = value.trim();
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${String(dmy[2]).padStart(2, "0")}-${String(
      dmy[1]
    ).padStart(2, "0")}`;
  }
  return "";
};

/* True when a diagnosis draft carries any entered content beyond the
   pristine defaults; used so server hydration only seeds a fresh/bare
   browser session and never overrides a real local draft. */
const hasDraftContent = (raw: string): boolean => {
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const scalarKeys = [
      "diagnosisDate",
      "progressionDate",
      "relapseDate",
      "secondPrimaryDate",
      "preDiagnosis",
      "diseaseStatus",
      "survivor",
      "type",
      "histomorphology",
      "icdCode",
      "notes",
    ];
    if (scalarKeys.some((key) => Boolean(data[key]))) return true;
    const arrayKeys = [
      "laterality",
      "bodySite",
      "grade",
      "score",
      "subType",
      "cancerStage",
      "tStage",
      "nStage",
      "mStage",
    ];
    if (
      arrayKeys.some((key) => {
        const value = data[key];
        return Array.isArray(value)
          ? value.length > 0
          : typeof value === "string" && value.length > 0;
      })
    ) {
      return true;
    }
    const edits = data.valueEdits;
    return Boolean(
      edits && typeof edits === "object" && Object.keys(edits).length > 0
    );
  } catch {
    return true;
  }
};

/* Laterality values the staging tables accept. Offered only under the
   selected cancer types it applies to (cancer type laterality_applicable:
   paired organs - Breast, Kidney, Lung, Ovarian, Prostate). */
const LATERALITY_OPTIONS = ["Left", "Right", "Bilateral"];

/* Fallback Body Site list for cancer types with no anatomical_site_master
   rows. */
const BODY_SITE_OPTIONS = [
  "Breast",
  "Lung",
  "Colon",
  "Rectum",
  "Stomach",
  "Liver",
  "Pancreas",
  "Kidney",
  "Bladder",
  "Prostate",
  "Ovary",
  "Cervix",
  "Uterus",
  "Skin",
  "Brain",
  "Head and Neck",
  "Bone",
  "Lymph Node",
  "Other",
];

type CancerTypeItem = {
  cancer_type_id: string;
  cancer_type: string;
  icd10: string | null;
  staging_system: string | null;
  laterality_applicable?: boolean;
};

type CancerSubtypeItem = {
  subtype_id: string;
  subtype_name: string;
  icd10_subtype: string | null;
};

type CancerSubtypeOption = CancerSubtypeItem & {
  cancerType: string;
};

type StageOption = {
  value: string;
  cancerType: string;
};

/* Multi-select checkbox helpers for the Histopathology (subtype) and
   Cancer Stage fields. Options are grouped under their parent cancer type;
   each stored value is qualified as `${cancerType}|${label}` so the same
   label can be selected independently for every cancer type. */
const splitQualified = (value: string) => {
  const pipe = value.indexOf("|");
  return pipe === -1
    ? { cancerType: "", raw: value }
    : { cancerType: value.slice(0, pipe), raw: value.slice(pipe + 1) };
};

/* AJCC order for T / N / M values: Tx, T0, Tis, T1, T1a ... T4d. */
const TNM_SUFFIX_ORDER = ["", "mi", "a", "b", "c", "d"];
const tnmSortKey = (value: string): [number, number] => {
  const match = value.match(/^[TNM](x|is|\d)(.*)$/i);
  if (!match) return [99, 0];
  const head = match[1].toLowerCase();
  const number = head === "x" ? -1 : head === "is" ? 0.5 : Number(head);
  return [number, TNM_SUFFIX_ORDER.indexOf(match[2].toLowerCase())];
};
const compareTnm = (a: string, b: string) => {
  const [an, as] = tnmSortKey(a);
  const [bn, bs] = tnmSortKey(b);
  return an - bn || as - bs;
};

const buildCheckboxGroups = (
  items: { value: string; cancerType: string }[]
): { cancerType: string; items: { value: string; label: string }[] }[] => {
  const map = new Map<string, { value: string; label: string }[]>();
  items.forEach((item) => {
    const group = map.get(item.cancerType) ?? [];
    group.push({ value: `${item.cancerType}|${item.value}`, label: item.value });
    map.set(item.cancerType, group);
  });
  return Array.from(map.entries()).map(([cancerType, list]) => ({
    cancerType,
    items: list,
  }));
};

/* Saves a value a doctor typed into a Diagnosis dropdown (to its master
   table, under a cancer type - "" for a field without one). A field whose
   values carry a system (Grade, Score) passes `system`. */
type DiagnosisAddHandler = (
  cancerType: string,
  text: string,
  system?: string
) => Promise<void>;

/* The "+ Add" flow of a dropdown: saves at once, or - when the field's
   values carry a system - first asks for it (prefilled per cancer type). */
const useDiagnosisAdd = (
  onAdd: DiagnosisAddHandler | undefined,
  systemDefault: ((cancerType: string) => string) | undefined,
  onDone: () => void
) => {
  const [pending, setPending] = React.useState<string | null>(null);
  const [system, setSystem] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  const save = async (cancerType: string, text: string, systemValue?: string) => {
    if (!onAdd || !text.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      await onAdd(cancerType, text.trim(), systemValue?.trim());
      setPending(null);
      onDone();
    } catch (error: any) {
      console.error("Failed to add the value:", error);
      setError(
        error?.response?.data?.message || error?.message || "Failed to add the value."
      );
    } finally {
      setSaving(false);
    }
  };

  const start = (cancerType: string, text: string) => {
    if (systemDefault) {
      setPending(cancerType);
      setSystem(systemDefault(cancerType));
      setError("");
      return;
    }
    void save(cancerType, text);
  };

  const reset = () => {
    setPending(null);
    setError("");
  };

  return { pending, system, setSystem, saving, error, save, start, reset };
};

type DiagnosisAddState = ReturnType<typeof useDiagnosisAdd>;

/* "+ Add" rows under a dropdown's search box: one per cancer type the typed
   text isn't an option of yet (a single row for a field without one). */
const DiagnosisAddRows: React.FC<{
  add: DiagnosisAddState;
  text: string;
  targets: string[];
  systemLabel?: string;
}> = ({ add, text, targets, systemLabel = "System" }) => {
  if (!text || (targets.length === 0 && !add.error)) return null;

  return (
    <div className="mb-3 space-y-1.5 border-b border-gray-100 pb-3">
      {targets.map((cancerType) =>
        add.pending === cancerType ? (
          <div
            key={cancerType || "_"}
            className="rounded-md bg-blue-50 p-2 text-xs text-blue-800"
          >
            <div className="mb-1.5 font-medium">
              Add “{text}”{cancerType ? ` to ${cancerType}` : ""}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5">
                {systemLabel}
                <input
                  type="text"
                  value={add.system}
                  autoFocus
                  onChange={(event) => add.setSystem(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void add.save(cancerType, text, add.system);
                    } else if (event.key === "Escape") {
                      add.reset();
                    }
                  }}
                  className="w-40 rounded border border-blue-200 bg-white px-2 py-1 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </label>
              <button
                type="button"
                disabled={add.saving || !add.system.trim()}
                onClick={() => void add.save(cancerType, text, add.system)}
                className="rounded bg-[#1d4ed8] px-2.5 py-1 font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
              >
                {add.saving ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                disabled={add.saving}
                onClick={add.reset}
                className="rounded px-2 py-1 font-medium text-blue-700 hover:bg-blue-100"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            key={cancerType || "_"}
            type="button"
            disabled={add.saving}
            onClick={() => add.start(cancerType, text)}
            className="w-full rounded-md bg-blue-50 px-2 py-1.5 text-left text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-60"
          >
            {add.saving && !add.pending ? "Adding..." : `+ Add “${text}”`}
            {cancerType ? ` to ${cancerType}` : ""}
          </button>
        )
      )}

      {add.error && <p className="text-xs text-red-600">{add.error}</p>}
    </div>
  );
};

/* Search box at the top of an open Diagnosis dropdown. Enter adds the text
   when there is exactly one place to add it. */
const DiagnosisSearchInput: React.FC<{
  value: string;
  onChange: (value: string) => void;
  onEnter: () => void;
  onEscape: () => void;
  placeholder: string;
}> = ({ value, onChange, onEnter, onEscape, placeholder }) => (
  <input
    type="text"
    value={value}
    autoFocus
    onChange={(event) => onChange(event.target.value)}
    onKeyDown={(event) => {
      /* Keep Enter from submitting the Diagnosis form. */
      if (event.key === "Enter") {
        event.preventDefault();
        onEnter();
      } else if (event.key === "Escape") {
        onEscape();
      }
    }}
    placeholder={placeholder}
    className="mb-3 w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
  />
);

/* A small control inside a chip (✎ / ×). A span, not a button: the chips
   sit inside the dropdown trigger. Never opens / closes the dropdown. */
const ChipControl: React.FC<{
  label: string;
  onActivate: () => void;
  children: React.ReactNode;
}> = ({ label, onActivate, children }) => (
  <span
    role="button"
    tabIndex={0}
    aria-label={label}
    title={label}
    onClick={(e) => {
      e.stopPropagation();
      onActivate();
    }}
    onKeyDown={(e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        onActivate();
      }
    }}
    className="inline-flex cursor-pointer items-center justify-center leading-none hover:text-blue-900"
  >
    {children}
  </span>
);

/* A selected value's chip: × removes it. With `onEdit`, ✎ lets the doctor
   reword it for this patient only - Enter or leaving the box keeps the
   text, Escape cancels, an empty box goes back to the master value. An
   edited chip is marked and shows the master value on hover. */
const DiagnosisChip: React.FC<{
  label: string;
  original: string;
  onRemove: () => void;
  onEdit?: (text: string) => void;
}> = ({ label, original, onRemove, onEdit }) => {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(label);
  /* Set once Enter / Escape has finished the edit, so the blur that
     follows doesn't save a second time. */
  const finishedRef = React.useRef(false);
  const edited = label !== original;

  const finish = (save: boolean) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (save) onEdit?.(draft);
    setEditing(false);
  };

  if (editing) {
    return (
      <span
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        className="inline-flex items-center rounded-full bg-white px-1.5 py-0.5 ring-1 ring-blue-400"
      >
        <input
          type="text"
          value={draft}
          autoFocus
          maxLength={100}
          aria-label={`Edit ${original}`}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              e.preventDefault();
              finish(true);
            } else if (e.key === "Escape") {
              e.preventDefault();
              finish(false);
            }
          }}
          onBlur={() => finish(true)}
          className="w-44 border-0 bg-transparent p-0 text-xs text-gray-900 focus:outline-none focus:ring-0"
        />
      </span>
    );
  }

  return (
    <span
      title={edited ? `Edited for this patient - master value: ${original}` : undefined}
      className={
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium " +
        (edited ? "bg-amber-50 italic text-amber-800" : "bg-blue-50 text-blue-700")
      }
    >
      {edited && (
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      )}
      {label}
      {onEdit && (
        <ChipControl
          label={`Edit ${label}`}
          onActivate={() => {
            finishedRef.current = false;
            setDraft(label);
            setEditing(true);
          }}
        >
          ✎
        </ChipControl>
      )}
      <ChipControl label={`Remove ${label}`} onActivate={onRemove}>
        ×
      </ChipControl>
    </span>
  );
};

/* Checkbox multi-select shown as a dropdown (same interaction as the
   Cancer Type field): the selected-chips strip acts as the trigger and
   the grouped checkbox list appears only on hover or click. With `onAdd`,
   a search box filters the list and offers to add a missing value under
   each of `addTypes` (the selected cancer types). */
const DiagnosisCheckboxList: React.FC<{
  title: string;
  groups: { cancerType: string; items: { value: string; label: string }[] }[];
  selected: string[];
  onToggle: (value: string, select?: boolean) => void;
  loading?: boolean;
  addTypes?: string[];
  onAdd?: DiagnosisAddHandler;
  /* Set for a field whose values carry a system (Grade): the system the
     Add row is prefilled with for a cancer type. */
  systemDefault?: (cancerType: string) => string;
  /* For the editable fields: a selected value's text for this patient,
     and saving a reworded one. */
  labelOf?: (value: string) => string;
  onEditValue?: (value: string, text: string) => void;
}> = ({
  title,
  groups,
  selected,
  onToggle,
  loading,
  addTypes = [],
  onAdd,
  systemDefault,
  labelOf,
  onEditValue,
}) => {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const containerRef = React.useRef<HTMLDivElement>(null);
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);
  const add = useDiagnosisAdd(onAdd, systemDefault, () => setQuery(""));

  const text = query.trim();
  const needle = text.toLowerCase();
  const visibleGroups = needle
    ? groups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) =>
            item.label.toLowerCase().includes(needle)
          ),
        }))
        .filter((group) => group.items.length > 0)
    : groups;
  /* The selected cancer types the typed text isn't an option of yet. */
  const addTargets =
    onAdd && text
      ? addTypes.filter(
          (cancerType) =>
            !groups
              .find((group) => group.cancerType === cancerType)
              ?.items.some((item) => item.label.toLowerCase() === needle)
        )
      : [];

  /* Close on outside click, like the Cancer Type dropdown. */
  React.useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  /* A closed dropdown starts over with an empty search. */
  React.useEffect(() => {
    if (open) return;
    setQuery("");
    add.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-gray-600">
        {title}
      </label>

      <div className="relative" ref={containerRef}>
        {/* Trigger: selected chips strip. */}
        {/* A div, not a button: a chip being reworded holds an input. */}
        <div
          role="button"
          tabIndex={0}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setOpen((current) => !current);
            }
          }}
          className="flex min-h-[46px] w-full cursor-pointer flex-wrap items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-left"
        >
          {selected.length === 0 ? (
            <span className="text-gray-400">
              Select one or more options below
            </span>
          ) : (
            selected.map((value) => {
              const original = splitQualified(value).raw || value;
              return (
                <DiagnosisChip
                  key={value}
                  label={labelOf ? labelOf(value) : original}
                  original={original}
                  onRemove={() => onToggle(value)}
                  onEdit={
                    onEditValue ? (text) => onEditValue(value, text) : undefined
                  }
                />
              );
            })
          )}
          <span
            className={
              "ml-auto h-4 w-4 flex-shrink-0 text-gray-400 transition-transform duration-200 " +
              (open ? "rotate-180" : "")
            }
          >
            <ChevronDownIcon />
          </span>
        </div>

        {/* Dropdown body: only rendered on hover or click. */}
        {open && (
          <div className="absolute left-0 right-0 top-full z-20 mt-2 block w-full max-h-72 overflow-y-auto rounded-md border border-gray-300 bg-white p-3 text-sm text-gray-800 shadow-lg slim-scrollbar">
            {onAdd && (
              <DiagnosisSearchInput
                value={query}
                onChange={(value) => {
                  setQuery(value);
                  add.reset();
                }}
                onEnter={() => {
                  if (addTargets.length === 1) add.start(addTargets[0], text);
                }}
                onEscape={() => setOpen(false)}
                placeholder={`Search or add ${title.toLowerCase()}`}
              />
            )}

            <DiagnosisAddRows add={add} text={text} targets={addTargets} />

            {total === 0 && !text && (
              <p className="text-sm text-gray-400">
                {loading
                  ? "Loading..."
                  : `No ${title.toLowerCase()} options for the selected cancer type(s)`}
              </p>
            )}

            {text && visibleGroups.length === 0 && addTargets.length === 0 && (
              <p className="text-sm text-gray-400">No matching options</p>
            )}

            {visibleGroups.map((group) => (
              <div key={group.cancerType} className="mb-3 last:mb-0">
                <div className="mb-1.5 border-b border-gray-100 pb-1 text-[11px] font-bold uppercase tracking-wide text-[#1d4ed8]">
                  {group.cancerType}
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  {group.items.map((item) => {
                    /* Ticked only for this exact group's own qualified value so
                       each option stays independent per cancer type. */
                    const hasQualified = selected.some(
                      (value) =>
                        value.includes("|") &&
                        splitQualified(value).raw === item.label
                    );
                    const isChecked =
                      selected.includes(item.value) ||
                      (!hasQualified &&
                        selected.some(
                          (value) =>
                            !value.includes("|") && value === item.label
                        ));
                    return (
                      <label
                        key={item.value}
                        className="flex cursor-pointer items-center gap-1.5 text-sm text-gray-700"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(event) =>
                            onToggle(item.value, event.target.checked)
                          }
                          className="h-4 w-4 rounded border-gray-300 text-[#1d4ed8] accent-[#1d4ed8] focus:ring-[#1d4ed8]"
                        />
                        <span className="leading-snug">{item.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/* Single-select checkbox dropdown for the Diagnosis fields that used a plain
   <select>. Styled identically to DiagnosisCheckboxList / MultiSelectDropdown:
   a chips trigger opens a checkbox list; checking an option sets it as the
   chosen value (unchecking clears it), and the selected chip is removable. */
const DiagnosisCheckboxSelect: React.FC<{
  title: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  loading?: boolean;
  /* With it, a search box filters the list and offers to add a value it
     doesn't have. */
  onAdd?: (text: string) => Promise<void>;
  /* For an editable field: the chosen value's text for this patient, and
     saving a reworded one. */
  displayValue?: string;
  onEditValue?: (text: string) => void;
}> = ({
  title,
  options,
  value,
  onChange,
  placeholder = "Select one option below",
  loading,
  onAdd,
  displayValue,
  onEditValue,
}) => {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const containerRef = React.useRef<HTMLDivElement>(null);
  const add = useDiagnosisAdd(
    onAdd ? (_cancerType, text) => onAdd(text) : undefined,
    undefined,
    () => setQuery("")
  );

  const text = query.trim();
  const needle = text.toLowerCase();
  const visibleOptions = needle
    ? options.filter((option) => option.toLowerCase().includes(needle))
    : options;
  const canAdd =
    Boolean(onAdd) &&
    Boolean(text) &&
    !options.some((option) => option.toLowerCase() === needle);

  React.useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  /* A closed dropdown starts over with an empty search. */
  React.useEffect(() => {
    if (open) return;
    setQuery("");
    add.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleToggle = (option: string) => {
    onChange(option === value ? "" : option);
  };

  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-gray-600">
        {title}
      </label>

      <div className="relative" ref={containerRef}>
        {/* Trigger: selected chips strip. */}
        {/* A div, not a button: a chip being reworded holds an input. */}
        <div
          role="button"
          tabIndex={0}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setOpen((current) => !current);
            }
          }}
          className="flex min-h-[46px] w-full cursor-pointer flex-wrap items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-left"
        >
          {!value ? (
            <span className="text-gray-400">
              {loading && options.length === 0 ? "Loading..." : placeholder}
            </span>
          ) : (
            <DiagnosisChip
              label={displayValue || value}
              original={value}
              onRemove={() => onChange("")}
              onEdit={onEditValue}
            />
          )}
          <span
            className={
              "ml-auto h-4 w-4 flex-shrink-0 text-gray-400 transition-transform duration-200 " +
              (open ? "rotate-180" : "")
            }
          >
            <ChevronDownIcon />
          </span>
        </div>

        {/* Dropdown body: rendered on click. */}
        {open && (
          <div className="absolute left-0 right-0 top-full z-20 mt-2 block w-full max-h-72 overflow-y-auto rounded-md border border-gray-300 bg-white p-3 text-sm text-gray-800 shadow-lg slim-scrollbar">
            {onAdd && (
              <DiagnosisSearchInput
                value={query}
                onChange={(next) => {
                  setQuery(next);
                  add.reset();
                }}
                onEnter={() => {
                  if (canAdd) add.start("", text);
                }}
                onEscape={() => setOpen(false)}
                placeholder={`Search or add ${title.toLowerCase()}`}
              />
            )}

            <DiagnosisAddRows add={add} text={text} targets={canAdd ? [""] : []} />

            {options.length === 0 && !text && (
              <p className="text-sm text-gray-400">
                {loading
                  ? "Loading..."
                  : `No ${title.toLowerCase()} options available`}
              </p>
            )}

            {text && visibleOptions.length === 0 && !canAdd && (
              <p className="text-sm text-gray-400">No matching options</p>
            )}

            {visibleOptions.map((option) => (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-1.5 py-1 text-sm text-gray-700"
              >
                <input
                  type="checkbox"
                  checked={value === option}
                  onChange={() => handleToggle(option)}
                  className="h-4 w-4 rounded border-gray-300 text-[#1d4ed8] accent-[#1d4ed8] focus:ring-[#1d4ed8]"
                />
                <span className="leading-snug">{option}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/* Text date field (DD-MM-YYYY) with a clickable calendar icon that opens a
   date picker, same pattern as the Treatment Plan "Planned Start Date".
   Future dates are disabled - these are clinical event dates. */
const DiagnosisDateField: React.FC<{
  id: string;
  title: string;
  value: string;
  onChange: (value: string) => void;
}> = ({ id, title, value, onChange }) => {
  const [open, setOpen] = React.useState(false);
  const picked = parsePickedDate(value);

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-sm font-semibold text-gray-600"
      >
        {title}
      </label>

      <Popover open={open} onOpenChange={setOpen}>
        <div className="relative">
          <input
            id={id}
            type="text"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="DD-MM-YYYY"
            className="block w-full rounded-md border border-gray-300 bg-white py-3 pl-4 pr-12 text-sm text-gray-800 shadow-sm focus:border-[#1d4ed8] focus:outline-none focus:ring-[#1d4ed8]"
          />

          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`Select ${title}`}
              className="absolute inset-y-0 right-0 flex items-center pr-4 text-gray-400 transition-colors hover:text-[#1d4ed8] focus:outline-none"
            >
              <CalendarIcon />
            </button>
          </PopoverTrigger>
        </div>

        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            selected={picked}
            defaultMonth={picked}
            disabled={(date) => date > new Date()}
            onSelect={(date) => {
              if (date instanceof Date) {
                onChange(formatPickedDate(date));
                setOpen(false);
              }
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
};

type ScoreOption = {
  cancerType: string;
  system: string;
  value: string;
};

/* Score field: a text input with a dropdown of the cancer_score values for
   the selected cancer type(s), grouped by cancer type then score system.
   Typing filters the list; Enter picks an exact match, or adds the typed
   text as a new score (e.g. an exact Ki-67 %) to the cancer type's scores,
   under the score system the doctor confirms. Selected scores show as
   removable chips. */
const DiagnosisScoreList: React.FC<{
  title: string;
  options: ScoreOption[];
  selected: string[];
  onToggle: (value: string, select?: boolean) => void;
  addTypes: string[];
  onAdd: DiagnosisAddHandler;
  systemDefault: (cancerType: string) => string;
  loading?: boolean;
  labelOf?: (value: string) => string;
  onEditValue?: (value: string, text: string) => void;
}> = ({
  title,
  options,
  selected,
  onToggle,
  addTypes,
  onAdd,
  systemDefault,
  loading,
  labelOf,
  onEditValue,
}) => {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const containerRef = React.useRef<HTMLDivElement>(null);
  const add = useDiagnosisAdd(onAdd, systemDefault, () => setQuery(""));

  /* A closed list starts over with no pending add. */
  React.useEffect(() => {
    if (!open) add.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? options.filter(
        (option) =>
          option.value.toLowerCase().includes(needle) ||
          option.system.toLowerCase().includes(needle)
      )
    : options;

  /* cancerType -> score system -> options, in load order. */
  const groups = new Map<string, Map<string, ScoreOption[]>>();
  filtered.forEach((option) => {
    const systems = groups.get(option.cancerType) ?? new Map();
    const list = systems.get(option.system) ?? [];
    list.push(option);
    systems.set(option.system, list);
    groups.set(option.cancerType, systems);
  });

  const text = query.trim();
  /* The selected cancer types the typed text isn't a score of yet. */
  const addTargets = text
    ? addTypes.filter(
        (cancerType) =>
          !options.some(
            (option) =>
              option.cancerType === cancerType &&
              option.value.toLowerCase() === text.toLowerCase()
          )
      )
    : [];

  const commitQuery = () => {
    if (!text) return;
    const exact = options.find(
      (option) => option.value.toLowerCase() === text.toLowerCase()
    );
    if (exact) {
      onToggle(`${exact.cancerType}|${exact.value}`, true);
      setQuery("");
    } else if (addTargets.length === 1) {
      add.start(addTargets[0], text);
    }
  };

  return (
    <div>
      <label
        htmlFor="scoreInput"
        className="mb-2 block text-sm font-semibold text-gray-600"
      >
        {title}
      </label>

      <div className="relative" ref={containerRef}>
        {/* Trigger: selected chips + free-text input. */}
        <div
          onClick={() => setOpen(true)}
          className="flex min-h-[46px] w-full cursor-text flex-wrap items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 shadow-sm focus-within:border-transparent focus-within:ring-2 focus-within:ring-blue-500"
        >
          {selected.map((value) => {
            const original = splitQualified(value).raw || value;
            return (
              <DiagnosisChip
                key={value}
                label={labelOf ? labelOf(value) : original}
                original={original}
                onRemove={() => onToggle(value)}
                onEdit={onEditValue ? (text) => onEditValue(value, text) : undefined}
              />
            );
          })}

          <input
            id="scoreInput"
            type="text"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
              add.reset();
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              /* Keep Enter from submitting the Diagnosis form. */
              if (event.key === "Enter") {
                event.preventDefault();
                commitQuery();
              } else if (event.key === "Escape") {
                setOpen(false);
              }
            }}
            placeholder={selected.length === 0 ? "Type or select score" : ""}
            className="min-w-[8rem] flex-1 border-0 bg-transparent p-0 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0"
          />

          <button
            type="button"
            aria-label={open ? "Close score list" : "Open score list"}
            onClick={(e) => {
              e.stopPropagation();
              setOpen((current) => !current);
            }}
            className={
              "ml-auto h-4 w-4 flex-shrink-0 text-gray-400 transition-transform duration-200 " +
              (open ? "rotate-180" : "")
            }
          >
            <ChevronDownIcon />
          </button>
        </div>

        {open && (
          <div className="absolute left-0 right-0 top-full z-20 mt-2 block w-full max-h-72 overflow-y-auto rounded-md border border-gray-300 bg-white p-3 text-sm text-gray-800 shadow-lg slim-scrollbar">
            <DiagnosisAddRows
              add={add}
              text={text}
              targets={addTargets}
              systemLabel="Score system"
            />

            {filtered.length === 0 && addTargets.length === 0 && (
              <p className="text-sm text-gray-400">
                {loading
                  ? "Loading..."
                  : options.length === 0
                    ? "No score options for the selected cancer type(s) / histopathology"
                    : "No matching scores"}
              </p>
            )}

            {Array.from(groups.entries()).map(([cancerType, systems]) => (
              <div key={cancerType} className="mb-3 last:mb-0">
                <div className="mb-1.5 border-b border-gray-100 pb-1 text-[11px] font-bold uppercase tracking-wide text-[#1d4ed8]">
                  {cancerType}
                </div>

                {Array.from(systems.entries()).map(([system, list]) => (
                  <div key={system} className="mb-2 last:mb-0">
                    <div className="mb-1 text-xs font-semibold text-gray-500">
                      {system}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                      {list.map((option) => {
                        const qualified = `${option.cancerType}|${option.value}`;
                        return (
                          <label
                            key={qualified}
                            className="flex cursor-pointer items-center gap-1.5 text-sm text-gray-700"
                          >
                            <input
                              type="checkbox"
                              checked={selected.includes(qualified)}
                              onChange={(event) =>
                                onToggle(qualified, event.target.checked)
                              }
                              className="h-4 w-4 rounded border-gray-300 text-[#1d4ed8] accent-[#1d4ed8] focus:ring-[#1d4ed8]"
                            />
                            <span className="leading-snug">{option.value}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/* True when a subtype-specific score applies: any "|"-separated keyword
   appears as a whole word (case-insensitive) in a selected subtype. */
const matchesSubtypeKeywords = (
  keywords: string | null,
  subtypeLabels: string[]
): boolean => {
  if (!keywords) return true;
  return keywords
    .split("|")
    .map((keyword) => keyword.trim())
    .filter(Boolean)
    .some((keyword) => {
      const pattern = new RegExp(
        `(^|[^A-Za-z0-9])${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^A-Za-z0-9])`,
        "i"
      );
      return subtypeLabels.some((label) => pattern.test(label));
    });
};

/* The fields whose picked values the doctor may reword for this patient
   (formData.valueEdits; the masters keep their wording). */
type EditableField =
  | "diseaseStatus"
  | "bodySite"
  | "subType"
  | "cancerStage"
  | "grade"
  | "score"
  | "tStage"
  | "nStage"
  | "mStage";
const EDITABLE_ARRAY_FIELDS = [
  "bodySite",
  "subType",
  "cancerStage",
  "grade",
  "score",
  "tStage",
  "nStage",
  "mStage",
] as const;
const editKey = (field: EditableField, value: string) => `${field}|${value}`;

/* YYYY-MM-DD / DD-MM-YYYY API date -> DD-MM-YYYY for the date fields. */
const toPickedDateValue = (value?: string | null): string => {
  const iso = toDateInputValue(value ?? "");
  if (!iso) return "";
  const [year, month, day] = iso.split("-");
  return `${day}-${month}-${year}`;
};

const EMPTY_FORM_DATA: FormData = {
  diagnosisDate: "",
  progressionDate: "",
  relapseDate: "",
  secondPrimaryDate: "",
  preDiagnosis: "",
  diseaseStatus: "",
  laterality: [],
  bodySite: [],
  survivor: "",
  type: "",
  cancerTypes: [],
  subType: [],
  histomorphology: "",
  cancerStage: [],
  grade: [],
  score: [],
  tStage: [],
  nStage: [],
  mStage: [],
  icdCode: "",
  notes: "",
  investigationReportDate: "",
  investigationResults: {},
  valueEdits: {},
};

const asStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string" && value.length > 0) return [value];
  return [];
};

/* A stored form (local draft or a staging detail's form_state) made safe
   to load: subType / cancerStage / laterality / bodySite / grade used to be
   single strings and are multi-select arrays now, and only text value
   edits are kept. */
const normalizeStoredForm = (data: Partial<FormData>): Partial<FormData> => ({
  ...data,
  cancerTypes: asStringArray(data.cancerTypes),
  subType: asStringArray(data.subType),
  cancerStage: asStringArray(data.cancerStage),
  laterality: asStringArray(data.laterality),
  bodySite: asStringArray(data.bodySite),
  grade: asStringArray(data.grade),
  score: asStringArray(data.score),
  tStage: asStringArray(data.tStage),
  nStage: asStringArray(data.nStage),
  mStage: asStringArray(data.mStage),
  valueEdits:
    data.valueEdits &&
    typeof data.valueEdits === "object" &&
    !Array.isArray(data.valueEdits)
      ? Object.fromEntries(
          Object.entries(data.valueEdits).filter(
            (entry): entry is [string, string] =>
              typeof entry[1] === "string" && entry[1].trim() !== ""
          )
        )
      : {},
});

/* ---- A staging detail's form_state ----
   The exact Diagnosis selections behind a staging detail, saved with it so
   the form refills exactly from the patient's latest staging detail (its
   text columns join Stage / Body Site / Grade / Score across the cancer
   types, which can't be mapped back). The visit's Investigation Results are
   saved on their own and are not part of it. */
type DiagnosisFormFields = Omit<
  FormData,
  "investigationReportDate" | "investigationResults"
>;

type DiagnosisFormState = {
  version: 1;
  formData: DiagnosisFormFields;
  selectedCancerTypes: string[];
  metastasisSites: string[];
};

/* Only the known form fields, fresh defaults for any missing. */
const pickFormFields = (data: Partial<FormData>): DiagnosisFormFields => {
  const {
    investigationReportDate: _reportDate,
    investigationResults: _results,
    ...defaults
  } = EMPTY_FORM_DATA;
  return Object.fromEntries(
    Object.entries(defaults).map(([key, fallback]) => [
      key,
      data[key as keyof FormData] ??
        (Array.isArray(fallback)
          ? []
          : typeof fallback === "object"
            ? {}
            : fallback),
    ])
  ) as DiagnosisFormFields;
};

const parseFormState = (value: unknown): DiagnosisFormState | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const state = value as Partial<Record<keyof DiagnosisFormState, unknown>>;
  if (
    state.version !== 1 ||
    !state.formData ||
    typeof state.formData !== "object"
  ) {
    return null;
  }
  return {
    version: 1,
    formData: pickFormFields(
      normalizeStoredForm(state.formData as Partial<FormData>)
    ),
    selectedCancerTypes: asStringArray(state.selectedCancerTypes),
    metastasisSites: asStringArray(state.metastasisSites),
  };
};

/* Equal signatures = the doctor changed nothing. Selections compare as
   sets, except the cancer types (the first is the primary). */
const formStateSignature = (state: DiagnosisFormState) => {
  const fields = state.formData as Record<string, unknown>;
  const normalized = Object.keys(fields)
    .sort()
    .map((key) => {
      const value = fields[key];
      if (key === "valueEdits") {
        return [
          key,
          Object.entries((value ?? {}) as Record<string, string>).sort(
            ([a], [b]) => a.localeCompare(b)
          ),
        ];
      }
      if (key === "cancerTypes") return [key, asStringArray(value)];
      if (Array.isArray(value)) return [key, value.map(String).sort()];
      return [key, typeof value === "string" ? value.trim() : value ?? ""];
    });
  return JSON.stringify({
    fields: normalized,
    /* No list yet means just the primary type (the form adds it). */
    selectedCancerTypes:
      state.selectedCancerTypes.length > 0
        ? state.selectedCancerTypes
        : [state.formData.type].filter(Boolean),
    metastasisSites: [...state.metastasisSites].sort(),
  });
};

/* A staging detail as GET /oncology/staging-details/:id returns it (the
   fields the form is filled from). */
type StagingDetailRecord = {
  staging_detail_id: string;
  visit_date?: string | null;
  diagnosis_date?: string | null;
  progression_date?: string | null;
  relapse_date?: string | null;
  second_primary_date?: string | null;
  notes?: string | null;
  pre_diagnosis?: string | null;
  disease_status?: string | null;
  clinical_stage?: string | null;
  site?: string | null;
  grade?: string | null;
  score?: string | null;
  laterality?: string | null;
  t_stage?: string | null;
  n_stage?: string | null;
  m_stage?: string | null;
  histopathology?: string | null;
  icd10_code?: string | null;
  metastasis_sites?: unknown;
  form_state?: unknown;
  cancer_types?: { cancer_type: string } | null;
  cancer_subtypes?: { subtype_name: string } | null;
  oncology_staging_additional_cancers?: {
    display_order?: number | null;
    laterality?: string | null;
    t_stage?: string | null;
    n_stage?: string | null;
    m_stage?: string | null;
    histopathology?: string | null;
    cancer_types?: { cancer_type: string } | null;
    cancer_subtypes?: { subtype_name: string } | null;
  }[] | null;
};

/* A staging detail saved before form_state existed, rebuilt from its
   columns. Each cancer type's histopathology / laterality / T / N / M is
   exact; Stage / Body Site / Grade / Score are joined across the types
   without saying which, so they go under the primary type. */
const formStateFromColumns = (
  detail: StagingDetailRecord
): DiagnosisFormState | null => {
  const primary = detail.cancer_types?.cancer_type ?? "";
  if (!primary) return null;

  const extras = [...(detail.oncology_staging_additional_cancers ?? [])]
    .filter((cancer) => cancer.cancer_types?.cancer_type)
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
  const types = [
    primary,
    ...extras.map((cancer) => cancer.cancer_types?.cancer_type ?? ""),
  ];

  const fields = pickFormFields({});
  const valueEdits: Record<string, string> = {};
  const qualify = (cancerType: string, value: string) => `${cancerType}|${value}`;
  const addCancer = (
    cancerType: string,
    row: {
      subtypeName?: string | null;
      histopathology?: string | null;
      laterality?: string | null;
      t_stage?: string | null;
      n_stage?: string | null;
      m_stage?: string | null;
    }
  ) => {
    if (row.subtypeName) {
      const value = qualify(cancerType, row.subtypeName);
      fields.subType.push(value);
      if (row.histopathology && row.histopathology !== row.subtypeName) {
        valueEdits[editKey("subType", value)] = row.histopathology;
      }
    }
    if (row.laterality) fields.laterality.push(qualify(cancerType, row.laterality));
    if (row.t_stage) fields.tStage.push(qualify(cancerType, row.t_stage));
    if (row.n_stage) fields.nStage.push(qualify(cancerType, row.n_stage));
    if (row.m_stage) fields.mStage.push(qualify(cancerType, row.m_stage));
  };
  addCancer(primary, {
    ...detail,
    subtypeName: detail.cancer_subtypes?.subtype_name,
  });
  extras.forEach((cancer) =>
    addCancer(cancer.cancer_types?.cancer_type ?? "", {
      ...cancer,
      subtypeName: cancer.cancer_subtypes?.subtype_name,
    })
  );

  const underPrimary = (text?: string | null) =>
    (text ?? "")
      .split(",")
      .map((label) => label.trim())
      .filter(Boolean)
      .map((label) => qualify(primary, label));

  return {
    version: 1,
    formData: {
      ...fields,
      diagnosisDate: toPickedDateValue(detail.diagnosis_date),
      progressionDate: toPickedDateValue(detail.progression_date),
      relapseDate: toPickedDateValue(detail.relapse_date),
      secondPrimaryDate: toPickedDateValue(detail.second_primary_date),
      preDiagnosis: detail.pre_diagnosis ?? "",
      diseaseStatus: detail.disease_status ?? "",
      type: primary,
      cancerTypes: types,
      cancerStage: underPrimary(detail.clinical_stage),
      bodySite: underPrimary(detail.site),
      grade: underPrimary(detail.grade),
      score: underPrimary(detail.score),
      icdCode: detail.icd10_code ?? "",
      notes: detail.notes ?? "",
      valueEdits,
    },
    selectedCancerTypes: types,
    metastasisSites: asStringArray(detail.metastasis_sites),
  };
};

type StagingReferenceItem = {
  stage_ref_id: string;
  cancer_type_id: string;
  subtype_label: string | null;
  staging_system: string | null;
  stage_label: string | null;
  tnm_criteria: string | null;
  risk_system: string | null;
  risk_category: string | null;
  risk_criteria: string | null;
  os_5yr_approx: string | null;
  guideline_source: string | null;
  /* Storable T / N / M values named by tnm_criteria (parsed server-side). */
  t_values?: string[];
  n_values?: string[];
  m_values?: string[];
};

/* `created_by` is set only on rows a doctor added from the Diagnosis
   dropdowns; seeded rows have none. */
type AnatomicalSiteItem = {
  site_id: string;
  site_name: string;
  site_category: string | null;
  created_by?: string | null;
};

type CancerGradeItem = {
  grade_id: string;
  grade_value: string;
  grade_system: string;
  description: string | null;
  created_by?: string | null;
};

/* A T / N / M value doctors added for a cancer type (tnm_stage_master). */
type TnmStageItem = {
  tnm_id: string;
  axis: "T" | "N" | "M";
  stage_value: string;
};

type DiseaseStatusItem = {
  disease_status_id: string;
  status_name: string;
};

/* Shown until disease_status_master loads (or if it can't). */
const DEFAULT_DISEASE_STATUSES = [
  "Newly Diagnosed",
  "In Remission",
  "Recurrence",
  "Progressive",
  "Stable",
  "Metastatic",
];

type CancerScoreItem = {
  score_id: string;
  score_system: string;
  score_value: string;
  input_type: string | null;
  subtype_keywords: string | null;
};

/* An Investigation Results test of a cancer type (investigation_parameter):
   a tumour marker / monitoring test with its normal range. */
type InvestigationParameterItem = {
  parameter_id: string;
  cancer_type_id: string;
  chart_name: string;
  subtype_keywords: string | null;
  parameter_code: string;
  parameter_name: string;
  input_type: "NUMBER" | "TEXT" | "DATE" | "SELECT";
  unit: string | null;
  normal_min: string | number | null;
  normal_max: string | number | null;
  range_label: string | null;
  select_options: string | null;
  display_order: number | null;
};

/* A saved Investigation Results value of one visit
   (patient_investigation_result). */
type InvestigationResultRecord = {
  investigation_result_id: string;
  encounter_no: string;
  parameter_id: string;
  report_date: string;
  value_text: string;
  is_abnormal: boolean;
  investigation_parameter?: InvestigationParameterItem | null;
};

/* "High" / "Low" when a number test's value is outside its normal range. */
const investigationFlag = (
  parameter: InvestigationParameterItem,
  value: string
): "High" | "Low" | null => {
  if (parameter.input_type !== "NUMBER" || !value.trim()) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const min = parameter.normal_min != null ? Number(parameter.normal_min) : null;
  const max = parameter.normal_max != null ? Number(parameter.normal_max) : null;
  if (max !== null && number > max) return "High";
  if (min !== null && number < min) return "Low";
  return null;
};

const INVESTIGATION_INPUT_CLASS =
  "block w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 shadow-sm focus:border-[#1d4ed8] focus:outline-none focus:ring-[#1d4ed8]";

/* Master rows tagged with the cancer type they were loaded for, so the
   dropdowns can group them per selected cancer type like T/N/M. */
type ForCancerType<T> = T & { cancerType: string };

const Diagnosis: React.FC<{
  embedded?: boolean;
  patientId?: string;
  /* The consultation's appointment / encounter - the visit this
     diagnosis is recorded in. */
  appointmentId?: string;
  encounterNo?: string;
  onNext?: () => void;
  visitDate?: string;
  onVisitDateChange?: (value: string) => void;
}> = ({
  embedded = false,
  patientId,
  appointmentId,
  encounterNo,
  onNext,
  visitDate = "",
  onVisitDateChange,
}) => {
  const location = useLocation();
  const consultationState = location.state as ConsultationState | null;
  const statePatientId = consultationState?.patientId ?? "";
  const resolvedPatientId = patientId || statePatientId;

  /* The visit (encounter) this diagnosis is recorded in - each visit has
     its own staging detail. */
  const resolveVisitEncounterNo = async () => {
    if (encounterNo) return encounterNo;
    if (!resolvedPatientId) return "";
    const { encounter } = await findActiveEncounter(
      resolvedPatientId,
      appointmentId ?? consultationState?.appointmentId
    );
    return encounter?.encounter_no ?? "";
  };

  const [userAvatarUrl, setUserAvatarUrl] = useState<string>(() => localStorage.getItem("user_photo") || "");
  const [avatarLoading, setAvatarLoading] = useState<boolean>(() => !localStorage.getItem("user_photo"));

  const [formData, setFormData] = useState<FormData>(EMPTY_FORM_DATA);

  const diagnosisDraftKey = `hms_diagnosis_form_${resolvedPatientId}`;

  useEffect(() => {
    if (!resolvedPatientId) return;
    const saved = localStorage.getItem(diagnosisDraftKey);

    if (!saved) return;

    try {
      const data = JSON.parse(saved) as Partial<FormData>;
      setFormData((previous) => ({
        ...previous,
        ...normalizeStoredForm(data),
        investigationReportDate:
          typeof data.investigationReportDate === "string"
            ? data.investigationReportDate
            : "",
        investigationResults:
          data.investigationResults &&
          typeof data.investigationResults === "object" &&
          !Array.isArray(data.investigationResults)
            ? data.investigationResults
            : {},
      }));
      const savedTypes = asStringArray(data.cancerTypes);
      if (savedTypes.length > 0) setSelectedCancerTypes(savedTypes);
    } catch (error) {
      console.error("Failed to restore diagnosis draft:", error);
    }
  }, [diagnosisDraftKey, resolvedPatientId]);

  /* The visit the local draft belongs to (plus its Metastasis Sites, which
     live outside formData): a draft from an earlier visit is replaced by
     the latest staging detail, one from this visit is the doctor's work in
     progress and stays. */
  const visitContextKey = `hms_diagnosis_visit_${resolvedPatientId}`;
  type DiagnosisVisitContext = { encounterNo: string; metastasisSites: string[] };
  const readVisitContext = (): DiagnosisVisitContext | null => {
    try {
      const data = JSON.parse(localStorage.getItem(visitContextKey) ?? "null");
      return data && typeof data === "object"
        ? {
            encounterNo: String(data.encounterNo ?? ""),
            metastasisSites: asStringArray(data.metastasisSites),
          }
        : null;
    } catch {
      return null;
    }
  };
  const visitContextReadyRef = useRef(false);

  /* The staging detail the form was filled from and its selections: Save
     reuses it when nothing changed, else records this visit's own row. */
  const baselineRef = useRef<{
    stagingDetailId: string;
    ownVisit: boolean;
    signature: string;
  } | null>(null);

  /* The cancer type catalog, and the types whose options still have to
     load once it arrives (a prefill that landed before it). */
  const cancerTypesRef = useRef<CancerTypeItem[]>([]);
  const pendingOptionTypesRef = useRef<string[] | null>(null);

  /* Fill the form with a staging detail's selections and load the option
     lists of its cancer types. */
  const applyFormState = (state: DiagnosisFormState) => {
    setFormData((previous) => ({ ...previous, ...state.formData }));
    const typeNames =
      state.selectedCancerTypes.length > 0
        ? state.selectedCancerTypes
        : state.formData.type
          ? [state.formData.type]
          : [];
    setSelectedCancerTypes(typeNames);
    if (cancerTypesRef.current.length > 0) {
      const selections = typeNames
        .map((name) =>
          cancerTypesRef.current.find((item) => item.cancer_type === name)
        )
        .filter((item): item is CancerTypeItem => Boolean(item?.cancer_type_id))
        .map((item) => ({
          cancerTypeId: item.cancer_type_id,
          cancerTypeName: item.cancer_type,
        }));
      if (selections.length > 0) {
        loadSubtypesForCancerTypes(selections);
        loadStagesForCancerTypes(selections, false);
        loadMastersForCancerTypes(selections);
      }
    } else {
      pendingOptionTypesRef.current = typeNames;
    }
    setMetastasisSites(state.metastasisSites);
  };

  /* On arrival the form is filled from this visit's staging detail, else
     the patient's latest one (an exact form_state, else rebuilt from its
     columns). A draft from this same visit is kept instead - the doctor's
     unsaved changes survive switching steps. Either way the staging detail
     becomes the baseline Save compares against. */
  useEffect(() => {
    if (!resolvedPatientId) return;
    /* Read now: the draft-save effect below rewrites it after this render. */
    const rawDraft = localStorage.getItem(diagnosisDraftKey);
    let cancelled = false;
    const hydrate = async () => {
      try {
        const visitEncounterNo = await resolveVisitEncounterNo().catch(() => "");
        const ownStagingId = visitEncounterNo
          ? await findStagingDetailForEncounter(resolvedPatientId, visitEncounterNo)
          : "";
        const sourceStagingId =
          ownStagingId || (await findLatestStagingDetailId(resolvedPatientId));
        const detail = sourceStagingId
          ? (
              await API.get<{ success: boolean; data: StagingDetailRecord | null }>(
                `/oncology/staging-details/${encodeURIComponent(sourceStagingId)}`
              )
            ).data.data
          : null;
        if (cancelled) return;

        const state = detail
          ? parseFormState(detail.form_state) ?? formStateFromColumns(detail)
          : null;
        const context = readVisitContext();
        const keepDraft = visitEncounterNo
          ? context?.encounterNo === visitEncounterNo && rawDraft !== null
          : Boolean(rawDraft && hasDraftContent(rawDraft));

        if (keepDraft) {
          setMetastasisSites(context?.metastasisSites ?? []);
        } else if (state) {
          applyFormState(state);
          /* This visit's own staging detail also restores its visit date. */
          const visitDate = ownStagingId
            ? parsePickedDate(toPickedDateValue(detail?.visit_date))
            : undefined;
          if (visitDate && onVisitDateChange) {
            onVisitDateChange(formatPickedDate(visitDate));
          }
        }
        localStorage.setItem(
          visitContextKey,
          JSON.stringify({
            encounterNo: visitEncounterNo,
            metastasisSites: keepDraft
              ? context?.metastasisSites ?? []
              : state?.metastasisSites ?? [],
          })
        );
        visitContextReadyRef.current = true;

        baselineRef.current =
          detail && state
            ? {
                stagingDetailId: detail.staging_detail_id,
                ownVisit: Boolean(ownStagingId),
                signature: formStateSignature(state),
              }
            : null;
      } catch (error) {
        console.error("Failed to fill the diagnosis from the latest staging detail:", error);
      }
    };
    hydrate();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagnosisDraftKey, resolvedPatientId, onVisitDateChange, encounterNo, appointmentId]);

  useEffect(() => {
    if (!resolvedPatientId) return;
    localStorage.setItem(diagnosisDraftKey, JSON.stringify(formData));
  }, [formData, diagnosisDraftKey, resolvedPatientId]);

  const [cancerTypes, setCancerTypes] = useState<CancerTypeItem[]>([]);
  const [subtypes, setSubtypes] = useState<CancerSubtypeOption[]>([]);
  const [diagnosisCatalogReady, setDiagnosisCatalogReady] = useState(false);

  /* Multi-select Cancer Type field. The full selection is kept for
     documentation and to source the Histopathology subtype options;
     the first entry still drives the dependent fields (staging)
     exactly like the old single select. */
  const [selectedCancerTypes, setSelectedCancerTypes] = useState<string[]>([]);

  /* Toggle a qualified multi-select value on/off for the Histopathology
     (subType) and Cancer Stage (cancerStage) arrays. Each value is stored
     qualified as `${cancerType}|${label}`, so per-type selections stay
     independent. The checkbox's checked state drives add vs. remove so a
     click can never silently invert a selection. */
  const handleMultiToggle = (
    field:
      | "subType"
      | "cancerStage"
      | "tStage"
      | "nStage"
      | "mStage"
      | "laterality"
      | "bodySite"
      | "grade"
  ) => (
    value: string,
    select?: boolean
  ) => {
    setFormData((previous) => {
      const current = Array.isArray(previous[field]) ? previous[field] : [];
      const raw = splitQualified(value).raw;
      const present = current.includes(value);
      if (select === true) {
        /* Adding. Only one subtype / stage may be picked per cancer type:
           any other entry belonging to the same cancer type group (and any
           legacy raw-only entry carrying the same label) is replaced by
           this new one, so the box ticks exactly once per cancer type. */
        if (present) return previous;
        const group = splitQualified(value).cancerType;
        return {
          ...previous,
          [field]: [
            ...current.filter(
              (item) =>
                splitQualified(item).cancerType !== group && item !== raw
            ),
            value,
          ],
        };
      }
      if (select === false) {
        /* Removing. Drop the qualified value and any legacy raw-only
           entry carrying the same label. */
        return {
          ...previous,
          [field]: current.filter(
            (item) =>
              item !== value && !(item.indexOf("|") === -1 && item === raw)
          ),
        };
      }
      /* Binary toggle fallback (e.g. chip removal). */
      return present
        ? {
            ...previous,
            [field]: current.filter(
              (item) =>
                item !== value && !(item.indexOf("|") === -1 && item === raw)
            ),
          }
        : { ...previous, [field]: [...current, value] };
    });
  };

  /* ---- The doctor's own wording of a picked value (this patient only) ----
     The selection keeps the master value (it is what the subtype id, the
     grade / score systems and the stale T / N / M check match on); the
     reworded text sits beside it in formData.valueEdits and is what gets
     saved to the visit's staging detail. */
  const labelOf = (field: EditableField, value: string) =>
    formData.valueEdits[editKey(field, value)] ?? splitQualified(value).raw;

  const joinLabels = (field: EditableField, values: string[]) =>
    values.map((value) => labelOf(field, value)).join(", ");

  /* Rewording back to the master value (or to nothing) drops the edit. */
  const setValueEdit = (field: EditableField, value: string, text: string) =>
    setFormData((previous) => {
      const key = editKey(field, value);
      const trimmed = text.trim();
      const next = { ...previous.valueEdits };
      if (!trimmed || trimmed === splitQualified(value).raw) {
        delete next[key];
      } else {
        next[key] = trimmed;
      }
      return { ...previous, valueEdits: next };
    });

  const editProps = (field: EditableField) => ({
    labelOf: (value: string) => labelOf(field, value),
    onEditValue: (value: string, text: string) =>
      setValueEdit(field, value, text),
  });

  /* An edit belongs to its picked value: unticking the value (or its
     cancer type) drops the edit too. */
  useEffect(() => {
    setFormData((previous) => {
      const keys = Object.keys(previous.valueEdits);
      if (keys.length === 0) return previous;
      const isPicked = (key: string) => {
        const pipe = key.indexOf("|");
        const field = key.slice(0, pipe);
        const value = key.slice(pipe + 1);
        if (field === "diseaseStatus") return previous.diseaseStatus === value;
        const arrayField = EDITABLE_ARRAY_FIELDS.find((item) => item === field);
        return Boolean(arrayField && previous[arrayField].includes(value));
      };
      const kept = keys.filter(isPicked);
      if (kept.length === keys.length) return previous;
      return {
        ...previous,
        valueEdits: Object.fromEntries(
          kept.map((key) => [key, previous.valueEdits[key]])
        ),
      };
    });
  }, [
    formData.diseaseStatus,
    formData.bodySite,
    formData.subType,
    formData.cancerStage,
    formData.grade,
    formData.score,
    formData.tStage,
    formData.nStage,
    formData.mStage,
  ]);

  useEffect(() => {
    setSelectedCancerTypes((previous) => {
      if (!formData.type) return previous;
      return previous.includes(formData.type)
        ? previous
        : [...previous, formData.type];
    });
  }, [formData.type]);

  /* Sync the diagnosis selection to localStorage so downstream steps can
     read it: Treatment Plan lists regimen protocols for every selected
     cancer type (cancer_type_ids) and Histopathology (subtype_ids); the
     single primary fields are kept for Summary / plan sync. */
  const lastSelectionRef = useRef("");
  useEffect(() => {
    const typeNames =
      selectedCancerTypes.length > 0
        ? selectedCancerTypes
        : formData.type
          ? [formData.type]
          : [];
    const matchedTypes = typeNames
      .map((name) => cancerTypes.find((item) => item.cancer_type === name))
      .filter((item): item is CancerTypeItem => Boolean(item?.cancer_type_id));
    if (matchedTypes.length === 0) return;

    /* Resolve each ticked Histopathology to its subtype row, matching on
       the cancer type it was ticked under. */
    const matchedSubtypes = formData.subType
      .map((value) => {
        const { cancerType, raw } = splitQualified(value);
        return subtypes.find(
          (item) =>
            item.subtype_name === raw &&
            (!cancerType || item.cancerType === cancerType)
        );
      })
      .filter((item): item is CancerSubtypeOption => Boolean(item));

    const primaryType =
      matchedTypes.find((item) => item.cancer_type === formData.type) ??
      matchedTypes[0];
    const primarySubtype =
      matchedSubtypes.find(
        (item) => item.cancerType === primaryType.cancer_type
      );

    /* Resolve diagnosis_id by matching the primary subtype's ICD-10 code
       against the loaded diagnosis catalog. */
    let diagnosisId = "";
    const subtypeIcd = primarySubtype?.icd10_subtype?.trim();
    if (subtypeIcd && diagnosisCatalogRef.current.length > 0) {
      const match = diagnosisCatalogRef.current.find(
        (entry) => entry.icd_code?.toUpperCase() === subtypeIcd.toUpperCase()
      );
      if (match) diagnosisId = match.diagnosis_id;
    }

    const selection = JSON.stringify({
      patient_id: resolvedPatientId,
      cancer_type_id: primaryType.cancer_type_id,
      subtype_id: primarySubtype?.subtype_id ?? "",
      cancer_type: primaryType.cancer_type,
      subtype_name: primarySubtype?.subtype_name ?? "",
      diagnosis_id: diagnosisId,
      cancer_type_ids: matchedTypes.map((item) => item.cancer_type_id),
      subtype_ids: Array.from(
        new Set(matchedSubtypes.map((item) => item.subtype_id))
      ),
    });
    if (selection === lastSelectionRef.current) return;
    lastSelectionRef.current = selection;

    localStorage.setItem("hms_diagnosis_selection", selection);

    window.dispatchEvent(
      new CustomEvent("cancer-type-changed", {
        detail: {
          patientId: resolvedPatientId,
          cancerType: primaryType.cancer_type,
          cancerSubtype: primarySubtype?.subtype_name ?? "",
        },
      })
    );
  }, [
    formData.type,
    formData.subType,
    selectedCancerTypes,
    cancerTypes,
    subtypes,
    diagnosisCatalogReady,
    resolvedPatientId,
  ]);

  /* Every visit's Investigation Results for the patient. This visit's
     values pre-fill the section unless the draft already holds some. */
  useEffect(() => {
    if (!resolvedPatientId) return;
    let cancelled = false;
    (async () => {
      try {
        const [visitNo, response] = await Promise.all([
          resolveVisitEncounterNo().catch(() => ""),
          API.get<{ success: boolean; data: InvestigationResultRecord[] }>(
            "/oncology/investigation-results",
            { params: { patient_id: resolvedPatientId } }
          ),
        ]);
        if (cancelled) return;
        const rows = response.data.data ?? [];
        setInvestigationVisitNo(visitNo);
        setInvestigationHistory(rows);
        const own = visitNo ? rows.filter((row) => row.encounter_no === visitNo) : [];
        if (own.length === 0) return;
        setFormData((previous) => {
          const draftHasValues = Object.values(
            previous.investigationResults ?? {}
          ).some((value) => String(value ?? "").trim());
          if (draftHasValues) return previous;
          const values: Record<string, string> = {};
          own.forEach((row) => {
            values[row.parameter_id] =
              row.investigation_parameter?.input_type === "DATE"
                ? toPickedDateValue(row.value_text)
                : row.value_text;
          });
          return {
            ...previous,
            investigationResults: values,
            investigationReportDate:
              previous.investigationReportDate ||
              toPickedDateValue(own[0].report_date),
          };
        });
      } catch (error) {
        console.error("Failed to load investigation results:", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resolvedPatientId, encounterNo, appointmentId]);

  const [stageLabels, setStageLabels] = useState<StageOption[]>([]);

  const [tOptions, setTOptions] = useState<StageOption[]>([]);
  const [nOptions, setNOptions] = useState<StageOption[]>([]);
  const [mOptions, setMOptions] = useState<StageOption[]>([]);
  /* Grades parsed out of staging_reference text; fallback for cancer
     types with no cancer_grade_master rows. */
  const [grades, setGrades] = useState<StageOption[]>([]);
  const [bodySiteOptions, setBodySiteOptions] = useState<
    ForCancerType<AnatomicalSiteItem>[]
  >([]);
  const [gradeMasterOptions, setGradeMasterOptions] = useState<
    ForCancerType<CancerGradeItem>[]
  >([]);
  const [scoreMasterOptions, setScoreMasterOptions] = useState<
    ForCancerType<CancerScoreItem>[]
  >([]);
  /* Disease Status values (disease_status_master), one list for every
     cancer type. */
  const [diseaseStatusOptions, setDiseaseStatusOptions] = useState<string[]>(
    DEFAULT_DISEASE_STATUSES
  );
  /* Investigation Results: the tests of the selected cancer types, every
     visit's saved values for this patient, and this visit's encounter. */
  const [investigationParameters, setInvestigationParameters] = useState<
    ForCancerType<InvestigationParameterItem>[]
  >([]);
  const [investigationHistory, setInvestigationHistory] = useState<
    InvestigationResultRecord[]
  >([]);
  const [investigationVisitNo, setInvestigationVisitNo] = useState("");
  const [metastasisSites, setMetastasisSites] = useState<string[]>([]);
  /* Metastasis Sites aren't in the draft: kept with the visit context so
     they survive switching steps (once the context belongs to this visit). */
  useEffect(() => {
    if (!resolvedPatientId || !visitContextReadyRef.current) return;
    localStorage.setItem(
      visitContextKey,
      JSON.stringify({
        encounterNo: readVisitContext()?.encounterNo ?? "",
        metastasisSites,
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metastasisSites, resolvedPatientId]);
  const [diagnosisLoading, setDiagnosisLoading] = useState(false);
  const [diagnosisError, setDiagnosisError] = useState("");
  const [savingDiagnosis, setSavingDiagnosis] = useState(false);

  const diagnosisRequestRef = useRef(0);
  const stagingRequestRef = useRef(0);
  const masterRequestRef = useRef(0);
  const diagnosisCatalogRef = useRef<
    { diagnosis_id: string; icd_code: string }[]
  >([]);

  const loadDiagnosisCatalog = async () => {
    const categoriesResponse = await API.get<{
      success: boolean;
      data: { categories: { diagnosis_catogory_id: string }[] };
    }>("/diagnosis/categories");
    const categories = (
      categoriesResponse.data.data?.categories ?? []
    ).filter((category) => Boolean(category.diagnosis_catogory_id));
    const responses = await Promise.all(
      categories.map((category) =>
        API.get<{
          success: boolean;
          data: {
            diagnoses: { diagnosis_id: string; icd_code: string }[];
          };
        }>(`/diagnosis/categories/${category.diagnosis_catogory_id}/diagnoses`)
      )
    );
    return responses.flatMap(
      (response) => response.data.data?.diagnoses ?? []
    );
  };

  /* Load the subtype options for every selected cancer type and merge
     them into the Histopathology dropdown. Each option remembers its
     parent cancer type so the dropdown can show the mapping. */
  const loadSubtypesForCancerTypes = (
    selections: { cancerTypeId: string; cancerTypeName: string }[]
  ) => {
    const ids = selections.filter(
      (selection) => Boolean(selection.cancerTypeId)
    );
    const requestId = ++diagnosisRequestRef.current;
    setDiagnosisError("");

    if (ids.length === 0) {
      setSubtypes([]);
      setDiagnosisLoading(false);
      return;
    }

    setDiagnosisLoading(true);

    Promise.all(
      ids.map((selection) =>
        API.get<{ success: boolean; data: CancerSubtypeItem[] }>(
          `/oncology/reference/cancer-types/${selection.cancerTypeId}/subtypes`
        )
      )
    )
      .then((responses) => {
        if (requestId !== diagnosisRequestRef.current) return;
        const merged = new Map<string, CancerSubtypeOption>();
        responses.forEach((response, index) => {
          const cancerType = ids[index].cancerTypeName;
          for (const item of response.data.data) {
            const key = `${cancerType}|${item.subtype_name}`;
            if (!merged.has(key)) {
              merged.set(key, { ...item, cancerType });
            }
          }
        });
        setSubtypes(Array.from(merged.values()));
      })
      .catch((error) => {
        console.error("Failed to load cancer subtypes:", error);
        if (requestId === diagnosisRequestRef.current) {
          setDiagnosisError(
            error?.response?.data?.message || "Failed to load cancer subtypes."
          );
        }
      })
      .finally(() => {
        if (requestId === diagnosisRequestRef.current) {
          setDiagnosisLoading(false);
        }
      });
  };

  /* Body Site, Grade and Score masters for every selected cancer type,
     each row tagged with its cancer type for per-type grouping. */
  const loadMastersForCancerTypes = (
    selections: { cancerTypeId: string; cancerTypeName: string }[]
  ) => {
    const ids = selections.filter((selection) => Boolean(selection.cancerTypeId));
    const requestId = ++masterRequestRef.current;

    if (ids.length === 0) {
      setBodySiteOptions([]);
      setGradeMasterOptions([]);
      setScoreMasterOptions([]);
      setInvestigationParameters([]);
      return;
    }

    const fetchTagged = <T,>(path: string, label: string) =>
      Promise.all(
        ids.map((selection) =>
          API.get<{ success: boolean; data: T[] }>(
            `/oncology/reference/cancer-types/${selection.cancerTypeId}/${path}`
          )
            .then((response) =>
              (response.data.data ?? []).map((item) => ({
                ...item,
                cancerType: selection.cancerTypeName,
              }))
            )
            .catch((error) => {
              console.error(`Failed to load ${label}:`, error);
              return [] as ForCancerType<T>[];
            })
        )
      ).then((lists) => lists.flat());

    fetchTagged<AnatomicalSiteItem>("sites", "anatomical sites").then((items) => {
      if (requestId === masterRequestRef.current) setBodySiteOptions(items);
    });
    fetchTagged<CancerGradeItem>("grades", "cancer grades").then((items) => {
      if (requestId === masterRequestRef.current) setGradeMasterOptions(items);
    });
    fetchTagged<CancerScoreItem>("scores", "cancer scores").then((items) => {
      if (requestId === masterRequestRef.current) setScoreMasterOptions(items);
    });
    fetchTagged<InvestigationParameterItem>(
      "investigation-parameters",
      "investigation tests"
    ).then((items) => {
      if (requestId === masterRequestRef.current) setInvestigationParameters(items);
    });
  };

  const loadStagesForCancerTypes = (
    selections: {
      cancerTypeId: string;
      cancerTypeName: string;
    }[],
    resetStageSelection = true
  ) => {
    if (!selections.length) return;
    const requestId = ++stagingRequestRef.current;
    setDiagnosisLoading(true);
    setDiagnosisError("");
    setTOptions([]);
    setNOptions([]);
    setMOptions([]);
    setGrades([]);
    /* New cancer types start over; reloading the options of restored /
       prefilled ones keeps their Metastasis Sites. */
    if (resetStageSelection) setMetastasisSites([]);

    Promise.all(
      selections.map((selection) =>
        Promise.all([
          API.get<{ success: boolean; data: StagingReferenceItem[] }>(
            "/oncology/reference/staging",
            { params: { cancer_type_id: selection.cancerTypeId } }
          ),
          /* T / N / M values doctors added for this cancer type. */
          API.get<{ success: boolean; data: TnmStageItem[] }>(
            `/oncology/reference/cancer-types/${selection.cancerTypeId}/tnm-stages`
          )
            .then((response) => response.data.data ?? [])
            .catch((error) => {
              console.error("Failed to load added T / N / M stages:", error);
              return [] as TnmStageItem[];
            }),
        ]).then(([response, added]) => ({
          cancerTypeName: selection.cancerTypeName,
          items: response.data.data,
          added,
        }))
      )
    )
      .then((results) => {
        if (requestId !== stagingRequestRef.current) return;

        const seenStage = new Set<string>();
        const seenGrade = new Set<string>();

        const stageOptions: StageOption[] = [];
        const tOptionsAggregated: StageOption[] = [];
        const nOptionsAggregated: StageOption[] = [];
        const mOptionsAggregated: StageOption[] = [];
        const gradeOptions: StageOption[] = [];

        for (const result of results) {
          const { cancerTypeName, items, added } = result;

          for (const item of items) {
            const stageLabel = item.stage_label;
            if (
              stageLabel &&
              !seenStage.has(`${cancerTypeName}|${stageLabel}`)
            ) {
              seenStage.add(`${cancerTypeName}|${stageLabel}`);
              stageOptions.push({ value: stageLabel, cancerType: cancerTypeName });
            }
            const gradeSource = [
              item.stage_label,
              item.staging_system,
              item.subtype_label,
              item.tnm_criteria,
              item.risk_criteria,
            ]
              .filter((value): value is string => Boolean(value))
              .join(" ");
            for (const match of gradeSource.matchAll(
              /grade\s+group\s*[\d\-“]+|grade\s+[\d\-“]+/gi
            )) {
              const grade = match[0]
                .replace(/\s+/g, " ")
                .replace(/\b\w/g, (c) => c.toUpperCase());
              if (!seenGrade.has(`${cancerTypeName}|${grade}`)) {
                seenGrade.add(`${cancerTypeName}|${grade}`);
                gradeOptions.push({ value: grade, cancerType: cancerTypeName });
              }
            }
          }

          /* T / N / M options: the storable values each criteria phrase
             names, parsed server-side, plus the ones doctors added for the
             cancer type, merged per cancer type in AJCC order - no
             "T1a/b/c"-style labels that can't be saved. */
          const valuesOf = (
            key: "t_values" | "n_values" | "m_values",
            axis: TnmStageItem["axis"]
          ) =>
            [
              ...new Set([
                ...items.flatMap((item) => item[key] ?? []),
                ...added
                  .filter((row) => row.axis === axis)
                  .map((row) => row.stage_value),
              ]),
            ].sort(compareTnm);
          for (const value of valuesOf("t_values", "T")) {
            tOptionsAggregated.push({ value, cancerType: cancerTypeName });
          }
          for (const value of valuesOf("n_values", "N")) {
            nOptionsAggregated.push({ value, cancerType: cancerTypeName });
          }
          for (const value of valuesOf("m_values", "M")) {
            mOptionsAggregated.push({ value, cancerType: cancerTypeName });
          }
        }

        setStageLabels(stageOptions);
        setTOptions(tOptionsAggregated);
        setNOptions(nOptionsAggregated);
        setMOptions(mOptionsAggregated);
        setGrades(
          gradeOptions.sort((a, b) => a.value.localeCompare(b.value))
        );
        if (!resetStageSelection) return;
        setFormData((previous) => ({
          ...previous,
          cancerStage: [],
        }));
      })
      .catch((error) => {
        console.error("Failed to load cancer stages:", error);
        if (requestId === stagingRequestRef.current) {
          setDiagnosisError(
            error?.response?.data?.message || "Failed to load cancer stages."
          );
        }
      })
      .finally(() => {
        if (requestId === stagingRequestRef.current) {
          setDiagnosisLoading(false);
        }
      });
  };

  useEffect(() => {
    let cancelled = false;

    API.get<{ success: boolean; data: CancerTypeItem[] }>(
      "/oncology/reference/cancer-types"
    )
      .then((response) => {
        if (cancelled) return;
        const fetched = response.data.data;
        setCancerTypes(fetched);
        cancerTypesRef.current = fetched;

        /* A staging detail prefilled before the catalog arrived, else the
           draft's cancer types. */
        let savedTypes: string[] = pendingOptionTypesRef.current ?? [];
        pendingOptionTypesRef.current = null;
        if (savedTypes.length === 0) {
          try {
            const savedDraft = JSON.parse(
              localStorage.getItem(diagnosisDraftKey) ?? ""
            ) as Partial<FormData> | null;
            savedTypes = Array.isArray(savedDraft?.cancerTypes)
              ? savedDraft.cancerTypes.map(String)
              : [];
            if (savedDraft?.type && !savedTypes.includes(savedDraft.type)) {
              savedTypes = [savedDraft.type, ...savedTypes];
            }
          } catch (error) {
            console.error("Failed to read diagnosis draft:", error);
          }
        }

        const matchedSavedTypes = savedTypes
          .map((name) => fetched.find((item) => item.cancer_type === name))
          .filter(
            (item): item is CancerTypeItem =>
              Boolean(item && item.cancer_type_id)
          )
          .map((item) => ({
            cancerTypeId: item.cancer_type_id,
            cancerTypeName: item.cancer_type,
          }));

        if (matchedSavedTypes.length > 0) {
          /* A draft saved while the ICD Code wasn't filled for every
             cancer type gets each type's code, in selection order. */
          setFormData((previous) =>
            previous.icdCode
              ? previous
              : {
                  ...previous,
                  icdCode: Array.from(
                    new Set(
                      matchedSavedTypes
                        .map(
                          (selection) =>
                            fetched
                              .find(
                                (item) =>
                                  item.cancer_type_id === selection.cancerTypeId
                              )
                              ?.icd10?.trim() ?? ""
                        )
                        .filter(Boolean)
                    )
                  ).join(", "),
                }
          );
          // Restoring a saved draft: reload options for every saved
          // cancer type without overwriting the user's selections.
          loadSubtypesForCancerTypes(matchedSavedTypes);
          loadStagesForCancerTypes(matchedSavedTypes, false);
          loadMastersForCancerTypes(matchedSavedTypes);
          return;
        }

        const initial = fetched[0];

        if (initial) {
          setFormData((previous) => ({
            ...previous,
            type: previous.type || initial.cancer_type,
            icdCode: previous.icdCode || initial.icd10 || "",
          }));
          loadSubtypesForCancerTypes([
            {
              cancerTypeId: initial.cancer_type_id,
              cancerTypeName: initial.cancer_type,
            },
          ]);
          loadStagesForCancerTypes([
            {
              cancerTypeId: initial.cancer_type_id,
              cancerTypeName: initial.cancer_type,
            },
          ]);
          loadMastersForCancerTypes([
            {
              cancerTypeId: initial.cancer_type_id,
              cancerTypeName: initial.cancer_type,
            },
          ]);
        }
      })
      .catch((error) => {
        console.error("Failed to load cancer types:", error);
        if (!cancelled) {
          setDiagnosisError(
            error?.response?.data?.message || "Failed to load cancer types."
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    API.get<{ success: boolean; data: DiseaseStatusItem[] }>(
      "/oncology/reference/disease-statuses"
    )
      .then((response) => {
        const names = (response.data.data ?? []).map((item) => item.status_name);
        if (!cancelled && names.length > 0) setDiseaseStatusOptions(names);
      })
      .catch((error) => {
        console.error("Failed to load disease statuses:", error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    loadDiagnosisCatalog()
      .then((diagnoses) => {
        if (cancelled) return;
        diagnosisCatalogRef.current = diagnoses;
        setDiagnosisCatalogReady(true);
      })
      .catch((error) => {
        console.error("Failed to load diagnosis catalog:", error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleChange = (
    event: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  /* The ICD Code field: one code per selected cancer type, in the order
     the types were selected - the ICD-10 of the histopathology ticked
     under the type when it has one, else the cancer type's own (the same
     cascade the backend stores as icd10_code). */
  const icdCodesFor = (typeNames: string[], subTypeValues: string[]) => {
    const codes = typeNames.map((typeName, index) => {
      const picked = subTypeValues.find((value) => {
        const { cancerType } = splitQualified(value);
        return cancerType ? cancerType === typeName : index === 0;
      });
      const subtype = picked
        ? subtypes.find(
            (item) =>
              item.cancerType === typeName &&
              item.subtype_name === splitQualified(picked).raw
          )
        : undefined;
      return (
        subtype?.icd10_subtype?.trim() ||
        cancerTypes
          .find((item) => item.cancer_type === typeName)
          ?.icd10?.trim() ||
        ""
      );
    });
    return Array.from(new Set(codes.filter(Boolean))).join(", ");
  };

  const handleTypesChange = (values: string[]) => {
    setSelectedCancerTypes(values);

    /* Reload the dependent fields off the first selected type. */
    const primaryType = values[0] ?? "";
    /* Drop grouped selections that belonged to a deselected cancer type. */
    const keepSelectedTypes = (items: string[]) =>
      items.filter((item) => {
        const { cancerType } = splitQualified(item);
        return !cancerType || values.includes(cancerType);
      });
    setFormData((previous) => ({
      ...previous,
      type: primaryType,
      cancerTypes: values,
      subType: [],
      /* Histopathology starts over, so each type's own code. */
      icdCode: icdCodesFor(values, []),
      laterality: keepSelectedTypes(previous.laterality),
      bodySite: keepSelectedTypes(previous.bodySite),
      grade: keepSelectedTypes(previous.grade),
      score: keepSelectedTypes(previous.score),
    }));

/* Histopathology shows the subtypes of every selected cancer type,
       grouped under its parent cancer type. */
    const selectedTypes = values
      .map((name) => cancerTypes.find((item) => item.cancer_type === name))
      .filter(
        (item): item is CancerTypeItem =>
          Boolean(item && item.cancer_type_id)
      )
      .map((item) => ({
        cancerTypeId: item.cancer_type_id,
        cancerTypeName: item.cancer_type,
      }));
    loadSubtypesForCancerTypes(selectedTypes);
    loadStagesForCancerTypes(selectedTypes);
    loadMastersForCancerTypes(selectedTypes);
  };

  /* Per-cancer-type option groups for Laterality / Body Site / Grade, in
     the order the cancer types were selected. */
  const optionTypes =
    selectedCancerTypes.length > 0
      ? selectedCancerTypes
      : formData.type
        ? [formData.type]
        : [];

  /* "<Type>|<label>" values in the order their cancer types were selected
     (not the order they were ticked); within one type the ticked order
     stays. A legacy value without a type is the primary type's. */
  const orderByType = (values: string[]) => {
    const rank = (value: string) => {
      const index = optionTypes.indexOf(
        splitQualified(value).cancerType || formData.type
      );
      return index === -1 ? optionTypes.length : index;
    };
    return [...values].sort((a, b) => rank(a) - rank(b));
  };

  /* Ticking a histopathology also refreshes its type's ICD code. */
  const handleSubtypeToggle = (value: string, select?: boolean) => {
    handleMultiToggle("subType")(value, select);
    setFormData((previous) => ({
      ...previous,
      icdCode: icdCodesFor(optionTypes, previous.subType),
    }));
  };

  /* Laterality only under the selected cancer types it applies to; older
     picks for other types (or retired values like "Midline") are ignored. */
  const lateralityTypes = optionTypes.filter(
    (cancerType) =>
      cancerTypes.find((item) => item.cancer_type === cancerType)
        ?.laterality_applicable
  );
  const lateralityGroups = buildCheckboxGroups(
    lateralityTypes.flatMap((cancerType) =>
      LATERALITY_OPTIONS.map((value) => ({ value, cancerType }))
    )
  );
  const lateralitySelected = formData.laterality.filter((value) => {
    const { cancerType, raw } = splitQualified(value);
    return (
      lateralityTypes.includes(cancerType || formData.type) &&
      LATERALITY_OPTIONS.includes(raw)
    );
  });

  /* A cancer type with no seeded master rows shows the built-in list; the
     values doctors added (created_by set) are listed after it rather than
     replacing it. */
  const withFallback = (fallback: string[], added: string[]) => [
    ...fallback,
    ...added.filter(
      (value) =>
        !fallback.some((item) => item.toLowerCase() === value.toLowerCase())
    ),
  ];

  const bodySiteGroups = buildCheckboxGroups(
    optionTypes.flatMap((cancerType) => {
      const sites = bodySiteOptions.filter(
        (site) => site.cancerType === cancerType
      );
      const names = sites.some((site) => !site.created_by)
        ? sites.map((site) => site.site_name)
        : withFallback(
            BODY_SITE_OPTIONS,
            sites.map((site) => site.site_name)
          );
      return names.map((value) => ({ value, cancerType }));
    })
  );

  const gradeGroups = buildCheckboxGroups(
    optionTypes.flatMap((cancerType) => {
      const masters = gradeMasterOptions.filter(
        (grade) => grade.cancerType === cancerType
      );
      const names = masters.some((grade) => !grade.created_by)
        ? masters.map((grade) => grade.grade_value)
        : withFallback(
            grades
              .filter((grade) => grade.cancerType === cancerType)
              .map((grade) => grade.value),
            masters.map((grade) => grade.grade_value)
          );
      return names.map((value) => ({ value, cancerType }));
    })
  );

  /* The Histopathology values ticked under a cancer type. */
  const subtypeLabelsFor = (cancerType: string) =>
    formData.subType
      .filter((value) => {
        const parsed = splitQualified(value);
        return !parsed.cancerType || parsed.cancerType === cancerType;
      })
      .map((value) => splitQualified(value).raw);

  /* Score options: subtype-specific scores (e.g. IPI for DLBCL) only appear
     once a matching Histopathology value is ticked for that cancer type. */
  const scoreOptions: ScoreOption[] = optionTypes.flatMap((cancerType) => {
    const subtypeLabels = subtypeLabelsFor(cancerType);
    return scoreMasterOptions
      .filter(
        (score) =>
          score.cancerType === cancerType &&
          matchesSubtypeKeywords(score.subtype_keywords, subtypeLabels)
      )
      .map((score) => ({
        cancerType,
        system: score.score_system,
        value: score.score_value,
      }));
  });

  /* Investigation Results: one numbered panel per selected cancer type,
     holding only that type's tests (grouped by chart; subtype-specific
     charts once a matching Histopathology is ticked) and the values of its
     earlier visits. A test two types share (e.g. CEA) is kept per type. */
  const investigationPanels = optionTypes.map((cancerType, index) => {
    const subtypeLabels = subtypeLabelsFor(cancerType);
    const parameters = investigationParameters.filter(
      (parameter) =>
        parameter.cancerType === cancerType &&
        matchesSubtypeKeywords(parameter.subtype_keywords, subtypeLabels)
    );

    const charts: {
      name: string;
      parameters: ForCancerType<InvestigationParameterItem>[];
    }[] = [];
    parameters.forEach((parameter) => {
      let chart = charts.find((item) => item.name === parameter.chart_name);
      if (!chart) {
        chart = { name: parameter.chart_name, parameters: [] };
        charts.push(chart);
      }
      chart.parameters.push(parameter);
    });

    const shownIds = new Set(parameters.map((parameter) => parameter.parameter_id));
    const visits = new Map<
      string,
      { encounterNo: string; reportDate: string; values: Record<string, InvestigationResultRecord> }
    >();
    investigationHistory
      .filter(
        (row) =>
          row.encounter_no !== investigationVisitNo && shownIds.has(row.parameter_id)
      )
      .forEach((row) => {
        const visit = visits.get(row.encounter_no) ?? {
          encounterNo: row.encounter_no,
          reportDate: row.report_date,
          values: {},
        };
        visit.values[row.parameter_id] = row;
        visits.set(row.encounter_no, visit);
      });
    const history = [...visits.values()]
      .sort((a, b) => b.reportDate.localeCompare(a.reportDate))
      .slice(0, 5);

    return { number: index + 1, cancerType, charts, parameters, history };
  });

  const setInvestigationValue = (parameterId: string, value: string) =>
    setFormData((previous) => ({
      ...previous,
      investigationResults: {
        ...previous.investigationResults,
        [parameterId]: value,
      },
    }));

  /* One test's input: a number with its range and a High / Low tag, a
     free-text report, a date, or a +/- choice. */
  const renderInvestigationInput = (
    parameter: ForCancerType<InvestigationParameterItem>
  ) => {
    const id = `investigation-${parameter.parameter_id}`;
    const value = formData.investigationResults[parameter.parameter_id] ?? "";

    if (parameter.input_type === "DATE") {
      return (
        <DiagnosisDateField
          key={parameter.parameter_id}
          id={id}
          title={parameter.parameter_name}
          value={value}
          onChange={(next) => setInvestigationValue(parameter.parameter_id, next)}
        />
      );
    }

    const flag = investigationFlag(parameter, value);
    return (
      <div key={parameter.parameter_id}>
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <label htmlFor={id} className="text-sm font-semibold text-gray-600">
            {parameter.parameter_name}
            {parameter.unit ? ` (${parameter.unit})` : ""}
          </label>
          {parameter.range_label && (
            <span className="shrink-0 text-xs text-gray-400">
              Normal {parameter.range_label}
            </span>
          )}
        </div>
        {parameter.input_type === "SELECT" ? (
          <select
            id={id}
            value={value}
            onChange={(event) =>
              setInvestigationValue(parameter.parameter_id, event.target.value)
            }
            className={INVESTIGATION_INPUT_CLASS}
          >
            <option value="">Select</option>
            {(parameter.select_options ?? "")
              .split("|")
              .map((option) => option.trim())
              .filter(Boolean)
              .map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
          </select>
        ) : parameter.input_type === "TEXT" ? (
          <textarea
            id={id}
            rows={2}
            value={value}
            onChange={(event) =>
              setInvestigationValue(parameter.parameter_id, event.target.value)
            }
            placeholder="Enter report findings"
            className={`${INVESTIGATION_INPUT_CLASS} resize-y`}
          />
        ) : (
          <div className="relative">
            <input
              id={id}
              type="text"
              inputMode="decimal"
              value={value}
              onChange={(event) =>
                setInvestigationValue(parameter.parameter_id, event.target.value)
              }
              placeholder="Value"
              className={`${INVESTIGATION_INPUT_CLASS} ${
                flag ? "border-red-300 pr-16 text-red-700" : ""
              }`}
            />
            {flag && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600 ring-1 ring-inset ring-red-200">
                {flag}
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  const scoreSystemOf = (qualified: string) => {
    const { cancerType, raw } = splitQualified(qualified);
    return scoreMasterOptions.find(
      (score) => score.cancerType === cancerType && score.score_value === raw
    )?.score_system;
  };

  /* Multiple scores may be picked, but only one value per score system per
     cancer type (e.g. one IPI value), mirroring the T/N/M one-per-type rule. */
  const handleScoreToggle = (
    value: string,
    select?: boolean,
    /* The system of a score just added, not yet in scoreMasterOptions. */
    knownSystem?: string
  ) => {
    setFormData((previous) => {
      const present = previous.score.includes(value);
      const adding = select ?? !present;
      if (!adding) {
        return {
          ...previous,
          score: previous.score.filter((item) => item !== value),
        };
      }
      if (present) return previous;
      const system = knownSystem ?? scoreSystemOf(value);
      const { cancerType } = splitQualified(value);
      return {
        ...previous,
        score: [
          ...previous.score.filter(
            (item) =>
              !system ||
              splitQualified(item).cancerType !== cancerType ||
              scoreSystemOf(item) !== system
          ),
          value,
        ],
      };
    });
  };

  /* ---- Values the doctor adds from a dropdown ----
     Each is saved to its master table (under the cancer type it was added
     to), so it is offered for every patient from then on; it is then
     listed here and ticked. A value already in the table comes back as the
     existing row. */
  const addReferenceValue = async <T,>(
    path: string,
    body: Record<string, string>
  ) => {
    const response = await API.post<{ success: boolean; data: T; created: boolean }>(
      `/oncology/reference/${path}`,
      body
    );
    return response.data.data;
  };

  const addForCancerType = <T,>(
    cancerType: string,
    path: string,
    body: Record<string, string>
  ) => {
    const cancerTypeId = cancerTypes.find(
      (item) => item.cancer_type === cancerType
    )?.cancer_type_id;
    if (!cancerTypeId) {
      return Promise.reject(new Error(`Unknown cancer type: ${cancerType}`));
    }
    return addReferenceValue<T>(`cancer-types/${cancerTypeId}/${path}`, body);
  };

  /* Adds a row tagged with its cancer type, unless it is already listed. */
  const appendTagged = <T,>(
    setter: React.Dispatch<React.SetStateAction<ForCancerType<T>[]>>,
    row: T,
    cancerType: string,
    sameRow: (a: T, b: T) => boolean
  ) =>
    setter((previous) =>
      previous.some(
        (item) => item.cancerType === cancerType && sameRow(item, row)
      )
        ? previous
        : [...previous, { ...row, cancerType }]
    );

  const handleAddBodySite: DiagnosisAddHandler = async (cancerType, text) => {
    const row = await addForCancerType<AnatomicalSiteItem>(cancerType, "sites", {
      value: text,
    });
    appendTagged(setBodySiteOptions, row, cancerType, (a, b) => a.site_id === b.site_id);
    handleMultiToggle("bodySite")(`${cancerType}|${row.site_name}`, true);
  };

  const handleAddSubtype: DiagnosisAddHandler = async (cancerType, text) => {
    const row = await addForCancerType<CancerSubtypeItem>(cancerType, "subtypes", {
      value: text,
    });
    appendTagged(setSubtypes, row, cancerType, (a, b) => a.subtype_id === b.subtype_id);
    handleSubtypeToggle(`${cancerType}|${row.subtype_name}`, true);
  };

  const handleAddStage: DiagnosisAddHandler = async (cancerType, text) => {
    const row = await addForCancerType<StagingReferenceItem>(cancerType, "stages", {
      value: text,
    });
    const label = row.stage_label ?? text;
    setStageLabels((previous) =>
      previous.some(
        (item) => item.cancerType === cancerType && item.value === label
      )
        ? previous
        : [...previous, { value: label, cancerType }]
    );
    handleMultiToggle("cancerStage")(`${cancerType}|${label}`, true);
  };

  const handleAddGrade: DiagnosisAddHandler = async (cancerType, text, system) => {
    const row = await addForCancerType<CancerGradeItem>(cancerType, "grades", {
      value: text,
      system: system || "Other",
    });
    appendTagged(setGradeMasterOptions, row, cancerType, (a, b) => a.grade_id === b.grade_id);
    handleMultiToggle("grade")(`${cancerType}|${row.grade_value}`, true);
  };

  const handleAddScore: DiagnosisAddHandler = async (cancerType, text, system) => {
    const row = await addForCancerType<CancerScoreItem>(cancerType, "scores", {
      value: text,
      system: system || "Other",
    });
    appendTagged(setScoreMasterOptions, row, cancerType, (a, b) => a.score_id === b.score_id);
    handleScoreToggle(`${cancerType}|${row.score_value}`, true, row.score_system);
  };

  const handleAddTnm =
    (axis: TnmStageItem["axis"]): DiagnosisAddHandler =>
    async (cancerType, text) => {
      const row = await addForCancerType<TnmStageItem>(cancerType, "tnm-stages", {
        axis,
        value: text,
      });
      const setter =
        axis === "T" ? setTOptions : axis === "N" ? setNOptions : setMOptions;
      setter((previous) =>
        previous.some(
          (item) =>
            item.cancerType === cancerType && item.value === row.stage_value
        )
          ? previous
          : [...previous, { value: row.stage_value, cancerType }].sort((a, b) =>
              compareTnm(a.value, b.value)
            )
      );
      const field = axis === "T" ? "tStage" : axis === "N" ? "nStage" : "mStage";
      handleMultiToggle(field)(`${cancerType}|${row.stage_value}`, true);
    };

  const handleAddDiseaseStatus = async (text: string) => {
    const row = await addReferenceValue<DiseaseStatusItem>("disease-statuses", {
      value: text,
    });
    setDiseaseStatusOptions((previous) =>
      previous.includes(row.status_name) ? previous : [...previous, row.status_name]
    );
    setFormData((previous) => ({ ...previous, diseaseStatus: row.status_name }));
  };

  /* The system an added Grade / Score is prefilled with: the cancer
     type's own (first listed), else "Other". */
  const gradeSystemDefault = (cancerType: string) =>
    gradeMasterOptions.find((grade) => grade.cancerType === cancerType)
      ?.grade_system || "Other";
  const scoreSystemDefault = (cancerType: string) =>
    scoreMasterOptions.find((score) => score.cancerType === cancerType)
      ?.score_system || "Other";

  /* The form's current selections, as saved in form_state. */
  const buildFormState = (): DiagnosisFormState => ({
    version: 1,
    formData: pickFormFields(formData),
    selectedCancerTypes,
    metastasisSites,
  });

  const handleNext = async () => {
    if (!resolvedPatientId) {
      setDiagnosisError(
        "Patient is not selected. Open this page from a patient consultation to continue."
      );
      return;
    }

    const hasAnyData =
      formData.type ||
      formData.subType.length > 0 ||
      formData.cancerStage.length > 0 ||
      formData.score.length > 0 ||
      formData.tStage.length > 0 ||
      formData.nStage.length > 0 ||
      formData.mStage.length > 0 ||
      formData.icdCode.trim() ||
      formData.notes.trim();

    if (!hasAnyData) {
      setDiagnosisError(
        "Please select or enter the important field in the previous form."
      );
      return;
    }

    if (
      formData.mStage.some((stage) =>
        labelOf("mStage", stage).trim().toUpperCase().startsWith("M1")
      ) &&
      metastasisSites.length === 0
    ) {
      setDiagnosisError(
        "Please select at least one Metastasis Site when the M stage is M1."
      );
      return;
    }

    /* Dates are typed or picked as DD-MM-YYYY; reject anything that isn't a
       real date, and progression / relapse / second primary can't precede
       diagnosis. */
    const dateFields = [
      { label: "Date of Diagnosis", value: formData.diagnosisDate },
      { label: "Date of Progression", value: formData.progressionDate },
      { label: "Date of Relapse", value: formData.relapseDate },
      { label: "Date of Second Primary", value: formData.secondPrimaryDate },
    ];
    const invalidDate = dateFields.find(
      (field) => field.value.trim() && !parsePickedDate(field.value.trim())
    );
    if (invalidDate) {
      setDiagnosisError(`${invalidDate.label} must be in DD-MM-YYYY format.`);
      return;
    }
    const diagnosisDateIso = toIsoDate(formData.diagnosisDate);
    const progressionDateIso = toIsoDate(formData.progressionDate);
    const relapseDateIso = toIsoDate(formData.relapseDate);
    const secondPrimaryDateIso = toIsoDate(formData.secondPrimaryDate);
    if (diagnosisDateIso) {
      if (progressionDateIso && progressionDateIso < diagnosisDateIso) {
        setDiagnosisError(
          "Date of Progression cannot be earlier than the Date of Diagnosis."
        );
        return;
      }
      if (relapseDateIso && relapseDateIso < diagnosisDateIso) {
        setDiagnosisError(
          "Date of Relapse cannot be earlier than the Date of Diagnosis."
        );
        return;
      }
      if (secondPrimaryDateIso && secondPrimaryDateIso < diagnosisDateIso) {
        setDiagnosisError(
          "Date of Second Primary cannot be earlier than the Date of Diagnosis."
        );
        return;
      }
    }

    /* Investigation Results: number tests must be numbers and dates real
       dates. The Report Date defaults to the Date of Diagnosis. */
    const shownInvestigationParameters = investigationPanels.flatMap(
      (panel) => panel.parameters
    );
    const enteredInvestigations = shownInvestigationParameters.filter((parameter) =>
      (formData.investigationResults[parameter.parameter_id] ?? "").trim()
    );
    for (const parameter of enteredInvestigations) {
      const value = formData.investigationResults[parameter.parameter_id].trim();
      if (parameter.input_type === "NUMBER" && !Number.isFinite(Number(value))) {
        setDiagnosisError(
          `${parameter.parameter_name} (${parameter.cancerType}) must be a number.`
        );
        return;
      }
      if (parameter.input_type === "DATE" && !parsePickedDate(value)) {
        setDiagnosisError(
          `${parameter.parameter_name} (${parameter.cancerType}) must be in DD-MM-YYYY format.`
        );
        return;
      }
    }
    const investigationReportDate =
      formData.investigationReportDate.trim() || formData.diagnosisDate.trim();
    if (investigationReportDate && !parsePickedDate(investigationReportDate)) {
      setDiagnosisError("Investigation Report Date must be in DD-MM-YYYY format.");
      return;
    }

    /* T / N / M picked from an older option list (e.g. "T1a/b/c") can't be
       stored - ask for a re-pick instead of failing on save. */
    const staleChecks: [string, string[], StageOption[]][] = [
      ["T Stage", formData.tStage, tOptions],
      ["N Stage", formData.nStage, nOptions],
      ["M Stage", formData.mStage, mOptions],
    ];
    for (const [label, values, options] of staleChecks) {
      for (const value of values) {
        const { cancerType, raw } = splitQualified(value);
        const type = cancerType || formData.type;
        const typeOptions = options.filter(
          (option) => option.cancerType === type
        );
        if (
          typeOptions.length > 0 &&
          !typeOptions.some((option) => option.value === raw)
        ) {
          setDiagnosisError(
            `Please re-select the ${label} for ${type}: "${raw}" is not a valid value.`
          );
          return;
        }
      }
    }

    /* The one value picked under a cancer type (one per type); a legacy
       unqualified value belongs to the primary type. Each cancer type's
       laterality / T / N / M is stored on its own row (primary: the
       staging detail; others: additional_cancers). */
    const pickedFor = (values: string[], cancerType: string) =>
      values.find((value) => {
        const parsed = splitQualified(value);
        return parsed.cancerType
          ? parsed.cancerType === cancerType
          : cancerType === formData.type;
      });
    /* With a field, the doctor's wording of the picked value. */
    const valueFor = (
      values: string[],
      cancerType: string,
      field?: EditableField
    ) => {
      const match = pickedFor(values, cancerType);
      if (!match) return undefined;
      return field ? labelOf(field, match) : splitQualified(match).raw;
    };
    /* The histopathology reworded for this patient, else null (the
       subtype's own name applies). */
    const histopathologyFor = (cancerType: string) => {
      const match = pickedFor(formData.subType, cancerType);
      return match
        ? formData.valueEdits[editKey("subType", match)] ?? null
        : null;
    };
    const lateralityFor = (cancerType: string) =>
      lateralityTypes.includes(cancerType)
        ? valueFor(lateralitySelected, cancerType)
        : undefined;

    /* The histopathology ticked under a cancer type (one per type). The
       primary one must come from under the primary type - not simply the
       first box ticked, which may belong to another selected type. */
    const subtypeFor = (cancerType: string) =>
      formData.subType
        .map((value) => splitQualified(value))
        .filter(
          (parsed) => !parsed.cancerType || parsed.cancerType === cancerType
        )
        .map((parsed) =>
          subtypes.find(
            (item) =>
              item.subtype_name === parsed.raw && item.cancerType === cancerType
          )
        )
        .find((item): item is CancerSubtypeOption => Boolean(item));

    if (formData.type && !subtypeFor(formData.type)) {
      setDiagnosisError(
        `Please select a Histopathology for ${formData.type}.`
      );
      return;
    }

    /* What is saved for the text columns: the doctor's wording of each
       picked value. */
    const clinicalStageText = joinLabels(
      "cancerStage",
      orderByType(formData.cancerStage)
    );
    const siteText = joinLabels("bodySite", orderByType(formData.bodySite));
    const gradeText = joinLabels("grade", orderByType(formData.grade));
    const scoreText = joinLabels("score", orderByType(formData.score));
    const diseaseStatusText = formData.diseaseStatus
      ? labelOf("diseaseStatus", formData.diseaseStatus)
      : "";
    const tooLong = (
      [
        ["Cancer Stage", clinicalStageText],
        ["Body Site", siteText],
        ["Grade", gradeText],
        ["Disease Status", diseaseStatusText],
      ] as const
    ).find(([, text]) => text.length > 100);
    if (tooLong) {
      setDiagnosisError(
        `${tooLong[0]} is too long (max 100 characters) - shorten the selected values.`
      );
      return;
    }

    setDiagnosisError("");
    setSavingDiagnosis(true);

    try {
      const matchedType = cancerTypes.find(
        (item) => item.cancer_type === formData.type
      );
      const matchedSubtype = subtypeFor(formData.type);

      /* Every other selected cancer type, with the histopathology ticked
         under it, so protocols for these cancers can be saved on the plan. */
      const additionalCancers = selectedCancerTypes
        .filter((name) => name !== formData.type)
        .map((name) => cancerTypes.find((item) => item.cancer_type === name))
        .filter((item): item is CancerTypeItem =>
          Boolean(item?.cancer_type_id)
        )
        .map((item) => ({
          cancer_type_id: item.cancer_type_id,
          cancer_subtype_id: subtypeFor(item.cancer_type)?.subtype_id ?? null,
          histopathology: histopathologyFor(item.cancer_type),
          laterality: lateralityFor(item.cancer_type) ?? null,
          t_stage: valueFor(formData.tStage, item.cancer_type, "tStage") ?? null,
          n_stage: valueFor(formData.nStage, item.cancer_type, "nStage") ?? null,
          m_stage: valueFor(formData.mStage, item.cancer_type, "mStage") ?? null,
        }));

      const primaryTStage = valueFor(formData.tStage, formData.type, "tStage");
      const primaryNStage = valueFor(formData.nStage, formData.type, "nStage");
      const primaryMStage = valueFor(formData.mStage, formData.type, "mStage");
      const primaryLaterality = lateralityFor(formData.type);

      const diagnosisId = await resolveDiagnosisId(
        resolvedPatientId,
        formData.icdCode
      );

      /* Grading / scoring systems behind the picked values, de-duplicated
         (custom typed scores have no system). */
      const uniqueJoin = (items: (string | undefined)[]) =>
        Array.from(new Set(items.filter(Boolean))).join(", ");
      const gradeSystems = uniqueJoin(
        orderByType(formData.grade).map((value) => {
          const { cancerType, raw } = splitQualified(value);
          return gradeMasterOptions.find(
            (item) =>
              item.grade_value === raw &&
              (!cancerType || item.cancerType === cancerType)
          )?.grade_system;
        })
      );
      const scoreSystems = uniqueJoin(
        orderByType(formData.score).map(scoreSystemOf)
      );

      const visitDateIso = toIsoDate(visitDate);
      const formState = buildFormState();

      const stagingFields: Record<string, unknown> = {
        cancer_type_id: matchedType?.cancer_type_id ?? "",
        cancer_subtype_id: matchedSubtype?.subtype_id ?? "",
        /* Always sent: null clears an earlier rewording. */
        histopathology: histopathologyFor(formData.type),
        /* Always sent: the list is replaced, so a deselected type is removed. */
        additional_cancers: additionalCancers,
        ...(diagnosisId ? { diagnosis_id: diagnosisId } : {}),
        ...(visitDateIso ? { visit_date: visitDateIso } : {}),
        /* The exact selections, to refill the form from this row. */
        form_state: formState,
      };
      /* null = empty: clears the value when this visit's row is updated
         (e.g. a value unticked), left out when a new row is created. */
      const clearableFields: Record<string, unknown> = {
        clinical_stage: clinicalStageText || null,
        t_stage: primaryTStage || null,
        n_stage: primaryNStage || null,
        m_stage: primaryMStage || null,
        metastasis_sites: metastasisSites.length > 0 ? metastasisSites : null,
        pre_diagnosis: formData.preDiagnosis || null,
        disease_status: diseaseStatusText || null,
        laterality: primaryLaterality || null,
        site: siteText || null,
        grade: gradeText || null,
        grade_system: gradeSystems || null,
        score: scoreText || null,
        score_system: scoreSystems || null,
        diagnosis_date: diagnosisDateIso || null,
        progression_date: progressionDateIso || null,
        relapse_date: relapseDateIso || null,
        second_primary_date: secondPrimaryDateIso || null,
        notes: formData.notes.trim() || null,
      };

      let visitEncounterNo = "";
      let existingStagingDetailId = "";
      try {
        visitEncounterNo = await resolveVisitEncounterNo();
        existingStagingDetailId = visitEncounterNo
          ? await findStagingDetailForEncounter(
              resolvedPatientId,
              visitEncounterNo
            )
          : "";
      } catch (error) {
        console.error("Failed to resolve this visit's staging detail:", error);
      }

      /* Nothing changed since the staging detail the form was filled from
         (the patient's latest): keep using it. A change is recorded on
         this visit's own row - created on the visit's first change (a new
         staging_detail_id), updated on later ones - so earlier visits keep
         their diagnosis in the patient's history. */
      const baseline = baselineRef.current;
      const signature = formStateSignature(formState);
      const unchanged = baseline !== null && baseline.signature === signature;

      let stagingDetailId = unchanged
        ? baseline.stagingDetailId
        : existingStagingDetailId;

      if (!unchanged && existingStagingDetailId) {
        try {
          await API.put(
            `/oncology/staging-details/${existingStagingDetailId}`,
            { ...stagingFields, ...clearableFields }
          );
        } catch (updateError: any) {
          if (updateError?.response?.status === 404) {
            stagingDetailId = "";
          } else {
            throw updateError;
          }
        }
      }

      if (!stagingDetailId) {
        const response = await API.post<{
          success: boolean;
          data: { staging_detail_id: string };
        }>("/oncology/staging-details", {
          patient_id: resolvedPatientId,
          ...(visitEncounterNo ? { encounter_no: visitEncounterNo } : {}),
          ...stagingFields,
          ...Object.fromEntries(
            Object.entries(clearableFields).filter(([, value]) => value !== null)
          ),
        });
        stagingDetailId = response.data.data?.staging_detail_id ?? "";
      }

      if (stagingDetailId) {
        baselineRef.current = {
          stagingDetailId,
          ownVisit: unchanged ? baseline.ownVisit : true,
          signature,
        };
      }

      if (stagingDetailId) {
        localStorage.setItem(
          `hms_staging_detail_id_${resolvedPatientId}`,
          JSON.stringify({ staging_detail_id: stagingDetailId })
        );

        /* When this patient already has a chemotherapy plan, re-link it to
           the new diagnosis so downstream viewers (patient-details) show
           the updated cancer type / stage immediately. */
        try {
          const existingPlan = await API.get<{
            success: boolean;
            data: { chemotherapy_plan_id: string; treatment_status?: string | null } | null;
          }>("/chemotherapy/plans/latest-for-patient", {
            params: {
              patient_id: resolvedPatientId,
            },
          });
          const existingPlanId =
            existingPlan.data.data?.chemotherapy_plan_id;
          /* A closed course keeps the diagnosis it was treated for. */
          if (existingPlanId && !isChemoPlanClosed(existingPlan.data.data)) {
            /* The server refreshes the plan's cancer type / subtype /
               stage from this staging detail. */
            await API.put(`/chemotherapy/plans/${existingPlanId}`, {
              staging_detail_id: stagingDetailId,
            });
          }
        } catch (planSyncError: any) {
          console.error(
            "Failed to sync new diagnosis onto existing plan:",
            planSyncError?.response?.data?.message ?? planSyncError?.message
          );
        }
      }

      /* This visit's Investigation Results, saved with the diagnosis. Every
         shown test is sent - a cleared one is removed for this visit. */
      const visitHasSavedResults = investigationHistory.some(
        (row) => row.encounter_no === (visitEncounterNo || investigationVisitNo)
      );
      if (enteredInvestigations.length > 0 || visitHasSavedResults) {
        const resultsVisitNo = visitEncounterNo || investigationVisitNo;
        if (!resultsVisitNo) {
          setDiagnosisError(
            "No active encounter was found for this visit, so the investigation results could not be saved."
          );
          return;
        }
        const savedResults = await API.put<{
          success: boolean;
          data: InvestigationResultRecord[];
        }>("/oncology/investigation-results", {
          patient_id: resolvedPatientId,
          encounter_no: resultsVisitNo,
          ...(stagingDetailId ? { staging_detail_id: stagingDetailId } : {}),
          report_date:
            toIsoDate(investigationReportDate) ||
            toIsoDate(visitDate) ||
            new Date().toISOString().slice(0, 10),
          results: shownInvestigationParameters.map((parameter) => {
            const raw = (
              formData.investigationResults[parameter.parameter_id] ?? ""
            ).trim();
            return {
              parameter_id: parameter.parameter_id,
              value: parameter.input_type === "DATE" && raw ? toIsoDate(raw) : raw,
            };
          }),
        });
        setInvestigationHistory((previous) => [
          ...previous.filter((row) => row.encounter_no !== resultsVisitNo),
          ...(savedResults.data.data ?? []),
        ]);
      }

      onNext?.();
    } catch (error: any) {
      console.error("Failed to save oncology staging details:", error);
      setDiagnosisError(
        error?.response?.data?.message ||
          "Failed to save the oncology diagnosis. Please try again."
      );
    } finally {
      setSavingDiagnosis(false);
    }
  };

  const handleBack = () => {
    window.history.back();
  };

  const content = (
    <section className="flex w-full flex-1 flex-col">
      <h2 className="mb-8 text-2xl font-bold text-[#334155]">
        Diagnosis
      </h2>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          handleNext();
        }}
        className="space-y-8"
      >
        {/* Four Column Fields */}
        <div className="grid grid-cols-1 gap-x-5 gap-y-6 sm:grid-cols-3 lg:grid-cols-3">
          {/* Date of Diagnosis */}
          <DiagnosisDateField
            id="diagnosisDate"
            title="Date of Diagnosis"
            value={formData.diagnosisDate}
            onChange={(value) =>
              setFormData((previous) => ({ ...previous, diagnosisDate: value }))
            }
          />

          {/* Date of Progression */}
          <DiagnosisDateField
            id="progressionDate"
            title="Date of Progression"
            value={formData.progressionDate}
            onChange={(value) =>
              setFormData((previous) => ({
                ...previous,
                progressionDate: value,
              }))
            }
          />

          {/* Date of Relapse */}
          <DiagnosisDateField
            id="relapseDate"
            title="Date of Relapse"
            value={formData.relapseDate}
            onChange={(value) =>
              setFormData((previous) => ({ ...previous, relapseDate: value }))
            }
          />

          {/* Date of Second Primary */}
          <DiagnosisDateField
            id="secondPrimaryDate"
            title="Date of Second Primary"
            value={formData.secondPrimaryDate}
            onChange={(value) =>
              setFormData((previous) => ({
                ...previous,
                secondPrimaryDate: value,
              }))
            }
          />

          {/* Pre Diagnosis */}
          <div>
            <label
              htmlFor="preDiagnosis"
              className="mb-2 block text-sm font-semibold text-gray-600"
            >
              Pre Diagnosis
            </label>

            <div className="relative">
              <input
                id="preDiagnosis"
                name="preDiagnosis"
                type="text"
                value={formData.preDiagnosis}
                onChange={handleChange}
                placeholder="Type the pre diagnosis..."
                className="block w-full rounded-md border-gray-300 bg-white py-3 pl-4 pr-10 text-sm text-gray-800 focus:border-[#1d4ed8] focus:outline-none focus:ring-[#1d4ed8]"
              />
            </div>
          </div>


          {/* Disease Status */}
          <DiagnosisCheckboxSelect
            title="Disease Status"
            options={diseaseStatusOptions}
            value={formData.diseaseStatus}
            onChange={(value) =>
              setFormData((previous) => ({
                ...previous,
                diseaseStatus: value,
              }))
            }
            placeholder="Select Disease Status"
            onAdd={handleAddDiseaseStatus}
            displayValue={
              formData.diseaseStatus
                ? labelOf("diseaseStatus", formData.diseaseStatus)
                : ""
            }
            onEditValue={(text) =>
              setValueEdit("diseaseStatus", formData.diseaseStatus, text)
            }
          />

          {/* Cancer Type */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-600">
              Cancer Type
            </label>

            <MultiSelectDropdown
              options={cancerTypes.map((cancerType) => ({
                label: cancerType.cancer_type,
                value: cancerType.cancer_type,
              }))}
              value={selectedCancerTypes}
              onValueChange={handleTypesChange}
              placeholder="Select Cancer Type"
            />
          </div>

          {/* Laterality - only when a selected cancer type has one */}
          {lateralityTypes.length > 0 && (
            <DiagnosisCheckboxList
              title="Laterality"
              groups={lateralityGroups}
              selected={orderByType(lateralitySelected)}
              onToggle={handleMultiToggle("laterality")}
            />
          )}

          {/* Body Site */}
          <DiagnosisCheckboxList
            title="Body Site"
            groups={bodySiteGroups}
            selected={orderByType(formData.bodySite)}
            onToggle={handleMultiToggle("bodySite")}
            loading={diagnosisLoading}
            addTypes={optionTypes}
            onAdd={handleAddBodySite}
            {...editProps("bodySite")}
          />

          {/* Histopathology */}
          <DiagnosisCheckboxList
            title="Histopathology"
            groups={buildCheckboxGroups(
              subtypes.map((item) => ({
                value: item.subtype_name,
                cancerType: item.cancerType,
              }))
            )}
            selected={orderByType(formData.subType)}
            onToggle={handleSubtypeToggle}
            loading={diagnosisLoading}
            addTypes={optionTypes}
            onAdd={handleAddSubtype}
            {...editProps("subType")}
          />

          {/* Histomorphology 
          <div>
            <label
              htmlFor="histomorphology"
              className="mb-2 block text-sm font-semibold text-gray-600"
            >
              Histomorphology
            </label>

            <div className="relative">
              <select
                id="histomorphology"
                name="histomorphology"
                value={formData.histomorphology}
                onChange={handleChange}
                className="block w-full appearance-none rounded-md border-gray-300 bg-white py-3 pl-4 pr-10 text-sm text-gray-800 focus:border-[#1d4ed8] focus:outline-none focus:ring-[#1d4ed8]"
              >
              </select>

              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-500">
                <ChevronDownIcon />
              </div>
            </div>
          </div>*/}

          {/* Cancer Stage */}
          <DiagnosisCheckboxList
            title="Cancer Stage"
            groups={buildCheckboxGroups(stageLabels)}
            selected={orderByType(formData.cancerStage)}
            onToggle={handleMultiToggle("cancerStage")}
            loading={diagnosisLoading}
            addTypes={optionTypes}
            onAdd={handleAddStage}
            {...editProps("cancerStage")}
          />

          {/* Grade */}
          <DiagnosisCheckboxList
            title="Grade"
            groups={gradeGroups}
            selected={orderByType(formData.grade)}
            onToggle={handleMultiToggle("grade")}
            loading={diagnosisLoading}
            addTypes={optionTypes}
            onAdd={handleAddGrade}
            systemDefault={gradeSystemDefault}
            {...editProps("grade")}
          />

          {/* Score */}
          <DiagnosisScoreList
            title="Score"
            options={scoreOptions}
            selected={orderByType(formData.score)}
            onToggle={handleScoreToggle}
            addTypes={optionTypes}
            onAdd={handleAddScore}
            systemDefault={scoreSystemDefault}
            loading={diagnosisLoading}
            {...editProps("score")}
          />

          {/* TNM Staging */}
          <div className="col-span-full grid grid-cols-1 gap-x-5 gap-y-6 sm:grid-cols-3 lg:grid-cols-3">
            {/* T Stage */}
            <DiagnosisCheckboxList
              title="T Stage"
              groups={buildCheckboxGroups(tOptions)}
              selected={orderByType(formData.tStage)}
              onToggle={handleMultiToggle("tStage")}
              loading={diagnosisLoading}
              addTypes={optionTypes}
              onAdd={handleAddTnm("T")}
              {...editProps("tStage")}
            />

{/* N Stage */}
            <DiagnosisCheckboxList
              title="N Stage"
              groups={buildCheckboxGroups(nOptions)}
              selected={orderByType(formData.nStage)}
              onToggle={handleMultiToggle("nStage")}
              loading={diagnosisLoading}
              addTypes={optionTypes}
              onAdd={handleAddTnm("N")}
              {...editProps("nStage")}
            />

            {/* M Stage */}
            <DiagnosisCheckboxList
              title="M Stage"
              groups={buildCheckboxGroups(mOptions)}
              selected={orderByType(formData.mStage)}
              onToggle={handleMultiToggle("mStage")}
              loading={diagnosisLoading}
              addTypes={optionTypes}
              onAdd={handleAddTnm("M")}
              {...editProps("mStage")}
            />
          </div>

          {/* Metastasis Sites - shown when M stage is M1+ */}
          {formData.mStage.some((stage) =>
            labelOf("mStage", stage).trim().toUpperCase().startsWith("M1")
          ) && (
            <div className="col-span-full">
              <label className="mb-2 block text-sm font-semibold text-gray-600">
                Metastasis Sites
              </label>
              <MultiSelectDropdown
                options={[
                  "Bone", "Liver", "Lung", "Brain", "Lymph Nodes",
                  "Adrenal Gland", "Peritoneum", "Pleura", "Skin",
                  "Contralateral Adrenal", "Ovary", "Other"
                ]}
                value={metastasisSites}
                onValueChange={setMetastasisSites}
                placeholder="Select metastasis site(s)"
              />
            </div>
          )}

          {/* ICD Code */}
          <div>
            <label
              htmlFor="icdCode"
              className="mb-2 block text-sm font-semibold text-gray-600"
            >
              ICD Code
            </label>

            <input
              id="icdCode"
              name="icdCode"
              type="text"
              value={formData.icdCode}
              onChange={handleChange}
              placeholder={
                diagnosisLoading
                  ? "Loading diagnosis"
                  : "Enter ICD code"
              }
              className="block w-full rounded-md border-gray-300 px-4 py-3 text-sm text-gray-800 shadow-sm focus:border-[#1d4ed8] focus:ring-[#1d4ed8]"
            />
          </div>

          {/* Survivor */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-600">
              Survivor
            </label>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-sm text-gray-700">
                <input
                  type="checkbox"
                  name="survivor"
                  checked={formData.survivor === "Yes"}
                  onChange={() =>
                    setFormData((previous) => ({
                      ...previous,
                      survivor: formData.survivor === "Yes" ? "" : "Yes",
                    }))
                  }
                  className="h-4 w-4 rounded border-gray-300 text-[#1d4ed8] accent-[#1d4ed8] focus:ring-[#1d4ed8]"
                />
                Yes
              </label>
              <label className="flex items-center gap-1.5 text-sm text-gray-700">
                <input
                  type="checkbox"
                  name="survivor"
                  checked={formData.survivor === "No"}
                  onChange={() =>
                    setFormData((previous) => ({
                      ...previous,
                      survivor: formData.survivor === "No" ? "" : "No",
                    }))
                  }
                  className="h-4 w-4 rounded border-gray-300 text-[#1d4ed8] accent-[#1d4ed8] focus:ring-[#1d4ed8]"
                />
                No
              </label>
            </div>
          </div>
        </div>

        {/* Diagnosis API Error */}
        {diagnosisError && (
          <div className="text-sm font-medium text-red-600">
            {diagnosisError}
          </div>
        )}

        {/* Notes */}
        <div className="pt-2">
          <label
            htmlFor="notes"
            className="mb-2 block text-sm font-semibold text-gray-600"
          >
            Notes
          </label>

          <VoiceToText
            value={formData.notes}
            onChange={(text) =>
              setFormData((previous) => ({ ...previous, notes: text }))
            }
            placeholder="Enter notes..."
          />
        </div>

        {/* Investigation Results - one numbered panel per selected cancer
            type (1 | 2 | 3), each with its own tests and ranges. */}
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-gray-100 pb-4">
            <div>
              <h3 className="text-base font-semibold text-gray-800">
                Investigation Results
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Test report values for this visit, per selected cancer type.
                Values outside the normal range are flagged.
              </p>
            </div>
            <div className="w-full sm:w-56">
              <DiagnosisDateField
                id="investigationReportDate"
                title="Report Date"
                value={formData.investigationReportDate || formData.diagnosisDate}
                onChange={(value) =>
                  setFormData((previous) => ({
                    ...previous,
                    investigationReportDate: value,
                  }))
                }
              />
            </div>
          </div>

          {investigationPanels.length === 0 ? (
            <p className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
              Select a cancer type to enter its investigation results.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {investigationPanels.map((panel) => (
                <div
                  key={panel.cancerType}
                  className="flex flex-col rounded-lg border border-gray-200 bg-slate-50/60"
                >
                  <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1d4ed8] text-xs font-bold text-white">
                      {panel.number}
                    </span>
                    <span className="text-sm font-semibold text-gray-800">
                      {panel.cancerType}
                    </span>
                  </div>

                  <div className="flex-1 space-y-5 p-4">
                    {panel.charts.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        No investigation tests are defined for {panel.cancerType}.
                      </p>
                    ) : (
                      panel.charts.map((chart) => (
                        <div key={chart.name}>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                            {chart.name}
                          </p>
                          <div className="space-y-3">
                            {chart.parameters.map(renderInvestigationInput)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {panel.history.length > 0 && (
                    <div className="border-t border-gray-200 px-4 py-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Previous results
                      </p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="text-gray-500">
                              <th className="whitespace-nowrap py-1 pr-3 font-semibold">
                                Date
                              </th>
                              {panel.parameters.map((parameter) => (
                                <th
                                  key={parameter.parameter_id}
                                  className="whitespace-nowrap py-1 pr-3 font-semibold"
                                >
                                  {parameter.parameter_name}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {panel.history.map((visit) => (
                              <tr key={visit.encounterNo}>
                                <td className="whitespace-nowrap py-1.5 pr-3 text-gray-700">
                                  {toPickedDateValue(visit.reportDate) || "—"}
                                </td>
                                {panel.parameters.map((parameter) => {
                                  const row = visit.values[parameter.parameter_id];
                                  return (
                                    <td
                                      key={parameter.parameter_id}
                                      className={`py-1.5 pr-3 ${
                                        row?.is_abnormal
                                          ? "font-semibold text-red-600"
                                          : "text-gray-700"
                                      }`}
                                    >
                                      {row
                                        ? parameter.input_type === "DATE"
                                          ? toPickedDateValue(row.value_text)
                                          : row.value_text
                                        : "—"}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Action */}
        <div className="mt-12 flex justify-end">
          <button
            type="submit"
            disabled={savingDiagnosis}
            className="inline-flex items-center justify-center rounded-md border border-transparent bg-[#1d4ed8] px-6 py-3 text-base font-medium text-white shadow-sm transition-colors hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <DoubleArrowIcon />
            <span className="ml-2">{savingDiagnosis ? "Saving..." : "Next"}</span>
          </button>
        </div>
      </form>
    </section>
  );

  if (embedded) {
    return content;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 font-sans text-[#334155] sm:p-6 lg:p-8">
      {/* Main App Container */}
      <div className="mx-auto flex min-h-[90vh] w-full max-w-7xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.1),0_1px_2px_0_rgba(0,0,0,0.06)]">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-gray-200 px-5 py-4 sm:px-8">
          {/* Back Button + Title */}
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleBack}
              aria-label="Go back"
              className="text-gray-500 transition-colors hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              <BackIcon />
            </button>

            <h1 className="text-xl font-bold text-gray-800">
              Patients
            </h1>
          </div>

          {/* Notification + User */}
          <div className="flex items-center gap-4 sm:gap-6">
            <BellNotificationButton size="md" />

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

        {/* Main Content */}
        <main className="flex flex-1 flex-col px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
          {/* Stepper */}
          <div className="mx-auto mb-12 w-full max-w-4xl sm:mb-16">
            <div className="relative flex justify-between">
              {/* Consultation */}
              <div className="flex w-1/3 flex-col items-center text-center">
                <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-gray-500">
                  <CheckIcon className="h-4 w-4 text-white" />
                </div>

                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-800 sm:text-xs sm:tracking-widest">
                  Consultation
                </span>
              </div>

              {/* Lab Report Review */}
              <div className="flex w-1/3 flex-col items-center text-center">
                <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-gray-500">
                  <CheckIcon className="h-4 w-4 text-white" />
                </div>

                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-800 sm:text-xs sm:tracking-widest">
                  Lab Report Review
                </span>
              </div>

              {/* Diagnosis */}
              <div className="relative flex w-1/3 flex-col items-center text-center">
                <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-[#22c55e]">
                  <CheckIcon className="h-4 w-4 text-white" />
                </div>

                <span className="mb-4 text-[10px] font-bold uppercase tracking-[0.18em] text-gray-800 sm:text-xs sm:tracking-widest">
                  Diagnosis
                </span>

                {/* Active Indicator */}
                <div className="absolute bottom-0 h-1.5 w-full translate-y-2 rounded-full bg-[#22c55e]" />
              </div>
            </div>
          </div>

          {content}
        </main>
      </div>
    </div>
  );
};

export default Diagnosis;
