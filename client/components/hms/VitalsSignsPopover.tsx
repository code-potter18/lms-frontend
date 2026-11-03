import { useEffect, useState } from "react";
import {
  Loader2,
  Droplet,
  HeartPulse,
  Thermometer,
  Weight,
  Ruler,
  ThumbsUp,
  Activity,
  Droplet as BloodDrop,
  Clock,
  History,
  Copy,
  Pencil,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { encounterApi, type PatientHistoryPayload, type VitalsLogEntry } from "@/api/encounter.api";

export type TemperatureUnit = "C" | "F";
export type WeightUnit = "kg" | "lb";
export type HeightUnit = "cm" | "in";

interface VitalsSignsPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointmentId?: string;
  /**
   * Looks the encounter up directly instead of via appointmentId -- for
   * flows (e.g. IPD) where the encounter isn't tied to an appointment.
   * When set, this takes priority over appointmentId.
   */
  encounterNo?: string;
  patientId?: string;
  encounterType?: string;
  /** Fired after vitals were successfully created/updated so parents can refresh their lists. */
  onSaved?: () => void;
}

type Tone = "danger" | "warning" | "success" | "purple" | "accent";

const TONE_BADGE: Record<Tone, string> = {
  danger: "bg-[#FBEAE9] text-[#B5433E]",
  warning: "bg-[#FCF1DD] text-[#A8720F]",
  success: "bg-[#E7F4EE] text-[#2E7D5B]",
  purple: "bg-[#EEECF7] text-[#5A4E9C]",
  accent: "bg-[#E6F1F5] text-[#1D6E8C]",
};

const ICON_SIZE = 18;
const ICON_BG_SIZE = 32;

const INPUT_CLASS =
  "h-[34px] w-full min-w-0 rounded-lg border border-[#E2E6E8] bg-[#FBFCFD] px-2.5 text-[13px] font-medium text-[#1C2B33] outline-none focus:border-[#1D6E8C] focus:ring-[2px] focus:ring-[#E6F1F5]";

const SELECT_CLASS =
  "h-[34px] shrink-0 rounded-lg border border-[#E2E6E8] bg-[#FBFCFD] px-2 text-[12px] font-medium text-[#5B6B73] outline-none focus:border-[#1D6E8C]";

const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;
const numOrNull = (s: string) => {
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : null;
};
const valueToInput = (v: number | string | null | undefined): string =>
  v === null || v === undefined ? "" : String(v);
const fToC = (f: number) => ((f - 32) * 5) / 9;
const cToF = (c: number) => (c * 9) / 5 + 32;
const lbToKg = (lb: number) => lb / 2.20462;
const kgToLb = (kg: number) => kg * 2.20462;
const inToCm = (inch: number) => inch * 2.54;
const cmToIn = (cm: number) => cm / 2.54;

function FieldCard({
  tone,
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  tone: Tone;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[#E2E6E8] bg-white p-3">
      <div className="mb-2 flex items-center gap-2">
        <div
          className={`flex size-[${ICON_BG_SIZE}px] shrink-0 items-center justify-center rounded-full ${TONE_BADGE[tone]}`}
        >
          <Icon className="w-[20px] h-[20px]" />
        </div>
        <div>
          <p className="text-[12px] font-semibold leading-tight text-[#1C2B33]">{title}</p>
          <p className="text-[10px] leading-tight text-[#93A1A8]">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function VitalLine({
  tone,
  label,
  value,
  unit,
  icon: Icon,
}: {
  tone: Tone;
  label: string;
  value: string;
  unit?: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
}) {
  return (
    <div className="mb-1.5 flex items-center gap-2.5 rounded-[8px] bg-[#FAFBFC] px-2.5 py-2 last:mb-0">
      <div
        className={`flex size-[24px] shrink-0 items-center justify-center rounded-full ${TONE_BADGE[tone]}`}
      >
        <Icon className="w-[12px] h-[12px]" />
      </div>
      <div className="flex-1 text-[12px] text-[#5B6B73]">{label}</div>
      <div className="text-[13px] font-semibold text-[#1C2B33]">
        {value}
        {unit ? <span className="ml-1 text-[10px] font-normal text-[#93A1A8]">{unit}</span> : null}
      </div>
    </div>
  );
}

const VitalsSignsPopover = ({
  open,
  onOpenChange,
  appointmentId,
  encounterNo,
  patientId,
  encounterType,
  onSaved,
}: VitalsSignsPopoverProps) => {
  const { toast } = useToast();
  const isIPD = encounterType === "Inpatient (IPD)";

  const [bpSystolic, setBpSystolic] = useState("");
  const [bpDiastolic, setBpDiastolic] = useState("");
  const [heartRate, setHeartRate] = useState("");
  const [respiratoryRate, setRespiratoryRate] = useState("");
  const [spo2, setSpo2] = useState("");
  const [bloodSugar, setBloodSugar] = useState("");

  const [temperature, setTemperature] = useState("");
  const [tempUnit, setTempUnit] = useState<TemperatureUnit>("C");
  const [weight, setWeight] = useState("");
  const [weightUnit, setWeightUnit] = useState<WeightUnit>("kg");
  const [height, setHeight] = useState("");
  const [heightUnit, setHeightUnit] = useState<HeightUnit>("cm");

  const [pain, setPain] = useState(0);
  const [remarks, setRemarks] = useState("");
  const [vitalsHistory, setVitalsHistory] = useState<VitalsLogEntry[]>([]);
  const [lastRecordedSnapshot, setLastRecordedSnapshot] = useState<any>(null);
  const [showHistorySection, setShowHistorySection] = useState(false);
  const [editingEntry, setEditingEntry] = useState<VitalsLogEntry | null>(null);

  const [hasExisting, setHasExisting] = useState(false);
  const [existingEncounterNo, setExistingEncounterNo] = useState("");
  const [isLoadingVitals, setIsLoadingVitals] = useState(false);

  const [summaryOpen, setSummaryOpen] = useState(false);
  const [recordedAt, setRecordedAt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || submitting) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (summaryOpen) setSummaryOpen(false);
      else onOpenChange(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, summaryOpen, submitting, onOpenChange]);

  useEffect(() => {
    if (!open) {
      setSummaryOpen(false);
      setShowHistorySection(false);
      setEditingEntry(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !patientId || (!appointmentId && !encounterNo)) return;
    let cancelled = false;
    const fetchPreviousHeight = async (currentEncounterNo?: string): Promise<number | null> => {
      if (!patientId) return null;
      try {
        const historyRes = await encounterApi.getLatest(patientId, 10);
        const encounters = historyRes.data?.data?.encounters ?? [];
        for (const enc of encounters) {
          if (currentEncounterNo && enc.encounter_no === currentEncounterNo) continue;
          if (enc.height !== null && enc.height !== undefined && Number(enc.height) > 0) {
            return Number(enc.height);
          }
          if (Array.isArray(enc.vitals_log)) {
            for (const entry of enc.vitals_log) {
              if (entry.height !== null && entry.height !== undefined && Number(entry.height) > 0) {
                return Number(entry.height);
              }
            }
          }
        }
      } catch (err) {
        console.warn("Could not fetch previous encounters for height", err);
      }
      return null;
    };

    const loadExistingVitals = async () => {
      setIsLoadingVitals(true);
      try {
        const res = encounterNo
          ? await encounterApi.getByEncounterNo(encounterNo)
          : await encounterApi.getByAppointment(appointmentId!);
        const record = res.data?.data;
        if (!record || cancelled) {
          if (!cancelled) {
            const prevHeight = await fetchPreviousHeight();
            if (!cancelled && prevHeight !== null) {
              setHeight(valueToInput(prevHeight));
            }
          }
          return;
        }

        setExistingEncounterNo(record.encounter_no);
        setHasExisting(true);

        const history = Array.isArray(record.vitals_log) ? record.vitals_log : [];
        setVitalsHistory(history);

        const hasAnyExistingVital = [
          record.systolic_bp,
          record.diastolic_bp,
          record.pulse,
          record.respiratory_rate,
          record.spo2,
          record.temperature,
          record.weight,
          record.height,
        ].some((v) => v !== null && v !== undefined);

        if (hasAnyExistingVital) {
          setLastRecordedSnapshot({
            systolic_bp: record.systolic_bp,
            diastolic_bp: record.diastolic_bp,
            pulse: record.pulse,
            respiratory_rate: record.respiratory_rate,
            spo2: record.spo2,
            blood_sugar: record.blood_sugar,
            temperature: record.temperature,
            weight: record.weight,
            height: record.height,
            pain_score: record.pain_score,
          });
        }

        if (isIPD) {
          // For Inpatients, leave dynamic vitals blank for fresh entry,
          // but auto-fill height (static metric).
          reset();
          if (record.height !== null && record.height !== undefined) {
            // Subsequent check in the same admission stay: use stay's height (current flow)
            setHeight(valueToInput(record.height));
          } else {
            // First check of this admission: fetch from previous appointment / encounter!
            const prevHeight = await fetchPreviousHeight(record.encounter_no);
            if (!cancelled && prevHeight !== null) {
              setHeight(valueToInput(prevHeight));
            }
          }
          return;
        }

        // For OPD / non-IPD: prefill inputs
        setBpSystolic(valueToInput(record.systolic_bp));
        setBpDiastolic(valueToInput(record.diastolic_bp));
        setHeartRate(valueToInput(record.pulse));
        setRespiratoryRate(valueToInput(record.respiratory_rate));
        setSpo2(valueToInput(record.spo2));
        setBloodSugar(valueToInput(record.blood_sugar));
        setTemperature(valueToInput(record.temperature));
        setTempUnit("C");
        setWeight(valueToInput(record.weight));
        setWeightUnit("kg");

        if (record.height !== null && record.height !== undefined) {
          setHeight(valueToInput(record.height));
        } else {
          // Fresh OPD appointment with no height yet: fetch from previous appointment!
          const prevHeight = await fetchPreviousHeight(record.encounter_no);
          if (!cancelled && prevHeight !== null) {
            setHeight(valueToInput(prevHeight));
          }
        }
        setHeightUnit("cm");
        setPain(Math.min(10, Math.max(0, Number(record.pain_score ?? 0)) || 0));
      } catch {
      } finally {
        if (!cancelled) setIsLoadingVitals(false);
      }
    };
    loadExistingVitals();
    return () => {
      cancelled = true;
    };
  }, [open, appointmentId, encounterNo, patientId, isIPD]);

  const tempValue = numOrNull(temperature);
  const tempC = tempValue === null ? null : tempUnit === "F" ? fToC(tempValue) : tempValue;
  const tempConverted =
    tempValue === null
      ? ""
      : tempUnit === "F"
        ? `= ${round(tempC as number, 1)} °C`
        : `= ${round(cToF(tempValue), 1)} °F`;

  const weightValue = numOrNull(weight);
  const weightKg = weightValue === null ? null : weightUnit === "lb" ? lbToKg(weightValue) : weightValue;
  const weightConverted =
    weightValue === null
      ? ""
      : weightUnit === "lb"
        ? `= ${round(weightKg as number, 1)} kg`
        : `= ${round(kgToLb(weightValue), 1)} lbs`;

  const heightValue = numOrNull(height);
  const heightCm = heightValue === null ? null : heightUnit === "in" ? inToCm(heightValue) : heightValue;
  const heightConverted =
    heightValue === null
      ? ""
      : heightUnit === "in"
        ? `= ${round(heightCm as number, 1)} cm`
        : `= ${round(cmToIn(heightValue), 1)} in`;

  const bloodSugarValue = numOrNull(bloodSugar);

  const handleTempUnitChange = (unit: TemperatureUnit) => {
    if (tempValue !== null) {
      setTemperature(String(unit === "F" ? round(cToF(tempValue), 1) : round(fToC(tempValue), 1)));
    }
    setTempUnit(unit);
  };

  const handleWeightUnitChange = (unit: WeightUnit) => {
    if (weightValue !== null) {
      setWeight(String(unit === "lb" ? round(kgToLb(weightValue), 1) : round(lbToKg(weightValue), 1)));
    }
    setWeightUnit(unit);
  };

  const handleHeightUnitChange = (unit: HeightUnit) => {
    if (heightValue !== null) {
      setHeight(String(unit === "in" ? round(cmToIn(heightValue), 1) : round(inToCm(heightValue), 1)));
    }
    setHeightUnit(unit);
  };

  const reset = () => {
    setBpSystolic("");
    setBpDiastolic("");
    setHeartRate("");
    setRespiratoryRate("");
    setSpo2("");
    setBloodSugar("");
    setTemperature("");
    setTempUnit("C");
    setWeight("");
    setWeightUnit("kg");
    setHeight("");
    setHeightUnit("cm");
    setPain(0);
    setRemarks("");
  };

  const handleCopyFromPrevious = () => {
    if (!lastRecordedSnapshot) return;
    setBpSystolic(valueToInput(lastRecordedSnapshot.systolic_bp));
    setBpDiastolic(valueToInput(lastRecordedSnapshot.diastolic_bp));
    setHeartRate(valueToInput(lastRecordedSnapshot.pulse));
    setRespiratoryRate(valueToInput(lastRecordedSnapshot.respiratory_rate));
    setSpo2(valueToInput(lastRecordedSnapshot.spo2));
    setBloodSugar(valueToInput(lastRecordedSnapshot.blood_sugar));
    setTemperature(valueToInput(lastRecordedSnapshot.temperature));
    setTempUnit("C");
    setWeight(valueToInput(lastRecordedSnapshot.weight));
    setWeightUnit("kg");
    setHeight(valueToInput(lastRecordedSnapshot.height));
    setHeightUnit("cm");
    setPain(Math.min(10, Math.max(0, Number(lastRecordedSnapshot.pain_score ?? 0)) || 0));
    toast({
      title: "Values copied",
      description: "Filled fields from the latest recorded vitals.",
    });
  };

  const handleStartEdit = (entry: VitalsLogEntry) => {
    setEditingEntry(entry);
    setBpSystolic(valueToInput(entry.systolic_bp));
    setBpDiastolic(valueToInput(entry.diastolic_bp));
    setHeartRate(valueToInput(entry.pulse));
    setRespiratoryRate(valueToInput(entry.respiratory_rate));
    setSpo2(valueToInput(entry.spo2));
    setBloodSugar(valueToInput(entry.blood_sugar));
    setTemperature(valueToInput(entry.temperature));
    setTempUnit("C");
    setWeight(valueToInput(entry.weight));
    setWeightUnit("kg");
    setHeight(valueToInput(entry.height));
    setHeightUnit("cm");
    setPain(Math.min(10, Math.max(0, Number(entry.pain_score ?? 0)) || 0));
    setRemarks(entry.remarks || "");
    toast({
      title: "Editing vitals reading",
      description: `Loaded reading from ${
        entry.recorded_at && !isNaN(new Date(entry.recorded_at).getTime())
          ? format(new Date(entry.recorded_at), "dd MMM yyyy, hh:mm a")
          : "history"
      }.`,
    });
  };

  const handleCancelEdit = () => {
    setEditingEntry(null);
    reset();
    if (isIPD && lastRecordedSnapshot?.height != null) {
      setHeight(valueToInput(lastRecordedSnapshot.height));
    }
  };

  const handleDeleteEntry = async (entry: VitalsLogEntry) => {
    const entryKey = entry.entry_id || entry.recorded_at;
    if (!existingEncounterNo || !entryKey) return;
    const formattedTime =
      entry.recorded_at && !isNaN(new Date(entry.recorded_at).getTime())
        ? format(new Date(entry.recorded_at), "dd MMM yyyy, hh:mm a")
        : "this entry";
    if (!window.confirm(`Are you sure you want to delete the vitals reading from ${formattedTime}?`)) {
      return;
    }

    setSubmitting(true);
    try {
      const res = await encounterApi.deleteVitalsEntry(existingEncounterNo, entryKey);
      const updatedList = Array.isArray(res.data?.data?.vitals_log)
        ? res.data.data.vitals_log
        : vitalsHistory.filter((e) => (e.entry_id || e.recorded_at) !== entryKey);
      setVitalsHistory(updatedList);

      if (editingEntry && (editingEntry.entry_id || editingEntry.recorded_at) === entryKey) {
        handleCancelEdit();
      }

      toast({
        title: "Vitals reading deleted",
        description: `Removed reading from ${formattedTime}.`,
      });
      onSaved?.();
    } catch (err: any) {
      toast({
        title: "Delete failed",
        description: err.response?.data?.message || "Could not delete vitals reading",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const openSummary = () => {
    setRecordedAt(new Date().toLocaleString());
    setSummaryOpen(true);
  };

  const requestClose = () => {
    if (submitting) return;
    if (summaryOpen) {
      setSummaryOpen(false);
      return;
    }
    onOpenChange(false);
  };

  const mapPainToSeverity = (score: number): number => {
    // Return the numeric score as severity (0-10)
    return score;
  };

  const handleAddVitals = async () => {
    if (submitting) return;
    if (!patientId) {
      toast({ title: "Patient ID required", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const updateData: Record<string, any> = {};
      const putIfPresent = (key: string, value: number | null) => {
        if (value !== null) updateData[key] = value;
      };
      putIfPresent("systolic_bp", numOrNull(bpSystolic));
      putIfPresent("diastolic_bp", numOrNull(bpDiastolic));
      putIfPresent("pulse", numOrNull(heartRate) === null ? null : Math.round(numOrNull(heartRate)!));
      putIfPresent("respiratory_rate", numOrNull(respiratoryRate) === null ? null : Math.round(numOrNull(respiratoryRate)!));
      putIfPresent("spo2", numOrNull(spo2) === null ? null : Math.round(numOrNull(spo2)!));
      putIfPresent("temperature", tempC === null ? null : round(tempC, 2));
      putIfPresent("blood_sugar", bloodSugarValue);
      putIfPresent("weight", weightKg === null ? null : round(weightKg, 2));
      putIfPresent("height", heightCm === null ? null : round(heightCm, 2));
      updateData.pain_score = pain;
      if (remarks.trim()) {
        updateData.remarks = remarks.trim();
      }

      if (editingEntry && existingEncounterNo) {
        const entryKey = editingEntry.entry_id || editingEntry.recorded_at;
        const res = await encounterApi.updateVitalsEntry(existingEncounterNo, entryKey, updateData);
        if (Array.isArray(res.data?.data?.vitals_log)) {
          setVitalsHistory(res.data.data.vitals_log);
        }
        toast({
          title: "Vitals updated",
          description: `Updated reading from ${
            editingEntry.recorded_at && !isNaN(new Date(editingEntry.recorded_at).getTime())
              ? format(new Date(editingEntry.recorded_at), "dd MMM yyyy, hh:mm a")
              : "history"
          }.`,
        });
        setEditingEntry(null);
        onSaved?.();
        reset();
        setSummaryOpen(false);
        onOpenChange(false);
        return;
      }

      if (hasExisting && existingEncounterNo) {
        await encounterApi.update(existingEncounterNo, updateData);

        toast({
          title: isIPD ? "Vitals recorded" : "Vitals updated",
          description: `BP ${bpSystolic || "--"}/${bpDiastolic || "--"} • HR ${heartRate || "--"} • Temp ${temperature || "--"}°${tempUnit}`,
        });
        onSaved?.();
      } else {
        const payload: PatientHistoryPayload = {
          patientId,
          appointmentId,
          systolicBp: numOrNull(bpSystolic),
          diastolicBp: numOrNull(bpDiastolic),
          pulse: numOrNull(heartRate),
          respiratoryRate: numOrNull(respiratoryRate),
          temperature: tempC,
          oxygenSaturation: numOrNull(spo2),
          bloodSugar: bloodSugarValue !== null ? String(bloodSugarValue) : undefined,
          weight: weightKg,
          height: heightCm,
          painScore: pain,
          severity: mapPainToSeverity(pain),
        };

        await encounterApi.createPatientHistory(payload);

        toast({
          title: "Vitals recorded",
          description: `BP ${bpSystolic || "--"}/${bpDiastolic || "--"} • HR ${heartRate || "--"} • Temp ${temperature || "--"}°${tempUnit}`,
        });
        onSaved?.();
      }

      reset();
      setSummaryOpen(false);
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: "Save failed",
        description: err.response?.data?.message || "Could not save vitals",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const sysDisplay = bpSystolic || "--";
  const diaDisplay = bpDiastolic || "--";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/10 p-3"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div className="w-full max-w-[560px] rounded-xl bg-white p-4 shadow-xl">
        <header className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-[18px] font-semibold leading-tight text-[#1C2B33]">
              Vital signs entry {isIPD ? "— Inpatient (IPD)" : ""}
            </h2>
            {isLoadingVitals ? (
              <p className="mt-0.5 text-[11px] text-[#93A1A8]">Loading saved vitals…</p>
            ) : isIPD && vitalsHistory.length > 0 ? (
              <p className="mt-0.5 text-[11px] text-[#2E7D5B] font-medium">
                {vitalsHistory.length} previous recording{vitalsHistory.length > 1 ? "s" : ""} on file for this stay
              </p>
            ) : null}
          </div>
          {isIPD && lastRecordedSnapshot && (
            <button
              type="button"
              onClick={handleCopyFromPrevious}
              className="flex items-center gap-1.5 rounded-lg border border-[#E2E6E8] bg-[#FAFBFC] px-2.5 py-1 text-xs font-semibold text-[#1D6E8C] transition-colors hover:bg-[#E6F1F5]"
              title="Copy readings from the last recorded vitals"
            >
              <Copy size={13} />
              <span>Copy last</span>
            </button>
          )}
        </header>

        {editingEntry && (
          <div className="mb-3 flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <div className="flex items-center gap-1.5 font-medium">
              <Pencil size={13} className="text-amber-600" />
              <span>
                Editing vitals reading from{" "}
                {editingEntry.recorded_at && !isNaN(new Date(editingEntry.recorded_at).getTime())
                  ? format(new Date(editingEntry.recorded_at), "dd MMM yyyy, hh:mm a")
                  : "history"}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCancelEdit}
              className="text-[11px] font-semibold text-amber-700 underline hover:text-amber-900"
            >
              Cancel edit
            </button>
          </div>
        )}

        <div className="grid gap-2.5 sm:grid-cols-2">
          <FieldCard tone="danger" title="Blood pressure" subtitle="Systolic / diastolic" icon={Droplet}>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                inputMode="numeric"
                placeholder="120"
                value={bpSystolic}
                onChange={(e) => setBpSystolic(e.target.value)}
                className={`${INPUT_CLASS} text-center`}
              />
              <span className="font-semibold text-[#93A1A8]">/</span>
              <input
                type="number"
                inputMode="numeric"
                placeholder="80"
                value={bpDiastolic}
                onChange={(e) => setBpDiastolic(e.target.value)}
                className={`${INPUT_CLASS} text-center`}
              />
              <span className="min-w-[52px] shrink-0 text-right text-xs text-[#93A1A8]">mmHg</span>
            </div>
          </FieldCard>

          <FieldCard tone="danger" title="Heart rate / pulse" subtitle="Beats per minute" icon={HeartPulse}>
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                placeholder="72"
                value={heartRate}
                onChange={(e) => setHeartRate(e.target.value)}
                className={INPUT_CLASS}
              />
              <span className="min-w-[52px] shrink-0 text-right text-xs text-[#93A1A8]">bpm</span>
            </div>
          </FieldCard>

          <FieldCard tone="purple" title="Respiratory rate" subtitle="Breaths per minute" icon={ThumbsUp}>
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                placeholder="16"
                value={respiratoryRate}
                onChange={(e) => setRespiratoryRate(e.target.value)}
                className={INPUT_CLASS}
              />
              <span className="min-w-[72px] shrink-0 text-right text-xs text-[#93A1A8]">breaths/min</span>
            </div>
          </FieldCard>

          <FieldCard tone="warning" title="Body temperature" subtitle="Toggle °C or °F" icon={Thermometer}>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.1"
                placeholder="37.0"
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                className={INPUT_CLASS}
              />
              <select
                value={tempUnit}
                onChange={(e) => handleTempUnitChange(e.target.value as TemperatureUnit)}
                className={SELECT_CLASS}
              >
                <option value="C">°C</option>
                <option value="F">°F</option>
              </select>
            </div>
            <p className="mt-1.5 min-h-[14px] text-xs text-[#93A1A8]">{tempConverted}</p>
          </FieldCard>

          <FieldCard tone="success" title="Oxygen saturation" subtitle="Percent" icon={Activity}>
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                placeholder="98"
                value={spo2}
                onChange={(e) => setSpo2(e.target.value)}
                className={INPUT_CLASS}
              />
              <span className="min-w-[52px] shrink-0 text-right text-xs text-[#93A1A8]">%</span>
            </div>
          </FieldCard>

          <FieldCard tone="accent" title="Blood sugar" subtitle="mg/dL" icon={BloodDrop}>
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                placeholder="100"
                value={bloodSugar}
                onChange={(e) => setBloodSugar(e.target.value)}
                className={INPUT_CLASS}
              />
              <span className="min-w-[52px] shrink-0 text-right text-xs text-[#93A1A8]">mg/dL</span>
            </div>
          </FieldCard>

          <FieldCard tone="accent" title="Weight" subtitle="Toggle kg or lbs" icon={Weight}>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.1"
                placeholder="70"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className={INPUT_CLASS}
              />
              <select
                value={weightUnit}
                onChange={(e) => handleWeightUnitChange(e.target.value as WeightUnit)}
                className={SELECT_CLASS}
              >
                <option value="kg">kg</option>
                <option value="lb">lbs</option>
              </select>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-xs text-[#93A1A8]">
              <span className="min-h-[14px]">{weightConverted}</span>
              {isIPD && lastRecordedSnapshot?.weight != null && (
                <button
                  type="button"
                  onClick={() => {
                    setWeight(String(lastRecordedSnapshot.weight));
                    setWeightUnit("kg");
                  }}
                  className="inline-flex items-center gap-1 rounded bg-[#E6F1F5] px-1.5 py-0.5 text-[10px] font-medium text-[#1D6E8C] transition hover:bg-[#d6e7ee]"
                  title="Use weight from last recorded vitals"
                >
                  <span>Last: {lastRecordedSnapshot.weight} kg</span>
                  <span className="font-bold underline">[Use]</span>
                </button>
              )}
            </div>
          </FieldCard>

          <FieldCard tone="accent" title="Height" subtitle="Toggle cm or inches" icon={Ruler}>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.1"
                placeholder="170"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                className={INPUT_CLASS}
              />
              <select
                value={heightUnit}
                onChange={(e) => handleHeightUnitChange(e.target.value as HeightUnit)}
                className={SELECT_CLASS}
              >
                <option value="cm">cm</option>
                <option value="in">inches</option>
              </select>
            </div>
            <p className="mt-1.5 min-h-[14px] text-xs text-[#93A1A8]">{heightConverted}</p>
          </FieldCard>

          <FieldCard tone="purple" title="Pain score" subtitle="0 = none, 10 = worst" icon={Activity}>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={10}
                step={1}
                value={pain}
                onChange={(e) => setPain(Number(e.target.value))}
                className="h-[38px] flex-1 accent-[#1D6E8C]"
              />
              <div className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-[#E6F1F5] text-sm font-bold text-[#1D6E8C]">
                {pain}
              </div>
            </div>
          </FieldCard>
        </div>

        {isIPD && (
          <div className="mt-2.5 rounded-lg border border-[#E2E6E8] bg-[#FBFCFD] p-2.5">
            <label className="mb-1 block text-xs font-semibold text-[#5B6B73]">
              Remarks / Notes (optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Morning round, post-medication check, mild fever noted..."
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
        )}

        {isIPD && vitalsHistory.length > 0 && (
          <div className="mt-2.5 rounded-lg border border-[#E2E6E8] bg-slate-50/70 p-3">
            <button
              type="button"
              onClick={() => setShowHistorySection((s) => !s)}
              className="flex w-full items-center justify-between text-xs font-semibold text-slate-700"
            >
              <span className="flex items-center gap-1.5">
                <History size={14} className="text-[#1D6E8C]" />
                Vitals History ({vitalsHistory.length} recording{vitalsHistory.length > 1 ? "s" : ""})
              </span>
              <span className="text-[11px] font-medium text-[#1D6E8C]">
                {showHistorySection ? "Hide history" : "View history"}
              </span>
            </button>

            {showHistorySection && (
              <div className="mt-2.5 max-h-44 space-y-2 overflow-y-auto pr-1">
                {[...vitalsHistory]
                  .sort(
                    (a, b) =>
                      new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()
                  )
                  .map((entry, idx) => (
                    <div
                      key={idx}
                      className="rounded-md border border-slate-200 bg-white p-2.5 text-xs text-slate-700 shadow-sm"
                    >
                      <div className="flex items-center justify-between font-semibold text-slate-900">
                        <span className="flex items-center gap-1">
                          <Clock size={12} className="text-slate-400" />
                          {entry.recorded_at &&
                          !isNaN(new Date(entry.recorded_at).getTime())
                            ? format(new Date(entry.recorded_at), "dd MMM yyyy, hh:mm a")
                            : "—"}
                        </span>
                        <div className="flex items-center gap-2">
                          {entry.recorded_by && (
                            <span className="text-[10px] font-normal text-slate-500">
                              By: {entry.recorded_by}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleStartEdit(entry)}
                            disabled={submitting}
                            className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-medium text-amber-700 hover:bg-amber-50"
                            title="Edit this vitals reading"
                          >
                            <Pencil size={11} />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteEntry(entry)}
                            disabled={submitting}
                            className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-medium text-red-600 hover:bg-red-50"
                            title="Delete this vitals reading"
                          >
                            <Trash2 size={11} />
                            <span>Delete</span>
                          </button>
                        </div>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-600">
                        <span>
                          BP: {entry.systolic_bp ?? "--"}/{entry.diastolic_bp ?? "--"}
                        </span>
                        <span>Pulse: {entry.pulse ?? "--"}</span>
                        <span>SpO2: {entry.spo2 ?? "--"}%</span>
                        <span>Temp: {entry.temperature ?? "--"}°C</span>
                        {entry.blood_sugar && <span>Sugar: {entry.blood_sugar}</span>}
                      </div>
                      {entry.remarks && (
                        <p className="mt-1 text-[11px] italic text-slate-500">
                          "{entry.remarks}"
                        </p>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-5 mb-1 flex gap-2.5">
          <button
            type="button"
            onClick={openSummary}
            disabled={submitting}
            className="h-10 cursor-pointer rounded-lg border border-[#1D6E8C] bg-[#1D6E8C] px-[18px] text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
          >
            Preview summary
          </button>
          <button
            type="button"
            onClick={() => {
              if (submitting) return;
              if (editingEntry) {
                handleCancelEdit();
              } else {
                reset();
                if (isIPD && lastRecordedSnapshot?.height != null) {
                  setHeight(valueToInput(lastRecordedSnapshot.height));
                }
              }
            }}
            className="h-10 cursor-pointer rounded-lg border border-[#E2E6E8] bg-white px-[18px] text-sm font-semibold text-[#1C2B33] transition-transform active:scale-[0.98]"
          >
            {editingEntry ? "Cancel edit" : "Reset"}
          </button>
        </div>
      </div>

      {summaryOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-none p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) requestClose();
          }}
        >
          <div className="w-full max-w-[360px] max-h-[80vh] overflow-y-auto rounded-xl bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-[#1C2B33]">Vital signs</h3>
              <button
                type="button"
                onClick={() => !submitting && setSummaryOpen(false)}
                aria-label="Close"
                className="h-auto cursor-pointer border-none bg-transparent p-0 text-lg leading-none text-[#93A1A8]"
              >
                ×
              </button>
            </div>
            <p className="mb-2.5 text-[11px] text-[#93A1A8]">Recorded {recordedAt}</p>

            <VitalLine tone="danger" label="Blood pressure" value={`${sysDisplay}/${diaDisplay}`} unit="mmHg" icon={Droplet} />
            <VitalLine tone="danger" label="Heart rate" value={heartRate || "--"} unit="bpm" icon={HeartPulse} />
            <VitalLine tone="purple" label="Respiratory rate" value={respiratoryRate || "--"} unit="breaths/min" icon={ThumbsUp} />
            <VitalLine
              tone="warning"
              label="Temperature"
              value={temperature ? `${temperature} °${tempUnit}` : "--"}
              icon={Thermometer}
            />
            <VitalLine tone="success" label="Oxygen saturation" value={spo2 || "--"} unit="%" icon={Activity} />
            <VitalLine tone="accent" label="Blood sugar" value={bloodSugar ? `${bloodSugar} mg/dL` : "--"} icon={BloodDrop} />
            <VitalLine
              tone="accent"
              label="Weight"
              value={weight ? `${weight} ${weightUnit === "lb" ? "lbs" : "kg"}` : "--"}
              icon={Weight}
            />
            <VitalLine
              tone="accent"
              label="Height"
              value={height ? `${height} ${heightUnit === "in" ? "in" : "cm"}` : "--"}
              icon={Ruler}
            />
            <VitalLine tone="purple" label="Pain score" value={String(pain)} unit="/10" icon={Activity} />
            {isIPD && remarks.trim() && (
              <div className="mt-2 rounded bg-slate-50 p-2 text-xs text-slate-700">
                <span className="font-semibold text-slate-500">Note: </span>
                {remarks.trim()}
              </div>
            )}

            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSummaryOpen(false)}
                disabled={submitting}
                className="h-9 cursor-pointer rounded-lg border border-[#E2E6E8] bg-white px-4 text-[12px] font-semibold text-[#555e6c] disabled:cursor-not-allowed disabled:opacity-70"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleAddVitals}
                disabled={submitting}
                className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#1D6E8C] bg-[#1D6E8C] px-4 transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
              >
                <span className="text-[12px] font-semibold text-white">
                  {editingEntry ? "Update recording" : isIPD ? "Record vitals" : hasExisting ? "Update vitals" : "Add vitals"}
                </span>
                {submitting && <Loader2 className="size-4 animate-spin text-white" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VitalsSignsPopover;