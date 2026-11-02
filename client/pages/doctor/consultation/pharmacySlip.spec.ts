import { describe, it, expect } from "vitest";
import {
  allocateQuantity,
  applySavedSlip,
  buildBrandOptions,
  buildSlipSourceRows,
  createDraftRow,
  effectiveBaseQuantity,
  effectiveExtraQuantity,
  parseDoseText,
  pickDefaultStrength,
  suggestionFor,
  toDisplayRows,
  toSlipOrderItems,
  type SlipDraftRow,
  type StrengthOption,
} from "./pharmacySlip";
import type { PharmacyMasterItem, PharmacySlipItem } from "../../../api/pharmacy.api";

const strength = (value: number, unit = "mg", pharmacyItemId = `PHM-${value}`): StrengthOption => ({
  label: `${value} ${unit}`,
  value,
  unit,
  pharmacyItemId,
});

const masterRow = (
  overrides: Partial<PharmacyMasterItem>
): PharmacyMasterItem => ({
  pharmacy_item_id: "PHM-1",
  medicine_id: "MED-1",
  generic_name: "Trastuzumab",
  generic_id: "GEN-1",
  item_name: "Trastuzumab 120 mg",
  brand_name: "Herceptin",
  manufacturer_name: "Roche",
  dosage_form: "Injection",
  strength_text: "120 mg",
  strength_value: 120,
  strength_unit: "mg",
  ...overrides,
});

describe("allocateQuantity", () => {
  it("TC1: the selected dose equals the patient dose -> quantity 1", () => {
    const plan = allocateQuantity({
      patientDose: 150,
      patientDoseUnit: "mg",
      selectedDose: 150,
      selectedUnit: "mg",
      strengths: [strength(150)],
    });

    expect(plan.baseQuantity).toBe(1);
    expect(plan.extra).toBeNull();
  });

  it("TC2: 120 selected for 150 with a 30 available adds a 30 row of 1", () => {
    const plan = allocateQuantity({
      patientDose: 150,
      patientDoseUnit: "mg",
      selectedDose: 120,
      selectedUnit: "mg",
      strengths: [strength(30), strength(20), strength(120)],
    });

    expect(plan.baseQuantity).toBe(1);
    expect(plan.extra?.strength.value).toBe(30);
    expect(plan.extra?.quantity).toBe(1);
  });

  it("TC3: without a 30, the smallest overshoot is 20 x 2", () => {
    const plan = allocateQuantity({
      patientDose: 150,
      patientDoseUnit: "mg",
      selectedDose: 120,
      selectedUnit: "mg",
      strengths: [strength(120), strength(20)],
    });

    expect(plan.baseQuantity).toBe(1);
    expect(plan.extra?.strength.value).toBe(20);
    expect(plan.extra?.quantity).toBe(2);
  });

  it("TC4: when only the selected strength exists it folds into it (120 x 2)", () => {
    const plan = allocateQuantity({
      patientDose: 150,
      patientDoseUnit: "mg",
      selectedDose: 120,
      selectedUnit: "mg",
      strengths: [strength(120)],
    });

    expect(plan.baseQuantity).toBe(2);
    expect(plan.extra).toBeNull();
  });

  it("converts units before comparing (0.15 g patient dose vs 150 mg strength)", () => {
    const plan = allocateQuantity({
      patientDose: 0.15,
      patientDoseUnit: "g",
      selectedDose: 150,
      selectedUnit: "mg",
      strengths: [strength(150)],
    });

    expect(plan.baseQuantity).toBe(1);
    expect(plan.extra).toBeNull();
  });

  it("warns and leaves the quantity manual when units are not comparable", () => {
    const plan = allocateQuantity({
      patientDose: 150,
      patientDoseUnit: "mg",
      selectedDose: 1,
      selectedUnit: "vial",
      strengths: [strength(1, "vial")],
    });

    expect(plan.baseQuantity).toBeNull();
    expect(plan.warning).toMatch(/cannot be compared/i);
  });

  it("leaves the quantity blank when the patient dose is missing", () => {
    const plan = allocateQuantity({
      patientDose: null,
      patientDoseUnit: "mg",
      selectedDose: 120,
      selectedUnit: "mg",
      strengths: [strength(120)],
    });

    expect(plan.baseQuantity).toBeNull();
    expect(plan.warning).toMatch(/patient dose is missing/i);
  });
});

describe("parseDoseText", () => {
  it("splits a dose and its unit", () => {
    expect(parseDoseText("150 mg")).toEqual({ value: 150, unit: "mg" });
    expect(parseDoseText("500mg")).toEqual({ value: 500, unit: "mg" });
    expect(parseDoseText("1 tab 500 mg")).toEqual({ value: 1, unit: "tab 500 mg" });
  });
});

describe("buildBrandOptions", () => {
  it("matches brands on generic_id + dosage_form and keeps each strength once", () => {
    const options = buildBrandOptions(
      { medicineId: "MED-1", genericId: "GEN-1", drugForm: "Injection" },
      [
        masterRow({ pharmacy_item_id: "PHM-1" }),
        masterRow({ pharmacy_item_id: "PHM-2", brand_name: "Herceptin", strength_value: 120, strength_text: "120 mg" }),
        masterRow({ pharmacy_item_id: "PHM-3", brand_name: "Herceptin", strength_value: 440, strength_text: "440 mg" }),
        masterRow({ pharmacy_item_id: "PHM-4", brand_name: "Herclon", strength_value: 440, strength_text: "440 mg" }),
        masterRow({ pharmacy_item_id: "PHM-5", brand_name: "Other form", dosage_form: "Tablet" }),
      ]
    );

    expect(options.map((option) => option.label)).toEqual(["Herceptin", "Herclon"]);
    expect(options[0].strengths.map((entry) => entry.value)).toEqual([120, 440]);
    expect(options[0].strengths[1].pharmacyItemId).toBe("PHM-3");
  });

  it("falls back to the generic when the form wording differs", () => {
    const options = buildBrandOptions(
      { medicineId: "MED-1", genericId: "GEN-1", drugForm: "Inj" },
      [masterRow({ dosage_form: "Injection" })]
    );

    expect(options).toHaveLength(1);
    expect(options[0].strengths).toHaveLength(1);
  });

  it("lists another brand of the same generic even though its medicine_id differs", () => {
    const options = buildBrandOptions(
      { medicineId: "MED-1", genericId: "GEN-1", drugForm: "Injection" },
      [
        masterRow({ pharmacy_item_id: "PHM-1", medicine_id: "MED-1" }),
        masterRow({
          pharmacy_item_id: "PHM-9",
          medicine_id: "MED-9",
          brand_name: "Herclon",
          strength_value: 440,
          strength_text: "440 mg",
        }),
      ]
    );

    expect(options.map((option) => option.label)).toEqual(["Herceptin", "Herclon"]);
  });

  it("returns nothing for a typed drug with no generic", () => {
    expect(
      buildBrandOptions(
        { medicineId: "", genericId: "", drugForm: "Tab" },
        [masterRow({})]
      )
    ).toEqual([]);
  });
});

describe("pickDefaultStrength", () => {
  const strengths = [strength(20), strength(30), strength(120)];

  it("prefers an exact strength match", () => {
    expect(pickDefaultStrength(120, "mg", strengths)?.value).toBe(120);
  });

  it("otherwise takes the largest strength that does not exceed the dose", () => {
    expect(pickDefaultStrength(150, "mg", strengths)?.value).toBe(120);
  });

  it("falls back to the first strength when none is comparable", () => {
    expect(pickDefaultStrength(150, "mg", [strength(1, "vial")])?.value).toBe(1);
  });
});

const draft = (overrides: Partial<SlipDraftRow> = {}): SlipDraftRow => {
  const base = createDraftRow(
    {
      key: "PRIMARY:1",
      medicineId: "MED-1",
      genericId: "GEN-1",
      drugName: "Trastuzumab",
      drugForm: "Injection",
      patientDose: "150 mg",
      patientDoseValue: 150,
      patientDoseUnit: "mg",
      role: "PRIMARY",
      route: "IV",
      frequency: "",
      duration: "",
      instructions: "",
    },
    [
      {
        label: "Herceptin",
        strengths: [strength(120), strength(30), strength(20)],
      },
    ]
  );

  return { ...base, selectedDose: "120", selectedUnit: "mg", ...overrides };
};

describe("suggestionFor / overrides", () => {
  it("suggests the top-up row from the selected brand's strengths", () => {
    const row = draft();
    const plan = suggestionFor(row);

    expect(plan.baseQuantity).toBe(1);
    expect(plan.extra?.strength.value).toBe(30);
    expect(plan.extra?.quantity).toBe(1);
  });

  it("applies a manual base override and a manual top-up override", () => {
    const row = draft({ quantityOverride: "3", extraQuantityOverride: "4" });
    const plan = suggestionFor(row);

    expect(effectiveBaseQuantity(row, plan)).toBe(3);
    expect(effectiveExtraQuantity(row, plan)).toBe(4);
  });

  it("renders one display row per strength line with continuous numbering", () => {
    const rows = [
      draft(),
      draft({
        key: "DISCHARGE:1",
        role: "DISCHARGE",
        drugName: "Paracetamol",
        drugForm: "Tablet",
        patientDose: "500 mg",
        patientDoseValue: 500,
        patientDoseUnit: "mg",
        selectedDose: "500",
        brandOptions: [{ label: "Dolo", strengths: [strength(500)] }],
        brand: "Dolo",
        strengthLabel: "500 mg",
      }),
    ];

    const display = toDisplayRows(rows);

    expect(display.map((row) => row.no)).toEqual([1, 2, 3]);
    expect(display.map((row) => row.type)).toEqual([
      "Chemotherapy",
      "Chemotherapy",
      "Discharge",
    ]);
    expect(display[1].isExtra).toBe(true);
    expect(display[2].isExtra).toBe(false);
  });
});

describe("toSlipOrderItems / applySavedSlip", () => {
  it("writes the base line and the top-up line consecutively", () => {
    const items = toSlipOrderItems([draft()]);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      medicine_id: "MED-1",
      brand_name: "Herceptin",
      dose: "120",
      dose_unit: "mg",
      quantity: 1,
      drug_role: "PRIMARY",
      patient_dose: "150 mg",
      dosage_form: "Injection",
    });
    expect(items[1]).toMatchObject({
      dose: "30",
      quantity: 1,
    });
  });

  it("folds a single-strength brand into one line", () => {
    const row = draft({
      brandOptions: [{ label: "Herceptin", strengths: [strength(120)] }],
      selectedDose: "120",
      strengthLabel: "120 mg",
    });

    const items = toSlipOrderItems([row]);

    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(2);
  });

  const savedItem = (
    overrides: Partial<PharmacySlipItem>
  ): PharmacySlipItem => ({
    pharmacy_slip_item_id: "PSI-1",
    pharmacy_slip_id: "PSL-1",
    display_order: 0,
    medicine_id: "MED-1",
    drug_name: "Trastuzumab",
    brand_name: "Herceptin",
    dosage_form: "Injection",
    patient_dose: "150 mg",
    dose: "120",
    dose_unit: "mg",
    quantity: 1,
    drug_role: "PRIMARY",
    route: "IV",
    frequency: null,
    duration: null,
    instructions: null,
    pharmacy_item_id: "PHM-120",
    ...overrides,
  });

  it("restores the brand, strength and override from a saved slip", () => {
    const [row] = applySavedSlip(
      [draft()],
      [
        savedItem({ quantity: 2 }),
        savedItem({ pharmacy_slip_item_id: "PSI-2", dose: "30", quantity: 1, pharmacy_item_id: "PHM-30" }),
      ]
    );

    expect(row.brand).toBe("Herceptin");
    expect(row.selectedDose).toBe("120");
    expect(row.quantityOverride).toBe("2");
    expect(row.extraQuantityOverride).toBe("");
    expect(row.pharmacyItemId).toBe("PHM-120");
  });

  it("ignores a saved quantity that equals the suggestion", () => {
    const [row] = applySavedSlip([draft()], [savedItem({ quantity: 1 })]);

    expect(row.quantityOverride).toBe("");
  });

  it("keeps a typed quantity when there is no patient dose to suggest one", () => {
    const [row] = applySavedSlip(
      [draft({ patientDose: "", patientDoseValue: null })],
      [savedItem({ quantity: 3 })]
    );

    expect(row.quantityOverride).toBe("3");
  });

  it("keeps the fresh row when there is no saved slip", () => {
    const [row] = applySavedSlip([draft()], []);

    expect(row.quantityOverride).toBe("");
  });
});

describe("buildSlipSourceRows", () => {
  const order = {
    chemotherapy_plan_items: [
      {
        chemotherapy_plan_item_id: "I-1",
        drug_sequence: 3,
        drug_role: "PRIMARY",
        medicine_id: "MED-1",
        protocol_dose: 150,
        protocol_dose_unit: "mg",
        calculated_dose: 150,
        calculated_dose_unit: "mg",
        medicine_master: { medicine_name: "Trastuzumab", generic_id: "GEN-1", dosage_form: "Injection" },
      },
      {
        chemotherapy_plan_item_id: "I-2",
        drug_sequence: 90,
        drug_role: "PREMEDICATION",
        medicine_id: "MED-2",
        protocol_dose: 8,
        protocol_dose_unit: "mg",
        medicine_master: { medicine_name: "Ondansetron", generic_id: "GEN-2", dosage_form: "Injection" },
      },
      {
        chemotherapy_plan_item_id: "I-3",
        drug_sequence: 110,
        drug_role: "DILUTION",
        medicine_id: "MED-3",
        medicine_master: { medicine_name: "Normal Saline" },
      },
    ],
  } as any;

  it("orders primary before premedication and drops dilution", () => {
    const rows = buildSlipSourceRows({ order, dischargeRows: [] });

    expect(rows.map((row) => row.role)).toEqual(["PRIMARY", "PREMEDICATION"]);
    expect(rows[0].patientDose).toBe("150 mg");
  });

  it("appends discharge rows last", () => {
    const rows = buildSlipSourceRows({
      order,
      dischargeRows: [
        {
          id: 1,
          medicineId: "MED-9",
          drugName: "Paracetamol",
          drugForm: "Tablet",
          genericId: "GEN-9",
          dosage: "500 mg",
          dosageUnit: "mg",
          frequency: "TDS",
          instruction: "After food",
          duration: "5 days",
        },
      ],
    });

    expect(rows.map((row) => row.role)).toEqual([
      "PRIMARY",
      "PREMEDICATION",
      "DISCHARGE",
    ]);
    expect(rows[2].patientDose).toBe("500 mg");
    expect(rows[2].genericId).toBe("GEN-9");
    expect(rows[2].drugForm).toBe("Tablet");
  });

  it("returns no rows when the order has not been saved", () => {
    expect(buildSlipSourceRows({ order: null, dischargeRows: [] })).toEqual([]);
  });
});
