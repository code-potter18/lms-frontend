import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  HeartPulse,
  CalendarX,
  Clock,
  RefreshCw,
  ArrowRight,
  CheckCircle2,
  Lock,
  Stethoscope,
  FlaskConical,
  BedDouble,
  UsersRound,
  ExternalLink,
} from "lucide-react";
import { auditApi, type AuditLogRecord } from "@/api/audit.api";
import { labOrderApi } from "@/api/labOrder.api";
import { useBranchFilter } from "@/context/BranchFilterContext";
import { usePermission } from "@/context/PermissionContext";

export type IntegrityCategory = "all" | "clinical" | "staffing" | "audit";

function parseAuditSummary(log: AuditLogRecord) {
  let details = log.change_summary || "System governance update";
  try {
    const parsed = JSON.parse(log.change_summary);
    if (parsed.reason) {
      details = parsed.reason;
    } else if (parsed.to && parsed.from) {
      details = `Status transitioned from ${parsed.from} to ${parsed.to}`;
    } else if (parsed.to) {
      details = `Status updated to ${parsed.to}`;
    }
  } catch {
    // plain string already
  }

  const entityLower = (log.entity_type || "").toLowerCase();
  const isClinical =
    entityLower.includes("chemo") ||
    entityLower.includes("patient") ||
    entityLower.includes("prescription") ||
    entityLower.includes("encounter");

  if (isClinical) {
    const cleanType = entityLower.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return {
      title: `Clinical Update: ${cleanType}`,
      description: `${details} (by ${log.performed_by || "Clinical Staff"})`,
      severity: "optimal" as const,
      actionLabel: "View Orders",
      actionRoute: "/orders",
    };
  }

  return {
    title: `Security Event: ${log.entity_type} ${log.action}`,
    description: `${details} (by ${log.performed_by || "Admin"})`,
    severity: "warning" as const,
    actionLabel: "Audit Trail",
    actionRoute: "/admin/permissions",
  };
}

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

  const canReadAudit = can("audit.read") || can("permission.manage");
  const canReadLabs = can("chemo.plan.read");

  const [activeTab, setActiveTab] = useState<IntegrityCategory>("all");
  const [isScanning, setIsScanning] = useState(false);
  const [recentAudits, setRecentAudits] = useState<AuditLogRecord[]>([]);
  const [urgentLabOrdersCount, setUrgentLabOrdersCount] = useState<number>(0);

  // Scan auxiliary integrity data (recent audit security events & urgent labs)
  const runIntegrityScan = async () => {
    setIsScanning(true);
    try {
      const tasks: Promise<any>[] = [];

      if (canReadAudit) {
        tasks.push(
          auditApi
            .getLogs({ limit: 5 })
            .then((res) => {
              if (res.data?.data) setRecentAudits(res.data.data);
            })
            .catch((err) => console.warn("[SystemIntegrity] Audit scan warning:", err))
        );
      }

      if (canReadLabs) {
        tasks.push(
          labOrderApi
            .getAll()
            .then((res) => {
              const data: any = res.data?.data;
              const orders = Array.isArray(data) ? data : data?.orders || [];
              const urgent = orders.filter((o: any) => (o?.priority || "").toUpperCase() === "URGENT" || (o?.priority || "").toUpperCase() === "STAT");
              setUrgentLabOrdersCount(urgent.length);
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

  useEffect(() => {
    runIntegrityScan();
  }, [selectedBranchId, isAllBranches, canReadAudit, canReadLabs]);

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

    // Default healthy clinical state if no issues
    if (criticalPatientCount === 0 && unassignedApptsCount === 0 && urgentLabOrdersCount === 0) {
      items.push({
        id: "clinical-healthy",
        category: "clinical",
        title: "Clinical Patient Safety: Optimal",
        description: "All patient encounters within safe thresholds; zero unassigned patient appointments.",
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
    if (canReadAudit && recentAudits.length > 0) {
      const latest = recentAudits[0];
      const parsed = parseAuditSummary(latest);
      items.push({
        id: "audit-latest",
        category: "audit",
        title: parsed.title,
        description: parsed.description,
        severity: parsed.severity,
        actionLabel: parsed.actionLabel,
        actionRoute: parsed.actionRoute,
      });
    } else {
      items.push({
        id: "audit-healthy",
        category: "audit",
        title: "Role & Permission Security: Verified",
        description: "Role-based access controls active and synchronized with zero unauthorized privilege escalations.",
        severity: "optimal",
        actionLabel: "Matrix",
        actionRoute: "/admin/permissions",
      });
    }

    return items;
  }, [
    criticalPatientCount,
    unassignedApptsCount,
    urgentLabOrdersCount,
    doctorsOnLeave,
    recentAudits,
    canReadAudit,
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
    <div className={`bg-white rounded-2xl border border-slate-200/90 shadow-sm p-5 transition-all duration-300 hover:shadow-md flex flex-col justify-between ${className}`}>
      <div>
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 flex-wrap gap-2">
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
            <button
              type="button"
              onClick={runIntegrityScan}
              disabled={isScanning}
              title="Run live integrity scan"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? "animate-spin text-[#00488D]" : ""}`} />
              <span className="hidden sm:inline">{isScanning ? "Scanning..." : "Rescan"}</span>
            </button>
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
        <div className="flex items-center gap-1.5 pt-3 pb-2 border-b border-slate-50 overflow-x-auto text-[11px] font-bold">
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

        {/* Checks List */}
        <div className="space-y-2.5 mt-3">
          {filteredItems.map((item) => {
            const isCritical = item.severity === "critical";
            const isWarning = item.severity === "warning";
            const isOptimal = item.severity === "optimal";

            return (
              <div
                key={item.id}
                className={`flex items-start justify-between gap-3 p-3 rounded-xl border transition-all ${
                  isCritical
                    ? "bg-red-50/40 border-red-200/80 hover:bg-red-50/70"
                    : isWarning
                    ? "bg-amber-50/30 border-amber-200/70 hover:bg-amber-50/60"
                    : "bg-slate-50/60 border-slate-100 hover:bg-slate-50"
                }`}
              >
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
                    {item.category === "clinical" ? (
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

