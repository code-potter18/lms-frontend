import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  ReactNode,
} from "react";
import { doctorDashboardApi, DoctorNotificationItem } from "@/api/doctorDashboard.api";
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
import { getUser, getToken } from "@/utils/token";
import { getAccountActivity, type AccountActivity } from "@/utils/accountActivity";

const DISMISSED_NOTIFICATIONS_KEY = "hms_dismissed_notifications_global";
const LAST_SEEN_KEY = "hms_notifications_last_seen_global";
const EVENT_CACHE_KEY = "hms_notification_events_global_v1";
const NOTIFICATION_SNAPSHOT_KEY = "hms_notification_snapshot_global_v2";
const POLLING_INTERVAL = 30000;

const NOTIFICATION_ROLES = [
  "doctor",
  "staff",
  "admin",
  "patient",
  "appointment",
  "account",
  "booking",
  "checkin",
] as const;

type NotificationRole = (typeof NOTIFICATION_ROLES)[number];

type NotificationAction = "CREATE" | "UPDATE" | "DELETE";

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
  source?: "doctor" | "system";
};

type GenericRecord = Record<string, any>;

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

let cachedFeedBranchIds: string[] | null | undefined;

const getMappedBranchIds = async (): Promise<string[] | null> => {
  if (cachedFeedBranchIds !== undefined) {
    return cachedFeedBranchIds;
  }
  try {
    const me = await employeeApi.getMe();
    const mapped = (me.data?.data?.branches ?? []).map(
      (b: { branch_id?: string | null }) => b?.branch_id
    ).filter((id: string | null | undefined): id is string => Boolean(id));
    cachedFeedBranchIds = Array.from(new Set(mapped));
  } catch {
    return null;
  }
  return cachedFeedBranchIds;
};

const resolveFeedBranchIds = async (): Promise<string[]> => {
  const selected = getActiveBranchId();
  if (selected) {
    const mapped = await getMappedBranchIds();
    if (!mapped || mapped.length === 0 || mapped.includes(selected)) {
      return [selected];
    }
    return mapped;
  }
  const mapped = await getMappedBranchIds();
  if (mapped && mapped.length > 0) {
    return mapped;
  }
  const loginBranchId = getUser()?.branch_id;
  if (loginBranchId) {
    return [loginBranchId];
  }
  return [];
};

const fetchAcrossBranches = async <T, R extends { id?: unknown }>(
  branchIds: string[],
  call: (branchId: string | undefined) => Promise<T>,
  extract: (res: T) => R[]
): Promise<R[] | null> => {
  if (branchIds.length <= 1) {
    try {
      const res = await call(branchIds[0]);
      return extract(res);
    } catch {
      return null;
    }
  }
  const perBranch = await Promise.all(
    branchIds.map((branchId) =>
      call(branchId)
        .then((res) => ({ ok: true as const, list: extract(res) }))
        .catch(() => ({ ok: false as const, list: [] as R[] }))
    )
  );
  if (!perBranch.some((attempt) => attempt.ok)) {
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

function loadDismissedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_NOTIFICATIONS_KEY);
    return raw ? new Set<string>(JSON.parse(raw)) : new Set<string>();
  } catch {
    return new Set<string>();
  }
}

function saveDismissedIds(ids: Set<string>) {
  try {
    localStorage.setItem(DISMISSED_NOTIFICATIONS_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // ignore
  }
}

function loadLastSeen(): number {
  try {
    const raw = localStorage.getItem(LAST_SEEN_KEY);
    const value = raw ? Number(raw) : 0;
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function saveLastSeen(timestamp: number) {
  try {
    localStorage.setItem(LAST_SEEN_KEY, String(timestamp));
  } catch {
    // ignore
  }
}

function loadCachedItems(): NotificationItem[] {
  try {
    const raw = localStorage.getItem(EVENT_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const now = new Date();
    return parsed.filter(
      (item) =>
        item &&
        typeof item.id === "string" &&
        typeof item.createdAt === "number" &&
        typeof item.title === "string" &&
        isSameDay(new Date(item.createdAt), now)
    );
  } catch {
    return [];
  }
}

function saveCachedItems(items: NotificationItem[]) {
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
        source: item.source,
      }));
    localStorage.setItem(EVENT_CACHE_KEY, JSON.stringify(capped));
  } catch {
    // ignore
  }
}

function loadSnapshot(): StoredSnapshot | null {
  try {
    const raw = localStorage.getItem(NOTIFICATION_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      employees: Array.isArray(parsed?.employees) ? parsed.employees : [],
      patients: Array.isArray(parsed?.patients) ? parsed.patients : [],
      appointments: Array.isArray(parsed?.appointments) ? parsed.appointments : [],
    };
  } catch {
    return null;
  }
}

function saveSnapshot(snapshot: StoredSnapshot) {
  try {
    localStorage.setItem(NOTIFICATION_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore
  }
}

const ROLE_TITLES: Record<NotificationRole, string> = {
  doctor: "New Doctor Added",
  staff: "New Staff Added",
  admin: "New Admin Added",
  patient: "New Patient Registered",
  appointment: "New Appointment Created",
  account: "Account Updated",
  booking: "New Booking",
  checkin: "Patient Check-in",
};

function roleTypeToNotificationRole(roleType?: string | null): NotificationRole {
  const normalized = (roleType || "").toUpperCase().replace(/[\s-]/g, "_");
  if (normalized === "DOCTOR") return "doctor";
  if (
    normalized === "BRANCH_ADMIN" ||
    normalized === "ADMIN" ||
    normalized === "ADMINISTRATOR"
  ) {
    return "admin";
  }
  return "staff";
}

function formatEmployeeName(e: EmployeeRecord) {
  return [e.first_name, e.middle_name, e.last_name].filter(Boolean).join(" ");
}

function formatPatientName(p: PatientRecord) {
  return [p.patient_first_name, p.patient_middle_name, p.patient_last_name].filter(Boolean).join(" ");
}

function getGenericName(item: GenericRecord, fallback: string) {
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
  if (directName) return String(directName);
  const first = item.first_name || item.firstName || item.patient_first_name || item.patientFirstName || "";
  const middle = item.middle_name || item.middleName || item.patient_middle_name || item.patientMiddleName || "";
  const last = item.last_name || item.lastName || item.patient_last_name || item.patientLastName || "";
  const name = [first, middle, last].filter(Boolean).join(" ");
  return name || fallback;
}

function timeAgo(timestamp: number) {
  const diffMs = Date.now() - timestamp;
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));
  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function extractArray(response: any, possibleKeys: string[]): GenericRecord[] {
  if (Array.isArray(response)) return response;
  const candidates = [response?.data, response?.data?.data, response?.data?.data?.data, response];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
    if (candidate && typeof candidate === "object") {
      for (const key of possibleKeys) {
        if (Array.isArray(candidate[key])) return candidate[key];
      }
    }
  }
  return [];
}

function getRecordId(item: GenericRecord, type: string, index: number): string {
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
  const found = possibleIds.find((value) => value !== undefined && value !== null && value !== "");
  if (found !== undefined) return String(found);
  return `${type}-${index}`;
}

function createFingerprint(item: GenericRecord): string {
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
        if (value !== undefined && typeof value !== "function") {
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

function buildEmployeeSnapshot(employees: EmployeeRecord[]): StoredRecord[] {
  return employees.map((employee, index) => {
    const id = getRecordId(employee as any, "employee", index);
    const role = roleTypeToNotificationRole(employee.user_table?.role_type);
    const name = formatEmployeeName(employee) || (role === "doctor" ? "Doctor" : role === "admin" ? "Admin" : "Staff");
    return { id, fingerprint: createFingerprint(employee as any), name };
  });
}

function buildPatientSnapshot(patients: PatientRecord[]): StoredRecord[] {
  return patients.map((patient, index) => {
    const id = getRecordId(patient as any, "patient", index);
    const name = formatPatientName(patient) || "Patient";
    return { id, fingerprint: createFingerprint(patient as any), name };
  });
}

function buildAppointmentSnapshot(appointments: GenericRecord[]): StoredRecord[] {
  return appointments.map((appointment, index) => {
    const id = getRecordId(appointment, "appointment", index);
    const name = getGenericName(appointment, `Appointment #${id}`);
    return { id, fingerprint: createFingerprint(appointment), name };
  });
}

function getEmployeeRole(employee: GenericRecord): NotificationRole {
  return roleTypeToNotificationRole(
    employee?.user_table?.role_type || employee?.role_type || employee?.roleType || employee?.role
  );
}

function createNotification(
  role: NotificationRole,
  action: NotificationAction,
  name: string,
  recordId: string,
  source: "doctor" | "system" = "system"
): NotificationItem {
  let title = "";
  let message = "";
  if (action === "CREATE") {
    title = ROLE_TITLES[role] || "New Item Created";
    message = `${name} was created.`;
  } else if (action === "UPDATE") {
    title = `${role.charAt(0).toUpperCase() + role.slice(1)} Updated`;
    message = `${name} was updated.`;
  } else if (action === "DELETE") {
    title = `${role.charAt(0).toUpperCase() + role.slice(1)} Deleted`;
    message = `${name} was deleted.`;
  }
  const createdAt = Date.now();
  return {
    id: `event-${role}-${action}-${recordId}-${createdAt}`,
    title,
    message,
    time: "Just now",
    createdAt,
    role,
    action,
    recordId,
    source,
  };
}

function pushDerivedItem(
  items: NotificationItem[],
  role: NotificationRole,
  action: NotificationAction,
  recordId: string,
  name: string,
  timestampStr?: string | null
) {
  if (!timestampStr || !recordId) return;
  const timestamp = new Date(timestampStr).getTime();
  if (Number.isNaN(timestamp) || !isSameDay(new Date(timestamp), new Date())) return;
  const item = createNotification(role, action, name, recordId);
  item.id = `derived-${role}-${action}-${recordId}-${timestamp}`;
  item.createdAt = timestamp;
  items.push(item);
}

function accountActivityToNotification(activity: AccountActivity): NotificationItem {
  return {
    id: `account-${activity.id}`,
    title: activity.title,
    message: activity.message,
    time: timeAgo(activity.createdAt),
    createdAt: activity.createdAt,
    role: "account",
    action: "UPDATE",
    source: "system",
  };
}

function doctorNotificationToItem(notif: DoctorNotificationItem): NotificationItem {
  const patient = notif.appointment_history?.patient_bio_data;
  const patientName = [patient?.patient_first_name, patient?.patient_middle_name, patient?.patient_last_name].filter(Boolean).join(" ") || "Patient";
  const notifType = notif.notification_type;
  const role: NotificationRole = notifType === "BOOKING" ? "booking" : "checkin";
  const action: NotificationAction = "CREATE";
  const title = notifType === "BOOKING" ? "New Appointment Booked" : "Patient Checked In";
  const message = `${patientName} - ${notifType === "BOOKING" ? "Booked" : "Checked in"} for ${notif.appointment_history?.appointment_date}`;
  const createdAt = new Date(notif.created_at).getTime();
  return {
    id: `doctor-${notif.notification_id}`,
    title,
    message,
    time: timeAgo(createdAt),
    createdAt,
    role,
    action,
    recordId: notif.notification_id,
    source: "doctor",
  };
}

interface NotificationContextValue {
  notifications: NotificationItem[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  markAllAsRead: () => void;
  clearAll: () => void;
  removeNotification: (id: string) => void;
  refetch: () => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return ctx;
}

interface NotificationProviderProps {
  children: ReactNode;
  employeeId?: string | null;
}

export function NotificationProvider({ children, employeeId }: NotificationProviderProps) {
  const [notifications, setNotifications] = useState<NotificationItem[]>(loadCachedItems);
  const [accountItems, setAccountItems] = useState<NotificationItem[]>([]);
  const [lastSeenMs, setLastSeenMs] = useState<number>(loadLastSeen);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const dismissedIdsRef = useRef<Set<string>>(loadDismissedIds());
  const previousSnapshotRef = useRef<StoredSnapshot | null>(loadSnapshot());
  const consecutiveFailuresRef = useRef<number>(0);
  const employeeIdRef = useRef(employeeId);
  employeeIdRef.current = employeeId;
  const lastMetaRef = useRef<{ empTotal: number; patTotal: number }>({ empTotal: -1, patTotal: -1 });
  const lastEmployeesRef = useRef<EmployeeRecord[]>([]);
  const lastPatientsRef = useRef<PatientRecord[]>([]);

  useEffect(() => {
    dismissedIdsRef.current = loadDismissedIds();
  }, []);

  const fetchAppointmentsForBranch = useCallback(async (feedBranchId?: string): Promise<GenericRecord[]> => {
    try {
      const firstPage = await appointmentApi.getAll({
        limit: 50,
        page: 1,
        sortBy: "created_at",
        sortOrder: "desc",
        ...(feedBranchId ? { branchId: feedBranchId } : {}),
      });
      return extractArray(firstPage, ["appointments", "appointment", "data", "results"]);
    } catch {
      return [];
    }
  }, []);

  const fetchAppointments = useCallback(async (feedBranchIds: string[]): Promise<GenericRecord[] | null> => {
    try {
      if (feedBranchIds.length <= 1) {
        return await fetchAppointmentsForBranch(feedBranchIds[0]);
      }
      const perBranch = await Promise.all(
        feedBranchIds.map((branchId) => fetchAppointmentsForBranch(branchId).catch(() => []))
      );
      return perBranch.flat();
    } catch {
      return null;
    }
  }, [fetchAppointmentsForBranch]);

  const fetchDoctorNotifications = useCallback(async (): Promise<NotificationItem[]> => {
    const empId = employeeIdRef.current;
    if (!empId) return [];
    try {
      const res = await doctorDashboardApi.getNotifications(empId);
      const doctorNotifs = res.data?.data?.notifications ?? [];
      return doctorNotifs.map(doctorNotificationToItem);
    } catch {
      return [];
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setIsLoading(false);
      return;
    }
    setError(null);
    const registerFailureCycle = (err?: any) => {
      consecutiveFailuresRef.current += 1;
      if (consecutiveFailuresRef.current >= 3) {
        const status = err?.response?.status;
        const serverMessage = err?.response?.data?.message;
        setError(
          serverMessage
            ? `Couldn't load notifications${status ? ` (${status})` : ""}: ${serverMessage}`
            : "Couldn't load notifications from the server."
        );
      }
    };

    try {
      const feedBranchIds = await resolveFeedBranchIds();

      // Lightweight probe: check totals before downloading full payload
      const isInitial = previousSnapshotRef.current === null;
      const [empHead, patHead] = await Promise.all([
        employeeApi.getAll({ limit: 1 }).catch(() => null),
        patientApi.getAll({ limit: 1 }).catch(() => null),
      ]);
      const empTotal = empHead?.data?.data?.total ?? 0;
      const patTotal = patHead?.data?.data?.total ?? 0;
      const empChanged = isInitial || empTotal !== lastMetaRef.current.empTotal;
      const patChanged = isInitial || patTotal !== lastMetaRef.current.patTotal;

      let employees = lastEmployeesRef.current;
      let patients = lastPatientsRef.current;

      if (empChanged) {
        const employeesRes = await employeeApi.getAll({ limit: 100 }).catch(() => null);
        if (employeesRes) {
          employees = (employeesRes.data?.data?.employees ?? []) as any[];
          lastEmployeesRef.current = employees;
          lastMetaRef.current.empTotal = empTotal;
        }
      }

      if (patChanged) {
        const patientsRes = await patientApi.getAll({ limit: 100 }).catch(() => null);
        if (patientsRes) {
          patients = (patientsRes.data?.data?.patients ?? []) as any[];
          lastPatientsRef.current = patients;
          lastMetaRef.current.patTotal = patTotal;
        }
      }

      const [appointments, doctorNotifs] = await Promise.all([
        fetchAppointments(feedBranchIds),
        fetchDoctorNotifications(),
      ]);
      const [employeesFinal, patientsFinal, appointmentsFinal, doctorNotifsFinal] = [employees, patients, appointments, doctorNotifs];
      const [employeesFinal2, patientsFinal2, appointmentsFinal2, doctorNotifsFinal2] = [employees, patients, appointments, doctorNotifs];

      const appointmentsFetched = appointments !== null;
      const safeAppointments = appointments ?? [];
      const employeesFetched = employees !== null;
      const safeEmployees = employees ?? [];
      const patientsFetched = patients !== null;
      const safePatients = patients ?? [];

      const isFirstCycle = previousSnapshotRef.current === null;
      const previousSnapshot = previousSnapshotRef.current ?? { employees: [], patients: [], appointments: [] };

      const currentSnapshot: StoredSnapshot = {
        employees: employeesFetched ? buildEmployeeSnapshot(safeEmployees) : previousSnapshot?.employees ?? [],
        patients: patientsFetched ? buildPatientSnapshot(safePatients) : previousSnapshot?.patients ?? [],
        appointments: appointmentsFetched ? buildAppointmentSnapshot(safeAppointments) : previousSnapshot?.appointments ?? [],
      };

      const newEvents: NotificationItem[] = [];

      const previousEmployees = previousSnapshot.employees;
      const currentEmployees = currentSnapshot.employees;
      const currentEmployeeMap = new Map(currentEmployees.map((item) => [item.id, item]));
      const previousEmployeeMap = new Map(previousEmployees.map((item) => [item.id, item]));

      if (!isFirstCycle) {
        currentEmployees.forEach((current) => {
          const previous = previousEmployeeMap.get(current.id);
          if (!previous) {
            const employee = safeEmployees.find(
              (e: EmployeeRecord, index: number) => getRecordId(e as any, "employee", index) === current.id
            );
            const role = employee ? getEmployeeRole(employee as any) : "staff";
            newEvents.push(createNotification(role, "CREATE", current.name, current.id));
            return;
          }
          if (previous.fingerprint !== current.fingerprint) {
            const employee = safeEmployees.find(
              (e: EmployeeRecord, index: number) => getRecordId(e as any, "employee", index) === current.id
            );
            const role = employee ? getEmployeeRole(employee as any) : "staff";
            newEvents.push(createNotification(role, "UPDATE", current.name, current.id));
          }
        });
      }

      previousEmployees.forEach((previous) => {
        if (!currentEmployeeMap.has(previous.id)) {
          let role: NotificationRole | null = null;
          try {
            const parsed = JSON.parse(previous.fingerprint);
            role = roleTypeToNotificationRole(parsed?.user_table?.role_type || parsed?.role_type || parsed?.role);
          } catch {
            // fallback
          }
          if (!role || role === "appointment" || role === "patient") role = "staff";
          newEvents.push(createNotification(role, "DELETE", previous.name, previous.id));
        }
      });

      const previousPatients = previousSnapshot.patients;
      const currentPatients = currentSnapshot.patients;
      const currentPatientMap = new Map(currentPatients.map((item) => [item.id, item]));
      const previousPatientMap = new Map(previousPatients.map((item) => [item.id, item]));

      if (!isFirstCycle) {
        currentPatients.forEach((current) => {
          const previous = previousPatientMap.get(current.id);
          if (!previous) {
            newEvents.push(createNotification("patient", "CREATE", current.name, current.id));
            return;
          }
          if (previous.fingerprint !== current.fingerprint) {
            newEvents.push(createNotification("patient", "UPDATE", current.name, current.id));
          }
        });
      }

      previousPatients.forEach((previous) => {
        if (!currentPatientMap.has(previous.id)) {
          newEvents.push(createNotification("patient", "DELETE", previous.name, previous.id));
        }
      });

      if (appointmentsFetched) {
        const previousAppointments = previousSnapshot.appointments;
        const currentAppointments = currentSnapshot.appointments;
        const currentAppointmentMap = new Map(currentAppointments.map((item) => [item.id, item]));
        const previousAppointmentMap = new Map(previousAppointments.map((item) => [item.id, item]));

        if (!isFirstCycle) {
          currentAppointments.forEach((current) => {
            const previous = previousAppointmentMap.get(current.id);
            if (!previous) {
              newEvents.push(createNotification("appointment", "CREATE", current.name, current.id));
              return;
            }
            if (previous.fingerprint !== current.fingerprint) {
              newEvents.push(createNotification("appointment", "UPDATE", current.name, current.id));
            }
          });
        }

        previousAppointments.forEach((previous) => {
          if (!currentAppointmentMap.has(previous.id)) {
            newEvents.push(createNotification("appointment", "DELETE", previous.name, previous.id));
          }
        });
      }

      previousSnapshotRef.current = currentSnapshot;
      saveSnapshot(currentSnapshot);

      const derivedItems: NotificationItem[] = [];

      safeEmployees.forEach((employee: EmployeeRecord) => {
        const role = roleTypeToNotificationRole(employee.user_table?.role_type);
        const name = formatEmployeeName(employee) || "Employee";
        const recordId = String(employee.employee_id ?? "");
        pushDerivedItem(derivedItems, role, "CREATE", recordId, name, employee.user_table?.created_at);
        pushDerivedItem(derivedItems, role, "UPDATE", recordId, name, (employee as any).user_table?.updated_at || (employee as any).updated_at || (employee as any).updatedAt);
      });

      safePatients.forEach((patient: PatientRecord) => {
        const name = formatPatientName(patient) || "Patient";
        const recordId = String(patient.patient_id ?? "");
        pushDerivedItem(derivedItems, "patient", "CREATE", recordId, name, patient.user_table?.created_at);
        pushDerivedItem(derivedItems, "patient", "UPDATE", recordId, name, (patient as any).user_table?.updated_at || (patient as any).updated_at || (patient as any).updatedAt);
      });

      safeAppointments.forEach((appointment: GenericRecord, index: number) => {
        const recordId = getRecordId(appointment, "appointment", index);
        const name = getGenericName(appointment, `Appointment #${recordId}`);
        pushDerivedItem(derivedItems, "appointment", "CREATE", recordId, name, appointment.created_at || appointment.createdAt);
        pushDerivedItem(derivedItems, "appointment", "UPDATE", recordId, name, appointment.updated_at || appointment.updatedAt);
      });

      setNotifications((existing) => {
        const combined = [...existing, ...newEvents, ...doctorNotifs, ...derivedItems];
        const unique = Array.from(new Map(combined.map((item) => [item.id, item])).values());
        unique.sort((a, b) => b.createdAt - a.createdAt);
        const derivedKeys = new Set(
          derivedItems.map((item) => `${item.role}|${item.action}|${item.recordId}|${Math.floor(item.createdAt / 60000)}`)
        );
        return unique.filter((item) => {
          if (dismissedIdsRef.current.has(item.id)) return false;
          if (item.id.startsWith("event-") && item.action !== "DELETE" && derivedKeys.has(`${item.role}|${item.action}|${item.recordId}|${Math.floor(item.createdAt / 60000)}`)) {
            return false;
          }
          return true;
        });
      });

      setIsLoading(false);

      if (employeesFetched || patientsFetched || appointmentsFetched || doctorNotifs.length > 0) {
        consecutiveFailuresRef.current = 0;
        setError(null);
      } else {
        registerFailureCycle();
      }
    } catch (err) {
      console.error("Notification fetch error:", err);
      registerFailureCycle(err);
      setIsLoading(false);
    }
  }, [fetchAppointments, fetchDoctorNotifications]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.hidden) return;
      fetchNotifications();
    }, POLLING_INTERVAL);
    return () => window.clearInterval(interval);
  }, [fetchNotifications]);

  useEffect(() => {
    const loadAccountActivity = () => {
      setAccountItems(getAccountActivity().map(accountActivityToNotification));
    };
    loadAccountActivity();
    window.addEventListener("account-activity-updated", loadAccountActivity);
    const onStorage = () => loadAccountActivity();
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("account-activity-updated", loadAccountActivity);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const markAllAsRead = useCallback(() => {
    const now = Date.now();
    setLastSeenMs(now);
    saveLastSeen(now);
    window.dispatchEvent(new CustomEvent("hms-unread-changed", { detail: false }));
  }, []);

  const removeNotification = useCallback((id: string) => {
    dismissedIdsRef.current.add(id);
    saveDismissedIds(dismissedIdsRef.current);
    setNotifications((items) => items.filter((item) => item.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    notifications.forEach((item) => dismissedIdsRef.current.add(item.id));
    accountItems.forEach((item) => dismissedIdsRef.current.add(item.id));
    saveDismissedIds(dismissedIdsRef.current);
    setNotifications([]);
    setAccountItems([]);
    const now = Date.now();
    setLastSeenMs(now);
    saveLastSeen(now);
    window.dispatchEvent(new CustomEvent("hms-unread-changed", { detail: false }));
  }, [notifications, accountItems]);

  const { todayItems, allItems } = useMemo(() => {
    const now = new Date();
    const all = [...accountItems, ...notifications].sort((a, b) => b.createdAt - a.createdAt);
    const today = all.filter((item) => isSameDay(new Date(item.createdAt), now));
    return { todayItems: today, allItems: all };
  }, [accountItems, notifications]);

  const unreadCount = useMemo(() => {
    return [...accountItems, ...notifications].filter((item) => item.createdAt > lastSeenMs).length;
  }, [accountItems, notifications, lastSeenMs]);

  useEffect(() => {
    saveCachedItems(notifications);
  }, [notifications]);

  useEffect(() => {
    const hasUnread = [...accountItems, ...notifications].some((item) => item.createdAt > lastSeenMs);
    window.dispatchEvent(new CustomEvent("hms-unread-changed", { detail: hasUnread }));
  }, [accountItems, notifications, lastSeenMs]);

  // Red dot only clears via explicit "Mark all read" or "Clear all" button clicks.

  const value = useMemo(
    () => ({
      notifications: todayItems,
      allNotifications: allItems,
      unreadCount,
      isLoading,
      error,
      markAllAsRead,
      clearAll,
      removeNotification,
      refetch: fetchNotifications,
    }),
    [todayItems, allItems, unreadCount, isLoading, error, markAllAsRead, clearAll, removeNotification, fetchNotifications]
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}