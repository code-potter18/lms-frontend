// Bed status labels + colours, shared by the Bed Master table, the bed board
// and the admit / reserve bed picker so a status always looks the same.
// Deliberately not routed through the shared StatusBadge component, since its
// tone classes are reused by many other statuses app-wide (e.g. "active",
// "scheduled") and the bordered pill here would change those too.

export interface BedStatusMeta {
  label: string;
  /** Pill / tile background, text and border classes. */
  pill: string;
  /** Status dot colour class. */
  dot: string;
  /** Text colour class, for counts. */
  text: string;
  /** Bed-board tile classes (background + border). */
  tile: string;
}

export const BED_STATUS_META: Record<string, BedStatusMeta> = {
  AVAILABLE: {
    label: "Available",
    pill: "bg-[#F0FDF4] text-[#15803D] border-emerald-100",
    dot: "bg-[#22C55E]",
    text: "text-[#15803D]",
    tile: "bg-[#F0FDF4] border-emerald-200",
  },
  RESERVED: {
    label: "Reserved",
    pill: "bg-[#F5F3FF] text-[#6D28D9] border-violet-100",
    dot: "bg-[#8B5CF6]",
    text: "text-[#6D28D9]",
    tile: "bg-[#F5F3FF] border-violet-200",
  },
  OCCUPIED: {
    label: "Occupied",
    pill: "bg-[#EFF6FF] text-[#1D4ED8] border-blue-100",
    dot: "bg-[#3B82F6]",
    text: "text-[#1D4ED8]",
    tile: "bg-[#EFF6FF] border-blue-200",
  },
  CLEANING: {
    label: "Cleaning",
    pill: "bg-[#ECFEFF] text-[#0E7490] border-cyan-100",
    dot: "bg-[#06B6D4]",
    text: "text-[#0E7490]",
    tile: "bg-[#ECFEFF] border-cyan-200",
  },
  MAINTENANCE: {
    label: "Maintenance",
    pill: "bg-[#FFFBEB] text-[#B45309] border-amber-100",
    dot: "bg-[#F59E0B]",
    text: "text-[#B45309]",
    tile: "bg-[#FFFBEB] border-amber-200",
  },
};

/** Display order for legends, counts and filters. */
export const BED_STATUS_ORDER = ["AVAILABLE", "RESERVED", "OCCUPIED", "CLEANING", "MAINTENANCE"] as const;

export function getBedStatusMeta(status: string | null | undefined): BedStatusMeta {
  return BED_STATUS_META[status ?? ""] ?? BED_STATUS_META.MAINTENANCE;
}

export function BedStatusBadge({ status }: { status: string }) {
  const meta = getBedStatusMeta(status);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${meta.pill}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}
