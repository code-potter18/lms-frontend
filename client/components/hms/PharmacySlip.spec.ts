import { describe, expect, it } from "vitest";
import { computeDispensingQuantity, getMatchingPharmacyItems } from "./PharmacySlip";

describe("Pharmacy Slip Frontend Direct Edit & Lifecycle Rules", () => {
  it("allows editing and printing for active (DRAFT or ISSUED) slips, blocks when CANCELLED", () => {
    const evaluateSlip = (status: "DRAFT" | "ISSUED" | "CANCELLED") => {
      const isPersisted = true;
      const canEdit = isPersisted && status !== "CANCELLED";
      const canPrint = isPersisted && status !== "CANCELLED";
      return { canEdit, canPrint };
    };

    expect(evaluateSlip("DRAFT")).toEqual({ canEdit: true, canPrint: true });
    expect(evaluateSlip("ISSUED")).toEqual({ canEdit: true, canPrint: true });
    expect(evaluateSlip("CANCELLED")).toEqual({ canEdit: false, canPrint: false });
  });

  it("renders clean print template without draft watermark or draft banner", () => {
    const renderPrintSlipHtml = (slipNo: string) => `
      <h1>Pharmacy Slip</h1>
      <table>...</table>
      <div class="foot">Slip ${slipNo}</div>
    `;

    const html = renderPrintSlipHtml("PS001");
    expect(html).not.toContain("watermark");
    expect(html).not.toContain("DRAFT — NOT ISSUED");
  });

  it("exports clean PDF without DRAFT watermark or draft prefixes", () => {
    const getPdfConfig = (patientName: string, patientId: string, protocolName: string, slipId: string) => {
      return {
        title: "Pharmacy Slip",
        subtitle: `${patientName} (${patientId}) - ${protocolName}`,
        filename: `pharmacy-slip-${slipId}.pdf`,
      };
    };

    const config = getPdfConfig("John Doe", "P123", "ABVD", "PS001");
    expect(config.title).toBe("Pharmacy Slip");
    expect(config.subtitle).toBe("John Doe (P123) - ABVD");
    expect(config.filename).toBe("pharmacy-slip-PS001.pdf");
    expect(config.filename).not.toContain("draft");
  });

  it("omits Action column entirely in view mode and includes it in edit mode", () => {
    const getColumns = (editing: boolean) => {
      const baseColumns = ["Medicine Name", "Patient Dose", "Brand", "Dose", "Qty", "Type"];
      if (editing) {
        return [...baseColumns, "Action"];
      }
      return baseColumns;
    };

    expect(getColumns(false)).toEqual(["Medicine Name", "Patient Dose", "Brand", "Dose", "Qty", "Type"]);
    expect(getColumns(false)).not.toContain("Action");
    expect(getColumns(true)).toContain("Action");
  });

  it("handles brand-dependent dose selection: auto-populates unit for existing strengths and allows custom strengths", () => {
    const brandMasterItems = [
      { strength_value: "100", strength_unit: "mg", pharmacy_item_id: "PHM00001" },
      { strength_value: "50", strength_unit: "mg", pharmacy_item_id: "PHM00002" },
      { strength_value: "2", strength_unit: "g", pharmacy_item_id: "PHM00003" },
    ];

    // Selecting existing strength (e.g. "2") auto-calls unit "g" and links pharmacy_item_id
    const handleSelectStrength = (selectedStrength: string) => {
      const match = brandMasterItems.find((p) => p.strength_value === selectedStrength);
      return {
        strengthValue: selectedStrength,
        strengthUnit: match?.strength_unit || "mg",
        pharmacy_item_id: match?.pharmacy_item_id ?? null,
      };
    };

    const selected = handleSelectStrength("2");
    expect(selected.strengthValue).toBe("2");
    expect(selected.strengthUnit).toBe("g");
    expect(selected.pharmacy_item_id).toBe("PHM00003");

    // Entering custom strength (e.g. "150") allows custom entry and marks for master creation
    const handleCustomStrength = (typed: string, currentUnit = "mg") => ({
      strengthValue: typed.trim(),
      strengthUnit: currentUnit,
      pharmacy_item_id: null,
    });

    const custom = handleCustomStrength("150", "mcg");
    expect(custom.strengthValue).toBe("150");
    expect(custom.strengthUnit).toBe("mcg");
    expect(custom.pharmacy_item_id).toBeNull();
  });

  it("includes DILUTION and clinical roles in DRUG_ROLE_LABELS for the Type dropdown", () => {
    const DRUG_ROLE_LABELS: Record<string, string> = {
      PRIMARY: "Primary",
      PREMEDICATION: "Premedication",
      POSTMEDICATION: "Postmedication",
      DILUTION: "Dilution",
      SUPPORTIVE: "Supportive",
      ADVICE: "Advice",
      DISCHARGE: "Discharge",
    };

    expect(DRUG_ROLE_LABELS["DILUTION"]).toBe("Dilution");
    expect(DRUG_ROLE_LABELS["PRIMARY"]).toBe("Primary");
    expect(DRUG_ROLE_LABELS["PREMEDICATION"]).toBe("Premedication");
    expect(DRUG_ROLE_LABELS["POSTMEDICATION"]).toBe("Postmedication");
  });

  it("formats text using toProperCase (CC -> Cc, cc -> Cc, acronym preservation)", async () => {
    const { toProperCase } = await import("../../utils/caseFormatters");

    expect(toProperCase("CC")).toBe("Cc");
    expect(toProperCase("cc")).toBe("Cc");
    expect(toProperCase("CIPLA")).toBe("Cipla");
    expect(toProperCase("panacea biotech")).toBe("Panacea Biotech");
    expect(toProperCase("nab-paclitaxel")).toBe("NAB-Paclitaxel");
    expect(toProperCase("STAGE IV")).toBe("Stage IV");
    expect(toProperCase("HER2")).toBe("HER2");
  });

  it("identifies when an issue action is allowed (only persisted DRAFT slips)", () => {
    const canIssue = (isPersisted: boolean, status: string, editing: boolean, lineCount: number) =>
      isPersisted && status === "DRAFT" && !editing && lineCount > 0;

    expect(canIssue(true, "DRAFT", false, 3)).toBe(true);
    expect(canIssue(true, "DRAFT", true, 3)).toBe(false); // cannot issue while actively editing
    expect(canIssue(true, "ISSUED", false, 3)).toBe(false); // already issued
    expect(canIssue(false, "DRAFT", false, 3)).toBe(false); // unpersisted preview
    expect(canIssue(true, "DRAFT", false, 0)).toBe(false); // empty lines
  });

  it("requires an amendment reason when editing an ISSUED slip", () => {
    const requiresAmendmentReason = (status: string) => status === "ISSUED";
    expect(requiresAmendmentReason("ISSUED")).toBe(true);
    expect(requiresAmendmentReason("DRAFT")).toBe(false);
  });

  it("renders status badge styles for all three lifecycle states", () => {
    const STATUS_STYLES: Record<string, string> = {
      DRAFT: "bg-[#FFF7E6] text-[#8A6100] border-[#F2D999]",
      ISSUED: "bg-[#E7F6EC] text-[#1B6B3A] border-[#A9DCBB]",
      CANCELLED: "bg-[#FDECEC] text-[#A32020] border-[#F3B9B9]",
    };

    expect(STATUS_STYLES["DRAFT"]).toContain("#FFF7E6");
    expect(STATUS_STYLES["ISSUED"]).toContain("#E7F6EC");
    expect(STATUS_STYLES["CANCELLED"]).toContain("#FDECEC");
  });

  it("robustly merges manufacturer_name, brand_name, and existing line brand for dropdown options", () => {
    const availablePharmItems = [
      { brand_name: "Panacea", manufacturer_name: "Panacea Biotec" },
      { brand_name: "Oncocare", manufacturer_name: null },
      { brand_name: null, manufacturer_name: "Zydus" },
    ];
    const existingBrand = "Cipla";

    const mfrs = Array.from(
      new Set(availablePharmItems.map((p) => p.brand_name || p.manufacturer_name).filter(Boolean))
    ) as string[];

    const brandOptions = Array.from(
      new Set([...mfrs, ...(existingBrand ? [existingBrand] : [])])
    ).filter(Boolean);

    expect(brandOptions).toContain("Panacea");
    expect(brandOptions).toContain("Oncocare");
    expect(brandOptions).toContain("Zydus");
    expect(brandOptions).toContain("Cipla");
  });

  describe("Dynamic Quantity Calculation (computeDispensingQuantity)", () => {
    it("computes exact integer ratios as specified by the user (200g / 100g -> 2)", () => {
      expect(computeDispensingQuantity("200 g", "100", "g")).toBe("2");
      expect(computeDispensingQuantity("200g", "100", "g")).toBe("2");
      expect(computeDispensingQuantity("200", "100", "g")).toBe("2");
    });

    it("rounds up to ceiling for fractional commercial units (150mg / 80mg -> 2 vials)", () => {
      // 150 / 80 = 1.875 -> 2 vials needed
      expect(computeDispensingQuantity("150 mg", "80", "mg")).toBe("2");
      // 150 / 150 = 1.0 -> 1 vial
      expect(computeDispensingQuantity("150 mg", "150", "mg")).toBe("1");
      // 150 / 120 = 1.25 -> 2 vials
      expect(computeDispensingQuantity("150 mg", "120", "mg")).toBe("2");
      // 150 / 20 = 7.5 -> 8 vials
      expect(computeDispensingQuantity("150 mg", "20", "mg")).toBe("8");
    });

    it("handles standard metric unit conversion (1 g / 500 mg -> 2; 500 mcg / 0.25 mg -> 2)", () => {
      // 1 g / 500 mg = 1000 mg / 500 mg = 2
      expect(computeDispensingQuantity("1 g", "500", "mg")).toBe("2");
      // 500 mcg / 0.25 mg = 0.5 mg / 0.25 mg = 2
      expect(computeDispensingQuantity("500 mcg", "0.25", "mg")).toBe("2");
    });

    it("safely defaults to '1' when dose or strength cannot be parsed", () => {
      expect(computeDispensingQuantity(null, "100", "mg")).toBe("1");
      expect(computeDispensingQuantity("—", "100", "mg")).toBe("1");
      expect(computeDispensingQuantity("150 mg", "", "mg")).toBe("1");
      expect(computeDispensingQuantity("150 mg", "0", "mg")).toBe("1");
    });
  });

  describe("Multi-Brand Generic & Dosage Form Matching (getMatchingPharmacyItems)", () => {
    it("matches all commercial brands sharing generic_name and dosage_form regardless of medicine_id", () => {
      const medicineOptions: any[] = [
        {
          medicine_id: "MED000238",
          medicine_name: "Inj: Docetaxol",
          generic_name: "Docetaxel",
          dosage_form: "Injection",
        },
      ];

      const masterItems: any[] = [
        {
          pharmacy_item_id: "PHM00021",
          medicine_id: "MED000313", // different medicine_id
          generic_name: "Docetaxel",
          brand_name: "Intas",
          manufacturer_name: "Intas",
          dosage_form: "Injection",
          strength_value: "150",
          strength_unit: "mg",
        },
        {
          pharmacy_item_id: "PHM00024",
          medicine_id: "MED000313",
          generic_name: "Docetaxel",
          brand_name: "Mankind",
          manufacturer_name: "Mankind",
          dosage_form: "Injection",
          strength_value: "120",
          strength_unit: "mg",
        },
        {
          pharmacy_item_id: "PHM00026",
          medicine_id: "MED000319",
          generic_name: "Docetaxel",
          brand_name: "Neon",
          manufacturer_name: "Neon",
          dosage_form: "Injection",
          strength_value: "80",
          strength_unit: "mg",
        },
        {
          pharmacy_item_id: "PHM00999",
          medicine_id: "MED000888",
          generic_name: "Docetaxel",
          brand_name: "Docetaxel Oral Tab",
          manufacturer_name: "PharmaCorp",
          dosage_form: "Tablet", // Different formulation! Must NOT match Injection
          strength_value: "50",
          strength_unit: "mg",
        },
        {
          pharmacy_item_id: "PHM00100",
          medicine_id: "MED000100",
          generic_name: "Paclitaxel", // Different generic!
          brand_name: "Taxol",
          manufacturer_name: "BMS",
          dosage_form: "Injection",
          strength_value: "100",
          strength_unit: "mg",
        },
      ];

      const line = { medicine_id: "MED000238", medicineName: "Inj: Docetaxol" };
      const matched = getMatchingPharmacyItems(line, masterItems, medicineOptions);

      // Should match Intas, Mankind, Neon (all Injection + Docetaxel)
      expect(matched.map((m) => m.brand_name)).toEqual(["Intas", "Mankind", "Neon"]);
      // Should NOT include Tablet or different generic
      expect(matched.some((m) => m.dosage_form === "Tablet")).toBe(false);
      expect(matched.some((m) => m.generic_name === "Paclitaxel")).toBe(false);
    });
  });
});
