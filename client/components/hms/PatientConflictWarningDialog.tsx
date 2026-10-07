import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, AlertTriangle, Clock, User, Building, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { StatusBadge } from "@/components/hms/StatusBadge";

export interface PatientConflictAppointment {
  appointmentId: string;
  doctorName: string;
  time: string;
  branchName: string;
  department?: string | null;
  status: string;
}

export interface PatientConflictWarningDialogProps {
  open: boolean;
  severity?: "warning" | "high" | "critical";
  conflicts: { type: string; message: string }[];
  existingAppointments: PatientConflictAppointment[];
  totalAppointments: number;
  onCancel: () => void;
  onProceed: () => void;
  loading?: boolean;
}

const severityConfig = {
  warning: {
    iconColor: "text-amber-600",
    bgColor: "bg-amber-100",
    title: "Possible Conflict",
    description: "This patient already has appointments on this day.",
  },
  high: {
    iconColor: "text-orange-600",
    bgColor: "bg-orange-100",
    title: "High Concern",
    description: "This patient has an appointment with the same doctor on this day.",
  },
  critical: {
    iconColor: "text-red-600",
    bgColor: "bg-red-100",
    title: "Direct Conflict",
    description: "This patient already has an appointment at a similar time.",
  },
};

export function PatientConflictWarningDialog({
  open,
  severity = "warning",
  conflicts,
  existingAppointments,
  totalAppointments,
  onCancel,
  onProceed,
  loading = false,
}: PatientConflictWarningDialogProps) {
  const config = severityConfig[severity];

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 hms-modal-overlay data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-[50%] top-[50%] z-50 w-full max-w-xl translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-xl duration-200 hms-modal-content data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-xl"
          )}
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className={cn("flex h-12 w-12 items-center justify-center rounded-full", config.bgColor)}>
                <AlertTriangle className={cn("h-6 w-6", config.iconColor)} />
              </div>
              <div className="flex-1">
                <DialogPrimitive.Title className="text-lg font-semibold leading-none tracking-tight">
                  Appointment Warning
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-sm text-muted-foreground mt-1">
                  {config.description}
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100">
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </DialogPrimitive.Close>
            </div>

            {conflicts.length > 0 && (
              <div className="space-y-2">
                {conflicts.map((c, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <span>{c.message}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-lg border bg-muted/30 p-4">
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Appointments Booked for This Day
              </h4>
              <p className="text-xs text-muted-foreground mb-3">
                Patient has {totalAppointments} appointment{totalAppointments !== 1 ? "s" : ""} on this day
              </p>

              <div className="space-y-2 max-h-64 overflow-auto pr-1">
                {existingAppointments.map((appt) => (
                  <div key={appt.appointmentId} className="rounded-md border bg-background p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        {appt.time}
                      </span>
                      <StatusBadge status={appt.status} />
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <User className="h-3 w-3" />
                        Dr. {appt.doctorName}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Building className="h-3 w-3" />
                        {appt.branchName}{appt.department ? ` • ${appt.department}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onCancel}
                disabled={loading}
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onProceed}
                disabled={loading}
                className={cn(
                  buttonVariants({ variant: "default" }),
                  "bg-red-600 text-white hover:bg-red-700"
                )}
              >
                Proceed Anyway
              </button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
