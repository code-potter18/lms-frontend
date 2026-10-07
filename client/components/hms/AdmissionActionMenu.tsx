import { useState } from "react";
import { MoreVertical } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { usePermission } from "@/context/PermissionContext";
import VitalsSignsPopover from "./VitalsSignsPopover";

interface AdmissionActionMenuProps {
  status: string;
  onView: () => void;
  onEdit: () => void;
  onAdmit: () => void;
  onTransfer: () => void;
  onDischarge: () => void;
  /** Planned-request actions: hold / change / release a bed, cancel, no-show. */
  onReserve?: () => void;
  onReleaseReservation?: () => void;
  onCancel?: () => void;
  onNoShow?: () => void;
  /** True while a bed is RESERVED for this (planned) admission. */
  hasReservation?: boolean;
  /** Assign / change the doctor of an admitted patient. */
  onAssignDoctor?: () => void;
  hasDoctor?: boolean;
  patientId?: string;
  encounterNo?: string | null;
  /** Fired after the vitals popover saved successfully so parents can refresh. */
  onVitalsSaved?: () => void;
}

export function AdmissionActionMenu({
  status,
  onView,
  onEdit,
  onAdmit,
  onTransfer,
  onDischarge,
  onReserve,
  onReleaseReservation,
  onCancel,
  onNoShow,
  hasReservation = false,
  onAssignDoctor,
  hasDoctor = true,
  patientId,
  encounterNo,
  onVitalsSaved,
}: AdmissionActionMenuProps) {
  const { can } = usePermission();
  // Per-row open state, same pattern as OPD's AppointmentActionMenu -- every
  // menu owns its own popover instance so opening Vitals on one admission
  // can never bleed into another row's overlay.
  const [vitalsOpen, setVitalsOpen] = useState(false);

  if (
    !can("admission.read") &&
    !can("admission.update") &&
    !can("admission.transfer") &&
    !can("admission.discharge")
  ) {
    return null;
  }

  const isPlanned = status === "PLANNED";
  const isAdmitted = status === "ADMITTED";
  // Reserve / release / cancel / no-show all go through admission.update.
  const canManagePlanned = isPlanned && can("admission.update");

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center justify-center p-1.5 border border-[#E5E7EB] rounded-md hover:border-[#00488D] transition-colors outline-none"
          >
            <MoreVertical className="w-4 h-4 text-[#6B7280]" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="end"
          sideOffset={4}
          className="w-48 rounded-md border-[#E5E7EB] bg-white p-0 shadow-lg"
        >
          {can("admission.read") && (
            <DropdownMenuItem
              onSelect={() => onView()}
              className="flex w-full cursor-pointer px-3 py-2 text-xs font-semibold text-left text-[#374151] focus:bg-[#F2F4F6]"
            >
              View Details
            </DropdownMenuItem>
          )}

          {isPlanned && (can("admission.update") || can("admission.create")) && (
            <>
              <DropdownMenuItem
                onSelect={() => onEdit()}
                className="flex w-full cursor-pointer px-3 py-2 text-xs font-semibold text-left text-[#374151] focus:bg-[#F2F4F6]"
              >
                Edit Request
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => onAdmit()}
                className="flex w-full cursor-pointer px-3 py-2 text-xs font-semibold text-left text-green-600 focus:bg-green-50"
              >
                Admit
              </DropdownMenuItem>
            </>
          )}

          {canManagePlanned && onReserve && (
            <DropdownMenuItem
              onSelect={() => onReserve()}
              className="flex w-full cursor-pointer px-3 py-2 text-xs font-semibold text-left text-violet-700 focus:bg-violet-50"
            >
              {hasReservation ? "Change Reserved Bed" : "Reserve Bed"}
            </DropdownMenuItem>
          )}

          {canManagePlanned && hasReservation && onReleaseReservation && (
            <DropdownMenuItem
              onSelect={() => onReleaseReservation()}
              className="flex w-full cursor-pointer px-3 py-2 text-xs font-semibold text-left text-[#374151] focus:bg-[#F2F4F6]"
            >
              Release Reservation
            </DropdownMenuItem>
          )}

          {canManagePlanned && onNoShow && (
            <DropdownMenuItem
              onSelect={() => onNoShow()}
              className="flex w-full cursor-pointer px-3 py-2 text-xs font-semibold text-left text-[#6B7280] focus:bg-[#F2F4F6]"
            >
              Mark No-Show
            </DropdownMenuItem>
          )}

          {canManagePlanned && onCancel && (
            <DropdownMenuItem
              onSelect={() => onCancel()}
              className="flex w-full cursor-pointer px-3 py-2 text-xs font-semibold text-left text-[#B91C1C] focus:bg-[#FEF2F2]"
            >
              Cancel Request
            </DropdownMenuItem>
          )}

          {isAdmitted && can("admission.read") && (
            <DropdownMenuItem
              onSelect={() => setVitalsOpen(true)}
              className="flex w-full cursor-pointer px-3 py-2 text-xs font-semibold text-left text-purple-600 focus:bg-purple-50"
            >
              Vitals
            </DropdownMenuItem>
          )}

          {isAdmitted && can("admission.update") && onAssignDoctor && (
            <DropdownMenuItem
              onSelect={() => onAssignDoctor()}
              className={`flex w-full cursor-pointer px-3 py-2 text-xs font-semibold text-left ${
                hasDoctor ? "text-[#374151] focus:bg-[#F2F4F6]" : "text-amber-700 focus:bg-amber-50"
              }`}
            >
              {hasDoctor ? "Change Doctor" : "Assign Doctor"}
            </DropdownMenuItem>
          )}

          {isAdmitted && can("admission.transfer") && (
            <DropdownMenuItem
              onSelect={() => onTransfer()}
              className="flex w-full cursor-pointer px-3 py-2 text-xs font-semibold text-left text-[#374151] focus:bg-[#F2F4F6]"
            >
              Transfer Bed
            </DropdownMenuItem>
          )}

          {isAdmitted && can("admission.discharge") && (
            <DropdownMenuItem
              onSelect={() => onDischarge()}
              className="flex w-full cursor-pointer px-3 py-2 text-xs font-semibold text-left text-amber-700 focus:bg-amber-50"
            >
              Discharge
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <VitalsSignsPopover
        open={vitalsOpen}
        onOpenChange={setVitalsOpen}
        encounterNo={encounterNo ?? undefined}
        patientId={patientId}
        onSaved={onVitalsSaved}
      />
    </>
  );
}
