import { useEffect, useMemo, useState } from "react";
import { Bed as BedIcon, CalendarClock, Loader2 } from "lucide-react";
import { ipdApi, type AdmissionRecord, type BedRecord, type WardRecord } from "@/api/ipd.api";
import { useToast } from "@/hooks/use-toast";
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
import { getBedStatusMeta } from "@/components/hms/BedStatusBadge";

export type AdmitBedDialogMode = "admit" | "reserve";

interface AdmitBedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: AdmitBedDialogMode;
  admission: AdmissionRecord | null;
  /** Called with the updated admission after a successful admit / reserve. */
  onDone: (admission: AdmissionRecord) => void;
}

// A bed is selectable when it is free, or already held for this very request.
function isSelectable(bed: BedRecord, admissionId: string) {
  return (
    bed.status === "AVAILABLE" ||
    (bed.status === "RESERVED" && bed.reserved_admission_id === admissionId)
  );
}

/**
 * Bed picker for a PLANNED admission -- "admit" admits the patient into the
 * chosen bed, "reserve" holds it until the end of the planned day. Starts on
 * the requested (or reserved) bed when it is still free, and says so when it
 * isn't, so the desk can pick another bed instead of hitting an error.
 */
export function AdmitBedDialog({ open, onOpenChange, mode, admission, onDone }: AdmitBedDialogProps) {
  const { toast } = useToast();
  const [wards, setWards] = useState<WardRecord[]>([]);
  const [beds, setBeds] = useState<BedRecord[]>([]);
  const [wardId, setWardId] = useState("");
  const [bedId, setBedId] = useState("");
  const [loadingBeds, setLoadingBeds] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Status of the originally requested bed when it can't be used any more.
  const [requestedBedIssue, setRequestedBedIssue] = useState<string | null>(null);

  const admissionId = admission?.admission_id ?? "";

  useEffect(() => {
    if (!open || !admission) return;
    setWardId(admission.ward_id || "");
    setBedId("");
    setRequestedBedIssue(null);
    ipdApi
      .getWards(admission.branch_id)
      .then((res) => setWards(res.data?.data || []))
      .catch(() => setWards([]));
  }, [open, admission]);

  useEffect(() => {
    if (!open || !wardId) {
      setBeds([]);
      return;
    }
    let cancelled = false;
    setLoadingBeds(true);
    ipdApi
      .getBeds(wardId, admission?.branch_id)
      .then((res) => {
        if (cancelled) return;
        const list = res.data?.data || [];
        setBeds(list);
        // Pre-select the requested bed only on the request's own ward, and
        // only while it is still usable.
        if (admission && wardId === admission.ward_id && admission.bed_id) {
          const requested = list.find((b) => b.bed_id === admission.bed_id);
          if (requested && isSelectable(requested, admission.admission_id)) {
            setBedId(requested.bed_id);
            setRequestedBedIssue(null);
          } else if (requested) {
            setRequestedBedIssue(
              `Requested bed ${requested.bed_number} is now ${getBedStatusMeta(requested.status).label.toLowerCase()} -- choose another bed.`,
            );
          }
        }
      })
      .catch(() => {
        if (!cancelled) setBeds([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingBeds(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, wardId, admission]);

  const selectableCount = useMemo(
    () => beds.filter((b) => isSelectable(b, admissionId)).length,
    [beds, admissionId],
  );

  const patientName = admission
    ? [admission.patient_bio_data?.patient_first_name, admission.patient_bio_data?.patient_last_name]
        .filter(Boolean)
        .join(" ")
    : "";

  const plannedDate = admission?.admission_date
    ? new Date(admission.admission_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!admission || !wardId || !bedId) {
      toast({ title: "Select a bed", description: "Choose a ward and an available bed.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const payload = { ward_id: wardId, bed_id: bedId };
      const res =
        mode === "admit"
          ? await ipdApi.admit(admission.admission_id, payload)
          : await ipdApi.reserve(admission.admission_id, payload);
      if (res.data?.success) {
        onDone(res.data.data);
        onOpenChange(false);
      }
    } catch (err: any) {
      toast({
        title: mode === "admit" ? "Admit failed" : "Reservation failed",
        description: err?.response?.data?.message || err?.message || "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && onOpenChange(v)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold flex items-center gap-2 text-slate-900">
            {mode === "admit" ? (
              <BedIcon className="h-5 w-5 text-green-600" />
            ) : (
              <CalendarClock className="h-5 w-5 text-violet-600" />
            )}
            {mode === "admit" ? "Admit Patient" : "Reserve Bed"}
          </DialogTitle>
        </DialogHeader>

        {admission && (
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1 text-slate-600">
              <div>
                Patient: <span className="font-semibold text-slate-800">{patientName || "—"}</span>{" "}
                <span className="text-slate-400">• {admission.ip_number}</span>
              </div>
              <div>
                Planned for: <span className="font-semibold text-slate-800">{plannedDate || "—"}</span>
              </div>
              {mode === "reserve" && (
                <div className="text-violet-700">
                  The bed is held for this patient until the end of the planned day, then released automatically.
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Ward *</Label>
              <Select
                value={wardId}
                onValueChange={(val) => {
                  setWardId(val);
                  setBedId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Ward" />
                </SelectTrigger>
                <SelectContent>
                  {wards.map((w) => (
                    <SelectItem key={w.ward_id} value={w.ward_id}>
                      {w.ward_name} ({w.ward_type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Bed *</Label>
              <Select value={bedId} onValueChange={setBedId} disabled={!wardId || loadingBeds}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={!wardId ? "Select Ward first" : loadingBeds ? "Loading beds..." : "Select Bed"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {beds.length === 0 ? (
                    <SelectItem value="__NO_BED__" disabled>
                      No beds in this ward
                    </SelectItem>
                  ) : (
                    beds.map((b) => {
                      const selectable = isSelectable(b, admission.admission_id);
                      const heldForThis = b.status === "RESERVED" && selectable;
                      return (
                        <SelectItem key={b.bed_id} value={b.bed_id} disabled={!selectable}>
                          Bed {b.bed_number}
                          {b.bed_type ? ` (${b.bed_type})` : ""}
                          {heldForThis
                            ? " — reserved for this patient"
                            : selectable
                              ? ""
                              : ` — ${getBedStatusMeta(b.status).label}`}
                        </SelectItem>
                      );
                    })
                  )}
                </SelectContent>
              </Select>
              {requestedBedIssue && <p className="text-xs text-amber-600">{requestedBedIssue}</p>}
              {wardId && !loadingBeds && beds.length > 0 && selectableCount === 0 && (
                <p className="text-xs text-amber-600">No free beds in this ward -- try another ward.</p>
              )}
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button
                type="submit"
                className={
                  mode === "admit"
                    ? "bg-green-600 hover:bg-green-700 text-white"
                    : "bg-violet-600 hover:bg-violet-700 text-white"
                }
                disabled={submitting || !bedId}
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {mode === "admit" ? "Admitting..." : "Reserving..."}
                  </>
                ) : mode === "admit" ? (
                  "Confirm Admit"
                ) : (
                  "Reserve Bed"
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
