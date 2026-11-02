import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Loader2,
  Lock,
  Printer,
  RotateCcw,
  Save,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SingleSelectDropdown } from "@/components/ui/single-select-dropdown";
import { pharmacyApi, type PharmacyMasterItem, type PharmacySlipRecord } from "@/api/pharmacy.api";
import {
  applySavedSlip,
  buildBrandOptions,
  createDraftRow,
  effectiveBaseQuantity,
  effectiveExtraQuantity,
  formatNumber,
  parseDoseText,
  pickDefaultStrength,
  slipRoleLabel,
  suggestionFor,
  strengthsOfBrand,
  toSlipOrderItems,
  type SlipDisplayRow,
  type SlipDraftRow,
  type SlipSourceRow,
} from "./pharmacySlip";

/* ============================================================
   PHARMACY SLIP POPUP (Discharge Medication step)

   One row per medicine of the current cycle day's Chemotherapy Order
   plus the discharge medicines. The doctor picks a brand (from
   pharmacy_master, matched on the ordered medicine's generic_id +
   dosage_form), then a strength from that brand. The quantity is
   allocated so selected + top-up cover the patient's dose; a brand
   with no smaller strength folds the shortfall into the first row.
============================================================ */

export interface PharmacySlipModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: string;
  cycleNumber: number;
  cycleDay: number;
  encounterNo?: string | null;
  appointmentId?: string | null;
  /* Order + discharge medicines, already flattened and role-ordered. */
  sourceRows: SlipSourceRow[];
  /* True while the order itself is still loading in the parent. */
  loading?: boolean;
  error?: string;
}

const ROLE_BADGE: Record<string, string> = {
  PRIMARY: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  PREMEDICATION: "bg-sky-50 text-sky-700 ring-sky-200",
  SUPPORTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  POSTMEDICATION: "bg-amber-50 text-amber-700 ring-amber-200",
  DISCHARGE: "bg-violet-50 text-violet-700 ring-violet-200",
};

const INPUT_CLASS =
  "w-full rounded-md border border-[#D8DEE6] bg-white px-2.5 py-1.5 text-[11px] text-[#191C1E] outline-none transition-colors placeholder:text-[#9AA4B2] focus:border-[#00488D] focus:ring-2 focus:ring-[#00488D]/15 disabled:cursor-not-allowed disabled:bg-[#F4F6F9] disabled:text-[#6B7280]";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function PharmacySlipModal({
  open,
  onOpenChange,
  planId,
  cycleNumber,
  cycleDay,
  encounterNo,
  appointmentId,
  sourceRows,
  loading = false,
  error,
}: PharmacySlipModalProps) {
  const [rows, setRows] = useState<SlipDraftRow[]>([]);
  const [savedSlip, setSavedSlip] = useState<PharmacySlipRecord | null>(null);
  const [loadingRows, setLoadingRows] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [dirty, setDirty] = useState(false);

  const readOnly = savedSlip?.slip_status === "ISSUED";

  /* The parent rebuilds `sourceRows` on every discharge-table change. Reload
     only when the rows really changed, so an unrelated re-render cannot wipe
     the brands and quantities the doctor already picked. */
  const sourceSignature = useMemo(
    () =>
      sourceRows
        .map((row) =>
          [row.key, row.medicineId, row.drugForm, row.patientDose].join("|")
        )
        .join("~"),
    [sourceRows]
  );

  const sourceRowsRef = useRef(sourceRows);
  sourceRowsRef.current = sourceRows;

  /* ------------------------------------------------------------
     Load brands + the slip that may already exist for this day.
     ------------------------------------------------------------ */
  useEffect(() => {
    if (!open || loading) return;

    let cancelled = false;
    setLoadingRows(true);
    setLoadError("");
    setSaveError("");
    setSaveMessage("");
    setDirty(false);

    const rowsForLoad = sourceRowsRef.current;

    const medicineIds = Array.from(
      new Set(rowsForLoad.map((row) => row.medicineId).filter(Boolean))
    );

    const genericIds = Array.from(
      new Set(rowsForLoad.map((row) => row.genericId).filter(Boolean))
    );

    const masterRequest =
      medicineIds.length || genericIds.length
        ? pharmacyApi.masterItems(medicineIds, genericIds)
        : Promise.resolve({ data: { data: [] as PharmacyMasterItem[] } });

    Promise.all([
      masterRequest,
      planId
        ? pharmacyApi.getByOrder(planId, cycleNumber, cycleDay)
        : Promise.resolve({ data: { data: null as PharmacySlipRecord | null } }),
    ])
      .then(([masterResponse, slipResponse]) => {
        if (cancelled) return;

        const master: PharmacyMasterItem[] = masterResponse.data.data ?? [];
        const saved = slipResponse.data.data ?? null;

        let nextRows = rowsForLoad.map((row) =>
          createDraftRow(row, buildBrandOptions(row, master))
        );

        if (saved?.pharmacy_slip_item?.length) {
          nextRows = applySavedSlip(nextRows, saved.pharmacy_slip_item);
        }

        setRows(nextRows);
        setSavedSlip(saved);
      })
      .catch((requestError: any) => {
        if (cancelled) return;
        console.error("Failed to load the pharmacy slip:", requestError);
        setLoadError(
          requestError?.response?.data?.message ||
            requestError?.message ||
            "Failed to load the pharmacy slip."
        );
        // Still show the order rows so the doctor can work.
        setRows(rowsForLoad.map((row) => createDraftRow(row, [])));
      })
      .finally(() => {
        if (!cancelled) setLoadingRows(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, loading, planId, cycleNumber, cycleDay, sourceSignature]);

  /* Closing discards the draft: the next open re-reads the order and the
     saved slip, so a stale brand never flashes before the reload. */
  useEffect(() => {
    if (open) return;

    setRows([]);
    setSavedSlip(null);
    setLoadError("");
    setSaveError("");
    setSaveMessage("");
    setDirty(false);
  }, [open]);

  const updateRow = useCallback(
    (key: string, patch: (row: SlipDraftRow) => Partial<SlipDraftRow>) => {
      setRows((current) =>
        current.map((row) => (row.key === key ? { ...row, ...patch(row) } : row))
      );
      setDirty(true);
      setSaveMessage("");
    },
    []
  );

  const changeBrand = (key: string, brandLabel: string) => {
    updateRow(key, (row) => {
      const strengths =
        row.brandOptions.find((brand) => brand.label === brandLabel)?.strengths ?? [];
      const best = pickDefaultStrength(
        row.patientDoseValue,
        row.patientDoseUnit,
        strengths
      );

      return {
        brand: brandLabel,
        strengthLabel: best?.label ?? "",
        selectedDose: best ? formatNumber(best.value) : "",
        selectedUnit: best?.unit ?? "",
        pharmacyItemId: best?.pharmacyItemId ?? "",
        quantityOverride: "",
        extraQuantityOverride: "",
      };
    });
  };

  const changeStrength = (key: string, label: string) => {
    updateRow(key, (row) => {
      const strength = strengthsOfBrand(row).find((entry) => entry.label === label);
      return {
        strengthLabel: label,
        selectedDose: strength ? formatNumber(strength.value) : "",
        selectedUnit: strength?.unit ?? "",
        pharmacyItemId: strength?.pharmacyItemId ?? "",
        quantityOverride: "",
        extraQuantityOverride: "",
      };
    });
  };

  /* Typed drugs (and brands without strength data) take a free dose text. */
  const changeManualDose = (key: string, value: string) => {
    const parsed = parseDoseText(value);
    updateRow(key, () => ({
      strengthLabel: "",
      selectedDose: parsed.value === null ? "" : formatNumber(parsed.value),
      selectedUnit: parsed.unit,
      pharmacyItemId: "",
      quantityOverride: "",
      extraQuantityOverride: "",
    }));
  };

  const blockers = useMemo(
    () =>
      rows
        .map((row) => {
          if (!row.medicineId) return "";
          const plan = suggestionFor(row);
          const quantity = effectiveBaseQuantity(row, plan);
          if (row.brandOptions.length > 0 && !row.brand)
            return `Select a brand for ${row.drugName}.`;
          if (!row.selectedDose) return `Select a dosage for ${row.drugName}.`;
          if (quantity === null)
            return `The quantity for ${row.drugName} has to be entered manually.`;
          return "";
        })
        .filter(Boolean),
    [rows]
  );

  const warnings = useMemo(
    () =>
      rows
        .map((row) =>
          row.medicineId && row.brandOptions.length === 0
            ? `No pharmacy brand found for ${row.drugName} (${row.drugForm || "no form"}). Enter its dosage manually.`
            : suggestionFor(row).warning
        )
        .filter((warning): warning is string => Boolean(warning)),
    [rows]
  );

  const displayRows = useMemo(
    () =>
      rows.map((row) => ({
        row,
        plan: suggestionFor(row),
      })),
    [rows]
  );

  /* Counts for the summary strip: how many medicines, how many slip lines,
     and how many rows still need a brand / dose / quantity from the doctor. */
  const summary = useMemo(() => {
    let missingBrand = 0;
    let missingDose = 0;
    let missingQuantity = 0;

    for (const row of rows) {
      if (row.medicineId && row.brandOptions.length === 0) missingBrand += 1;
      if (!row.selectedDose) missingDose += 1;
      if (effectiveBaseQuantity(row, suggestionFor(row)) === null) missingQuantity += 1;
    }

    return {
      medicines: rows.length,
      lines: displayRows.length,
      missingBrand,
      missingDose,
      missingQuantity,
    };
  }, [rows, displayRows.length]);

  /* Continuous "No." across the base lines and the top-up lines. */
  const rowNumbers = useMemo(() => {
    const numbers = new Map<string, { base: number; extra?: number }>();
    let no = 0;

    for (const { row, plan } of displayRows) {
      const base = ++no;
      const extra = plan.extra ? ++no : undefined;
      numbers.set(row.key, { base, extra });
    }

    return numbers;
  }, [displayRows]);

  const handleSave = async () => {
    if (saving || readOnly) return;

    if (blockers.length > 0) {
      setSaveError(blockers[0]);
      return;
    }

    if (!planId) {
      setSaveError("The patient's chemotherapy plan could not be resolved.");
      return;
    }

    try {
      setSaving(true);
      setSaveError("");
      setSaveMessage("");

      const response = await pharmacyApi.saveFromOrder({
        plan_id: planId,
        cycle_number: cycleNumber,
        cycle_day: cycleDay,
        encounter_no: encounterNo ?? null,
        appointment_id: appointmentId ?? null,
        items: toSlipOrderItems(rows),
      });

      setSavedSlip(response.data.data);
      setDirty(false);
      setSaveMessage("Pharmacy slip saved.");
    } catch (requestError: any) {
      console.error("Failed to save the pharmacy slip:", requestError);
      setSaveError(
        requestError?.response?.data?.message ||
          requestError?.message ||
          "Failed to save the pharmacy slip."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setRows((current) => current.map((row) => ({
      ...row,
      quantityOverride: "",
      extraQuantityOverride: "",
    })));
    setDirty(true);
    setSaveMessage("");
    setSaveError("");
  };

  const handlePrint = () => {
    const printable: SlipDisplayRow[] = [];
    let no = 0;

    for (const { row, plan } of displayRows) {
      const baseQuantity = effectiveBaseQuantity(row, plan);
      printable.push({
        key: `${row.key}:base`,
        rowKey: row.key,
        no: ++no,
        drugName: row.drugName,
        drugForm: row.drugForm,
        patientDose: row.patientDose,
        brand: row.brand,
        dose: `${row.selectedDose}${row.selectedUnit ? ` ${row.selectedUnit}` : ""}`.trim(),
        quantity: baseQuantity === null ? "" : String(baseQuantity),
        type: slipRoleLabel(row.role),
        role: row.role,
        isExtra: false,
      });

      const extraQuantity = effectiveExtraQuantity(row, plan);
      if (plan.extra && extraQuantity !== null) {
        printable.push({
          key: `${row.key}:extra`,
          rowKey: row.key,
          no: ++no,
          drugName: row.drugName,
          drugForm: row.drugForm,
          patientDose: row.patientDose,
          brand: row.brand,
          dose: `${formatNumber(plan.extra.strength.value)}${
            plan.extra.strength.unit ? ` ${plan.extra.strength.unit}` : ""
          }`.trim(),
          quantity: String(extraQuantity),
          type: slipRoleLabel(row.role),
          role: row.role,
          isExtra: true,
        });
      }
    }

    const printWindow = window.open("", "_blank", "width=1100,height=800");
    if (!printWindow) return;

    const bodyRows = printable
      .map(
        (row) => `
          <tr>
            <td>${row.no}</td>
            <td>${escapeHtml(row.drugName)}</td>
            <td>${escapeHtml(row.drugForm)}</td>
            <td>${escapeHtml(row.patientDose)}</td>
            <td>${escapeHtml(row.brand)}</td>
            <td>${escapeHtml(row.dose)}</td>
            <td>${escapeHtml(row.quantity)}</td>
            <td>${escapeHtml(row.type)}</td>
          </tr>`
      )
      .join("");

    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Pharmacy Slip - Cycle ${cycleNumber} / Day ${cycleDay}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; margin: 24px; color: #191C1E; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    p { margin: 0 0 16px; font-size: 11px; color: #4B5563; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    th { text-align: left; text-transform: uppercase; letter-spacing: .04em; background: #F2F4F6; }
    th, td { border: 1px solid #D8DEE6; padding: 6px 8px; }
    tr:nth-child(even) td { background: #FAFBFC; }
    .foot { margin-top: 20px; font-size: 9px; color: #6B7280; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <h1>Pharmacy Slip</h1>
  <p>Cycle ${cycleNumber} / Day ${cycleDay}${dirty ? " &middot; draft (not saved)" : ""}</p>
  <table>
    <thead>
      <tr>
        <th>No.</th><th>Drug Name</th><th>Drug Form</th><th>Patient Dosage</th>
        <th>Brand Name</th><th>Dosage</th><th>Quantity</th><th>Type</th>
      </tr>
    </thead>
    <tbody>${bodyRows || '<tr><td colspan="8">No medicines on this cycle day.</td></tr>'}</tbody>
  </table>
  <div class="foot"><span>Cycle ${cycleNumber} / Day ${cycleDay}</span><span>${new Date().toLocaleString()}</span></div>
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`);
    printWindow.document.close();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="w-[96vw] max-w-[1180px] gap-0 overflow-hidden p-0 font-[Manrope,sans-serif]">
        {/* Header */}
        <DialogHeader className="space-y-0 border-b border-[#E5E7EB] bg-white px-6 py-4">
          <div className="flex items-start justify-between gap-4 pr-8">
            <div>
              <DialogTitle className="text-base font-bold tracking-tight text-[#191C1E]">
                Pharmacy Slip
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-[11px] text-[#6B7280]">
                Cycle {cycleNumber} / Day {cycleDay} &middot; brand, dosage and quantity
                for this cycle day's medicines
              </DialogDescription>
            </div>

            <div className="flex items-center gap-2">
              {readOnly && (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200">
                  <Lock className="h-3 w-3" /> Issued &middot; read-only
                </span>
              )}
              {!readOnly && dirty && (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">
                  Unsaved
                </span>
              )}
              {!readOnly && !dirty && savedSlip && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                  <Check className="h-3 w-3" /> Saved
                </span>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="max-h-[68vh] overflow-y-auto bg-[#FBFCFD] px-6 py-4">
          {(error || loadError) && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error || loadError}</span>
            </div>
          )}

          {readOnly && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                This slip has been issued, so its lines can no longer be changed. Cancel
                it from the Orders page to create a replacement.
              </span>
            </div>
          )}

          {warnings.length > 0 && !loading && !loadingRows && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div className="space-y-0.5">
                {warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            </div>
          )}

          {rows.length > 0 && !loadingRows && (
            <div className="mb-3 flex flex-wrap items-center gap-2 text-[10px] text-[#4B5563]">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E7EB] bg-white px-2.5 py-1 font-semibold">
                <span className="text-[#004785]">{summary.medicines}</span>
                {summary.medicines === 1 ? "medicine" : "medicines"}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E7EB] bg-white px-2.5 py-1 font-semibold">
                <span className="text-[#004785]">{summary.lines}</span>
                {summary.lines === 1 ? "slip line" : "slip lines"}
              </span>
              {summary.missingBrand > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-semibold text-amber-700">
                  <AlertTriangle className="h-3 w-3" />
                  {summary.missingBrand} without a brand
                </span>
              )}
              {(summary.missingDose > 0 || summary.missingQuantity > 0) && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-semibold text-amber-700">
                  <AlertTriangle className="h-3 w-3" />
                  {summary.missingDose + summary.missingQuantity} needing dosage / quantity
                </span>
              )}
              <span className="ml-auto hidden text-[10px] text-[#9AA4B2] sm:inline">
                Quantity counts units of the selected dosage
              </span>
            </div>
          )}

          {(loading || loadingRows) && rows.length === 0 ? (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-[#D8DEE6] bg-white py-16 text-[11px] text-[#6B7280]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading this cycle day's medicines...
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#D8DEE6] bg-white px-6 py-14 text-center">
              <p className="text-sm font-semibold text-[#191C1E]">
                No medicines for Cycle {cycleNumber} / Day {cycleDay}
              </p>
              <p className="mx-auto mt-1 max-w-md text-[11px] leading-relaxed text-[#6B7280]">
                Save the Chemotherapy Order for this cycle day first, then open the
                pharmacy slip again. Discharge medicines you add below appear here too.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
              <table className="w-full min-w-[1040px] border-collapse text-left">
                <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur">
                  <tr className="border-b border-[#E5E7EB]">
                    {[
                      { label: "No.", className: "w-12" },
                      { label: "Drug Name", className: "w-[17%]" },
                      { label: "Drug Form", className: "w-[9%]" },
                      { label: "Patient Dosage", className: "w-[11%]" },
                      { label: "Brand Name", className: "w-[17%]" },
                      { label: "Dosage", className: "w-[13%]" },
                      { label: "Quantity", className: "w-[11%]" },
                      { label: "Type", className: "w-[10%]" },
                    ].map((column) => (
                      <th
                        key={column.label}
                        className={`${column.className} px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-[#4B5563]`}
                      >
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="text-[11px] text-[#374151]">
                  {displayRows.map(({ row, plan }) => {
                    const baseQuantity = effectiveBaseQuantity(row, plan);
                    const extraQuantity = effectiveExtraQuantity(row, plan);
                    const baseValue =
                      row.quantityOverride !== ""
                        ? row.quantityOverride
                        : baseQuantity === null
                          ? ""
                          : String(baseQuantity);

                    const numbers = rowNumbers.get(row.key);

                    const strengthOptions = strengthsOfBrand(row);
                    /* A restored slip can name a strength the master no longer
                       lists: show it as free text instead of an empty select. */
                    const showStrengthSelect =
                      strengthOptions.length > 0 &&
                      (strengthOptions.some((entry) => entry.label === row.strengthLabel) ||
                        !row.selectedDose);

                    return (
                      <Fragment key={row.key}>
                        <tr className="border-b border-[#F0F2F5] transition-colors hover:bg-[#F8FAFC]">
                          <td className="px-3 py-2.5 align-top text-[11px] font-semibold text-[#6B7280]">
                            {numbers?.base ?? ""}
                          </td>

                          <td className="px-3 py-2.5 align-top">
                            <p className="font-semibold text-[#191C1E]">
                              {row.drugName || "—"}
                            </p>
                            {row.route && (
                              <p className="mt-0.5 text-[10px] text-[#9AA4B2]">
                                {row.route}
                              </p>
                            )}
                          </td>

                          <td className="px-3 py-2.5 align-top">
                            <span className="inline-flex rounded-md bg-[#F2F4F6] px-2 py-0.5 text-[10px] font-semibold text-[#4B5563]">
                              {row.drugForm || "—"}
                            </span>
                          </td>

                          <td className="px-3 py-2.5 align-top font-medium text-[#191C1E]">
                            {row.patientDose || "—"}
                          </td>

                          <td className="px-3 py-2.5 align-top">
                            <SingleSelectDropdown
                              options={row.brandOptions.map((brand) => brand.label)}
                              value={row.brand}
                              onValueChange={(value) => changeBrand(row.key, value)}
                              placeholder={
                                row.medicineId ? "Select brand" : "Not in master"
                              }
                              disabled={readOnly || !row.medicineId || row.brandOptions.length === 0}
                              className="h-8 min-w-[130px] rounded-md px-2 text-[11px]"
                            />
                          </td>

                          <td className="px-3 py-2.5 align-top">
                            {showStrengthSelect ? (
                              <div className="relative">
                                <select
                                  value={row.strengthLabel}
                                  onChange={(event) =>
                                    changeStrength(row.key, event.target.value)
                                  }
                                  disabled={readOnly || !row.brand}
                                  aria-label={`Dosage for ${row.drugName}`}
                                  className={`${INPUT_CLASS} cursor-pointer appearance-none pr-7`}
                                >
                                  <option value="">Select</option>
                                  {strengthOptions.map((strength) => (
                                    <option key={strength.label} value={strength.label}>
                                      {strength.label}
                                    </option>
                                  ))}
                                </select>
                                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#6B7280]" />
                              </div>
                            ) : (
                              <input
                                type="text"
                                value={`${row.selectedDose}${
                                  row.selectedDose && row.selectedUnit
                                    ? ` ${row.selectedUnit}`
                                    : row.selectedUnit
                                }`.trim()}
                                onChange={(event) =>
                                  changeManualDose(row.key, event.target.value)
                                }
                                disabled={readOnly}
                                placeholder="e.g. 120 mg"
                                className={INPUT_CLASS}
                              />
                            )}
                          </td>

                          <td className="px-3 py-2.5 align-top">
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min={0}
                                value={baseValue}
                                onChange={(event) =>
                                  updateRow(row.key, () => ({
                                    quantityOverride: event.target.value,
                                  }))
                                }
                                disabled={readOnly}
                                placeholder={
                                  baseQuantity === null ? "Enter" : String(baseQuantity)
                                }
                                className={`${INPUT_CLASS} w-[70px] text-center`}
                              />
                              {baseValue !== "" &&
                                String(baseQuantity ?? "") !== baseValue && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateRow(row.key, () => ({
                                        quantityOverride: "",
                                      }))
                                    }
                                    title={`Use the suggested quantity (${baseQuantity ?? "—"})`}
                                    className="rounded-md border border-[#E5E7EB] p-1 text-[#6B7280] transition-colors hover:border-[#00488D] hover:text-[#00488D]"
                                  >
                                    <RotateCcw className="h-3 w-3" />
                                  </button>
                                )}
                            </div>
                            {baseValue !== "" &&
                              String(baseQuantity ?? "") !== baseValue && (
                                <p className="mt-1 text-[9px] text-[#9AA4B2]">
                                  Suggested {baseQuantity ?? "—"}
                                </p>
                              )}
                            {plan.warning && (
                              <p className="mt-1 flex items-start gap-1 text-[9px] leading-tight text-amber-700">
                                <AlertTriangle className="mt-[1px] h-2.5 w-2.5 shrink-0" />
                                {plan.warning}
                              </p>
                            )}
                          </td>

                          <td className="px-3 py-2.5 align-top">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold ring-1 ${
                                ROLE_BADGE[row.role] ??
                                "bg-slate-100 text-slate-600 ring-slate-200"
                              }`}
                            >
                              {slipRoleLabel(row.role)}
                            </span>
                          </td>
                        </tr>

                        {plan.extra && extraQuantity !== null && (
                          <tr className="border-b border-[#F0F2F5] bg-[#FBFCFE] transition-colors hover:bg-[#F8FAFC]">
                            <td className="px-3 py-2.5 align-top text-[11px] font-semibold text-[#6B7280]">
                              {numbers?.extra ?? ""}
                            </td>
                            <td className="px-3 py-2.5 align-top">
                              <p className="font-semibold text-[#191C1E]">
                                {row.drugName || "—"}
                              </p>
                              <p className="mt-0.5 text-[10px] text-[#9AA4B2]">
                                Top-up to reach {row.patientDose || "the patient dose"}
                              </p>
                            </td>
                            <td className="px-3 py-2.5 align-top">
                              <span className="inline-flex rounded-md bg-[#F2F4F6] px-2 py-0.5 text-[10px] font-semibold text-[#4B5563]">
                                {row.drugForm || "—"}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 align-top font-medium text-[#191C1E]">
                              {row.patientDose || "—"}
                            </td>
                            <td className="px-3 py-2.5 align-top">
                              <span className="text-[11px] font-medium text-[#374151]">
                                {row.brand || "—"}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 align-top font-medium text-[#191C1E]">
                              {formatNumber(plan.extra.strength.value)}
                              {plan.extra.strength.unit
                                ? ` ${plan.extra.strength.unit}`
                                : ""}
                            </td>
                            <td className="px-3 py-2.5 align-top">
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  min={0}
                                  value={
                                    row.extraQuantityOverride !== ""
                                      ? row.extraQuantityOverride
                                      : String(extraQuantity)
                                  }
                                  onChange={(event) =>
                                    updateRow(row.key, () => ({
                                      extraQuantityOverride: event.target.value,
                                    }))
                                  }
                                  disabled={readOnly}
                                  className={`${INPUT_CLASS} w-[70px] text-center`}
                                />
                                {row.extraQuantityOverride !== "" &&
                                  Number(row.extraQuantityOverride) !==
                                    plan.extra.quantity && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateRow(row.key, () => ({
                                          extraQuantityOverride: "",
                                        }))
                                      }
                                      title={`Use the suggested quantity (${plan.extra?.quantity})`}
                                      className="rounded-md border border-[#E5E7EB] p-1 text-[#6B7280] transition-colors hover:border-[#00488D] hover:text-[#00488D]"
                                    >
                                      <RotateCcw className="h-3 w-3" />
                                    </button>
                                  )}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 align-top">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold ring-1 ${
                                  ROLE_BADGE[row.role] ??
                                  "bg-slate-100 text-slate-600 ring-slate-200"
                                }`}
                              >
                                {slipRoleLabel(row.role)} · top-up
                              </span>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {rows.length > 0 && (
            <p className="mt-3 text-[10px] leading-relaxed text-[#6B7280]">
              Quantity counts units of the selected dosage. A second line appears when
              the selected strength is below the patient's dose and a smaller strength
              exists to make it up.
            </p>
          )}

          {(saveError || saveMessage) && (
            <div
              className={`mt-3 rounded-lg px-3 py-2 text-[11px] ${
                saveError
                  ? "border border-red-200 bg-red-50 text-red-700"
                  : "border border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {saveError || saveMessage}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E5E7EB] bg-white px-6 py-3.5">
          <p className="text-[10px] text-[#6B7280]">
            {readOnly
              ? "Issued slips are read-only."
              : "Saved against this cycle day so the pharmacist sees your choices."}
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              disabled={readOnly || saving || rows.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#D8DEE6] bg-white px-3 py-2 text-[11px] font-semibold text-[#374151] transition-colors hover:border-[#00488D] hover:text-[#00488D] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset suggestions
            </button>

            <button
              type="button"
              onClick={handlePrint}
              disabled={rows.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#D8DEE6] bg-white px-3 py-2 text-[11px] font-semibold text-[#374151] transition-colors hover:border-[#00488D] hover:text-[#00488D] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Printer className="h-3.5 w-3.5" />
              Print
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={readOnly || saving || rows.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#004785] px-4 py-2 text-[11px] font-bold text-white shadow-sm transition-colors hover:bg-[#003A6B] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {saving ? "Saving" : "Save slip"}
            </button>

            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              aria-label="Close pharmacy slip"
              className="rounded-md p-2 text-[#6B7280] transition-colors hover:bg-[#F2F4F6] hover:text-[#191C1E] disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default PharmacySlipModal;
