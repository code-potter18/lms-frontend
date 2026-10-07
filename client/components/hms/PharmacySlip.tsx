import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban,
  Download,
  FilePlus2,
  Loader2,
  Pencil,
  Printer,
  Save,
  Trash2,
  X,
} from "lucide-react";
import {
  pharmacyApi,
  PharmacySlipItem,
  PharmacySlipRecord,
  SlipPreview,
} from "@/api/pharmacy.api";
import { useToast } from "@/hooks/use-toast";
import { downloadExportPdf } from "@/lib/exportPdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface PharmacySlipProps {
  planId: string;
}

const DRUG_ROLE_LABELS: Record<string, string> = {
  PRIMARY: "Primary",
  PREMEDICATION: "Premedication",
  POSTMEDICATION: "Postmedication",
  SUPPORTIVE: "Supportive",
  ADVICE: "Advice",
  DISCHARGE: "Discharge",
};

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-[#FFF7E6] text-[#8A6100] border-[#F2D999]",
  ISSUED: "bg-[#E7F6EC] text-[#1B6B3A] border-[#A9DCBB]",
  CANCELLED: "bg-[#FDECEC] text-[#A32020] border-[#F3B9B9]",
};

const display = (value: string | number | null | undefined, fallback = "—") => {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text === "" ? fallback : text;
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
};

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// A line as the table renders it. Quantity is the only editable field and it
// counts whole packs; everything else is read-only clinical data.
interface SlipLine {
  pharmacy_slip_item_id: string;
  medicineName: string;
  brandName: string;
  dose: string;
  drugRole: string;
  quantity: string;
}

function toLine(item: PharmacySlipItem): SlipLine {
  return {
    pharmacy_slip_item_id: item.pharmacy_slip_item_id,
    medicineName: display(item.drug_name),
    brandName: display(item.brand_name),
    dose: item.dose ? `${item.dose}${item.dose_unit ? ` ${item.dose_unit}` : ""}` : "—",
    drugRole: DRUG_ROLE_LABELS[item.drug_role ?? ""] ?? display(item.drug_role),
    quantity: item.quantity === null || item.quantity === undefined ? "" : String(item.quantity),
  };
}

// A preview line has no persisted item yet, so it gets a placeholder id and
// cannot be edited - the slip must exist first.
function fromResolved(line: SlipPreview["lines"][number], index: number): SlipLine {
  return {
    pharmacy_slip_item_id: `pending-${index}`,
    medicineName: display(line.drug_name),
    brandName: display(line.brand_name),
    dose: line.dose ? `${line.dose}${line.dose_unit ? ` ${line.dose_unit}` : ""}` : "—",
    drugRole: DRUG_ROLE_LABELS[line.drug_role ?? ""] ?? display(line.drug_role),
    quantity: line.quantity === null || line.quantity === undefined ? "" : String(line.quantity),
  };
}

export function PharmacySlip({ planId }: PharmacySlipProps) {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<SlipPreview | null>(null);
  const [slip, setSlip] = useState<PharmacySlipRecord | null>(null);
  const [lines, setLines] = useState<SlipLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const status = slip?.slip_status ?? "DRAFT";
  const isPersisted = Boolean(slip);
  // Quantity is editable only while the slip is still a DRAFT. Printing is
  // what freezes it, so there is no separate issue step.
  const editable = isPersisted && status === "DRAFT";
  const canPrint = isPersisted && status !== "CANCELLED";

  const load = useCallback(async () => {
    if (!planId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const res = await pharmacyApi.previewFromPlan(planId);
      const data = res.data?.data;

      if (!data) {
        setPreview(null);
        setSlip(null);
        setLines([]);
        return;
      }

      setPreview(data);

      // A live slip already covering this cycle day wins: the page shows what
      // was dispensed rather than re-resolving the plan, which may have changed.
      const existing = data.existing_slip;
      setSlip(existing ?? null);
      setLines(existing?.pharmacy_slip_item?.map(toLine) ?? data.lines.map(fromResolved));
      setEditing(false);
    } catch (e: any) {
      toast({
        title: "Failed to load pharmacy slip",
        description: e?.response?.data?.message ?? e?.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [planId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const patientName = useMemo(() => {
    const patient = slip?.patient_bio_data ?? null;
    return [patient?.patient_first_name, patient?.patient_last_name].filter(Boolean).join(" ") || "—";
  }, [slip]);

  const patientId = slip?.patient_id ?? preview?.patient_id ?? "—";
  const protocolName =
    slip?.regimen_name ?? slip?.protocol_name ?? preview?.regimen_name ?? preview?.protocol_name ?? "—";
  const cycleLabel = slip?.cycle_number ? `Cycle ${slip.cycle_number}, Day ${slip.cycle_day ?? "—"}` : null;
  // The stored print stamp, not the time the page happened to render.
  const printedOn = formatDateTime(slip?.printed_at) ?? "Not printed yet";

  const updateLine = (id: string, patch: Partial<SlipLine>) => {
    setLines((prev) => prev.map((line) => (line.pharmacy_slip_item_id === id ? { ...line, ...patch } : line)));
  };

  const removeLine = (id: string) => {
    setLines((prev) => prev.filter((line) => line.pharmacy_slip_item_id !== id));
  };

  const handleCreate = async () => {
    setSaving(true);

    try {
      const res = await pharmacyApi.createFromPlan({ plan_id: planId });
      toast({ title: res.data?.message ?? "Pharmacy slip created" });
      await load();
    } catch (e: any) {
      toast({
        title: "Could not create the pharmacy slip",
        description: e?.response?.data?.message ?? e?.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!slip) return;

    setSaving(true);

    try {
      // Only the lines still on screen are sent; the backend deletes the
      // omitted ones, which is how the delete button persists.
      const res = await pharmacyApi.updateItems(slip.pharmacy_slip_id, {
        items: lines.map((line) => ({
          pharmacy_slip_item_id: line.pharmacy_slip_item_id,
          quantity: line.quantity.trim() === "" ? null : Number(line.quantity),
        })),
      });

      toast({ title: res.data?.message ?? "Pharmacy slip updated" });
      await load();
    } catch (e: any) {
      toast({
        title: "Could not save the pharmacy slip",
        description: e?.response?.data?.message ?? e?.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    if (!slip || cancelReason.trim() === "") return;

    setSaving(true);

    try {
      const res = await pharmacyApi.cancel(slip.pharmacy_slip_id, { reason: cancelReason.trim() });
      toast({ title: res.data?.message ?? "Pharmacy slip cancelled" });
      setCancelOpen(false);
      setCancelReason("");
      await load();
    } catch (e: any) {
      toast({
        title: "Could not cancel the pharmacy slip",
        description: e?.response?.data?.message ?? e?.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  /*
   * Printing is what finalises the slip: the backend moves a DRAFT to ISSUED
   * and freezes its quantities. The stamp is persisted so reopening the slip
   * later shows when the last copy actually left the pharmacy.
   */
  const handlePrint = async () => {
    if (!slip) return;

    setSaving(true);

    try {
      await pharmacyApi.markPrinted(slip.pharmacy_slip_id);
      await load();
    } catch (e: any) {
      // A failed stamp must not block the physical print.
      toast({
        title: "Could not record the print",
        description: e?.response?.data?.message ?? e?.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }

    printSlip();
  };

  // Same popup technique as the doctor's clinical note print: build the
  // document in a new window and let the browser print it, rather than printing
  // the whole app page.
  const printSlip = () => {
    const printWindow = window.open("", "_blank");

    if (!printWindow) {
      window.alert("Please allow pop-ups to print this pharmacy slip.");
      return;
    }

    const headerRows = [
      ["Patient", patientName],
      ["Patient ID", patientId],
      ["Protocol", protocolName],
      ["Cycle", cycleLabel ?? "—"],
      ["Slip No", slip?.pharmacy_slip_id ?? "—"],
      ["Status", status],
    ]
      .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(String(value))}</td></tr>`)
      .join("");

    const bodyRows = lines
      .map(
        (line) => `<tr>
          <td>${escapeHtml(line.medicineName)}${
            line.brandName !== "—" ? `<div class="sub">${escapeHtml(line.brandName)}</div>` : ""
          }</td>
          <td>${escapeHtml(line.dose)}</td>
          <td>${escapeHtml(line.drugRole)}</td>
          <td class="qty">${escapeHtml(line.quantity || "—")}</td>
        </tr>`
      )
      .join("");

    printWindow.document.write(`<!DOCTYPE html><html><head><title>Pharmacy Slip ${
      slip?.pharmacy_slip_id ?? ""
    }</title><style>
      body { font-family: Inter, Arial, sans-serif; color: #1e293b; padding: 32px; font-size: 12px; }
      h1 { font-size: 18px; margin: 0 0 4px; }
      .meta { font-size: 11px; color: #64748b; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
      .meta-table th, .meta-table td { text-align: left; padding: 3px 12px 3px 0; border: none; font-size: 11px; }
      .meta-table th { color: #64748b; font-weight: 600; width: 110px; }
      .lines-table th { text-align: left; background: #f1f5f9; padding: 8px; font-size: 11px; border: 1px solid #cbd5e1; }
      .lines-table td { padding: 8px; border: 1px solid #cbd5e1; }
      .lines-table .qty { text-align: right; }
      .sub { font-size: 10px; color: #64748b; }
      .foot { font-size: 10px; color: #64748b; margin-top: 16px; }
    </style></head><body>
      <h1>Pharmacy Slip</h1>
      <div class="meta">${escapeHtml(protocolName)} - ${escapeHtml(patientName)} (${escapeHtml(
        patientId
      )})</div>
      <table class="meta-table">${headerRows}</table>
      <table class="lines-table">
        <thead><tr><th>Medicine Name</th><th>Dose</th><th>Type</th><th style="text-align:right">Qty</th></tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
      <div class="foot">Printed ${escapeHtml(formatDateTime(slip?.printed_at) ?? new Date().toLocaleString())}</div>
    </body></html>`);

    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handleDownload = () => {
    downloadExportPdf({
      title: "Pharmacy Slip",
      subtitle: `${patientName} (${patientId}) - ${protocolName}`,
      filename: `pharmacy-slip-${slip?.pharmacy_slip_id ?? planId}.pdf`,
      columns: [
        { header: "Medicine Name", cell: (line: SlipLine) => line.medicineName },
        { header: "Dose", cell: (line: SlipLine) => line.dose },
        { header: "Type", cell: (line: SlipLine) => line.drugRole },
        { header: "Qty", cell: (line: SlipLine) => line.quantity || "—" },
      ],
      rows: lines,
    });
  };

  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm flex flex-col">
      {/* ==================== SLIP HEADER ==================== */}
      <div className="px-6 py-5 border-b border-[#E5E7EB] flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-[#191C1E]">Pharmacy Slip</h2>
            {isPersisted && (
              <span
                className={`px-2 py-0.5 rounded-full border text-[10px] font-bold tracking-wide ${
                  STATUS_STYLES[status] ?? STATUS_STYLES.DRAFT
                }`}
              >
                {status}
              </span>
            )}
          </div>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-xs text-[#374151]">
            <div>
              <span className="font-semibold text-[#6B7280]">Patient:</span> {patientName}
            </div>
            <div>
              <span className="font-semibold text-[#6B7280]">Patient ID:</span> {patientId}
            </div>
            <div>
              <span className="font-semibold text-[#6B7280]">Protocol:</span> {protocolName}
            </div>
            <div>
              <span className="font-semibold text-[#6B7280]">Cycle Day:</span>{" "}
              {cycleLabel ?? "—"}
            </div>
            <div>
              <span className="font-semibold text-[#6B7280]">Slip No:</span>{" "}
              {slip?.pharmacy_slip_id ?? "Not created"}
            </div>
            <div>
              <span className="font-semibold text-[#6B7280]">Printed:</span> {printedOn}
            </div>
          </div>
          {slip?.cancellation_reason && (
            <div className="mt-2 text-xs text-[#A32020]">
              <span className="font-semibold">Cancelled:</span> {slip.cancellation_reason}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap print:hidden">
          {!isPersisted && (
            <Button
              type="button"
              size="sm"
              onClick={handleCreate}
              disabled={saving || lines.length === 0}
              className="bg-[#004785] hover:bg-[#003a6b]"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FilePlus2 className="w-3.5 h-3.5" />}
              Create Slip
            </Button>
          )}

          {editable && !editing && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setEditing(true)}
              disabled={saving || lines.length === 0}
              className="text-[#374151] border-[#E5E7EB] hover:border-[#00488D]"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit Quantity
            </Button>
          )}

          {editing && (
            <>
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="bg-[#004785] hover:bg-[#003a6b]"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditing(false);
                  void load();
                }}
                disabled={saving}
                className="text-[#374151] border-[#E5E7EB] hover:border-[#00488D]"
              >
                <X className="w-3.5 h-3.5" />
                Cancel
              </Button>
            </>
          )}

          {isPersisted && status !== "CANCELLED" && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setCancelOpen(true)}
              disabled={saving}
              className="text-red-600 border-[#E5E7EB] hover:bg-red-50 hover:border-red-200"
            >
              <Ban className="w-3.5 h-3.5" />
              Cancel Slip
            </Button>
          )}

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleDownload}
            disabled={lines.length === 0}
            className="text-[#374151] border-[#E5E7EB] hover:border-[#00488D]"
          >
            <Download className="w-3.5 h-3.5" />
            Download PDF
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handlePrint}
            disabled={!canPrint || saving}
            title={canPrint ? "Print and finalise this slip" : "Create the slip before printing"}
            className="bg-[#004785] hover:bg-[#003a6b]"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
            Print
          </Button>
        </div>
      </div>

      {/* ==================== SLIP TABLE ==================== */}
      {loading ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-[#6B7280] text-sm">
          <Loader2 size={24} className="animate-spin text-[#00488D]" />
          Loading pharmacy slip...
        </div>
      ) : lines.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1 py-16 text-[#6B7280] text-sm">
          No medicines found for this order&apos;s protocol.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[#E5E7EB] bg-[#F7F9FB]">
                <th className="px-6 py-3 text-xs font-semibold text-[#6B7280]">Medicine Name</th>
                <th className="px-6 py-3 text-xs font-semibold text-[#6B7280]">Dose</th>
                <th className="px-6 py-3 text-xs font-semibold text-[#6B7280]">Type</th>
                <th className="px-6 py-3 text-xs font-semibold text-[#6B7280] w-32">Qty</th>
                {editing && (
                  <th className="px-6 py-3 text-xs font-semibold text-[#6B7280] w-16 print:hidden">Action</th>
                )}
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.pharmacy_slip_item_id} className="border-b border-[#E5E7EB] last:border-b-0">
                  <td className="px-6 py-3">
                    <div className="text-sm font-semibold text-[#191C1E]">{line.medicineName}</div>
                    {line.brandName !== "—" && (
                      <div className="text-[11px] text-[#6B7280]">{line.brandName}</div>
                    )}
                  </td>
                  <td className="px-6 py-3 text-sm text-[#374151]">{line.dose}</td>
                  <td className="px-6 py-3 text-sm text-[#374151]">{line.drugRole}</td>
                  <td className="px-6 py-3">
                    {editing ? (
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={line.quantity}
                        onChange={(e) => updateLine(line.pharmacy_slip_item_id, { quantity: e.target.value })}
                        placeholder="—"
                        className="h-8 w-24 text-xs"
                      />
                    ) : (
                      <span className="text-sm text-[#374151]">{line.quantity || "—"}</span>
                    )}
                  </td>
                  {editing && (
                    <td className="px-6 py-3 print:hidden">
                      <button
                        type="button"
                        onClick={() => removeLine(line.pharmacy_slip_item_id)}
                        className="flex items-center justify-center p-1.5 border border-[#E5E7EB] rounded-md text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors"
                        aria-label={`Remove ${line.medicineName}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!editing && isPersisted && status === "ISSUED" && (
        <div className="px-6 py-3 border-t border-[#E5E7EB] bg-[#F7F9FB] text-xs text-[#6B7280]">
          This slip was printed on {formatDateTime(slip?.printed_at) ?? "—"} and can no longer be edited. Cancel it to
          print a replacement.
        </div>
      )}

      {/* ==================== CANCEL DIALOG ==================== */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel pharmacy slip</DialogTitle>
            <DialogDescription>
              Cancelling frees this cycle day for a replacement slip. The reason is recorded in the audit
              trail.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="e.g. Prepared against the wrong cycle day"
            autoFocus
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCancelOpen(false)} disabled={saving}>
              Keep Slip
            </Button>
            <Button
              type="button"
              onClick={handleCancel}
              disabled={saving || cancelReason.trim() === ""}
              className="bg-red-600 hover:bg-red-700"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
              Cancel Slip
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default PharmacySlip;