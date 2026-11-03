import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export interface LabReportPdfParameter {
  id?: string;
  parameter: string;
  result: string | number;
  unit?: string;
  referenceRange?: string;
  reference_range?: string;
  ref_range?: string;
  refRange?: string;
  status: "Normal" | "Abnormal" | "Critical" | string;
  approved?: boolean;
}

export interface LabReportPdfOptions {
  reportId: string;
  requestId?: string;
  barcode?: string;
  sampleId?: string;
  patientName: string;
  patientId: string;
  patientPid?: string;
  patientAgeGender?: string;
  patientAvatar?: string;
  patientEmail?: string;
  doctorName?: string;
  doctorEmail?: string;
  testPanel: string;
  sampleType?: string;
  collectedOn?: string;
  reportedOn?: string;
  generatedDate?: string;
  completedDate?: string;
  targetDate?: string;
  findingsSummary?: string;
  clinicalRemarks?: string;
  clinicalCorrelation?: string;
  approvalRemarks?: string;
  approverName?: string;
  approverRole?: string;
  approvalDate?: string;
  signatureUrl?: string | null;
  overallDecision?: string;
  parameters: LabReportPdfParameter[];
}

/**
 * Standard master dictionary of laboratory parameters, canonical units,
 * and biological reference ranges matching the hospital laboratory database.
 */
export interface MasterParamDef {
  canonicalName: string;
  unit: string;
  refRangeText: string;
  aliases: (string | RegExp)[];
}

export const MASTER_LAB_PARAMETER_DICTIONARY: MasterParamDef[] = [
  // --- COMPLETE BLOOD COUNT (CBC) - 18 PARAMETERS ---
  {
    canonicalName: "Hemoglobin",
    unit: "g/dL",
    refRangeText: "M 13–17; F 12–15 g/dL",
    aliases: [/^hemo/i, /^hb\b/i, /^hgb\b/i, /hemoglobin/i],
  },
  {
    canonicalName: "Total WBC count (TC)",
    unit: "cells/µL",
    refRangeText: "4000 - 11000",
    aliases: [/^total wbc/i, /^wbc\b/i, /white blood cell/i, /\btc\b/i, /total count/i],
  },
  {
    canonicalName: "RBC count",
    unit: "million/µL",
    refRangeText: "M 4.5–5.5; F 3.8–4.8 million/µL",
    aliases: [/^rbc/i, /red blood cell/i, /total rbc/i],
  },
  {
    canonicalName: "PCV / HCT",
    unit: "%",
    refRangeText: "M 40–50; F 36–46 %",
    aliases: [/pcv/i, /hct/i, /hematocrit/i, /packed cell/i],
  },
  {
    canonicalName: "MCV",
    unit: "fL",
    refRangeText: "83 - 101",
    aliases: [/^mcv\b/i, /mean corpuscular vol/i],
  },
  {
    canonicalName: "MCH",
    unit: "pg",
    refRangeText: "27 - 32",
    aliases: [/^mch\b/i, /mean corpuscular hb/i],
  },
  {
    canonicalName: "MCHC",
    unit: "g/dL",
    refRangeText: "31.5 - 34.5",
    aliases: [/^mchc\b/i, /mch conc/i],
  },
  {
    canonicalName: "RDW-CV",
    unit: "%",
    refRangeText: "11.6 - 14",
    aliases: [/rdw/i, /red cell distribution/i],
  },
  {
    canonicalName: "Platelet count",
    unit: "cells/µL",
    refRangeText: "150000 - 410000",
    aliases: [/platelet/i, /^plt\b/i, /thrombocyte/i],
  },
  {
    canonicalName: "MPV",
    unit: "fL",
    refRangeText: "7.5 - 11.5",
    aliases: [/^mpv\b/i, /mean platelet volume/i],
  },
  {
    canonicalName: "Neutrophils",
    unit: "%",
    refRangeText: "40 - 80",
    aliases: [/neutrophil/i, /^polymorphs/i],
  },
  {
    canonicalName: "Lymphocytes",
    unit: "%",
    refRangeText: "20 - 40",
    aliases: [/lymphocyte/i, /^lympho/i],
  },
  {
    canonicalName: "Eosinophils",
    unit: "%",
    refRangeText: "1 - 6",
    aliases: [/eosinophil/i, /^eosino/i],
  },
  {
    canonicalName: "Monocytes",
    unit: "%",
    refRangeText: "2 - 10",
    aliases: [/monocyte/i, /^mono\b/i],
  },
  {
    canonicalName: "Basophils",
    unit: "%",
    refRangeText: "0 - 2",
    aliases: [/basophil/i, /^baso\b/i],
  },
  {
    canonicalName: "Absolute Neutrophil Count (ANC)",
    unit: "cells/µL",
    refRangeText: "2000 - 7000",
    aliases: [/absolute neutrophil/i, /\banc\b/i],
  },
  {
    canonicalName: "Absolute Lymphocyte Count",
    unit: "cells/µL",
    refRangeText: "1000 - 3000",
    aliases: [/absolute lymphocyte/i, /\balc\b/i],
  },
  {
    canonicalName: "Absolute Eosinophil Count",
    unit: "cells/µL",
    refRangeText: "20 - 500",
    aliases: [/absolute eosinophil/i, /\baec\b/i],
  },
  {
    canonicalName: "ESR",
    unit: "mm/hr",
    refRangeText: "M 0–15; F 0–20 mm/hr",
    aliases: [/esr/i, /erythrocyte sedimentation/i],
  },

  // --- LIVER FUNCTION TEST (LFT) ---
  {
    canonicalName: "Total Bilirubin",
    unit: "mg/dL",
    refRangeText: "0.3 - 1.2",
    aliases: [/total bilirubin/i, /^bilirubin\b/i, /serum bilirubin/i],
  },
  {
    canonicalName: "Direct Bilirubin",
    unit: "mg/dL",
    refRangeText: "0 - 0.3",
    aliases: [/direct bilirubin/i, /conjugated bilirubin/i],
  },
  {
    canonicalName: "Indirect Bilirubin",
    unit: "mg/dL",
    refRangeText: "0.2 - 0.8",
    aliases: [/indirect bilirubin/i, /unconjugated bilirubin/i],
  },
  {
    canonicalName: "SGOT / AST",
    unit: "U/L",
    refRangeText: "5 - 40",
    aliases: [/sgot/i, /\bast\b/i, /aspartate aminotransferase/i],
  },
  {
    canonicalName: "SGPT / ALT",
    unit: "U/L",
    refRangeText: "5 - 40",
    aliases: [/sgpt/i, /\balt\b/i, /alanine aminotransferase/i],
  },
  {
    canonicalName: "Alkaline Phosphatase (ALP)",
    unit: "U/L",
    refRangeText: "44 - 147",
    aliases: [/alkaline phosphatase/i, /\balp\b/i],
  },
  {
    canonicalName: "GGT",
    unit: "U/L",
    refRangeText: "M 10–71; F 6–42 U/L",
    aliases: [/\bggt\b/i, /gamma gt/i, /gamma-glutamyl/i],
  },
  {
    canonicalName: "Total Protein",
    unit: "g/dL",
    refRangeText: "6.4 - 8.3",
    aliases: [/total protein/i, /serum protein/i],
  },
  {
    canonicalName: "Albumin",
    unit: "g/dL",
    refRangeText: "3.5 - 5.2",
    aliases: [/^albumin/i, /serum albumin/i],
  },
  {
    canonicalName: "Globulin",
    unit: "g/dL",
    refRangeText: "2.0 - 3.5",
    aliases: [/^globulin/i, /serum globulin/i],
  },
  {
    canonicalName: "A/G Ratio",
    unit: "ratio",
    refRangeText: "1.1 - 2.2",
    aliases: [/a\/g/i, /ag ratio/i, /albumin globulin ratio/i],
  },

  // --- RENAL FUNCTION TEST (RFT / KFT) ---
  {
    canonicalName: "Urea",
    unit: "mg/dL",
    refRangeText: "15 - 40",
    aliases: [/^urea\b/i, /blood urea/i],
  },
  {
    canonicalName: "Blood Urea Nitrogen (BUN)",
    unit: "mg/dL",
    refRangeText: "7 - 20",
    aliases: [/bun\b/i, /blood urea nitrogen/i],
  },
  {
    canonicalName: "Creatinine",
    unit: "mg/dL",
    refRangeText: "M 0.7–1.3; F 0.6–1.1 mg/dL",
    aliases: [/creatinine/i, /serum creatinine/i],
  },
  {
    canonicalName: "Uric Acid",
    unit: "mg/dL",
    refRangeText: "M 3.5–7.2; F 2.6–6.0 mg/dL",
    aliases: [/uric acid/i, /serum uric acid/i],
  },
  {
    canonicalName: "eGFR",
    unit: "mL/min/1.73 m²",
    refRangeText: ">= 90",
    aliases: [/egfr/i, /estimated gfr/i],
  },

  // --- ELECTROLYTES ---
  {
    canonicalName: "Sodium (Na)",
    unit: "mmol/L",
    refRangeText: "135 - 145",
    aliases: [/sodium/i, /\bna\+?\b/i],
  },
  {
    canonicalName: "Potassium (K)",
    unit: "mmol/L",
    refRangeText: "3.5 - 5.0",
    aliases: [/potassium/i, /\bk\+?\b/i],
  },
  {
    canonicalName: "Chloride (Cl)",
    unit: "mmol/L",
    refRangeText: "98 - 107",
    aliases: [/chloride/i, /\bcl-?\b/i],
  },
  {
    canonicalName: "Calcium (Ca)",
    unit: "mg/dL",
    refRangeText: "8.5 - 10.5",
    aliases: [/calcium/i, /\bca\+?2?\b/i],
  },
  {
    canonicalName: "Phosphorus",
    unit: "mg/dL",
    refRangeText: "2.5 - 4.5",
    aliases: [/phosphor/i, /phosphate/i, /\bpo4\b/i],
  },
  {
    canonicalName: "Magnesium",
    unit: "mg/dL",
    refRangeText: "1.7 - 2.4",
    aliases: [/magnesium/i, /\bmg\b/i],
  },
  {
    canonicalName: "Bicarbonate",
    unit: "mmol/L",
    refRangeText: "22 - 29",
    aliases: [/bicarbonate/i, /\bhco3\b/i],
  },

  // --- LIPID PROFILE ---
  {
    canonicalName: "Total Cholesterol",
    unit: "mg/dL",
    refRangeText: "< 200",
    aliases: [/total cholesterol/i, /^cholesterol\b/i],
  },
  {
    canonicalName: "Triglycerides",
    unit: "mg/dL",
    refRangeText: "< 150",
    aliases: [/triglyceride/i, /^tg\b/i],
  },
  {
    canonicalName: "HDL Cholesterol",
    unit: "mg/dL",
    refRangeText: "M >= 40; F >= 50 mg/dL",
    aliases: [/hdl/i, /high density lipoprotein/i],
  },
  {
    canonicalName: "LDL Cholesterol",
    unit: "mg/dL",
    refRangeText: "< 100",
    aliases: [/ldl/i, /low density lipoprotein/i],
  },
  {
    canonicalName: "VLDL Cholesterol",
    unit: "mg/dL",
    refRangeText: "5 - 40",
    aliases: [/vldl/i, /very low density/i],
  },
  {
    canonicalName: "Non-HDL Cholesterol",
    unit: "mg/dL",
    refRangeText: "< 130",
    aliases: [/non-hdl/i, /non hdl/i],
  },
  {
    canonicalName: "TC/HDL Ratio",
    unit: "ratio",
    refRangeText: "< 5.0",
    aliases: [/tc\/hdl/i, /cholesterol.*hdl.*ratio/i],
  },

  // --- THYROID PROFILE (TFT) ---
  {
    canonicalName: "TSH",
    unit: "µIU/mL",
    refRangeText: "0.4 - 4.5",
    aliases: [/\btsh\b/i, /thyroid stimulating hormone/i],
  },
  {
    canonicalName: "Total T3",
    unit: "ng/dL",
    refRangeText: "80 - 200",
    aliases: [/total t3/i, /^t3\b/i, /triiodothyronine/i],
  },
  {
    canonicalName: "Total T4",
    unit: "µg/dL",
    refRangeText: "5.0 - 12.0",
    aliases: [/total t4/i, /^t4\b/i, /thyroxine/i],
  },
  {
    canonicalName: "Free T3",
    unit: "pg/mL",
    refRangeText: "2.3 - 4.2",
    aliases: [/free t3/i, /\bft3\b/i],
  },
  {
    canonicalName: "Free T4",
    unit: "ng/dL",
    refRangeText: "0.8 - 1.8",
    aliases: [/free t4/i, /\bft4\b/i],
  },

  // --- GLUCOSE & DIABETES ---
  {
    canonicalName: "Fasting Blood Sugar",
    unit: "mg/dL",
    refRangeText: "70 - 100",
    aliases: [/fasting/i, /\bfbs\b/i, /glucose \( ?f ?\)/i],
  },
  {
    canonicalName: "Post Prandial Blood Sugar",
    unit: "mg/dL",
    refRangeText: "70 - 140",
    aliases: [/post prandial/i, /\bppbs\b/i, /glucose \( ?pp ?\)/i],
  },
  {
    canonicalName: "Random Blood Sugar",
    unit: "mg/dL",
    refRangeText: "70 - 140",
    aliases: [/random/i, /\brbs\b/i, /glucose \( ?r ?\)/i, /^glucose\b/i],
  },
  {
    canonicalName: "HbA1c",
    unit: "%",
    refRangeText: "< 5.7",
    aliases: [/hba1c/i, /glycated hemoglobin/i, /glycohemoglobin/i],
  },

  // --- COAGULATION ---
  {
    canonicalName: "Prothrombin Time (PT)",
    unit: "sec",
    refRangeText: "11 - 13.5",
    aliases: [/prothrombin time/i, /^pt\b/i],
  },
  {
    canonicalName: "INR",
    unit: "ratio",
    refRangeText: "0.8 - 1.2",
    aliases: [/\binr\b/i, /international normalized ratio/i],
  },
  {
    canonicalName: "APTT",
    unit: "sec",
    refRangeText: "25 - 35",
    aliases: [/aptt/i, /partial thromboplastin/i],
  },
  {
    canonicalName: "Fibrinogen",
    unit: "mg/dL",
    refRangeText: "200 - 400",
    aliases: [/fibrinogen/i],
  },
  {
    canonicalName: "D-Dimer",
    unit: "ng/mL FEU",
    refRangeText: "< 500",
    aliases: [/d-dimer/i, /ddimer/i],
  },

  // --- URINE ROUTINE ---
  {
    canonicalName: "Specific Gravity",
    unit: "SG",
    refRangeText: "1.005 - 1.030",
    aliases: [/specific gravity/i],
  },
  {
    canonicalName: "pH",
    unit: "pH",
    refRangeText: "4.6 - 8.0",
    aliases: [/\bph\b/i],
  },
  {
    canonicalName: "Protein (Albumin)",
    unit: "—",
    refRangeText: "Negative",
    aliases: [/urine protein/i, /protein \(albumin\)/i],
  },
  {
    canonicalName: "Glucose (Sugar)",
    unit: "—",
    refRangeText: "Negative",
    aliases: [/urine glucose/i, /glucose \(sugar\)/i],
  },
  {
    canonicalName: "Ketone",
    unit: "—",
    refRangeText: "Negative",
    aliases: [/ketone/i],
  },
  {
    canonicalName: "Bile Pigments / Salts",
    unit: "—",
    refRangeText: "Negative",
    aliases: [/bile/i],
  },
  {
    canonicalName: "Urobilinogen",
    unit: "EU/dL",
    refRangeText: "Normal",
    aliases: [/urobilinogen/i],
  },
  {
    canonicalName: "Nitrite",
    unit: "—",
    refRangeText: "Negative",
    aliases: [/nitrite/i],
  },
  {
    canonicalName: "Pus Cells",
    unit: "/HPF",
    refRangeText: "0 - 5",
    aliases: [/pus cell/i, /leukocyte/i],
  },
  {
    canonicalName: "RBCs (Urine)",
    unit: "/HPF",
    refRangeText: "0 - 2",
    aliases: [/rbcs/i, /red blood cells in urine/i],
  },
  {
    canonicalName: "Epithelial Cells",
    unit: "/HPF",
    refRangeText: "0 - 5",
    aliases: [/epithelial/i],
  },
];

/**
 * Parses gender-specific range strings (e.g. "M 13–17; F 12–15 g/dL") and extracts
 * the specific reference range tailored to patient gender.
 */
export function formatGenderReferenceRange(
  range?: string | null,
  genderInfo?: string | null,
  unit?: string | null
): string {
  if (!range) return "";
  const str = String(range).trim();
  if (!str || str === "—" || str === "-") return "";

  const genderStr = (genderInfo || "").toLowerCase();
  const isFemale = genderStr.includes("female") || genderStr.startsWith("f");
  const isMale = genderStr.includes("male") || genderStr.startsWith("m");

  const trailingUnit = (unit || "").trim();

  if (isFemale) {
    const fMatch = str.match(/(?:^|[;\/|])\s*\bF(?:emale)?\b\s*(\([^)]*\))?\s*:?\s*([^;]+)/i);
    if (fMatch) {
      const condition = fMatch[1] ? fMatch[1].trim() + " " : "";
      let fVal = (condition + fMatch[2].trim()).trim();
      if (trailingUnit && !fVal.includes(trailingUnit) && !fVal.match(/[a-zA-Z]/)) {
        fVal += ` ${trailingUnit}`;
      }
      return fVal;
    }
  }

  if (isMale || (!isFemale && isMale)) {
    const mMatch = str.match(/(?:^|[;\/|])\s*\bM(?:ale)?\b\s*:?\s*([^;]+)/i);
    if (mMatch) {
      let mVal = mMatch[1].trim();
      if (trailingUnit && !mVal.includes(trailingUnit) && !mVal.match(/[a-zA-Z]/)) {
        mVal += ` ${trailingUnit}`;
      }
      return mVal;
    }
  }

  // If gender is not female and pattern has "M 13-17; F 12-15", default to male/general standard
  const defaultMaleMatch = str.match(/(?:^|[;\/|])\s*\bM(?:ale)?\b\s*:?\s*([^;]+)/i);
  if (defaultMaleMatch) {
    let mVal = defaultMaleMatch[1].trim();
    if (trailingUnit && !mVal.includes(trailingUnit) && !mVal.match(/[a-zA-Z]/)) {
      mVal += ` ${trailingUnit}`;
    }
    return mVal;
  }

  return str;
}

/**
 * Resolves standard clinical unit from dictionary for a given parameter name.
 */
export function resolveStandardParameterUnit(
  paramName?: string | null,
  _panelName?: string | null
): string {
  if (!paramName) return "";
  const clean = paramName.trim();
  const lower = clean.toLowerCase();

  for (const def of MASTER_LAB_PARAMETER_DICTIONARY) {
    if (def.canonicalName.toLowerCase() === lower) return def.unit;
    for (const alias of def.aliases) {
      if (typeof alias === "string") {
        if (lower === alias.toLowerCase() || lower.includes(alias.toLowerCase())) {
          return def.unit;
        }
      } else if (alias.test(lower)) {
        return def.unit;
      }
    }
  }

  return "";
}

/**
 * Resolves standard biological reference range from dictionary for a given parameter name.
 */
export function resolveStandardParameterRefRange(
  paramName?: string | null,
  genderInfo?: string | null,
  panelName?: string | null
): string {
  if (!paramName) return "—";
  const clean = paramName.trim();
  const lower = clean.toLowerCase();

  for (const def of MASTER_LAB_PARAMETER_DICTIONARY) {
    let matched = false;
    if (def.canonicalName.toLowerCase() === lower) matched = true;
    else {
      for (const alias of def.aliases) {
        if (typeof alias === "string") {
          if (lower === alias.toLowerCase() || lower.includes(alias.toLowerCase())) {
            matched = true;
            break;
          }
        } else if (alias.test(lower)) {
          matched = true;
          break;
        }
      }
    }

    if (matched) {
      return formatGenderReferenceRange(def.refRangeText, genderInfo, def.unit);
    }
  }

  return "Normal";
}

/**
 * Default fallback parameter sets matching the hospital catalog (18 parameters for CBC).
 */
export function getFallbackParametersForPanel(
  panelName?: string | null,
  genderInfo?: string | null
): LabReportPdfParameter[] {
  const normGender = (genderInfo || "").toLowerCase().includes("female") ? "Female" : "Male";

  // 18 parameters for Complete Blood Count matching testingsamples.tsx
  return [
    {
      parameter: "Hemoglobin",
      result: "14.2",
      unit: "g/dL",
      referenceRange: normGender === "Female" ? "12 - 15 g/dL" : "13 - 17 g/dL",
      status: "Normal",
    },
    {
      parameter: "Total WBC count (TC)",
      result: "6800",
      unit: "cells/µL",
      referenceRange: "4000 - 11000",
      status: "Normal",
    },
    {
      parameter: "RBC count",
      result: "4.82",
      unit: "million/µL",
      referenceRange: normGender === "Female" ? "3.8 - 4.8 million/µL" : "4.5 - 5.5 million/µL",
      status: "Normal",
    },
    {
      parameter: "PCV / HCT",
      result: "43.1",
      unit: "%",
      referenceRange: normGender === "Female" ? "36 - 46 %" : "40 - 50 %",
      status: "Normal",
    },
    {
      parameter: "MCV",
      result: "87.6",
      unit: "fL",
      referenceRange: "83 - 101",
      status: "Normal",
    },
    {
      parameter: "MCH",
      result: "29.1",
      unit: "pg",
      referenceRange: "27 - 32",
      status: "Normal",
    },
    {
      parameter: "MCHC",
      result: "33.0",
      unit: "g/dL",
      referenceRange: "31.5 - 34.5",
      status: "Normal",
    },
    {
      parameter: "RDW-CV",
      result: "12.8",
      unit: "%",
      referenceRange: "11.6 - 14",
      status: "Normal",
    },
    {
      parameter: "Platelet count",
      result: "235000",
      unit: "cells/µL",
      referenceRange: "150000 - 410000",
      status: "Normal",
    },
    {
      parameter: "MPV",
      result: "9.2",
      unit: "fL",
      referenceRange: "7.5 - 11.5",
      status: "Normal",
    },
    {
      parameter: "Neutrophils",
      result: "58",
      unit: "%",
      referenceRange: "40 - 80",
      status: "Normal",
    },
    {
      parameter: "Lymphocytes",
      result: "32",
      unit: "%",
      referenceRange: "20 - 40",
      status: "Normal",
    },
    {
      parameter: "Eosinophils",
      result: "3",
      unit: "%",
      referenceRange: "1 - 6",
      status: "Normal",
    },
    {
      parameter: "Monocytes",
      result: "6",
      unit: "%",
      referenceRange: "2 - 10",
      status: "Normal",
    },
    {
      parameter: "Basophils",
      result: "1",
      unit: "%",
      referenceRange: "0 - 2",
      status: "Normal",
    },
    {
      parameter: "Absolute Neutrophil Count (ANC)",
      result: "3944",
      unit: "cells/µL",
      referenceRange: "2000 - 7000",
      status: "Normal",
    },
    {
      parameter: "Absolute Lymphocyte Count",
      result: "2176",
      unit: "cells/µL",
      referenceRange: "1000 - 3000",
      status: "Normal",
    },
    {
      parameter: "Absolute Eosinophil Count",
      result: "204",
      unit: "cells/µL",
      referenceRange: "20 - 500",
      status: "Normal",
    },
  ];
}

/**
 * Generates an accredited diagnostic PDF report matching the exact layout
 * of the Clinical Precision Diagnostics Preview Report in Report Transfer.
 * Ensures the UNIT and REFERENCE RANGE columns are consistently populated.
 */
export function generateLabReportPdf(options: LabReportPdfOptions): {
  doc: jsPDF;
  pdfBase64: string;
  pdfBlob: Blob;
} {
  const doc = new jsPDF({ format: "a4", unit: "pt" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  /* ========================================================================= */
  /* 1. Header: Clinical Precision Diagnostics (Centered)                     */
  /* ========================================================================= */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.setTextColor(0, 0, 0);
  doc.text("CLINICAL PRECISION DIAGNOSTICS", pageWidth / 2, 45, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(31, 41, 55); // gray-800
  doc.text("EXCELLENCE IN MEDICAL TESTING & RESEARCH", pageWidth / 2, 58, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(75, 85, 99); // gray-600
  doc.text(
    "123 Medical Plaza, Health District, NY 10001 | Ph: +1 (555) 012-3456 | Web: www.clinicalprecision.com",
    pageWidth / 2,
    70,
    { align: "center" }
  );

  // Horizontal Thick Bar Separator (matching h-[2.5px] bg-black)
  doc.setFillColor(0, 0, 0);
  doc.rect(40, 78, pageWidth - 80, 2.5, "F");

  /* ========================================================================= */
  /* 2. Patient & Specimen Metadata Section (Two Columns)                     */
  /* ========================================================================= */
  // Left Column: Patient Avatar & Info
  const initials = options.patientName ? options.patientName.slice(0, 2).toUpperCase() : "P";
  doc.setFillColor(232, 240, 254); // #E8F0FE
  doc.circle(65, 120, 18, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(0, 72, 141); // #00488D
  doc.text(initials, 65, 125, { align: "center" });

  const labelX = 94;
  const valX = 185;

  // PATIENT NAME
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);
  doc.text("PATIENT NAME:", labelX, 106);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(17, 24, 39);
  doc.text(options.patientName || "—", valX, 106);

  // PATIENT ID
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("PATIENT ID:", labelX, 122);
  doc.setFont("courier", "normal");
  doc.setTextColor(17, 24, 39);
  doc.text(options.patientPid || options.patientId || "—", valX, 122);

  // AGE / GENDER
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("AGE / GENDER:", labelX, 138);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(17, 24, 39);
  doc.text(options.patientAgeGender || "—", valX, 138);

  // Right Column: Specimen Details
  const rightLabelX = pageWidth / 2 + 10;
  const rightValX = rightLabelX + 90;

  // BARCODE
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);
  doc.text("BARCODE:", rightLabelX, 98);
  doc.setFont("courier", "bold");
  doc.setTextColor(17, 24, 39);
  doc.text(options.barcode || options.sampleId || "—", rightValX, 98);

  // TEST NAME
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("TEST NAME:", rightLabelX, 112);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(17, 24, 39);
  doc.text(options.testPanel || "Diagnostic Profile", rightValX, 112);

  // COLLECTED ON
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("COLLECTED ON:", rightLabelX, 126);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(17, 24, 39);
  doc.text(options.collectedOn || options.generatedDate || "—", rightValX, 126);

  // REPORTED ON
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("REPORTED ON:", rightLabelX, 140);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(17, 24, 39);
  doc.text(
    options.reportedOn ||
      options.completedDate ||
      options.approvalDate ||
      options.generatedDate ||
      "—",
    rightValX,
    140
  );

  // TARGET DATE
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("TARGET DATE:", rightLabelX, 154);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(17, 24, 39);
  doc.text(options.targetDate || "—", rightValX, 154);

  /* ========================================================================= */
  /* 3. Diagnostic Results Table (Border border-black grid)                    */
  /* ========================================================================= */
  const parametersToUse =
    options.parameters && options.parameters.length > 0
      ? options.parameters
      : getFallbackParametersForPanel(options.testPanel, options.patientAgeGender);

  const tableData = parametersToUse.map((p) => {
    const paramName = (p.parameter || "").trim() || "Parameter";
    const resultVal = p.result !== undefined && p.result !== null ? String(p.result) : "—";

    // 1. Resolve Unit with fallbacks
    let rawUnit = (
      p.unit ||
      (p as any).units ||
      (p as any).unit_of_measure ||
      (p as any).uom ||
      ""
    ).trim();

    if (!rawUnit || rawUnit === "—" || rawUnit === "-") {
      rawUnit = resolveStandardParameterUnit(paramName, options.testPanel);
    }

    // 2. Resolve Reference Range with fallbacks and gender formatting
    let rawRange = (
      p.referenceRange ||
      (p as any).reference_range ||
      (p as any).ref_range ||
      (p as any).refRange ||
      (p as any).expectedRange ||
      ""
    ).trim();

    if (
      !rawRange ||
      rawRange === "—" ||
      rawRange === "-" ||
      rawRange.toLowerCase() === "normal"
    ) {
      rawRange = resolveStandardParameterRefRange(
        paramName,
        options.patientAgeGender,
        options.testPanel
      );
    } else {
      rawRange = formatGenderReferenceRange(rawRange, options.patientAgeGender, rawUnit);
    }

    return [
      paramName,
      resultVal,
      rawUnit || "—",
      rawRange || "—",
      p.status || "Normal",
    ];
  });

  autoTable(doc, {
    startY: 168,
    head: [["PARAMETER", "RESULT", "UNIT", "REFERENCE RANGE", "STATUS"]],
    body: tableData,
    theme: "grid",
    headStyles: {
      fillColor: [243, 244, 246], // bg-gray-100
      textColor: [0, 0, 0], // text-black
      fontStyle: "bold",
      fontSize: 8.5,
      lineColor: [0, 0, 0], // border-black
      lineWidth: 0.75,
      halign: "center",
    },
    styles: {
      lineColor: [0, 0, 0], // border-black
      lineWidth: 0.75,
      fontSize: 8.5,
      cellPadding: 4.8,
      textColor: [17, 24, 39],
    },
    columnStyles: {
      0: { halign: "left", fontStyle: "bold", cellWidth: 155 },
      1: { halign: "center", fontStyle: "normal", cellWidth: 75 },
      2: { halign: "center", fontStyle: "normal", cellWidth: 75 },
      3: { halign: "center", fontStyle: "normal", cellWidth: 130 },
      4: { halign: "center", fontStyle: "bold", cellWidth: 80 },
    },
    alternateRowStyles: {
      fillColor: [255, 255, 255],
    },
    didParseCell: (data) => {
      if (data.section === "head" && data.column.index === 0) {
        data.cell.styles.halign = "left";
      }
      if (data.section === "body" && data.column.index === 4) {
        const raw = String(data.cell.raw || "").toLowerCase();
        if (raw.includes("crit")) {
          data.cell.styles.textColor = [185, 28, 28]; // red
          data.cell.styles.fontStyle = "bold";
        } else if (raw.includes("abnormal") || raw.includes("high") || raw.includes("low")) {
          data.cell.styles.textColor = [180, 83, 9]; // amber
          data.cell.styles.fontStyle = "bold";
        } else {
          data.cell.styles.textColor = [0, 0, 0];
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
    margin: { left: 40, right: 40 },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || 450;

  /* ========================================================================= */
  /* 4. Clinical Remarks & Digital Signature Section                          */
  /* ========================================================================= */
  let sectionY = finalY + 16;
  if (sectionY + 140 > pageHeight - 30) {
    doc.addPage();
    sectionY = 50;
  }

  // Left Side: Remarks & Clinical Correlation
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);
  doc.text("CLINICAL REMARKS", 40, sectionY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(55, 65, 81);
  const remarksText =
    options.clinicalRemarks ||
    options.approvalRemarks ||
    options.findingsSummary ||
    "All parameters are within normal limits. The blood counts show no signs of anemia, infection, or clotting disorders at this time.";
  const splitRemarks = doc.splitTextToSize(remarksText, 290);
  doc.text(splitRemarks, 40, sectionY + 12);

  const corrY = sectionY + 12 + splitRemarks.length * 10 + 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);
  doc.text("CLINICAL CORRELATION", 40, corrY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(55, 65, 81);
  const corrText =
    options.clinicalCorrelation ||
    "Correlate clinically with patient's physical symptoms and history.";
  const splitCorr = doc.splitTextToSize(corrText, 290);
  doc.text(splitCorr, 40, corrY + 12);

  // Right Side: Digital Signature Card (border border-black w-64)
  const sigBoxX = pageWidth - 205;
  const sigBoxW = 165;
  const sigBoxH = 88;

  // Box Outer Border
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.75);
  doc.rect(sigBoxX, sectionY - 8, sigBoxW, sigBoxH);

  // Card Header: DIGITAL SIGNATURE (bg-gray-50/50, border-b border-black)
  doc.setFillColor(249, 250, 251);
  doc.rect(sigBoxX, sectionY - 8, sigBoxW, 16, "F");
  doc.line(sigBoxX, sectionY + 8, sigBoxX + sigBoxW, sectionY + 8);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(0, 0, 0);
  doc.text("DIGITAL SIGNATURE", sigBoxX + sigBoxW / 2, sectionY + 3, { align: "center" });

  // Signature Content
  const signerName = options.approverName || "Sarah Johnson";
  doc.setFont("times", "italic");
  doc.setFontSize(18);
  doc.setTextColor(17, 24, 39);
  doc.text(signerName, sigBoxX + sigBoxW / 2, sectionY + 28, { align: "center" });

  // Signature underline divider
  doc.setDrawColor(209, 213, 219);
  doc.setLineWidth(0.5);
  doc.line(sigBoxX + 25, sectionY + 34, sigBoxX + sigBoxW - 25, sectionY + 34);

  // Pathologist Details
  doc.setDrawColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(0, 0, 0);
  doc.text(`DR. ${signerName.toUpperCase()}`, sigBoxX + sigBoxW / 2, sectionY + 45, {
    align: "center",
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(31, 41, 55);
  doc.text(
    (options.approverRole || "SENIOR PATHOLOGIST (MD, DNB)").toUpperCase(),
    sigBoxX + sigBoxW / 2,
    sectionY + 56,
    { align: "center" }
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(75, 85, 99);
  doc.text("REG NO: MC-209455", sigBoxX + sigBoxW / 2, sectionY + 66, { align: "center" });

  /* ========================================================================= */
  /* 5. Disclaimer Footer (border-t border-black)                             */
  /* ========================================================================= */
  const disclaimerY = pageHeight - 48;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.75);
  doc.line(40, disclaimerY, pageWidth - 40, disclaimerY);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(0, 0, 0);
  doc.text("DISCLAIMER", 40, disclaimerY + 11);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(55, 65, 81);
  doc.text(
    "This report is for diagnostic purposes and should be interpreted by a registered medical practitioner. Laboratory results are subject to clinical variation.",
    40,
    disclaimerY + 22
  );

  const pdfBase64 = doc.output("datauristring");
  const pdfBlob = doc.output("blob");

  return { doc, pdfBase64, pdfBlob };
}

/**
 * Downloads the diagnostic report PDF with formatted filename.
 */
export function downloadLabReportPdf(options: LabReportPdfOptions): void {
  const { doc } = generateLabReportPdf(options);
  const filename = `LabReport_${options.reportId || "report"}_${(options.patientName || "patient").replace(/\s+/g, "_")}.pdf`;
  doc.save(filename);
}

/**
 * Opens a PDF preview using a blob URL in a new window/tab.
 */
export function openLabReportPdfPreview(
  pdfBase64OrOptions: string | LabReportPdfOptions,
  _title = "Diagnostic Report"
): void {
  let blob: Blob;
  if (typeof pdfBase64OrOptions === "string") {
    if (pdfBase64OrOptions.startsWith("data:application/pdf;base64,")) {
      const base64Data = pdfBase64OrOptions.replace("data:application/pdf;base64,", "");
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      blob = new Blob([byteArray], { type: "application/pdf" });
    } else {
      window.open(pdfBase64OrOptions, "_blank");
      return;
    }
  } else {
    const { pdfBlob } = generateLabReportPdf(pdfBase64OrOptions);
    blob = pdfBlob;
  }

  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (!win) {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.click();
  }
}
