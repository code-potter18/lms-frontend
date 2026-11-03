import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  CheckCircle2,
  Clock,
  Timer,
  AlertTriangle,
  AlertCircle,
  Zap,
} from "lucide-react";
import { getUser, remove } from "@/utils/token";
import { toast } from "@/hooks/use-toast";
import LabNav from "./labnav";
import { LabNotificationBell } from "@/components/hms/LabNotificationBell";
import { labTestMasterApi, LabTestMasterRecord, LabTestParameterRecord } from "@/api/labTestMaster.api";
import { UserProfileDropdown } from "@/components/ui/User_profile_dropdown";
import {
  labOrderApi,
  labOrderItemApi,
  labResultApi,
  LabOrderRecord,
  LabOrderItemRecord,
} from "@/api/labOrder.api";
import { patientApi, PatientRecord } from "@/api/patient.api";
import {
  calculateSampleStability,
  resolveStabilityHours,
  useCurrentTimeTicker,
  compareBySampleStability,
  SampleStabilityInfo,
} from "@/utils/sampleStability";

export interface TestingSampleItem {
  id: string;
  sampleId: string;
  barcode: string;
  patientId: string;
  patientName: string;
  testName: string;
  analyzerBench: string;
  startTime: string;
  estimatedCompletion: string;
  status: "RUNNING" | "COMPLETED" | "CALIBRATING" | "FLAGGED";
  criticalAlert?: string;
  testResult?: string;
  sampleType?: string;
  receivedDate?: string;
  receivedBy?: string;
  comments?: string;
  parameters?: TestParameter[];
  targetDate?: string;
  targetDateIso?: string;
  rawOrderItem?: LabOrderItemRecord;
  patientGender?: string;
  collectionTime?: string;
  collectionTimeIso?: string;
  stabilityHours?: number;
  priority?: string;
  unit?: string;
  expectedRange?: string;
  parametersCount?: number;
  parametersPreview?: string;
}

const normalizeToIsoDate = (value?: string | null): string | null => {
  if (!value || value === "—") return null;
  const str = String(value).trim();
  const ymdMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymdMatch) return `${ymdMatch[1]}-${ymdMatch[2]}-${ymdMatch[3]}`;
  const dmy4Match = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmy4Match) {
    return `${dmy4Match[3]}-${dmy4Match[2].padStart(2, "0")}-${dmy4Match[1].padStart(2, "0")}`;
  }
  const dmy2Match = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2})$/);
  if (dmy2Match) {
    return `20${dmy2Match[3]}-${dmy2Match[2].padStart(2, "0")}-${dmy2Match[1].padStart(2, "0")}`;
  }
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return null;
};

const formatTargetDate = (value?: string | null): string => {
  if (!value) return "—";
  const iso = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) {
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    return `${day}-${month}-${d.getFullYear()}`;
  }
  return String(value);
};


export function formatGenderReferenceRange(range?: string | null, gender?: string | null, unit?: string | null): string {
  if (!range) return "";
  const normGender = (gender || "").toLowerCase().startsWith("f")
    ? "Female"
    : (gender || "").toLowerCase().startsWith("m")
    ? "Male"
    : "All";

  if (normGender !== "Male" && normGender !== "Female") return range;

  const trailingUnit = (unit || "").trim();

  if (normGender === "Female") {
    // Look for female pattern e.g. "F: ...", "Female: ...", "F (follicular) ..."
    const fMatch = range.match(/(?:^|[;\/|])\s*\bF(?:emale)?\b\s*(\([^)]*\))?\s*:?\s*([^;]+)/i);
    if (fMatch) {
      const condition = fMatch[1] ? fMatch[1].trim() + " " : "";
      let fVal = (condition + fMatch[2].trim()).trim();
      if (trailingUnit && !fVal.includes(trailingUnit) && !fVal.match(/[a-zA-Z]/)) {
        fVal += ` ${trailingUnit}`;
      }
      return fVal;
    }
  }

  if (normGender === "Male") {
    // Look for male pattern e.g. "M: ...", "Male: ..."
    const mMatch = range.match(/(?:^|[;\/|])\s*\bM(?:ale)?\b\s*:?\s*([^;]+)/i);
    if (mMatch) {
      let mVal = mMatch[1].trim();
      if (trailingUnit && !mVal.includes(trailingUnit) && !mVal.match(/[a-zA-Z]/)) {
        mVal += ` ${trailingUnit}`;
      }
      return mVal;
    }
  }

  return range;
}

const isTestingSampleOverdue = (s?: TestingSampleItem | null): boolean => {
  if (!s || s.status === "COMPLETED") return false;
  const todayIso = new Date().toISOString().slice(0, 10);
  const iso = s.targetDateIso || (s.targetDate ? normalizeToIsoDate(s.targetDate) : null);
  if (!iso) return false;
  return iso < todayIso;
};

export interface TestParameter {
  id: string;
  lab_test_parameter_id?: string;
  parameter: string;
  result: string;
  unit: string;
  referenceRange: string;
  status: "Completed" | "In Progress" | "Not Started";
  abnormalFlag?: "NORMAL" | "LOW" | "HIGH" | "CRITICAL" | "BORDERLINE";
  resultComment?: string;
  inputType?: "numeric" | "options" | "text";
  options?: string[];
  refRangeLow?: number | null;
  refRangeHigh?: number | null;
  gender?: string | null;
}

export function parseParameterInputType(
  unit?: string | null,
  refRangeText?: string | null,
  refRangeLow?: number | string | null,
  refRangeHigh?: number | string | null,
): { inputType: "numeric" | "options" | "text"; options?: string[] } {
  const u = (unit || "").trim().toLowerCase();
  const t = (refRangeText || "").trim().toLowerCase();

  if (
    u.includes("reactive / non-reactive") ||
    u.includes("reactive / non reactive") ||
    u.includes("reactive/non-reactive") ||
    u.includes("reactive") ||
    t.includes("non-reactive") ||
    t.includes("non reactive") ||
    t.includes("reactive")
  ) {
    return { inputType: "options", options: ["Non-reactive", "Reactive"] };
  }

  if (
    u.includes("neg / pos") ||
    u.includes("negative / positive") ||
    u.includes("neg/pos") ||
    u.includes("negative") ||
    t.includes("negative") ||
    t.includes("non-pregnant")
  ) {
    if (u.includes("1+") || u.includes("trace")) {
      return {
        inputType: "options",
        options: ["Negative", "Trace", "1+", "2+", "3+", "4+"],
      };
    }
    return { inputType: "options", options: ["Negative", "Positive"] };
  }

  if (u.includes("present / absent") || u.includes("present/absent") || t.includes("absent")) {
    return { inputType: "options", options: ["Absent", "Present"] };
  }

  if (u.includes("normal / increased") || u.includes("normal/increased") || t.includes("normal")) {
    return { inputType: "options", options: ["Normal", "Increased"] };
  }

  if (
    (refRangeLow !== null && refRangeLow !== undefined && refRangeLow !== "") ||
    (refRangeHigh !== null && refRangeHigh !== undefined && refRangeHigh !== "")
  ) {
    return { inputType: "numeric" };
  }

  if (/^\s*\d+(\.\d+)?\s*(-|–|to)\s*\d+(\.\d+)?\s*$/.test(refRangeText || "")) {
    return { inputType: "numeric" };
  }

  return { inputType: "text" };
}

export function evaluateAbnormalFlag(
  val: string,
  param: {
    inputType?: string;
    refRangeLow?: number | null;
    refRangeHigh?: number | null;
    referenceRange?: string;
    unit?: string;
  }
): "NORMAL" | "LOW" | "HIGH" | "CRITICAL" | "BORDERLINE" {
  if (!val || val.trim() === "") return "NORMAL";
  const trimmed = val.trim();
  const lower = trimmed.toLowerCase();

  if (["negative", "non-reactive", "non reactive", "absent", "normal", "nil", "clear", "straw", "pale yellow"].includes(lower)) {
    return "NORMAL";
  }
  if (lower === "trace" || lower === "borderline" || lower === "equivocal" || lower === "slightly hazy") {
    return "BORDERLINE";
  }
  if (["positive", "reactive", "present", "1+", "2+", "3+", "4+", "increased", "turbid", "cloudy"].includes(lower)) {
    if (lower === "reactive" || lower === "positive" || lower === "3+" || lower === "4+" || lower === "turbid") {
      return "CRITICAL";
    }
    return "HIGH";
  }

  if (lower.includes("critical") || lower.includes("panic")) {
    return "CRITICAL";
  }

  const num = parseFloat(trimmed.replace(/,/g, ""));
  if (!Number.isNaN(num)) {
    let low = param.refRangeLow != null ? Number(param.refRangeLow) : undefined;
    let high = param.refRangeHigh != null ? Number(param.refRangeHigh) : undefined;

    if (low == null && high == null && param.referenceRange) {
      const cleanedRange = param.referenceRange.replace(/,/g, "");
      const match = cleanedRange.match(/(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)/i);
      if (match) {
        low = parseFloat(match[1]);
        high = parseFloat(match[2]);
      } else {
        const lessMatch = cleanedRange.match(/(?:<|less than|up to)\s*(\d+(?:\.\d+)?)/i);
        if (lessMatch) {
          high = parseFloat(lessMatch[1]);
        }
        const greaterMatch = cleanedRange.match(/(?:>|greater than)\s*(\d+(?:\.\d+)?)/i);
        if (greaterMatch) {
          low = parseFloat(greaterMatch[1]);
        }
      }
    }

    if (low != null && high != null) {
      if (num < low) {
        return num < low * 0.6 ? "CRITICAL" : "LOW";
      }
      if (num > high) {
        return num > high * 1.5 ? "CRITICAL" : "HIGH";
      }
      return "NORMAL";
    }
    if (low != null && num < low) {
      return num < low * 0.6 ? "CRITICAL" : "LOW";
    }
    if (high != null && num > high) {
      return num > high * 1.5 ? "CRITICAL" : "HIGH";
    }
  }

  return "NORMAL";
}

export const CBC_CANONICAL_ORDER = [
  "hemoglobin",
  "total wbc count (tc)",
  "rbc count",
  "pcv / hct",
  "mcv",
  "mch",
  "mchc",
  "rdw-cv",
  "platelet count",
  "mpv",
  "neutrophils",
  "lymphocytes",
  "eosinophils",
  "monocytes",
  "basophils",
  "absolute neutrophil count (anc)",
  "absolute lymphocyte count",
  "absolute eosinophil count",
  "esr",
];

export function sortParametersClinically(params: TestParameter[]): TestParameter[] {
  const isCbcLike = params.some((p) => {
    const l = (p.parameter || "").toLowerCase();
    return l.includes("hemoglobin") || l.includes("rbc count") || l.includes("pcv");
  });

  if (isCbcLike) {
    return [...params].sort((a, b) => {
      const getIdx = (name?: string) => {
        const l = (name || "").toLowerCase().trim();
        const found = CBC_CANONICAL_ORDER.findIndex((k) => l === k || l.includes(k));
        return found !== -1 ? found : 99;
      };
      return getIdx(a.parameter) - getIdx(b.parameter);
    });
  }

  return params;
}

export interface ClinicalPanelPreset {
  keywords: string[];
  primaryMasterId?: string;
  primaryTestCode?: string;
  canonicalName: string;
  match?: (cleanName: string, rawName: string) => boolean;
}

export const CLINICAL_PANEL_PRESETS: ClinicalPanelPreset[] = [
  {
    keywords: ["cbc", "complete blood count", "hemogram", "complete hemogram", "full blood count", "fbc"],
    primaryMasterId: "LT00787",
    primaryTestCode: "INH-013",
    canonicalName: "Complete Blood Count",
    match: (n) => /^(cbc|complete blood count|hemogram|complete hemogram|full blood count|fbc)$/i.test(n),
  },
  {
    keywords: ["differential wbc count", "differential count", "wbc differential", "differential wbc", "dc count", "diff count"],
    primaryMasterId: "LT00294",
    primaryTestCode: "DDC-1068",
    canonicalName: "Differential WBC Count (DC)",
    match: (n) => /^(differential wbc count|differential count|wbc differential|differential wbc|dc count|diff count)$/i.test(n),
  },
  {
    keywords: ["wbc", "total wbc count", "total wbc count (tc)", "wbc count", "white blood cell count", "white blood cells", "total count", "tc"],
    primaryMasterId: "LT00683",
    primaryTestCode: "DDC-1457",
    canonicalName: "Total WBC Count (TC)",
    match: (n) => /^(wbc|total wbc count|total wbc count \(tc\)|wbc count|white blood cell count|white blood cells|total count|tc)$/i.test(n),
  },
  {
    keywords: ["hb,tc,dc", "hb tc dc", "hb, tc, dc"],
    primaryMasterId: "LT00378",
    primaryTestCode: "DDC-1152",
    canonicalName: "HB,TC,DC",
    match: (n) => /^(hb,tc,dc|hb tc dc|hb, tc, dc)$/i.test(n),
  },
  {
    keywords: ["lft", "liver function test", "liver panel", "hepatic panel", "liver function tests"],
    primaryMasterId: "LT00783",
    primaryTestCode: "INH-009",
    canonicalName: "Liver Function test",
    match: (n) => /^(lft|liver function test|liver panel|hepatic panel|liver function tests)$/i.test(n),
  },
  {
    keywords: ["rft", "kft", "renal function test", "kidney function test", "renal panel", "kidney panel"],
    primaryMasterId: "LT00794",
    primaryTestCode: "NEW-001",
    canonicalName: "Renal Function Test (RFT)",
    match: (n) => /^(rft|kft|renal function test|kidney function test|renal panel|kidney panel)$/i.test(n),
  },
  {
    keywords: ["lipid profile", "lipid panel", "lipids", "cholesterol panel"],
    primaryMasterId: "LT00782",
    primaryTestCode: "INH-008",
    canonicalName: "Lipid profile",
    match: (n) => !n.includes("phospholipid") && /^(lipid profile|lipid panel|lipids|cholesterol panel)$/i.test(n),
  },
  {
    keywords: ["thyroid", "tft", "thyroid function test", "thyroid profile", "thyroid panel"],
    primaryMasterId: "LT00669",
    primaryTestCode: "DDC-1443",
    canonicalName: "Thyroid Function Test - TFT (tT3,tT4,TSH)",
    match: (n) => /^(thyroid|tft|thyroid function test|thyroid profile|thyroid panel)$/i.test(n),
  },
  {
    keywords: ["urine routine", "urine routine analysis", "routine urine", "urinalysis", "urine analysis", "urine complete", "urine complete analysis", "urine r/m"],
    primaryMasterId: "LT00745",
    primaryTestCode: "DDC-1519",
    canonicalName: "Urine Routine Analysis",
    match: (n) => /^(urine routine|urine routine analysis|routine urine|urinalysis|urine analysis|urine complete|urine complete analysis|urine r\/m)$/i.test(n),
  },
  {
    keywords: ["electrolytes complete", "complete electrolytes", "electrolyte complete"],
    primaryMasterId: "LT00307",
    primaryTestCode: "DDC-1081",
    canonicalName: "Electrolytes Complete",
    match: (n) => /^(electrolytes complete|complete electrolytes|electrolyte complete)$/i.test(n),
  },
  {
    keywords: ["electrolytes", "serum electrolytes", "electrolyte panel", "lytes"],
    primaryMasterId: "LT00778",
    primaryTestCode: "INH-004",
    canonicalName: "Electrolytes",
    match: (n) => !n.includes("urine") && !n.includes("complete") && !n.includes("(n&k)") && !n.includes("(na&k)") && /^(electrolytes|serum electrolytes|electrolyte panel|lytes)$/i.test(n),
  },
  {
    keywords: ["coagulation profile", "coagulation", "coag profile", "pt inr", "pt aptt", "pt / aptt / inr", "coagulation profile (pt / aptt / inr)"],
    primaryMasterId: "LT00795",
    primaryTestCode: "NEW-002",
    canonicalName: "Coagulation Profile (PT / APTT / INR)",
    match: (n) => /^(coagulation profile|coagulation|coag profile|pt inr|pt aptt|pt \/ aptt \/ inr|coagulation profile \(pt \/ aptt \/ inr\))$/i.test(n),
  },
  {
    keywords: ["hbv screen", "hepatitis b screen", "hepatitis b marker study", "hepatitis b profile", "hepatitis b panel", "hbv screen (hbsag, anti-hbc, anti-hbs)"],
    primaryMasterId: "LT00796",
    primaryTestCode: "NEW-003",
    canonicalName: "HBV Screen (HBsAg, Anti-HBc, Anti-HBs)",
    match: (n) => !n.includes("pcr") && !n.includes("spot") && !n.includes("rapid") && !n.includes("clia") && !n.includes("elisa") && /^(hbv screen|hepatitis b screen|hepatitis b marker study|hepatitis b profile|hepatitis b panel|hbv screen \(hbsag, anti-hbc, anti-hbs\))$/i.test(n),
  },
  {
    keywords: ["hcv & hiv", "hiv & hcv", "hiv and hcv", "hcv and hiv", "hcv & hiv screen"],
    primaryMasterId: "LT00797",
    primaryTestCode: "NEW-004",
    canonicalName: "HCV & HIV Screen",
    match: (n) => !n.includes("pcr") && /^(hcv & hiv|hiv & hcv|hiv and hcv|hcv and hiv|hcv & hiv screen)$/i.test(n),
  },
  {
    keywords: ["uric acid", "serum uric acid"],
    primaryMasterId: "LT00702",
    primaryTestCode: "DDC-1476",
    canonicalName: "Uric Acid",
    match: (n) => !n.includes("urine") && /^(uric acid|serum uric acid)$/i.test(n),
  },
  {
    keywords: ["creatinine", "serum creatinine"],
    primaryMasterId: "LT00268",
    primaryTestCode: "DDC-1042",
    canonicalName: "Creatinine",
    match: (n) => !n.includes("urine") && /^(creatinine|serum creatinine)$/i.test(n),
  },
  {
    keywords: ["calcium", "serum calcium", "total calcium"],
    primaryMasterId: "LT00777",
    primaryTestCode: "INH-003",
    canonicalName: "Calcium",
    match: (n) => !n.includes("urine") && /^(calcium|serum calcium|total calcium)$/i.test(n),
  },
  {
    keywords: ["esr", "erythrocyte sedimentation rate"],
    primaryMasterId: "LT00314",
    primaryTestCode: "DDC-1088",
    canonicalName: "ESR",
    match: (n) => /^(esr|erythrocyte sedimentation rate)$/i.test(n),
  },
  {
    keywords: ["ferritin", "serum ferritin"],
    primaryMasterId: "LT00329",
    primaryTestCode: "DDC-1103",
    canonicalName: "Ferritin",
    match: (n) => /^(ferritin|serum ferritin)$/i.test(n),
  },
  {
    keywords: ["gamma gt", "ggt", "gamma gt (ggt)"],
    primaryMasterId: "LT00364",
    primaryTestCode: "DDC-1138",
    canonicalName: "Gamma GT (GGT)",
    match: (n) => /^(gamma gt|ggt|gamma gt \(ggt\))$/i.test(n),
  },
  {
    keywords: ["glucose random", "random blood sugar", "rbs", "random glucose"],
    primaryMasterId: "LT00790",
    primaryTestCode: "INH-016",
    canonicalName: "Glucose Random",
    match: (n) => /^(glucose random|random blood sugar|rbs|random glucose)$/i.test(n),
  },
  {
    keywords: ["glucose fasting", "fasting blood sugar", "fbs", "fasting glucose"],
    primaryMasterId: "LT00788",
    primaryTestCode: "INH-014",
    canonicalName: "Glucose Fasting",
    match: (n) => /^(glucose fasting|fasting blood sugar|fbs|fasting glucose)$/i.test(n),
  },
  {
    keywords: ["glucose post prandial", "post prandial blood sugar", "ppbs", "pp glucose"],
    primaryMasterId: "LT00789",
    primaryTestCode: "INH-015",
    canonicalName: "Glucose Post Prandial",
    match: (n) => /^(glucose post prandial|post prandial blood sugar|ppbs|pp glucose)$/i.test(n),
  },
  {
    keywords: ["hba1c", "hba1c (hplc)", "glycated hemoglobin"],
    primaryMasterId: "LT00380",
    primaryTestCode: "DDC-1154",
    canonicalName: "HBA1c (HPLC)",
    match: (n) => /^(hba1c|hba1c \(hplc\)|glycated hemoglobin)$/i.test(n),
  },
  {
    keywords: ["platelet count", "platelets", "platelet"],
    primaryMasterId: "LT00570",
    primaryTestCode: "DDC-1344",
    canonicalName: "PLATELET COUNT",
    match: (n) => /^(platelet count|platelets|platelet)$/i.test(n),
  },
  {
    keywords: ["nt probnp", "probnp", "bnp", "nt-probnp"],
    primaryMasterId: "LT00551",
    primaryTestCode: "DDC-1325",
    canonicalName: "NT proBNP",
    match: (n) => /^(nt probnp|probnp|bnp|nt-probnp)$/i.test(n),
  },
  {
    keywords: ["bilirubin", "total bilirubin", "serum bilirubin"],
    primaryMasterId: "LT00179",
    primaryTestCode: "DDC-0953",
    canonicalName: "Bilirubin",
    match: (n) => !n.includes("cord") && !n.includes("direct") && !n.includes("indirect") && /^(bilirubin|total bilirubin|serum bilirubin)$/i.test(n),
  },
  {
    keywords: ["17 - oh progesterone", "17-oh progesterone", "17 oh progesterone"],
    primaryMasterId: "LT00001",
    primaryTestCode: "DDC-0775",
    canonicalName: "17 - Oh Progesterone",
    match: (n) => /^(17 - oh progesterone|17-oh progesterone|17 oh progesterone)$/i.test(n),
  },
  {
    keywords: ["24 hrs urine 17 ketosteroids", "17 ketosteroids", "24 hrs urine ketosteroids"],
    primaryMasterId: "LT00002",
    primaryTestCode: "DDC-0776",
    canonicalName: "24 Hrs Urine 17 Ketosteroids",
    match: (n) => /^(24 hrs urine 17 ketosteroids|17 ketosteroids|24 hrs urine ketosteroids)$/i.test(n),
  },
  {
    keywords: ["urine pregnancy test", "pregnancy test", "upt"],
    primaryMasterId: "LT00724",
    primaryTestCode: "DDC-1498",
    canonicalName: "Urine Pregnancy Test",
    match: (n) => /^(urine pregnancy test|pregnancy test|upt)$/i.test(n),
  },
];

export function resolveAllTestParameters(options: {
  item?: LabOrderItemRecord | null;
  patientGender?: string | null;
  testName?: string;
  allMasters?: LabTestMasterRecord[];
  allDbParameters?: LabTestParameterRecord[];
  matchedTestMaster?: LabTestMasterRecord | null;
}): TestParameter[] {
  const { item, patientGender, testName = "", allMasters = [], allDbParameters = [], matchedTestMaster } = options;

  // 1. Determine if this test is a combo test that should be split into individual sub-panels
  const lowerTest = testName.toLowerCase().trim();
  const directMaster = matchedTestMaster || item?.lab_test_master || allMasters.find((m) => m.test_name?.toLowerCase() === lowerTest);
  let shouldSplit = true;

  if (directMaster) {
    if ((directMaster.lab_test_parameter?.length || 0) > 0 || allDbParameters.some((p) => p.lab_test_id === directMaster.lab_test_id)) {
      shouldSplit = false;
    } else if ((directMaster.unit || directMaster.reference_range) && !/see panel parameters sheet/i.test(directMaster.reference_range || "")) {
      shouldSplit = false;
    }
  }

  if (shouldSplit) {
    // Check if testName is a combo test like "CBC with ESR" or "HB,TC,DC & ESR"
    let tokens: string[] = [];
    if (/\b(?:with|and)\b|&/i.test(testName)) {
      tokens = testName.split(/\b(?:with|and)\b|&/i).map((s) => s.trim()).filter(Boolean);
    } else {
      // Split by commas, plus, semicolon, or dot only outside parentheses!
      let current = "";
      let parenDepth = 0;
      for (let i = 0; i < testName.length; i++) {
        const ch = testName[i];
        if (ch === "(") parenDepth++;
        else if (ch === ")") parenDepth--;

        if (parenDepth === 0 && (ch === "," || ch === "+" || ch === ";" || (ch === "." && /[A-Za-z]/.test(testName[i + 1] || "")))) {
          if (current.trim()) tokens.push(current.trim());
          current = "";
        } else {
          current += ch;
        }
      }
      if (current.trim()) tokens.push(current.trim());
    }

    if (tokens.length > 1) {
      const combined: TestParameter[] = [];
      tokens.forEach((subName) => {
        const subParams = resolveSingleTestParameters({
          item,
          patientGender,
          testName: subName,
          allMasters,
          allDbParameters,
        });
        combined.push(...subParams);
      });
      if (combined.length > 0) {
        const seen = new Set<string>();
        const deduped: TestParameter[] = [];
        for (const p of combined) {
          const key = p.parameter.toLowerCase().trim();
          if (!seen.has(key)) {
            seen.add(key);
            deduped.push(p);
          }
        }
        return sortParametersClinically(deduped);
      }
    }
  }

  const single = resolveSingleTestParameters({
    item,
    patientGender,
    testName,
    allMasters,
    allDbParameters,
    matchedTestMaster,
  });
  return sortParametersClinically(single);
}

function resolveSingleTestParameters(options: {
  item?: LabOrderItemRecord | null;
  patientGender?: string | null;
  testName: string;
  allMasters?: LabTestMasterRecord[];
  allDbParameters?: LabTestParameterRecord[];
  matchedTestMaster?: LabTestMasterRecord | null;
}): TestParameter[] {
  const { item, patientGender, testName, allMasters = [], allDbParameters = [], matchedTestMaster } = options;
  const n = (testName || "").toLowerCase().trim();
  const cleanN = n.replace(/\s*\([^)]*\)/g, "").trim();

  // 1. Check presets for canonical panel definitions
  const preset = CLINICAL_PANEL_PRESETS.find((p) => {
    if (p.match) {
      return p.match(cleanN, n);
    }
    return p.keywords.some((kw) => n === kw || cleanN === kw);
  });

  let bestMaster: any = null;
  if (preset) {
    bestMaster =
      (preset.primaryMasterId ? allMasters.find((m) => m.lab_test_id === preset.primaryMasterId) : null) ||
      (preset.primaryTestCode ? allMasters.find((m) => m.test_code?.toLowerCase() === preset.primaryTestCode?.toLowerCase()) : null) ||
      allMasters.find(
        (m) =>
          m.test_name?.toLowerCase() === preset.canonicalName.toLowerCase() &&
          Array.isArray(m.lab_test_parameter) &&
          m.lab_test_parameter.length > 0
      ) ||
      null;
  }

  // 2. If no preset or master not found via preset, search allMasters for rich DB master
  if (!bestMaster) {
    bestMaster =
      (item?.lab_test_master && (item.lab_test_master.lab_test_parameter?.length || 0) > 0 ? item.lab_test_master : null) ||
      (matchedTestMaster && (matchedTestMaster.lab_test_parameter?.length || 0) > 0 ? matchedTestMaster : null) ||
      (item?.lab_test_id ? allMasters.find((m) => m.lab_test_id === item.lab_test_id && (m.lab_test_parameter?.length || 0) > 0) : null) ||
      allMasters.find((m) => m.test_name?.toLowerCase() === n && (m.lab_test_parameter?.length || 0) > 0) ||
      allMasters.find((m) => m.test_name?.toLowerCase() === cleanN && (m.lab_test_parameter?.length || 0) > 0) ||
      // Next preference: records with non-null unit or reference_range from database
      allMasters.find((m) => m.test_name?.toLowerCase() === cleanN && (m.unit || m.reference_range)) ||
      allMasters.find((m) => m.test_name?.toLowerCase() === n && (m.unit || m.reference_range)) ||
      (item?.lab_test_id ? allMasters.find((m) => m.lab_test_id === item.lab_test_id) : null) ||
      item?.lab_test_master ||
      matchedTestMaster ||
      allMasters.find((m) => m.test_name?.toLowerCase() === n) ||
      allMasters.find((m) => m.test_name?.toLowerCase() === cleanN) ||
      null;
  }

  // Canonical redirection for masters whose reference_range says "See Panel Parameters sheet (...)"
  if (bestMaster && (bestMaster.lab_test_parameter?.length || 0) === 0 && /see panel parameters sheet/i.test(bestMaster.reference_range || "")) {
    const refR = bestMaster.reference_range || "";
    let panelTarget = "";
    if (/cbc/i.test(refR)) panelTarget = "Complete Blood Count";
    else if (/tft/i.test(refR)) panelTarget = "Thyroid Function Test - TFT (tT3,tT4,TSH)";
    else if (/lft/i.test(refR)) panelTarget = "Liver Function test";
    else if (/lipid/i.test(refR)) panelTarget = "Lipid profile";
    else if (/electrolytes/i.test(refR)) panelTarget = "Electrolytes";
    else if (/rft/i.test(refR)) panelTarget = "Renal Function Test (RFT)";
    else if (/urine routine/i.test(refR)) panelTarget = "Urine Routine Analysis";

    if (panelTarget) {
      const canonicalMaster = allMasters.find(
        (m) => m.test_name?.toLowerCase() === panelTarget.toLowerCase() && (m.lab_test_parameter?.length || 0) > 0
      );
      if (canonicalMaster) {
        bestMaster = canonicalMaster;
      }
    }
  }

  // 3. Try to get parameters from bestMaster.lab_test_parameter or allDbParameters
  let dbParams: any[] = bestMaster?.lab_test_parameter || [];
  if ((!dbParams || dbParams.length === 0) && allDbParameters.length > 0) {
    const testIdToMatch = bestMaster?.lab_test_id || item?.lab_test_id;
    if (testIdToMatch) {
      dbParams = allDbParameters.filter((p) => p.lab_test_id === testIdToMatch);
    }
  }

  // 4. If child parameters exist in DB, map them with their DB units and reference ranges
  if (Array.isArray(dbParams) && dbParams.length > 0) {
    const normGender = (patientGender || "").toLowerCase().startsWith("f")
      ? "Female"
      : (patientGender || "").toLowerCase().startsWith("m")
      ? "Male"
      : "All";

    let relevantParams = dbParams;

    if (normGender === "Female") {
      // STRICT GENDER RULE: Do NOT show male-exclusive parameters for female patients
      relevantParams = dbParams.filter((p) => {
        const g = (p.gender || "").toLowerCase().trim();
        if (g === "male" || g === "m") return false;
        const pName = (p.parameter_name || "").toLowerCase();
        if (/\b(male|men)\b/i.test(pName) && !/\b(female|women)\b/i.test(pName)) return false;
        return true;
      });
    } else if (normGender === "Male") {
      // STRICT GENDER RULE: Do NOT show female-exclusive parameters for male patients
      relevantParams = dbParams.filter((p) => {
        const g = (p.gender || "").toLowerCase().trim();
        if (g === "female" || g === "f") return false;
        const pName = (p.parameter_name || "").toLowerCase();
        if (/\b(female|women)\b/i.test(pName) && !/\b(male|men)\b/i.test(pName)) return false;
        return true;
      });
    } else {
      // Deduplicate parameters with same name if genders differ
      const seen = new Map<string, any>();
      const deduped: any[] = [];
      for (const p of dbParams) {
        const key = p.parameter_name.toLowerCase().trim();
        if (!seen.has(key)) {
          seen.set(key, p);
          deduped.push(p);
        }
      }
      relevantParams = deduped;
    }

    const mapped = relevantParams.map((p, idx) => {
      const typeInfo = parseParameterInputType(p.unit, p.ref_range_text, p.ref_range_low, p.ref_range_high);
      const existingResult = item?.lab_result?.find(
        (r) =>
          (r.lab_test_parameter_id && r.lab_test_parameter_id === p.lab_test_parameter_id) ||
          r.parameter_name.toLowerCase() === p.parameter_name.toLowerCase()
      );

      const rawRefRangeStr =
        p.ref_range_text ||
        (p.ref_range_low != null && p.ref_range_high != null
          ? `${p.ref_range_low} - ${p.ref_range_high}`
          : p.ref_range_low != null
          ? `>= ${p.ref_range_low}`
          : p.ref_range_high != null
          ? `< ${p.ref_range_high}`
          : "");
      const refRangeStr = formatGenderReferenceRange(rawRefRangeStr, patientGender, p.unit);

      const resultVal = existingResult?.result_value || "";
      const status: "Completed" | "In Progress" | "Not Started" =
        resultVal ? "Completed" : "Not Started";

      const flag =
        (existingResult?.abnormal_flag as any) ||
        evaluateAbnormalFlag(resultVal, {
          inputType: typeInfo.inputType,
          refRangeLow: p.ref_range_low != null ? Number(p.ref_range_low) : null,
          refRangeHigh: p.ref_range_high != null ? Number(p.ref_range_high) : null,
          referenceRange: refRangeStr,
          unit: p.unit || "",
        });

      return {
        id: p.lab_test_parameter_id || `${bestMaster?.lab_test_id || "p"}-${idx + 1}`,
        lab_test_parameter_id: p.lab_test_parameter_id,
        parameter: p.parameter_name,
        result: resultVal,
        unit: p.unit || "",
        referenceRange: refRangeStr,
        status,
        abnormalFlag: flag,
        inputType: typeInfo.inputType,
        options: typeInfo.options,
        refRangeLow: p.ref_range_low != null ? Number(p.ref_range_low) : null,
        refRangeHigh: p.ref_range_high != null ? Number(p.ref_range_high) : null,
        gender: p.gender,
        resultComment: existingResult?.result_comment || "",
      };
    });

    const seenNames = new Set<string>();
    const dedupedParams: TestParameter[] = [];
    for (const p of mapped) {
      const k = p.parameter.toLowerCase().trim();
      if (!seenNames.has(k)) {
        seenNames.add(k);
        dedupedParams.push(p);
      }
    }
    return dedupedParams;
  }

  // 5. Single test parameter using bestMaster's unit/reference_range fetched directly from database
  const master = bestMaster || item?.lab_test_master || matchedTestMaster;
  if (master && (master.unit || master.reference_range || master.test_name)) {
    const ltm = master;
    const formattedRefRange = formatGenderReferenceRange(ltm.reference_range, patientGender, ltm.unit);
    const typeInfo = parseParameterInputType(ltm.unit, formattedRefRange);
    const existingResult = item?.lab_result?.[0];
    const resultVal = existingResult?.result_value || "";

    return [
      {
        id: ltm.lab_test_id || "single-p1",
        lab_test_parameter_id: undefined,
        parameter: ltm.test_name || testName || "Result",
        result: resultVal,
        unit: ltm.unit || "",
        referenceRange: formattedRefRange,
        status: resultVal ? "Completed" : "Not Started",
        abnormalFlag:
          (existingResult?.abnormal_flag as any) ||
          evaluateAbnormalFlag(resultVal, {
            inputType: typeInfo.inputType,
            referenceRange: formattedRefRange,
            unit: ltm.unit || "",
          }),
        inputType: typeInfo.inputType,
        options: typeInfo.options,
        resultComment: existingResult?.result_comment || "",
      },
    ];
  }

  return getDefaultParametersForTest(testName || "Diagnostic Test");
}

export function resolveTestParameters(
  item?: LabOrderItemRecord | null,
  patientGender?: string | null,
  testName?: string,
  matchedTestMaster?: LabTestMasterRecord | null,
): TestParameter[] {
  return resolveAllTestParameters({
    item,
    patientGender,
    testName,
    matchedTestMaster,
  });
}
export function determineAnalyzerBench(testName: string, sampleType?: string): string {
  const t = (testName || "").toLowerCase();
  const s = (sampleType || "").toLowerCase();

  if (
    t.includes("cbc") ||
    t.includes("blood count") ||
    t.includes("wbc") ||
    t.includes("platelet") ||
    s.includes("edta")
  ) {
    return "Sysmex XN-1000 (Hematology)";
  }
  if (
    t.includes("kft") ||
    t.includes("kidney") ||
    t.includes("renal") ||
    t.includes("lft") ||
    t.includes("liver") ||
    t.includes("bilirubin") ||
    t.includes("creatinine") ||
    t.includes("urea")
  ) {
    return "Cobas 6000 (Biochemistry)";
  }
  if (
    t.includes("lipid") ||
    t.includes("cholesterol") ||
    t.includes("triglyceride")
  ) {
    return "Beckman Coulter AU480";
  }
  if (
    t.includes("electrolyte") ||
    t.includes("na+") ||
    t.includes("k+") ||
    t.includes("cl-")
  ) {
    return "Roche 9180 Electrolyte Analyzer";
  }
  if (t.includes("hba1c") || t.includes("glycated")) {
    return "Bio-Rad D-10 HPLC";
  }
  return "Cobas 6000 (Biochemistry)";
}

export function getDefaultParametersForTest(
  testName: string,
  labTestMaster?: {
    test_name?: string;
    unit?: string | null;
    reference_range?: string | null;
  }
): TestParameter[] {
  return [
    {
      id: "p1",
      parameter: labTestMaster?.test_name || testName || "Result",
      result: "",
      unit: labTestMaster?.unit || "",
      referenceRange: labTestMaster?.reference_range || "—",
      status: "Not Started",
    },
  ];
}

export const INITIAL_CBC_PARAMETERS: TestParameter[] = [];
export const INITIAL_LFT_PARAMETERS: TestParameter[] = [];
export const INITIAL_KFT_PARAMETERS: TestParameter[] = [];
export const INITIAL_LIPID_PARAMETERS: TestParameter[] = [];
export const INITIAL_TESTING_SAMPLES: TestingSampleItem[] = [];

export default function TestingSamples() {
  const navigate = useNavigate();
  const currentUser = useMemo(() => getUser(), []);
  const displayName = currentUser?.username || "Labtech";
  const displayRole =
    currentUser?.role_type === "LAB_TECHNICIAN"
      ? "Lab Technician"
      : currentUser?.role_type || "Lab Technician";

  const handleLogout = () => {
    remove();
    navigate("/", { replace: true });
  };

  const [activeNav, setActiveNav] = useState("Testing Samples");
  const [expandedSampleId, setExpandedSampleId] = useState<string | null>(null);
  const [isDbMasterDrawerOpen, setIsDbMasterDrawerOpen] = useState(false);
  const [dbMasterSearch, setDbMasterSearch] = useState("");
  const [testMastersList, setTestMastersList] = useState<LabTestMasterRecord[]>([]);
  const [testParametersList, setTestParametersList] = useState<LabTestParameterRecord[]>([]);
  const [samples, setSamples] = useState<TestingSampleItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "RUNNING" | "COMPLETED" | "FLAGGED" | "CALIBRATING"
  >("ALL");
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState<"ALL" | "DUE_SOON" | "EXPIRED">("ALL");
  const currentTime = useCurrentTimeTicker(30000);

  // Results Workflow State
  const [viewMode, setViewMode] = useState<
    "table" | "enter-results" | "mark-completed"
  >("table");
  const [selectedSample, setSelectedSample] = useState<TestingSampleItem | null>(null);

  // Enter Test Results State
  const [testParameters, setTestParameters] = useState<TestParameter[]>([]);
  const [resultComments, setResultComments] = useState("");

  // Mark as Completed State
  const [completionComments, setCompletionComments] = useState("");

  // Real data fetching from backend
  const fetchRealData = useCallback(async () => {
    try {
      setIsLoading(true);
      setFetchError(null);

      const [ordersRes, itemsRes, patientsRes, testMastersRes, testParamsRes] = await Promise.all([
        labOrderApi.getAll().catch(() => ({ data: { data: [] } })),
        labOrderItemApi.getAll().catch(() => ({ data: { data: [] } })),
        patientApi.getAll({ limit: 100 }).catch(() => ({ data: { data: { patients: [] } } })),
        labTestMasterApi.getAll().catch(() => ({ data: { data: [] } })),
        labTestMasterApi.getParameters().catch(() => ({ data: { data: [] } })),
      ]);

      const currentUsername = currentUser?.username || "Lab Technician";

      const orders: LabOrderRecord[] = Array.isArray(ordersRes?.data?.data)
        ? ordersRes.data.data
        : [];
      const items: LabOrderItemRecord[] = Array.isArray(itemsRes?.data?.data)
        ? itemsRes.data.data
        : [];
      const patientsRaw = patientsRes?.data?.data;
      const patients: PatientRecord[] = Array.isArray(patientsRaw)
        ? patientsRaw
        : (patientsRaw as any)?.patients || [];

      const testMasters: LabTestMasterRecord[] = Array.isArray(testMastersRes?.data?.data)
        ? testMastersRes.data.data
        : [];
      const dbParameters: LabTestParameterRecord[] = Array.isArray(testParamsRes?.data?.data)
        ? testParamsRes.data.data
        : [];
      setTestMastersList(testMasters);
      setTestParametersList(dbParameters);
      const testMasterById = new Map<string, LabTestMasterRecord>();
      const testMasterByCode = new Map<string, LabTestMasterRecord>();
      const testMasterByName = new Map<string, LabTestMasterRecord>();
      testMasters.forEach((tm) => {
        if (tm.lab_test_id) testMasterById.set(tm.lab_test_id, tm);
        if (tm.test_code) {
          const codeKey = tm.test_code.toLowerCase();
          const existing = testMasterByCode.get(codeKey);
          if (!existing || (tm.lab_test_parameter?.length || 0) > (existing.lab_test_parameter?.length || 0)) {
            testMasterByCode.set(codeKey, tm);
          }
        }
        if (tm.test_name) {
          const nameKey = tm.test_name.toLowerCase();
          const existing = testMasterByName.get(nameKey);
          if (!existing || (tm.lab_test_parameter?.length || 0) > (existing.lab_test_parameter?.length || 0)) {
            testMasterByName.set(nameKey, tm);
          }
        }
      });

      if (items.length > 0) {
        const patientMap = new Map<string, PatientRecord>();
        patients.forEach((p) => {
          if (p.patient_id) patientMap.set(p.patient_id, p);
        });

        const orderMap = new Map<string, LabOrderRecord>();
        orders.forEach((o) => {
          if (o.lab_order_id) orderMap.set(o.lab_order_id, o);
        });

        // Filter backend items: ONLY those that are verified in Sample Verification
        // (Status is VERIFIED, or subsequent testing statuses RUNNING, COMPLETED, FLAGGED, CALIBRATING,
        // or verified via localStorage flags)
        const verifiedBackendItems = items.filter((item) => {
          const rawStatus = (item.item_status || "").toUpperCase();
          const barcodeMatch = item.remarks
            ? item.remarks.match(/Barcode:\s*([A-Za-z0-9_-]+)/i) || item.remarks.match(/(BC\d+)/i)
            : null;
          const resolvedBarcode =
            item.sample_collection?.[0]?.barcode ||
            (barcodeMatch ? barcodeMatch[1] : null) ||
            (typeof window !== "undefined"
              ? localStorage.getItem(`generated_barcode_item_${item.lab_order_item_id}`)
              : null) ||
            item.barcode;

          const isLocallyVerified =
            typeof window !== "undefined" &&
            (localStorage.getItem(`verified_sample_${item.lab_order_item_id}`) === "true" ||
              (resolvedBarcode && localStorage.getItem(`verified_sample_barcode_${resolvedBarcode}`) === "true"));
          const isLocallyTesting =
            typeof window !== "undefined" &&
            !!localStorage.getItem(`testing_sample_status_${item.lab_order_item_id}`);

          const isVerifiedStatus = [
            "VERIFIED",
            "RUNNING",
            "COMPLETED",
            "FLAGGED",
            "CALIBRATING",
          ].includes(rawStatus);

          const isRejected =
            rawStatus === "REJECTED" ||
            (typeof window !== "undefined" &&
              localStorage.getItem(`rejected_sample_${item.lab_order_item_id}`) === "true");

          if (isRejected) return false;

          return isVerifiedStatus || isLocallyVerified || isLocallyTesting;
        });

        const mappedBackendSamples: TestingSampleItem[] = verifiedBackendItems.map((item, idx) => {
          const parentOrder = orderMap.get(item.lab_order_id) || item.lab_order;
          const orderBioData =
            (parentOrder?.patient_history as any)?.patient_bio_data ||
            (item.lab_order?.patient_history as any)?.patient_bio_data ||
            (parentOrder as any)?.patient_bio_data;

          const pId =
            orderBioData?.patient_id ||
            parentOrder?.patient_history?.patient_id ||
            parentOrder?.patient_history_id ||
            `PAT00${idx + 1}`;

          const patient = orderBioData || patientMap.get(pId) || patientMap.get(parentOrder?.patient_history?.patient_id || "");

          const pName = orderBioData
            ? [orderBioData.patient_first_name, orderBioData.patient_middle_name, orderBioData.patient_last_name].filter(Boolean).join(" ")
            : patient
            ? [
                patient.patient_first_name,
                patient.patient_middle_name,
                patient.patient_last_name,
              ]
                .filter(Boolean)
                .join(" ")
            : `Patient ${pId}`;

          const resolvedGender =
            orderBioData?.patient_gender ||
            patient?.patient_gender ||
            (parentOrder?.patient_history as any)?.patient_gender ||
            (parentOrder as any)?.patient_gender ||
            "All";

          const testName =
            item.lab_test_master?.test_name ||
            item.lab_test_id?.replace(/^LABTEST/, "Test-") ||
            "Diagnostic Test";

          const sampleType =
            item.lab_test_master?.sample_type ||
            item.specimen_type ||
            "Whole Blood";

          const dateDigits = item.created_at
            ? new Date(item.created_at).toISOString().slice(2, 10).replace(/-/g, "")
            : "260908";

          const barcodeMatch = item.remarks
            ? item.remarks.match(/Barcode:\s*([A-Za-z0-9_-]+)/i) || item.remarks.match(/(BC\d+)/i)
            : null;

          const resolvedBarcode =
            item.sample_collection?.[0]?.barcode ||
            (barcodeMatch ? barcodeMatch[1] : null) ||
            (typeof window !== "undefined"
              ? localStorage.getItem(`generated_barcode_item_${item.lab_order_item_id}`)
              : null) ||
            item.barcode ||
            `BC${dateDigits}${String(idx + 1).padStart(4, "0")}`;

          const sampleId =
            item.sample_id ||
            item.sample_collection?.[0]?.sample_collection_id ||
            `SMP-${item.lab_order_item_id.replace(/\D/g, "").slice(-4) || String(idx + 1).padStart(3, "0")}`;

          const createdDate = item.created_at ? new Date(item.created_at) : new Date();
          const startTime = !isNaN(createdDate.getTime())
            ? createdDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true })
            : "10:30 AM";

          const regTimeStored =
            typeof window !== "undefined"
              ? localStorage.getItem(`registered_sample_item_time_${item.lab_order_item_id}`) ||
                localStorage.getItem(`registered_sample_time_${item.lab_order_id}`)
              : null;
          const colDateTime =
            regTimeStored ||
            item.sample_collection?.[0]?.collection_datetime ||
            item.sample_collection?.[0]?.created_at ||
            item.created_at;
          const colDate = colDateTime ? new Date(colDateTime) : createdDate;
          const stabilityHours = resolveStabilityHours(
            testName,
            sampleType,
            item.lab_test_master?.tat_hours,
            item.priority
          );
          const tatHours = stabilityHours;
          const estDate = new Date(createdDate.getTime() + tatHours * 3600 * 1000);
          const estimatedCompletion = !isNaN(estDate.getTime())
            ? estDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true })
            : "11:30 AM";

          const receivedDate = !isNaN(createdDate.getTime())
            ? createdDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
            : "22 Sep 2026";

          const storedStatus = typeof window !== "undefined"
            ? (localStorage.getItem(`testing_sample_status_${item.lab_order_item_id}`) as any)
            : null;
          const rawStatus = (item.item_status || "").toUpperCase();

          let status: "RUNNING" | "COMPLETED" | "CALIBRATING" | "FLAGGED" = "RUNNING";
          if (storedStatus) {
            status = storedStatus;
          } else if (rawStatus === "COMPLETED") {
            status = "COMPLETED";
          } else if (rawStatus === "FLAGGED") {
            status = "FLAGGED";
          } else if (rawStatus === "CALIBRATING") {
            status = "CALIBRATING";
          } else if (rawStatus === "RUNNING" || rawStatus === "IN PROGRESS") {
            status = "RUNNING";
          } else if (rawStatus === "VERIFIED") {
            status = "RUNNING";
          } else if (rawStatus === "BARCODE GENERATED") {
            status = idx % 2 === 0 ? "RUNNING" : "CALIBRATING";
          }

          // Match backend lab_test_master record
          const matchedTestMaster =
            testMasterById.get(item.lab_test_id) ||
            (item.lab_test_master?.test_code ? testMasterByCode.get(item.lab_test_master.test_code.toLowerCase()) : null) ||
            testMasterByName.get(testName.toLowerCase()) ||
            (testName.includes("(") ? testMasterByName.get(testName.replace(/\s*\([^)]*\)/g, "").trim().toLowerCase()) : null);

          if (matchedTestMaster && (!item.lab_test_master?.lab_test_parameter || item.lab_test_master.lab_test_parameter.length === 0)) {
            item.lab_test_master = {
              ...matchedTestMaster,
              ...item.lab_test_master,
              unit: item.lab_test_master?.unit || matchedTestMaster.unit,
              reference_range: item.lab_test_master?.reference_range || matchedTestMaster.reference_range,
              lab_test_parameter: matchedTestMaster.lab_test_parameter,
            };
          }

          const dbResolvedParams = resolveAllTestParameters({
            item,
            patientGender: resolvedGender,
            testName,
            allMasters: testMasters,
            allDbParameters: dbParameters,
            matchedTestMaster,
          });

          let params: TestParameter[] = dbResolvedParams;

          // Hydrate parameters with real database lab_result records
          if (item.lab_result && Array.isArray(item.lab_result) && item.lab_result.length > 0) {
            params = params.map((dbp) => {
              const matched = item.lab_result?.find((lr) =>
                (lr.lab_test_parameter_id && lr.lab_test_parameter_id === dbp.lab_test_parameter_id) ||
                (lr.parameter_name && lr.parameter_name.toLowerCase().trim() === dbp.parameter.toLowerCase().trim())
              );
              if (matched && matched.result_value != null && matched.result_value !== "") {
                const evalFlag = evaluateAbnormalFlag(matched.result_value, {
                  inputType: dbp.inputType,
                  refRangeLow: dbp.refRangeLow,
                  refRangeHigh: dbp.refRangeHigh,
                  referenceRange: dbp.referenceRange,
                  unit: dbp.unit,
                });
                return {
                  ...dbp,
                  result: matched.result_value,
                  status: (matched.result_status === "Completed" ? "Completed" : "In Progress") as any,
                  abnormalFlag: (matched.abnormal_flag || evalFlag) as any,
                };
              }
              return dbp;
            });
          }

          const storedParams = typeof window !== "undefined"
            ? localStorage.getItem(`testing_sample_params_${item.lab_order_item_id}`)
            : null;
          if (storedParams) {
            try {
              const parsed = JSON.parse(storedParams);
              if (Array.isArray(parsed) && parsed.length > 0) {
                params = dbResolvedParams.map((dbp) => {
                  const matched = parsed.find((p: any) =>
                    (p.lab_test_parameter_id && p.lab_test_parameter_id === dbp.lab_test_parameter_id) ||
                    p.parameter.toLowerCase() === dbp.parameter.toLowerCase() ||
                    p.id === dbp.id
                  );
                  if (matched && matched.result) {
                    return {
                      ...dbp,
                      result: matched.result,
                      status: "Completed",
                      abnormalFlag: matched.abnormalFlag || dbp.abnormalFlag,
                    };
                  }
                  return dbp;
                });
              }
            } catch {}
          }

          const singleUnit = item.lab_test_master?.unit || matchedTestMaster?.unit || params[0]?.unit || "";
          const rawSingleRange = item.lab_test_master?.reference_range || matchedTestMaster?.reference_range || params[0]?.referenceRange || "";
          const singleRange = formatGenderReferenceRange(rawSingleRange, resolvedGender, singleUnit);
          const isMulti = params.length > 1;
          const parametersCount = params.length;
          const parametersPreview = isMulti
            ? params.map(p => `${p.parameter}: ${p.referenceRange || "—"} ${p.unit}`).slice(0, 5).join(" | ") + (params.length > 5 ? "..." : "")
            : `${singleRange} ${singleUnit}`.trim();

          const storedResult = typeof window !== "undefined"
            ? localStorage.getItem(`testing_sample_result_${item.lab_order_item_id}`)
            : null;
          const testResult =
            storedResult ||
            (status === "COMPLETED"
              ? (item.remarks || "All test parameters verified & completed.")
              : undefined);

          const storedComments = typeof window !== "undefined"
            ? localStorage.getItem(`testing_sample_comments_${item.lab_order_item_id}`)
            : null;

          const hasCriticalParam = params.some((p) => p.abnormalFlag === "CRITICAL");
          const criticalAlert = hasCriticalParam
            ? `Critical: ${params.filter((p) => p.abnormalFlag === "CRITICAL").map((p) => `${p.parameter} (${p.result} ${p.unit || ""})`.trim()).join(", ")}`
            : undefined;

            const rawTargetDate = item.target_date || (parentOrder as any)?.target_date;
            const targetDateFormatted = rawTargetDate ? formatTargetDate(rawTargetDate) : undefined;
            const targetDateIso = rawTargetDate ? (normalizeToIsoDate(rawTargetDate) || undefined) : undefined;

            return {
              id: item.lab_order_item_id,
              sampleId,
              barcode: resolvedBarcode,
              patientId: pId,
              patientName: pName,
              testName,
              analyzerBench: determineAnalyzerBench(testName, sampleType),
              startTime,
              collectionTime: startTime,
              collectionTimeIso: !isNaN(colDate.getTime()) ? colDate.toISOString() : undefined,
              stabilityHours,
              priority: item.priority || "Normal",
              estimatedCompletion,
              status,
              sampleType,
              receivedDate,
              receivedBy: item.sample_collection?.[0]?.collected_by || currentUsername,
              comments: storedComments || item.remarks || "",
              testResult,
              parameters: params,
              criticalAlert,
              targetDate: targetDateFormatted,
              targetDateIso,
              rawOrderItem: item,
              patientGender: resolvedGender,
              unit: singleUnit,
              expectedRange: isMulti ? undefined : singleRange,
              parametersCount,
              parametersPreview,
            };
          });

        // Also merge any verified samples from local cache (from Sample Verification)
        const verifiedCache: any[] = typeof window !== "undefined"
          ? JSON.parse(localStorage.getItem("verified_samples_cache") || "[]")
          : [];

        const existingIds = new Set(mappedBackendSamples.map((s) => s.id));
        const existingBarcodes = new Set(mappedBackendSamples.map((s) => s.barcode));

        const cachedSamples: TestingSampleItem[] = [];
        for (const cached of verifiedCache) {
          if (!existingIds.has(cached.id) && (!cached.barcode || !existingBarcodes.has(cached.barcode))) {
            const testName = cached.testName || "Diagnostic Test";
            const sampleType = cached.sampleType || "Whole Blood";
            const matchedTm =
              testMasterByName.get(testName.toLowerCase()) ||
              testMasterByCode.get(testName.toLowerCase()) ||
              (testName.includes("(") ? testMasterByName.get(testName.replace(/\s*\([^)]*\)/g, "").trim().toLowerCase()) : null);

            const resolvedParams = resolveAllTestParameters({
              item: null,
              patientGender: cached.patientGender || "All",
              testName,
              allMasters: testMasters,
              allDbParameters: dbParameters,
              matchedTestMaster: matchedTm,
            });
            const singleUnit = matchedTm?.unit || resolvedParams[0]?.unit || "";
            const rawSingleRange = matchedTm?.reference_range || resolvedParams[0]?.referenceRange || "";
            const singleRange = formatGenderReferenceRange(rawSingleRange, cached.patientGender, singleUnit);
            const isMulti = resolvedParams.length > 1;
            const parametersCount = resolvedParams.length;
            const parametersPreview = isMulti
              ? resolvedParams.map(p => `${p.parameter}: ${p.referenceRange || "—"} ${p.unit}`).slice(0, 5).join(" | ") + (resolvedParams.length > 5 ? "..." : "")
              : `${singleRange} ${singleUnit}`.trim();

            cachedSamples.push({
              id: cached.id,
              sampleId: cached.sampleId || cached.id,
              barcode: cached.barcode || "",
              patientId: cached.patientId || "",
              patientName: cached.patientName || "",
              testName,
              analyzerBench: determineAnalyzerBench(testName, sampleType),
              startTime: cached.collectionTime || "10:30 AM",
              collectionTime: cached.collectionTime || "10:30 AM",
              collectionTimeIso: cached.collectionTimeIso || new Date().toISOString(),
              stabilityHours: cached.stabilityHours || resolveStabilityHours(testName, sampleType),
              priority: cached.priority || "Normal",
              estimatedCompletion: "11:30 AM",
              status: "RUNNING",
              sampleType,
              receivedDate: "22 Sep 2026",
              receivedBy: cached.technician || currentUsername,
              comments: "",
              parameters: resolvedParams,
              targetDate: cached.targetDate,
              targetDateIso: cached.targetDateIso,
              unit: singleUnit,
              expectedRange: isMulti ? undefined : singleRange,
              parametersCount,
              parametersPreview,
            });
            existingIds.add(cached.id);
            if (cached.barcode) existingBarcodes.add(cached.barcode);
          }
        }

        const combinedSamples = [...mappedBackendSamples, ...cachedSamples];
        setSamples(combinedSamples);
        if (combinedSamples.length > 0) {
          setSelectedSample((prev) => {
            if (!prev) return combinedSamples[0];
            const exists = combinedSamples.find((s) => s.id === prev.id);
            return exists || combinedSamples[0];
          });
        }
      }
    } catch (err: any) {
      console.error("Failed to load real testing samples:", err);
      setFetchError(err.message || "Failed to fetch real testing samples");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRealData();
  }, [fetchRealData]);

  
  const handleInlineParameterResultChange = (sampleId: string, paramId: string, value: string) => {
    setSamples((prev) =>
      prev.map((s) => {
        if (s.id !== sampleId || !s.parameters) return s;
        const updatedParams = s.parameters.map((p) => {
          if (p.id !== paramId) return p;
          const flag = evaluateAbnormalFlag(value, {
            inputType: p.inputType,
            refRangeLow: p.refRangeLow,
            refRangeHigh: p.refRangeHigh,
            referenceRange: p.referenceRange,
            unit: p.unit,
          });
          return {
            ...p,
            result: value,
            status: value.trim() ? ("Completed" as const) : ("Not Started" as const),
            abnormalFlag: flag,
          };
        });
        if (typeof window !== "undefined") {
          localStorage.setItem(`testing_sample_params_${s.id}`, JSON.stringify(updatedParams));
        }
        return { ...s, parameters: updatedParams };
      })
    );
  };

  const handleOpenEnterResults = (sample: TestingSampleItem) => {
    setSelectedSample(sample);

    // Resolve all clinical parameters related to this test from database masters
    const resolved = resolveAllTestParameters({
      item: sample.rawOrderItem,
      patientGender: sample.patientGender,
      testName: sample.testName,
      allMasters: testMastersList,
      allDbParameters: testParametersList,
    });

    // Check for any stored results in localStorage or in sample.parameters
    const storedParamsRaw =
      typeof window !== "undefined"
        ? localStorage.getItem(`testing_sample_params_${sample.id}`)
        : null;
    let existingObs: any[] = [];
    if (storedParamsRaw) {
      try {
        const parsed = JSON.parse(storedParamsRaw);
        if (Array.isArray(parsed)) existingObs = parsed;
      } catch {}
    }
    if (existingObs.length === 0 && Array.isArray(sample.parameters)) {
      existingObs = sample.parameters;
    }
    if (existingObs.length === 0 && Array.isArray(sample.rawOrderItem?.lab_result)) {
      existingObs = sample.rawOrderItem.lab_result.map((lr) => ({
        lab_test_parameter_id: lr.lab_test_parameter_id,
        parameter: lr.parameter_name,
        result: lr.result_value,
        abnormalFlag: lr.abnormal_flag,
        resultComment: lr.result_comment,
      }));
    }

    // Merge existing observations into resolved parameter definitions
    const merged: TestParameter[] = resolved.map((rp): TestParameter => {
      const match = existingObs.find(
        (ep: any) =>
          (ep.lab_test_parameter_id && ep.lab_test_parameter_id === rp.lab_test_parameter_id) ||
          (ep.id && ep.id === rp.id) ||
          (ep.parameter && ep.parameter.toLowerCase() === rp.parameter.toLowerCase())
      );
      if (match && match.result && String(match.result).trim() !== "") {
        const resVal = String(match.result).trim();
        const flag =
          match.abnormalFlag ||
          evaluateAbnormalFlag(resVal, {
            inputType: rp.inputType,
            refRangeLow: rp.refRangeLow,
            refRangeHigh: rp.refRangeHigh,
            referenceRange: rp.referenceRange,
            unit: rp.unit,
          });
        return {
          ...rp,
          result: resVal,
          status: "Completed",
          abnormalFlag: flag,
          resultComment: match.resultComment || rp.resultComment,
        };
      }
      return rp;
    });

    setTestParameters(merged);
    setResultComments(sample.comments || "");
    setViewMode("enter-results");
  };

  const handleOpenMarkCompleted = (sample: TestingSampleItem) => {
    setSelectedSample(sample);
    setCompletionComments(sample.comments || "");
    setViewMode("mark-completed");
  };

  const handleConfirmMarkCompleted = async () => {
    if (!selectedSample) return;
    const updatedResult =
      selectedSample.testResult ||
      "All test parameters verified & completed successfully.";

    setSamples((prev) =>
      prev.map((s) =>
        s.id === selectedSample.id
          ? {
              ...s,
              status: "COMPLETED",
              comments: completionComments.trim() || s.comments,
              testResult: updatedResult,
            }
          : s,
      ),
    );
    setSelectedSample((prev) =>
      prev
        ? {
            ...prev,
            status: "COMPLETED",
            comments: completionComments.trim() || prev.comments,
            testResult: updatedResult,
          }
        : null,
    );

    try {
      localStorage.setItem(`testing_sample_status_${selectedSample.id}`, "COMPLETED");
      localStorage.setItem(`testing_sample_result_${selectedSample.id}`, updatedResult);
      if (completionComments.trim()) {
        localStorage.setItem(`testing_sample_comments_${selectedSample.id}`, completionComments.trim());
      }
      const paramsToSave =
        selectedSample.parameters && selectedSample.parameters.length > 0
          ? selectedSample.parameters
          : resolveTestParameters(selectedSample.rawOrderItem, selectedSample.patientGender, selectedSample.testName);
      localStorage.setItem(`testing_sample_params_${selectedSample.id}`, JSON.stringify(paramsToSave));

      try {
        const existingCompleted = JSON.parse(localStorage.getItem("completed_testing_samples") || "[]");
        const updatedCompleted = [
          ...existingCompleted.filter((item: any) => item.id !== selectedSample.id),
          {
            id: selectedSample.id,
            sampleId: selectedSample.sampleId,
            barcode: selectedSample.barcode,
            patientId: selectedSample.patientId,
            patientName: selectedSample.patientName,
            testName: selectedSample.testName,
            analyzerBench: selectedSample.analyzerBench,
            sampleType: selectedSample.sampleType,
            receivedDate: selectedSample.receivedDate,
            receivedBy: selectedSample.receivedBy,
            status: "COMPLETED",
            testResult: updatedResult,
            comments: completionComments.trim() || selectedSample.comments,
            parameters: paramsToSave,
            completedAt: new Date().toISOString(),
          },
        ];
        localStorage.setItem("completed_testing_samples", JSON.stringify(updatedCompleted));
      } catch (e) {
        console.warn("Could not save to completed_testing_samples registry:", e);
      }

      const realItemId = selectedSample.id.replace("item-", "").replace("smp-", "");
      if (!selectedSample.id.startsWith("ts-") && !selectedSample.id.startsWith("s") && !realItemId.startsWith("sample-")) {
        const batchParams = (paramsToSave || []).map((p) => ({
          lab_test_parameter_id:
            p.lab_test_parameter_id && !p.lab_test_parameter_id.startsWith("single-") && !p.lab_test_parameter_id.startsWith("ts-")
              ? p.lab_test_parameter_id
              : undefined,
          parameter_name: p.parameter,
          result_value: p.result || "",
          abnormal_flag: p.abnormalFlag || "NORMAL",
          result_comment: completionComments.trim() || undefined,
          unit: p.unit || undefined,
          reference_range: p.referenceRange || undefined,
        }));

        await labResultApi.batchSave({
          lab_order_item_id: realItemId,
          barcode: selectedSample.barcode,
          sample_type: selectedSample.sampleType,
          markCompleted: true,
          comments: completionComments.trim() || updatedResult,
          verified_by: currentUsername,
          parameters: batchParams,
        }).catch(async (e) => {
          console.warn("Could not save results via labResultApi.batchSave, fallback to labOrderItemApi:", e);
          await labOrderItemApi.update(realItemId, {
            item_status: "Completed",
            remarks: completionComments.trim() || updatedResult,
          }).catch(() => {});
        });

        fetchRealData();
      }
    } catch (err) {
      console.warn("Could not persist completion to backend:", err);
    }

    toast({
      title: "Sample Marked as Completed",
      description: `Barcode ${selectedSample.barcode || selectedSample.sampleId} marked as completed and queued for Report Generation.`,
    });
    setViewMode("table");
  };

  const handleParameterResultChange = (paramId: string, val: string) => {
    setTestParameters((prev) =>
      prev.map((p) => {
        if (p.id !== paramId) return p;
        const newStatus: "Completed" | "In Progress" | "Not Started" =
          val.trim() !== "" ? "Completed" : "Not Started";
        const newFlag = evaluateAbnormalFlag(val, {
          inputType: p.inputType,
          refRangeLow: p.refRangeLow,
          refRangeHigh: p.refRangeHigh,
          referenceRange: p.referenceRange,
          unit: p.unit,
        });
        return {
          ...p,
          result: val,
          status: newStatus,
          abnormalFlag: newFlag,
        };
      }),
    );
  };

  const handleToggleParamStatus = (paramId: string) => {
    setTestParameters((prev) =>
      prev.map((p) => {
        if (p.id !== paramId) return p;
        const nextStatus: "Completed" | "In Progress" | "Not Started" =
          p.status === "Completed"
            ? "In Progress"
            : p.status === "In Progress"
            ? "Not Started"
            : "Completed";
        return { ...p, status: nextStatus };
      }),
    );
  };

  const handleSaveResults = async () => {
    if (!selectedSample) return;
    const summary =
      testParameters
        .filter((p) => p.result.trim() !== "")
        .map((p) => `${p.parameter.split(" ")[0]}: ${p.result} ${p.unit}`)
        .join(", ") || "Parameters entered & verified";

    setSamples((prev) =>
      prev.map((s) =>
        s.id === selectedSample.id
          ? {
              ...s,
              status: "COMPLETED",
              testResult: summary,
              parameters: testParameters,
              comments: resultComments.trim() || s.comments,
            }
          : s,
      ),
    );
    setSelectedSample((prev) =>
      prev
        ? {
            ...prev,
            status: "COMPLETED",
            testResult: summary,
            parameters: testParameters,
            comments: resultComments.trim() || prev.comments,
          }
        : null,
    );

    try {
      localStorage.setItem(`testing_sample_status_${selectedSample.id}`, "COMPLETED");
      localStorage.setItem(`testing_sample_params_${selectedSample.id}`, JSON.stringify(testParameters));
      localStorage.setItem(`testing_sample_result_${selectedSample.id}`, summary);
      if (resultComments.trim()) {
        localStorage.setItem(`testing_sample_comments_${selectedSample.id}`, resultComments.trim());
      }

      try {
        const existingCompleted = JSON.parse(localStorage.getItem("completed_testing_samples") || "[]");
        const updatedCompleted = [
          ...existingCompleted.filter((item: any) => item.id !== selectedSample.id),
          {
            id: selectedSample.id,
            sampleId: selectedSample.sampleId,
            barcode: selectedSample.barcode,
            patientId: selectedSample.patientId,
            patientName: selectedSample.patientName,
            testName: selectedSample.testName,
            analyzerBench: selectedSample.analyzerBench,
            sampleType: selectedSample.sampleType,
            receivedDate: selectedSample.receivedDate,
            receivedBy: selectedSample.receivedBy,
            status: "COMPLETED",
            testResult: summary,
            comments: resultComments.trim() || selectedSample.comments,
            parameters: testParameters,
            completedAt: new Date().toISOString(),
          },
        ];
        localStorage.setItem("completed_testing_samples", JSON.stringify(updatedCompleted));
      } catch (e) {
        console.warn("Could not save to completed_testing_samples registry:", e);
      }

      const realItemId = selectedSample.id.replace("item-", "").replace("smp-", "");
      if (!selectedSample.id.startsWith("ts-") && !selectedSample.id.startsWith("s") && !realItemId.startsWith("sample-")) {
        const batchParams = testParameters.map((p) => ({
          lab_test_parameter_id:
            p.lab_test_parameter_id && !p.lab_test_parameter_id.startsWith("single-") && !p.lab_test_parameter_id.startsWith("ts-")
              ? p.lab_test_parameter_id
              : undefined,
          parameter_name: p.parameter,
          result_value: p.result || "",
          abnormal_flag: p.abnormalFlag || "NORMAL",
          result_comment: resultComments.trim() || undefined,
          unit: p.unit || undefined,
          reference_range: p.referenceRange || undefined,
        }));

        await labResultApi.batchSave({
          lab_order_item_id: realItemId,
          barcode: selectedSample.barcode,
          sample_type: selectedSample.sampleType,
          markCompleted: true,
          comments: resultComments.trim() || summary,
          verified_by: currentUsername,
          parameters: batchParams,
        }).catch(async (e) => {
          console.warn("Could not save results via labResultApi.batchSave, fallback to labOrderItemApi:", e);
          await labOrderItemApi.update(realItemId, {
            item_status: "Completed",
            remarks: summary,
          }).catch(() => {});
        });

        fetchRealData();
      }
    } catch (err) {
      console.warn("Could not persist results to backend:", err);
    }

    toast({
      title: "Test Results Saved",
      description: `Results recorded for barcode ${selectedSample.barcode || selectedSample.sampleId}. Queued for report generation.`,
    });
    setViewMode("table");
  };

  const handleSaveDraftResults = async () => {
    if (!selectedSample) return;
    setSamples((prev) =>
      prev.map((s) =>
        s.id === selectedSample.id
          ? {
              ...s,
              parameters: testParameters,
              comments: resultComments.trim() || s.comments,
            }
          : s,
      ),
    );
    setSelectedSample((prev) =>
      prev
        ? {
            ...prev,
            parameters: testParameters,
            comments: resultComments.trim() || prev.comments,
          }
        : null,
    );

    try {
      localStorage.setItem(`testing_sample_params_${selectedSample.id}`, JSON.stringify(testParameters));
      if (resultComments.trim()) {
        localStorage.setItem(`testing_sample_comments_${selectedSample.id}`, resultComments.trim());
      }

      const realItemId = selectedSample.id.replace("item-", "").replace("smp-", "");
      if (!selectedSample.id.startsWith("ts-") && !selectedSample.id.startsWith("s") && !realItemId.startsWith("sample-")) {
        const batchParams = testParameters.map((p) => ({
          lab_test_parameter_id:
            p.lab_test_parameter_id && !p.lab_test_parameter_id.startsWith("single-") && !p.lab_test_parameter_id.startsWith("ts-")
              ? p.lab_test_parameter_id
              : undefined,
          parameter_name: p.parameter,
          result_value: p.result || "",
          abnormal_flag: p.abnormalFlag || "NORMAL",
          result_comment: resultComments.trim() || undefined,
          unit: p.unit || undefined,
          reference_range: p.referenceRange || undefined,
        }));

        await labResultApi.batchSave({
          lab_order_item_id: realItemId,
          barcode: selectedSample.barcode,
          sample_type: selectedSample.sampleType,
          markCompleted: false,
          comments: resultComments.trim() || undefined,
          verified_by: currentUsername,
          parameters: batchParams,
        }).catch((e) => {
          console.warn("Could not save draft results to backend:", e);
        });
      }
    } catch {}

    toast({
      title: "Draft Saved",
      description: `Test results draft saved for barcode ${selectedSample.barcode || selectedSample.sampleId}.`,
    });
  };

  const handleMarkCompleted = (id: string) => {
    const s = samples.find((item) => item.id === id);
    if (s) {
      handleOpenEnterResults(s);
    }
  };

  const handleRerunTest = async (id: string) => {
    const startTimeStr = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    setSamples((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              status: "RUNNING",
              startTime: startTimeStr,
            }
          : s,
      ),
    );

    try {
      localStorage.setItem(`testing_sample_status_${id}`, "RUNNING");
      if (!id.startsWith("ts-")) {
        await labOrderItemApi.update(id, { item_status: "Running" });
      }
    } catch (err) {
      console.warn("Could not update rerun status:", err);
    }

    toast({
      title: "Rerun Initiated",
      description: "Sample queued for secondary analyzer run.",
    });
  };

  const sampleStabilityMap = useMemo(() => {
    const map = new Map<string, SampleStabilityInfo>();
    samples.forEach((s) => {
      const isCol = Boolean(s.barcode || s.collectionTimeIso);
      const colTime = s.collectionTimeIso || s.receivedDate || s.startTime;
      const info = calculateSampleStability(
        colTime,
        s.stabilityHours || 2,
        s.status,
        currentTime,
        isCol
      );
      map.set(s.id, info);
    });
    return map;
  }, [samples, currentTime]);

  const expiringSoonCount = useMemo(() => {
    return samples.filter((s) => {
      if (s.status === "COMPLETED") return false;
      const info = sampleStabilityMap.get(s.id);
      return info?.isExpiringSoon;
    }).length;
  }, [samples, sampleStabilityMap]);

  const expiredStabilityCount = useMemo(() => {
    return samples.filter((s) => {
      if (s.status === "COMPLETED") return false;
      const info = sampleStabilityMap.get(s.id);
      return info?.isExpired;
    }).length;
  }, [samples, sampleStabilityMap]);

  const filteredSamples = useMemo(() => {
    const list = samples.filter((sample) => {
      const matchesSearch =
        searchQuery.trim() === "" ||
        sample.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sample.barcode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sample.sampleId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sample.testName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sample.analyzerBench.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === "ALL" || sample.status === statusFilter;

      const info = sampleStabilityMap.get(sample.id);
      const matchesPriority =
        priorityFilter === "ALL"
          ? true
          : priorityFilter === "DUE_SOON"
          ? (info?.isExpiringSoon || false)
          : priorityFilter === "EXPIRED"
          ? (info?.isExpired || false)
          : true;

      return matchesSearch && matchesStatus && matchesPriority;
    });

    return [...list].sort((a, b) => {
      const overdueA = isTestingSampleOverdue(a) ? 1 : 0;
      const overdueB = isTestingSampleOverdue(b) ? 1 : 0;
      if (overdueA !== overdueB) return overdueB - overdueA;
      return (b.sampleId || "").localeCompare(a.sampleId || "");
    });
  }, [samples, searchQuery, statusFilter, priorityFilter]);

  const runningCount = useMemo(
    () => samples.filter((s) => s.status === "RUNNING").length,
    [samples],
  );
  const completedCount = useMemo(
    () => samples.filter((s) => s.status === "COMPLETED").length,
    [samples],
  );
  const flaggedCount = useMemo(
    () => samples.filter((s) => s.status === "FLAGGED").length,
    [samples],
  );
  const calibratingCount = useMemo(
    () => samples.filter((s) => s.status === "CALIBRATING").length,
    [samples],
  );
  const overdueCount = useMemo(() => {
    const now = Date.now();
    return samples.filter((s) => {
      if (s.status !== "RUNNING") return false;
      const t = new Date(s.receivedDate || "").getTime();
      return !isNaN(t) && now - t > 2 * 3600 * 1000;
    }).length;
  }, [samples]);

  /* ---------- Admin Dashboard Horizontal KPI Track Scroll State ---------- */
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollButtons = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    updateScrollButtons();
    el.addEventListener("scroll", updateScrollButtons, { passive: true });
    window.addEventListener("resize", updateScrollButtons);
    return () => {
      el.removeEventListener("scroll", updateScrollButtons);
      window.removeEventListener("resize", updateScrollButtons);
    };
  }, [updateScrollButtons]);

  const handleKpiScroll = (direction: "left" | "right") => {
    const el = trackRef.current;
    if (!el) return;
    const scrollAmount = 450;
    el.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  /* ---------- KPI Cards configuration (Admin Dashboard style) ---------- */
  const kpiCards = useMemo(
    () => [
      {
        id: "total-worklist",
        label: "Total Worklist",
        subLabel: "Specimens in testing queue",
        value: samples.length,
        tag: "Total",
        bg: "#D6E3FF",
        valueColor: "#00488D",
        iconBg: "rgba(255, 255, 255, 0.40)",
        icon: <FlaskConical className="w-[17px] h-[17px]" color="#00488D" />,
        isActive: statusFilter === "ALL",
        onClick: () => setStatusFilter("ALL"),
      },
      {
        id: "in-testing",
        label: "In Testing",
        subLabel: "Running on analyzers",
        value: runningCount,
        tag: `${samples.length > 0 ? Math.round((runningCount / samples.length) * 100) : 0}%`,
        bg: "rgba(255, 107, 53, 0.12)",
        valueColor: "#7B3200",
        iconBg: "#FFDBCB",
        icon: <Clock className="w-[17px] h-[17px]" color="#7B3200" />,
        isActive: statusFilter === "RUNNING",
        onClick: () => setStatusFilter((prev) => (prev === "RUNNING" ? "ALL" : "RUNNING")),
      },
      {
        id: "test-completed",
        label: "Test Completed",
        subLabel: "Results verified & ready",
        value: completedCount,
        tag: `${samples.length > 0 ? Math.round((completedCount / samples.length) * 100) : 0}%`,
        bg: "rgba(0, 200, 150, 0.12)",
        valueColor: "#00A87E",
        iconBg: "rgba(255, 255, 255, 0.40)",
        icon: <CheckCircle2 className="w-[17px] h-[17px]" color="#00A87E" />,
        isActive: statusFilter === "COMPLETED",
        onClick: () => setStatusFilter((prev) => (prev === "COMPLETED" ? "ALL" : "COMPLETED")),
      },
      {
        id: "flagged",
        label: "Flagged / Critical",
        subLabel: "Requires review",
        value: flaggedCount,
        tag: flaggedCount > 0 ? "ATTENTION" : "Normal",
        bg: flaggedCount > 0 ? "rgba(239, 68, 68, 0.12)" : "rgba(100, 116, 139, 0.08)",
        valueColor: flaggedCount > 0 ? "#b91c1c" : "#475569",
        iconBg: flaggedCount > 0 ? "#fee2e2" : "#f1f5f9",
        icon: <AlertTriangle className="w-[17px] h-[17px]" color={flaggedCount > 0 ? "#b91c1c" : "#475569"} />,
        isActive: statusFilter === "FLAGGED",
        onClick: () => setStatusFilter((prev) => (prev === "FLAGGED" ? "ALL" : "FLAGGED")),
      },
    ],
    [samples.length, runningCount, completedCount, flaggedCount, statusFilter]
  );

  return (
    <div className="min-h-screen flex bg-[#f8fafd] text-[#1e293b] antialiased selection:bg-blue-100 font-sans">
      {/* Global Lab Navigation Sidebar */}
      <LabNav
        activeTab="Testing Samples"
        onTabChange={(tab) => {
          if (tab === "Testing Samples") {
            setViewMode("table");
          }
        }}
      />

      {/* Main Content Area */}
      <div className="flex-1 ml-64 min-h-screen flex flex-col min-w-0 bg-[#f8fafd]">
        {/* TopNavbar */}
        <header
          className="sticky top-0 z-10 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-8 py-4 flex items-center justify-between"
          data-purpose="dashboard-header"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[#0b4a8b]">
              <svg className="w-5 h-5 stroke-[2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Testing Samples</h1>
              <p className="text-xs text-slate-500">Record laboratory findings, values and diagnostic results</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <LabNotificationBell size="md" />
            <UserProfileDropdown
              userName={displayName}
              userSubtext={displayRole}
              onLogout={handleLogout}
              profilePath="/lab/profile"
              hideNotifications
            />
          </div>
        </header>

        {/* Results Workflow */}
        {viewMode === "enter-results" && selectedSample ? (
          <main
            className="flex-1 flex flex-col justify-between overflow-y-auto px-8 py-6 min-w-0 bg-[#f8fafc]"
            data-purpose="main-layout"
          >
            <div className="max-w-6xl w-full mx-auto">
              {/* Top Navigation */}
              <div className="mb-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white px-3 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 transition-all cursor-pointer shadow-2xs"
                >
                  <ChevronLeft className="w-4 h-4 text-slate-500" />
                  Back to Testing Samples
                </button>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Analyzer:</span>
                  <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-white text-slate-700 border border-slate-200 shadow-2xs">
                    {selectedSample.analyzerBench}
                  </span>
                </div>
              </div>

              {/* Overdue Alert Banner */}
              {isTestingSampleOverdue(selectedSample) && (
                <div className="mb-4 p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-between text-rose-900 gap-3 shadow-2xs">
                  <div className="flex items-center gap-3">
                    <Clock className="w-5 h-5 text-rose-600 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-rose-900">
                        Target Turnaround Exceeded (Target: {selectedSample.targetDate || "Overdue"})
                      </p>
                      <p className="text-[11px] text-rose-700 mt-0.5">
                        Please enter the test findings promptly to proceed with pathologist verification and report delivery.
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded text-[10px] font-extrabold bg-rose-600 text-white tracking-wider uppercase shrink-0">
                    OVERDUE
                  </span>
                </div>
              )}





              {/* Requisition & Sample Details Card */}
              <div className="bg-white border border-slate-200/90 rounded-xl p-5 mb-6 shadow-2xs">
                <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-xl bg-teal-50 border border-teal-200/60 flex items-center justify-center text-teal-700 shrink-0">
                      <FlaskConical className="w-5 h-5 text-teal-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                          {selectedSample.testName}
                        </h2>
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          {selectedSample.sampleType || "Specimen"}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-teal-50 text-teal-700 border border-teal-200">
                          {selectedSample.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Patient: <strong className="text-slate-800 font-semibold">{selectedSample.patientName}</strong>{" "}
                        <span className="text-slate-400 font-mono">({selectedSample.patientId})</span>
                        {selectedSample.patientGender && selectedSample.patientGender !== "All" && (
                          <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            selectedSample.patientGender.toLowerCase().startsWith("f")
                              ? "bg-pink-50 text-pink-700 border-pink-200"
                              : "bg-blue-50 text-blue-700 border-blue-200"
                          }`}>
                            {selectedSample.patientGender}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Barcode / Sample ID
                      </span>
                      <span className="font-mono font-bold text-sm text-slate-800 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200 inline-block mt-0.5">
                        {selectedSample.barcode || selectedSample.sampleId}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3.5 text-xs text-slate-600">
                  <div>
                    <span className="text-slate-400 block text-[11px] font-medium mb-0.5">Accession Date</span>
                    <span className="font-semibold text-slate-700">{selectedSample.receivedDate || "—"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px] font-medium mb-0.5">Assigned Technician</span>
                    <span className="font-semibold text-slate-700">{selectedSample.receivedBy || "Lab Technician"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px] font-medium mb-0.5">Target Turnaround</span>
                    <span className={`font-semibold ${isTestingSampleOverdue(selectedSample) ? "text-rose-700" : "text-slate-700"}`}>
                      {selectedSample.targetDate || "Today"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px] font-medium mb-0.5">Est. Completion</span>
                    <span className="font-semibold text-slate-700">{selectedSample.estimatedCompletion || "—"}</span>
                  </div>
                </div>
              </div>

              {/* BEGIN: ResultsTableSection */}
              <section
                className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs mb-6"
                data-purpose="test-parameters-table"
              >
                {/* Section Top Header */}
                <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-white">
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                      Test Parameters & Observations
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200">
                      {testParameters.length} Parameter{testParameters.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Enter observation or select quick options. Abnormal flags are evaluated in real time.
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    {/* Table Header */}
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold tracking-wider text-slate-600 uppercase">
                        <th className="py-3 px-5 font-bold w-[26%] min-w-[180px]" scope="col">
                          PARAMETER
                        </th>
                        <th className="py-3 px-5 font-bold w-[34%] min-w-[260px]" scope="col">
                          OBSERVED RESULT
                        </th>
                        <th className="py-3 px-4 font-bold text-center w-[12%] min-w-[90px]" scope="col">
                          UNIT
                        </th>
                        <th className="py-3 px-4 font-bold text-center w-[16%] min-w-[130px]" scope="col">
                          REFERENCE RANGE
                        </th>
                        <th className="py-3 px-4 font-bold text-center w-[12%] min-w-[110px]" scope="col">
                          ALERT / FLAG
                        </th>
                      </tr>
                    </thead>
                    {/* Table Body */}
                    <tbody className="divide-y divide-slate-100 text-[13px] text-slate-800">
                      {testParameters.map((param, pIdx) => (
                        <tr
                          key={param.id || pIdx}
                          className="hover:bg-slate-50/60 transition-colors"
                        >
                          {/* Parameter Name */}
                          <td className="py-3.5 px-5 text-slate-900 font-semibold align-top">
                            <div className="flex items-start gap-2 pt-1">
                              <span className="text-[11px] font-mono text-slate-400 font-bold shrink-0 mt-0.5">
                                {pIdx + 1}.
                              </span>
                              <div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="block leading-snug">{param.parameter}</span>
                                  {param.gender && param.gender !== "All" && (
                                    <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                      {param.gender}
                                    </span>
                                  )}
                                </div>
                                {param.resultComment && (
                                  <span className="text-[11px] text-slate-400 block mt-0.5 italic">
                                    {param.resultComment}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Observed Result Input & Quick Option Pills */}
                          <td className="py-3 px-5 align-top">
                            <div className="space-y-1.5">
                              <input
                                type={param.inputType === "numeric" ? "text" : "text"}
                                inputMode={param.inputType === "numeric" ? "decimal" : undefined}
                                value={param.result}
                                onChange={(e) =>
                                  handleParameterResultChange(
                                    param.id,
                                    e.target.value,
                                  )
                                }
                                placeholder={
                                  param.inputType === "numeric"
                                    ? "Enter numeric value..."
                                    : param.options && param.options.length > 0
                                    ? "Select option below or type result..."
                                    : "Enter observation..."
                                }
                                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-[13px] font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all shadow-2xs font-mono"
                              />

                              {/* Quick-Pill Buttons (for qualitative tests) */}
                              {param.options && param.options.length > 0 && (
                                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                                  {param.options.map((opt) => {
                                    const isSelected = (param.result || "").trim().toLowerCase() === opt.toLowerCase();
                                    const isAbnormalOpt = [
                                      "positive",
                                      "reactive",
                                      "present",
                                      "trace",
                                      "1+",
                                      "2+",
                                      "3+",
                                      "4+",
                                      "turbid",
                                      "cloudy"
                                    ].some((m) => opt.toLowerCase().includes(m));

                                    return (
                                      <button
                                        key={opt}
                                        type="button"
                                        onClick={() => handleParameterResultChange(param.id, opt)}
                                        className={`px-2.5 py-0.5 rounded text-[11px] font-semibold transition-all cursor-pointer border ${
                                          isSelected
                                            ? isAbnormalOpt
                                              ? "bg-rose-50 text-rose-700 border-rose-300 shadow-2xs font-bold ring-1 ring-rose-400"
                                              : "bg-teal-50 text-teal-700 border-teal-300 shadow-2xs font-bold ring-1 ring-teal-400"
                                            : "bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200"
                                        }`}
                                      >
                                        {opt}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Unit */}
                          <td className="py-3.5 px-4 text-center text-xs font-semibold text-slate-600 align-top pt-4">
                            {param.unit ? (
                              <span className="px-2 py-0.5 rounded bg-slate-50 border border-slate-200/80 inline-block">
                                {param.unit}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>

                          {/* Reference Range */}
                          <td className="py-3.5 px-4 text-center text-xs font-mono text-slate-700 align-top pt-4">
                            {param.referenceRange ? (
                              <span className="px-2 py-0.5 rounded bg-slate-50 border border-slate-200/80 inline-block font-semibold">
                                {param.referenceRange}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>

                          {/* Alert / Flag Badge */}
                          <td className="py-3.5 px-4 text-center align-top pt-3.5">
                            {!param.result || param.result.trim() === "" ? (
                              <span className="text-slate-300 text-xs font-medium">—</span>
                            ) : param.abnormalFlag === "CRITICAL" ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300 animate-pulse">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                                Critical
                              </span>
                            ) : param.abnormalFlag === "HIGH" ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-300">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                High ↑
                              </span>
                            ) : param.abnormalFlag === "LOW" ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-300">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                Low ↓
                              </span>
                            ) : param.abnormalFlag === "BORDERLINE" ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-50 text-yellow-800 border border-yellow-300">
                                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                                Borderline
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                Normal
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              {/* END: ResultsTableSection */}

              {/* BEGIN: CommentsSection */}
              <section className="bg-white rounded-xl border border-slate-200 p-5 mb-8 shadow-2xs" data-purpose="comments-form">
                <label
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2"
                  htmlFor="results-comments"
                >
                  Technician Notes / Clinical Observations (Optional)
                </label>
                <textarea
                  id="results-comments"
                  value={resultComments}
                  onChange={(e) => setResultComments(e.target.value)}
                  className="w-full bg-slate-50/60 rounded-lg border border-slate-200 px-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 focus:bg-white transition-all resize-none shadow-2xs"
                  placeholder="Enter any pertinent technician comments, recheck notes, or specimen observations..."
                  rows={3}
                />
              </section>
              {/* END: CommentsSection */}

              {/* BEGIN: FooterActions */}
              <footer
                className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-200"
                data-purpose="action-buttons"
              >
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer shadow-2xs"
                >
                  Cancel / Return
                </button>

                <div className="flex items-center gap-3">
                  {/* Save Draft Button */}
                  <button
                    type="button"
                    onClick={handleSaveDraftResults}
                    className="px-5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors shadow-2xs cursor-pointer"
                  >
                    Save Draft
                  </button>

                  {/* Save & Complete Results Button */}
                  <button
                    type="button"
                    onClick={handleSaveResults}
                    className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 active:bg-teal-800 rounded-lg transition-all shadow-sm hover:shadow cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4 text-white" />
                    Save & Complete Results
                  </button>
                </div>
              </footer>
              {/* END: FooterActions */}
            </div>
          </main>
        ) : viewMode === "mark-completed" && selectedSample ? (
          <main
            className="flex-1 bg-white px-10 py-7 min-w-0"
            data-purpose="main-content"
          >
            {/* Top Return Navigation Link */}
            <div className="mb-4">
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className="inline-flex items-center text-[13.5px] font-semibold text-[#0284c7] hover:text-[#0369a1] transition-colors cursor-pointer"
              >
                <svg
                  className="w-4 h-4 mr-1 stroke-[2.5]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M15.75 19.5L8.25 12l7.5-7.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Back to Samples
              </button>
            </div>

            {/* Page Title & Sample Metadata */}
            <header className="mb-6">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                Mark as Completed
              </h2>
              <p className="text-[13px] text-slate-500 mt-1">
                Barcode:{" "}
                <span className="font-normal text-slate-600 font-mono">
                  {selectedSample.barcode || selectedSample.sampleId}
                </span>
                <span className="mx-1.5 text-slate-300">|</span>
                {selectedSample.testName}{" "}
                <span className="text-slate-400">
                  ({selectedSample.patientName})
                </span>
              </p>
            </header>

            {/* BEGIN: Completion Card Container */}
            <section
              className="max-w-[920px] rounded-xl border border-slate-200 bg-white p-6 shadow-[0_1px_3px_0_rgba(0,0,0,0.02)] md:max-lg:p-4"
              data-purpose="completion-form-card"
            >
              {/* Status Banner: Tests Completed */}
              <div
                className="flex items-start gap-3.5 rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-3.5 mb-6 md:max-lg:px-3 md:max-lg:py-3"
                role="alert"
              >
                {/* Success Checkmark Icon */}
                <div className="text-[#16a34a] mt-0.5 shrink-0">
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 20 20">
                    <path
                      clipRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                      fillRule="evenodd"
                    />
                  </svg>
                </div>
                {/* Alert Text Content */}
                <div className="text-xs">
                  <h3 className="font-bold text-[#14532d] text-[13px] leading-tight">
                    All tests completed
                  </h3>
                  <p className="text-[#15803d] font-normal mt-1 leading-snug">
                    Please review all test results before marking as completed.
                  </p>
                </div>
              </div>

              {/* Comments Input Block */}
              <div className="mb-6" data-purpose="comments-input-area">
                <label
                  className="block text-[13px] font-bold text-slate-800 mb-2"
                  htmlFor="completion-comments"
                >
                  Comments (Optional)
                </label>
                <textarea
                  id="completion-comments"
                  value={completionComments}
                  onChange={(e) => setCompletionComments(e.target.value)}
                  className="w-full rounded-md border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none transition duration-150 resize-y"
                  placeholder="Enter any final comments..."
                  rows={5}
                />
              </div>

              {/* Bottom Card Action Toolbar */}
              <div
                className="pt-5 border-t border-slate-100 flex items-center justify-end gap-3"
                data-purpose="form-actions"
              >
                {/* Cancel Button */}
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors shadow-xs focus:outline-none cursor-pointer"
                >
                  Cancel
                </button>
                {/* Submit Button: Mark as Completed */}
                <button
                  type="button"
                  onClick={handleConfirmMarkCompleted}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#16a34a] hover:bg-[#15803d] rounded-md transition-colors shadow-xs focus:outline-none focus:ring-2 focus:ring-[#16a34a]/30 cursor-pointer"
                >
                  Mark as Completed
                </button>
              </div>
            </section>
            {/* END: Completion Card Container */}
          </main>
        ) : (
          <main className="flex-1 p-8 lg:p-10 space-y-8 max-w-[1600px] w-full mx-auto">
          {/* Key Performance Indicators - Admin Dashboard Style Scrollable Track */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between flex-wrap gap-2 px-1">
              <div>
                <h2 className="text-base font-bold text-[#1c1e21] tracking-tight">Key Performance Indicators</h2>
                <p className="text-xs text-[#70747c]">Real-time analyzer metrics and test execution status</p>
              </div>
            </div>

            <div className="relative">
              {canScrollLeft && (
                <button
                  type="button"
                  onClick={() => handleKpiScroll("left")}
                  aria-label="Scroll left"
                  className="absolute -left-3 top-[calc(50%-16px)] w-8 h-8 rounded-full bg-white border border-[#e6e7eb] shadow-[0_2px_8px_rgba(0,0,0,0.08)] flex items-center justify-center cursor-pointer z-10 transition-all duration-150 hover:bg-[#fafafa] hover:scale-105 text-[#1c1e21]"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}

              <div
                className={`absolute left-0 top-0 bottom-2 w-12 pointer-events-none z-[2] transition-opacity duration-200 bg-gradient-to-r from-[#f8fafd] to-transparent ${
                  canScrollLeft ? "opacity-100" : "opacity-0"
                }`}
              />

              <div
                ref={trackRef}
                className="flex gap-[14px] overflow-x-auto scroll-smooth py-[6px] px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {kpiCards.map((card) => (
                  <div
                    key={card.id}
                    onClick={card.onClick}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        card.onClick?.();
                      }
                    }}
                    style={{
                      background: card.bg,
                      border: card.isActive ? `2.5px solid ${card.valueColor}` : "2.5px solid transparent",
                      boxShadow: card.isActive
                        ? `0 0 0 1px ${card.valueColor}20, 0 6px 18px ${card.valueColor}28`
                        : "0 2px 10px rgba(0,0,0,0.06)",
                    }}
                    className="flex-[0_0_206px] min-w-[206px] rounded-[12px] p-[14px_16px] flex flex-col gap-[10px] cursor-pointer transition-all duration-200 select-none hover:-translate-y-[2px] hover:shadow-[0_6px_20px_rgba(0,0,0,0.10)]"
                  >
                    <div className="flex items-center justify-between">
                      <div
                        style={{ background: card.iconBg }}
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm"
                      >
                        {card.icon}
                      </div>
                      {card.tag && (
                        <span
                          style={{ color: card.valueColor }}
                          className="text-[11px] font-bold px-[7px] py-[2px] rounded-full tracking-[-0.2px] bg-white/60 shadow-sm inline-flex items-center gap-1"
                        >
                          <span>{card.tag}</span>
                        </span>
                      )}
                    </div>

                    <div
                      style={{ color: card.valueColor }}
                      className="text-[26px] font-extrabold leading-[1.05] tracking-[-0.6px]"
                    >
                      {card.value}
                    </div>

                    <div className="flex flex-col gap-[2px] min-w-0">
                      <span
                        style={{ color: card.valueColor }}
                        className="text-[12.5px] font-bold tracking-tight truncate"
                      >
                        {card.label}
                      </span>
                      <span
                        style={{ color: card.valueColor, opacity: 0.75 }}
                        className="text-[11px] font-medium truncate"
                      >
                        {card.subLabel}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div
                className={`absolute right-0 top-0 bottom-2 w-12 pointer-events-none z-[2] transition-opacity duration-200 bg-gradient-to-l from-[#f8fafd] to-transparent ${
                  canScrollRight ? "opacity-100" : "opacity-0"
                }`}
              />

              {canScrollRight && (
                <button
                  type="button"
                  onClick={() => handleKpiScroll("right")}
                  aria-label="Scroll right"
                  className="absolute -right-3 top-[calc(50%-16px)] w-8 h-8 rounded-full bg-white border border-[#e6e7eb] shadow-[0_2px_8px_rgba(0,0,0,0.08)] flex items-center justify-center cursor-pointer z-10 transition-all duration-150 hover:bg-[#fafafa] hover:scale-105 text-[#1c1e21]"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* BEGIN: MainContainer */}
          <section
            className="w-full bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden"
            data-purpose="testing-samples-card"
          >
            {/* BEGIN: HeaderSection */}
            <header
              className="px-8 pt-7 pb-6 flex flex-col md:flex-row md:items-center justify-between gap-4"
              data-purpose="table-controls"
            >
              {/* Title */}
              <h1
                className="text-2xl font-bold text-slate-800 tracking-tight"
                data-purpose="page-title"
              >
                Testing Samples Details
              </h1>
              {/* Top Right Actions: Search and Filter */}
              <div
                className="flex flex-wrap items-center gap-3 w-full md:w-auto"
                data-purpose="search-and-filter-group"
              >
                {/* Search Input Container */}
                <div
                  className="relative flex-1 md:w-72"
                  data-purpose="search-input-wrapper"
                >
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <svg
                      className="w-4 h-4 text-slate-600"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-white text-sm text-slate-800 placeholder-slate-400 border border-slate-300 rounded-lg focus:outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500 transition-colors"
                    placeholder="Search Patient, Barcode, Analyzer..."
                    type="text"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  )}
                </div>





                {/* Filter Button */}
                <div className="relative shrink-0">
                  <button
                    onClick={() => setIsFilterDropdownOpen((prev) => !prev)}
                    className={`inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 border rounded-lg text-sm font-medium transition-colors ${
                      statusFilter !== "ALL"
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-slate-300 text-slate-700"
                    }`}
                    data-purpose="filter-trigger"
                    type="button"
                  >
                    <svg
                      className="w-4 h-4 text-slate-600"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M3 6h18M6 12h12M9 18h6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span>
                      {statusFilter === "ALL" ? "Filter" : statusFilter}
                    </span>
                  </button>

                  {isFilterDropdownOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-lg z-30 py-1.5 text-[13px]">
                      <button
                        type="button"
                        onClick={() => {
                          setStatusFilter("ALL");
                          setIsFilterDropdownOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center justify-between ${
                          statusFilter === "ALL"
                            ? "font-semibold text-blue-600 bg-blue-50/50"
                            : "text-slate-700"
                        }`}
                      >
                        <span>All Statuses</span>
                        {statusFilter === "ALL" && <span>✓</span>}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setStatusFilter("RUNNING");
                          setIsFilterDropdownOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center justify-between ${
                          statusFilter === "RUNNING"
                            ? "font-semibold text-blue-600 bg-blue-50/50"
                            : "text-slate-700"
                        }`}
                      >
                        <span>Running ({runningCount})</span>
                        {statusFilter === "RUNNING" && <span>✓</span>}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setStatusFilter("COMPLETED");
                          setIsFilterDropdownOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center justify-between ${
                          statusFilter === "COMPLETED"
                            ? "font-semibold text-[#15803d] bg-green-50/50"
                            : "text-slate-700"
                        }`}
                      >
                        <span>Completed ({completedCount})</span>
                        {statusFilter === "COMPLETED" && <span>✓</span>}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setStatusFilter("FLAGGED");
                          setIsFilterDropdownOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center justify-between ${
                          statusFilter === "FLAGGED"
                            ? "font-semibold text-[#b91c1c] bg-red-50/50"
                            : "text-slate-700"
                        }`}
                      >
                        <span>Flagged ({flaggedCount})</span>
                        {statusFilter === "FLAGGED" && <span>✓</span>}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setStatusFilter("CALIBRATING");
                          setIsFilterDropdownOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center justify-between ${
                          statusFilter === "CALIBRATING"
                            ? "font-semibold text-[#854d0e] bg-yellow-50/50"
                            : "text-slate-700"
                        }`}
                      >
                        <span>Calibrating ({calibratingCount})</span>
                        {statusFilter === "CALIBRATING" && <span>✓</span>}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </header>
            {/* END: HeaderSection */}





            {/* BEGIN: TableContent */}
            <div
              className="overflow-x-auto w-full"
              data-purpose="table-scroll-container"
            >
              <table
                className="w-full border-collapse text-left"
                id="testing-samples-table"
              >
                <thead>
                  <tr className="bg-[#f8fafc] border-y border-slate-200/90 text-[13px] font-bold text-slate-600 tracking-wider">
                    <th className="py-5 px-8 font-bold" scope="col">
                      BARCODE
                    </th>
                    <th className="py-5 px-6 font-bold" scope="col">
                      PATIENT NAME
                    </th>
                    <th className="py-5 px-6 font-bold" scope="col">
                      TEST PROCEDURE
                    </th>
                    <th className="py-5 px-6 font-bold min-w-[280px]" scope="col">
                      PARAMETERS, UNITS &amp; REF. RANGE (DB)
                    </th>
                    <th className="py-5 px-6 font-bold" scope="col">
                      ANALYZER BENCH
                    </th>
                    <th
                      className="py-5 px-8 font-bold text-center"
                      scope="col"
                    >
                      STATUS
                    </th>
                    <th
                      className="py-5 px-4 font-bold text-center"
                      scope="col"
                    >
                      ACTION
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[14px] text-slate-600">
                  {isLoading ? (
                    <tr>
                      <td colSpan={7} className="py-14 text-center text-slate-500">
                        <div className="flex flex-col items-center justify-center gap-3">
                          <div className="w-8 h-8 border-3 border-[#0b57d0] border-t-transparent rounded-full animate-spin"></div>
                          <span className="text-sm font-medium text-slate-600">
                            Fetching testing samples from database...
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : filteredSamples.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="py-12 text-center text-slate-400 text-sm"
                      >
                        <div className="flex flex-col items-center justify-center gap-2">
                          <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          <span className="font-medium text-slate-500">{searchQuery ? "No testing samples found matching your search." : "No testing samples currently in queue."}</span>
                          {searchQuery && (
                            <button
                              onClick={() => setSearchQuery("")}
                              className="text-xs text-blue-600 hover:underline mt-1 cursor-pointer font-medium"
                            >
                              Clear search filter
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredSamples.map((s) => {
                      const isOverdue = isTestingSampleOverdue(s);
                      return (
                        <React.Fragment key={s.id}>
                        <tr
                          key={s.id}
                          onClick={() => handleOpenEnterResults(s)}
                          className={`transition-colors cursor-pointer ${
                            isOverdue
                              ? "bg-rose-50/40 hover:bg-rose-50/70 border-l-4 border-l-rose-500"
                              : "hover:bg-slate-50/70"
                          }`}
                        >
                          <td className="py-5 px-8 whitespace-nowrap">
                            <span className="font-mono text-slate-900 text-sm font-semibold">
                              {s.barcode || s.sampleId}
                            </span>
                          </td>
                          <td className="py-5 px-6 whitespace-nowrap">
                            <span className="font-semibold text-slate-900 block">
                              {s.patientName}
                            </span>
                            <span className="text-[11px] text-slate-400 font-mono">
                              {s.patientId}
                            </span>
                          </td>
                          <td className="py-5 px-6 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 block text-sm">
                                {s.testName}
                              </span>
                              {isOverdue && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-rose-600 text-white tracking-wide uppercase">
                                  OVERDUE
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                              {s.sampleType && <span className="font-medium">{s.sampleType}</span>}
                              {s.targetDate && (
                                <span className={`font-semibold ${isOverdue ? "text-rose-700" : "text-slate-500"}`}>
                                  · Target: {s.targetDate}
                                </span>
                              )}
                            </div>
                            {s.testResult && (
                              <span className="text-[11px] text-slate-600 block truncate max-w-xs mt-1 font-mono bg-slate-50 px-2 py-0.5 rounded border border-slate-200/60">
                                {s.testResult}
                              </span>
                            )}
                          </td>

                          {/* DEDICATED COLUMN: PARAMETERS, UNITS & REFERENCE RANGE (FROM DB) */}
                          <td className="py-4 px-6 align-top">
                            {s.parameters && s.parameters.length > 0 ? (
                              <div className="flex flex-col gap-1.5 min-w-[260px]">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                                    <span>{s.parameters.length} Parameter{s.parameters.length !== 1 ? "s" : ""}</span>
                                    {s.unit && <span className="text-indigo-500 font-mono font-medium">({s.unit})</span>}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExpandedSampleId((prev) => (prev === s.id ? null : s.id));
                                    }}
                                    className="px-2 py-0.5 bg-white hover:bg-indigo-50 text-indigo-600 border border-indigo-200 hover:border-indigo-300 rounded text-[11px] font-semibold cursor-pointer inline-flex items-center gap-1 transition-all"
                                  >
                                    <span>{expandedSampleId === s.id ? "Hide Details" : "View Details"}</span>
                                    <svg className={`w-3 h-3 transition-transform ${expandedSampleId === s.id ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                    </svg>
                                  </button>
                                </div>

                                {/* Preview top 2 parameters with unit and range */}
                                <div className="space-y-1 bg-slate-50/80 p-2 rounded-lg border border-slate-200/80 text-[11px]">
                                  {s.parameters.slice(0, 2).map((p, pIdx) => (
                                    <div key={p.id || pIdx} className="flex items-center justify-between gap-2">
                                      <span className="font-semibold text-slate-800 truncate max-w-[130px]">{p.parameter}</span>
                                      <span className="font-mono font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 text-[10px] shrink-0">
                                        {p.referenceRange || "Normal"} {p.unit}
                                      </span>
                                    </div>
                                  ))}
                                  {s.parameters.length > 2 && (
                                    <div className="text-[10px] text-slate-400 font-medium pt-0.5 text-right">
                                      + {s.parameters.length - 2} more parameter{s.parameters.length - 2 !== 1 ? "s" : ""} in database
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : s.expectedRange ? (
                              <div className="flex flex-col gap-1">
                                <span className="text-xs font-semibold text-slate-800">{s.testName}</span>
                                <div className="flex items-center gap-1.5">
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs">
                                    <span className="text-[10px] uppercase font-sans text-emerald-600 font-semibold">Ref:</span>
                                    {s.expectedRange}
                                  </span>
                                  {s.unit && (
                                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 font-mono">
                                      {s.unit}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-300 font-mono text-xs">—</span>
                            )}
                          </td>

                        <td className="py-5 px-6 text-slate-700 text-xs font-normal whitespace-nowrap">
                          {s.analyzerBench}
                        </td>
                        <td className="py-5 px-8 text-center whitespace-nowrap">
                          {s.status === "COMPLETED" ? (
                            <span className="inline-block px-4 py-1.5 rounded-full text-xs font-bold tracking-wider bg-[#bbf7d0] text-[#15803d]">
                              COMPLETED
                            </span>
                          ) : s.status === "RUNNING" ? (
                            <span className="inline-block px-4 py-1.5 rounded-full text-xs font-bold tracking-wider bg-[#dbeafe] text-[#1e40af]">
                              RUNNING
                            </span>
                          ) : s.status === "FLAGGED" ? (
                            <span
                              className="inline-block px-4 py-1.5 rounded-full text-xs font-bold tracking-wider bg-[#fee2e2] text-[#991b1b]"
                              title={s.criticalAlert}
                            >
                              FLAGGED
                            </span>
                          ) : (
                            <span className="inline-block px-4 py-1.5 rounded-full text-xs font-bold tracking-wider bg-[#faecc5] text-[#715e17]">
                              CALIBRATING
                            </span>
                          )}
                        </td>
                        <td className="py-5 px-4 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-2">
                            {s.status !== "COMPLETED" && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenEnterResults(s);
                                }}
                                className="px-3 py-1.5 bg-[#00875A] hover:bg-[#00744E] text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
                              >
                                Enter Results
                              </button>
                            )}
                            {s.status === "RUNNING" && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenMarkCompleted(s);
                                }}
                                className="px-3 py-1.5 bg-[#16a34a] hover:bg-[#15803d] text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
                              >
                                Mark Completed
                              </button>
                            )}
                            {s.status === "FLAGGED" && (
                              <>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRerunTest(s.id);
                                  }}
                                  className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
                                >
                                  Rerun
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenMarkCompleted(s);
                                  }}
                                  className="px-3 py-1.5 bg-[#16a34a] hover:bg-[#15803d] text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
                                >
                                  Mark Completed
                                </button>
                              </>
                            )}
                            {s.status === "COMPLETED" && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenEnterResults(s);
                                }}
                                className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-[#15803d] border border-emerald-200 text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
                              >
                                Edit Results
                              </button>
                            )}
                            {s.status === "CALIBRATING" && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRerunTest(s.id);
                                }}
                                className="px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-600 hover:text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
                              >
                                Start Run
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                        {/* EXPANDABLE INLINE PARAMETER TABLE FOR EACH SAMPLE */}
                        {expandedSampleId === s.id && s.parameters && s.parameters.length > 0 && (
                          <tr key={`${s.id}-expanded`} className="bg-slate-50/95 border-b border-indigo-100 animate-fadeIn">
                            <td colSpan={7} className="p-4 px-8">
                              <section
                                className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs"
                                data-purpose="test-parameters-table"
                              >
                                {/* Section Top Header */}
                                <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-white">
                                  <div className="flex items-center gap-2.5">
                                    <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                                      Test Parameters & Observations
                                    </h3>
                                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200">
                                      {s.parameters.length} Parameter{s.parameters.length !== 1 ? "s" : ""}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <p className="text-xs text-slate-500 hidden sm:block">
                                      Enter observation or select quick options. Abnormal flags are evaluated in real time.
                                    </p>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenEnterResults(s)}
                                      className="px-3 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-md text-xs font-bold cursor-pointer transition-colors shadow-2xs"
                                    >
                                      Open Enter Results Modal
                                    </button>
                                  </div>
                                </div>

                                <div className="overflow-x-auto">
                                  <table className="w-full text-left border-collapse text-sm">
                                    {/* Table Header matching Enter Results */}
                                    <thead>
                                      <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold tracking-wider text-slate-600 uppercase">
                                        <th className="py-3 px-5 font-bold w-[26%] min-w-[180px]" scope="col">
                                          PARAMETER
                                        </th>
                                        <th className="py-3 px-5 font-bold w-[34%] min-w-[260px]" scope="col">
                                          OBSERVED RESULT
                                        </th>
                                        <th className="py-3 px-4 font-bold text-center w-[12%] min-w-[90px]" scope="col">
                                          UNIT
                                        </th>
                                        <th className="py-3 px-4 font-bold text-center w-[16%] min-w-[130px]" scope="col">
                                          REFERENCE RANGE
                                        </th>
                                        <th className="py-3 px-4 font-bold text-center w-[12%] min-w-[110px]" scope="col">
                                          ALERT / FLAG
                                        </th>
                                      </tr>
                                    </thead>
                                    {/* Table Body */}
                                    <tbody className="divide-y divide-slate-100 text-[13px] text-slate-800">
                                      {s.parameters.map((param, pIdx) => (
                                        <tr
                                          key={param.id || pIdx}
                                          className="hover:bg-slate-50/60 transition-colors"
                                        >
                                          {/* Parameter Name */}
                                          <td className="py-3.5 px-5 text-slate-900 font-semibold align-top">
                                            <div className="flex items-start gap-2 pt-1">
                                              <span className="text-[11px] font-mono text-slate-400 font-bold shrink-0 mt-0.5">
                                                {pIdx + 1}.
                                              </span>
                                              <div>
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                  <span className="block leading-snug">{param.parameter}</span>
                                                  {param.gender && param.gender !== "All" && (
                                                    <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                                      {param.gender}
                                                    </span>
                                                  )}
                                                </div>
                                                {param.resultComment && (
                                                  <span className="text-[11px] text-slate-400 block mt-0.5 italic">
                                                    {param.resultComment}
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                          </td>

                                          {/* Observed Result Input & Quick Option Pills */}
                                          <td className="py-3 px-5 align-top">
                                            <div className="space-y-1.5">
                                              <input
                                                type={param.inputType === "numeric" ? "text" : "text"}
                                                inputMode={param.inputType === "numeric" ? "decimal" : undefined}
                                                value={param.result}
                                                onChange={(e) =>
                                                  handleInlineParameterResultChange(
                                                    s.id,
                                                    param.id,
                                                    e.target.value
                                                  )
                                                }
                                                placeholder={
                                                  param.inputType === "numeric"
                                                    ? "Enter numeric value..."
                                                    : param.options && param.options.length > 0
                                                    ? "Select option below or type result..."
                                                    : "Enter observation..."
                                                }
                                                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-[13px] font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all shadow-2xs font-mono"
                                              />

                                              {/* Quick-Pill Buttons (for qualitative tests) */}
                                              {param.options && param.options.length > 0 && (
                                                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                                                  {param.options.map((opt) => {
                                                    const isSelected = (param.result || "").trim().toLowerCase() === opt.toLowerCase();
                                                    const isAbnormalOpt = [
                                                      "positive",
                                                      "reactive",
                                                      "present",
                                                      "trace",
                                                      "1+",
                                                      "2+",
                                                      "3+",
                                                      "4+",
                                                      "turbid",
                                                      "cloudy"
                                                    ].some((m) => opt.toLowerCase().includes(m));

                                                    return (
                                                      <button
                                                        key={opt}
                                                        type="button"
                                                        onClick={() => handleInlineParameterResultChange(s.id, param.id, opt)}
                                                        className={`px-2.5 py-0.5 rounded text-[11px] font-semibold transition-all cursor-pointer border ${
                                                          isSelected
                                                            ? isAbnormalOpt
                                                              ? "bg-rose-50 text-rose-700 border-rose-300 shadow-2xs font-bold ring-1 ring-rose-400"
                                                              : "bg-teal-50 text-teal-700 border-teal-300 shadow-2xs font-bold ring-1 ring-teal-400"
                                                            : "bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200"
                                                        }`}
                                                      >
                                                        {opt}
                                                      </button>
                                                    );
                                                  })}
                                                </div>
                                              )}
                                            </div>
                                          </td>

                                          {/* Unit */}
                                          <td className="py-3.5 px-4 text-center text-xs font-semibold text-slate-600 align-top pt-4">
                                            {param.unit ? (
                                              <span className="px-2 py-0.5 rounded bg-slate-50 border border-slate-200/80 inline-block">
                                                {param.unit}
                                              </span>
                                            ) : (
                                              <span className="text-slate-300">—</span>
                                            )}
                                          </td>

                                          {/* Reference Range */}
                                          <td className="py-3.5 px-4 text-center text-xs font-mono text-slate-700 align-top pt-4">
                                            {param.referenceRange ? (
                                              <span className="px-2 py-0.5 rounded bg-slate-50 border border-slate-200/80 inline-block font-semibold">
                                                {param.referenceRange}
                                              </span>
                                            ) : (
                                              <span className="text-slate-300">—</span>
                                            )}
                                          </td>

                                          {/* Alert / Flag Badge */}
                                          <td className="py-3.5 px-4 text-center align-top pt-3.5">
                                            {!param.result || param.result.trim() === "" ? (
                                              <span className="text-slate-300 text-xs font-medium">—</span>
                                            ) : param.abnormalFlag === "CRITICAL" ? (
                                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300 animate-pulse">
                                                <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                                                Critical
                                              </span>
                                            ) : param.abnormalFlag === "HIGH" ? (
                                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-300">
                                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                                High ↑
                                              </span>
                                            ) : param.abnormalFlag === "LOW" ? (
                                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-300">
                                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                                Low ↓
                                              </span>
                                            ) : param.abnormalFlag === "BORDERLINE" ? (
                                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-50 text-yellow-800 border border-yellow-300">
                                                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                                                Borderline
                                              </span>
                                            ) : (
                                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                Normal
                                              </span>
                                            )}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </section>
                            </td>
                          </tr>
                        )}
                        </React.Fragment>
                      );
                    })
                    )}
                  </tbody>
              </table>
            </div>
            {/* END: TableContent */}
          </section>
        </main>
      )}
      </div>
    </div>
  );
}