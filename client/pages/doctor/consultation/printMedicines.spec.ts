import { describe, expect, it } from "vitest";
import {
  buildAdministrationPhrase,
  buildMedicineSentence,
  groupMedicinesByType,
  humanizeAdministrationDetail,
  medicineWithForm,
  protocolDoseText,
  type PrintableMedicine,
} from "./printMedicines";

const medicine = (
  overrides: Partial<PrintableMedicine> = {}
): PrintableMedicine => ({
  drug_role: "PRIMARY",
  medicine_master: {
    medicine_name: "Pertuzumab",
    generic_name: "Pertuzumab",
    dosage_form: "Injection",
    unit: "mg",
  },
  ...overrides,
});

describe("medicineWithForm", () => {
  it("adds one form prefix", () => {
    expect(
      medicineWithForm(
        medicine({ medicine_master: { medicine_name: "Pertuzumab", dosage_form: "Injection" } })
      )
    ).toBe("Inj. Pertuzumab");
  });

  it("collapses a form already in the name", () => {
    expect(
      medicineWithForm(
        medicine({ medicine_master: { medicine_name: "Inj Pertuzumab", dosage_form: "Injection" } })
      )
    ).toBe("Inj. Pertuzumab");
  });

  it("collapses a repeated form prefix", () => {
    expect(
      medicineWithForm(
        medicine({ medicine_master: { medicine_name: "Inj. Inj Pertuzumab", dosage_form: "Injection" } })
      )
    ).toBe("Inj. Pertuzumab");
  });

  it("does not invent Inj. when the form is missing", () => {
    expect(
      medicineWithForm(
        medicine({ medicine_master: { medicine_name: "Pertuzumab" } })
      )
    ).toBe("Pertuzumab");
  });

  it("abbreviates a tablet", () => {
    expect(
      medicineWithForm(
        medicine({
          drug_role: "SUPPORTIVE",
          medicine_master: { medicine_name: "Paracetamol", dosage_form: "Tablet" },
        })
      )
    ).toBe("Tab. Paracetamol");
  });
});

describe("protocolDoseText", () => {
  it("falls back to the calculated dose unit", () => {
    expect(
      protocolDoseText(
        medicine({
          protocol_dose: 40,
          protocol_dose_unit: null,
          calculated_dose_unit: "mg",
        })
      )
    ).toBe("40 mg");
  });
});

describe("humanizeAdministrationDetail", () => {
  it("normalises units and the leading preposition", () => {
    expect(humanizeAdministrationDetail("IN 250 ML NS OVER 60 MIN")).toBe(
      "in 250 mL NS over 60 minutes"
    );
  });

  it("uses singular units", () => {
    expect(humanizeAdministrationDetail("OVER 1 HR")).toBe("over 1 hour");
  });
});

describe("buildAdministrationPhrase", () => {
  it("flows the admin detail after the route", () => {
    expect(
      buildAdministrationPhrase(
        medicine({
          administration_route: "IV",
          administration_detail: "IN 250 ML NS OVER 60 MIN",
        })
      )
    ).toBe("given IV in 250 mL NS over 60 minutes");
  });

  it("builds the phrase from structured fields when there is no detail", () => {
    expect(
      buildAdministrationPhrase(
        medicine({
          administration_route: "IV",
          dilution_volume: "250",
          dilution_solution: "NS",
          infusion_duration_minutes: 60,
        })
      )
    ).toBe("given IV in 250 mL NS over 1 hour");
  });

  it("does not repeat structured values already in the detail", () => {
    const phrase = buildAdministrationPhrase(
      medicine({
        administration_route: "IV",
        dilution_volume: "250",
        dilution_solution: "NS",
        infusion_duration_minutes: 60,
        administration_detail: "IN 250 ML NS OVER 60 MIN",
      })
    );
    expect(phrase).toBe("given IV in 250 mL NS over 60 minutes");
    expect(phrase.match(/250 mL/g)).toHaveLength(1);
    expect(phrase.match(/60 minutes/g)).toHaveLength(1);
  });

  it("adds a verb when only the detail is present", () => {
    expect(
      buildAdministrationPhrase(
        medicine({ administration_detail: "IN 250 ML NS OVER 60 MIN" })
      )
    ).toBe("given in 250 mL NS over 60 minutes");
  });
});

describe("buildMedicineSentence", () => {
  it("uses the patient dose first and the protocol dose in brackets", () => {
    expect(
      buildMedicineSentence(
        medicine({
          protocol_dose: 40,
          protocol_dose_unit: null,
          calculated_dose: 79.6,
          calculated_dose_unit: "mg",
          administration_route: "IV",
          administration_detail: "IN 250 ML NS OVER 60 MIN",
        })
      )
    ).toBe(
      "Inj. Pertuzumab - patient dose 79.6 mg (protocol dose 40 mg), given IV in 250 mL NS over 60 minutes"
    );
  });

  it("does not put the medicine type in the sentence", () => {
    const sentence = buildMedicineSentence(
      medicine({
        drug_role: "PRIMARY",
        protocol_dose: 40,
        protocol_dose_unit: "mg",
        administration_route: "IV",
      })
    );
    expect(sentence).not.toContain("Chemotherapy");
    expect(sentence).not.toContain("(");
  });

  it("uses a plain dose for non-chemotherapy medicines", () => {
    expect(
      buildMedicineSentence(
        medicine({
          drug_role: "PREMEDICATION",
          medicine_master: {
            medicine_name: "Ondansetron",
            dosage_form: "Injection",
          },
          protocol_dose: 8,
          protocol_dose_unit: "mg",
          administration_route: "IV",
          frequency: "once",
        })
      )
    ).toBe("Inj. Ondansetron - dose 8 mg, given IV, once");
  });

  it("falls back to the patient dose when the protocol dose is missing", () => {
    expect(
      buildMedicineSentence(
        medicine({
          drug_role: "SUPPORTIVE",
          medicine_master: {
            medicine_name: "Mesna",
            dosage_form: "Injection",
          },
          calculated_dose: 400,
          calculated_dose_unit: "mg",
        })
      )
    ).toBe("Inj. Mesna - dose 400 mg");
  });
});

describe("groupMedicinesByType", () => {
  const sections = [
    { role: "PREMEDICATION", label: "Premedication" },
    { role: "PRIMARY", label: "Chemotherapy" },
    { role: "SUPPORTIVE", label: "Supportive" },
    { role: "POSTMEDICATION", label: "Post-Medication" },
  ];

  it("returns the clinical type order and skips empty groups", () => {
    const groups = groupMedicinesByType(
      [
        { drug_role: "SUPPORTIVE", drug_sequence: 3 },
        { drug_role: "PRIMARY", drug_sequence: 2 },
        { drug_role: "PREMEDICATION", drug_sequence: 1 },
      ],
      sections
    );
    expect(groups.map((group) => group.label)).toEqual([
      "Premedication",
      "Chemotherapy",
      "Supportive",
    ]);
  });

  it("keeps the drug_sequence order inside a group", () => {
    const groups = groupMedicinesByType(
      [
        { drug_role: "PRIMARY", drug_sequence: 4 },
        { drug_role: "PRIMARY", drug_sequence: 2 },
      ],
      sections
    );
    expect(groups[0].items.map((item) => item.drug_sequence)).toEqual([2, 4]);
  });

  it("puts an unknown role under Other Medicines", () => {
    const groups = groupMedicinesByType(
      [{ drug_role: "DISCHARGE", drug_sequence: 1 }],
      sections
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Other Medicines");
  });
});
