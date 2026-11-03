import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Loader2, AlertCircle } from "lucide-react";
import { format, addDays, subDays, startOfWeek, endOfWeek, subWeeks, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import CalendarPicker, { type DateRange as CalendarDateRange } from "@/components/hms/Calender";
import { appointmentApi, type AppointmentRecord } from "@/api/appointment.api";
import { branchApi } from "@/api/branch.api";

/**
 * Branch Performance widget. Self-contained component extracted from
 * Dashboard.tsx. Owns the whole branch-performance feature: the React Query
 * backed appointment-count sweep, the compact ranked bar list with animated
 * system-share bars, the original Dashboard hover KPI popover, the
 * range/custom-range selector AND a "Bar Diagram / Pie Chart" visualization
 * dropdown. Both views share the identical hover popover — in "pie" mode
 * hovering a slice or a legend row opens the very same side popover.
 */

type BranchPerfRange = "today" | "yesterday" | "tomorrow" | "thisWeek" | "lastWeek" | "thisMonth" | "lastMonth" | "custom";
type BranchPerfViz = "bars" | "pie";

const BRANCH_PERF_RANGE_OPTIONS: { value: BranchPerfRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "thisWeek", label: "This Week" },
  { value: "lastWeek", label: "Last Week" },
  { value: "thisMonth", label: "This Month" },
  { value: "lastMonth", label: "Last Month" },
  { value: "custom", label: "Custom Range" },
];

const BRANCH_PERF_VIZ_OPTIONS: { value: BranchPerfViz; label: string }[] = [
  { value: "bars", label: "Bar Diagram" },
  { value: "pie", label: "Pie Chart" },
];

interface BranchPerfRangeResult {
  dateFrom: string;
  dateTo: string;
  prevDateFrom: string;
  prevDateTo: string;
  dateLabel: string;
  compareLabel: string;
}

function calculatePercentage(actual: number, total: number): number {
  if (!total || total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((actual / total) * 100)));
}

function systemSharePct(branchBookedCount: number, totalSystemBookedCount: number): number {
  if (totalSystemBookedCount <= 0) return 0;
  return Math.round((branchBookedCount / totalSystemBookedCount) * 100);
}

function utilizationPct(bookedCount: number, totalSlots: number): number | null {
  if (totalSlots <= 0) return null; // no capacity data -> render "N/A", never 0% or 100%
  return Math.round((bookedCount / totalSlots) * 100);
}

function utilizationConfidence(totalSlots: number): "low" | "normal" {
  return totalSlots < 5 ? "low" : "normal";
}

type Trend =
  | { kind: "none" }
  | { kind: "new"; count: number }
  | { kind: "dropped"; count: number }
  | { kind: "change"; pct: number; delta: number };

function computeTrend(current: number, previous: number): Trend {
  if (previous === 0 && current === 0) return { kind: "none" };
  if (previous === 0 && current > 0) return { kind: "new", count: current };
  if (previous > 0 && current === 0) return { kind: "dropped", count: previous };
  const delta = current - previous;
  const pct = Math.round((delta / previous) * 100);
  return { kind: "change", pct, delta };
}

function formatTrend(t: Trend): string {
  switch (t.kind) {
    case "none":
      return "No change";
    case "new":
      return `+${t.count} appt${t.count === 1 ? "" : "s"} (new)`;
    case "dropped":
      return `-${t.count} appt${t.count === 1 ? "" : "s"} (-100%)`;
    case "change": {
      const sign = t.delta > 0 ? "+" : "";
      return `${sign}${t.delta} appt${Math.abs(t.delta) === 1 ? "" : "s"} (${sign}${t.pct}%)`;
    }
  }
}

function getBranchPerfRangeDates(range: BranchPerfRange, base: Date, customRange?: CalendarDateRange | null): BranchPerfRangeResult {
  const weekStart = startOfWeek(base, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(base, { weekStartsOn: 1 });
  const lastWeekStart = subWeeks(weekStart, 1);
  const lastWeekEnd = subWeeks(weekEnd, 1);
  const monthStart = startOfMonth(base);
  const monthEnd = endOfMonth(base);
  const lastMonthStart = startOfMonth(subMonths(base, 1));
  const lastMonthEnd = endOfMonth(subMonths(base, 1));

  let currentFrom: Date;
  let currentTo: Date;
  let prevFrom: Date;
  let prevTo: Date;

  if (range === "custom" && customRange?.from && customRange?.to) {
    currentFrom = customRange.from;
    currentTo = customRange.to;
    const durationMs = currentTo.getTime() - currentFrom.getTime();
    prevFrom = new Date(currentFrom.getTime() - durationMs);
    prevTo = new Date(currentTo.getTime() - durationMs);
  } else {
    const ranges: Record<string, { dateFrom: Date; dateTo: Date; prevFrom: Date; prevTo: Date }> = {
      today: {
        dateFrom: base, dateTo: base,
        prevFrom: subDays(base, 1), prevTo: subDays(base, 1),
      },
      yesterday: {
        dateFrom: subDays(base, 1), dateTo: subDays(base, 1),
        prevFrom: subDays(base, 2), prevTo: subDays(base, 2),
      },
      tomorrow: {
        dateFrom: addDays(base, 1), dateTo: addDays(base, 1),
        prevFrom: base, prevTo: base,
      },
      thisWeek: {
        dateFrom: weekStart, dateTo: weekEnd,
        prevFrom: lastWeekStart, prevTo: lastWeekEnd,
      },
      lastWeek: {
        dateFrom: lastWeekStart, dateTo: lastWeekEnd,
        prevFrom: subWeeks(lastWeekStart, 1), prevTo: subWeeks(lastWeekEnd, 1),
      },
      thisMonth: {
        dateFrom: monthStart, dateTo: monthEnd,
        prevFrom: lastMonthStart, prevTo: lastMonthEnd,
      },
      lastMonth: {
        dateFrom: lastMonthStart, dateTo: lastMonthEnd,
        prevFrom: startOfMonth(subMonths(base, 2)), prevTo: endOfMonth(subMonths(base, 2)),
      },
    };

    const r = ranges[range] || ranges.today;
    currentFrom = r.dateFrom;
    currentTo = r.dateTo;
    prevFrom = r.prevFrom;
    prevTo = r.prevTo;
  }

  return {
    dateFrom: format(currentFrom, "yyyy-MM-dd"),
    dateTo: format(currentTo, "yyyy-MM-dd"),
    prevDateFrom: format(prevFrom, "yyyy-MM-dd"),
    prevDateTo: format(prevTo, "yyyy-MM-dd"),
    dateLabel: formatComparisonRange(currentFrom, currentTo),
    compareLabel: `Compared with ${formatComparisonRange(prevFrom, prevTo)}`,
  };
}

/** Distinct hue for each branch so pie slices don't collide. */
const PIE_COLORS = [
  "#004888", "#00A878", "#C7701C", "#7B3200", "#6D5BC5",
  "#0E86C4", "#3D8C40", "#B54A7E", "#C49A2A", "#57627A",
  "#2E9DB3", "#8F4FB0", "#D9534F", "#3E7CB1", "#A8720F",
];


function formatStatValue(value: number): string {
  return (typeof value === "number" && !isNaN(value) ? value : 0).toLocaleString();
}

function formatComparisonRange(from: Date, to: Date): string {
  return `${format(from, "MMM d")} - ${format(to, "MMM d")}`;
}

interface BranchPerformanceProps {
  /** Base date for all relative ranges (today/yesterday/weeks/months). */
  selectedDate?: Date;
}

interface BranchPerfBranch {
  id: string;
  name: string;
  count: number;
  previousCount: number;
  totalSlots: number;
  systemShare: number;
  color: string;
}

/**
 * Branch Performance widget (extracted from Dashboard.tsx).
 * Owns its own data fetching, ranking, hover-KPI card, range selection and
 * the Bar/Pie visualization dropdown. Pie mode renders the same ranked
 * branch-share data as a recharts donut chart.
 */
interface BranchHoverCardProps {
  branch: BranchPerfBranch;
  details: {
    total: number;
    booked: number;
    completed: number;
    cancelled: number;
    noShow: number;
    scheduled: number;
  } | null;
  loading: boolean;
  range: BranchPerfRange;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

/**
 * The hover popover body — the same markup the original Dashboard.tsx widget
 * used. Rendered inside <PopoverContent> for both the bar rows and the pie
 * legend rows so hovering behaves identically in both visualization modes.
 */
function BranchHoverCard({ branch, details, loading, range, onMouseEnter, onMouseLeave }: BranchHoverCardProps) {
  const trendObj = computeTrend(branch.count, branch.previousCount);
  const formattedTrendText = formatTrend(trendObj);
  const trendColor =
    trendObj.kind === "none"
      ? "#8C8D8F"
      : trendObj.kind === "new" || (trendObj.kind === "change" && trendObj.delta > 0)
        ? "#16A34A"
        : "#EF4444";
  const uPct = utilizationPct(branch.count, branch.totalSlots);
  const uConf = utilizationConfidence(branch.totalSlots);
  const unusedCapacity = branch.totalSlots > 0 ? branch.totalSlots - branch.count : null;

  return (
    <PopoverContent
      side="right"
      align="start"
      sideOffset={10}
      className="w-72 p-0 border-[#E5E7EB] shadow-lg"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Hover card header */}
      <div className="px-4 pt-3 pb-2">
        <div className="text-[#191C1E] font-bold text-xs tracking-[0.2px]">{branch.name}</div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[#424752] text-[11px] font-semibold">
            {branch.count} appointment{branch.count === 1 ? "" : "s"}
          </span>
          <span className="text-[10px] font-semibold" style={{ color: trendColor }}>
            {formattedTrendText}
          </span>
        </div>
      </div>

      <div className="border-t border-[#E5E7EB] mx-3" />

      {/* Volume & Capacity metrics */}
      <div className="px-4 py-2.5 flex flex-col gap-2">
        {/* System Share */}
        <div className="flex justify-between items-center">
          <span className="text-[#6B7280] text-[10px] font-medium">System Share</span>
          <span className="text-[#191C1E] text-[11px] font-semibold">{branch.systemShare}%</span>
        </div>

        {/* Utilization */}
        <div className="flex justify-between items-start">
          <span className="text-[#6B7280] text-[10px] font-medium">Utilization</span>
          <div className="flex flex-col items-end gap-0.5">
            {uPct !== null ? (
              <>
                <span className="text-[#191C1E] text-[11px] font-semibold flex items-center gap-1">
                  {uPct}%
                  {uConf === "low" && (
                    <span
                      className="text-[7px] px-1 py-px rounded bg-amber-100 text-amber-700 font-medium cursor-help"
                      title="Based on small sample (<5 slots)"
                    >
                      ⚠ Low sample
                    </span>
                  )}
                </span>
                <span className="text-[#8C8D8F] text-[9px] font-normal">
                  {branch.count} / {branch.totalSlots} slots
                </span>
              </>
            ) : (
              <>
                <span className="text-[#8C8D8F] text-[11px] font-semibold">N/A</span>
                <span className="text-[#8C8D8F] text-[8px] font-normal">Capacity unavailable</span>
              </>
            )}
          </div>
        </div>

        {/* Capacity Breakdown */}
        {branch.totalSlots > 0 && (
          <>
            <div className="flex justify-between items-center">
              <span className="text-[#6B7280] text-[10px] font-medium">Capacity</span>
              <span className="text-[#191C1E] text-[10px] font-semibold">{branch.totalSlots} slots</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#6B7280] text-[10px] font-medium">Unused</span>
              <span className="text-[#191C1E] text-[10px] font-semibold">
                {unusedCapacity !== null && unusedCapacity >= 0 ? unusedCapacity : 0}
              </span>
            </div>
          </>
        )}
      </div>

      <div className="border-t border-[#E5E7EB] mx-3" />

      {/* Appointment Outcomes / Upcoming (tomorrow) */}
      <div className="px-4 py-2.5 pb-3">
        {loading && !details ? (
          <div className="flex items-center gap-2 text-[#6B7280] text-[10px] py-1">
            <Loader2 size={12} className="animate-spin text-[#00488D]" />
            Loading...
          </div>
        ) : details ? (
          range === "tomorrow" ? (
            <div className="flex flex-col gap-1.5 text-[10px]">
              <div className="text-[#424752] text-[10px] font-semibold tracking-[0.3px] mb-0.5">Upcoming</div>
              <div className="flex justify-between">
                <span className="text-[#6B7280] font-medium">Scheduled</span>
                <span className="text-[#191C1E] font-semibold">{details.scheduled}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6B7280] font-medium">Total Appointments</span>
                <span className="text-[#191C1E] font-semibold">{details.total}</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 text-[10px]">
              <div className="text-[#424752] text-[10px] font-semibold tracking-[0.3px] mb-0.5">Appointment Outcomes</div>
              <div className="flex justify-between">
                <span className="text-[#6B7280] font-medium">Completed</span>
                <span className="text-[#191C1E] font-semibold">
                  {details.completed} · {calculatePercentage(details.completed, details.booked)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6B7280] font-medium">Cancelled</span>
                <span className="text-[#191C1E] font-semibold">
                  {details.cancelled} · {calculatePercentage(details.cancelled, details.booked)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6B7280] font-medium">No-show</span>
                <span className="text-[#191C1E] font-semibold">
                  {details.noShow} · {calculatePercentage(details.noShow, details.booked)}%
                </span>
              </div>
            </div>
          )
        ) : (
          <div className="text-[#8C8D8F] text-[10px]">No appointment data.</div>
        )}
      </div>
    </PopoverContent>
  );
}

export default function BranchPerformance({ selectedDate = new Date() }: BranchPerformanceProps) {
  // "bars" = compact ranked bar list (original look); "pie" = donut chart.
  const [vizMode, setVizMode] = useState<BranchPerfViz>("bars");

  const [branchPerfRange, setBranchPerfRange] = useState<BranchPerfRange>("today");
  const [customDateRange, setCustomDateRange] = useState<CalendarDateRange | null>(null);
  const [isCustomRangeOpen, setIsCustomRangeOpen] = useState(false);
  const [branchPerfDateLabel, setBranchPerfDateLabel] = useState("");
  const [branchPerfCompareLabel, setBranchPerfCompareLabel] = useState("");

  const [branches, setBranches] = useState<BranchPerfBranch[]>([]);
  const [branchPerfError, setBranchPerfError] = useState<string | null>(null);

  // Hover card state -- detailed KPIs are fetched on demand when a row/slice
  // is hovered, so the initial sweep stays fast (count-only queries).
  const [hoveredBranchId, setHoveredBranchId] = useState<string | null>(null);
  const [hoveredBranchDetails, setHoveredBranchDetails] = useState<{
    total: number;
    booked: number;
    completed: number;
    cancelled: number;
    noShow: number;
    scheduled: number;
  } | null>(null);
  const [isHoverDetailsLoading, setIsHoverDetailsLoading] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const branchPerfQuery = useQuery({
    queryKey: ["dashboard-branch-perf", branchPerfRange, format(selectedDate, "yyyy-MM-dd"), customDateRange],
    queryFn: async () => {
      const branchRes = await branchApi.getAll();
      const branchList = branchRes.data?.data || [];

      const { dateFrom, dateTo, prevDateFrom, prevDateTo, dateLabel, compareLabel } = getBranchPerfRangeDates(branchPerfRange, selectedDate, customDateRange);

      const results = await Promise.all(
        branchList.map(async (b) => {
          const currentCount = await appointmentApi
            .getAll({ branchId: b.branch_id, limit: 1, dateFrom, dateTo, excludeStatuses: "CANCELLED,NO_SHOW" })
            .then((res) => res.data?.data?.total ?? 0)
            .catch(() => 0);
          const previousCount = await appointmentApi
            .getAll({ branchId: b.branch_id, limit: 1, dateFrom: prevDateFrom, dateTo: prevDateTo, excludeStatuses: "CANCELLED,NO_SHOW" })
            .then((res) => res.data?.data?.total ?? 0)
            .catch(() => 0);
          const totalSlots = await appointmentApi
            .getAll({ branchId: b.branch_id, limit: 1, dateFrom, dateTo })
            .then((res) => res.data?.data?.total ?? 0)
            .catch(() => 0);
          return { currentCount, previousCount, totalSlots };
        }),
      );

      const branchData = branchList.map((b, index) => ({
        id: b.branch_id,
        name: b.branch_area ? `${b.branch_name} (${b.branch_area})` : (b.branch_name || b.branch_id),
        count: results[index]?.currentCount ?? 0,
        previousCount: results[index]?.previousCount ?? 0,
        totalSlots: results[index]?.totalSlots ?? 0,
      }));

      const ranked = [...branchData].sort((a, b) => b.count - a.count);
      const totalSystemBookedCount = ranked.reduce((sum, b) => sum + b.count, 0);

      return {
        branches: ranked.map((b, index) => ({
          ...b,
          systemShare: systemSharePct(b.count, totalSystemBookedCount),
          color: PIE_COLORS[index % PIE_COLORS.length],
        })),
        dateLabel,
        compareLabel,
      };
    },
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });

  const isInitialLoading = branchPerfQuery.isPending && !branchPerfQuery.data;
  const isUpdating = branchPerfQuery.isFetching && !!branchPerfQuery.data;

  useEffect(() => {
    if (branchPerfQuery.data) {
      setBranches(branchPerfQuery.data.branches);
      setBranchPerfDateLabel(branchPerfQuery.data.dateLabel);
      setBranchPerfCompareLabel(branchPerfQuery.data.compareLabel);
    }
  }, [branchPerfQuery.data]);

  useEffect(() => {
    if (!branchPerfQuery.error) return;
    console.error("[BranchPerformance] Failed to load branch performance:", branchPerfQuery.error);
    setBranchPerfError("Failed to load branch performance.");
    setBranches([]);
  }, [branchPerfQuery.error]);

  // Detailed KPIs for the hovered branch (status breakdown for the range).
  const fetchBranchHoverDetails = useCallback(async (branchId: string) => {
    setIsHoverDetailsLoading(true);
    try {
      const { dateFrom, dateTo } = getBranchPerfRangeDates(branchPerfRange, selectedDate, customDateRange);
      const res = await appointmentApi.getAll({
        branchId,
        limit: 100,
        dateFrom,
        dateTo,
      });

      const appointments = res.data?.data?.appointments || [];

      let completed = 0;
      let cancelled = 0;
      let noShow = 0;
      let scheduled = 0;

      appointments.forEach((a: AppointmentRecord) => {
        const s = (a.status || "").toUpperCase();
        if (s === "COMPLETED") completed++;
        else if (s === "CANCELLED") cancelled++;
        else if (s === "NO_SHOW") noShow++;
        else if (s === "SCHEDULED" || s === "RESCHEDULED" || s === "NOT_CHECKED_IN" || s === "IN_CONSULTATION") scheduled++;
      });


      setHoveredBranchDetails({
        total: appointments.length,
        booked: appointments.length - cancelled - noShow,
        completed,
        cancelled,
        noShow,
        scheduled,
      });

    } catch {
      setHoveredBranchDetails(null);
    } finally {
      setIsHoverDetailsLoading(false);
    }
  }, [branchPerfRange, selectedDate, customDateRange]);

  useEffect(() => {
    if (!hoveredBranchId) return;
    fetchBranchHoverDetails(hoveredBranchId);
  }, [hoveredBranchId, fetchBranchHoverDetails]);

  // Hover open/close timing identical to the original Dashboard widget: the
  // popover opens immediately, closing is delayed 150ms so the pointer can
  // travel onto the popover without it flickering away.
  const handleBranchMouseEnter = useCallback((branchId: string) => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHoveredBranchId(branchId);
  }, []);

  const handleBranchMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      setHoveredBranchId(null);
      setHoveredBranchDetails(null);
    }, 150);
  }, []);

  const cancelHoverClose = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
      }
    };
  }, []);

  // Animated bar fill: mirrors each branch's systemShare %, stepping one
  // point at a time so repeated range changes can't leak overlapping timers.
  const [animatedValues, setAnimatedValues] = useState<Record<string, number>>({});
  const animatedValuesRef = useRef<Record<string, number>>({});
  animatedValuesRef.current = animatedValues;

  useEffect(() => {
    const validIds = new Set(branches.map((b) => b.id));
    setAnimatedValues((prev) => {
      let changed = false;
      const next: Record<string, number> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (validIds.has(k)) {
          next[k] = v;
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });


    const intervals = branches
      .filter((b) => b.systemShare !== (animatedValuesRef.current[b.id] ?? 0))
      .map((branch) => {
        const interval = window.setInterval(() => {
          setAnimatedValues((prev) => {
            const value = prev[branch.id] ?? 0;
            if (value === branch.systemShare) {
              window.clearInterval(interval);
              return prev;
            }
            return {
              ...prev,
              [branch.id]: value < branch.systemShare ? value + 1 : value - 1,
            };
          });

        }, 30);
        return interval;
      });


    return () => intervals.forEach((interval) => window.clearInterval(interval));
  }, [branches]);

  const pieData = useMemo(
    () => branches.filter((b) => b.count > 0).map((b) => ({ name: b.name, value: b.count, share: b.systemShare, color: b.color, id: b.id })),
    [branches],
  );
  const pieTotal = useMemo(() => pieData.reduce((sum, d) => sum + d.value, 0), [pieData]);

  return (
    <div className="bg-white rounded-lg border border-[rgba(194,198,212,0.10)] p-5 flex flex-col gap-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      {/* Header -- original Dashboard widget look */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-[#191C1E] font-extrabold text-base leading-6 tracking-[-0.4px]">Branch Performance</h3>
            {isUpdating && (
              <span className="inline-flex items-center gap-1 text-[10px] text-[#00488D] font-medium bg-blue-50 px-2 py-0.5 rounded-full animate-fade-in">
                <Loader2 className="w-3 h-3 animate-spin text-[#00488D]" />
                <span>Updating...</span>
              </span>
            )}
          </div>
          {branchPerfDateLabel && <p className="text-[#424752] text-[10px] font-semibold mt-0.5">{branchPerfDateLabel}</p>}
          {branchPerfCompareLabel && <p className="text-[#8C8D8F] text-[9px] font-medium">{branchPerfCompareLabel}</p>}
        </div>
        <div className="flex items-center gap-2">
          {/* Bar Diagram / Pie Chart select -- styled exactly like the range select */}
          <select
            value={vizMode}
            onChange={(e) => setVizMode(e.target.value as BranchPerfViz)}
            className="px-2 py-1 rounded border border-[rgba(194,198,212,0.40)] bg-white text-[#424752] text-[9px] font-semibold tracking-[0.9px] outline-none cursor-pointer focus:border-[#00488D]"
            title="Choose visualization"
          >
            {BRANCH_PERF_VIZ_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {(branchPerfRange === "custom" && (
            <Popover
              open={isCustomRangeOpen}
              onOpenChange={(open) => {
                setIsCustomRangeOpen(open);
                if (open) {
                  setHoveredBranchId(null);
                  setHoveredBranchDetails(null);
                }
              }}
            >
              <PopoverTrigger asChild>
                <button
                  className="px-2 py-1 rounded border border-[#00488D] bg-[#D6E3FF] text-[#00488D] text-[9px] font-semibold tracking-[0.9px] outline-none cursor-pointer"
                >
                  {customDateRange?.from && customDateRange?.to
                    ? formatComparisonRange(customDateRange.from, customDateRange.to)
                    : "Pick Range"}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 border-[#E5E7EB] shadow-lg" align="end">
                <CalendarPicker
                  mode="range"
                  selected={customDateRange}
                  hideThemePicker
                  onSelect={(range) => {
                    if (range && typeof range === "object" && "from" in range && "to" in range) {
                      setCustomDateRange(range);
                      setIsCustomRangeOpen(false);
                    }
                  }}
                />
              </PopoverContent>
            </Popover>
          )) || null}
          <select
            value={branchPerfRange}
            onChange={(e) => {
              const next = e.target.value as BranchPerfRange;
              setBranchPerfRange(next);
              if (next === "custom" && !customDateRange) {
                setHoveredBranchId(null);
                setHoveredBranchDetails(null);
                setIsCustomRangeOpen(true);
              }
            }}
            className="px-2 py-1 rounded border border-[rgba(194,198,212,0.40)] bg-white text-[#424752] text-[9px] font-semibold tracking-[0.9px] outline-none cursor-pointer focus:border-[#00488D]"
            title="Choose date range"
          >
            {BRANCH_PERF_RANGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Error state */}
      {branchPerfError && (
        <div className="flex items-center gap-2 text-[#B91C1C] text-xs bg-[#FEF2F2] border border-[#FECACA] rounded-md px-3 py-2">
          <AlertCircle size={14} />
          <span>{branchPerfError}</span>
        </div>
      )}

      {/* Loading skeleton -- Mode aware */}
      {isInitialLoading && vizMode === "bars" && (
        <div className="flex flex-col gap-3 py-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-[#F1F3F6] animate-pulse" />
              <div className="flex-1 flex flex-col gap-1.5">
                <div className="h-2.5 w-1/3 bg-[#F1F3F6] rounded animate-pulse" />
                <div className="h-2 bg-[#F1F3F6] rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      )}

      {isInitialLoading && vizMode === "pie" && (
        <div className="flex flex-col lg:flex-row items-center gap-4 py-2">
          {/* Donut chart skeleton */}
          <div className="relative w-full lg:w-1/2 h-[260px] flex items-center justify-center">
            <div className="w-[164px] h-[164px] rounded-full bg-[#F1F3F6] animate-pulse flex items-center justify-center shadow-inner">
              <div className="w-[116px] h-[116px] rounded-full bg-white flex flex-col items-center justify-center gap-1 shadow-sm">
                <div className="w-8 h-2 bg-[#F1F3F6] rounded animate-pulse" />
                <div className="w-12 h-4 bg-[#E5E7EB] rounded animate-pulse" />
                <div className="w-8 h-2 bg-[#F1F3F6] rounded animate-pulse" />
              </div>
            </div>
          </div>
          {/* Legend rows skeleton */}
          <div className="w-full lg:w-1/2 flex flex-col gap-2 max-h-[260px] py-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center justify-between p-1.5 rounded-md">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#F1F3F6] animate-pulse shrink-0" />
                  <div className="w-24 h-2.5 bg-[#F1F3F6] rounded animate-pulse" />
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-12 h-2.5 bg-[#F1F3F6] rounded animate-pulse" />
                  <div className="w-8 h-2.5 bg-[#E5E7EB] rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isInitialLoading && !branchPerfError && branches.length === 0 && (
        <div className="flex items-center justify-center py-8 text-[#6B7280] text-xs">No branch data available.</div>
      )}

      {/* BAR VIEW -- original compact rows with animated share bars */}
      {!isInitialLoading && !branchPerfError && branches.length > 0 && vizMode === "bars" && (
        <div className={`flex flex-col gap-3 max-h-[260px] overflow-y-auto hide-scrollbar pr-1 transition-opacity duration-200 ${isUpdating ? "opacity-75" : "opacity-100"}`}>
          {branches.map((branch, index) => {
            const trendObj = computeTrend(branch.count, branch.previousCount);
            const formattedTrendText = formatTrend(trendObj);
            const isTop = index === 0 && branch.count > 0;
            const isOpen = hoveredBranchId === branch.id;

            const trendColor =
              trendObj.kind === "none"
                ? "#8C8D8F"
                : trendObj.kind === "new" || (trendObj.kind === "change" && trendObj.delta > 0)
                ? "#16A34A"
                : "#EF4444";

            const sharePct = animatedValues[branch.id] ?? branch.systemShare;

            return (
              <Popover key={branch.id} open={isOpen}>
                <PopoverTrigger asChild>
                  <div
                    className="relative flex flex-col gap-1 cursor-pointer rounded-md px-1.5 py-1 transition-colors duration-150 hover:bg-[#F8FAFC]"
                    onMouseEnter={() => {
                      if (isCustomRangeOpen) return;
                      handleBranchMouseEnter(branch.id);
                    }}
                    onMouseLeave={handleBranchMouseLeave}
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[#8C8D8F] text-[9px] font-bold w-3 flex-shrink-0">{index + 1}.</span>
                        <span className="text-[#191C1E] text-[10px] font-semibold tracking-[0.3px] capitalize truncate">
                          {branch.name}
                        </span>
                        {isTop && (
                          <span className="text-[#00488D] text-[9px] leading-none" title="Highest volume">★</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[10px] font-semibold text-[#424752]">
                          {branch.count} {branch.count === 1 ? "appt" : "appts"}
                        </span>
                        <span className="text-[9px] font-semibold tracking-[0.5px] uppercase" style={{ color: branch.color }}>
                          {sharePct}% share
                        </span>
                      </div>
                    </div>
                    {/* System Share bar */}
                    <div className="h-1.5 rounded-full bg-[#ECEEF0] overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-300" style={{ width: `${sharePct}%`, background: branch.color }} />
                    </div>
                    {/* Trend badge */}
                    <div className="flex items-center gap-1 pl-[18px]">
                      <span className="text-[8px] font-semibold" style={{ color: trendColor }}>
                        {formattedTrendText}
                      </span>
                    </div>
                  </div>
                </PopoverTrigger>
                <BranchHoverCard
                  branch={branch}
                  details={hoveredBranchDetails}
                  loading={isHoverDetailsLoading}
                  range={branchPerfRange}
                  onMouseEnter={cancelHoverClose}
                  onMouseLeave={handleBranchMouseLeave}
                />
              </Popover>
            );
          })}
        </div>
      )}

      {/* PIE VIEW */}
      {!isInitialLoading && !branchPerfError && vizMode === "pie" && (
        pieData.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-[#6B7280] text-xs">No booked appointments for this range.</div>
        ) : (
          <div className={`flex flex-col lg:flex-row items-start gap-4 transition-opacity duration-200 ${isUpdating ? "opacity-75" : "opacity-100"}`}>
            <div className="relative w-full lg:w-1/2 h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={95}
                    paddingAngle={2}
                    stroke="none"
                    isAnimationActive={true}
                    animationDuration={600}
                  >
                    {pieData.map((entry) => (
                      <Cell
                        key={entry.id}
                        fill={entry.color}
                        opacity={hoveredBranchId && hoveredBranchId !== entry.id ? 0.35 : 1}
                        onMouseEnter={() => {
                          if (isCustomRangeOpen) return;
                          handleBranchMouseEnter(entry.id);
                        }}
                        onMouseLeave={handleBranchMouseLeave}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-lg font-extrabold text-[#191C1E]">{formatStatValue(pieTotal)}</span>
                <span className="text-[9px] uppercase tracking-[0.8px] text-[#6B7280]">Total booked</span>
              </div>
            </div>
            <div className="w-full lg:w-1/2 flex flex-col gap-1 max-h-[260px] overflow-y-auto hide-scrollbar pr-1">
              {pieData.map((entry) => {
                const branch = branches.find((b) => b.id === entry.id);
                if (!branch) return null;
                return (
                  <Popover key={entry.id} open={hoveredBranchId === entry.id}>
                    <PopoverTrigger asChild>
                      <div
                        className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[#F8FAFC] cursor-pointer"
                        onMouseEnter={() => {
                          if (isCustomRangeOpen) return;
                          handleBranchMouseEnter(entry.id);
                        }}
                        onMouseLeave={handleBranchMouseLeave}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                          <span className="text-[10px] font-semibold text-[#191C1E] tracking-[0.3px] truncate">{entry.name}</span>
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] font-semibold text-[#424752]">{formatStatValue(entry.value)}</span>
                          <span className="text-[9px] font-semibold text-[#8C8D8F] uppercase tracking-[0.5px]">{entry.share}% share</span>
                        </span>
                      </div>
                    </PopoverTrigger>
                    <BranchHoverCard
                      branch={branch}
                      details={hoveredBranchDetails}
                      loading={isHoverDetailsLoading}
                      range={branchPerfRange}
                      onMouseEnter={cancelHoverClose}
                      onMouseLeave={handleBranchMouseLeave}
                    />
                  </Popover>
                );
              })}
            </div>
          </div>
        )
      )}
    </div>
  );
}
