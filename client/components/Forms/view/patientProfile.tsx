import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  UserRound,
  Droplet,
  Calendar,
  MapPin,
  Phone,
  Mail,
  Cake,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { format, isToday, isTomorrow, isYesterday, addDays, subDays } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import CalendarPicker from "@/components/hms/Calender";
import { Button } from "@/components/ui/button";
import { AvatarUpload } from "@/components/ui/avatar-upload";
import { StatusBadge } from "@/components/hms/StatusBadge";
import { useFilterPanel } from "@/components/Filter";
import { ToolbarFilter } from "@/components/ui/toolbar-filter";
import type { FilterField } from "@/components/Filter/types";
import { filterDataByValues } from "@/components/Filter/utils";
import { QuickAddFab } from "@/components/hms/QuickAddFab";
import HmsTable from "@/components/hms/HmsTable";
import { AppointmentActionMenu } from "@/components/hms/AppointmentActionMenu";
import PatientVitalsPanel from "@/components/hms/PatientVitalsPanel";
import { getDepartmentColors } from "@/components/hms/DepartmentBadge";
import { patientApi, type PatientRecord } from "@/api/patient.api";
import { appointmentApi, type AppointmentRecord } from "@/api/appointment.api";
import { encounterApi } from "@/api/encounter.api";
import { useToast } from "@/hooks/use-toast";
import { usePermission } from "@/context/PermissionContext";
import { getUser } from "@/utils/token";
import { ConfirmationDialog } from "@/components/ui/ConfirmationDialog";
import { useCriticalPatients } from "@/hooks/useCriticalPatients";
import { CriticalDot } from "@/components/hms/CriticalPatientIndicator";

const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "Scheduled",
  CHECKED_IN: "Checked In",
  IN_CONSULTATION: "In Consultation",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No Show",
  RESCHEDULED: "Rescheduled",
  RESCHEDULE_REQUIRED: "Reschedule Required",
  TRANSFER_REVIEW_REQUIRED: "Transfer Review Required",
};

// appointment_time is stored as a UTC-anchored wall-time value, so it must
// be read with UTC getters (same convention as Appointments.tsx) to show
// the booked wall time as hh:mm AM/PM.
function formatAppointmentTime(time: string | null | undefined): string {
  if (!time) return "—";
  const t = new Date(time);
  if (isNaN(t.getTime())) return "—";
  const minutes = String(t.getUTCMinutes()).padStart(2, "0");
  const period = t.getUTCHours() >= 12 ? "PM" : "AM";
  const hours12 = t.getUTCHours() % 12 || 12;
  return `${String(hours12).padStart(2, "0")}:${minutes} ${period}`;
}

function mapAppointment(a: AppointmentRecord) {
  const doctorName = a.employees
    ? [a.employees.first_name, a.employees.middle_name, a.employees.last_name].filter(Boolean).join(" ")
    : "—";
  const deptName = a.department_master?.department_name ?? a.department ?? null;
  const { bg: deptBg, text: deptColor } = getDepartmentColors(deptName);

  let date = "—";
  let time = formatAppointmentTime(a.appointment_time);
  if (a.appointment_date) {
    const d = new Date(a.appointment_date);
    if (!isNaN(d.getTime())) {
      date = format(d, "dd MMM yyyy");
    }
  }

  const rawKey = (a.status || "").toUpperCase();
  const status = STATUS_LABELS[rawKey] ?? (a.status || "Scheduled");

  return {
    id: a.appointment_id,
    date,
    time,
    doctor: doctorName,
    doctorId: a.employee_id || "—",
    department: a.department_master?.department_name || a.department || "—",
    status,
    appointmentDateISO: a.appointment_date,
  };
}

export default function PatientProfile() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();

  const [patient, setPatient] = useState<PatientRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [patientLoadError, setPatientLoadError] = useState<string | null>(null);
  const [appointments, setAppointments] = useState<ReturnType<typeof mapAppointment>[]>([]);
  // Bumped whenever an embedded action (e.g. vitals save) changes data so
  // PatientVitalsPanel remounts and re-fetches its encounters immediately.
  const [vitalsPanelVersion, setVitalsPanelVersion] = useState(0);

  const patientAgeData = useMemo(() => {
    if (!patient) return [];
    return [{ patientId: patient.patient_id, age: Number(calculateAge(patient.patient_dob)) || 0, dob: patient.patient_dob }];
  }, [patient]);

  const { getCriticalInfo } = useCriticalPatients(patientAgeData);

  useEffect(() => {
    if (!id) {
      setPatientLoadError("Patient ID is missing.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setPatient(null);
    setPatientLoadError(null);
    patientApi
      .getById(id)
      .then((res) => setPatient(res.data.data))
      .catch((error: any) => {
        setPatientLoadError(
          error.response?.data?.message ?? error.message ?? "Failed to load patient."
        );
      })
      .finally(() => setLoading(false));
  }, [id]);

  const fetchAppointments = useCallback(async () => {
    if (!id) return;
    try {
      const res = await appointmentApi.getAll({ patientId: id });
      setAppointments(res.data.data.appointments.map(mapAppointment));
    } catch {
      // Keep any previously loaded rows on failure rather than wiping them.
    }
  }, [id]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  function fullName(p: PatientRecord) {
    return [p.patient_first_name, p.patient_middle_name, p.patient_last_name].filter(Boolean).join(" ");
  }

  function formatDob(dob: string | null) {
    if (!dob) return "—";
    const d = new Date(dob);
    return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
  }

  function calculateAge(dob: string | null | undefined): string {
    if (!dob) return "—";
    const birthDate = new Date(dob);
    if (isNaN(birthDate.getTime())) return "—";
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age >= 0 ? `${age}` : "—";
  }

  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [sortField, setSortField] = useState("id");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [underline, setUnderline] = useState({ left: 0, width: 0 });

  const {
    values: filterValues,
    appliedValues,
    isOpen: isFilterOpen,
    setIsOpen: setIsFilterOpen,
    handleChange: handleFilterChange,
    handleApply: handleApplyFilter,
    handleClear: handleClearFilter,
  } = useFilterPanel();

  useEffect(() => {
    const container = tabsContainerRef.current;
    if (!container) return;
    const activeButton = container.querySelector<HTMLButtonElement>(`[data-tab="appointments"]`);
    if (activeButton) {
      setUnderline({ left: activeButton.offsetLeft, width: activeButton.offsetWidth });
    }
  }, []);

  const filterFields: FilterField[] = [
    { id: "appointmentId", label: "Appointment ID", type: "text", placeholder: "Search ID" },
    { id: "doctor", label: "Doctor Name", type: "text", placeholder: "Search doctor" },
    { id: "department", label: "Department", type: "text", placeholder: "Search department" },
    { id: "status", label: "Status", type: "multiselect", options: [
      { label: "Scheduled", value: "Scheduled" },
      { label: "Rescheduled", value: "Rescheduled" },
      { label: "Reschedule Required", value: "Reschedule Required" },
      { label: "Completed", value: "Completed" },
      { label: "Cancelled", value: "Cancelled" },
      { label: "No Show", value: "No Show" },
    ]},
  ];

  const filteredData = useMemo(() => {
    let result = [...appointments];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((apt) =>
        [apt.id, apt.doctor, apt.department, apt.status, apt.date].some((f) =>
          f.toLowerCase().includes(q)
        )
      );
    }
    result = filterDataByValues(result as unknown as Record<string, string | number>[], appliedValues) as typeof result;
    return result;
  }, [appointments, searchQuery, appliedValues]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const sortedData = useMemo(() => {
    return [...filteredData].sort((a, b) => {
      const aVal = String(a[sortField as keyof typeof a] ?? "").toLowerCase();
      const bVal = String(b[sortField as keyof typeof b] ?? "").toLowerCase();
      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredData, sortField, sortDirection]);

  const totalRecords = sortedData.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / rowsPerPage));
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const currentRows = sortedData.slice(startIndex, endIndex);
  const visibleStart = totalRecords === 0 ? 0 : startIndex + 1;
  const visibleEnd = Math.min(endIndex, totalRecords);

  const handleView = (id: string) => navigate(`/appointments/view/${id}`);
  const handleEdit = (id: string) => navigate(`/appointments/edit/${id}`);

  const [cancelTarget, setCancelTarget] = useState<ReturnType<typeof mapAppointment> | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);

  const handleCancelAppointment = (target: ReturnType<typeof mapAppointment>) => {
    setCancelReason("");
    setCancelTarget(target);
  };

  const handleConfirmCancelAppointment = async () => {
    if (!cancelTarget) return;

    if (!cancelReason.trim()) {
      toast({ title: "A cancellation reason is required", variant: "destructive" });
      return;
    }

    setIsCancelling(true);
    try {
      await appointmentApi.cancel(
        cancelTarget.id,
        cancelReason.trim(),
        getUser()?.employee_id ?? "",
      );
      toast({
        title: "Appointment cancelled",
        description: `Appointment ${cancelTarget.id} has been cancelled.`,
      });
      setCancelTarget(null);
      setCancelReason("");
      await fetchAppointments();
      setVitalsPanelVersion((v) => v + 1);
    } catch (err: any) {
      toast({
        title: "Failed to cancel appointment",
        description: err.response?.data?.message || "Couldn't reach the appointments API.",
        variant: "destructive",
      });
    } finally {
      setIsCancelling(false);
    }
  };

  const handleCheckIn = async (appointmentId: string) => {
    try {
      await appointmentApi.updateStatus(appointmentId, "CHECKED_IN");
      await encounterApi.create({ appointment_id: appointmentId });
      await fetchAppointments();
      setVitalsPanelVersion((v) => v + 1);
      toast({
        title: "Patient checked in",
        description: `Appointment ${appointmentId} checked in and encounter created.`,
      });
    } catch (err: any) {
      console.error("[Patient Profile] Check-in error:", err);
      toast({
        title: "Check-in failed",
        description: err.response?.data?.message || "Failed to check in patient.",
        variant: "destructive",
      });
    }
  };

  const handleCheckOut = async (appointmentId: string) => {
    try {
      const encounters = await encounterApi.getByAppointment(appointmentId);
      const encounter = encounters.data?.data;
      if (encounter) {
        await encounterApi.close(encounter.encounter_no, "DOCTOR");
      }
      await fetchAppointments();
      setVitalsPanelVersion((v) => v + 1);
      toast({
        title: "Patient checked out",
        description: `Appointment ${appointmentId} checked out.`,
      });
    } catch (err: any) {
      console.error("[Patient Profile] Check-out error:", err);
      toast({
        title: "Check-out failed",
        description: err.response?.data?.message || "Failed to check out patient.",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex w-full font-[Manrope,sans-serif] bg-[#F7F9FB] min-h-screen items-center justify-center">
        <Loader2 size={32} className="animate-spin text-[#00488D]" />
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="flex w-full font-[Manrope,sans-serif] bg-[#F7F9FB] min-h-screen items-center justify-center text-[#6B7280] text-sm">
        {patientLoadError ?? "Patient not found."}
      </div>
    );
  }

  const patientName = fullName(patient);
  const patientInitial = (patient.patient_first_name?.[0] ?? "?").toUpperCase();
  const crit = getCriticalInfo(String(patient.patient_id));

  return (
    <div className="flex w-full font-[Manrope,sans-serif] bg-[#F7F9FB] min-h-screen">
      <div className="flex flex-col flex-1 min-w-0">
        <main className="flex flex-col gap-6 p-6 md:p-8">
          {/* Back Button */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              title="Go back"
              aria-label="Go back"
              className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <span className="text-sm back-button text-[#424752]">Back</span>
          </div>

          {/* Patient Header Card */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-2 relative overflow-hidden">
            {crit.isCritical && (
              <span className="absolute top-0 left-0 z-10 pointer-events-none">
                <svg width="24" height="24" viewBox="0 0 20 20" className="block">
                  <polygon points="0,0 20,0 0,20" fill="#DC2626" />
                </svg>
              </span>
            )}
            <div className="absolute top-0 right-0 w-1/3 h-full bg-slate-50 opacity-50 rounded-l-full transform translate-x-1/4 -translate-y-1/4 pointer-events-none" />
            <div className="relative z-10 flex flex-col items-start gap-6 p-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-6">
                  <div className={crit.isCritical ? "[&>div>div:first-child]:shadow-[0_0_0_3px_#DC2626]" : ""}>
                    <AvatarUpload
                      value={patient.patient_photo_url}
                      onChange={() => {}}
                      size={96}
                      readOnly
                    />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-slate-900 inline-flex items-center gap-2">{patientName}<CriticalDot reasons={crit.reasons} /></h1>
                    <p className="hms-id-text mt-0.5">#{patient.patient_id}</p>
                    <div className="flex flex-col gap-2 text-sm text-slate-600 sm:flex-row sm:items-center mt-2">
                      {(patient as any).current_address && (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-4 w-4 text-slate-400 shrink-0" />
                          <span>{(patient as any).current_address}</span>
                        </div>
                      )}
                    </div>
                    <div className="mt-2 flex flex-col gap-2 text-sm text-slate-600 sm:flex-row sm:items-center">
                      <div className="flex items-center gap-1.5 border-r border-slate-200 pr-4">
                        <Cake className="h-4 w-4 text-slate-400 shrink-0" />
                        <span>Age : <span className="font-medium text-slate-900">{calculateAge(patient.patient_dob)} Yrs</span></span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <UserRound className="h-4 w-4 text-slate-400 shrink-0" />
                        <span>Gender : <span className="font-medium text-slate-900">{patient.patient_gender ?? "—"}</span></span>
                      </div>
                    </div>
                </div>
              </div>
              <div className="z-10 flex w-full flex-col items-center gap-4 md:w-auto md:flex-row">
                <div className="flex flex-col items-center gap-11 sm:items-stretch">
                  <button
                    type="button"
                    onClick={() => navigate(`/patients/full-record/${id}`)}
                    className="text-center text-sm font-semibold text-[#00488D] hover:underline cursor-pointer"
                  >
                    View Full Record
                  </button>
                  <Button
                    className="flex w-full items-center gap-2 bg-[#004785] hover:bg-[#003a6b] sm:w-auto"
                    onClick={() => navigate("/appointments/book", { state: { patient } })}
                  >
                    <Calendar className="h-4 w-4" />
                    Book Appointment
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* About & Vital Signs Grid */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            {/* About Card */}
            <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm p-6">
              <h2 className="mb-6 flex items-center gap-2 text-lg font-semibold text-slate-900">
                <UserRound className="h-5 w-5 text-slate-400" />
                About
              </h2>
              <div className="grid grid-cols-1 gap-6 gap-x-4 sm:grid-cols-2">
              <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center shrink-0 border border-slate-100">
                      <Calendar className="h-4 w-4 text-slate-500" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">DOB</p>
                      <p className="text-sm font-medium text-slate-900">{formatDob(patient.patient_dob)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0 border border-red-100">
                      <Droplet className="h-4 w-4 text-red-500" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Blood Group</p>
                      <p className="text-sm font-medium text-slate-900">{patient.patient_blood_group ?? "—"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0 border border-blue-100">
                      <Phone className="h-4 w-4 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Phone</p>
                      <p className="text-sm font-medium text-slate-900">{patient.patient_primary_mobile || "—"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center shrink-0 border border-slate-100">
                      <Mail className="h-4 w-4 text-slate-500" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Email</p>
                      <p className="text-sm font-medium text-slate-900 truncate max-w-[150px] sm:max-w-none">{patient.patient_email || "—"}</p>
                    </div>
                  </div>
              </div>
            </div>

            {/* Vital Signs Card */}
            <PatientVitalsPanel key={`vitals-${vitalsPanelVersion}`} patientId={id} />
          </div>

          {/* Appointments Section */}
          <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm flex flex-col">
            {/* Toolbar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 px-5 py-4 border-b border-[#E5E7EB]">
              <nav className="relative flex items-center gap-6" ref={tabsContainerRef}>
                <button
                  data-tab="appointments"
                  className="relative pb-1 text-xs font-semibold tracking-[1.2px] capitalize transition-colors duration-200"
                  style={{ color: "#00488" }}
                >
                  Appointments
                </button>
                <div
                  className="absolute bottom-0 h-[2.5px] bg-[#00488D] transition-all duration-300 ease-out"
                  style={{ left: underline.left, width: underline.width }}
                />
              </nav>
              <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
                {/* Search */}
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                    className="pl-8 pr-3 py-1.5 bg-[#F2F4F6] text-xs text-[#6B7280] placeholder:text-[#6B7280] outline-none w-[150px] sm:w-[200px] rounded-md transition-all duration-200 focus:rounded-none focus:w-[200px] sm:focus:w-[250px]"
                  />
                  <svg className="absolute left-2 top-1/2 -translate-y-1/2" width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M11.0667 11.5713L6.86667 7.3713C6.53333 7.638 6.15 7.8491 5.71667 8.0046C5.28333 8.1602 4.82222 8.238 4.33333 8.238C3.12222 8.238 2.09722 7.8185 1.25833 6.9796C0.419444 6.1407 0 5.1157 0 3.90462C0 2.69351.419444 1.66851 1.25833.82962C2.09722-.00927 3.12222-.42871 4.33333-.42871C5.54444-.42871 6.56944-.00927 7.40833.82962C8.24722 1.66851 8.66667 2.69351 8.66667 3.90462C8.66667 4.3935 8.58889 4.8546 8.43333 5.288C8.27778 5.7213 8.06667 6.1046 7.8 6.438L12 10.638L11.0667 11.5713ZM4.33333 6.9046C5.16667 6.9046 5.875 6.613 6.45833 6.0296C7.04167 5.4463 7.33333 4.738 7.33333 3.90462C7.33333 3.07129 7.04167 2.36296 6.45833 1.77962C5.875 1.19629 5.16667.90462 4.33333.90462C3.5.90462 2.79167 1.19629 2.20833 1.77962C1.625 2.36296 1.33333 3.07129 1.33333 3.90462C1.33333 4.738 1.625 5.4463 2.20833 6.0296C2.79167 6.613 3.5 6.9046 4.33333 6.9046Z" fill="#424752"/>
                  </svg>
                </div>
                {/* Filters */}
                <ToolbarFilter
                  title="Filters"
                  fields={filterFields}
                  values={filterValues}
                  onChange={handleFilterChange}
                  onApply={handleApplyFilter}
                  onClear={handleClearFilter}
                  open={isFilterOpen}
                  onOpenChange={setIsFilterOpen}
                />
              </div>
            </div>

            <HmsTable
              scrollable={false}
              columns={[
                { key: "id", label: "Appointment ID", sortable: true, render: (apt) => <span className="hms-name-text">{(apt as any).id}</span> },
                { key: "date", label: "Appointment Date", sortable: true, render: (apt) => {
                  const a = apt as any;
                  return (
                    <div className="whitespace-nowrap">
                      <div className="hms-name-text">{a.date}</div>
                      <div className="flex items-center gap-1 hms-id-text mt-0.5">
                        {a.time}
                      </div>
                    </div>
                  );
                }},
                { key: "doctor", label: "Assigned Doctor", sortable: true, render: (apt) => {
                  const a = apt as any;
                  const hasDoctor = a.doctorId && a.doctorId !== "—";
                  return (
                    <div
                      className={`flex items-center gap-3 ${hasDoctor ? "cursor-pointer group" : ""}`}
                      onClick={() => {
                        if (hasDoctor) {
                          navigate(`/doctor/view/${a.doctorId}`);
                        }
                      }}
                    >
                      <div className="flex items-center justify-center w-7 h-7 rounded-xl flex-shrink-0 hms-avatar-text" style={{ backgroundColor: a.doctorAvatarBg ?? "#D6E3FF", color: a.doctorAvatarColor ?? "#00488D" }}>
                        {a.doctor.split(" ").slice(1).map((w: string) => w[0]).join("") || a.doctor[0] || "D"}
                      </div>
                      <div>
                        <p className={`hms-name-text ${hasDoctor ? "group-hover:text-[#00488D] group-hover:underline" : ""}`}>{a.doctor}</p>
                        <p className="hms-id-text">{a.doctorId}</p>
                      </div>
                    </div>
                  );
                }},
                { key: "department", label: "Department", sortable: true, render: (apt) => <span className="hms-content-text text-[#191C1E]">{(apt as any).department}</span> },
                { key: "status", label: "Status", sortable: true, render: (apt) => {
                  const a = apt as any;
                  return <StatusBadge status={a.status} />;
                }},
                { key: "actions", label: "Actions", sortable: false, render: (apt) => {
                  const a = apt as ReturnType<typeof mapAppointment>;
                  return (
                    <AppointmentActionMenu
                      status={a.status}
                      appointmentDateISO={a.appointmentDateISO}
                      onView={() => handleView(a.id)}
                      onEdit={() => handleEdit(a.id)}
                      onCancel={() => handleCancelAppointment(a)}
                      onCheckIn={() => handleCheckIn(a.id)}
                      onCheckOut={() => handleCheckOut(a.id)}
                      onVitalsSaved={() => {
                        fetchAppointments();
                        setVitalsPanelVersion((v) => v + 1);
                      }}
                      appointmentId={a.id}
                      patientId={id}
                    />
                  );
                }},
              ]}
              data={currentRows}
              sortField={sortField}
              sortDirection={sortDirection}
              onSort={handleSort}
              currentPage={currentPage}
              totalPages={totalPages}
              totalRecords={totalRecords}
              rowsPerPage={rowsPerPage}
              visibleStart={visibleStart}
              visibleEnd={visibleEnd}
              onPageChange={setCurrentPage}
              onRowsPerPageChange={(val) => { setRowsPerPage(val); setCurrentPage(1); }}
              rowsPerPageOptions={[10, 20, 50]}
              emptyMessage="No appointments found matching the current filters."
              rowKey={(apt) => (apt as any).id}
            />
          </div>
        </main>
      </div>
      <QuickAddFab />

      <ConfirmationDialog
        open={!!cancelTarget}
        type="danger"
        title="Cancel Appointment?"
        description={
          cancelTarget
            ? `Appointment ${cancelTarget.id} for ${patientName} will be cancelled. Please enter a reason for cancellation.`
            : ""
        }
        confirmText="Cancel Appointment"
        cancelText="Keep Appointment"
        loading={isCancelling}
        onConfirm={handleConfirmCancelAppointment}
        onCancel={() => setCancelTarget(null)}
      >
        <textarea
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          placeholder="Reason for cancellation (required)"
          rows={3}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
      </ConfirmationDialog>
    </div>
  );
}
