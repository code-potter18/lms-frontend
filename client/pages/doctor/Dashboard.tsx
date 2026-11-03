import React, { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ConfirmationDialog } from "@/components/ui/ConfirmationDialog";
import { getActiveBranchId } from "../../api/axios";
import {
  doctorDashboardApi,
  type DashboardAppointment,
  type DashboardDoctorResponse,
  type DashboardSchedule,
} from "../../api/doctorDashboard.api";
import { activeBranches } from "../../lib/utils";
import { encounterApi } from "../../api/encounter.api";
import { ipdApi } from "../../api/ipd.api";
import { getUser } from "../../utils/token";
import { useToast } from "@/hooks/use-toast";
import { BellNotificationButton } from "@/components/hms/BellNotificationButton";

import { useCriticalPatients } from "@/hooks/useCriticalPatients";
import { CriticalDot, CriticalCorner, CriticalWrapper } from "@/components/hms/CriticalPatientIndicator";

type AppointmentStatus = "Check Out" | "Check In" | "Cancelled" | "Admitted";

interface Appointment {
  patientId: string;
  patient: string;
  image: string;
  dateTime: string;
  appointmentDate: string;
  appointmentTime: string;
  phone: string;
  status: AppointmentStatus;
  appointmentId: string;
  originalStatus: string;
  visit_type: string;
  hasEncounter: boolean;
  /* Set only for an inpatient row: the admission's own encounter, which the
     consultation opens on directly (no appointment involved). */
  encounterNo?: string;
}

const fallbackHospital = "HMS Main Hospital";

const DASHBOARD_BRANCH_STORAGE_KEY = "hms_dashboard_branch_id";

const chartData = [
  { day: "Mon", completed: 153.59, rescheduled: 51.19 },
  { day: "Tue", completed: 122.88, rescheduled: 81.91 },
  { day: "Wed", completed: 184.31, rescheduled: 30.72 },
  { day: "Thu", completed: 112.63, rescheduled: 92.16 },
  { day: "Fri", completed: 174.06, rescheduled: 40.95 },
  { day: "Sat", completed: 81.91, rescheduled: 20.47 },
];

const periods = ["Last 7 Days", "Last 30 Days", "This Month", "This Year"];


function Icon({
  name,
  className = "h-5 w-5",
}: {
  name:
    | "bell"
    | "calendar"
    | "chevron"
    | "clock"
    | "users"
    | "appointments"
    | "cancel"
    | "trend";
  className?: string;
}) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (name === "bell") {
    return (
      <svg {...common}>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    );
  }

  if (name === "calendar") {
    return (
      <svg {...common}>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    );
  }

  if (name === "clock") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <polyline points="12 7 12 12 15 14" />
      </svg>
    );
  }

  if (name === "users") {
    return (
      <svg {...common}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    );
  }

  if (name === "appointments") {
    return (
      <svg {...common}>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    );
  }

  if (name === "cancel") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <line x1="9" y1="9" x2="15" y2="15" />
        <line x1="15" y1="9" x2="9" y2="15" />
      </svg>
    );
  }

  if (name === "trend") {
    return (
      <svg {...common}>
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function statusClasses(status: AppointmentStatus) {
  if (status === "Check Out") {
    return "border border-green-200 bg-green-100 text-green-700";
  }

  if (status === "Check In") {
    return "border border-amber-200 bg-amber-100 text-amber-700";
  }

  return "border border-red-200 bg-red-100 text-red-700";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTime(value: string) {
  if (!value) return "";

  const timeMatch = value.match(
    /(?:T|\s)?(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?/
  );

  if (timeMatch) {
    let hour = Number(timeMatch[1]);
    const minute = timeMatch[2];
    const suffix = hour >= 12 ? "PM" : "AM";

    hour = hour % 12 || 12;
    return `${String(hour).padStart(2, "0")}:${minute} ${suffix}`;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatScheduleRange(start?: string | null, end?: string | null) {
  if (!start || !end) return "";

  return `${formatTime(start)} - ${formatTime(end)}`;
}

function isBeforeToday(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const apptDate = new Date(dateStr);
  return apptDate < today;
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  const seconds = Math.max(
    0,
    Math.floor((Date.now() - then) / 1000)
  );

  if (seconds < 60) return "Just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function DoctorDashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [periodOpen, setPeriodOpen] = useState(false);
  const [hospitalOpen, setHospitalOpen] = useState(false);
  const [period, setPeriod] = useState("Last 7 Days");
  const [hospital, setHospital] = useState("");
  const [doctor, setDoctor] = useState<DashboardDoctorResponse["data"] | null>(null);
  const doctorName = doctor?.employee
    ? `Dr. ${doctor.employee.first_name} ${doctor.employee.last_name}`
    : "Dr. Jenkins";
  const [dashboardAppointments, setDashboardAppointments] = useState<Appointment[]>([]);
  const [dashboardSchedules, setDashboardSchedules] = useState<DashboardSchedule[]>([]);

  const dashboardPatientIds = React.useMemo(() => {
    return [...new Set(dashboardAppointments.map((a) => a.patientId).filter(Boolean))];
  }, [dashboardAppointments]);



  const { getCriticalInfo } = useCriticalPatients(
    dashboardPatientIds.map((id) => ({ patientId: id }))
  );
  const [totalAppointments, setTotalAppointments] = useState(0);
  const [cancelledAppointments, setCancelledAppointments] = useState(0);
  const [totalPatientsToday, setTotalPatientsToday] = useState(0);
  const [doctorEmployeeId, setDoctorEmployeeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [branchLoading, setBranchLoading] = useState(false);
  const [checkInLoading, setCheckInLoading] = useState<string | null>(null);
  const [dashboardError, setDashboardError] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(() =>
    localStorage.getItem(DASHBOARD_BRANCH_STORAGE_KEY) || null
  );

  const handleCheckIn = async (appointmentId: string) => {
    setCheckInLoading(appointmentId);
    try {
      // createEncounter flips the appointment to IN_CONSULTATION inside its
      // transaction; updating status separately first would strand an
      // in-progress appointment with no encounter when creation fails.
      try {
        await encounterApi.create({ appointment_id: appointmentId });
      } catch (error: any) {
        const message = error?.response?.data?.message;
        if (!message || !/already exists/i.test(message)) {
          throw error;
        }
      }
      // Trigger reload by calling loadDashboard
      window.dispatchEvent(new CustomEvent("refreshDoctorDashboard"));
      toast({ title: "Patient checked in", description: "Encounter created successfully." });
    } catch (error: any) {
      toast({ title: "Check-in failed", description: error.response?.data?.message || "Failed to check in patient", variant: "destructive" });
    } finally {
    setCheckInLoading(null);
  }
  };

  const handleCheckOut = async (appointmentId: string) => {
    try {
      // Branch-independent lookup: the scoped list query can 403 a
      // multi-branch doctor with no branch selected.
      const response = await encounterApi.getByAppointment(appointmentId);
      const encounter = response.data?.data;
      if (encounter) {
        await encounterApi.close(encounter.encounter_no, "DOCTOR");
      }
      window.dispatchEvent(new CustomEvent("refreshDoctorDashboard"));
      toast({ title: "Patient checked out", description: "Encounter closed successfully." });
    } catch (error: any) {
      toast({ title: "Check-out failed", description: error.response?.data?.message || "Failed to check out patient", variant: "destructive" });
    }
  };

  const periodRef = useRef<HTMLDivElement>(null);
  const hospitalRef = useRef<HTMLDivElement>(null);

  // Load dashboard data - uses selectedBranchId for branch-specific data
  const loadDashboard = useCallback(async (showLoader = false, isBranchSwitch = false) => {
    try {
      if (showLoader) setLoading(true);
      if (isBranchSwitch) {
        setBranchLoading(true);
        // Clear data immediately to prevent showing stale data from previous branch
        setDashboardAppointments([]);
        setDashboardSchedules([]);
        setTotalAppointments(0);
        setCancelledAppointments(0);
        setTotalPatientsToday(0);
      }
      setDashboardError("");

      const authResponse = await doctorDashboardApi.getCurrentUser();
      const employeeId = authResponse.data.user?.employee_id ?? getUser()?.employee_id ?? null;

      if (!employeeId) {
        setDashboardError("No employee ID is linked to the logged-in user. Please contact your administrator.");
        return;
      }

      setDoctorEmployeeId(employeeId);

      const today = new Date().toISOString().slice(0, 10);
      const employeeResponse = await doctorDashboardApi.getDoctor(employeeId);
      const employeeData = employeeResponse.data.data;

      setDoctor(employeeData);
      setDashboardSchedules(employeeData.doctorSchedules ?? []);

      const firstActiveBranch = employeeData.branches?.find(
        (branch) => branch.status === undefined || branch.status === 1
      );

      // Drop a stored selection that no longer belongs to this doctor's branches
      const storedBranchValid =
        !selectedBranchId ||
        employeeData.branches?.some((b) => b.branch_id === selectedBranchId);
      if (!storedBranchValid) {
        localStorage.removeItem(DASHBOARD_BRANCH_STORAGE_KEY);
        setSelectedBranchId(null);
      }

      // Use selectedBranchId if set, otherwise fall back to HMS branch selector or first active branch
      const branchId = (storedBranchValid ? selectedBranchId : null) || getActiveBranchId() || firstActiveBranch?.branch_id || null;

      // Set hospital name based on selected branch
      const selectedBranch = employeeData.branches?.find((b) => b.branch_id === branchId);
      if (selectedBranch?.branch_name) {
        setHospital(selectedBranch.branch_name);
      } else if (firstActiveBranch?.branch_name) {
        setHospital(firstActiveBranch.branch_name);
      }

      const [
        appointmentsResponse,
        cancelledResponse,
        checkedInResponse,
      ] = await Promise.all([
        doctorDashboardApi.getAppointments({
          employeeId,
          branchId,
          date: today,
          page: 1,
          limit: 10,
        }),
        doctorDashboardApi.getAppointments({
          employeeId,
          branchId,
          date: today,
          status: "CANCELLED",
          page: 1,
          limit: 1,
        }),
        doctorDashboardApi.getPatientsCheckedInToday({
          employeeId,
          branchId: branchId || undefined,
        }),
      ]);

      setTotalAppointments(appointmentsResponse.data.data.total);
      setCancelledAppointments(cancelledResponse.data.data.total);
      setTotalPatientsToday(checkedInResponse.data.data.totalPatients);

      const mappedAppointments = appointmentsResponse.data.data.appointments
        .map(
          (item: DashboardAppointment): Appointment => ({
            patientId: item.patient_bio_data?.patient_id || "",
            patient: [
              item.patient_bio_data?.patient_first_name,
              item.patient_bio_data?.patient_middle_name,
              item.patient_bio_data?.patient_last_name,
            ]
              .filter(Boolean)
              .join(" ") || "Unknown Patient",
            image:
              item.patient_bio_data?.patient_photo_url || "",
            dateTime: `${formatDate(item.appointment_date)} - ${formatTime(
              item.appointment_time
            )}`,
            appointmentDate: item.appointment_date,
            appointmentTime: item.appointment_time,
            phone: item.patient_bio_data?.patient_primary_mobile || "-",
            status: item.status as AppointmentStatus,
            appointmentId: item.appointment_id,
            originalStatus: item.status,
            visit_type: item.Patient_visit_type || "",
            hasEncounter: false,
          })
        )
        .filter((a): a is Appointment => a !== null)
        // Sort by appointment_time ascending
        .sort((a, b) => {
          const timeA = a.appointmentTime || "";
          const timeB = b.appointmentTime || "";
          return timeA.localeCompare(timeB);
        });

      const encounterChecks = await Promise.all(
        mappedAppointments.map((appointment) =>
          encounterApi
            .getByAppointment(appointment.appointmentId)
            .then((response) => Boolean(response.data?.data?.encounter_no))
            .catch(() => false)
        )
      );

      const appointmentsWithEncounters = mappedAppointments.map(
        (appointment, index) => ({
          ...appointment,
          hasEncounter: encounterChecks[index],
        })
      );

      /* Inpatients assigned to this doctor show in the same table. They have
         no appointment -- the admission's encounter is the link -- so
         Proceed opens the consultation on that encounter directly. */
      let inpatientRows: Appointment[] = [];
      try {
        const admissionsResponse = await ipdApi.getAll({
          branchId: branchId || undefined,
          status: "ADMITTED",
          limit: 100,
        });
        inpatientRows = (admissionsResponse.data?.data?.admissions ?? [])
          .filter((a) => a.employee_id === employeeId && a.encounter_no)
          .map((a) => ({
            patientId: a.patient_id,
            patient:
              [a.patient_bio_data?.patient_first_name, a.patient_bio_data?.patient_last_name]
                .filter(Boolean)
                .join(" ") || "Unknown Patient",
            image: "",
            dateTime: `IP ${a.ip_number} - ${a.ward_master?.ward_name ?? ""} ${a.bed_master?.bed_number ?? ""}`.trim(),
            appointmentDate: a.admission_date,
            appointmentTime: "",
            phone: a.patient_bio_data?.patient_primary_mobile || "-",
            status: "Admitted" as AppointmentStatus,
            appointmentId: "",
            originalStatus: "ADMITTED",
            visit_type: "Inpatient",
            hasEncounter: true,
            encounterNo: a.encounter_no ?? undefined,
          }));
      } catch (admissionsError) {
        // Non-fatal: the appointment list still shows.
        console.warn("Failed to load inpatients for dashboard:", admissionsError);
      }

      setDashboardAppointments([...appointmentsWithEncounters, ...inpatientRows]);
    } catch (error: any) {
      console.error("Failed to load doctor dashboard:", error);
      setDashboardError(
        error?.response?.data?.message ||
          error?.message ||
          "Failed to load dashboard data."
      );
    } finally {
      if (showLoader) setLoading(false);
      if (isBranchSwitch) setBranchLoading(false);
    }
  }, [selectedBranchId]);

  // Initial load and refresh listener
  useEffect(() => {
    let cancelled = false;

    const handleRefresh = () => {
      if (!cancelled) void loadDashboard(false);
    };
    window.addEventListener("refreshDoctorDashboard", handleRefresh);

    // Initial load
    void loadDashboard(true);

    // Keep today's appointments/counts synchronized with the backend.
    const intervalId = window.setInterval(() => {
      if (!cancelled) void loadDashboard(false);
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("refreshDoctorDashboard", handleRefresh);
    };
  }, [loadDashboard]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;

      if (!periodRef.current?.contains(target)) {
        setPeriodOpen(false);
      }

      if (!hospitalRef.current?.contains(target)) {
        setHospitalOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPeriodOpen(false);
        setHospitalOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const displayHospital =
    selectedBranchId
      ? doctor?.branches?.find((b) => b.branch_id === selectedBranchId)?.branch_name ??
        hospital ??
        ""
      : hospital || "";

  const todayDate = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const doctorId = doctor?.employee?.employee_id || "-";

  const availability = [
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
    "SUNDAY",
  ].map((day) => {
    const schedule = dashboardSchedules.find(
      (item) =>
        item.day_of_week?.toUpperCase() === day &&
        item.is_active !== false &&
        (!selectedBranchId || item.branch_id === selectedBranchId)
    );

    return {
      day:
        day.slice(0, 3).charAt(0) +
        day.slice(1, 3).toLowerCase(),

      time: schedule
        ? formatScheduleRange(
            schedule.start_time,
            schedule.end_time
          )
        : undefined,

      leave: !schedule,
    };
  });

  return (
    <main className="min-h-screen w-full bg-white font-['Inter',sans-serif] text-[#181c1e]">
      <div className="mx-auto w-full max-w-[1120px] px-8 py-8 max-[1100px]:max-w-full max-[1100px]:px-6 max-[700px]:px-4 max-[700px]:py-5">

        {/* Header */}
        <header className="mb-8 flex items-center justify-between max-[700px]:items-start">
          <div className="flex flex-col gap-2">
            <h1 className="font-['Manrope',sans-serif] text-[28px] font-bold leading-[34px] tracking-[-0.56px] text-[#191c1e] max-[700px]:text-2xl max-[700px]:leading-8">
              Welcome back, {doctorName}
            </h1>

            <div className="flex items-center gap-6 max-[700px]:flex-wrap max-[700px]:gap-2.5">
              <div className="flex items-center gap-1">
                <span className="font-['Manrope',sans-serif] text-xs font-bold uppercase leading-4 tracking-[0.6px] text-[#434654]">
                  {todayDate}
                </span>

                <span className="rounded bg-[#dae2ff] px-2 py-0.5 font-['Manrope',sans-serif] text-sm font-bold leading-5 tracking-[-0.14px] text-[#003d9b]">
                  {doctorId}
                </span>
              </div>

              <div className="flex items-center gap-1">
                <span className="text-[17px] leading-none text-yellow-500">★</span>
                <span className="text-[17px] leading-none text-yellow-500">
                  ★
                </span>

                <span className="text-xs font-bold text-[#191c1e]">
                  4.9
                </span>

                <span className="text-[11px] font-medium text-[#434654]">
                  (128 reviews)
                </span>
              </div>
            </div>
          </div>

<div className="flex items-center gap-4 max-[700px]:hidden">
            <BellNotificationButton size="md" />

            <div className="h-8 w-px bg-[#c3c6d6]" />

            <div className="flex items-center gap-2 pl-2">
              <span className="font-['Manrope',sans-serif] text-xs font-bold tracking-[0.6px] text-[#434654]">
                {new Date().toLocaleDateString()}
              </span>

              <Icon
                name="calendar"
                className="h-5 w-5 text-[#434654]"
              />
            </div>
          </div>
        </header>

        {/* Branch Loading Skeleton */}
        {branchLoading && (
          <div className="mb-6 animate-fade-in">
            <div className="grid grid-cols-[minmax(0,1fr)_336px] items-start gap-6 max-[900px]:grid-cols-1">
              {/* Left column skeleton */}
              <section className="min-w-0">
                <div className="mb-[34px] grid h-[142px] grid-cols-3 gap-6 max-[700px]:h-auto max-[700px]:grid-cols-1">
                  {[1, 2, 3].map((i) => (
                    <article key={i} className="flex min-w-0 flex-col justify-between rounded-xl border border-[#c3c6d6] bg-white p-[21px] shadow-[0_4px_6px_rgba(0,0,0,0.05)] max-[700px]:min-h-[142px] animate-pulse">
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex flex-col gap-1">
                          <div className="h-4 w-3/4 bg-slate-200 rounded" />
                          <div className="h-8 w-1/2 bg-slate-200 rounded" />
                        </div>
                        <div className="h-10 w-10 shrink-0 rounded-lg bg-slate-200" />
                      </div>
                      <div className="pt-4">
                        <div className="h-2 w-3/4 bg-slate-200 rounded-full" />
                      </div>
                    </article>
                  ))}
                </div>

                <section className="mb-[29px] h-[293px] overflow-hidden rounded-lg border border-[#c3c6d6] bg-white max-[700px]:overflow-x-auto animate-pulse">
                  <div className="h-[54px] border-b border-[#c3c6d6] bg-slate-50" />
                  <div className="p-4 space-y-3">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="h-12 bg-slate-200 rounded" />
                    ))}
                  </div>
                </section>

                <section className="h-[370px] rounded-xl border border-[#c3c6d6] bg-white p-[25px] shadow-[0_4px_6px_rgba(0,0,0,0.05)] animate-pulse">
                  <div className="h-6 w-1/3 bg-slate-200 rounded mb-4" />
                  <div className="h-4 w-1/2 bg-slate-200 rounded mb-6" />
                  <div className="h-200 bg-slate-200 rounded" />
                </section>
              </section>

              {/* Right column skeleton */}
              <aside className="min-w-0 max-[900px]:grid max-[900px]:grid-cols-2 max-[900px]:gap-6 max-[700px]:grid-cols-1">
                <section className="mb-6 overflow-hidden rounded border border-slate-200 bg-white shadow-[0_1px_1.5px_rgba(0,0,0,0.1),0_1px_1px_rgba(0,0,0,0.06)] max-[900px]:mb-0 animate-pulse">
                  <div className="h-[50px] border-b border-slate-100 bg-slate-50" />
                  <div className="p-5 space-y-3">
                    {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                      <div key={i} className="h-10 bg-slate-200 rounded" />
                    ))}
                  </div>
                  <div className="p-5">
                    <div className="h-9 w-full rounded bg-slate-200" />
                  </div>
                </section>

                <section className="h-[370px] rounded-xl border border-[#c3c6d6] bg-white p-[25px] shadow-[0_4px_6px_rgba(0,0,0,0.05)] animate-pulse">
                  <div className="h-6 w-1/4 bg-slate-200 rounded mb-4" />
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-20 bg-slate-200 rounded" />
                    ))}
                  </div>
                </section>
              </aside>
            </div>
          </div>
        )}

        {/* Main Content - Hidden during branch loading */}
        {!branchLoading && (
          <div className="grid grid-cols-[minmax(0,1fr)_336px] items-start gap-6 max-[900px]:grid-cols-1">
            {/* Left column */}
            <section className="min-w-0">
            {/* Metrics */}
            <div className="mb-[34px] grid h-[142px] grid-cols-3 gap-6 max-[700px]:h-auto max-[700px]:grid-cols-1">

              <article className="flex min-w-0 flex-col justify-between rounded-xl border border-[#c3c6d6] bg-white p-[21px] shadow-[0_4px_6px_rgba(0,0,0,0.05)] max-[700px]:min-h-[142px]">
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex flex-col gap-1">
                    <div className="text-xs font-medium uppercase leading-4 tracking-[0.6px] text-[#434654]">
                      Total
                      <br />
                      Appointments
                    </div>

                    <div className="text-2xl font-semibold leading-8 tracking-[-0.24px]">
                      {loading ? "—" : totalAppointments}
                    </div>
                  </div>

                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#003d9b]/10 text-[#003d9b]">
                    <Icon name="appointments" />
                  </div>
                </div>

                <div className="pt-4">
                  <div className="flex items-center gap-2">
                    <div className="flex h-[5px] flex-1 items-end gap-0.5 overflow-hidden rounded-full">
                      <span className="h-1 flex-1 rounded-[1px] bg-[#003d9b]" />
                      <span className="h-[5px] flex-1 rounded-[1px] bg-[#003d9b]" />
                      <span className="h-[6px] flex-1 rounded-[1px] bg-[#003d9b]" />
                      <span className="h-[7px] flex-1 rounded-[1px] bg-[#003d9b]" />
                      <span className="h-[6px] flex-1 rounded-[1px] bg-[#003d9b]" />
                    </div>

                    <span className="whitespace-nowrap text-xs font-bold text-[#003d9b]">
                      +12%
                    </span>
                  </div>
                </div>
              </article>

              <article className="flex min-w-0 flex-col justify-between rounded-xl border border-[#c3c6d6] bg-white p-[21px] shadow-[0_4px_6px_rgba(0,0,0,0.05)] max-[700px]:min-h-[142px]">
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex flex-col gap-1">
                    <div className="text-xs font-medium uppercase leading-4 tracking-[0.6px] text-[#434654]">
                      Patients Checked In
                    </div>

                    <div className="text-2xl font-semibold leading-8 tracking-[-0.24px]">
                      {loading ? "—" : totalPatientsToday}
                    </div>
                  </div>

                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-500/10 text-green-600">
                    <Icon name="users" />
                  </div>
                </div>
              </article>

              <article className="flex min-w-0 flex-col justify-between rounded-xl border border-[#c3c6d6] bg-white p-[21px] shadow-[0_4px_6px_rgba(0,0,0,0.05)] max-[700px]:min-h-[142px]">
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex flex-col gap-1">
                    <div className="text-xs font-medium uppercase leading-4 tracking-[0.6px] text-[#434654]">
                      Cancelled
                    </div>

                    <div className="text-2xl font-semibold leading-8 tracking-[-0.24px]">
                      {loading ? "—" : cancelledAppointments}
                    </div>
                  </div>

                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-600/10 text-red-700">
                    <Icon name="cancel" />
                  </div>
                </div>

                <div className="pt-4 text-xs font-medium leading-4 text-[#434654]">
                  12 slots remaining today
                </div>
              </article>
            </div>

            {/* Appointments */}
            <section className="mb-[29px] rounded-lg border border-[#c3c6d6] bg-white">
              <div className="flex h-[54px] items-center justify-between border-b border-[#c3c6d6] px-4 sticky top-0 bg-white z-10">
                <h2 className="font-['Manrope',sans-serif] text-lg font-bold leading-6 text-[#191c1e]">
                  Today's Appointments
                </h2>

              </div>

              {dashboardError && (
                <div className="px-4 py-2 text-xs text-red-600">
                  {dashboardError}
                </div>
              )}

              <div className="overflow-y-auto max-h-[240px]">
                <table className="w-full table-fixed border-collapse max-[700px]:min-w-[650px]">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="w-[28%] border-b border-slate-200 px-5 py-3 text-left font-['Manrope',sans-serif] text-xs font-bold leading-4 text-slate-500">
                      Patient
                    </th>

                    <th className="w-[16%] border-b border-slate-200 px-5 py-3 text-center font-['Manrope',sans-serif] text-xs font-bold leading-4 text-slate-500">
                      Date &amp; Time
                    </th>

                    <th className="w-[20%] border-b border-slate-200 px-5 py-3 text-center font-['Manrope',sans-serif] text-xs font-bold leading-4 text-slate-500">
                      Phone
                    </th>

                    <th className="w-[24%] border-b border-slate-200 px-5 py-3 text-center font-['Manrope',sans-serif] text-xs font-bold leading-4 text-slate-500">
                      Status
                    </th>

                    <th className="w-[20%] border-b border-slate-200 px-5 py-3 text-center font-['Manrope',sans-serif] text-xs font-bold leading-4 text-slate-500">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {dashboardAppointments.map((appointment) => {
                    const crit = getCriticalInfo(appointment.patientId);
                    return (
                    <tr
                      key={`${appointment.patient}-${appointment.dateTime}`}
                      onClick={(appointment.originalStatus === "IN_CONSULTATION")?(                  () =>
                        navigate("/doctor/patient-consultation", {
                          state: {
                            patientId: appointment.patientId,
                            appointmentId: appointment.appointmentId,
                            branchId:
                              selectedBranchId ||
                              getActiveBranchId() ||
                              doctor?.branches?.find(
                                (b) => b.status === undefined || b.status === 1
                              )?.branch_id ||
                              undefined,
                            appointmentDate: appointment.appointmentDate,
                            appointmentTime: appointment.appointmentTime,
                            consultedBy: doctorName,
                          },
                        })):undefined}
                      className={`relative cursor-pointer transition hover:bg-slate-50`}
                    >
                      <td className="h-[50px] border-b border-slate-100 px-5 py-2 text-xs text-slate-600 relative">
                        <CriticalCorner reasons={crit.reasons} />
                        <CriticalWrapper className="flex items-center gap-2" reasons={crit.reasons}>
                          <div className="w-7 h-7 shrink-0 overflow-hidden rounded-full bg-slate-100">
                            {appointment.image ? (
                              <img
                                src={appointment.image}
                                alt={appointment.patient}
                                className="h-full w-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = "none";
                                }}
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-xs font-bold text-slate-500">
                                {appointment.patient
                                  .split(" ")
                                  .map((w) => w[0])
                                  .slice(0, 2)
                                  .join("")
                                  .toUpperCase()}
                              </div>
                            )}
                          </div>

                          <span className="overflow-hidden text-ellipsis whitespace-nowrap font-['Manrope',sans-serif] text-xs font-bold text-slate-800 inline-flex items-center">
                            {appointment.patient}
                            <CriticalDot reasons={crit.reasons} />
                          </span>
                        </CriticalWrapper>
                      </td>

                      <td className="h-[50px] overflow-hidden text-ellipsis whitespace-nowrap border-b border-slate-100 px-5 py-2 text-center font-['Manrope',sans-serif] text-xs text-slate-600">
                        {appointment.dateTime
                          .split(" - ")
                          .map((part, index) => (
                            <React.Fragment
                              key={`${appointment.patient}-${index}`}
                            >
                              {index > 0 && <br />}
                              {part}
                            </React.Fragment>
                          ))}
                      </td>

                      <td className="h-[50px] overflow-hidden text-ellipsis whitespace-nowrap border-b border-slate-100 px-5 py-2 text-center font-['Manrope',sans-serif] text-xs text-slate-600">
                        {appointment.phone}
                      </td>

                      <td className="h-[50px] border-b border-slate-100 px-5 py-2 text-center">
                        <span
                          className={`inline-flex items-center justify-center rounded px-2 py-0.5 font-['Manrope',sans-serif] text-[10px] font-medium leading-5 ${statusClasses(
                            appointment.status
                          )}`}
                        >
                          {appointment.status}
                        </span>
                      </td>

                      <td className="h-[50px] border-b border-slate-100 px-4 py-2 text-center">
                        {(appointment.originalStatus === "SCHEDULED"|| appointment.originalStatus === "RESCHEDULED" || appointment.originalStatus === "NOT_CHECKED_IN") && !appointment.hasEncounter && (
                          <button
                            type="button"
                            onClick={() => handleCheckIn(appointment.appointmentId)}
                           disabled={checkInLoading === appointment.appointmentId}
    className="inline-flex items-center justify-center px-2 py-1 text-xs font-medium text-white bg-green-600 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:bg-green-700"
  >
                         {checkInLoading === appointment.appointmentId ? (
                            <>
                              <svg className="animate-spin -ml-1 mr-1 h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                              Checking...
                            </>
                          ) : (
                            "Check In"
                          )}
                          </button>
                        )}
                        {((appointment.originalStatus === "IN_CONSULTATION" || appointment.originalStatus==="CHECKED_IN") || appointment.hasEncounter) && (
                          <button
                            type="button"
                            className="inline-flex items-center justify-center px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
                                                 onClick={() =>
                        navigate("/doctor/patient-consultation", {
                          state: {
                            patientId: appointment.patientId,
                            appointmentId: appointment.appointmentId,
                            branchId:
                              selectedBranchId ||
                              getActiveBranchId() ||
                              doctor?.branches?.find(
                                (b) => b.status === undefined || b.status === 1
                              )?.branch_id ||
                              undefined,
                            appointmentDate: appointment.appointmentDate,
                            appointmentTime: appointment.appointmentTime,
                            consultedBy: doctorName,
                            visit_type:appointment.visit_type,
                            // Inpatient row: open on the admission's encounter.
                            ...(appointment.encounterNo
                              ? { appointmentId: undefined, encounterNo: appointment.encounterNo }
                              : {}),
                          },
                        })
                      }
                          >
                            Proceed
                          </button>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </section>

            {/* Trends */}
            <section className="h-[370px] rounded-xl border border-[#c3c6d6] bg-white p-[25px] shadow-[0_4px_6px_rgba(0,0,0,0.05)]">
              <div className="mb-6 flex items-center justify-between max-[700px]:flex-col max-[700px]:items-start max-[700px]:gap-4">
                <div>
                  <h2 className="text-lg font-semibold leading-6 text-[#181c1e]">
                    Appointment Trends
                  </h2>

                  <p className="text-xs font-medium leading-4 text-[#434654]">
                    Weekly performance analysis
                  </p>
                </div>

                <div className="flex items-center gap-4 max-[700px]:w-full max-[700px]:justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-[#003d9b]" />

                    <span className="text-xs font-medium leading-4 text-[#181c1e]">
                      Completed
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-[#c3c6d6]" />

                    <span className="text-xs font-medium leading-4 text-[#181c1e]">
                      Rescheduled
                    </span>
                  </div>

                  <div className="relative" ref={periodRef}>
                    <button
                      type="button"
                      onClick={() => {
                        setPeriodOpen((value) => !value);
                        setHospitalOpen(false);
                      }}
                      className="flex h-7 min-w-[116px] items-center justify-between gap-[15px] rounded-md bg-[#ebeef1] px-3 text-xs font-medium text-[#181c1e]"
                    >
                      <span>{period}</span>

                      <Icon
                        name="chevron"
                        className="h-4 w-4 text-slate-500"
                      />
                    </button>

                    {periodOpen && (
                      <div className="absolute right-0 top-[34px] z-30 w-[140px] overflow-hidden rounded-md border border-slate-200 bg-white shadow-[0_5px_15px_rgba(0,0,0,0.12)]">
                        {periods.map((item) => (
                          <button
                            type="button"
                            key={item}
                            onClick={() => {
                              setPeriod(item);
                              setPeriodOpen(false);
                            }}
                            className="block w-full px-3 py-2.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex h-[256px] items-end justify-center gap-6 px-4 max-[700px]:gap-2 max-[700px]:px-0">
                {chartData.map((item) => (
                  <div
                    key={item.day}
                    className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"
                  >
                    <div className="flex h-[208px] w-full items-end justify-center gap-1.5 pb-1">
                      <div
                        className="w-4 rounded-t-[2px] bg-[#003d9b]"
                        style={{ height: `${item.completed}px` }}
                      />

                      <div
                        className="w-4 rounded-t-[2px] bg-[#c3c6d6]"
                        style={{ height: `${item.rescheduled}px` }}
                      />
                    </div>

                    <span className="text-xs font-medium leading-4 text-[#434654]">
                      {item.day}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </section>

          {/* Right column */}
          <aside className="min-w-0 max-[900px]:grid max-[900px]:grid-cols-2 max-[900px]:gap-6 max-[700px]:grid-cols-1">

            {/* Availability */}
            <section className="mb-6 overflow-hidden rounded border border-slate-200 bg-white shadow-[0_1px_1.5px_rgba(0,0,0,0.1),0_1px_1px_rgba(0,0,0,0.06)] max-[900px]:mb-0">
              <div className="flex items-center justify-between gap-4 border-b border-slate-100 p-5">
                <h2 className="text-lg font-bold leading-7 text-slate-900">
                  Availability
                </h2>

                <div className="relative" ref={hospitalRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setHospitalOpen((value) => !value);
                      setPeriodOpen(false);
                    }}
                    className="relative min-h-[50px] min-w-[153px] rounded border border-slate-200 bg-white px-[13px] py-[5px] pr-[33px] text-left text-sm leading-5 text-slate-800"
                  >
                    {displayHospital}

                    <Icon
                      name="chevron"
                      className="absolute right-2 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-500"
                    />
                  </button>

                  {hospitalOpen && (
                    <div className="absolute right-0 top-[55px] z-30 w-[180px] overflow-hidden rounded border border-slate-200 bg-white shadow-[0_5px_15px_rgba(0,0,0,0.12)]">
                      {(activeBranches(doctor?.branches).length
                        ? activeBranches(doctor?.branches)
                        : [{ branch_id: "", branch_name: hospital || "Select Branch" }]
                      ).map((branch) => (
                        <button
                          type="button"
                          key={branch.branch_id || branch.branch_name}
                          onClick={() => {
                            setHospital(branch.branch_name);
                            setSelectedBranchId(branch.branch_id || null);
                            if (branch.branch_id) {
                              localStorage.setItem(DASHBOARD_BRANCH_STORAGE_KEY, branch.branch_id);
                            } else {
                              localStorage.removeItem(DASHBOARD_BRANCH_STORAGE_KEY);
                            }
                            setHospitalOpen(false);
                            // Load dashboard for new branch with loading indicator
                            loadDashboard(false, true);
                          }}
                          className="block w-full px-3 py-2.5 text-left text-[13px] text-slate-700 hover:bg-slate-50"
                        >
                          {branch.branch_name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="p-5">
                {availability.map((item) => (
                  <div
                    key={item.day}
                    className="flex min-h-12 items-center justify-between gap-3 border-b border-slate-50 last:border-0"
                  >
                    <span className="w-12 shrink-0 text-base font-semibold leading-6 text-slate-700">
                      {item.day}
                    </span>

                    {item.leave ? (
                      <span className="flex-1 text-right text-sm font-medium leading-5 text-red-500">
                        Leave
                      </span>
                    ) : (
                      <span className="flex flex-1 items-center justify-end gap-2 whitespace-nowrap text-sm leading-5 text-slate-500">
                        {item.time}

                        <Icon
                          name="clock"
                          className="h-4 w-4 shrink-0"
                        />
                      </span>
                    )}
                  </div>
                ))}
              </div>

              <div className="p-5">
                <button
                  type="button"
                  onClick={() => navigate("/doctor/schedule")}
                  className="h-9 w-full rounded bg-slate-100 text-sm font-bold leading-5 text-[#0047ab] transition hover:bg-slate-200"
                >
                  Edit Availability
                </button>
              </div>
            </section>

            {/* Feedback */}
            <section className="h-[370px] rounded-xl border border-[#c3c6d6] bg-white p-[25px] shadow-[0_4px_6px_rgba(0,0,0,0.05)]">
              <h2 className="mb-4 text-lg font-semibold leading-6 text-[#181c1e]">
                Patient Feedback
              </h2>

              <div className="flex flex-col gap-4">
                <article className="flex flex-col gap-2 rounded-lg bg-[#f1f4f7] p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold leading-[18px] tracking-[0.13px] text-[#181c1e]">
                      Sarah J.
                    </span>

                    <div className="flex gap-px text-xs text-yellow-500">
                      ★★★★★
                    </div>
                  </div>

                  <p className="text-xs italic leading-[18px] text-[#434654]">
                    "Dr. Smith was incredibly thorough and took the time to explain my results clearly."
                  </p>
                </article>

                <article className="flex flex-col gap-2 rounded-lg bg-[#f1f4f7] p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold leading-[18px] tracking-[0.13px] text-[#181c1e]">
                      Michael R.
                    </span>

                    <div className="flex gap-px text-xs text-yellow-500">
                      ★★★★☆
                    </div>
                  </div>

                  <p className="text-xs italic leading-[18px] text-[#434654]">
                    "Quick consultation, very professional staff. Highly recommend for cardio checkups."
                  </p>
                </article>

                <div className="border-t border-[#c3c6d6] pb-2 pt-[9px] text-center">
                  <button
                    type="button"
                    onClick={() =>
                      alert("Opening all patient reviews...")
                    }
                    className="text-xs font-medium leading-4 text-[#003d9b]"
                  >
                    Read All Reviews
                  </button>
                </div>
              </div>
            </section>
          </aside>
        </div>
      )}
    </div>
  </main>
)

};