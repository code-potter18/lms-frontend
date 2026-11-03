import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format, isToday, isTomorrow, isYesterday } from "date-fns";
import {
  CalendarPlus,
  List,
  LayoutGrid,
  Loader2,
  MoreVertical,
  PencilLine,
  Plus,
  User,
  X,
  XCircle,
} from "lucide-react";
import {
  appointmentApi,
  type AppointmentRecord,
} from "../../api/appointment.api";
import { encounterApi } from "../../api/encounter.api";
import {
  doctorDashboardApi,
} from "../../api/doctorDashboard.api";
import { employeeApi } from "../../api/employee.api";
import API, { getActiveBranchId } from "../../api/axios";
import { getUser } from "../../utils/token";
import { ConfirmationDialog } from "@/components/ui/ConfirmationDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { useCriticalPatients } from "@/hooks/useCriticalPatients";
import { CriticalCorner, CriticalDot, CriticalWrapper } from "@/components/hms/CriticalPatientIndicator";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import CalendarPicker from "@/components/hms/Calender";
import HmsTable from "@/components/hms/HmsTable";
import { ToolbarFilter } from "@/components/ui/toolbar-filter";
import { useFilterPanel, useAppointmentFilters } from "@/components/Filter";
import { filterDataByValues } from "@/components/Filter/utils";
import { RefreshButton } from "@/components/hms/RefreshButton";
import { StatusBadge } from "@/components/hms/StatusBadge";
import ExportReport from "@/components/ui/ExportReport";
import { downloadExportPdf } from "@/lib/exportPdf";
import { usePermission } from "@/context/PermissionContext";

type AppointmentStatus =
  | "Checked Out"
  | "Confirmed"
  | "Checked In"
  | "Cancelled"
  | "Reschedule"
  | "In Consultation"
  | "No Show"
  | "Transfer Review"
  | "Reschedule Required";

interface Patient {
  id: string;
  patientId: string;
  name: string;
  patientCode: string;
  age?: number;
  gender?: string;
  phone?: string;
  bloodGroup?: string;
  appointmentDate: string;
  appointmentDateRaw: string;
  appointmentTimeRaw: string;
  originalStatus: string;
  status: AppointmentStatus;
  avatarUrl?: string;
}

const STATUS_TO_DISPLAY: Record<string, AppointmentStatus> = {
  SCHEDULED: "Confirmed",
  RESCHEDULED: "Reschedule",
  CHECKED_IN: "Checked In",
  IN_CONSULTATION: "In Consultation",
  COMPLETED: "Checked Out",
  CANCELLED: "Cancelled",
  NO_SHOW: "No Show",
  TRANSFER_REVIEW_REQUIRED: "Transfer Review",
  RESCHEDULE_REQUIRED: "Reschedule Required",
};

function toDisplayStatus(status: string | null | undefined): AppointmentStatus {
  if (!status) return "Confirmed";
  return STATUS_TO_DISPLAY[status] ?? "Confirmed";
}

function buildPatientName(bio?: AppointmentRecord["patient_bio_data"]): string {
  if (!bio) return "Unknown Patient";
  const parts = [
    bio.patient_first_name,
    bio.patient_middle_name,
    bio.patient_last_name,
  ].filter(Boolean);
  return parts.join(" ") || "Unknown Patient";
}

function formatAppointmentTime(time?: string | null): string {
  if (!time) return "";
  let hours: number;
  let minutes: number;
  if (time.includes("T")) {
    const date = new Date(time);
    if (isNaN(date.getTime())) return time;
    hours = date.getUTCHours();
    minutes = date.getUTCMinutes();
  } else {
    const [h, m] = time.split(":");
    hours = Number(h);
    minutes = Number(m ?? "0");
    if (isNaN(hours)) return time;
  }
  const period = hours < 12 ? "AM" : "PM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${String(hour12).padStart(2, "0")}:${String(minutes).padStart(2, "0")} ${period}`;
}

function computeAge(dob?: string | null): number | undefined {
  if (!dob) return undefined;
  const parsed = new Date(dob);
  if (isNaN(parsed.getTime())) return undefined;
  const now = new Date();
  let age = now.getFullYear() - parsed.getFullYear();
  const monthDiff = now.getMonth() - parsed.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && now.getDate() < parsed.getDate())
  ) {
    age -= 1;
  }
  return age >= 0 && age < 130 ? age : undefined;
}

function isoToPickerDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function pickerDateToKey(date: Date): string {
  return `${date.getFullYear()}-${String(
    date.getMonth() + 1,
  ).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function shiftIsoDay(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  return pickerDateToKey(
    new Date(year, month - 1, day + days),
  );
}

function todayIso(): string {
  return pickerDateToKey(new Date());
}

function isBeforeToday(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const apptDate = new Date(dateStr);
  return apptDate < today;
}

function toPatient(a: AppointmentRecord): Patient {
  const effectiveStatus = a.status ?? "";
  const bio = a.patient_bio_data;
  const gender = bio?.patient_gender
    ? bio.patient_gender.charAt(0).toUpperCase() +
      bio.patient_gender.slice(1).toLowerCase()
    : "—";
  const dateFallback = a.appointment_date
    ? a.appointment_date.slice(0, 10)
    : "—";

  return {
    id: a.appointment_id,
    patientId: a.patient_id,
    name: buildPatientName(bio),
    patientCode: bio?.patient_id ?? `Token ${a.token_number ?? ""}`.trim(),
    gender,
    phone: bio?.patient_primary_mobile ?? "—",
    appointmentDate: formatAppointmentTime(a.appointment_time) || dateFallback,
    appointmentDateRaw: a.appointment_date
      ? a.appointment_date.slice(0, 10)
      : "",
    appointmentTimeRaw: a.appointment_time ?? "",
    originalStatus: a.status ?? "",
    age: bio?.patient_age ?? computeAge(bio?.patient_dob),
    bloodGroup: bio?.patient_blood_group ?? undefined,
    status: toDisplayStatus(effectiveStatus),
  };
}

const PAGE_SIZE = 9;

const AVATAR_PALETTE = [
  { bg: "bg-orange-50", text: "text-orange-500" },
  { bg: "bg-blue-50", text: "text-blue-500" },
  { bg: "bg-emerald-50", text: "text-emerald-500" },
  { bg: "bg-purple-50", text: "text-purple-500" },
  { bg: "bg-pink-50", text: "text-pink-500" },
  { bg: "bg-amber-50", text: "text-amber-600" },
];

function getAvatarColor(name: string) {
  const index = name.charCodeAt(0) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[index];
}

const STATUS_STYLES: Record<AppointmentStatus, string> = {
  "Checked Out": "bg-emerald-50 text-emerald-600",
  Confirmed: "bg-blue-50 text-blue-600",
  "Checked In": "bg-amber-50 text-amber-600",
  Cancelled: "bg-red-50 text-red-500",
  Reschedule: "bg-purple-50 text-purple-600",
  "In Consultation": "bg-cyan-50 text-cyan-600",
  "No Show": "bg-gray-50 text-gray-500",
  "Transfer Review": "bg-indigo-50 text-indigo-600",
  "Reschedule Required": "bg-purple-50 text-purple-600",
};

interface ToolbarProps {
  totalPatients: number;
  view: "grid" | "list";
  onViewChange: (view: "grid" | "list") => void;
  search: string;
  onSearchChange: (value: string) => void;
  selectedDateKey: string;
  onShiftDate: (days: number) => void;
  onJumpToToday: () => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
}

const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "SCHEDULED", label: "Confirmed" },
  { value: "CHECKED_IN", label: "Checked In" },
  { value: "IN_CONSULTATION", label: "In Consultation" },
  { value: "COMPLETED", label: "Checked Out" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "NO_SHOW", label: "No Show" },
  { value: "RESCHEDULED", label: "Reschedule" },
];

function AppointmentToolbar({
  totalPatients,
  view,
  onViewChange,
  search,
  onSearchChange,
  selectedDateKey,
  onShiftDate,
  onJumpToToday,
  statusFilter,
  onStatusFilterChange,
}: ToolbarProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);

  const todayKey = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  })();

  const anchorKey = selectedDateKey ?? todayKey;

  return (
    <div className="flex items-center justify-between gap-4 flex-wrap px-5 py-3 border-b border-[rgba(194,198,212,0.10)]">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold tracking-[1.2px] uppercase text-[#424752]">
          Appointment
        </span>

        <span className="px-2.5 py-1 rounded-full bg-[#EEF2FF] text-[#4F46E5] text-[10px] font-semibold">
          Total Patients : {totalPatients}
        </span>
      </div>

      <div className="flex items-center gap-2 flex-wrap justify-end">
        {/* Search */}
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search..."
            className="pl-8 pr-3 py-1.5 bg-[#F2F4F6] text-xs text-[#6B7280] placeholder:text-[#6B7280] outline-none w-[150px] sm:w-[200px] rounded-md transition-all duration-200 focus:rounded-none focus:w-[200px] sm:focus:w-[250px]"
          />
          <svg
            className="absolute left-2 top-1/2 -translate-y-1/2"
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
          >
            <path
              d="M11.0667 11.5713L6.86667 7.3713C6.53333 7.638 6.15 7.8491 5.71667 8.0046C5.28333 8.1602 4.82222 8.238 4.33333 8.238C3.12222 8.238 2.09722 7.8185 1.25833 6.9796C0.419444 6.1407 0 5.1157 0 3.90462C0 2.69351.419444 1.66851 1.25833.82962C2.09722-.00927 3.12222-.42871 4.33333-.42871C5.54444-.42871 6.56944-.00927 7.40833.82962C8.24722 1.66851 8.66667 2.69351 8.66667 3.90462C8.66667 4.3935 8.58889 4.8546 8.43333 5.288C8.27778 5.7213 8.06667 6.1046 7.8 6.438L12 10.638L11.0667 11.5713ZM4.33333 6.9046C5.16667 6.9046 5.875 6.613 6.45833 6.0296C7.04167 5.4463 7.33333 4.738 7.33333 3.90462C7.33333 3.07129 7.04167 2.36296 6.45833 1.77962C5.875 1.19629 5.16667.90462 4.33333.90462C3.5.90462 2.79167 1.19629 2.20833 1.77962C1.625 2.36296 1.33333 3.07129 1.33333 3.90462C1.33333 4.738 1.625 5.4463 2.20833 6.0296C2.79167 6.613 3.5 6.9046 4.33333 6.9046Z"
              fill="#424752"
            />
          </svg>
        </div>

        {/* View toggle */}
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => onViewChange("list")}
            aria-label="List view"
            aria-pressed={view === "list"}
            className={`flex items-center justify-center w-[25px] h-[27px] border border-[#E5E7EB] rounded-l-lg transition-colors duration-150 ${
              view === "list"
                ? "bg-[#00488D] text-white"
                : "bg-white text-[#424752] hover:bg-[#F2F4F6]"
            }`}
          >
            <svg
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <button
            type="button"
            onClick={() => onViewChange("grid")}
            aria-label="Grid view"
            aria-pressed={view === "grid"}
            className={`flex items-center justify-center w-[25px] h-[27px] border border-[#E5E7EB] rounded-r-lg transition-colors duration-150 ${
              view === "grid"
                ? "bg-[#00488D] text-white"
                : "bg-white text-[#424752] hover:bg-[#F2F4F6]"
            }`}
          >
            <svg
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" />
            </svg>
          </button>
        </div>

        {/* Date nav */}
        <div className="flex items-center">
          <button
            type="button"
            aria-label="Previous day"
            onClick={() => onShiftDate(-1)}
            className="flex items-center justify-center w-[25px] h-[27px] border border-[#E5E7EB] rounded-l-lg transition-colors duration-150 hover:bg-[#F2F4F6]"
          >
            <svg width="6" height="10" viewBox="0 0 6 10" fill="none">
              <path
                d="M5 1L1 5L5 9"
                stroke="black"
                strokeWidth="1.33"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <button
            type="button"
            onClick={onJumpToToday}
            title="Jump to today"
            className={`flex items-center justify-center h-[27px] w-[90px] px-2 border-t border-b border-[#E5E7EB] text-xs font-medium transition-colors duration-150 hover:bg-[#F2F4F6] ${
              selectedDateKey === todayKey
                ? "bg-[#EEF2FF] text-[#4F46E5]"
                : "bg-white"
            }`}
          >
            {(() => {
              const [y, m, d] = selectedDateKey.split("-").map(Number);
              return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
              });
            })()}
          </button>

          <button
            type="button"
            aria-label="Next day"
            onClick={() => onShiftDate(1)}
            className="flex items-center justify-center w-[25px] h-[27px] border border-[#E5E7EB] rounded-r-lg transition-colors duration-150 hover:bg-[#F2F4F6]"
          >
            <svg width="6" height="10" viewBox="0 0 6 10" fill="none">
              <path
                d="M1 1L5 5L1 9"
                stroke="black"
                strokeWidth="1.33"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        {/* Status filter */}
        <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={`flex items-center gap-1.5 px-4 py-2 rounded-[10px] text-xs font-semibold whitespace-nowrap transition-opacity ${
                statusFilter
                  ? "bg-[#062f6e] text-white"
                  : "bg-[#004785] text-white hover:opacity-90"
              }`}
            >
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M4 5h16l-6 8v5l-4 2v-7L4 5z" />
              </svg>
              {statusFilter
                ? STATUS_FILTER_OPTIONS.find(
                    (option) => option.value === statusFilter,
                  )?.label ?? "Filters"
                : "Filters"}
            </button>
          </PopoverTrigger>

          <PopoverContent align="end" className="w-52 p-1 border-[#E5E7EB]">
            <button
              type="button"
              onClick={() => {
                onStatusFilterChange("");
                setFiltersOpen(false);
              }}
              className={`w-full text-left px-3 py-1.5 text-xs rounded-md transition-colors ${
                statusFilter === ""
                  ? "bg-blue-50 font-semibold text-blue-700"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              All statuses
            </button>
            {STATUS_FILTER_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onStatusFilterChange(option.value);
                  setFiltersOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 text-xs rounded-md transition-colors ${
                  statusFilter === option.value
                    ? "bg-blue-50 font-semibold text-blue-700"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {option.label}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

const COLUMNS: { key: string; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "age", label: "Age/Gender" },
  { key: "phone", label: "Mobile" },
  { key: "bloodGroup", label: "Blood Group" },
  { key: "appointmentDate", label: "Appointment" },
  { key: "status", label: "Status" },
];

function SortIcon({ direction }: { direction?: "asc" | "desc" | null }) {
  return (
    <svg
      className={`w-3 h-3 inline ml-1 ${
        direction ? "text-blue-600" : "text-gray-300"
      }`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      {direction === "asc" ? (
        <path d="M8 15l4-6 4 6" />
      ) : direction === "desc" ? (
        <path d="M8 9l4 6 4-6" />
      ) : (
        <path d="M8 9l4-4 4 4M8 15l4 4 4-4" />
      )}
    </svg>
  );
}

// Statuses that allow the Check In transition (mirrors the dashboard).
const CHECKIN_STATUSES = ["SCHEDULED", "RESCHEDULED"];
// Statuses that can proceed to the consultation screen.
const PROCEED_STATUSES = ["CHECKED_IN", "IN_CONSULTATION"];
// Statuses that can no longer be cancelled.
const NON_CANCELABLE_STATUSES = ["COMPLETED", "CANCELLED", "NO_SHOW"];
// Statuses the backend refuses to modify (TERMINAL_APPOINTMENT_STATUSES) --
// reschedule/edit is hidden for these.
const NON_EDITABLE_STATUSES = [
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
];

interface PatientActionProps {
  actionBusyId: string | null;
  onCheckIn: (patient: Patient) => void;
  onProceed: (patient: Patient) => void;
  onCancelRequest: (patient: Patient) => void;
  onReschedule: (patient: Patient) => void;
  onBookFollowUp: (patient: Patient) => void;
}

function AppointmentRowMenu({
  patient,
  onReschedule,
  onBookFollowUp,
  onCancelRequest,
}: {
  patient: Patient;
} & Pick<
  PatientActionProps,
  "onReschedule" | "onBookFollowUp" | "onCancelRequest"
>) {
  const canReschedule = !NON_EDITABLE_STATUSES.includes(
    patient.originalStatus,
  );
  const canCancel = !NON_CANCELABLE_STATUSES.includes(
    patient.originalStatus,
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`More options for ${patient.name}`}
          className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
        >
          <MoreVertical className="w-4 h-4" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem
          className="gap-2"
          onSelect={() => onBookFollowUp(patient)}
        >
          <CalendarPlus className="w-4 h-4 text-gray-500" />
          Book Follow-up
        </DropdownMenuItem>

        {canReschedule && (
          <DropdownMenuItem
            className="gap-2"
            onSelect={() => onReschedule(patient)}
          >
            <PencilLine className="w-4 h-4 text-gray-500" />
            Reschedule
          </DropdownMenuItem>
        )}

        {canCancel && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 text-red-600 focus:text-red-600 focus:bg-red-50"
              onSelect={() => onCancelRequest(patient)}
            >
              <XCircle className="w-4 h-4" />
              Cancel Appointment
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PatientActions({ patient, actionBusyId, onCheckIn, onProceed, onCancelRequest }: PatientActionProps & { patient: Patient }) {
  const canCheckIn = CHECKIN_STATUSES.includes(patient.originalStatus);
  const canProceed = PROCEED_STATUSES.includes(patient.originalStatus);
  const canCancel = !NON_CANCELABLE_STATUSES.includes(patient.originalStatus);
  const isBusy = actionBusyId === patient.id;

  if (!canCheckIn && !canProceed && !canCancel) {
    return (
      <div className="flex items-center justify-end gap-3 text-gray-400">
        —
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {canCheckIn && (
        <button
          type="button"
          disabled={isBusy}
          onClick={() => onCheckIn(patient)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#00488D] text-white text-xs font-semibold hover:bg-[#003a72] disabled:opacity-60"
        >
          {isBusy && <Loader2 className="w-3 h-3 animate-spin" />}
          Check In
        </button>
      )}

      {canProceed && (
        <button
          type="button"
          onClick={() => onProceed(patient)}
          className="px-2.5 py-1 rounded-md border border-[#00488D] text-[#00488D] text-xs font-semibold hover:bg-blue-50"
        >
          Proceed
        </button>
      )}

      {canCancel && (
        <button
          type="button"
          disabled={isBusy}
          onClick={() => onCancelRequest(patient)}
          title="Cancel this appointment"
          className="px-2.5 py-1 rounded-md border border-red-200 text-red-600 text-xs font-semibold hover:bg-red-50 disabled:opacity-60"
        >
          Cancel
        </button>
      )}
    </div>
  );
}

// ============================================================
// GRID-VIEW SUB-COMPONENT
// ============================================================

function PatientCard({
  patient,
  actionBusyId,
  onCheckIn,
  onProceed,
  onCancelRequest,
  onReschedule,
  onBookFollowUp,
  getCriticalInfo,
}: { patient: Patient; getCriticalInfo: (id: string) => import("@/components/hms/CriticalPatientIndicator").CriticalInfo } & PatientActionProps) {
  const canCheckIn = CHECKIN_STATUSES.includes(patient.originalStatus);
  const canProceed = PROCEED_STATUSES.includes(patient.originalStatus);
  const isBusy = actionBusyId === patient.id;
  const crit = getCriticalInfo(patient.patientId);

  return (
    <CriticalWrapper className={`flex items-start gap-4 p-4 border border-[#E5E7EB] rounded-xl hover:shadow-md hover:border-[#D6E3FF] transition-all duration-200 group`} reasons={crit.reasons}>
      <CriticalCorner reasons={crit.reasons} />
      <div data-critical-avatar className="w-16 h-16 rounded-full overflow-hidden bg-[#E5E7EB] flex items-center justify-center flex-shrink-0">
        {patient.avatarUrl ? (
          <img src={patient.avatarUrl} alt={patient.name} className="w-full h-full object-cover" />
        ) : (
          <User className="w-8 h-8 text-[#B0B4BB]" strokeWidth={1.5} />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="hms-name-text truncate">{patient.name}</p>
        <p className="hms-id-text flex items-center">{patient.patientCode}<CriticalDot reasons={crit.reasons} /></p>
        <p className="hms-content-text text-[#191C1E] mt-1">
          {patient.age !== undefined ? `${patient.age}/${patient.gender}` : patient.gender}
        </p>
        <p className="hms-content-text text-[#191C1E]">{patient.phone}</p>
        <p className="hms-content-text text-[#191C1E] font-semibold">{patient.bloodGroup ?? "—"}</p>
      </div>

      <div className="absolute top-3 right-3">
        <AppointmentRowMenu
          patient={patient}
          onCancelRequest={onCancelRequest}
          onReschedule={onReschedule}
          onBookFollowUp={onBookFollowUp}
        />
      </div>

      <button
        type="button"
        aria-label={`Schedule appointment for ${patient.name}`}
        title="Book a follow-up appointment for this patient"
        onClick={() => onBookFollowUp(patient)}
        className="absolute bottom-3 right-3 w-6 h-6 flex items-center justify-center rounded-md border border-[#E5E7EB] bg-white hover:bg-[#F2F4F6] transition-colors"
      >
        <CalendarPlus className="w-3.5 h-3.5 text-[#00488D]" />
      </button>

      {(canCheckIn || canProceed) && (
        <div className="absolute bottom-3 left-4 flex items-center gap-2">
          {canCheckIn && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => onCheckIn(patient)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#00488D] text-white text-xs font-semibold hover:bg-[#003a72] disabled:opacity-60"
            >
              {isBusy && <Loader2 className="w-3 h-3 animate-spin" />}
              Check In
            </button>
          )}

          {canProceed && (
            <button
              type="button"
              onClick={() => onProceed(patient)}
              className="px-3 py-1.5 rounded-lg border border-[#00488D] text-[#00488D] text-xs font-semibold hover:bg-blue-50"
            >
              Proceed
            </button>
          )}
        </div>
      )}
    </CriticalWrapper>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function AppointmentPage() {
  const { toast } = useToast();
  const { can } = usePermission();
  const navigate = useNavigate();
  const [view, setView] = useState<"grid" | "list">("list");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Column sorting (list view headers).
  const [sortField, setSortField] = useState("appointmentDate");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const handleSort = (key: string): void => {
    setPage(1);
    if (sortField === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(key);
      setSortDirection("asc");
    }
  };

  // Date filter — seeded from ?date=YYYY-MM-DD, defaults to today
  const [searchParams] = useSearchParams();
  const [selectedDateKey, setSelectedDateKey] = useState<string>(() => {
    const raw = searchParams.get("date");
    return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : todayIso();
  });
  const [dateFilterOpen, setDateFilterOpen] = useState(false);

  const handleSelectDate = (key: string) => {
    setSelectedDateKey(key);
    setPage(1);
  };

  const [patients, setPatients] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadErrorMsg, setLoadErrorMsg] = useState("");



  const patientAgeData = useMemo(() => {
    return patients.map((p) => ({
      patientId: p.patientId,
      age: p.age,
      dob: null as string | null,
    }));
  }, [patients]);

  const { getCriticalInfo } = useCriticalPatients(patientAgeData);

  const [targetDoctorId, setTargetDoctorId] = useState<string | null>(null);
  const [ownEmployeeIds, setOwnEmployeeIds] = useState<string[]>([]);
  const [resolved, setResolved] = useState(false);
  const [branchIds, setBranchIds] = useState<string[] | null>(null);
  const [doctorName, setDoctorName] = useState("");

  useEffect(() => {
    let cancelled = false;

    const resolveDoctorAndBranches = async () => {
      let doctorId: string | null = null;
      let userId: string | null = null;

      try {
        const authMe = await doctorDashboardApi.getCurrentUser();
        doctorId = authMe.data?.user?.employee_id ?? null;
        userId = authMe.data?.user?.user_id ?? null;
      } catch (err) {
        console.error(
          "[AppointmentPage] /auth/me failed, falling back to session:",
          err,
        );
        doctorId = getUser()?.employee_id ?? null;
      }

      let resolvedBranches: string[] | null = null;

      try {
        const me = await employeeApi.getMe();
        const branches = (me.data?.data?.branches ?? [])
          .filter((b) => b.status !== 0)
          .map((b) => b.branch_id)
          .filter((b): b is string => Boolean(b));
        resolvedBranches =
          branches.length > 0 ? [...new Set(branches)] : null;

        const meData = me.data?.data?.employee;
        const nameParts = [
          meData?.first_name,
          meData?.middle_name,
          meData?.last_name,
        ]
          .filter(Boolean)
          .join(" ");
        if (nameParts) setDoctorName(`Dr. ${nameParts}`);
      } catch (err) {
        console.error("[AppointmentPage] Failed to resolve branches:", err);
      }

      if (!cancelled) {
        setTargetDoctorId(doctorId);
        setOwnEmployeeIds(doctorId ? [doctorId] : []);
      }

      if (userId && !cancelled) {
        try {
          const firstPage = await employeeApi.getAll({
            roleType: "DOCTOR",
            page: 1,
            limit: 1000,
            skipBranchScope: true,
          });
          const firstData = firstPage.data?.data;
          const remainingPages = Array.from(
            { length: Math.max(0, (firstData?.totalPages ?? 1) - 1) },
            (_, index) =>
              employeeApi
                .getAll({
                  roleType: "DOCTOR",
                  page: index + 2,
                  limit: 1000,
                })
                .catch(() => null),
          );
          const remainingResults = await Promise.all(remainingPages);
          const employees = [
            ...(firstData?.employees ?? []),
            ...remainingResults.flatMap(
              (res) => res?.data?.data?.employees ?? [],
            ),
          ];

          const matchedIds = employees
            .filter(
              (emp) =>
                String((emp as any).user_id ?? "") ===
                String(userId),
            )
            .map((emp) => emp.employee_id)
            .filter(Boolean);

          if (matchedIds.length > 0) {
            setOwnEmployeeIds([
              ...new Set([...(doctorId ? [doctorId] : []), ...matchedIds]),
            ]);
          }
        } catch (err) {
          console.error(
            "[AppointmentPage] Duplicate employee-id scan failed:",
            err,
          );
        }
      }

      if (!cancelled) {
        setBranchIds(resolvedBranches);
        setResolved(true);
      }
    };

    void resolveDoctorAndBranches();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchAbortRef = useRef<AbortController | null>(null);

  const fetchAppointments = useCallback(async () => {
    if (!resolved || ownEmployeeIds.length === 0) return;

    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;

    try {
      setIsLoading(true);
      setLoadError(false);
      setLoadErrorMsg("");

      const employeeId = targetDoctorId ?? getUser()?.employee_id ?? undefined;
      const primaryBranchId =
        getActiveBranchId() ?? getUser()?.branch_id ?? undefined;

      const fetchAllForBranch = async (
        branchId: string | undefined,
      ): Promise<AppointmentRecord[]> => {
        const first = await appointmentApi.getAll({
          branchId,
          employeeId,
          date: selectedDateKey,
          page: 1,
          limit: 100,
        }, { signal: controller.signal });
        const data = first.data?.data;
        const items = data?.appointments ?? [];
        const extraPages = Array.from(
          { length: Math.max(0, (data?.totalPages ?? 1) - 1) },
          (_, index) =>
            appointmentApi
              .getAll({
                branchId,
                employeeId,
                date: selectedDateKey,
                page: index + 2,
                limit: 100,
              }, { signal: controller.signal })
              .catch(() => null),
        );
        const rest = await Promise.all(extraPages);
        return [
          ...items,
          ...rest.flatMap((res) => res?.data?.data?.appointments ?? []),
        ];
      };

      let appointments: AppointmentRecord[] = [];

      if (branchIds && branchIds.length > 0) {
        const results = await Promise.all(
          branchIds.map((branchId) =>
            fetchAllForBranch(branchId).catch(() => []),
          ),
        );
        const seen = new Set<string>();
        for (const branchAppointments of results) {
          for (const appointment of branchAppointments) {
            if (!seen.has(appointment.appointment_id)) {
              seen.add(appointment.appointment_id);
              appointments.push(appointment);
            }
          }
        }
      } else {
        appointments = await fetchAllForBranch(primaryBranchId);
      }

      const ownAppointments = appointments
        .filter(
          (a) =>
            ownEmployeeIds.includes(
              a.employees?.employee_id ?? "",
            ),
        )
        .sort((x, y) =>
          (y.appointment_date ?? "").localeCompare(x.appointment_date ?? ""),
        );

      setPatients(ownAppointments.map(toPatient));
    } catch (err: any) {
      if (err?.name === "CanceledError" || err?.name === "AbortError") return;
      console.error(
        "[AppointmentPage] Failed to load appointments:",
        err
      );
      setLoadError(true);
      setLoadErrorMsg(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to load appointments."
      );
    } finally {
      setIsLoading(false);
    }
  }, [resolved, targetDoctorId, branchIds, ownEmployeeIds, selectedDateKey]);

  useEffect(() => {
    fetchAppointments();
    return () => {
      fetchAbortRef.current?.abort();
    };
  }, [fetchAppointments]);

  /* =======================================================
     ROW ACTIONS
     ======================================================= */

  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Patient | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const handleCheckIn = async (patient: Patient): Promise<void> => {
    try {
      setActionBusyId(patient.id);


      await encounterApi.create({
        appointment_id: patient.id,
      });
      await fetchAppointments();
    } catch (err: any) {
      toast({
        title: "Failed to check in patient",
        description:
          err?.response?.data?.message ||
          err?.message ||
          "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setActionBusyId(null);
    }
  };

  const handleProceed = (patient: Patient): void => {
    navigate("/doctor/patient-consultation", {
      state: {
        patientId: patient.patientId,
        appointmentId: patient.id,
        branchId:
          getActiveBranchId() ?? getUser()?.branch_id ?? undefined,
        appointmentDate: patient.appointmentDateRaw,
        appointmentTime: patient.appointmentTimeRaw,
        consultedBy: doctorName || getUser()?.name || "",
      },
    });
  };

  const handleCancelAppointment = async (): Promise<void> => {
    if (!cancelTarget) return;

    try {
      setCancelling(true);
      await appointmentApi.cancel(
        cancelTarget.id,
        "Cancelled by doctor from appointments page",
      );
      setCancelTarget(null);
      toast({
        title: "Appointment cancelled",
        description: "The slot has been released.",
      });
      await fetchAppointments();
    } catch (err: any) {
      toast({
        title: "Failed to cancel appointment",
        description:
          err?.response?.data?.message ||
          err?.message ||
          "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setCancelling(false);
    }
  };

  /* =======================================================
     BOOK / RESCHEDULE NAVIGATION
     ======================================================= */

  const primaryDoctorId =
    ownEmployeeIds[0] ??
    targetDoctorId ??
    getUser()?.employee_id ??
    undefined;

  const buildBookingState = (patient?: Patient) => ({
    doctorBooking: primaryDoctorId
      ? {
          doctorId: primaryDoctorId,
          branchId:
            getActiveBranchId() ??
            getUser()?.branch_id ??
            branchIds?.[0],
        }
      : undefined,
    ...(patient
      ? {
          patient: {
            patient_id: patient.patientId,
            patient_first_name: patient.name.split(" ")[0] || patient.name,
            patient_middle_name:
              patient.name.split(" ").length > 2
                ? patient.name.split(" ").slice(1, -1).join(" ")
                : null,
            patient_last_name:
              patient.name.split(" ").length > 1
                ? patient.name.split(" ").slice(-1)[0]
                : null,
            patient_primary_mobile:
              patient.phone && patient.phone !== "—" ? patient.phone : null,
          },
        }
      : {}),
  });

  const handleBookNew = (): void => {
    navigate("/doctor/appointments/add", {
      state: buildBookingState(),
    });
  };

  const handleBookFollowUp = (patient: Patient): void => {
    navigate("/doctor/appointments/add", {
      state: buildBookingState(patient),
    });
  };

  const handleReschedule = (patient: Patient): void => {
    navigate(`/doctor/appointments/edit/${patient.id}`);
  };

  /* =======================================================
     HEADER NOTIFICATIONS - Using global BellNotificationButton
     ======================================================= */

  function timeAgo(iso: string): string {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return "";

    const seconds = Math.max(
      0,
      Math.floor((Date.now() - then) / 1000),
    );

    if (seconds < 60) return "Just now";

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  /* =======================================================
     FILTERS
     ======================================================= */

  // Filter system — useAppointmentFilters + useFilterPanel
  const appointmentRows = useMemo(
    () =>
      patients.map((p) => ({
        branch: null as string | null,
        status: p.originalStatus,
      })),
    [patients],
  );

  const { appointmentFilterFields } = useAppointmentFilters({ appointmentRows });

  const {
    values: filterValues,
    appliedValues,
    isOpen: isFilterOpen,
    setIsOpen: setIsFilterOpen,
    handleChange: handleFilterChange,
    handleApply: handleApplyFilter,
    handleClear: handleClearFilter,
  } = useFilterPanel(appointmentFilterFields);

  // Search + filter + sort
  const filtered = useMemo(() => {
    let result = patients;

    // Date is enforced server-side, no client filter needed
    // if (result) result = result.filter((p) => p.appointmentDateRaw === selectedDateKey);

    // Search
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((p) =>
        `${p.name} ${p.patientCode} ${p.phone}`.toLowerCase().includes(q),
      );
    }

    // Filter panel values
    const filterable = result.map((p) => ({
      ...p,
      patient: p.name,
      patientId: p.patientCode,
      branch: null as string | null,
      status: p.originalStatus,
    }));
    result = filterDataByValues(filterable, appliedValues, appointmentFilterFields) as Patient[];

    // Sort
    if (sortField) {
      const factor = sortDirection === "asc" ? 1 : -1;
      result = [...result].sort((a: any, b: any) => {
        switch (sortField) {
          case "age":
            return ((a.age ?? -1) - (b.age ?? -1)) * factor;
          case "appointmentDate":
            return `${a.appointmentDateRaw} ${a.appointmentTimeRaw}`.localeCompare(
              `${b.appointmentDateRaw} ${b.appointmentTimeRaw}`,
            ) * factor;
          case "status":
            return a.originalStatus.localeCompare(b.originalStatus) * factor;
          default: {
            const val = String(a[sortField] ?? "").localeCompare(String(b[sortField] ?? ""));
            return val * factor;
          }
        }
      });
    }

    return result;
  }, [patients, selectedDateKey, search, appliedValues, sortField, sortDirection, appointmentFilterFields]);

  const totalRecords = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / rowsPerPage));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const currentRows = filtered.slice(startIndex, endIndex);
  const visibleStart = totalRecords === 0 ? 0 : startIndex + 1;
  const visibleEnd = Math.min(endIndex, totalRecords);

  /* =======================================================
     EXPORT
     ======================================================= */

  const handleExport = (exportFormat: string) => {
    if (exportFormat === "pdf") {
      downloadExportPdf({
        title: "Appointments",
        subtitle: `${filtered.length} appointment${filtered.length === 1 ? "" : "s"} - exported on ${format(new Date(), "dd/MM/yyyy HH:mm")}`,
        filename: `appointments-${format(new Date(), "yyyy-MM-dd")}.pdf`,
        columns: [
          { header: "Patient Name", cell: (r: any) => r.name },
          { header: "Patient Code", cell: (r: any) => r.patientCode },
          { header: "Age/Gender", cell: (r: any) => r.age !== undefined ? `${r.age}/${r.gender}` : r.gender },
          { header: "Phone", cell: (r: any) => r.phone },
          { header: "Blood Group", cell: (r: any) => r.bloodGroup ?? "—" },
          { header: "Appointment", cell: (r: any) => r.appointmentDate },
          { header: "Status", cell: (r: any) => r.status },
        ],
        rows: filtered,
      });
      toast({ title: "Export complete", description: "The PDF file has been downloaded." });
    }
  };

  /* =======================================================
     HmsTable COLUMN DEFINITIONS
     ======================================================= */

  const hmsColumns = useMemo(
    () => [
      {
        key: "name",
        label: "Name",
        sortable: true,
        className: "relative",
        render: (r: any) => {
          const crit = getCriticalInfo(String(r.patientId));
          return (
          <>
            <CriticalCorner reasons={crit.reasons} />
            <CriticalWrapper className="flex items-center gap-2" reasons={crit.reasons}>
              <div data-critical-avatar className="flex items-center justify-center w-7 h-7 rounded-xl flex-shrink-0 hms-avatar-text bg-[#D6E3FF] text-[#00488D]">
                {String(r.name).charAt(0)}
              </div>
              <div>
                <div className="hms-name-text">{String(r.name)}</div>
                <div className="hms-id-text flex items-center">{String(r.patientCode)}<CriticalDot reasons={crit.reasons} /></div>
              </div>
            </CriticalWrapper>
          </>
          );
        },
      },
      {
        key: "age",
        label: "Age/Gender",
        sortable: true,
        render: (r: any) => (
          <span className="text-[#191C1E] hms-content-text">
            {r.age !== undefined ? `${r.age} / ${String(r.gender)}` : String(r.gender)}
          </span>
        ),
      },
      {
        key: "phone",
        label: "Mobile",
        sortable: true,
        render: (r: any) => (
          <span className="text-[#191C1E] hms-content-text">{String(r.phone)}</span>
        ),
      },
      {
        key: "bloodGroup",
        label: "Blood Group",
        sortable: true,
        render: (r: any) => (
          <span className="text-xs font-semibold text-red-500 bg-red-50 px-2.5 py-1 rounded-md">
            {r.bloodGroup ?? "—"}
          </span>
        ),
      },
      {
        key: "appointmentDate",
        label: "Appointment",
        sortable: true,
        render: (r: any) => (
          <span className="text-[#191C1E] hms-content-text">{String(r.appointmentDate)}</span>
        ),
      },
      {
        key: "status",
        label: "Status",
        sortable: true,
        render: (r: any) => <StatusBadge status={String(r.status)} />,
      },
      {
        key: "actions",
        label: "Actions",
        sortable: false,
        render: (r: any) => {
          const patient = r as Patient;
          return (
            <div className="flex items-center justify-end gap-1">
              <PatientActions
                patient={patient}
                actionBusyId={actionBusyId}
                onCheckIn={handleCheckIn}
                onProceed={handleProceed}
                onCancelRequest={setCancelTarget}
                onReschedule={handleReschedule}
                onBookFollowUp={handleBookFollowUp}
              />
              <AppointmentRowMenu
                patient={patient}
                onCancelRequest={setCancelTarget}
                onReschedule={handleReschedule}
                onBookFollowUp={handleBookFollowUp}
              />
            </div>
          );
        },
      },
    ],
    [actionBusyId, handleCheckIn, handleProceed, handleReschedule, handleBookFollowUp],
  );

  /* =======================================================
     RENDER
     ======================================================= */

  return (
    <div className="flex w-full font-[Manrope,sans-serif] bg-[#F7F9FB] min-h-screen">
      <div className="flex flex-col flex-1 min-w-0">
        <main className="flex flex-col gap-6">

          {/* ==================== HEADER ==================== */}
          <div className="flex flex-col md:flex-row md:items-center justify-between px-4 pt-4 pb-2 lg:px-0 lg:pt-0 lg:pb-0">
            <div>
              <h1 className="hms-heading">Appointment</h1>
              <p className="hms-subheading">Real-time doctor appointments and patients.</p>
            </div>
            <div className="flex items-center gap-3">
              {can("report.export") && <ExportReport onExport={handleExport} />}
              <button
                type="button"
                onClick={handleBookNew}
                className="flex items-center gap-2 px-4 py-2 bg-[#004785] rounded-lg text-white text-xs font-semibold shadow-sm hover:bg-[#003a6b] transition-colors"
              >
                <Plus className="w-4 h-4" />
                Book Appointment
              </button>
            </div>
          </div>

          {/* ==================== NOTIFICATION BELL (Global) ==================== */}
          

          {/* ==================== MAIN CARD ==================== */}
          <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm flex flex-col transition-all duration-300 hover:shadow-md">

            {/* ==================== TOOLBAR ==================== */}
            <div className="px-5 py-4 border-b border-[#E5E7EB] flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3 border-r border-[#E5E7EB] pr-4">
                  <span className="text-[#191C1E] text-sm font-bold">{view === "grid" ? "Grid View" : "List View"}</span>
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
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    className="pl-8 pr-3 py-1.5 bg-[#F2F4F6] text-xs text-[#6B7280] placeholder:text-[#6B7280] outline-none w-[150px] sm:w-[200px] rounded-md transition-all duration-200 focus:rounded-none focus:w-[200px] sm:focus:w-[250px]"
                  />
                  <svg className="absolute left-2 top-1/2 -translate-y-1/2" width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M11.0667 11.5713L6.86667 7.3713C6.53333 7.638 6.15 7.8491 5.71667 8.0046C5.28333 8.1602 4.82222 8.238 4.33333 8.238C3.12222 8.238 2.09722 7.8185 1.25833 6.9796C0.419444 6.1407 0 5.1157 0 3.90462C0 2.69351.419444 1.66851 1.25833.82962C2.09722-.00927 3.12222-.42871 4.33333-.42871C5.54444-.42871 6.56944-.00927 7.40833.82962C8.24722 1.66851 8.66667 2.69351 8.66667 3.90462C8.66667 4.3935 8.58889 4.8546 8.43333 5.288C8.27778 5.7213 8.06667 6.1046 7.8 6.438L12 10.638L11.0667 11.5713ZM4.33333 6.9046C5.16667 6.9046 5.875 6.613 6.45833 6.0296C7.04167 5.4463 7.33333 4.738 7.33333 3.90462C7.33333 3.07129 7.04167 2.36296 6.45833 1.77962C5.875 1.19629 5.16667.90462 4.33333.90462C3.5.90462 2.79167 1.19629 2.20833 1.77962C1.625 2.36296 1.33333 3.07129 1.33333 3.90462C1.33333 4.738 1.625 5.4463 2.20833 6.0296C2.79167 6.613 3.5 6.9046 4.33333 6.9046Z" fill="#424752"/>
                  </svg>
                </div>

                {/* View Mode Toggle */}
                <div className="flex border border-[#E5E7EB] rounded-md overflow-hidden bg-[#F2F4F6] p-0.5">
                  <button
                    onClick={() => { setView("list"); setPage(1); }}
                    className={`p-1.5 rounded ${view === "list" ? "bg-white shadow-sm" : "text-[#6B7280]"}`}
                  >
                    <List className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => { setView("grid"); setPage(1); }}
                    className={`p-1.5 rounded ${view === "grid" ? "bg-white shadow-sm" : "text-[#6B7280]"}`}
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                </div>

                {/* Date nav */}
                <div className="flex items-center">
                  <button
                    onClick={() => handleSelectDate(shiftIsoDay(selectedDateKey, -1))}
                    className="flex items-center justify-center w-[25px] h-[27px] border border-[#E5E7EB] rounded-l-lg transition-colors duration-150 hover:bg-[#F2F4F6]"
                  >
                    <svg width="6" height="10" viewBox="0 0 6 10" fill="none">
                      <path d="M5 1L1 5L5 9" stroke="black" strokeWidth="1.33" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                  <Popover open={dateFilterOpen} onOpenChange={setDateFilterOpen}>
                    <PopoverTrigger asChild>
                      <button className="flex items-center justify-center h-[27px] w-[90px] px-2 border-t border-b border-[#E5E7EB] bg-white text-xs font-medium transition-colors duration-150 hover:bg-[#F2F4F6]">
                        {(() => {
                          const d = isoToPickerDate(selectedDateKey);
                          return isToday(d)
                            ? "Today"
                            : isYesterday(d)
                              ? "Yesterday"
                              : isTomorrow(d)
                                ? "Tomorrow"
                                : format(d, "dd/MM/yyyy");
                        })()}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 border-[#E5E7EB] shadow-lg">
                      <CalendarPicker
                        selected={isoToPickerDate(selectedDateKey)}
                        hideThemePicker
                        onSelect={(date) => {
                          if (date instanceof Date) {
                            handleSelectDate(pickerDateToKey(date));
                            setDateFilterOpen(false);
                          }
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                  <button
                    onClick={() => handleSelectDate(shiftIsoDay(selectedDateKey, 1))}
                    className="flex items-center justify-center w-[25px] h-[27px] border border-[#E5E7EB] rounded-r-lg transition-colors duration-150 hover:bg-[#F2F4F6]"
                  >
                    <svg width="6" height="10" viewBox="0 0 6 10" fill="none">
                      <path d="M1 1L5 5L1 9" stroke="black" strokeWidth="1.33" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>

                {/* ToolbarFilter */}
                <ToolbarFilter
                  title="Filters"
                  fields={appointmentFilterFields}
                  values={filterValues}
                  onChange={handleFilterChange}
                  onApply={handleApplyFilter}
                  onClear={handleClearFilter}
                  open={isFilterOpen}
                  onOpenChange={setIsFilterOpen}
                />

                {/* RefreshButton */}
                <RefreshButton onClick={fetchAppointments} isLoading={isLoading} />
              </div>
            </div>

            {/* ==================== BODY ==================== */}
            {isLoading ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-[#6B7280] text-sm">
                <Loader2 size={24} className="animate-spin text-[#00488D]" />
                Loading appointments...
              </div>
            ) : loadError ? (
              <div className="text-center text-sm text-gray-500 py-10 space-y-3">
                <p>{loadErrorMsg || "Failed to load appointments."}</p>
                <button
                  type="button"
                  onClick={fetchAppointments}
                  className="text-blue-600 font-medium hover:underline"
                >
                  Retry
                </button>
              </div>
            ) : view === "list" ? (
              <HmsTable
                columns={hmsColumns}
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
                onPageChange={setPage}
                onRowsPerPageChange={(val) => { setRowsPerPage(val); setPage(1); }}
                rowsPerPageOptions={[5, 10, 20]}
                emptyMessage={
                  `No appointments on ${isoToPickerDate(selectedDateKey).toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}${search ? ` matching "${search}"` : ""}.`
                }
                rowKey={(r: any, i: number) => String(r.id) + i}
                rowClassName={(r: any) => {
                  const crit = getCriticalInfo(String(r.patientId));
                   return "";
                }}
              />
            ) : (
              <>
                <div className="flex-1 p-5 hide-scrollbar max-h-[450px]">
                  {currentRows.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {currentRows.map((patient: any) => (
                        <PatientCard
                          key={patient.id}
                          patient={patient}
                          actionBusyId={actionBusyId}
                          onCheckIn={handleCheckIn}
                          onProceed={handleProceed}
                          onCancelRequest={setCancelTarget}
                          onReschedule={handleReschedule}
                          onBookFollowUp={handleBookFollowUp}
                          getCriticalInfo={getCriticalInfo}
                        />
                      ))}
                    </div>
                   ) : (
                    <div className="flex items-center justify-center h-full py-16 text-center text-[#6B7280] text-sm">
                      {`No appointments on ${isoToPickerDate(selectedDateKey).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}${search ? ` matching "${search}"` : ""}.`}
                    </div>
                  )}
                </div>
                <div className="mt-auto shrink-0 flex flex-wrap items-center justify-between px-5 py-3 border-t border-[rgba(194,198,212,0.10)] bg-[rgba(242,244,246,0.95)] backdrop-blur gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold text-[#424752] tracking-[0.8px] capitalize">
                      Showing {visibleStart} to {visibleEnd} of {totalRecords} patients
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button disabled={currentPage <= 1} onClick={() => setPage((prev) => prev - 1)} className="w-6 h-6 flex items-center justify-center rounded-md disabled:opacity-30 hover:bg-[#E5E7EB] transition-colors">
                      <svg width="5" height="8" viewBox="0 0 5 8" fill="none"><path d="M4 8L0 4L4 0L4.93333.933333L1.86667 4L4.93333 7.06667L4 8Z" fill="#424752"/></svg>
                    </button>
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, index) => (
                      <button key={index} onClick={() => setPage(index + 1)} className={`w-6 h-6 flex items-center justify-center rounded-md text-[10px] font-semibold transition-colors ${currentPage === index + 1 ? "bg-[#004785] text-white" : "text-[#1D1A1A] hover:bg-[#F2F4F6]"}`}>
                        {index + 1}
                      </button>
                    ))}
                    {totalPages > 5 && <span className="text-[#6B7280] text-xs">...</span>}
                    <button disabled={currentPage >= totalPages} onClick={() => setPage((prev) => prev + 1)} className="w-6 h-6 flex items-center justify-center rounded-md disabled:opacity-30 hover:bg-[#E5E7EB] transition-colors">
                      <svg width="5" height="8" viewBox="0 0 5 8" fill="none"><path d="M1 8L5 4L1 0L.0666656.933333L3.13333 4L.0666656 7.06667L1 8Z" fill="#424752"/></svg>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </main>
      </div>

      <ConfirmationDialog
        open={!!cancelTarget}
        title="Cancel this appointment?"
        description={`Cancel ${
          cancelTarget?.name ?? "this patient"
        }'s appointment? The slot will be released and the patient marked as cancelled.`}
        confirmText="Yes, cancel it"
        cancelText="Keep appointment"
        loading={cancelling}
        onConfirm={handleCancelAppointment}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  );
}
