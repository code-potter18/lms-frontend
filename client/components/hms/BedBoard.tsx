import { useMemo } from "react";
import { format } from "date-fns";
import { Sparkles } from "lucide-react";
import type { BedPatientSummary, BedRecord, WardRecord } from "@/api/ipd.api";
import { BED_STATUS_META, BED_STATUS_ORDER, getBedStatusMeta } from "@/components/hms/BedStatusBadge";

interface BedBoardProps {
  wards: WardRecord[];
  beds: BedRecord[];
  /** Show the "Mark Ready" button on beds waiting for cleaning. */
  canManage: boolean;
  onMarkReady: (bed: BedRecord) => void;
  /** Opens the admission behind an occupied / reserved bed. */
  onOpenAdmission: (ipNumber: string) => void;
}

function patientName(p: BedPatientSummary | null | undefined) {
  const bio = p?.patient_bio_data;
  return bio ? [bio.patient_first_name, bio.patient_last_name].filter(Boolean).join(" ") : "";
}

function safeFormat(value: string | null | undefined, pattern: string) {
  if (!value) return "";
  const d = new Date(value);
  return isNaN(d.getTime()) ? "" : format(d, pattern);
}

/**
 * Live bed board: one card per ward, one colour-coded tile per bed showing
 * who is in it, who it is held for, or what it is waiting on.
 */
export function BedBoard({ wards, beds, canManage, onMarkReady, onOpenAdmission }: BedBoardProps) {
  const bedsByWard = useMemo(() => {
    const map = new Map<string, BedRecord[]>();
    for (const b of beds) {
      const list = map.get(b.ward_id) || [];
      list.push(b);
      map.set(b.ward_id, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.bed_number.localeCompare(b.bed_number, undefined, { numeric: true }));
    }
    return map;
  }, [beds]);

  const sortedWards = useMemo(
    () => [...wards].sort((a, b) => a.ward_name.localeCompare(b.ward_name, undefined, { numeric: true })),
    [wards],
  );

  if (sortedWards.length === 0) {
    return <div className="py-16 text-center text-sm text-[#6B7280]">No wards found for this branch.</div>;
  }

  return (
    <div className="p-5 flex flex-col gap-5">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3">
        {BED_STATUS_ORDER.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#374151]">
            <span className={`w-2.5 h-2.5 rounded-sm ${BED_STATUS_META[s].dot}`} />
            {BED_STATUS_META[s].label}
          </span>
        ))}
      </div>

      {sortedWards.map((ward) => {
        const wardBeds = bedsByWard.get(ward.ward_id) || [];
        const free = wardBeds.filter((b) => b.status === "AVAILABLE").length;
        return (
          <section key={ward.ward_id} className="border border-[#E5E7EB] rounded-xl overflow-hidden">
            <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-[#F7F9FB] border-b border-[#E5E7EB]">
              <div>
                <span className="hms-name-text">{ward.ward_name}</span>
                <span className="hms-content-text text-[#8C8D8F] ml-2">
                  {[ward.ward_type, ward.floor ? `Floor ${ward.floor}` : null, ward.branch?.branch_name]
                    .filter(Boolean)
                    .join(" • ")}
                </span>
              </div>
              <span className="text-xs font-semibold text-[#374151]">
                {free} of {wardBeds.length} free
              </span>
            </header>

            {wardBeds.length === 0 ? (
              <div className="px-4 py-6 text-xs text-[#8C8D8F]">No beds in this ward.</div>
            ) : (
              <div className="grid gap-3 p-4 grid-cols-[repeat(auto-fill,minmax(150px,1fr))]">
                {wardBeds.map((bed) => {
                  const meta = getBedStatusMeta(bed.status);
                  const person = bed.status === "OCCUPIED" ? bed.occupant : bed.status === "RESERVED" ? bed.reserved_for : null;
                  const clickable = !!person?.ip_number;
                  return (
                    <div
                      key={bed.bed_id}
                      role={clickable ? "button" : undefined}
                      tabIndex={clickable ? 0 : undefined}
                      onClick={clickable ? () => onOpenAdmission(person!.ip_number) : undefined}
                      onKeyDown={
                        clickable
                          ? (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onOpenAdmission(person!.ip_number);
                              }
                            }
                          : undefined
                      }
                      className={`rounded-lg border p-3 flex flex-col gap-1 min-h-[96px] ${meta.tile} ${
                        clickable ? "cursor-pointer hover:shadow-md transition-shadow" : ""
                      }`}
                      title={clickable ? `Open ${person!.ip_number}` : undefined}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-[#191C1E]">{bed.bed_number}</span>
                        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${meta.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                          {meta.label}
                        </span>
                      </div>
                      {bed.bed_type && <span className="text-[10px] text-[#8C8D8F]">{bed.bed_type}</span>}

                      {bed.status === "OCCUPIED" && bed.occupant && (
                        <>
                          <span className="text-xs font-semibold text-[#191C1E] truncate">{patientName(bed.occupant)}</span>
                          <span className="text-[10px] text-[#6B7280]">
                            {bed.occupant.ip_number}
                            {safeFormat(bed.occupant.admission_date, "dd MMM") &&
                              ` • since ${safeFormat(bed.occupant.admission_date, "dd MMM")}`}
                          </span>
                        </>
                      )}

                      {bed.status === "RESERVED" && (
                        <>
                          <span className="text-xs font-semibold text-[#191C1E] truncate">
                            {patientName(bed.reserved_for) || "Planned admission"}
                          </span>
                          <span className="text-[10px] text-[#6B7280]">
                            {bed.reserved_for?.ip_number}
                            {safeFormat(bed.reserved_until, "dd MMM, hh:mm a") &&
                              ` • until ${safeFormat(bed.reserved_until, "dd MMM, hh:mm a")}`}
                          </span>
                        </>
                      )}

                      {bed.status === "CLEANING" && canManage && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onMarkReady(bed);
                          }}
                          className="mt-auto inline-flex items-center justify-center gap-1 px-2 py-1 rounded-md border border-cyan-200 bg-white text-[#0E7490] text-[11px] font-semibold hover:bg-cyan-50"
                        >
                          <Sparkles className="w-3 h-3" /> Mark Ready
                        </button>
                      )}

                      {bed.status === "MAINTENANCE" && bed.remarks && (
                        <span className="text-[10px] text-[#6B7280] line-clamp-2" title={bed.remarks}>
                          {bed.remarks}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
