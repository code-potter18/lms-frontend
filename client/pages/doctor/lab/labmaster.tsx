import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  X,
  ChevronDown,
  ChevronRight,
  Filter,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Layers,
  Activity,
  Sliders,
  Info,
  RotateCcw,
} from "lucide-react";
import LabNav from "./labnav";
import { LabNotificationBell } from "@/components/hms/LabNotificationBell";
import { UserProfileDropdown } from "@/components/ui/User_profile_dropdown";
import { toast } from "@/hooks/use-toast";
import { getUser, remove } from "@/utils/token";
import { labTestMasterApi, LabTestMasterRecord } from "@/api/labTestMaster.api";

// ============================================================================
// DATA TYPES
// ============================================================================

export interface MasterParameter {
  id: string;
  name: string;
  unit: string;
  valueType: "numeric" | "qualitative";
  refRangeLow?: number | string;
  refRangeHigh?: number | string;
  refRangeText?: string;
  criticalLow?: number | string;
  criticalHigh?: number | string;
  gender: "Both" | "Male" | "Female";
  ageMin?: number;
  ageMax?: number;
  sortOrder: number;
  remarks?: string;
}

export interface MasterTest {
  id: string;
  testCode: string;
  testName: string;
  category: string;
  sampleType: string;
  tubeCapColor: string;
  tubeCapHex: string;
  requiredVolume: string;
  tatHours: number;
  price: number;
  status: "ACTIVE" | "INACTIVE";
  parameters: MasterParameter[];
  description?: string;
  updatedAt?: string;
}

// Common Laboratory Container Tube Colors
export const TUBE_CAP_OPTIONS = [
  { name: "Lavender (EDTA)", hex: "#8a2be2", sampleType: "Whole Blood" },
  { name: "Plain Red (No Additive)", hex: "#dc2626", sampleType: "Serum" },
  { name: "Yellow (SST / Gel)", hex: "#eab308", sampleType: "Serum" },
  { name: "Grey (Sodium Fluoride)", hex: "#6b7280", sampleType: "Fluoride Plasma" },
  { name: "Light Blue (Sodium Citrate)", hex: "#0284c7", sampleType: "Citrated Plasma" },
  { name: "Green (Heparin)", hex: "#16a34a", sampleType: "Heparinized Blood" },
  { name: "Sterile Container", hex: "#0ea5e9", sampleType: "Urine / Body Fluid" },
];

export const COMMON_UNITS = [
  "g/dL",
  "cells/µL",
  "million/µL",
  "%",
  "fL",
  "pg",
  "mg/dL",
  "U/L",
  "µIU/mL",
  "ng/mL",
  "mEq/L",
  "mmol/L",
  "µg/dL",
  "mm/hr",
  "ratio",
  "titer",
];

export const CATEGORY_OPTIONS = [
  "Hematology",
  "Clinical Biochemistry",
  "Clinical Pathology",
  "Immunoassay & Endocrinology",
  "Serology & Immunology",
  "Microbiology",
  "Coagulation",
];

// ============================================================================
// PREPOPULATED CLINICAL TEST CATALOG (Standard Accredited Clinical Master)
// ============================================================================

export const PREPOPULATED_MASTER_TESTS: MasterTest[] = [
  {
    id: "test-cbc-01",
    testCode: "HEM-CBC-01",
    testName: "Complete Blood Count (CBC)",
    category: "Hematology",
    sampleType: "Whole Blood",
    tubeCapColor: "Lavender (EDTA)",
    tubeCapHex: "#8a2be2",
    requiredVolume: "2.0 mL",
    tatHours: 2,
    price: 350,
    status: "ACTIVE",
    description: "Evaluates overall health and detects an array of disorders, including anemia, infection and leukemia.",
    parameters: [
      { id: "p1", name: "Hemoglobin", unit: "g/dL", valueType: "numeric", refRangeLow: 13.0, refRangeHigh: 17.0, refRangeText: "13.0 - 17.0 g/dL", criticalLow: 7.0, criticalHigh: 20.0, gender: "Both", sortOrder: 1 },
      { id: "p2", name: "Total WBC Count (TC)", unit: "cells/µL", valueType: "numeric", refRangeLow: 4000, refRangeHigh: 11000, refRangeText: "4,000 - 11,000", criticalLow: 2000, criticalHigh: 30000, gender: "Both", sortOrder: 2 },
      { id: "p3", name: "RBC Count", unit: "million/µL", valueType: "numeric", refRangeLow: 4.5, refRangeHigh: 5.5, refRangeText: "4.5 - 5.5 million/µL", criticalLow: 2.5, criticalHigh: 7.0, gender: "Both", sortOrder: 3 },
      { id: "p4", name: "PCV / Hematocrit", unit: "%", valueType: "numeric", refRangeLow: 40.0, refRangeHigh: 50.0, refRangeText: "40.0 - 50.0 %", criticalLow: 20.0, criticalHigh: 60.0, gender: "Both", sortOrder: 4 },
      { id: "p5", name: "MCV", unit: "fL", valueType: "numeric", refRangeLow: 83.0, refRangeHigh: 101.0, refRangeText: "83.0 - 101.0 fL", criticalLow: 65.0, criticalHigh: 120.0, gender: "Both", sortOrder: 5 },
      { id: "p6", name: "MCH", unit: "pg", valueType: "numeric", refRangeLow: 27.0, refRangeHigh: 32.0, refRangeText: "27.0 - 32.0 pg", gender: "Both", sortOrder: 6 },
      { id: "p7", name: "MCHC", unit: "g/dL", valueType: "numeric", refRangeLow: 31.5, refRangeHigh: 34.5, refRangeText: "31.5 - 34.5 g/dL", gender: "Both", sortOrder: 7 },
      { id: "p8", name: "Platelet Count", unit: "cells/µL", valueType: "numeric", refRangeLow: 150000, refRangeHigh: 450000, refRangeText: "150,000 - 450,000", criticalLow: 30000, criticalHigh: 1000000, gender: "Both", sortOrder: 8 },
      { id: "p9", name: "Neutrophils", unit: "%", valueType: "numeric", refRangeLow: 40.0, refRangeHigh: 70.0, refRangeText: "40 - 70 %", gender: "Both", sortOrder: 9 },
      { id: "p10", name: "Lymphocytes", unit: "%", valueType: "numeric", refRangeLow: 20.0, refRangeHigh: 40.0, refRangeText: "20 - 40 %", gender: "Both", sortOrder: 10 },
      { id: "p11", name: "Monocytes", unit: "%", valueType: "numeric", refRangeLow: 2.0, refRangeHigh: 8.0, refRangeText: "2 - 8 %", gender: "Both", sortOrder: 11 },
      { id: "p12", name: "Eosinophils", unit: "%", valueType: "numeric", refRangeLow: 1.0, refRangeHigh: 6.0, refRangeText: "1 - 6 %", gender: "Both", sortOrder: 12 },
    ],
  },
  {
    id: "test-lft-02",
    testCode: "BIO-LFT-02",
    testName: "Liver Function Test (LFT)",
    category: "Clinical Biochemistry",
    sampleType: "Serum",
    tubeCapColor: "Yellow (SST / Gel)",
    tubeCapHex: "#eab308",
    requiredVolume: "3.0 mL",
    tatHours: 4,
    price: 650,
    status: "ACTIVE",
    description: "Evaluates hepatic function, protein synthesis, biliary excretion, and hepatocellular injury.",
    parameters: [
      { id: "lft1", name: "Bilirubin Total", unit: "mg/dL", valueType: "numeric", refRangeLow: 0.2, refRangeHigh: 1.2, refRangeText: "0.2 - 1.2 mg/dL", criticalHigh: 15.0, gender: "Both", sortOrder: 1 },
      { id: "lft2", name: "Bilirubin Direct", unit: "mg/dL", valueType: "numeric", refRangeLow: 0.0, refRangeHigh: 0.3, refRangeText: "0.0 - 0.3 mg/dL", criticalHigh: 5.0, gender: "Both", sortOrder: 2 },
      { id: "lft3", name: "SGOT / AST", unit: "U/L", valueType: "numeric", refRangeLow: 5, refRangeHigh: 40, refRangeText: "5 - 40 U/L", criticalHigh: 400, gender: "Both", sortOrder: 3 },
      { id: "lft4", name: "SGPT / ALT", unit: "U/L", valueType: "numeric", refRangeLow: 7, refRangeHigh: 56, refRangeText: "7 - 56 U/L", criticalHigh: 400, gender: "Both", sortOrder: 4 },
      { id: "lft5", name: "Alkaline Phosphatase (ALP)", unit: "U/L", valueType: "numeric", refRangeLow: 44, refRangeHigh: 147, refRangeText: "44 - 147 U/L", gender: "Both", sortOrder: 5 },
      { id: "lft6", name: "Total Protein", unit: "g/dL", valueType: "numeric", refRangeLow: 6.0, refRangeHigh: 8.3, refRangeText: "6.0 - 8.3 g/dL", criticalLow: 4.5, gender: "Both", sortOrder: 6 },
      { id: "lft7", name: "Serum Albumin", unit: "g/dL", valueType: "numeric", refRangeLow: 3.5, refRangeHigh: 5.2, refRangeText: "3.5 - 5.2 g/dL", criticalLow: 2.0, gender: "Both", sortOrder: 7 },
    ],
  },
  {
    id: "test-rft-03",
    testCode: "BIO-RFT-03",
    testName: "Renal Function Test (RFT / KFT)",
    category: "Clinical Biochemistry",
    sampleType: "Serum",
    tubeCapColor: "Plain Red (No Additive)",
    tubeCapHex: "#dc2626",
    requiredVolume: "3.0 mL",
    tatHours: 3,
    price: 550,
    status: "ACTIVE",
    description: "Assesses glomerular filtration, renal clearance, and serum electrolyte balances.",
    parameters: [
      { id: "rft1", name: "Blood Urea", unit: "mg/dL", valueType: "numeric", refRangeLow: 15, refRangeHigh: 45, refRangeText: "15 - 45 mg/dL", criticalHigh: 100, gender: "Both", sortOrder: 1 },
      { id: "rft2", name: "Serum Creatinine", unit: "mg/dL", valueType: "numeric", refRangeLow: 0.6, refRangeHigh: 1.2, refRangeText: "0.6 - 1.2 mg/dL", criticalHigh: 4.0, gender: "Both", sortOrder: 2 },
      { id: "rft3", name: "Serum Uric Acid", unit: "mg/dL", valueType: "numeric", refRangeLow: 3.5, refRangeHigh: 7.2, refRangeText: "3.5 - 7.2 mg/dL", gender: "Both", sortOrder: 3 },
      { id: "rft4", name: "Sodium (Na+)", unit: "mEq/L", valueType: "numeric", refRangeLow: 135, refRangeHigh: 145, refRangeText: "135 - 145 mEq/L", criticalLow: 120, criticalHigh: 160, gender: "Both", sortOrder: 4 },
      { id: "rft5", name: "Potassium (K+)", unit: "mEq/L", valueType: "numeric", refRangeLow: 3.5, refRangeHigh: 5.1, refRangeText: "3.5 - 5.1 mEq/L", criticalLow: 2.8, criticalHigh: 6.2, gender: "Both", sortOrder: 5 },
    ],
  },
  {
    id: "test-lipid-04",
    testCode: "BIO-LIPID-04",
    testName: "Lipid Profile Panel",
    category: "Clinical Biochemistry",
    sampleType: "Serum (Fasting 12h)",
    tubeCapColor: "Yellow (SST / Gel)",
    tubeCapHex: "#eab308",
    requiredVolume: "3.0 mL",
    tatHours: 4,
    price: 600,
    status: "ACTIVE",
    description: "Measures circulating lipoproteins to screen for cardiovascular disease risk.",
    parameters: [
      { id: "lip1", name: "Total Cholesterol", unit: "mg/dL", valueType: "numeric", refRangeLow: 125, refRangeHigh: 200, refRangeText: "< 200 mg/dL (Desirable)", criticalHigh: 300, gender: "Both", sortOrder: 1 },
      { id: "lip2", name: "Serum Triglycerides", unit: "mg/dL", valueType: "numeric", refRangeLow: 50, refRangeHigh: 150, refRangeText: "< 150 mg/dL (Normal)", criticalHigh: 500, gender: "Both", sortOrder: 2 },
      { id: "lip3", name: "HDL Cholesterol", unit: "mg/dL", valueType: "numeric", refRangeLow: 40, refRangeHigh: 60, refRangeText: "> 40 mg/dL (Cardioprotective)", criticalLow: 25, gender: "Both", sortOrder: 3 },
      { id: "lip4", name: "LDL Cholesterol", unit: "mg/dL", valueType: "numeric", refRangeLow: 60, refRangeHigh: 100, refRangeText: "< 100 mg/dL (Optimal)", criticalHigh: 190, gender: "Both", sortOrder: 4 },
      { id: "lip5", name: "VLDL Cholesterol", unit: "mg/dL", valueType: "numeric", refRangeLow: 10, refRangeHigh: 30, refRangeText: "10 - 30 mg/dL", gender: "Both", sortOrder: 5 },
    ],
  },
  {
    id: "test-thyroid-05",
    testCode: "IMM-THY-05",
    testName: "Thyroid Profile (T3, T4, TSH)",
    category: "Immunoassay & Endocrinology",
    sampleType: "Serum",
    tubeCapColor: "Yellow (SST / Gel)",
    tubeCapHex: "#eab308",
    requiredVolume: "3.0 mL",
    tatHours: 6,
    price: 750,
    status: "ACTIVE",
    description: "Evaluates thyroid gland activity to diagnose hypo- or hyperthyroidism.",
    parameters: [
      { id: "thy1", name: "Total Triiodothyronine (T3)", unit: "ng/dL", valueType: "numeric", refRangeLow: 80, refRangeHigh: 200, refRangeText: "80 - 200 ng/dL", gender: "Both", sortOrder: 1 },
      { id: "thy2", name: "Total Thyroxine (T4)", unit: "µg/dL", valueType: "numeric", refRangeLow: 5.1, refRangeHigh: 14.1, refRangeText: "5.1 - 14.1 µg/dL", gender: "Both", sortOrder: 2 },
      { id: "thy3", name: "Thyroid Stimulating Hormone (TSH)", unit: "µIU/mL", valueType: "numeric", refRangeLow: 0.35, refRangeHigh: 4.94, refRangeText: "0.35 - 4.94 µIU/mL", criticalLow: 0.05, criticalHigh: 25.0, gender: "Both", sortOrder: 3 },
    ],
  },
  {
    id: "test-glycemic-06",
    testCode: "BIO-GLYC-06",
    testName: "Glycemic Index & HbA1c Panel",
    category: "Clinical Biochemistry",
    sampleType: "Fluoride Plasma & Whole Blood",
    tubeCapColor: "Grey (Sodium Fluoride)",
    tubeCapHex: "#6b7280",
    requiredVolume: "2.0 mL",
    tatHours: 2,
    price: 500,
    status: "ACTIVE",
    description: "Evaluates acute blood glucose and long-term glycemic control over past 3 months.",
    parameters: [
      { id: "gly1", name: "Fasting Blood Glucose (FBS)", unit: "mg/dL", valueType: "numeric", refRangeLow: 70, refRangeHigh: 99, refRangeText: "70 - 99 mg/dL (Normal)", criticalLow: 50, criticalHigh: 400, gender: "Both", sortOrder: 1 },
      { id: "gly2", name: "Glycated Hemoglobin (HbA1c)", unit: "%", valueType: "numeric", refRangeLow: 4.0, refRangeHigh: 5.6, refRangeText: "< 5.7 % (Normal), 5.7-6.4 (Prediabetes)", criticalHigh: 13.0, gender: "Both", sortOrder: 2 },
    ],
  },
  {
    id: "test-urine-07",
    testCode: "PAT-URINE-07",
    testName: "Urine Routine & Microscopy",
    category: "Clinical Pathology",
    sampleType: "Fresh Mid-Stream Urine",
    tubeCapColor: "Sterile Container",
    tubeCapHex: "#0ea5e9",
    requiredVolume: "15.0 mL",
    tatHours: 1,
    price: 200,
    status: "ACTIVE",
    description: "Physical, chemical, and microscopic examination for renal pathology, UTIs, and metabolic disorders.",
    parameters: [
      { id: "urn1", name: "Color", unit: "", valueType: "qualitative", refRangeText: "Pale Yellow / Straw", gender: "Both", sortOrder: 1 },
      { id: "urn2", name: "Transparency / Appearance", unit: "", valueType: "qualitative", refRangeText: "Clear", gender: "Both", sortOrder: 2 },
      { id: "urn3", name: "pH", unit: "", valueType: "numeric", refRangeLow: 4.5, refRangeHigh: 8.0, refRangeText: "4.5 - 8.0", gender: "Both", sortOrder: 3 },
      { id: "urn4", name: "Specific Gravity", unit: "", valueType: "numeric", refRangeLow: 1.005, refRangeHigh: 1.030, refRangeText: "1.005 - 1.030", gender: "Both", sortOrder: 4 },
      { id: "urn5", name: "Urine Protein / Albumin", unit: "", valueType: "qualitative", refRangeText: "Nil / Negative", criticalHigh: 1, gender: "Both", sortOrder: 5 },
      { id: "urn6", name: "Urine Glucose", unit: "", valueType: "qualitative", refRangeText: "Nil / Negative", gender: "Both", sortOrder: 6 },
      { id: "urn7", name: "Pus Cells (WBC)", unit: "/HPF", valueType: "numeric", refRangeLow: 0, refRangeHigh: 5, refRangeText: "0 - 5 / HPF", criticalHigh: 25, gender: "Both", sortOrder: 7 },
      { id: "urn8", name: "Red Blood Cells (RBC)", unit: "/HPF", valueType: "numeric", refRangeLow: 0, refRangeHigh: 2, refRangeText: "0 - 2 / HPF", criticalHigh: 10, gender: "Both", sortOrder: 8 },
    ],
  },
];

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function LabMaster() {
  const navigate = useNavigate();
  const currentUser = getUser();
  const displayName = currentUser?.username || "Labtech";
  const displayRole =
    currentUser?.role_type === "LAB_TECHNICIAN"
      ? "Lab Technician"
      : currentUser?.role_type || "Lab In-Charge";

  const handleLogout = () => {
    remove();
    navigate("/", { replace: true });
  };

  // Master Test State
  const [tests, setTests] = useState<MasterTest[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("hms_lab_master_tests");
        if (stored) {
          const parsed: MasterTest[] = JSON.parse(stored);
          return parsed.map((t) => ({
            ...t,
            testCode: (t.testCode || "").replace(/-COPY/gi, ""),
            testName: (t.testName || "").replace(/\s*\(Copy\)/gi, ""),
          }));
        }
      } catch (e) {
        console.error("Error reading stored lab master tests:", e);
      }
    }
    return PREPOPULATED_MASTER_TESTS;
  });

  const [expandedTestIds, setExpandedTestIds] = useState<Set<string>>(
    new Set(["test-cbc-01"])
  );

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");

  // Drawer (Sheet) State
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingTestId, setEditingTestId] = useState<string | null>(null);

  // Form State inside Drawer
  const [formTestCode, setFormTestCode] = useState("");
  const [formTestName, setFormTestName] = useState("");
  const [formCategory, setFormCategory] = useState("Hematology");
  const [formSampleType, setFormSampleType] = useState("Whole Blood");
  const [formTubeCap, setFormTubeCap] = useState("Lavender (EDTA)");
  const [formRequiredVolume, setFormRequiredVolume] = useState("2.0 mL");
  const [formTatHours, setFormTatHours] = useState<number>(2);
  const [formPrice, setFormPrice] = useState<number>(350);
  const [formStatus, setFormStatus] = useState<"ACTIVE" | "INACTIVE">("ACTIVE");
  const [formDescription, setFormDescription] = useState("");
  const [formParameters, setFormParameters] = useState<MasterParameter[]>([]);

  // Sync to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("hms_lab_master_tests", JSON.stringify(tests));
      } catch (e) {
        console.error("Failed to save lab master tests to storage:", e);
      }
    }
  }, [tests]);

  // Load from backend if available
  useEffect(() => {
    async function fetchBackendTests() {
      try {
        const res = await labTestMasterApi.getAll();
        if (res.data?.success && Array.isArray(res.data.data) && res.data.data.length > 0) {
          // Merge with prepopulated
          const backendList = res.data.data;
          setTests((prev) => {
            const codeMap = new Map(prev.map((t) => [t.testCode, t]));
            backendList.forEach((b: any) => {
              const matchedTube = TUBE_CAP_OPTIONS.find((tc) =>
                (b.sample_type || "").toLowerCase().includes(tc.sampleType.toLowerCase())
              );
              codeMap.set(b.test_code || b.lab_test_id, {
                id: b.lab_test_id,
                testCode: b.test_code,
                testName: b.test_name,
                category: b.lab_test_category?.category_name || "General Diagnostics",
                sampleType: b.sample_type || "Blood",
                tubeCapColor: matchedTube?.name || "Plain Red (No Additive)",
                tubeCapHex: matchedTube?.hex || "#dc2626",
                requiredVolume: b.required_volume || "2.0 mL",
                tatHours: b.tat_hours || 4,
                price: Number(b.price || 400),
                status: b.test_status === 0 ? "INACTIVE" : "ACTIVE",
                description: b.includes_details || "Configured Diagnostic Test",
                parameters: b.lab_test_parameter && b.lab_test_parameter.length > 0
                  ? b.lab_test_parameter.map((p: any, idx: number) => ({
                      id: p.lab_test_parameter_id || `param-${idx}`,
                      name: p.parameter_name,
                      unit: p.unit || "",
                      valueType: p.ref_range_text ? "qualitative" : "numeric",
                      refRangeLow: p.ref_range_low !== null ? Number(p.ref_range_low) : undefined,
                      refRangeHigh: p.ref_range_high !== null ? Number(p.ref_range_high) : undefined,
                      refRangeText: p.ref_range_text || `${p.ref_range_low ?? ""} - ${p.ref_range_high ?? ""}`,
                      criticalLow: p.critical_low !== null ? Number(p.critical_low) : undefined,
                      criticalHigh: p.critical_high !== null ? Number(p.critical_high) : undefined,
                      gender: (p.gender as any) || "Both",
                      sortOrder: p.sort_order || idx + 1,
                    }))
                  : codeMap.get(b.test_code)?.parameters || [],
              });
            });
            return Array.from(codeMap.values());
          });
        }
      } catch (err) {
        // Fallback gracefully to prepopulated local catalog
      }
    }
    fetchBackendTests();
  }, []);

  // Filtered Tests
  const filteredTests = useMemo(() => {
    return tests.filter((t) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        t.testName.toLowerCase().includes(q) ||
        t.testCode.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.parameters.some((p) => p.name.toLowerCase().includes(q));

      const matchesCat =
        selectedCategory === "ALL" ||
        t.category.toLowerCase() === selectedCategory.toLowerCase();

      const matchesStatus =
        selectedStatus === "ALL" || t.status === selectedStatus;

      return matchesSearch && matchesCat && matchesStatus;
    });
  }, [tests, searchQuery, selectedCategory, selectedStatus]);

  // Overall Statistics
  const stats = useMemo(() => {
    const totalTests = tests.length;
    const totalParams = tests.reduce((acc, t) => acc + t.parameters.length, 0);
    const activeTests = tests.filter((t) => t.status === "ACTIVE").length;
    const categoriesCount = new Set(tests.map((t) => t.category)).size;
    const criticalParamsCount = tests.reduce(
      (acc, t) =>
        acc +
        t.parameters.filter((p) => p.criticalLow !== undefined || p.criticalHigh !== undefined).length,
      0
    );

    return { totalTests, totalParams, activeTests, categoriesCount, criticalParamsCount };
  }, [tests]);

  // Toggle Row Accordion
  const toggleRowExpansion = (testId: string) => {
    setExpandedTestIds((prev) => {
      const next = new Set(prev);
      if (next.has(testId)) {
        next.delete(testId);
      } else {
        next.add(testId);
      }
      return next;
    });
  };

  // Open Drawer in "Create" Mode
  const handleOpenCreateDrawer = () => {
    const newCode = `TEST-${Math.floor(1000 + Math.random() * 9000)}`;
    setEditingTestId(null);
    setFormTestCode(newCode);
    setFormTestName("");
    setFormCategory("Hematology");
    setFormSampleType("Whole Blood");
    setFormTubeCap("Lavender (EDTA)");
    setFormRequiredVolume("2.0 mL");
    setFormTatHours(2);
    setFormPrice(400);
    setFormStatus("ACTIVE");
    setFormDescription("");
    setFormParameters([
      {
        id: `p-${Date.now()}-1`,
        name: "",
        unit: "g/dL",
        valueType: "numeric",
        refRangeLow: 0,
        refRangeHigh: 10,
        refRangeText: "0 - 10",
        gender: "Both",
        sortOrder: 1,
      },
    ]);
    setIsDrawerOpen(true);
  };

  // Open Drawer in "Edit" Mode
  const handleOpenEditDrawer = (test: MasterTest) => {
    setEditingTestId(test.id);
    setFormTestCode(test.testCode);
    setFormTestName(test.testName);
    setFormCategory(test.category);
    setFormSampleType(test.sampleType);
    setFormTubeCap(test.tubeCapColor);
    setFormRequiredVolume(test.requiredVolume);
    setFormTatHours(test.tatHours);
    setFormPrice(test.price);
    setFormStatus(test.status);
    setFormDescription(test.description || "");
    setFormParameters(
      test.parameters.map((p) => ({ ...p }))
    );
    setIsDrawerOpen(true);
  };



  // Toggle Test Status
  const handleToggleStatus = (testId: string) => {
    setTests((prev) =>
      prev.map((t) =>
        t.id === testId
          ? { ...t, status: t.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" }
          : t
      )
    );
  };

  // Delete Test
  const handleDeleteTest = (testId: string, testName: string) => {
    if (confirm(`Are you sure you want to remove "${testName}" from the diagnostic master?`)) {
      setTests((prev) => prev.filter((t) => t.id !== testId));
      toast({
        title: "Test Removed",
        description: `Removed "${testName}" from the active diagnostic master catalog.`,
      });
    }
  };

  // Parameter Builder actions inside Drawer
  const handleAddParameterRow = () => {
    const newParam: MasterParameter = {
      id: `p-${Date.now()}-${Math.random()}`,
      name: "",
      unit: "mg/dL",
      valueType: "numeric",
      refRangeLow: 0,
      refRangeHigh: 100,
      refRangeText: "",
      gender: "Both",
      sortOrder: formParameters.length + 1,
    };
    setFormParameters((prev) => [...prev, newParam]);
  };

  const handleUpdateParameterField = (
    paramId: string,
    field: keyof MasterParameter,
    value: any
  ) => {
    setFormParameters((prev) =>
      prev.map((p) => (p.id === paramId ? { ...p, [field]: value } : p))
    );
  };

  const handleRemoveParameterRow = (paramId: string) => {
    if (formParameters.length === 1) {
      toast({
        title: "Minimum Parameter Required",
        description: "A diagnostic test must have at least one diagnostic parameter.",
        variant: "destructive",
      });
      return;
    }
    setFormParameters((prev) => prev.filter((p) => p.id !== paramId));
  };

  // Save Test from Drawer
  const handleSaveTest = () => {
    if (!formTestName.trim()) {
      toast({
        title: "Test Name Required",
        description: "Please enter a valid test name.",
        variant: "destructive",
      });
      return;
    }
    if (!formTestCode.trim()) {
      toast({
        title: "Test Code Required",
        description: "Please enter a test code (e.g., HEM-CBC-01).",
        variant: "destructive",
      });
      return;
    }

    const validParameters = formParameters.filter((p) => p.name.trim().length > 0);
    if (validParameters.length === 0) {
      toast({
        title: "Parameters Required",
        description: "Please define at least one valid parameter name with its reference range.",
        variant: "destructive",
      });
      return;
    }

    const matchedCap = TUBE_CAP_OPTIONS.find((t) => t.name === formTubeCap);

    const testPayload: MasterTest = {
      id: editingTestId || `test-${Date.now()}`,
      testCode: formTestCode.trim().toUpperCase(),
      testName: formTestName.trim(),
      category: formCategory,
      sampleType: formSampleType,
      tubeCapColor: formTubeCap,
      tubeCapHex: matchedCap?.hex || "#8a2be2",
      requiredVolume: formRequiredVolume,
      tatHours: Number(formTatHours) || 2,
      price: Number(formPrice) || 300,
      status: formStatus,
      description: formDescription,
      parameters: validParameters.map((p, idx) => ({
        ...p,
        sortOrder: idx + 1,
        refRangeText:
          p.refRangeText ||
          (p.valueType === "numeric" && p.refRangeLow !== undefined && p.refRangeHigh !== undefined
            ? `${p.refRangeLow} - ${p.refRangeHigh} ${p.unit}`.trim()
            : "Normal"),
      })),
      updatedAt: new Date().toISOString(),
    };

    if (editingTestId) {
      setTests((prev) =>
        prev.map((t) => (t.id === editingTestId ? testPayload : t))
      );
      toast({
        title: "Diagnostic Test Updated",
        description: `Successfully updated "${testPayload.testName}" with ${testPayload.parameters.length} parameters.`,
      });
    } else {
      setTests((prev) => [testPayload, ...prev]);
      toast({
        title: "New Test Created",
        description: `Added "${testPayload.testName}" to diagnostic master catalog.`,
      });
    }

    setIsDrawerOpen(false);
  };

  // Reset to default NABL pre-populated catalog
  const handleResetCatalog = () => {
    if (confirm("Reset diagnostic test catalog back to standard NABL pre-populated tests and reference intervals?")) {
      setTests(PREPOPULATED_MASTER_TESTS);
      toast({
        title: "Catalog Reset Complete",
        description: "Reverted to standard pre-populated NABL diagnostic panels.",
      });
    }
  };

  // Export Catalog as JSON
  const handleExportCatalog = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(tests, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `LabMasterCatalog_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    toast({
      title: "Catalog Exported",
      description: "Diagnostic master test catalog saved to your device.",
    });
  };

  return (
    <div className="min-h-screen flex bg-[#f8fafc] text-slate-800 antialiased font-sans selection:bg-blue-100">
      {/* Global Lab Navigation Sidebar */}
      <LabNav activeTab="Lab Master" />

      {/* Main Content Area */}
      <div className="flex-1 ml-64 min-h-screen flex flex-col min-w-0 bg-[#f8fafc]">
        {/* Top Header Bar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
              <Sliders className="w-5 h-5 text-[#00488D]" />
              <span>Lab Master Configuration</span>
            </h1>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-[#00488D] border border-blue-200">
              Diagnostic Service Catalog
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleResetCatalog}
              className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition cursor-pointer inline-flex items-center gap-1.5"
              title="Restore default standard tests"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span>Reset</span>
            </button>
            <button
              type="button"
              onClick={handleExportCatalog}
              className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition cursor-pointer inline-flex items-center gap-1.5"
              title="Export Master Catalog as JSON"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-slate-500" />
              <span>Export</span>
            </button>
            <button
              type="button"
              onClick={handleOpenCreateDrawer}
              className="px-3.5 py-1.5 text-xs font-bold bg-[#00488D] hover:bg-blue-800 text-white rounded-lg shadow-xs transition cursor-pointer inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Add New Test</span>
            </button>

            <div className="h-6 w-px bg-slate-200 mx-1" />

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

        {/* Page Content */}
        <main className="p-8 space-y-6">

          {/* Metric KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Master Tests
                </p>
                <h3 className="text-2xl font-extrabold text-slate-900 mt-1">
                  {stats.totalTests}
                </h3>
                <p className="text-[11px] text-emerald-600 font-medium mt-0.5 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>{stats.activeTests} Active in Service</span>
                </p>
              </div>
              <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-[#00488D]">
                <Layers className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Configured Parameters
                </p>
                <h3 className="text-2xl font-extrabold text-slate-900 mt-1">
                  {stats.totalParams}
                </h3>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                  Across all diagnostic panels
                </p>
              </div>
              <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
                <Activity className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Departments / Categories
                </p>
                <h3 className="text-2xl font-extrabold text-slate-900 mt-1">
                  {stats.categoriesCount}
                </h3>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                  Specialty sections configured
                </p>
              </div>
              <div className="w-11 h-11 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-700">
                <Filter className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Critical Panic Thresholds
                </p>
                <h3 className="text-2xl font-extrabold text-slate-900 mt-1">
                  {stats.criticalParamsCount}
                </h3>
                <p className="text-[11px] text-rose-600 font-medium mt-0.5 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  <span>Auto-flags in Red</span>
                </p>
              </div>
              <div className="w-11 h-11 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-700">
                <AlertTriangle className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search test name, code, parameter..."
                className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
              />
            </div>

            <div className="flex items-center gap-2.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium shrink-0">
                <Filter className="w-3.5 h-3.5" />
                <span>Department:</span>
              </div>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value="ALL">All Departments</option>
                {CATEGORY_OPTIONS.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>

              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value="ALL">All Status</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>
          </div>

          {/* Test Catalog Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Diagnostic Test Catalog ({filteredTests.length})
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Click any row to expand parameters and reference intervals.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400 font-medium">
                  Showing {filteredTests.length} of {tests.length} tests
                </span>
                <button
                  type="button"
                  onClick={handleOpenCreateDrawer}
                  className="px-3 py-1.5 text-xs font-bold bg-[#00488D] hover:bg-blue-800 text-white rounded-lg shadow-xs transition cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Test</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4 w-10 text-center"></th>
                    <th className="py-3 px-4">Test Code</th>
                    <th className="py-3 px-4">Test Profile Name</th>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4">Specimen &amp; Container</th>
                    <th className="py-3 px-4 text-center">Parameters</th>
                    <th className="py-3 px-4 text-center">TAT</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredTests.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        <Layers className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-400" />
                        <p className="font-semibold text-slate-700">No diagnostic tests match your criteria</p>
                        <p className="text-xs text-slate-400 mt-1">Try adjusting your search query or department filter.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredTests.map((test) => {
                      const isExpanded = expandedTestIds.has(test.id);

                      return (
                        <React.Fragment key={test.id}>
                          <tr
                            onClick={() => toggleRowExpansion(test.id)}
                            className={`hover:bg-slate-50/70 transition-colors cursor-pointer ${
                              isExpanded ? "bg-blue-50/20" : ""
                            }`}
                          >
                            {/* Expand Chevron */}
                            <td className="py-3 px-4 text-center text-slate-400">
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-[#00488D]" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-slate-400" />
                              )}
                            </td>

                            {/* Code */}
                            <td className="py-3 px-4 font-mono font-bold text-[#00488D]">
                              {(test.testCode || "").replace(/-COPY/gi, "")}
                            </td>

                            {/* Name */}
                            <td className="py-3 px-4">
                              <span className="font-bold text-slate-900 block text-[13px]">
                                {(test.testName || "").replace(/\s*\(Copy\)/gi, "")}
                              </span>
                              {test.description && (
                                <span className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                                  {test.description}
                                </span>
                              )}
                            </td>

                            {/* Category */}
                            <td className="py-3 px-4">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                                {test.category}
                              </span>
                            </td>

                            {/* Specimen & Container */}
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <span
                                  className="w-3 h-3 rounded-full shrink-0 shadow-2xs border border-white"
                                  style={{ backgroundColor: test.tubeCapHex }}
                                  title={test.tubeCapColor}
                                />
                                <div>
                                  <span className="font-semibold text-slate-800 block text-[11.5px]">
                                    {test.sampleType}
                                  </span>
                                  <span className="text-[10.5px] text-slate-400 block">
                                    {test.tubeCapColor} • {test.requiredVolume}
                                  </span>
                                </div>
                              </div>
                            </td>

                            {/* Parameter Pill */}
                            <td className="py-3 px-4 text-center">
                              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-[#00488D] border border-blue-200">
                                {test.parameters.length} Parameters
                              </span>
                            </td>

                            {/* TAT */}
                            <td className="py-3 px-4 text-center text-slate-600 font-semibold font-mono">
                              {test.tatHours}h
                            </td>

                            {/* Status */}
                            <td
                              className="py-3 px-4 text-center"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => handleToggleStatus(test.id)}
                                className={`px-2.5 py-1 rounded-full text-[10.5px] font-bold tracking-wide uppercase transition-colors cursor-pointer ${
                                  test.status === "ACTIVE"
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                    : "bg-slate-100 text-slate-500 border border-slate-200"
                                }`}
                              >
                                {test.status}
                              </button>
                            </td>

                            {/* Actions */}
                            <td
                              className="py-3 px-4 text-right"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditDrawer(test)}
                                  className="p-1.5 text-slate-600 hover:text-[#00488D] hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                                  title="Edit Test &amp; Parameters"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteTest(test.id, test.testName)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                  title="Delete Test"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* Expanded Parameter Details Row */}
                          {isExpanded && (
                            <tr className="bg-slate-50/70 border-b border-slate-200">
                              <td colSpan={9} className="p-4 sm:px-8">
                                <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
                                  <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
                                    <span className="text-xs font-bold text-slate-800 flex items-center gap-2">
                                      <Activity className="w-4 h-4 text-[#00488D]" />
                                      Diagnostic Parameters for {test.testName} ({test.parameters.length})
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenEditDrawer(test)}
                                      className="text-xs font-bold text-[#00488D] hover:underline cursor-pointer inline-flex items-center gap-1"
                                    >
                                      <Edit2 className="w-3 h-3" />
                                      <span>Edit Parameters / Reference Values</span>
                                    </button>
                                  </div>

                                  <table className="w-full text-left text-xs">
                                    <thead>
                                      <tr className="border-b border-slate-200 text-slate-500 font-bold text-[10.5px] uppercase">
                                        <th className="py-2 px-4">#</th>
                                        <th className="py-2 px-4">Parameter Name</th>
                                        <th className="py-2 px-4 text-center">Unit</th>
                                        <th className="py-2 px-4 text-center">Biological Reference Interval (Normal)</th>
                                        <th className="py-2 px-4 text-center">Critical / Panic Alert Limit</th>
                                        <th className="py-2 px-4 text-center">Gender Target</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {test.parameters.map((p, pIdx) => (
                                        <tr key={p.id} className="hover:bg-slate-50/50">
                                          <td className="py-2 px-4 text-slate-400 font-mono text-[11px]">
                                            {pIdx + 1}
                                          </td>
                                          <td className="py-2 px-4 font-semibold text-slate-900">
                                            {p.name}
                                          </td>
                                          <td className="py-2 px-4 text-center font-mono text-slate-600">
                                            {p.unit || "—"}
                                          </td>
                                          <td className="py-2 px-4 text-center">
                                            <span className="font-semibold text-slate-800 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 font-mono">
                                              {p.refRangeText || (p.refRangeLow !== undefined && p.refRangeHigh !== undefined ? `${p.refRangeLow} - ${p.refRangeHigh}` : "Normal")}
                                            </span>
                                          </td>
                                          <td className="py-2 px-4 text-center">
                                            {p.criticalLow !== undefined || p.criticalHigh !== undefined ? (
                                              <span className="text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded font-mono">
                                                {p.criticalLow !== undefined ? `< ${p.criticalLow} ` : ""}
                                                {p.criticalHigh !== undefined ? `> ${p.criticalHigh}` : ""}
                                              </span>
                                            ) : (
                                              <span className="text-slate-400 font-mono text-[11px]">—</span>
                                            )}
                                          </td>
                                          <td className="py-2 px-4 text-center">
                                            <span className="text-[11px] font-medium text-slate-600">
                                              {p.gender}
                                            </span>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
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
          </div>
        </main>
      </div>

      {/* ==================================================================== */}
      {/* SLIDING SIDE DRAWER / SHEET FOR TEST & PARAMETERS BUILDER            */}
      {/* ==================================================================== */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden select-none">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={() => setIsDrawerOpen(false)}
          />

          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-3xl bg-white shadow-2xl flex flex-col justify-between border-l border-slate-200">
              {/* Drawer Header */}
              <div className="p-6 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <Sliders className="w-5 h-5 text-[#00488D]" />
                    <span>
                      {editingTestId ? `Edit Diagnostic Test` : `Add New Diagnostic Test`}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Configure test profile metadata, specimen containers, and individual parameter reference ranges.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer Body (Scrollable) */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* SECTION 1: Test Profile Details */}
                <div className="space-y-4 bg-slate-50/70 p-5 rounded-xl border border-slate-200">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-[#00488D]" />
                    <span>1. Test Profile Information</span>
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">
                        Test Profile Name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formTestName}
                        onChange={(e) => setFormTestName(e.target.value)}
                        placeholder="e.g. Complete Blood Count (CBC)"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-slate-700 block mb-1">
                        Test Code / SKU <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formTestCode}
                        onChange={(e) => setFormTestCode(e.target.value.toUpperCase())}
                        placeholder="e.g. HEM-CBC-01"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-slate-700 block mb-1">
                        Department / Laboratory Category
                      </label>
                      <select
                        value={formCategory}
                        onChange={(e) => setFormCategory(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer"
                      >
                        {CATEGORY_OPTIONS.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="font-bold text-slate-700 block mb-1">
                        Specimen / Sample Type
                      </label>
                      <input
                        type="text"
                        value={formSampleType}
                        onChange={(e) => setFormSampleType(e.target.value)}
                        placeholder="e.g. Whole Blood, Serum, Urine"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-slate-700 block mb-1">
                        Vacutainer Tube Cap Color
                      </label>
                      <select
                        value={formTubeCap}
                        onChange={(e) => setFormTubeCap(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer"
                      >
                        {TUBE_CAP_OPTIONS.map((tc) => (
                          <option key={tc.name} value={tc.name}>
                            {tc.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="font-bold text-slate-700 block mb-1">
                        Minimum Volume &amp; Standard TAT
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={formRequiredVolume}
                          onChange={(e) => setFormRequiredVolume(e.target.value)}
                          placeholder="e.g. 2.0 mL"
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                        <input
                          type="number"
                          value={formTatHours}
                          onChange={(e) => setFormTatHours(Number(e.target.value))}
                          placeholder="TAT (Hours)"
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* SECTION 2: Dynamic Parameters Builder */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-[#00488D]" />
                        <span>2. Diagnostic Parameters &amp; Reference Intervals ({formParameters.length})</span>
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Define normal ranges and critical panic alert cutoffs for each test parameter.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddParameterRow}
                      className="px-3 py-1.5 text-xs font-bold bg-[#00488D] text-white hover:bg-[#093a6b] rounded-lg shadow-2xs transition cursor-pointer inline-flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ Add Parameter</span>
                    </button>
                  </div>

                  {/* Parameter Rows List */}
                  <div className="space-y-3">
                    {formParameters.map((param, index) => (
                      <div
                        key={param.id}
                        className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3 relative hover:border-blue-300 transition"
                      >
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                          <span className="text-xs font-bold text-slate-700 flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-[10px] font-mono">
                              {index + 1}
                            </span>
                            <span>{param.name || `Parameter #${index + 1}`}</span>
                          </span>

                          <button
                            type="button"
                            onClick={() => handleRemoveParameterRow(param.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                            title="Remove parameter"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Parameter Fields Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                          <div>
                            <label className="font-semibold text-slate-600 block mb-1">
                              Parameter Name <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={param.name}
                              onChange={(e) => handleUpdateParameterField(param.id, "name", e.target.value)}
                              placeholder="e.g. Hemoglobin, Total Bilirubin"
                              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-medium focus:bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="font-semibold text-slate-600 block mb-1">
                              Unit of Measure
                            </label>
                            <input
                              type="text"
                              list="common-units-list"
                              value={param.unit}
                              onChange={(e) => handleUpdateParameterField(param.id, "unit", e.target.value)}
                              placeholder="e.g. g/dL, mg/dL, %"
                              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-medium focus:bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none font-mono"
                            />
                            <datalist id="common-units-list">
                              {COMMON_UNITS.map((u) => (
                                <option key={u} value={u} />
                              ))}
                            </datalist>
                          </div>

                          <div>
                            <label className="font-semibold text-slate-600 block mb-1">
                              Value Type
                            </label>
                            <select
                              value={param.valueType}
                              onChange={(e) => handleUpdateParameterField(param.id, "valueType", e.target.value as any)}
                              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-medium focus:bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none cursor-pointer"
                            >
                              <option value="numeric">Numeric Range (Low - High)</option>
                              <option value="qualitative">Qualitative / Text (Normal/Negative)</option>
                            </select>
                          </div>
                        </div>

                        {/* Reference Values Row */}
                        {param.valueType === "numeric" ? (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                            <div>
                              <label className="text-[10.5px] font-bold text-slate-700 block mb-0.5">
                                Normal Low
                              </label>
                              <input
                                type="number"
                                step="any"
                                value={param.refRangeLow ?? ""}
                                onChange={(e) => handleUpdateParameterField(param.id, "refRangeLow", e.target.value === "" ? "" : Number(e.target.value))}
                                placeholder="Low limit"
                                className="w-full px-2.5 py-1 bg-white border border-slate-300 rounded text-center font-mono focus:ring-1 focus:ring-blue-500 focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="text-[10.5px] font-bold text-slate-700 block mb-0.5">
                                Normal High
                              </label>
                              <input
                                type="number"
                                step="any"
                                value={param.refRangeHigh ?? ""}
                                onChange={(e) => handleUpdateParameterField(param.id, "refRangeHigh", e.target.value === "" ? "" : Number(e.target.value))}
                                placeholder="High limit"
                                className="w-full px-2.5 py-1 bg-white border border-slate-300 rounded text-center font-mono focus:ring-1 focus:ring-blue-500 focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="text-[10.5px] font-bold text-rose-700 block mb-0.5">
                                Critical Low (Red)
                              </label>
                              <input
                                type="number"
                                step="any"
                                value={param.criticalLow ?? ""}
                                onChange={(e) => handleUpdateParameterField(param.id, "criticalLow", e.target.value === "" ? undefined : Number(e.target.value))}
                                placeholder="Panic Low"
                                className="w-full px-2.5 py-1 bg-rose-50/50 border border-rose-300 rounded text-center font-mono text-rose-800 focus:ring-1 focus:ring-rose-500 focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="text-[10.5px] font-bold text-rose-700 block mb-0.5">
                                Critical High (Red)
                              </label>
                              <input
                                type="number"
                                step="any"
                                value={param.criticalHigh ?? ""}
                                onChange={(e) => handleUpdateParameterField(param.id, "criticalHigh", e.target.value === "" ? undefined : Number(e.target.value))}
                                placeholder="Panic High"
                                className="w-full px-2.5 py-1 bg-rose-50/50 border border-rose-300 rounded text-center font-mono text-rose-800 focus:ring-1 focus:ring-rose-500 focus:outline-none"
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs">
                            <label className="text-[10.5px] font-bold text-slate-700 block mb-0.5">
                              Expected Normal Reference Text
                            </label>
                            <input
                              type="text"
                              value={param.refRangeText ?? ""}
                              onChange={(e) => handleUpdateParameterField(param.id, "refRangeText", e.target.value)}
                              placeholder="e.g. Negative, Non-Reactive, Nil, Clear"
                              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Drawer Footer */}
              <div className="p-5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveTest}
                  className="px-6 py-2 text-xs font-bold text-white bg-[#00488D] hover:bg-[#093a6b] rounded-lg shadow-sm transition cursor-pointer inline-flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Save Test &amp; Parameters</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

