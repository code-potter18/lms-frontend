import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from 'react-router-dom';
import CalendarPicker from "@/components/hms/Calender";
import { format, isToday, isTomorrow, isYesterday, addDays, subDays } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  List,
  LayoutGrid,
  Plus,
  CalendarCheck,
  User,
  Loader2,
  MoreVertical,
} from "lucide-react";

import HmsTable from "@/components/hms/HmsTable";
import ExportReport from "@/components/ui/ExportReport";
import { downloadExportCsv, exportErrorMessage } from "@/api/export.api";
import { downloadExportPdf } from "@/lib/exportPdf";

// Filter system
import { useFilterPanel, usePatientFilters } from "@/components/Filter";
import { ToolbarFilter } from "@/components/ui/toolbar-filter";
import { filterDataByValues } from "@/components/Filter/utils";
import { useToast } from "@/hooks/use-toast";
import { patientApi, type PatientRecord } from "@/api/patient.api";
import { appointmentApi, type AppointmentRecord } from "@/api/appointment.api";
import { RefreshButton } from "@/components/hms/RefreshButton";
import { StatusBadge } from "@/components/hms/StatusBadge";
import { getDepartmentColors } from "@/components/hms/DepartmentBadge";

import { useCriticalPatients } from "@/hooks/useCriticalPatients";
import { CriticalCorner, CriticalDot, CriticalWrapper } from "@/components/hms/CriticalPatientIndicator";
import { useBranchFilter } from "@/context/BranchFilterContext";
import { usePermission } from "@/context/PermissionContext";

function getPatientFullName(p: PatientRecord): string {
  return [p.patient_first_name, p.patient_middle_name, p.patient_last_name]
    .filter(Boolean)
    .join(" ");
}

function getPatientStatus(p: PatientRecord): "Active" | "Inactive" {
  return p.patient_active === "Active" ? "Active" : "Inactive";
}

function calculateAge(dob: string | null): number | string {
  if (!dob) return "—";
  const birthDate = new Date(dob);
  if (isNaN(birthDate.getTime())) return "—";
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

function formatGender(gender: string | null): string {
  if (!gender) return "—";
  if (gender === "Male") return "M";
  if (gender === "Female") return "F";
  return gender;
}

function formatMobile(mobile: string | null, nationality: string | null): string {
  if (!mobile) return "—";
  const trimmed = mobile.trim();
  // If already starts with '+', don't add +91 again; format nicely with a space
  if (trimmed.startsWith("+")) {
    if (trimmed.startsWith("+91") && trimmed.length > 3 && !trimmed.startsWith("+91 ")) {
      return `+91 ${trimmed.slice(3)}`;
    }
    return trimmed;
  }
  if (nationality && nationality.toLowerCase().includes("india")) {
    return `+91 ${trimmed}`;
  }
  return trimmed;
}

// Grid view needs: id, name, age, gender, mobile, bloodGroup, photo, status —
// all real patient_bio_data columns.
function mapToGridPatient(p: PatientRecord) {
  return {
    id: p.patient_id,
    name: getPatientFullName(p),
    age: calculateAge(p.patient_dob),
    gender: formatGender(p.patient_gender),
    mobile: formatMobile(p.patient_primary_mobile, p.patient_nationality),
    bloodGroup: p.patient_blood_group ?? "—",
    photo: p.patient_photo_url ?? "",
    status: getPatientStatus(p),
  };
}

// A doctor only counts as "assigned" while the appointment linking them is
// still upcoming/current — never for one that's cancelled, a no-show, or
// already completed. Once it's over, the patient goes back to Unassigned
// rather than continuing to show whoever last treated them.
const NON_ASSIGNING_APPOINTMENT_STATUSES = new Set(["CANCELLED", "NO_SHOW", "COMPLETED"]);

interface AssignedDoctor {
  name: string;
  id: string;
  department: string | null;
}

function getDoctorInitials(name: string): string {
  const words = name.replace(/^Dr\.?\s*/i, "").trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}

// Sortable timestamp for an appointment: its date plus its time-of-day
// (appointment_time is stored as a bare time-of-day, so its own date part
// is meaningless — same approach as Appointments.tsx's mapAppointmentRecord).
function appointmentSortKey(record: AppointmentRecord): number {
  const dateMs = new Date(record.appointment_date).getTime();
  const timeMs = new Date(record.appointment_time).getTime();
  const timeOfDayMs = !isNaN(timeMs) ? ((timeMs % 86400000) + 86400000) % 86400000 : 0;
  return (isNaN(dateMs) ? 0 : dateMs) + timeOfDayMs;
}

// Calendar-date-only boundary for "today," UTC-anchored to match how
// appointment_date is stored/read elsewhere (formatAppointmentDate etc.).
function startOfTodayUtcMs(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function isTodayOrFuture(record: AppointmentRecord, todayStartMs: number): boolean {
  const d = new Date(record.appointment_date);
  if (isNaN(d.getTime())) return false;
  const apptDateMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return apptDateMs >= todayStartMs;
}

// Builds patient_id -> the doctor from their nearest upcoming (today or
// later) appointment that isn't cancelled/no-show/completed, from the same
// /appointments data Appointments.tsx already uses — GET /patients has no
// doctor/diagnosis join today, so this is assembled entirely on the
// frontend from the existing appointments endpoint.
function buildAssignedDoctorMap(appointments: AppointmentRecord[]): Record<string, AssignedDoctor> {
  const todayStartMs = startOfTodayUtcMs();
  const nearestByPatient: Record<string, { sortKey: number; record: AppointmentRecord }> = {};

  for (const record of appointments) {
    if (!record.patient_id || !record.employees) continue;
    if (NON_ASSIGNING_APPOINTMENT_STATUSES.has(record.status ?? "")) continue;
    if (!isTodayOrFuture(record, todayStartMs)) continue;

    const sortKey = appointmentSortKey(record);
    const existing = nearestByPatient[record.patient_id];
    // Nearest upcoming = smallest sort key, not largest — the very next
    // appointment is what "currently assigned" should mean.
    if (!existing || sortKey <= existing.sortKey) {
      nearestByPatient[record.patient_id] = { sortKey, record };
    }
  }

  const result: Record<string, AssignedDoctor> = {};
  for (const [patientId, { record }] of Object.entries(nearestByPatient)) {
    const doctor = record.employees!;
    result[patientId] = {
      id: doctor.employee_id,
      name: `Dr. ${[doctor.first_name, doctor.middle_name, doctor.last_name].filter(Boolean).join(" ")}`,
      department: record.department_master?.department_name ?? record.department ?? null,
    };
  }
  return result;
}

// List view additionally shows diagnose + assigned doctor. Assigned doctor
// comes from the patient's own appointment history (see
// buildAssignedDoctorMap above); there's no diagnosis field exposed by any
// existing endpoint yet, so that stays a clear placeholder rather than a guess.
function mapToListPatient(p: PatientRecord, assignedDoctors: Record<string, AssignedDoctor>) {
  const assigned = assignedDoctors[p.patient_id];
  const { bg: deptBg, text: deptColor } = getDepartmentColors(assigned?.department);
  return {
    id: p.patient_id,
    name: getPatientFullName(p),
    age: calculateAge(p.patient_dob),
    gender: formatGender(p.patient_gender),
    mobile: formatMobile(p.patient_primary_mobile, p.patient_nationality),
    diagnose: "Not recorded",
    diagnoseBg: "#F3F4F6",
    diagnoseColor: "#6B7280",
    patientAvatarColor: assigned ? deptColor : "#00488D",
    patientAvatarBg: assigned ? deptBg : "#D6E3FF",
    doctor: assigned?.name ?? "Unassigned",
    doctorId: assigned?.id ?? "—",
    doctorAvatar: assigned ? getDoctorInitials(assigned.name) : "?",
    doctorColor: assigned ? deptColor : "#6B7280",
    doctorBg: assigned ? deptBg : "#F3F4F6",
    status: getPatientStatus(p),
  };
}

// ============================================================
// SHARED SUB-COMPONENTS (used by both list & grid views)
// ============================================================

// 1. Avatar
const Avatar = ({ text, color, bg }: { text: string; color: string; bg: string }) => (
  <div data-critical-avatar className="flex items-center justify-center w-7 h-7 rounded-xl flex-shrink-0 hms-avatar-text" style={{ backgroundColor: bg, color: color }}>
    {text}
  </div>
);

// ============================================================
// GRID-VIEW SUB-COMPONENTS
// ============================================================

// 3. Photo avatar with fallback
const PatientPhoto = ({ photo, name }: { photo: string; name: string }) => (
  <div data-critical-avatar className="w-16 h-16 rounded-full overflow-hidden bg-[#E5E7EB] flex items-center justify-center flex-shrink-0">
    {photo ? (
      <img src={photo} alt={name} className="w-full h-full object-cover" />
    ) : (
      <User className="w-8 h-8 text-[#B0B4BB]" strokeWidth={1.5} />
    )}
  </div>
);

// 4. Three-dot card menu
function CardMenu({ onView, onEdit }: { onView: () => void; onEdit: () => void }) {
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; right: number; bottom: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { can } = usePermission();

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const isInside =
        (buttonRef.current && buttonRef.current.contains(target)) ||
        (menuRef.current && menuRef.current.contains(target));
      if (!isInside) setOpen(false);
    };
    const handleScroll = () => setOpen(false);
    document.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
    };
  }, []);

  // Rendered through a portal to document.body (fixed coordinates) so the
  // menu always paints above the scrollable grid/table instead of being
  // clipped behind it. Flips upward near the bottom of the viewport.
  const handleToggle = () => {
    const btn = buttonRef.current;
    if (btn) {
      const rect = btn.getBoundingClientRect();
      setOpenUp(window.innerHeight - rect.bottom < 180);
      setAnchor({
        top: rect.bottom + 4,
        bottom: window.innerHeight - rect.top + 4,
        right: window.innerWidth - rect.right,
      });
    }
    setOpen((o) => !o);
  };

  if (!can("patient.read") && !can("patient.update")) return null;

  return (
    <>
      <button ref={buttonRef} onClick={handleToggle} className="p-1 rounded hover:bg-[#F2F4F6] transition-colors">
        <MoreVertical className="w-4 h-4 text-[#6B7280]" />
      </button>
      {open &&
        anchor &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              top: openUp ? undefined : anchor.top,
              bottom: openUp ? anchor.bottom : undefined,
              right: anchor.right,
              zIndex: 9999,
            }}
            className="w-28 bg-white border border-[#E5E7EB] rounded-md shadow-lg overflow-hidden transition-all duration-150"
          >
            {can("patient.read") && (
              <button onClick={() => { onView(); setOpen(false); }} className="w-full text-left px-3 py-2 text-xs font-medium text-[#374151] hover:bg-[#F2F4F6]">View</button>
            )}
            {can("patient.update") && (
              <button onClick={() => { onEdit(); setOpen(false); }} className="w-full text-left px-3 py-2 text-xs font-medium text-[#374151] hover:bg-[#F2F4F6]">Edit</button>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

// ============================================================
// MAIN COMPONENT (merged list + grid views)
// ============================================================
export default function PatientsManagement() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isCriticalOnly = searchParams.get("critical") === "true";
  const { toast } = useToast();
  const { can } = usePermission();
  const { selectedBranchId, isAllBranches } = useBranchFilter();
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  // Real patients fetched from the backend. No dummy fallback — an
  // empty/failed fetch just shows an empty state.
  const [realPatients, setRealPatients] = useState<PatientRecord[] | null>(null);
  const [isPatientsLoading, setIsPatientsLoading] = useState(true);

  const fetchPatients = useCallback(async () => {
    setIsPatientsLoading(true);
    try {
      const res = await patientApi.getAll({
        branchId: isAllBranches ? undefined : selectedBranchId,
      });
      const patients = res.data?.data?.patients || [];
      setRealPatients(patients);
      if (patients.length === 0) {
        toast({
          title: "No patient records found",
          description: "The patients API returned no records.",
        });
      }
    } catch (err: any) {
      console.error("[Patients Page] Error:", err);
      toast({
        title: "Failed to load patients",
        description: err.response?.data?.message || "Couldn't reach the patients API.",
        variant: "destructive",
      });
    } finally {
      setIsPatientsLoading(false);
    }
  }, [toast, selectedBranchId, isAllBranches]);

  useEffect(() => {
    fetchPatients();
  }, [fetchPatients]);



  const patientAgeData = useMemo(() => {
    if (!realPatients) return [];
    return realPatients.map((p) => ({
      patientId: p.patient_id,
      age: p.patient_age,
      dob: p.patient_dob,
    }));
  }, [realPatients]);

  const { getCriticalInfo } = useCriticalPatients(patientAgeData);

  // Assigned Doctor (list view) — derived from the same branch's appointment
  // history, not from GET /patients (which has no doctor join). Purely
  // supplementary: a failed fetch here must never block the patients list
  // itself, so it fails silently into an empty map (every row just falls
  // back to "Unassigned") instead of throwing/toasting.
  const [assignedDoctors, setAssignedDoctors] = useState<Record<string, AssignedDoctor>>({});

  const fetchAssignedDoctors = useCallback(async () => {
    try {
      // GET /appointments caps limit at 100 (appointment.validation.ts) —
      // requesting more 400s the whole call. Page through it for real
      // instead, capped at 20 pages (2,000 appointments) as a sane ceiling.
      const PAGE_SIZE = 100;
      const MAX_PAGES = 20;
      const allAppointments: AppointmentRecord[] = [];

      let page = 1;
      let totalPages = 1;
      do {
        const res = await appointmentApi.getAll({
          branchId: isAllBranches ? undefined : selectedBranchId,
          // Only "assigned" appointments matter here — never spend the
          // page budget on past ones just to filter them out client-side.
          dateFrom: format(new Date(), "yyyy-MM-dd"),
          limit: PAGE_SIZE,
          page,
          sortBy: "appointment_date",
          sortOrder: "asc",
        });
        allAppointments.push(...(res.data?.data?.appointments || []));
        totalPages = res.data?.data?.totalPages || 1;
        page += 1;
      } while (page <= totalPages && page <= MAX_PAGES);

      setAssignedDoctors(buildAssignedDoctorMap(allAppointments));
    } catch (err) {
      console.error("[Patients Page] Failed to load assigned doctors:", err);
      setAssignedDoctors({});
    }
  }, [selectedBranchId, isAllBranches]);

  useEffect(() => {
    fetchAssignedDoctors();
  }, [fetchAssignedDoctors]);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Date selection
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  // Grid-only: infinite scroll
  const [infiniteScroll, setInfiniteScroll] = useState(false);
  const [visibleCount, setVisibleCount] = useState(rowsPerPage);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // List-only: sorting
  const [sortField, setSortField] = useState("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Navigation helpers
  const handleAddDoctor = () => {
    navigate('/patients/add');
  };

  const handleViewToggle = (mode: "list" | "grid") => {
    setViewMode(mode);
    setCurrentPage(1);
    setInfiniteScroll(false);
    handleClearFilter();
  };

  // ---- FILTER FIELDS ----
  const patientRows = useMemo(
    () => (realPatients ?? []).map((p) => ({
      id: p.patient_id,
      name: getPatientFullName(p),
      status: getPatientStatus(p),
    })),
    [realPatients],
  );
  const { patientFilterFields } = usePatientFilters({ viewMode, patientRows });

  // Filters -- seeded with the fields so fields carrying a `defaultValue`
  // (e.g. Status defaulting to ["Active"]) start applied and are restored
  // when the user clears the filter.
  const {
    values: filterValues,
    appliedValues,
    isOpen: isFilterOpen,
    setIsOpen: setIsFilterOpen,
    handleChange: handleFilterChange,
    handleApply: handleApplyFilter,
    handleClear: handleClearFilter,
  } = useFilterPanel(patientFilterFields);

  // ---- SEARCH & FILTER ----
  const searchableFields = useMemo(
    () => viewMode === "grid"
      ? ["name", "id", "mobile", "bloodGroup", "status", "age", "gender"]
      : ["name", "id", "mobile", "diagnose", "doctor", "status", "age", "gender"],
    [viewMode],
  );

  const filteredData = useMemo(() => {
    const rawData: Record<string, string | number>[] = !realPatients
      ? []
      : viewMode === "grid"
        ? (realPatients.map(mapToGridPatient) as unknown as Record<string, string | number>[])
        : (realPatients.map((p) => mapToListPatient(p, assignedDoctors)) as unknown as Record<string, string | number>[]);
    let result = rawData;

    if (searchQuery) {
      result = result.filter((item) =>
        searchableFields.some((field) =>
          String(item[field] ?? "")
            .toLowerCase()
            .includes(searchQuery.toLowerCase())
        )
      );
    }

    result = filterDataByValues(result, appliedValues, patientFilterFields);

    if (isCriticalOnly) {
      result = result.filter((item) => getCriticalInfo(String(item.id)).isCritical);
    }

    return result;
  }, [searchQuery, searchableFields, appliedValues, viewMode, realPatients, assignedDoctors, patientFilterFields, isCriticalOnly, getCriticalInfo]);

  // ---- SORTING (list only) ----
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const sortedData = useMemo(() => {
    if (viewMode !== "list") return filteredData;
    return [...filteredData].sort((a, b) => {
      const aValue = String(a[sortField] ?? "").toLowerCase();
      const bValue = String(b[sortField] ?? "").toLowerCase();
      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredData, sortField, sortDirection, viewMode]);

  const displayData = viewMode === "list" ? sortedData : filteredData;

  // ---- PAGINATION ----
  const totalRecords = displayData.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / rowsPerPage));
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const currentRows = displayData.slice(startIndex, endIndex);
  const visibleStart = totalRecords === 0 ? 0 : startIndex + 1;
  const visibleEnd = Math.min(endIndex, totalRecords);

  // ---- INFINITE SCROLL (grid only) ----
  useEffect(() => {
    if (!infiniteScroll || !sentinelRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && visibleCount < filteredData.length) {
          setVisibleCount(Math.min(visibleCount + rowsPerPage, filteredData.length));
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [infiniteScroll, visibleCount, filteredData.length, rowsPerPage]);

  useEffect(() => {
    if (infiniteScroll) {
      setVisibleCount(rowsPerPage);
    }
  }, [searchQuery, appliedValues]);

  // Grid view has no page-navigation controls (unlike the list view's
  // HmsTable), so it must show every patient matching the current
  // search/filters rather than just the first `rowsPerPage` of them.
  const displayCards = infiniteScroll
    ? filteredData.slice(0, visibleCount)
    : filteredData;

  // ---- ACTION HANDLERS ----
  const handleView = (id: string) => navigate(`/patients/view/${id}`);
  const handleEdit = (id: string) => navigate(`/patients/edit/${id}`);
  const handleSchedule = (id: string) => {
    const patient = (realPatients ?? []).find((p) => p.patient_id === id);
    navigate("/appointments/book", { state: patient ? { patient } : undefined });
  };

  // ---- EXPORT ----
  const handleExport = async (exportFormat: string) => {
    if (exportFormat === "pdf") {
      downloadExportPdf({
        title: "Patients Management",
        subtitle: `${sortedData.length} patient${sortedData.length === 1 ? "" : "s"} - exported on ${format(new Date(), "dd/MM/yyyy HH:mm")}`,
        filename: `patients-${format(new Date(), "yyyy-MM-dd")}.pdf`,
        columns: viewMode === "grid"
          ? [
              { header: "Patient ID", cell: (r: any) => r.id },
              { header: "Name", cell: (r: any) => r.name },
              { header: "Age", cell: (r: any) => r.age },
              { header: "Gender", cell: (r: any) => r.gender },
              { header: "Mobile", cell: (r: any) => r.mobile },
              { header: "Blood Group", cell: (r: any) => r.bloodGroup ?? "—" },
              { header: "Status", cell: (r: any) => r.status },
            ]
          : [
              { header: "Patient ID", cell: (r: any) => r.id },
              { header: "Name", cell: (r: any) => r.name },
              { header: "Age", cell: (r: any) => r.age },
              { header: "Gender", cell: (r: any) => r.gender },
              { header: "Mobile", cell: (r: any) => r.mobile },
              { header: "Diagnosis", cell: (r: any) => r.diagnose ?? "—" },
              { header: "Assigned Doctor", cell: (r: any) => r.doctor ?? "Unassigned" },
              { header: "Status", cell: (r: any) => r.status },
            ],
        rows: sortedData,
      });
      toast({ title: "Export complete", description: "The PDF file has been downloaded." });
      return;
    }
    if (exportFormat !== "csv") return;
    try {
      await downloadExportCsv("patients", {
        branchId: isAllBranches ? undefined : selectedBranchId,
      });
      toast({ title: "Export complete", description: "The CSV file has been downloaded." });
    } catch (err: any) {
      toast({
        title: "Export failed",
        description: exportErrorMessage(err),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex w-full font-[Manrope,sans-serif] bg-[#F7F9FB] min-h-screen">
      <div className="flex flex-col flex-1 min-w-0">
        <main className="flex flex-col gap-6">

          {/* ==================== HEADER ==================== */}
          <div className="flex flex-col md:flex-row md:items-center justify-between">
            <div>
              <h1 className="hms-heading">Patients Management</h1>
              <p className="hms-subheading">Real-time performance across all branches.</p>
            </div>
<div className="flex items-center gap-3">
    {can("report.export") && <ExportReport onExport={handleExport} />}
    {can("patient.create") && (
      <button
                onClick={handleAddDoctor}
                className="flex items-center gap-2 px-4 py-2 bg-[#004785] rounded-lg text-white text-xs font-semibold shadow-sm hover:bg-[#003a6b] transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add new Patient
              </button>
    )}
    </div>
          </div>

          {/* ==================== MAIN CARD ==================== */}
          <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm flex flex-col transition-all duration-300 hover:shadow-md">

            {/* ==================== TOOLBAR ==================== */}
            <div className="px-5 py-4 border-b border-[#E5E7EB] flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3 border-r border-[#E5E7EB] pr-4">
                  <span className="text-[#191C1E] text-sm font-bold">{viewMode === "grid" ? "Grid View" : "List View"}</span>
                  <span className="bg-[#E6F0FF] text-[#00488D] px-2.5 py-0.5 rounded-full text-[10px] font-semibold">
                    Total Patients : {totalRecords}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                {/* Search Box */}
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

                {/* View Mode Toggle */}
                <div className="flex border border-[#E5E7EB] rounded-md overflow-hidden bg-[#F2F4F6] p-0.5">
                  <button
                    onClick={() => handleViewToggle("list")}
                    className={`p-1.5 rounded ${viewMode === "list" ? "bg-white shadow-sm" : "text-[#6B7280]"}`}
                  >
                    <List className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleViewToggle("grid")}
                    className={`p-1.5 rounded ${viewMode === "grid" ? "bg-white shadow-sm" : "text-[#6B7280]"}`}
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                </div>

                {/* Date nav */}
                <div className="flex items-center">
                  <button
                    onClick={() => setSelectedDate((prev) => subDays(prev, 1))}
                    className="flex items-center justify-center w-[25px] h-[27px] border border-[#E5E7EB] rounded-l-lg transition-colors duration-150 hover:bg-[#F2F4F6]"
                  >
                    <svg width="6" height="10" viewBox="0 0 6 10" fill="none">
                      <path d="M5 1L1 5L5 9" stroke="black" strokeWidth="1.33" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                  <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                    <PopoverTrigger asChild>
                      <button className="flex items-center justify-center h-[27px] w-[90px] px-2 border-t border-b border-[#E5E7EB] bg-white text-xs font-medium transition-colors duration-150 hover:bg-[#F2F4F6]">
                        {isToday(selectedDate)
                          ? "Today"
                          : isYesterday(selectedDate)
                            ? "Yesterday"
                            : isTomorrow(selectedDate)
                              ? "Tomorrow"
                              : format(selectedDate, "dd/MM/yyyy")}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 border-[#E5E7EB] shadow-lg">
                      <CalendarPicker
                        selected={selectedDate}
                        hideThemePicker
                        onSelect={(date) => {
                          if (date instanceof Date) {
                            setSelectedDate(date);
                            setIsCalendarOpen(false);
                          }
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                  <button
                    onClick={() => setSelectedDate((prev) => addDays(prev, 1))}
                    className="flex items-center justify-center w-[25px] h-[27px] border border-[#E5E7EB] rounded-r-lg transition-colors duration-150 hover:bg-[#F2F4F6]"
                  >
                    <svg width="6" height="10" viewBox="0 0 6 10" fill="none">
                      <path d="M1 1L5 5L1 9" stroke="black" strokeWidth="1.33" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>

                {/* Filters */}
                <ToolbarFilter
                  title="Filters"
                  fields={patientFilterFields}
                  values={filterValues}
                  onChange={handleFilterChange}
                  onApply={handleApplyFilter}
                  onClear={handleClearFilter}
                  open={isFilterOpen}
                  onOpenChange={setIsFilterOpen}
                />
                <RefreshButton
                  onClick={() => {
                    fetchPatients();
                    fetchAssignedDoctors();
                  }}
                  isLoading={isPatientsLoading}
                />
              </div>
            </div>

            {isCriticalOnly && (
              <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50/80 px-4 py-2.5 text-sm text-red-900 transition-all">
                <div className="flex items-center gap-2">
                  <span className="flex h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
                  <span className="font-semibold">Filtered by Critical Patients</span>
                  <span className="text-red-700 text-xs">
                    (Showing {displayData.length} patient{displayData.length === 1 ? "" : "s"} with abnormal vitals or critical flags)
                  </span>
                </div>
                <button
                  onClick={() => {
                    searchParams.delete("critical");
                    setSearchParams(searchParams);
                  }}
                  className="inline-flex items-center gap-1 rounded bg-red-100 px-2.5 py-1 text-xs font-medium text-red-800 hover:bg-red-200 hover:text-red-900 transition-colors"
                >
                  Clear Filter
                </button>
              </div>
            )}

            {/* ================================================================ */}
            {/* BODY: LIST VIEW (sortable table with diagnose/doctor columns)   */}
            {/* ================================================================ */}
            {isPatientsLoading ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-[#6B7280] text-sm">
                <Loader2 size={24} className="animate-spin text-[#00488D]" />
                Loading patients...
              </div>
            ) : viewMode === "list" ? (
              <HmsTable
                columns={[
                  { key: "name", label: "Name", className: "relative", render: (r: any) => {
                    const crit = getCriticalInfo(String(r.id));
                    return (
                    <>
                      <CriticalCorner reasons={crit.reasons} />
                      <CriticalWrapper className="flex items-center gap-2" reasons={crit.reasons}>
                        <Avatar text={String(r.name)[0]} color={String(r.patientAvatarColor ?? "#00488D")} bg={String(r.patientAvatarBg ?? "#D6E3FF")} />
                        <div><div className="hms-name-text">{String(r.name)}</div><div className="hms-id-text flex items-center">{String(r.id)}<CriticalDot reasons={crit.reasons} /></div></div>
                      </CriticalWrapper>
                    </>
                    );
                  }},
                  { key: "age/gender", label: "Age/Gender", render: (r: any) => <span className="text-[#191C1E] hms-content-text">{r.age} / {String(r.gender)}</span> },
                  { key: "mobile", label: "Mobile", render: (r: any) => <span className="text-[#191C1E] hms-content-text">{String(r.mobile)}</span> },
                  { key: "diagnose", label: "Diagnose", render: (r: any) => (
                    <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase" style={{ backgroundColor: String(r.diagnoseBg ?? "#F3F4F6"), color: String(r.diagnoseColor ?? "#6B7280") }}>
                      {String(r.diagnose ?? "")}
                    </span>
                  )},
                  { key: "doctor", label: "Assigned Doctor", render: (r: any) => (
                    <div className="flex items-center gap-2">
                      <Avatar text={String(r.doctorAvatar ?? "?")} color={String(r.doctorColor ?? "#00488D")} bg={String(r.doctorBg ?? "#D6E3FF")} />
                      <div><div className="hms-name-text">{String(r.doctor ?? "")}</div><div className="hms-id-text">{String(r.doctorId ?? "")}</div></div>
                    </div>
                  )},
                  { key: "status", label: "Status", render: (r: any) => (
                    <StatusBadge status={String(r.status)} />
                  )},
                  { key: "actions", label: "Actions", sortable: false, render: (r: any) => (
                    <div className="flex items-center gap-1">
                      {can("patient.read") && (
                        <button onClick={() => handleView(String(r.id))} title="View" className="p-1.5 rounded transition-colors duration-200 hover:bg-none group">
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-colors duration-200 stroke-[#1B1D20] hover:stroke-slate-500">
                            <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        </button>
                      )}
                      {can("patient.update") && (
                        <button onClick={() => handleEdit(String(r.id))} title="Edit" className="p-1.5 rounded transition-colors duration-200 hover:bg-blue-50 group">
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.36" strokeLinecap="round" strokeLinejoin="round" className="transition-colors duration-200 stroke-[#003EA8] hover:stroke-[#5E87CF]">
                            <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  )},
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
                rowsPerPageOptions={[5, 10, 20]}
                emptyMessage="No patients found matching the current filters."
                rowKey={(r: any, i: number) => String(r.id) + i}
                rowClassName={(r: any) => {
                  const crit = getCriticalInfo(String(r.id));
                   return "";
                }}
              />
            ) : (
              <>
              <div className={`flex-1 p-5 hide-scrollbar overflow-y-auto ${infiniteScroll ? "max-h-[500px]" : "max-h-[450px]"}`}>
                {displayCards.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {displayCards.map((patient: any) => {
                      const crit = getCriticalInfo(String(patient.id));
                      return (
                      <CriticalWrapper
                        key={patient.id}
                        className={`flex items-start gap-4 p-4 border border-[#E5E7EB] rounded-xl hover:shadow-md hover:border-[#D6E3FF] transition-all duration-200 group`}
                      >
                        <CriticalCorner reasons={crit.reasons} />
                        <PatientPhoto photo={patient.photo} name={patient.name} />

                        <div className="flex-1 min-w-0">
                          <p
                            onClick={() => handleView(patient.id)}
                            className="hms-name-text truncate cursor-pointer hover:underline hover:text-[#00488D]"
                          >
                            {patient.name}
                          </p>
                          <p className="hms-id-text flex items-center">{patient.id}<CriticalDot reasons={crit.reasons} /></p>
                          <p className="hms-content-text text-[#191C1E] mt-1">
                            {patient.age}/{patient.gender}
                          </p>
                          <p className="hms-content-text text-[#191C1E]">{patient.mobile}</p>
                          <p className="hms-content-text text-[#191C1E] font-semibold">{patient.bloodGroup}</p>
                        </div>

                        <div className="absolute top-3 right-3">
                          <CardMenu
                            onView={() => handleView(patient.id)}
                            onEdit={() => handleEdit(patient.id)}
                          />
                        </div>

                        <button
                          onClick={() => handleSchedule(patient.id)}
                          title="Schedule"
                          className="absolute bottom-3 right-3 w-6 h-6 flex items-center justify-center rounded-md border border-[#E5E7EB] bg-white hover:bg-[#F2F4F6] transition-colors"
                        >
                          <CalendarCheck className="w-3.5 h-3.5 text-[#00488D]" />
                        </button>
                      </CriticalWrapper>
                      );
                    })}
                    {infiniteScroll && (
                      <div ref={sentinelRef} className="col-span-full flex justify-center py-4">
                        {visibleCount < filteredData.length ? (
                          <span className="text-xs text-[#6B7280]">Loading more...</span>
                        ) : (
                          <span className="text-xs text-[#6B7280]">All patients loaded</span>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full py-16 text-center text-[#6B7280] text-sm">
                    No patients found matching the current filters.
                  </div>
                )}
              </div>
              <div className="mt-auto shrink-0 flex flex-wrap items-center justify-between px-5 py-3 border-t border-[rgba(194,198,212,0.10)] bg-[rgba(242,244,246,0.95)] backdrop-blur gap-2">
                <span className="text-[10px] font-semibold text-[#424752] tracking-[0.8px] capitalize">
                  {infiniteScroll ? `Showing ${Math.min(visibleCount, totalRecords)} of ${totalRecords} patients` : `Showing all ${totalRecords} patients`}
                </span>
              </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
