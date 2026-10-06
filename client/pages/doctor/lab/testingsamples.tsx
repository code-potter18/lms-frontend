import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getUser, remove } from "@/utils/token";
import { toast } from "@/hooks/use-toast";
import LabNav from "./labnav";
import { LabNotificationBell } from "@/components/hms/LabNotificationBell";
import {
  labOrderApi,
  labOrderItemApi,
  LabOrderRecord,
  LabOrderItemRecord,
} from "@/api/labOrder.api";
import { patientApi, PatientRecord } from "@/api/patient.api";

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
}

export interface TestParameter {
  id: string;
  parameter: string;
  result: string;
  unit: string;
  referenceRange: string;
  status: "Completed" | "In Progress" | "Not Started";
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
  const lower = (testName || "").toLowerCase();

  if (lower.includes("cbc") || lower.includes("blood count")) {
    return [
      {
        id: "p1",
        parameter: "WBC (White Blood Cells)",
        result: "6.80",
        unit: "10^3/µL",
        referenceRange: "4.0 - 10.0",
        status: "Completed",
      },
      {
        id: "p2",
        parameter: "RBC (Red Blood Cells)",
        result: "4.82",
        unit: "10^6/µL",
        referenceRange: "4.2 - 5.8",
        status: "Completed",
      },
      {
        id: "p3",
        parameter: "HGB (Hemoglobin)",
        result: "14.2",
        unit: "g/dL",
        referenceRange: "13.0 - 17.0",
        status: "Completed",
      },
      {
        id: "p4",
        parameter: "HCT (Hematocrit)",
        result: "42.5",
        unit: "%",
        referenceRange: "40 - 50",
        status: "In Progress",
      },
      {
        id: "p5",
        parameter: "MCV (Mean Corpuscular Vol)",
        result: "88.0",
        unit: "fL",
        referenceRange: "80 - 100",
        status: "In Progress",
      },
      {
        id: "p6",
        parameter: "MCH (Mean Corpuscular Hb)",
        result: "29.5",
        unit: "pg",
        referenceRange: "27 - 34",
        status: "In Progress",
      },
      {
        id: "p7",
        parameter: "MCHC (MCH Concentration)",
        result: "33.4",
        unit: "g/dL",
        referenceRange: "32 - 36",
        status: "Not Started",
      },
      {
        id: "p8",
        parameter: "PLT (Platelet Count)",
        result: "240",
        unit: "10^3/µL",
        referenceRange: "150 - 450",
        status: "Not Started",
      },
    ];
  }

  if (lower.includes("wbc")) {
    return [
      {
        id: "p1",
        parameter: "WBC (White Blood Cells)",
        result: "7.20",
        unit: labTestMaster?.unit || "10^3/µL",
        referenceRange: labTestMaster?.reference_range || "4.0 - 10.0",
        status: "Completed",
      },
      {
        id: "p2",
        parameter: "Neutrophils",
        result: "62",
        unit: "%",
        referenceRange: "40 - 75",
        status: "Completed",
      },
      {
        id: "p3",
        parameter: "Lymphocytes",
        result: "28",
        unit: "%",
        referenceRange: "20 - 45",
        status: "Completed",
      },
      {
        id: "p4",
        parameter: "Monocytes",
        result: "6",
        unit: "%",
        referenceRange: "2 - 10",
        status: "In Progress",
      },
      {
        id: "p5",
        parameter: "Eosinophils",
        result: "3",
        unit: "%",
        referenceRange: "1 - 6",
        status: "In Progress",
      },
      {
        id: "p6",
        parameter: "Basophils",
        result: "1",
        unit: "%",
        referenceRange: "0 - 2",
        status: "Not Started",
      },
    ];
  }

  if (
    lower.includes("kft") ||
    lower.includes("kidney") ||
    lower.includes("renal")
  ) {
    return [
      {
        id: "p1",
        parameter: "Serum Creatinine",
        result: "0.95",
        unit: "mg/dL",
        referenceRange: "0.7 - 1.3",
        status: "Completed",
      },
      {
        id: "p2",
        parameter: "Blood Urea",
        result: "24",
        unit: "mg/dL",
        referenceRange: "15 - 40",
        status: "Completed",
      },
      {
        id: "p3",
        parameter: "BUN (Blood Urea Nitrogen)",
        result: "11.2",
        unit: "mg/dL",
        referenceRange: "7 - 20",
        status: "In Progress",
      },
      {
        id: "p4",
        parameter: "Uric Acid",
        result: "5.4",
        unit: "mg/dL",
        referenceRange: "3.5 - 7.2",
        status: "In Progress",
      },
      {
        id: "p5",
        parameter: "eGFR",
        result: "95",
        unit: "mL/min/1.73m²",
        referenceRange: "> 90",
        status: "Completed",
      },
    ];
  }

  if (lower.includes("lft") || lower.includes("liver")) {
    return [
      {
        id: "p1",
        parameter: "Bilirubin (Total)",
        result: "0.8",
        unit: "mg/dL",
        referenceRange: "0.2 - 1.2",
        status: "Completed",
      },
      {
        id: "p2",
        parameter: "Bilirubin (Direct)",
        result: "0.2",
        unit: "mg/dL",
        referenceRange: "0.0 - 0.3",
        status: "Completed",
      },
      {
        id: "p3",
        parameter: "SGOT / AST",
        result: "28",
        unit: "U/L",
        referenceRange: "10 - 40",
        status: "Completed",
      },
      {
        id: "p4",
        parameter: "SGPT / ALT",
        result: "32",
        unit: "U/L",
        referenceRange: "7 - 56",
        status: "In Progress",
      },
      {
        id: "p5",
        parameter: "Alkaline Phosphatase (ALP)",
        result: "78",
        unit: "U/L",
        referenceRange: "44 - 147",
        status: "In Progress",
      },
      {
        id: "p6",
        parameter: "Total Protein",
        result: "7.1",
        unit: "g/dL",
        referenceRange: "6.0 - 8.3",
        status: "Not Started",
      },
      {
        id: "p7",
        parameter: "Albumin",
        result: "4.2",
        unit: "g/dL",
        referenceRange: "3.5 - 5.0",
        status: "Not Started",
      },
    ];
  }

  if (lower.includes("lipid")) {
    return [
      {
        id: "p1",
        parameter: "Total Cholesterol",
        result: "185",
        unit: "mg/dL",
        referenceRange: "< 200",
        status: "Completed",
      },
      {
        id: "p2",
        parameter: "Triglycerides",
        result: "140",
        unit: "mg/dL",
        referenceRange: "< 150",
        status: "Completed",
      },
      {
        id: "p3",
        parameter: "HDL Cholesterol",
        result: "48",
        unit: "mg/dL",
        referenceRange: "> 40",
        status: "Completed",
      },
      {
        id: "p4",
        parameter: "LDL Cholesterol",
        result: "109",
        unit: "mg/dL",
        referenceRange: "< 100",
        status: "In Progress",
      },
      {
        id: "p5",
        parameter: "VLDL",
        result: "28",
        unit: "mg/dL",
        referenceRange: "< 30",
        status: "Not Started",
      },
    ];
  }

  if (lower.includes("hba1c") || lower.includes("glycated")) {
    return [
      {
        id: "p1",
        parameter: "HbA1c Glycated Hemoglobin",
        result: "5.7",
        unit: "%",
        referenceRange: "< 5.7",
        status: "Completed",
      },
      {
        id: "p2",
        parameter: "Estimated Average Glucose (eAG)",
        result: "117",
        unit: "mg/dL",
        referenceRange: "70 - 126",
        status: "Completed",
      },
    ];
  }

  return [
    {
      id: "p1",
      parameter: labTestMaster?.test_name || testName || "Primary Parameter",
      result: "",
      unit: labTestMaster?.unit || "mg/dL",
      referenceRange: labTestMaster?.reference_range || "Normal",
      status: "In Progress",
    },
  ];
}

export const INITIAL_CBC_PARAMETERS: TestParameter[] = [
  {
    id: "p1",
    parameter: "WBC (White Blood Cells)",
    result: "6.80",
    unit: "10^3/µL",
    referenceRange: "4.0 - 10.0",
    status: "Completed",
  },
  {
    id: "p2",
    parameter: "RBC (Red Blood Cells)",
    result: "4.82",
    unit: "10^6/µL",
    referenceRange: "4.2 - 5.8",
    status: "Completed",
  },
  {
    id: "p3",
    parameter: "HGB (Hemoglobin)",
    result: "14.2",
    unit: "g/dL",
    referenceRange: "13.0 - 17.0",
    status: "Completed",
  },
  {
    id: "p4",
    parameter: "HCT (Hematocrit)",
    result: "",
    unit: "%",
    referenceRange: "40 - 50",
    status: "In Progress",
  },
  {
    id: "p5",
    parameter: "MCV (Mean Corpuscular Vol)",
    result: "",
    unit: "fL",
    referenceRange: "80 - 100",
    status: "In Progress",
  },
  {
    id: "p6",
    parameter: "MCH (Mean Corpuscular Hb)",
    result: "",
    unit: "pg",
    referenceRange: "27 - 34",
    status: "In Progress",
  },
  {
    id: "p7",
    parameter: "MCHC (MCH Concentration)",
    result: "",
    unit: "g/dL",
    referenceRange: "32 - 36",
    status: "Not Started",
  },
  {
    id: "p8",
    parameter: "PLT (Platelet Count)",
    result: "",
    unit: "10^3/µL",
    referenceRange: "150 - 450",
    status: "Not Started",
  },
];

export const INITIAL_TESTING_SAMPLES: TestingSampleItem[] = [
  {
    id: "s2",
    sampleId: "SMP-002",
    barcode: "BC2405200002",
    patientId: "PID123456",
    patientName: "Rahul Sharma",
    testName: "Liver Function Test (LFT)",
    analyzerBench: "Cobas 6000 (Biochemistry)",
    startTime: "10:32 AM",
    estimatedCompletion: "11:05 AM",
    status: "RUNNING",
    sampleType: "Serum (SST)",
    receivedDate: "20 May 2024",
    receivedBy: "John Doe",
  },
  {
    id: "s3",
    sampleId: "SMP-003",
    barcode: "BC2405200003",
    patientId: "P000124",
    patientName: "Priya",
    testName: "Kidney Function Test (KFT)",
    analyzerBench: "Cobas 6000 (Biochemistry)",
    startTime: "11:35 AM",
    estimatedCompletion: "12:00 PM",
    status: "COMPLETED",
    sampleType: "Serum",
    receivedDate: "20 May 2024",
    receivedBy: "John Doe",
    testResult: "Creatinine: 0.8 mg/dL, Urea: 22 mg/dL",
  },
  {
    id: "s1",
    sampleId: "SMP-001",
    barcode: "BC2405200001",
    patientId: "PID123456",
    patientName: "Rahul Sharma",
    testName: "Complete Blood Count (CBC)",
    analyzerBench: "Sysmex XN-1000 (Hematology)",
    startTime: "10:30 AM",
    estimatedCompletion: "11:00 AM",
    status: "RUNNING",
    sampleType: "Whole Blood",
    receivedDate: "20 May 2024",
    receivedBy: "John Doe",
    parameters: INITIAL_CBC_PARAMETERS,
  },
  {
    id: "s4",
    sampleId: "SMP-004",
    barcode: "BC2405200004",
    patientId: "P000125",
    patientName: "Praveen Singh",
    testName: "Lipid Profile",
    analyzerBench: "Beckman Coulter AU480",
    startTime: "10:45 AM",
    estimatedCompletion: "11:30 AM",
    status: "FLAGGED",
    sampleType: "Serum (SST)",
    receivedDate: "03 Apr 2026",
    receivedBy: "John Doe",
    criticalAlert: "High Triglycerides (> 450 mg/dL)",
    testResult: "Cholesterol: 245 mg/dL, Triglycerides: 480 mg/dL",
  },
];

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
  const [samples, setSamples] = useState<TestingSampleItem[]>(() => {
    return INITIAL_TESTING_SAMPLES.filter((ms) => {
      const isRejected =
        typeof window !== "undefined" &&
        localStorage.getItem(`rejected_sample_${ms.id}`) === "true";
      if (isRejected) return false;

      const isVerified =
        ms.id === "s2" ||
        ms.id === "s3" ||
        (typeof window !== "undefined" &&
          (localStorage.getItem(`verified_sample_${ms.id}`) === "true" ||
            localStorage.getItem(`verified_sample_barcode_${ms.barcode}`) === "true"));
      return isVerified;
    });
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "RUNNING" | "COMPLETED" | "FLAGGED" | "CALIBRATING"
  >("ALL");
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const [quickInputBarcode, setQuickInputBarcode] = useState("");

  // Verification and Results Workflow State
  const [viewMode, setViewMode] = useState<
    "table" | "verify" | "enter-results" | "mark-completed"
  >("table");
  const [selectedSample, setSelectedSample] = useState<TestingSampleItem>(
    INITIAL_TESTING_SAMPLES[0],
  );
  const [checklist, setChecklist] = useState({
    sampleIntact: "Yes",
    labelInfoCorrect: "Yes",
    sufficientQuantity: "Yes",
    properPackaging: "Yes",
  });
  const [verificationComments, setVerificationComments] = useState("");

  // Enter Test Results State
  const [testParameters, setTestParameters] = useState<TestParameter[]>(
    INITIAL_CBC_PARAMETERS,
  );
  const [resultComments, setResultComments] = useState("");

  // Mark as Completed State
  const [completionComments, setCompletionComments] = useState("");

  // Real data fetching from backend
  const fetchRealData = useCallback(async () => {
    try {
      setIsLoading(true);
      setFetchError(null);

      const [ordersRes, itemsRes, patientsRes] = await Promise.all([
        labOrderApi.getAll().catch(() => ({ data: { data: [] } })),
        labOrderItemApi.getAll().catch(() => ({ data: { data: [] } })),
        patientApi.getAll({ limit: 100 }).catch(() => ({ data: { data: { patients: [] } } })),
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
          const pId =
            parentOrder?.patient_history?.patient_id ||
            parentOrder?.patient_history_id ||
            `PAT00${idx + 1}`;
          const patient = patientMap.get(pId);

          const pName = patient
            ? [
                patient.patient_first_name,
                patient.patient_middle_name,
                patient.patient_last_name,
              ]
                .filter(Boolean)
                .join(" ")
            : `Patient ${pId}`;

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

          const tatHours = Number(item.lab_test_master?.tat_hours) || 1;
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

          const storedParams = typeof window !== "undefined"
            ? localStorage.getItem(`testing_sample_params_${item.lab_order_item_id}`)
            : null;
          let params: TestParameter[] = [];
          if (storedParams) {
            try {
              params = JSON.parse(storedParams);
            } catch {}
          }
          if (!params || params.length === 0) {
            params = getDefaultParametersForTest(testName, item.lab_test_master);
          }

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

          return {
            id: item.lab_order_item_id,
            sampleId,
            barcode: resolvedBarcode,
            patientId: pId,
            patientName: pName,
            testName,
            analyzerBench: determineAnalyzerBench(testName, sampleType),
            startTime,
            estimatedCompletion,
            status,
            sampleType,
            receivedDate,
            receivedBy: item.sample_collection?.[0]?.collected_by || currentUsername,
            comments: storedComments || item.remarks || "",
            testResult,
            parameters: params,
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
            cachedSamples.push({
              id: cached.id,
              sampleId: cached.sampleId || cached.id,
              barcode: cached.barcode || "",
              patientId: cached.patientId || "",
              patientName: cached.patientName || "",
              testName,
              analyzerBench: determineAnalyzerBench(testName, sampleType),
              startTime: cached.collectionTime || "10:30 AM",
              estimatedCompletion: "11:30 AM",
              status: "RUNNING",
              sampleType,
              receivedDate: "22 Sep 2026",
              receivedBy: cached.technician || currentUsername,
              comments: "",
              parameters: getDefaultParametersForTest(testName),
            });
            existingIds.add(cached.id);
            if (cached.barcode) existingBarcodes.add(cached.barcode);
          }
        }

        let combinedSamples = [...mappedBackendSamples, ...cachedSamples];

        // If no backend verified samples, populate with verified baseline samples from Sample Verification (s2, s3, or any newly verified mock item)
        if (combinedSamples.length === 0) {
          combinedSamples = INITIAL_TESTING_SAMPLES.filter((ms) => {
            const isRejected =
              typeof window !== "undefined" &&
              localStorage.getItem(`rejected_sample_${ms.id}`) === "true";
            if (isRejected) return false;

            const isVerified =
              ms.id === "s2" ||
              ms.id === "s3" ||
              (typeof window !== "undefined" &&
                (localStorage.getItem(`verified_sample_${ms.id}`) === "true" ||
                  localStorage.getItem(`verified_sample_barcode_${ms.barcode}`) === "true"));
            return isVerified;
          });
        }

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

  const handleOpenVerification = (sample: TestingSampleItem) => {
    setSelectedSample(sample);
    setChecklist({
      sampleIntact: "Yes",
      labelInfoCorrect: "Yes",
      sufficientQuantity: "Yes",
      properPackaging: "Yes",
    });
    setVerificationComments(sample.comments || "");
    setViewMode("verify");
  };

  const handleOpenEnterResults = (sample: TestingSampleItem) => {
    setSelectedSample(sample);
    if (sample.parameters && sample.parameters.length > 0) {
      setTestParameters(sample.parameters);
    } else {
      setTestParameters(getDefaultParametersForTest(sample.testName));
    }
    setResultComments(sample.comments || "");
    setViewMode("enter-results");
  };

  const handleOpenMarkCompleted = (sample: TestingSampleItem) => {
    setSelectedSample(sample);
    setCompletionComments(sample.comments || "");
    setViewMode("mark-completed");
  };

  const handleConfirmMarkCompleted = async () => {
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
    setSelectedSample((prev) => ({
      ...prev,
      status: "COMPLETED",
      comments: completionComments.trim() || prev.comments,
      testResult: updatedResult,
    }));

    try {
      localStorage.setItem(`testing_sample_status_${selectedSample.id}`, "COMPLETED");
      localStorage.setItem(`testing_sample_result_${selectedSample.id}`, updatedResult);
      if (completionComments.trim()) {
        localStorage.setItem(`testing_sample_comments_${selectedSample.id}`, completionComments.trim());
      }
      const paramsToSave =
        selectedSample.parameters && selectedSample.parameters.length > 0
          ? selectedSample.parameters
          : getDefaultParametersForTest(selectedSample.testName);
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

      if (!selectedSample.id.startsWith("ts-") && !selectedSample.id.startsWith("s")) {
        await labOrderItemApi.update(selectedSample.id, {
          item_status: "Completed",
          remarks: completionComments.trim() || updatedResult,
        });
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
        return {
          ...p,
          result: val,
          status: newStatus,
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
    setSelectedSample((prev) => ({
      ...prev,
      status: "COMPLETED",
      testResult: summary,
      parameters: testParameters,
      comments: resultComments.trim() || prev.comments,
    }));

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

      if (!selectedSample.id.startsWith("ts-")) {
        await labOrderItemApi.update(selectedSample.id, {
          item_status: "Completed",
          remarks: summary,
        });
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

  const handleSaveDraftResults = () => {
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
    setSelectedSample((prev) => ({
      ...prev,
      parameters: testParameters,
      comments: resultComments.trim() || prev.comments,
    }));

    try {
      localStorage.setItem(`testing_sample_params_${selectedSample.id}`, JSON.stringify(testParameters));
      if (resultComments.trim()) {
        localStorage.setItem(`testing_sample_comments_${selectedSample.id}`, resultComments.trim());
      }
    } catch {}

    toast({
      title: "Draft Saved",
      description: `Test results draft saved for barcode ${selectedSample.barcode || selectedSample.sampleId}.`,
    });
  };

  const handleTestSample = async () => {
    const startTimeStr = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    setSamples((prev) =>
      prev.map((s) =>
        s.id === selectedSample.id
          ? {
              ...s,
              status: "RUNNING",
              comments: verificationComments.trim() || s.comments,
              startTime: startTimeStr,
            }
          : s,
      ),
    );
    setSelectedSample((prev) => ({
      ...prev,
      status: "RUNNING",
      comments: verificationComments.trim() || prev.comments,
      startTime: startTimeStr,
    }));

    try {
      localStorage.setItem(`testing_sample_status_${selectedSample.id}`, "RUNNING");
      if (verificationComments.trim()) {
        localStorage.setItem(`testing_sample_comments_${selectedSample.id}`, verificationComments.trim());
      }
      if (!selectedSample.id.startsWith("ts-")) {
        await labOrderItemApi.update(selectedSample.id, {
          item_status: "Running",
          remarks: verificationComments.trim() || undefined,
        });
      }
    } catch (err) {
      console.warn("Could not persist testing status to backend:", err);
    }

    toast({
      title: "Testing Initiated",
      description: `Barcode ${selectedSample.barcode || selectedSample.sampleId} verified. Analyzer test run started on ${selectedSample.analyzerBench}.`,
    });
    setTimeout(() => {
      setViewMode("table");
    }, 1000);
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

  const handleQuickRun = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickInputBarcode.trim()) return;
    const match = samples.find(
      (s) =>
        s.barcode.toLowerCase() === quickInputBarcode.trim().toLowerCase() ||
        s.sampleId.toLowerCase() === quickInputBarcode.trim().toLowerCase(),
    );
    if (match) {
      handleOpenEnterResults(match);
      setQuickInputBarcode("");
    } else {
      toast({
        title: "Sample Not Found",
        description: `No testing sample with ID/barcode "${quickInputBarcode}" found in analytical run.`,
        variant: "destructive",
      });
    }
  };

  const filteredSamples = useMemo(() => {
    return samples.filter((sample) => {
      const matchesSearch =
        searchQuery.trim() === "" ||
        sample.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sample.barcode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sample.sampleId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sample.testName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sample.analyzerBench.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === "ALL" || sample.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [samples, searchQuery, statusFilter]);

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
          className="h-20 bg-white border-b border-slate-100 px-10 flex items-center justify-end sticky top-0 z-10"
          data-purpose="dashboard-header"
        >
          <div className="flex items-center gap-6">
            {/* Lab Notification Bell with Live Alerts */}
            <LabNotificationBell size="md" />

            {/* Role Label & Profile Avatar & Logout */}
            <div className="flex items-center gap-3 pl-1">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[#0b57d0] text-white font-bold text-xs flex items-center justify-center shadow-xs">
                  {displayName.charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-xs font-semibold text-slate-800 leading-tight">
                    {displayName}
                  </span>
                  <span className="text-[10px] text-slate-500 leading-tight">
                    {displayRole}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-red-600 hover:bg-red-50 border border-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
                Logout
              </button>
            </div>
          </div>
        </header>

        {/* DashboardBody / Verification Workflow */}
        {viewMode === "verify" ? (
          <main
            className="flex-1 flex flex-col min-w-0 bg-[#fbfcfd]"
            data-purpose="sample-verification-dashboard"
          >
            {/* Top Page Header */}
            <header
              className="pt-8 pb-7 px-9 border-b border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              data-purpose="page-header"
            >
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                  Sample Verification
                </h2>
                <p className="text-xs font-normal text-slate-500 mt-1">
                  Verify sample details to start testing process
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg shadow-2xs transition-colors cursor-pointer"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M10 19l-7-7m0 0l7-7m-7 7h18"
                  />
                </svg>
                Back to Table
              </button>
            </header>

            {/* Content Workspace */}
            <div className="p-9 max-w-[1240px] space-y-6">
              {/* BEGIN: SampleInformationCard */}
              <section
                className="bg-white rounded-lg border border-slate-200 shadow-sm"
                data-purpose="sample-information"
              >
                {/* Card Header */}
                <div className="px-6 py-4 border-b border-slate-100">
                  <h3 className="text-[13.5px] font-semibold text-slate-900">
                    Sample Information
                  </h3>
                </div>

                {/* Card Body / Meta Grid */}
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-y-5 gap-x-12">
                    {/* Left Column Items */}
                    <div className="space-y-4">
                      {/* Sample ID */}
                      <div className="flex items-center text-xs">
                        <span className="w-36 font-semibold tracking-wider text-slate-400 uppercase text-[11px]">
                          BARCODE
                        </span>
                        <span className="font-medium text-slate-900 text-[13px] font-mono">
                          {selectedSample.barcode || selectedSample.sampleId}
                        </span>
                      </div>
                      {/* Patient Name */}
                      <div className="flex items-center text-xs">
                        <span className="w-36 font-semibold tracking-wider text-slate-400 uppercase text-[11px]">
                          PATIENT NAME
                        </span>
                        <span className="font-medium text-slate-900 text-[13px]">
                          {selectedSample.patientName}
                        </span>
                      </div>
                      {/* Sample Type */}
                      <div className="flex items-center text-xs">
                        <span className="w-36 font-semibold tracking-wider text-slate-400 uppercase text-[11px]">
                          SAMPLE TYPE
                        </span>
                        <span className="font-medium text-slate-900 text-[13px]">
                          {selectedSample.sampleType || "Whole Blood"}
                        </span>
                      </div>
                      {/* Received Date */}
                      <div className="flex items-center text-xs">
                        <span className="w-36 font-semibold tracking-wider text-slate-400 uppercase text-[11px]">
                          RECEIVED DATE
                        </span>
                        <span className="font-medium text-slate-900 text-[13px]">
                          {selectedSample.receivedDate || "20 May 2024"}
                        </span>
                      </div>
                    </div>

                    {/* Right Column Items */}
                    <div className="space-y-4">
                      {/* Received By */}
                      <div className="flex items-center text-xs">
                        <span className="w-32 font-semibold tracking-wider text-slate-400 uppercase text-[11px]">
                          RECEIVED BY
                        </span>
                        <span className="font-medium text-slate-900 text-[13px]">
                          {selectedSample.receivedBy || "John Doe"}
                        </span>
                      </div>
                      {/* Status with badge */}
                      <div className="flex items-center text-xs">
                        <span className="w-32 font-semibold tracking-wider text-slate-400 uppercase text-[11px]">
                          STATUS
                        </span>
                        <div>
                          {selectedSample.status === "COMPLETED" ? (
                            <span className="inline-flex items-center px-3 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Completed
                            </span>
                          ) : selectedSample.status === "RUNNING" ? (
                            <span className="inline-flex items-center px-3 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                              Running
                            </span>
                          ) : selectedSample.status === "FLAGGED" ? (
                            <span className="inline-flex items-center px-3 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                              Flagged
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-3 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                              Calibrating
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
              {/* END: SampleInformationCard */}

              {/* BEGIN: TwoColumnChecklistAndComments */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Card: Verification Checklist */}
                <section
                  className="bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col"
                  data-purpose="verification-checklist"
                >
                  <div className="px-6 py-4 border-b border-slate-100">
                    <h3 className="text-[13.5px] font-semibold text-slate-900">
                      Verification Checklist
                    </h3>
                  </div>
                  <div className="p-6 space-y-4 flex-1">
                    {/* Checklist Item 1 */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center justify-center w-4 h-4 rounded-full bg-emerald-100 text-emerald-600">
                          <svg
                            className="w-2.5 h-2.5 stroke-2"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </span>
                        <span className="text-[13px] text-slate-800 font-medium">
                          Sample Intact
                        </span>
                      </div>
                      <select
                        value={checklist.sampleIntact}
                        onChange={(e) =>
                          setChecklist((prev) => ({
                            ...prev,
                            sampleIntact: e.target.value,
                          }))
                        }
                        className="w-20 text-[13px] py-1.5 pl-3 pr-7 bg-white border border-slate-200 rounded-md text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600"
                        style={{
                          backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                          backgroundPosition: "right 0.65rem center",
                          backgroundRepeat: "no-repeat",
                          backgroundSize: "1.25em 1.25em",
                          appearance: "none",
                        }}
                      >
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                      </select>
                    </div>

                    {/* Checklist Item 2 */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center justify-center w-4 h-4 rounded-full bg-emerald-100 text-emerald-600">
                          <svg
                            className="w-2.5 h-2.5 stroke-2"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </span>
                        <span className="text-[13px] text-slate-800 font-medium">
                          Label Information Correct
                        </span>
                      </div>
                      <select
                        value={checklist.labelInfoCorrect}
                        onChange={(e) =>
                          setChecklist((prev) => ({
                            ...prev,
                            labelInfoCorrect: e.target.value,
                          }))
                        }
                        className="w-20 text-[13px] py-1.5 pl-3 pr-7 bg-white border border-slate-200 rounded-md text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600"
                        style={{
                          backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                          backgroundPosition: "right 0.65rem center",
                          backgroundRepeat: "no-repeat",
                          backgroundSize: "1.25em 1.25em",
                          appearance: "none",
                        }}
                      >
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                      </select>
                    </div>

                    {/* Checklist Item 3 */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center justify-center w-4 h-4 rounded-full bg-emerald-100 text-emerald-600">
                          <svg
                            className="w-2.5 h-2.5 stroke-2"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </span>
                        <span className="text-[13px] text-slate-800 font-medium">
                          Sufficient Quantity
                        </span>
                      </div>
                      <select
                        value={checklist.sufficientQuantity}
                        onChange={(e) =>
                          setChecklist((prev) => ({
                            ...prev,
                            sufficientQuantity: e.target.value,
                          }))
                        }
                        className="w-20 text-[13px] py-1.5 pl-3 pr-7 bg-white border border-slate-200 rounded-md text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600"
                        style={{
                          backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                          backgroundPosition: "right 0.65rem center",
                          backgroundRepeat: "no-repeat",
                          backgroundSize: "1.25em 1.25em",
                          appearance: "none",
                        }}
                      >
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                      </select>
                    </div>

                    {/* Checklist Item 4 */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center justify-center w-4 h-4 rounded-full bg-emerald-100 text-emerald-600">
                          <svg
                            className="w-2.5 h-2.5 stroke-2"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </span>
                        <span className="text-[13px] text-slate-800 font-medium">
                          Proper Packaging
                        </span>
                      </div>
                      <select
                        value={checklist.properPackaging}
                        onChange={(e) =>
                          setChecklist((prev) => ({
                            ...prev,
                            properPackaging: e.target.value,
                          }))
                        }
                        className="w-20 text-[13px] py-1.5 pl-3 pr-7 bg-white border border-slate-200 rounded-md text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600"
                        style={{
                          backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                          backgroundPosition: "right 0.65rem center",
                          backgroundRepeat: "no-repeat",
                          backgroundSize: "1.25em 1.25em",
                          appearance: "none",
                        }}
                      >
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                      </select>
                    </div>
                  </div>
                </section>

                {/* Card: Comments (Optional) */}
                <section
                  className="bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col"
                  data-purpose="comments-section"
                >
                  <div className="px-6 py-4 border-b border-slate-100">
                    <h3 className="text-[13.5px] font-semibold text-slate-900">
                      Comments (Optional)
                    </h3>
                  </div>
                  <div className="p-6 flex-1 flex flex-col">
                    <textarea
                      value={verificationComments}
                      onChange={(e) => setVerificationComments(e.target.value)}
                      className="w-full flex-1 rounded-md border border-slate-200 text-[13px] p-3 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600 resize-none shadow-none"
                      placeholder="Enter comments here..."
                      rows={6}
                    />
                  </div>
                </section>
              </div>
              {/* END: TwoColumnChecklistAndComments */}

              {/* BEGIN: ActionButtons */}
              <div
                className="flex items-center justify-end gap-3 pt-6"
                data-purpose="action-buttons"
              >
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  className="px-5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-md shadow-xs hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenEnterResults(selectedSample)}
                  className="px-5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-md shadow-xs hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Enter Results
                </button>
                <button
                  type="button"
                  onClick={handleTestSample}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#1e60d5] hover:bg-[#1952be] rounded-md shadow-xs transition-colors cursor-pointer"
                >
                  Test Sample
                </button>
              </div>
              {/* END: ActionButtons */}
            </div>
          </main>
        ) : viewMode === "enter-results" ? (
          <main
            className="flex-1 flex flex-col justify-between overflow-y-auto px-10 py-7 min-w-0 bg-[#fcfdfe]"
            data-purpose="main-layout"
          >
            <div className="max-w-6xl w-full">
              {/* Breadcrumb link */}
              <nav
                aria-label="Breadcrumb"
                className="mb-3"
                data-purpose="breadcrumb"
              >
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  className="inline-flex items-center text-xs font-normal text-slate-500 hover:text-slate-700 cursor-pointer"
                >
                  <svg
                    className="w-3.5 h-3.5 mr-1 stroke-current"
                    fill="none"
                    strokeWidth="2.2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M15 19l-7-7 7-7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Back to Samples
                </button>
              </nav>

              {/* Page Header */}
              <header className="mb-7" data-purpose="page-header">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                  Enter Test Results
                </h1>
                <div className="mt-1 flex items-center text-sm text-slate-600">
                  <span>Barcode: {selectedSample.barcode || selectedSample.sampleId}</span>
                  <span
                    aria-hidden="true"
                    className="inline-block w-px h-[1.15rem] bg-[#94a3b8] align-middle ml-1.5 animate-pulse"
                  />
                </div>
              </header>

              {/* BEGIN: ResultsTableSection */}
              <section
                className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.02)] mb-7"
                data-purpose="test-parameters-table"
              >
                <table className="w-full text-left border-collapse">
                  {/* Table Header */}
                  <thead>
                    <tr className="border-b border-gray-200 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                      <th
                        className="py-3.5 px-6 font-semibold w-1/4"
                        scope="col"
                      >
                        PARAMETER
                      </th>
                      <th
                        className="py-3.5 px-6 font-semibold border-l border-gray-200/80 w-1/6"
                        scope="col"
                      >
                        RESULT
                      </th>
                      <th
                        className="py-3.5 px-6 font-semibold border-l border-gray-200/80 w-1/6"
                        scope="col"
                      >
                        UNIT
                      </th>
                      <th
                        className="py-3.5 px-6 font-semibold border-l border-gray-200/80 w-1/4"
                        scope="col"
                      >
                        REFERENCE RANGE
                      </th>
                      <th
                        className="py-3.5 px-6 font-semibold border-l border-gray-200/80 text-center w-1/6"
                        scope="col"
                      >
                        STATUS
                      </th>
                    </tr>
                  </thead>
                  {/* Table Body */}
                  <tbody className="divide-y divide-gray-100 text-[13px] text-slate-800">
                    {testParameters.map((param) => (
                      <tr
                        key={param.id}
                        className="hover:bg-slate-50/50 transition-colors"
                      >
                        <td className="py-3.5 px-6 text-slate-900 font-normal">
                          {param.parameter}
                        </td>
                        <td className="py-3.5 px-6 border-l border-gray-100 text-slate-700">
                          <input
                            type="text"
                            value={param.result}
                            onChange={(e) =>
                              handleParameterResultChange(
                                param.id,
                                e.target.value,
                              )
                            }
                            placeholder="Enter result..."
                            className="w-full bg-transparent border-0 border-b border-transparent hover:border-slate-300 focus:border-blue-500 text-[13px] text-slate-800 font-medium placeholder-slate-300 focus:outline-none focus:ring-0 py-0.5 transition-colors"
                          />
                        </td>
                        <td className="py-3.5 px-6 border-l border-gray-100 text-slate-700">
                          {param.unit}
                        </td>
                        <td className="py-3.5 px-6 border-l border-gray-100 text-slate-700">
                          {param.referenceRange}
                        </td>
                        <td className="py-3.5 px-6 border-l border-gray-100 text-center">
                          {param.status === "Completed" ? (
                            <span
                              onClick={() => handleToggleParamStatus(param.id)}
                              className="inline-flex items-center px-4 py-0.5 rounded-full text-xs font-normal bg-[#eaf8f0] text-[#1b8a53] cursor-pointer select-none"
                              title="Click to toggle status"
                            >
                              Completed
                            </span>
                          ) : param.status === "In Progress" ? (
                            <span
                              onClick={() => handleToggleParamStatus(param.id)}
                              className="inline-flex items-center px-3.5 py-0.5 rounded-full text-xs font-normal border border-[#b4d6fb] bg-[#f0f6fe] text-[#2563eb] cursor-pointer select-none"
                              title="Click to toggle status"
                            >
                              In Progress
                            </span>
                          ) : (
                            <span
                              onClick={() => handleToggleParamStatus(param.id)}
                              className="inline-flex items-center px-3.5 py-0.5 rounded-full text-xs font-normal bg-[#f3f4f6] text-[#6b7280] cursor-pointer select-none"
                              title="Click to toggle status"
                            >
                              Not Started
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
              {/* END: ResultsTableSection */}

              {/* BEGIN: CommentsSection */}
              <section className="mt-6" data-purpose="comments-form">
                <label
                  className="block text-[13px] font-semibold text-slate-900 mb-2"
                  htmlFor="results-comments"
                >
                  Comments (Optional)
                </label>
                <textarea
                  id="results-comments"
                  value={resultComments}
                  onChange={(e) => setResultComments(e.target.value)}
                  className="w-full bg-white rounded-xl border border-gray-200 px-4 py-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 shadow-[0_1px_2px_rgba(0,0,0,0.02)] resize-none"
                  placeholder="Enter any comments..."
                  rows={4}
                />
              </section>
              {/* END: CommentsSection */}
            </div>

            {/* BEGIN: FooterActions */}
            <footer
              className="mt-10 flex justify-end items-center gap-3 pt-4 max-w-6xl w-full"
              data-purpose="action-buttons"
            >
              {/* Save Draft Button */}
              <button
                type="button"
                onClick={handleSaveDraftResults}
                className="px-5 py-2 text-[13px] font-medium text-slate-800 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none transition-colors shadow-xs cursor-pointer"
              >
                Save Draft
              </button>
              {/* Save Results Button */}
              <button
                type="button"
                onClick={handleSaveResults}
                className="px-5 py-2 text-[13px] font-medium text-white bg-[#038e5b] hover:bg-[#02754b] rounded-lg focus:outline-none transition-colors shadow-xs cursor-pointer"
              >
                Save Results
              </button>
              {/* Proceed to Mark as Completed */}
              <button
                type="button"
                onClick={() => handleOpenMarkCompleted(selectedSample)}
                className="px-4 py-2 text-[13px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-300 hover:bg-emerald-100 rounded-lg focus:outline-none transition-colors shadow-xs cursor-pointer"
              >
                Mark as Completed →
              </button>
            </footer>
            {/* END: FooterActions */}
          </main>
        ) : viewMode === "mark-completed" ? (
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
              className="max-w-[920px] rounded-xl border border-slate-200 bg-white p-6 shadow-[0_1px_3px_0_rgba(0,0,0,0.02)]"
              data-purpose="completion-form-card"
            >
              {/* Status Banner: Tests Completed */}
              <div
                className="flex items-start gap-3.5 rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-3.5 mb-6"
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
          {/* StatCardsRow */}
          <section
            className="grid grid-cols-1 sm:grid-cols-2 gap-5"
            data-purpose="kpi-metric-cards"
          >
            {/* Card 1: Test Completed */}
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.03)] flex items-center gap-5">
              <div className="w-14 h-14 rounded-full bg-[#def7ec] flex items-center justify-center shrink-0">
                <svg
                  className="w-6 h-6 text-[#059669] stroke-[2.5]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M5 13l4 4L19 7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div>
                <span className="text-[13px] font-semibold text-[#059669]">
                  Test Completed
                </span>
                <h3 className="text-3xl font-extrabold text-slate-800 tracking-tight mt-0.5">
                  {completedCount}
                </h3>
                <p className="text-[12px] text-slate-400 font-normal mt-0.5">
                  Tests completed successfully
                </p>
              </div>
            </div>

            {/* Card 2: Test Result Pending */}
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.03)] flex items-center gap-5">
              <div className="w-14 h-14 rounded-full bg-[#e0edff] flex items-center justify-center shrink-0">
                <svg
                  className="w-6 h-6 text-[#2563eb] stroke-[2.2]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div>
                <span className="text-[13px] font-semibold text-[#2563eb]">
                  Test Result Pending
                </span>
                <h3 className="text-3xl font-extrabold text-slate-800 tracking-tight mt-0.5">
                  {runningCount}
                </h3>
                <p className="text-[12px] text-slate-400 font-normal mt-0.5">
                  Results pending verification
                </p>
              </div>
            </div>
          </section>

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
                {/* Barcode Quick Run Input */}
                <form
                  onSubmit={handleQuickRun}
                  className="relative flex items-center"
                >
                  <input
                    type="text"
                    value={quickInputBarcode}
                    onChange={(e) => setQuickInputBarcode(e.target.value)}
                    placeholder="Scan / Type Barcode..."
                    className="w-48 pl-3 pr-14 py-2.5 bg-white text-sm font-mono text-slate-800 placeholder-slate-400 border border-slate-300 rounded-lg focus:outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500 transition-colors"
                  />
                  <button
                    type="submit"
                    className="absolute right-1.5 px-3 py-1 bg-[#00875A] hover:bg-[#00744E] text-white text-xs font-semibold rounded-md shadow-2xs transition-colors cursor-pointer"
                  >
                    Validate
                  </button>
                </form>

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

                {/* Refresh Button */}
                <button
                  type="button"
                  onClick={fetchRealData}
                  disabled={isLoading}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 transition-colors disabled:opacity-50 cursor-pointer shadow-2xs"
                  title="Reload testing samples from database"
                >
                  <svg
                    className={`w-4 h-4 text-slate-600 ${isLoading ? "animate-spin" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  <span className="hidden sm:inline">Refresh</span>
                </button>
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
                    <th className="py-5 px-6 font-bold" scope="col">
                      ANALYZER BENCH
                    </th>
                    <th
                      className="py-5 px-6 font-bold text-center"
                      scope="col"
                    >
                      START / RUN TIME
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
                          <span className="font-medium text-slate-500">No testing samples found matching your search.</span>
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
                    filteredSamples.map((s) => (
                      <tr
                        key={s.id}
                        onClick={() => handleOpenVerification(s)}
                        className="hover:bg-slate-50/70 transition-colors cursor-pointer"
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
                          <span className="font-medium text-slate-800 block">
                            {s.testName}
                          </span>
                          {s.testResult && (
                            <span className="text-[11px] text-slate-500 block truncate max-w-xs">
                              {s.testResult}
                            </span>
                          )}
                        </td>
                        <td className="py-5 px-6 text-slate-700 text-xs font-normal whitespace-nowrap">
                          {s.analyzerBench}
                        </td>
                        <td className="py-5 px-6 text-center text-slate-600 font-normal whitespace-nowrap">
                          {s.startTime}
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
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenVerification(s);
                              }}
                              className="px-3 py-1.5 bg-[#1e60d5] hover:bg-[#1952be] text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
                            >
                              Verify Sample
                            </button>
                            {s.status === "RUNNING" && (
                              <>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenEnterResults(s);
                                  }}
                                  className="px-3 py-1.5 bg-[#00875A] hover:bg-[#00744E] text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
                                >
                                  Enter Result
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
                            {s.status === "FLAGGED" && (
                              <div className="flex items-center justify-center gap-2">
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
                              </div>
                            )}
                            {s.status === "COMPLETED" && (
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenEnterResults(s);
                                  }}
                                  className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-[#15803d] border border-emerald-200 text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
                                >
                                  Edit Result
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenMarkCompleted(s);
                                  }}
                                  className="px-2.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
                                >
                                  Review
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate("/doctor/lab/report-generation");
                                  }}
                                  className="px-2.5 py-1.5 bg-[#0b57d0] hover:bg-[#094bb5] text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
                                  title="Go to Report Generation"
                                >
                                  Go to Report →
                                </button>
                              </div>
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
                    ))
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
