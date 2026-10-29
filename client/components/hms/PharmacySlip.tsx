import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban,
  CheckCircle2,
  Download,
  FilePlus2,
  Loader2,
  Pencil,
  Plus,
  Printer,
  Save,
  Trash2,
  X,
} from "lucide-react";
import {
  pharmacyApi,
  PharmacyMasterItem,
  PharmacySlipItem,
  PharmacySlipRecord,
  SlipPreview,
} from "@/api/pharmacy.api";
import { chemotherapyApi, type MedicineOption } from "@/api/chemotherapy.api";
import { SingleSelectDropdown } from "@/components/ui/single-select-dropdown";
import { useToast } from "@/hooks/use-toast";
import { downloadExportPdf } from "@/lib/exportPdf";
import { toProperCase } from "@/utils/caseFormatters";
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
  DILUTION: "Dilution",
  SUPPORTIVE: "Supportive",
  ADVICE: "Advice",
  DISCHARGE: "Discharge",
};

const ROLE_BADGES: Record<string, string> = {
  PRIMARY: "bg-indigo-50 text-indigo-700 ring-indigo-200/80",
  PREMEDICATION: "bg-sky-50 text-sky-700 ring-sky-200/80",
  POSTMEDICATION: "bg-amber-50 text-amber-700 ring-amber-200/80",
  DILUTION: "bg-violet-50 text-violet-700 ring-violet-200/80",
  SUPPORTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-200/80",
  DISCHARGE: "bg-teal-50 text-teal-700 ring-teal-200/80",
  ADVICE: "bg-blue-50 text-blue-700 ring-blue-200/80",
};

const DOSE_UNITS = [
  "mg",
  "g",
  "mcg",
  "mL",
  "L",
  "mg/m²",
  "mg/kg",
  "AUC",
  "units",
  "IU",
  "tablets",
  "capsules",
  "puffs",
  "drops",
];

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

// Decimal columns arrive as strings like "500.0000"; normalise to "500".
export const strengthFromMaster = (row: PharmacyMasterItem) =>
  row.strength_value != null && String(row.strength_value).trim() !== ""
    ? String(Number(row.strength_value))
    : "";

/**
 * Dynamic quantity calculation for hospital pharmacy dispensing.
 * Formula: ceil(allocated patient dose / brand strength)
 * Supports standard unit conversions (e.g. g <-> mg, mg <-> mcg, L <-> mL).
 */
export function computeDispensingQuantity(
  patientDoseStr: string | null | undefined,
  brandStrengthStr: string | null | undefined,
  brandStrengthUnit?: string | null
): string {
  if (!patientDoseStr || !brandStrengthStr) return "1";

  // Extract numeric portion and unit of patient dose (e.g. "200 g" -> 200, "g")
  const pMatch = String(patientDoseStr).trim().match(/^([\d.]+)\s*([a-zA-Z/²]*)/);
  if (!pMatch) return "1";
  let pDose = parseFloat(pMatch[1]);
  if (!Number.isFinite(pDose) || pDose <= 0) return "1";
  const pUnit = (pMatch[2] || "").trim().toLowerCase();

  const bMatch = String(brandStrengthStr).trim().match(/^([\d.]+)/);
  if (!bMatch) return "1";
  const bStrength = parseFloat(bMatch[1]);
  if (!Number.isFinite(bStrength) || bStrength <= 0) return "1";
  const bUnit = (brandStrengthUnit || "").trim().toLowerCase();

  // Unit conversion normalisation (e.g. g <-> mg, mg <-> mcg, L <-> mL)
  if (pUnit === "g" && bUnit === "mg") pDose *= 1000;
  else if (pUnit === "mg" && bUnit === "g") pDose /= 1000;
  else if (pUnit === "mg" && bUnit === "mcg") pDose *= 1000;
  else if (pUnit === "mcg" && bUnit === "mg") pDose /= 1000;
  else if (pUnit === "l" && bUnit === "ml") pDose *= 1000;
  else if (pUnit === "ml" && bUnit === "l") pDose /= 1000;

  const ratio = pDose / bStrength;
  if (!Number.isFinite(ratio) || ratio <= 0) return "1";

  return String(Math.max(1, Math.ceil(ratio)));
}

/**
 * Multi-criteria pharmacy item matching:
 * Matches by medicine_id OR (generic_name + dosage_form) across all manufacturers.
 */
export function getMatchingPharmacyItems(
  line: { medicine_id?: string | null; medicineName?: string | null },
  masterItems: PharmacyMasterItem[],
  medicineOptions: MedicineOption[]
): PharmacyMasterItem[] {
  const med = medicineOptions.find((m) => m.medicine_id === line.medicine_id);
  const matchedMed =
    med ||
    (line.medicineName
      ? medicineOptions.find(
          (m) => m.medicine_name.trim().toLowerCase() === line.medicineName?.trim().toLowerCase()
        )
      : undefined);

  const targetGeneric = (matchedMed?.generic_name || "").trim().toLowerCase();
  const targetForm = (matchedMed?.dosage_form || "").trim().toLowerCase();

  return masterItems.filter((item) => {
    // 1. Direct medicine_id match
    if (line.medicine_id && item.medicine_id === line.medicine_id) return true;

    // 2. Generic substance match + Dosage form match
    if (targetGeneric && item.generic_name) {
      const itemGen = item.generic_name.trim().toLowerCase();
      const itemForm = (item.dosage_form || "").trim().toLowerCase();

      const genericMatch = itemGen === targetGeneric;
      const formMatch = !targetForm || !itemForm || itemForm === targetForm;
      return genericMatch && formMatch;
    }

    // 3. Fallback: item_name contains generic substance name if dosage form matches
    if (targetGeneric && item.item_name) {
      const itemNameLower = item.item_name.trim().toLowerCase();
      const itemForm = (item.dosage_form || "").trim().toLowerCase();
      if (itemNameLower.includes(targetGeneric) && (!targetForm || !itemForm || itemForm === targetForm)) {
        return true;
      }
    }

    return false;
  });
}

// A line as the table renders it.
interface SlipLine {
  pharmacy_slip_item_id: string;
  medicine_id?: string | null;
  medicineName: string;
  patientDose: string;
  brandName: string;
  strengthValue: string;
  strengthUnit: string;
  drugRole: string;
  quantity: string;
  pharmacy_item_id?: string | null;
}

function toLine(item: PharmacySlipItem): SlipLine {
  const calculatedQty =
    item.quantity !== null && item.quantity !== undefined
      ? String(item.quantity)
      : computeDispensingQuantity(item.patient_dose, item.dose, item.dose_unit);

  return {
    pharmacy_slip_item_id: item.pharmacy_slip_item_id,
    medicine_id: item.medicine_id ?? null,
    medicineName: toProperCase(display(item.drug_name)),
    patientDose: display(item.patient_dose),
    brandName: toProperCase(item.brand_name || ""),
    strengthValue: item.dose ?? "",
    strengthUnit: item.dose_unit ?? "mg",
    drugRole: item.drug_role ?? "PRIMARY",
    quantity: calculatedQty || "1",
    pharmacy_item_id: item.pharmacy_item_id ?? null,
  };
}

// A preview line has no persisted item yet, so it gets a placeholder id.
function fromResolved(line: SlipPreview["lines"][number], index: number): SlipLine {
  const calculatedQty =
    line.quantity !== null && line.quantity !== undefined
      ? String(line.quantity)
      : computeDispensingQuantity(line.patient_dose, line.dose, line.dose_unit);

  return {
    pharmacy_slip_item_id: `pending-${index}`,
    medicine_id: line.medicine_id ?? null,
    medicineName: toProperCase(display(line.drug_name)),
    patientDose: display(line.patient_dose),
    brandName: toProperCase(line.brand_name || ""),
    strengthValue: line.dose ?? "",
    strengthUnit: line.dose_unit ?? "mg",
    drugRole: line.drug_role ?? "PRIMARY",
    quantity: calculatedQty || "1",
    pharmacy_item_id: null,
  };
}

export function PharmacySlip({ planId }: PharmacySlipProps) {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<SlipPreview | null>(null);
  const [slip, setSlip] = useState<PharmacySlipRecord | null>(null);
  const [lines, setLines] = useState<SlipLine[]>([]);
  const [masterItems, setMasterItems] = useState<PharmacyMasterItem[]>([]);
  const [medicineOptions, setMedicineOptions] = useState<MedicineOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [amendOpen, setAmendOpen] = useState(false);
  const [amendReason, setAmendReason] = useState("");

  const status = slip?.slip_status ?? "DRAFT";
  const isPersisted = Boolean(slip);
  const canEdit = isPersisted && status !== "CANCELLED";
  const canPrint = isPersisted && status !== "CANCELLED";

  const masterItemsByMedId = useMemo(() => {
    const map = new Map<string, PharmacyMasterItem[]>();
    for (const item of masterItems) {
      if (!item.medicine_id) continue;
      const list = map.get(item.medicine_id) ?? [];
      list.push(item);
      map.set(item.medicine_id, list);
    }
    return map;
  }, [masterItems]);

  const load = useCallback(async () => {
    if (!planId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [res, masterRes, medRes] = await Promise.all([
        pharmacyApi.previewFromPlan(planId),
        pharmacyApi.getMasterItems().catch(() => ({ data: { data: [] } })),
        chemotherapyApi.listMedicines().catch(() => ({ data: { data: [] } })),
      ]);

      const data = res.data?.data;
      setMasterItems(masterRes.data?.data ?? []);
      setMedicineOptions(medRes.data?.data ?? []);

      if (!data) {
        setPreview(null);
        setSlip(null);
        setLines([]);
        return;
      }

      setPreview(data);

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
  const printedOn = formatDateTime(slip?.printed_at) ?? "Not printed yet";

  const updateLine = (id: string, patch: Partial<SlipLine>) => {
    setLines((prev) => prev.map((line) => (line.pharmacy_slip_item_id === id ? { ...line, ...patch } : line)));
  };

  const removeLine = (id: string) => {
    setLines((prev) => prev.filter((line) => line.pharmacy_slip_item_id !== id));
  };

  const onBrandChange = (id: string, brand: string) => {
    const formattedBrand = toProperCase(brand);
    const line = lines.find((l) => l.pharmacy_slip_item_id === id);
    if (!line) return;
    const items = getMatchingPharmacyItems(line, masterItems, medicineOptions);
    const brandItems = items.filter(
      (p) =>
        toProperCase(p.manufacturer_name)?.toLowerCase() === formattedBrand.toLowerCase() ||
        toProperCase(p.brand_name)?.toLowerCase() === formattedBrand.toLowerCase()
    );

    const matchingStrength = line.strengthValue
      ? brandItems.find((p) => strengthFromMaster(p) === line.strengthValue)
      : undefined;
    const defaultItem = matchingStrength || brandItems[0];
    const newStrength = defaultItem ? strengthFromMaster(defaultItem) : line.strengthValue;
    const newUnit = defaultItem?.strength_unit || line.strengthUnit || "mg";
    const newQty = computeDispensingQuantity(line.patientDose, newStrength, newUnit);

    updateLine(id, {
      brandName: formattedBrand,
      pharmacy_item_id: defaultItem?.pharmacy_item_id ?? null,
      strengthValue: newStrength,
      strengthUnit: newUnit,
      quantity: newQty,
    });
  };

  const handleAddMedicine = () => {
    const newId = `new-${Date.now()}`;
    setLines((prev) => [
      ...prev,
      {
        pharmacy_slip_item_id: newId,
        medicine_id: null,
        medicineName: "",
        patientDose: "—",
        brandName: "",
        strengthValue: "",
        strengthUnit: "mg",
        drugRole: "PRIMARY",
        quantity: "1",
      },
    ]);
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
    if (status === "ISSUED") {
      setAmendOpen(true);
      return;
    }
    await executeSave();
  };

  const executeSave = async (amendmentReason?: string) => {
    if (!slip) return;

    setSaving(true);

    try {
      const itemsToSave: any[] = [];

      for (const line of lines) {
        let medId = line.medicine_id;
        // If newly added medicine and user entered a custom name not in medicine_master
        if (!medId && line.medicineName.trim()) {
          const found = medicineOptions.find(
            (m) => m.medicine_name.toLowerCase() === line.medicineName.trim().toLowerCase()
          );
          if (found) {
            medId = found.medicine_id;
          } else {
            try {
              const createRes = await pharmacyApi.createMedicine({
                medicine_name: line.medicineName.trim(),
              });
              medId = createRes.data?.data?.medicine_id ?? null;
              if (createRes.data?.data) {
                setMedicineOptions((prev) => [...prev, createRes.data.data]);
              }
            } catch (err) {
              console.error("Could not create medicine in medicine master:", err);
            }
          }
        }

        itemsToSave.push({
          pharmacy_slip_item_id:
            line.pharmacy_slip_item_id.startsWith("new-") || line.pharmacy_slip_item_id.startsWith("pending-")
              ? undefined
              : line.pharmacy_slip_item_id,
          medicine_id: medId ?? undefined,
          drug_name: line.medicineName.trim(),
          brand_name: line.brandName.trim() || null,
          dose: line.strengthValue.trim() || null,
          dose_unit: line.strengthUnit.trim() || null,
          quantity: line.quantity.trim() === "" ? null : Number(line.quantity),
          drug_role: line.drugRole,
          pharmacy_item_id: line.pharmacy_item_id ?? undefined,
        });
      }

      const res = amendmentReason
        ? await pharmacyApi.amend(slip.pharmacy_slip_id, {
            items: itemsToSave,
            reason: amendmentReason,
          })
        : await pharmacyApi.updateItems(slip.pharmacy_slip_id, {
            items: itemsToSave,
          });

      toast({
        title: res.data?.message ?? (amendmentReason ? "Pharmacy slip amended" : "Pharmacy slip updated"),
      });
      setAmendOpen(false);
      setAmendReason("");
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

  const handleIssue = async () => {
    if (!slip) return;

    setSaving(true);

    try {
      const res = await pharmacyApi.issue(slip.pharmacy_slip_id);
      toast({ title: res.data?.message ?? "Pharmacy slip issued successfully" });
      await load();
    } catch (e: any) {
      toast({
        title: "Could not issue the pharmacy slip",
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

  const handlePrint = async () => {
    if (!slip) return;

    setSaving(true);

    try {
      const res = await pharmacyApi.markPrinted(slip.pharmacy_slip_id);
      const printed = res.data?.data ?? slip;
      printSlip(printed);
      await load();
    } catch (e: any) {
      toast({
        title: "Could not record the print",
        description: e?.response?.data?.message ?? e?.message ?? "Please try again.",
        variant: "destructive",
      });
      return;
    } finally {
      setSaving(false);
    }
  };

  const printSlip = (currentSlip?: PharmacySlipRecord | null) => {
    const record = currentSlip ?? slip;
    const printStatus = record?.slip_status ?? status;

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
      ["Slip No", record?.pharmacy_slip_id ?? "—"],
      ["Status", printStatus],
    ]
      .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(String(value))}</td></tr>`)
      .join("");

    const bodyRows = lines
      .map(
        (line) => `<tr>
          <td>${escapeHtml(toProperCase(line.medicineName))}</td>
          <td>${escapeHtml(line.patientDose)}</td>
          <td>${escapeHtml(toProperCase(line.brandName) || "—")}</td>
          <td>${escapeHtml(
            line.strengthValue ? `${line.strengthValue}${line.strengthUnit ? ` ${line.strengthUnit}` : ""}` : "—"
          )}</td>
          <td class="qty">${escapeHtml(line.quantity || "—")}</td>
          <td>${escapeHtml(DRUG_ROLE_LABELS[line.drugRole] ?? line.drugRole)}</td>
        </tr>`
      )
      .join("");

    printWindow.document.write(`<!DOCTYPE html><html><head><title>Pharmacy Slip ${
      record?.pharmacy_slip_id ?? ""
    }</title><style>
      body { font-family: Inter, Arial, sans-serif; color: #1e293b; padding: 32px; font-size: 12px; position: relative; }
      h1 { font-size: 18px; margin: 0 0 4px; }
      .meta { font-size: 11px; color: #64748b; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
      .meta-table th, .meta-table td { text-align: left; padding: 3px 12px 3px 0; border: none; font-size: 11px; }
      .meta-table th { color: #64748b; font-weight: 600; width: 110px; }
      .lines-table th { text-align: left; background: #f1f5f9; padding: 8px; font-size: 11px; border: 1px solid #cbd5e1; }
      .lines-table td { padding: 8px; border: 1px solid #cbd5e1; }
      .lines-table .qty { text-align: right; }
      .foot { font-size: 10px; color: #64748b; margin-top: 16px; }
    </style></head><body>
      <h1>Pharmacy Slip</h1>
      <div class="meta">${escapeHtml(protocolName)} - ${escapeHtml(patientName)} (${escapeHtml(
        patientId
      )})</div>
      <table class="meta-table">${headerRows}</table>
      <table class="lines-table">
        <thead><tr><th>Medicine Name</th><th>Patient_dose</th><th>Brand</th><th>Dose</th><th style="text-align:right">Qty</th><th>Type</th></tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
      <div class="foot">Printed ${escapeHtml(formatDateTime(record?.printed_at) ?? new Date().toLocaleString())}</div>
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
        { header: "Medicine Name", cell: (line: SlipLine) => toProperCase(line.medicineName) },
        { header: "Patient_dose", cell: (line: SlipLine) => line.patientDose },
        { header: "Brand", cell: (line: SlipLine) => toProperCase(line.brandName) || "—" },
        {
          header: "Dose",
          cell: (line: SlipLine) =>
            line.strengthValue ? `${line.strengthValue}${line.strengthUnit ? ` ${line.strengthUnit}` : ""}` : "—",
        },
        { header: "Qty", cell: (line: SlipLine) => line.quantity || "—" },
        { header: "Type", cell: (line: SlipLine) => DRUG_ROLE_LABELS[line.drugRole] ?? line.drugRole },
      ],
      rows: lines,
    });
  };

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm flex flex-col">
      {/* ==================== SLIP HEADER ==================== */}
      <div className="px-6 py-5 border-b border-[#E2E8F0] flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="hms-heading text-xl">Pharmacy Slip</h2>
            {isPersisted && (
              <span
                className={`px-2.5 py-0.5 rounded-full border text-[11px] font-bold tracking-wide ${
                  STATUS_STYLES[status] || STATUS_STYLES.DRAFT
                }`}
              >
                {status}
              </span>
            )}
          </div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-2">
            <div>
              <span className="hms-id-text block text-[#8C8D8F]">Patient</span>
              <span className="hms-content-text font-semibold text-[#111827]">{patientName}</span>
            </div>
            <div>
              <span className="hms-id-text block text-[#8C8D8F]">Patient ID</span>
              <span className="hms-content-text font-semibold text-[#111827]">{patientId}</span>
            </div>
            <div>
              <span className="hms-id-text block text-[#8C8D8F]">Protocol</span>
              <span className="hms-content-text font-semibold text-[#00488D]">{protocolName}</span>
            </div>
            <div>
              <span className="hms-id-text block text-[#8C8D8F]">Cycle Day</span>
              <span className="hms-content-text font-medium text-[#111827]">{cycleLabel ?? "—"}</span>
            </div>
            <div>
              <span className="hms-id-text block text-[#8C8D8F]">Slip No</span>
              <span className="hms-content-text font-mono font-medium text-[#111827]">
                {slip?.pharmacy_slip_id ?? "Not created"}
              </span>
            </div>
            <div>
              <span className="hms-id-text block text-[#8C8D8F]">Printed On</span>
              <span className="hms-content-text font-medium text-[#424752]">{printedOn}</span>
            </div>
            {slip?.issued_at && (
              <div>
                <span className="hms-id-text block text-[#8C8D8F]">Issued On</span>
                <span className="hms-content-text font-medium text-[#1B6B3A]">{formatDateTime(slip.issued_at)}</span>
              </div>
            )}
          </div>
          {slip?.amend_count && slip.amend_count > 0 && (
            <div className="mt-2 text-xs text-amber-700 font-medium">
              <span className="font-semibold">Amended ({slip.amend_count}x):</span> {slip.last_amend_reason || "Details updated"} ({formatDateTime(slip.last_amended_at)})
            </div>
          )}
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

          {isPersisted && status === "DRAFT" && !editing && (
            <Button
              type="button"
              size="sm"
              onClick={handleIssue}
              disabled={saving || lines.length === 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Issue Slip
            </Button>
          )}

          {canEdit && !editing && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setEditing(true)}
              disabled={saving || lines.length === 0}
              className="text-[#374151] border-[#E5E7EB] hover:border-[#00488D]"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit Slip
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
            title={canPrint ? "Print this pharmacy slip" : "Create the slip before printing"}
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
              <tr className="border-b border-slate-200 hms-columnHeading-style">
                <th className="px-6 py-3.5 hms-table-header w-[26%]">Medicine Name</th>
                <th className="px-6 py-3.5 hms-table-header w-[13%]">Patient Dose</th>
                <th className="px-6 py-3.5 hms-table-header w-[18%]">Brand</th>
                <th className="px-6 py-3.5 hms-table-header w-[17%]">Dose</th>
                <th className="px-6 py-3.5 hms-table-header w-20 text-right">Qty</th>
                <th className="px-6 py-3.5 hms-table-header w-[13%]">Type</th>
                {editing && (
                  <th className="px-6 py-3.5 hms-table-header w-16 text-center print:hidden">Action</th>
                )}
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                if (!editing) {
                  return (
                    <tr
                      key={line.pharmacy_slip_item_id}
                      className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/70 transition-colors"
                    >
                      <td className="px-6 py-3.5">
                        <div className="hms-name-text text-[#111827]">{toProperCase(line.medicineName)}</div>
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="hms-content-text text-slate-700">{line.patientDose || "—"}</span>
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="hms-content-text text-slate-800 font-medium">
                          {toProperCase(line.brandName) || "—"}
                        </span>
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="hms-content-text font-semibold text-[#111827]">
                          {line.strengthValue
                            ? `${line.strengthValue}${line.strengthUnit ? ` ${line.strengthUnit}` : ""}`
                            : "—"}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <span className="hms-content-text font-bold text-slate-800 bg-slate-100/90 border border-slate-200/80 px-2.5 py-0.5 rounded-md inline-block">
                          {line.quantity || "—"}
                        </span>
                      </td>
                      <td className="px-6 py-3.5">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ring-1 ring-inset ${
                            ROLE_BADGES[line.drugRole] ?? "bg-slate-50 text-slate-700 ring-slate-200"
                          }`}
                        >
                          {DRUG_ROLE_LABELS[line.drugRole] ?? line.drugRole}
                        </span>
                      </td>
                    </tr>
                  );
                }

                // Edit mode row
                const isNew =
                  line.pharmacy_slip_item_id.startsWith("new-") ||
                  line.pharmacy_slip_item_id.startsWith("pending-");
                const availablePharmItems = getMatchingPharmacyItems(line, masterItems, medicineOptions);
                const mfrs = Array.from(
                  new Set(availablePharmItems.map((p) => p.brand_name || p.manufacturer_name).filter(Boolean))
                ) as string[];
                const brandOptions = Array.from(
                  new Set([...mfrs, ...(line.brandName ? [line.brandName] : [])])
                ).filter(Boolean).map((m) => ({ label: toProperCase(m), value: m }));

                const brandItems = line.brandName
                  ? availablePharmItems.filter(
                      (p) =>
                        p.manufacturer_name?.trim().toLowerCase() === line.brandName.trim().toLowerCase() ||
                        p.brand_name?.trim().toLowerCase() === line.brandName.trim().toLowerCase()
                    )
                  : [];

                const strengthOptions = Array.from(
                  new Set(brandItems.map((p) => strengthFromMaster(p)).filter(Boolean))
                ).map((val) => ({ label: val, value: val }));

                const matchedMed = medicineOptions.find(
                  (m) =>
                    (line.medicine_id && m.medicine_id === line.medicine_id) ||
                    m.medicine_name.trim().toLowerCase() === line.medicineName.trim().toLowerCase()
                );
                const dosageForm = matchedMed?.dosage_form || null;

                return (
                  <tr
                    key={line.pharmacy_slip_item_id}
                    className="border-b border-[#E5E7EB] last:border-b-0 bg-[#FAFAFA]/60"
                  >
                    {/* Medicine Name */}
                    <td className="px-6 py-3">
                      {isNew ? (
                        <SingleSelectDropdown
                          options={medicineOptions.map((m) => ({
                            label: m.medicine_name,
                            value: m.medicine_id,
                            hint: m.dosage_form || undefined,
                          }))}
                          value={line.medicine_id ?? ""}
                          valueLabel={line.medicineName}
                          onValueChange={(medId) => {
                            const med = medicineOptions.find((m) => m.medicine_id === medId);
                            if (!med) return;
                            const dummyLine: SlipLine = {
                              ...line,
                              medicine_id: med.medicine_id,
                              medicineName: med.medicine_name,
                            };
                            const items = getMatchingPharmacyItems(dummyLine, masterItems, medicineOptions);
                            // Default to the first brand; its dose and unit fill in from the master row.
                            const firstPharm = items[0];
                            const strength = firstPharm ? strengthFromMaster(firstPharm) : "";
                            const unit = firstPharm?.strength_unit || "mg";
                            const qty = computeDispensingQuantity(line.patientDose, strength, unit);
                            updateLine(line.pharmacy_slip_item_id, {
                              medicine_id: med.medicine_id,
                              medicineName: med.medicine_name,
                              brandName: firstPharm?.brand_name || firstPharm?.manufacturer_name || "",
                              strengthValue: strength,
                              strengthUnit: unit,
                              quantity: qty,
                              pharmacy_item_id: firstPharm?.pharmacy_item_id || null,
                            });
                          }}
                          onCreateOption={(typed) => {
                            updateLine(line.pharmacy_slip_item_id, {
                              medicine_id: null,
                              medicineName: toProperCase(typed.trim()),
                              pharmacy_item_id: null,
                            });
                          }}
                          placeholder="Select medicine or type new..."
                          createLabel="+ Add to master"
                          className="h-8 text-xs w-full"
                        />
                      ) : (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-semibold text-[#191C1E]">{toProperCase(line.medicineName)}</span>
                          {dosageForm && (
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200 font-medium">
                              {dosageForm}
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Patient_dose */}
                    <td className="px-6 py-3 text-sm text-[#374151]">
                      {line.patientDose || "—"}
                    </td>

                    {/* Brand */}
                    <td className="px-6 py-3">
                      <SingleSelectDropdown
                        options={brandOptions}
                        value={line.brandName}
                        valueLabel={toProperCase(line.brandName)}
                        onValueChange={(selectedBrand) => {
                          onBrandChange(line.pharmacy_slip_item_id, selectedBrand);
                        }}
                        onCreateOption={(typedBrand) => {
                          updateLine(line.pharmacy_slip_item_id, {
                            brandName: toProperCase(typedBrand.trim()),
                            pharmacy_item_id: null,
                          });
                        }}
                        placeholder="Select brand..."
                        createLabel="Use custom"
                        className="h-8 text-xs w-full"
                      />
                    </td>

                    {/* Dose: Dropbox 1 (Strength Value) + Dropbox 2 (Strength Unit) */}
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-1.5 w-full">
                        <SingleSelectDropdown
                          options={strengthOptions}
                          value={line.strengthValue}
                          valueLabel={line.strengthValue}
                          onValueChange={(selectedStrength) => {
                            const matching = brandItems.find(
                              (p) => strengthFromMaster(p) === selectedStrength
                            );
                            const unit = matching?.strength_unit || line.strengthUnit || "mg";
                            const qty = computeDispensingQuantity(line.patientDose, selectedStrength, unit);
                            updateLine(line.pharmacy_slip_item_id, {
                              strengthValue: selectedStrength,
                              strengthUnit: unit,
                              quantity: qty,
                              pharmacy_item_id: matching?.pharmacy_item_id ?? null,
                            });
                          }}
                          onCreateOption={(typedStrength) => {
                            const qty = computeDispensingQuantity(line.patientDose, typedStrength.trim(), line.strengthUnit);
                            updateLine(line.pharmacy_slip_item_id, {
                              strengthValue: typedStrength.trim(),
                              quantity: qty,
                              pharmacy_item_id: null,
                            });
                          }}
                          placeholder="Dose"
                          createLabel="Custom dose"
                          className="h-8 text-xs w-28 min-w-[80px]"
                        />
                        <select
                          value={line.strengthUnit}
                          onChange={(e) => {
                            const newUnit = e.target.value;
                            const qty = computeDispensingQuantity(line.patientDose, line.strengthValue, newUnit);
                            updateLine(line.pharmacy_slip_item_id, { strengthUnit: newUnit, quantity: qty });
                          }}
                          className="h-8 rounded-md border border-[#E5E7EB] bg-white px-2 text-xs text-[#374151] focus:border-[#00488D] outline-none"
                        >
                          {DOSE_UNITS.map((unit) => (
                            <option key={unit} value={unit}>
                              {unit}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>

                    {/* Qty */}
                    <td className="px-6 py-3 text-right">
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={line.quantity}
                        onChange={(e) =>
                          updateLine(line.pharmacy_slip_item_id, { quantity: e.target.value })
                        }
                        placeholder="—"
                        className="h-8 w-20 text-xs text-right inline-block"
                      />
                    </td>

                    {/* Type */}
                    <td className="px-6 py-3">
                      <select
                        value={line.drugRole}
                        onChange={(e) =>
                          updateLine(line.pharmacy_slip_item_id, { drugRole: e.target.value })
                        }
                        className="h-8 rounded-md border border-[#E5E7EB] bg-white px-2 text-xs text-[#374151] focus:border-[#00488D] outline-none w-full"
                      >
                        {Object.entries(DRUG_ROLE_LABELS).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Delete Action */}
                    <td className="px-6 py-3 text-center print:hidden">
                      <button
                        type="button"
                        onClick={() => removeLine(line.pharmacy_slip_item_id)}
                        className="inline-flex items-center justify-center p-1.5 border border-[#E5E7EB] rounded-md text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors"
                        aria-label={`Remove ${line.medicineName}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {editing && (
            <div className="p-4 border-t border-[#E5E7EB] bg-[#F7F9FB] flex items-center justify-start print:hidden">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleAddMedicine}
                className="inline-flex items-center gap-1.5 border-dashed border-[#004785] text-[#004785] hover:bg-blue-50 text-xs font-semibold"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Medicine
              </Button>
            </div>
          )}
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

      {/* ==================== AMEND DIALOG ==================== */}
      <Dialog open={amendOpen} onOpenChange={setAmendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Amend issued pharmacy slip</DialogTitle>
            <DialogDescription>
              This slip has already been issued. Please specify the clinical or operational reason for this
              amendment (recorded in audit logs).
            </DialogDescription>
          </DialogHeader>
          <Input
            value={amendReason}
            onChange={(e) => setAmendReason(e.target.value)}
            placeholder="e.g. Brand substitution due to stock availability / Dosage revised"
            autoFocus
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAmendOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => executeSave(amendReason.trim())}
              disabled={saving || amendReason.trim() === ""}
              className="bg-[#004785] hover:bg-[#003a6b]"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Confirm Amendment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default PharmacySlip;

