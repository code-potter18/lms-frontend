import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Search,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { FormDropdown } from "@/components/ui/form-dropdown";
import TimepickerWheel from "@/components/ui/timepicker-wheel";
import { ConfirmationDialog } from "@/components/ui/ConfirmationDialog";
import { StatusBadge } from "@/components/hms/StatusBadge";
import HmsTable, { type HmsColumn } from "@/components/hms/HmsTable";
import { RefreshButton } from "@/components/hms/RefreshButton";
import {
  doctorTransferApi,
  RescheduleQueueEntry,
} from "@/api/doctorTransfer.api";
import { doctorLeaveApi, DoctorLeaveRecord, LeaveStatus } from "@/api/doctorLeave.api";
import { useBranches, useDoctors } from "@/hooks/useMasterData";
import { employeeApi, EmployeeRecord, DoctorScheduleRecord } from "@/api/employee.api";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getUser } from "@/utils/token";
import { useCriticalPatients } from "@/hooks/useCriticalPatients";
import { CriticalWrapper, CriticalCorner, CriticalDot } from "@/components/hms/CriticalPatientIndicator";

const TRANSFER_ADMIN_ROLES = ["HEAD_ADMIN", "SUPER_ADMIN", "BRANCH_ADMIN"];

const STATUS_FILTERS = [
  { label: "All status", value: "" },
  { label: "Pending", value: "PENDING" },
  { label: "Assigned", value: "ASSIGNED" },
  { label: "Confirmed", value: "CONFIRMED" },
  { label: "Cancelled", value: "CANCELLED" },
];

const LEAVE_STATUS_FILTERS = [
  { label: "All status", value: "" },
  { label: "Pending", value: "PENDING" },
  { label: "Approved", value: "APPROVED" },
  { label: "Rejected", value: "REJECTED" },
];

const QUEUE_TONE: Record<string, "amber" | "blue" | "green" | "red"> = {
  PENDING: "amber",
  ASSIGNED: "blue",
  CONFIRMED: "green",
  CANCELLED: "red",
};

const LEAVE_STATUS_TONE: Record<string, "amber" | "green" | "red"> = {
  PENDING: "amber",
  APPROVED: "green",
  REJECTED: "red",
};

const PRIORITY_TONE: Record<string, "slate" | "amber" | "red"> = {
  NORMAL: "slate",
  HIGH: "amber",
  URGENT: "red",
};

const PAGE_SIZE = 10;

const inputCls =
  "w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#191C1E] focus:outline-none focus:ring-2 focus:ring-[#00488D]/30";

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${String(d.getUTCDate()).padStart(2, "0")} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function formatTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

function toDateInputValue(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
}

function todayISODate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

// Today's date in UTC -- appointment dates are stored UTC-anchored, so
// "has the appointment's date passed" must be decided in UTC too.
function todayUTCISODate(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(
    now.getUTCDate(),
  ).padStart(2, "0")}`;
}

const DAY_OF_WEEK_NAMES = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as const;

function dayOfWeekOf(dateStr: string): string {
  if (!dateStr) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (m) return DAY_OF_WEEK_NAMES[new Date(+m[1], +m[2] - 1, +m[3]).getDay()];
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? "" : DAY_OF_WEEK_NAMES[d.getDay()];
}

function dayLabelOf(day: string): string {
  return day ? day.charAt(0) + day.slice(1).toLowerCase() : day;
}

function patientNameOf(entry: RescheduleQueueEntry): string {
  const p = entry.patient_bio_data;
  return [p?.patient_first_name, p?.patient_last_name].filter(Boolean).join(" ") || entry.patient_id;
}

function Avatar({ text }: { text: string }) {
  return (
    <div
      className="flex items-center justify-center w-7 h-7 rounded-xl flex-shrink-0 hms-avatar-text"
      style={{ backgroundColor: "#D6E3FF", color: "#00488D" }}
    >
      {text.charAt(0).toUpperCase() || "?"}
    </div>
  );
}

export default function RescheduleQueue() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [roleOk, setRoleOk] = useState(false);
  const [queueLoading, setQueueLoading] = useState(true);
  const [leaveLoading, setLeaveLoading] = useState(true);

  const [entries, setEntries] = useState<RescheduleQueueEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);

  const [sortField, setSortField] = useState("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const [statusFilter, setStatusFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [search, setSearch] = useState("");
  const { branches } = useBranches();
  const { doctors: queryDoctors } = useDoctors(undefined, roleOk);
  const [extraDoctors, setExtraDoctors] = useState<EmployeeRecord[]>([]);
  const doctors = useMemo(() => {
    const byId = new Map(queryDoctors.map((d) => [d.employee_id, d]));
    extraDoctors.forEach((e) => {
      if (!byId.has(e.employee_id)) byId.set(e.employee_id, e);
    });
    return Array.from(byId.values());
  }, [queryDoctors, extraDoctors]);
  // Backend-computed doctor_status ("ACTIVE" | "LEAVE" | "INACTIVE") for the
  // assign dialog's selected branch + date -- the source of truth for which
  // doctors are eligible to take the slot (see employee.repository.ts
  // computeDoctorStatuses: ACTIVE = has an active schedule that weekday).
  const [doctorStatusMap, setDoctorStatusMap] = useState<Record<string, "ACTIVE" | "LEAVE" | "INACTIVE">>({});
  const [statusesLoading, setStatusesLoading] = useState(false);
  const [statusesLoaded, setStatusesLoaded] = useState(false);
  const [statusesFailed, setStatusesFailed] = useState(false);

  // Action dialogs
  const [assignTarget, setAssignTarget] = useState<RescheduleQueueEntry | null>(null);
  const [assignDoctorId, setAssignDoctorId] = useState("");
  const [assignBranchId, setAssignBranchId] = useState("");
  const [assignDepartmentId, setAssignDepartmentId] = useState("");
  const [assignDate, setAssignDate] = useState("");
  const [assignTime, setAssignTime] = useState("");
  const [assignReason, setAssignReason] = useState("");
  const [assignDone, setAssignDone] = useState(false);
  const [assignDoneMessage, setAssignDoneMessage] = useState("");
  const [doctorSchedulesById, setDoctorSchedulesById] = useState<Record<string, DoctorScheduleRecord[]>>({});
  const [schedulesLoading, setSchedulesLoading] = useState(false);
  const [schedulesLoaded, setSchedulesLoaded] = useState(false);

  const [confirmTarget, setConfirmTarget] = useState<RescheduleQueueEntry | null>(null);
  const [confirmReason, setConfirmReason] = useState("");

  const [cancelTarget, setCancelTarget] = useState<RescheduleQueueEntry | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const [processing, setProcessing] = useState(false);
  const [autoCancelling, setAutoCancelling] = useState(false);
  const autoCancelAttempted = useRef<Set<string>>(new Set());

  // View mode toggle
  const [viewMode, setViewMode] = useState<"transfer" | "leave">("transfer");

  // Leave queue state
  const [leaveEntries, setLeaveEntries] = useState<DoctorLeaveRecord[]>([]);
  const [leaveTotal, setLeaveTotal] = useState(0);
  const [leaveTotalPages, setLeaveTotalPages] = useState(1);
  const [leavePage, setLeavePage] = useState(1);
  const [leavePageSize, setLeavePageSize] = useState(PAGE_SIZE);
  const [leaveStatusFilter, setLeaveStatusFilter] = useState<LeaveStatus | "">("");
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [approveTarget, setApproveTarget] = useState<DoctorLeaveRecord | null>(null);
  const [approveRemarks, setApproveRemarks] = useState("");
  const [declineDialogOpen, setDeclineDialogOpen] = useState(false);
  const [declineTarget, setDeclineTarget] = useState<DoctorLeaveRecord | null>(null);
  const [declineRemarks, setDeclineRemarks] = useState("");
  const [leaveConflicts, setLeaveConflicts] = useState<any[]>([]);
  const [leaveConflictDialogOpen, setLeaveConflictDialogOpen] = useState(false);
  const [pendingApprove, setPendingApprove] = useState<DoctorLeaveRecord | null>(null);

  useEffect(() => {
    const user = getUser();
    const role = (user?.role_type || user?.role || "").toUpperCase();
    setRoleOk(TRANSFER_ADMIN_ROLES.includes(role));
  }, []);

  // Fetch each doctor's backend-computed status for the assign dialog's
  // branch + date. Only "ACTIVE" doctors (active schedule on that weekday
  // at that branch) are offered in the dropdown once both are chosen.
  useEffect(() => {
    if (!assignBranchId || !assignDate) {
      setDoctorStatusMap({});
      setStatusesLoading(false);
      setStatusesLoaded(false);
      setStatusesFailed(false);
      return;
    }
    let cancelled = false;
    setStatusesLoading(true);
    setStatusesLoaded(false);
    setStatusesFailed(false);
    employeeApi
      .getAll({
        roleType: "DOCTOR",
        branchId: assignBranchId,
        date: assignDate,
        limit: 500,
      })
      .then((res) => {
        if (cancelled) return;
        const map: Record<string, "ACTIVE" | "LEAVE" | "INACTIVE"> = {};
        const fetched = res.data?.data?.employees || [];
        fetched.forEach((e) => {
          map[e.employee_id] = e.doctor_status || "INACTIVE";
        });
        setDoctorStatusMap(map);
        setStatusesLoaded(true);
        // Union freshly-fetched doctors into the list so a doctor created
        // after the page loaded still appears in the dropdown.
        setExtraDoctors((prev) => {
          const byId = new Map(prev.map((d) => [d.employee_id, d]));
          fetched.forEach((e) => {
            if (!byId.has(e.employee_id)) byId.set(e.employee_id, e);
          });
          return Array.from(byId.values());
        });
      })
      .catch(() => {
        if (cancelled) return;
        setDoctorStatusMap({});
        setStatusesFailed(true);
      })
      .finally(() => {
        if (!cancelled) setStatusesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [assignBranchId, assignDate]);

  const fetchQueue = useCallback(async () => {
    setQueueLoading(true);
    try {
      const res = await doctorTransferApi.getRescheduleQueue({
        status: statusFilter || undefined,
        branchId: branchFilter || undefined,
        page,
        limit: pageSize,
      });
      setEntries(res.data.data.entries || []);
      setTotal(res.data.data.total ?? 0);
      setTotalPages(res.data.data.totalPages ?? 1);
    } catch (err: any) {
      toast({
        title: "Failed to load reschedule queue",
        description: err?.response?.data?.message || err?.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setQueueLoading(false);
    }
  }, [statusFilter, branchFilter, page, pageSize, toast]);

  const fetchLeaves = useCallback(async () => {
    setLeaveLoading(true);
    try {
      const res = await doctorLeaveApi.getAll({
        status: leaveStatusFilter || undefined,
        page: leavePage,
        limit: leavePageSize,
      });
      setLeaveEntries(res.data.leaves || []);
      setLeaveTotal(res.data.total ?? 0);
      setLeaveTotalPages(res.data.totalPages ?? 1);
    } catch (err: any) {
      toast({
        title: "Failed to load leave requests",
        description: err?.response?.data?.message || err?.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setLeaveLoading(false);
    }
  }, [leaveStatusFilter, leavePage, leavePageSize, toast]);

  useEffect(() => {
    if (roleOk) fetchQueue();
  }, [roleOk, fetchQueue]);

  useEffect(() => {
    if (roleOk && viewMode === "leave") {
      fetchLeaves();
    }
  }, [roleOk, viewMode, fetchLeaves]);

  // Auto-cancel queue entries whose appointment date has already passed
  // (the original date for PENDING, the assigned date for ASSIGNED) -- a
  // reschedule is no longer actionable once the appointment's own date is
  // in the past, so the appointment is cancelled instead of sitting in the
  // queue forever.
  const autoCancelExpired = useCallback(async () => {
    if (!roleOk || autoCancelling) return;
    const today = todayUTCISODate();
    const expired = entries.filter((e) => {
      if (e.status !== "PENDING" && e.status !== "ASSIGNED") return false;
      if (autoCancelAttempted.current.has(e.appointment_id)) return false;
      const effectiveDate =
        e.status === "ASSIGNED" && e.assigned_date
          ? toDateInputValue(e.assigned_date)
          : toDateInputValue(e.old_appointment_date);
      return Boolean(effectiveDate) && effectiveDate < today;
    });
    if (expired.length === 0) return;
    setAutoCancelling(true);
    let cancelled = 0;
    try {
      for (const entry of expired) {
        autoCancelAttempted.current.add(entry.appointment_id);
        try {
          await doctorTransferApi.processRescheduleAction(entry.appointment_id, {
            action: "CANCEL",
            reason: "Auto-cancelled: appointment date has passed",
          });
          cancelled += 1;
        } catch (err) {
          console.error(
            "[RescheduleQueue] Auto-cancel failed for",
            entry.appointment_id,
            err,
          );
        }
      }
      if (cancelled > 0) {
        toast({
          title: `Auto-cancelled ${cancelled} expired appointment${cancelled === 1 ? "" : "s"}`,
          description: "Their appointment date had already passed.",
        });
        fetchQueue();
      }
    } finally {
      setAutoCancelling(false);
    }
  }, [roleOk, autoCancelling, entries, fetchQueue, toast]);

  useEffect(() => {
    if (roleOk && entries.length > 0) autoCancelExpired();
  }, [roleOk, entries, autoCancelExpired]);

  const doctorNameById = useCallback(
    (id?: string | null) => {
      if (!id) return null;
      const doc = doctors.find((d) => d.employee_id === id);
      if (!doc) return id;
      return `Dr. ${[doc.first_name, doc.middle_name, doc.last_name].filter(Boolean).join(" ")}`;
    },
    [doctors],
  );

  const branchLabelOf = useCallback(
    (branchId: string) => {
      const b = branches.find((x) => x.branch_id === branchId);
      return b?.branch_name ? `${b.branch_name} (${branchId})` : branchId;
    },
    [branches],
  );

  const assignDay = useMemo(() => dayOfWeekOf(assignDate), [assignDate]);

  // Exact time string in HH:MM format for schedule comparison
  const assignTimeOfDay = useMemo(() => {
    if (!assignTime) return "";
    return assignTime.length === 5 ? assignTime : assignTime.slice(0, 5);
  }, [assignTime]);

  const assignDoctorFiltering = useMemo(
    () => schedulesLoaded && !!assignDepartmentId && !!assignDay,
    [schedulesLoaded, assignDepartmentId, assignDay],
  );

  const isAssignDoctorEligible = useCallback(
    (doctorId: string, branchId: string, day: string, targetTime?: string) =>
      (doctorSchedulesById[doctorId] || []).some(
        (s) =>
          s.is_active !== false &&
          s.branch_id === branchId &&
          s.day_of_week === day &&
          (!targetTime || (s.start_time && s.end_time && s.start_time <= targetTime && s.end_time > targetTime)),
      ),
    [doctorSchedulesById],
  );

  // Department options for the selected branch (derived from doctors at that branch)
  const branchDepartmentOptions = useMemo(() => {
    if (!assignBranchId) return [];
    const deptMap = new Map<string, string>();
    doctors
      .filter(
        (d) =>
          d.emp_status !== false &&
          (d.branches?.some((b) => b.branch_id === assignBranchId) ?? false),
      )
      .forEach((d) => {
        if (d.department_id && !deptMap.has(d.department_id)) {
          const deptName = d.department_master?.department_name || d.department_id;
          deptMap.set(d.department_id, deptName);
        }
      });
    // Keep the defaulted department listed even when no active doctors remain at the
    // branch, so the dropdown shows the appointment's department instead of the placeholder.
    if (assignDepartmentId && !deptMap.has(assignDepartmentId)) {
      const deptDoc = doctors.find((d) => d.department_id === assignDepartmentId);
      deptMap.set(
        assignDepartmentId,
        deptDoc?.department_master?.department_name || assignDepartmentId,
      );
    }
    return Array.from(deptMap.entries()).map(([department_id, department_name]) => ({
      department_id,
      department_name,
    }));
  }, [assignBranchId, assignDepartmentId, doctors]);

  const assignBranchOptions = useMemo(
    () =>
      branches.map((b) => ({
        label: `${b.branch_id}${b.branch_name ? ` - ${b.branch_name}` : ""}`,
        value: b.branch_id,
        highlight: b.branch_id === assignTarget?.branch_id,
        badge: b.branch_id === assignTarget?.branch_id ? "Appointment's branch" : undefined,
      })),
    [branches, assignTarget],
  );

  const branchFilterOptions = useMemo(
    () =>
      branches.map((b) => ({
        label: `${b.branch_id}${b.branch_name ? ` - ${b.branch_name}` : ""}`,
        value: b.branch_id,
      })),
    [branches],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => {
      const name = [e.patient_bio_data?.patient_first_name, e.patient_bio_data?.patient_last_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const mobile = e.patient_bio_data?.patient_primary_mobile?.toLowerCase() || "";
      const pid = e.patient_id.toLowerCase();
      return name.includes(q) || mobile.includes(q) || pid.includes(q);
    });
  }, [entries, search]);

  const queuePatientAgeData = useMemo(() => {
    return filtered.map((e) => ({
      patientId: e.patient_id,
    }));
  }, [filtered]);

  const { getCriticalInfo } = useCriticalPatients(queuePatientAgeData);

  // Compute doctor appointment counts from queue entries (frontend-only load balancing)
  const doctorQueueCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    filtered.forEach((entry) => {
      if (entry.assigned_employee_id && entry.status !== "CANCELLED") {
        counts[entry.assigned_employee_id] = (counts[entry.assigned_employee_id] || 0) + 1;
      }
    });
    return counts;
  }, [filtered]);

  const assignDoctorOptions = useMemo(() => {
    const active = doctors.filter((d) => d.emp_status !== false);
    const labelOf = (d: EmployeeRecord) =>
      `Dr. ${[d.first_name, d.middle_name, d.last_name].filter(Boolean).join(" ")}`;

    // Base filter: always apply branch + department when selected
    let eligible = active;
    if (assignBranchId) {
      eligible = eligible.filter(
        (d) => d.branches?.some((b) => b.branch_id === assignBranchId) ?? false,
      );
    }
    if (assignDepartmentId) {
      eligible = eligible.filter((d) => d.department_id === assignDepartmentId);
    }

    // Status gate: once branch + date are chosen, only doctors the backend
    // computed as ACTIVE for that exact branch + date are offered. The
    // currently selected doctor is always kept visible so a date change can
    // never blank the dropdown. If the status fetch failed, fall back to
    // branch + department filtering instead of silently emptying the list.
    if (assignBranchId && assignDate && statusesLoaded) {
      eligible = eligible.filter(
        (d) =>
          doctorStatusMap[d.employee_id] === "ACTIVE" ||
          d.employee_id === assignDoctorId,
      );
    }

    // Time/schedule filter when branch + department + day are ready
    if (assignDoctorFiltering) {
      eligible = eligible.filter((d) =>
        isAssignDoctorEligible(d.employee_id, assignBranchId, assignDay, assignTimeOfDay || undefined),
      );
    }

    // Sort by queue count (ascending) for auto-suggestion
    const withCounts = eligible.map((d) => ({
      ...d,
      queueCount: doctorQueueCounts[d.employee_id] || 0,
    }));
    withCounts.sort((a, b) => a.queueCount - b.queueCount);
    return withCounts.map((d) => ({
      label: labelOf(d),
      value: d.employee_id,
      badge: d.queueCount === 0 ? "Lowest load" : `${d.queueCount} queued`,
    }));
  }, [
    doctors,
    assignDoctorFiltering,
    isAssignDoctorEligible,
    assignBranchId,
    assignDay,
    assignTimeOfDay,
    assignDepartmentId,
    assignDate,
    assignDoctorId,
    doctorStatusMap,
    statusesLoaded,
    doctorQueueCounts,
  ]);

  const openAssign = (entry: RescheduleQueueEntry) => {
    setAssignDoctorId("");
    setAssignBranchId(entry.branch_id);
    const defaultDepartmentId =
      entry.department_id ||
      doctors.find((d) => d.employee_id === entry.employee_id)?.department_id ||
      "";
    setAssignDepartmentId(defaultDepartmentId);
    setAssignDate(entry.old_appointment_date ? toDateInputValue(entry.old_appointment_date) : todayISODate());
    setAssignTime(entry.old_appointment_time ? formatTime(entry.old_appointment_time) : "");
    setAssignReason("");
    setAssignDone(false);
    setAssignDoneMessage("");
    setAssignTarget(entry);
    if (entry.department_id) {
      const needIds = doctors
        .filter((d) => d.emp_status !== false && d.department_id === entry.department_id)
        .map((d) => d.employee_id)
        .filter((id) => !doctorSchedulesById[id]);
      if (needIds.length === 0) {
        setSchedulesLoaded(true);
        return;
      }
      setSchedulesLoading(true);
      setSchedulesLoaded(false);
      Promise.all(needIds.map((id) => employeeApi.getOne(id)))
        .then((resps) => {
          setDoctorSchedulesById((prev) => {
            const next = { ...prev };
            resps.forEach((r, i) => {
              const id = needIds[i];
              next[id] = (r.data?.data?.doctorSchedules || []).filter(
                (s) => s.is_active !== false && s.branch_id,
              );
            });
            return next;
          });
        })
        .catch((err) => {
          console.error("[RescheduleQueue] Failed to load doctor schedules", err);
          setSchedulesLoaded(false);
        })
        .finally(() => setSchedulesLoading(false));
    } else {
      setSchedulesLoaded(false);
    }
  };

  const doAssign = async () => {
    if (!assignTarget) return;
    if (assignDoctorFiltering && assignDoctorOptions.length === 0) {
      toast({
        title: "No doctor available",
        description: `No doctor from the same department works at ${branchLabelOf(assignBranchId)} on ${dayLabelOf(assignDay)}.`,
        variant: "destructive",
      });
      return;
    }
    if (!assignDoctorId) {
      toast({ title: "Choose a doctor", variant: "destructive" });
      return;
    }
    if (!assignDate) {
      toast({ title: "Pick an appointment date", variant: "destructive" });
      return;
    }
    if (!assignTime) {
      toast({ title: "Pick an appointment time", variant: "destructive" });
      return;
    }
    setProcessing(true);
    try {
      const res = await doctorTransferApi.processRescheduleAction(assignTarget.appointment_id, {
        action: "ASSIGN",
        employee_id: assignDoctorId,
        branch_id: assignBranchId,
        appointment_date: assignDate,
        appointment_time: assignTime,
        reason: assignReason.trim() || undefined,
      });
      setAssignDoneMessage(res.data.message);
      setAssignDone(true);
      fetchQueue();
    } catch (err: any) {
      toast({
        title: "Failed to assign slot",
        description: err?.response?.data?.message || err?.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const doConfirm = async () => {
    if (!confirmTarget) return;
    setProcessing(true);
    try {
      const res = await doctorTransferApi.processRescheduleAction(confirmTarget.appointment_id, {
        action: "CONFIRM",
        reason: confirmReason.trim() || undefined,
      });
      toast({ title: "Reschedule confirmed", description: res.data.message });
      setConfirmTarget(null);
      fetchQueue();
    } catch (err: any) {
      toast({
        title: "Failed to confirm reschedule",
        description: err?.response?.data?.message || err?.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const doCancel = async () => {
    if (!cancelTarget) return;
    setProcessing(true);
    try {
      const res = await doctorTransferApi.processRescheduleAction(cancelTarget.appointment_id, {
        action: "CANCEL",
        reason: cancelReason.trim() || undefined,
      });
      toast({ title: "Request cancelled", description: res.data.message });
      setCancelTarget(null);
      fetchQueue();
    } catch (err: any) {
      toast({
        title: "Failed to cancel request",
        description: err?.response?.data?.message || err?.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleApproveLeave = async (queueForReschedule = false) => {
    if (!approveTarget) return;
    const user = getUser();
    const approvedBy = user?.user_id || user?.employee_id || "";
    if (!approvedBy) {
      toast({ title: "Unable to determine approver", variant: "destructive" });
      return;
    }
    setProcessing(true);
    try {
      await doctorLeaveApi.approve(approveTarget.leave_id, {
        approved_by: approvedBy,
        remarks: approveRemarks.trim() || undefined,
      });
      if (queueForReschedule) {
        const priority = (approveTarget.leave_type === "Emergency") ? "HIGH" : "NORMAL";
        await doctorLeaveApi.queueReschedule(approveTarget.employee_id, {
          date_from: approveTarget.leave_start_date,
          date_to: approveTarget.leave_end_date,
          reason: `Leave approved: ${approveTarget.leave_reason}`,
          priority,
        });
      }
      toast({ title: "Leave approved", description: queueForReschedule ? "Appointments queued for reschedule" : "Leave approved" });
      setApproveDialogOpen(false);
      setApproveTarget(null);
      setApproveRemarks("");
      setLeaveConflictDialogOpen(false);
      setPendingApprove(null);
      fetchLeaves();
      if (queueForReschedule) fetchQueue();
    } catch (err: any) {
      toast({
        title: "Failed to approve leave",
        description: err?.response?.data?.message || err?.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleDeclineLeave = async () => {
    if (!declineTarget || !declineRemarks.trim()) {
      toast({ title: "Remarks are required to decline", variant: "destructive" });
      return;
    }
    const user = getUser();
    const rejectedBy = user?.user_id || user?.employee_id || "";
    if (!rejectedBy) {
      toast({ title: "Unable to determine rejector", variant: "destructive" });
      return;
    }
    setProcessing(true);
    try {
      await doctorLeaveApi.reject(declineTarget.leave_id, {
        rejected_by: rejectedBy,
        remarks: declineRemarks.trim(),
      });
      toast({ title: "Leave declined", description: "Leave request has been rejected" });
      setDeclineDialogOpen(false);
      setDeclineTarget(null);
      setDeclineRemarks("");
      fetchLeaves();
    } catch (err: any) {
      toast({
        title: "Failed to decline leave",
        description: err?.response?.data?.message || err?.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const openApproveLeave = async (leave: DoctorLeaveRecord) => {
    setApproveTarget(leave);
    setApproveRemarks(leave.remarks || "");
    // Check conflicts first -- only surface the approval dialog when there is
    // nothing to warn about, otherwise show the conflict dialog directly.
    try {
      const conflicts = await doctorLeaveApi.getConflicts(leave.employee_id, {
        date_from: leave.leave_start_date,
        date_to: leave.leave_end_date,
      });
      if (conflicts.data?.data?.length > 0) {
        setLeaveConflicts(conflicts.data.data);
        setLeaveConflictDialogOpen(true);
        setPendingApprove(leave);
        return;
      }
    } catch (err) {
      console.error("[RescheduleQueue] Conflict check failed", err);
    }
    setApproveDialogOpen(true);
  };

  const assignDoneFooter = (
    <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <button
        type="button"
        onClick={() => navigate("/dashboard")}
        className={cn(buttonVariants({ variant: "outline" }), "gap-2")}
      >
        Home
      </button>
      <button
        type="button"
        onClick={() => {
          setAssignDone(false);
          setAssignTarget(null);
        }}
        className={cn(buttonVariants({ variant: "default" }), "gap-2")}
      >
        OK
      </button>
    </div>
  );

  const transferColumns: HmsColumn<RescheduleQueueEntry>[] = [
    {
      key: "patient",
      label: "Patient",
      sortable: false,
      render: (entry) => {
        const crit = getCriticalInfo(entry.patient_id);
        const name = patientNameOf(entry);
        return (
          <CriticalWrapper className="flex items-center gap-2.5" reasons={crit.reasons}>
            <CriticalCorner reasons={crit.reasons} />
            <Avatar text={name || entry.patient_id} />
            <div className="min-w-0">
              <div className="hms-name-text flex items-center gap-1 truncate">
                {name}
                <CriticalDot reasons={crit.reasons} />
              </div>
              <div className="hms-id-text">{entry.patient_id}</div>
            </div>
          </CriticalWrapper>
        );
      },
    },
    {
      key: "appointment",
      label: "Appointment",
      sortable: false,
      render: (entry) => (
        <div>
          <div className="hms-content-text text-[#191C1E]">
            {formatDate(entry.old_appointment_date)} · {formatTime(entry.old_appointment_time)}
          </div>
          <div className="hms-id-text">
            {entry.branch?.branch_name || entry.branch_id}
            {entry.transfer_id ? ` · Transfer ${entry.transfer_id}` : ""}
          </div>
        </div>
      ),
    },
    {
      key: "priority",
      label: "Priority",
      sortable: false,
      render: (entry) => (
        <StatusBadge tone={PRIORITY_TONE[entry.priority] || "slate"} status={entry.priority} />
      ),
    },
    {
      key: "assigned",
      label: "Assigned slot",
      sortable: false,
      render: (entry) =>
        entry.status === "ASSIGNED" ? (
          <div>
            <div className="hms-name-text">{doctorNameById(entry.assigned_employee_id)}</div>
            <div className="hms-id-text">
              {formatDate(entry.assigned_date)} · {formatTime(entry.assigned_time)}
            </div>
          </div>
        ) : (
          <span className="text-[#9CA3AF]">—</span>
        ),
    },
    {
      key: "status",
      label: "Status",
      sortable: false,
      render: (entry) => (
        <StatusBadge tone={QUEUE_TONE[entry.status] || "slate"} status={entry.status} />
      ),
    },
    {
      key: "actions",
      label: "Action",
      sortable: false,
      headerClassName: "text-right",
      className: "text-right",
      render: (entry) => (
        <div className="flex items-center justify-end gap-1.5">
          {entry.status === "PENDING" && (
            <button
              onClick={() => openAssign(entry)}
              className="px-2.5 py-1.5 rounded-lg bg-[#004785] text-white text-[11px] font-semibold hover:bg-[#003a6b] transition-colors"
            >
              Assign slot
            </button>
          )}
          {entry.status === "ASSIGNED" && (
            <button
              onClick={() => {
                setConfirmReason("");
                setConfirmTarget(entry);
              }}
              className="px-2.5 py-1.5 rounded-lg bg-green-600 text-white text-[11px] font-semibold hover:bg-green-700 transition-colors"
            >
              Confirm
            </button>
          )}
          {(entry.status === "PENDING" || entry.status === "ASSIGNED") && (
            <button
              onClick={() => {
                setCancelReason("");
                setCancelTarget(entry);
              }}
              className="px-2.5 py-1.5 rounded-lg border border-red-200 text-red-600 text-[11px] font-semibold hover:bg-red-50 transition-colors"
            >
              Cancel
            </button>
          )}
          {entry.status === "CONFIRMED" && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-600">
              <CheckCircle2 className="w-3.5 h-3.5" /> Rescheduled
            </span>
          )}
        </div>
      ),
    },
  ];

  const leaveColumns: HmsColumn<DoctorLeaveRecord>[] = [
    {
      key: "doctor",
      label: "Doctor",
      sortable: false,
      render: (leave) => {
        const doctorName = doctorNameById(leave.employee_id);
        return (
          <div className="flex items-center gap-2.5">
            <Avatar text={doctorName || leave.employee_id} />
            <div className="min-w-0">
              <div className="hms-name-text truncate">{doctorName || leave.employee_id}</div>
              <div className="hms-id-text">{leave.leave_id}</div>
            </div>
          </div>
        );
      },
    },
    {
      key: "period",
      label: "Leave period",
      sortable: false,
      render: (leave) => (
        <div>
          <div className="hms-content-text text-[#191C1E]">
            {formatDate(leave.leave_start_date)} – {formatDate(leave.leave_end_date)}
          </div>
          <div className="hms-id-text">{branchLabelOf(leave.branch_id)}</div>
        </div>
      ),
    },
    {
      key: "type",
      label: "Type",
      sortable: false,
      render: (leave) => (
        <StatusBadge
          tone={leave.leave_type === "Emergency" ? "red" : "slate"}
          status={leave.leave_type || "Normal"}
        />
      ),
    },
    {
      key: "reason",
      label: "Reason",
      sortable: false,
      className: "max-w-[240px]",
      render: (leave) => (
        <span className="hms-content-text text-[#4B5563] line-clamp-2 whitespace-normal">
          {leave.leave_reason || "—"}
        </span>
      ),
    },
    {
      key: "status",
      label: "Status",
      sortable: false,
      render: (leave) => (
        <StatusBadge tone={LEAVE_STATUS_TONE[leave.status] || "slate"} status={leave.status} />
      ),
    },
    {
      key: "actions",
      label: "Action",
      sortable: false,
      headerClassName: "text-right",
      className: "text-right",
      render: (leave) => (
        <div className="flex items-center justify-end gap-1.5">
          {leave.status === "PENDING" && (
            <>
              <button
                onClick={() => openApproveLeave(leave)}
                className="px-2.5 py-1.5 rounded-lg bg-green-600 text-white text-[11px] font-semibold hover:bg-green-700 transition-colors"
              >
                Approve
              </button>
              <button
                onClick={() => {
                  setDeclineTarget(leave);
                  setDeclineRemarks("");
                  setDeclineDialogOpen(true);
                }}
                className="px-2.5 py-1.5 rounded-lg border border-red-200 text-red-600 text-[11px] font-semibold hover:bg-red-50 transition-colors"
              >
                Decline
              </button>
            </>
          )}
          {leave.status === "APPROVED" && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-600">
              <CheckCircle2 className="w-3.5 h-3.5" /> Approved
            </span>
          )}
          {leave.status === "REJECTED" && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600">
              Declined
            </span>
          )}
        </div>
      ),
    },
  ];

  if (!roleOk) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F9FB] p-6 font-[Manrope,sans-serif]">
        <div className="max-w-lg rounded-xl border border-[#E5E7EB] bg-white p-8 text-center shadow-sm">
          <h2 className="hms-heading">Access restricted</h2>
          <p className="hms-subheading mt-2">
            Only Super Admin, Head Admin and Branch Admin can manage the reschedule queue.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full font-[Manrope,sans-serif] bg-[#F7F9FB] min-h-screen p-6">
      <div className="flex flex-col flex-1 min-w-0 gap-6">
        {/* ==================== HEADER ==================== */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 rounded-lg border border-[#E5E7EB] bg-white hover:bg-[#F2F4F6] transition-colors shadow-2xs"
              title="Back"
            >
              <ArrowLeft className="w-4 h-4 text-[#191C1E]" />
            </button>
            <div>
              <h1 className="hms-heading">Reschedule Queue</h1>
              <p className="hms-subheading">
                Appointments flagged Reschedule Required when a doctor left or was transferred.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex h-[36px] items-center border border-[#E5E7EB] rounded-lg overflow-hidden bg-[#F2F4F6] p-0.5 text-xs font-semibold">
              <button
                onClick={() => {
                  setViewMode("transfer");
                  setPage(1);
                }}
                className={`h-full px-3 rounded-md transition-all ${
                  viewMode === "transfer"
                    ? "bg-white text-[#00488D] shadow-xs"
                    : "text-[#6B7280] hover:text-[#111827]"
                }`}
              >
                Appointment Transfer
              </button>
              <button
                onClick={() => {
                  setViewMode("leave");
                  setLeavePage(1);
                }}
                className={`h-full px-3 rounded-md transition-all ${
                  viewMode === "leave"
                    ? "bg-white text-[#00488D] shadow-xs"
                    : "text-[#6B7280] hover:text-[#111827]"
                }`}
              >
                Leave Requests
              </button>
            </div>
            <RefreshButton
              onClick={viewMode === "transfer" ? fetchQueue : fetchLeaves}
              isLoading={viewMode === "transfer" ? queueLoading : leaveLoading}
              className="!h-[36px] rounded-lg"
            />
          </div>
        </div>

        {/* ==================== MAIN CARD ==================== */}
        <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm flex flex-col transition-all duration-300 hover:shadow-md">
          {/* ==================== TOOLBAR ==================== */}
          <div className="px-5 py-3.5 border-b border-[#E5E7EB] flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-[#191C1E] text-sm font-bold">
                {viewMode === "transfer" ? "Transfer Queue" : "Leave Requests"}
              </span>
              <span className="bg-[#E6F0FF] text-[#00488D] px-2.5 py-0.5 rounded-full text-[10px] font-semibold">
                Total : {viewMode === "transfer" ? total : leaveTotal}
              </span>
              {viewMode === "transfer" && autoCancelling && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-red-600">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Auto-cancelling expired…
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 ml-auto flex-wrap">
              {viewMode === "transfer" ? (
                <>
                  <div className="w-40">
                    <FormDropdown
                      name="queue_status"
                      className="h-[32px] !py-1 text-xs rounded-lg"
                      options={STATUS_FILTERS}
                      value={statusFilter}
                      onValueChange={(v) => {
                        setStatusFilter(v);
                        setPage(1);
                      }}
                      placeholder="All status"
                    />
                  </div>
                  <div className="w-52">
                    <FormDropdown
                      name="queue_branch"
                      className="h-[32px] !py-1 text-xs rounded-lg"
                      options={branchFilterOptions}
                      value={branchFilter}
                      onValueChange={(v) => {
                        setBranchFilter(v);
                        setPage(1);
                      }}
                      placeholder="All branches"
                    />
                  </div>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#6B7280]" />
                    <input
                      type="text"
                      className="pl-8 pr-3 h-[32px] w-[190px] bg-[#F2F4F6] text-xs text-[#191C1E] placeholder:text-[#6B7280] outline-none rounded-md focus:ring-2 focus:ring-[#00488D]/30"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search this page…"
                    />
                  </div>
                </>
              ) : (
                <div className="w-40">
                  <FormDropdown
                    name="leave_status"
                    className="h-[32px] !py-1 text-xs rounded-lg"
                    options={LEAVE_STATUS_FILTERS}
                    value={leaveStatusFilter}
                    onValueChange={(v) => {
                      setLeaveStatusFilter(v as LeaveStatus | "");
                      setLeavePage(1);
                    }}
                    placeholder="All status"
                  />
                </div>
              )}
            </div>
          </div>

          {/* ==================== BODY ==================== */}
          {viewMode === "transfer" ? (
            queueLoading ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-[#6B7280] text-sm">
                <Loader2 size={24} className="animate-spin text-[#00488D]" />
                Loading reschedule queue...
              </div>
            ) : (
              <HmsTable
                columns={transferColumns}
                data={filtered}
                sortField={sortField}
                sortDirection={sortDirection}
                onSort={(field) => {
                  if (sortField === field) {
                    setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
                  } else {
                    setSortField(field);
                    setSortDirection("asc");
                  }
                }}
                currentPage={page}
                totalPages={totalPages}
                totalRecords={total}
                rowsPerPage={pageSize}
                visibleStart={total === 0 ? 0 : (page - 1) * pageSize + 1}
                visibleEnd={Math.min(page * pageSize, total)}
                onPageChange={setPage}
                onRowsPerPageChange={(val) => {
                  setPageSize(val);
                  setPage(1);
                }}
                emptyMessage="No transfer requests match the current filters."
                minWidth="980px"
                rowKey={(entry) => entry.queue_id}
              />
            )
          ) : leaveLoading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-[#6B7280] text-sm">
              <Loader2 size={24} className="animate-spin text-[#00488D]" />
              Loading leave requests...
            </div>
          ) : (
            <HmsTable
              columns={leaveColumns}
              data={leaveEntries}
              sortField={sortField}
              sortDirection={sortDirection}
              onSort={() => {}}
              currentPage={leavePage}
              totalPages={leaveTotalPages}
              totalRecords={leaveTotal}
              rowsPerPage={leavePageSize}
              visibleStart={leaveTotal === 0 ? 0 : (leavePage - 1) * leavePageSize + 1}
              visibleEnd={Math.min(leavePage * leavePageSize, leaveTotal)}
              onPageChange={setLeavePage}
              onRowsPerPageChange={(val) => {
                setLeavePageSize(val);
                setLeavePage(1);
              }}
              emptyMessage="No leave requests match the current filters."
              minWidth="900px"
              rowKey={(leave) => leave.leave_id}
            />
          )}
        </div>
      </div>

      {/* Assign slot dialog */}
      <ConfirmationDialog
        open={!!assignTarget}
        type={assignDone ? "success" : "info"}
        title={assignDone ? "Slot assigned" : "Assign a new slot"}
        description={
          assignDone
            ? "The appointment has been reassigned and the queue updated."
            : "Pick a branch, a doctor and a slot. Only doctors who work at the selected branch on the selected day are listed."
        }
        confirmText="Assign slot"
        loading={processing}
        hideCancelButton={assignDone}
        showCloseButton={!assignDone}
        footer={assignDone ? assignDoneFooter : undefined}
        onConfirm={doAssign}
        onCancel={() => {
          setAssignDone(false);
          setAssignTarget(null);
        }}
      >
        {assignDone ? (
          <div className="w-full space-y-3 text-left">
            <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2.5 text-sm text-green-700">
              {assignDoneMessage || "The appointment has been reassigned."}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div>
                <div className="text-[10px] font-bold text-[#64748B] uppercase tracking-wide">Patient</div>
                <div className="text-[#191C1E] font-medium">
                  {assignTarget ? patientNameOf(assignTarget) : "—"}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-[#64748B] uppercase tracking-wide">Branch</div>
                <div className="text-[#191C1E] font-medium">{branchLabelOf(assignBranchId)}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-[#64748B] uppercase tracking-wide">Doctor</div>
                <div className="text-[#191C1E] font-medium">{doctorNameById(assignDoctorId) || "—"}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-[#64748B] uppercase tracking-wide">Date · Time</div>
                <div className="text-[#191C1E] font-medium">
                  {assignDate} · {assignTime}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="w-full space-y-3 text-left">
            <div>
              <label className="text-[10.5px] font-bold text-blue-600 uppercase tracking-[0.04em] mb-1.5 block">
                Assign at branch
              </label>
              <FormDropdown
                name="assign_branch"
                className={
                  assignTarget && assignBranchId === assignTarget.branch_id
                    ? "w-full bg-blue-50 border border-blue-500 rounded-xl px-3 py-2 text-sm text-[#00488D] focus:outline-none focus:ring-2 focus:ring-[#00488D]/30"
                    : inputCls
                }
                options={assignBranchOptions}
                value={assignBranchId}
                onValueChange={(v) => {
                  setAssignBranchId(v);
                  setAssignDepartmentId("");
                  setAssignDoctorId("");
                  // Department options will update via branchDepartmentOptions memo
                }}
                placeholder="Select branch"
              />
              {assignTarget && assignBranchId === assignTarget.branch_id && (
                <p className="text-[11px] text-blue-600 mt-1">
                  Defaults to the appointment's branch — changeable.
                </p>
              )}
            </div>
            {/* Department dropdown */}
            <div>
              <label className="text-[10.5px] font-bold text-blue-600 uppercase tracking-[0.04em] mb-1.5 block">
                Department
              </label>
              <FormDropdown
                name="assign_department"
                className={inputCls}
                options={branchDepartmentOptions.map((d) => ({
                  label: d.department_name,
                  value: d.department_id,
                  highlight: d.department_id === assignTarget?.department_id,
                  badge: d.department_id === assignTarget?.department_id ? "Appointment's department" : undefined,
                }))}
                value={assignDepartmentId}
                onValueChange={(v) => {
                  setAssignDepartmentId(v);
                  setAssignDoctorId("");
                }}
                placeholder={branchDepartmentOptions.length ? "Select department" : "No departments at this branch"}
              />
              {assignTarget && assignDepartmentId === assignTarget.department_id && assignDepartmentId && (
                <p className="text-[11px] text-blue-600 mt-1">
                  Defaults to the appointment's department — changeable.
                </p>
              )}
            </div>
            <div>
              <label className="text-[10.5px] font-bold text-blue-600 uppercase tracking-[0.04em] mb-1.5 block">
                Doctor
              </label>
              <FormDropdown
                name="assign_doctor"
                className={inputCls}
                options={assignDoctorOptions}
                value={assignDoctorId}
                onValueChange={setAssignDoctorId}
                disabled={schedulesLoading || statusesLoading}
                placeholder={
                  assignDoctorFiltering && assignDoctorOptions.length === 0
                    ? "No doctors available"
                    : "Select doctor"
                }
                emptyMessage="No doctors available"
              />
              {schedulesLoading || statusesLoading ? (
                <p className="text-[11px] text-[#94A3B8] mt-1">
                  <Loader2 className="inline h-3 w-3 animate-spin mr-1" />
                  Checking doctor availability…
                </p>
              ) : statusesFailed && assignBranchId && assignDate ? (
                <p className="text-[11px] text-amber-600 mt-1">
                  Couldn't verify doctor availability — showing all doctors at this branch (unfiltered).
                </p>
              ) : assignBranchId && assignDate && assignDoctorOptions.length === 0 && !assignDoctorFiltering ? (
                <p className="text-[11px] text-[#94A3B8] mt-1">
                  No doctor is active at {branchLabelOf(assignBranchId)} on {dayLabelOf(assignDay)} for this department.
                </p>
              ) : assignDoctorFiltering && assignDoctorOptions.length === 0 ? (
                <p className="text-[11px] text-[#94A3B8] mt-1">
                  No doctor from the same department works at {branchLabelOf(assignBranchId)} on{" "}
                  {dayLabelOf(assignDay)} at {assignTimeOfDay}.
                </p>
              ) : assignDoctorFiltering ? (
                <p className="text-[11px] text-[#94A3B8] mt-1">
                  Showing {assignDoctorOptions.length} doctor(s) active at {branchLabelOf(assignBranchId)} on{" "}
                  {dayLabelOf(assignDay)}
                  {assignTimeOfDay ? ` at ${assignTimeOfDay}` : ""} — sorted by queue load (lowest first).
                </p>
              ) : assignTarget?.department_id ? (
                <p className="text-[11px] text-[#94A3B8] mt-1">
                  Showing all active doctor(s) — pick a date first to filter to those working that day.
                </p>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10.5px] font-bold text-blue-600 uppercase tracking-[0.04em] mb-1.5 block">
                  Date
                </label>
                <input
                  type="date"
                  min={todayISODate()}
                  className={inputCls}
                  value={assignDate}
                  onChange={(e) => {
                    const v = e.target.value;
                    setAssignDate(v);
                    const day = dayOfWeekOf(v);
                    if (
                      schedulesLoaded &&
                      assignDepartmentId &&
                      day &&
                      assignDoctorId &&
                      !isAssignDoctorEligible(assignDoctorId, assignBranchId, day, assignTimeOfDay)
                    ) {
                      setAssignDoctorId("");
                    }
                  }}
                />
              </div>
              <div>
                <label className="text-[10.5px] font-bold text-blue-600 uppercase tracking-[0.04em] mb-1.5 block">
                  Time
                </label>
                <TimepickerWheel value={assignTime} onChange={setAssignTime} />
              </div>
            </div>
            <div>
              <label className="text-[10.5px] font-bold text-blue-600 uppercase tracking-[0.04em] mb-1.5 block">
                Reason (optional)
              </label>
              <textarea
                rows={2}
                className={inputCls}
                value={assignReason}
                onChange={(e) => setAssignReason(e.target.value)}
              />
            </div>
          </div>
        )}
      </ConfirmationDialog>

      {/* Confirm reschedule dialog */}
      <ConfirmationDialog
        open={!!confirmTarget}
        type="warning"
        title="Confirm reschedule"
        description={
          confirmTarget
            ? `This moves the appointment to ${doctorNameById(confirmTarget.assigned_employee_id) || "the assigned doctor"} on ${formatDate(confirmTarget.assigned_date)} at ${formatTime(confirmTarget.assigned_time)}. The patient's appointment record is updated and marked Rescheduled.`
            : ""
        }
        confirmText="Confirm reschedule"
        loading={processing}
        onConfirm={doConfirm}
        onCancel={() => setConfirmTarget(null)}
      >
        <div className="w-full text-left">
          <label className="text-[10.5px] font-bold text-blue-600 uppercase tracking-[0.04em] mb-1.5 block">
            Reason (optional)
          </label>
          <textarea
            rows={2}
            className={inputCls}
            value={confirmReason}
            onChange={(e) => setConfirmReason(e.target.value)}
          />
        </div>
      </ConfirmationDialog>

      {/* Cancel dialog */}
      <ConfirmationDialog
        open={!!cancelTarget}
        type="danger"
        title="Cancel reschedule request?"
        description="The appointment will be marked Cancelled and removed from the queue. This cannot be undone."
        confirmText="Cancel appointment"
        loading={processing}
        onConfirm={doCancel}
        onCancel={() => setCancelTarget(null)}
      >
        <div className="w-full text-left">
          <label className="text-[10.5px] font-bold text-blue-600 uppercase tracking-[0.04em] mb-1.5 block">
            Reason (optional)
          </label>
          <textarea
            rows={2}
            className={inputCls}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          />
        </div>
      </ConfirmationDialog>

      {/* Approve Leave Dialog */}
      <ConfirmationDialog
        open={approveDialogOpen}
        type="info"
        title="Approve leave request"
        description={
          approveTarget
            ? `Approve leave for ${doctorNameById(approveTarget.employee_id)} from ${formatDate(approveTarget.leave_start_date)} to ${formatDate(approveTarget.leave_end_date)}?`
            : ""
        }
        confirmText="Approve"
        loading={processing}
        onConfirm={() => handleApproveLeave(false)}
        onCancel={() => {
          setApproveDialogOpen(false);
          setApproveTarget(null);
          setApproveRemarks("");
        }}
      >
        <div className="w-full text-left space-y-3">
          <div>
            <label className="text-[10.5px] font-bold text-blue-600 uppercase tracking-[0.04em] mb-1.5 block">
              Remarks (optional)
            </label>
            <textarea
              rows={2}
              className={inputCls}
              value={approveRemarks}
              onChange={(e) => setApproveRemarks(e.target.value)}
              placeholder="Add remarks..."
            />
          </div>
        </div>
      </ConfirmationDialog>

      {/* Decline Leave Dialog */}
      <ConfirmationDialog
        open={declineDialogOpen}
        type="danger"
        title="Decline leave request"
        description={
          declineTarget
            ? `Decline leave request for ${doctorNameById(declineTarget.employee_id)}? Remarks are required.`
            : ""
        }
        confirmText="Decline"
        loading={processing}
        onConfirm={handleDeclineLeave}
        onCancel={() => {
          setDeclineDialogOpen(false);
          setDeclineTarget(null);
          setDeclineRemarks("");
        }}
      >
        <div className="w-full text-left space-y-3">
          <div>
            <label className="text-[10.5px] font-bold text-blue-600 uppercase tracking-[0.04em] mb-1.5 block">
              Remarks *
            </label>
            <textarea
              rows={2}
              className={inputCls}
              value={declineRemarks}
              onChange={(e) => setDeclineRemarks(e.target.value)}
              placeholder="Reason for decline..."
            />
          </div>
        </div>
      </ConfirmationDialog>

      {/* Leave Conflict Dialog */}
      <ConfirmationDialog
        open={leaveConflictDialogOpen}
        type="warning"
        title="Conflicting appointments found"
        description={
          pendingApprove
            ? `There are ${leaveConflicts.length} appointments conflicting with the leave period. You can approve anyway or approve and queue them for reschedule.`
            : ""
        }
        confirmText="Approve & Queue"
        loading={processing}
        onConfirm={() => {
          if (pendingApprove) {
            handleApproveLeave(true);
          }
        }}
        onCancel={() => {
          setLeaveConflictDialogOpen(false);
          setPendingApprove(null);
        }}
      >
        <div className="w-full text-left space-y-3">
          <div className="max-h-[200px] overflow-y-auto rounded-lg border border-[#E5E7EB]">
            {leaveConflicts.map((c: any) => (
              <div key={c.appointment_id} className="px-3 py-2 border-b last:border-b-0 text-xs">
                <div className="font-medium">
                  {c.patient_first_name} {c.patient_last_name}
                </div>
                <div className="text-[#64748B]">
                  {c.appointment_date} {c.appointment_time} · {c.status}
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs"
              onClick={() => {
                if (pendingApprove) {
                  handleApproveLeave(false);
                }
              }}
            >
              Approve Anyway
            </button>
          </div>
        </div>
      </ConfirmationDialog>
    </div>
  );
}
