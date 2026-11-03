import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ArrowRightLeft,
  LogOut,
  Users,
  Calendar,
} from "lucide-react";
import HmsTable, { type HmsColumn } from "@/components/hms/HmsTable";
import { getDepartmentColors } from "@/components/hms/DepartmentBadge";
import { format, isToday, isTomorrow, isYesterday, addDays, subDays } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import CalendarPicker from "@/components/hms/Calender";
import { useFilterPanel } from "@/components/Filter";
import { ToolbarFilter } from "@/components/ui/toolbar-filter";
import {
  ipdApi,
  type AdmissionRecord,
  type WardRecord,
  type BedRecord,
  type TransferAdmissionPayload,
  type DischargeAdmissionPayload,
  type DiseaseStatusRecord,
  type DischargeTypeRecord,
  PATIENT_STATUS_AT_DISCHARGE_OPTIONS,
} from "@/api/ipd.api";

/* Dropdown value for "Others": the typed text is added to the master on
   submit, so the whole hospital sees it next time. */
const OTHERS_OPTION = "__OTHERS__";
import { EncounterDocuments } from "@/components/hms/EncounterDocuments";
import { useToast } from "@/hooks/use-toast";
import { getUser } from "@/utils/token";
import { RefreshButton } from "@/components/hms/RefreshButton";
import { StatusBadge } from "@/components/hms/StatusBadge";
import { useBranchFilter, ALL_BRANCHES_VALUE, NO_BRANCH_VALUE } from "@/context/BranchFilterContext";
import { usePermission } from "@/context/PermissionContext";
import { useCriticalPatients } from "@/hooks/useCriticalPatients";
import { CriticalWrapper, CriticalCorner, CriticalDot } from "@/components/hms/CriticalPatientIndicator";
import { AdmissionActionMenu } from "@/components/hms/AdmissionActionMenu";
import { AdmitBedDialog, type AdmitBedDialogMode } from "@/components/hms/AdmitBedDialog";
import { AssignDoctorDialog } from "@/components/hms/AssignDoctorDialog";
import { AllocateCareTeamDialog } from "@/components/hms/AllocateCareTeamDialog";
import { WardShiftAllocationDialog } from "@/components/hms/WardShiftAllocationDialog";
import { ConfirmationDialog } from "@/components/ui/ConfirmationDialog";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// Inpatients are a roster, not a day's schedule -- with no explicit status
// filter applied, the roster defaults to "currently in the hospital"
// (everything short of discharged/cancelled) so a patient stays listed
// until they're actually discharged, regardless of which day they were
// admitted.
const IPD_ACTIVE_STATUSES = ["PLANNED", "ADMITTED", "TRANSFERRED"];

function getInitials(name: string): string {
  const words = name.replace(/^Dr\.?\s*/i, "").trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}

const InpatientAdmissions: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { can } = usePermission();
  // Nurses can discharge directly (with the clinical fields); admins only
  // confirm what the doctor saved in the consultation.
  const userRole = String(getUser()?.role ?? "").toUpperCase();
  const isNurseRole = userRole === "NURSE";
  // Doctors and nurses get a one-click "My Patients" view (consultant, duty
  // doctor or nurse of the admission).
  const isClinicianRole = userRole === "DOCTOR" || isNurseRole;
  // Re-rostering a whole ward is for a charge nurse or an admin (the server
  // enforces the same roles).
  const canRosterWard =
    can("admission.care_team") &&
    ["HEAD_ADMIN", "SUPER_ADMIN", "BRANCH_ADMIN", "ADMIN", "NURSE"].includes(userRole);
  const { selectedBranchId } = useBranchFilter();

  // ---------------------------------------------------------------
  // IPD (admissions) roster -- this page is IPD-only.
  // ---------------------------------------------------------------
  const [admissions, setAdmissions] = useState<AdmissionRecord[]>([]);
  const [admissionsLoading, setAdmissionsLoading] = useState(true);
  const [ipdSearch, setIpdSearch] = useState("");
  const [ipdPage, setIpdPage] = useState(1);
  const [ipdRowsPerPage, setIpdRowsPerPage] = useState(10);
  const [ipdTotal, setIpdTotal] = useState(0);
  const [ipdTotalPages, setIpdTotalPages] = useState(1);

  // IPD sort state — same header-toggling mechanism as the OPD table.
  const [ipdSortField, setIpdSortField] = useState("admission_date");
  const [ipdSortDirection, setIpdSortDirection] = useState<"asc" | "desc">("desc");

  // IPD Date Navigator (mirrors OPD's < Today > control). `ipdNavDate` always
  // drives the navigator label/calendar; `ipdDateFilter` stays null while the
  // "All Active" chip is selected -- the default live in-hospital census -- and
  // holds the chosen day once the user steps through dates, at which point the
  // roster becomes "admissions on that day".
  const [ipdNavDate, setIpdNavDate] = useState<Date>(new Date());
  const [ipdDateFilter, setIpdDateFilter] = useState<Date | null>(null);
  const [isIpdCalendarOpen, setIsIpdCalendarOpen] = useState(false);

  // IPD workflow state (transfer / discharge / details)
  const [activeAdmission, setActiveAdmission] = useState<AdmissionRecord | null>(null);
  const [wards, setWards] = useState<WardRecord[]>([]);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferData, setTransferData] = useState<TransferAdmissionPayload>({
    targetWardId: "",
    targetBedId: "",
    reason: "",
  });
  const [availableBedsForTransfer, setAvailableBedsForTransfer] = useState<BedRecord[]>([]);
  const [submittingTransfer, setSubmittingTransfer] = useState(false);
  const [dischargeOpen, setDischargeOpen] = useState(false);
  const [dischargeData, setDischargeData] = useState<DischargeAdmissionPayload>({
    discharge_type: "RECOVERED",
    discharge_summary: "",
    discharge_advice: "",
    review_date: "",
    discharge_disease_status: "",
    patient_status_at_discharge: "",
  });
  const [submittingDischarge, setSubmittingDischarge] = useState(false);
  // Fetched lazily the first time the discharge dialog opens, then cached --
  // same list the doctor's Diagnosis form maintains (disease_status_master).
  const [diseaseStatusOptions, setDiseaseStatusOptions] = useState<DiseaseStatusRecord[]>([]);
  const [dischargeTypeOptions, setDischargeTypeOptions] = useState<DischargeTypeRecord[]>([]);
  const [otherDischargeType, setOtherDischargeType] = useState("");
  const [otherDiseaseStatus, setOtherDiseaseStatus] = useState("");

  // Planned-request workflow: bed picker (admit / reserve) and the
  // confirm dialogs for cancel / no-show / release reservation.
  const [bedDialog, setBedDialog] = useState<{ mode: AdmitBedDialogMode; admission: AdmissionRecord } | null>(null);
  const [plannedAction, setPlannedAction] = useState<{
    type: "cancel" | "noShow" | "release";
    admission: AdmissionRecord;
  } | null>(null);
  const [plannedReason, setPlannedReason] = useState("");
  // Admitted patient whose doctor is being assigned / changed (emergencies
  // can be admitted before a doctor is known).
  const [assignDoctorFor, setAssignDoctorFor] = useState<AdmissionRecord | null>(null);
  // Duty doctor / nurse allocation: one patient, or a whole ward at once.
  const [careTeamFor, setCareTeamFor] = useState<AdmissionRecord | null>(null);
  const [wardRosterOpen, setWardRosterOpen] = useState(false);
  const [assignedToMe, setAssignedToMe] = useState(false);
  const [submittingPlanned, setSubmittingPlanned] = useState(false);

  // Critical-patient indicators for the IPD patient column, mirroring how the
  // OPD table marks critical patients (admissions state must exist first).
  const admissionPatientIds = useMemo(() => {
    return [...new Set(admissions.map((a) => a.patient_id).filter(Boolean))];
  }, [admissions]);

  const { getCriticalInfo: getAdmissionCriticalInfo } = useCriticalPatients(
    admissionPatientIds.map((id) => ({ patientId: id })),
  );

  const effectiveBranchId = useMemo(() => {
    if (!selectedBranchId || selectedBranchId === ALL_BRANCHES_VALUE || selectedBranchId === NO_BRANCH_VALUE) {
      return undefined;
    }
    return selectedBranchId;
  }, [selectedBranchId]);

  // IPD Filters -- same ToolbarFilter mechanism as OPD, own draft/applied state.
  const {
    values: ipdFilterValues,
    appliedValues: ipdAppliedFilterValues,
    isOpen: isIpdFilterOpen,
    setIsOpen: setIsIpdFilterOpen,
    handleChange: handleIpdFilterChange,
    handleApply: handleApplyIpdFilter,
    handleClear: handleClearIpdFilter,
  } = useFilterPanel();

  // Status lists every admission status (not just ones on the current page)
  // so it stays complete no matter what's currently loaded.
  const ipdFilterFields = [
    {
      id: "status",
      label: "Status",
      type: "multiselect" as const,
      options: [
        { label: "Planned", value: "PLANNED" },
        { label: "Admitted", value: "ADMITTED" },
        { label: "Discharged", value: "DISCHARGED" },
        { label: "Transferred", value: "TRANSFERRED" },
        { label: "Cancelled", value: "CANCELLED" },
        { label: "No-Show", value: "NO_SHOW" },
      ],
    },
  ];

  const ipdAppliedStatus: string[] = useMemo(
    () => (Array.isArray(ipdAppliedFilterValues.status) ? ipdAppliedFilterValues.status : []),
    [ipdAppliedFilterValues.status],
  );

  // The "All Active" chip only carries a count while the table is the
  // untouched live roster (no date / search / status narrowing), so the badge
  // always reads as the current in-hospital census, never a filtered subset.
  const ipdShowActiveCount =
    !ipdDateFilter && ipdAppliedStatus.length === 0 && !ipdSearch.trim();

  // Load Wards (for the transfer dialog)
  const fetchWards = useCallback(async () => {
    try {
      const res = await ipdApi.getWards(effectiveBranchId);
      if (res.data?.success && Array.isArray(res.data.data)) {
        setWards(res.data.data);
      }
    } catch {
      // fallback silent
    }
  }, [effectiveBranchId]);

  // Load Admissions
  const fetchAdmissions = useCallback(async () => {
    setAdmissionsLoading(true);
    try {
      // Date mode turns the roster into a single-day admissions log, so the
      // implicit "currently in hospital" status default is dropped there (an
      // admission from that day may already be discharged). Explicit status
      // picks from the filter panel still win in either mode.
      const statusFilter = ipdAppliedStatus.length
        ? ipdAppliedStatus
        : ipdDateFilter
          ? []
          : IPD_ACTIVE_STATUSES;

      const res = await ipdApi.getAll({
        branchId: effectiveBranchId,
        status: statusFilter.length ? statusFilter.join(",") : undefined,
        date: ipdDateFilter ? format(ipdDateFilter, "yyyy-MM-dd") : undefined,
        search: ipdSearch.trim() || undefined,
        assignedToMe: assignedToMe || undefined,
        page: ipdPage,
        limit: ipdRowsPerPage,
        sortField: ipdSortField,
        sortDirection: ipdSortDirection,
      });

      if (res.data?.success) {
        setAdmissions(res.data.data.admissions || []);
        setIpdTotal(res.data.data.total || 0);
        setIpdTotalPages(res.data.data.totalPages || 1);
      }
    } catch (err: any) {
      toast({
        title: "Failed to load admissions",
        description: err?.message || "Please check your network connection.",
        variant: "destructive",
      });
    } finally {
      setAdmissionsLoading(false);
    }
  }, [effectiveBranchId, ipdAppliedStatus, ipdDateFilter, ipdSearch, assignedToMe, ipdPage, ipdRowsPerPage, ipdSortField, ipdSortDirection, toast]);

  useEffect(() => {
    fetchWards();
  }, [fetchWards]);

  useEffect(() => {
    fetchAdmissions();
  }, [fetchAdmissions]);

  // Same asc/desc toggle as the OPD table, routed through the backend sort.
  const handleIpdSort = (field: string) => {
    if (ipdSortField === field) {
      setIpdSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setIpdSortField(field);
      setIpdSortDirection("asc");
    }
    setIpdPage(1);
  };

  // Date Navigator handlers -- any interaction (stepping or a calendar pick)
  // enters date mode; "All Active" clears back to the live census while the
  // navigator keeps its position, so stepping resumes from the same day.
  const handleIpdDateSelect = (date: Date) => {
    setIpdNavDate(date);
    setIpdDateFilter(date);
    setIpdPage(1);
  };

  const handleIpdShowAllActive = () => {
    setIpdDateFilter(null);
    setIpdPage(1);
  };

  // Open Transfer dialog
  const handleOpenTransfer = (admission: AdmissionRecord) => {
    setActiveAdmission(admission);
    setTransferData({ targetWardId: "", targetBedId: "", reason: "" });
    setAvailableBedsForTransfer([]);
    setTransferOpen(true);
  };

  // When target ward changes in transfer modal, load available beds
  const handleTransferWardChange = async (targetWardId: string) => {
    setTransferData((prev) => ({ ...prev, targetWardId, targetBedId: "" }));
    if (!targetWardId) {
      setAvailableBedsForTransfer([]);
      return;
    }
    try {
      const res = await ipdApi.getBeds(targetWardId, activeAdmission?.branch_id);
      if (res.data?.success) {
        setAvailableBedsForTransfer((res.data.data || []).filter((b) => b.status === "AVAILABLE"));
      }
    } catch {
      setAvailableBedsForTransfer([]);
    }
  };

  // Submit Bed Transfer
  const handleSubmitTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAdmission) return;
    if (!transferData.targetWardId || !transferData.targetBedId) {
      toast({ title: "Target ward and bed are required", variant: "destructive" });
      return;
    }

    setSubmittingTransfer(true);
    try {
      const res = await ipdApi.transfer(activeAdmission.admission_id, transferData);
      if (res.data?.success) {
        toast({
          title: "Bed Transferred",
          description: `Patient successfully transferred to new bed.`,
        });
        setTransferOpen(false);
        fetchAdmissions();
      }
    } catch (err: any) {
      toast({
        title: "Transfer failed",
        description: err?.response?.data?.message || err?.message || "Transfer error.",
        variant: "destructive",
      });
    } finally {
      setSubmittingTransfer(false);
    }
  };

  // Open Discharge dialog
  const handleOpenDischarge = (admission: AdmissionRecord) => {
    setActiveAdmission(admission);
    setDischargeData({
      discharge_type: "RECOVERED",
      discharge_summary: "",
      discharge_advice: "",
      review_date: "",
      discharge_disease_status: "",
      patient_status_at_discharge: "",
    });
    setOtherDischargeType("");
    setOtherDiseaseStatus("");
    setDischargeOpen(true);
    ipdApi
      .listDischargeTypes()
      .then((res) => setDischargeTypeOptions(res.data?.data || []))
      .catch(() => { /* Non-fatal -- the dropdown shows no options. */ });
    ipdApi
      .getByIpNumber(admission.ip_number)
      .then((res) => { if (res.data?.data) setActiveAdmission(res.data.data); })
      .catch(() => { /* list row is enough to confirm */ });

    if (diseaseStatusOptions.length === 0) {
      ipdApi
        .listDiseaseStatuses()
        .then((res) => setDiseaseStatusOptions(res.data?.data || []))
        .catch(() => {
          // Non-fatal -- the dropdown just shows no options; discharge can
          // still proceed without a disease status.
        });
    }
  };

  // Submit Discharge
  const handleSubmitDischarge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAdmission) return;

    setSubmittingDischarge(true);
    try {
      // express-validator's .optional() only skips a field that's
      // undefined -- an empty string still hits isISO8601()/isIn() and
      // fails. review_date and patient_status_at_discharge are both
      // genuinely optional, so blank out to undefined rather than "".
      // discharge_date is intentionally dropped -- the backend stamps "now"
      // the moment this request lands, the same way the doctor's Inpatient
      // Discharge section does, instead of a client-side snapshot that could
      // go stale if the dialog sat open a while before submitting.
      const { discharge_date: _unused, ...rest } = dischargeData;
      // "Others" (nurse): add the typed value to its master first.
      if (isNurseRole && rest.discharge_type === OTHERS_OPTION) {
        if (!otherDischargeType.trim()) throw new Error("Enter the discharge type");
        const added = (await ipdApi.addDischargeType(otherDischargeType.trim())).data?.data;
        if (!added) throw new Error("Could not add the discharge type");
        rest.discharge_type = added.type_code;
      }
      if (isNurseRole && rest.discharge_disease_status === OTHERS_OPTION) {
        if (!otherDiseaseStatus.trim()) throw new Error("Enter the disease status");
        const added = (await ipdApi.addDiseaseStatus(otherDiseaseStatus.trim())).data?.data;
        if (!added) throw new Error("Could not add the disease status");
        rest.discharge_disease_status = added.status_name;
        setDiseaseStatusOptions((prev) => [...prev, added]);
      }
      const payload: DischargeAdmissionPayload = {
        ...rest,
        review_date: dischargeData.review_date || undefined,
        patient_status_at_discharge: dischargeData.patient_status_at_discharge || undefined,
      };
      const res = await ipdApi.discharge(activeAdmission.admission_id, isNurseRole ? payload : {});
      if (res.data?.success) {
        toast({
          title: "Patient Discharged",
          description: `Admission ${activeAdmission.ip_number} has been discharged and bed released.`,
        });
        setDischargeOpen(false);
        fetchAdmissions();
      }
    } catch (err: any) {
      toast({
        title: "Discharge failed",
        description: err?.response?.data?.message || err?.message || "Discharge error.",
        variant: "destructive",
      });
    } finally {
      setSubmittingDischarge(false);
    }
  };

  // Open the admission details view -- same full-page pattern as the OPD
  // appointment view, rather than an inline popup.
  const handleOpenDetails = (admission: AdmissionRecord) => {
    navigate(`/admissions/view/${encodeURIComponent(admission.ip_number)}`);
  };

  // Admit a planned admission request through the bed picker -- the backend
  // occupies the chosen bed, stamps the actual admit time and opens the IPD
  // encounter in a single transaction, so a failure leaves the request
  // untouched. The picker starts on the requested / reserved bed when it's
  // still free, so the usual case stays one confirm.
  const handleAdmitPlanned = (admission: AdmissionRecord) => {
    setBedDialog({ mode: "admit", admission });
  };

  const handleReserveBed = (admission: AdmissionRecord) => {
    setBedDialog({ mode: "reserve", admission });
  };

  const handleBedDialogDone = (updated: AdmissionRecord) => {
    if (bedDialog?.mode === "admit") {
      toast({
        title: "Patient admitted",
        description: `Admitted to ${updated.ward_master?.ward_name || "ward"} • Bed ${updated.bed_master?.bed_number || "—"} and encounter started.`,
      });
    } else {
      toast({
        title: "Bed reserved",
        description: `Bed ${updated.bed_master?.bed_number || "—"} is held for ${updated.ip_number} until the end of the planned day.`,
      });
    }
    fetchAdmissions();
  };

  const openPlannedAction = (type: "cancel" | "noShow" | "release", admission: AdmissionRecord) => {
    setPlannedReason("");
    setPlannedAction({ type, admission });
  };

  const closePlannedAction = () => {
    if (submittingPlanned) return;
    setPlannedAction(null);
    setPlannedReason("");
  };

  const confirmPlannedAction = async () => {
    if (!plannedAction) return;
    const { type, admission } = plannedAction;
    const reason = plannedReason.trim() || undefined;
    setSubmittingPlanned(true);
    try {
      if (type === "cancel") {
        await ipdApi.cancel(admission.admission_id, reason);
        toast({ title: "Request cancelled", description: `Admission request ${admission.ip_number} was cancelled.` });
      } else if (type === "noShow") {
        await ipdApi.noShow(admission.admission_id, reason);
        toast({ title: "Marked as no-show", description: `Admission request ${admission.ip_number} was marked as no-show.` });
      } else {
        await ipdApi.releaseReservation(admission.admission_id);
        toast({ title: "Reservation released", description: `The bed held for ${admission.ip_number} is available again.` });
      }
      setPlannedAction(null);
      setPlannedReason("");
      fetchAdmissions();
    } catch (err: any) {
      toast({
        title: "Action failed",
        description: err?.response?.data?.message || err?.message || "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setSubmittingPlanned(false);
    }
  };

  // A planned request holds a bed only while that bed is RESERVED for it --
  // otherwise its ward/bed is just the requested preference.
  const hasReservation = (row: AdmissionRecord) =>
    row.status === "PLANNED" &&
    row.bed_master?.status === "RESERVED" &&
    row.bed_master?.reserved_admission_id === row.admission_id;

  // Edit a planned admission request via the shared AddAppointment form
  const handleEditPlanned = (admission: AdmissionRecord) => {
    navigate("/appointments/add", { state: { admissionEdit: admission } });
  };

  // IPD columns — same components and text sizes as the OPD table, only the
  // value source changes. Status uses the shared StatusBadge (with IPD tones),
  // the view opens the same full-page pattern as OPD, and sorting runs through
  // the same HmsTable header mechanism (server-side).
  const ipdColumns: HmsColumn<AdmissionRecord>[] = [
    {
      key: "ip_number",
      label: "IP NUMBER",
      className: "!whitespace-normal",
      render: (row) => (
        <button
          onClick={() => handleOpenDetails(row)}
          className="hms-id-text font-bold !text-blue-600 !text-[13px] hover:underline text-left"
        >
          {row.ip_number}
        </button>
      ),
    },
    {
      key: "patient",
      label: "PATIENT",
      className: "!whitespace-normal relative",
      render: (row) => {
        const p = row.patient_bio_data;
        const name = p
          ? [p.patient_first_name, p.patient_middle_name, p.patient_last_name].filter(Boolean).join(" ")
          : "Unknown Patient";
        const { bg: deptBg, text: deptColor } = getDepartmentColors(
          row.department_master?.department_name ?? null,
        );
        const crit = getAdmissionCriticalInfo(row.patient_id);
        return (
          <>
            <CriticalCorner reasons={crit.reasons} />
            <CriticalWrapper className="flex items-center gap-2" reasons={crit.reasons}>
              <div
                data-critical-avatar
                className="w-7 h-7 rounded-xl flex items-center justify-center hms-avatar-text shrink-0"
                style={{ backgroundColor: deptBg, color: deptColor }}
              >
                {getInitials(name)}
              </div>
              <div>
                <div className="hms-name-text capitalize">{name}</div>
                <div className="hms-id-text flex items-center">
                  {row.patient_id}
                  <CriticalDot reasons={crit.reasons} />
                </div>
              </div>
            </CriticalWrapper>
          </>
        );
      },
    },
    {
      key: "branch",
      label: "BRANCH",
      className: "!whitespace-normal",
      render: (row) => (
        <span className="hms-content-text text-[#191C1E]">
          {row.branch?.branch_name || "—"}
        </span>
      ),
    },
    {
      key: "ward_bed",
      label: "WARD & BED",
      className: "!whitespace-normal",
      render: (row) => (
        <div className="hms-content-text text-[#191C1E] leading-4">
          <div>{row.ward_master?.ward_name || "Unassigned Ward"}</div>
          <div className="text-[11px] font-medium text-[#8C8D8F] mt-1">
            {row.bed_master?.bed_number ? `Bed ${row.bed_master.bed_number}` : "Bed —"}
          </div>
          {hasReservation(row) && (
            <span
              className="inline-flex items-center mt-1 px-1.5 py-0.5 rounded bg-[#F5F3FF] text-[#6D28D9] text-[10px] font-semibold border border-violet-100"
              title={
                row.bed_master?.reserved_until
                  ? `Held until ${format(new Date(row.bed_master.reserved_until), "dd MMM, hh:mm a")}`
                  : undefined
              }
            >
              Reserved
            </span>
          )}
        </div>
      ),
    },
    {
      key: "admission_date",
      label: "ADMITTED ON",
      className: "!whitespace-normal",
      render: (row) => {
        const dt = row.admission_date ? new Date(row.admission_date) : null;
        const valid = dt && !isNaN(dt.getTime());
        return (
          <div className="hms-content-text text-[#191C1E] leading-4">
            <div className="flex items-center gap-1.5">
              {valid ? format(dt, "MM/dd/yyyy") : "—"}
              {row.admission_type && (
                <span className="inline-block w-fit text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-200">
                  {row.admission_type}
                </span>
              )}
            </div>
            <div className="text-[11px] font-medium text-[#8C8D8F] mt-1">
              {valid ? format(dt, "hh:mm a") : ""}
            </div>
          </div>
        );
      },
    },
    {
      key: "doctor",
      label: "DOCTOR",
      className: "!whitespace-normal",
      render: (row) => {
        const d = row.employees;
        if (!d) {
          // An admitted patient without a doctor (emergency admitted before
          // one was known) gets a visible prompt instead of a dash.
          if (row.status === "ADMITTED") {
            return can("admission.update") ? (
              <button
                type="button"
                onClick={() => setAssignDoctorFor(row)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-semibold hover:bg-amber-100"
                title="No doctor assigned yet"
              >
                ⚠ Assign doctor
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-semibold">
                ⚠ Unassigned
              </span>
            );
          }
          return <span className="text-gray-400 font-semibold pl-2">—</span>;
        }
        const name = `Dr. ${[d.first_name, d.middle_name, d.last_name].filter(Boolean).join(" ")}`;
        const { bg: deptBg, text: deptColor } = getDepartmentColors(
          row.department_master?.department_name ?? null,
        );
        return (
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-xl flex items-center justify-center hms-avatar-text shrink-0"
              style={{ backgroundColor: deptBg, color: deptColor }}
            >
              {getInitials(name)}
            </div>
            <div>
              <div className="hms-name-text capitalize">{name}</div>
              <div className="hms-id-text">{d.employee_id}</div>
            </div>
          </div>
        );
      },
    },
    {
      key: "care_team",
      label: "CARE TEAM",
      sortable: false,
      className: "!whitespace-normal",
      render: (row) => {
        // Duty doctor / nurse only exist while the patient is admitted.
        if (row.status !== "ADMITTED") {
          return <span className="text-gray-400 font-semibold pl-2">—</span>;
        }
        const canAllocate = can("admission.care_team");
        const slot = (
          label: string,
          person: { first_name: string; middle_name?: string | null; last_name: string } | null | undefined,
          prefix = "",
        ) =>
          person ? (
            <div className="flex items-baseline gap-1.5 leading-tight">
              <span className="text-[10px] font-semibold uppercase text-slate-400 w-10 shrink-0">{label}</span>
              <span className="hms-name-text capitalize">
                {prefix}
                {[person.first_name, person.middle_name, person.last_name].filter(Boolean).join(" ")}
              </span>
            </div>
          ) : canAllocate ? (
            <button
              type="button"
              onClick={() => setCareTeamFor(row)}
              className="flex items-baseline gap-1.5 leading-tight text-left group"
              title={`Assign ${label.toLowerCase()}`}
            >
              <span className="text-[10px] font-semibold uppercase text-slate-400 w-10 shrink-0">{label}</span>
              <span className="text-[11px] font-semibold text-blue-600 group-hover:underline">+ Assign</span>
            </button>
          ) : (
            <div className="flex items-baseline gap-1.5 leading-tight">
              <span className="text-[10px] font-semibold uppercase text-slate-400 w-10 shrink-0">{label}</span>
              <span className="text-[11px] text-slate-400">Unassigned</span>
            </div>
          );
        return (
          <div className="flex flex-col gap-1">
            {slot("Duty", row.assigned_doctor, "Dr. ")}
            {slot("Nurse", row.assigned_nurse)}
          </div>
        );
      },
    },
    {
      key: "status",
      label: "STATUS",
      className: "!whitespace-normal",
      render: (row) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge status={row.status} />
          {row.status === "ADMITTED" && row.discharge_details_at && (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
              Ready for discharge
            </span>
          )}
        </div>
      ),
    },
    {
      key: "actions",
      label: "ACTIONS",
      sortable: false,
      className: "w-px !whitespace-normal !pl-3",
      headerClassName: "w-px !pl-3",
      render: (row) => (
        <AdmissionActionMenu
          status={row.status}
          onView={() => handleOpenDetails(row)}
          onEdit={() => handleEditPlanned(row)}
          onAdmit={() => handleAdmitPlanned(row)}
          onTransfer={() => handleOpenTransfer(row)}
          onDischarge={() => handleOpenDischarge(row)}
          dischargeReady={Boolean(row.discharge_details_at)}
          onOpenConsultation={() =>
            navigate("/doctor/patient-consultation", {
              state: {
                patientId: row.patient_id,
                branchId: row.branch_id,
                encounterNo: row.encounter_no,
                initialStep: "DISCHARGE MEDICATION",
              },
            })
          }
          onReserve={() => handleReserveBed(row)}
          onReleaseReservation={() => openPlannedAction("release", row)}
          onCancel={() => openPlannedAction("cancel", row)}
          onNoShow={() => openPlannedAction("noShow", row)}
          hasReservation={hasReservation(row)}
          onAssignDoctor={() => setAssignDoctorFor(row)}
          hasDoctor={Boolean(row.employee_id)}
          onAllocateCareTeam={() => setCareTeamFor(row)}
          dutyNurseName={
            row.assigned_nurse
              ? [row.assigned_nurse.first_name, row.assigned_nurse.middle_name, row.assigned_nurse.last_name]
                  .filter(Boolean)
                  .join(" ")
              : undefined
          }
          patientId={row.patient_id}
          encounterNo={row.encounter_no}
          onVitalsSaved={fetchAdmissions}
        />
      ),
    },
  ];

  // IPD pagination (server-side)
  const ipdVisibleStart = ipdTotal === 0 ? 0 : (ipdPage - 1) * ipdRowsPerPage + 1;
  const ipdVisibleEnd = Math.min(ipdPage * ipdRowsPerPage, ipdTotal);

  return (
    <div className="flex w-full font-[Manrope,sans-serif] bg-[#F7F9FB] min-h-screen">
      <div className="flex flex-col flex-1 min-w-0">
        <main className="flex flex-col gap-6">

          {/* ==================== HEADER ==================== */}

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">

            <div>
              <h1 className="hms-heading">Inpatient (IPD)</h1>

              <p className="hms-subheading mt-1">
                Total Admissions: {admissions.length}
              </p>

            </div>


            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate("/inpatient/duty-roster")}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-[#004785] rounded-lg text-[#004785] text-xs font-semibold shadow-sm hover:bg-[#F2F4F6] transition-colors"
              >
                <Calendar className="w-4 h-4" />
                Duty Roster
              </button>

              {canRosterWard && (
                <button
                  onClick={() => setWardRosterOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-[#004785] rounded-lg text-[#004785] text-xs font-semibold shadow-sm hover:bg-[#F2F4F6] transition-colors"
                >
                  <Users className="w-4 h-4" />
                  Ward Handoff
                </button>
              )}
              {can("appointment.create") && (
                <button
                  onClick={() =>
                    navigate("/appointments/add", { state: { defaultPatientType: "Inpatient (IPD)" } })
                  }
                  className="flex items-center gap-2 px-4 py-2 bg-[#004785] rounded-lg text-white text-xs font-semibold shadow-sm hover:bg-[#003a6b] transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  New Admission
                </button>
              )}
            </div>


          </div>

          {/* ==================== MAIN CARD ==================== */}

          <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm flex flex-col transition-all duration-300 hover:shadow-md">


            {/* ==================== TOOLBAR ==================== */}

            <div className="px-5 py-4 border-b border-[#E5E7EB] flex flex-wrap items-center justify-between gap-4">

              {/* Empty left slot -- OPD has its View Mode selector here;
                  IPD has no equivalent, but the outer toolbar row uses
                  justify-between across two children, so this keeps the
                  search/filter/refresh group pinned to the right instead
                  of collapsing to the left the way a single child would. */}
              <div />

              <div className="flex items-center gap-3 flex-wrap">
                {/* Search */}
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search IP, patient, UHID..."
                    value={ipdSearch}
                    onChange={(e) => {
                      setIpdSearch(e.target.value);
                      setIpdPage(1);
                    }}
                    className="pl-8 pr-3 py-1.5 bg-[#F2F4F6] text-xs text-[#6B7280] placeholder:text-[#6B7280] outline-none w-[150px] sm:w-[220px] rounded-md transition-all duration-200 focus:rounded-none focus:w-[200px] sm:focus:w-[260px]"
                  />
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#424752]" />
                </div>

                {/* All Active chip + Date Navigator -- "All Active" is the
                    default live census; stepping or picking a date filters
                    admissions to that day, mirroring the OPD navigator. */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleIpdShowAllActive}
                    className={`flex items-center h-[27px] px-3 rounded-lg text-xs font-semibold border transition-colors duration-150 ${
                      !ipdDateFilter
                        ? "bg-[#D6E3FF] border-[#D6E3FF] text-[#00488D]"
                        : "bg-white border-[#E5E7EB] text-[#6B7280] hover:bg-[#F2F4F6]"
                    }`}
                  >
                    All Active{ipdShowActiveCount ? ` (${ipdTotal})` : ""}
                  </button>

                  {isClinicianRole && (
                    <button
                      type="button"
                      onClick={() => {
                        setAssignedToMe((v) => !v);
                        setIpdPage(1);
                      }}
                      title="Only patients where you are the consultant, duty doctor or nurse"
                      className={`flex items-center h-[27px] px-3 rounded-lg text-xs font-semibold border transition-colors duration-150 ${
                        assignedToMe
                          ? "bg-[#D6E3FF] border-[#D6E3FF] text-[#00488D]"
                          : "bg-white border-[#E5E7EB] text-[#6B7280] hover:bg-[#F2F4F6]"
                      }`}
                    >
                      My Patients
                    </button>
                  )}

                  <div className="flex items-center">
                    <button
                      onClick={() => handleIpdDateSelect(subDays(ipdNavDate, 1))}
                      className="flex items-center justify-center w-[25px] h-[27px] border border-[#E5E7EB] rounded-l-lg transition-colors duration-150 hover:bg-[#F2F4F6]"
                    >
                      <ChevronLeft className="w-3 h-3 text-[#424752]" />
                    </button>

                    <Popover open={isIpdCalendarOpen} onOpenChange={setIsIpdCalendarOpen}>
                      <PopoverTrigger asChild>
                        <button className="flex items-center justify-center h-[27px] w-[90px] px-2 border-t border-b border-[#E5E7EB] bg-white text-xs font-medium transition-colors duration-150 hover:bg-[#F2F4F6]">
                          {isToday(ipdNavDate)
                            ? "Today"
                            : isYesterday(ipdNavDate)
                              ? "Yesterday"
                              : isTomorrow(ipdNavDate)
                                ? "Tomorrow"
                                : format(ipdNavDate, "dd/MM/yyyy")}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 border-[#E5E7EB] shadow-lg">
                        <CalendarPicker
                          selected={ipdNavDate}
                          hideThemePicker
                          onSelect={(date) => {
                            if (date instanceof Date) {
                              handleIpdDateSelect(date);
                              setIsIpdCalendarOpen(false);
                            }
                          }}
                        />
                      </PopoverContent>
                    </Popover>

                    <button
                      onClick={() => handleIpdDateSelect(addDays(ipdNavDate, 1))}
                      className="flex items-center justify-center w-[25px] h-[27px] border border-[#E5E7EB] rounded-r-lg transition-colors duration-150 hover:bg-[#F2F4F6]"
                    >
                      <ChevronRight className="w-3 h-3 text-[#424752]" />
                    </button>
                  </div>
                </div>

                {/* Filters */}
                <ToolbarFilter
                  title="Filters"
                  fields={ipdFilterFields}
                  values={ipdFilterValues}
                  onChange={handleIpdFilterChange}
                  onApply={() => {
                    handleApplyIpdFilter();
                    setIpdPage(1);
                  }}
                  onClear={() => {
                    handleClearIpdFilter();
                    setIpdPage(1);
                  }}
                  open={isIpdFilterOpen}
                  onOpenChange={setIsIpdFilterOpen}
                />

                <RefreshButton onClick={fetchAdmissions} isLoading={admissionsLoading} />
              </div>

            </div>

            {admissionsLoading ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-[#6B7280] text-sm">
                <Loader2 size={24} className="animate-spin text-[#00488D]" />
                Loading admissions...
              </div>
            ) : (
              <HmsTable
                scrollable={false}
                columns={ipdColumns}
                data={admissions}
                sortField={ipdSortField}
                sortDirection={ipdSortDirection}
                onSort={handleIpdSort}
                currentPage={ipdPage}
                totalPages={ipdTotalPages}
                totalRecords={ipdTotal}
                rowsPerPage={ipdRowsPerPage}
                visibleStart={ipdVisibleStart}
                visibleEnd={ipdVisibleEnd}
                onPageChange={setIpdPage}
                onRowsPerPageChange={(val) => { setIpdRowsPerPage(val); setIpdPage(1); }}
                rowsPerPageOptions={[5, 10, 20]}
                emptyMessage={
                  ipdDateFilter
                    ? `No patients were admitted on ${format(ipdDateFilter, "dd MMM yyyy")}.`
                    : "No inpatient admissions found matching your criteria."
                }
                rowKey={(row: AdmissionRecord) => row.admission_id}
              />
            )}
          </div>
        </main>
      </div>

      {/* ======================================================== */}
      {/* BED TRANSFER DIALOG                                      */}
      {/* ======================================================== */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-slate-900">
              <ArrowRightLeft className="h-5 w-5 text-blue-600" />
              Transfer Bed
            </DialogTitle>
          </DialogHeader>

          {activeAdmission && (
            <form onSubmit={handleSubmitTransfer} className="space-y-4 py-2">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1 text-slate-600">
                <div>
                  Patient:{" "}
                  <span className="font-semibold text-slate-800">
                    {[
                      activeAdmission.patient_bio_data?.patient_first_name,
                      activeAdmission.patient_bio_data?.patient_last_name,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  </span>
                </div>
                <div>
                  Current Ward:{" "}
                  <span className="font-semibold text-slate-800">
                    {activeAdmission.ward_master?.ward_name || "None"}
                  </span>{" "}
                  • Current Bed:{" "}
                  <span className="font-semibold text-slate-800">
                    {activeAdmission.bed_master?.bed_number || "None"}
                  </span>
                </div>
              </div>

              {/* Target Ward */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Target Ward *</Label>
                <Select value={transferData.targetWardId} onValueChange={handleTransferWardChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Target Ward" />
                  </SelectTrigger>
                  <SelectContent>
                    {wards.map((w) => (
                      <SelectItem key={w.ward_id} value={w.ward_id}>
                        {w.ward_name} ({w.ward_type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Target Bed */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Target Available Bed *</Label>
                <Select
                  value={transferData.targetBedId}
                  onValueChange={(val) => setTransferData((prev) => ({ ...prev, targetBedId: val }))}
                  disabled={!transferData.targetWardId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={transferData.targetWardId ? "Select Bed" : "Select Ward first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableBedsForTransfer.length === 0 ? (
                      <SelectItem value="__NO_BED__" disabled>
                        No available beds in this ward
                      </SelectItem>
                    ) : (
                      availableBedsForTransfer.map((b) => (
                        <SelectItem key={b.bed_id} value={b.bed_id}>
                          Bed {b.bed_number} ({b.bed_type})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Transfer Reason */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Reason for Transfer</Label>
                <Input
                  placeholder="e.g. ICU stepdown, patient request, doctor recommendation"
                  value={transferData.reason || ""}
                  onChange={(e) => setTransferData((prev) => ({ ...prev, reason: e.target.value }))}
                />
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setTransferOpen(false)}
                  disabled={submittingTransfer}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  disabled={submittingTransfer}
                >
                  {submittingTransfer ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Transferring...
                    </>
                  ) : (
                    "Confirm Transfer"
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ======================================================== */}
      {/* DISCHARGE DIALOG                                         */}
      {/* ======================================================== */}
      <Dialog open={dischargeOpen} onOpenChange={setDischargeOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-slate-900">
              <LogOut className="h-5 w-5 text-amber-600" />
              Discharge Inpatient
            </DialogTitle>
          </DialogHeader>

          {activeAdmission && (
            <form onSubmit={handleSubmitDischarge} className="space-y-4 py-2">
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs space-y-1 text-amber-800">
                <div>
                  Patient:{" "}
                  <span className="font-semibold">
                    {[
                      activeAdmission.patient_bio_data?.patient_first_name,
                      activeAdmission.patient_bio_data?.patient_last_name,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  </span>
                </div>
                <div>
                  Bed Allocated:{" "}
                  <span className="font-semibold">{activeAdmission.bed_master?.bed_number || "None"}</span>{" "}
                  (goes to <span className="underline">Cleaning</span> until housekeeping marks it ready)
                </div>
              </div>

              {/* Discharge date & time is not entered here -- the server
                  stamps the moment this form is submitted, the same way an
                  admission's start time is stamped at admit, not picked. */}

              {isNurseRole ? (
                <>
              {/* Discharge Type */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Discharge Type *</Label>
                <Select
                  value={dischargeData.discharge_type}
                  onValueChange={(val) =>
                    setDischargeData((prev) => ({
                      ...prev,
                      discharge_type: val,
                      // Mirrors the server-side auto-force in dischargeAdmission --
                      // deceased is a consequence of the type, not a separate pick.
                      patient_status_at_discharge: val === "DECEASED" ? "DECEASED" : prev.patient_status_at_discharge,
                      review_date: val === "DECEASED" ? "" : prev.review_date,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {dischargeTypeOptions.map((opt) => (
                      <SelectItem key={opt.discharge_type_id} value={opt.type_code}>
                        {opt.type_name}
                      </SelectItem>
                    ))}
                    <SelectItem value={OTHERS_OPTION}>Others</SelectItem>
                  </SelectContent>
                </Select>
                {dischargeData.discharge_type === OTHERS_OPTION && (
                  <Input
                    maxLength={100}
                    placeholder="Type the discharge type"
                    value={otherDischargeType}
                    onChange={(e) => setOtherDischargeType(e.target.value)}
                  />
                )}
              </div>

              {/* Patient Status at Discharge */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Patient Status at Discharge</Label>
                <Select
                  value={dischargeData.patient_status_at_discharge || ""}
                  disabled={dischargeData.discharge_type === "DECEASED"}
                  onValueChange={(val) =>
                    setDischargeData((prev) => ({ ...prev, patient_status_at_discharge: val }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select condition at discharge" />
                  </SelectTrigger>
                  <SelectContent>
                    {PATIENT_STATUS_AT_DISCHARGE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Disease Status -- same list the doctor's Diagnosis form maintains */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Disease Status</Label>
                <Select
                  value={dischargeData.discharge_disease_status || ""}
                  onValueChange={(val) =>
                    setDischargeData((prev) => ({ ...prev, discharge_disease_status: val }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select disease status" />
                  </SelectTrigger>
                  <SelectContent>
                    {diseaseStatusOptions.map((opt) => (
                      <SelectItem key={opt.disease_status_id} value={opt.status_name}>
                        {opt.status_name}
                      </SelectItem>
                    ))}
                    <SelectItem value={OTHERS_OPTION}>Others</SelectItem>
                  </SelectContent>
                </Select>
                {dischargeData.discharge_disease_status === OTHERS_OPTION && (
                  <Input
                    maxLength={100}
                    placeholder="Type the disease status"
                    value={otherDiseaseStatus}
                    onChange={(e) => setOtherDiseaseStatus(e.target.value)}
                  />
                )}
              </div>

              {/* Discharge Summary */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Discharge Summary / Notes</Label>
                <Textarea
                  rows={3}
                  placeholder="Clinical discharge summary, post-discharge medication or follow-up instructions..."
                  value={dischargeData.discharge_summary || ""}
                  onChange={(e) =>
                    setDischargeData((prev) => ({ ...prev, discharge_summary: e.target.value }))
                  }
                />
              </div>

              {/* Discharge Advice -- take-home instructions for the patient */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Discharge Advice</Label>
                <Textarea
                  rows={2}
                  placeholder="Diet, activity, wound care, when to come back..."
                  value={dischargeData.discharge_advice || ""}
                  onChange={(e) =>
                    setDischargeData((prev) => ({ ...prev, discharge_advice: e.target.value }))
                  }
                />
              </div>

              {/* Review Date */}
              {dischargeData.discharge_type !== "DECEASED" && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700">Review / Follow-up Date</Label>
                  <Input
                    type="date"
                    min={new Date().toISOString().slice(0, 10)}
                    value={dischargeData.review_date || ""}
                    onChange={(e) =>
                      setDischargeData((prev) => ({ ...prev, review_date: e.target.value }))
                    }
                  />
                </div>
              )}

                </>
              ) : (
                <>
              {/* Admin: read-only -- the doctor entered these in the
                  consultation; the admin only confirms the discharge. */}
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
                {[
                  ["Discharge Type", dischargeTypeOptions.find((o) => o.type_code === activeAdmission.discharge_type)?.type_name ?? activeAdmission.discharge_type],
                  ["Patient Status", activeAdmission.patient_status_at_discharge],
                  ["Disease Status", activeAdmission.discharge_disease_status],
                  ["Next Visit Date", activeAdmission.review_date ? String(activeAdmission.review_date).slice(0, 10) : null],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <div className="text-[10px] font-bold uppercase text-slate-400">{label}</div>
                    <div className="font-semibold text-slate-800">{(value as string) || "—"}</div>
                  </div>
                ))}
                <div className="col-span-2">
                  <div className="text-[10px] font-bold uppercase text-slate-400">Discharge Summary</div>
                  <div className="whitespace-pre-wrap font-semibold text-slate-800">{activeAdmission.discharge_summary || "—"}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-[10px] font-bold uppercase text-slate-400">Discharge Advice</div>
                  <div className="whitespace-pre-wrap font-semibold text-slate-800">{activeAdmission.discharge_advice || "—"}</div>
                </div>
                <div className="col-span-2 text-[11px] text-slate-500">
                  Saved by {activeAdmission.discharge_details_by_name || activeAdmission.discharge_details_by || "doctor"}
                  {activeAdmission.discharge_details_at ? ` on ${new Date(activeAdmission.discharge_details_at).toLocaleString()}` : ""}
                </div>
              </div>

                </>
              )}

              {/* Attachments -- biopsy reports, discharge paperwork, etc. */}
              <EncounterDocuments
                encounterNo={activeAdmission.encounter_no}
                patientId={activeAdmission.patient_id}
                title="Attachments"
              />

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDischargeOpen(false)}
                  disabled={submittingDischarge}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                  disabled={submittingDischarge}
                >
                  {submittingDischarge ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Discharging...
                    </>
                  ) : (
                    "Confirm Discharge"
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ======================================================== */}
      {/* ADMIT / RESERVE BED PICKER                               */}
      {/* ======================================================== */}
      <AdmitBedDialog
        open={!!bedDialog}
        onOpenChange={(v) => {
          if (!v) setBedDialog(null);
        }}
        mode={bedDialog?.mode ?? "admit"}
        admission={bedDialog?.admission ?? null}
        onDone={handleBedDialogDone}
      />

      {/* ======================================================== */}
      {/* ASSIGN / CHANGE DOCTOR                                   */}
      {/* ======================================================== */}
      <AssignDoctorDialog
        open={!!assignDoctorFor}
        onOpenChange={(v) => {
          if (!v) setAssignDoctorFor(null);
        }}
        admission={assignDoctorFor}
        onDone={(updated) => {
          toast({
            title: "Doctor assigned",
            description: `${updated.ip_number} is now under Dr. ${[updated.employees?.first_name, updated.employees?.last_name].filter(Boolean).join(" ")}.`,
          });
          fetchAdmissions();
        }}
      />

      {/* ======================================================== */}
      {/* CARE TEAM: DUTY DOCTOR / NURSE + HANDOVER                */}
      {/* ======================================================== */}
      <AllocateCareTeamDialog
        open={!!careTeamFor}
        onOpenChange={(v) => {
          if (!v) setCareTeamFor(null);
        }}
        admission={careTeamFor}
        onDone={() => {
          toast({ title: "Care team updated", description: `${careTeamFor?.ip_number ?? "Admission"} care team saved.` });
          fetchAdmissions();
        }}
      />

      <WardShiftAllocationDialog
        open={wardRosterOpen}
        onOpenChange={setWardRosterOpen}
        branchId={effectiveBranchId}
        onDone={fetchAdmissions}
      />

      {/* ======================================================== */}
      {/* CANCEL / NO-SHOW / RELEASE RESERVATION                   */}
      {/* ======================================================== */}
      <ConfirmationDialog
        open={!!plannedAction}
        title={
          plannedAction?.type === "cancel"
            ? "Cancel Admission Request"
            : plannedAction?.type === "noShow"
              ? "Mark as No-Show"
              : "Release Reserved Bed"
        }
        description={
          plannedAction?.type === "release"
            ? `The bed held for ${plannedAction?.admission.ip_number} will become available to other patients. The request itself stays planned.`
            : `Admission request ${plannedAction?.admission.ip_number} will be closed${
                plannedAction && hasReservation(plannedAction.admission) ? " and its reserved bed released" : ""
              }. This can't be undone -- a new request would be needed.`
        }
        type={plannedAction?.type === "release" ? "LockOpen" : "warning"}
        confirmText={
          plannedAction?.type === "cancel"
            ? "Cancel Request"
            : plannedAction?.type === "noShow"
              ? "Mark No-Show"
              : "Release Bed"
        }
        cancelText="Back"
        loading={submittingPlanned}
        onConfirm={confirmPlannedAction}
        onCancel={closePlannedAction}
      >
        {plannedAction && plannedAction.type !== "release" && (
          <div className="w-full text-left">
            <label className="block hms-name-text text-gray-700 mb-1.5">
              Reason <span className="hms-content-text text-gray-400 ml-1">(optional)</span>
            </label>
            <textarea
              value={plannedReason}
              onChange={(e) => setPlannedReason(e.target.value)}
              maxLength={500}
              placeholder={
                plannedAction.type === "cancel"
                  ? "e.g. Patient chose another facility, surgery postponed..."
                  : "e.g. Patient did not arrive, unreachable by phone..."
              }
              rows={3}
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-[13.5px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-[3px] focus:ring-blue-500/15 focus:border-blue-500 transition-all duration-200"
            />
          </div>
        )}
      </ConfirmationDialog>
    </div>

  );
};

export default InpatientAdmissions;
