import React, { useState, useMemo, useEffect, useCallback } from "react";
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
import { labReportApi } from "@/api/labReport.api";
import { UserProfileDropdown } from "@/components/ui/User_profile_dropdown";
import { ConfirmationDialog } from "@/components/ui/ConfirmationDialog";
import { LabNotificationBell } from "@/components/hms/LabNotificationBell";

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
}

interface TrackedOrder {
  id: string;
  orderId: string;
  orderDatetime: string;
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
  const [activeTab, setActiveTab] = useState<"ALL" | "COMPLETED" | "IN_PROGRESS" | "PENDING">("ALL");
  const [priorityFilter, setPriorityFilter] = useState<"ALL" | "URGENT" | "ROUTINE">("ALL");

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
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  /* ---------- fetch & map ---------- */
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [ordersRes, itemsRes, patientsRes] = await Promise.all([
        labOrderApi.getAll().catch(() => ({ data: { data: [] } })),
        labOrderItemApi.getAll().catch(() => ({ data: { data: [] } })),
        patientApi.getAll({ limit: 200 }).catch(() => ({ data: { data: { patients: [] } } })),
      ]);

      const dbOrders: LabOrderRecord[] = ordersRes?.data?.data || [];
      const dbItems: LabOrderItemRecord[] = itemsRes?.data?.data || [];
      const dbPatients: PatientRecord[] = patientsRes?.data?.data?.patients || [];

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

          // status
          let status: OrderTestItem["status"] = "PENDING";
          let statusLabel = "Pending";
          if (rawStatus === "COMPLETED" || lsStatus === "COMPLETED") {
            status = "COMPLETED"; statusLabel = "Completed";
          } else if (rawStatus === "RUNNING" || rawStatus === "IN_PROGRESS" || rawStatus === "IN PROGRESS" || lsStatus === "RUNNING") {
            status = "IN_PROGRESS"; statusLabel = "In Testing";
          } else if (rawStatus === "VERIFIED" || rawStatus === "COLLECTED") {
            status = "VERIFIED"; statusLabel = "Specimen Verified";
          } else if (rawStatus === "REJECTED") {
            status = "REJECTED"; statusLabel = "Rejected";
          } else if (rawStatus.includes("BARCODE") || barcode) {
            status = "VERIFIED"; statusLabel = "Barcode Assigned";
          }

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
        let inProgressTests = finalTests.filter((t) => t.status === "IN_PROGRESS" || t.status === "VERIFIED").length;
        let pendingTests = finalTests.filter((t) => t.status === "PENDING" || t.status === "REJECTED").length;
        let completionPct = totalTests > 0 ? Math.round((completedTests / totalTests) * 100) : 0;

        let orderStatus: TrackedOrder["orderStatus"] = "PENDING";
        if (isDbCompleted || completionPct === 100 || (totalTests > 0 && completedTests === totalTests)) {
          orderStatus = "COMPLETED";
          completionPct = 100;
          completedTests = totalTests;
          inProgressTests = 0;
          pendingTests = 0;
          finalTests = finalTests.map((t) => ({
            ...t,
            status: "COMPLETED" as const,
            statusLabel: "Completed",
            completedAt: t.completedAt || (order.updated_at ? new Date(order.updated_at).toLocaleString() : new Date().toLocaleString()),
          }));
        } else if (
          isDbInProgress ||
          completedTests > 0 ||
          inProgressTests > 0 ||
          completionPct > 0 ||
          finalTests.some((t) => !!t.barcode) ||
          (typeof window !== "undefined" && !!localStorage.getItem(`generated_barcode_${order.lab_order_id}`))
        ) {
          orderStatus = "IN_PROGRESS";
          if (completedTests === 0 && inProgressTests === 0 && isDbInProgress) {
            inProgressTests = totalTests;
            pendingTests = 0;
            finalTests = finalTests.map((t) => ({
              ...t,
              status: "IN_PROGRESS" as const,
              statusLabel: rawOrderStatus === "COLLECTED" ? "Specimen Collected" : "In Progress",
            }));
          }
        } else {
          orderStatus = "PENDING";
        }

        const rawP = (order.priority || "Normal").toUpperCase();
        let priority: TrackedOrder["priority"] = "ROUTINE";
        if (rawP.includes("STAT") || rawP.includes("URGENT")) priority = "URGENT";

        return {
          id: order.lab_order_id,
          orderId: order.lab_order_id,
          orderDatetime: order.order_datetime || order.created_at || new Date().toISOString(),
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

  /* ---------- metrics ---------- */
  const metrics = useMemo(() => {
    const total = orders.length;
    const completed = orders.filter((o) => o.orderStatus === "COMPLETED").length;
    const inProgress = orders.filter((o) => o.orderStatus === "IN_PROGRESS").length;
    const pending = orders.filter((o) => o.orderStatus === "PENDING").length;
    const totalTests = orders.reduce((a, o) => a + o.totalTests, 0);
    const doneTests = orders.reduce((a, o) => a + o.completedTests, 0);
    const testPct = totalTests > 0 ? Math.round((doneTests / totalTests) * 100) : 0;
    const orderPct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, inProgress, pending, totalTests, doneTests, testPct, orderPct };
  }, [orders]);

  /* ---------- filtered list ---------- */
  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (activeTab === "COMPLETED" && o.orderStatus !== "COMPLETED") return false;
      if (activeTab === "IN_PROGRESS" && o.orderStatus !== "IN_PROGRESS") return false;
      if (activeTab === "PENDING" && o.orderStatus !== "PENDING") return false;
      if (priorityFilter !== "ALL" && o.priority !== priorityFilter) return false;
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
  }, [orders, activeTab, priorityFilter, searchQuery]);

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
            <button type="button" onClick={fetchData} disabled={isLoading} className="p-2 rounded-xl border border-slate-200 hover:border-slate-300 bg-white text-slate-600 hover:text-slate-900 shadow-xs transition-all cursor-pointer disabled:opacity-50" title="Refresh">
              <svg className={`w-4 h-4 ${isLoading ? "animate-spin text-blue-600" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </button>
            <LabNotificationBell size="md" />
            <UserProfileDropdown userName={displayName} userSubtext={displayRole} userAvatar={avatarUrl} onLogout={() => setLogoutOpen(true)} profilePath="/lab/profile" hideNotifications />
          </div>
        </header>

        {/* ---- Body ---- */}
        <main className="flex-1 p-8 space-y-7 max-w-[1650px] w-full mx-auto">

          {/* ======== KPI CARDS ======== */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Total */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Lab Orders</span>
                <h3 className="text-2xl font-extrabold text-slate-900 mt-1">{metrics.total}</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">{metrics.totalTests} tests requested</p>
              </div>
              <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
              </div>
            </div>
            {/* Completed */}
            <div className="bg-white rounded-2xl p-5 border border-emerald-200/80 shadow-xs flex items-center justify-between relative overflow-hidden">
              <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-50 rounded-full blur-2xl -mr-5 -mt-5 pointer-events-none" />
              <div className="relative">
                <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">Orders Completed</span>
                <div className="flex items-baseline gap-2 mt-1"><h3 className="text-2xl font-extrabold text-emerald-950">{metrics.completed}</h3><span className="text-xs font-bold text-emerald-700">{metrics.orderPct}%</span></div>
                <p className="text-[11px] text-emerald-600/80 mt-0.5">All tests done & signed</p>
              </div>
              <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 relative">
                <svg className="w-5 h-5 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
              </div>
            </div>
            {/* In Progress */}
            <div className="bg-white rounded-2xl p-5 border border-amber-200/80 shadow-xs flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5"><span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">Orders In Progress</span><span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /></div>
                <h3 className="text-2xl font-extrabold text-amber-950 mt-1">{metrics.inProgress}</h3>
                <p className="text-[11px] text-amber-600/80 mt-0.5">Partial completion</p>
              </div>
              <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 stroke-[2]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0118 0Z" /></svg>
              </div>
            </div>
            {/* Pending */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Orders Pending</span>
                <h3 className="text-2xl font-extrabold text-slate-900 mt-1">{metrics.pending}</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">0% tests completed</p>
              </div>
              <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 stroke-[2]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082" /></svg>
              </div>
            </div>
            {/* Tests Progress */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Tests Progress</span>
                <div className="flex items-baseline gap-2 mt-1"><h3 className="text-2xl font-extrabold text-[#0b4a8b]">{metrics.doneTests}/{metrics.totalTests}</h3><span className="text-xs font-bold text-blue-700">{metrics.testPct}%</span></div>
                <div className="w-32 h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden"><div className="h-full bg-[#0b4a8b] rounded-full transition-all duration-500" style={{ width: `${metrics.testPct}%` }} /></div>
              </div>
              <div className="w-11 h-11 rounded-xl bg-indigo-50 text-[#0b4a8b] flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 stroke-[2]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 1 0 7.5 7.5h-7.5V6Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0 0 13.5 3v7.5Z" /></svg>
              </div>
            </div>
          </section>

          {/* ======== ORDERS TABLE ======== */}
          <section className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
            {/* Filter bar */}
            <div className="p-5 border-b border-slate-100 space-y-3">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                {/* Tabs */}
                <div className="flex items-center gap-1 p-1 bg-slate-100/90 rounded-xl overflow-x-auto">
                  {([
                    ["ALL", `All (${metrics.total})`],
                    ["COMPLETED", `Orders Completed (${metrics.completed})`],
                    ["IN_PROGRESS", `Orders In Progress (${metrics.inProgress})`],
                    ["PENDING", `Orders Pending (${metrics.pending})`],
                  ] as const).map(([key, label]) => (
                    <button key={key} type="button" onClick={() => setActiveTab(key)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${activeTab === key ? (key === "COMPLETED" ? "bg-emerald-600 text-white" : key === "IN_PROGRESS" ? "bg-amber-600 text-white" : "bg-white text-slate-900 shadow-xs") : "text-slate-600 hover:text-slate-900"}`}>
                      {label}
                    </button>
                  ))}
                </div>
                {/* Priority */}
                <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as any)} className="text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-blue-500 cursor-pointer">
                  <option value="ALL">Priority: All</option>
                  <option value="URGENT">Urgent</option>
                  <option value="ROUTINE">Routine</option>
                </select>
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
                    <th className="py-3 px-5">Order ID</th>
                    <th className="py-3 px-5">Patient</th>
                    <th className="py-3 px-5">Doctor</th>
                    <th className="py-3 px-5 min-w-[260px]">Test Completion</th>
                    <th className="py-3 px-5">Status</th>
                    <th className="py-3 px-5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {isLoading ? (
                    <tr><td colSpan={6} className="py-16 text-center text-slate-400"><div className="flex flex-col items-center gap-2"><svg className="w-8 h-8 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg><span className="font-medium">Loading orders…</span></div></td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={6} className="py-16 text-center text-slate-400"><span className="font-semibold text-slate-600 block">No lab orders found</span><span className="text-[11px]">Try changing filters or search query.</span></td></tr>
                  ) : filtered.map((o) => {
                    const isCompleted = o.orderStatus === "COMPLETED";
                    const isInProgress = o.orderStatus === "IN_PROGRESS";
                    return (
                      <tr key={o.id} className="hover:bg-slate-50/80 transition-colors group cursor-pointer" onClick={() => { setSelectedOrder(o); setDrawerOpen(true); }}>
                        {/* Order ID */}
                        <td className="py-4 px-5">
                          <span className="font-bold text-slate-900 group-hover:text-[#0b4a8b] block">{o.orderId}</span>
                          {o.priority === "URGENT" ? <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">URGENT</span> : <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500">ROUTINE</span>}
                          <span className="text-[11px] text-slate-400 block mt-0.5">{new Date(o.orderDatetime).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</span>
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
                        {/* Test Completion — the core feature */}
                        <td className="py-4 px-5">
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-800 flex items-center gap-1.5"><span className={`w-1.5 h-1.5 rounded-full ${isCompleted ? "bg-emerald-500" : isInProgress ? "bg-amber-500 animate-pulse" : "bg-slate-400"}`} />{o.completedTests} of {o.totalTests} Tests Completed</span>
                              <span className={`font-extrabold text-[11px] ${isCompleted ? "text-emerald-700" : isInProgress ? "text-amber-700" : "text-slate-500"}`}>{o.completionPct}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full transition-all ${isCompleted ? "bg-emerald-500" : isInProgress ? "bg-amber-500" : "bg-slate-300"}`} style={{ width: `${o.completionPct}%` }} /></div>
                            <div className="flex flex-wrap gap-1 pt-0.5">
                              {o.tests.slice(0, 3).map((t) => (
                                <span key={t.id} className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${t.status === "COMPLETED" ? "bg-emerald-50 text-emerald-800 border-emerald-200" : t.status === "IN_PROGRESS" ? "bg-amber-50 text-amber-800 border-amber-200" : t.status === "VERIFIED" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-slate-50 text-slate-600 border-slate-200"}`} title={`${t.testName} — ${t.statusLabel}`}>
                                  {t.testCode}
                                  {t.status === "COMPLETED" ? <svg className="w-2.5 h-2.5 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg> : t.status === "IN_PROGRESS" ? <span className="w-1 h-1 rounded-full bg-amber-500" /> : null}
                                </span>
                              ))}
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
                          {isCompleted ? (
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
                  <p className="text-xs text-slate-500">{new Date(selectedOrder.orderDatetime).toLocaleString()}</p>
                </div>
              </div>
              <button type="button" onClick={() => setDrawerOpen(false)} className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 flex items-center justify-center cursor-pointer">✕</button>
            </div>

            {/* Drawer body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Progress banner */}
              <div className={`p-4 rounded-xl border ${selectedOrder.orderStatus === "COMPLETED" ? "bg-emerald-50/70 border-emerald-200" : selectedOrder.orderStatus === "IN_PROGRESS" ? "bg-amber-50/70 border-amber-200" : "bg-slate-50 border-slate-200"}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Status</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${selectedOrder.orderStatus === "COMPLETED" ? "bg-emerald-100 text-emerald-800 border border-emerald-200" : selectedOrder.orderStatus === "IN_PROGRESS" ? "bg-amber-100 text-amber-800 border border-amber-200" : "bg-slate-200 text-slate-700 border border-slate-300"}`}>
                      {selectedOrder.orderStatus === "COMPLETED" ? "Completed" : selectedOrder.orderStatus === "IN_PROGRESS" ? "In Progress" : "Pending"}
                    </span>
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
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">Tests Breakdown <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{selectedOrder.tests.length} tests</span></h3>
                {selectedOrder.tests.map((t) => {
                  const done = t.status === "COMPLETED";
                  const testing = t.status === "IN_PROGRESS";
                  return (
                    <div key={t.id} className="p-4 rounded-xl border border-slate-200 hover:border-slate-300 bg-white space-y-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2"><span className="text-xs font-bold px-1.5 py-0.5 rounded bg-blue-50 text-[#0b4a8b] border border-blue-100">{t.testCode}</span><h4 className="text-sm font-bold text-slate-900">{t.testName}</h4></div>
                          <p className="text-xs text-slate-500 mt-0.5">Specimen: <strong className="text-slate-700">{t.sampleType}</strong></p>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1 ${done ? "bg-emerald-100 text-emerald-800" : testing ? "bg-amber-100 text-amber-800" : t.status === "VERIFIED" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-600"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${done ? "bg-emerald-600" : testing ? "bg-amber-600" : t.status === "VERIFIED" ? "bg-blue-600" : "bg-slate-400"}`} />{t.statusLabel}
                        </span>
                      </div>
                      {/* Barcode */}
                      <div className="flex items-center justify-between text-xs text-slate-600 pt-1.5 border-t border-slate-100">
                        {t.barcode ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-400">Barcode:</span>
                            <code className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded font-mono font-bold text-[11px]">{t.barcode}</code>
                            <button type="button" onClick={() => copyBarcode(t.barcode!)} className="text-blue-600 hover:text-blue-800 text-[11px] font-semibold cursor-pointer">{copiedBarcode === t.barcode ? "Copied!" : "Copy"}</button>
                          </div>
                        ) : <span className="text-slate-400 italic text-[11px]">No barcode yet</span>}
                        {t.completedAt && <span className="text-[11px] text-slate-500">{t.completedAt}</span>}
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

      <ConfirmationDialog isOpen={logoutOpen} title="Confirm Logout" message="Are you sure you want to log out?" confirmText="Log Out" cancelText="Cancel" onConfirm={handleLogout} onCancel={() => setLogoutOpen(false)} variant="danger" />
    </div>
  );
}
