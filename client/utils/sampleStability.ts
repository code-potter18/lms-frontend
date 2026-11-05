import { useState, useEffect } from "react";

export type SampleUrgencyLevel =
  | "NOT_COLLECTED"
  | "COMPLETED"
  | "EXPIRED"
  | "CRITICAL" // < 30m remaining
  | "WARNING"  // 30m - 60m remaining
  | "SAFE";    // > 60m remaining

export interface SampleStabilityInfo {
  collectionTime: Date | null;
  formattedCollectionTime: string;
  deadlineTime: Date | null;
  formattedDeadlineTime: string;
  remainingMinutes: number;
  isExpired: boolean;
  isExpiringSoon: boolean;
  isCollected: boolean;
  urgencyLevel: SampleUrgencyLevel;
  badgeLabel: string;
  badgeClasses: string;
  dotClasses: string;
  stabilityHours: number;
}

/**
 * Determines the clinical stability window in hours.
 * Clinical standards:
 * - Arterial Blood Gas (ABG): 0.5 - 1 hr
 * - Coagulation (PT/INR): 2 hrs
 * - Unseparated Blood Glucose / Potassium / Electrolytes: 2 hrs
 * - Urine routine / microscopic: 2 hrs
 * - STAT / Emergency priority: 1 hr
 * - Standard default: 2 hrs after sample collection (phlebotomy draw time)
 */
export function resolveStabilityHours(
  testName?: string,
  sampleType?: string,
  tatHours?: number | string | null,
  priority?: string | null
): number {
  const p = (priority || "").toLowerCase();
  if (p === "stat" || p === "emergency") return 1;

  const t = (testName || "").toLowerCase();
  const s = (sampleType || "").toLowerCase();

  if (t.includes("abg") || t.includes("blood gas")) return 1;
  if (t.includes("pt") || t.includes("inr") || t.includes("prothrombin") || t.includes("coagulation")) return 2;
  if (t.includes("glucose") || t.includes("sugar") || t.includes("rbs") || t.includes("fbs")) return 2;
  if (t.includes("potassium") || t.includes("electrolyte") || t.includes("k+")) return 2;
  if (t.includes("urine") || s.includes("urine")) return 2;
  if (t.includes("cbc") || t.includes("blood count")) return 2;

  const numTat = Number(tatHours);
  if (!Number.isNaN(numTat) && numTat > 0 && numTat <= 4) {
    return numTat;
  }

  // Default standard 2-hour processing window post-collection
  return 2;
}

/**
 * Parses any ISO, date-time string or timestamp into a valid Date.
 */
export function parseDateSafe(input?: string | Date | null): Date | null {
  if (!input) return null;
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;

  const d = new Date(input);
  if (!isNaN(d.getTime())) return d;

  // Handle DD/MM/YYYY or DD-MM-YYYY formats if needed
  const parts = String(input).match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (parts) {
    const day = parseInt(parts[1], 10);
    const month = parseInt(parts[2], 10) - 1;
    let year = parseInt(parts[3], 10);
    if (year < 100) year += 2000;
    const hour = parts[4] ? parseInt(parts[4], 10) : 0;
    const min = parts[5] ? parseInt(parts[5], 10) : 0;
    const sec = parts[6] ? parseInt(parts[6], 10) : 0;
    const parsed = new Date(year, month, day, hour, min, sec);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

/**
 * Calculates real-time sample stability, countdown, and urgency tier.
 * NOTE: The timer for sample expiry starts strictly AFTER THE SAMPLE IS COLLECTED.
 * If the sample is not yet collected, the countdown does NOT start.
 */
export function calculateSampleStability(
  collectionTimeInput?: string | Date | null,
  stabilityHours: number = 2,
  status?: string,
  nowTime: number = Date.now(),
  isCollected: boolean = true
): SampleStabilityInfo {
  const isCompleted =
    (status || "").toUpperCase() === "COMPLETED" ||
    (status || "").toUpperCase() === "VERIFIED_COMPLETED";

  // If the sample is NOT yet collected from the patient, the timer must NOT begin!
  if (!isCollected || !collectionTimeInput) {
    return {
      collectionTime: null,
      formattedCollectionTime: "—",
      deadlineTime: null,
      formattedDeadlineTime: "—",
      remainingMinutes: 9999,
      isExpired: false,
      isExpiringSoon: false,
      isCollected: false,
      urgencyLevel: isCompleted ? "COMPLETED" : "NOT_COLLECTED",
      badgeLabel: isCompleted ? "Completed" : "Awaiting Collection",
      badgeClasses: "bg-slate-100 text-slate-500 border border-slate-200 font-medium",
      dotClasses: "bg-slate-400",
      stabilityHours,
    };
  }

  const collectionDate = parseDateSafe(collectionTimeInput);

  if (!collectionDate) {
    return {
      collectionTime: null,
      formattedCollectionTime: "—",
      deadlineTime: null,
      formattedDeadlineTime: "—",
      remainingMinutes: 9999,
      isExpired: false,
      isExpiringSoon: false,
      isCollected: false,
      urgencyLevel: isCompleted ? "COMPLETED" : "NOT_COLLECTED",
      badgeLabel: isCompleted ? "Completed" : "Awaiting Collection",
      badgeClasses: "bg-slate-100 text-slate-500 border border-slate-200 font-medium",
      dotClasses: "bg-slate-400",
      stabilityHours,
    };
  }

  const formattedCollectionTime = collectionDate.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  // Expiry deadline is measured from the exact sample collection time
  const deadlineMs = collectionDate.getTime() + stabilityHours * 3600 * 1000;
  const deadlineDate = new Date(deadlineMs);
  const formattedDeadlineTime = deadlineDate.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  if (isCompleted) {
    return {
      collectionTime: collectionDate,
      formattedCollectionTime,
      deadlineTime: deadlineDate,
      formattedDeadlineTime,
      remainingMinutes: 0,
      isExpired: false,
      isExpiringSoon: false,
      isCollected: true,
      urgencyLevel: "COMPLETED",
      badgeLabel: "Completed",
      badgeClasses: "bg-emerald-50 text-emerald-700 border border-emerald-200",
      dotClasses: "bg-emerald-500",
      stabilityHours,
    };
  }

  const diffMs = deadlineMs - nowTime;
  const remainingMinutes = Math.floor(diffMs / 60000);
  const isExpired = remainingMinutes <= 0;
  const isExpiringSoon = remainingMinutes > 0 && remainingMinutes <= 30;

  let urgencyLevel: SampleUrgencyLevel = "SAFE";
  let badgeLabel = "";
  let badgeClasses = "";
  let dotClasses = "";

  if (isExpired) {
    urgencyLevel = "EXPIRED";
    const overdueMins = Math.abs(remainingMinutes);
    const hrs = Math.floor(overdueMins / 60);
    const mins = overdueMins % 60;
    const overdueText = hrs > 0 ? `+${hrs}h ${mins}m` : `+${mins}m`;
    badgeLabel = `EXPIRED (${overdueText})`;
    badgeClasses = "bg-rose-100 text-rose-800 border border-rose-300 font-bold";
    dotClasses = "bg-rose-600 animate-ping";
  } else if (remainingMinutes <= 30) {
    urgencyLevel = "CRITICAL";
    badgeLabel = `${remainingMinutes}m left • URGENT`;
    badgeClasses = "bg-red-50 text-red-700 border border-red-300 font-bold animate-pulse shadow-xs";
    dotClasses = "bg-red-600";
  } else if (remainingMinutes <= 60) {
    urgencyLevel = "WARNING";
    badgeLabel = `${remainingMinutes}m left`;
    badgeClasses = "bg-amber-50 text-amber-700 border border-amber-300 font-semibold";
    dotClasses = "bg-amber-500";
  } else {
    urgencyLevel = "SAFE";
    const hrs = Math.floor(remainingMinutes / 60);
    const mins = remainingMinutes % 60;
    badgeLabel = `${hrs}h ${mins}m left`;
    badgeClasses = "bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium";
    dotClasses = "bg-emerald-500";
  }

  return {
    collectionTime: collectionDate,
    formattedCollectionTime,
    deadlineTime: deadlineDate,
    formattedDeadlineTime,
    remainingMinutes,
    isExpired,
    isExpiringSoon,
    isCollected: true,
    urgencyLevel,
    badgeLabel,
    badgeClasses,
    dotClasses,
    stabilityHours,
  };
}

/**
 * React hook that yields the current timestamp, updating every `intervalMs` ms.
 * Single centralized timer for zero performance overhead.
 */
export function useCurrentTimeTicker(intervalMs: number = 30000): number {
  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}

/**
 * Priority sorting comparator:
 * 1. Active collected specimens with least remaining stability time (< 30m) at the very top.
 * 2. Active collected specimens with remaining time (30-60m, > 60m).
 * 3. Expired specimens (need immediate attention/recollect).
 * 4. Specimens not yet collected (awaiting phlebotomy draw).
 * 5. Completed tests at the bottom.
 */
export function compareBySampleStability(
  a: { remainingMinutes: number; isCompleted: boolean; isExpired: boolean; isCollected?: boolean },
  b: { remainingMinutes: number; isCompleted: boolean; isExpired: boolean; isCollected?: boolean }
): number {
  // Completed items always go last
  if (a.isCompleted && !b.isCompleted) return 1;
  if (!a.isCompleted && b.isCompleted) return -1;
  if (a.isCompleted && b.isCompleted) return 0;

  // Specimens not yet collected go after active collected specimens
  const aCol = a.isCollected !== false;
  const bCol = b.isCollected !== false;
  if (aCol && !bCol) return -1;
  if (!aCol && bCol) return 1;
  if (!aCol && !bCol) return 0;

  // Active collected items expiring soonest float to top
  if (a.isExpired && !b.isExpired) {
    return b.remainingMinutes <= 30 ? 1 : -1;
  }
  if (!a.isExpired && b.isExpired) {
    return a.remainingMinutes <= 30 ? -1 : 1;
  }

  return a.remainingMinutes - b.remainingMinutes;
}
