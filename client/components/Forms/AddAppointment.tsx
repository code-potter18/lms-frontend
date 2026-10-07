import { useState, useEffect, useMemo, useRef, ChangeEvent, FormEvent } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { addDays, format, parseISO } from "date-fns";
import { ArrowLeft, CalendarPlus, Calendar as CalendarIcon, Plus, Loader2, Hospital } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { usePermission } from "@/context/PermissionContext";
import { FormDropdown } from "@/components/ui/form-dropdown";
import { Dropdown } from "@/components/ui/dropdown";
import { ConfirmationDialog } from "@/components/ui/ConfirmationDialog";
import CalendarPicker from "@/components/hms/Calender";
import { PatientConflictWarningDialog, type PatientConflictAppointment } from "@/components/hms/PatientConflictWarningDialog";
import { AddWardDialog } from "@/components/hms/AddWardDialog";
import { AddBedDialog } from "@/components/hms/AddBedDialog";
import VoiceToText from "@/components/ui/voicetotext";
import { branchApi, Branch } from "@/api/branch.api";

interface DoctorAssignedBranch {
  branch_id: string;
  branch_name: string | null;
  status?: number;
  has_schedule?: boolean;
  assigned_date?: string | null;
}
import { getUser } from "@/utils/token";
import { departmentApi, Department } from "@/api/department.api";
import { employeeApi, type EmployeeRecord, type DoctorScheduleRecord } from "@/api/employee.api";
import { doctorScheduleApi, type ScheduleChangeRecord } from "@/api/doctorSchedule.api";
import { patientApi, type PatientRecord } from "@/api/patient.api";
import { ipdApi, type WardRecord, type BedRecord, type AdmissionRecord, type DaycareOccupancy } from "@/api/ipd.api";
import { getBedStatusMeta } from "@/components/hms/BedStatusBadge";
import {
  appointmentApi,
  type AvailableSlot,
  type AppointmentResponse,
} from "@/api/appointment.api";
import { validateRequiredFields, type RequiredField } from "@/lib/validation";
import { activeBranches } from "@/lib/utils";

const OTHER_DEPARTMENT_VALUE = "__OTHER__";

// Payment-mode options recreated from the New Admission dialog on the IPD
// page (admission.payment_mode is a free VARCHAR(100) in the schema) --
// used by the inline Admission Details section of an IPD booking.
const IPD_PAYMENT_MODES = ["CASH", "CARD", "UPI", "INSURANCE", "CREDIT"] as const;

// Map the form's IPD visit types onto the admission.admission_type enum the
// backend stores (REGULAR/Daycare/EMERGENCY/...). Anything unrecognized
// ("Others", "Emergency Visit", ...) lands on REGULAR.
function toAdmissionType(visitType: string): string {
  const t = (visitType || "").trim();
  if (t === "Daycare") return "Daycare";
  if (t === "Emergency Visit") return "EMERGENCY";
  return "REGULAR";
}

// Inverse mapping for load: admission_type -> a valid IPD visit type.
function admissionTypeToVisitType(type: string): string {
  const t = (type || "").toUpperCase();
  if (t.includes("EMERGENCY")) return "Emergency Visit";
  if (t === "DAYCARE") return "Daycare";
  return "Admission";
}

// expected_stay_days is stored as a decimal (days + hours/24). Split back
// into whole days + hours for the form's two inputs.
function ipdStayToDaysHours(stay: number | string | null): { days: number; hours: number } {
  const value = Number(stay) || 0;
  const days = Math.floor(value);
  const hours = Math.max(0, Math.min(23, Math.round((value - days) * 24)));
  return { days, hours };
}

interface AppointmentFormData {
  patientId: string;
  patientName: string;
  patientNumber: string;
  patientType: string;
  patientVisitType: string;
  branchId: string;
  departmentId: string;
  doctorId: string;
  selectDate: string;
  timeSlot: string;
  patientComment: string;
  customVisitType: string;

  // IPD admission-request fields (book-first flow -- only captured here,
  // the real `admission` row is created later at admit time).
  requestedWardId: string;
  requestedBedId: string;
  ipdPaymentMode: string;
  ipdExpectedStayDays: number;
  ipdExpectedStayHours: number;
  ipdAdvanceAmount: number;
  ipdProvisionalDiagnosis: string;
}

// Core static master data for Patient Types
const STATIC_PATIENT_TYPES = [
  "Outpatient (OPD)",
  "Inpatient (IPD)",
] as const;

export type PatientType = (typeof STATIC_PATIENT_TYPES)[number];

/**
 * Helper function: Returns available patient types based on runtime conditions
 * (e.g. filtering by department, role, or context).
 */
function getAvailablePatientTypes(context?: {
  departmentId?: string;
  departmentName?: string;
  role?: string;
}): string[] {
  let types: string[] = [...STATIC_PATIENT_TYPES];
  const dept = (context?.departmentName || "").toLowerCase();

  // Runtime filtering rule based on department context:
  if (dept.includes("lab") || dept.includes("diagnostic")) {
    // Diagnostic / Laboratory departments only take Outpatient visits
    types = types.filter((t) => t === "Outpatient (OPD)");
  }

  return types;
}

const VISIT_TYPES_BY_PATIENT_TYPE: Record<string, string[]> = {
  "Outpatient (OPD)": ["New consultation", "Follow-up", "Lab Visit", "Chemotherapy Visit", "New Complaints", "Others"],
  "Inpatient (IPD)": ["Emergency Visit", "Admission", "Daycare", "Others"],
};

// Legacy patient types from before Emergency/Day Care were folded into IPD.
// Maps them onto their new patient type and a sensible default visit type.
const LEGACY_PATIENT_TYPE_MAP: Record<string, { patientType: string; visitType: string }> = {
  Emergency: { patientType: "Inpatient (IPD)", visitType: "Emergency Visit" },
  "Day Care": { patientType: "Inpatient (IPD)", visitType: "Daycare" },
};

const emptyFormData: AppointmentFormData = {
  patientId: "",
  patientName: "",
  patientNumber: "",
  patientType: "Outpatient (OPD)",
  patientVisitType: "New consultation",
  branchId: "",
  departmentId: "",
  doctorId: "",
  selectDate: format(new Date(), "yyyy-MM-dd"),
  timeSlot: "",
  patientComment: "",
  customVisitType: "",
  requestedWardId: "",
  requestedBedId: "",
  ipdPaymentMode: "CASH",
  ipdExpectedStayDays: 1,
  ipdExpectedStayHours: 0,
  ipdAdvanceAmount: 0,
  ipdProvisionalDiagnosis: "",
};

// Looks forward day-by-day (up to and including maxDateStr) from startDateStr
// for the first date this doctor/branch has a real open slot, so picking a
// doctor doesn't leave the form pointed at a day they're fully booked, not
// scheduled on, or outside the bookable current/next-week window.
async function findNearestAvailableDate(
  doctorId: string,
  branchId: string,
  startDateStr: string,
  maxDateStr: string,
): Promise<string | null> {
  const start = new Date(`${startDateStr}T00:00:00Z`);
  const max = new Date(`${maxDateStr}T00:00:00Z`);
  const maxDays = Math.max(0, Math.round((max.getTime() - start.getTime()) / 86400000));

  for (let i = 0; i <= maxDays; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const dateStr = d.toISOString().split("T")[0];

    try {
      const res = await appointmentApi.getAvailableSlots(doctorId, branchId, dateStr);
      const slots = res.data?.data?.slots || [];
      const isCancelled = res.data?.data?.is_cancelled ?? false;
      // Skip cancelled and leave days when searching for nearest
      // available date. On plain week-off days (not cancelled, not
      // on leave) the form stays put with free-time entry.
      if (isCancelled || (res.data?.data?.is_on_leave ?? false)) {
        continue;
      }
      // On normal scheduled days with available slots, jump to that date.
      if (slots.some((s) => s.is_available)) {
        return dateStr;
      }
    } catch (err) {
      // Doctor/branch combo can legitimately 400 on days with no schedule --
      // log so a real backend/auth failure is still visible, then keep
      // trying the remaining days.
      console.error(`[Add Appointment] getAvailableSlots(${doctorId}, ${branchId}, ${dateStr}) failed:`, err);
    }
  }

  return null;
}

function formatSlotLabel(time: string): string {
  // Slot buttons pass plain "HH:MM"; the booking-confirmation response passes
  // the raw ISO datetime the backend stores appointment_time as (UTC-based) --
  // parse hours/minutes from whichever shape shows up.
  let hours: number;
  let minutes: number;
  if (time.includes("T")) {
    const date = new Date(time);
    hours = date.getUTCHours();
    minutes = date.getUTCMinutes();
  } else {
    [hours, minutes] = time.split(":").map(Number);
  }
  const ampm = hours >= 12 ? "PM" : "AM";
  const h12 = hours % 12 || 12;
  return `${h12.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")} ${ampm}`;
}

function timeStringToMinutes(time: string): number {
  // Available-slots API returns "time" as an ISO datetime on the epoch date
  // (e.g. "1970-01-01T09:00:00.000Z"), while the Day View grid click passes
  // plain "HH:MM" -- handle both shapes.
  if (time.includes("T")) {
    const date = new Date(time);
    return date.getUTCHours() * 60 + date.getUTCMinutes();
  }
  // Handle formatted times like "09:00 AM"
  const cleaned = time.replace(/[ ]?(AM|PM)/i, "").trim();
  const [hoursPart, minutesPart] = cleaned.split(":");
  let hours = Number(hoursPart);
  const minutes = Number(minutesPart);
  if (time.toUpperCase().includes("PM") && hours < 12) hours += 12;
  if (time.toUpperCase().includes("AM") && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

// The hospital operates in Asia/Kolkata (IST), UTC+05:30 with no daylight
// saving. "Now" in IST is UTC now shifted by a fixed offset, so Local and
// Vercel behave identically regardless of the browser/server timezone.
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const getNowInIST = () => new Date(Date.now() + IST_OFFSET_MS);
const getTodayInIST = () => {
  const d = getNowInIST();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};
const getNowMinutesInIST = () => {
  const d = getNowInIST();
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};

// Daycare: would a session starting at `time` (IST) on `date` for
// `stayDays` still fit the ward? Same rule as the server (which re-checks
// under a ward lock when booking): the most sessions running at once inside
// the new one must stay below the ward's usable bed count.
function daycareSlotFits(occ: DaycareOccupancy | null, date: string, time: string, stayDays: number): boolean {
  if (!occ || !(stayDays > 0)) return true;
  if (occ.capacity <= 0) return false;
  const [h, m] = time.split(":").map(Number);
  const start =
    Date.parse(`${date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00.000Z`) - IST_OFFSET_MS;
  const end = start + stayDays * 24 * 60 * 60 * 1000;
  const sessions = occ.bookings
    .map((b) => ({ s: Date.parse(b.start), e: Date.parse(b.end) }))
    .filter((b) => b.s < end && b.e > start);
  const instants = [start, ...sessions.map((b) => b.s).filter((t) => t > start && t < end)];
  const peak = instants.reduce((p, t) => Math.max(p, sessions.filter((b) => b.s <= t && b.e > t).length), 0);
  return peak < occ.capacity;
}

// doctor_schedule.start_time/end_time and appointment_time come back as
// UTC-anchored values — read with UTC getters (same convention as
// formatScheduleTime/toTimeInputValue in Scheduled.tsx) so HH:mm doesn't
// shift with browser timezone.
function toTimeInputValue(time: string | null | undefined): string {
  if (!time) return "";
  const d = new Date(time);
  if (isNaN(d.getTime())) return "";
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

const inputClass =
  "w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200";
const labelClass = "block text-sm font-semibold text-gray-800 mb-1.5";
const requiredStar = <span className="text-red-600 ml-0.5">*</span>;

export default function AddAppointment() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id: appointmentId } = useParams<{ id: string }>();
  const isEditMode = Boolean(appointmentId);
  const { toast } = useToast();
  const { can } = usePermission();

  // Arriving from the IPD list's "Edit Request" (a PLANNED admission, not an
  // appointment) -- this instance of the form edits the admission record via
  // ipdApi.update instead of appointmentApi.
  const admissionEdit = (location.state as { admissionEdit?: AdmissionRecord } | null)?.admissionEdit ?? null;
  const isAdmissionEditMode = Boolean(admissionEdit);
  // A daycare request booked together with a doctor slot: its date, time,
  // doctor, ward and duration are fixed (cancel and book again to change).
  const isLinkedDaycareEdit = Boolean(admissionEdit?.is_daycare && admissionEdit?.appointment_id);

  // Arriving from Patients grid view's schedule icon carries the chosen
  // patient in nav state so the form opens with the patient locked in and
  // the user only needs to pick a doctor.
  const preselectedPatient = (
    location.state as
      | { patient?: Pick<PatientRecord, "patient_id" | "patient_first_name" | "patient_middle_name" | "patient_last_name" | "patient_primary_mobile"> }
      | null
  )?.patient;

  // Arriving from the doctor portal (/doctor/appointments) carries the
  // logged-in doctor's identity so the form opens with themselves locked in
  // as the doctor -- they can only pick the patient/date/time.
  const doctorBooking = (
    location.state as
      | { doctorBooking?: { doctorId: string; branchId?: string; departmentId?: string } }
      | null
  )?.doctorBooking;
  const isDoctorBooking = Boolean(doctorBooking);

  // Arriving from a doctor's profile (Scheduled.tsx, shared by both the
  // /doctor/view and /doctor/day-view routes) "Book Appointment" button
  // carries that doctor's id so the form opens with the doctor locked in
  // and their branch/department auto-filled.
  const preselectedDoctorId = (location.state as { doctorId?: string } | null)?.doctorId;

  // Arriving from the IPD tab's "New Admission" button -- opens straight
  // into the Inpatient admission-request flow (ward/bed section included)
  // instead of defaulting to an OPD consultation.
  const defaultPatientType = (location.state as { defaultPatientType?: string } | null)?.defaultPatientType;

  // Arriving from the Day/Week View grids' "New slot available" click carries
  // the exact doctor/branch/department/date (and the Day View's hour) that
  // cell represented, so everything except the patient is already decided --
  // no nearest-date search needed, since the clicked cell IS a real open slot.
  const preselectedSlot = (
    location.state as {
      slot?: { doctorId: string; branchId: string; departmentId: string; date: string; time?: string };
    } | null
  )?.slot;

  // Branch Admin / Staff Admin sessions are tied to one branch (their active
  // user_branch_mapping) -- default the Branch dropdown to it so the
  // Department/Doctor dropdowns narrow to that branch automatically.
  const currentUser = getUser();
  const currentUserRole = String(currentUser?.role_type || currentUser?.role || "").toUpperCase();
  const currentBranchId =
    currentUserRole === "BRANCH_ADMIN" || currentUserRole === "ADMIN"
      ? String(currentUser?.branch_id || "")
      : "";

  const [formData, setFormData] = useState<AppointmentFormData>(() => {
    let base = preselectedPatient
      ? {
          ...emptyFormData,
          patientId: preselectedPatient.patient_id,
          patientName: `${preselectedPatient.patient_first_name}${preselectedPatient.patient_middle_name ? ` ${preselectedPatient.patient_middle_name}` : ""}${preselectedPatient.patient_last_name ? ` ${preselectedPatient.patient_last_name}` : ""}`,
          patientNumber: preselectedPatient.patient_primary_mobile || "",
        }
      : emptyFormData;
    // Admin's own branch is the default unless a Day View slot already
    // decided the exact branch (preselectedSlot below still wins).
    if (currentBranchId) base = { ...base, branchId: currentBranchId };
    if (preselectedDoctorId) base = { ...base, doctorId: preselectedDoctorId };
    if (preselectedSlot) {
      base = {
        ...base,
        doctorId: preselectedSlot.doctorId,
        branchId: preselectedSlot.branchId,
        departmentId: preselectedSlot.departmentId,
        selectDate: preselectedSlot.date,
      };
    }
    // Doctor portal booking: the logged-in doctor books for themselves --
    // their identity (and active branch/department) arrives locked in and
    // wins over everything except an explicit Day View slot above.
    if (doctorBooking) {
      base = {
        ...base,
        doctorId: doctorBooking.doctorId,
        ...(doctorBooking.branchId ? { branchId: doctorBooking.branchId } : {}),
        ...(doctorBooking.departmentId ? { departmentId: doctorBooking.departmentId } : {}),
      };
    }
    if (defaultPatientType === "Inpatient (IPD)") {
      base = {
        ...base,
        patientType: "Inpatient (IPD)",
        patientVisitType: "Admission",
      };
    }
    return base;
  });

  const [addWardOpen, setAddWardOpen] = useState(false);
  const [addBedOpen, setAddBedOpen] = useState(false);

  // Edit mode - load appointment data
  const [loadingAppointment, setLoadingAppointment] = useState(isEditMode || isAdmissionEditMode);
  const [appointmentStatus, setAppointmentStatus] = useState("");

  useEffect(() => {
    if (!isEditMode || !appointmentId) {
      setLoadingAppointment(false);
      return;
    }

    appointmentApi
      .getOne(appointmentId)
      .then((res) => {
        const record = res.data?.data;

        if (!record) {
          throw new Error("Appointment not found");
        }

        // Terminal statuses can't be edited
        const TERMINAL_STATUSES = ["COMPLETED", "CANCELLED", "NO_SHOW"];
        if (TERMINAL_STATUSES.includes(record.status ?? "")) {
          toast({
            title: "This appointment can't be edited",
            description: `It is already ${record.status?.toLowerCase()}.`,
            variant: "destructive",
          });
          navigate("/appointments");
          return;
        }

        const patient = record.patient_bio_data;
        const date = record.appointment_date ? format(new Date(record.appointment_date), "yyyy-MM-dd") : "";
        // Use UTC time to match the backend storage format (UTC-based)
        const time = record.appointment_time ? toTimeInputValue(record.appointment_time) : "";

        setAppointmentStatus(record.status ?? "");

        // Store original appointment slot for edit mode reference
        const originalSlot = {
          doctorId: record.employee_id || "",
          branchId: record.branch_id || "",
          selectDate: date,
          timeSlot: time,
        };
        originalSlotRef.current = originalSlot;

        // Normalize legacy/unknown patient types and visit types so the edit
        // form always holds values that exist in the current dropdown lists.
        const rawPatientType = record.patient_type || "";
        const legacy = LEGACY_PATIENT_TYPE_MAP[rawPatientType];
        const normalizedPatientType = legacy
          ? legacy.patientType
          : (STATIC_PATIENT_TYPES as readonly string[]).includes(rawPatientType)
            ? rawPatientType
            : "Outpatient (OPD)";
        const allowedVisitTypes = VISIT_TYPES_BY_PATIENT_TYPE[normalizedPatientType] || [];
        const rawVisitType = record.patient_visit_type || "";
        const normalizedVisitType = allowedVisitTypes.includes(rawVisitType)
          ? rawVisitType
          : legacy?.visitType && allowedVisitTypes.includes(legacy.visitType)
            ? legacy.visitType
            : (allowedVisitTypes[0] || "");

        setFormData((prev) => ({
          ...prev,
          patientId: record.patient_id,
          patientName: patient
            ? [patient.patient_first_name, patient.patient_middle_name, patient.patient_last_name]
                .filter(Boolean)
                .join(" ")
            : "",
          patientNumber: patient?.patient_primary_mobile || "",
          branchId: record.branch_id || "",
          departmentId: record.department_id || "",
          doctorId: record.employee_id || "",
          selectDate: date,
          timeSlot: time,
          patientComment: record.reason_for_visit || "",
          patientType: normalizedPatientType,
          patientVisitType: normalizedVisitType,
        }));
      })
      .catch((err) => {
        console.error("[AddAppointment] Load error:", err);
        toast({
          title: "Failed to load appointment",
          description: err.response?.data?.message || "Couldn't reach the appointments API.",
          variant: "destructive",
        });
        navigate("/appointments");
      })
      .finally(() => setLoadingAppointment(false));
  }, [isEditMode, appointmentId, navigate, toast]);

  // Admission-edit mode: populate the form from the PLANNED admission record.
  // The form then submits via ipdApi.update (see handleConfirmCreate).
  useEffect(() => {
    if (!isAdmissionEditMode || !admissionEdit) {
      setLoadingAppointment(false);
      return;
    }
    const stay = ipdStayToDaysHours(admissionEdit.expected_stay_days);
    const patient = admissionEdit.patient_bio_data;
    setFormData((prev) => ({
      ...prev,
      patientId: admissionEdit.patient_id,
      patientName: patient
        ? [patient.patient_first_name, patient.patient_middle_name, patient.patient_last_name]
            .filter(Boolean)
            .join(" ")
        : "",
      patientNumber: patient?.patient_primary_mobile || patient?.patient_contact_number || "",
      branchId: admissionEdit.branch_id,
      departmentId: admissionEdit.department_id || "",
      doctorId: admissionEdit.employee_id || "",
      selectDate: admissionEdit.admission_date
        ? format(new Date(admissionEdit.admission_date), "yyyy-MM-dd")
        : format(new Date(), "yyyy-MM-dd"),
      timeSlot: "",
      patientType: "Inpatient (IPD)",
      patientVisitType: admissionTypeToVisitType(admissionEdit.admission_type),
      requestedWardId: admissionEdit.ward_id || "",
      requestedBedId: admissionEdit.bed_id || "",
      ipdPaymentMode: admissionEdit.payment_mode || "CASH",
      ipdExpectedStayDays: stay.days,
      ipdExpectedStayHours: stay.hours,
      ipdAdvanceAmount: Number(admissionEdit.advance_amount) || 0,
      ipdProvisionalDiagnosis: admissionEdit.provisional_diagnosis || "",
    }));
    setLoadingAppointment(false);
  }, [isAdmissionEditMode, admissionEdit]);

  // The clicked grid cell only knows its hour ("10:00"), not the doctor's
  // real consultation-slot boundaries -- once availableSlots loads for this
  // doctor/branch/date, pick the closest real slot at/after that hour so
  // the time is auto-filled too rather than left for the user to pick again.
  const [preferredTime, setPreferredTime] = useState<string | null>(preselectedSlot?.time ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [bookingResult, setBookingResult] = useState<AppointmentResponse | null>(null);

  // Success payload for an IPD admission request (create or edit) -- shown in
  // its own success dialog since there is no AppointmentResponse for it.
  const [ipdResult, setIpdResult] = useState<AdmissionRecord | null>(null);

  const [showConflictWarning, setShowConflictWarning] = useState(false);
  const [conflictSeverity, setConflictSeverity] = useState<"warning" | "high" | "critical">("warning");
  const [conflictAppointments, setConflictAppointments] = useState<PatientConflictAppointment[]>([]);
  const [conflictMessages, setConflictMessages] = useState<{ type: string; message: string }[]>([]);
  const [checkingConflicts, setCheckingConflicts] = useState(false);

  // Edit mode: store original appointment slot to prevent it from being cleared
  const originalSlotRef = useRef<{
    doctorId: string;
    branchId: string;
    selectDate: string;
    timeSlot: string;
  } | null>(null);

  // Check if current form state matches the original appointment slot
  const isUnchangedSlot = (currentDoctorId: string, currentBranchId: string, currentDate: string, currentTimeSlot: string) => {
    if (!originalSlotRef.current) return false;
    return (
      currentDoctorId === originalSlotRef.current.doctorId &&
      currentBranchId === originalSlotRef.current.branchId &&
      currentDate === originalSlotRef.current.selectDate &&
      currentTimeSlot === originalSlotRef.current.timeSlot
    );
  };

  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const calendarWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        calendarWrapperRef.current &&
        !calendarWrapperRef.current.contains(event.target as Node)
      ) {
        setIsCalendarOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Patient dropdown options. Entries are full records from the API, or the
  // minimal preselected shape arriving via nav state (doctor portal
  // follow-up booking) -- every read below only touches the Pick'd fields.
  type PatientOption = PatientRecord | typeof preselectedPatient;
  const [patients, setPatients] = useState<PatientOption[]>(
    preselectedPatient ? [preselectedPatient] : [],
  );

  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [customDepartment, setCustomDepartment] = useState("");
  const [doctors, setDoctors] = useState<EmployeeRecord[]>([]);

  // Ward/bed data for the IPD Admission Details section -- wards of the
  // selected branch, and the AVAILABLE beds of the requested ward. Book-first
  // flow: these populate the dropdowns so the booking can *request* a ward and
  // bed without binding them yet.
  const [wards, setWards] = useState<WardRecord[]>([]);
  const [beds, setBeds] = useState<BedRecord[]>([]);
  // Daycare: the requested ward's capacity + sessions already booked on the
  // chosen day, used to hide time slots the ward has no room for.
  const [daycareOccupancy, setDaycareOccupancy] = useState<DaycareOccupancy | null>(null);
  const [loadingWards, setLoadingWards] = useState(false);
  const [loadingBeds, setLoadingBeds] = useState(false);

  const handleWardCreated = (ward: WardRecord) => {
    setFormData((prev) => ({ ...prev, requestedWardId: ward.ward_id, requestedBedId: "" }));
    ipdApi.getWards(formData.branchId).then((res) => setWards(res.data?.data || [])).catch(() => {});
    ipdApi.getBeds(ward.ward_id, formData.branchId || undefined).then((res) => setBeds((res.data?.data || []).filter((b) => b.status !== "MAINTENANCE"))).catch(() => setBeds([]));
  };

  const handleBedCreated = (bed: BedRecord) => {
    if (formData.requestedWardId && bed.ward_id === formData.requestedWardId) {
      setBeds((prev) => (prev.some((b) => b.bed_id === bed.bed_id) ? prev : [...prev, bed]));
      setFormData((prev) => ({ ...prev, requestedBedId: bed.bed_id }));
    }
  };

  // Edit mode: load doctor's schedules, assigned branches, and changes
  // without overwriting the existing date/time.
  // applyDoctorSelection would findNearestAvailableDate and reset timeSlot,
  // so we fetch those three pieces directly.
  useEffect(() => {
    if (!isEditMode || !formData.doctorId) return;

    let cancelled = false;

    employeeApi.getOne(formData.doctorId).then((res) => {
      if (cancelled) return;
      setDoctorSchedules(res.data?.data?.doctorSchedules || []);
      setDoctorAssignedBranches(activeBranches(res.data?.data?.branches || []));
    }).catch(() => {});

    loadDoctorChanges(formData.doctorId).then(() => {
      // No-op – loadDoctorChanges already sets state
    }).catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [isEditMode, formData.doctorId]);

  // Available time slots
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [findingNearestDate, setFindingNearestDate] = useState(false);

  // True when the selected doctor has no schedule on the selected date at the
  // selected branch (backend returns an empty slots array in that case) or the
  // slots request itself failed - shown as "Doctor is not assigned for this day".
  const [doctorUnavailable, setDoctorUnavailable] = useState(false);
  const [slotsCancelled, setSlotsCancelled] = useState(false);
  // Backend flagged the whole day as PENDING/APPROVED doctor leave.
  const [doctorOnLeave, setDoctorOnLeave] = useState(false);
  const [leaveReason, setLeaveReason] = useState<string | null>(null);

  // Branches assigned to the currently selected doctor (for filtered dropdown)
  const [doctorAssignedBranches, setDoctorAssignedBranches] = useState<DoctorAssignedBranch[]>([]);

  // The selected doctor's active weekly schedules (from employeeApi.getOne) -
  // used to derive which weekdays they actually work at the selected branch,
  // so the calendar only enables those dates.
  const [doctorSchedules, setDoctorSchedules] = useState<DoctorScheduleRecord[]>([]);

  // Date-specific (non-recurring) schedule changes for the selected doctor:
  // ADD / OVERRIDE / CANCEL records pinned to exact dates (created from the
  // doctor's Day/Week view). The calendar needs these so a one-off working
  // date WITHOUT any recurring template row becomes selectable, while a
  // CANCELLED date gets disabled even though its weekday has a template.
  const [doctorChanges, setDoctorChanges] = useState<ScheduleChangeRecord[]>([]);

  // Doctors actually assigned to the currently selected branch -- used to
  // narrow the Department and Doctor dropdowns down to what's actually
  // available at that branch, once a branch is picked.
  const [branchDoctors, setBranchDoctors] = useState<EmployeeRecord[]>([]);
  const [branchDoctorsLoading, setBranchDoctorsLoading] = useState(false);

  // Tracks the three master-data fetches below (branches, departments,
  // doctors) so the form can stay in a loading state until all of them have
  // resolved -- arriving via a Day View slot click pre-fills branchId/
  // departmentId/doctorId before these lists exist, and rendering the
  // dropdowns against empty lists in the meantime would show them as blank
  // instead of the preselected value.
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [loadingDepartments, setLoadingDepartments] = useState(true);
  const [loadingDoctors, setLoadingDoctors] = useState(true);

  useEffect(() => {
    branchApi
      .getAll()
      .then((res) => {
        if (res.data?.data) setBranches(res.data.data);
        else if (Array.isArray(res.data)) setBranches(res.data as unknown as Branch[]);
      })
      .catch(() => {})
      .finally(() => setLoadingBranches(false));
  }, []);

  useEffect(() => {
    departmentApi
      .getAll()
      .then((res) => {
        if (res.data?.data) setDepartments(res.data.data);
        else if (Array.isArray(res.data)) setDepartments(res.data as unknown as Department[]);
      })
      .catch(() => {})
      .finally(() => setLoadingDepartments(false));
  }, []);

  useEffect(() => {
    employeeApi
      .getAll({ limit: 1000 })
      .then((res) => {
        const allEmployees = res.data?.data?.employees || [];
        const activeDoctors = allEmployees.filter(
          (e) => e.user_table?.role_type === "DOCTOR" && e.emp_status !== false,
        );
        setDoctors(activeDoctors);
      })
      .catch(() => {})
      .finally(() => setLoadingDoctors(false));
  }, []);

  // True while any of branches/departments/doctors is still loading -- the
  // whole form (including a preselected slot's branch/department/doctor)
  // stays behind a loader until all three are ready.
  const isLoadingMasterData = loadingBranches || loadingDepartments || loadingDoctors;

  // Fetch the doctors of the selected branch. The backend computes each
  // doctor's per-branch, per-date status (`doctor_status`) when a date is
  // passed, and scopes the list to the branch's active user_branch_mapping
  // entries -- so this list is the source of truth for who can actually
  // take an appointment at this branch on the selected day.
  useEffect(() => {
    if (!formData.branchId) {
      setBranchDoctors([]);
      setBranchDoctorsLoading(false);
      return;
    }
    setBranchDoctorsLoading(true);
    employeeApi
      .getAll({
        branchId: formData.branchId,
        limit: 1000,
        ...(formData.selectDate ? { date: formData.selectDate } : {}),
      })
      .then((res) => {
        const allEmployees = res.data?.data?.employees || [];
        setBranchDoctors(allEmployees.filter((e) => e.user_table?.role_type === "DOCTOR"));
        setBranchDoctorsLoading(false);
      })
      .catch(() => {
        setBranchDoctors([]);
        setBranchDoctorsLoading(false);
      });
  }, [formData.branchId, formData.selectDate]);

  // The already-selected doctor is always kept in the list, even when the
  // date-aware fetch above excludes them (e.g. no active schedule on the new
  // date) -- so picking a doctor first, a preselected slot, or a date change
  // never makes them vanish from the dropdown. Availability is still guarded
  // by the slots API, which returns an empty list for such doctors.
  useEffect(() => {
    if (!formData.branchId || !formData.doctorId) return;
    const selected = doctors.find((doc) => doc.employee_id === formData.doctorId);
    if (!selected) return;
    setBranchDoctors((prev) =>
      prev.some((doc) => doc.employee_id === formData.doctorId)
        ? prev
        : [...prev, selected],
    );
  }, [branchDoctors, doctors, formData.branchId, formData.doctorId]);

  // Load the wards of the selected branch so an IPD "Admission"/"Daycare"
  // booking can request a ward. Refetches whenever the branch changes.
  useEffect(() => {
    if (!formData.branchId) {
      setWards([]);
      setBeds([]);
      setLoadingWards(false);
      setLoadingBeds(false);
      return;
    }
    setLoadingWards(true);
    ipdApi
      .getWards(formData.branchId)
      .then((res) => {
        setWards(res.data?.data || []);
        setLoadingWards(false);
      })
      .catch(() => {
        setWards([]);
        setLoadingWards(false);
      });
  }, [formData.branchId]);

  // Load the beds of the requested ward. A planned-admission request does not
  // occupy a bed, so every non-maintenance bed is offered (not just AVAILABLE
  // ones) -- the real availability check happens at admit time.
  useEffect(() => {
    if (!formData.requestedWardId) {
      setBeds([]);
      setLoadingBeds(false);
      return;
    }
    setLoadingBeds(true);
    ipdApi
      .getBeds(formData.requestedWardId, formData.branchId || undefined)
      .then((res) => {
        const bedsForRequest = (res.data?.data || []).filter((b) => b.status !== "MAINTENANCE");
        setBeds(bedsForRequest);
        setLoadingBeds(false);
      })
      .catch(() => {
        setBeds([]);
        setLoadingBeds(false);
      });
  }, [formData.requestedWardId, formData.branchId]);

  useEffect(() => {
    const isDaycareCreate =
      formData.patientType === "Inpatient (IPD)" &&
      formData.patientVisitType === "Daycare" &&
      !isAdmissionEditMode;
    if (!isDaycareCreate || !formData.requestedWardId || !formData.selectDate) {
      setDaycareOccupancy(null);
      return;
    }
    let cancelled = false;
    ipdApi
      .getDaycareOccupancy(formData.requestedWardId, formData.selectDate)
      .then((res) => {
        if (!cancelled) setDaycareOccupancy(res.data?.data ?? null);
      })
      .catch(() => {
        if (!cancelled) setDaycareOccupancy(null);
      });
    return () => {
      cancelled = true;
    };
  }, [formData.patientType, formData.patientVisitType, formData.requestedWardId, formData.selectDate, isAdmissionEditMode]);

  // A chosen daycare slot that no longer fits (ward / date / duration changed)
  // is cleared rather than left selected.
  useEffect(() => {
    if (!formData.timeSlot || !daycareOccupancy) return;
    const stay = formData.ipdExpectedStayDays + formData.ipdExpectedStayHours / 24;
    if (!daycareSlotFits(daycareOccupancy, formData.selectDate, formData.timeSlot, stay)) {
      setFormData((prev) => ({ ...prev, timeSlot: "" }));
    }
  }, [daycareOccupancy, formData.timeSlot, formData.selectDate, formData.ipdExpectedStayDays, formData.ipdExpectedStayHours]);

  // Fetch available slots when branch + doctor + date changes
  useEffect(() => {
    // IPD admission requests are planned admissions, not OPD bookings -- they
    // never fetch or auto-assign a time slot (a planned admission holds no
    // appointment slot to claim).
    // Daycare is the exception: it books the doctor's OPD slot together with
    // the daycare request, so it uses the slot picker (except when editing).
    if (
      formData.patientType === "Inpatient (IPD)" &&
      (formData.patientVisitType !== "Daycare" || isAdmissionEditMode)
    ) {
      return;
    }

    if (!formData.doctorId || !formData.branchId || !formData.selectDate) {
      setAvailableSlots([]);
      setDoctorUnavailable(false);
      setDoctorOnLeave(false);
      setLeaveReason(null);
      return;
    }

    // In edit mode, don't clear timeSlot if it's the unchanged original slot
    if (!isEditMode || !isUnchangedSlot(formData.doctorId, formData.branchId, formData.selectDate, formData.timeSlot)) {
      setFormData((prev) => ({ ...prev, timeSlot: "" }));
    }

    setLoadingSlots(true);
    setDoctorUnavailable(false);
    setDoctorOnLeave(false);
    setLeaveReason(null);

    let cancelled = false;

    (async () => {
      let openSlots: AvailableSlot[] = [];
      let fetchError: any = null;

      try {
        const res = await appointmentApi.getAvailableSlots(
          formData.doctorId,
          formData.branchId,
          formData.selectDate,
        );
        const slots = res.data.data?.slots || [];


        // Defensive client-side filter: for today (in IST) drop any slot whose
        // time is at or before the current IST time. The backend is the source
        // of truth, but a past slot must never leak through to the UI.
        const todayInIST = getTodayInIST();
        const nowMinutesInIST = getNowMinutesInIST();
        const isTodayIST = formData.selectDate === todayInIST;
        const futureSlots = slots.filter(
          (s) => s.is_available && (!isTodayIST || timeStringToMinutes(s.time) > nowMinutesInIST),
        );

        setAvailableSlots(futureSlots);
        // Empty slots array = the backend found no active schedule for this
        // doctor/branch/date (a fully-booked day still returns slot entries).
        openSlots = futureSlots;

        const isCancelled = res.data.data?.is_cancelled ?? false;
        const isOnLeave = res.data.data?.is_on_leave ?? false;
        setSlotsCancelled(isCancelled);
        setDoctorOnLeave(isOnLeave);
        setLeaveReason(res.data.data?.leave_reason ?? null);
        setDoctorUnavailable(
          slots.length === 0 && !isCancelled && !isOnLeave
        );

      } catch (error) {
        fetchError = error;
        setAvailableSlots([]);
        setDoctorUnavailable(true);
        setSlotsCancelled(false);
        setDoctorOnLeave(false);
        setLeaveReason(null);
      }

      if (cancelled) return;

      // IPD bookings skip the slot picker entirely: auto-assign the earliest
      // open slot, or (create mode) auto-jump to the next date that has one.
      if (formData.patientType === "Inpatient (IPD)" && formData.patientVisitType !== "Daycare") {
        if (openSlots.length > 0) {
          // Edit mode keeps the unchanged original slot untouched.
          const keepOriginal =
            isEditMode &&
            isUnchangedSlot(
              formData.doctorId,
              formData.branchId,
              formData.selectDate,
              formData.timeSlot,
            );
          if (!keepOriginal) {
            const earliest = [...openSlots]
              .sort((a, b) => timeStringToMinutes(a.time) - timeStringToMinutes(b.time))[0];
            if (earliest) {
              setFormData((prev) => ({ ...prev, timeSlot: earliest.time }));
            }
          }
        } else if (!isEditMode) {
          setFindingNearestDate(true);
          const nextDate = await findNearestAvailableDate(
            formData.doctorId,
            formData.branchId,
            formData.selectDate,
            maxSelectableDate,
          );
          setFindingNearestDate(false);
          if (cancelled) return;
          if (nextDate && nextDate !== formData.selectDate) {
            setFormData((prev) => ({ ...prev, selectDate: nextDate, timeSlot: "" }));
          }
        }
        setLoadingSlots(false);
        return;
      }

      // A Day View "New slot available" cell decides an hour is bookable from
      // the doctor_schedule row alone (day-of-week + time overlap) -- it
      // doesn't re-check everything this endpoint does (active branch
      // mapping, a fully-booked shift, etc). When that disagreement leaves
      // this exact doctor/branch/date with no real slots (empty list, or the
      // request itself rejected), search forward the same way picking a
      // doctor from the dropdown already does, instead of dead-ending with
      // an empty slot list and nothing to highlight.
      if ((fetchError || openSlots.length === 0) && preferredTime) {
        setFindingNearestDate(true);
        const nextDate = await findNearestAvailableDate(
          formData.doctorId,
          formData.branchId,
          formData.selectDate,
          maxSelectableDate,
        );
        setFindingNearestDate(false);

        if (cancelled) return;

        if (nextDate && nextDate !== formData.selectDate) {
          setFormData((prev) => ({ ...prev, selectDate: nextDate }));
          setLoadingSlots(false);
          return;
        }

        toast({
          title: "No available slots",
          description: fetchError
            ? fetchError?.response?.data?.message || fetchError.message || "Something went wrong"
            : "This doctor has no open slots this week or next week at this branch.",
          variant: "destructive",
        });
        setPreferredTime(null);
        setAvailableSlots([]);
        setLoadingSlots(false);
        return;
      }

      if (fetchError) {
        setAvailableSlots([]);
        toast({
          title: "Could not load available time slots",
          description: fetchError?.response?.data?.message || fetchError.message || "Something went wrong",
          variant: "destructive",
        });
        setLoadingSlots(false);
        return;
      }

      setAvailableSlots(openSlots);

      // In edit mode, inject the original appointment slot back if it was filtered out
      // (e.g., because it was marked as booked/unavailable by the backend)
      if (isEditMode && originalSlotRef.current) {
        const original = originalSlotRef.current;
        const isOriginalSlot = isUnchangedSlot(
          formData.doctorId,
          formData.branchId,
          formData.selectDate,
          formData.timeSlot
        );
        if (isOriginalSlot) {
          // Check if the original slot time exists in available slots
          const originalTime = originalSlotRef.current.timeSlot;
          const hasOriginalSlot = openSlots.some((s) => timeStringToMinutes(s.time) === timeStringToMinutes(originalTime));
          if (!hasOriginalSlot) {
            // Inject the original slot back so it remains selectable
            setAvailableSlots((prev) => [
              ...prev,
              {
                schedule_id: "ORIGINAL_SLOT",
                shift_name: "Current",
                time: originalTime,
                is_available: true,
              },
            ]);
            // Ensure timeSlot is set to the original time
            setFormData((prev) => ({ ...prev, timeSlot: originalTime }));
          }
        }
      }

      if (preferredTime && openSlots.length > 0) {
        // Prefer an exact match to the clicked hour. Day View's grid can
        // show an hour as "available" (it shows a doctor's whole shift)
        // that this real slot list no longer has -- e.g. an already-elapsed
        // hour on today's date, which the backend correctly excludes, or
        // slots at that hour that are all booked. Instead of falling back
        // to the nearest other slot (which left the grid ending at e.g.
        // 4:40 PM when the user picked 5:00 PM), keep the picked time in
        // the list so the slots extend up to what was selected and it stays
        // highlighted.
        const preferredMinutes = timeStringToMinutes(preferredTime);
        const exact = openSlots.find((s) => timeStringToMinutes(s.time) === preferredMinutes);
        const isToday = formData.selectDate === getTodayInIST();
        const nowMinutes = getNowMinutesInIST();
        const preferredIsPast = isToday && preferredMinutes <= nowMinutes;

        if (exact) {
          setFormData((prev) => ({ ...prev, timeSlot: exact.time }));
        } else if (!preferredIsPast) {
          // Day View can show an hour as "available" (it deliberately
          // displays the doctor's whole shift) that this real slot list no
          // longer has -- e.g. it's fully booked. Keep the picked time in
          // the list so the slots extend up to what was selected and it
          // stays highlighted. Not done when the picked hour has already
          // elapsed today -- the backend will never accept booking the
          // past, so pinning it here would just offer a slot that can
          // never actually be confirmed.
          setAvailableSlots((prev) => [
            ...prev,
            { schedule_id: "DAY_VIEW_SLOT", shift_name: "", time: preferredTime, is_available: true },
          ]);
          setFormData((prev) => ({ ...prev, timeSlot: preferredTime }));
        }
      }
      if (preferredTime) setPreferredTime(null);
      setLoadingSlots(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [formData.doctorId, formData.branchId, formData.selectDate, formData.patientVisitType, formData.patientType]);

  // Load the full patient list once for the Patient dropdown.
  useEffect(() => {
    patientApi
      .getAll({ limit: 1000 })
      .then((res) => {
        const fetched = res.data.data?.patients || [];
        // Guarantee the preselected patient (arriving via nav state) is in
        // the options list even if it isn't among the first 1000 returned.
        if (preselectedPatient && !fetched.some((p) => p.patient_id === preselectedPatient.patient_id)) {
          setPatients([preselectedPatient, ...fetched]);
        } else {
          setPatients(fetched);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectPatient = (patientId: string) => {
    const patient = patients.find((p) => p.patient_id === patientId);
    if (!patient) return;
    setFormData((prev) => ({
      ...prev,
      patientId: patient.patient_id,
      patientName:
        `${patient.patient_first_name}${patient.patient_middle_name ? ` ${patient.patient_middle_name}` : ""}${patient.patient_last_name ? ` ${patient.patient_last_name}` : ""}`,
      patientNumber: patient.patient_primary_mobile || "",
    }));
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };
  const startVoiceRecognition = () => {
  const SpeechRecognition =
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition;

  if (!SpeechRecognition) {
    toast({
      title: "Voice input not supported",
      description: "Please use Google Chrome or Microsoft Edge.",
      variant: "destructive",
    });
    return;
  }

  const recognition = new SpeechRecognition();

  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.lang = "en-IN";

  recognition.onstart = () => {
    setIsListening(true);
  };

  recognition.onresult = (event: any) => {
    let transcript = "";

    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }

    if (!transcript.trim()) return;

    setFormData((prev) => ({
      ...prev,
      patientComment: prev.patientComment
        ? `${prev.patientComment} ${transcript.trim()}`
        : transcript.trim(),
    }));
  };

  recognition.onerror = (event: any) => {
    console.error("Speech recognition error:", event.error);
    setIsListening(false);
  };

  recognition.onend = () => {
    setIsListening(false);
  };

  recognitionRef.current = recognition;
  recognition.start();
};

const stopVoiceRecognition = () => {
  if (recognitionRef.current) {
    recognitionRef.current.stop();
    recognitionRef.current = null;
  }

  setIsListening(false);
};

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const isIpdForm = formData.patientType === "Inpatient (IPD)";
    const isEmergencyForm = isIpdForm && formData.patientVisitType === "Emergency Visit";
    const isDaycareCreateForm = isIpdForm && formData.patientVisitType === "Daycare" && !isAdmissionEditMode;

    const required: RequiredField<keyof AppointmentFormData>[] = [
      { key: "patientId", label: "Patient" },
      { key: "patientName", label: "Patient Name" },
      { key: "patientNumber", label: "Mobile Number" },
      { key: "branchId", label: "Branch" },
      // Emergency: admitted now, doctor / department can be assigned later.
      ...(isEmergencyForm
        ? []
        : [
            { key: "departmentId" as const, label: "Department" },
            { key: "doctorId" as const, label: "Doctor Name" },
          ]),
      { key: "patientType", label: "Patient Type" },
      { key: "patientVisitType", label: "Patient Visit Type" },
      ...(formData.patientVisitType === "Others" ? [{ key: "customVisitType" as const, label: "Specify Visit Purpose" }] : []),
      ...(isEmergencyForm
        ? [
            { key: "requestedWardId" as const, label: "Ward" },
            { key: "requestedBedId" as const, label: "Bed" },
          ]
        : [{ key: "selectDate" as const, label: "Appointment Date" }]),
      // Daycare books the doctor's slot and needs a ward with room for it.
      ...(isDaycareCreateForm
        ? [
            { key: "requestedWardId" as const, label: "Ward" },
            { key: "timeSlot" as const, label: "Available Time Slots" },
          ]
        : []),
      // Other IPD bookings don't take an OPD slot.
      ...(isIpdForm
        ? []
        : [{ key: "timeSlot" as const, label: "Available Time Slots" }]),
    ];

    if (!validateRequiredFields(required, formData, toast)) return;

    if (isDaycareCreateForm) {
      const stay = formData.ipdExpectedStayDays + formData.ipdExpectedStayHours / 24;
      if (!(stay > 0) || stay > 1) {
        toast({
          title: "Check the duration",
          description: "A daycare session must be more than 0 and at most 24 hours.",
          variant: "destructive",
        });
        return;
      }
    }

    if (formData.departmentId === OTHER_DEPARTMENT_VALUE && !customDepartment.trim()) {
      toast({
        title: "Missing department",
        description: "Please type a department name for 'Others'.",
        variant: "destructive",
      });
      return;
    }

    // IPD admission requests (planned) hold no OPD slot, so they skip the
    // slot requirement and the patient-conflict sweep entirely. OPD edits
    // keep their original no-conflict-recheck behavior too.
    if (formData.patientType === "Inpatient (IPD)" || isEditMode) {
      setShowConfirm(true);
      return;
    }

    // Check for patient conflicts on this date
    try {
      setCheckingConflicts(true);
      const res = await appointmentApi.getAll({
        patientId: formData.patientId,
        date: formData.selectDate,
        limit: 100,
      });

      const appointments = res.data?.data?.appointments || [];
      const activeAppointments = appointments.filter((a) => {
        const status = (a.status || "").toUpperCase();
        return !["CANCELLED", "NO_SHOW", "COMPLETED"].includes(status);
      });

      if (activeAppointments.length === 0) {
        setShowConfirm(true);
        return;
      }

      const newTimeMinutes = timeStringToMinutes(formData.timeSlot);
      const newDoctorId = formData.doctorId;

      const conflictMessages: { type: string; message: string }[] = [];
      const conflictAppointments: PatientConflictAppointment[] = [];

      let severity: "warning" | "high" | "critical" = "warning";

      activeAppointments.forEach((appt) => {
        const apptTimeMinutes = timeStringToMinutes(appt.appointment_time || "");
        const sameDoctor = appt.employee_id === newDoctorId;
        const timeDiff = Math.abs(apptTimeMinutes - newTimeMinutes);
        const isOverlap = timeDiff <= 20; // 20 min buffer

        const mapped: PatientConflictAppointment = {
          appointmentId: appt.appointment_id,
          doctorName: appt.doctor_name || `${appt.employees?.first_name || ""} ${appt.employees?.last_name || ""}`.trim(),
          time: formatSlotLabel(appt.appointment_time || ""),
          branchName: appt.branch?.branch_name || "Unknown",
          department: appt.department_master?.department_name || appt.department || undefined,
          status: appt.status || "",
        };
        conflictAppointments.push(mapped);

        if (isOverlap && sameDoctor) {
          conflictMessages.push({
            type: "critical",
            message: `Direct conflict with existing appointment at ${mapped.time} with Dr. ${mapped.doctorName}`,
          });
          severity = "critical";
        } else if (sameDoctor) {
          conflictMessages.push({
            type: "high",
            message: `Patient already has appointment with Dr. ${mapped.doctorName} on this day at ${mapped.time}`,
          });
          if (severity !== "critical") severity = "high";
        } else {
          conflictMessages.push({
            type: "warning",
            message: `Patient has another appointment on this day at ${mapped.time} with Dr. ${mapped.doctorName}`,
          });
        }
      });

      // Deduplicate messages by type
      const uniqueMessages = Array.from(
        new Map(conflictMessages.map((m) => [m.message, m])).values()
      );

      setConflictSeverity(severity);
      setConflictAppointments(conflictAppointments.sort((a, b) => {
        const aMin = timeStringToMinutes(a.time);
        const bMin = timeStringToMinutes(b.time);
        return aMin - bMin;
      }));
      setConflictMessages(uniqueMessages);
      setShowConflictWarning(true);
    } catch (err) {
      console.error("Conflict check failed:", err);
      setShowConfirm(true);
    } finally {
      setCheckingConflicts(false);
    }
  };

  const handleConflictCancel = () => {
    setShowConflictWarning(false);
  };

  const handleConflictProceed = () => {
    setShowConflictWarning(false);
    setShowConfirm(true);
  };

  const handleConfirmCreate = async () => {
    setSubmitting(true);
    try {
      let effectiveDepartmentId = formData.departmentId;
      if (effectiveDepartmentId === OTHER_DEPARTMENT_VALUE) {
        const deptRes = await departmentApi.create({
          department_name: customDepartment.trim(),
        });
        const createdDept = deptRes.data.data;
        effectiveDepartmentId = createdDept.department_id;
        setDepartments((p) => [...p, createdDept]);
      }

      // Shared stay computation (days + hours/24, 2dp) for IPD flows.
      const computedStay =
        Math.round((formData.ipdExpectedStayDays + formData.ipdExpectedStayHours / 24) * 100) / 100;

      // Admission-edit mode: update the PLANNED admission via /ipd directly.
      if (isAdmissionEditMode && admissionEdit) {
        const res = await ipdApi.update(
          admissionEdit.admission_id,
          isLinkedDaycareEdit
            ? {
                // Date, time, doctor, ward and duration are fixed for a booked
                // daycare slot -- only these can change.
                bed_id: formData.requestedBedId || undefined,
                payment_mode: formData.ipdPaymentMode,
                advance_amount: formData.ipdAdvanceAmount || undefined,
                provisional_diagnosis: formData.ipdProvisionalDiagnosis.trim() || undefined,
              }
            : {
                department_id: effectiveDepartmentId || undefined,
                employee_id: formData.doctorId,
                admission_type: toAdmissionType(formData.patientVisitType),
                is_daycare: formData.patientVisitType === "Daycare",
                ward_id: formData.requestedWardId || undefined,
                bed_id: formData.requestedBedId || undefined,
                payment_mode: formData.ipdPaymentMode,
                expected_stay_days: computedStay,
                advance_amount: formData.ipdAdvanceAmount || undefined,
                provisional_diagnosis: formData.ipdProvisionalDiagnosis.trim() || undefined,
                admission_date: formData.selectDate,
              },
        );
        setIpdResult(res.data.data);
        setShowConfirm(false);
        return;
      }

      // IPD create mode: book a PLANNED admission (no appointment row, no
      // slot, no bed occupied until the patient is actually admitted).
      if (isIpdBooking) {
        // Daycare: the doctor's slot + a planned daycare request, booked
        // together (the server checks the ward has room for the session).
        if (isDaycareBooking) {
          const res = await ipdApi.createDaycare({
            patient_id: formData.patientId,
            branch_id: formData.branchId,
            department_id: effectiveDepartmentId,
            employee_id: formData.doctorId,
            appointment_date: formData.selectDate,
            appointment_time: formData.timeSlot,
            ward_id: formData.requestedWardId,
            bed_id: formData.requestedBedId || undefined,
            expected_stay_days: computedStay,
            payment_mode: formData.ipdPaymentMode,
            advance_amount: formData.ipdAdvanceAmount || undefined,
            provisional_diagnosis: formData.ipdProvisionalDiagnosis.trim() || undefined,
            reason_for_visit: formData.patientComment || undefined,
          });
          setIpdResult(res.data.data);
          setShowConfirm(false);
          return;
        }

        const res = await ipdApi.create({
          patient_id: formData.patientId,
          branch_id: formData.branchId,
          department_id: effectiveDepartmentId || undefined,
          employee_id: formData.doctorId || undefined,
          admission_type: toAdmissionType(formData.patientVisitType),
          is_daycare: false,
          ward_id: formData.requestedWardId || undefined,
          bed_id: formData.requestedBedId || undefined,
          payment_mode: formData.ipdPaymentMode,
          expected_stay_days: computedStay,
          advance_amount: formData.ipdAdvanceAmount || undefined,
          provisional_diagnosis: formData.ipdProvisionalDiagnosis.trim() || undefined,
          // Emergency is admitted on the spot into the chosen bed (the server
          // stamps the admit time); everything else is a planned request.
          ...(isEmergencyBooking
            ? { status: "ADMITTED" }
            : { admission_date: formData.selectDate, status: "PLANNED" }),
        });
        setIpdResult(res.data.data);
        setShowConfirm(false);
        return;
      }

      if (isEditMode && appointmentId) {
        await appointmentApi.update(appointmentId, {
          employee_id: formData.doctorId,
          branch_id: formData.branchId,
          department_id: effectiveDepartmentId || undefined,
          appointment_date: formData.selectDate,
          appointment_time: formData.timeSlot,
          reason_for_visit: formData.patientComment || undefined,
          patient_type: formData.patientType || undefined,
          patient_visit_type: formData.patientVisitType || undefined,
        });

        await appointmentApi.updateStatus(appointmentId, "RESCHEDULED");

        toast({
          title: "Appointment rescheduled",
          description: `Appointment ${appointmentId} has been rescheduled.`,
        });

        setShowConfirm(false);
        navigate(isDoctorBooking ? "/doctor/appointments" : "/appointments", {
          replace: true,
        });
        return;
      } else {
        // Create mode
        const effectiveVisitType = formData.patientVisitType === "Others" && formData.customVisitType?.trim()
          ? `Others: ${formData.customVisitType.trim()}`
          : formData.patientVisitType;

        const effectiveReason = formData.patientVisitType === "Others" && formData.customVisitType?.trim()
          ? (formData.patientComment ? `${formData.customVisitType.trim()} - ${formData.patientComment}` : formData.customVisitType.trim())
          : (formData.patientComment || undefined);

        // Book-first IPD flow: only the Admission/Daycare sections actually
        // collect ward/bed/payment/stay/advance/diagnosis requests -- send
        // them along with the appointment so admit time can reuse them.
        const isIpdAdmissionFlow =
          formData.patientType === "Inpatient (IPD)" &&
          (formData.patientVisitType === "Admission" || formData.patientVisitType === "Daycare");

        const res = await appointmentApi.create({
          patient_id: formData.patientId,
          patient_name: formData.patientName,
          patient_number: formData.patientNumber,
          branch_id: formData.branchId,
          department_id: effectiveDepartmentId,
          employee_id: formData.doctorId,
          appointment_date: formData.selectDate,
          appointment_time: formData.timeSlot,
          reason_for_visit: effectiveReason,
          patient_type: formData.patientType || undefined,
          patient_visit_type: effectiveVisitType || undefined,
          ...(isIpdAdmissionFlow
            ? {
                requested_ward_id: formData.requestedWardId || undefined,
                requested_bed_id: formData.requestedBedId || undefined,
                ipd_payment_mode: formData.ipdPaymentMode || undefined,
                expected_stay_days:
                  formData.ipdExpectedStayDays + formData.ipdExpectedStayHours / 24
                    ? Math.round((formData.ipdExpectedStayDays + formData.ipdExpectedStayHours / 24) * 100) / 100
                    : undefined,
                advance_amount: formData.ipdAdvanceAmount || undefined,
                provisional_diagnosis: formData.ipdProvisionalDiagnosis.trim() || undefined,
              }
            : {}),
        });

        setBookingResult(res.data.data);
      }

      setShowConfirm(false);
    } catch (error: any) {
      toast({
        title: isEditMode ? "Failed to reschedule appointment" : "Failed to create appointment",
        description: error?.response?.data?.message || error.message || "Something went wrong",
        variant: "destructive",
      });
      setShowConfirm(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleBookingDone = () => {
    setBookingResult(null);
    navigate(isDoctorBooking ? "/doctor/appointments" : "/appointments");
  };

  const handleIpdDone = () => {
    setIpdResult(null);
    navigate(isDoctorBooking ? "/doctor/appointments" : "/appointments");
  };

  const handleCancel = () => {
    if (isDirty) {
      setShowLeaveConfirm(true);
      return;
    }
    navigate(-1);
  };

const isDirty = Boolean(
    formData.patientId ||
      formData.patientName ||
      formData.branchId ||
      formData.departmentId ||
      formData.doctorId ||
      formData.timeSlot ||
      formData.patientType ||
      formData.patientVisitType ||
      formData.patientComment ||
      formData.requestedWardId ||
      formData.requestedBedId ||
      formData.ipdProvisionalDiagnosis ||
      formData.ipdExpectedStayHours
  );
  
  // Once a branch is selected, only show departments that branch's (date-aware)
  // doctor list actually belongs to; otherwise fall back to the full list.
  // The Laboratory department is ALWAYS preserved for all branches.
  const departmentsForDropdown = useMemo(() => {
    if (!formData.branchId) return departments;
    const branchDepts = departments.filter((d) =>
      branchDoctors.some((doc) => doc.department_id === d.department_id),
    );
    const labDepts = departments.filter((d) => /lab/i.test(d.department_name));
    for (const ld of labDepts) {
      if (!branchDepts.some((d) => d.department_id === ld.department_id)) {
        branchDepts.push(ld);
      }
    }
    return branchDepts;
  }, [formData.branchId, departments, branchDoctors]);

// Once a doctor is selected, show only their assigned branches;
// otherwise show all branches.
  const branchesForDropdown = useMemo(() => {
    if (formData.doctorId && doctorAssignedBranches.length > 0) return doctorAssignedBranches;
    return branches;
  }, [formData.doctorId, doctorAssignedBranches, branches]);

  // Once a branch is selected, only show that branch's doctors; either way,
  // further narrow down to the selected department, if one is chosen. With a
  // branch AND a date selected, only doctors whose backend-computed status
  // for that exact branch+date is ACTIVE are offered (plus the currently
  // selected doctor, who is always kept visible).
  const doctorsForDropdown = (formData.branchId ? branchDoctors : doctors).filter(
    (doc) =>
      (!formData.departmentId || formData.departmentId === OTHER_DEPARTMENT_VALUE || doc.department_id === formData.departmentId) &&
      (formData.branchId && formData.selectDate
        ? true
        : true),
  );

  const selectedDoctor = doctors.find((doc) => doc.employee_id === formData.doctorId);
  const selectedDoctorName = selectedDoctor
    ? `Dr. ${selectedDoctor.first_name}${selectedDoctor.middle_name ? ` ${selectedDoctor.middle_name}` : ""} ${selectedDoctor.last_name}`
    : "";

  // Appointment Date is bookable only within exactly 14 days from today --
  // no past dates, nothing beyond the two-week window.
  const minSelectableDate = format(new Date(), "yyyy-MM-dd");
  const maxSelectableDate = format(addDays(new Date(), 14), "yyyy-MM-dd");

  // Weekdays (MONDAY..SUNDAY) the selected doctor actually works at the
  // selected branch, derived from their active schedules. null = no doctor or
  // branch chosen yet, so the calendar stays fully enabled. An EMPTY set =
  // the doctor is assigned to the branch but has no schedule for it -- every
  // date is then disabled, exactly like any other non-working day.
  const workingWeekdays = useMemo(() => {
    if (!formData.doctorId || !formData.branchId) return null;
    const days = new Set(
      doctorSchedules
        .filter(
          (s) =>
            s.branch_id === formData.branchId &&
            s.is_active !== false &&
            Boolean(s.day_of_week),
        )
        .map((s) => s.day_of_week as string),
    );
    return days;
  }, [doctorSchedules, formData.doctorId, formData.branchId]);

  // Exact-date meanings from the doctor's Day/Week view schedule changes,
  // scoped to the selected branch: ISO yyyy-mm-dd -> what was pinned there.
  const changeInfoByDate = useMemo(() => {
    const map = new Map<string, { cancelled: boolean; extra: boolean }>();
    for (const c of doctorChanges) {
      if (formData.branchId && c.branch_id !== formData.branchId) continue;
      const match = /^(\d{4}-\d{2}-\d{2})/.exec(c.change_date ?? "");
      if (!match) continue;
      const entry = map.get(match[1]) ?? { cancelled: false, extra: false };
      if (c.mode === "CANCEL") entry.cancelled = true;
      else if (c.mode === "ADD" || c.mode === "OVERRIDE") entry.extra = true;
      map.set(match[1], entry);
    }
    return map;
  }, [doctorChanges, formData.branchId]);

  const isDateDisabled = (date: Date) => {
    // IPD bookings are date-first: every date in the window stays selectable
    // and the available-doctor cards under the date carry the availability.
    if (formData.patientType === "Inpatient (IPD)") return false;
    if (!formData.doctorId || !formData.branchId) return false;

    // Date-specific changes take priority over the weekly template: a
    // CANCELLED date is always off, while an ADD/OVERRIDE date is always
    // selectable -- the slots API serves real bookable slots for it even
    // when the weekday has no recurring template row.
    const info = changeInfoByDate.get(format(date, "yyyy-MM-dd"));
    if (info?.cancelled) return true;
    if (info?.extra) return false;

    if (!workingWeekdays) return false;
    if (workingWeekdays.size === 0) return true;
    return !workingWeekdays.has(format(date, "EEEE").toUpperCase());
  };

  // The slots API can return the same time more than once (e.g. overlapping
  // schedule rows) and the Day View flow injects a matching slot, so dedupe
  // by the slot's actual minute value before rendering.
  const uniqueSlots = useMemo(() => {
    const seen = new Set<number>();
    return [...availableSlots]
      .sort((a, b) => timeStringToMinutes(a.time) - timeStringToMinutes(b.time))
      .filter((s) => {
        const m = timeStringToMinutes(s.time);
        if (seen.has(m)) return false;
        seen.add(m);
        return true;
      });
  }, [availableSlots]);

  // Loads the selected doctor's date-specific ADD/OVERRIDE/CANCEL records
  // (best effort — a failure just means the calendar falls back to the
  // weekly-template rules).
  const loadDoctorChanges = (doctorId: string) =>
    doctorScheduleApi
      .getChanges(doctorId)
      .then((res) =>
        setDoctorChanges((res.data?.data ?? []).filter((c) => c.is_active !== false)),
      )
      .catch(() => setDoctorChanges([]));

  // Shared by the Doctor dropdown's onValueChange and the doctor-preselect
  // effect below -- looks up the doctor's real specialization/department and
  // their actual mapped branches (via employeeApi.getOne), then finds the
  // nearest date they have an open slot.
  const applyDoctorSelection = (val: string) => {
    const selectedDoctor = doctors.find((doc) => doc.employee_id === val);

    const specialization = selectedDoctor?.specialization?.trim().toLowerCase();
    const matchedDepartment = specialization
      ? departments.find((d) => d.department_name.trim().toLowerCase() === specialization)
      : undefined;

    setFormData((prev) => ({
      ...prev,
      doctorId: val,
      departmentId: prev.departmentId ? prev.departmentId : (matchedDepartment?.department_id || selectedDoctor?.department_id),
      timeSlot: "",
    }));

    if (!val) {
      setDoctorChanges([]);
      setDoctorAssignedBranches([]);
      return;
    }

    // IPD bookings are date-first: choosing a doctor must never move the
    // already-selected date, so the nearest-available-date search is skipped
    // entirely (schedules/branches below still load for the card + guards).
    const keepDate = formData.patientType === "Inpatient (IPD)";

    if (!keepDate) setFindingNearestDate(true);

    employeeApi
      .getOne(val)
      .then((res) => {
        const mappedBranches = activeBranches(res.data?.data?.branches || []);
        setDoctorSchedules(res.data?.data?.doctorSchedules || []);
        setDoctorAssignedBranches(mappedBranches);
        void loadDoctorChanges(val);
        const nextBranchId =
          mappedBranches.find((b) => b.branch_id === formData.branchId)?.branch_id ||
          mappedBranches[0]?.branch_id;

        setFormData((prev) => ({
          ...prev,
          branchId: prev.branchId ? prev.branchId : nextBranchId,
        }));

        // Use the effective branchId: user's existing branch if set, otherwise the doctor's mapped branch
        const effectiveBranchId = formData.branchId || nextBranchId;

        if (!effectiveBranchId) return keepDate ? undefined : null;

        return keepDate
          ? undefined
          : findNearestAvailableDate(val, effectiveBranchId, formData.selectDate, maxSelectableDate);
      })
      .catch(() => {
        // Doctor lookup failed (backend hiccup etc.) -- fall back to their
        // primary branch so the doctor-first flow still auto-fills a branch
        // and finds a date; the slots API validates the real mapping.
        const fallbackBranchId = selectedDoctor?.branch_id || formData.branchId;
        if (!fallbackBranchId) return keepDate ? undefined : null;
        setFormData((prev) => ({ ...prev, branchId: fallbackBranchId }));
        setDoctorAssignedBranches([]);
        return keepDate
          ? undefined
          : findNearestAvailableDate(val, fallbackBranchId, formData.selectDate, maxSelectableDate);
      })
      .then((date) => {
        if (date) {
          setFormData((prev) => ({ ...prev, selectDate: date, timeSlot: "" }));
        } else if (date === null) {
          toast({
            title: "No available date found",
            description: "This doctor has no open slots this week or next week at their branch.",
            variant: "destructive",
          });
        }
      })
      .finally(() => {
        if (!keepDate) setFindingNearestDate(false);
      });
  };

  // Arrived from a doctor's profile page with a doctor already chosen --
  // run the same selection logic as picking them from the dropdown, once
  // the doctor list has loaded (needed to resolve their specialization).
  // The doctor portal's locked self-booking reuses this so their department
  // auto-fills and the nearest open date gets located.
  useEffect(() => {
    const doctorId = preselectedDoctorId || doctorBooking?.doctorId;
    if (!doctorId || doctors.length === 0) return;
    applyDoctorSelection(doctorId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedDoctorId, doctorBooking?.doctorId, doctors]);

  // Arrived from a Day View grid slot with doctor/branch/department/date all
  // already decided -- only the doctor's schedules still need loading so the
  // calendar disables non-working days the same way the dropdown flow does,
  // without re-running applyDoctorSelection (which would overwrite the exact
  // branch/date the clicked cell stood for).
  useEffect(() => {
    if (!preselectedSlot) return;
    employeeApi
      .getOne(preselectedSlot.doctorId)
      .then((res) => {
        setDoctorSchedules(res.data?.data?.doctorSchedules || []);
        setDoctorAssignedBranches(activeBranches(res.data?.data?.branches || []));
      })
      .catch(() => {});
    void loadDoctorChanges(preselectedSlot.doctorId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedSlot]);

  // IPD bookings collapse Branch/Department/Doctor/Date into the Admission
  // Details card and hide the slot picker, so these core field blocks are
  // extracted once and reused in both the OPD grid and the IPD card.
   const isIpdBooking = formData.patientType === "Inpatient (IPD)";
   const isEmergencyBooking = isIpdBooking && formData.patientVisitType === "Emergency Visit";
   const isDaycareBooking = isIpdBooking && formData.patientVisitType === "Daycare";
   const showWardBed =
     formData.patientVisitType === "Admission" ||
     formData.patientVisitType === "Daycare" ||
     formData.patientVisitType === "Emergency Visit";
   // Emergency needs a ward + bed now; daycare needs the ward (bed optional).
   const wardRequired = isEmergencyBooking || isDaycareBooking;
   const bedRequired = isEmergencyBooking;
   const optionalTag = <span className="font-normal text-xs text-gray-400 ml-1">(optional)</span>;

const branchField = (
    <div>
      <label className={labelClass}>Branch {requiredStar}</label>
      <FormDropdown
        className={inputClass}
        options={[
          { label: "None", value: "" },
          ...branchesForDropdown.map((b) => ({
            label: `${b.branch_id}${b.branch_name ? ` - ${b.branch_name}` : ""}`,
            value: b.branch_id,
            highlight: currentBranchId ? b.branch_id === currentBranchId : false,
            badge: currentBranchId && b.branch_id === currentBranchId ? "Your branch" : undefined,
          })),
        ]}
        value={formData.branchId}
        // An admission request stays in the branch it was made for.
        disabled={isAdmissionEditMode}
        onValueChange={(val) => {
          if (!val) {
            // Doctor portal booking keeps the logged-in doctor's
            // identity locked -- never let a branch clear wipe it.
            if (isDoctorBooking) return;
            setFormData((prev) => ({
              ...prev,
              branchId: "",
              departmentId: "",
              doctorId: "",
              timeSlot: "",
            }));
            return;
          }
          // With a doctor already chosen, switching to a branch the
          // doctor isn't mapped to keeps the doctor, department and
          // date exactly as they were, and only reloads the slots
          // for the new branch. Only when no doctor is picked yet does
          // a branch change reset department/doctor, since their
          // options depend on the branch.
          const doctorLocked = Boolean(formData.doctorId);
          setFormData((prev) => ({
            ...prev,
            branchId: val,
            departmentId: doctorLocked ? prev.departmentId : "",
            doctorId: doctorLocked ? prev.doctorId : "",
            timeSlot: "",
          }));

          if (!val || !doctorLocked) return;
        }}
        placeholder={
          branchesForDropdown.length
            ? "Select Branch"
            : "Loading branches..."
        }
      />
    </div>
  );

  const departmentField = (
    <div>
      <label className={labelClass}>Department {isEmergencyBooking ? optionalTag : requiredStar}</label>
      <FormDropdown
        className={inputClass}
        disabled={isDoctorBooking || isLinkedDaycareEdit}
        options={[
          { label: "None", value: "" },
          ...departmentsForDropdown.map((d) => ({
            label: d.department_name,
            value: d.department_id,
          })),
          { label: "Others", value: OTHER_DEPARTMENT_VALUE },
        ]}
        value={formData.departmentId}
        onValueChange={(val) => {
          const deptObj = departments.find((d) => d.department_id === val);
          const newDeptName = deptObj?.department_name || "";
          const allowedTypes = getAvailablePatientTypes({ departmentId: val, departmentName: newDeptName });
          setFormData((prev) => {
            const validPatientType = allowedTypes.includes(prev.patientType) ? prev.patientType : (allowedTypes[0] || "Outpatient (OPD)");
            const allowedVisitTypes = VISIT_TYPES_BY_PATIENT_TYPE[validPatientType] || [];
            const validVisitType = allowedVisitTypes.includes(prev.patientVisitType) ? prev.patientVisitType : (allowedVisitTypes[0] || "");
            const isIpd = validPatientType === "Inpatient (IPD)";
            return {
              ...prev,
              departmentId: val,
              doctorId: isDoctorBooking ? prev.doctorId : "",
              timeSlot: "",
              patientType: validPatientType,
              patientVisitType: validVisitType,
              ...(isIpd
                ? {}
                : {
                    requestedWardId: "",
                    requestedBedId: "",
                    ipdPaymentMode: "CASH",
                    ipdExpectedStayDays: 1,
                    ipdExpectedStayHours: 0,
                    ipdAdvanceAmount: 0,
                    ipdProvisionalDiagnosis: "",
                  }),
            };
          });
          if (val !== OTHER_DEPARTMENT_VALUE) setCustomDepartment("");
        }}
        placeholder={
          branchDoctorsLoading
            ? "Loading departments..."
            : formData.branchId && departmentsForDropdown.length === 0
              ? "No departments at this branch"
              : departments.length
                ? "Select Department"
                : "Loading departments..."
        }
      />
      {formData.departmentId === OTHER_DEPARTMENT_VALUE && (
        <input
          type="text"
          placeholder="Type your department"
          maxLength={100}
          className={inputClass + " mt-2"}
          value={customDepartment}
          onChange={(e) => setCustomDepartment(e.target.value)}
          disabled={submitting}
        />
      )}
    </div>
  );

  const doctorField = (
    <div>
      <label className={labelClass}>
        Doctor Name {isEmergencyBooking ? optionalTag : requiredStar}
        {isDoctorBooking && (
          <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-blue-600">
            (you)
          </span>
        )}
      </label>
      <FormDropdown
        className={inputClass}
        disabled={isDoctorBooking || isLinkedDaycareEdit}
        options={[
          { label: "None", value: "" },
          ...doctorsForDropdown.map((doc) => {
            const fullName = `Dr. ${doc.first_name}${doc.middle_name ? ` ${doc.middle_name}` : ""} ${doc.last_name}`;
            const specialty = doc.specialization || doc.department_master?.department_name;
            const statusLabel =
              doc.doctor_status === "LEAVE" ? " (On Leave)" : "";
            return {
              label: `${fullName}${statusLabel}${specialty ? ` (${specialty})` : ""}`,
              value: doc.employee_id,
            };
          }),
        ]}
        value={formData.doctorId}
        onValueChange={applyDoctorSelection}
        placeholder={
          formData.branchId && doctorsForDropdown.length === 0
            ? "No doctors available for this date (including on leave)"
            : "No doctors match this branch/department"
        }
      />
    </div>
  );

  const dateField = (
    <div>
      <label className={labelClass}>
        Appointment Date {requiredStar}
        {findingNearestDate && (
          <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-400 normal-case">
            <Loader2 className="w-3 h-3 animate-spin" />
            Finding nearest available date...
          </span>
        )}
      </label>

      <div className="relative" ref={calendarWrapperRef}>
        {/* Fake input that just displays the date */}
        <button
          type="button"
          onClick={() => setIsCalendarOpen(false)}
          className="w-full flex items-center justify-between rounded-xl border border-gray-200 px-4 py-2.5 text-left cursor-default bg-white text-sm text-gray-900"
        >
          <span>{format(parseISO(formData.selectDate), "dd-MM-yyyy")}</span>
        </button>

        {/* Calendar icon - the ONLY trigger */}
        <button
          type="button"
          onClick={() => setIsCalendarOpen((prev) => !prev)}
          className="absolute right-4 top-1/2 -translate-y-1/2 disabled:opacity-40"
          aria-label="Open calendar"
          disabled={isLinkedDaycareEdit}
        >
          <CalendarIcon className="w-4 h-4 text-gray-500" />
        </button>

        {isCalendarOpen && (
          <div className="absolute z-50 mt-2">
            <CalendarPicker
              theme="light"
              hideThemePicker
              selected={parseISO(formData.selectDate)}
              minDate={new Date()}
              maxDate={addDays(new Date(), 14)}
              isDateDisabled={isDateDisabled}
              onSelect={(date) => {
                if (date instanceof Date) {
                  setFormData((prev) => ({
                    ...prev,
                    selectDate: format(date, "yyyy-MM-dd"),
                    timeSlot: "",
                  }));
                  setIsCalendarOpen(false);
                }
              }}
            />
          </div>
        )}
      </div>
    </div>
  );

  // Date-aware doctor list for the IPD Admission Details card. branchDoctors
  // is fetched with branch + date, so the backend's per-date status
  // (ACTIVE/LEAVE/INACTIVE) is already on every row: available doctors are
  // clickable and run the same selection logic as the dropdown, on-leave ones
  // stay visible (greyed) so staff can see why they cannot be picked.
  const ipdDoctorsForCards = useMemo(() => {
    const departmentOk = (doc: EmployeeRecord) =>
      !formData.departmentId ||
      formData.departmentId === OTHER_DEPARTMENT_VALUE ||
      doc.department_id === formData.departmentId;
    return branchDoctors
      .filter((doc) => departmentOk(doc) && doc.doctor_status !== "INACTIVE")
      .sort((a, b) =>
        (a.doctor_status === "ACTIVE" ? 0 : 1) - (b.doctor_status === "ACTIVE" ? 0 : 1),
      );
  }, [branchDoctors, formData.departmentId]);

  const ipdDoctorCards = (
    <div className="sm:col-span-2 lg:col-span-3">
      <label className={labelClass}>
        Doctors Available on {format(parseISO(formData.selectDate), "dd-MM-yyyy")}
      </label>

      {!formData.branchId ? (
        <div className="py-6 text-center text-sm text-gray-400 bg-gray-50 rounded-xl">
          Select a branch to see its doctors
        </div>
      ) : branchDoctorsLoading ? (
        <div className="py-6 text-center text-sm text-gray-400 bg-gray-50 rounded-xl flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading doctors for this date...
        </div>
      ) : (
        <>
          {ipdDoctorsForCards.length === 0 ? (
            <div className="py-6 text-center text-sm text-gray-400 bg-gray-50 rounded-xl">
              No doctors available at this branch on this date
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {ipdDoctorsForCards.map((doc) => {
                const fullName = `Dr. ${doc.first_name}${doc.middle_name ? ` ${doc.middle_name}` : ""} ${doc.last_name}`;
                const specialty = doc.specialization || doc.department_master?.department_name;
                const isActive = doc.doctor_status === "ACTIVE";
                const isSelected = doc.employee_id === formData.doctorId;
                const statusLabel = isActive
                  ? "Available"
                  : doc.doctor_status === "LEAVE"
                    ? "On Leave"
                    : "Not available";
                const statusDot = isActive
                  ? "bg-green-500"
                  : doc.doctor_status === "LEAVE"
                    ? "bg-amber-500"
                    : "bg-gray-400";
                const initials =
                  `${doc.first_name?.[0] ?? ""}${doc.last_name?.[0] ?? ""}`.toUpperCase() || "?";
                return (
                  <button
                    key={doc.employee_id}
                    type="button"
                    disabled={!isActive || isDoctorBooking || isLinkedDaycareEdit}
                    onClick={() => applyDoctorSelection(doc.employee_id)}
                    className={[
                      "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all duration-150",
                      isActive
                        ? isSelected
                          ? "border-blue-600 ring-1 ring-blue-600 bg-blue-50/60"
                          : "border-gray-200 bg-white hover:border-blue-400 hover:shadow-sm"
                        : "border-gray-200 bg-gray-50 opacity-70 cursor-not-allowed",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold",
                        isActive ? "bg-blue-100 text-blue-700" : "bg-gray-200 text-gray-500",
                      ].join(" ")}
                    >
                      {initials}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-gray-800">
                        {fullName}
                      </span>
                      <span className="block truncate text-xs text-gray-500">
                        {specialty || "—"}
                      </span>
                    </span>
                    <span
                      className={[
                        "shrink-0 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide",
                        isActive ? "text-green-700" : "text-gray-500",
                      ].join(" ")}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${statusDot}`} />
                      {statusLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* A doctor picked earlier (or from the dropdown) who has no
              availability on the newly selected date stays selected -- the
              cards only surface the mismatch so staff can decide. */}
          {formData.doctorId &&
            (() => {
              const selected = branchDoctors.find((d) => d.employee_id === formData.doctorId);
              if (selected?.doctor_status === "ACTIVE") return null;
              return (
                <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  <span className="font-semibold">{selectedDoctorName || "The selected doctor"}</span>{" "}
                  is not available on {format(parseISO(formData.selectDate), "dd-MM-yyyy")} (on leave
                  or not scheduled at this branch). You can still confirm, or pick one of the
                  available doctors above.
                </p>
              );
            })()}
        </>
      )}
    </div>
  );

  // Doctor time-slot picker -- shared by OPD bookings and daycare bookings
  // (which also need the ward to have room for the whole session).
  const daycareStayDays = formData.ipdExpectedStayDays + formData.ipdExpectedStayHours / 24;
  const visibleSlots = isDaycareBooking
    ? uniqueSlots.filter((slot) => daycareSlotFits(daycareOccupancy, formData.selectDate, slot.time, daycareStayDays))
    : uniqueSlots;

  const timeSlotsField = (
                  <div className="lg:col-span-3 flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <label className={labelClass}>Available Time Slots {requiredStar}</label>
                        <div className="flex items-center gap-1 text-gray-400">
                          {loadingSlots && <Loader2 className="w-3 h-3 animate-spin" />}
                          <span className="text-[10px] font-bold uppercase tracking-wide">
                            {loadingSlots ? "Loading slots..." : "Select a time slot"}
                          </span>
                        </div>
                      </div>
                      {!formData.doctorId || !formData.branchId || !formData.selectDate ? (
                        <div className="col-span-full py-8 text-center text-sm text-gray-400 bg-gray-50 rounded-xl">
                          Select a branch, doctor and date to see available time slots
                        </div>
                      ) : isDaycareBooking && !formData.requestedWardId ? (
                        <div className="col-span-full py-8 text-center text-sm text-gray-400 bg-gray-50 rounded-xl">
                          Select a ward to see the times it has room for
                        </div>
                      ) : loadingSlots || findingNearestDate ? (
                        <div className="col-span-full py-8 text-center text-sm text-gray-400 bg-gray-50 rounded-xl flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Loading available slots...
                        </div>
                      ) : doctorUnavailable && slotsCancelled ? (
                        <div className="col-span-full py-8 text-center text-sm text-gray-400 bg-gray-50 rounded-xl">
                          Doctor is unavailable on this date (marked as cancelled)
                        </div>
                      ) : doctorOnLeave ? (
                        <div className="col-span-full py-8 text-center text-sm text-gray-500 bg-gray-50 rounded-xl">
                          Doctor is on leave
                          {leaveReason ? ` (${leaveReason})` : ""} — no slots can be
                          booked on this date
                        </div>
                      ) : doctorUnavailable ? (
                        <div className="col-span-full py-8 text-center text-sm text-gray-400 bg-gray-50 rounded-xl">
                          Doctor is not assigned for this day
                        </div>
                      ) : availableSlots.length === 0 ? (
                        <div className="col-span-full py-8 text-center text-sm text-gray-400 bg-gray-50 rounded-xl">
                          <input
                            type="time"
                            className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                timeSlot: e.target.value,
                              }))
                            }
                            placeholder="Select a time"
                          />
                        </div>
                      ) : visibleSlots.length === 0 ? (
                        <div className="col-span-full py-8 text-center text-sm text-amber-600 bg-amber-50 rounded-xl">
                          The ward is full for all of this doctor's free times on this day -- try another date or ward
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                          {visibleSlots.map((slot) => (
                            <button
                              key={slot.time}
                              type="button"
                              onClick={() => setFormData((prev) => ({ ...prev, timeSlot: slot.time }))}
                              className={`h-10 text-sm font-bold rounded-lg transition-all duration-200 ${
                                formData.timeSlot === slot.time
                                  ? "bg-blue-600 text-white shadow-md"
                                  : "border border-blue-200 text-blue-600 hover:bg-blue-50"
                              }`}
                            >
                              {formatSlotLabel(slot.time)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
  );

  return (
    <div className="min-h-screen bg-[#F7F9FB] p-6">
      <div className="max-w-6xl mx-auto">
        <div className="w-full bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 overflow-hidden">
          {/* Header */}
          <div className="px-8 py-6 border-b border-gray-100 flex items-center gap-3">
            <button
              type="button"
              onClick={handleCancel}
              className="p-2 rounded-xl hover:bg-gray-50 transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5 text-gray-500" />
            </button>
            <div className="p-2.5 bg-blue-50 rounded-xl flex items-center justify-center">
              <CalendarPlus className="w-5 h-5 text-blue-600" />
            </div>
            <h4 className="hms-heading text-gray-900 tracking-tight">
              {isAdmissionEditMode
                ? "Edit IPD Admission Request"
                : isEmergencyBooking
                  ? "Emergency Admission"
                  : isDaycareBooking
                    ? "Book Daycare"
                    : isIpdBooking
                  ? "Create IPD Admission Request"
                  : isEditMode
                    ? "Edit Appointment"
                    : "Create Appointment"}
            </h4>
          </div>

{isLoadingMasterData ? (
            <div className="flex flex-col items-center justify-center gap-2 py-24 text-gray-400 text-sm">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              Loading branches, departments and doctors...
            </div>
          ) : loadingAppointment ? (
            <div className="flex flex-col items-center justify-center gap-2 py-24 text-gray-400 text-sm">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              Loading appointment...
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="p-8">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-6 gap-y-6">
                {/* Patient Select */}
                <div className="lg:col-span-3">
                  <label className={labelClass}>Select Patient {requiredStar}</label>
                  <FormDropdown
                    className={inputClass}
                    options={patients.map((p) => ({
                      label: `${p.patient_id} - ${p.patient_first_name}${p.patient_middle_name ? ` ${p.patient_middle_name}` : ""}${p.patient_last_name ? ` ${p.patient_last_name}` : ""}${p.patient_primary_mobile ? ` (${p.patient_primary_mobile})` : ""}`,
                      value: p.patient_id,
                    }))}
                    value={formData.patientId}
                    onValueChange={selectPatient}
                    placeholder={patients.length ? "Search and select a patient" : "Loading patients..."}
                    // An admission request's IP number, reserved bed and later
                    // encounter belong to its patient, so the patient is fixed
                    // once the request exists (the server ignores patient_id too).
                    disabled={isEditMode || isAdmissionEditMode}
                  />
                  {isAdmissionEditMode && (
                    <p className="text-xs text-gray-500 mt-1">
                      The patient can't be changed on an admission request. To admit a different patient, cancel this request and create a new one.
                    </p>
                  )}
                </div>

                {/* Patient ID (read-only after selection) */}
                <div>
                  <label className={labelClass}>Patient ID {requiredStar}</label>
                  <input
                    type="text"
                    className={inputClass + " bg-gray-50 text-gray-500"}
                    value={formData.patientId}
                    readOnly
                    placeholder="Search and select a patient"
                  />
                </div>

                {/* Patient Name (read-only after selection) */}
                <div>
                  <label className={labelClass}>Patient Name {requiredStar}</label>
                  <input
                    type="text"
                    className={inputClass + " bg-gray-50 text-gray-500"}
                    value={formData.patientName}
                    readOnly
                    placeholder="Auto-filled from selection"
                  />
                </div>

                {/* Patient Number (read-only after selection) */}
                <div>
                  <label className={labelClass}>Mobile Number {requiredStar}</label>
                  <input
                  type="text"
                  className={inputClass + " bg-gray-50 text-gray-500"}
                  value={formData.patientNumber}
                  readOnly
                  placeholder="Auto-filled from selection"
                />
              </div>

              {/* Patient Type */}
              <div>
                <label className={labelClass}>Patient Type {requiredStar}</label>
                <FormDropdown
                  className={inputClass}
                  options={getAvailablePatientTypes({
                    departmentId: formData.departmentId,
                    departmentName: departments.find((d) => d.department_id === formData.departmentId)?.department_name || customDepartment || "",
                  })}
                  value={formData.patientType}
                  // The kind of an existing admission request is fixed.
                  disabled={isAdmissionEditMode}
                  onValueChange={(val) => {
                    const allowedVisitTypes = VISIT_TYPES_BY_PATIENT_TYPE[val] || [];
                    const currentVisitType = formData.patientVisitType;
                    // Only clear visit type if current one is not valid for new patient type
                    const newVisitType = allowedVisitTypes.includes(currentVisitType) ? currentVisitType : (allowedVisitTypes[0] || "");
                    const isIpd = val === "Inpatient (IPD)";
                    setFormData((prev) => ({
                      ...prev,
                      patientType: val,
                      patientVisitType: newVisitType,
                      ...(isIpd
                        ? {}
                        : {
                            requestedWardId: "",
                            requestedBedId: "",
                            ipdPaymentMode: "CASH",
                            ipdExpectedStayDays: 1,
                            ipdExpectedStayHours: 0,
                            ipdAdvanceAmount: 0,
                            ipdProvisionalDiagnosis: "",
                          }),
                    }));
                  }}
                  placeholder="Select patient type"
                />
              </div>

              {/* Patient Visit Type */}
              <div>
                <label className={labelClass}>Patient Visit Type {requiredStar}</label>
                <FormDropdown
                  className={inputClass}
                  options={VISIT_TYPES_BY_PATIENT_TYPE[formData.patientType] || []}
                  value={formData.patientVisitType}
                  onValueChange={(val) => {
                    const isAdm = val === "Admission" || val === "Daycare" || val === "Emergency Visit";
                    setFormData((prev) => ({
                      ...prev,
                      patientVisitType: val,
                      // Ward/bed requests only make sense for Admission/Daycare.
                      ...(!isAdm ? { requestedWardId: "", requestedBedId: "" } : {}),
                      // Daycare starts its expected stay at 0 days by default.
                      ...(prev.patientType === "Inpatient (IPD)" && val === "Daycare" && prev.ipdExpectedStayDays === 1 && prev.ipdExpectedStayHours === 0
                        ? { ipdExpectedStayDays: 0 }
                        : {}),
                      // Returning to Admission restores the 1-day minimum.
                      ...(prev.patientType === "Inpatient (IPD)" && val === "Admission" && prev.ipdExpectedStayDays === 0
                        ? { ipdExpectedStayDays: 1 }
                        : {}),
                    }));
                  }}
                  placeholder="Select visit type"
                  disabled={!formData.patientType || isAdmissionEditMode}
                />
              </div>

              {/* Others Free-Text Entry */}
              {formData.patientVisitType === "Others" && (
                <div>
                  <label className={labelClass}>Specify Visit Purpose {requiredStar}</label>
                  <input
                    type="text"
                    name="customVisitType"
                    className={inputClass}
                    placeholder="Enter custom visit purpose"
                    value={formData.customVisitType || ""}
                    onChange={handleInputChange}
                  />
                </div>
              )}

              {/* IPD Admission Details (book-first request). For IPD bookings this
                  card replaces the main-grid Branch/Department/Doctor/Date/Slots
                  sections and reorders them (Branch -> Ward -> Bed -> Department ->
                  Doctor -> Date -> Stay -> Advance -> Payment -> Diagnosis). */}
              {isIpdBooking ? (
                <div className="lg:col-span-3">
                  <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-3">
                      <Hospital className="w-4 h-4 text-blue-600" />
                      Admission Details
                      <span className="text-xs font-normal text-gray-500">
                        {isEmergencyBooking
                          ? "(admitted immediately into the chosen bed)"
                          : isDaycareBooking
                            ? "(doctor slot + ward; staff choose the bed before the visit)"
                            : "(request — ward/bed are assigned at admit time)"}
                      </span>
                    </div>
                    {isLinkedDaycareEdit && (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-3">
                        This daycare booking's date, time, doctor, ward and duration are fixed. To change them, cancel it and book again.
                        The bed, payment and reason can still be edited.
                      </p>
                    )}
                    {isEmergencyBooking && (
                      <p className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-3">
                        The patient is admitted as soon as you confirm. Doctor and department are optional -- assign them later from the In-Patient list.
                      </p>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {branchField}
                      {showWardBed && (
                        <>
                          <div>
                            <div className="flex items-center justify-between">
                              <label className={labelClass}>
                                {isEmergencyBooking ? "Ward" : "Requested Ward"}
                                {wardRequired ? requiredStar : optionalTag}
                              </label>
                              {(can("ward.manage") || can("admission.create")) && (
                                <button
                                  type="button"
onClick={() => setAddWardOpen(true)}
                                   className="text-xs text-blue-600 hover:text-blue-800 hover:underline font-medium inline-flex items-center gap-0.5"
                                 >
                                   <Plus className="w-3 h-3" /> Add Ward
                                </button>
                              )}
                            </div>
                            <Dropdown
                              className="w-full"
                              options={[
                                { label: "None", value: "" },
                                ...wards.map((w) => ({
                                  label: `${w.ward_name}${w.ward_type ? ` (${w.ward_type})` : ""}`,
                                  value: w.ward_id,
                                })),
                              ]}
                              value={formData.requestedWardId}
                              onChange={(val) => {
                                setFormData((prev) => ({
                                  ...prev,
                                  requestedWardId: val,
                                  requestedBedId: "",
                                }));
                              }}
                              placeholder={
                                loadingWards
                                  ? "Loading wards..."
                                  : formData.branchId
                                    ? "Select ward"
                                    : "Select branch first"
                              }
                              disabled={!formData.branchId || isLinkedDaycareEdit}
                            />
                          </div>
                          <div>
                            <div className="flex items-center justify-between">
                              <label className={labelClass}>
                                {isEmergencyBooking ? "Bed" : "Requested Bed"}
                                {bedRequired ? requiredStar : optionalTag}
                              </label>
                              {(can("bed.manage") || can("admission.create")) && (
                                <button
                                  type="button"
                                   onClick={() => setAddBedOpen(true)}
                                   className="text-xs text-blue-600 hover:text-blue-800 hover:underline font-medium inline-flex items-center gap-0.5"
                                 >
                                   <Plus className="w-3 h-3" /> Add Bed
                                </button>
                              )}
                            </div>
                            <Dropdown
                              className="w-full"
                              options={[
                                { label: bedRequired ? "Select a free bed" : "No bed preference", value: "" },
                                ...beds.map((b) => {
                                  // The request's own reserved bed stays selectable.
                                  const isOwnReservation =
                                    !!admissionEdit &&
                                    b.status === "RESERVED" &&
                                    b.reserved_admission_id === admissionEdit.admission_id;
                                  const isUnavailable = b.status !== "AVAILABLE" && !isOwnReservation;
                                  return {
                                    label: `Bed ${b.bed_number}${b.bed_type ? ` (${b.bed_type})` : ""}${
                                      isOwnReservation
                                        ? " (Reserved for this patient)"
                                        : isUnavailable
                                          ? ` (${getBedStatusMeta(b.status).label})`
                                          : ""
                                    }`,
                                    value: b.bed_id,
                                    disabled: isUnavailable,
                                  };
                                }),
                              ]}
                              value={formData.requestedBedId}
                              onChange={(val) =>
                                setFormData((prev) => ({ ...prev, requestedBedId: val }))
                              }
                              placeholder={
                                !formData.requestedWardId
                                  ? "Select ward first"
                                  : loadingBeds
                                    ? "Loading beds..."
                                    : "Select bed"
                              }
                              disabled={!formData.requestedWardId}
                            />
                            {formData.requestedWardId && !loadingBeds && beds.length === 0 && (
                              <p className="text-xs text-amber-600 mt-1">
                                No beds in this ward — the ward will still be requested.
                              </p>
                            )}
                          </div>
                        </>
                      )}
                      {departmentField}
                      {doctorField}
                      {!isEmergencyBooking && dateField}
                      {!isEmergencyBooking && ipdDoctorCards}
                      {isDaycareBooking && !isAdmissionEditMode && (
                        <div className="sm:col-span-2 lg:col-span-3">{timeSlotsField}</div>
                      )}
                      <div>
                        <label className={labelClass}>
                          {isDaycareBooking ? "Session Duration" : "Expected Stay"}
                          {isDaycareBooking ? requiredStar : null}
                        </label>
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <input
                              type="number"
                              min={showWardBed && formData.patientVisitType === "Daycare" ? 0 : 1}
                              className={inputClass}
                              placeholder="Days"
                              disabled={isLinkedDaycareEdit}
                              value={formData.ipdExpectedStayDays}
                              onChange={(e) => {
                                const min = showWardBed && formData.patientVisitType === "Daycare" ? 0 : 1;
                                setFormData((prev) => ({
                                  ...prev,
                                  ipdExpectedStayDays: Math.max(min, parseInt(e.target.value, 10) || min),
                                }));
                              }}
                            />
                          </div>
                          <div className="flex-1">
                            <input
                              type="number"
                              min="0"
                              max="23"
                              className={inputClass}
                              placeholder="Hrs"
                              disabled={isLinkedDaycareEdit}
                              value={formData.ipdExpectedStayHours}
                              onChange={(e) =>
                                setFormData((prev) => ({
                                  ...prev,
                                  ipdExpectedStayHours: Math.min(23, Math.max(0, parseInt(e.target.value, 10) || 0)),
                                }))
                              }
                            />
                          </div>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                          {isDaycareBooking
                            ? "Days + hours -- more than 0 and at most 24 hours; it decides which slots the ward has room for"
                            : "Days + hours"}
                        </p>
                      </div>
                      <div>
                        <label className={labelClass}>Advance Amount (₹)</label>
                        <input
                          type="number"
                          min="0"
                          className={inputClass}
                          value={formData.ipdAdvanceAmount || 0}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              ipdAdvanceAmount: Math.max(0, parseFloat(e.target.value) || 0),
                            }))
                          }
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Payment Mode</label>
                        <FormDropdown
                          className={inputClass}
                          options={IPD_PAYMENT_MODES.map((pm) => ({ label: pm, value: pm }))}
                          value={formData.ipdPaymentMode}
                          onValueChange={(val) =>
                            setFormData((prev) => ({ ...prev, ipdPaymentMode: val }))
                          }
                          placeholder="Select payment mode"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className={labelClass}>Reason For Admit</label>
                        <input
                          type="text"
                          className={inputClass}
                          placeholder="Clinical reason for admission"
                          value={formData.ipdProvisionalDiagnosis}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              ipdProvisionalDiagnosis: e.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {branchField}
                  {departmentField}
                  {doctorField}
                  {dateField}

                  {/* Available Time Slots */}
                  {timeSlotsField}
                </>
              )}

              {/* SMS Confirmation - Static */}
              <div className="lg:col-span-3">
                <label className={labelClass}>SMS Confirmation</label>
                <div className="p-4 bg-gray-50 rounded-xl text-sm text-gray-500">
                  SMS confirmation will be sent to the patient's registered mobile number upon booking.
                </div>
              </div>

              {/* Email Confirmation - Static */}
              <div className="lg:col-span-3">
                <label className={labelClass}>Email Confirmation</label>
                <div className="p-4 bg-gray-50 rounded-xl text-sm text-gray-500">
                  Email confirmation will be sent to the patient's registered email address upon booking.
                </div>
              </div>
{/* Patient Comment / Reason for Visit */}
<div className="lg:col-span-3">
  <label className={labelClass}>Reason for Visit</label>

  <VoiceToText
    value={formData.patientComment}
    onChange={(text) =>
      setFormData((prev) => ({
        ...prev,
        patientComment: text,
      }))
    }
    placeholder="Describe the reason for the visit (optional)"
  />
</div>
                       {/* Actions Footer -- spans the full grid so the buttons sit at the right edge */}
            <div className="lg:col-span-3 flex flex-col-reverse sm:flex-row items-center justify-end gap-4 mt-10 pt-6 border-t border-gray-100">
              <button
                type="button"
                onClick={handleCancel}
                disabled={submitting}
                className="w-full sm:w-auto px-8 py-2.5 bg-white border border-gray-300 text-gray-700 text-sm font-bold rounded-xl hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 shadow-sm"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={submitting}
                className="w-full sm:w-auto px-8 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-blue-700 active:scale-[0.98] transition-all duration-200 shadow-[0_4px_14px_0_rgba(37,99,235,0.2)] hover:shadow-[0_6px_20px_rgba(37,99,235,0.3)] group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4 transition-transform duration-200 group-hover:rotate-90" />
                )}
                {submitting ? "Creating..." : isIpdBooking || isAdmissionEditMode ? "Confirm Admission" : "Confirm Appointment"}
              </button>
            </div>

            {/* Close the main grid */}
            </div>

          </form>
          )}
        </div>
      </div>

      <ConfirmationDialog
        open={showConfirm}
        onConfirm={handleConfirmCreate}
        onCancel={() => setShowConfirm(false)}
        type="question"
        title={
          isEmergencyBooking && !isAdmissionEditMode
            ? "Admit Emergency Patient"
            : isDaycareBooking && !isAdmissionEditMode
              ? "Confirm Daycare Booking"
              : isIpdBooking || isAdmissionEditMode
                ? "Confirm Admission"
                : "Confirm Appointment"
        }
        description={
          isAdmissionEditMode
            ? "The admission request will be updated."
            : isEmergencyBooking
              ? "The patient will be admitted now into the selected bed, and an encounter opened."
              : isDaycareBooking
                ? "The doctor's time slot and a planned daycare request will be booked together."
                : isIpdBooking
                  ? "A planned admission request will be created. The ward/bed are assigned when the patient is actually admitted."
                  : "Are you sure you want to book this appointment?"
        }
        confirmText="Yes"
        cancelText="No"
        loading={submitting}
      />

      <PatientConflictWarningDialog
        open={showConflictWarning}
        severity={conflictSeverity}
        conflicts={conflictMessages}
        existingAppointments={conflictAppointments}
        totalAppointments={conflictAppointments.length}
        onCancel={handleConflictCancel}
        onProceed={handleConflictProceed}
        loading={checkingConflicts}
      />

      <ConfirmationDialog
        open={showLeaveConfirm}
        type="info"
        title="Leave this page?"
        description="You have unsaved changes. If you leave now, your changes will be lost."
        confirmText="Leave"
        cancelText="Stay"
        onConfirm={() => {
          setShowLeaveConfirm(false);
          navigate(-1);
        }}
        onCancel={() => setShowLeaveConfirm(false)}
      />

      <ConfirmationDialog
        open={Boolean(bookingResult)}
        onConfirm={handleBookingDone}
        onCancel={handleBookingDone}
        hideCancelButton
        type="success"
        title="Appointment Booked"
        description={
          bookingResult ? (
            <div className="w-full min-w-[300px] sm:min-w-[340px] rounded-xl bg-gray-50 border border-gray-100 p-4 text-left text-sm">
              <div className="flex items-center justify-between gap-6 py-1">
                <span className="shrink-0 text-gray-500">Patient</span>
                <span className="text-right font-semibold text-gray-900">{formData.patientName || "-"}</span>
              </div>
              <div className="flex items-center justify-between gap-6 py-1">
                <span className="shrink-0 text-gray-500">Patient ID</span>
                <span className="text-right font-semibold text-gray-900">{bookingResult.patient_id}</span>
              </div>
              <div className="flex items-center justify-between gap-6 py-1">
                <span className="shrink-0 text-gray-500">Appointment ID</span>
                <span className="text-right font-semibold text-gray-900">{bookingResult.appointment_id}</span>
              </div>
              <div className="flex items-center justify-between gap-6 py-1">
                <span className="shrink-0 text-gray-500">Visit Type</span>
                <span className="text-right font-semibold text-gray-900">
                  {bookingResult.Patient_visit_type ||
                    bookingResult.patient_visit_type ||
                    (formData.patientVisitType === "Others" && formData.customVisitType?.trim()
                      ? `Others (${formData.customVisitType.trim()})`
                      : formData.patientVisitType) ||
                    "-"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-6 py-1">
                <span className="shrink-0 text-gray-500">Date</span>
                <span className="text-right font-semibold text-gray-900">
                  {format(parseISO(bookingResult.appointment_date), "EEE, MMM d, yyyy")}
                </span>
              </div>
              <div className="flex items-center justify-between gap-6 py-1">
                <span className="shrink-0 text-gray-500">Time</span>
                <span className="text-right font-semibold text-gray-900">
                  {formatSlotLabel(bookingResult.appointment_time)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-6 py-1">
                <span className="shrink-0 text-gray-500">Doctor</span>
                <span className="text-right font-semibold text-gray-900">
                  {selectedDoctorName || "-"}
                </span>
              </div>
            </div>
          ) : null
        }
        confirmText="Done"
      />

      <ConfirmationDialog
        open={Boolean(ipdResult)}
        onConfirm={handleIpdDone}
        onCancel={handleIpdDone}
        hideCancelButton
        type="success"
        title={
          isAdmissionEditMode
            ? "Admission Request Updated"
            : ipdResult?.status === "ADMITTED"
              ? "Patient Admitted"
              : ipdResult?.is_daycare
                ? "Daycare Booked"
                : "Admission Request Created"
        }
        description={
          ipdResult ? (
            <div className="w-full min-w-[300px] sm:min-w-[340px] rounded-xl bg-gray-50 border border-gray-100 p-4 text-left text-sm">
              <div className="flex items-center justify-between gap-6 py-1">
                <span className="shrink-0 text-gray-500">Patient</span>
                <span className="text-right font-semibold text-gray-900">{formData.patientName || "-"}</span>
              </div>
              <div className="flex items-center justify-between gap-6 py-1">
                <span className="shrink-0 text-gray-500">Patient ID</span>
                <span className="text-right font-semibold text-gray-900">{ipdResult.patient_id}</span>
              </div>
              <div className="flex items-center justify-between gap-6 py-1">
                <span className="shrink-0 text-gray-500">IP Number</span>
                <span className="text-right font-semibold text-blue-700">{ipdResult.ip_number}</span>
              </div>
              <div className="flex items-center justify-between gap-6 py-1">
                <span className="shrink-0 text-gray-500">Status</span>
                <span className="text-right font-semibold text-amber-700">{ipdResult.status}</span>
              </div>
              <div className="flex items-center justify-between gap-6 py-1">
                <span className="shrink-0 text-gray-500">
                  {ipdResult.status === "ADMITTED" ? "Admitted At" : ipdResult.is_daycare ? "Session" : "Requested Date"}
                </span>
                <span className="text-right font-semibold text-gray-900">
                  {format(
                    parseISO(ipdResult.admission_date),
                    ipdResult.status === "ADMITTED" || ipdResult.is_daycare ? "EEE, MMM d, yyyy, hh:mm a" : "EEE, MMM d, yyyy",
                  )}
                </span>
              </div>
            </div>
          ) : null
        }
        confirmText="Done"
      />

      <AddWardDialog
        open={addWardOpen}
        onOpenChange={setAddWardOpen}
        branches={branches}
        defaultBranchId={formData.branchId}
        onCreated={handleWardCreated}
      />
      <AddBedDialog
        open={addBedOpen}
        onOpenChange={setAddBedOpen}
        branches={branches}
        defaultBranchId={formData.branchId}
        defaultWardId={formData.requestedWardId}
        onCreated={handleBedCreated}
      />
    </div>
  );
}
