import { useState } from "react";
import { Plus, Trash2, User, UserCheck, Loader2 } from "lucide-react";
import {
  dutyRosterApi,
  type BranchShift,
  type DutyRosterEntry,
  type DutyTemplate,
} from "@/api/dutyRoster.api";
import { employeeApi, type EmployeeRecord } from "@/api/employee.api";
import { useToast } from "@/hooks/use-toast";
import { toLocalISODate } from "@/utils/parseDate";
import { StatusBadge } from "@/components/hms/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface DutyRosterGridProps {
  branchId: string;
  weekStartDate: Date; // Monday
  shifts: BranchShift[];
  rosterEntries: DutyRosterEntry[];
  templates: DutyTemplate[];
  onRefresh: () => void;
  loading?: boolean;
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_OF_WEEK_KEYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;

function formatDayHeader(date: Date, index: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + index);
  const dayNum = d.getDate();
  const monthName = d.toLocaleString("default", { month: "short" });
  return {
    dayName: DAY_NAMES[index],
    formattedDate: `${dayNum} ${monthName}`,
    isoDate: toLocalISODate(d),
    dayOfWeekKey: DAY_OF_WEEK_KEYS[index],
  };
}

export function DutyRosterGrid({
  branchId,
  weekStartDate,
  shifts,
  rosterEntries,
  templates,
  onRefresh,
  loading = false,
}: DutyRosterGridProps) {
  const { toast } = useToast();

  // Quick Add Staff Modal state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [selectedShift, setSelectedShift] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<"DUTY_DOCTOR" | "DUTY_NURSE">("DUTY_DOCTOR");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [staffList, setStaffList] = useState<EmployeeRecord[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const days = Array.from({ length: 7 }, (_, i) => formatDayHeader(weekStartDate, i));

  const handleOpenAdd = async (shiftCode: string, isoDate: string) => {
    setSelectedShift(shiftCode);
    setSelectedDate(isoDate);
    setSelectedEmployeeId("");
    setSelectedRole("DUTY_DOCTOR");
    setAddModalOpen(true);
    await loadStaff("DUTY_DOCTOR");
  };

  const loadStaff = async (role: "DUTY_DOCTOR" | "DUTY_NURSE") => {
    if (!branchId) return;
    setStaffLoading(true);
    try {
      const res = await employeeApi.getAll({
        branchId: branchId,
        roleType: role === "DUTY_DOCTOR" ? "DOCTOR" : "NURSE",
        limit: 100,
      });
      setStaffList(res.data?.data?.employees || []);
    } catch (err: any) {
      toast({
        title: "Failed to load staff",
        description: err.response?.data?.message || err.message,
        variant: "destructive",
      });
    } finally {
      setStaffLoading(false);
    }
  };

  const handleRoleChange = async (role: "DUTY_DOCTOR" | "DUTY_NURSE") => {
    setSelectedRole(role);
    setSelectedEmployeeId("");
    await loadStaff(role);
  };

  const handleSaveRoster = async () => {
    if (!selectedEmployeeId || !selectedShift || !selectedDate) {
      toast({ title: "Please select an employee", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const shiftObj = shifts.find((s) => s.shift_code === selectedShift);
      await dutyRosterApi.upsertRosterEntry({
        branch_id: branchId,
        employee_id: selectedEmployeeId,
        duty_date: selectedDate,
        shift_code: selectedShift,
        role_in_duty: selectedRole,
        start_time: shiftObj?.start_time,
        end_time: shiftObj?.end_time,
        status: "SCHEDULED",
      });

      toast({ title: "Staff scheduled to duty roster" });
      setAddModalOpen(false);
      onRefresh();
    } catch (err: any) {
      toast({
        title: "Failed to schedule staff",
        description: err.response?.data?.message || err.message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRoster = async (rosterId: string) => {
    setDeletingId(rosterId);
    try {
      await dutyRosterApi.deleteRosterEntry(rosterId);
      toast({ title: "Staff removed from shift" });
      onRefresh();
    } catch (err: any) {
      toast({
        title: "Failed to remove staff",
        description: err.response?.data?.message || err.message,
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="relative border rounded-xl overflow-hidden shadow-sm bg-white">
      {loading && (
        <div className="absolute inset-0 bg-white/70 z-10 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="p-3 text-left font-semibold text-slate-700 w-44 sticky left-0 bg-slate-50 z-10 border-r">
                Shift
              </th>
              {days.map((day) => (
                <th key={day.isoDate} className="p-3 text-center border-r font-medium min-w-[150px]">
                  <div className="font-semibold text-slate-900">{day.dayName}</div>
                  <div className="text-xs text-muted-foreground">{day.formattedDate}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shifts.map((shift) => (
              <tr key={shift.shift_id} className="border-b border-slate-200 hover:bg-slate-50/50">
                {/* Shift Header Cell */}
                <td className="p-3 align-top sticky left-0 bg-white border-r font-medium z-10 shadow-sm">
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-slate-800">{shift.shift_name}</span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <StatusBadge
                        tone={
                          shift.shift_code === "MORNING"
                            ? "amber"
                            : shift.shift_code === "EVENING"
                            ? "blue"
                            : shift.shift_code === "NIGHT"
                            ? "purple"
                            : "teal"
                        }
                      >
                        {shift.shift_code}
                      </StatusBadge>
                    </div>
                  </div>
                </td>

                {/* 7 Days Cells */}
                {days.map((day) => {
                  // Find explicit roster entries for this day and shift
                  const entries = rosterEntries.filter(
                    (r) =>
                      r.shift_code === shift.shift_code &&
                      r.duty_date.startsWith(day.isoDate)
                  );

                  // Find recurring templates for fallback display if no roster entries
                  const dayTemplates = templates.filter(
                    (t) =>
                      t.shift_code === shift.shift_code &&
                      t.day_of_week === day.dayOfWeekKey
                  );

                  return (
                    <td key={day.isoDate} className="p-2 align-top border-r min-h-[90px]">
                      <div className="space-y-1.5 min-h-[70px] flex flex-col justify-between">
                        <div className="space-y-1">
                          {entries.length > 0 ? (
                            entries.map((entry) => {
                              const emp = entry.employees;
                              const name = emp
                                ? [emp.first_name, emp.middle_name, emp.last_name]
                                    .filter(Boolean)
                                    .join(" ")
                                : "Staff Member";
                              const isDoctor = entry.role_in_duty === "DUTY_DOCTOR";

                              return (
                                <div
                                  key={entry.roster_id}
                                  className="group flex items-center justify-between p-1.5 rounded-md border bg-slate-50/80 hover:bg-slate-100 text-xs transition"
                                >
                                  <div className="flex items-center gap-1.5 overflow-hidden">
                                    <StatusBadge tone={isDoctor ? "blue" : "teal"}>
                                      {isDoctor ? "Dr" : "Nurse"}
                                    </StatusBadge>
                                    <span className="truncate font-medium text-slate-700" title={name}>
                                      {name}
                                    </span>
                                  </div>

                                  <button
                                    onClick={() => handleDeleteRoster(entry.roster_id)}
                                    disabled={deletingId === entry.roster_id}
                                    className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 p-0.5 rounded transition"
                                    title="Remove from shift"
                                  >
                                    {deletingId === entry.roster_id ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <Trash2 className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                </div>
                              );
                            })
                          ) : dayTemplates.length > 0 ? (
                            dayTemplates.map((t) => {
                              const emp = t.employees;
                              const name = emp
                                ? [emp.first_name, emp.middle_name, emp.last_name]
                                    .filter(Boolean)
                                    .join(" ")
                                : "Staff Member";
                              const isDoctor = t.role_in_duty === "DUTY_DOCTOR";

                              return (
                                <div
                                  key={t.template_id}
                                  className="flex items-center justify-between p-1.5 rounded-md border border-dashed border-slate-300 bg-slate-50/40 text-xs"
                                >
                                  <div className="flex items-center gap-1.5 overflow-hidden">
                                    <StatusBadge tone="slate">Template</StatusBadge>
                                    <span className="truncate text-slate-600" title={name}>
                                      {isDoctor ? "Dr. " : ""}{name}
                                    </span>
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <div className="text-center py-2 text-[11px] text-muted-foreground/60 italic">
                              Unassigned
                            </div>
                          )}
                        </div>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenAdd(shift.shift_code, day.isoDate)}
                          className="w-full text-xs h-6 text-muted-foreground hover:text-primary gap-1 p-0"
                        >
                          <Plus className="w-3 h-3" /> Add
                        </Button>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Staff to Shift Modal */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-primary" />
              Schedule Staff to Duty Roster
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-lg border">
              <div>
                <span className="text-muted-foreground">Shift:</span>{" "}
                <span className="font-semibold">{selectedShift}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Date:</span>{" "}
                <span className="font-semibold">{selectedDate}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Role</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={selectedRole === "DUTY_DOCTOR" ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleRoleChange("DUTY_DOCTOR")}
                  className="w-full"
                >
                  Duty Doctor
                </Button>
                <Button
                  type="button"
                  variant={selectedRole === "DUTY_NURSE" ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleRoleChange("DUTY_NURSE")}
                  className="w-full"
                >
                  Ward Nurse
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Select {selectedRole === "DUTY_DOCTOR" ? "Doctor" : "Nurse"}</Label>
              {staffLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose employee..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-56">
                    {staffList.map((s) => {
                      const name = [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ");
                      return (
                        <SelectItem key={s.employee_id} value={s.employee_id}>
                          {name} {s.specialization ? `(${s.specialization})` : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveRoster} disabled={submitting || !selectedEmployeeId}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
              Confirm Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

