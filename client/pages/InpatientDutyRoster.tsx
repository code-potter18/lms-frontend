import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Calendar,
  Users,
  Settings,
  RefreshCw,
  ArrowLeft,
  Building2,
  AlertCircle,
} from "lucide-react";
import {
  dutyRosterApi,
  type BranchShift,
  type DutyRosterEntry,
  type DutyTemplate,
} from "@/api/dutyRoster.api";
import { useBranchFilter, ALL_BRANCHES_VALUE, NO_BRANCH_VALUE } from "@/context/BranchFilterContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/hms/StatusBadge";
import { DutyRosterGrid } from "@/components/hms/DutyRosterGrid";
import { BranchShiftConfigDialog } from "@/components/hms/BranchShiftConfigDialog";
import { WardShiftAllocationDialog } from "@/components/hms/WardShiftAllocationDialog";
import { toLocalISODate } from "@/utils/parseDate";

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDateRange(monday: Date): string {
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);

  const startDay = monday.getDate();
  const startMonth = monday.toLocaleString("default", { month: "short" });
  const startYear = monday.getFullYear();

  const endDay = sunday.getDate();
  const endMonth = sunday.toLocaleString("default", { month: "short" });
  const endYear = sunday.getFullYear();

  if (startYear === endYear && startMonth === endMonth) {
    return `${startDay} - ${endDay} ${startMonth} ${startYear}`;
  }
  return `${startDay} ${startMonth} - ${endDay} ${endMonth} ${endYear}`;
}

export default function InpatientDutyRoster() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { branches, selectedBranchId, selectBranch, isAllBranches } = useBranchFilter();

  // Active branch for duty roster (since roster is branch-level)
  const activeBranchId = useMemo(() => {
    if (selectedBranchId && selectedBranchId !== ALL_BRANCHES_VALUE && selectedBranchId !== NO_BRANCH_VALUE) {
      return selectedBranchId;
    }
    return branches[0]?.id || "";
  }, [selectedBranchId, branches]);

  // Current week Monday state
  const [currentMonday, setCurrentMonday] = useState<Date>(() => getMonday(new Date()));

  // Data states
  const [shifts, setShifts] = useState<BranchShift[]>([]);
  const [rosterEntries, setRosterEntries] = useState<DutyRosterEntry[]>([]);
  const [templates, setTemplates] = useState<DutyTemplate[]>([]);
  const [loading, setLoading] = useState(false);

  // Modal dialog states
  const [shiftConfigOpen, setShiftConfigOpen] = useState(false);
  const [wardHandoffOpen, setWardHandoffOpen] = useState(false);

  const fromDate = useMemo(() => toLocalISODate(currentMonday), [currentMonday]);
  const toDate = useMemo(() => {
    const sun = new Date(currentMonday);
    sun.setDate(sun.getDate() + 6);
    return toLocalISODate(sun);
  }, [currentMonday]);

  // Fetch all roster data for the week
  const fetchRosterData = useCallback(async () => {
    if (!activeBranchId) return;

    setLoading(true);
    try {
      const [shiftsRes, rosterRes, templatesRes] = await Promise.all([
        dutyRosterApi.getBranchShifts(activeBranchId),
        dutyRosterApi.getRoster(activeBranchId, fromDate, toDate),
        dutyRosterApi.getTemplates(activeBranchId),
      ]);

      setShifts(shiftsRes.data?.data || []);
      setRosterEntries(rosterRes.data?.data || []);
      setTemplates(templatesRes.data?.data || []);
    } catch (err: any) {
      toast({
        title: "Failed to load duty roster data",
        description: err.response?.data?.message || err.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [activeBranchId, fromDate, toDate, toast]);

  useEffect(() => {
    fetchRosterData();
  }, [fetchRosterData]);

  // Week navigation handlers
  const handlePrevWeek = () => {
    setCurrentMonday((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() - 7);
      return next;
    });
  };

  const handleNextWeek = () => {
    setCurrentMonday((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + 7);
      return next;
    });
  };

  const handleCurrentWeek = () => {
    setCurrentMonday(getMonday(new Date()));
  };

  // Active branch object
  const currentBranch = branches.find((b) => b.id === activeBranchId);

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto min-h-screen bg-slate-50/40">
      {/* Top Breadcrumb & Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/inpatient/admissions")}
            className="text-muted-foreground hover:text-slate-900 gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            Admissions
          </Button>
          <div className="h-4 w-px bg-slate-300" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <Calendar className="w-6 h-6 text-primary" />
              Inpatient Staff Duty Roster
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Strict roster-guided scheduling (Mode B) for duty doctors and ward nurses.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Branch Picker */}
          {branches.length > 1 && (
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border shadow-sm">
              <Building2 className="w-4 h-4 text-muted-foreground" />
              <Select value={activeBranchId} onValueChange={(val) => selectBranch(val)}>
                <SelectTrigger className="border-0 shadow-none p-0 h-auto focus:ring-0 text-xs font-medium w-40">
                  <SelectValue placeholder="Select Branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShiftConfigOpen(true)}
            className="gap-1.5 bg-white text-xs shadow-sm"
          >
            <Clock className="w-4 h-4 text-amber-500" />
            Shift Hours
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setWardHandoffOpen(true)}
            className="gap-1.5 bg-white text-xs shadow-sm"
          >
            <Users className="w-4 h-4 text-blue-600" />
            Ward Handoff
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={fetchRosterData}
            disabled={loading}
            className="h-8 w-8 bg-white shadow-sm"
            title="Refresh Roster"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-primary" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Week Navigation & Branch Info Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border bg-white shadow-sm">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={handlePrevWeek}
            className="h-8 w-8"
            title="Previous Week"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleCurrentWeek}
            className="h-8 text-xs font-semibold px-3"
          >
            Today
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={handleNextWeek}
            className="h-8 w-8"
            title="Next Week"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>

          <div className="ml-2">
            <span className="text-sm font-bold text-slate-800">{formatDateRange(currentMonday)}</span>
            <span className="text-xs text-muted-foreground ml-2">
              ({currentBranch?.name || "Active Branch"})
            </span>
          </div>
        </div>

        {/* Legend / Status Indicators */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <StatusBadge tone="blue">Duty Doctor</StatusBadge>
          <StatusBadge tone="teal">Ward Nurse</StatusBadge>
          <StatusBadge tone="slate">Weekly Template</StatusBadge>
        </div>
      </div>

      {/* Main Weekly Roster Matrix */}
      {shifts.length === 0 && !loading ? (
        <div className="p-12 text-center border rounded-xl bg-white space-y-3">
          <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
          <h3 className="font-semibold text-slate-800">No Shifts Configured for this Branch</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            You need to configure the shift timings (e.g., Morning, Evening, Night) for this branch
            before scheduling staff.
          </p>
          <Button size="sm" onClick={() => setShiftConfigOpen(true)} className="gap-1.5">
            <Clock className="w-4 h-4" />
            Configure Shifts Now
          </Button>
        </div>
      ) : (
        <DutyRosterGrid
          branchId={activeBranchId}
          weekStartDate={currentMonday}
          shifts={shifts}
          rosterEntries={rosterEntries}
          templates={templates}
          onRefresh={fetchRosterData}
          loading={loading}
        />
      )}

      {/* Shift Timing Configuration Dialog */}
      <BranchShiftConfigDialog
        open={shiftConfigOpen}
        onOpenChange={setShiftConfigOpen}
        branchId={activeBranchId}
        onShiftsUpdated={fetchRosterData}
      />

      {/* Bulk Ward Shift Allocation Dialog */}
      <WardShiftAllocationDialog
        open={wardHandoffOpen}
        onOpenChange={setWardHandoffOpen}
        branchId={activeBranchId}
        onDone={fetchRosterData}
      />
    </div>
  );
}

