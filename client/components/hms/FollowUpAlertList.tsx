import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarClock,
  CalendarPlus,
  Check,
  ChevronDown,
  Phone,
  Stethoscope,
  UserRound,
  X,
} from "lucide-react";
import { useFollowUpAlerts } from "@/context/FollowUpAlertContext";
import { useCan } from "@/context/PermissionContext";
import type { FollowUpAlert } from "@/api/followUpAlert.api";

/* ============================================================
   FOLLOW-UP DUE ALERTS
   "Follow-ups Due" section of the notification list (header bell
   dropdowns and the Notifications screen): the patients whose follow-up
   date was assigned on a visit in the last 30 days in the user's branches,
   with Book Appointment, View Patient and the follow-up doctor's details.
   ============================================================ */

const fmtDate = (iso?: string | null) => {
  const match = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : "—";
};

const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

function StatusChip({ alert }: { alert: FollowUpAlert }) {
  const [label, cls] = alert.booked
    ? [`Booked for ${fmtDate(alert.booked.appointment_date)}`, "bg-green-50 text-green-700 border-green-200"]
    : alert.due_status === "UPCOMING"
      ? [`Follow-up in ${plural(alert.days_until, "day")}`, "bg-blue-50 text-blue-700 border-blue-200"]
      : alert.due_status === "DUE_TOMORROW"
        ? ["Due tomorrow", "bg-blue-50 text-blue-700 border-blue-200"]
        : alert.due_status === "DUE_TODAY"
          ? ["Due today", "bg-amber-50 text-amber-700 border-amber-200"]
          : [`Overdue ${plural(alert.days_overdue, "day")}`, "bg-red-50 text-red-600 border-red-200"];
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function AlertCard({
  alert,
  highlight,
  canBook,
  onBook,
  onViewPatient,
  onDismiss,
}: {
  alert: FollowUpAlert;
  highlight: boolean;
  canBook: boolean;
  onBook: () => void;
  onViewPatient: () => void;
  onDismiss: () => void;
}) {
  const [showDoctor, setShowDoctor] = useState(false);
  const patientMeta = [
    alert.patient.patient_id,
    [alert.patient.age != null ? `${alert.patient.age}Y` : "", alert.patient.gender?.charAt(0) ?? ""].filter(Boolean).join("/"),
  ].filter(Boolean).join(" · ");

  return (
    <div className={`rounded-lg border border-[#E5E7EB] px-3 py-3 transition-colors ${highlight ? "bg-[#F0F4FF]" : "bg-white"} ${alert.booked ? "opacity-80" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#0B1C30]" title={alert.patient.name}>
            {alert.patient.name || alert.patient.patient_id}
          </p>
          <p className="truncate text-[11px] text-[#6B7280]">{patientMeta}</p>
        </div>
        <div className="flex items-center gap-1">
          <StatusChip alert={alert} />
          <button
            type="button"
            onClick={onDismiss}
            aria-label={`Dismiss follow-up of ${alert.patient.name}`}
            title="Dismiss"
            className="rounded p-1 text-[#9CA3AF] transition-colors hover:bg-[#F2F4F6] hover:text-red-500"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#4B5563]">
        <span className="inline-flex items-center gap-1">
          <CalendarClock className="h-3 w-3 text-[#9CA3AF]" />
          Follow-up {fmtDate(alert.follow_up_date)}
        </span>
        <span>Assigned {fmtDate(alert.visit_date)}</span>
        {alert.patient.mobile && (
          <a href={`tel:${alert.patient.mobile}`} className="inline-flex items-center gap-1 hover:text-[#00488D]">
            <Phone className="h-3 w-3 text-[#9CA3AF]" />
            {alert.patient.mobile}
          </a>
        )}
        {alert.branch.branch_name && <span className="truncate">{alert.branch.branch_name}</span>}
      </div>

      {alert.doctor && (
        <div className="mt-1.5">
          <button
            type="button"
            onClick={() => setShowDoctor((value) => !value)}
            aria-expanded={showDoctor}
            className="inline-flex max-w-full items-center gap-1 text-[11px] font-medium text-[#00488D] hover:text-[#003A6B]"
          >
            <Stethoscope className="h-3 w-3 shrink-0" />
            <span className="truncate">Dr. {alert.doctor.name.replace(/^dr\.?\s+/i, "")}</span>
            <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${showDoctor ? "rotate-180" : ""}`} />
          </button>
          {showDoctor && (
            <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg border border-[#E5E7EB] bg-[#F8F9FF] px-3 py-2 text-[11px]">
              <div>
                <dt className="text-[#9CA3AF]">Specialization</dt>
                <dd className="font-medium text-[#0B1C30]">{alert.doctor.specialization || "—"}</dd>
              </div>
              <div>
                <dt className="text-[#9CA3AF]">Department</dt>
                <dd className="font-medium text-[#0B1C30]">{alert.department?.department_name || "—"}</dd>
              </div>
              <div>
                <dt className="text-[#9CA3AF]">Mobile</dt>
                <dd className="font-medium text-[#0B1C30]">
                  {alert.doctor.mobile ? <a href={`tel:${alert.doctor.mobile}`} className="hover:text-[#00488D]">{alert.doctor.mobile}</a> : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[#9CA3AF]">Branch</dt>
                <dd className="font-medium text-[#0B1C30]">{alert.branch.branch_name || "—"}</dd>
              </div>
            </dl>
          )}
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {!alert.booked && (
          <button
            type="button"
            onClick={onBook}
            disabled={!canBook}
            title={canBook ? "Book the follow-up appointment" : "Your role does not have the Create Appointment permission"}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#00488D] px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-[#003A6B] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CalendarPlus className="h-3.5 w-3.5" />
            Book Appointment
          </button>
        )}
        <button
          type="button"
          onClick={onViewPatient}
          className="inline-flex items-center gap-1.5 rounded-md border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#374151] transition-colors hover:bg-[#F2F4F6]"
        >
          <UserRound className="h-3.5 w-3.5" />
          View Patient
        </button>
      </div>
    </div>
  );
}

/* Splits "First Middle Last" the way the booking form's patient expects. */
const splitName = (name: string) => {
  const parts = name.split(/\s+/).filter(Boolean);
  return {
    patient_first_name: parts[0] ?? "",
    patient_middle_name: parts.length > 2 ? parts.slice(1, -1).join(" ") : "",
    patient_last_name: parts.length > 1 ? parts[parts.length - 1] : "",
  };
};

export function FollowUpAlertSection({
  portal = "admin",
  onNavigate,
}: {
  /* The doctor portal books / opens patients through its own pages. */
  portal?: "admin" | "doctor";
  /* Called before leaving the list (closes a dropdown). */
  onNavigate?: () => void;
}) {
  const navigate = useNavigate();
  const canBook = useCan("appointment.create");
  const { enabled, alerts, markRead, dismiss } = useFollowUpAlerts();
  /* Alerts that were unread when the list was shown stay highlighted. */
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());

  /* Showing the list marks its alerts read (clears the bell count) - once
     per alert, so a failing request is not retried in a loop. */
  const marked = useRef<Set<string>>(new Set());
  useEffect(() => {
    const unread = alerts
      .filter((alert) => !alert.read && !alert.booked && !marked.current.has(alert.encounter_no))
      .map((alert) => alert.encounter_no);
    if (unread.length === 0) return;
    unread.forEach((encounterNo) => marked.current.add(encounterNo));
    setHighlighted((prev) => new Set([...prev, ...unread]));
    void markRead(unread);
  }, [alerts, markRead]);

  if (!enabled || alerts.length === 0) return null;

  const bookAppointment = (alert: FollowUpAlert) => {
    const date = alert.follow_up_date;
    const placement = alert.doctor
      ? {
          doctorId: alert.doctor.employee_id,
          branchId: alert.branch?.branch_id || "",
          departmentId: alert.department?.department_id || "",
        }
      : null;
    const state = {
      patient: {
        patient_id: alert.patient.patient_id,
        ...splitName(alert.patient.name),
        patient_primary_mobile: alert.patient.mobile ?? "",
      },
      ...(placement ? { slot: { ...placement, date } } : {}),
      ...(placement?.doctorId ? { doctorId: placement.doctorId } : {}),
      /* Doctor portal: book with the follow-up doctor and return there. */
      ...(portal === "doctor" && placement ? { doctorBooking: placement } : {}),
      selectedDate: date,
      followUpDate: date,
      date,
      keepDate: true,
      isFollowUpBooking: true,
      defaultVisitType: "Follow-up",
    };
    onNavigate?.();
    navigate(portal === "doctor" ? "/doctor/appointments/add" : "/appointments/book", { state });
  };

  const viewPatient = (alert: FollowUpAlert) => {
    onNavigate?.();
    if (portal === "doctor") {
      navigate("/doctor/patient-details", { state: { patientId: alert.patient.patient_id } });
    } else {
      navigate(`/patients/view/${alert.patient.patient_id}`);
    }
  };

  const pending = alerts.filter((alert) => !alert.booked).length;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#434656]">
          Follow-ups Due
          {pending > 0 && (
            <span className="rounded-full bg-[#00488D] px-1.5 py-0.5 text-[10px] font-bold normal-case tracking-normal text-white">
              {pending}
            </span>
          )}
        </h2>
        {alerts.some((alert) => !alert.read) && (
          <button
            type="button"
            onClick={() => void markRead("all")}
            className="flex items-center gap-1 text-[11px] font-semibold text-[#00488D] transition-colors hover:text-[#003A6B]"
          >
            <Check className="h-3 w-3" />
            Mark read
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {alerts.map((alert) => (
          <AlertCard
            key={alert.encounter_no}
            alert={alert}
            highlight={highlighted.has(alert.encounter_no)}
            canBook={canBook}
            onBook={() => bookAppointment(alert)}
            onViewPatient={() => viewPatient(alert)}
            onDismiss={() => void dismiss(alert.encounter_no)}
          />
        ))}
      </div>

      <p className="mt-2 text-[10px] text-[#6B7280]">
        Shown for 30 days from the consult day the follow-up date was assigned.
      </p>
    </section>
  );
}

export default FollowUpAlertSection;
