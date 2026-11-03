import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { BedDouble, ArrowUpRight, Activity, RefreshCw, AlertCircle, CheckCircle2, ChevronRight } from "lucide-react";
import { ipdApi, type WardRecord } from "@/api/ipd.api";
import { useBranchFilter } from "@/context/BranchFilterContext";

interface WardOccupancyWidgetProps {
  className?: string;
}

export function WardOccupancyWidget({ className = "" }: WardOccupancyWidgetProps) {
  const navigate = useNavigate();
  const { selectedBranchId, isAllBranches } = useBranchFilter();

  const [wards, setWards] = useState<WardRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWards = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const branchIdParam = isAllBranches ? undefined : selectedBranchId;
      const res = await ipdApi.getWards(branchIdParam);
      if (res.data?.success && Array.isArray(res.data.data)) {
        setWards(res.data.data);
      } else {
        setWards([]);
      }
    } catch (err: any) {
      console.warn("WardOccupancyWidget fetch error:", err);
      setError("Unable to load live bed stats");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchWards();
  }, [selectedBranchId, isAllBranches]);

  // Aggregate bed statistics
  const totalBeds = wards.reduce((sum, w) => sum + (w.total_beds || w._count?.bed_master || 0), 0);
  const occupiedBeds = wards.reduce((sum, w) => sum + (w._count?.admission || 0), 0);
  const availableBeds = Math.max(0, totalBeds - occupiedBeds);
  const occupancyRate = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

  const getStatusColor = (rate: number) => {
    if (rate >= 90) return { bg: "bg-red-50", text: "text-red-700", bar: "bg-red-500", label: "Critical Load" };
    if (rate >= 75) return { bg: "bg-amber-50", text: "text-amber-700", bar: "bg-amber-500", label: "High Load" };
    if (rate >= 50) return { bg: "bg-blue-50", text: "text-blue-700", bar: "bg-[#00488D]", label: "Normal Load" };
    return { bg: "bg-emerald-50", text: "text-emerald-700", bar: "bg-emerald-500", label: "Available" };
  };

  const statusMeta = getStatusColor(occupancyRate);

  return (
    <div className={`bg-white rounded-2xl border border-slate-200/90 shadow-sm p-5 transition-all duration-300 hover:shadow-md ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-100 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-[#00488D]">
            <BedDouble className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-800 tracking-tight">Ward & Bed Occupancy</h3>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusMeta.bg} ${statusMeta.text}`}>
                {statusMeta.label} ({occupancyRate}%)
              </span>
            </div>
            <p className="text-[11px] text-slate-500">Live inpatient capacity and bed allocation</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fetchWards(true)}
            disabled={refreshing || loading}
            title="Refresh bed counts"
            className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-[#00488D]" : ""}`} />
          </button>
          <button
            type="button"
            onClick={() => navigate("/ipd/beds")}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-50 text-[#00488D] hover:bg-blue-50 text-xs font-semibold border border-slate-200/80 transition-colors"
          >
            <span>Bed Master</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* KPI Overview Pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-4">
        <div className="bg-slate-50/70 border border-slate-100 rounded-xl p-2.5">
          <span className="text-[10px] font-medium text-slate-400 block uppercase tracking-wider">Total Beds</span>
          <span className="text-lg font-extrabold text-slate-800 tabular-nums">{loading ? "—" : totalBeds}</span>
        </div>
        <div className="bg-blue-50/50 border border-blue-100/60 rounded-xl p-2.5">
          <span className="text-[10px] font-medium text-blue-600 block uppercase tracking-wider">Occupied</span>
          <span className="text-lg font-extrabold text-blue-800 tabular-nums">{loading ? "—" : occupiedBeds}</span>
        </div>
        <div className="bg-emerald-50/50 border border-emerald-100/60 rounded-xl p-2.5">
          <span className="text-[10px] font-medium text-emerald-600 block uppercase tracking-wider">Available</span>
          <span className="text-lg font-extrabold text-emerald-800 tabular-nums">{loading ? "—" : availableBeds}</span>
        </div>
        <div className="bg-violet-50/50 border border-violet-100/60 rounded-xl p-2.5">
          <span className="text-[10px] font-medium text-violet-600 block uppercase tracking-wider">Total Wards</span>
          <span className="text-lg font-extrabold text-violet-800 tabular-nums">{loading ? "—" : wards.length}</span>
        </div>
      </div>

      {/* Ward List */}
      <div>
        {loading ? (
          <div className="py-8 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
            <RefreshCw className="w-5 h-5 animate-spin text-[#00488D]" />
            <span>Scanning ward beds...</span>
          </div>
        ) : wards.length === 0 ? (
          <div className="py-7 px-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 flex flex-col items-center justify-center text-center gap-2">
            <div className="w-9 h-9 rounded-full bg-blue-50 text-[#00488D] flex items-center justify-center">
              <BedDouble className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-800">No Wards Registered for this Facility</p>
              <p className="text-[11px] text-slate-500 mt-0.5 max-w-sm">
                Set up inpatient wards, bed capacity, and floor designations to track live occupancy.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate("/ipd/beds")}
              className="mt-1 px-3 py-1.5 rounded-lg bg-[#00488D] hover:bg-[#00386e] text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
            >
              Configure Wards in Bed Master
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {wards.slice(0, 8).map((ward) => {
                const wTotal = ward.total_beds || ward._count?.bed_master || 0;
                const wOccupied = ward._count?.admission || 0;
                const wAvailable = Math.max(0, wTotal - wOccupied);
                const wRate = wTotal > 0 ? Math.round((wOccupied / wTotal) * 100) : 0;
                const wMeta = getStatusColor(wRate);

                return (
                  <div
                    key={ward.ward_id}
                    onClick={() => navigate(`/ipd/beds?ward=${encodeURIComponent(ward.ward_id)}`)}
                    className="group flex flex-col justify-between gap-2 p-3 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50/60 cursor-pointer transition-all shadow-sm"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-bold text-slate-800 group-hover:text-[#00488D] transition-colors truncate">
                          {ward.ward_name}
                        </span>
                        {ward.ward_type && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-medium uppercase shrink-0">
                            {ward.ward_type}
                          </span>
                        )}
                      </div>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${wMeta.bg} ${wMeta.text}`}>
                        {wRate}%
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500 tabular-nums">
                      <span>
                        <strong className="text-slate-800">{wOccupied}</strong>/{wTotal} beds occupied
                      </span>
                      <span className="text-emerald-700 font-semibold">{wAvailable} free</span>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${wMeta.bar} transition-all duration-500 rounded-full`}
                        style={{ width: `${Math.min(100, Math.max(0, wRate))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {wards.length > 8 && (
              <button
                type="button"
                onClick={() => navigate("/ipd/beds")}
                className="w-full py-1.5 text-center text-xs font-semibold text-[#00488D] hover:bg-blue-50/60 rounded-lg transition-colors cursor-pointer"
              >
                + {wards.length - 8} more wards in Bed Master
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

