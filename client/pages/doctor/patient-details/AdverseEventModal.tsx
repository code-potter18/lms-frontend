import React, { useRef, useState } from "react";
import {
  chemotherapyApi,
  type ChemoAdministrationDay,
  type ChemoAdverseEventPayload,
  type ChemoAdverseEventRecord,
  type ChemoAdverseSymptomFlag,
} from "@/api/chemotherapy.api";
import { useToast } from "@/hooks/use-toast";
import VoiceToText from "@/components/ui/voicetotext";
import { ComboInput } from "./ComboInput";
import { CTCAE_GRADES } from "./adminFormat";
import { ModalButton, ModalShell } from "./ModalShell";

/* ---------- reference lists ---------- */

const CATEGORIES = [
  "Gastrointestinal",
  "Hematologic",
  "Constitutional",
  "Dermatologic",
  "Neurologic",
  "Infection",
  "Infusion / Hypersensitivity",
  "Cardiac",
  "Renal / Hepatic",
  "Respiratory",
  "Other",
];

/* Common chemotherapy adverse events (CTCAE terms): picking one fills in
   its category and ticks the matching symptoms. Anything else is typed. */
const COMMON_EVENTS: { name: string; category: string; flags?: ChemoAdverseSymptomFlag[] }[] = [
  { name: "Nausea",                        category: "Gastrointestinal",            flags: ["nausea"] },
  { name: "Vomiting",                      category: "Gastrointestinal",            flags: ["vomiting"] },
  { name: "Diarrhea",                      category: "Gastrointestinal",            flags: ["diarrhea"] },
  { name: "Constipation",                  category: "Gastrointestinal",            flags: ["constipation"] },
  { name: "Oral mucositis",                category: "Gastrointestinal",            flags: ["mucositis"] },
  { name: "Anorexia",                      category: "Gastrointestinal" },
  { name: "Fever",                         category: "Constitutional",              flags: ["fever"] },
  { name: "Fatigue",                       category: "Constitutional",              flags: ["fatigue"] },
  { name: "Pain",                          category: "Constitutional",              flags: ["pain"] },
  { name: "Anemia",                        category: "Hematologic",                 flags: ["anemia"] },
  { name: "Neutropenia",                   category: "Hematologic",                 flags: ["neutropenia"] },
  { name: "Febrile neutropenia",           category: "Hematologic",                 flags: ["neutropenia", "fever"] },
  { name: "Thrombocytopenia",              category: "Hematologic",                 flags: ["thrombocytopenia"] },
  { name: "Bleeding",                      category: "Hematologic",                 flags: ["bleeding"] },
  { name: "Infection",                     category: "Infection",                   flags: ["infection"] },
  { name: "Peripheral sensory neuropathy", category: "Neurologic",                  flags: ["neuropathy"] },
  { name: "Alopecia",                      category: "Dermatologic",                flags: ["alopecia"] },
  { name: "Skin rash",                     category: "Dermatologic",                flags: ["skin_rash"] },
  { name: "Hand-foot syndrome",            category: "Dermatologic",                flags: ["skin_rash"] },
  { name: "Infusion related reaction",     category: "Infusion / Hypersensitivity" },
  { name: "Allergic reaction",             category: "Infusion / Hypersensitivity" },
  { name: "Anaphylaxis",                   category: "Infusion / Hypersensitivity" },
  { name: "Extravasation",                 category: "Infusion / Hypersensitivity" },
  { name: "Cardiac arrhythmia",            category: "Cardiac" },
  { name: "Acute kidney injury",           category: "Renal / Hepatic" },
  { name: "Hepatotoxicity",                category: "Renal / Hepatic" },
  { name: "Dyspnea",                       category: "Respiratory" },
  { name: "Pneumonitis",                   category: "Respiratory" },
  { name: "Others",                        category: "" },
];

const SYMPTOMS: { key: ChemoAdverseSymptomFlag; label: string }[] = [
  { key: "nausea",           label: "Nausea" },
  { key: "vomiting",         label: "Vomiting" },
  { key: "diarrhea",         label: "Diarrhea" },
  { key: "constipation",     label: "Constipation" },
  { key: "mucositis",        label: "Mucositis" },
  { key: "fever",            label: "Fever" },
  { key: "fatigue",          label: "Fatigue" },
  { key: "neuropathy",       label: "Neuropathy" },
  { key: "alopecia",         label: "Alopecia" },
  { key: "skin_rash",        label: "Skin Rash" },
  { key: "anemia",           label: "Anemia" },
  { key: "neutropenia",      label: "Neutropenia" },
  { key: "thrombocytopenia", label: "Thrombocytopenia" },
  { key: "infection",        label: "Infection" },
  { key: "bleeding",         label: "Bleeding" },
  { key: "pain",             label: "Pain" },
];

const SEVERITIES = CTCAE_GRADES.map(grade => grade.severity);

const INTERVENTIONS: { key: InterventionKey; label: string; hint: string }[] = [
  { key: "treatment_interrupted",      label: "Treatment interrupted",      hint: "Infusion paused, then resumed" },
  { key: "treatment_stopped",          label: "Treatment stopped",          hint: "Not continued for this day" },
  { key: "hospitalization_required",   label: "Hospitalization required",   hint: "Admitted or admission prolonged" },
  { key: "icu_required",               label: "ICU required",               hint: "Moved to intensive care" },
  { key: "emergency_medication_given", label: "Emergency medication given", hint: "Rescue drug administered" },
];

type InterventionKey =
  | "treatment_interrupted"
  | "treatment_stopped"
  | "hospitalization_required"
  | "icu_required"
  | "emergency_medication_given";

/* ---------- helpers ---------- */

const pad = (n: number) => String(n).padStart(2, "0");

/* Local "YYYY-MM-DDTHH:mm" for a datetime-local input. */
function localDateTime(date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const inputCls = (hasError = false) =>
  `w-full rounded-lg border ${hasError ? "border-red-300" : "border-slate-200"} bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-shadow focus:ring-2 focus:ring-blue-200`;

const reveal = "animate-in fade-in-0 slide-in-from-top-1 duration-200";

function Section({ icon, title, hint, children }: { icon: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <i className={`fa-solid ${icon} text-[11px] text-blue-500`} />
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{title}</h4>
        {hint && <span className="hidden text-[11px] text-slate-400 sm:inline">{hint}</span>}
        <div className="h-px flex-1 bg-slate-100" />
      </div>
      {children}
    </section>
  );
}

function Label({ htmlFor, required, optional, children }: { htmlFor?: string; required?: boolean; optional?: boolean; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-[10px] font-semibold text-slate-700">
      {children}
      {required && <span className="text-red-500"> *</span>}
      {optional && <span className="font-normal text-slate-400"> (optional)</span>}
    </label>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-[11px] font-medium text-red-500" data-field-error="true">{message}</p>;
}

function CheckCard({
  checked,
  onChange,
  label,
  hint,
  tone = "blue",
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
  tone?: "blue" | "red";
}) {
  const on = tone === "red" ? "border-red-200 bg-red-50/60" : "border-blue-200 bg-blue-50/60";
  return (
    <label
      className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 transition-colors ${checked ? on : "border-slate-200 bg-white hover:bg-slate-50"}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className={`mt-0.5 h-4 w-4 flex-shrink-0 rounded border-slate-300 ${tone === "red" ? "accent-red-600" : "accent-blue-600"}`}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-700">{label}</span>
        {hint && <span className="block text-[11px] text-slate-400">{hint}</span>}
      </span>
    </label>
  );
}

/* ---------- the modal ---------- */

type FormState = {
  name: string;
  category: string;
  eventDate: string;
  symptoms: ChemoAdverseSymptomFlag[];
  grade: string;
  severity: string;
  reactionGrade: string;
  description: string;
  interventions: Record<InterventionKey, boolean>;
  medicationGiven: string;
  doseModified: boolean;
  doseReduced: boolean;
  reductionPercentage: string;
  doseDelayed: boolean;
  delayDays: string;
  doctorAction: string;
  nursingAction: string;
  resolved: boolean;
  resolutionDate: string;
  remarks: string;
};

const emptyForm = (): FormState => ({
  name: "",
  category: "",
  eventDate: localDateTime(),
  symptoms: [],
  grade: "",
  severity: "",
  reactionGrade: "",
  description: "",
  interventions: {
    treatment_interrupted: false,
    treatment_stopped: false,
    hospitalization_required: false,
    icu_required: false,
    emergency_medication_given: false,
  },
  medicationGiven: "",
  doseModified: false,
  doseReduced: false,
  reductionPercentage: "",
  doseDelayed: false,
  delayDays: "",
  doctorAction: "",
  nursingAction: "",
  resolved: false,
  resolutionDate: "",
  remarks: "",
});

/* A recorded event back in the form's shape (edit mode). */
function formFromRecord(record: ChemoAdverseEventRecord): FormState {
  return {
    name: record.adverse_event_name ?? "",
    category: record.adverse_event_category ?? "",
    eventDate: record.event_date ? localDateTime(new Date(record.event_date)) : localDateTime(),
    symptoms: SYMPTOMS.filter(symptom => !!record[symptom.key]).map(symptom => symptom.key),
    grade: record.ctcae_grade ?? "",
    severity: record.severity ?? "",
    reactionGrade: record.reaction_grade ?? "",
    description: record.reaction_description ?? "",
    interventions: {
      treatment_interrupted: !!record.treatment_interrupted,
      treatment_stopped: !!record.treatment_stopped,
      hospitalization_required: !!record.hospitalization_required,
      icu_required: !!record.icu_required,
      emergency_medication_given: !!record.emergency_medication_given,
    },
    medicationGiven: record.medication_given ?? "",
    doseModified: !!record.dose_modified,
    doseReduced: !!record.dose_reduced,
    reductionPercentage: record.reduction_percentage == null ? "" : String(Number(record.reduction_percentage)),
    doseDelayed: !!record.dose_delayed,
    delayDays: record.delay_days == null ? "" : String(record.delay_days),
    doctorAction: record.doctor_action ?? "",
    nursingAction: record.nursing_action ?? "",
    resolved: !!record.resolved,
    resolutionDate: record.resolution_date ? record.resolution_date.slice(0, 10) : "",
    remarks: record.remarks ?? "",
  };
}

/* "Add Adverse" popup of the Administration tab: records an adverse event
   in chemotherapy_adverse_event against the cycle day on screen, or - given
   an `event` - edits that recorded event. */
export default function AdverseEventModal({
  day,
  event,
  dayLabel,
  onSaved,
  onClose,
}: {
  /* The cycle day a new event is recorded against. */
  day?: ChemoAdministrationDay | null;
  /* The recorded event to edit (edit mode). */
  event?: ChemoAdverseEventRecord | null;
  /* e.g. "Cycle 2 · Day 1 · 12-Oct-2026" */
  dayLabel: string;
  onSaved: (record: ChemoAdverseEventRecord) => void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const editing = !!event;
  const [form, setForm] = useState<FormState>(() => (event ? formFromRecord(event) : emptyForm()));
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  /* Auto-filled from the event name / grade until the user edits them
     (an edited event keeps what was recorded). */
  const [categoryEdited, setCategoryEdited] = useState(editing);
  const [severityEdited, setSeverityEdited] = useState(editing);
  const bodyRef = useRef<HTMLDivElement>(null);
  const pristine = useRef(JSON.stringify(form));

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  /* ---------- auto-fill ---------- */

  const changeName = (name: string) => {
    const known = COMMON_EVENTS.find(event => event.name.toLowerCase() === name.trim().toLowerCase());
    setForm(prev => ({
      ...prev,
      name,
      category: known && known.category && !categoryEdited ? known.category : prev.category,
      symptoms: known?.flags
        ? [...prev.symptoms, ...known.flags.filter(flag => !prev.symptoms.includes(flag))]
        : prev.symptoms,
    }));
  };

  const changeGrade = (grade: string) => {
    const severity = CTCAE_GRADES.find(g => g.value === grade)?.severity ?? "";
    setForm(prev => ({
      ...prev,
      grade,
      severity: severityEdited && prev.severity ? prev.severity : severity,
    }));
  };

  const toggleSymptom = (key: ChemoAdverseSymptomFlag) =>
    setForm(prev => ({
      ...prev,
      symptoms: prev.symptoms.includes(key)
        ? prev.symptoms.filter(value => value !== key)
        : [...prev.symptoms, key],
    }));

  /* ---------- validation ---------- */

  const now = new Date();
  const today = localDateTime(now).slice(0, 10);
  const eventDay = form.eventDate.slice(0, 10);
  const errors: Partial<Record<keyof FormState, string>> = {};
  if (!form.name.trim()) errors.name = "Event name is required";
  if (!form.eventDate) errors.eventDate = "Event date & time is required";
  else if (new Date(form.eventDate).getTime() > now.getTime() + 60_000) errors.eventDate = "Event date can't be in the future";
  if (!form.grade) errors.grade = "Select the CTCAE grade";
  if (form.interventions.emergency_medication_given && !form.medicationGiven.trim()) {
    errors.medicationGiven = "Enter the medication given";
  }
  if (form.doseReduced) {
    const pct = Number(form.reductionPercentage);
    if (form.reductionPercentage === "" || !Number.isFinite(pct) || pct <= 0 || pct > 100) {
      errors.reductionPercentage = "Enter a reduction between 1 and 100 %";
    }
  }
  if (form.doseDelayed) {
    const days = Number(form.delayDays);
    if (form.delayDays === "" || !Number.isInteger(days) || days < 1) errors.delayDays = "Enter the delay in whole days (1 or more)";
  }
  if (form.resolved) {
    if (!form.resolutionDate) errors.resolutionDate = "Enter the resolution date";
    else if (form.resolutionDate < eventDay) errors.resolutionDate = "Can't be before the event date";
    else if (form.resolutionDate > today) errors.resolutionDate = "Can't be in the future";
  }
  const shown = (key: keyof FormState) => (touched ? errors[key] : undefined);
  const hasErrors = Object.keys(errors).length > 0;

  /* ---------- close / save ---------- */

  const requestClose = () => {
    if (saving) return;
    if (JSON.stringify(form) !== pristine.current && !window.confirm(editing ? "Discard your changes to this adverse event?" : "Discard this adverse event? The details you entered will be lost.")) {
      return;
    }
    onClose();
  };

  const submit = async () => {
    setTouched(true);
    if (saving) return;
    if (hasErrors) {
      /* Bring the first problem into view once the messages render. */
      requestAnimationFrame(() =>
        bodyRef.current
          ?.querySelector('[data-field-error="true"]')
          ?.closest("[data-field]")
          ?.scrollIntoView({ behavior: "smooth", block: "center" })
      );
      return;
    }

    const text = (value: string) => value.trim() || null;
    const fields: Omit<ChemoAdverseEventPayload, "plan_order_id" | "cycle_day"> = {
      event_date: new Date(form.eventDate).toISOString(),
      adverse_event_name: form.name.trim(),
      adverse_event_category: text(form.category),
      ...Object.fromEntries(SYMPTOMS.map(symptom => [symptom.key, form.symptoms.includes(symptom.key)])),
      ctcae_grade: form.grade,
      reaction_grade: form.reactionGrade || null,
      severity: form.severity || null,
      reaction_description: text(form.description),
      ...form.interventions,
      medication_given: form.interventions.emergency_medication_given ? text(form.medicationGiven) : null,
      dose_modified: form.doseModified || form.doseReduced,
      dose_reduced: form.doseReduced,
      reduction_percentage: form.doseReduced ? Number(form.reductionPercentage) : null,
      dose_delayed: form.doseDelayed,
      delay_days: form.doseDelayed ? Number(form.delayDays) : null,
      doctor_action: text(form.doctorAction),
      nursing_action: text(form.nursingAction),
      resolved: form.resolved,
      resolution_date: form.resolved ? form.resolutionDate : null,
      remarks: text(form.remarks),
    };

    setSaving(true);
    try {
      const response = event
        ? await chemotherapyApi.updateAdverseEvent(event.adverse_event_id, fields)
        : day
          ? await chemotherapyApi.recordAdverseEvent(day.chemotherapy_cycle_id, {
              ...fields,
              plan_order_id: day.plan_order_id,
              cycle_day: day.cycle_day,
            })
          : null;
      if (!response) throw new Error("No cycle day to record the event against.");
      onSaved(response.data.data);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Couldn't save the adverse event",
        description: error?.response?.data?.message || error?.message || "Please try again.",
      });
      setSaving(false);
    }
  };

  const selectedGrade = CTCAE_GRADES.find(grade => grade.value === form.grade);

  return (
    <ModalShell
      icon={editing ? "fa-pen-to-square" : "fa-triangle-exclamation"}
      tone="red"
      title={editing ? "Edit Adverse Event" : "Add Adverse Event"}
      subtitle={
        <>
          <span className="font-semibold text-blue-700">{dayLabel}</span>
          <span className="hidden sm:inline">
            {editing ? " · Changes are kept in the audit log" : " · Recorded against this treatment day"}
          </span>
        </>
      }
      busy={saving}
      onClose={requestClose}
      bodyRef={bodyRef}
      initialFocus="#adverse-event-name"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="hidden text-[11px] text-slate-400 sm:block">
            <i className="fa-solid fa-circle-info mr-1" />
            {editing
              ? "The cycle day and the linked physician stay as recorded."
              : "You are recorded as the reporter; the treating physician is linked automatically."}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <ModalButton onClick={requestClose} disabled={saving}>Cancel</ModalButton>
            <ModalButton variant="danger" icon="fa-floppy-disk" busy={saving} disabled={saving} onClick={() => void submit()}>
              {editing ? "Update Adverse Event" : "Save Adverse Event"}
            </ModalButton>
          </div>
        </div>
      }
    >
      <div className="space-y-6">

          <Section icon="fa-notes-medical" title="Event Details">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2" data-field>
                <Label htmlFor="adverse-event-name" required>Adverse Event</Label>
                <ComboInput
                  id="adverse-event-name"
                  value={form.name}
                  onChange={changeName}
                  options={COMMON_EVENTS.map(event => event.name)}
                  placeholder="Select or type the adverse event..."
                  hasError={!!shown("name")}
                  filter
                  maxLength={100}
                />
                <FieldError message={shown("name")} />
              </div>
              <div data-field>
                <Label htmlFor="adverse-event-category" optional>Category</Label>
                <ComboInput
                  id="adverse-event-category"
                  value={form.category}
                  onChange={value => { setCategoryEdited(true); set("category", value); }}
                  options={CATEGORIES}
                  placeholder="Select a category..."
                  filter
                  maxLength={100}
                  freeTextOption=""
                />
              </div>
              <div data-field>
                <Label htmlFor="adverse-event-date" required>Event Date & Time</Label>
                <input
                  id="adverse-event-date"
                  type="datetime-local"
                  value={form.eventDate}
                  max={localDateTime(now)}
                  onChange={e => set("eventDate", e.target.value)}
                  className={inputCls(!!shown("eventDate"))}
                />
                <FieldError message={shown("eventDate")} />
              </div>
            </div>
          </Section>

          <Section icon="fa-head-side-cough" title="Symptoms" hint="Tick everything the patient presented with">
            <div className="flex flex-wrap gap-2">
              {SYMPTOMS.map(symptom => {
                const on = form.symptoms.includes(symptom.key);
                return (
                  <button
                    key={symptom.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleSymptom(symptom.key)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-medium transition-colors ${
                      on
                        ? "border-blue-300 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <i className={`fa-solid ${on ? "fa-check" : "fa-plus"} text-[9px]`} />
                    {symptom.label}
                  </button>
                );
              })}
            </div>
          </Section>

          <Section icon="fa-chart-simple" title="Grading">
            <div data-field>
              <Label required>CTCAE Grade</Label>
              <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="CTCAE grade">
                {CTCAE_GRADES.map(grade => {
                  const on = form.grade === grade.value;
                  return (
                    <button
                      key={grade.value}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      title={grade.hint}
                      onClick={() => changeGrade(grade.value)}
                      className={`flex flex-col items-center rounded-lg border px-1 py-2 transition-all active:scale-[0.97] ${
                        on ? `${grade.active} shadow-sm` : `${shown("grade") ? "border-red-300" : "border-slate-200"} bg-white text-slate-600 hover:bg-slate-50`
                      }`}
                    >
                      <span className="text-sm font-bold leading-none">G{grade.value}</span>
                      <span className={`mt-1 hidden text-[10px] leading-none sm:block ${on ? "text-white/90" : "text-slate-400"}`}>
                        {grade.severity}
                      </span>
                    </button>
                  );
                })}
              </div>
              {selectedGrade && <p className="mt-1 text-[11px] text-slate-500">{selectedGrade.hint}</p>}
              <FieldError message={shown("grade")} />
            </div>

            {Number(form.grade) >= 3 && (
              <div className={`flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[10px] text-red-700 ${reveal}`}>
                <i className="fa-solid fa-circle-exclamation mt-0.5" />
                <span>
                  Grade {form.grade} event — inform the treating physician and review whether this day's treatment
                  should be interrupted or stopped.
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div data-field>
                <Label htmlFor="adverse-event-severity" optional>Severity</Label>
                <select
                  id="adverse-event-severity"
                  value={form.severity}
                  onChange={e => { setSeverityEdited(true); set("severity", e.target.value); }}
                  className={inputCls()}
                >
                  <option value="">Select severity</option>
                  {SEVERITIES.map(severity => <option key={severity} value={severity}>{severity}</option>)}
                </select>
              </div>
              <div data-field>
                <Label htmlFor="adverse-event-reaction-grade" optional>Infusion Reaction Grade</Label>
                <select
                  id="adverse-event-reaction-grade"
                  value={form.reactionGrade}
                  onChange={e => set("reactionGrade", e.target.value)}
                  className={inputCls()}
                >
                  <option value="">Not applicable</option>
                  {CTCAE_GRADES.map(grade => <option key={grade.value} value={grade.value}>Grade {grade.value}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2" data-field>
                <Label optional>Description</Label>
                <VoiceToText
                  value={form.description}
                  onChange={value => set("description", value)}
                  placeholder="Describe the reaction - onset, duration, what the patient reported..."
                  rows={3}
                />
              </div>
            </div>
          </Section>

          <Section icon="fa-kit-medical" title="Interventions">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {INTERVENTIONS.map(item => (
                <CheckCard
                  key={item.key}
                  checked={form.interventions[item.key]}
                  onChange={checked => set("interventions", { ...form.interventions, [item.key]: checked })}
                  label={item.label}
                  hint={item.hint}
                  tone="red"
                />
              ))}
            </div>
            {form.interventions.emergency_medication_given && (
              <div className={reveal} data-field>
                <Label htmlFor="adverse-event-medication" required>Medication Given</Label>
                <input
                  id="adverse-event-medication"
                  type="text"
                  value={form.medicationGiven}
                  onChange={e => set("medicationGiven", e.target.value)}
                  placeholder="e.g. Inj. Hydrocortisone 100 mg IV, Inj. Pheniramine 22.75 mg IV"
                  className={inputCls(!!shown("medicationGiven"))}
                />
                <FieldError message={shown("medicationGiven")} />
              </div>
            )}
          </Section>

          <Section icon="fa-prescription-bottle-medical" title="Dose Modification">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <CheckCard
                checked={form.doseModified || form.doseReduced}
                onChange={checked => set("doseModified", checked)}
                label="Dose modified"
                hint={form.doseReduced ? "Implied by the dose reduction" : undefined}
              />
              <CheckCard checked={form.doseReduced} onChange={checked => set("doseReduced", checked)} label="Dose reduced" />
              <CheckCard checked={form.doseDelayed} onChange={checked => set("doseDelayed", checked)} label="Dose delayed" />
            </div>
            {(form.doseReduced || form.doseDelayed) && (
              <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${reveal}`}>
                {form.doseReduced && (
                  <div data-field>
                    <Label htmlFor="adverse-event-reduction" required>Reduction (%)</Label>
                    <div className="relative">
                      <input
                        id="adverse-event-reduction"
                        type="number"
                        inputMode="decimal"
                        min={1}
                        max={100}
                        step={0.5}
                        value={form.reductionPercentage}
                        onChange={e => set("reductionPercentage", e.target.value)}
                        placeholder="e.g. 20"
                        className={`${inputCls(!!shown("reductionPercentage"))} pr-8`}
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] text-slate-400">%</span>
                    </div>
                    <FieldError message={shown("reductionPercentage")} />
                  </div>
                )}
                {form.doseDelayed && (
                  <div data-field>
                    <Label htmlFor="adverse-event-delay" required>Delay (days)</Label>
                    <input
                      id="adverse-event-delay"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={1}
                      value={form.delayDays}
                      onChange={e => set("delayDays", e.target.value)}
                      placeholder="e.g. 7"
                      className={inputCls(!!shown("delayDays"))}
                    />
                    <FieldError message={shown("delayDays")} />
                  </div>
                )}
              </div>
            )}
          </Section>

          <Section icon="fa-user-doctor" title="Actions Taken">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div data-field>
                <Label htmlFor="adverse-event-doctor-action" optional>Doctor Action</Label>
                <textarea
                  id="adverse-event-doctor-action"
                  rows={3}
                  value={form.doctorAction}
                  onChange={e => set("doctorAction", e.target.value)}
                  placeholder="Orders given by the physician..."
                  className={`${inputCls()} resize-none`}
                />
              </div>
              <div data-field>
                <Label htmlFor="adverse-event-nursing-action" optional>Nursing Action</Label>
                <textarea
                  id="adverse-event-nursing-action"
                  rows={3}
                  value={form.nursingAction}
                  onChange={e => set("nursingAction", e.target.value)}
                  placeholder="Care provided by the nursing team..."
                  className={`${inputCls()} resize-none`}
                />
              </div>
            </div>
          </Section>

          <Section icon="fa-circle-check" title="Resolution">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <CheckCard
                checked={form.resolved}
                onChange={checked => set("resolved", checked)}
                label="Event resolved"
                hint="Leave unticked while the event is ongoing"
              />
              {form.resolved && (
                <div className={reveal} data-field>
                  <Label htmlFor="adverse-event-resolution" required>Resolution Date</Label>
                  <input
                    id="adverse-event-resolution"
                    type="date"
                    value={form.resolutionDate}
                    min={eventDay || undefined}
                    max={today}
                    onChange={e => set("resolutionDate", e.target.value)}
                    className={inputCls(!!shown("resolutionDate"))}
                  />
                  <FieldError message={shown("resolutionDate")} />
                </div>
              )}
            </div>
            <div data-field>
              <Label htmlFor="adverse-event-remarks" optional>Remarks</Label>
              <textarea
                id="adverse-event-remarks"
                rows={3}
                maxLength={500}
                value={form.remarks}
                onChange={e => set("remarks", e.target.value)}
                placeholder="Any other clinical notes..."
                className={`${inputCls()} resize-none`}
              />
              <p className="text-right text-[10px] text-slate-400">{form.remarks.length}/500</p>
            </div>
          </Section>
      </div>
    </ModalShell>
  );
}
