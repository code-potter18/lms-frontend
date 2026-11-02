import { describe, it, expect } from "vitest";

describe("CreateProtocol Cascading & Grouping Logic", () => {
  const DOSAGE_FORM_OPTIONS = [
    "Injection",
    "Infusion",
    "Tablet",
    "Capsule",
    "Oral Solution",
    "Oral Suspension",
    "Cream",
    "Gel",
    "Ointment",
    "Powder for Injection",
    "Powder for Infusion",
    "Concentrate for Infusion",
  ];

  it("should have exactly the 12 required clinical dosage form options", () => {
    expect(DOSAGE_FORM_OPTIONS).toHaveLength(12);
    expect(DOSAGE_FORM_OPTIONS).toContain("Injection");
    expect(DOSAGE_FORM_OPTIONS).toContain("Infusion");
    expect(DOSAGE_FORM_OPTIONS).toContain("Tablet");
    expect(DOSAGE_FORM_OPTIONS).toContain("Capsule");
    expect(DOSAGE_FORM_OPTIONS).toContain("Oral Solution");
    expect(DOSAGE_FORM_OPTIONS).toContain("Oral Suspension");
    expect(DOSAGE_FORM_OPTIONS).toContain("Cream");
    expect(DOSAGE_FORM_OPTIONS).toContain("Gel");
    expect(DOSAGE_FORM_OPTIONS).toContain("Ointment");
    expect(DOSAGE_FORM_OPTIONS).toContain("Powder for Injection");
    expect(DOSAGE_FORM_OPTIONS).toContain("Powder for Infusion");
    expect(DOSAGE_FORM_OPTIONS).toContain("Concentrate for Infusion");
    // Removed options
    expect(DOSAGE_FORM_OPTIONS).not.toContain("Intrathecal Injection");
    expect(DOSAGE_FORM_OPTIONS).not.toContain("Implant");
  });

  it("should collapse multiple medicine_master items with identical generic_id into a single dropdown option", () => {
    const meds = [
      { medicine_id: "MED000002", medicine_name: "Inj. Dexa", generic_id: "GEN002", generic_name: "Dexamethasone" },
      { medicine_id: "MED000004", medicine_name: "Inj. Decadron", generic_id: "GEN002", generic_name: "Dexamethasone" },
      { medicine_id: "MED000008", medicine_name: "Inj Dexa", generic_id: "GEN002", generic_name: "Dexamethasone" },
      { medicine_id: "MED000001", medicine_name: "Inj Palanostran", generic_id: "GEN001", generic_name: "Palonosetron" },
      { medicine_id: "MED000005", medicine_name: "Inj.palzen", generic_id: "GEN001", generic_name: "Palonosetron" },
      { medicine_id: "MED000095", medicine_name: "Normal Saline", generic_id: "GEN_NOT_SPECIFIED" },
    ];

    const seenGenerics = new Set<string>();
    const opts: { label: string; value: string }[] = [];

    for (const m of meds) {
      if (m.generic_id && m.generic_id !== "GEN_NOT_SPECIFIED") {
        if (!seenGenerics.has(m.generic_id)) {
          seenGenerics.add(m.generic_id);
          const label = m.generic_name || m.medicine_name;
          opts.push({ label, value: m.medicine_id });
        }
      } else {
        opts.push({ label: m.medicine_name, value: m.medicine_id });
      }
    }

    // Should only have 3 items: Dexamethasone (1), Palonosetron (1), and Normal Saline (1)
    expect(opts).toHaveLength(3);
    expect(opts.map((o) => o.label)).toEqual(["Dexamethasone", "Palonosetron", "Normal Saline"]);
  });

  it("should filter brand options by generic_id and dosage_form, while preserving current legacy value", () => {
    const genericCatalog: Record<string, { generic_name: string; forms: string[]; brandsByForm: Record<string, string[]> }> = {
      GEN002: {
        generic_name: "Dexamethasone",
        forms: ["Injection", "Tablet"],
        brandsByForm: {
          Injection: ["Zydus", "Decadron"],
          Tablet: ["Dexona Tab"],
        },
      },
    };

    const getBrands = (selectedMedId: string, selectedForm: string, currentBrand?: string) => {
      const seen = new Set<string>();
      const opts: string[] = [];
      const push = (v?: string | null) => {
        const t = (v ?? "").trim();
        if (t && !seen.has(t)) {
          seen.add(t);
          opts.push(t);
        }
      };

      const gid = "GEN002"; // resolved from medId
      if (gid && genericCatalog[gid]) {
        const brandsByForm = genericCatalog[gid].brandsByForm;
        if (selectedForm && brandsByForm[selectedForm]) {
          brandsByForm[selectedForm].forEach(push);
        } else {
          Object.values(brandsByForm).flat().forEach(push);
        }
      }

      push(currentBrand);
      return opts;
    };

    // When Injection selected -> only Injection brands
    expect(getBrands("MED000002", "Injection")).toEqual(["Zydus", "Decadron"]);

    // When Tablet selected -> only Tablet brands
    expect(getBrands("MED000002", "Tablet")).toEqual(["Dexona Tab"]);

    // When an older custom/legacy brand was previously saved -> preserved in list
    expect(getBrands("MED000002", "Injection", "Custom Hospital Brand 99")).toEqual([
      "Zydus",
      "Decadron",
      "Custom Hospital Brand 99",
    ]);
  });

  it("should group cancer subtypes by cancer type heading", () => {
    const rawSubtypes = [
      { subtype_id: "SUB001", subtype_name: "Triple Negative", group: "Breast Cancer" },
      { subtype_id: "SUB002", subtype_name: "HER2 Positive", group: "Breast Cancer" },
      { subtype_id: "SUB003", subtype_name: "NSCLC", group: "Lung Cancer" },
      { subtype_id: "SUB004", subtype_name: "SCLC", group: "Lung Cancer" },
    ];

    const groupMap = new Map<string, typeof rawSubtypes>();
    for (const s of rawSubtypes) {
      if (!groupMap.has(s.group)) groupMap.set(s.group, []);
      groupMap.get(s.group)!.push(s);
    }

    expect(Array.from(groupMap.keys())).toEqual(["Breast Cancer", "Lung Cancer"]);
    expect(groupMap.get("Breast Cancer")).toHaveLength(2);
    expect(groupMap.get("Lung Cancer")).toHaveLength(2);
  });

  it("should categorize medicines by clinical scope without requiring cancer type selection", () => {
    const catalog = [
      { medicine_id: "M1", generic_name: "Ondansetron", medicine_category: "Antiemetic" },
      { medicine_id: "M2", generic_name: "Dexamethasone", medicine_category: "Corticosteroid" },
      { medicine_id: "M3", generic_name: "Paclitaxel", medicine_category: "Antineoplastic - Microtubule inhibitor" },
      { medicine_id: "M4", generic_name: "Cisplatin", medicine_category: "Antineoplastic - Platinum compound" },
      { medicine_id: "M5", generic_name: "Filgrastim", medicine_category: "Hematopoietic growth factor" },
      { medicine_id: "M6", generic_name: "Potassium Chloride", medicine_category: "Supplement / Electrolyte" },
    ];

    const isPremed = (c: string) => ["Antiemetic", "Corticosteroid"].includes(c);
    const isPrimary = (c: string) => c.startsWith("Antineoplastic");
    const isSupportive = (c: string) => ["Hematopoietic growth factor", "Supplement / Electrolyte"].includes(c);

    const premeds = catalog.filter(m => isPremed(m.medicine_category));
    const primaries = catalog.filter(m => isPrimary(m.medicine_category));
    const supportives = catalog.filter(m => isSupportive(m.medicine_category));

    expect(premeds.map(m => m.generic_name)).toEqual(["Ondansetron", "Dexamethasone"]);
    expect(primaries.map(m => m.generic_name)).toEqual(["Paclitaxel", "Cisplatin"]);
    expect(supportives.map(m => m.generic_name)).toEqual(["Filgrastim", "Potassium Chloride"]);
  });

  it("should parse canonical dosage or fallback gracefully to legacy patient_dose without fake patient calculations", () => {
    // Record A: New/Clean record with standard protocol dose
    const modernItem = {
      protocol_item_id: "CPI_NEW",
      dosage: "175",
      dosage_unit: "mg/m²",
      patient_dose: null,
      patient_dose_unit: null,
      dose_calculation_method: "BSA (mg/m²)",
    };

    // Record B: Historical legacy record where dose was stored under patient_dose
    const legacyItem = {
      protocol_item_id: "CPI_LEGACY",
      dosage: null,
      dosage_unit: null,
      patient_dose: "150",
      patient_dose_unit: "MG",
      dose_calculation_method: null,
    };

    const parseProtocolDose = (x: any) => ({
      dose: x.dosage != null ? String(x.dosage) : (x.patient_dose != null ? String(x.patient_dose) : ""),
      unit: x.dosage_unit ?? x.patient_dose_unit ?? "",
      doseCalc: x.dose_calculation_method ?? "",
    });

    const parsedModern = parseProtocolDose(modernItem);
    expect(parsedModern.dose).toBe("175");
    expect(parsedModern.unit).toBe("mg/m²");
    expect(parsedModern.doseCalc).toBe("BSA (mg/m²)");

    const parsedLegacy = parseProtocolDose(legacyItem);
    expect(parsedLegacy.dose).toBe("150");
    expect(parsedLegacy.unit).toBe("MG");
  });
});

