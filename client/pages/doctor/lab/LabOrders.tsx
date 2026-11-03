import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { getUser, remove } from "@/utils/token";
import LabNav from "./labnav";
import {
  labOrderApi,
  labOrderItemApi,
  LabOrderRecord,
  LabOrderItemRecord,
} from "@/api/labOrder.api";
import { patientApi, PatientRecord } from "@/api/patient.api";
import { labReportApi, LabReportRecord } from "@/api/labReport.api";
import { UserProfileDropdown } from "@/components/ui/User_profile_dropdown";
import { ConfirmationDialog } from "@/components/ui/ConfirmationDialog";
import { LabNotificationBell } from "@/components/hms/LabNotificationBell";
import { useLabNotifications } from "@/context/LabNotificationContext";
import CalendarPicker from "@/components/hms/Calender";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, isToday, isYesterday, isTomorrow, addDays, subDays } from "date-fns";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  CalendarDays,
  IndianRupee,
  AlertTriangle,
  FileText,
  CheckCircle2,
  Clock,
  FlaskConical,
  Activity,
} from "lucide-react";

/* ================================================================
   Type definitions
   ================================================================ */

interface OrderTestItem {
  id: string;
  testCode: string;
  testName: string;
  sampleType: string;
  barcode?: string;
  status: "COMPLETED" | "IN_PROGRESS" | "VERIFIED" | "PENDING" | "REJECTED";
  statusLabel: string;
  completedAt?: string;
  completedBy?: string;
  resultSummary?: string;
  parameters?: { parameter: string; result: string; unit?: string; referenceRange?: string }[];
  targetDate?: string;
  targetDateIso?: string;
  deadlineDate?: string;
}

interface TrackedOrder {
  id: string;
  orderId: string;
  orderDatetime: string;
  orderDateFormatted: string;
  orderTimeFormatted?: string;
  orderDateIso: string;
  targetDateFormatted: string;
  targetDateIso?: string;
  priority: "URGENT" | "ROUTINE";
  patientId: string;
  patientName: string;
  patientAge: number;
  patientGender: string;
  patientMobile: string;
  patientEmail: string;
  patientAddress: string;
  visitType?: string;
  doctorName: string;
  doctorDepartment: string;
  clinicalNotes?: string;
  provisionalDiagnosis?: string;
  totalTests: number;
  completedTests: number;
  inProgressTests: number;
  pendingTests: number;
  completionPct: number;
  orderStatus: "COMPLETED" | "IN_PROGRESS" | "PENDING";
  revenue: number;
  tests: OrderTestItem[];
}

/* ================================================================
   Helpers
   ================================================================ */

const calcAge = (dob?: string | null): number => {
  if (!dob) return 0;
  const parts = dob.split(/[-/]/);
  if (parts.length === 3) {
    let y = parseInt(parts[2], 10);
    if (isNaN(y) || y < 100) y = parseInt(parts[0], 10);
    if (!isNaN(y) && y > 1900 && y <= 2026) return Math.max(1, 2026 - y);
  }
  return 0;
};

const formatTargetDate = (value?: string | null): string => {
  if (!value) return "—";
  const iso = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return `${iso[3]}-${iso[2]}-${iso[1]}`;
  }
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) {
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const yyyy = d.getUTCFullYear();
    return `${dd}-${mm}-${yyyy}`;
  }
  return "—";
};

const toIsoDateString = (value?: string | null | Date): string => {
  if (!value) return "";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  const iso = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return "";
};

export const isTestOverdue = (test: OrderTestItem, orderStatus?: string, asOfDateIso?: string): boolean => {
  if (test.status === "COMPLETED" || orderStatus === "COMPLETED") return false;

  const todayIso = asOfDateIso || format(new Date(), "yyyy-MM-dd");
  if (test.targetDateIso) {
    return test.targetDateIso < todayIso;
  }

  if (test.targetDate && test.targetDate !== "—") {
    const parts = test.targetDate.split(/[-/]/);
    if (parts.length === 3) {
      let d = parseInt(parts[0], 10);
      let m = parseInt(parts[1], 10);
      let y = parseInt(parts[2], 10);
      if (y < 100) y += 2000;
      if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
        const targetIso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        return targetIso < todayIso;
      }
    }
  }

  return false;
};

export const isOrderOverdue = (order: TrackedOrder, asOfDateIso?: string): boolean => {
  if (order.orderStatus === "COMPLETED") return false;

  const todayIso = asOfDateIso || format(new Date(), "yyyy-MM-dd");
  if (order.targetDateIso && order.targetDateIso < todayIso) {
    return true;
  }

  return order.tests.some((t) => isTestOverdue(t, order.orderStatus, todayIso));
};

/* ================================================================
   All KPI Identifiers (matches Admin Dashboard KPI Shower pattern)
   ================================================================ */
const ALL_LAB_KPI_IDS = [
  "total-orders",
  "orders-today",
  "revenue",
  "critical-alerts",
  "test-overdue",
  "order-completed",
  "order-in-progress",
  "order-pending",
  "registration-pending",
  "verification-pending",
  "testing-pending",
  "report-pending",
  "transfer-pending",
];

/* ================================================================
   Component
   ================================================================ */

export default function LabOrders() {
  const navigate = useNavigate();
  const currentUser = useMemo(() => getUser(), []);
  const displayName = currentUser?.username || "Lab Technician";
  const displayRole =
    currentUser?.role_type === "LAB_TECHNICIAN" ? "Lab Technician" : currentUser?.role_type || "Lab Technician";
  const avatarUrl = typeof window !== "undefined" ? localStorage.getItem("user_photo") || undefined : undefined;
  const { notifications, statCount } = useLabNotifications();

  /* ---------- logout ---------- */
  const [logoutOpen, setLogoutOpen] = useState(false);
  const handleLogout = () => {
    setLogoutOpen(false);
    remove();
    localStorage.removeItem("user_info");
    localStorage.removeItem("user_photo");
    navigate("/", { replace: true });
  };

  /* ---------- filters ---------- */
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"ALL" | "COMPLETED" | "IN_PROGRESS" | "PENDING" | "OVERDUE">("ALL");
  const [priorityFilter, setPriorityFilter] = useState<"ALL" | "URGENT" | "ROUTINE">("ALL");
  const [dateFilterType, setDateFilterType] = useState<"ACTIVE_RANGE" | "ALL" | "ORDER_DATE" | "TARGET_DATE">("ACTIVE_RANGE");
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  /* ---------- KPI Selection (Admin Dashboard style KPI Shower) ---------- */
  const [selectedKpis, setSelectedKpis] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("lab_kpi_selected");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            // Filter out tests-progress and any removed KPIs, ensure pending KPIs are included
            const filteredSaved = parsed.filter((id) => id !== "tests-progress" && ALL_LAB_KPI_IDS.includes(id));
            const pendingIds = ALL_LAB_KPI_IDS.filter((id) => id.includes("pending"));
            const merged = Array.from(new Set([...filteredSaved, ...pendingIds]));
            return merged;
          }
        }
      } catch {}
    }
    return ALL_LAB_KPI_IDS;
  });
  const [isKpiShowerOpen, setIsKpiShowerOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem("lab_kpi_selected", JSON.stringify(selectedKpis));
    } catch {}
  }, [selectedKpis]);

  /* ---------- KPI Track Scroll (Admin Dashboard style) ---------- */
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollButtons = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(maxScroll > 0 && el.scrollLeft < maxScroll - 4);
  }, []);

  const handleKpiScroll = (direction: "left" | "right") => {
    const el = trackRef.current;
    if (!el) return;
    const scrollAmount = 320;
    el.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    updateScrollButtons();

    const handleScroll = () => {
      updateScrollButtons();
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", updateScrollButtons);

    const ro = new ResizeObserver(() => {
      updateScrollButtons();
    });
    ro.observe(el);

    return () => {
      el.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", updateScrollButtons);
      ro.disconnect();
    };
  }, [updateScrollButtons]);

  /* ---------- drawer ---------- */
  const [selectedOrder, setSelectedOrder] = useState<TrackedOrder | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [copiedBarcode, setCopiedBarcode] = useState<string | null>(null);
  const copyBarcode = (bc: string) => {
    navigator.clipboard?.writeText(bc);
    setCopiedBarcode(bc);
    setTimeout(() => setCopiedBarcode(null), 1800);
  };

  /* ---------- data ---------- */
  const [orders, setOrders] = useState<TrackedOrder[]>([]);
  const [reports, setReports] = useState<LabReportRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  /* ---------- fetch & map ---------- */
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [ordersRes, itemsRes, patientsRes, reportsRes] = await Promise.all([
        labOrderApi.getAll().catch(() => ({ data: { data: [] } })),
        labOrderItemApi.getAll().catch(() => ({ data: { data: [] } })),
        patientApi.getAll({ limit: 200 }).catch(() => ({ data: { data: { patients: [] } } })),
        labReportApi.getAll().catch(() => ({ data: { data: [] } })),
      ]);

      const dbOrders: LabOrderRecord[] = ordersRes?.data?.data || [];
      const dbItems: LabOrderItemRecord[] = itemsRes?.data?.data || [];
      const dbPatients: PatientRecord[] = patientsRes?.data?.data?.patients || [];
      const dbReports: LabReportRecord[] = reportsRes?.data?.data || [];

      setReports(dbReports);

      // lookup maps
      const patientMap = new Map<string, PatientRecord>();
      dbPatients.forEach((p) => p.patient_id && patientMap.set(p.patient_id, p));

      const itemsByOrder = new Map<string, LabOrderItemRecord[]>();
      dbItems.forEach((it) => {
        if (it.lab_order_id) {
          const arr = itemsByOrder.get(it.lab_order_id) || [];
          arr.push(it);
          itemsByOrder.set(it.lab_order_id, arr);
        }
      });

      const mapped: TrackedOrder[] = dbOrders.map((order, idx) => {
        const pid = order.patient_history?.patient_id || order.patient_history_id || `P000${120 + idx}`;
        const patient = patientMap.get(pid);

        // items: prefer embedded, fallback to separate call
        const orderItems: LabOrderItemRecord[] =
          (order as any).lab_order_item?.length > 0
            ? (order as any).lab_order_item
            : itemsByOrder.get(order.lab_order_id) || [];

        // doctor
        const doctorName = order.employees
          ? `Dr. ${[order.employees.first_name, order.employees.last_name].filter(Boolean).join(" ")}`
          : "Doctor";
        const doctorDept = order.department_master?.department_name || "General Medicine";

        // patient
        const pName = patient
          ? [patient.patient_first_name, patient.patient_middle_name, patient.patient_last_name].filter(Boolean).join(" ")
          : `Patient ${pid}`;
        const pAge = patient?.patient_age || (patient?.patient_dob ? calcAge(patient.patient_dob) : 0);
        const pGender = patient?.patient_gender || "";
        const pMobile = patient?.patient_primary_mobile || "";
        const pEmail = patient?.patient_email || "";
        const pAddr = [patient?.patient_address || patient?.Patient_address || patient?.current_address, patient?.patient_area, patient?.patient_district]
          .filter(Boolean).join(", ") || "";

        // map each test item
        const tests: OrderTestItem[] = orderItems.map((oi) => {
          const itemId = oi.lab_order_item_id || String(oi.id);
          const rawStatus = (oi.item_status || "").toUpperCase();

          // check localStorage for live bench updates
          const lsStatus = typeof window !== "undefined" ? localStorage.getItem(`testing_sample_status_${itemId}`) : null;
          const lsResult = typeof window !== "undefined" ? localStorage.getItem(`testing_sample_result_${itemId}`) || undefined : undefined;
          let lsParams: any[] = [];
          try {
            const pp = typeof window !== "undefined" ? localStorage.getItem(`testing_sample_params_${itemId}`) : null;
            if (pp) lsParams = JSON.parse(pp);
          } catch { /* ignore */ }

          // barcode resolution
          const barcode =
            oi.sample_collection?.[0]?.barcode ||
            (oi.remarks?.match(/Barcode:\s*([A-Za-z0-9_-]+)/i)?.[1]) ||
            (typeof window !== "undefined" ? localStorage.getItem(`generated_barcode_item_${itemId}`) || undefined : undefined) ||
            oi.barcode ||
            undefined;

          // Test status: A test is ONLY completed if results exist or status is Completed/Report Generated
          const isTestItemCompleted =
            rawStatus === "COMPLETED" ||
            rawStatus === "REPORT GENERATED" ||
            rawStatus === "REPORT_GENERATED" ||
            rawStatus === "DELIVERED" ||
            lsStatus === "COMPLETED" ||
            Boolean(lsResult);

          // Tests which are not completed MUST show as Pending
          let status: OrderTestItem["status"] = isTestItemCompleted ? "COMPLETED" : "PENDING";
          let statusLabel = isTestItemCompleted ? "Completed" : "Pending";

          const itemRawTarget = oi.target_date || (order as any).target_date;
          const targetDateFormatted = formatTargetDate(itemRawTarget);
          const targetDateIso = toIsoDateString(itemRawTarget);

          const tatHours = Number(oi.lab_test_master?.tat_hours) || 2;
          const baseDate = oi.created_at || order.order_datetime || order.created_at
            ? new Date(oi.created_at || order.order_datetime || order.created_at!)
            : new Date();
          const deadlineDateObj = new Date(baseDate.getTime() + tatHours * 3600 * 1000);
          const deadlineDate = !Number.isNaN(deadlineDateObj.getTime())
            ? deadlineDateObj.toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              }) +
              ", " +
              deadlineDateObj.toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
              })
            : undefined;

          return {
            id: itemId,
            testCode: oi.lab_test_master?.test_code || oi.lab_test_id?.replace(/^LABTEST/, "T") || "TEST",
            testName: oi.lab_test_master?.test_name || "Diagnostic Test",
            sampleType: oi.lab_test_master?.sample_type || oi.specimen_type || "Whole Blood",
            barcode,
            status,
            statusLabel,
            completedAt: status === "COMPLETED" ? (oi.updated_at ? new Date(oi.updated_at).toLocaleString() : "—") : undefined,
            resultSummary: lsResult,
            parameters: lsParams.length > 0 ? lsParams : undefined,
            targetDate: targetDateFormatted !== "—" ? targetDateFormatted : undefined,
            targetDateIso: targetDateIso || undefined,
            deadlineDate,
          };
        });

        // if order had no items from backend, create a placeholder so the order still shows
        if (tests.length === 0) {
          tests.push({
            id: `placeholder-${order.lab_order_id}`,
            testCode: "—",
            testName: (order as any).provisional_diagnosis || "Lab Panel",
            sampleType: "—",
            status: "PENDING",
            statusLabel: "Pending",
          });
        }

        const rawOrderStatus = (order.order_status || "").trim().toUpperCase();
        const isDbCompleted = rawOrderStatus === "COMPLETED" || rawOrderStatus === "COMPLETE";
        const isDbInProgress = [
          "IN_PROGRESS",
          "IN PROGRESS",
          "IN-PROGRESS",
          "PROCESSING",
          "COLLECTED",
          "SAMPLE_COLLECTED",
          "SAMPLE COLLECTED",
          "TESTING",
          "RUNNING",
          "VERIFIED",
        ].includes(rawOrderStatus);

        let finalTests = tests;
        let totalTests = finalTests.length;
        let completedTests = finalTests.filter((t) => t.status === "COMPLETED").length;
        let inProgressTests = 0;
        let pendingTests = totalTests - completedTests;
        let completionPct = totalTests > 0 ? Math.round((completedTests / totalTests) * 100) : 0;

        // Order is ONLY completed if ALL tests are completed
        const isAllTestsCompleted = totalTests > 0 && completedTests === totalTests;

        let orderStatus: TrackedOrder["orderStatus"] = "PENDING";
        if (isAllTestsCompleted) {
          orderStatus = "COMPLETED";
          completionPct = 100;
        } else if (
          completedTests > 0 ||
          isDbInProgress ||
          finalTests.some((t) => !!t.barcode) ||
          (typeof window !== "undefined" && !!localStorage.getItem(`generated_barcode_${order.lab_order_id}`))
        ) {
          orderStatus = "IN_PROGRESS";
        } else {
          orderStatus = "PENDING";
        }

        const rawP = (order.priority || "Normal").toUpperCase();
        let priority: TrackedOrder["priority"] = "ROUTINE";
        if (rawP.includes("STAT") || rawP.includes("URGENT")) priority = "URGENT";

        const orderRawDate = order.order_datetime || order.created_at || new Date().toISOString();
        const orderDateObj = new Date(orderRawDate);
        const isValidDate = !Number.isNaN(orderDateObj.getTime());
        const orderDateFormatted = isValidDate
          ? orderDateObj.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
          : "—";
        const orderTimeFormatted = isValidDate
          ? orderDateObj.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })
          : undefined;
        const orderDateIso = toIsoDateString(orderDateObj);

        const itemTargetDates = Array.from(
          new Set(
            finalTests
              .map((t) => t.targetDate)
              .filter((d): d is string => Boolean(d && d !== "—"))
          )
        );
        const targetDateFormatted = itemTargetDates.length > 0 ? itemTargetDates.join(", ") : "—";
        const allTargetIsoDates = finalTests
          .map((t) => t.targetDateIso)
          .filter((d): d is string => Boolean(d));
        const targetDateIso = allTargetIsoDates.length > 0
          ? [...allTargetIsoDates].sort().reverse()[0]
          : toIsoDateString((order as any).target_date) || undefined;

        const orderRevenue = orderItems.reduce((acc, it) => {
          const amt =
            it.net_amount !== null && it.net_amount !== undefined && it.net_amount !== ""
              ? Number(it.net_amount)
              : it.price !== null && it.price !== undefined && it.price !== ""
              ? Number(it.price)
              : 0;
          return acc + (Number.isNaN(amt) ? 0 : amt);
        }, 0);

        return {
          id: order.lab_order_id,
          orderId: order.lab_order_id,
          orderDatetime: orderRawDate,
          orderDateFormatted,
          orderTimeFormatted,
          orderDateIso,
          targetDateFormatted,
          targetDateIso,
          priority,
          patientId: pid,
          patientName: pName,
          patientAge: pAge,
          patientGender: pGender,
          patientMobile: pMobile,
          patientEmail: pEmail,
          patientAddress: pAddr,
          visitType: order.patient_history?.visit_type || "OPD",
          doctorName,
          doctorDepartment: doctorDept,
          clinicalNotes: (order as any).clinical_notes || undefined,
          provisionalDiagnosis: (order as any).provisional_diagnosis || undefined,
          totalTests,
          completedTests,
          inProgressTests,
          pendingTests,
          completionPct,
          orderStatus,
          revenue: orderRevenue,
          tests: finalTests,
        };
      });

      setOrders(mapped);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error("Failed to fetch lab orders:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ---------- date matching helper ---------- */
  const isOrderMatchingDate = useCallback(
    (o: TrackedOrder, targetDay: string, filterType: "ACTIVE_RANGE" | "ALL" | "ORDER_DATE" | "TARGET_DATE"): boolean => {
      const orderDate = o.orderDateIso;
      const targetDate = o.targetDateIso || orderDate;
      const isCompleted = o.orderStatus === "COMPLETED";

      if (filterType === "ORDER_DATE") return orderDate === targetDay;
      if (filterType === "TARGET_DATE") {
        return targetDate === targetDay || o.tests.some((t) => t.targetDateIso === targetDay);
      }

      // Default ("ACTIVE_RANGE" & "ALL"):
      // 1. If targetDay is before order date, the order was not placed yet -> do not show
      if (orderDate && targetDay < orderDate) {
        return false;
      }

      // 2. Active span: from order date to target date inclusive -> show
      if (targetDate && targetDay <= targetDate) {
        return true;
      }

      // 3. After target date (targetDay > targetDate):
      // "if it is not completed before the target date after the target date it should be shown in dashboard as overdue"
      // "if it is completed before the target date dont show the order after the target date"
      if (targetDate && targetDay > targetDate) {
        if (!isCompleted) {
          return true; // overdue -> keep shown in dashboard!
        } else {
          return false; // completed on or before target date -> do NOT show after target date
        }
      }

      return orderDate === targetDay;
    },
    []
  );

  /* ---------- metrics ---------- */
  const metrics = useMemo(() => {
    const currentDayIso = selectedDate ? format(selectedDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");

    const list = selectedDate
      ? orders.filter((o) => isOrderMatchingDate(o, currentDayIso, dateFilterType))
      : orders;

    const allOrdersCount = orders.length;
    const allTestsCount = orders.reduce((a, o) => a + o.totalTests, 0);
    const allRevenue = orders.reduce((a, o) => a + (o.revenue || 0), 0);

    const todayIso = format(new Date(), "yyyy-MM-dd");
    const todayOrders = orders.filter((o) => o.orderDateIso === todayIso);
    const ordersToday = todayOrders.length;
    const testsToday = todayOrders.reduce((a, o) => a + o.totalTests, 0);

    const total = list.length;
    const completed = list.filter((o) => o.orderStatus === "COMPLETED").length;
    const inProgress = list.filter((o) => o.orderStatus === "IN_PROGRESS").length;
    const pending = list.filter((o) => o.orderStatus === "PENDING").length;
    const totalTests = list.reduce((a, o) => a + o.totalTests, 0);
    const doneTests = list.reduce((a, o) => a + o.completedTests, 0);
    const testPct = totalTests > 0 ? Math.round((doneTests / totalTests) * 100) : 0;
    const orderPct = total > 0 ? Math.round((completed / total) * 100) : 0;

    const revenue = list.reduce((a, o) => a + (o.revenue || 0), 0);
    const todayRevenue = todayOrders.reduce((a, o) => a + (o.revenue || 0), 0);

    const urgentOrdersPending = list.filter(
      (o) => o.priority === "URGENT" && o.orderStatus !== "COMPLETED"
    ).length;
    const statNotificationsCount = (notifications || []).filter(
      (n) => !n.read && (n.priority === "STAT" || n.category === "STAT" || n.category === "CRITICAL")
    ).length;
    const criticalAlerts = Math.max(
      statCount || 0,
      statNotificationsCount,
      urgentOrdersPending,
      list.filter((o) => o.priority === "URGENT").length
    );

    const overdueOrders = list.filter((o) => isOrderOverdue(o, currentDayIso));
    const ordersOverdue = overdueOrders.length;
    const testsOverdue = list.reduce((acc, o) => {
      if (o.orderStatus === "COMPLETED") return acc;
      const isOrderPassed = Boolean(o.targetDateIso && o.targetDateIso < currentDayIso);
      const count = o.tests.filter((t) => {
        if (t.status === "COMPLETED") return false;
        return isTestOverdue(t, o.orderStatus, currentDayIso) || isOrderPassed;
      }).length;
      return acc + (count > 0 ? count : isOrderPassed ? o.totalTests : 0);
    }, 0);

    /* ---------- Pipeline Pending Calculations ---------- */
    // 1. Registration Pending: Requisitions awaiting sample accession & barcode generation
    const regPendingOrders = list.filter((o) => {
      if (o.orderStatus === "COMPLETED") return false;
      const hasGeneratedBarcode =
        typeof window !== "undefined" &&
        Boolean(localStorage.getItem(`generated_barcode_${o.id}`));
      const hasTestBarcodes = o.tests.some((t) => Boolean(t.barcode));
      return !hasGeneratedBarcode && !hasTestBarcodes;
    }).length;
    const registrationPending =
      regPendingOrders > 0
        ? regPendingOrders
        : list.filter((o) => o.orderStatus === "PENDING").length;

    // 2. Verification Pending: Barcoded specimens awaiting pre-analytical integrity verification
    let verPendingCount = 0;
    list.forEach((o) => {
      if (o.orderStatus === "COMPLETED") return;
      o.tests.forEach((t) => {
        if (t.status === "COMPLETED") return;
        const isLocallyVerified =
          typeof window !== "undefined" &&
          (localStorage.getItem(`verified_sample_${t.id}`) === "true" ||
            (t.barcode && localStorage.getItem(`verified_sample_barcode_${t.barcode}`) === "true"));
        const isLocallyRejected =
          typeof window !== "undefined" &&
          localStorage.getItem(`rejected_sample_${t.id}`) === "true";
        if (isLocallyVerified || isLocallyRejected) return;
        if (t.barcode) {
          verPendingCount++;
        }
      });
    });
    if (verPendingCount === 0 && typeof window !== "undefined") {
      const isS1Verified =
        localStorage.getItem("verified_sample_s1") === "true" ||
        localStorage.getItem("verified_sample_barcode_BC2405200001") === "true";
      const isS1Rejected = localStorage.getItem("rejected_sample_s1") === "true";
      if (!isS1Verified && !isS1Rejected) verPendingCount = 1;
    }
    const verificationPending = verPendingCount;

    // 3. Testing Pending: Specimens currently in testing benches / analyzer queue
    let testPendingCount = 0;
    list.forEach((o) => {
      if (o.orderStatus === "COMPLETED") return;
      o.tests.forEach((t) => {
        const isRunning =
          t.status === "IN_PROGRESS" ||
          (typeof window !== "undefined" && localStorage.getItem(`testing_sample_status_${t.id}`) === "RUNNING");
        if (isRunning) testPendingCount++;
      });
    });
    if (testPendingCount === 0 && typeof window !== "undefined") {
      const s2Status = localStorage.getItem("testing_sample_status_s2");
      if (s2Status !== "COMPLETED") testPendingCount = 1;
    }
    const testingPending = testPendingCount;

    // 4. Report Pending: Testing completed, awaiting pathologist review & digital signature
    let repPendingCount = 0;
    list.forEach((o) => {
      o.tests.forEach((t) => {
        const isTestDone =
          t.status === "COMPLETED" ||
          (typeof window !== "undefined" && localStorage.getItem(`testing_sample_status_${t.id}`) === "COMPLETED");
        if (!isTestDone) return;
        const isReportDone =
          typeof window !== "undefined" &&
          (localStorage.getItem(`report_status_${t.id}`) === "GENERATED" ||
            localStorage.getItem(`report_approved_${t.id}`) === "GENERATED" ||
            (t.barcode && localStorage.getItem(`report_status_${t.barcode}`) === "GENERATED"));
        if (!isReportDone) repPendingCount++;
      });
    });
    if (repPendingCount === 0 && typeof window !== "undefined") {
      const s3ReportStatus = localStorage.getItem("report_status_s3");
      const s3Approved = localStorage.getItem("report_approved_s3");
      if (s3ReportStatus !== "GENERATED" && s3Approved !== "GENERATED") {
        repPendingCount = 1;
      }
    }
    const reportPending = repPendingCount;

    // 5. Transfer Pending: Reports approved and signed, queued for EMR / doctor / patient delivery
    let transPendingCount = 0;
    reports.forEach((r) => {
      const isDelivered =
        Boolean(r.delivered_to && r.delivered_datetime) ||
        (typeof window !== "undefined" &&
          (localStorage.getItem(`report_transferred_${r.lab_report_id}`) === "true" ||
            localStorage.getItem(`report_transferred_${r.report_number}`) === "true"));
      if (!isDelivered) transPendingCount++;
    });
    if (typeof window !== "undefined") {
      list.forEach((o) => {
        o.tests.forEach((t) => {
          const isReportGenerated =
            localStorage.getItem(`report_status_${t.id}`) === "GENERATED" ||
            localStorage.getItem(`report_approved_${t.id}`) === "GENERATED";
          const isTransferred =
            localStorage.getItem(`report_transferred_${t.id}`) === "true";
          if (isReportGenerated && !isTransferred) {
            transPendingCount++;
          }
        });
      });
      if (transPendingCount === 0) {
        const s4Delivered = localStorage.getItem("report_transferred_s4") === "true";
        if (!s4Delivered) transPendingCount = 1;
      }
    }
    const transferPending = transPendingCount;

    return {
      allOrdersCount,
      allTestsCount,
      allRevenue,
      total,
      completed,
      inProgress,
      pending,
      registrationPending,
      verificationPending,
      testingPending,
      reportPending,
      transferPending,
      totalTests,
      doneTests,
      testPct,
      orderPct,
      ordersToday,
      testsToday,
      revenue,
      todayRevenue,
      criticalAlerts,
      ordersOverdue,
      testsOverdue,
    };
  }, [orders, reports, selectedDate, dateFilterType, isOrderMatchingDate, notifications, statCount]);

  /* ---------- KPI Cards configuration (Admin Dashboard style) ---------- */
  const kpiCards = useMemo(
    () => [
            {
        id: "total-orders",
        label: "Total Lab Orders",
        subLabel: `${metrics.allTestsCount} tests requested`,
        value: metrics.allOrdersCount,
        tag: "Total",
        bg: "#D6E3FF",
        valueColor: "#00488D",
        iconBg: "rgba(255, 255, 255, 0.40)",
        icon: <FileText className="w-[17px] h-[17px]" color="#00488D" />,
        isActive: activeTab === "ALL",
        onClick: () => {
          setSelectedDate(new Date());
          setActiveTab("ALL");
        },
      },
      {
        id: "orders-today",
        label: "Orders Today",
        subLabel: `${metrics.testsToday} test${metrics.testsToday === 1 ? "" : "s"} ordered today`,
        value: metrics.ordersToday,
        tag: "Today",
        bg: "rgba(0, 72, 141, 0.10)",
        valueColor: "#00488D",
        iconBg: "rgba(255, 255, 255, 0.50)",
        icon: <CalendarDays className="w-[17px] h-[17px]" color="#00488D" />,
        isActive: Boolean(selectedDate && isToday(selectedDate)),
        onClick: () => {
          setSelectedDate(new Date());
          setDateFilterType("ACTIVE_RANGE");
          setActiveTab("ALL");
        },
      },
      {
        id: "revenue",
        label: "Revenue",
        subLabel:
          metrics.todayRevenue > 0
            ? `₹${metrics.todayRevenue.toLocaleString("en-IN")} booked today`
            : `Across ${metrics.total} orders`,
        value: `₹${metrics.revenue.toLocaleString("en-IN")}`,
        tag: metrics.todayRevenue > 0 ? `+₹${metrics.todayRevenue.toLocaleString("en-IN")}` : "Revenue",
        bg: "#dcf5e8",
        valueColor: "#007A4D",
        iconBg: "rgba(255, 255, 255, 0.45)",
        icon: <IndianRupee className="w-[17px] h-[17px]" color="#007A4D" />,
      },
      {
        id: "critical-alerts",
        label: "Critical Alerts",
        subLabel: metrics.criticalAlerts > 0 ? "STAT & Urgent orders" : "No critical alerts",
        value: metrics.criticalAlerts,
        tag: metrics.criticalAlerts > 0 ? "STAT Alert" : "Normal",
        bg: "rgba(220, 38, 38, 0.12)",
        valueColor: "#DC2626",
        iconBg: "rgba(255, 255, 255, 0.40)",
        icon: <AlertTriangle className="w-[17px] h-[17px]" color="#DC2626" />,
      },
      {
        id: "test-overdue",
        label: "Test Overdue",
        subLabel:
          metrics.testsOverdue > 0
            ? `${metrics.ordersOverdue} order${metrics.ordersOverdue === 1 ? "" : "s"} passed target date`
            : "All tests within target date",
        value: metrics.testsOverdue,
        tag: metrics.testsOverdue > 0 ? "Overdue" : "On Track",
        bg: "#FEE2E2",
        valueColor: "#B91C1C",
        iconBg: "rgba(255, 255, 255, 0.50)",
        icon: <Clock className="w-[17px] h-[17px]" color="#B91C1C" />,
        isActive: activeTab === "OVERDUE",
        onClick: () => setActiveTab((prev) => (prev === "OVERDUE" ? "ALL" : "OVERDUE")),
      },
      {
        id: "order-completed",
        label: "Order Completed",
        subLabel: "All tests completed & signed",
        value: metrics.completed,
        tag: `${metrics.orderPct}%`,
        bg: "rgba(0, 200, 150, 0.12)",
        valueColor: "#00A87E",
        iconBg: "rgba(255, 255, 255, 0.40)",
        icon: <CheckCircle2 className="w-[17px] h-[17px]" color="#00A87E" />,
        isActive: activeTab === "COMPLETED",
        onClick: () => setActiveTab((prev) => (prev === "COMPLETED" ? "ALL" : "COMPLETED")),
      },
      {
        id: "order-in-progress",
        label: "Order In Progress",
        subLabel: "Partial test completion",
        value: metrics.inProgress,
        tag: "In Progress",
        bg: "rgba(255, 107, 53, 0.12)",
        valueColor: "#7B3200",
        iconBg: "#FFDBCB",
        icon: <Clock className="w-[17px] h-[17px]" color="#7B3200" />,
        isActive: activeTab === "IN_PROGRESS",
        onClick: () => setActiveTab((prev) => (prev === "IN_PROGRESS" ? "ALL" : "IN_PROGRESS")),
      },
      {
        id: "order-pending",
        label: "Order Pending",
        subLabel: "0% tests completed",
        value: metrics.pending,
        tag: "Pending",
        bg: "#E6E8EA",
        valueColor: "#4A5F83",
        iconBg: "rgba(255, 255, 255, 0.40)",
        icon: <FlaskConical className="w-[17px] h-[17px]" color="#4A5F83" />,
        isActive: activeTab === "PENDING",
        onClick: () => setActiveTab((prev) => (prev === "PENDING" ? "ALL" : "PENDING")),
      },
      {
        id: "registration-pending",
        label: "Registration Pending",
        subLabel: "Awaiting sample registration",
        value: metrics.registrationPending,
        tag: "Pending",
        bg: "rgba(255, 107, 53, 0.12)",
        valueColor: "#7B3200",
        iconBg: "#FFDBCB",
        icon: <Clock className="w-[17px] h-[17px]" color="#7B3200" />,
      },
      {
        id: "verification-pending",
        label: "Verification Pending",
        subLabel: "Awaiting tube verification",
        value: metrics.verificationPending,
        tag: "Pending",
        bg: "rgba(255, 107, 53, 0.12)",
        valueColor: "#7B3200",
        iconBg: "#FFDBCB",
        icon: <Clock className="w-[17px] h-[17px]" color="#7B3200" />,
      },
      {
        id: "testing-pending",
        label: "Testing Pending",
        subLabel: "Running on analyzers",
        value: metrics.testingPending,
        tag: "In Testing",
        bg: "rgba(255, 107, 53, 0.12)",
        valueColor: "#7B3200",
        iconBg: "#FFDBCB",
        icon: <Clock className="w-[17px] h-[17px]" color="#7B3200" />,
      },
      {
        id: "report-pending",
        label: "Report Pending",
        subLabel: "Awaiting approval / sign",
        value: metrics.reportPending,
        tag: "Pending",
        bg: "rgba(255, 107, 53, 0.12)",
        valueColor: "#7B3200",
        iconBg: "#FFDBCB",
        icon: <Clock className="w-[17px] h-[17px]" color="#7B3200" />,
      },
      {
        id: "transfer-pending",
        label: "Transfer Pending",
        subLabel: "Queued for portal delivery",
        value: metrics.transferPending,
        tag: "Pending",
        bg: "rgba(255, 107, 53, 0.12)",
        valueColor: "#7B3200",
        iconBg: "#FFDBCB",
        icon: <Clock className="w-[17px] h-[17px]" color="#7B3200" />,
      },
    ], [metrics, activeTab, selectedDate]);

  /* ---------- displayed KPI cards based on user selection (Admin Dashboard style) ---------- */
  const displayedKpiCards = useMemo(() => {
    return kpiCards.filter((card) => selectedKpis.includes(card.id));
  }, [kpiCards, selectedKpis]);

  useEffect(() => {
    const timer = setTimeout(updateScrollButtons, 150);
    return () => clearTimeout(timer);
  }, [displayedKpiCards.length, updateScrollButtons]);

  /* ---------- filtered list ---------- */
  const filtered = useMemo(() => {
    const currentDayIso = selectedDate ? format(selectedDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");

    return orders.filter((o) => {
      const isOverdue = isOrderOverdue(o, currentDayIso);

      if (activeTab === "COMPLETED" && o.orderStatus !== "COMPLETED") return false;
      if (activeTab === "IN_PROGRESS" && o.orderStatus !== "IN_PROGRESS") return false;
      if (activeTab === "PENDING" && o.orderStatus !== "PENDING") return false;
      if (activeTab === "OVERDUE" && !isOverdue) return false;
      if (priorityFilter !== "ALL" && o.priority !== priorityFilter) return false;

      if (selectedDate) {
        if (!isOrderMatchingDate(o, currentDayIso, dateFilterType)) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          o.orderId.toLowerCase().includes(q) ||
          o.patientName.toLowerCase().includes(q) ||
          o.patientId.toLowerCase().includes(q) ||
          o.doctorName.toLowerCase().includes(q) ||
          o.tests.some((t) => t.testName.toLowerCase().includes(q) || t.testCode.toLowerCase().includes(q) || (t.barcode || "").toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [orders, activeTab, priorityFilter, searchQuery, selectedDate, dateFilterType, isOrderMatchingDate]);

  /* ================================================================
     Render
     ================================================================ */

  return (
    <div className="flex h-screen bg-[#F8FAFC] font-sans antialiased overflow-hidden">
      <LabNav activeTab="Dashboard" />

      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto pl-64">
        {/* ---- Header ---- */}
        <header className="sticky top-0 z-10 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[#0b4a8b]">
              <svg className="w-5 h-5 stroke-[2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9 2 2 4-4" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Lab Dashboard</h1>
              <p className="text-xs text-slate-500">Track test completion per order and overall completed orders</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <LabNotificationBell size="md" />
            <UserProfileDropdown userName={displayName} userSubtext={displayRole} userAvatar={avatarUrl} onLogout={() => setLogoutOpen(true)} profilePath="/lab/profile" hideNotifications />
          </div>
        </header>

        {/* ---- Body ---- */}
        <main className="flex-1 p-8 space-y-7 max-w-[1650px] w-full mx-auto">

          {/* ======== KEY PERFORMANCE INDICATORS (Admin Dashboard Style Track) ======== */}
          <div className="flex flex-col gap-3">
            {/* KPI Header with All KPIs Shower Button */}
            <div className="flex items-center justify-between flex-wrap gap-2 px-1">
              <div>
                <h2 className="text-base font-bold text-[#1c1e21] tracking-tight">Key Performance Indicators</h2>
                <p className="text-xs text-[#70747c]">Real-time laboratory diagnostics & order tracking metrics</p>
              </div>

              <div className="flex items-center gap-2">
                {/* KPI Shower - Multi-select and Selected KPI display (Exact match to Admin Dashboard) */}
                <Popover open={isKpiShowerOpen} onOpenChange={setIsKpiShowerOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center h-[28px] px-2.5 bg-white border border-[#E5E7EB] rounded-lg shadow-xs hover:bg-[#F2F4F6] transition-colors gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer select-none"
                      title="KPI Shower - Click to select and view KPIs"
                    >
                      <Activity className="w-3.5 h-3.5 text-slate-500" />
                      {selectedKpis.length === 0 ? (
                        <span className="text-slate-500 font-normal">Select KPIs</span>
                      ) : selectedKpis.length === 1 ? (
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{
                              backgroundColor:
                                kpiCards.find((s) => s.id === selectedKpis[0])?.valueColor || "#00488D",
                            }}
                          />
                          <span className="truncate max-w-[130px] sm:max-w-[160px]">
                            {kpiCards.find((s) => s.id === selectedKpis[0])?.label || "1 Selected"}
                          </span>
                        </div>
                      ) : selectedKpis.length === kpiCards.length ? (
                        <span className="text-slate-700 font-semibold">
                          All KPIs ({kpiCards.length})
                        </span>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <div className="flex -space-x-1">
                            {kpiCards
                              .filter((s) => selectedKpis.includes(s.id))
                              .slice(0, 3)
                              .map((s) => (
                                <span
                                  key={s.id}
                                  className="w-2 h-2 rounded-full border border-white"
                                  style={{ backgroundColor: s.valueColor }}
                                />
                              ))}
                          </div>
                          <span>{selectedKpis.length} KPIs Selected</span>
                        </div>
                      )}
                      <ChevronDown
                        className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${
                          isKpiShowerOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    sideOffset={6}
                    className="w-72 p-0 shadow-xl rounded-xl z-50 bg-white border border-gray-100 text-[#1c1e21]"
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-800">KPI Shower</span>
                        <span className="text-[11px] font-medium text-slate-500">
                          ({selectedKpis.length}/{kpiCards.length})
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedKpis(kpiCards.map((s) => s.id))}
                          className="text-[11px] text-[#00488D] hover:underline font-semibold cursor-pointer"
                        >
                          Select All
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() => setSelectedKpis([])}
                          className="text-[11px] text-slate-500 hover:text-slate-700 hover:underline font-medium cursor-pointer"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    {/* KPI Multi-select List */}
                    <div className="max-h-64 overflow-y-auto p-1 space-y-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {kpiCards.map((stat) => {
                        const isChecked = selectedKpis.includes(stat.id);
                        return (
                          <div
                            key={stat.id}
                            onClick={() => {
                              setSelectedKpis((prev) =>
                                prev.includes(stat.id)
                                  ? prev.filter((id) => id !== stat.id)
                                  : [...prev, stat.id]
                              );
                            }}
                            className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors text-xs select-none ${
                              isChecked ? "bg-slate-50 font-medium" : "hover:bg-slate-50 text-slate-600"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {}}
                                className="w-3.5 h-3.5 rounded border-slate-300 text-[#00488D] focus:ring-0 cursor-pointer"
                              />
                              <div
                                style={{ background: stat.iconBg }}
                                className="w-6 h-6 rounded flex items-center justify-center shrink-0 [&>svg]:w-3.5 [&>svg]:h-3.5"
                              >
                                {stat.icon}
                              </div>
                              <span className="truncate text-xs text-slate-800">{stat.label}</span>
                            </div>
                            <span
                              className="text-[11px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ml-2"
                              style={{ color: stat.valueColor, background: stat.bg }}
                            >
                              {stat.value}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Scrollable KPI Track Container */}
            <div className="relative">
              {/* Left Arrow Button */}
              {canScrollLeft && (
                <button
                  type="button"
                  onClick={() => handleKpiScroll("left")}
                  aria-label="Scroll left"
                  className="absolute -left-3 top-[calc(50%-16px)] w-8 h-8 rounded-full bg-white border border-[#e6e7eb] shadow-[0_2px_8px_rgba(0,0,0,0.08)] flex items-center justify-center cursor-pointer z-10 transition-all duration-150 hover:bg-[#fafafa] hover:scale-105 text-[#1c1e21]"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}

              {/* Left Fade Gradient */}
              <div
                className={`absolute left-0 top-0 bottom-2 w-12 pointer-events-none z-[2] transition-opacity duration-200 bg-gradient-to-r from-[#F8FAFC] to-transparent ${
                  canScrollLeft ? "opacity-100" : "opacity-0"
                }`}
              />

              {/* Scroll Track */}
              <div
                ref={trackRef}
                className="flex gap-[14px] overflow-x-auto scroll-smooth py-[6px] px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {displayedKpiCards.length === 0 ? (
                  <div className="flex items-center justify-center w-full py-8 text-xs text-slate-500 font-medium">
                    No KPIs selected. Select KPIs from the dropdown above to display them.
                  </div>
                ) : (
                  displayedKpiCards.map((card) => (
                    <div
                      key={card.id}
                      onClick={(card as any).onClick}
                      role={(card as any).onClick ? "button" : undefined}
                      tabIndex={(card as any).onClick ? 0 : undefined}
                      style={{
                        background: card.bg,
                        border: (card as any).isActive ? `2.5px solid ${card.valueColor}` : "2.5px solid transparent",
                        boxShadow: (card as any).isActive
                          ? `0 0 0 1px ${card.valueColor}20, 0 6px 18px ${card.valueColor}28`
                          : "0 2px 10px rgba(0,0,0,0.06)",
                      }}
                      className={`flex-[0_0_206px] min-w-[206px] rounded-[12px] p-[14px_16px] flex flex-col gap-[10px] select-none transition-all duration-200 ${
                        (card as any).onClick ? "cursor-pointer hover:-translate-y-[2px] hover:shadow-[0_6px_20px_rgba(0,0,0,0.10)]" : "cursor-default"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div
                          style={{ background: card.iconBg }}
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm"
                        >
                          {card.icon}
                        </div>
                        {card.tag && (
                          <span
                            style={{ color: card.valueColor }}
                            className="text-[11px] font-bold px-[7px] py-[2px] rounded-full tracking-[-0.2px] bg-white/60 shadow-sm inline-flex items-center gap-1"
                          >
                            {card.id === "critical-alerts" && metrics.criticalAlerts > 0 && (
                              <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" />
                            )}
                            <span>{card.tag}</span>
                          </span>
                        )}
                      </div>

                      <div
                        style={{ color: card.valueColor }}
                        className="text-[26px] font-extrabold leading-[1.05] tracking-[-0.6px]"
                      >
                        {card.value}
                      </div>

                      <div className="flex flex-col gap-[2px] min-w-0">
                        <span
                          style={{ color: card.valueColor }}
                          className="text-[12.5px] font-bold tracking-tight truncate"
                        >
                          {card.label}
                        </span>
                        <span
                          style={{ color: card.valueColor, opacity: 0.75 }}
                          className="text-[11px] font-medium truncate"
                        >
                          {card.subLabel}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Right Fade Gradient */}
              <div
                className={`absolute right-0 top-0 bottom-2 w-12 pointer-events-none z-[2] transition-opacity duration-200 bg-gradient-to-l from-[#F8FAFC] to-transparent ${
                  canScrollRight ? "opacity-100" : "opacity-0"
                }`}
              />

              {/* Right Arrow Button */}
              {canScrollRight && (
                <button
                  type="button"
                  onClick={() => handleKpiScroll("right")}
                  aria-label="Scroll right"
                  className="absolute -right-3 top-[calc(50%-16px)] w-8 h-8 rounded-full bg-white border border-[#e6e7eb] shadow-[0_2px_8px_rgba(0,0,0,0.08)] flex items-center justify-center cursor-pointer z-10 transition-all duration-150 hover:bg-[#fafafa] hover:scale-105 text-[#1c1e21]"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* ======== ORDERS TABLE ======== */}
          <section className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
            {/* Filter bar */}
            <div className="p-5 border-b border-slate-100 space-y-3">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                {/* Tabs */}
                <div className="flex items-center gap-1 p-1 bg-slate-100/90 rounded-xl overflow-x-auto">
                  {([
                    ["ALL", `All (${metrics.total})`],
                    ["COMPLETED", `Order Completed (${metrics.completed})`],
                    ["IN_PROGRESS", `Order In Progress (${metrics.inProgress})`],
                    ["PENDING", `Order Pending (${metrics.pending})`],
                    ["OVERDUE", `Test Overdue (${metrics.ordersOverdue})`],
                  ] as const).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setActiveTab(key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                        activeTab === key
                          ? key === "COMPLETED"
                            ? "bg-emerald-600 text-white"
                            : key === "IN_PROGRESS"
                            ? "bg-amber-600 text-white"
                            : key === "OVERDUE"
                            ? "bg-rose-600 text-white"
                            : "bg-white text-slate-900 shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {/* Right controls: Date Navigation + Priority */}
                <div className="flex items-center gap-2.5 flex-wrap">
                  {/* Date Filter Type: Active Range vs Exact Date */}
                  <select
                    value={dateFilterType}
                    onChange={(e) => setDateFilterType(e.target.value as any)}
                    className="text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 outline-none focus:border-[#0b4a8b] cursor-pointer h-[34px] shadow-xs"
                    title="Select date filtering mode"
                  >
                    <option value="ACTIVE_RANGE">Filter: Active &amp; Overdue Range</option>
                    <option value="ORDER_DATE">Filter: Order Date</option>
                    <option value="TARGET_DATE">Filter: Target Date</option>
                    <option value="ALL">Filter: Either Date</option>
                  </select>

                  {/* Calendar Date Navigation using Global CalendarPicker */}
                  <div className="flex items-center bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setSelectedDate((prev) => (prev ? subDays(prev, 1) : subDays(new Date(), 1)))}
                      className="flex items-center justify-center w-[28px] h-[34px] border-r border-slate-200 transition-colors hover:bg-slate-50 text-slate-600 cursor-pointer"
                      title="Previous Day"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>

                    <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className={`flex items-center justify-center h-[34px] px-3 text-xs font-semibold transition-colors duration-150 hover:bg-slate-50 cursor-pointer ${
                            selectedDate ? "text-[#0b4a8b] bg-blue-50/60" : "text-slate-700 bg-white"
                          }`}
                        >
                          <CalendarIcon className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
                          {selectedDate && !isToday(selectedDate) ? (
                            isYesterday(selectedDate)
                              ? "Yesterday"
                              : isTomorrow(selectedDate)
                                ? "Tomorrow"
                                : format(selectedDate, "dd/MM/yyyy")
                          ) : (
                            "Today"
                          )}
                        </button>
                      </PopoverTrigger>

                      <PopoverContent className="w-auto p-0 border border-slate-200 shadow-xl z-50 rounded-2xl overflow-hidden">
                        <div className="p-2.5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                          <span className="text-xs font-bold text-slate-800">
                            {dateFilterType === "TARGET_DATE"
                              ? "Filter by Target Date"
                              : dateFilterType === "ORDER_DATE"
                              ? "Filter by Order Date"
                              : "Filter Orders by Date"}
                          </span>
                          {selectedDate && !isToday(selectedDate) && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedDate(new Date());
                                setIsCalendarOpen(false);
                              }}
                              className="text-xs text-[#0b4a8b] hover:text-[#083666] font-semibold cursor-pointer hover:underline"
                            >
                              Reset to Today
                            </button>
                          )}
                        </div>

                        <CalendarPicker
                          selected={selectedDate || new Date()}
                          hideThemePicker
                          onSelect={(date) => {
                            if (date instanceof Date) {
                              setSelectedDate(date);
                              setIsCalendarOpen(false);
                            }
                          }}
                        />

                        <div className="p-2.5 border-t border-slate-100 flex items-center justify-between text-xs bg-slate-50">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedDate(new Date());
                              setIsCalendarOpen(false);
                            }}
                            className="text-[#0b4a8b] hover:text-[#083666] font-bold cursor-pointer"
                          >
                            Today
                          </button>
                          {selectedDate && !isToday(selectedDate) && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedDate(new Date());
                                setIsCalendarOpen(false);
                              }}
                              className="text-slate-600 hover:text-slate-900 font-medium cursor-pointer"
                            >
                              Reset to Today
                            </button>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>

                    <button
                      type="button"
                      onClick={() => setSelectedDate((prev) => (prev ? addDays(prev, 1) : addDays(new Date(), 1)))}
                      className="flex items-center justify-center w-[28px] h-[34px] border-l border-slate-200 transition-colors hover:bg-slate-50 text-slate-600 cursor-pointer"
                      title="Next Day"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  {selectedDate && !isToday(selectedDate) && (
                    <button
                      type="button"
                      onClick={() => setSelectedDate(new Date())}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-blue-50 text-[#0b4a8b] hover:bg-blue-100 text-xs font-bold cursor-pointer border border-blue-200 transition-colors h-[34px]"
                      title="Reset back to Today"
                    >
                      <CalendarDays className="w-3.5 h-3.5" />
                      <span>Back to Today</span>
                    </button>
                  )}

                  {/* Priority */}
                  <select
                    value={priorityFilter}
                    onChange={(e) => setPriorityFilter(e.target.value as any)}
                    className="text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-blue-500 cursor-pointer h-[34px]"
                  >
                    <option value="ALL">Priority: All</option>
                    <option value="URGENT">Urgent</option>
                    <option value="ROUTINE">Routine</option>
                  </select>
                </div>
              </div>
              {/* Search */}
              <div className="relative">
                <svg className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by Order ID, Patient, Doctor, Test Name, or Barcode..." className="w-full pl-10 pr-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 bg-slate-50/70 border border-slate-200 rounded-xl focus:bg-white focus:border-[#0b4a8b] focus:ring-2 focus:ring-blue-100 outline-none transition-all" />
                {searchQuery && <button onClick={() => setSearchQuery("")} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer">✕</button>}
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/75 border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-3.5 px-5">Order ID</th>
                    <th className="py-3.5 px-5">Patient</th>
                    <th className="py-3.5 px-5">Doctor</th>
                    <th className="py-3.5 px-5 whitespace-nowrap">Order Date</th>
                    <th className="py-3.5 px-5 min-w-[240px]">Test Completion</th>
                    <th className="py-3.5 px-5">Status</th>
                    <th className="py-3.5 px-5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {isLoading ? (
                    <tr><td colSpan={7} className="py-16 text-center text-slate-400"><div className="flex flex-col items-center gap-2"><svg className="w-8 h-8 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg><span className="font-medium">Loading orders…</span></div></td></tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-16 text-center text-slate-400">
                        <span className="font-semibold text-slate-600 block">
                          {activeTab === "OVERDUE" ? "No overdue lab orders" : "No lab orders found"}
                        </span>
                        <span className="text-[11px] block mt-1">
                          {activeTab === "OVERDUE" ? (
                            "All active lab orders and tests are currently within their scheduled target date."
                          ) : selectedDate ? (
                            <>
                              No orders found for {dateFilterType === "TARGET_DATE" ? "target date" : dateFilterType === "ORDER_DATE" ? "order date" : "date"} {isToday(selectedDate) ? "Today" : format(selectedDate, "dd/MM/yyyy")}.{" "}
                              {!isToday(selectedDate) && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedDate(new Date())}
                                  className="text-[#0b4a8b] hover:underline font-semibold cursor-pointer"
                                >
                                  Back to Today
                                </button>
                              )}
                            </>
                          ) : (
                            "Try changing filters or search query."
                          )}
                        </span>
                      </td>
                    </tr>
                  ) : filtered.map((o) => {
                    const isCompleted = o.orderStatus === "COMPLETED";
                    const isInProgress = o.orderStatus === "IN_PROGRESS";
                    const currentDayIso = selectedDate ? format(selectedDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");
                    const isOverdue = isOrderOverdue(o, currentDayIso);
                    return (
                      <tr
                        key={o.id}
                        className={`transition-colors group cursor-pointer ${
                          isOverdue
                            ? "bg-rose-50/40 hover:bg-rose-50/70 border-l-4 border-l-rose-500"
                            : "hover:bg-slate-50/80"
                        }`}
                        onClick={() => { setSelectedOrder(o); setDrawerOpen(true); }}
                      >
                        {/* Order ID */}
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-slate-900 group-hover:text-[#0b4a8b] block">{o.orderId}</span>
                            {isOverdue && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-rose-600 text-white tracking-wide uppercase">
                                OVERDUE
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex items-center gap-1">
                            {o.priority === "URGENT" ? <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">URGENT</span> : <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500">ROUTINE</span>}
                          </div>
                        </td>
                        {/* Patient */}
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-blue-50 text-[#0b4a8b] font-bold flex items-center justify-center shrink-0 text-[11px]">{o.patientName.charAt(0)}</div>
                            <div><span className="font-bold text-slate-900 block">{o.patientName}</span><span className="text-[11px] text-slate-400">{o.patientId}{o.patientGender ? ` · ${o.patientGender}` : ""}{o.patientAge ? ` · ${o.patientAge}y` : ""}</span></div>
                          </div>
                        </td>
                        {/* Doctor */}
                        <td className="py-4 px-5"><span className="font-medium text-slate-800 block">{o.doctorName}</span><span className="text-[11px] text-slate-400">{o.doctorDepartment}</span></td>
                        {/* Order Date & Target Date */}
                        <td className="py-4 px-5 whitespace-nowrap">
                          <span className="font-semibold text-slate-800 block text-xs">{o.orderDateFormatted}</span>
                          {o.orderTimeFormatted && <span className="text-[11px] text-slate-400 block">{o.orderTimeFormatted}</span>}
                          {o.targetDateFormatted && o.targetDateFormatted !== "—" && (
                            <span className={`text-[11px] block mt-0.5 font-medium ${isOverdue ? "text-rose-700 font-bold" : "text-slate-500"}`}>
                              Target: {o.targetDateFormatted}
                            </span>
                          )}
                        </td>
                        {/* Test Completion — the core feature */}
                        <td className="py-4 px-5">
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-800 flex items-center gap-1.5"><span className={`w-1.5 h-1.5 rounded-full ${isCompleted ? "bg-emerald-500" : isInProgress ? "bg-amber-500 animate-pulse" : "bg-slate-400"}`} />{o.completedTests} of {o.totalTests} Tests Completed</span>
                              <span className={`font-extrabold text-[11px] ${isCompleted ? "text-emerald-700" : isInProgress ? "text-amber-700" : "text-slate-500"}`}>{o.completionPct}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full transition-all ${isCompleted ? "bg-emerald-500" : isInProgress ? "bg-amber-500" : "bg-slate-300"}`} style={{ width: `${o.completionPct}%` }} /></div>
                            <div className="flex flex-wrap gap-1 pt-0.5">
                              {o.tests.slice(0, 3).map((t) => {
                                const testOverdue = isTestOverdue(t, o.orderStatus);
                                return (
                                  <span
                                    key={t.id}
                                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                                      testOverdue
                                        ? "bg-rose-100 text-rose-900 border-rose-300 ring-1 ring-rose-400 font-bold"
                                        : t.status === "COMPLETED"
                                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                        : t.status === "IN_PROGRESS"
                                        ? "bg-amber-50 text-amber-800 border-amber-200"
                                        : t.status === "VERIFIED"
                                        ? "bg-blue-50 text-blue-700 border-blue-200"
                                        : "bg-slate-50 text-slate-600 border-slate-200"
                                    }`}
                                    title={`${t.testName} — ${t.statusLabel}${testOverdue ? " (OVERDUE)" : ""}`}
                                  >
                                    {t.testCode}
                                    {testOverdue && (
                                      <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse" />
                                    )}
                                    {t.status === "COMPLETED" ? (
                                      <svg className="w-2.5 h-2.5 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                                    ) : t.status === "IN_PROGRESS" && !testOverdue ? (
                                      <span className="w-1 h-1 rounded-full bg-amber-500" />
                                    ) : null}
                                  </span>
                                );
                              })}
                              {o.tests.length > 3 && (
                                <span
                                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 transition-colors"
                                  title={o.tests.slice(3).map((t) => `${t.testCode} (${t.testName})`).join(", ")}
                                >
                                  +{o.tests.length - 3} more
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        {/* Status */}
                        <td className="py-4 px-5">
                          {isOverdue ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse" />OVERDUE
                            </span>
                          ) : isCompleted ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Completed
                            </span>
                          ) : isInProgress ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />In Progress
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />Pending
                            </span>
                          )}
                        </td>
                        {/* Action */}
                        <td className="py-4 px-5 text-right">
                          <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedOrder(o); setDrawerOpen(true); }} className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:text-white hover:bg-[#0b4a8b] hover:border-[#0b4a8b] text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1">
                            Breakdown <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Footer */}
            <div className="p-4 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Showing <strong>{filtered.length}</strong> of <strong>{orders.length}</strong> orders</span>
              <span className="text-[11px] text-slate-400">Refreshed {lastRefreshed.toLocaleTimeString()}</span>
            </div>
          </section>
        </main>
      </div>

      {/* ======== DETAIL DRAWER ======== */}
      {drawerOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={() => setDrawerOpen(false)} />
          <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl z-10 flex flex-col overflow-hidden">
            {/* Drawer header */}
            <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-[#0b4a8b] flex items-center justify-center font-extrabold text-base">{selectedOrder.patientName.charAt(0)}</div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-extrabold text-slate-900">Order {selectedOrder.orderId}</h2>
                    {selectedOrder.priority === "URGENT" && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">URGENT</span>}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
                    <span>{new Date(selectedOrder.orderDatetime).toLocaleString()}</span>
                    {selectedOrder.targetDateFormatted && selectedOrder.targetDateFormatted !== "—" && (
                      <span className={`inline-flex items-center gap-1 font-semibold ${isOrderOverdue(selectedOrder) ? "text-rose-700 font-bold" : "text-slate-700"}`}>
                        · <CalendarIcon className="w-3.5 h-3.5 shrink-0" /> Target Date: {selectedOrder.targetDateFormatted}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button type="button" onClick={() => setDrawerOpen(false)} className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 flex items-center justify-center cursor-pointer">✕</button>
            </div>

            {/* Drawer body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Overdue alert banner if order is overdue */}
              {isOrderOverdue(selectedOrder) && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-between text-rose-900 gap-3">
                  <div className="flex items-center gap-2.5">
                    <Clock className="w-4 h-4 text-rose-600 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-rose-900">Order Exceeded Target Date ({selectedOrder.targetDateFormatted})</p>
                      <p className="text-[11px] text-rose-700">Immediate lab attention is required to expedite overdue test(s).</p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-600 text-white tracking-wider uppercase shrink-0">
                    OVERDUE
                  </span>
                </div>
              )}

              {/* Progress banner */}
              <div className={`p-4 rounded-xl border ${selectedOrder.orderStatus === "COMPLETED" ? "bg-emerald-50/70 border-emerald-200" : selectedOrder.orderStatus === "IN_PROGRESS" ? "bg-amber-50/70 border-amber-200" : "bg-slate-50 border-slate-200"}`}>
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Status</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${selectedOrder.orderStatus === "COMPLETED" ? "bg-emerald-100 text-emerald-800 border border-emerald-200" : selectedOrder.orderStatus === "IN_PROGRESS" ? "bg-amber-100 text-amber-800 border border-amber-200" : "bg-slate-200 text-slate-700 border border-slate-300"}`}>
                      {selectedOrder.orderStatus === "COMPLETED" ? "Completed" : selectedOrder.orderStatus === "IN_PROGRESS" ? "In Progress" : "Pending"}
                    </span>
                    {selectedOrder.targetDateFormatted && selectedOrder.targetDateFormatted !== "—" && (
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                        isOrderOverdue(selectedOrder)
                          ? "bg-rose-100 text-rose-800 border-rose-300"
                          : "bg-blue-50 text-[#0b4a8b] border-blue-200"
                      }`}>
                        <CalendarIcon className="w-3 h-3 shrink-0" />
                        Target Date: {selectedOrder.targetDateFormatted}
                        {isOrderOverdue(selectedOrder) && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-rose-600 text-white uppercase ml-0.5">
                            OVERDUE
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                  <span className={`text-sm font-extrabold ${selectedOrder.orderStatus === "COMPLETED" ? "text-emerald-700" : selectedOrder.orderStatus === "IN_PROGRESS" ? "text-amber-700" : "text-slate-600"}`}>{selectedOrder.completedTests} of {selectedOrder.totalTests} Tests ({selectedOrder.completionPct}%)</span>
                </div>
                <div className="w-full h-2.5 bg-white/80 rounded-full overflow-hidden border border-slate-200">
                  <div className={`h-full rounded-full transition-all duration-500 ${selectedOrder.orderStatus === "COMPLETED" ? "bg-emerald-500" : selectedOrder.orderStatus === "IN_PROGRESS" ? "bg-amber-500" : "bg-slate-300"}`} style={{ width: `${selectedOrder.completionPct}%` }} />
                </div>
              </div>

              {/* Patient & Doctor cards */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Patient</span>
                  <h4 className="text-sm font-bold text-slate-900">{selectedOrder.patientName}</h4>
                  <p className="text-xs text-slate-500">UHID: {selectedOrder.patientId}{selectedOrder.patientGender ? ` · ${selectedOrder.patientGender}` : ""}{selectedOrder.patientAge ? ` · ${selectedOrder.patientAge}y` : ""}</p>
                  {selectedOrder.patientMobile && <p className="text-xs text-slate-500">📞 {selectedOrder.patientMobile}</p>}
                  {selectedOrder.patientAddress && <p className="text-[11px] text-slate-400 truncate">{selectedOrder.patientAddress}</p>}
                </div>
                <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ordering Physician</span>
                  <h4 className="text-sm font-bold text-slate-900">{selectedOrder.doctorName}</h4>
                  <p className="text-xs text-slate-500">{selectedOrder.doctorDepartment}</p>
                  {selectedOrder.visitType && <p className="text-xs text-blue-600 font-medium">Visit: {selectedOrder.visitType}</p>}
                  {selectedOrder.clinicalNotes && <p className="text-[11px] text-slate-600 italic line-clamp-2">&quot;{selectedOrder.clinicalNotes}&quot;</p>}
                </div>
              </div>

              {/* Test breakdown */}
              <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">Tests Breakdown <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{selectedOrder.tests.length} tests</span></h3>
                  {selectedOrder.targetDateFormatted && selectedOrder.targetDateFormatted !== "—" && (
                    <span className={`text-xs font-semibold flex items-center gap-1.5 ${isOrderOverdue(selectedOrder) ? "text-rose-700 font-bold" : "text-slate-600"}`}>
                      <CalendarIcon className="w-3.5 h-3.5 shrink-0" />
                      <span>Target: <strong>{selectedOrder.targetDateFormatted}</strong></span>
                    </span>
                  )}
                </div>
                {selectedOrder.tests.map((t) => {
                  const done = t.status === "COMPLETED";
                  const testing = t.status === "IN_PROGRESS";
                  const testOverdue = isTestOverdue(t, selectedOrder.orderStatus);
                  return (
                    <div
                      key={t.id}
                      className={`p-4 rounded-xl border transition-all ${
                        testOverdue
                          ? "border-rose-300 bg-rose-50/40 ring-1 ring-rose-200"
                          : "border-slate-200 hover:border-slate-300 bg-white"
                      } space-y-2.5`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${
                              testOverdue ? "bg-rose-100 text-rose-800 border-rose-200" : "bg-blue-50 text-[#0b4a8b] border-blue-100"
                            }`}>
                              {t.testCode}
                            </span>
                            <h4 className="text-sm font-bold text-slate-900">{t.testName}</h4>
                            {testOverdue && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-rose-600 text-white tracking-wider uppercase">
                                OVERDUE
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">Specimen: <strong className="text-slate-700">{t.sampleType}</strong></p>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1 ${done ? "bg-emerald-100 text-emerald-800 border border-emerald-200" : "bg-slate-100 text-slate-700 border border-slate-200"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${done ? "bg-emerald-600" : "bg-slate-400"}`} />{done ? "Completed" : "Pending"}
                        </span>
                      </div>
                      {/* Barcode */}
                      <div className="flex items-center justify-between text-xs text-slate-600 pt-1.5 border-t border-slate-100 flex-wrap gap-2">
                        {t.barcode ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-400">Barcode:</span>
                            <code className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded font-mono font-bold text-[11px]">{t.barcode}</code>
                            <button type="button" onClick={() => copyBarcode(t.barcode!)} className="text-blue-600 hover:text-blue-800 text-[11px] font-semibold cursor-pointer">{copiedBarcode === t.barcode ? "Copied!" : "Copy"}</button>
                          </div>
                        ) : <span className="text-slate-400 italic text-[11px]">No barcode yet</span>}
                        <div className="flex items-center gap-3">
                          {(t.targetDate || selectedOrder.targetDateFormatted) && (t.targetDate || selectedOrder.targetDateFormatted) !== "—" && (
                            <span className={`text-[11px] font-medium flex items-center gap-1.5 ${isTestOverdue(t, selectedOrder.orderStatus) ? "text-rose-700" : "text-slate-600"}`}>
                              <CalendarIcon className="w-3.5 h-3.5 shrink-0" />
                              <span>Target Date: <strong className={isTestOverdue(t, selectedOrder.orderStatus) ? "text-rose-900 font-bold" : "text-slate-800"}>{t.targetDate || selectedOrder.targetDateFormatted}</strong></span>
                              {isTestOverdue(t, selectedOrder.orderStatus) && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                  Overdue
                                </span>
                              )}
                            </span>
                          )}
                          {t.completedAt && <span className="text-[11px] text-slate-500">{t.completedAt}</span>}
                        </div>
                      </div>
                      {/* Findings / Results */}
                      {t.resultSummary && <div className="p-2 rounded-lg bg-emerald-50/60 border border-emerald-100 text-xs text-emerald-950"><span className="text-[10px] font-bold text-emerald-800 uppercase block mb-0.5">Findings:</span>{t.resultSummary}</div>}
                      {t.parameters && t.parameters.length > 0 && (
                        <div className="overflow-x-auto rounded-lg border border-slate-100">
                          <table className="w-full text-left text-[11px]">
                            <thead className="bg-slate-50 text-slate-500 font-bold"><tr><th className="py-1 px-2">Parameter</th><th className="py-1 px-2">Result</th><th className="py-1 px-2">Unit</th><th className="py-1 px-2">Reference</th></tr></thead>
                            <tbody className="divide-y divide-slate-100">{t.parameters.map((p, i) => <tr key={i}><td className="py-1 px-2 font-medium text-slate-800">{p.parameter}</td><td className="py-1 px-2 font-bold text-emerald-800">{p.result}</td><td className="py-1 px-2 text-slate-500">{p.unit || "—"}</td><td className="py-1 px-2 text-slate-500">{p.referenceRange || "—"}</td></tr>)}</tbody>
                          </table>
                        </div>
                      )}
                      {/* Bench link */}
                      <div className="flex justify-end">
                        {!done && <button type="button" onClick={() => { setDrawerOpen(false); navigate("/lab/testing-samples"); }} className="text-xs text-blue-600 hover:text-blue-800 font-bold hover:underline cursor-pointer">Go to Testing →</button>}
                        {done && <button type="button" onClick={() => { setDrawerOpen(false); navigate("/lab/report-generation"); }} className="text-xs text-emerald-700 hover:text-emerald-900 font-bold hover:underline cursor-pointer">View Report →</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Drawer footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50/80 flex items-center justify-between">
              <span className="text-xs text-slate-500">Order: <strong>{selectedOrder.orderId}</strong></span>
              <button type="button" onClick={() => setDrawerOpen(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-bold cursor-pointer">Close</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmationDialog open={logoutOpen} title="Confirm Logout" description="Are you sure you want to log out?" confirmText="Log Out" cancelText="Cancel" onConfirm={handleLogout} onCancel={() => setLogoutOpen(false)} type="danger" />
    </div>
  );
}