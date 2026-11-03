import API from "./axios";

/* Follow-up due alerts: a visit's follow-up date asks the staff of the
   patient's branch to book the follow-up appointment - from the consult day
   the doctor assigned it, for 30 days (the backend calculates them; nothing
   is stored except each user's read / dismissed marks). */

export type FollowUpDueStatus = "UPCOMING" | "DUE_TOMORROW" | "DUE_TODAY" | "OVERDUE";

export interface FollowUpAlert {
  encounter_no: string;
  /* YYYY-MM-DD */
  follow_up_date: string;
  visit_date: string | null;
  due_status: FollowUpDueStatus;
  days_until: number;
  days_overdue: number;
  /* The last day the alert is shown. */
  expires_on: string;
  patient: {
    patient_id: string;
    name: string;
    gender: string | null;
    age: number | null;
    mobile: string | null;
  };
  doctor: {
    employee_id: string;
    name: string;
    specialization: string | null;
    mobile: string | null;
  } | null;
  branch: { branch_id: string; branch_name: string | null };
  department: { department_id: string; department_name: string | null } | null;
  /* The patient's later appointment, once booked. */
  booked: { appointment_id: string; appointment_date: string; status: string | null } | null;
  read: boolean;
}

export interface FollowUpAlertList {
  alerts: FollowUpAlert[];
  /* Pending (not booked) alerts the user has not read. */
  unreadCount: number;
  window_days: number;
}

export const followUpAlertApi = {
  /* The signed-in user's branches (all branches for Head / Super Admin;
     branchId narrows to one). */
  getAlerts: (branchId?: string | null) =>
    API.get<{ success: boolean; message: string; data: FollowUpAlertList }>(
      "/follow-ups/alerts",
      { params: branchId ? { branchId } : {}, skipBranchScope: true } as any
    ),
  markRead: (encounterNos: string[] | "all") =>
    API.put<{ success: boolean; message: string; data: { updated: number } }>(
      "/follow-ups/alerts/read",
      encounterNos === "all" ? { all: true } : { encounter_nos: encounterNos }
    ),
  dismiss: (encounterNo: string) =>
    API.put<{ success: boolean; message: string; data: { encounter_no: string } }>(
      `/follow-ups/alerts/${encodeURIComponent(encounterNo)}/dismiss`
    ),
};
