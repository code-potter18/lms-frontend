import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getActiveBranchId } from "../../../api/axios";
import { appointmentApi, type AppointmentRecord } from "../../../api/appointment.api";
import { encounterApi, type EncounterRecord } from "../../../api/encounter.api";
import { patientApi, type PatientRecord } from "../../../api/patient.api";
import { computeBsa } from "../../../utils/vitals";
import type {
  ChemoVitalsEntry,
  DischargeMedicineRecord,
  LatestPatientVitalsValues,
  UseLatestPatientVitalsResult,
} from "./types";
import { loadLatestChemoPlan, loadCycleDetail, loadDischargeMedicines } from "./api";

/* Data hooks shared by the patient details page and its tabs. */

export function useDischargeMedicines(protocolId: string) {
  const [rows, setRows] = useState<DischargeMedicineRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!protocolId) {
      setRows([]);
      setLoading(false);
      setError("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    loadDischargeMedicines(protocolId)
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((err: any) => {
        if (!cancelled) {
          setRows([]);
          setError(
            err?.response?.data?.message ||
              err?.message ||
              "Failed to load discharge medicines."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [protocolId]);

  return { rows, loading, error };
}

export const formatLastChecked = (values: (string | null | undefined)[]) => {
  const timestamps = values
    .filter((value): value is string => !!value)
    .map((value) => new Date(value).getTime())
    .filter((time) => !Number.isNaN(time));
  if (timestamps.length === 0) return "";
  const d = new Date(Math.max(...timestamps));
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const meridiem = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `Last checked: ${String(hours).padStart(2, "0")}:${minutes} ${meridiem}`;
};

/* ============================================================
   LATEST PATIENT VITALS HOOK
   The freshest recorded vitals across BOTH sources for a
   patient, fetched once and shared by every portal that shows
   vitals (Order Summary header strip, Discharge portal):
   - latest OPD encounter via GET /encounters/latest
     (newest-first, branch-independent on the backend)
   - newest chemotherapy-cycle vitals row (recorded BSA source;
     missing BSA is derived from height & weight via utils/vitals)
   Merged per-field: encounter value first, chemo fallback.
   ============================================================ */
export function useLatestPatientVitals(
  patientId?: string,
  /** Changes when the user picks a different branch - triggers refetch
      so scoped calls use the fresh x-branch-id header. */
  scopeKey?: string
): UseLatestPatientVitalsResult {
  const [latestEncounter, setLatestEncounter] =
    useState<EncounterRecord | null>(null);
  const [encounterRows, setEncounterRows] =
    useState<EncounterRecord[]>([]);
  const [latestChemoVitals, setLatestChemoVitals] =
    useState<ChemoVitalsEntry | null>(null);
  const [adverseEventCount, setAdverseEventCount] = useState(0);
  const [scopeHint, setScopeHint] = useState(false);
  const [loading, setLoading] = useState(!!patientId);

  useEffect(() => {
    if (!patientId) {
      setLatestEncounter(null);
      setEncounterRows([]);
      setLatestChemoVitals(null);
      setAdverseEventCount(0);
      setScopeHint(false);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    /* Flag scope-style rejections so the UI can nudge the user to
       pick a branch ("Please select a branch first." / "No branch
       has been assigned to your account."). */
    const noteScopeError = (message?: string) => {
      if (/select a branch|branch has been assigned/i.test(message ?? "")) {
        if (!cancelled) setScopeHint(true);
      }
    };

    /* Latest OPD/encounter vitals via GET /encounters/latest
       (newest-first, branch-independent - access resolves from the
       caller's ACTIVE branch mappings server-side). Falls through to
       the branch-scoped encounter list when it fails OR comes back
       empty, so single-branch auto-scoping / a valid selection still
       shows vitals. */
    const loadEncounterVitals = async () => {
      let rows: EncounterRecord[] = [];
      let latest: EncounterRecord | null = null;
      try {
        const response = await encounterApi.getLatest(patientId, 20);
        const encs = response.data?.data?.encounters ?? [];
        rows = [...encs].sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime()
        );
        latest = rows[0] ?? null;
      } catch (error: any) {
        const message = error?.response?.data?.message;
        console.error(
          "Failed to load latest encounter vitals:",
          message ?? error
        );
        noteScopeError(message);
      }
      if (!latest || rows.length === 0) {
        try {
          const response = await encounterApi.getAll({
            patientId,
            limit: 20,
          });
          if (cancelled) return;
          rows = [...(response.data?.data?.encounters ?? [])].sort(
            (a, b) =>
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime()
          );
          latest = rows[0] ?? null;
        } catch (error: any) {
          const message = error?.response?.data?.message;
          console.error(
            "Encounter vitals fallback failed:",
            message ?? error
          );
          noteScopeError(message);
        }
      }
      if (!cancelled) {
        setLatestEncounter(latest);
        setEncounterRows(rows);
      }
    };
    loadEncounterVitals();

    /* Newest chemotherapy-cycle vitals + adverse-event count
       (single chain fetch, same as the Discharge portal used). */
    loadLatestChemoPlan(patientId)
      .then(async (loaded) => {
        const sortedCycles = [...(loaded?.chemotherapy_cycle ?? [])].sort(
          (a, b) =>
            (b.actual_date ?? b.planned_date ?? "").localeCompare(
              a.actual_date ?? a.planned_date ?? ""
            ) || b.cycle_number - a.cycle_number
        );
        const newestWithId = sortedCycles.find(
          (cycle) => cycle.chemotherapy_cycle_id
        );
        if (!newestWithId?.chemotherapy_cycle_id) return;
        try {
          const detail = await loadCycleDetail(
            newestWithId.chemotherapy_cycle_id as string
          );
          if (cancelled || !detail) return;
          const vitalsRows = (detail.chemotherapy_vitals ?? []).slice();
          vitalsRows.sort((a, b) =>
            (b.recorded_at ?? "").localeCompare(a.recorded_at ?? "")
          );
          setLatestChemoVitals(vitalsRows[0] ?? null);
          setAdverseEventCount(
            (detail.chemotherapy_adverse_event ?? []).length
          );
        } catch (error: any) {
          const message = error?.response?.data?.message;
          console.error(
            "Failed to load chemo cycle vitals:",
            message ?? error
          );
          noteScopeError(message);
          /* Vitals stay empty - panels show placeholders. */
        }
      })
      .catch((error: any) => {
        const message = error?.response?.data?.message;
        console.error(
          "Failed to load chemotherapy plan for vitals:",
          message ?? error
        );
        noteScopeError(message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [patientId, scopeKey]);

  const num = (value?: string | number | null) => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  };
  const encNum = (value: number | string | null | undefined) =>
    num(value ?? null);

  const firstNonNull = <T,>(rows: T[], getter: (r: T) => any) => {
    for (const r of rows) {
      const v = getter(r);
      if (v !== null && v !== undefined && v !== "") return v;
    }
    return null;
  };
  const firstEncounterValue = (getter: (e: EncounterRecord) => any) => {
    return firstNonNull(encounterRows, getter);
  };

  const heightValue =
    encNum(firstEncounterValue(e => e.height)) ?? num(latestChemoVitals?.height);
  const weightValue =
    encNum(firstEncounterValue(e => e.weight)) ?? num(latestChemoVitals?.weight);

  const vitals: LatestPatientVitalsValues = {
    height: heightValue,
    weight: weightValue,
    bpSystolic:
      encNum(firstEncounterValue(e => e.systolic_bp)) ??
      num(latestChemoVitals?.blood_pressure_systolic),
    bpDiastolic:
      encNum(firstEncounterValue(e => e.diastolic_bp)) ??
      num(latestChemoVitals?.blood_pressure_diastolic),
    pulse: encNum(firstEncounterValue(e => e.pulse)) ?? num(latestChemoVitals?.pulse_rate),
    temp:
      encNum(firstEncounterValue(e => e.temperature)) ??
      num(latestChemoVitals?.body_temperature),
    spo2: encNum(firstEncounterValue(e => e.spo2)) ?? num(latestChemoVitals?.spo2),
    bmi: encNum(firstEncounterValue(e => e.BMI)) ?? num(latestChemoVitals?.bmi),
    /* Recorded chemo value wins; otherwise derive from height & weight
        (Mosteller - see utils/vitals.ts). */
    bsa:
      num(latestChemoVitals?.body_surface_area) ??
      computeBsa(heightValue, weightValue),
    painScore: encNum(firstEncounterValue(e => e.pain_score)),
  };

  const vitalEntries: [string, string][] = [
    ["HEIGHT", vitals.height != null ? `${vitals.height} cm` : ""],
    [
      "BP",
      vitals.bpSystolic != null && vitals.bpDiastolic != null
        ? `${vitals.bpSystolic}/${vitals.bpDiastolic}`
        : "",
    ],
    ["WEIGHT", vitals.weight != null ? `${vitals.weight} kg` : ""],
    ["PULSE", vitals.pulse != null ? `${vitals.pulse} bpm` : ""],
    ["BSA", vitals.bsa != null ? `${vitals.bsa} m²` : ""],
    ["TEMP", vitals.temp != null ? `${vitals.temp} °C` : ""],
    ["BMI", vitals.bmi != null ? `${vitals.bmi}` : ""],
    ["SPO2", vitals.spo2 != null ? `${vitals.spo2}%` : ""],
    ["PAIN", vitals.painScore != null ? `${vitals.painScore}/10` : ""],
  ];

  const lastCheckedLabel = formatLastChecked([
    latestEncounter?.checkin_time,
    latestEncounter?.created_at,
    latestChemoVitals?.recorded_at,
  ]);

  return {
    latestEncounter,
    latestChemoVitals,
    loading,
    adverseEventCount,
    vitals,
    vitalEntries,
    lastCheckedLabel,
    scopeHint,
  };
}

/* ================= Next visit booking =================
   The patient's appointments (from the treatment start, or today), latest
   encounter and record, and the doctor-portal booking actions: Book a cycle
   day's visit (prefilled, "Chemotherapy Visit") or Reschedule the
   appointment already booked on it. Used by the Order Summary and
   Medications tabs. */
const isoDayOf = (value?: string | null) => (value ? String(value).slice(0, 10) : "");
const localTodayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

export function useNextVisitBooking(
  patientId: string,
  { planDoctorId, treatmentStartDate }: { planDoctorId?: string | null; treatmentStartDate?: string | null } = {}
) {
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [latestEncounter, setLatestEncounter] = useState<EncounterRecord | null>(null);
  const [patient, setPatient] = useState<PatientRecord | null>(null);
  const today = localTodayIso();

  useEffect(() => {
    if (!patientId) return;
    let cancelled = false;
    const from = isoDayOf(treatmentStartDate);
    appointmentApi
      .getAll({
        patientId,
        dateFrom: from && from < today ? from : today,
        sortBy: "appointment_date",
        sortOrder: "desc",
        limit: 100,
      })
      .then((response) => {
        if (!cancelled) setAppointments(response.data?.data?.appointments ?? []);
      })
      .catch((error) => console.error("Failed to load the patient's appointments:", error));
    encounterApi
      .getLatest(patientId, 1)
      .then((response) => {
        if (!cancelled) setLatestEncounter(response.data?.data?.encounters?.[0] ?? null);
      })
      .catch(() => undefined);
    patientApi
      .getById(patientId)
      .then((response) => {
        if (!cancelled) setPatient(response.data?.data ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, treatmentStartDate]);

  /* Not cancelled / no-show. */
  const activeAppointments = appointments.filter(
    (appointment) => !["CANCELLED", "NO_SHOW"].includes(String(appointment.status ?? "").toUpperCase())
  );

  /* The appointment booked on a date (not yet completed). */
  const bookedOn = (date?: string | null): AppointmentRecord | null =>
    date
      ? activeAppointments.find(
          (appointment) =>
            isoDayOf(appointment.appointment_date) === date &&
            String(appointment.status ?? "").toUpperCase() !== "COMPLETED"
        ) ?? null
      : null;

  const placement = {
    doctorId: latestEncounter?.employee_id || planDoctorId || "",
    branchId: latestEncounter?.branch_id || getActiveBranchId() || "",
    departmentId: latestEncounter?.department_id || "",
  };

  /* Book the visit of a date (today when it has passed). */
  const book = (dateValue?: string | null) => {
    const date = dateValue && dateValue >= today ? dateValue : today;
    navigate("/doctor/appointments/add", {
      state: {
        ...(patient
          ? {
              patient: {
                patient_id: patient.patient_id,
                patient_first_name: patient.patient_first_name,
                patient_middle_name: patient.patient_middle_name ?? "",
                patient_last_name: patient.patient_last_name ?? "",
                patient_primary_mobile: patient.patient_primary_mobile ?? "",
              },
            }
          : {}),
        ...(placement.doctorId && placement.branchId && placement.departmentId
          ? { slot: { ...placement, date } }
          : {}),
        ...(placement.doctorId
          ? {
              doctorBooking: {
                doctorId: placement.doctorId,
                ...(placement.branchId ? { branchId: placement.branchId } : {}),
                ...(placement.departmentId ? { departmentId: placement.departmentId } : {}),
              },
            }
          : {}),
        defaultVisitType: "Chemotherapy Visit",
      },
    });
  };

  /* Reschedule a booked appointment (returns to the doctor portal). */
  const reschedule = (appointment: AppointmentRecord) => {
    const doctorId = appointment.employee_id || placement.doctorId;
    const branchId = appointment.branch_id || placement.branchId;
    const departmentId = appointment.department_id || placement.departmentId;
    navigate(`/doctor/appointments/edit/${appointment.appointment_id}`, {
      state: doctorId
        ? {
            doctorBooking: {
              doctorId,
              ...(branchId ? { branchId } : {}),
              ...(departmentId ? { departmentId } : {}),
            },
          }
        : undefined,
    });
  };

  return { appointments, activeAppointments, latestEncounter, patient, bookedOn, book, reschedule };
}
