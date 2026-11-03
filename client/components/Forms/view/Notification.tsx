import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import {
  employeeApi,
  EmployeeRecord,
} from "@/api/employee.api";
import {
  patientApi,
  PatientRecord,
} from "@/api/patient.api";
import {
  appointmentApi,
} from "@/api/appointment.api";
import { getActiveBranchId } from "@/api/axios";
import { getUser } from "@/utils/token";
import {
  getAccountActivity,
  type AccountActivity,
} from "@/utils/accountActivity";
import { useFollowUpAlerts } from "@/context/FollowUpAlertContext";
import { FollowUpAlertSection } from "@/components/hms/FollowUpAlertList";

const DISMISSED_NOTIFICATIONS_KEY =
  "hms_dismissed_notifications";

const NOTIFICATION_SNAPSHOT_KEY =
  "hms_notification_snapshot_v2";

const LAST_SEEN_KEY =
  "hms_notifications_last_seen";

const EVENT_CACHE_KEY =
  "hms_notification_events_v1";

const POLLING_INTERVAL = 30000;

/*
 * Branch resolution for the notification feed. On a fresh origin (e.g.
 * first visit to the deployed site) nothing is stored under
 * hms_selected_branch_id, so these list requests went out without an
 * x-branch-id header and branch-restricted roles got 403 "Please select
 * a branch first." on every poll — the bell stayed empty forever. Fall
 * back to the caller's own active branch mappings (/employees/me), then
 * the login-time branch_id, and send them as explicit branchId query
 * params which branchScope accepts in place of the header.
 *
 * When several mappings exist, EVERY mapped branch is fed and the lists
 * merged — scoping to just the first mapping silently hid all activity
 * from the caller's other branches (e.g. an ADMIN mapped to two branches
 * saw an empty bell because today's changes happened in the other one),
 * which never matched the local-browser experience where a branch was
 * already selected.
 */
let cachedFeedBranchIds: string[] | null | undefined;

/*
 * This account's own active branch mappings (/employees/me), cached for
 * the session. Returns null when they cannot be resolved (no employee
 * record, network failure) so the caller can fall back to the login-time
 * branch_id.
 */
const getMappedBranchIds =
  async (): Promise<string[] | null> => {
    if (
      cachedFeedBranchIds !==
      undefined
    ) {
      return cachedFeedBranchIds;
    }

    try {
      const me =
        await employeeApi.getMe();
      const mapped = (
        me.data?.data?.branches ??
        []
      ).map(
        (b: {
          branch_id?: string | null;
        }) => b?.branch_id
      ).filter(
        (
          id:
            | string
            | null
            | undefined
        ): id is string => Boolean(id)
      );
      cachedFeedBranchIds = Array.from(
        new Set(mapped)
      );
    } catch {
      return null;
    }

    return cachedFeedBranchIds;
  };

const resolveFeedBranchIds =
  async (): Promise<string[]> => {
    const selected =
      getActiveBranchId();

    if (selected) {
      /*
       * Trust the selector unless it points at a
       * branch this account no longer maps to. A
       * stale hms_selected_branch_id (left behind
       * by an earlier session/account on the same
       * origin, or a mapping removed later) would
       * otherwise get 403 "Forbidden. You don't
       * have access to this branch." on every
       * scoped list call forever, keeping the bell
       * permanently empty on the deployed origin.
       * Accounts with no mappings at all (top-level
       * admins) keep any selection.
       */
      const mapped =
        await getMappedBranchIds();
      if (
        !mapped ||
        mapped.length === 0 ||
        mapped.includes(selected)
      ) {
        return [selected];
      }
      return mapped;
    }

    const mapped =
      await getMappedBranchIds();

    if (mapped && mapped.length > 0) {
      return mapped;
    }

    const loginBranchId =
      getUser()?.branch_id;
    if (loginBranchId) {
      return [loginBranchId];
    }

    return [];
  };

/*
 * Runs one list call per resolved branch (parallel) and merges the
 * arrays. With zero or one branch this degrades to the plain single
 * call — identical to the pre-multi-branch behavior.
 */
const fetchAcrossBranches = async <
  T,
  R extends { id?: unknown },
>(
  branchIds: string[],
  call: (
    branchId: string | undefined
  ) => Promise<T>,
  extract: (res: T) => R[]
): Promise<R[] | null> => {
  /*
   * Returns null when EVERY attempt failed so
   * the caller can keep the previous snapshot
   * instead of mistaking a network failure for
   * "all records deleted" (which would wipe the
   * feed and fire false DELETE events).
   */
  if (branchIds.length <= 1) {
    try {
      const res = await call(
        branchIds[0]
      );
      return extract(res);
    } catch {
      return null;
    }
  }

  const perBranch =
    await Promise.all(
      branchIds.map((branchId) =>
        call(branchId)
          .then((res) => ({
            ok: true as const,
            list: extract(res),
          }))
          .catch(() => ({
            ok: false as const,
            list: [] as R[],
          }))
      )
    );

  if (
    !perBranch.some(
      (attempt) => attempt.ok
    )
  ) {
    return null;
  }

  const seen = new Set<string>();
  const merged: R[] = [];

  for (const attempt of perBranch) {
    if (!attempt.ok) continue;
    for (const item of attempt.list) {
      const key = String(
        (item as any)?.id ??
          (item as any)?.employee_id ??
          (item as any)?.patient_id ??
          (item as any)?.appointment_id ??
          JSON.stringify(item)
      );
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
  }

  return merged;
};

/* -------------------------------------------------------------------------- */
/* STORAGE                                                                    */
/* -------------------------------------------------------------------------- */

function loadDismissedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(
      DISMISSED_NOTIFICATIONS_KEY
    );

    return raw
      ? new Set<string>(JSON.parse(raw))
      : new Set<string>();
  } catch {
    return new Set<string>();
  }
}

function saveDismissedIds(
  ids: Set<string>
) {
  try {
    localStorage.setItem(
      DISMISSED_NOTIFICATIONS_KEY,
      JSON.stringify(Array.from(ids))
    );
  } catch {
    // Ignore localStorage errors.
  }
}

function loadLastSeen(): number {
  try {
    const raw = localStorage.getItem(
      LAST_SEEN_KEY
    );

    const value = raw
      ? Number(raw)
      : 0;

    return Number.isFinite(value)
      ? value
      : 0;
  } catch {
    return 0;
  }
}

function saveLastSeen(timestamp: number) {
  try {
    localStorage.setItem(
      LAST_SEEN_KEY,
      String(timestamp)
    );
  } catch {
    // Ignore localStorage errors.
  }
}

/*
 * Detected events are cached so the red dot
 * survives page navigation and reloads until
 * the bell button is clicked.
 */
function loadCachedItems(): NotificationItem[] {
  try {
    const raw = localStorage.getItem(
      EVENT_CACHE_KEY
    );

    if (!raw) {
      return [];
    }

    const parsed =
      JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    const now = new Date();

    return parsed.filter(
      (item) =>
        item &&
        typeof item.id ===
          "string" &&
        typeof item.createdAt ===
          "number" &&
        typeof item.title ===
          "string" &&
        isSameDay(
          new Date(
            item.createdAt
          ),
          now
        )
    );
  } catch {
    return [];
  }
}

function saveCachedItems(
  items: NotificationItem[]
) {
  try {
    const capped = items
      .slice(0, 300)
      .map((item) => ({
        id: item.id,
        title: item.title,
        message: item.message,
        time: item.time,
        createdAt: item.createdAt,
        role: item.role,
        action: item.action,
        recordId: item.recordId,
      }));

    localStorage.setItem(
      EVENT_CACHE_KEY,
      JSON.stringify(capped)
    );
  } catch {
    // Ignore localStorage errors.
  }
}

type StoredRecord = {
  id: string;
  fingerprint: string;
  name: string;
};

type StoredSnapshot = {
  employees: StoredRecord[];
  patients: StoredRecord[];
  appointments: StoredRecord[];
};

function loadSnapshot(): StoredSnapshot | null {
  try {
    const raw = localStorage.getItem(
      NOTIFICATION_SNAPSHOT_KEY
    );

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);

    return {
      employees:
        Array.isArray(parsed?.employees)
          ? parsed.employees
          : [],
      patients:
        Array.isArray(parsed?.patients)
          ? parsed.patients
          : [],
      appointments:
        Array.isArray(parsed?.appointments)
          ? parsed.appointments
          : [],
    };
  } catch {
    return null;
  }
}

function saveSnapshot(
  snapshot: StoredSnapshot
) {
  try {
    localStorage.setItem(
      NOTIFICATION_SNAPSHOT_KEY,
      JSON.stringify(snapshot)
    );
  } catch {
    // Ignore localStorage errors.
  }
}

/* -------------------------------------------------------------------------- */
/* TYPES                                                                      */
/* -------------------------------------------------------------------------- */

type NotificationRole =
  | "doctor"
  | "staff"
  | "admin"
  | "patient"
  | "appointment"
  | "account";

type NotificationAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE";

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  time: string;
  createdAt: number;
  role: NotificationRole;
  action?: NotificationAction;
  unread?: boolean;
  recordId?: string;
};

type GenericRecord = Record<
  string,
  any
>;

/* -------------------------------------------------------------------------- */
/* TITLES                                                                     */
/* -------------------------------------------------------------------------- */

const ROLE_TITLES: Record<
  NotificationRole,
  string
> = {
  doctor: "New Doctor Added",
  staff: "New Staff Added",
  admin: "New Admin Added",
  patient: "New Patient Registered",
  appointment:
    "New Appointment Created",
  account: "Account Updated",
};

/* -------------------------------------------------------------------------- */
/* ROLE                                                                     */
/* -------------------------------------------------------------------------- */

function roleTypeToNotificationRole(
  roleType?: string | null
): NotificationRole {
  const normalized = (
    roleType || ""
  )
    .toUpperCase()
    .replace(/[\s-]/g, "_");

  if (normalized === "DOCTOR") {
    return "doctor";
  }

  if (
    normalized === "BRANCH_ADMIN" ||
    normalized === "ADMIN" ||
    normalized === "ADMINISTRATOR"
  ) {
    return "admin";
  }

  return "staff";
}

/* -------------------------------------------------------------------------- */
/* NAME HELPERS                                                               */
/* -------------------------------------------------------------------------- */

function formatEmployeeName(
  e: EmployeeRecord
) {
  return [
    e.first_name,
    e.middle_name,
    e.last_name,
  ]
    .filter(Boolean)
    .join(" ");
}

function formatPatientName(
  p: PatientRecord
) {
  return [
    p.patient_first_name,
    p.patient_middle_name,
    p.patient_last_name,
  ]
    .filter(Boolean)
    .join(" ");
}

function getGenericName(
  item: GenericRecord,
  fallback: string
) {
  const directName =
    item.name ||
    item.full_name ||
    item.fullName ||
    item.patient_name ||
    item.patientName ||
    item.doctor_name ||
    item.doctorName ||
    item.appointment_name ||
    item.appointmentName;

  if (directName) {
    return String(directName);
  }

  const first =
    item.first_name ||
    item.firstName ||
    item.patient_first_name ||
    item.patientFirstName ||
    "";

  const middle =
    item.middle_name ||
    item.middleName ||
    item.patient_middle_name ||
    item.patientMiddleName ||
    "";

  const last =
    item.last_name ||
    item.lastName ||
    item.patient_last_name ||
    item.patientLastName ||
    "";

  const name = [
    first,
    middle,
    last,
  ]
    .filter(Boolean)
    .join(" ");

  return name || fallback;
}

/* -------------------------------------------------------------------------- */
/* TIME                                                                       */
/* -------------------------------------------------------------------------- */

function timeAgo(timestamp: number) {
  const diffMs =
    Date.now() - timestamp;

  const diffSec = Math.max(
    0,
    Math.floor(diffMs / 1000)
  );

  if (diffSec < 60) {
    return "Just now";
  }

  const diffMin =
    Math.floor(diffSec / 60);

  if (diffMin < 60) {
    return `${diffMin}m ago`;
  }

  const diffHr =
    Math.floor(diffMin / 60);

  if (diffHr < 24) {
    return `${diffHr}h ago`;
  }

  const diffDay =
    Math.floor(diffHr / 24);

  return `${diffDay}d ago`;
}

/* -------------------------------------------------------------------------- */
/* DATE                                                                       */
/* -------------------------------------------------------------------------- */

function isSameDay(
  a: Date,
  b: Date
) {
  return (
    a.getFullYear() ===
      b.getFullYear() &&
    a.getMonth() ===
      b.getMonth() &&
    a.getDate() ===
      b.getDate()
  );
}

/* -------------------------------------------------------------------------- */
/* ICONS                                                                      */
/* -------------------------------------------------------------------------- */

const Icon = ({
  role,
}: {
  role: NotificationRole;
}) => {
  if (role === "doctor") {
    return (
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#e9efff]">
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 text-[#003ec7]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path
            d="M15 20a6 6 0 0 0-12 0"
            strokeLinecap="round"
          />
          <circle
            cx="9"
            cy="7"
            r="4"
          />
          <path
            d="M19 8v6M16 11h6"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }

  if (role === "admin") {
    return (
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#fff0e7]">
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 text-[#d65f00]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path
            d="M12 3l7 3v5c0 4.5-2.9 7.8-7 10-4.1-2.2-7-5.5-7-10V6l7-3Z"
            strokeLinejoin="round"
          />
          <path
            d="M9.5 12l1.7 1.7 3.5-3.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }

  if (role === "patient") {
    return (
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#e9f8f1]">
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 text-[#138a52]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <circle
            cx="9"
            cy="8"
            r="3.5"
          />
          <path
            d="M3 20a6 6 0 0 1 12 0"
            strokeLinecap="round"
          />
          <path
            d="M17 11v6M14 14h6"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }

  if (role === "appointment") {
    return (
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#f0eaff]">
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 text-[#7046c9]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <rect
            x="3"
            y="5"
            width="18"
            height="16"
            rx="2"
          />
          <path
            d="M16 3v4M8 3v4M3 10h18"
            strokeLinecap="round"
          />
          <path
            d="M8 14h3M8 17h5"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }

  if (role === "account") {
    return (
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#e9efff]">
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 text-[#003ec7]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path
            d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M10.3 21a1.94 1.94 0 0 0 3.4 0"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }

  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#eef1f9]">
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5 text-[#434656]"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <circle
          cx="9"
          cy="8"
          r="3.5"
        />
        <path
          d="M3 20a6 6 0 0 1 12 0"
          strokeLinecap="round"
        />
        <path
          d="M17 8h4M19 6v4"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* GENERIC API RESPONSE                                                       */
/* -------------------------------------------------------------------------- */

function extractArray(
  response: any,
  possibleKeys: string[]
): GenericRecord[] {
  if (Array.isArray(response)) {
    return response;
  }

  const candidates = [
    response?.data,
    response?.data?.data,
    response?.data?.data?.data,
    response,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }

    if (
      candidate &&
      typeof candidate === "object"
    ) {
      for (const key of possibleKeys) {
        if (
          Array.isArray(candidate[key])
        ) {
          return candidate[key];
        }
      }
    }
  }

  return [];
}

/* -------------------------------------------------------------------------- */
/* RECORD ID                                                                  */
/* -------------------------------------------------------------------------- */

function getRecordId(
  item: GenericRecord,
  type: string,
  index: number
): string {
  const possibleIds = [
    item.id,
    item.employee_id,
    item.employeeId,
    item.patient_id,
    item.patientId,
    item.appointment_id,
    item.appointmentId,
    item.user_id,
    item.userId,
    item.doctor_id,
    item.doctorId,
    item.staff_id,
    item.staffId,
    item.admin_id,
    item.adminId,
  ];

  const found = possibleIds.find(
    (value) =>
      value !== undefined &&
      value !== null &&
      value !== ""
  );

  if (found !== undefined) {
    return String(found);
  }

  return `${type}-${index}`;
}

/* -------------------------------------------------------------------------- */
/* FINGERPRINT                                                                */
/* -------------------------------------------------------------------------- */

function createFingerprint(
  item: GenericRecord
): string {
  /*
   * Remove fields that naturally change between
   * requests and should not trigger "Updated".
   */
  const ignoredKeys = new Set([
    "updated_at",
    "updatedAt",
    "last_updated",
    "lastUpdated",
    "created_at",
    "createdAt",
  ]);

  const clean: GenericRecord = {};

  Object.keys(item)
    .sort()
    .forEach((key) => {
      if (!ignoredKeys.has(key)) {
        const value = item[key];

        if (
          value !== undefined &&
          typeof value !== "function"
        ) {
          clean[key] = value;
        }
      }
    });

  try {
    return JSON.stringify(clean);
  } catch {
    return String(item);
  }
}

/* -------------------------------------------------------------------------- */
/* EMPLOYEE SNAPSHOT                                                          */
/* -------------------------------------------------------------------------- */

function buildEmployeeSnapshot(
  employees: EmployeeRecord[]
): StoredRecord[] {
  return employees.map(
    (employee, index) => {
      const id = getRecordId(
        employee as any,
        "employee",
        index
      );

      const role =
        roleTypeToNotificationRole(
          employee.user_table?.role_type
        );

      const name =
        formatEmployeeName(
          employee
        ) ||
        (role === "doctor"
          ? "Doctor"
          : role === "admin"
          ? "Admin"
          : "Staff");

      return {
        id,
        fingerprint: createFingerprint(
          employee as any
        ),
        name,
      };
    }
  );
}

/* -------------------------------------------------------------------------- */
/* PATIENT SNAPSHOT                                                           */
/* -------------------------------------------------------------------------- */

function buildPatientSnapshot(
  patients: PatientRecord[]
): StoredRecord[] {
  return patients.map(
    (patient, index) => {
      const id = getRecordId(
        patient as any,
        "patient",
        index
      );

      const name =
        formatPatientName(
          patient
        ) || "Patient";

      return {
        id,
        fingerprint: createFingerprint(
          patient as any
        ),
        name,
      };
    }
  );
}

/* -------------------------------------------------------------------------- */
/* APPOINTMENT SNAPSHOT                                                       */
/* -------------------------------------------------------------------------- */

function buildAppointmentSnapshot(
  appointments: GenericRecord[]
): StoredRecord[] {
  return appointments.map(
    (appointment, index) => {
      const id = getRecordId(
        appointment,
        "appointment",
        index
      );

      const name =
        getGenericName(
          appointment,
          `Appointment #${id}`
        );

      return {
        id,
        fingerprint:
          createFingerprint(
            appointment
          ),
        name,
      };
    }
  );
}

/* -------------------------------------------------------------------------- */
/* EMPLOYEE ROLE                                                              */
/* -------------------------------------------------------------------------- */

function getEmployeeRole(
  employee: GenericRecord
): NotificationRole {
  return roleTypeToNotificationRole(
    employee?.user_table?.role_type ||
      employee?.role_type ||
      employee?.roleType ||
      employee?.role
  );
}

/* -------------------------------------------------------------------------- */
/* CREATE NOTIFICATION                                                        */
/* -------------------------------------------------------------------------- */

function createNotification(
  role: NotificationRole,
  action: NotificationAction,
  name: string,
  recordId: string
): NotificationItem {
  let title = "";
  let message = "";

  if (action === "CREATE") {
    if (role === "doctor") {
      title = "New Doctor Added";
      message = `${name} was added as a doctor.`;
    } else if (role === "admin") {
      title = "New Admin Added";
      message = `${name} was added as an admin.`;
    } else if (role === "staff") {
      title = "New Staff Added";
      message = `${name} was added as staff.`;
    } else if (role === "patient") {
      title = "New Patient Registered";
      message = `${name} was registered as a patient.`;
    } else {
      title = "New Appointment Created";
      message = `${name} was created.`;
    }
  }

  if (action === "UPDATE") {
    if (role === "doctor") {
      title = "Doctor Updated";
    } else if (role === "admin") {
      title = "Admin Updated";
    } else if (role === "staff") {
      title = "Staff Updated";
    } else if (role === "patient") {
      title = "Patient Updated";
    } else {
      title = "Appointment Updated";
    }

    message = `${name} was updated.`;
  }

  if (action === "DELETE") {
    if (role === "doctor") {
      title = "Doctor Deleted";
    } else if (role === "admin") {
      title = "Admin Deleted";
    } else if (role === "staff") {
      title = "Staff Deleted";
    } else if (role === "patient") {
      title = "Patient Deleted";
    } else {
      title = "Appointment Deleted";
    }

    message = `${name} was deleted.`;
  }

  const createdAt =
    Date.now();

  return {
    id: `event-${role}-${action}-${recordId}-${createdAt}`,
    title,
    message,
    time: "Just now",
    createdAt,
    role,
    action,
    recordId,
  };
}

/*
 * Adds a notification derived from the record's
 * own created/updated timestamp, but only when
 * it happened today.
 */
function pushDerivedItem(
  items: NotificationItem[],
  role: NotificationRole,
  action: NotificationAction,
  recordId: string,
  name: string,
  timestampStr?: string | null
) {
  if (!timestampStr || !recordId) {
    return;
  }

  const timestamp =
    new Date(timestampStr).getTime();

  if (
    Number.isNaN(timestamp) ||
    !isSameDay(
      new Date(timestamp),
      new Date()
    )
  ) {
    return;
  }

  const item = createNotification(
    role,
    action,
    name,
    recordId
  );

  /*
   * Unique per occurrence so a repeated
   * change counts as unread again.
   */
  item.id = `derived-${role}-${action}-${recordId}-${timestamp}`;

  item.createdAt = timestamp;

  items.push(item);
}

function accountActivityToNotification(
  activity: AccountActivity
): NotificationItem {
  return {
    id: `account-${activity.id}`,
    title: activity.title,
    message: activity.message,
    time: timeAgo(activity.createdAt),
    createdAt: activity.createdAt,
    role: "account",
    action: "UPDATE",
  };
}

/* -------------------------------------------------------------------------- */
/* COMPONENT                                                                  */
/* -------------------------------------------------------------------------- */

export default function Notifications() {
  const navigate = useNavigate();
  const location = useLocation();
  /* Follow-ups due head the list (doctor portal links on /doctor/...). */
  const followUps = useFollowUpAlerts();
  const hasFollowUps = followUps.enabled && followUps.alerts.length > 0;
  const [
    notifications,
    setNotifications,
  ] = useState<NotificationItem[]>(
    loadCachedItems()
  );

  const [
    accountItems,
    setAccountItems,
  ] = useState<NotificationItem[]>(
    []
  );

  const [
    lastSeenMs,
    setLastSeenMs,
  ] = useState<number>(
    loadLastSeen()
  );

  const [
    isLoading,
    setIsLoading,
  ] = useState(true);

  const [
    ,
    setTimeTick,
  ] = useState(0);

  const [
    error,
    setError,
  ] = useState<string | null>(
    null
  );

  const dismissedIdsRef =
    useRef<Set<string>>(
      loadDismissedIds()
    );

  const previousSnapshotRef =
    useRef<StoredSnapshot | null>(
      loadSnapshot()
    );

  const consecutiveFailuresRef =
    useRef<number>(0);

  /* ------------------------------------------------------------------------ */
  /* FETCH APPOINTMENTS                                                       */
  /* ------------------------------------------------------------------------ */

  const fetchAppointmentsForBranch =
    useCallback(async (feedBranchId?: string): Promise<
      GenericRecord[]
    > => {
      const pageSize = 100;
      const sortBy = "created_at";
      const sortOrder = "desc";

      const firstPage =
        await appointmentApi.getAll({
          limit: pageSize,
          page: 1,
          sortBy,
          sortOrder,
          ...(feedBranchId
            ? { branchId: feedBranchId }
            : {}),
        });

      const total =
        firstPage.data?.data
          ?.total || 0;

      const totalPages = Math.ceil(
        total / pageSize
      );

      let all = extractArray(
        firstPage,
        [
          "appointments",
          "appointment",
          "data",
          "results",
        ]
      );

      for (
        let page = 2;
        page <= totalPages &&
        all.length < 2000;
        page++
      ) {
        const response =
          await appointmentApi.getAll({
            limit: pageSize,
            page,
            sortBy,
            sortOrder,
            ...(feedBranchId
              ? { branchId: feedBranchId }
              : {}),
          });

        all = all.concat(
          extractArray(
            response,
            [
              "appointments",
              "appointment",
              "data",
              "results",
            ]
          )
        );
      }

      return all;
    }, []);

  const fetchAppointments =
    useCallback(async (feedBranchIds: string[]): Promise<
      GenericRecord[] | null
    > => {
      try {
        if (feedBranchIds.length <= 1) {
          return await fetchAppointmentsForBranch(
            feedBranchIds[0]
          );
        }

        /*
         * Several mapped branches and no explicit
         * selection: page each branch in parallel.
         * A single branch failing must not sink the
         * whole appointments feed, so per-branch
         * failures degrade to an empty list while a
         * TOTAL failure (below) still returns null
         * so the snapshot logic can skip the diff.
         */
        const perBranch =
          await Promise.all(
            feedBranchIds.map((branchId) =>
              fetchAppointmentsForBranch(
                branchId
              ).catch(() => [])
            )
          );

        return perBranch.flat();
      } catch {
        /*
         * Appointment API failure should NOT
         * break employee/patient notifications.
         *
         * Returns null (not an empty array): an
         * empty array is indistinguishable from
         * "every appointment was deleted" and
         * used to flood the feed with false
         * DELETE events, then false CREATE
         * events on the next successful poll —
         * Render cold starts on the deployed
         * site made this happen regularly.
         */
        return null;
      }
    }, [fetchAppointmentsForBranch]);

  /* ------------------------------------------------------------------------ */
  /* MAIN FETCH                                                               */
  /* ------------------------------------------------------------------------ */

  const fetchNotifications =
    useCallback(async () => {
      setError(null);

      /*
       * One shared failure recorder: the banner only
       * appears after 3 consecutive cycles where
       * EVERY source failed. A single flaky source
       * must never blank a feed the other sources
       * are still feeding.
       */
      const registerFailureCycle = (
        err?: any
      ) => {
        consecutiveFailuresRef.current += 1;

        if (
          consecutiveFailuresRef.current >= 3
        ) {
          const status =
            err?.response?.status;
          const serverMessage =
            err?.response?.data?.message;

          setError(
            serverMessage
              ? `Couldn't load notifications${
                  status ? ` (${status})` : ""
                }: ${serverMessage}`
              : "Couldn't load notifications from the server."
          );
        }
      };

      try {
        const feedBranchIds =
          await resolveFeedBranchIds();

        const [
          employees,
          patients,
          appointments,
        ] =
          await Promise.all([
            fetchAcrossBranches(
              feedBranchIds,
              (branchId) =>
                employeeApi.getAll({
                  limit: 1000,
                  ...(branchId
                    ? { branchId }
                    : {}),
                }),
              (res) =>
                (res.data?.data
                  ?.employees ??
                  []) as any[]
            ).catch(() => null),

            fetchAcrossBranches(
              feedBranchIds,
              (branchId) =>
                patientApi.getAll({
                  limit: 1000,
                  ...(branchId
                    ? { branchId }
                    : {}),
                }),
              (res) =>
                (res.data?.data
                  ?.patients ??
                  []) as any[]
            ).catch(() => null),

            fetchAppointments(
              feedBranchIds
            ),
          ]);

        /*
         * A failed appointments fetch returns null.
         * Keep the previous appointments snapshot
         * and skip this cycle's appointment diff so
         * no false create/delete events are ever
         * generated from missing data — the feed
         * only ever reflects real changes.
         */
        const appointmentsFetched =
          appointments !== null;

        const safeAppointments =
          appointments ?? [];

        /*
         * Same isolation for employees/patients:
         * a failed source keeps its previous
         * snapshot slice and skips this cycle's
         * diff so no false create/delete events
         * are ever generated from missing data.
         */
        const employeesFetched =
          employees !== null;

        const patientsFetched =
          patients !== null;

        const safeEmployees =
          employees ?? [];

        const safePatients =
          patients ?? [];

        /* ---------------------------------------------------------------- */
        /* BUILD CURRENT SNAPSHOT                                            */
        /* ---------------------------------------------------------------- */

        /*
         * First-ever fetch (nothing stored yet):
         * start from an empty baseline instead of
         * crashing on null below — a null snapshot
         * used to throw on every poll, killing the
         * whole feed and the red dot on fresh
         * browsers (first visit to the deployed
         * site). isFirstCycle also keeps existing
         * records from firing a false "created"
         * flood; today's real changes still come
         * through the record-timestamp pass below.
         */
        const isFirstCycle =
          previousSnapshotRef.current ===
          null;

        const previousSnapshot =
          previousSnapshotRef.current ?? {
            employees: [],
            patients: [],
            appointments: [],
          };

        const currentSnapshot: StoredSnapshot =
          {
            employees:
              employeesFetched
                ? buildEmployeeSnapshot(
                    safeEmployees
                  )
                : previousSnapshot
                  ?.employees ?? [],

            patients:
              patientsFetched
                ? buildPatientSnapshot(
                    safePatients
                  )
                : previousSnapshot
                  ?.patients ?? [],

            appointments:
              appointmentsFetched
                ? buildAppointmentSnapshot(
                    safeAppointments
                  )
                : previousSnapshot
                  ?.appointments ?? [],
          };

        /* ---------------------------------------------------------------- */
        /* DETECT CHANGES                                                   */
        /* ---------------------------------------------------------------- */

        const newEvents: NotificationItem[] =
          [];

        /* ---------------------------------------------------------------- */
        /* EMPLOYEE CREATE / UPDATE / DELETE                               */
        /* ---------------------------------------------------------------- */

        const previousEmployees =
          previousSnapshot.employees;

        const currentEmployees =
          currentSnapshot.employees;

        const currentEmployeeMap =
          new Map(
            currentEmployees.map(
              (item) => [
                item.id,
                item,
              ]
            )
          );

        const previousEmployeeMap =
          new Map(
            previousEmployees.map(
              (item) => [
                item.id,
                item,
              ]
            )
          );

        /*
         * CREATED / UPDATED
         */

        if (!isFirstCycle)
        currentEmployees.forEach(
          (current) => {
            const previous =
              previousEmployeeMap.get(
                current.id
              );

            /*
             * New employee
             */
            if (!previous) {
              /*
               * Need actual role.
               * Find employee from API.
               */
              const employee =
                safeEmployees.find(
                  (
                    e: EmployeeRecord,
                    index: number
                  ) =>
                    getRecordId(
                      e as any,
                      "employee",
                      index
                    ) ===
                    current.id
                );

              const role =
                employee
                  ? getEmployeeRole(
                      employee as any
                    )
                  : "staff";

              newEvents.push(
                createNotification(
                  role,
                  "CREATE",
                  current.name,
                  current.id
                )
              );

              return;
            }

            /*
             * Existing employee changed
             */
            if (
              previous.fingerprint !==
              current.fingerprint
            ) {
              const employee =
                safeEmployees.find(
                  (
                    e: EmployeeRecord,
                    index: number
                  ) =>
                    getRecordId(
                      e as any,
                      "employee",
                      index
                    ) ===
                    current.id
                );

              const role =
                employee
                  ? getEmployeeRole(
                      employee as any
                    )
                  : "staff";

              newEvents.push(
                createNotification(
                  role,
                  "UPDATE",
                  current.name,
                  current.id
                )
              );
            }
          }
        );

        /*
         * DELETED EMPLOYEES
         */

        previousEmployees.forEach(
          (previous) => {
            if (
              !currentEmployeeMap.has(
                previous.id
              )
            ) {
              /*
               * We cannot get role from the
               * current backend record because
               * it has already been deleted.
               *
               * Try to preserve role in the
               * stored fingerprint if available.
               */
              let role:
                | NotificationRole
                | null = null;

              try {
                const parsed =
                  JSON.parse(
                    previous.fingerprint
                  );

                role =
                  roleTypeToNotificationRole(
                    parsed
                      ?.user_table
                      ?.role_type ||
                      parsed
                        ?.role_type ||
                      parsed?.role
                  );
              } catch {
                // fallback below
              }

              if (
                !role ||
                role ===
                  "appointment" ||
                role ===
                  "patient"
              ) {
                role = "staff";
              }

              newEvents.push(
                createNotification(
                  role,
                  "DELETE",
                  previous.name,
                  previous.id
                )
              );
            }
          }
        );

        /* ---------------------------------------------------------------- */
        /* PATIENT CREATE / UPDATE / DELETE                                */
        /* ---------------------------------------------------------------- */

        const previousPatients =
          previousSnapshot.patients;

        const currentPatients =
          currentSnapshot.patients;

        const currentPatientMap =
          new Map(
            currentPatients.map(
              (item) => [
                item.id,
                item,
              ]
            )
          );

        const previousPatientMap =
          new Map(
            previousPatients.map(
              (item) => [
                item.id,
                item,
              ]
            )
          );

        if (!isFirstCycle)
        currentPatients.forEach(
          (current) => {
            const previous =
              previousPatientMap.get(
                current.id
              );

            if (!previous) {
              newEvents.push(
                createNotification(
                  "patient",
                  "CREATE",
                  current.name,
                  current.id
                )
              );

              return;
            }

            if (
              previous.fingerprint !==
              current.fingerprint
            ) {
              newEvents.push(
                createNotification(
                  "patient",
                  "UPDATE",
                  current.name,
                  current.id
                )
              );
            }
          }
        );

        previousPatients.forEach(
          (previous) => {
            if (
              !currentPatientMap.has(
                previous.id
              )
            ) {
              newEvents.push(
                createNotification(
                  "patient",
                  "DELETE",
                  previous.name,
                  previous.id
                )
              );
            }
          }
        );

        /* ---------------------------------------------------------------- */
        /* APPOINTMENT CREATE / UPDATE / DELETE                            */
        /* ---------------------------------------------------------------- */

        if (appointmentsFetched) {
        const previousAppointments =
          previousSnapshot.appointments;

        const currentAppointments =
          currentSnapshot.appointments;

        const currentAppointmentMap =
          new Map(
            currentAppointments.map(
              (item) => [
                item.id,
                item,
              ]
            )
          );

        const previousAppointmentMap =
          new Map(
            previousAppointments.map(
              (item) => [
                item.id,
                item,
              ]
            )
          );

        if (!isFirstCycle)
        currentAppointments.forEach(
          (current) => {
            const previous =
              previousAppointmentMap.get(
                current.id
              );

            if (!previous) {
              newEvents.push(
                createNotification(
                  "appointment",
                  "CREATE",
                  current.name,
                  current.id
                )
              );

              return;
            }

            if (
              previous.fingerprint !==
              current.fingerprint
            ) {
              newEvents.push(
                createNotification(
                  "appointment",
                  "UPDATE",
                  current.name,
                  current.id
                )
              );
            }
          }
        );

        previousAppointments.forEach(
          (previous) => {
            if (
              !currentAppointmentMap.has(
                previous.id
              )
            ) {
              newEvents.push(
                createNotification(
                  "appointment",
                  "DELETE",
                  previous.name,
                  previous.id
                )
              );
            }
          }
        );
        }

        /* ---------------------------------------------------------------- */
        /* SAVE NEW SNAPSHOT                                                */
        /* ---------------------------------------------------------------- */

        previousSnapshotRef.current =
          currentSnapshot;

        saveSnapshot(
          currentSnapshot
        );

        /* ---------------------------------------------------------------- */
        /* BUILD TODAY'S FULL CHANGE LIST FROM RECORD TIMESTAMPS            */
        /* ---------------------------------------------------------------- */

        const derivedItems: NotificationItem[] =
          [];

        safeEmployees.forEach(
          (employee: EmployeeRecord) => {
            const role =
              roleTypeToNotificationRole(
                employee.user_table
                  ?.role_type
              );

            const name =
              formatEmployeeName(
                employee
              ) || "Employee";

            const recordId = String(
              employee.employee_id ?? ""
            );

            pushDerivedItem(
              derivedItems,
              role,
              "CREATE",
              recordId,
              name,
              employee.user_table
                ?.created_at
            );

            pushDerivedItem(
              derivedItems,
              role,
              "UPDATE",
              recordId,
              name,
              (employee as any)
                .user_table
                ?.updated_at ||
                (employee as any)
                  .updated_at ||
                (employee as any)
                  .updatedAt
            );
          }
        );

        safePatients.forEach(
          (patient: PatientRecord) => {
            const name =
              formatPatientName(
                patient
              ) || "Patient";

            const recordId = String(
              patient.patient_id ?? ""
            );

            pushDerivedItem(
              derivedItems,
              "patient",
              "CREATE",
              recordId,
              name,
              patient.user_table
                ?.created_at
            );

            pushDerivedItem(
              derivedItems,
              "patient",
              "UPDATE",
              recordId,
              name,
              (patient as any)
                .user_table
                ?.updated_at ||
                (patient as any)
                  .updated_at ||
                (patient as any)
                  .updatedAt
            );
          }
        );

        safeAppointments.forEach(
          (
            appointment: GenericRecord,
            index: number
          ) => {
            const recordId =
              getRecordId(
                appointment,
                "appointment",
                index
              );

            const name =
              getGenericName(
                appointment,
                `Appointment #${recordId}`
              );

            pushDerivedItem(
              derivedItems,
              "appointment",
              "CREATE",
              recordId,
              name,
              appointment.created_at ||
                appointment.createdAt
            );

            pushDerivedItem(
              derivedItems,
              "appointment",
              "UPDATE",
              recordId,
              name,
              appointment.updated_at ||
                appointment.updatedAt
            );
          }
        );

        /* ---------------------------------------------------------------- */
        /* COMBINE: LIVE EVENTS + ALL OF TODAY'S CHANGES                    */
        /* ---------------------------------------------------------------- */

        setNotifications(
          (existing) => {
            /*
             * Keep everything already detected this
             * session (creates/updates/deletes) so a
             * notification never disappears on its own.
             * Occurrence ids are unique, so nothing
             * duplicates; fresher entries win below.
             */
            const combined = [
              ...existing,
              ...newEvents,
              ...derivedItems,
            ];

            const unique =
              Array.from(
                new Map(
                  combined.map(
                    (item) => [
                      item.id,
                      item,
                    ]
                  )
                ).values()
              );

            unique.sort(
              (a, b) =>
                b.createdAt -
                a.createdAt
            );

            /*
             * Drop live duplicates of changes that
             * record timestamps already cover
             * (same record, action and minute).
             */
            const derivedKeys =
              new Set(
                derivedItems.map(
                  (item) =>
                    `${item.role}|${item.action}|${item.recordId}|${Math.floor(
                      item.createdAt /
                        60000
                    )}`
                )
              );

            return unique.filter(
              (item) => {
                if (
                  dismissedIdsRef.current.has(
                    item.id
                  )
                ) {
                  return false;
                }

                if (
                  item.id.startsWith(
                    "event-"
                  ) &&
                  item.action !==
                    "DELETE" &&
                  derivedKeys.has(
                    `${item.role}|${item.action}|${item.recordId}|${Math.floor(
                      item.createdAt /
                        60000
                    )}`
                  )
                ) {
                  return false;
                }

                return true;
              }
            );
          }
        );

        setIsLoading(false);

        if (
          employeesFetched ||
          patientsFetched ||
          appointmentsFetched
        ) {
          /*
           * At least one source fed the cycle —
           * healthy. Reset the failure streak.
           */
          consecutiveFailuresRef.current = 0;
          setError(null);
        } else {
          /*
           * Every source failed this cycle — count
           * it so the banner still appears after
           * 3 consecutive dead cycles.
           */
          registerFailureCycle();
        }
      } catch (err) {
        console.error(
          "Notification fetch error:",
          err
        );

        registerFailureCycle(err);

        setIsLoading(false);
      }
    }, [fetchAppointments]);

  /* ------------------------------------------------------------------------ */
  /* FIRST FETCH                                                              */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  /*
   * Re-render every 30s so relative
   * times stay accurate.
   */
  useEffect(() => {
    const interval =
      window.setInterval(() => {
        setTimeTick(
          (tick) => tick + 1
        );
      }, 30000);

    return () => {
      window.clearInterval(
        interval
      );
    };
  }, []);

  /* ------------------------------------------------------------------------ */
  /* AUTOMATIC REFRESH                                                        */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    const interval =
      window.setInterval(() => {
        /*
         * Skip polls while the tab is hidden —
         * the next tick after returning refetches
         * everything missed.
         */
        if (document.hidden) {
          return;
        }

        fetchNotifications();
      }, POLLING_INTERVAL);

    return () => {
      window.clearInterval(
        interval
      );
    };
  }, [fetchNotifications]);

  /* ------------------------------------------------------------------------ */
  /* ACCOUNT ACTIVITY                                                         */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    const loadAccountActivity = () => {
      setAccountItems(
        getAccountActivity().map(
          accountActivityToNotification
        )
      );
    };

    loadAccountActivity();
    window.addEventListener(
      "account-activity-updated",
      loadAccountActivity
    );
    const onStorage = () => {
      loadAccountActivity();
    };
    window.addEventListener(
      "storage",
      onStorage
    );
    return () => {
      window.removeEventListener(
        "account-activity-updated",
        loadAccountActivity
      );
      window.removeEventListener(
        "storage",
        onStorage
      );
    };
  }, []);

  /* ------------------------------------------------------------------------ */
  /* MARK ALL READ                                                            */
  /* ------------------------------------------------------------------------ */

  const markAllAsRead =
    useCallback(() => {
      const now = Date.now();

      setLastSeenMs(now);

      saveLastSeen(now);
    }, []);

  /* ------------------------------------------------------------------------ */
  /* REMOVE                                                                   */
  /* ------------------------------------------------------------------------ */

  const removeNotification = useCallback(
    (id: string) => {
      dismissedIdsRef.current.add(
        id
      );

      saveDismissedIds(
        dismissedIdsRef.current
      );

      setNotifications(
        (items) =>
          items.filter(
            (item) =>
              item.id !== id
          )
      );
    },
    []
  );

  /* ------------------------------------------------------------------------ */
  /* CLEAR ALL                                                                */
  /* ------------------------------------------------------------------------ */

  const clearAll = useCallback(() => {
    notifications.forEach(
      (item) => {
        dismissedIdsRef.current.add(
          item.id
        );
      }
    );

    saveDismissedIds(
      dismissedIdsRef.current
    );

    setNotifications([]);

    const now = Date.now();

    setLastSeenMs(now);

    saveLastSeen(now);
  }, [notifications]);

  /* ------------------------------------------------------------------------ */
  /* GROUP                                                                    */
  /* ------------------------------------------------------------------------ */

  const {
    todayItems,
  } = useMemo(() => {
    const now = new Date();

    const allItems = [
      ...accountItems,
      ...notifications,
    ].sort(
      (a, b) =>
        b.createdAt -
        a.createdAt
    );

    /*
     * Only today's changes are shown.
     */
    const today =
      allItems.filter((item) =>
        isSameDay(
          new Date(
            item.createdAt
          ),
          now
        )
      );

    return {
      todayItems: today,
    };
  }, [accountItems, notifications]);

  /* ------------------------------------------------------------------------ */
  /* RENDER                                                                   */
  /* ------------------------------------------------------------------------ */

  const renderNotification =
    useCallback(
      (
        item: NotificationItem
      ) => {
        const unread =
          item.createdAt >
          lastSeenMs;

        return (
          <article
            key={item.id}
            className="relative flex gap-3 rounded-lg px-2 py-3 transition-colors"
          >
            {unread && (
              <span className="absolute left-0 top-5 h-2 w-2 rounded-full bg-[#003ec7]" />
            )}

            <Icon
              role={item.role}
            />

            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-start justify-between gap-3">
                <h3 className="truncate text-xs font-semibold tracking-[0.02em] text-[#131b2e]">
                  {item.title}
                </h3>

                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={[
                      "text-[11px] font-medium leading-[14px]",
                      unread
                        ? "text-[#003ec7]"
                        : "text-[#434656]",
                    ].join(" ")}
                  >
                    {timeAgo(item.createdAt)}
                  </span>

                  {unread && (
                    <span
                      aria-label="Unread indicator"
                      className="h-2 w-2 rounded-full bg-[#003ec7]"
                    />
                  )}

                  {item.role !== "account" && (
                    <button
                      type="button"
                      onClick={() =>
                        removeNotification(
                          item.id
                        )
                      }
                      aria-label="Delete notification"
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[#8a8fa3] transition-colors hover:bg-[#eef1f9] hover:text-[#434656] focus:outline-none focus:ring-2 focus:ring-[#003ec7]"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-3.5 w-3.5 fill-none stroke-current"
                        strokeWidth="2"
                      >
                        <path
                          d="M6 6l12 12M18 6L6 18"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              <p className="text-[13px] font-normal leading-[18px] text-[#434656]">
                {item.message}
              </p>
            </div>
          </article>
        );
      },
      [
        lastSeenMs,
        removeNotification,
      ]
    );

  const hasAny =
    todayItems.length > 0;

  /*
   * Persist detected events so the red dot
   * survives navigation and reloads until
   * the bell is clicked.
   */
  useEffect(() => {
    saveCachedItems(
      notifications
    );
  }, [notifications]);

  /*
   * Broadcast unread state so the header
   * bell can show/hide its dot. Anything newer
   * than the last-seen timestamp is unread.
   */
  useEffect(() => {
    const hasUnread = [
      ...accountItems,
      ...notifications,
    ].some(
      (item) =>
        item.createdAt > lastSeenMs
    );

    window.dispatchEvent(
      new CustomEvent(
        "hms-unread-changed",
        {
          detail: hasUnread,
        }
      )
    );
  }, [
    accountItems,
    notifications,
    lastSeenMs,
  ]);

  // Red dot only clears via explicit "Mark all read" or "Clear all" button clicks.

  /* ------------------------------------------------------------------------ */
  /* UI                                                                       */
  /* ------------------------------------------------------------------------ */

  return (
    <div className="w-full overflow-hidden rounded-xl bg-white">
      <header className="flex items-center justify-between border-b border-[#e5e7ef] bg-white px-5 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft size={16} />
            Back
          </button>
          <h1 className="text-base font-semibold tracking-[0.01em] text-[#131b2e]">
            Notifications
          </h1>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={
              markAllAsRead
            }
            className="text-xs font-semibold tracking-[0.02em] text-[#003ec7] transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-[#003ec7]"
          >
            Mark all as read
          </button>

          <button
            type="button"
            onClick={
              clearAll
            }
            disabled={
              notifications.length ===
              0
            }
            className="text-xs font-semibold tracking-[0.02em] text-[#93000a] transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-[#93000a] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Clear all
          </button>
        </div>
      </header>

      <main className="flex max-h-[420px] w-full flex-col gap-6 overflow-y-auto bg-[#f8fafc] p-4">
        {isLoading && (
          <p className="text-center text-xs text-[#434656]">
            Loading notifications...
          </p>
        )}

        {!isLoading &&
          error && (
            <p className="text-center text-xs text-[#93000a]">
              {error}
            </p>
          )}

        <FollowUpAlertSection
          portal={location.pathname.startsWith("/doctor/") ? "doctor" : "admin"}
        />

        {!isLoading &&
          !error &&
          !hasAny &&
          !hasFollowUps && (
            <p className="text-center text-xs text-[#434656]">
              No notifications yet.
            </p>
          )}

        {!isLoading &&
          todayItems.length >
            0 && (
            <section>
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-[#434656]">
                Today
              </h2>

              <div className="flex flex-col gap-1">
                {todayItems.map(
                  renderNotification
                )}
              </div>
            </section>
          )}

      </main>
    </div>
  );
}