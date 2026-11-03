import { useMemo, useState, useEffect, memo } from "react";
import { useNavigate } from "react-router-dom";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { X, Clock, Loader2 } from "lucide-react";
import { appointmentApi } from "@/api/appointment.api";
import { cn } from "@/lib/utils";

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const getNowInIST = () => new Date(Date.now() + IST_OFFSET_MS);
const getTodayInIST = () => {
  const d = getNowInIST();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};
const getNowMinutesInIST = () => {
  const d = getNowInIST();
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};

export type SlotTime = string;

export interface AvailableSlotsPopoverProps {
  doctorName: string;
  doctorId: string;
  branch: string;
  branchId?: string;
  departmentId?: string;
  date?: string;
  slots?: SlotTime[];
  branchesSlots?: Array<{branchId:string; branchName:string; times:SlotTime[]}>;
  doctorBranches?: Array<{branch_id:string; branch_name:string; branch_area?: string | null}>;
  slotsByPeriod?: {
    Morning: SlotTime[];
    Afternoon: SlotTime[];
    Evening: SlotTime[];
  };
  onSlotClick?: (time: SlotTime) => void;
  onBook?: () => void;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
}

type Period = "Morning" | "Afternoon" | "Evening";

function parseTimeToMinutes(timeStr: string): number | null {
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return null;
  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const meridiem = match[3].toUpperCase();
  if (meridiem === "PM" && hour !== 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;
  return hour * 60 + minute;
}

function getPeriod(minutes: number): Period {
  if (minutes >= 6 * 60 && minutes < 12 * 60) return "Morning";
  if (minutes >= 12 * 60 && minutes < 18 * 60) return "Afternoon";
  return "Evening";
}

function groupSlotsByPeriod(times: SlotTime[]) {
  const groups: Record<Period, SlotTime[]> = {
    Morning: [],
    Afternoon: [],
    Evening: [],
  };
  times.forEach((t) => {
    const mins = parseTimeToMinutes(t);
    if (mins === null) return;
    const period = getPeriod(mins);
    groups[period].push(t);
  });
  Object.values(groups).forEach((arr) => arr.sort((a, b) => {
    const am = parseTimeToMinutes(a) ?? 0;
    const bm = parseTimeToMinutes(b) ?? 0;
    return am - bm;
  }));
  return groups;
}

const AvailableSlotsPopoverComponent = ({
  doctorName,
  doctorId,
  branch,
  branchId,
  departmentId,
  date,
  slots,
  branchesSlots,
  slotsByPeriod,
  onSlotClick,
  onBook,
  className,
  open: openProp,
  onOpenChange,
  trigger,
  doctorBranches,
}: AvailableSlotsPopoverProps) => {
  const navigate = useNavigate();
  const [internalOpen, setInternalOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<SlotTime | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [lazySlots, setLazySlots] = useState<Array<{branchId:string; branchName:string; times:SlotTime[]}>>([]);
  const [, forceUpdate] = useState(0);
  const open = openProp ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  // Lazy-load slots ONLY when the popover is opened
  useEffect(() => {
    if (!open || (branchesSlots && branchesSlots.length > 0)) return;
    const targetBranches = doctorBranches && doctorBranches.length > 0
      ? doctorBranches
      : (branchId ? [{ branch_id: branchId, branch_name: branch }] : []);
    if (targetBranches.length === 0 || !doctorId || !date) return;

    let cancelled = false;
    setLoadingSlots(true);
    Promise.all(
      targetBranches.map(async (b) => {
        try {
          const res = await appointmentApi.getAvailableSlots(doctorId, b.branch_id, date, { includePast: false });
          const slotsData = res.data?.data?.slots ?? [];
          const availableTimes = slotsData.filter((s: any) => s.is_available).map((s: any) => {
            const [h, m] = s.time.split(':');
            const hour = parseInt(h, 10);
            const ampm = hour >= 12 ? 'PM' : 'AM';
            const hour12 = hour % 12 === 0 ? 12 : hour % 12;
            return `${String(hour12).padStart(2, '0')}:${m} ${ampm}`;
          });
          return { branchId: b.branch_id, branchName: b.branch_name, times: availableTimes };
        } catch {
          return { branchId: b.branch_id, branchName: b.branch_name, times: [] };
        }
      })
    ).then((results) => {
      if (!cancelled) {
        setLazySlots(results.filter((b) => b.times.length > 0));
        setLoadingSlots(false);
      }
    });
    return () => { cancelled = true; };
  }, [open, doctorId, date, branchId, branch, doctorBranches, branchesSlots]);

  const activeBranchesSlots = useMemo(() => {
    if (branchesSlots && branchesSlots.length > 0) return branchesSlots;
    return lazySlots;
  }, [branchesSlots, lazySlots]);

  // Timer only while popover is open to avoid per-row work
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => forceUpdate(v => v + 1), 60000);
    return () => clearInterval(id);
  }, [open]);

  const isToday = date ? date === getTodayInIST() : false;
  const nowMinutes = open && isToday ? getNowMinutesInIST() : null;

  const filteredBranchesSlots = useMemo(() => {
    if (!open || !activeBranchesSlots || !isToday || nowMinutes === null) return activeBranchesSlots;
    return activeBranchesSlots
      .map(b => ({
        ...b,
        times: b.times.filter(t => {
          const mins = parseTimeToMinutes(t);
          return mins !== null && mins > nowMinutes;
        })
      }))
      .filter(b => b.times.length > 0);
  }, [activeBranchesSlots, isToday, nowMinutes, open]);

  // clear selection if selected slot is no longer available
  useEffect(() => {
    if (!selectedSlot || !selectedBranchId || !filteredBranchesSlots) return;
    const exists = filteredBranchesSlots.some(b => b.branchId === selectedBranchId && b.times.includes(selectedSlot));
    if (!exists) {
      setSelectedSlot(null);
      setSelectedBranchId(null);
    }
  }, [filteredBranchesSlots, selectedSlot, selectedBranchId]);

  const groups = useMemo(() => {
    if (slotsByPeriod) {
      return slotsByPeriod;
    }
    return groupSlotsByPeriod(slots ?? []);
  }, [slots, slotsByPeriod]);

  const total = useMemo(() => {
    if (filteredBranchesSlots && filteredBranchesSlots.length > 0) {
      return filteredBranchesSlots.reduce((sum, b) => sum + b.times.length, 0);
    }
    if (activeBranchesSlots && activeBranchesSlots.length > 0) {
      return activeBranchesSlots.reduce((sum, b) => sum + b.times.length, 0);
    }
    return Object.values(groups).reduce((sum, arr) => sum + arr.length, 0);
  }, [groups, activeBranchesSlots, filteredBranchesSlots]);
  const hasSlots = total > 0;
  const periods: Period[] = ["Morning", "Afternoon", "Evening"];

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        {trigger ?? (
          <button
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border border-[#E4E8EF] bg-white px-3 py-1.5 text-[12.5px] font-medium text-[#0F1B2D] transition hover:border-[#1D4ED8] hover:shadow-[0_0_0_3px_#EEF3FF]",
              className
            )}
          >
            <Clock className="h-3.5 w-3.5 text-[#5B6B84]" />
            <span className="rounded-md bg-[#E7F7F1] px-2 py-0.5 text-[11.5px] font-bold text-[#0F9D6B]">
              {total}
            </span>
            <span>available</span>
          </button>
        )}
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="center"
          sideOffset={8}
          className={cn(
            "z-50 w-[340px] rounded-[14px] border border-[#E4E8EF] bg-white shadow-[0_18px_40px_-14px_rgba(16,30,54,0.28),0_2px_8px_rgba(16,30,54,0.06)] outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-[#E4E8EF] p-4 pb-3">
            <div>
              <div className="text-[13.5px] font-bold leading-tight tracking-[-0.1px] text-[#0F1B2D]">
                {doctorName}
              </div>
              <div className="mt-1 text-[11.5px] text-[#5B6B84]">
                {doctorId} · {branch}
              </div>
            </div>
            <PopoverPrimitive.Close asChild>
              <button
                aria-label="Close"
                className="rounded-md p-1 text-[#5B6B84] hover:bg-[#F5F7FA] hover:text-[#0F1B2D]"
              >
                <X className="h-4 w-4" />
              </button>
            </PopoverPrimitive.Close>
          </div>

          <div className="flex items-center gap-2 border-b border-[#E4E8EF] bg-[#E7F7F1] px-4 py-2.5 text-[12px] font-semibold text-[#0B7D57]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#0F9D6B]" />
            {total} open slot{total === 1 ? "" : "s"} today
          </div>

          <div className="max-h-[300px] overflow-y-auto px-4 py-3">
            {loadingSlots ? (
              <div className="flex items-center justify-center py-8 text-[12px] text-[#5B6B84] gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-[#0F9D6B]" />
                <span>Loading available slots...</span>
              </div>
            ) : hasSlots ? (
              <div className="space-y-4">
                {(filteredBranchesSlots && filteredBranchesSlots.length > 0 ? filteredBranchesSlots : (branchesSlots && branchesSlots.length > 0 ? branchesSlots : [{branchId: branchId || '', branchName: branch || '', times: slots || []}])).map((branch) => {
                  const branchGrouped = groupSlotsByPeriod(branch.times);
                  const branchHasSlots = Object.values(branchGrouped).some(arr => arr.length > 0);
                  if (!branchHasSlots) return null;
                  return (
                    <div key={branch.branchId} className="space-y-3">
                      <div className="text-[12px] font-bold text-[#0F1B2D]">Branch: {branch.branchName}</div>
                      {periods.map((period) => {
                        const items = branchGrouped[period];
                        if (!items.length) return null;
                        return (
                          <div key={`${branch.branchId}-${period}`} className="space-y-2">
                            <div className="flex items-center gap-2 text-[11px] font-semibold text-[#5B6B84]">
                              <span>{period}</span>
                              <span className="h-px flex-1 bg-[#E4E8EF]" />
                            </div>
                            <div className="grid grid-cols-3 gap-[7px]">
                              {items.map((t) => {
                                const isSelected = selectedSlot === t && selectedBranchId === branch.branchId;
                                return (
                                <button
                                  key={t}
                                  onClick={() => {
                                    setSelectedSlot(t);
                                    setSelectedBranchId(branch.branchId);
                                    onSlotClick?.(t);
                                  }}
                                  className={cn(
                                    "rounded-lg border px-2 py-1.5 text-center text-[12px] font-semibold transition active:translate-y-[-1px]",
                                    isSelected
                                      ? "border-[#1D4ED8] bg-[#1D4ED8] text-white"
                                      : "border-[#D6ECE1] bg-[#E7F7F1] text-[#0B7D57] hover:bg-[#0F9D6B] hover:text-white hover:border-[#0F9D6B]"
                                  )}
                                >
                                  {t}
                                </button>
                              )})}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-5 text-center text-[12.5px] text-[#5B6B84]">
                No open slots left for today.
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-[#E4E8EF] px-4 py-3">
            <span className="text-[11px] text-[#5B6B84]">Showing available only</span>
            <button
              onClick={() => {
                const effectiveBranchId = selectedBranchId || branchId;
                if (selectedSlot && effectiveBranchId && date) {
                  const timeOnly = selectedSlot;
                  navigate("/appointments/add", {
                    state: {
                      slot: {
                        doctorId,
                        branchId: effectiveBranchId,
                        departmentId,
                        date,
                        time: timeOnly,
                      },
                    },
                  });
                } else if (selectedSlot) {
                  onBook?.();
                }
                setOpen(false);
              }}
              disabled={!selectedSlot}
              className={cn(
                "rounded-lg bg-[#1D4ED8] px-3 py-1.5 text-[11.5px] font-semibold text-white transition hover:bg-[#1A3FBF]",
                !selectedSlot && "opacity-50 cursor-not-allowed"
              )}
            >
              Book Appointment
            </button>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
};

export default memo(AvailableSlotsPopoverComponent);
