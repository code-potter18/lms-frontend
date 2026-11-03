import { useEffect, useState } from "react";
import { Loader2, Clock, Moon, Sun, Save } from "lucide-react";
import { dutyRosterApi, type BranchShift } from "@/api/dutyRoster.api";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/hms/StatusBadge";

interface BranchShiftConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: string;
  onShiftsUpdated?: () => void;
}

export function formatShiftTime(val?: string | null): string {
  if (!val) return "08:00";
  if (val.includes("T")) {
    const parts = val.split("T")[1];
    return parts.slice(0, 5);
  }
  return val.slice(0, 5);
}

export function BranchShiftConfigDialog({
  open,
  onOpenChange,
  branchId,
  onShiftsUpdated,
}: BranchShiftConfigDialogProps) {
  const { toast } = useToast();
  const [shifts, setShifts] = useState<BranchShift[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingShiftId, setSavingShiftId] = useState<string | null>(null);

  // Local draft state for editable fields per shift
  const [drafts, setDrafts] = useState<
    Record<
      string,
      {
        shift_name: string;
        start_time: string;
        end_time: string;
        is_overnight: boolean;
      }
    >
  >({});

  useEffect(() => {
    if (!open || !branchId) return;

    let mounted = true;
    setLoading(true);

    dutyRosterApi
      .getBranchShifts(branchId)
      .then((res) => {
        if (!mounted) return;
        const list = res.data.data || [];
        setShifts(list);

        const initialDrafts: Record<string, any> = {};
        for (const s of list) {
          initialDrafts[s.shift_id] = {
            shift_name: s.shift_name,
            start_time: formatShiftTime(s.start_time),
            end_time: formatShiftTime(s.end_time),
            is_overnight: s.is_overnight,
          };
        }
        setDrafts(initialDrafts);
      })
      .catch((err) => {
        if (!mounted) return;
        toast({
          title: "Failed to load shift timings",
          description: err.response?.data?.message || err.message,
          variant: "destructive",
        });
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [open, branchId, toast]);

  const handleFieldChange = (
    shiftId: string,
    field: "shift_name" | "start_time" | "end_time" | "is_overnight",
    value: any
  ) => {
    setDrafts((prev) => {
      const current = prev[shiftId] || {
        shift_name: "",
        start_time: "08:00",
        end_time: "16:00",
        is_overnight: false,
      };

      const updated = { ...current, [field]: value };

      // Auto-detect overnight when end_time <= start_time
      if (field === "start_time" || field === "end_time") {
        const start = field === "start_time" ? value : current.start_time;
        const end = field === "end_time" ? value : current.end_time;
        if (start && end && end < start) {
          updated.is_overnight = true;
        }
      }

      return { ...prev, [shiftId]: updated };
    });
  };

  const handleSaveShift = async (shift: BranchShift) => {
    const draft = drafts[shift.shift_id];
    if (!draft) return;

    setSavingShiftId(shift.shift_id);
    try {
      await dutyRosterApi.updateBranchShift(shift.shift_id, {
        shift_name: draft.shift_name.trim(),
        start_time: draft.start_time,
        end_time: draft.end_time,
        is_overnight: draft.is_overnight,
      });

      toast({
        title: "Shift timing updated",
        description: `${draft.shift_name} is set to ${draft.start_time} - ${draft.end_time} ${
          draft.is_overnight ? "(Overnight)" : ""
        }`,
      });

      onShiftsUpdated?.();
    } catch (err: any) {
      toast({
        title: "Failed to update shift",
        description: err.response?.data?.message || err.message,
        variant: "destructive",
      });
    } finally {
      setSavingShiftId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <Clock className="w-5 h-5 text-primary" />
            Branch Shift Configurations
          </DialogTitle>
          <DialogDescription>
            Configure daily shift timings for this branch. Overnight shifts crossing midnight are
            supported and will apply across OPD and IPD duty rosters.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : shifts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No shifts configured for this branch.
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {shifts.map((shift) => {
              const draft = drafts[shift.shift_id] || {
                shift_name: shift.shift_name,
                start_time: formatShiftTime(shift.start_time),
                end_time: formatShiftTime(shift.end_time),
                is_overnight: shift.is_overnight,
              };

              const isSaving = savingShiftId === shift.shift_id;
              const isOvernight = draft.is_overnight;

              return (
                <div
                  key={shift.shift_id}
                  className="rounded-lg border bg-card p-4 shadow-sm flex flex-col gap-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-base">{draft.shift_name || shift.shift_code}</span>
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

                    {isOvernight && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                        <Moon className="w-3.5 h-3.5" />
                        Spans Midnight
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                    <div>
                      <Label className="text-xs text-muted-foreground">Shift Label</Label>
                      <Input
                        value={draft.shift_name}
                        onChange={(e) => handleFieldChange(shift.shift_id, "shift_name", e.target.value)}
                        className="mt-1 h-9"
                      />
                    </div>

                    <div>
                      <Label className="text-xs text-muted-foreground flex items-center gap-1">
                        <Sun className="w-3.5 h-3.5 text-amber-500" /> Start Time
                      </Label>
                      <Input
                        type="time"
                        value={draft.start_time}
                        onChange={(e) => handleFieldChange(shift.shift_id, "start_time", e.target.value)}
                        className="mt-1 h-9"
                      />
                    </div>

                    <div>
                      <Label className="text-xs text-muted-foreground flex items-center gap-1">
                        <Moon className="w-3.5 h-3.5 text-indigo-500" /> End Time
                      </Label>
                      <Input
                        type="time"
                        value={draft.end_time}
                        onChange={(e) => handleFieldChange(shift.shift_id, "end_time", e.target.value)}
                        className="mt-1 h-9"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                      <Checkbox
                        checked={draft.is_overnight}
                        onCheckedChange={(checked) =>
                          handleFieldChange(shift.shift_id, "is_overnight", Boolean(checked))
                        }
                      />
                      Crosses midnight (next day completion)
                    </label>

                    <Button
                      size="sm"
                      onClick={() => handleSaveShift(shift)}
                      disabled={isSaving}
                      className="gap-1.5 h-8"
                    >
                      {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      Save Shift
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

