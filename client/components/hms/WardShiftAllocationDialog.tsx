import { useEffect, useMemo, useState } from "react";
import { Loader2, Users, Layers } from "lucide-react";
import {
  ipdApi,
  type AdmissionRecord,
  type AllocateCareTeamPayload,
  type WardRecord,
} from "@/api/ipd.api";
import {
  dutyRosterApi,
  type AvailableStaffMember,
  type BranchShift,
} from "@/api/dutyRoster.api";
import { useToast } from "@/hooks/use-toast";
import { StatusBadge } from "@/components/hms/StatusBadge";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { staffName, istToday, currentShiftContext } from "./AllocateCareTeamDialog";

interface WardShiftAllocationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId?: string;
  onDone: () => void;
}

export function WardShiftAllocationDialog({
  open,
  onOpenChange,
  branchId,
  onDone,
}: WardShiftAllocationDialogProps) {
  const { toast } = useToast();
  const [wards, setWards] = useState<WardRecord[]>([]);
  const [wardId, setWardId] = useState("");
  const [patients, setPatients] = useState<AdmissionRecord[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingPatients, setLoadingPatients] = useState(false);

  // Branch Shifts & Selected Shift
  const [branchShifts, setBranchShifts] = useState<BranchShift[]>([]);
  const [selectedShiftCode, setSelectedShiftCode] = useState<string>("MORNING");
  const [loadingShifts, setLoadingShifts] = useState(false);

  // Mode B Available Staff
  const [availableDoctors, setAvailableDoctors] = useState<AvailableStaffMember[]>([]);
  const [availableNurses, setAvailableNurses] = useState<AvailableStaffMember[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(false);
  const [loadingNurses, setLoadingNurses] = useState(false);
  const [doctorOverride, setDoctorOverride] = useState(false);
  const [nurseOverride, setNurseOverride] = useState(false);

  // Form selections
  const [doctorId, setDoctorId] = useState("");
  const [nurseId, setNurseId] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const ward = useMemo(() => wards.find((w) => w.ward_id === wardId) ?? null, [wards, wardId]);
  const activeBranchId = ward?.branch_id || branchId;
  const [dutyDate, setDutyDate] = useState(istToday());

  // Fresh form every time it opens
  useEffect(() => {
    if (!open) return;
    setWardId("");
    setPatients([]);
    setSelected(new Set());
    setDoctorId("");
    setNurseId("");
    setNotes("");
    ipdApi
      .getWards(branchId)
      .then((res) => setWards(res.data?.data || []))
      .catch(() => setWards([]));
  }, [open, branchId]);

  // Load branch shifts when ward or branch changes
  useEffect(() => {
    if (!open || !activeBranchId) return;
    let cancelled = false;
    setLoadingShifts(true);

    dutyRosterApi
      .getBranchShifts(activeBranchId)
      .then((res) => {
        if (cancelled) return;
        const shifts = res.data?.data || [];
        setBranchShifts(shifts);
      })
      .catch(() => {
        if (!cancelled) setBranchShifts([]);
      })
      .finally(() => !cancelled && setLoadingShifts(false));

    return () => {
      cancelled = true;
    };
  }, [open, activeBranchId]);

  // Default to the shift in force now (and its roster date), which is what the
  // server checks a new assignment against. Done in its own effect, after the
  // shift options have rendered: changing the Select's value in the same render
  // that first supplies its items makes Radix emit an empty value and blank it.
  useEffect(() => {
    if (branchShifts.length === 0) return;
    const ctx = currentShiftContext(branchShifts);
    if (ctx) {
      setSelectedShiftCode(ctx.shiftCode);
      setDutyDate(ctx.dutyDate);
    } else {
      setDutyDate(istToday());
      if (!branchShifts.some((s) => s.shift_code === selectedShiftCode)) {
        setSelectedShiftCode(branchShifts[0].shift_code);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchShifts]);

  // Mode B: Query available doctors
  useEffect(() => {
    if (!open || !activeBranchId || !selectedShiftCode) return;
    let cancelled = false;
    setLoadingDoctors(true);

    dutyRosterApi
      .getAvailableStaff({
        branchId: activeBranchId,
        dutyDate,
        shiftCode: selectedShiftCode,
        roleInDuty: "DUTY_DOCTOR",
        includeAllBranch: doctorOverride,
      })
      .then((res) => {
        if (cancelled) return;
        setAvailableDoctors(res.data?.data || []);
      })
      .catch(() => {
        if (!cancelled) setAvailableDoctors([]);
      })
      .finally(() => !cancelled && setLoadingDoctors(false));

    return () => {
      cancelled = true;
    };
  }, [open, activeBranchId, selectedShiftCode, dutyDate, doctorOverride]);

  // Mode B: Query available nurses
  useEffect(() => {
    if (!open || !activeBranchId || !selectedShiftCode) return;
    let cancelled = false;
    setLoadingNurses(true);

    dutyRosterApi
      .getAvailableStaff({
        branchId: activeBranchId,
        dutyDate,
        shiftCode: selectedShiftCode,
        roleInDuty: "DUTY_NURSE",
        includeAllBranch: nurseOverride,
      })
      .then((res) => {
        if (cancelled) return;
        setAvailableNurses(res.data?.data || []);
      })
      .catch(() => {
        if (!cancelled) setAvailableNurses([]);
      })
      .finally(() => !cancelled && setLoadingNurses(false));

    return () => {
      cancelled = true;
    };
  }, [open, activeBranchId, selectedShiftCode, dutyDate, nurseOverride]);

  // Occupied beds of the chosen ward
  useEffect(() => {
    if (!open || !ward) return;
    let cancelled = false;
    setLoadingPatients(true);
    ipdApi
      .getAll({ branchId: ward.branch_id, wardId: ward.ward_id, status: "ADMITTED", limit: 100 })
      .then((res) => {
        if (cancelled) return;
        const list = res.data?.data?.admissions || [];
        setPatients(list);
        setSelected(new Set(list.map((a) => a.admission_id)));
      })
      .catch(() => !cancelled && setPatients([]))
      .finally(() => !cancelled && setLoadingPatients(false));
    return () => {
      cancelled = true;
    };
  }, [open, ward]);

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const allSelected = patients.length > 0 && selected.size === patients.length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ward || selected.size === 0) {
      toast({ title: "Select at least one patient", variant: "destructive" });
      return;
    }
    if (!doctorId && !nurseId) {
      toast({ title: "Select a duty doctor or a nurse", variant: "destructive" });
      return;
    }

    const payload: AllocateCareTeamPayload & { ward_id: string; branch_id: string; admission_ids: string[] } = {
      ward_id: ward.ward_id,
      branch_id: ward.branch_id,
      admission_ids: [...selected],
    };
    if (doctorId) payload.assigned_doctor_id = doctorId;
    if (nurseId) payload.nurse_id = nurseId;
    if (notes.trim()) payload.handover_notes = notes.trim();

    // Flag an emergency override only when someone off-roster was actually picked.
    const pickedOffRoster = (list: AvailableStaffMember[], id: string) =>
      list.find((s) => s.employee_id === id)?.source === "OVERRIDE";
    if (pickedOffRoster(availableDoctors, doctorId) || pickedOffRoster(availableNurses, nurseId)) {
      if (!notes.trim()) {
        toast({
          title: "Reason required",
          description: "Enter the reason in Handover Notes for an emergency override.",
          variant: "destructive",
        });
        return;
      }
      payload.roster_override = true;
    }

    setSubmitting(true);
    try {
      const res = await ipdApi.bulkAllocateCareTeam(payload);
      if (res.data?.success) {
        const { updated, unchanged } = res.data.data;
        toast({
          title: "Ward roster updated",
          description: `${updated} patient${updated === 1 ? "" : "s"} updated${
            unchanged ? `, ${unchanged} already on this team` : ""
          }.`,
        });
        onDone();
        onOpenChange(false);
      }
    } catch (err: any) {
      toast({
        title: "Could not update ward roster",
        description: err?.response?.data?.message || err?.message || "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const busy = loadingShifts || submitting;

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && onOpenChange(v)}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold flex items-center gap-2 text-slate-900">
            <Users className="h-5 w-5 text-blue-600" />
            Ward Roster Handoff (Mode B Bulk Allocation)
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Ward and Shift Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Ward *</Label>
              <Select value={wardId} onValueChange={setWardId} disabled={submitting}>
                <SelectTrigger>
                  <SelectValue placeholder="Select ward" />
                </SelectTrigger>
                <SelectContent>
                  {wards.length === 0 ? (
                    <SelectItem value="__NO_WARD__" disabled>
                      No wards found
                    </SelectItem>
                  ) : (
                    wards.map((w) => (
                      <SelectItem key={w.ward_id} value={w.ward_id}>
                        {w.ward_name}
                        {w.branch?.branch_name && !branchId ? ` — ${w.branch.branch_name}` : ""}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Shift *</Label>
              <Select
                value={selectedShiftCode}
                onValueChange={(v) => {
                  if (!v) return; // Radix emits "" when its items re-register; not a user choice
                  setSelectedShiftCode(v);
                  setDoctorId("");
                  setNurseId("");
                }}
                disabled={submitting}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select shift" />
                </SelectTrigger>
                <SelectContent>
                  {branchShifts.map((s) => (
                    <SelectItem key={s.shift_id} value={s.shift_code}>
                      {s.shift_name} ({s.shift_code}) {s.is_overnight ? "🌙 Overnight" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Patients in Ward */}
          {ward && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label className="text-xs font-semibold text-slate-700">Select Patients</Label>
                  <StatusBadge tone="indigo">{selected.size} Selected</StatusBadge>
                </div>
                {patients.length > 0 && (
                  <button
                    type="button"
                    className="text-xs font-semibold text-blue-600 hover:underline"
                    onClick={() =>
                      setSelected(allSelected ? new Set() : new Set(patients.map((p) => p.admission_id)))
                    }
                  >
                    {allSelected ? "Clear all" : "Select all"}
                  </button>
                )}
              </div>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                {loadingPatients ? (
                  <div className="flex items-center justify-center gap-2 py-6 text-xs text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading patients...
                  </div>
                ) : patients.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-500">No admitted patients in this ward.</div>
                ) : (
                  patients.map((p) => {
                    const name = [p.patient_bio_data?.patient_first_name, p.patient_bio_data?.patient_last_name]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <label key={p.admission_id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50">
                        <Checkbox
                          checked={selected.has(p.admission_id)}
                          onCheckedChange={(v) => toggle(p.admission_id, v === true)}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-slate-800 truncate">{name || "—"}</div>
                          <div className="text-[11px] text-slate-500">
                            {p.ip_number}
                            {p.bed_master?.bed_number ? ` • Bed ${p.bed_master.bed_number}` : ""}
                          </div>
                        </div>
                        <div className="text-right text-[11px] text-slate-500">
                          {p.assigned_doctor && <div>Dr. {staffName(p.assigned_doctor)}</div>}
                          {p.assigned_nurse && <div>{staffName(p.assigned_nurse)}</div>}
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Duty Doctor Selection */}
          <div className="space-y-2 border rounded-lg p-3 bg-slate-50/50">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-slate-700">
                Incoming Duty Doctor <span className="font-normal text-slate-400">({selectedShiftCode})</span>
              </Label>
              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
                <Checkbox
                  checked={doctorOverride}
                  onCheckedChange={(c) => setDoctorOverride(Boolean(c))}
                />
                Override
              </label>
            </div>

            {loadingDoctors ? (
              <div className="flex items-center justify-center py-2">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Select value={doctorId} onValueChange={setDoctorId} disabled={!ward || submitting}>
                <SelectTrigger>
                  <SelectValue placeholder="Keep current doctor or select incoming..." />
                </SelectTrigger>
                <SelectContent className="max-h-52">
                  {availableDoctors.length === 0 ? (
                    <SelectItem value="__NO_DOC__" disabled>
                      No doctors rostered for this shift
                    </SelectItem>
                  ) : (
                    availableDoctors.map((d) => (
                      <SelectItem key={d.employee_id} value={d.employee_id}>
                        <div className="flex items-center justify-between gap-3 w-full">
                          <span>Dr. {staffName(d)} {d.specialization ? `(${d.specialization})` : ""}</span>
                          {d.source === "OVERRIDE" ? (
                            <StatusBadge status="pending" tone="amber">Override</StatusBadge>
                          ) : (
                            <StatusBadge status="available" tone="green">{d.active_patients_count} patients</StatusBadge>
                          )}
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Ward Nurse Selection */}
          <div className="space-y-2 border rounded-lg p-3 bg-slate-50/50">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-slate-700">
                Incoming Ward Nurse <span className="font-normal text-slate-400">({selectedShiftCode})</span>
              </Label>
              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
                <Checkbox
                  checked={nurseOverride}
                  onCheckedChange={(c) => setNurseOverride(Boolean(c))}
                />
                Override
              </label>
            </div>

            {loadingNurses ? (
              <div className="flex items-center justify-center py-2">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Select value={nurseId} onValueChange={setNurseId} disabled={!ward || submitting}>
                <SelectTrigger>
                  <SelectValue placeholder="Keep current nurse or select incoming..." />
                </SelectTrigger>
                <SelectContent className="max-h-52">
                  {availableNurses.length === 0 ? (
                    <SelectItem value="__NO_NURSE__" disabled>
                      No nurses rostered for this shift
                    </SelectItem>
                  ) : (
                    availableNurses.map((n) => (
                      <SelectItem key={n.employee_id} value={n.employee_id}>
                        <div className="flex items-center justify-between gap-3 w-full">
                          <span>Nurse {staffName(n)}</span>
                          {n.source === "OVERRIDE" ? (
                            <StatusBadge status="pending" tone="amber">Override</StatusBadge>
                          ) : (
                            <StatusBadge status="available" tone="green">{n.active_patients_count} patients</StatusBadge>
                          )}
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Handover note */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-700">
              Handover Note <span className="font-normal text-slate-400">(applied to all selected beds)</span>
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={2000}
              rows={2}
              placeholder="e.g. Shift handoff: morning rounds completed, all patients stable"
              disabled={submitting}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white"
              disabled={busy || !ward || selected.size === 0 || (!doctorId && !nurseId)}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Applying...
                </>
              ) : (
                `Apply to ${selected.size} Patient${selected.size === 1 ? "" : "s"}`
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
