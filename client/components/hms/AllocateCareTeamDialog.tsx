import { useEffect, useMemo, useState } from "react";
import { Loader2, Users, AlertCircle, ShieldAlert } from "lucide-react";
import {
  ipdApi,
  type AdmissionRecord,
  type AllocateCareTeamPayload,
  type CareTeamResponse,
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

/** Sentinel for "take this role off the patient". */
export const REMOVE = "__REMOVE__";

export const staffName = (e: {
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
}) => [e.first_name, e.middle_name, e.last_name].filter(Boolean).join(" ");

/** Today's date in hospital time (IST), yyyy-MM-dd. */
export const istToday = () =>
  new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

const shiftClock = (t: string) => {
  const hhmm = t.includes("T") ? t.slice(11, 16) : t.slice(0, 5);
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/**
 * The shift in force right now (IST) and the roster date it belongs to.
 * An overnight shift belongs to the day it started, so after midnight the
 * roster date is yesterday.
 */
export function currentShiftContext(
  shifts: BranchShift[]
): { shiftCode: string; dutyDate: string } | null {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const nowMin = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const today = ist.toISOString().slice(0, 10);
  const yesterday = new Date(ist.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  for (const s of shifts) {
    if (s.is_active === false) continue;
    const start = shiftClock(s.start_time);
    const end = shiftClock(s.end_time);
    if (end <= start) {
      if (nowMin >= start) return { shiftCode: s.shift_code, dutyDate: today };
      if (nowMin < end) return { shiftCode: s.shift_code, dutyDate: yesterday };
    } else if (nowMin >= start && nowMin < end) {
      return { shiftCode: s.shift_code, dutyDate: today };
    }
  }
  return null;
}

/** Current date and time in hospital time. */
export const formatNowIst = () =>
  new Date().toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });

interface AllocateCareTeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  admission: AdmissionRecord | null;
  onDone: (careTeam: CareTeamResponse) => void;
}

export function AllocateCareTeamDialog({
  open,
  onOpenChange,
  admission,
  onDone,
}: AllocateCareTeamDialogProps) {
  const { toast } = useToast();
  const [careTeam, setCareTeam] = useState<CareTeamResponse | null>(null);
  const [loadingTeam, setLoadingTeam] = useState(false);

  // Shifts state
  const [branchShifts, setBranchShifts] = useState<BranchShift[]>([]);
  const [selectedShiftCode, setSelectedShiftCode] = useState<string>("MORNING");
  const [loadingShifts, setLoadingShifts] = useState(false);

  // Mode B Available Staff states
  const [availableDoctors, setAvailableDoctors] = useState<AvailableStaffMember[]>([]);
  const [availableNurses, setAvailableNurses] = useState<AvailableStaffMember[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(false);
  const [loadingNurses, setLoadingNurses] = useState(false);

  // Emergency override states
  const [doctorOverride, setDoctorOverride] = useState(false);
  const [nurseOverride, setNurseOverride] = useState(false);

  // Form selections
  const [doctorId, setDoctorId] = useState("");
  const [nurseId, setNurseId] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [nowLabel, setNowLabel] = useState(formatNowIst());

  const branchId = admission?.branch_id;
  const [dutyDate, setDutyDate] = useState(istToday());

  // Refresh clock while dialog is open
  useEffect(() => {
    if (!open) return;
    setNowLabel(formatNowIst());
    const t = setInterval(() => setNowLabel(formatNowIst()), 30000);
    return () => clearInterval(t);
  }, [open]);

  // Load existing care team for patient
  useEffect(() => {
    if (!open || !admission) return;
    let cancelled = false;
    setNotes("");
    setLoadingTeam(true);

    ipdApi
      .getCareTeam(admission.admission_id)
      .then((res) => {
        if (cancelled || !res.data?.success) return;
        const team = res.data.data;
        setCareTeam(team);
        setDoctorId(team.current.assigned_doctor?.employee_id ?? "");
        setNurseId(team.current.nurse?.employee_id ?? "");
      })
      .catch(() => {
        if (cancelled) return;
        setCareTeam(null);
        setDoctorId(admission.current_assigned_doctor_id ?? "");
        setNurseId(admission.current_nurse_id ?? "");
      })
      .finally(() => !cancelled && setLoadingTeam(false));

    return () => {
      cancelled = true;
    };
  }, [open, admission]);

  // Load branch shifts
  useEffect(() => {
    if (!open || !branchId) return;
    let cancelled = false;
    setLoadingShifts(true);

    dutyRosterApi
      .getBranchShifts(branchId)
      .then((res) => {
        if (cancelled) return;
        const shifts = res.data?.data || [];
        setBranchShifts(shifts);
      })
      .catch((err) => {
        if (cancelled) return;
        toast({
          title: "Failed to load branch shifts",
          description: err.response?.data?.message || err.message,
          variant: "destructive",
        });
      })
      .finally(() => !cancelled && setLoadingShifts(false));

    return () => {
      cancelled = true;
    };
  }, [open, branchId, toast]);

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

  // Mode B: Query Available Doctors
  useEffect(() => {
    if (!open || !branchId || !selectedShiftCode) return;
    let cancelled = false;
    setLoadingDoctors(true);

    dutyRosterApi
      .getAvailableStaff({
        branchId,
        dutyDate,
        shiftCode: selectedShiftCode,
        roleInDuty: "DUTY_DOCTOR",
        includeAllBranch: doctorOverride,
      })
      .then((res) => {
        if (cancelled) return;
        setAvailableDoctors(res.data?.data || []);
      })
      .catch((err) => {
        if (cancelled) return;
        setAvailableDoctors([]);
      })
      .finally(() => !cancelled && setLoadingDoctors(false));

    return () => {
      cancelled = true;
    };
  }, [open, branchId, selectedShiftCode, dutyDate, doctorOverride]);

  // Mode B: Query Available Nurses
  useEffect(() => {
    if (!open || !branchId || !selectedShiftCode) return;
    let cancelled = false;
    setLoadingNurses(true);

    dutyRosterApi
      .getAvailableStaff({
        branchId,
        dutyDate,
        shiftCode: selectedShiftCode,
        roleInDuty: "DUTY_NURSE",
        includeAllBranch: nurseOverride,
      })
      .then((res) => {
        if (cancelled) return;
        setAvailableNurses(res.data?.data || []);
      })
      .catch((err) => {
        if (cancelled) return;
        setAvailableNurses([]);
      })
      .finally(() => !cancelled && setLoadingNurses(false));

    return () => {
      cancelled = true;
    };
  }, [open, branchId, selectedShiftCode, dutyDate, nurseOverride]);

  const currentDoctor = careTeam?.current.assigned_doctor ?? null;
  const currentNurse = careTeam?.current.nurse ?? null;

  const previousNote = useMemo(
    () => careTeam?.history.find((h) => h.handover_notes?.trim()) ?? null,
    [careTeam]
  );

  const consultantName = admission?.employees
    ? `Dr. ${staffName(admission.employees)}`
    : careTeam?.consultant
    ? `Dr. ${careTeam.consultant.employee_name}`
    : null;

  const patientName = admission
    ? [
        admission.patient_bio_data?.patient_first_name,
        admission.patient_bio_data?.patient_last_name,
      ]
        .filter(Boolean)
        .join(" ")
    : "";

  const roleValue = (selected: string, current: string | undefined): string | null | undefined => {
    if (selected === REMOVE) return current ? null : undefined;
    return selected || undefined;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!admission) return;

    const payload: AllocateCareTeamPayload = {};
    const doctor = roleValue(doctorId, currentDoctor?.employee_id);
    const nurse = roleValue(nurseId, currentNurse?.employee_id);
    if (doctor !== undefined) payload.assigned_doctor_id = doctor;
    if (nurse !== undefined) payload.nurse_id = nurse;
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

    if (payload.assigned_doctor_id === undefined && payload.nurse_id === undefined) {
      toast({ title: "Select a duty doctor or nurse", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const res = await ipdApi.allocateCareTeam(admission.admission_id, payload);
      if (res.data?.success) {
        toast({ title: "Care team updated successfully" });
        onDone(res.data.data);
        onOpenChange(false);
      }
    } catch (err: any) {
      toast({
        title: "Could not update care team",
        description: err?.response?.data?.message || err?.message || "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const busy = loadingTeam || loadingShifts;

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && onOpenChange(v)}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold flex items-center gap-2 text-slate-900">
            <Users className="h-5 w-5 text-blue-600" />
            Care Team &amp; Handover (Mode B)
          </DialogTitle>
        </DialogHeader>

        {admission && (
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            {/* Patient Header Card */}
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600 space-y-1">
              <div className="flex items-center justify-between">
                <div>
                  Patient: <span className="font-semibold text-slate-800">{patientName || "—"}</span>{" "}
                  <span className="text-slate-400">• {admission.ip_number}</span>
                </div>
                {admission.ward_master?.ward_name && (
                  <StatusBadge tone="indigo">
                    {admission.ward_master.ward_name} {admission.bed_master?.bed_number ? `- Bed ${admission.bed_master.bed_number}` : ""}
                  </StatusBadge>
                )}
              </div>
              <div>
                Attending Consultant:{" "}
                <span className="font-semibold text-slate-800">{consultantName ?? "Not assigned"}</span>
                {admission.employees?.specialization && (
                  <span className="text-slate-400"> • {admission.employees.specialization}</span>
                )}
              </div>
              <div>
                Handover Timestamp: <span className="font-semibold text-slate-800">{nowLabel}</span>
              </div>
            </div>

            {/* Shift Selector */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-slate-700">Target Shift Roster</Label>
                <span className="text-[11px] text-muted-foreground">Mode B Strict Availability</span>
              </div>
              <Select
                value={selectedShiftCode}
                onValueChange={(val) => {
                  if (!val) return; // Radix emits "" when its items re-register; not a user choice
                  setSelectedShiftCode(val);
                  setDoctorId("");
                  setNurseId("");
                }}
                disabled={busy || submitting}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select shift..." />
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

            {/* Previous handover note */}
            {previousNote && (
              <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-900">
                <div className="font-semibold mb-0.5">
                  Previous Handover Note
                  <span className="font-normal text-amber-700"> • {previousNote.employee_name}</span>
                </div>
                <div className="whitespace-pre-wrap">{previousNote.handover_notes}</div>
              </div>
            )}

            {/* Duty Doctor Selection */}
            <div className="space-y-2 border rounded-lg p-3 bg-slate-50/50">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-slate-700">
                  Duty Doctor <span className="font-normal text-slate-400">(Rostered for {selectedShiftCode})</span>
                </Label>
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
                  <Checkbox
                    checked={doctorOverride}
                    onCheckedChange={(c) => setDoctorOverride(Boolean(c))}
                  />
                  Emergency Override
                </label>
              </div>

              {loadingDoctors ? (
                <div className="flex items-center justify-center py-2">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Select value={doctorId} onValueChange={setDoctorId} disabled={submitting}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select duty doctor..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-56">
                    {availableDoctors.length === 0 ? (
                      <SelectItem value="__NO_DOC__" disabled>
                        No doctors rostered for this shift
                      </SelectItem>
                    ) : (
                      availableDoctors.map((doc) => {
                        const name = staffName(doc);
                        const isOverride = doc.source === "OVERRIDE";
                        return (
                          <SelectItem key={doc.employee_id} value={doc.employee_id}>
                            <div className="flex items-center justify-between gap-3 w-full">
                              <span>Dr. {name} {doc.specialization ? `(${doc.specialization})` : ""}</span>
                              {isOverride ? (
                                <StatusBadge status="pending" tone="amber">Override</StatusBadge>
                              ) : (
                                <StatusBadge status="available" tone="green">
                                  {doc.active_patients_count} patients
                                </StatusBadge>
                              )}
                            </div>
                          </SelectItem>
                        );
                      })
                    )}
                    {currentDoctor && (
                      <SelectItem value={REMOVE}>— Remove current doctor assignment —</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Ward Nurse Selection */}
            <div className="space-y-2 border rounded-lg p-3 bg-slate-50/50">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-slate-700">
                  Ward Nurse <span className="font-normal text-slate-400">(Rostered for {selectedShiftCode})</span>
                </Label>
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
                  <Checkbox
                    checked={nurseOverride}
                    onCheckedChange={(c) => setNurseOverride(Boolean(c))}
                  />
                  Emergency Override
                </label>
              </div>

              {loadingNurses ? (
                <div className="flex items-center justify-center py-2">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Select value={nurseId} onValueChange={setNurseId} disabled={submitting}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select ward nurse..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-56">
                    {availableNurses.length === 0 ? (
                      <SelectItem value="__NO_NURSE__" disabled>
                        No nurses rostered for this shift
                      </SelectItem>
                    ) : (
                      availableNurses.map((nurse) => {
                        const name = staffName(nurse);
                        const isOverride = nurse.source === "OVERRIDE";
                        return (
                          <SelectItem key={nurse.employee_id} value={nurse.employee_id}>
                            <div className="flex items-center justify-between gap-3 w-full">
                              <span>Nurse {name}</span>
                              {isOverride ? (
                                <StatusBadge status="pending" tone="amber">Override</StatusBadge>
                              ) : (
                                <StatusBadge status="available" tone="green">
                                  {nurse.active_patients_count} patients
                                </StatusBadge>
                              )}
                            </div>
                          </SelectItem>
                        );
                      })
                    )}
                    {currentNurse && (
                      <SelectItem value={REMOVE}>— Remove current nurse assignment —</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Handover Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">
                Handover Notes <span className="font-normal text-slate-400">(Required for overrides or shift change)</span>
              </Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={2000}
                rows={3}
                placeholder="e.g. Patient stable, vital signs normal, scheduled for morning rounds"
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
                disabled={submitting || busy || (!doctorId && !nurseId)}
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Care Team"
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
