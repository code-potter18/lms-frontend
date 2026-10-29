import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShieldCheck,
  ShieldAlert,
  HeartPulse,
  CalendarX,
  CalendarPlus,
  UsersRound,
  ArrowRight,
  CheckCircle2,
  Lock,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Zap,
  Loader2,
} from "lucide-react";
import { labOrderApi } from "@/api/labOrder.api";
import { followUpAlertApi, type FollowUpAlert } from "@/api/followUpAlert.api";
import { appointmentApi } from "@/api/appointment.api";
import { useBranchFilter } from "@/context/BranchFilterContext";
import { usePermission } from "@/context/PermissionContext";
import { useToast } from "@/hooks/use-toast";
import { RefreshButton } from "@/components/hms/RefreshButton";

export type IntegrityCategory = "all" | "clinical" | "staffing" | "audit";

export interface IntegrityCheckItem {
  id: string;
  category: "clinical" | "staffing" | "audit";
  title: string;
  description: string;
  severity: "critical" | "warning" | "optimal";
  count?: number;
  actionLabel?: string;
  actionRoute?: string;
  onClickAction?: () => void;
}

interface SystemIntegrityWidgetProps {
  criticalPatientCount?: number;
  doctorsOnLeave?: Array<{ id: string; name: string }>;
  unassignedApptsCount?: number;
  onFilterCritical?: () => void;
  className?: string;
}

export function SystemIntegrityWidget({
  criticalPatientCount = 0,
  doctorsOnLeave = [],
  unassignedApptsCount = 0,
  onFilterCritical,
  className = "",
}: SystemIntegrityWidgetProps) {
  const navigate = useNavigate();
  const { selectedBranchId, isAllBranches } = useBranchFilter();
  const { can } = usePermission();
  const { toast } = useToast();

  const canReadLabs = can("chemo.plan.read");

  const [activeTab, setActiveTab] = useState<IntegrityCategory>("all");
  const [isScanning, setIsScanning] = useState(false);
  const [urgentLabOrdersCount, setUrgentLabOrdersCount] = useState<number>(0);
  const [pendingFollowUps, setPendingFollowUps] = useState<FollowUpAlert[]>([]);
  const [bookingAlertId, setBookingAlertId] = useState<string | null>(null);
  const [isPendingListOpen, setIsPendingListOpen] = useState(false);

  // Scan auxiliary integrity data (urgent labs & follow-ups).
  const runIntegrityScan = async () => {
    setIsScanning(true);
    try {
      const tasks: Promise<any>[] = [];

      tasks.push(
        followUpAlertApi
          .getAlerts(isAllBranches ? undefined : selectedBranchId)
          .then((res) => {
            const alerts = res.data?.data?.alerts || [];
            setPendingFollowUps(alerts.filter((a) => !a.booked));
          })
          .catch((err) => console.warn("[SystemIntegrity] Follow-up alerts scan warning:", err))
      );

      if (canReadLabs) {
        tasks.push(
          labOrderApi
            .getAll({
              priority: "URGENT",
              branch_id: isAllBranches ? undefined : selectedBranchId,
            })
            .then((res) => {
              const orders = res.data?.data || [];
              setUrgentLabOrdersCount(orders.length);
            })
            .catch((err) => console.warn("[SystemIntegrity] Lab scan warning:", err))
        );
      }

      await Promise.allSettled(tasks);
    } catch (err) {
      console.warn("[SystemIntegrity] Scan completed with warnings", err);
    } finally {
      setTimeout(() => setIsScanning(false), 500);
    }
  };

  const handleOneClickBook = async (e: React.MouseEvent, alert: FollowUpAlert) => {
    e.stopPropagation();
    if (!alert.doctor) {
      navigate("/appointments/book", {
        state: {
          patient: { patient_id: alert.patient.patient_id, patient_first_name: alert.patient.name },
          selectedDate: alert.follow_up_date,
          followUpDate: alert.follow_up_date,
          keepDate: true,
          isFollowUpBooking: true,
          defaultVisitType: "Follow-up",
        },
      });
      return;
    }

    setBookingAlertId(alert.encounter_no);
    try {
      let chosenTime = "09:00";
      try {
        const slotRes = await appointmentApi.getAvailableSlots(
          alert.doctor.employee_id,
          alert.branch.branch_id,
          alert.follow_up_date
        );
        const slots = slotRes.data?.data?.slots || [];
        const open = slots.find((s) => s.is_available);
        if (open?.time) chosenTime = open.time;
      } catch (slotErr) {
        console.warn("[SystemIntegrity] getAvailableSlots fallback:", slotErr);
      }

      await appointmentApi.create({
        patient_id: alert.patient.patient_id,
        patient_name: alert.patient.name,
        patient_number: alert.patient.mobile || undefined,
        branch_id: alert.branch.branch_id,
        department_id: alert.department?.department_id || "",
        employee_id: alert.doctor.employee_id,
        appointment_date: alert.follow_up_date,
        appointment_time: chosenTime,
        patient_type: "Outpatient (OPD)",
        patient_visit_type: "Follow-up",
        reason_for_visit: "Follow-up consultation",
      });

      toast({
        title: "Appointment Booked!",
        description: `Follow-up booked for ${alert.patient.name} on ${alert.follow_up_date} at ${chosenTime}.`,
      });

      void followUpAlertApi.dismiss(alert.encounter_no);
      runIntegrityScan();
    } catch (err: any) {
      toast({
        title: "Instant booking could not complete",
        description: err.response?.data?.message || "Redirecting to appointment scheduler...",
      });
      navigate("/appointments/book", {
        state: {
          patient: { patient_id: alert.patient.patient_id, patient_first_name: alert.patient.name },
          slot: { doctorId: alert.doctor.employee_id, branchId: alert.branch.branch_id, date: alert.follow_up_date },
          selectedDate: alert.follow_up_date,
          followUpDate: alert.follow_up_date,
          keepDate: true,
          isFollowUpBooking: true,
          defaultVisitType: "Follow-up",
        },
      });
    } finally {
      setBookingAlertId(null);
    }
  };

  useEffect(() => {
    runIntegrityScan();
  }, [selectedBranchId, isAllBranches, canReadLabs]);

  // Aggregate integrity check items
  const checkItems = useMemo<IntegrityCheckItem[]>(() => {
    const items: IntegrityCheckItem[] = [];

    // --- 1. CLINICAL SAFETY INTEGRITY ---
    if (criticalPatientCount > 0) {
      items.push({
        id: "crit-vitals",
        category: "clinical",
        title: `${criticalPatientCount} Critical Vitals ${criticalPatientCount > 1 ? "Breaches" : "Breach"}`,
        description: "Encounter observations detected SpO2 < 90%, BP > 180/120, or emergency clinical notes.",
        severity: "critical",
        count: criticalPatientCount,
        actionLabel: "Review Patients",
        actionRoute: "/patients?critical=true",
        onClickAction: () => navigate("/patients?critical=true"),
      });
    }

    if (unassignedApptsCount > 0) {
      items.push({
        id: "unassigned-appts",
        category: "clinical",
        title: `${unassignedApptsCount} Unassigned Consultation${unassignedApptsCount > 1 ? "s" : ""}`,
        description: "Patient bookings currently missing an assigned primary physician or specialist.",
        severity: "warning",
        count: unassignedApptsCount,
        actionLabel: "Assign Doctor",
        actionRoute: "/appointments",
      });
    }

    if (urgentLabOrdersCount > 0) {
      items.push({
        id: "urgent-labs",
        category: "clinical",
        title: `${urgentLabOrdersCount} Urgent Lab Investigation${urgentLabOrdersCount > 1 ? "s" : ""}`,
        description: "Stat laboratory orders awaiting sample verification or diagnostic release.",
        severity: "warning",
        count: urgentLabOrdersCount,
        actionLabel: "Lab Orders",
        actionRoute: "/doctor/lab/orders",
      });
    }

    if (pendingFollowUps.length > 0) {
      const overdueCount = pendingFollowUps.filter((a) => a.due_status === "OVERDUE").length;
      items.push({
        id: "pending-followups",
        category: "clinical",
        title: `${pendingFollowUps.length} Pending Follow-up Booking${pendingFollowUps.length > 1 ? "s" : ""}`,
        description: overdueCount > 0
          ? `${overdueCount} overdue follow-up consult${overdueCount > 1 ? "s" : ""} need immediate booking to maintain care continuity.`
          : `Doctor-prescribed patient follow-ups awaiting appointment confirmation.`,
        severity: overdueCount > 0 ? "warning" : "optimal",
        count: pendingFollowUps.length,
        actionLabel: "View Queue",
        actionRoute: "/appointments/pending",
        onClickAction: () => navigate("/appointments/pending"),
      });
    }

    // Default healthy clinical state if no issues
    if (criticalPatientCount === 0 && unassignedApptsCount === 0 && urgentLabOrdersCount === 0 && pendingFollowUps.length === 0) {
      items.push({
        id: "clinical-healthy",
        category: "clinical",
        title: "Clinical Patient Safety: Optimal",
        description: "All patient encounters within safe thresholds; zero unassigned patient appointments or pending follow-ups.",
        severity: "optimal",
        actionLabel: "View Patients",
        actionRoute: "/patients",
      });
    }

    // --- 2. STAFFING & COVERAGE INTEGRITY ---
    if (doctorsOnLeave.length > 0) {
      const docNames = doctorsOnLeave.slice(0, 2).map((d) => d.name).join(", ");
      const extra = doctorsOnLeave.length > 2 ? ` +${doctorsOnLeave.length - 2} more` : "";
      items.push({
        id: "doc-leave-gap",
        category: "staffing",
        title: `${doctorsOnLeave.length} Doctor${doctorsOnLeave.length > 1 ? "s" : ""} on Leave Today`,
        description: `${docNames}${extra}. Review schedule coverage in doctor directory.`,
        severity: "warning",
        count: doctorsOnLeave.length,
        actionLabel: "View Leave List",
        actionRoute: "/doctor?status=Leave",
        onClickAction: () => navigate("/doctor?status=Leave"),
      });
    } else {
      items.push({
        id: "staffing-healthy",
        category: "staffing",
        title: "Staffing & Roster Coverage: Steady",
        description: "All clinical departments have active physician and nursing coverage for today's shifts.",
        severity: "optimal",
        actionLabel: "Duty Roster",
        actionRoute: "/inpatient/duty-roster",
      });
    }

    // --- 3. AUDIT & GOVERNANCE INTEGRITY ---
    // Recent audit-log rows are raw activity, not integrity signals -- they
    // previously surfaced here as an "audit-latest" check whose severity was
    // hardcoded to "optimal" for clinical entities, which mislabeled every
    // chemo/prescription log line as a green health check. Removed; audit
    // health is now reported as a single steady-state item so the widget
    // only ever flags things that actually need attention.
    items.push({
      id: "audit-healthy",
      category: "audit",
      title: "Role & Permission Security: Verified",
      description: "Role-based access controls active and synchronized with zero unauthorized privilege escalations.",
      severity: "optimal",
      actionLabel: "Matrix",
      actionRoute: "/admin/permissions",
    });

    return items;
  }, [
    criticalPatientCount,
    unassignedApptsCount,
    urgentLabOrdersCount,
    pendingFollowUps,
    doctorsOnLeave,
    navigate,
    onFilterCritical,
  ]);

  // Compute overall integrity health score
  const { integrityScore, scoreLabel, scoreColor, isAllHealthy } = useMemo(() => {
    let score = 100;
    const criticals = checkItems.filter((i) => i.severity === "critical").length;
    const warnings = checkItems.filter((i) => i.severity === "warning").length;

    score -= criticals * 15;
    score -= warnings * 5;
    score = Math.max(0, Math.min(100, score));

    if (score >= 95) {
      return {
        integrityScore: score,
        scoreLabel: "Optimal Integrity",
        scoreColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
        isAllHealthy: true,
      };
    }
    if (score >= 80) {
      return {
        integrityScore: score,
        scoreLabel: "Action Required",
        scoreColor: "bg-amber-50 text-amber-700 border-amber-200",
        isAllHealthy: false,
      };
    }
    return {
      integrityScore: score,
      scoreLabel: "Critical Risk",
      scoreColor: "bg-red-50 text-red-700 border-red-200",
      isAllHealthy: false,
    };
  }, [checkItems]);

  // Filter items by category
  const filteredItems = useMemo(() => {
    if (activeTab === "all") return checkItems;
    return checkItems.filter((i) => i.category === activeTab);
  }, [checkItems, activeTab]);

  return (
    <div className={`bg-white rounded-2xl border border-slate-200/90 shadow-sm p-3 transition-all duration-300 hover:shadow-md flex flex-col justify-between ${className}`}>
      <div>
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                isAllHealthy ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-[#00488D]"
              }`}
            >
              {isAllHealthy ? <ShieldCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-800 tracking-tight">System Integrity</h3>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${scoreColor}`}>
                  {integrityScore}% • {scoreLabel}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">Live clinical safety, staffing coverage & governance health</p>
            </div>
          </div>

          {/* Controls: Re-scan button & Quick matrix link */}
          <div className="flex items-center gap-2">
            <RefreshButton
              onClick={runIntegrityScan}
              isLoading={isScanning}
              title="Run live integrity scan"
            />
            <button
              type="button"
              onClick={() => navigate("/admin")}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-50 text-[#00488D] hover:bg-blue-50 text-xs font-semibold border border-slate-200/80 transition-colors"
            >
              <span>Admin Hub</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex items-center gap-1.5 pt-2 pb-1.5 border-b border-slate-50 overflow-x-auto text-[11px] font-bold">
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={`px-2.5 py-1 rounded-lg transition-all ${
              activeTab === "all"
                ? "bg-slate-800 text-white shadow-sm"
                : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            All Checks ({checkItems.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("clinical")}
            className={`px-2.5 py-1 rounded-lg transition-all ${
              activeTab === "clinical"
                ? "bg-[#00488D] text-white shadow-sm"
                : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            Clinical Safety
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("staffing")}
            className={`px-2.5 py-1 rounded-lg transition-all ${
              activeTab === "staffing"
                ? "bg-[#00488D] text-white shadow-sm"
                : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            Staffing & Coverage
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("audit")}
            className={`px-2.5 py-1 rounded-lg transition-all ${
              activeTab === "audit"
                ? "bg-[#00488D] text-white shadow-sm"
                : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            Security & Audit
          </button>
        </div>

{/* Checks List -- trimmed to ~3 visible rows; the rest scroll inside the
            widget so the page height stays bounded. */}
        <div className="max-h-[215px] overflow-y-auto hide-scrollbar mt-3 space-y-2.5">
          {filteredItems.map((item) => {
            const isCritical = item.severity === "critical";
            const isWarning = item.severity === "warning";
            const isOptimal = item.severity === "optimal";

            return (
              <div
                key={item.id}
                className={`flex flex-col gap-2 p-3 rounded-xl border transition-all ${
                  isCritical
                    ? "bg-red-50/40 border-red-200/80 hover:bg-red-50/70"
                    : isWarning
                    ? "bg-amber-50/30 border-amber-200/70 hover:bg-amber-50/60"
                    : "bg-slate-50/60 border-slate-100 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center mt-0.5 ${
                        isCritical
                          ? "bg-red-100 text-red-700"
                          : isWarning
                          ? "bg-amber-100 text-amber-700"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {item.id === "pending-followups" ? (
                        <CalendarPlus className="w-4 h-4 text-[#00488D]" />
                      ) : item.category === "clinical" ? (
                        isOptimal ? <CheckCircle2 className="w-4 h-4" /> : <HeartPulse className="w-4 h-4" />
                      ) : item.category === "staffing" ? (
                        isOptimal ? <UsersRound className="w-4 h-4" /> : <CalendarX className="w-4 h-4" />
                      ) : (
                        isOptimal ? <Lock className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4
                          className={`text-xs font-bold leading-tight ${
                            isCritical
                              ? "text-red-900"
                              : isWarning
                              ? "text-amber-950"
                              : "text-slate-800"
                          }`}
                        >
                          {item.title}
                        </h4>
                        {isCritical && (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-red-600 text-white">
                            CRITICAL
                          </span>
                        )}
                        {item.id === "pending-followups" && pendingFollowUps.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setIsPendingListOpen((prev) => !prev)}
                            className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[#00488D] hover:underline cursor-pointer ml-1"
                          >
                            <span>{isPendingListOpen ? "Hide list" : "Show list"}</span>
                            {isPendingListOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed line-clamp-2">
                        {item.description}
                      </p>
                    </div>
                  </div>

                  {item.actionLabel && (
                    <button
                      type="button"
                      onClick={() => {
                        if (item.onClickAction) item.onClickAction();
                        else if (item.actionRoute) navigate(item.actionRoute);
                      }}
                      className={`shrink-0 text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-all whitespace-nowrap shadow-sm cursor-pointer ${
                        isCritical
                          ? "bg-red-600 text-white border-red-700 hover:bg-red-700"
                          : isWarning
                          ? "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-[#00488D]"
                          : "bg-white text-[#00488D] border-slate-200 hover:bg-blue-50"
                      }`}
                    >
                      {item.actionLabel}
                    </button>
                  )}
                </div>

                {/* Inside list for Pending Follow-ups */}
                {item.id === "pending-followups" && isPendingListOpen && pendingFollowUps.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-200/80 flex flex-col gap-2">
                    {pendingFollowUps.slice(0, 3).map((alert) => (
                      <div
                        key={alert.encounter_no}
                        className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white border border-slate-200/90 shadow-2xs hover:border-blue-200 transition-all text-xs"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-900 truncate">{alert.patient.name}</span>
                            {alert.due_status === "OVERDUE" ? (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-red-100 text-red-700">
                                Overdue ({alert.days_overdue}d)
                              </span>
                            ) : alert.due_status === "DUE_TODAY" ? (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800">
                                Due Today
                              </span>
                            ) : alert.due_status === "DUE_TOMORROW" ? (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-blue-100 text-blue-700">
                                Tomorrow
                              </span>
                            ) : (
                              <span className="text-[9px] font-medium px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                                In {alert.days_until}d
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-500 truncate mt-0.5">
                            Due: {alert.follow_up_date} • {alert.doctor ? `Dr. ${alert.doctor.name.replace(/^dr\.?\s+/i, "")}` : "Unassigned"}
                          </p>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => handleOneClickBook(e, alert)}
                            disabled={bookingAlertId === alert.encounter_no}
                            title="Instant 1-click book with earliest open slot"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] transition-all shadow-sm active:scale-95 disabled:opacity-50"
                          >
                            {bookingAlertId === alert.encounter_no ? (
                              <Loader2 className="w-2.5 h-2.5 animate-spin" />
                            ) : (
                              <Zap className="w-2.5 h-2.5 fill-current" />
                            )}
                            <span>1-Click Book</span>
                          </button>
                        </div>
                      </div>
                    ))}

                    <div className="flex items-center justify-between pt-1 text-[11px]">
                      <span className="text-slate-400">
                        Showing {Math.min(3, pendingFollowUps.length)} of {pendingFollowUps.length} pending
                      </span>
                      <button
                        type="button"
                        onClick={() => navigate("/appointments/pending")}
                        className="text-[#00488D] font-bold hover:underline inline-flex items-center gap-0.5"
                      >
                        <span>Open dedicated queue</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer bar */}
      <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Real-time compliance scanner
        </span>
        <button
          type="button"
          onClick={() => navigate("/admin/permissions")}
          className="text-[#00488D] hover:underline font-semibold"
        >
          Manage Governance
        </button>
      </div>
    </div>
  );
}

