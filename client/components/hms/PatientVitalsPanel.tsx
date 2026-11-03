import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ChevronDown,
  Droplet,
  Droplet as BloodDrop,
  HeartPulse,
  Loader2,
  Ruler,
  Thermometer,
  ThumbsUp,
  Weight,
} from "lucide-react";
import { format } from "date-fns";
import { encounterApi, type EncounterRecord } from "@/api/encounter.api";

type Tone = "danger" | "warning" | "success" | "purple" | "accent";
type VitalStatus = "green" | "amber" | "red";

const TONE_BADGE: Record<Tone, string> = {
  danger: "bg-[#FBEAE9] text-[#B5433E]",
  warning: "bg-[#FCF1DD] text-[#A8720F]",
  success: "bg-[#E7F4EE] text-[#2E7D5B]",
  purple: "bg-[#EEECF7] text-[#5A4E9C]",
  accent: "bg-[#E6F1F5] text-[#1D6E8C]",
};

const STATUS_DOT: Record<VitalStatus, string> = {
  green: "bg-green-500",
  amber: "bg-amber-400",
  red: "bg-red-500",
};

type IconType = React.ComponentType<{ size?: number | string; className?: string }>;

interface VitalTileData {
  key: string;
  label: string;
  icon: IconType;
  tone: Tone;
  valueText: string;
  unit?: string;
  status?: VitalStatus;
}

const num = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

const inBand = (v: number, lo: number, hi: number) => v >= lo && v <= hi;

const bandStatus = (
  v: number,
  normalLo: number,
  normalHi: number,
  mildLo: number,
  mildHi: number
): VitalStatus => {
  if (inBand(v, normalLo, normalHi)) return "green";
  if (inBand(v, mildLo, mildHi)) return "amber";
  return "red";
};

const bpStatus = (sys: number | null, dia: number | null): VitalStatus | null => {
  const statuses: VitalStatus[] = [];
  if (sys !== null) statuses.push(bandStatus(sys, 90, 119, 120, 139));
  if (dia !== null) statuses.push(bandStatus(dia, 60, 79, 80, 89));
  if (statuses.length === 0) return null;
  if (statuses.includes("red")) return "red";
  if (statuses.includes("amber")) return "amber";
  return "green";
};

const spo2Status = (v: number): VitalStatus => (v < 90 ? "red" : v < 95 ? "amber" : "green");

const temperatureStatus = (c: number): VitalStatus => {
  if (c >= 38 || c < 35.5) return "red";
  if (c > 37.2 || c < 36.1) return "amber";
  return "green";
};

function buildTiles(r: EncounterRecord): VitalTileData[] {
  const sys = num(r.systolic_bp);
  const dia = num(r.diastolic_bp);
  const pulse = num(r.pulse);
  const resp = num(r.respiratory_rate);
  const spo2 = num(r.spo2);
  const temp = num(r.temperature);
  const sugar = num(r.blood_sugar);
  const weight = num(r.weight);
  const height = num(r.height);
  const pain = num(r.pain_score);

  return [
    {
      key: "bp",
      label: "Blood Pressure",
      icon: Droplet,
      tone: "danger",
      valueText: sys !== null || dia !== null ? `${sys ?? "--"}/${dia ?? "--"}` : "—",
      unit: "mmHg",
      status: bpStatus(sys, dia) ?? undefined,
    },
    {
      key: "hr",
      label: "Heart Rate",
      icon: HeartPulse,
      tone: "danger",
      valueText: pulse !== null ? String(pulse) : "—",
      unit: "Bpm",
      status: pulse === null ? undefined : bandStatus(pulse, 60, 100, 101, 110),
    },
    {
      key: "spo2",
      label: "SPO2",
      icon: Activity,
      tone: "success",
      valueText: spo2 !== null ? String(spo2) : "—",
      unit: "%",
      status: spo2 === null ? undefined : spo2Status(spo2),
    },
    {
      key: "temp",
      label: "Temperature",
      icon: Thermometer,
      tone: "warning",
      valueText: temp !== null ? String(temp) : "—",
      unit: "°C",
      status: temp === null ? undefined : temperatureStatus(temp),
    },
    {
      key: "resp",
      label: "Respiratory Rate",
      icon: ThumbsUp,
      tone: "purple",
      valueText: resp !== null ? String(resp) : "—",
      unit: "rpm",
      status: resp === null ? undefined : bandStatus(resp, 12, 20, 21, 24),
    },
    {
      key: "sugar",
      label: "Blood Sugar",
      icon: BloodDrop,
      tone: "accent",
      valueText: sugar !== null ? String(sugar) : "—",
      unit: "mg/dL",
      status: sugar === null ? undefined : bandStatus(sugar, 70, 139, 140, 199),
    },
    {
      key: "weight",
      label: "Weight",
      icon: Weight,
      tone: "accent",
      valueText: weight !== null ? String(weight) : "—",
      unit: "kg",
    },
    {
      key: "height",
      label: "Height",
      icon: Ruler,
      tone: "accent",
      valueText: height !== null ? String(height) : "—",
      unit: "cm",
    },
    {
      key: "pain",
      label: "Pain Score",
      icon: Activity,
      tone: "purple",
      valueText: pain !== null ? String(pain) : "—",
      unit: "/10",
    },
  ];
}

function VitalTile({ data }: { data: VitalTileData }) {
  const Icon = data.icon;
  return (
    <div className="flex items-start gap-3">
      <div
        className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${TONE_BADGE[data.tone]}`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="mb-1 text-xs text-slate-500">{data.label}</p>
        <div className="flex items-center gap-1.5">
          {data.status && (
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[data.status]}`} />
          )}
          <p className="truncate text-sm font-semibold text-slate-900">
            {data.valueText}
            {data.unit && <span className="ml-1 text-xs font-normal text-slate-500">{data.unit}</span>}
          </p>
        </div>
      </div>
    </div>
  );
}

interface PatientVitalsPanelProps {
  patientId?: string;
  encounterNo?: string | null;     // Scoped to Admission (IPD)
  appointmentId?: string | null;   // Scoped to Appointment (OPD)
}

export default function PatientVitalsPanel({
  patientId,
  encounterNo,
  appointmentId,
}: PatientVitalsPanelProps) {
  const [loading, setLoading] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [options, setOptions] = useState<{ key: string; label: string; data: any }[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const loadData = async () => {
      try {
        if (encounterNo) {
          // ── Case 1: View Admission (scoped strictly to this single admission) ──
          const res = await encounterApi.getByEncounterNo(encounterNo);
          const enc = res.data?.data;
          if (!enc || cancelled) return;

          const logs = Array.isArray(enc.vitals_log) ? enc.vitals_log : [];
          if (logs.length > 0) {
            // Sort newest first
            const sorted = [...logs].sort(
              (a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()
            );
            const opts = sorted.map((entry, idx) => ({
              key: String(idx),
              label:
                entry.recorded_at && !isNaN(new Date(entry.recorded_at).getTime())
                  ? format(new Date(entry.recorded_at), "dd MMM yyyy, hh:mm a")
                  : `Reading ${idx + 1}`,
              data: entry,
            }));
            setOptions(opts);
            setSelectedKey("0");
            setSelectedRecord(opts[0].data);
          } else {
            // Fallback to flat columns if no log entries yet
            const hasFlatVitals = [
              enc.systolic_bp,
              enc.pulse,
              enc.temperature,
              enc.spo2,
              enc.respiratory_rate,
            ].some((v) => v !== null && v !== undefined);

            setOptions([]);
            setSelectedKey("");
            setSelectedRecord(hasFlatVitals ? enc : null);
          }
        } else if (appointmentId) {
          // ── Case 2: View Appointment (OPD - strictly this visit, NO dropdown) ──
          const res = await encounterApi.getByAppointment(appointmentId);
          const enc = res.data?.data;
          if (!enc || cancelled) return;

          const hasFlatVitals = [
            enc.systolic_bp,
            enc.pulse,
            enc.temperature,
            enc.spo2,
            enc.respiratory_rate,
          ].some((v) => v !== null && v !== undefined);

          setOptions([]); // Strictly NO dropdown
          setSelectedKey("");
          setSelectedRecord(hasFlatVitals ? enc : null);
        } else if (patientId) {
          // ── Case 3: Global Patient Profile (cross-encounter history) ──
          const res = await encounterApi.getLatest(patientId, 10);
          if (cancelled) return;
          const rows = res.data?.data?.encounters ?? [];
          if (rows.length > 0) {
            const opts = rows.map((e) => ({
              key: e.encounter_no,
              label:
                e.created_at && !isNaN(new Date(e.created_at).getTime())
                  ? format(new Date(e.created_at), "dd MMM yyyy")
                  : "—",
              data: e,
            }));
            setOptions(opts);
            setSelectedKey(rows[0]?.encounter_no ?? "");
            setSelectedRecord(rows[0]);
          } else {
            setOptions([]);
            setSelectedKey("");
            setSelectedRecord(null);
          }
        } else {
          setOptions([]);
          setSelectedRecord(null);
        }
      } catch {
        if (!cancelled) {
          setOptions([]);
          setSelectedRecord(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadData();
    return () => {
      cancelled = true;
    };
  }, [encounterNo, appointmentId, patientId]);

  useEffect(() => {
    if (!isMenuOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setIsMenuOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [isMenuOpen]);

  const tiles = selectedRecord ? buildTiles(selectedRecord) : [];

  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <Activity className="h-5 w-5 text-slate-400" />
          Vital Signs
        </h2>

        {options.length > 1 && (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setIsMenuOpen((o) => !o)}
              className="flex items-center gap-1.5 rounded-md border border-[#E5E7EB] px-2.5 py-1.5 text-xs font-semibold text-[#374151] transition-colors hover:border-[#00488D]"
            >
              <span>
                {options.find((d) => d.key === selectedKey)?.label ?? "Select reading"}
              </span>
              <ChevronDown
                className={`h-3 w-3 text-[#6B7280] transition-transform duration-200 ${isMenuOpen ? "rotate-180" : ""}`}
              />
            </button>
            <div
              className={`absolute right-0 top-full z-20 mt-1 max-h-60 min-w-[200px] w-auto overflow-y-auto rounded-md border border-[#E5E7EB] bg-white shadow-lg transition-all duration-150 ${
                isMenuOpen ? "scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0"
              }`}
            >
              {options.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => {
                    setSelectedKey(d.key);
                    setSelectedRecord(d.data);
                    setIsMenuOpen(false);
                  }}
                  className={`w-full whitespace-nowrap px-3 py-2 text-left text-xs font-semibold transition-colors ${
                    d.key === selectedKey
                      ? "bg-[#D6E3FF] text-[#00488D]"
                      : "text-[#374151] hover:bg-[#F2F4F6]"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 size={24} className="animate-spin text-[#00488D]" />
        </div>
      ) : !selectedRecord ? (
        <p className="py-6 text-sm text-slate-500">No vitals recorded yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-5 md:grid-cols-4">
          {tiles.map((t) => (
            <VitalTile key={t.key} data={t} />
          ))}
        </div>
      )}
    </div>
  );
}
