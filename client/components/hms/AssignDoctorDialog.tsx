import { useEffect, useMemo, useState } from "react";
import { Loader2, Stethoscope } from "lucide-react";
import { ipdApi, type AdmissionRecord } from "@/api/ipd.api";
import { departmentApi, type Department } from "@/api/department.api";
import { employeeApi, type EmployeeRecord } from "@/api/employee.api";
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

interface AssignDoctorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  admission: AdmissionRecord | null;
  onDone: (admission: AdmissionRecord) => void;
}

/**
 * Assigns (or changes) the doctor and department of an admitted patient --
 * mainly for emergencies admitted before a doctor was known. The server moves
 * the patient's open IPD encounter to the new doctor too.
 */
export function AssignDoctorDialog({ open, onOpenChange, admission, onDone }: AssignDoctorDialogProps) {
  const { toast } = useToast();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [doctors, setDoctors] = useState<EmployeeRecord[]>([]);
  const [departmentId, setDepartmentId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !admission) return;
    setDepartmentId(admission.department_id || "");
    setDoctorId(admission.employee_id || "");
    setLoading(true);
    Promise.all([
      departmentApi.getAll().then((res) => res.data?.data || []).catch(() => [] as Department[]),
      employeeApi
        .getAll({ branchId: admission.branch_id, limit: 1000 })
        .then((res) => res.data?.data?.employees || [])
        .catch(() => [] as EmployeeRecord[]),
    ])
      .then(([depts, employees]) => {
        setDepartments(depts);
        setDoctors(employees.filter((e) => e.user_table?.role_type === "DOCTOR" && e.emp_status !== false));
      })
      .finally(() => setLoading(false));
  }, [open, admission]);

  // Departments that actually have a doctor at this branch.
  const departmentOptions = useMemo(
    () => departments.filter((d) => doctors.some((doc) => doc.department_id === d.department_id)),
    [departments, doctors],
  );

  const doctorOptions = useMemo(
    () => (departmentId ? doctors.filter((doc) => doc.department_id === departmentId) : doctors),
    [doctors, departmentId],
  );

  const doctorLabel = (doc: EmployeeRecord) =>
    `Dr. ${[doc.first_name, doc.middle_name, doc.last_name].filter(Boolean).join(" ")}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!admission || !departmentId || !doctorId) {
      toast({ title: "Select a doctor", description: "Choose a department and a doctor.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await ipdApi.update(admission.admission_id, { department_id: departmentId, employee_id: doctorId });
      if (res.data?.success) {
        onDone(res.data.data);
        onOpenChange(false);
      }
    } catch (err: any) {
      toast({
        title: "Could not assign doctor",
        description: err?.response?.data?.message || err?.message || "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const patientName = admission
    ? [admission.patient_bio_data?.patient_first_name, admission.patient_bio_data?.patient_last_name].filter(Boolean).join(" ")
    : "";

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && onOpenChange(v)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold flex items-center gap-2 text-slate-900">
            <Stethoscope className="h-5 w-5 text-blue-600" />
            {admission?.employee_id ? "Change Doctor" : "Assign Doctor"}
          </DialogTitle>
        </DialogHeader>

        {admission && (
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600">
              Patient: <span className="font-semibold text-slate-800">{patientName || "—"}</span>{" "}
              <span className="text-slate-400">• {admission.ip_number}</span>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Department *</Label>
              <Select
                value={departmentId}
                onValueChange={(val) => {
                  setDepartmentId(val);
                  if (doctorId && !doctors.some((d) => d.employee_id === doctorId && d.department_id === val)) {
                    setDoctorId("");
                  }
                }}
                disabled={loading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loading ? "Loading..." : "Select Department"} />
                </SelectTrigger>
                <SelectContent>
                  {departmentOptions.map((d) => (
                    <SelectItem key={d.department_id} value={d.department_id}>
                      {d.department_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Doctor *</Label>
              <Select
                value={doctorId}
                onValueChange={(val) => {
                  setDoctorId(val);
                  const doc = doctors.find((d) => d.employee_id === val);
                  if (doc?.department_id) setDepartmentId(doc.department_id);
                }}
                disabled={loading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loading ? "Loading..." : "Select Doctor"} />
                </SelectTrigger>
                <SelectContent>
                  {doctorOptions.length === 0 ? (
                    <SelectItem value="__NO_DOCTOR__" disabled>
                      No doctors at this branch{departmentId ? " in this department" : ""}
                    </SelectItem>
                  ) : (
                    doctorOptions.map((doc) => (
                      <SelectItem key={doc.employee_id} value={doc.employee_id}>
                        {doctorLabel(doc)}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white"
                disabled={submitting || !departmentId || !doctorId}
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Doctor"
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
