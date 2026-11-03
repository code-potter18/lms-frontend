import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  AlertTriangle,
  X,
  Plus,
  ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { FormDropdown } from "@/components/ui/form-dropdown";
import TimepickerWheel from "@/components/ui/timepicker-wheel";
import { StatusBadge } from "@/components/hms/StatusBadge";
import AffectedAppointmentsDialog from "@/components/hms/AffectedAppointmentsDialog";
import {
  employeeApi,
  EmployeeDetailResponse,
  EmployeeRecord,
} from "@/api/employee.api";
import { branchApi, Branch } from "@/api/branch.api";
import { departmentApi, Department } from "@/api/department.api";
import { useBranches, useDepartments, useDoctors } from "@/hooks/useMasterData";
import {
  doctorTransferApi,
  InitiateTransferPayload,
  InitiateTransferResult,
  TransferMode,
} from "@/api/doctorTransfer.api";
import { getUser } from "@/utils/token";

const TRANSFER_ADMIN_ROLES = ["HEAD_ADMIN", "SUPER_ADMIN", "BRANCH_ADMIN"];

const DAYS_OF_WEEK: { value: string; label: string }[] = [
  { value: "MONDAY", label: "Monday" },
  { value: "TUESDAY", label: "Tuesday" },
  { value: "WEDNESDAY", label: "Wednesday" },
  { value: "THURSDAY", label: "Thursday" },
  { value: "FRIDAY", label: "Friday" },
  { value: "SATURDAY", label: "Saturday" },
  { value: "SUNDAY", label: "Sunday" },
];

interface ScheduleEntry {
  id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  branch_id: string;
}

interface BranchTransfer {
  transferId: string;
  fromBranchId: string;
  toBranchId: string;
  effectiveDate: string;
  result: InitiateTransferResult;
}

interface BranchTransferDetails {
  departmentId: string;
  effectiveDate: string;
  consultationMinutes: string;
  transferReason: string;
}

function todayISODate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const labelCls = "text-[10.5px] font-bold text-blue-600 uppercase tracking-[0.04em] mb-1.5 block";
const inputCls =
  "w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#191C1E] focus:outline-none focus:ring-2 focus:ring-[#00488D]/30";

export default function TransferDoctor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [roleOk, setRoleOk] = useState(false);
  const [loading, setLoading] = useState(true);

  const [employee, setEmployee] = useState<EmployeeDetailResponse | null>(null);
  const { branches } = useBranches();
  const { departments } = useDepartments();
  const { doctors: openDoctors } = useDoctors(undefined, roleOk);
  const [submitting, setSubmitting] = useState(false);

  const defaultBranchDetails = (): BranchTransferDetails => ({
    departmentId: employee?.employee.department_id || "",
    effectiveDate: todayISODate(),
    consultationMinutes: employee?.doctorProfile?.consultation_minutes
      ? String(employee.doctorProfile.consultation_minutes)
      : "20",
    transferReason: "",
  });

  // Sequential single-transfer state
  const [opMode, setOpMode] = useState<TransferMode>("TRANSFER");
  const [fromBranchId, setFromBranchId] = useState<string>(""); // Doctor's current branch (from employee.branches)
  const [toBranchId, setToBranchId] = useState<string>("");     // Target branch for transfer
  const [details, setDetails] = useState<BranchTransferDetails>(defaultBranchDetails());
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([]);
  const [recentTransfers, setRecentTransfers] = useState<BranchTransfer[]>([]);

  // Step 2 modal — which recent transfer is being viewed
  const [viewingTransferId, setViewingTransferId] = useState<string | null>(null);

  // Set after a transfer completes so the admin deliberately acknowledges
  // before starting another one — prevents the accidental rapid-fire
  // transfer chains that left behind duplicate/closed mapping rows.
  const [justCompleted, setJustCompleted] = useState(false);

  const refreshEmployee = async () => {
    if (!id) return;
    try {
      const empRes = await employeeApi.getOne(id);
      const detail = empRes.data?.data;
      if (detail) setEmployee(detail);
    } catch (err) {
      console.error("[Transfer] Refresh error", err);
    }
  };

  const timeToMinutes = (value: string) => {
    const [h, m] = value.split(":").map(Number);
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
  };

  // Any of the doctor's OTHER currently-active schedule rows (from the
  // freshly fetched employee payload) that overlap a newly requested slot
  // in day/time. Rows being replaced (the From branch in TRANSFER mode)
  // are excluded — everything else is untouchable and a conflict there
  // must block the transfer before anything is sent to the backend.
  const findOverlappingExistingSlots = (rows: ScheduleEntry[]) => {
    const existing = employee?.doctorSchedules?.filter((s) => s.is_active !== false) ?? [];
    const overlaps: string[] = [];
    for (const row of rows) {
      const newStart = timeToMinutes(row.start_time);
      const newEnd = timeToMinutes(row.end_time);
      for (const s of existing) {
        if (opMode === "TRANSFER" && s.branch_id === fromBranchId) continue;
        if (String(s.day_of_week ?? "").toUpperCase() !== row.day_of_week) continue;
        if (!s.start_time || !s.end_time) continue;
        const start = timeToMinutes(s.start_time);
        const end = timeToMinutes(s.end_time);
        if (newStart < end && start < newEnd) {
          overlaps.push(
            `${s.day_of_week} ${s.start_time}–${s.end_time} at ${branchLabelOf(s.branch_id)}`,
          );
        }
      }
    }
    return overlaps;
  };

  useEffect(() => {
    const user = getUser();
    const role = (user?.role_type || user?.role || "").toUpperCase();
    setRoleOk(TRANSFER_ADMIN_ROLES.includes(role));
  }, []);

  useEffect(() => {
    if (!roleOk) return;

    const initial = async () => {
      try {
        const empRes = await employeeApi.getOne(id!);





        const detail = empRes.data?.data;
        setEmployee(detail);



        if (detail) {
          // Initialize default details from doctor's current profile
          const seededDetails: BranchTransferDetails = {
            departmentId: detail.employee.department_id || "",
            effectiveDate: todayISODate(),
            consultationMinutes: detail.doctorProfile?.consultation_minutes
              ? String(detail.doctorProfile.consultation_minutes)
              : "20",
            transferReason: "",
          };
          setDetails(seededDetails);
          // schedules start empty - user will add them for the toBranch
          setSchedules([]);
        }
      } catch (err) {
        console.error("[Transfer] Init error", err);
        toast({
          title: "Failed to load doctor",
          description: "Couldn't fetch doctor details for the transfer.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    initial();
  }, [roleOk, id]);

  const doctorSummary = useMemo(() => {
    if (!employee) return null;
    const emp = employee.employee;
    return {
      name: [emp.first_name, emp.middle_name, emp.last_name].filter(Boolean).join(" "),
      designation: emp.designation || "Doctor",
      specialization: emp.specialization || "General",
      active: emp.emp_status === true,
    };
  }, [employee]);

  // Doctor's currently assigned branches (from user_branch_mapping, active
  // status 1 only) — for the From Branch dropdown. Transfer requires a real
  // source branch: "None" is not an option (that's the separate Add Branch
  // operation), so the list has no empty-value entry.
  const fromBranchOptions = useMemo(
    () =>
      (employee?.branches ?? [])
        .filter((b) => b.status === 1)
        .map((b) => ({
          label: `${b.branch_name || b.branch_id}`,
          value: b.branch_id,
        })),
    [employee],
  );

  // Branch ids the doctor is currently assigned to (active mappings). Both
  // TRANSFER and ADD_BRANCH on this page target NEW assignments only — the
  // doctor must never be "moved to" a branch they already hold, otherwise
  // the operation silently closes the source while doing nothing useful at
  // the destination. Adding extra slots at an existing branch belongs to
  // the Schedule page, not here.
  const activeBranchIds = useMemo(
    () =>
      new Set(
        (employee?.branches ?? [])
          .filter((b) => b.status === 1)
          .map((b) => b.branch_id),
      ),
    [employee],
  );

  // All branches the doctor is NOT currently assigned to — for To Branch
  // dropdown.
  const toBranchOptions = useMemo(
    () =>
      branches
        .filter((b) => !activeBranchIds.has(b.branch_id))
        .filter((b) => b.branch_id !== fromBranchId)
        .map((b) => ({
          label: `${b.branch_name || b.branch_id}`,
          value: b.branch_id,
        })),
    [branches, fromBranchId, activeBranchIds],
  );

  // In TRANSFER mode the doctor leaves ONLY the From branch — every other
  // active assignment stays. Show the admin exactly what is kept so a
  // "transfer" is never mistaken for "move the doctor everywhere".
  const keptBranches = useMemo(
    () =>
      (employee?.branches ?? [])
        .filter((b) => b.status === 1 && b.branch_id !== fromBranchId)
        .map((b) => b.branch_name || b.branch_id),
    [employee, fromBranchId],
  );

  const branchLabelOf = (branchId: string | undefined | null) => {
    if (!branchId) return "—";
    const b = branches.find((x) => x.branch_id === branchId);
    if (!b) return branchId;
    return b.branch_name ? b.branch_name : b.branch_id;
  };

  // Reset form after successful transfer (reset both From and To)
  const resetForm = () => {
    setFromBranchId("");
    setToBranchId("");
    setDetails(defaultBranchDetails());
    setSchedules([]);
  };

  // Add schedule row for the current toBranch
  const addScheduleRow = () => {
    if (!toBranchId) return;
    setSchedules((prev) => [
      ...prev,
      {
        id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        day_of_week: "MONDAY",
        start_time: "",
        end_time: "",
        branch_id: toBranchId,
      },
    ]);
  };

  // Update schedule row
  const updateScheduleRow = (rowId: string, field: keyof ScheduleEntry, value: string) => {
    setSchedules((prev) =>
      prev.map((s) => (s.id === rowId ? { ...s, [field]: value } : s)),
    );
  };

  // Remove schedule row
  const removeScheduleRow = (rowId: string) => {
    setSchedules((prev) => prev.filter((s) => s.id !== rowId));
  };

  // Update form details
  const updateDetails = (field: keyof BranchTransferDetails, value: string) => {
    setDetails((prev) => ({ ...prev, [field]: value }));
  };

  // Handle From Branch change - reset To Branch and schedules
  const handleFromBranchChange = (branchId: string) => {
    setFromBranchId(branchId);
    setToBranchId(""); // Reset To Branch when From Branch changes
    setSchedules([]);  // Clear schedules since they're tied to To Branch
  };

  // Handle To Branch change - reset schedules
  const handleToBranchChange = (branchId: string) => {
    setToBranchId(branchId);
    setSchedules([]); // Clear schedules for new branch
  };

  const handleInitiate = async () => {
    if (!id) return;
    // A transfer must always name the branch the doctor is leaving — the
    // From dropdown has no "None" option here. Adding a branch without
    // leaving one is the separate Add Branch operation (opMode).
    if (opMode === "TRANSFER" && !fromBranchId) {
      toast({ title: "From branch is required for a transfer", variant: "destructive" });
      return;
    }
    if (!toBranchId) {
      toast({ title: "Select To Branch", variant: "destructive" });
      return;
    }
    if (!details.effectiveDate) {
      toast({ title: "Effective date is required", variant: "destructive" });
      return;
    }
    if (!details.transferReason.trim()) {
      toast({ title: "Transfer reason is required", variant: "destructive" });
      return;
    }
    if (schedules.length === 0) {
      toast({
        title: `Add working hours for ${branchLabelOf(toBranchId)}`,
        description: "At least one working hour slot is required.",
        variant: "destructive",
      });
      return;
    }
    for (const row of schedules) {
      if (!row.start_time || !row.end_time) {
        toast({
          title: `Every slot needs both a start and end time`,
          variant: "destructive",
        });
        return;
      }
      if (row.start_time >= row.end_time) {
        toast({
          title: `Start time must be before end time`,
          variant: "destructive",
        });
        return;
      }
    }

    // Only one transfer may be awaiting confirmation at a time.
    if (recentTransfers.some((t) => t.result.status === "PENDING_CONFIRMATION")) {
      toast({
        title: "A transfer is already awaiting confirmation",
        description: "Complete or discard the existing pending transfer before starting a new one.",
        variant: "destructive",
      });
      return;
    }

    // Client-side conflict check: the new working hours must not overlap
    // any schedule the doctor KEEPS (every branch except the From branch
    // in TRANSFER mode). The backend enforces the same rule — this just
    // fails fast with a friendly message.
    const overlaps = findOverlappingExistingSlots(schedules);
    if (overlaps.length > 0) {
      toast({
        title: "Working hours conflict with an existing slot",
        description: `${overlaps.join(", ")} — nothing was changed. Edit or cancel the conflicting slot first, or choose different hours.`,
        variant: "destructive",
      });
      return;
    }

    const payload: InitiateTransferPayload = {
      mode: opMode,
      ...(opMode === "TRANSFER" ? { old_branch_id: fromBranchId } : {}),
      new_branch_id: toBranchId,
      new_department_id: details.departmentId || undefined,
      effective_date: details.effectiveDate,
      transfer_reason: details.transferReason.trim(),
      working_hours: schedules.map((s) => ({
        branch_id: s.branch_id,
        day_of_week: s.day_of_week as InitiateTransferPayload["working_hours"][number]["day_of_week"],
        shift_name: Number(s.start_time.split(":")[0]) < 12 ? "Morning" : "Evening",
        start_time: s.start_time,
        end_time: s.end_time,
      })),
      consultation_minutes: Number(details.consultationMinutes) || 20,
    };

    setSubmitting(true);
    try {
      const res = await doctorTransferApi.initiateTransfer(id, payload);
      const newTransfer: BranchTransfer = {
        transferId: res.data.data.transfer_id,
        fromBranchId,
        toBranchId,
        effectiveDate: details.effectiveDate,
        result: res.data.data,
      };
      // Add to recent transfers list
      setRecentTransfers((prev) => [newTransfer, ...prev]);
      // Reset form for next transfer (reset both From and To)
      resetForm();
      // Refetch so the From branch list and schedules are fresh — the
      // branch just left must disappear from the dropdown immediately.
      await refreshEmployee();
      setJustCompleted(true);

      const allCompleted = newTransfer.result.status === "COMPLETED";
      toast({
        title: allCompleted ? (opMode === "TRANSFER" ? "Transfer completed" : "Branch added") : "Transfer request created",
        description:
          opMode === "TRANSFER"
            ? `Transfer initiated for ${branchLabelOf(fromBranchId)} → ${branchLabelOf(toBranchId)}.`
            : `Doctor assigned to ${branchLabelOf(toBranchId)} —  existing branches kept.`,
      });
    } catch (err: any) {
      toast({
        title: "Failed to initiate transfer",
        description: err?.response?.data?.message || err?.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // The recent transfer whose details are open in the Step 2 modal
  const viewingTransfer = useMemo(
    () => recentTransfers.find((t) => t.transferId === viewingTransferId) ?? null,
    [recentTransfers, viewingTransferId],
  );

  const handleAffectedCompleted = async (summary: {
    total: number;
    successful: number;
    queued: number;
    cancelled: number;
  }) => {
    if (!viewingTransfer) return;
    setRecentTransfers((prev) =>
      prev.map((t) =>
        t.transferId === viewingTransfer.result.transfer_id
          ? { ...t, result: { ...t.result, status: "COMPLETED" } }
          : t,
      ),
    );
    await refreshEmployee();
    setJustCompleted(true);
    toast({
      title: "Transfer action completed",
      description: `Processed ${summary.total} appointment(s).`,
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-[#00488D]" />
      </div>
    );
  }

  if (!roleOk) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center">
        <AlertTriangle className="h-10 w-10 text-red-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-[#191C1E]">Access restricted</h2>
        <p className="text-sm text-[#64748B] mt-1">
          Only Super Admin, Head Admin and Branch Admin can transfer doctors.
        </p>
      </div>
    );
  }

  const closeViewingModal = () => {
    setViewingTransferId(null);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-lg hover:bg-[#E6E8EA] transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="w-4 h-4 text-[#475569]" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-[#191C1E]">Transfer Doctor</h1>
          <p className="text-xs text-[#64748B]">
            Reassign, reschedule or cancel future appointments
          </p>
        </div>
        {recentTransfers.length > 0 && (
          <StatusBadge
            tone={recentTransfers[0].result.status === "COMPLETED" ? "green" : "amber"}
            status={
              recentTransfers[0].result.status === "COMPLETED"
                ? "Completed"
                : "Pending Confirmation"
            }
          />
        )}
      </div>

      {/* Doctor summary */}
      {doctorSummary && (
        <div className="bg-white rounded-xl border border-[#E5E7EB] p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-[#D6E3FF] flex items-center justify-center font-bold text-[#00488D]">
            {doctorSummary.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="font-semibold text-sm text-[#191C1E]">
              Dr. {doctorSummary.name}
            </div>
            <div className="text-xs text-[#64748B] mt-0.5">
              {doctorSummary.designation} · {doctorSummary.specialization}
            </div>
          </div>
          <StatusBadge status={doctorSummary.active ? "active" : "inactive"} />
        </div>
      )}

      {/* ─── STEP 1: New Transfer ─── */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 space-y-5">
        {justCompleted && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
            <p className="text-xs text-[#00488D] leading-relaxed">
              Transfer completed — the doctor's assignment was updated and the form was reset.
              Review the doctor's current branches above before starting another transfer.
            </p>
            <button
              type="button"
              onClick={() => setJustCompleted(false)}
              className="shrink-0 rounded-lg bg-[#00488D] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#003A70]"
            >
              Start another transfer
            </button>
          </div>
        )}
        <h2 className="font-bold text-sm text-[#191C1E]">1. New Transfer</h2>

        {/* Operation type — Transfer vs Add Branch are distinct operations */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => {
              setOpMode("TRANSFER");
              setFromBranchId("");
              setToBranchId("");
              setSchedules([]);
            }}
            className={`text-left rounded-xl border p-4 transition-colors ${
              opMode === "TRANSFER"
                ? "border-[#00488D] bg-[#EAF2FF] ring-1 ring-[#00488D]/30"
                : "border-[#E5E7EB] bg-white hover:border-[#B8CCE8]"
            }`}
          >
            <div className="text-sm font-bold text-[#191C1E]">Transfer Branch</div>
            <p className="text-xs text-[#64748B] mt-1 leading-relaxed">
              Doctor leaves the From branch — that assignment is deactivated. From and To branches are both required.
            </p>
          </button>
          <button
            type="button"
            onClick={() => {
              setOpMode("ADD_BRANCH");
              setFromBranchId("");
              setToBranchId("");
              setSchedules([]);
            }}
            className={`text-left rounded-xl border p-4 transition-colors ${
              opMode === "ADD_BRANCH"
                ? "border-[#00488D] bg-[#EAF2FF] ring-1 ring-[#00488D]/30"
                : "border-[#E5E7EB] bg-white hover:border-[#B8CCE8]"
            }`}
          >
            <div className="text-sm font-bold text-[#191C1E]">Add Branch</div>
            <p className="text-xs text-[#64748B] mt-1 leading-relaxed">
              Doctor keeps every current branch assignment and gains another active one. No branch is deactivated.
            </p>
          </button>
        </div>

        {/* From Branch / To Branch */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {opMode === "TRANSFER" && (
            <div>
              <label className={labelCls}>From branch</label>
              <FormDropdown
                name="from-branch"
                className={inputCls}
                options={fromBranchOptions}
                value={fromBranchId}
                onValueChange={handleFromBranchChange}
                placeholder="Select from branch"
                emptyMessage="No branches assigned to this doctor"
              />
              <p className="text-[11px] text-[#94A3B8] mt-1">
                Required — the branch the doctor is leaving.
              </p>
              {keptBranches.length > 0 && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2 leading-relaxed">
                  This transfer removes the doctor ONLY from the From branch. The doctor will
                  remain active at: <span className="font-semibold">{keptBranches.join(", ")}</span>.
                </p>
              )}
            </div>
          )}
          <div>
            <label className={labelCls}>To branch</label>
            <FormDropdown
              name="to-branch"
              className={inputCls}
              options={toBranchOptions}
              value={toBranchId}
              onValueChange={handleToBranchChange}
              placeholder="Select destination branch"
              emptyMessage="No branches available"
            />
          </div>
        </div>

        {/* Department / Effective Date / Consultation Minutes / Reason */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Department</label>
            <FormDropdown
              name="department"
              className={inputCls}
              options={departments.map((d) => ({
                label: d.department_name,
                value: d.department_id,
              }))}
              value={details.departmentId}
              onValueChange={(v) => updateDetails("departmentId", v)}
              placeholder="Select department"
            />
          </div>
          <div>
            <label className={labelCls}>Effective date</label>
            <input
              type="date"
              min={todayISODate()}
              className={inputCls}
              value={details.effectiveDate}
              onChange={(e) => updateDetails("effectiveDate", e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Consultation minutes</label>
            <input
              type="number"
              min={1}
              className={inputCls}
              value={details.consultationMinutes}
              onChange={(e) => updateDetails("consultationMinutes", e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Transfer reason</label>
            <textarea
              rows={2}
              className={inputCls}
              value={details.transferReason}
              onChange={(e) => updateDetails("transferReason", e.target.value)}
              placeholder="Why is this doctor being transferred?"
            />
          </div>
        </div>

        {/* Working hours for the destination branch */}
        <div className="border-t border-[#E5E7EB] pt-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-[11px] font-bold text-[#00488D] uppercase tracking-wide">
              Working hours for {toBranchId ? branchLabelOf(toBranchId) : "the destination branch"}
            </span>
            <button
              type="button"
              onClick={addScheduleRow}
              disabled={!toBranchId}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#00488D] bg-[#D6E3FF] hover:bg-[#C3D6FF] px-3 py-1.5 rounded-lg transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="w-3.5 h-3.5" /> Add slot
            </button>
          </div>
          {!toBranchId ? (
            <p className="text-[13px] text-gray-400">
              Select a To Branch first — working hours are tied to the destination branch.
            </p>
          ) : schedules.length === 0 ? (
            <p className="text-[13px] text-gray-400">
              No working hours for this branch yet — add at least one slot.
            </p>
          ) : (
            <div className="space-y-2.5">
              {schedules.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-wrap items-end gap-3 bg-[#F8FAFC] border border-gray-200 border-l-[4px] border-l-blue-600 rounded-[10px] px-4 py-3"
                >
                  <div>
                    <label className={labelCls}>Day</label>
                    <FormDropdown
                      name={`day-${row.id}`}
                      className={inputCls + " !h-9 !w-[150px]"}
                      options={DAYS_OF_WEEK}
                      value={row.day_of_week}
                      onValueChange={(v) => updateScheduleRow(row.id, "day_of_week", v)}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Start</label>
                    <TimepickerWheel
                      value={row.start_time}
                      onChange={(v) => updateScheduleRow(row.id, "start_time", v)}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>End</label>
                    <TimepickerWheel
                      value={row.end_time}
                      onChange={(v) => updateScheduleRow(row.id, "end_time", v)}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeScheduleRow(row.id)}
                    className="w-8 h-8 flex items-center justify-center rounded-[6px] border border-red-300 bg-red-50 text-red-600 hover:bg-red-100 ml-1"
                    aria-label="Remove slot"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-[#E5E7EB] pt-4 sm:flex-row sm:items-center sm:justify-end">
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => navigate(-1)}
              className="px-4 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-[#475569]"
            >
              Cancel
            </button>
            <button
              onClick={handleInitiate}
              disabled={submitting || justCompleted}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-[#00488D] text-white text-xs font-semibold hover:bg-[#003A70] disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Preview affected appointments
            </button>
          </div>
        </div>
      </div>

      {/* ─── Recent Transfers ─── */}
      {recentTransfers.length > 0 && (
        <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#EEF1F4] text-xs font-bold text-gray-600 uppercase tracking-wide">
            Recent Transfers
          </div>
          <div className="divide-y divide-[#F1F5F9]">
            {recentTransfers.map((t) => (
              <div key={t.transferId} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[#191C1E] flex items-center gap-1.5 flex-wrap">
                    {t.fromBranchId ? (
                      <>
                        <span>{branchLabelOf(t.fromBranchId)}</span>
                        <ChevronRight className="h-3.5 w-3.5 text-[#94A3B8] shrink-0" />
                      </>
                    ) : (
                      <span className="text-[#94A3B8]">New assignment</span>
                    )}
                    <span>{branchLabelOf(t.toBranchId)}</span>
                  </div>
                  <div className="text-xs text-[#64748B] mt-0.5">{t.effectiveDate}</div>
                </div>
                <StatusBadge
                  tone={t.result.status === "COMPLETED" ? "green" : "amber"}
                  status={t.result.status === "COMPLETED" ? "Completed" : "Pending Confirmation"}
                />
                <button
                  onClick={() => {
                    setViewingTransferId(t.transferId);
                  }}
                  className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#00488D] bg-[#D6E3FF] hover:bg-[#C3D6FF] transition-colors"
                >
                  View Details
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* ─── STEP 2 modal: affected appointments + action ─── */}
      <AffectedAppointmentsDialog
        open={viewingTransfer !== null}
        onOpenChange={(open) => {
          if (!open) closeViewingModal();
        }}
        employeeId={id ?? ""}
        branches={branches}
        doctors={openDoctors}
        transfers={
          viewingTransfer
            ? [
                {
                  transfer_id: viewingTransfer.result.transfer_id,
                  message: viewingTransfer.result.message,
                },
              ]
            : []
        }
        appointments={viewingTransfer?.result.appointments ?? []}
        title="Transfer Details"
        onCompleted={(summary) => {
          void handleAffectedCompleted(summary);
        }}
      />
    </div>
  );
}
