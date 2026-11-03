import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { followUpAlertApi, type FollowUpAlert } from "@/api/followUpAlert.api";
import { getActiveBranchId } from "@/api/axios";
import { getUser } from "@/utils/token";
import { useLocation } from "react-router-dom";

/* Follow-up due alerts of the signed-in user (their branches; every branch
   for Head / Super Admin), refreshed every minute while the tab is visible. */

const POLL_MS = 60_000;

/* Roles that get follow-up alerts ("ADMIN" is the Staff Admin). */
export const FOLLOW_UP_ALERT_ROLES = [
  "DOCTOR",
  "NURSE",
  "RECEPTIONIST",
  "ADMIN",
  "BRANCH_ADMIN",
  "HEAD_ADMIN",
  "SUPER_ADMIN",
];

const currentRole = () => {
  const user = getUser() as { role?: string; role_type?: string } | null;
  return String(user?.role_type || user?.role || "").toUpperCase();
};

interface FollowUpAlertContextValue {
  enabled: boolean;
  alerts: FollowUpAlert[];
  unreadCount: number;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  markRead: (encounterNos: string[] | "all") => Promise<void>;
  dismiss: (encounterNo: string) => Promise<void>;
}

const FollowUpAlertContext = createContext<FollowUpAlertContextValue | null>(null);

export const FollowUpAlertProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [alerts, setAlerts] = useState<FollowUpAlert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [role, setRole] = useState(currentRole);
  const enabled = FOLLOW_UP_ALERT_ROLES.includes(role);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    const latestRole = currentRole();
    setRole(latestRole);
    if (!FOLLOW_UP_ALERT_ROLES.includes(latestRole) || inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const response = await followUpAlertApi.getAlerts(getActiveBranchId());
      const data = response.data.data;
      setAlerts(data?.alerts ?? []);
      setUnreadCount(data?.unreadCount ?? 0);
      setError("");
    } catch (err: any) {
      setError(err?.response?.data?.message || "Couldn't load follow-up alerts.");
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  /* Mounted before sign-in: start (or stop) as soon as the role changes. */
  const location = useLocation();
  useEffect(() => {
    if (currentRole() !== role) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const markRead = useCallback(async (encounterNos: string[] | "all") => {
    const ids = encounterNos === "all"
      ? alerts.filter((alert) => !alert.read).map((alert) => alert.encounter_no)
      : encounterNos;
    if (ids.length === 0) return;
    setAlerts((prev) => prev.map((alert) => (ids.includes(alert.encounter_no) ? { ...alert, read: true } : alert)));
    setUnreadCount((prev) =>
      Math.max(0, prev - alerts.filter((alert) => ids.includes(alert.encounter_no) && !alert.read && !alert.booked).length)
    );
    try {
      await followUpAlertApi.markRead(encounterNos === "all" ? "all" : ids);
    } catch (err) {
      console.error("Failed to mark follow-up alerts as read:", err);
      void refresh();
    }
  }, [alerts, refresh]);

  const dismiss = useCallback(async (encounterNo: string) => {
    const target = alerts.find((alert) => alert.encounter_no === encounterNo);
    setAlerts((prev) => prev.filter((alert) => alert.encounter_no !== encounterNo));
    if (target && !target.read && !target.booked) setUnreadCount((prev) => Math.max(0, prev - 1));
    try {
      await followUpAlertApi.dismiss(encounterNo);
    } catch (err) {
      console.error("Failed to dismiss the follow-up alert:", err);
      void refresh();
    }
  }, [alerts, refresh]);

  return (
    <FollowUpAlertContext.Provider value={{ enabled, alerts, unreadCount, loading, error, refresh, markRead, dismiss }}>
      {children}
    </FollowUpAlertContext.Provider>
  );
};

export const useFollowUpAlerts = () => {
  const context = useContext(FollowUpAlertContext);
  if (!context) throw new Error("useFollowUpAlerts must be used inside FollowUpAlertProvider");
  return context;
};
