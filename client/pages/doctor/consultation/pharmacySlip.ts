import type { ChemoPlanItem, ChemoPlanOrder } from "../../../api/chemotherapy.api";
import type {
  PharmacyMasterItem,
  PharmacySlipItem,
  PharmacySlipOrderItemPayload,
} from "../../../api/pharmacy.api";

/* ============================================================
   PHARMACY SLIP (Discharge Medication popup)
   Pure helpers: build the slip's rows from the cycle-day order and
   the discharge medicines, expose each medicine's brands/strengths,
   and work out how many units of the selected strength add up to the
   patient's dose.

   Rules the quantity allocation must satisfy:
     P = patient dose, D = selected strength, S = brand strengths
     1. D == P                      -> one row, quantity 1
     2. P 150, D 120, S 30/20/120   -> 120 x1 + 30 x1
     3. P 150, D 120, S 120/20      -> 120 x1 + 20 x2
     4. P 150, D 120, S 120         -> 120 x2 (folded into the first row)
============================================================ */

export const SLIP_ROLE_ORDER = [
  "PRIMARY",
  "PREMEDICATION",
  "SUPPORTIVE",
  "POSTMEDICATION",
  "DISCHARGE",
] as const;

export type SlipRole = (typeof SLIP_ROLE_ORDER)[number];

export const SLIP_ROLE_LABELS: Record<string, string> = {
  PRIMARY: "Chemotherapy",
  PREMEDICATION: "Premedication",
  SUPPORTIVE: "Supportive",
  POSTMEDICATION: "Post-medication",
  DISCHARGE: "Discharge",
};

export const slipRoleLabel = (role: string | null | undefined) =>
  SLIP_ROLE_LABELS[(role ?? "").toUpperCase()] ?? role ?? "";

const roleRank = (role: string) => {
  const index = SLIP_ROLE_ORDER.indexOf(role.toUpperCase() as SlipRole);
  return index === -1 ? SLIP_ROLE_ORDER.length : index;
};

const asNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const text = (value: unknown) => String(value ?? "").trim();

const norm = (value: unknown) => text(value).toLowerCase();

/* "150 mg" / "150mg" / "0.15 g" -> { value, unit }. */
export function parseDoseText(value: string | null | undefined): {
  value: number | null;
  unit: string;
} {
  const raw = text(value);
  if (!raw) return { value: null, unit: "" };

  const match = raw.match(/^(-?\d+(?:\.\d+)?)\s*(.*)$/);
  if (!match) return { value: null, unit: "" };

  const parsed = Number(match[1]);
  return {
    value: Number.isFinite(parsed) ? parsed : null,
    unit: match[2].trim(),
  };
}

/* ---------------------------------------------------------------
   Unit handling
   A patient dose must be compared in the same unit as the brand
   strength (150 mg vs 0.15 g). Anything the table below does not
   know is only comparable when the units are written identically.
--------------------------------------------------------------- */

type BaseUnit = { value: number; unit: string };

const UNIT_FACTORS: Record<string, { unit: string; factor: number }> = {
  mg: { unit: "mg", factor: 1 },
  milligram: { unit: "mg", factor: 1 },
  milligrams: { unit: "mg", factor: 1 },
  g: { unit: "mg", factor: 1000 },
  gm: { unit: "mg", factor: 1000 },
  gram: { unit: "mg", factor: 1000 },
  grams: { unit: "mg", factor: 1000 },
  mcg: { unit: "mg", factor: 0.001 },
  ug: { unit: "mg", factor: 0.001 },
  µg: { unit: "mg", factor: 0.001 },
  microgram: { unit: "mg", factor: 0.001 },
  micrograms: { unit: "mg", factor: 0.001 },
  ml: { unit: "ml", factor: 1 },
  millilitre: { unit: "ml", factor: 1 },
  milliliter: { unit: "ml", factor: 1 },
  l: { unit: "ml", factor: 1000 },
  litre: { unit: "ml", factor: 1000 },
  liter: { unit: "ml", factor: 1000 },
  iu: { unit: "iu", factor: 1 },
  unit: { unit: "iu", factor: 1 },
  units: { unit: "iu", factor: 1 },
};

export function toBaseUnit(value: number, unit: string | null | undefined): BaseUnit | null {
  const key = norm(unit);

  if (!key) return { value, unit: "" };

  const known = UNIT_FACTORS[key];
  if (known) return { value: value * known.factor, unit: known.unit };

  return { value, unit: key };
}

/* ---------------------------------------------------------------
   Brands and strengths
--------------------------------------------------------------- */

export type StrengthOption = {
  label: string;
  value: number;
  unit: string;
  pharmacyItemId: string;
};

export type BrandOption = {
  label: string;
  strengths: StrengthOption[];
};

const strengthOf = (item: PharmacyMasterItem): StrengthOption | null => {
  const value = asNumber(item.strength_value);
  if (value === null || value <= 0) return null;

  const unit = text(item.strength_unit);
  const label =
    text(item.strength_text) || `${formatNumber(value)}${unit ? ` ${unit}` : ""}`;

  return {
    label,
    value,
    unit,
    pharmacyItemId: item.pharmacy_item_id,
  };
};

export const formatNumber = (value: number) =>
  String(Number(value.toFixed(4)));

export function buildBrandOptions(
  row: Pick<SlipSourceRow, "medicineId" | "genericId" | "drugForm">,
  masterItems: PharmacyMasterItem[]
): BrandOption[] {
  if (!row.medicineId && !row.genericId) return [];

  const generic = norm(row.genericId);
  const form = norm(row.drugForm);

  const byGeneric = generic ? masterItems.filter((item) => norm(item.generic_id) === generic) : [];
  const byGenericAndForm = form
    ? byGeneric.filter((item) => norm(item.dosage_form) === form)
    : byGeneric;
  const byMedicine = row.medicineId
    ? masterItems.filter((item) => item.medicine_id === row.medicineId)
    : [];

  // Strictest match wins: same generic AND same form. Falling back keeps the
  // doctor working when the master writes the form differently ("Inj" vs
  // "Injection") instead of showing an empty dropdown.
  const pool = byGenericAndForm.length
    ? byGenericAndForm
    : byGeneric.length
      ? byGeneric
      : byMedicine;

  const brands = new Map<string, BrandOption>();

  for (const item of pool) {
    const label = text(item.brand_name) || text(item.manufacturer_name) || text(item.item_name);
    if (!label) continue;

    const brand =
      brands.get(label) ??
      ({ label, strengths: [] } satisfies BrandOption);

    const strength = strengthOf(item);
    if (
      strength &&
      !brand.strengths.some(
        (existing) =>
          existing.value === strength.value &&
          norm(existing.unit) === norm(strength.unit)
      )
    ) {
      brand.strengths.push(strength);
    }

    brands.set(label, brand);
  }

  return [...brands.values()]
    .map((brand) => ({
      ...brand,
      strengths: [...brand.strengths].sort((a, b) => a.value - b.value),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/* ---------------------------------------------------------------
   Quantity allocation
--------------------------------------------------------------- */

export type QuantityExtra = {
  strength: StrengthOption;
  quantity: number;
};

export type QuantityPlan = {
  baseQuantity: number | null;
  extra: QuantityExtra | null;
  warning?: string;
};

export type QuantityInput = {
  patientDose: number | null;
  patientDoseUnit: string;
  selectedDose: number | null;
  selectedUnit: string;
  strengths: StrengthOption[];
};

export function allocateQuantity({
  patientDose,
  patientDoseUnit,
  selectedDose,
  selectedUnit,
  strengths,
}: QuantityInput): QuantityPlan {
  if (patientDose === null || patientDose <= 0) {
    return {
      baseQuantity: null,
      extra: null,
      warning: "The patient dose is missing, so the quantity has to be entered manually.",
    };
  }

  if (selectedDose === null || selectedDose <= 0) {
    return { baseQuantity: null, extra: null };
  }

  const target = toBaseUnit(patientDose, patientDoseUnit);
  const selected = toBaseUnit(selectedDose, selectedUnit);

  const comparable =
    target !== null &&
    selected !== null &&
    (target.unit === selected.unit || !target.unit || !selected.unit);

  if (!comparable) {
    return {
      baseQuantity: null,
      extra: null,
      warning: `The brand strength (${text(selectedUnit) || "no unit"}) cannot be compared with the patient dose (${text(patientDoseUnit) || "no unit"}). Enter the quantity manually.`,
    };
  }

  const targetValue = target.value;
  const selectedValue = selected.value;

  // The selected strength already covers the dose: a single unit is enough.
  if (selectedValue >= targetValue) {
    return { baseQuantity: 1, extra: null };
  }

  const remaining = targetValue - selectedValue;

  // Only strengths below the selected one can top it up. A brand with none
  // (test case 4) folds the shortfall into the selected row instead.
  const candidates = strengths
    .map((strength) => ({ strength, base: toBaseUnit(strength.value, strength.unit) }))
    .filter(
      (candidate): candidate is { strength: StrengthOption; base: BaseUnit } =>
        candidate.base !== null &&
        candidate.base.unit === target.unit &&
        candidate.base.value > 0 &&
        candidate.base.value < selectedValue
    );

  if (candidates.length === 0) {
    return {
      baseQuantity: Math.ceil(targetValue / selectedValue),
      extra: null,
    };
  }

  // Smallest overshoot wins; ties go to the fewest tablets, then the
  // strongest candidate (fewer units to dispense).
  const best = candidates
    .map(({ strength, base }) => {
      const quantity = Math.ceil(remaining / base.value);
      return {
        strength,
        quantity,
        total: quantity * base.value,
        overshoot: quantity * base.value - remaining,
      };
    })
    .sort(
      (a, b) =>
        a.overshoot - b.overshoot ||
        a.quantity - b.quantity ||
        b.strength.value - a.strength.value
    )[0];

  return {
    baseQuantity: 1,
    extra: { strength: best.strength, quantity: best.quantity },
  };
}

/* ---------------------------------------------------------------
   Source rows
--------------------------------------------------------------- */

export type SlipSourceRow = {
  key: string;
  medicineId: string;
  genericId: string;
  drugName: string;
  drugForm: string;
  patientDose: string;
  patientDoseValue: number | null;
  patientDoseUnit: string;
  role: string;
  route: string;
  frequency: string;
  duration: string;
  instructions: string;
};

export type SlipDraftRow = SlipSourceRow & {
  brandOptions: BrandOption[];
  brand: string;
  strengthLabel: string;
  selectedDose: string;
  selectedUnit: string;
  pharmacyItemId: string;
  quantityOverride: string;
  extraQuantityOverride: string;
};

const planItemDose = (item: ChemoPlanItem) => {
  const value = asNumber(item.calculated_dose) ?? asNumber(item.protocol_dose);
  const unit =
    text(item.calculated_dose_unit) ||
    text(item.protocol_dose_unit) ||
    "";
  return { value, unit };
};

export function buildSlipSourceRows({
  order,
  dischargeRows,
}: {
  order: ChemoPlanOrder | null;
  dischargeRows: SlipDischargeRow[];
}): SlipSourceRow[] {
  const ordered: { row: SlipSourceRow; sequence: number }[] = [];

  for (const item of order?.chemotherapy_plan_items ?? []) {
    const role = text(item.drug_role || "PRIMARY").toUpperCase();
    if (!SLIP_ROLE_ORDER.includes(role as SlipRole)) continue;

    const dose = planItemDose(item);
    const medicine = item.medicine_master;
    const patientDose =
      dose.value === null
        ? ""
        : `${formatNumber(dose.value)}${dose.unit ? ` ${dose.unit}` : ""}`;

    ordered.push({
      sequence: item.drug_sequence ?? 0,
      row: {
        key: `${role}:${item.chemotherapy_plan_item_id}`,
        medicineId: text(item.medicine_id),
        genericId: text(medicine?.generic_id),
        drugName:
          text(medicine?.medicine_name) ||
          text(item.drug_name) ||
          "",
        drugForm: text(medicine?.dosage_form) || text(item.formulation),
        patientDose,
        patientDoseValue: dose.value,
        patientDoseUnit: dose.unit,
        role,
        route: text(item.administration_route),
        frequency: text(item.frequency),
        duration: text(item.duration),
        instructions: text(item.administration_detail || item.remarks),
      },
    });
  }

  ordered.sort(
    (a, b) =>
      roleRank(a.row.role) - roleRank(b.row.role) ||
      a.sequence - b.sequence
  );

  const orderRows = ordered.map((entry) => entry.row);

  const discharge: SlipSourceRow[] = dischargeRows.map((row, index) => {
    const dose = parseDoseText(row.dosage);
    const unit = row.dosageUnit || dose.unit;
    return {
      key: `DISCHARGE:${row.id ?? index}:${row.medicineId || row.drugName}`,
      medicineId: text(row.medicineId),
      genericId: text(row.genericId),
      drugName: text(row.drugName),
      drugForm: text(row.drugForm),
      patientDose:
        dose.value === null
          ? text(row.dosage)
          : `${formatNumber(dose.value)}${unit ? ` ${unit}` : ""}`,
      patientDoseValue: dose.value,
      patientDoseUnit: unit,
      role: "DISCHARGE",
      route: "",
      frequency: text(row.frequency),
      duration: text(row.duration),
      instructions: text(row.instruction),
    };
  });

  return [...orderRows, ...discharge];
}

export type SlipDischargeRow = {
  id?: number;
  medicineId: string;
  drugName: string;
  drugForm?: string;
  genericId?: string;
  dosage: string;
  dosageUnit: string;
  frequency: string;
  instruction: string;
  duration: string;
};

/* The brand + strength a row opens with: the strength closest to the
   patient's dose, preferring an exact match, then the largest strength that
   does not exceed it. */
export function pickDefaultStrength(
  patientDose: number | null,
  patientDoseUnit: string,
  strengths: StrengthOption[]
): StrengthOption | null {
  if (strengths.length === 0) return null;

  const target = patientDose === null ? null : toBaseUnit(patientDose, patientDoseUnit);

  if (target) {
    const comparable = strengths
      .map((strength) => ({ strength, base: toBaseUnit(strength.value, strength.unit) }))
      .filter(
        (entry): entry is { strength: StrengthOption; base: BaseUnit } =>
          entry.base !== null && entry.base.unit === target.unit
      );

    if (comparable.length > 0) {
      const exact = comparable.find((entry) => entry.base.value === target.value);
      if (exact) return exact.strength;

      const below = comparable
        .filter((entry) => entry.base.value < target.value)
        .sort((a, b) => b.base.value - a.base.value);

      if (below.length > 0) return below[0].strength;
    }
  }

  return strengths[0];
}

/* A fresh draft: first brand, best strength, no overrides. */
export function createDraftRow(
  source: SlipSourceRow,
  brandOptions: BrandOption[]
): SlipDraftRow {
  const brand = brandOptions[0];
  const strength = brand
    ? pickDefaultStrength(
        source.patientDoseValue,
        source.patientDoseUnit,
        brand.strengths
      )
    : null;

  return {
    ...source,
    brandOptions,
    brand: brand?.label ?? "",
    strengthLabel: strength?.label ?? "",
    selectedDose: strength ? formatNumber(strength.value) : "",
    selectedUnit: strength?.unit ?? "",
    pharmacyItemId: strength?.pharmacyItemId ?? "",
    quantityOverride: "",
    extraQuantityOverride: "",
  };
}

export const strengthsOfBrand = (
  row: SlipDraftRow,
  brandLabel = row.brand
): StrengthOption[] =>
  row.brandOptions.find((brand) => brand.label === brandLabel)?.strengths ?? [];

/* Recomputes the suggested quantity plan for a row as it is currently set. */
export function suggestionFor(row: SlipDraftRow): QuantityPlan {
  return allocateQuantity({
    patientDose: row.patientDoseValue,
    patientDoseUnit: row.patientDoseUnit,
    selectedDose: asNumber(row.selectedDose),
    selectedUnit: row.selectedUnit,
    strengths: strengthsOfBrand(row),
  });
}

export const effectiveBaseQuantity = (row: SlipDraftRow, plan: QuantityPlan) => {
  const override = asNumber(row.quantityOverride);
  return override !== null ? Math.max(0, Math.ceil(override)) : plan.baseQuantity;
};

export const effectiveExtraQuantity = (row: SlipDraftRow, plan: QuantityPlan) => {
  if (!plan.extra) return null;
  const override = asNumber(row.extraQuantityOverride);
  return override !== null ? Math.max(0, Math.ceil(override)) : plan.extra.quantity;
};

/* ---------------------------------------------------------------
   Persist / restore
--------------------------------------------------------------- */

const itemKey = (item: { medicine_id?: string | null; drug_name?: string | null; drug_role?: string | null }) =>
  `${text(item.medicine_id) || text(item.drug_name).toLowerCase()}|${text(item.drug_role).toUpperCase()}`;

export function toSlipOrderItems(rows: SlipDraftRow[]): PharmacySlipOrderItemPayload[] {
  const items: PharmacySlipOrderItemPayload[] = [];

  for (const row of rows) {
    const plan = suggestionFor(row);
    const baseQuantity = effectiveBaseQuantity(row, plan);

    items.push({
      medicine_id: row.medicineId || null,
      drug_name: row.drugName || null,
      dosage_form: row.drugForm || null,
      patient_dose: row.patientDose || null,
      brand_name: row.brand || null,
      dose: row.selectedDose || null,
      dose_unit: row.selectedUnit || null,
      quantity: baseQuantity,
      drug_role: row.role,
      route: row.route || null,
      frequency: row.frequency || null,
      duration: row.duration || null,
      instructions: row.instructions || null,
      pharmacy_item_id: row.pharmacyItemId || null,
    });

    const extraQuantity = effectiveExtraQuantity(row, plan);
    if (extraQuantity !== null && plan.extra) {
      items.push({
        medicine_id: row.medicineId || null,
        drug_name: row.drugName || null,
        dosage_form: row.drugForm || null,
        patient_dose: row.patientDose || null,
        brand_name: row.brand || null,
        dose: formatNumber(plan.extra.strength.value),
        dose_unit: plan.extra.strength.unit,
        quantity: extraQuantity,
        drug_role: row.role,
        route: row.route || null,
        frequency: row.frequency || null,
        duration: row.duration || null,
        instructions: row.instructions || null,
        pharmacy_item_id: plan.extra.strength.pharmacyItemId || null,
      });
    }
  }

  return items;
}

/*
 * Restores the doctor's saved choices. Base and top-up lines are written
 * consecutively with the same medicine + role, so consecutive saved items
 * form one group; groups are matched to rows by medicine + role in order.
 */
export function applySavedSlip(
  rows: SlipDraftRow[],
  saved: PharmacySlipItem[] | null | undefined
): SlipDraftRow[] {
  if (!saved || saved.length === 0) return rows;

  type Group = { key: string; base: PharmacySlipItem; extra?: PharmacySlipItem };
  const groups: Group[] = [];

  for (const item of saved) {
    const key = itemKey(item);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      if (!last.extra) last.extra = item;
      continue;
    }
    groups.push({ key, base: item });
  }

  const used = new Set<number>();

  return rows.map((row) => {
    const key = itemKey({
      medicine_id: row.medicineId,
      drug_name: row.drugName,
      drug_role: row.role,
    });

    const index = groups.findIndex((group, i) => !used.has(i) && group.key === key);
    if (index === -1) return row;

    used.add(index);
    const { base, extra } = groups[index];

    const brand =
      base.brand_name && row.brandOptions.some((option) => option.label === base.brand_name)
        ? base.brand_name
        : row.brand;

    const strengths = row.brandOptions.find((option) => option.label === brand)?.strengths ?? [];
    const dose = asNumber(base.dose);
    const matchedStrength =
      strengths.find(
        (strength) =>
          strength.value === dose &&
          norm(strength.unit) === norm(base.dose_unit)
      ) ?? strengths.find((strength) => strength.value === dose);

    const plan = allocateQuantity({
      patientDose: row.patientDoseValue,
      patientDoseUnit: row.patientDoseUnit,
      selectedDose: dose,
      selectedUnit: base.dose_unit ?? matchedStrength?.unit ?? "",
      strengths,
    });

    return {
      ...row,
      brand,
      strengthLabel: matchedStrength?.label ?? "",
      selectedDose: base.dose ?? "",
      selectedUnit: base.dose_unit ?? matchedStrength?.unit ?? "",
      pharmacyItemId: base.pharmacy_item_id ?? matchedStrength?.pharmacyItemId ?? "",
      // A saved quantity that differs from the suggestion is a doctor override.
      // It is also the only record of a quantity typed when no suggestion
      // existed (a missing patient dose), so that case keeps it too.
      quantityOverride:
        base.quantity === null || base.quantity === undefined
          ? ""
          : plan.baseQuantity === null || base.quantity !== plan.baseQuantity
            ? String(base.quantity)
            : "",
      extraQuantityOverride:
        extra && plan.extra && extra.quantity !== plan.extra.quantity
          ? String(extra.quantity)
          : "",
    };
  });
}

/* What the popup actually renders: a base line plus, when the selected
   strength cannot reach the patient dose on its own, one top-up line. */
export type SlipDisplayRow = {
  key: string;
  no: number;
  drugName: string;
  drugForm: string;
  patientDose: string;
  brand: string;
  dose: string;
  quantity: string;
  type: string;
  role: string;
  isExtra: boolean;
  rowKey: string;
  warning?: string;
};

export function toDisplayRows(rows: SlipDraftRow[]): SlipDisplayRow[] {
  const display: SlipDisplayRow[] = [];
  let no = 0;

  for (const row of rows) {
    const plan = suggestionFor(row);
    const baseQuantity = effectiveBaseQuantity(row, plan);

    display.push({
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
      warning: plan.warning,
    });

    const extraQuantity = effectiveExtraQuantity(row, plan);
    if (plan.extra && extraQuantity !== null) {
      display.push({
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

  return display;
}
