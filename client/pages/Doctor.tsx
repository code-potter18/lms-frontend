import { useState, useEffect, useRef, useMemo, useCallback, memo } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import CalendarPicker from "@/components/hms/Calender";
import { format, isToday, isTomorrow, isYesterday, addDays, subDays } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  List,
  LayoutGrid,
  Plus,
  User,
  Loader2,
  MoreVertical,
} from "lucide-react";
import HmsTable from "@/components/hms/HmsTable";
 
import { useFilterPanel, useDoctorFilters } from "@/components/Filter";
import { ToolbarFilter, StatusToggle } from "@/components/ui/toolbar-filter";
import { filterDataByValues } from "@/components/Filter/utils";
import ExportReport from "@/components/ui/ExportReport";
import { downloadExportCsv, exportErrorMessage } from "@/api/export.api";
import { downloadExportPdf } from "@/lib/exportPdf";
import { useToast } from "@/hooks/use-toast";
import { employeeApi, type EmployeeRecord } from "@/api/employee.api";
import { appointmentApi } from "@/api/appointment.api";
import { RefreshButton } from "@/components/hms/RefreshButton";
import { StatusBadge } from "@/components/hms/StatusBadge";
import { DepartmentPill, DepartmentAvatarText } from "@/components/hms/DepartmentBadge";
import { DoctorBranchDisplay } from "@/components/hms/DoctorBranchDisplay";
import AvailableSlotsPopover from "@/components/hms/AvailableSlotsPopover";
import { useBranchFilter } from "@/context/BranchFilterContext";
import { usePermission } from "@/context/PermissionContext";
import { ConfirmationDialog } from "@/components/ui/ConfirmationDialog";
import { getUser } from "@/utils/token";
 
// ============================================================
// SHARED SUB-COMPONENTS
// ============================================================
 
// Photo avatar with fallback (grid only)
const DoctorPhoto = ({ photo, name }: { photo: string; name: string }) => (
  <div className="w-16 h-16 rounded-full overflow-hidden bg-[#E5E7EB] flex items-center justify-center flex-shrink-0">
    {photo ? (
      <img src={photo} alt={name} className="w-full h-full object-cover" />
    ) : (
      <User className="w-8 h-8 text-[#B0B4BB]" strokeWidth={1.5} />
    )}
  </div>
);
 
// Doctor slot-booking progress bar (list view, replaces qualification column)
// Green while there's still availability; red once booked count reaches
// (or would exceed) the doctor's total slot capacity for the day.
function getSlotBand(percentage: number) {
  if (percentage >= 100) return { color: "#EF4444", label: "Fully booked" };
  return { color: "#16A34A", label: "Available" };
}
 
const SlotProgress = memo(function SlotProgress({ booked, total, loading }: { booked: number; total: number; loading?: boolean }) {
  if (loading) {
    return (
      <div className="min-w-[140px]">
        <div className="flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin text-[#9CA3AF]" />
          <span className="text-xs font-bold text-[#9CA3AF]">Loading...</span>
        </div>
        <div className="mt-1.5 h-1.5 w-full rounded-full bg-[#E5E7EB] overflow-hidden">
          <div className="h-full w-1/3 rounded-full bg-[#D1D5DB] animate-pulse" />
        </div>
      </div>
    );
  }

  const percentage = total > 0 ? Math.min(100, Math.round((booked / total) * 100)) : 0;
  const band = total === 0 ? { color: "#6B7280", label: "No slots" } : getSlotBand(percentage);

  return (
    <div className="min-w-[140px]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold">
          <span style={{ color: band.color }}>{booked}</span>
          <span className="text-[#9CA3AF]">/{total}</span>
        </span>
        <span className="text-xs font-bold" style={{ color: band.color }}>{band.label}</span>
      </div>
      <div className="mt-1.5 h-1.5 w-full rounded-full bg-[#E5E7EB] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${percentage}%`, background: band.color }}
        />
      </div>
    </div>
  );
});
 
// Three-dot card menu (grid only)
function CardMenu({ onView, onEdit, onDelete, onTransfer, onRestore, deactivated }: { onView: () => void; onEdit: () => void; onDelete: () => void; onTransfer: () => void; onRestore: () => void; deactivated?: boolean }) {
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
      setOpenUp(window.innerHeight - rect.bottom < 240);
      setAnchor({
        top: rect.bottom + 4,
        bottom: window.innerHeight - rect.top + 4,
        right: window.innerWidth - rect.right,
      });
    }
    setOpen((o) => !o);
  };

  if (!can("doctor.read") && !can("doctor.update") && !can("doctor.transfer") && !can("employee.delete")) return null;

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
            {can("doctor.read") && (
              <button onClick={() => { onView(); setOpen(false); }} className="w-full text-left px-3 py-2 text-xs font-medium text-[#374151] hover:bg-[#F2F4F6]">View</button>
            )}
            {can("doctor.update") && (
              <button onClick={() => { onEdit(); setOpen(false); }} className="w-full text-left px-3 py-2 text-xs font-medium text-[#374151] hover:bg-[#F2F4F6]">Edit</button>
            )}
            {deactivated ? (
              can("doctor.update") && (
                <button onClick={() => { onRestore(); setOpen(false); }} className="w-full text-left px-3 py-2 text-xs font-medium text-green-600 hover:bg-green-50">Activate</button>
              )
            ) : (
              <>
                {can("doctor.transfer") && (
                  <button onClick={() => { onTransfer(); setOpen(false); }} className="w-full text-left px-3 py-2 text-xs font-medium text-[#374151] hover:bg-[#F2F4F6]">Transfer</button>
                )}
                {can("employee.delete") && (
                  <button onClick={() => { onDelete(); setOpen(false); }} className="w-full text-left px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50">Deactivate</button>
                )}
              </>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
 
// Map EmployeeRecord (from API) to the row shape this page renders
const AVATAR_PALETTE = [
  { avatarColor: "#00488D", initBg: "#D6E3FF" },
  { avatarColor: "#7B3200", initBg: "#FFDBCB" },
  { avatarColor: "#00C896", initBg: "rgba(0,200,150,0.12)" },
  { avatarColor: "#475C7F", initBg: "#E6E8EA" },
];
 
function getInitials(name: string): string {
  const words = name.replace(/^Dr\.?\s*/i, "").trim().split(/\s+/);
  return words.slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}
 
function formatAssignedBranch(branch: NonNullable<EmployeeRecord["branches"]>[number]): string {
  if (!branch?.branch_name) return "\u2014";
  return branch.branch_area ? `${branch.branch_name} (${branch.branch_area})` : branch.branch_name;
}

// `branch` stays a single joined string of EVERY assigned branch (real
// active mappings, not the stale employees.branch_id column), so the
// search field and the Filter panel's branch multiselect — which both
// match with includes() — keep working across all assignments at once.
// The per-branch list is carried separately in `branches` for the grid.
// No fallback to employees.branch_id — mappings are the only source.
function formatAllBranches(branches: EmployeeRecord["branches"]): string {
  const list = branches ?? [];
  if (list.length === 0) return "\u2014";
  return list.map(formatAssignedBranch).join(", ");
}

function mapEmployeeToDoctorData(emp: EmployeeRecord, index: number) {
  const palette = AVATAR_PALETTE[index % AVATAR_PALETTE.length];
  const fullName = `${emp.first_name} ${emp.middle_name ? emp.middle_name + " " : ""}${emp.last_name}`;
  const isActive = emp.emp_status === true || emp.user_table?.user_status === 0;
  // Daily status comes straight from the backend (GET /employees with
  // `date` computes doctor_status server-side: Active/Leave/Inactive).
  // Doctors without a daily record fall back to account-level state.
  const status = emp.doctor_status
    ? emp.doctor_status === "LEAVE"
      ? "Leave"
      : emp.doctor_status === "INACTIVE"
        ? "Inactive"
        : "Active"
    : isActive
      ? "Active"
      : "Inactive";
  return {
    id: emp.employee_id,
    name: fullName,
    avatar: getInitials(fullName),
    avatarColor: palette.avatarColor,
    initBg: palette.initBg,
    dept: emp.department_master?.department_name || emp.specialization || "Unassigned",

    deptBg: "#E6E8EA",
    deptColor: "#475C7F",
    branch: formatAllBranches(emp.branches),
    branches: (emp.branches ?? []).map((b) => ({
      branch_id: b.branch_id,
      branch_name: b.branch_name ?? "",
      branch_area: b.branch_area ?? null,
      has_schedule: b.has_schedule,
    })),
    status,
    totalSlots: emp.total_slots ?? 0,
    bookedSlots: emp.booked_count ?? 0,
    qualification: emp.qualification || "—",
    mobile: emp.mobile_no || "—",
    photo: emp.employee_photo_URL || "",
  };
}
 
// ============================================================
// MAIN COMPONENT (merged list + grid views)
// ============================================================
export default function Doctor() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = searchParams.get("status");
  const { toast } = useToast();
  const { can } = usePermission();
  const { selectedBranchId, isAllBranches, branches } = useBranchFilter();
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
 
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
 
  const handleAddDoctor = () => {
    navigate("/STAFF/add?role=DOCTOR");
  };
 
  const handleViewToggle = (mode: "list" | "grid") => {
    setViewMode(mode);
    setCurrentPage(1);
    setInfiniteScroll(false);
    handleClearFilter();
  };
 
  // Real doctors fetched from the backend
  const [realDoctors, setRealDoctors] = useState<EmployeeRecord[] | null>(null);
  const [isDoctorsLoading, setIsDoctorsLoading] = useState(true);
  const [showDeactivated, setShowDeactivated] = useState(false);

  // Per-doctor slot booking summary for the selected date (list view progress bar)
  const [slotSummaries, setSlotSummaries] = useState<Record<string, { total: number; booked: number }>>({});
  const [slotTimes, setSlotTimes] = useState<Record<string, Array<{branchId:string; branchName:string; times:string[]}>>>({});

  // Mapped doctor rows -- shared by the filter field options below and the
  // search/filter step, so both work off the exact same real data.
  const doctorRows = useMemo(
    () => (realDoctors ? realDoctors.map((emp, index) => mapEmployeeToDoctorData(emp, index)) : []),
    [realDoctors],
  );

  const { doctorFilterFields } = useDoctorFilters({ doctorRows, branches });

  // Only doctors with an Active status that day have real slot availability
  // to fetch -- Leave/Inactive doctors have no working-hours on the selected
  // date, so their slot summary is always zero. Skipping them cuts every
  // slot-summary request (initial, poll, focus-refetch) down to just the
  // doctors that can actually book.
  const activeDoctorIds = useMemo(
    () => new Set(doctorRows.filter((r) => r.status === "Active").map((r) => String(r.id))),
    [doctorRows],
  );

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
    setAppliedFilter,
  } = useFilterPanel(doctorFilterFields);

  useEffect(() => {
    if (statusParam) {
      setAppliedFilter("status", [statusParam]);
    }
  }, [statusParam, setAppliedFilter]);

  const isStatusParamActive = Boolean(
    statusParam && Array.isArray(appliedValues.status) && appliedValues.status.includes(statusParam)
  );

  const fetchDoctors = useCallback(async () => {
    setIsDoctorsLoading(true);
    console.log("[Doctor Page] Fetching all employees from employeeApi...");
    try {
      const res = await employeeApi.getAll({
        branchId: isAllBranches ? undefined : selectedBranchId,
        limit: 1000,
        includeDeleted: showDeactivated,
        // Pass the selected date so the backend computes doctor_status
        // (Active/Leave/Inactive) and the day's total_slots/booked_count.
        date: format(selectedDate, "yyyy-MM-dd"),
      });
      console.log("[Doctor Page] Response:", res.data);
      const allEmployees = res.data?.data?.employees || [];
      const me = getUser();
      const isAdmin = ["SUPER_ADMIN", "HEAD_ADMIN", "BRANCH_ADMIN"].includes(
        String(me?.role_type ?? "").toUpperCase()
      );
      const doctors = allEmployees.filter(
        (e) =>
          e.user_table?.role_type === "DOCTOR" &&
          !(isAdmin && me?.employee_id && e.employee_id === me.employee_id) &&
          (showDeactivated ? !!e.deleted_at : !e.deleted_at)
      );
      setRealDoctors(doctors);
      if (doctors.length === 0) {
        toast({
          title: "No doctor records found",
          description: "The employees API returned no doctor records.",
        });
      }
    } catch (err: any) {
      console.error("[Doctor Page] Error:", err);
      console.error("[Doctor Page] Error response:", err.response?.data);
      console.error("[Doctor Page] Error status:", err.response?.status);
      toast({
        title: "Failed to load doctors",
        description: err.response?.data?.message || "Couldn't reach the employees API.",
        variant: "destructive",
      });
    } finally {
      setIsDoctorsLoading(false);
    }
  }, [toast, selectedBranchId, isAllBranches, showDeactivated, selectedDate]);
 
useEffect(() => {
    fetchDoctors();
  }, [fetchDoctors]);

  // Fetch each doctor's booked/total slot counts for the selected single day
  // (list view only). Total slots = the doctor's real working-hours
  // availability that day sliced into fixed 20-minute slots (backend-computed).
  const fetchSlotSummaries = useCallback(
    async (doctors: EmployeeRecord[], date: Date, signal: { cancelled: boolean }) => {
      const dateStr = format(date, "yyyy-MM-dd");

      // Fetch in small concurrent batches instead of firing one request per
      // doctor all at once - hosts that are fine locally can rate-limit or
      // choke on dozens of simultaneous connections in production. Each
      // batch's results are merged in as soon as they land (rather than
      // waiting for every doctor to finish) so rows show their real slot
      // count progressively instead of all flipping at once at the end.
      const BATCH_SIZE = 5;

      for (let i = 0; i < doctors.length; i += BATCH_SIZE) {
        if (signal.cancelled) return;
        const batch = doctors.slice(i, i + BATCH_SIZE);
        const batchEntries = await Promise.all(
          batch.map(async (doc) => {
            try {
              const res = await appointmentApi.getDoctorSlotSummary(doc.employee_id, dateStr);
              const data = res.data?.data;
              return [doc.employee_id, { total: data?.total_slots ?? 0, booked: data?.booked_count ?? 0 }] as const;
            } catch (err: any) {
              console.error(
                `[Doctor Page] Slot summary fetch failed for ${doc.employee_id}:`,
                err?.response?.status,
                err?.response?.data || err?.message,
              );
              return [doc.employee_id, { total: 0, booked: 0 }] as const;
            }
          }),
        );

        if (signal.cancelled) return;
        setSlotSummaries((prev) => ({ ...prev, ...Object.fromEntries(batchEntries) }));

        // Also fetch available slot times for popover
        const timesEntries = await Promise.all(
          batch.map(async (doc) => {
            try {
              const branchIds = doc.branches?.map(b => b.branch_id).filter(Boolean) || [];
              if (branchIds.length === 0) return [doc.employee_id, []] as const;
              const branchData = await Promise.all(
                branchIds.map(async (branchId) => {
                  try {
                    const res = await appointmentApi.getAvailableSlots(doc.employee_id, branchId, dateStr, { includePast: false });
                    const slots = res.data?.data?.slots ?? [];
                    const branchName = doc.branches?.find(b => b.branch_id === branchId)?.branch_name || branchId;
                    const availableTimes = slots.filter((s: any) => s.is_available).map((s: any) => {
                      const [h, m] = s.time.split(':');
                      const hour = parseInt(h, 10);
                      const ampm = hour >= 12 ? 'PM' : 'AM';
                      const hour12 = hour % 12 === 0 ? 12 : hour % 12;
                      const timeLabel = `${String(hour12).padStart(2,'0')}:${m} ${ampm}`;
                      return timeLabel;
                    });
                    return { branchId, branchName, times: availableTimes };
                  } catch {
                    return { branchId, branchName: branchId, times: [] };
                  }
                })
              );
              return [doc.employee_id, branchData.filter(b => b.times.length > 0)] as const;
            } catch {
              return [doc.employee_id, []] as const;
            }
          })
        );
        if (signal.cancelled) return;
        setSlotTimes((prev) => ({ ...prev, ...Object.fromEntries(timesEntries) }));
      }
    },
    [],
  );

  useEffect(() => {
    if (!realDoctors || realDoctors.length === 0 || viewMode !== "list") return;
    const signal = { cancelled: false };

    // Only Active doctors have slots that day -- fetching summaries for
    // Leave/Inactive doctors would be wasted requests returning zeros.
    const activeDoctors = realDoctors.filter((d) => activeDoctorIds.has(d.employee_id));

    // Reset so every row shows its loading state again for the newly
    // selected date/doctor set, instead of briefly showing the previous
    // date's stale counts while the fresh fetch is in flight.
    setSlotSummaries({});
    setSlotTimes({});

    if (activeDoctors.length === 0) return () => { signal.cancelled = true; };
    fetchSlotSummaries(activeDoctors, selectedDate, signal);

    // Keep the booked/total counts live: poll periodically, and refetch as
    // soon as the tab regains focus (e.g. after booking an appointment on
    // another page/tab), instead of only updating on next full page load.
    const intervalId = window.setInterval(() => {
      fetchSlotSummaries(activeDoctors, selectedDate, signal);
    }, 15000);

    const handleFocus = () => fetchSlotSummaries(activeDoctors, selectedDate, signal);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);

    return () => {
      signal.cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [realDoctors, selectedDate, viewMode, activeDoctorIds, fetchSlotSummaries]);

  // ---- SEARCH & FILTER ----
  const filteredData = useMemo(() => {
    let result: Record<string, any>[] = [...doctorRows];

    if (searchQuery) {
      result = result.filter((doctor) =>
        ["name", "id", "dept", "branch", "status", "mobile"]
          .map((f) => String(doctor[f] ?? ""))
          .join(" ")
          .toLowerCase()
          .includes(searchQuery.toLowerCase())
      );
    }
 
    result = filterDataByValues(result, appliedValues, doctorFilterFields);

    return result;
  }, [searchQuery, appliedValues, doctorRows, doctorFilterFields]);

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
    return [...filteredData].sort((a, b) => {
      const aValue = String(a[sortField] ?? "").toLowerCase();
      const bValue = String(b[sortField] ?? "").toLowerCase();
      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredData, sortField, sortDirection]);
 
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
  // HmsTable), so it must show every doctor matching the current
  // search/filters rather than just the first `rowsPerPage` of them.
  const displayCards = infiniteScroll
    ? filteredData.slice(0, visibleCount)
    : filteredData;
 
  // ---- ACTION HANDLERS ----
  const handleView = (id: number | string) => navigate(`/doctor/view/${id}/schedule`);
  const handleEdit = (id: number | string) => navigate(`/doctor/edit/${id}`);
  const handleTransfer = (id: number | string) => navigate(`/doctor/transfer/${id}`);

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  const handleDelete = (id: number | string) => setDeleteTarget(String(id));

  const handleRestore = (id: number | string) => setRestoreTarget(String(id));

  const handleConfirmRestore = async () => {
    if (!restoreTarget) return;
    setIsRestoring(true);
    try {
      const res = await employeeApi.restore(restoreTarget);
      if (!res.data.success) {
        throw new Error(res.data.message);
      }
      toast({
        title: "Doctor restored",
        description: `Doctor ${restoreTarget} has been reactivated.`,
      });
      setRestoreTarget(null);
      fetchDoctors();
    } catch (err: any) {
      toast({
        title: "Failed to restore doctor",
        description: err.response?.data?.message ?? err.message ?? "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setIsRestoring(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await employeeApi.remove(deleteTarget);
      if (!res.data.success) {
        throw new Error(res.data.message);
      }
      toast({
        title: "Doctor deactivated",
        description: `Doctor ${deleteTarget} has been deactivated.`,
      });
      setDeleteTarget(null);
      fetchDoctors();
    } catch (err: any) {
      toast({
        title: "Failed to deactivate doctor",
        description: err.response?.data?.message ?? err.message ?? "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };
 
  // ---- EXPORT ----
  const handleExport = async (exportFormat: string) => {
    if (exportFormat === "pdf") {
      downloadExportPdf({
        title: "Doctor Management",
        subtitle: `${displayData.length} doctor${displayData.length === 1 ? "" : "s"} - exported on ${format(new Date(), "dd/MM/yyyy HH:mm")}`,
        filename: `doctors-${format(new Date(), "yyyy-MM-dd")}.pdf`,
        columns: [
          { header: "Doctor ID", cell: (r: any) => r.id },
          { header: "Name", cell: (r: any) => r.name },
          { header: "Department", cell: (r: any) => r.dept },
          { header: "Qualification", cell: (r: any) => r.qualification },
          { header: "Mobile", cell: (r: any) => r.mobile },
          { header: "Branch", cell: (r: any) => (Array.isArray(r.branch) ? r.branch.join(", ") : r.branch) },
          { header: "Status", cell: (r: any) => r.status },
        ],
        rows: displayData,
      });
      toast({ title: "Export complete", description: "The PDF file has been downloaded." });
      return;
    }
    if (exportFormat !== "csv") return;
    try {
      await downloadExportCsv("employees", {
        branchId: isAllBranches ? undefined : selectedBranchId,
        roleType: "DOCTOR",
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
              <h1 className="hms-heading">Doctor Management</h1>
              <p className="hms-subheading">Real-time performance across all branches.</p>
            </div>
            <div className="flex items-center gap-3">
              {can("report.export") && <ExportReport onExport={handleExport} />}
              {can("doctor.create") && (
                <button
                  onClick={handleAddDoctor}
                  className="flex items-center gap-2 px-4 py-2 bg-[#004785] rounded-lg text-white text-xs font-semibold shadow-sm hover:bg-[#003a6b] transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add new doctor
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
                    Total Doctors : {totalRecords}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {/* Search Box */}
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search doctors..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="pl-8 pr-3 py-1.5 bg-[#F2F4F6] text-xs text-[#6B7280] placeholder:text-[#6B7280] outline-none w-[150px] sm:w-[200px] rounded-md transition-all duration-200 focus:rounded-none focus:w-[200px] sm:focus:w-[250px]"
                  />
                  <svg className="absolute left-2 top-1/2 -translate-y-1/2" width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M11.0667 11.5713L6.86667 7.3713C6.53333 7.638 6.15 7.8491 5.71667 8.0046C5.28333 8.1602 4.82222 8.238 4.33333 8.238C3.12222 8.238 2.09722 7.8185 1.25833 6.9796C0.419444 6.1407 0 5.1157 0 3.90462C0 2.69351.419444 1.66851 1.25833.82962C2.09722-.00927 3.12222-.42871 4.33333-.42871C5.54444-.42871 6.56944-.00927 7.40833.82962C8.24722 1.66851 8.66667 2.69351 8.66667 3.90462C8.66667 4.3935 8.58889 4.8546 8.43333 5.288C8.27778 5.7213 8.06667 6.1046 7.8 6.438L12 10.638L11.0667 11.5713ZM4.33333 6.9046C5.16667 6.9046 5.875 6.613 6.45833 6.0296C7.04167 5.4463 7.33333 4.738 7.33333 3.90462C7.33333 3.07129 7.04167 2.36296 6.45833 1.77962C5.875 1.19629 5.16667.90462 4.33333.90462C3.5.90462 2.79167 1.19629 2.20833 1.77962C1.625 2.36296 1.33333 3.07129 1.33333 3.90462C1.33333 4.738 1.625 5.4463 2.20833 6.0296C2.79167 6.613 3.5 6.9046 4.33333 6.9046Z" fill="#424752"/>
                  </svg>
                </div>
                <StatusToggle
                  showDeactivated={showDeactivated}
                  onChange={setShowDeactivated}
                />

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
                  fields={doctorFilterFields}
                  values={filterValues}
                  onChange={handleFilterChange}
                  onApply={handleApplyFilter}
                  onClear={handleClearFilter}
                  open={isFilterOpen}
                  onOpenChange={setIsFilterOpen}
                />
                <RefreshButton onClick={fetchDoctors} isLoading={isDoctorsLoading} />
              </div>
            </div>

            {isStatusParamActive && (
              <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-2.5 text-sm text-amber-900 transition-all">
                <div className="flex items-center gap-2">
                  <span className="flex h-2.5 w-2.5 rounded-full bg-amber-500" />
                  <span className="font-semibold">Filtered by Doctor Status: {statusParam}</span>
                  <span className="text-amber-700 text-xs">
                    (Showing {displayData.length} doctor{displayData.length === 1 ? "" : "s"} on {statusParam})
                  </span>
                </div>
                <button
                  onClick={() => {
                    searchParams.delete("status");
                    setSearchParams(searchParams);
                    handleClearFilter();
                  }}
                  className="inline-flex items-center gap-1 rounded bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-200 hover:text-amber-900 transition-colors"
                >
                  Clear Status Filter
                </button>
              </div>
            )}

            {/* ================================================================ */}
            {/* BODY: LIST VIEW (table via HmsTable)                            */}
            {/* ================================================================ */}
            {isDoctorsLoading ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-[#6B7280] text-sm">
                <Loader2 size={24} className="animate-spin text-[#00488D]" />
                Loading doctors...
              </div>
            ) : viewMode === "list" ? (
              <HmsTable
                columns={[
                  { key: "name", label: "Name", render: (r: any) => (
                    <div className="flex items-center gap-2">
                      <DepartmentAvatarText department={r.dept}>{String(r.avatar)}</DepartmentAvatarText>
                      <div><div className="hms-name-text">{String(r.name)}</div><div className="hms-id-text">{String(r.id)}</div></div>
                    </div>
                  )},
                  { key: "dept", label: "Department", render: (r: any) => (
                    <DepartmentPill department={r.dept}>{String(r.dept)}</DepartmentPill>
                  )},
                  { key: "branch", label: "Branch", sortable: true, render: (r: any) => (
                    <DoctorBranchDisplay branches={r.branches} />
                  )},
                  { key: "slots", label: "Slots", sortable: true, render: (r: any) => {
                    if (r.status !== "Active") {
                      return <SlotProgress booked={0} total={0} />;
                    }
                    const summary = slotSummaries[String(r.id)];
                    const booked = summary?.booked ?? 0;
                    const total = summary?.total ?? 0;
                    const loading = !summary;
                    const branchesSlots = slotTimes[String(r.id)] ?? [];
                    const totalSlots = branchesSlots.reduce((sum, b) => sum + b.times.length, 0);
                    const trigger = (
                      <div onClick={(e) => e.stopPropagation()}>
                        <SlotProgress booked={booked} total={total} loading={loading} />
                      </div>
                    );
                    const firstBranch = r.branches?.[0];
                    const branchId = firstBranch?.branch_id || "";
                    const dateStr = format(selectedDate, "yyyy-MM-dd");
                    const emp = realDoctors?.find((e: any) => e.employee_id === r.id) as any;
                    const departmentId = emp?.department_id || emp?.department_master?.department_id || "";
                    return (
                      <AvailableSlotsPopover
                        doctorName={r.name}
                        doctorId={String(r.id)}
                        branch={r.branch}
                        branchId={branchId}
                        departmentId={departmentId}
                        date={dateStr}
                        branchesSlots={branchesSlots}
                        trigger={trigger}
                      />
                    );
                  }},
                  { key: "status", label: "Status", sortable: true, render: (r: any) => (
                    <StatusBadge status={String(r.status)} />
                  )},
                  { key: "actions", label: "Actions", sortable: false, className: "w-px", headerClassName: "w-px", render: (r: any) => (
                    <div className="flex items-center gap-1">
                      {can("doctor.read") && (
                        <button onClick={() => handleView(r.id)} title="View" className="p-1.5 rounded transition-colors duration-200 hover:bg-none group">
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-colors duration-200 stroke-[#1B1D20] hover:stroke-slate-500">
                            <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        </button>
                      )}
                      {can("doctor.update") && (
                        <button onClick={() => handleEdit(r.id)} title="Edit" className="p-1.5 rounded transition-colors duration-200 hover:bg-blue-50 group">
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.36" strokeLinecap="round" strokeLinejoin="round" className="transition-colors duration-200 stroke-[#003EA8] hover:stroke-[#5E87CF]">
                            <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" />
                          </svg>
                        </button>
                      )}
                      {can("doctor.transfer") && (
                        <button onClick={() => handleTransfer(r.id)} title="Transfer" className="p-1.5 rounded transition-colors duration-200 hover:bg-blue-50 group">
                          <svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-colors duration-200 stroke-[#003EA8] hover:stroke-[#5E87CF]">
                            <path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>
                          </svg>
                        </button>
                      )}
                      {showDeactivated ? (
                        can("doctor.update") && (
                          <button onClick={() => handleRestore(r.id)} title="Activate" className="p-1.5 rounded transition-colors duration-200 hover:bg-green-50 group">
                            <svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-colors duration-200 stroke-[#6B7280] hover:stroke-green-600">
                              <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
                              <circle cx="12" cy="12" r="3" />
                              <circle cx="12" cy="12" r="7" fill="none" />
                            </svg>
                          </button>
                        )
                      ) : (
                        can("employee.delete") && (
                          <button onClick={() => handleDelete(r.id)} title="Deactivate" className="p-1.5 rounded transition-colors duration-200 hover:bg-red-50 group">
                            <svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-colors duration-200 stroke-[#6B7280] hover:stroke-red-600">
                              <path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                          </button>
                        )
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
                emptyMessage="No doctors found matching the current filters."
                rowKey={(r: any, i: number) => String(r.id) + i}
              />
            ) : (
              <>
             
              <div className={`flex-1 p-5 hide-scrollbar overflow-y-auto ${infiniteScroll ? "max-h-[500px]" : "max-h-[450px]"}`}>
                {displayCards.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {displayCards.map((doctor: any) => (
                      <div
                        key={doctor.id}
                        className="relative flex items-start gap-4 p-4 border border-[#E5E7EB] rounded-xl hover:shadow-md hover:border-[#D6E3FF] transition-all duration-200 group"
                      >
                        <DoctorPhoto photo={doctor.photo} name={doctor.name} />
                        <div className="flex-1 min-w-0">
                          <p
                            onClick={() => handleView(doctor.id)}
                            className="hms-name-text truncate cursor-pointer hover:underline hover:text-[#00488D]"
                          >
                            {doctor.name}
                          </p>
                          <p className="hms-id-text">{doctor.id}</p>
                          <DepartmentPill department={doctor.dept}>{doctor.dept}</DepartmentPill>
                          <p className="hms-content-text text-[#191C1E] mt-1.5">
                            <span className="font-semibold">Status</span>{" : "}
                            <span className={doctor.status === "Active" ? "font-bold text-[#16A34A]" : "font-bold text-[#F97316]"}>{doctor.status}</span>
                          </p>
{doctor.branches?.length ? (
                            <DoctorBranchDisplay branches={doctor.branches} showScheduleIndicator />
                          ) : (
                            <p className="hms-content-text text-[#191C1E] mt-1 truncate">{doctor.branch}</p>
                          )}
                        </div>
                        <div className="absolute top-3 right-3">
                          <CardMenu onView={() => handleView(doctor.id)} onEdit={() => handleEdit(doctor.id)} onDelete={() => handleDelete(doctor.id)} onTransfer={() => handleTransfer(doctor.id)} onRestore={() => handleRestore(doctor.id)} deactivated={showDeactivated} />
                        </div>
                      </div>
                    ))}
                    {infiniteScroll && (
                      <div ref={sentinelRef} className="col-span-full flex justify-center py-4">
                        {visibleCount < filteredData.length ? (<span className="text-xs text-[#6B7280]">Loading more...</span>) : (<span className="text-xs text-[#6B7280]">All doctors loaded</span>)}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full py-16 text-center text-[#6B7280] text-sm">No doctors found matching the current filters.</div>
                )}
              </div>
              <div className="mt-auto shrink-0 flex flex-wrap items-center justify-between px-5 py-3 border-t border-[rgba(194,198,212,0.10)] bg-[rgba(242,244,246,0.95)] backdrop-blur gap-2">
                <span className="text-[10px] font-semibold text-[#424752] tracking-[0.8px] capitalize">
                  {infiniteScroll ? `Showing ${Math.min(visibleCount, totalRecords)} of ${totalRecords} doctors` : `Showing all ${totalRecords} doctors`}
                </span>
              </div>
              </>
            )}
          </div>
        </main>
      </div>

      <ConfirmationDialog
        open={!!deleteTarget}
        type="danger"
        title="Deactivate Doctor?"
        description={
          deleteTarget
            ? `Doctor ${deleteTarget} will be deactivated. They will be hidden from all lists and blocked from login, and their future appointments flagged "Reschedule Required" for reassignment. Their branch assignment is kept so activating them again restores it. Historical records are kept.`
            : ""
        }
        confirmText="Deactivate"
        cancelText="Cancel"
        loading={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmationDialog
        open={!!restoreTarget}
        type="LockOpen"
        title="Activate Doctor?"
        description={
          restoreTarget
            ? `Doctor ${restoreTarget} will be restored. They will become visible in all lists, be able to log in again, and regain their previous branch assignment.`
            : ""
        }
        confirmText="Activate"
        cancelText="Cancel"
        loading={isRestoring}
        onConfirm={handleConfirmRestore}
        onCancel={() => setRestoreTarget(null)}
      />
    </div>
  );
}
