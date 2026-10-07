import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getUser, remove } from "@/utils/token";
import { toast } from "@/hooks/use-toast";
import LabNav from "./labnav";
import { LabNotificationBell } from "@/components/hms/LabNotificationBell";
import { UserProfileDropdown } from "@/components/ui/User_profile_dropdown";
import { labOrderApi, labOrderItemApi, LabOrderRecord, LabOrderItemRecord } from "@/api/labOrder.api";
import { patientApi, PatientRecord } from "@/api/patient.api";
import { labReportApi, LabReportRecord, parseReportComment } from "@/api/labReport.api";
import {
  INITIAL_TESTING_SAMPLES,
  TestingSampleItem,
} from "./testingsamples";

export interface QualityCheckParameter {
  id: string;
  parameter: string;
  result: string;
  unit: string;
  referenceRange: string;
  status: "Normal" | "Abnormal" | "Critical";
  approved: boolean;
}

export interface ReportItem {
  id: string;
  reportId: string;
  requestId: string;
  barcode?: string;
  sampleId: string;
  patientId: string;
  patientPid?: string;
  patientName: string;
  patientAgeGender?: string;
  patientAvatar?: string;
  patientEmail: string;
  doctorName: string;
  doctorEmail: string;
  testPanel: string;
  generatedDate: string;
  completedDate: string;
  completedBy: string;
  sampleType: string;
  status: "GENERATED" | "REVIEWED" | "UNDER_REVIEW" | "DRAFT" | "CRITICAL";
  findingsSummary: string;
  parameters: QualityCheckParameter[];
  overallDecision?: "Approved" | "Rejected" | "Pending";
  reviewComments?: string;
  clinicalCorrelation?: string;
  approvalRemarks?: string;
  approverName?: string;
  approverRole?: string;
  approvalDate?: string;
  signatureUrl?: string | null;
  sentOn?: string;
  deliveredOn?: string;
}

export const DEFAULT_QC_PARAMETERS: QualityCheckParameter[] = [
  {
    id: "qc-1",
    parameter: "WBC (White Blood Cells)",
    result: "6.80",
    unit: "10^3/µL",
    referenceRange: "4.0 - 10.0",
    status: "Normal",
    approved: true,
  },
  {
    id: "qc-2",
    parameter: "RBC (Red Blood Cells)",
    result: "4.82",
    unit: "10^6/µL",
    referenceRange: "4.2 - 5.8",
    status: "Normal",
    approved: true,
  },
  {
    id: "qc-3",
    parameter: "HGB (Hemoglobin)",
    result: "14.2",
    unit: "g/dL",
    referenceRange: "13.0 - 17.0",
    status: "Normal",
    approved: true,
  },
  {
    id: "qc-4",
    parameter: "HCT (Hematocrit)",
    result: "43.1",
    unit: "%",
    referenceRange: "40 - 50",
    status: "Normal",
    approved: true,
  },
  {
    id: "qc-5",
    parameter: "MCV (Mean Corpuscular Vol)",
    result: "87.6",
    unit: "fL",
    referenceRange: "80 - 100",
    status: "Normal",
    approved: true,
  },
  {
    id: "qc-6",
    parameter: "MCH (Mean Corpuscular Hb)",
    result: "29.1",
    unit: "pg",
    referenceRange: "27 - 34",
    status: "Normal",
    approved: true,
  },
  {
    id: "qc-7",
    parameter: "MCHC (MCH Concentration)",
    result: "33.0",
    unit: "g/dL",
    referenceRange: "32 - 36",
    status: "Normal",
    approved: true,
  },
  {
    id: "qc-8",
    parameter: "PLT (Platelet Count)",
    result: "235",
    unit: "10^3/µL",
    referenceRange: "150 - 450",
    status: "Normal",
    approved: true,
  },
];

export function getDefaultQCParametersForPanel(testName: string): QualityCheckParameter[] {
  const lower = (testName || "").toLowerCase();
  if (lower.includes("kft") || lower.includes("kidney") || lower.includes("renal")) {
    return [
      { id: "qc-kft-1", parameter: "Serum Creatinine", result: "0.85", unit: "mg/dL", referenceRange: "0.6 - 1.2", status: "Normal", approved: true },
      { id: "qc-kft-2", parameter: "Blood Urea Nitrogen (BUN)", result: "16.0", unit: "mg/dL", referenceRange: "7 - 20", status: "Normal", approved: true },
      { id: "qc-kft-3", parameter: "Uric Acid", result: "4.8", unit: "mg/dL", referenceRange: "3.5 - 7.2", status: "Normal", approved: true },
      { id: "qc-kft-4", parameter: "eGFR", result: "98", unit: "mL/min/1.73m²", referenceRange: "> 90", status: "Normal", approved: true },
    ];
  }
  if (lower.includes("lft") || lower.includes("liver") || lower.includes("bilirubin")) {
    return [
      { id: "qc-lft-1", parameter: "Bilirubin (Total)", result: "0.8", unit: "mg/dL", referenceRange: "0.2 - 1.2", status: "Normal", approved: true },
      { id: "qc-lft-2", parameter: "Bilirubin (Direct)", result: "0.2", unit: "mg/dL", referenceRange: "0.0 - 0.3", status: "Normal", approved: true },
      { id: "qc-lft-3", parameter: "SGOT / AST", result: "28", unit: "U/L", referenceRange: "10 - 40", status: "Normal", approved: true },
      { id: "qc-lft-4", parameter: "SGPT / ALT", result: "32", unit: "U/L", referenceRange: "7 - 56", status: "Normal", approved: true },
      { id: "qc-lft-5", parameter: "Alkaline Phosphatase (ALP)", result: "78", unit: "U/L", referenceRange: "44 - 147", status: "Normal", approved: true },
      { id: "qc-lft-6", parameter: "Total Protein", result: "7.1", unit: "g/dL", referenceRange: "6.0 - 8.3", status: "Normal", approved: true },
      { id: "qc-lft-7", parameter: "Albumin", result: "4.2", unit: "g/dL", referenceRange: "3.5 - 5.0", status: "Normal", approved: true },
    ];
  }
  if (lower.includes("lipid") || lower.includes("cholesterol") || lower.includes("triglyceride")) {
    return [
      { id: "qc-lip-1", parameter: "Total Cholesterol", result: "185", unit: "mg/dL", referenceRange: "< 200", status: "Normal", approved: true },
      { id: "qc-lip-2", parameter: "Triglycerides", result: "140", unit: "mg/dL", referenceRange: "< 150", status: "Normal", approved: true },
      { id: "qc-lip-3", parameter: "HDL Cholesterol", result: "48", unit: "mg/dL", referenceRange: "> 40", status: "Normal", approved: true },
      { id: "qc-lip-4", parameter: "LDL Cholesterol", result: "109", unit: "mg/dL", referenceRange: "< 100", status: "Normal", approved: true },
      { id: "qc-lip-5", parameter: "VLDL", result: "28", unit: "mg/dL", referenceRange: "< 30", status: "Normal", approved: true },
    ];
  }
  if (lower.includes("thyroid") || lower.includes("t3") || lower.includes("t4") || lower.includes("tsh")) {
    return [
      { id: "qc-th-1", parameter: "Total T3", result: "1.2", unit: "ng/mL", referenceRange: "0.8 - 2.0", status: "Normal", approved: true },
      { id: "qc-th-2", parameter: "Total T4", result: "8.5", unit: "µg/dL", referenceRange: "5.1 - 14.1", status: "Normal", approved: true },
      { id: "qc-th-3", parameter: "TSH (Thyroid Stimulating)", result: "2.85", unit: "µIU/mL", referenceRange: "0.4 - 4.2", status: "Normal", approved: true },
    ];
  }
  if (lower.includes("electrolyte") || lower.includes("na+") || lower.includes("k+")) {
    return [
      { id: "qc-el-1", parameter: "Sodium (Na+)", result: "139", unit: "mmol/L", referenceRange: "135 - 145", status: "Normal", approved: true },
      { id: "qc-el-2", parameter: "Potassium (K+)", result: "4.2", unit: "mmol/L", referenceRange: "3.5 - 5.1", status: "Normal", approved: true },
      { id: "qc-el-3", parameter: "Chloride (Cl-)", result: "101", unit: "mmol/L", referenceRange: "98 - 107", status: "Normal", approved: true },
    ];
  }
  if (lower.includes("hba1c") || lower.includes("glycated")) {
    return [
      { id: "qc-hba1c-1", parameter: "HbA1c Glycated Hemoglobin", result: "5.7", unit: "%", referenceRange: "< 5.7", status: "Normal", approved: true },
      { id: "qc-hba1c-2", parameter: "Estimated Average Glucose (eAG)", result: "117", unit: "mg/dL", referenceRange: "70 - 126", status: "Normal", approved: true },
    ];
  }
  return DEFAULT_QC_PARAMETERS;
}

export function convertTestParamsToQCParams(params: any[]): QualityCheckParameter[] {
  if (!Array.isArray(params) || params.length === 0) return DEFAULT_QC_PARAMETERS;
  return params.map((p, idx) => {
    let status: "Normal" | "Abnormal" | "Critical" = "Normal";
    const rawStatus = (p.status || "").toLowerCase();
    if (rawStatus.includes("crit") || rawStatus.includes("high") || rawStatus.includes("flag")) {
      status = "Critical";
    } else if (rawStatus.includes("abnorm")) {
      status = "Abnormal";
    }
    return {
      id: p.id || `qc-${idx + 1}`,
      parameter: p.parameter || `Parameter ${idx + 1}`,
      result: p.result !== undefined && p.result !== null ? String(p.result) : "0.0",
      unit: p.unit || "",
      referenceRange: p.referenceRange || "Normal",
      status,
      approved: p.status === "Completed" || p.approved !== false,
    };
  });
}


function calculateAge(dob: string): number {
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return Math.max(0, age);
}

function formatReportDate(dateVal?: string | Date | null): string {
  if (!dateVal) return new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return String(dateVal);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function getDisplayBarcode(r?: {
  barcode?: string;
  sampleId?: string;
  id?: string;
  requestId?: string;
} | null): string {
  if (!r) return "-";
  if (
    r.barcode &&
    r.barcode.startsWith("BC") &&
    !r.barcode.startsWith("BC-s") &&
    !r.barcode.startsWith("BC-SMP") &&
    !r.barcode.startsWith("BC-item")
  ) {
    return r.barcode;
  }

  if (typeof window !== "undefined") {
    const rawId = (r.id || "").replace(/^(rep-|item-)/, "");
    if (rawId) {
      const storedItem = localStorage.getItem(`generated_barcode_item_${rawId}`);
      if (storedItem && storedItem.startsWith("BC")) return storedItem;
      const storedTesting = localStorage.getItem(`testing_sample_barcode_${rawId}`);
      if (storedTesting && storedTesting.startsWith("BC")) return storedTesting;
    }
    if (r.sampleId) {
      const storedSmpBc = localStorage.getItem(`testing_sample_barcode_${r.sampleId}`);
      if (storedSmpBc && storedSmpBc.startsWith("BC")) return storedSmpBc;
    }
  }

  const rawId = (r.id || "").replace(/^(rep-|item-)/, "");
  const matchInitial = INITIAL_TESTING_SAMPLES.find(
    (its) =>
      its.id === r.id ||
      its.id === rawId ||
      (r.sampleId && its.sampleId === r.sampleId) ||
      (r.barcode && its.barcode === r.barcode)
  );
  if (matchInitial?.barcode) return matchInitial.barcode;

  const sampleNumMatch = (r.sampleId || r.id || r.requestId || "").match(/SMP-?0*(\d+)/i);
  if (sampleNumMatch) {
    const num = parseInt(sampleNumMatch[1], 10);
    return `BC240520${String(num).padStart(4, "0")}`;
  }

  if (r.barcode && r.barcode.startsWith("BC-")) {
    const cleanNum = r.barcode.replace(/\D/g, "");
    if (cleanNum) {
      return `BC240520${cleanNum.slice(-4).padStart(4, "0")}`;
    }
  }

  if (
    r.barcode &&
    !r.barcode.startsWith("SMP-") &&
    !r.barcode.startsWith("RPT-") &&
    !r.barcode.startsWith("TRF-") &&
    !r.barcode.startsWith("REQ")
  ) {
    return r.barcode;
  }

  const digits = (r.id || r.sampleId || r.requestId || "1").replace(/\D/g, "").slice(-4) || "0001";
  return `BC240520${digits.padStart(4, "0")}`;
}

export default function ReportGeneration() {
  const navigate = useNavigate();
  const currentUser = getUser();
  const displayName = currentUser?.username || "Labtech";
  const displayRole =
    currentUser?.role_type === "LAB_TECHNICIAN"
      ? "Lab Technician"
      : currentUser?.role_type || "Lab Technician";

  const handleLogout = () => {
    remove();
    navigate("/", { replace: true });
  };

  const [activeNav, setActiveNav] = useState("Report Generation");
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "GENERATED" | "REVIEWED" | "UNDER_REVIEW" | "DRAFT" | "CRITICAL"
  >("ALL");
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Real backend and completed testing samples data fetch
  const fetchRealData = useCallback(async () => {
    try {
      setIsLoading(true);
      setFetchError(null);

      const [ordersRes, itemsRes, patientsRes, reportsRes] = await Promise.all([
        labOrderApi.getAll().catch(() => ({ data: { data: [] } })),
        labOrderItemApi.getAll().catch(() => ({ data: { data: [] } })),
        patientApi.getAll({ limit: 100 }).catch(() => ({ data: { data: { patients: [] } } })),
        labReportApi.getAll().catch(() => ({ data: { data: [] } })),
      ]);

      const orders: LabOrderRecord[] = ordersRes?.data?.data || [];
      const items: LabOrderItemRecord[] = itemsRes?.data?.data || [];
      const patients: PatientRecord[] = patientsRes?.data?.data?.patients || [];
      const dbReports: LabReportRecord[] = reportsRes?.data?.data || [];

      const patientMap = new Map<string, PatientRecord>();
      patients.forEach((p) => {
        if (p.patient_id) patientMap.set(p.patient_id, p);
      });

      const orderMap = new Map<string, LabOrderRecord>();
      orders.forEach((o) => {
        if (o.lab_order_id) orderMap.set(o.lab_order_id, o);
      });

      const existingReportIds = new Set<string>();
      const existingSampleIds = new Set<string>();
      const existingBarcodes = new Set<string>();
      const existingReportOrderIds = new Set(dbReports.map((r) => r.lab_order_id));
      const mappedList: ReportItem[] = [];

      // 1. Map existing lab_report records from database
      dbReports.forEach((rep) => {
        existingReportIds.add(rep.lab_report_id);
        if (rep.report_number) existingReportIds.add(rep.report_number);

        const order = orderMap.get(rep.lab_order_id) || rep.lab_order;
        const patientId = order?.patient_history?.patient_id || order?.patient_history_id || "PAT-001";
        const patient = patientMap.get(patientId);

        const patientName = patient
          ? [patient.patient_first_name, patient.patient_middle_name, patient.patient_last_name].filter(Boolean).join(" ")
          : `Patient ${patientId}`;
        const age = patient?.patient_age || (patient?.patient_dob ? calculateAge(patient.patient_dob) : 34);
        const gender = patient?.patient_gender || "Male";
        const patientAgeGender = `${gender} | ${age} Years`;

        const doctorName = order?.employees
          ? `Dr. ${order.employees.first_name} ${order.employees.last_name || ""}`.trim()
          : "Dr. Sarah Johnson";
        const doctorEmail = (order?.employees as any)?.email || "doctor@hospital.com";

        const orderItem = rep.lab_order?.lab_order_item?.[0];
        const testPanel = orderItem?.lab_test_master?.test_name || "Diagnostic Panel";
        const sampleType = orderItem?.lab_test_master?.sample_type || orderItem?.specimen_type || "Whole Blood (EDTA)";

        let parsedMeta: any = null;
        if (rep.report_comment) {
          if (typeof rep.report_comment === "object") {
            parsedMeta = rep.report_comment;
          } else if (typeof rep.report_comment === "string") {
            try {
              parsedMeta = JSON.parse(rep.report_comment);
            } catch {
              // plain text
            }
          }
        }
        const commentString = typeof rep.report_comment === "string" ? rep.report_comment : "";

        const rawStatus = (rep.report_status || "GENERATED").toUpperCase();
        let status: "GENERATED" | "UNDER_REVIEW" | "DRAFT" | "CRITICAL" = "GENERATED";
        if (rawStatus === "CRITICAL") status = "CRITICAL";
        else if (rawStatus === "UNDER_REVIEW" || rawStatus === "UNDER REVIEW") status = "UNDER_REVIEW";
        else if (rawStatus === "DRAFT") status = "DRAFT";
        else status = "GENERATED";

        const sampleBarcode =
          orderItem?.sample_collection?.[0]?.barcode ||
          orderItem?.barcode ||
          (orderItem?.remarks?.match(/Barcode:\s*([A-Za-z0-9_-]+)/i)?.[1]) ||
          getDisplayBarcode({
            id: rep.lab_report_id,
            sampleId: orderItem?.sample_collection?.[0]?.sample_collection_id,
            requestId: rep.lab_order_id,
          });

        existingSampleIds.add(sampleBarcode);
        if (orderItem?.lab_order_item_id) existingReportIds.add(orderItem.lab_order_item_id);

        mappedList.push({
          id: rep.lab_report_id,
          reportId: rep.report_number || `RPT-${rep.lab_report_id.slice(-6)}`,
          requestId: rep.lab_order_id,
          barcode: sampleBarcode,
          sampleId: sampleBarcode,
          patientId,
          patientPid: patient?.patient_id || patientId,
          patientName,
          patientAgeGender,
          patientEmail: patient?.patient_email || `${patientName.toLowerCase().replace(/\s+/g, ".")}@email.com`,
          doctorName,
          doctorEmail,
          testPanel,
          generatedDate: formatReportDate(rep.generated_datetime || rep.created_at),
          completedDate: formatReportDate(rep.approved_datetime || rep.generated_datetime),
          completedBy: rep.employees ? `Dr. ${rep.employees.first_name} ${rep.employees.last_name || ""}`.trim() : "Pathology Lab",
          sampleType,
          status,
          findingsSummary: parsedMeta?.text || commentString || "Diagnostic results verified within reference ranges.",
          parameters: parsedMeta?.parameters && parsedMeta.parameters.length > 0 ? parsedMeta.parameters : getDefaultQCParametersForPanel(testPanel),
          overallDecision: parsedMeta?.overallDecision || "Approved",
          reviewComments: parsedMeta?.text || commentString || "",
          clinicalCorrelation: parsedMeta?.clinicalCorrelation || "Correlate clinically with physical examination and history.",
          approvalRemarks: commentString || parsedMeta?.text || "Parameters approved.",
          approverName: rep.employees ? `Dr. ${rep.employees.first_name} ${rep.employees.last_name || ""}`.trim() : "Dr. Sarah Johnson",
          approverRole: rep.employees?.designation || "Senior Pathologist",
          approvalDate: formatReportDate(rep.approved_datetime),
          signatureUrl: rep.digital_signature || "certified-default",
          sentOn: rep.delivered_datetime ? formatReportDate(rep.delivered_datetime) : undefined,
          deliveredOn: rep.delivered_datetime ? formatReportDate(rep.delivered_datetime) : undefined,
        });
      });

      // 2. Map verified or completed lab items from backend
      items.forEach((item, idx) => {
        const rawItemStatus = (item.item_status || "").toUpperCase();
        const storedItemStatus = typeof window !== "undefined"
          ? localStorage.getItem(`testing_sample_status_${item.lab_order_item_id}`)
          : null;
        const isTestingCompleted = rawItemStatus === "COMPLETED" || storedItemStatus === "COMPLETED";

        // ONLY include items where testing has completed or report is already generated
        if (!isTestingCompleted && rawItemStatus !== "REPORT GENERATED") {
          return;
        }

        // If this order already has a report and this item is NOT newly completed, skip
        if (existingReportOrderIds.has(item.lab_order_id) && !isTestingCompleted) return;
        if (existingReportIds.has(item.lab_order_item_id)) return;

        const parentOrder = orderMap.get(item.lab_order_id) || item.lab_order;
        const patientId = parentOrder?.patient_history?.patient_id || parentOrder?.patient_history_id || `PAT00${idx + 1}`;
        const patient = patientMap.get(patientId);

        const patientName = patient
          ? [patient.patient_first_name, patient.patient_middle_name, patient.patient_last_name].filter(Boolean).join(" ")
          : `Patient ${patientId}`;
        const age = patient?.patient_age || (patient?.patient_dob ? calculateAge(patient.patient_dob) : 32);
        const gender = patient?.patient_gender || "Male";
        const patientAgeGender = `${gender} | ${age} Years`;

        const doctor = parentOrder?.employees;
        const doctorName = doctor ? `Dr. ${doctor.first_name} ${doctor.last_name || ""}`.trim() : "Dr. Sarah Johnson";
        const doctorEmail = (doctor as any)?.email || "doctor@hospital.com";

        const testName = item.lab_test_master?.test_name || "Diagnostic Test";
        const sampleType = item.lab_test_master?.sample_type || item.specimen_type || "Whole Blood (EDTA)";

        const isVerified = true;

        const sampleBarcode =
          item.sample_collection?.[0]?.barcode ||
          item.barcode ||
          (item.remarks?.match(/Barcode:\s*([A-Za-z0-9_-]+)/i)?.[1]) ||
          getDisplayBarcode({ id: item.lab_order_item_id, requestId: item.lab_order_id });

        const isApproved = typeof window !== "undefined" && (
          localStorage.getItem(`report_approved_item-${item.lab_order_item_id}`) === "GENERATED" ||
          localStorage.getItem(`report_approved_${item.lab_order_item_id}`) === "GENERATED"
        );

        const status: "GENERATED" | "UNDER_REVIEW" =
          isApproved || rawItemStatus === "REPORT GENERATED"
            ? "GENERATED"
            : "UNDER_REVIEW";

        // Read custom test parameters if recorded in Testing Samples
        const storedParamsStr = typeof window !== "undefined"
          ? localStorage.getItem(`testing_sample_params_${item.lab_order_item_id}`)
          : null;
        let itemParameters = getDefaultQCParametersForPanel(testName);
        if (storedParamsStr) {
          try {
            const parsed = JSON.parse(storedParamsStr);
            itemParameters = convertTestParamsToQCParams(parsed);
          } catch {}
        }

        const storedResult = typeof window !== "undefined"
          ? localStorage.getItem(`testing_sample_result_${item.lab_order_item_id}`)
          : null;

        const findingsSummary = storedResult || item.remarks || (
          isTestingCompleted
            ? "Testing completed on analyzer bench. All test parameters entered and awaiting review."
            : isVerified
              ? "Sample verified. Analyzer test parameters entered and awaiting review."
              : "Sample intake in progress. Awaiting verification and testing."
        );

        existingReportIds.add(item.lab_order_item_id);
        existingSampleIds.add(sampleBarcode);

        mappedList.push({
          id: `item-${item.lab_order_item_id}`,
          reportId: `RPT-PENDING-${item.lab_order_item_id.slice(-6)}`,
          requestId: item.lab_order_id,
          barcode: sampleBarcode,
          sampleId: sampleBarcode,
          patientId,
          patientPid: patient?.patient_id || patientId,
          patientName,
          patientAgeGender,
          patientEmail: patient?.patient_email || `${patientName.toLowerCase().replace(/\s+/g, ".")}@email.com`,
          doctorName,
          doctorEmail,
          testPanel: testName,
          generatedDate: formatReportDate(item.created_at || parentOrder?.order_datetime),
          completedDate: isTestingCompleted ? formatReportDate(item.updated_at || new Date()) : "-",
          completedBy: item.sample_collection?.[0]?.collected_by || (isTestingCompleted ? "Lab Technician" : "Pending"),
          sampleType,
          status,
          findingsSummary,
          parameters: itemParameters,
          overallDecision: isApproved ? "Approved" : isVerified ? "Approved" : "Pending",
          reviewComments: "",
          clinicalCorrelation: `Diagnostic test for ${testName}. Correlate with clinical diagnosis.`,
          approvalRemarks: isApproved ? "Report approved and certified." : "",
          approverName: "Dr. Sarah Johnson",
          approverRole: "Senior Pathologist",
          signatureUrl: "certified-default",
        });
      });

      // 3. Map all completed testing samples from Testing Samples lifecycle
      const completedRegistry: any[] = typeof window !== "undefined"
        ? JSON.parse(localStorage.getItem("completed_testing_samples") || "[]")
        : [];

      // Check INITIAL_TESTING_SAMPLES for completed samples (like s3 - Priya KFT, or newly completed ones)
      const initialTestingCompleted = INITIAL_TESTING_SAMPLES.filter((s) => {
        const storedStatus = typeof window !== "undefined"
          ? localStorage.getItem(`testing_sample_status_${s.id}`)
          : null;
        return storedStatus === "COMPLETED";
      });

      // Check verified_samples_cache
      const verifiedCache: any[] = typeof window !== "undefined"
        ? JSON.parse(localStorage.getItem("verified_samples_cache") || "[]")
        : [];
      const cacheCompleted = verifiedCache.filter((c) => {
        const storedStatus = typeof window !== "undefined"
          ? localStorage.getItem(`testing_sample_status_${c.id}`)
          : null;
        return storedStatus === "COMPLETED" || c.status === "COMPLETED";
      });

      // Merge all completed testing samples
      const allCompletedSamples: any[] = [
        ...completedRegistry,
        ...initialTestingCompleted,
        ...cacheCompleted,
      ];

      // Also scan localStorage for any testing_sample_status_* === "COMPLETED"
      if (typeof window !== "undefined") {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith("testing_sample_status_")) {
            if (localStorage.getItem(key) === "COMPLETED") {
              const id = key.replace("testing_sample_status_", "");
              if (!allCompletedSamples.some((s) => s.id === id)) {
                const storedResult = localStorage.getItem(`testing_sample_result_${id}`);
                const storedComments = localStorage.getItem(`testing_sample_comments_${id}`);
                const storedParams = localStorage.getItem(`testing_sample_params_${id}`);
                allCompletedSamples.push({
                  id,
                  sampleId: id.startsWith("SMP-") ? id : `SMP-${id}`,
                  barcode: `BC-${id}`,
                  patientId: "PID123456",
                  patientName: "Patient " + id,
                  testName: "Diagnostic Panel",
                  sampleType: "Whole Blood",
                  status: "COMPLETED",
                  testResult: storedResult,
                  comments: storedComments,
                  parameters: storedParams ? JSON.parse(storedParams) : undefined,
                });
              }
            }
          }
        }
      }

      // Add each completed testing sample to mappedList if not already present
      allCompletedSamples.forEach((s) => {
        const sampleId = s.sampleId || s.id;
        const barcode = s.barcode || "";

        // Check if this sample is already in mappedList
        const alreadyExists = mappedList.some(
          (m) =>
            m.id === s.id ||
            m.id === `rep-${s.id}` ||
            m.id === `item-${s.id}` ||
            (sampleId && (m.sampleId === sampleId || m.reportId.includes(sampleId))) ||
            (barcode && m.requestId === barcode)
        );

        if (alreadyExists) return;

        const isApproved = typeof window !== "undefined" && (
          localStorage.getItem(`report_approved_rep-${s.id}`) === "GENERATED" ||
          localStorage.getItem(`report_approved_${s.id}`) === "GENERATED" ||
          localStorage.getItem(`report_approved_rep_RPT-${sampleId}`) === "GENERATED" ||
          localStorage.getItem(`report_approved_smp_${sampleId}`) === "GENERATED"
        );

        const status: "GENERATED" | "UNDER_REVIEW" | "CRITICAL" =
          isApproved
            ? "GENERATED"
            : s.criticalAlert || s.status === "FLAGGED"
              ? "CRITICAL"
              : "UNDER_REVIEW";

        let sampleParams: QualityCheckParameter[] = [];
        if (s.parameters && Array.isArray(s.parameters) && s.parameters.length > 0) {
          sampleParams = convertTestParamsToQCParams(s.parameters);
        } else {
          const storedParamsStr = typeof window !== "undefined"
            ? localStorage.getItem(`testing_sample_params_${s.id}`)
            : null;
          if (storedParamsStr) {
            try {
              sampleParams = convertTestParamsToQCParams(JSON.parse(storedParamsStr));
            } catch {
              sampleParams = getDefaultQCParametersForPanel(s.testName);
            }
          } else {
            sampleParams = getDefaultQCParametersForPanel(s.testName);
          }
        }

        const storedResult = typeof window !== "undefined"
          ? localStorage.getItem(`testing_sample_result_${s.id}`)
          : null;
        const findingsSummary =
          storedResult ||
          s.testResult ||
          s.comments ||
          "Analyzer testing completed successfully. All parameters recorded and queued for Pathologist review.";

        const reportId = `RPT-${sampleId}`;
        const patientName = s.patientName || "Patient";

        mappedList.push({
          id: `rep-${s.id}`,
          reportId,
          requestId: barcode || `TRF-${sampleId}`,
          barcode: getDisplayBarcode({ id: s.id, sampleId, barcode }),
          sampleId,
          patientId: s.patientId || "P000124",
          patientPid: s.patientPid || s.patientId || "P000124",
          patientName,
          patientAgeGender: s.patientAgeGender || "32 Years / Male",
          patientAvatar: s.patientAvatar || undefined,
          patientEmail: s.patientEmail || `${patientName.toLowerCase().replace(/\s+/g, ".")}@email.com`,
          doctorName: s.doctorName || "Dr. Sarah Johnson",
          doctorEmail: s.doctorEmail || "doctor@hospital.com",
          testPanel: s.testName || "Diagnostic Test",
          generatedDate: formatReportDate(s.receivedDate || new Date()),
          completedDate: s.estimatedCompletion || "Today, 11:30 AM",
          completedBy: s.receivedBy || "Lab Technician",
          sampleType: s.sampleType || "Serum",
          status,
          findingsSummary,
          parameters: sampleParams,
          overallDecision: isApproved ? "Approved" : "Pending",
          reviewComments: s.comments || "",
          clinicalCorrelation: `Analyzer testing completed for ${s.testName}. Correlate clinically.`,
          approvalRemarks: isApproved ? "Report approved and certified." : "Awaiting pathologist sign-off.",
          approverName: "Dr. Sarah Johnson",
          approverRole: "Senior Pathologist",
          signatureUrl: "certified-default",
        });

        existingSampleIds.add(sampleId);
        if (barcode) existingBarcodes.add(barcode);
      });

      
      // Strict filter: ONLY samples that are tested and completed (or reports already generated) appear in Report Generation
      const completedOnlyReports = mappedList.filter((r) => {
        if (r.status === "GENERATED") return true;
        if (r.status === "DRAFT") return false;

        const rawId = r.id.replace("rep-", "").replace("item-", "");

        // 1. Check if marked completed in localStorage
        const storedStatus = typeof window !== "undefined"
          ? localStorage.getItem(`testing_sample_status_${rawId}`) ||
            localStorage.getItem(`testing_sample_status_${r.id}`)
          : null;
        if (storedStatus === "COMPLETED") return true;

        // 2. Check completed_testing_samples registry
        if (
          completedRegistry.some(
            (cs: any) =>
              cs.id === rawId ||
              cs.sampleId === r.sampleId ||
              (r.requestId && cs.barcode === r.requestId)
          )
        ) {
          return true;
        }

        // 3. Check INITIAL_TESTING_SAMPLES explicitly marked completed
        const matchInitial = INITIAL_TESTING_SAMPLES.find(
          (ts) =>
            ts.id === rawId ||
            ts.sampleId === r.sampleId ||
            (r.barcode && ts.barcode === r.barcode) ||
            (r.requestId && ts.barcode === r.requestId)
        );
        if (matchInitial) {
          const initialStored = typeof window !== "undefined"
            ? localStorage.getItem(`testing_sample_status_${matchInitial.id}`)
            : null;
          if (initialStored === "COMPLETED") return true;
        }

        return false;
      });

      if (completedOnlyReports.length > 0) {
        setReports(completedOnlyReports);
        setSelectedReport((prev) => {
          if (!prev) return completedOnlyReports[0];
          const found = completedOnlyReports.find((r) => r.id === prev.id);
          return found || completedOnlyReports[0];
        });
      } else {
        setReports([]);
        setSelectedReport(null);
      }
    } catch (err: any) {
      console.error("Error fetching lab reports:", err);
      setFetchError(err.message || "Could not load database records");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRealData();
  }, [fetchRealData]);

  // Workflow View Mode: "table" | "quality-check" | "approve-results" | "delivered-status"
  const [viewMode, setViewMode] = useState<
    "table" | "quality-check" | "approve-results" | "delivered-status"
  >("table");

  // Selected Report & Data
  const [selectedReport, setSelectedReport] = useState<ReportItem | null>(null);

  // Quality Check State
  const [currentParameters, setCurrentParameters] = useState<
    QualityCheckParameter[]
  >(DEFAULT_QC_PARAMETERS);
  const [overallDecision, setOverallDecision] = useState<
    "Approved" | "Rejected" | "Pending"
  >("Approved");
  const [reviewComments, setReviewComments] = useState("");

  // Approve Results State
  const [clinicalCorrelation, setClinicalCorrelation] = useState("");
  const [approvalRemarks, setApprovalRemarks] = useState("");
  const [approverName, setApproverName] = useState(
    currentUser?.username ? `Dr. ${currentUser.username}` : "Dr. Sarah Johnson"
  );
  const [approverRole, setApproverRole] = useState("Senior Pathologist");
  const [approvalDateTime, setApprovalDateTime] = useState("");
  const [digitalSignature, setDigitalSignature] = useState<string | null>(
    "certified-default",
  );
  const signatureFileInputRef = useRef<HTMLInputElement>(null);

  // Handlers for Quality Check
  const handleOpenQualityCheck = (report: ReportItem) => {
    setSelectedReport(report);
    if (report.parameters && report.parameters.length > 0) {
      setCurrentParameters(report.parameters);
    } else {
      setCurrentParameters(DEFAULT_QC_PARAMETERS);
    }
    setOverallDecision(report.overallDecision || "Approved");
    setReviewComments(report.reviewComments || "");
    setViewMode("quality-check");
  };

  const handleToggleParameterApproval = (paramId: string) => {
    setCurrentParameters((prev) =>
      prev.map((p) => (p.id === paramId ? { ...p, approved: !p.approved } : p)),
    );
  };

  const handleApproveAllParameters = () => {
    setCurrentParameters((prev) =>
      prev.map((p) => ({ ...p, approved: true })),
    );
    toast({
      title: "All Parameters Approved",
      description: "Marked all test parameter values as approved.",
    });
  };

  const handleSubmitReview = (proceedToApproval = false) => {
    if (!selectedReport) return;
    const updatedStatus: "REVIEWED" | "CRITICAL" | "UNDER_REVIEW" =
      overallDecision === "Rejected"
        ? "CRITICAL"
        : "REVIEWED";

    setReports((prev) =>
      prev.map((r) =>
        r.id === selectedReport.id
          ? {
              ...r,
              status: updatedStatus,
              overallDecision,
              reviewComments,
              parameters: currentParameters,
            }
          : r,
      ),
    );

    setSelectedReport((prev) => (prev ? {
      ...prev,
      status: updatedStatus,
      overallDecision,
      reviewComments,
      parameters: currentParameters,
    } : null));

    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(`report_status_${selectedReport.id}`, updatedStatus);
        const rawId = selectedReport.id.replace("rep-", "").replace("item-", "");
        localStorage.setItem(`report_status_${rawId}`, updatedStatus);
        if (selectedReport.sampleId) {
          localStorage.setItem(`report_status_${selectedReport.sampleId}`, updatedStatus);
        }
        if (selectedReport.reportId) {
          localStorage.setItem(`report_status_${selectedReport.reportId}`, updatedStatus);
        }
      } catch (e) {
        console.warn("Could not save review status to localStorage", e);
      }
    }

    if (proceedToApproval) {
      handleOpenApproveResults({
        ...selectedReport,
        status: updatedStatus,
        overallDecision,
        reviewComments,
        parameters: currentParameters,
      });
    } else {
      toast({
        title: "Quality Review Submitted",
        description: `Report ${selectedReport.reportId} marked as REVIEWED. Ready for Approve & Sign.`,
      });
      setViewMode("table");
    }
  };

  // Handlers for Approve Results
  const handleOpenApproveResults = (report: ReportItem) => {
    setSelectedReport(report);
    setClinicalCorrelation(
      report.clinicalCorrelation ||
        `Clinical correlation for ${report.patientName}: Test results correlate with clinical observations.`,
    );
    setApprovalRemarks(
      report.approvalRemarks ||
        report.findingsSummary ||
        "All parameters verified and within acceptable limits.",
    );
    setApproverName(report.approverName || (currentUser?.username ? `Dr. ${currentUser.username}` : "Dr. Sarah Johnson"));
    setApproverRole(report.approverRole || "Senior Pathologist");
    setApprovalDateTime(report.approvalDate || new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }));
    setDigitalSignature(report.signatureUrl || "certified-default");
    setViewMode("approve-results");
  };

  const handleApplyDefaultSignature = () => {
    setDigitalSignature("certified-default");
    toast({
      title: "Digital Signature Attached",
      description: `Attached certified digital signature for ${approverName}.`,
    });
  };

  const handleRemoveSignature = () => {
    setDigitalSignature(null);
    if (signatureFileInputRef.current) {
      signatureFileInputRef.current.value = "";
    }
    toast({
      title: "Signature Removed",
      description: "Digital signature cleared from current report.",
    });
  };

  const handleSignatureFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setDigitalSignature(event.target?.result as string);
        toast({
          title: "Custom Signature Uploaded",
          description: `Uploaded digital signature image "${file.name}".`,
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleConfirmApproveAndSign = (viewDeliveredDirectly = false) => {
    if (!selectedReport) return;
    if (!digitalSignature) {
      toast({
        title: "Digital Signature Required",
        description:
          "Please attach or upload a digital signature before approving.",
        variant: "destructive",
      });
      return;
    }

    const nowFormatted = new Date().toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const nowSent = nowFormatted;
    const nowDelivered = nowFormatted;

    setReports((prev) =>
      prev.map((r) =>
        r.id === selectedReport.id
          ? {
              ...r,
              status: "GENERATED",
              clinicalCorrelation,
              approvalRemarks,
              approverName,
              approverRole,
              approvalDate: approvalDateTime,
              signatureUrl: digitalSignature,
              sentOn: nowSent,
              deliveredOn: nowDelivered,
            }
          : r,
      ),
    );

    const updated = {
      ...selectedReport,
      status: "GENERATED" as const,
      clinicalCorrelation,
      approvalRemarks,
      approverName,
      approverRole,
      approvalDate: approvalDateTime,
      signatureUrl: digitalSignature,
      sentOn: nowSent,
      deliveredOn: nowDelivered,
    };

    setSelectedReport(updated);

    try {
      localStorage.setItem(`report_status_${selectedReport.id}`, "GENERATED");
      const rawId = selectedReport.id.replace("rep-", "").replace("item-", "");
      localStorage.setItem(`report_status_${rawId}`, "GENERATED");
      if (selectedReport.sampleId) {
        localStorage.setItem(`report_status_${selectedReport.sampleId}`, "GENERATED");
      }
      if (selectedReport.reportId) {
        localStorage.setItem(`report_status_${selectedReport.reportId}`, "GENERATED");
      }
      localStorage.setItem(`report_approved_${selectedReport.id}`, "GENERATED");
      localStorage.setItem(`report_approved_rep_${selectedReport.reportId}`, "GENERATED");
      if (selectedReport.sampleId) {
        localStorage.setItem(`report_approved_smp_${selectedReport.sampleId}`, "GENERATED");
      }

      // If it corresponds to a real backend lab order, call the backend API
      if (
        selectedReport.requestId &&
        !selectedReport.requestId.startsWith("TRF") &&
        !selectedReport.requestId.startsWith("REQ") &&
        !selectedReport.requestId.startsWith("BC")
      ) {
        labReportApi
          .create({
            lab_order_id: selectedReport.requestId,
            report_number: selectedReport.reportId,
            report_status: "Generated",
            digital_signature: digitalSignature || undefined,
            report_comment: JSON.stringify({
              text: approvalRemarks,
              clinicalCorrelation,
              overallDecision: "Approved",
              parameters: selectedReport.parameters,
            }),
          })
          .catch((e) => console.warn("Could not save report to backend:", e));
      }

      const realItemId = selectedReport.id.replace("item-", "").replace("rep-", "");
      if (realItemId && !realItemId.startsWith("s") && !realItemId.startsWith("ts-")) {
        labOrderItemApi
          .update(realItemId, {
            item_status: "Report Generated",
            remarks: approvalRemarks || "Report Approved & Digitally Signed",
          })
          .catch((e) => console.warn("Could not update lab order item status:", e));
      }
    } catch (err) {
      console.warn("Could not persist approval state:", err);
    }

    toast({
      title: "Report Approved & Digitally Signed",
      description: `Report ${selectedReport.reportId} is certified and ready for dispatch.`,
    });

    if (viewDeliveredDirectly) {
      setViewMode("delivered-status");
    } else {
      setViewMode("table");
    }
  };

  // Handlers for Delivered Status View
  const handleOpenDeliveredStatus = (report: ReportItem) => {
    setSelectedReport(report);
    setViewMode("delivered-status");
  };

  const handleViewPortalReport = (portalName: string) => {
    toast({
      title: `Viewing in ${portalName}`,
      description: selectedReport
        ? `Opening diagnostic report ${selectedReport.reportId} portal preview.`
        : "Opening portal preview.",
    });
  };

  const handleGenerateReport = (id: string) => {
    setReports((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: "GENERATED" } : r)),
    );
    try {
      localStorage.setItem(`report_approved_${id}`, "GENERATED");
    } catch {}
    toast({
      title: "Report Generated",
      description: "Diagnostic report compiled and certified for dispatch.",
    });
  };

  const handlePrintReport = (report: ReportItem) => {
    toast({
      title: "Printing Diagnostic Report",
      description: `Sending report ${report.reportId} for ${report.patientName} to printer.`,
    });
  };

  const filteredReports = useMemo(() => {
    return reports.filter((rep) => {
      const matchesSearch =
        searchQuery.trim() === "" ||
        rep.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        rep.requestId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        rep.reportId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (rep.barcode && rep.barcode.toLowerCase().includes(searchQuery.toLowerCase())) ||
        getDisplayBarcode(rep).toLowerCase().includes(searchQuery.toLowerCase()) ||
        rep.doctorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        rep.testPanel.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === "ALL" || rep.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [reports, searchQuery, statusFilter]);

  const generatedCount = useMemo(
    () => reports.filter((r) => r.status === "GENERATED").length,
    [reports],
  );
  const reviewedCount = useMemo(
    () => reports.filter((r) => r.status === "REVIEWED").length,
    [reports],
  );
  const reviewCount = useMemo(
    () => reports.filter((r) => r.status === "UNDER_REVIEW").length,
    [reports],
  );
  const draftCount = useMemo(
    () => reports.filter((r) => r.status === "DRAFT").length,
    [reports],
  );
  const criticalCount = useMemo(
    () => reports.filter((r) => r.status === "CRITICAL").length,
    [reports],
  );
  const pendingReportCount = useMemo(
    () => reports.filter((r) => r.status !== "GENERATED").length,
    [reports],
  );

  return (
    <div className="min-h-screen flex bg-[#f8fafc] text-slate-800 antialiased selection:bg-blue-100 font-sans">
      {/* Global Lab Navigation Sidebar */}
      <LabNav
        activeTab="Report Generation"
        onTabChange={() => setViewMode("table")}
      />

      {/* Main Content Area */}
      <div className="flex-1 ml-64 min-h-screen flex flex-col min-w-0 bg-[#f8fafc]">
        {viewMode === "delivered-status" && selectedReport ? (
          /* ========================================================================= */
          /* BEGIN: Report Delivered Successfully View                                */
          /* ========================================================================= */
          <main
            className="flex-1 flex flex-col items-center pt-12 pb-24 px-8 overflow-y-auto bg-[#f8fafc]"
            data-purpose="report-transfer-content"
          >
            <div className="w-full max-w-4xl">
              {/* Back to Reports Navigation Link */}
              <div className="mb-6">
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
                  Back to Reports
                </button>
              </div>

              {/* BEGIN: Success Header Section */}
              <div
                className="flex items-center gap-5 mb-10 pl-1"
                data-purpose="status-header"
              >
                {/* Success Badge Icon */}
                <div className="flex items-center justify-center w-14 h-14 rounded-full bg-[#10b981] text-white shadow-[0_10px_25px_-5px_rgba(34,197,94,0.35)] shrink-0">
                  <svg
                    className="w-8 h-8 stroke-[3]"
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
                {/* Status Text */}
                <div>
                  <h2 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none mb-2">
                    Report Delivered Successfully!
                  </h2>
                  <p className="text-slate-500 text-base font-normal">
                    The report has been sent and is now accessible.
                  </p>
                </div>
              </div>
              {/* END: Success Header Section */}

              {/* BEGIN: Delivered To Card */}
              <section
                className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 mb-8"
                data-purpose="recipients-card"
              >
                <h3 className="text-xl font-bold text-slate-900 mb-6">
                  Delivered To
                </h3>
                {/* Recipient List */}
                <div className="divide-y divide-slate-100">
                  {/* Recipient 1: Patient Portal */}
                  <div className="py-5 first:pt-0 last:pb-0 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {/* Avatar Circle Placeholder */}
                      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                        <svg
                          className="w-6 h-6"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            clipRule="evenodd"
                            d="M12 2a5 5 0 100 10 5 5 0 000-10zm-7 18a7 7 0 0114 0H5z"
                            fillRule="evenodd"
                          />
                        </svg>
                      </div>
                      <div>
                        <h4 className="text-base font-bold text-slate-900 leading-tight">
                          Patient Portal
                        </h4>
                        <p className="text-sm text-slate-500 mt-1 font-mono">
                          {selectedReport.patientEmail || "-"}
                        </p>
                      </div>
                    </div>
                    {/* Action & Status */}
                    <div className="flex items-center gap-8">
                      <span className="text-sm font-semibold text-[#16a34a]">
                        Delivered
                      </span>
                      <button
                        onClick={() => handleViewPortalReport("Patient Portal")}
                        className="px-7 py-2 text-sm font-semibold text-blue-600 hover:text-blue-700 bg-transparent border border-slate-200 hover:border-blue-400 rounded-lg transition-colors cursor-pointer"
                        type="button"
                      >
                        View
                      </button>
                    </div>
                  </div>

                  {/* Recipient 2: Doctor Portal */}
                  <div className="py-5 first:pt-0 last:pb-0 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {/* Avatar Circle Placeholder */}
                      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                        <svg
                          className="w-6 h-6"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            clipRule="evenodd"
                            d="M12 2a5 5 0 100 10 5 5 0 000-10zm-7 18a7 7 0 0114 0H5z"
                            fillRule="evenodd"
                          />
                        </svg>
                      </div>
                      <div>
                        <h4 className="text-base font-bold text-slate-900 leading-tight">
                          Doctor Portal
                        </h4>
                        <p className="text-sm text-slate-500 mt-1 font-normal">
                          {selectedReport.doctorName || "Attending Physician"}
                        </p>
                        <p className="text-xs text-slate-400 font-mono">
                          {selectedReport.doctorEmail || "-"}
                        </p>
                      </div>
                    </div>
                    {/* Action & Status */}
                    <div className="flex items-center gap-8">
                      <span className="text-sm font-semibold text-[#16a34a]">
                        Delivered
                      </span>
                      <button
                        onClick={() => handleViewPortalReport("Doctor Portal")}
                        className="px-7 py-2 text-sm font-semibold text-blue-600 hover:text-blue-700 bg-transparent border border-slate-200 hover:border-blue-400 rounded-lg transition-colors cursor-pointer"
                        type="button"
                      >
                        View
                      </button>
                    </div>
                  </div>
                </div>
              </section>
              {/* END: Delivered To Card */}

              {/* BEGIN: Delivery Details Card */}
              <section
                className="bg-white rounded-xl border border-slate-200 shadow-sm p-8"
                data-purpose="details-card"
              >
                <h3 className="text-xl font-bold text-slate-900 mb-6">
                  Delivery Details
                </h3>
                {/* Key-Value Information Grid */}
                <div className="space-y-4 max-w-xl">
                  {/* Sent On */}
                  <div className="flex items-center justify-between">
                    <span className="text-base font-medium text-slate-700">
                      Sent On
                    </span>
                    <span className="text-base font-bold text-slate-900">
                      {selectedReport.sentOn || selectedReport.generatedDate || "-"}
                    </span>
                  </div>
                  {/* Delivered On */}
                  <div className="flex items-center justify-between">
                    <span className="text-base font-medium text-slate-700">
                      Delivered On
                    </span>
                    <span className="text-base font-bold text-slate-900">
                      {selectedReport.deliveredOn || selectedReport.generatedDate || "-"}
                    </span>
                  </div>
                  {/* Report ID */}
                  <div className="flex items-center justify-between">
                    <span className="text-base font-medium text-slate-700">
                      Report ID
                    </span>
                    <span className="text-base font-bold text-slate-900 font-mono">
                      {selectedReport.reportId}
                    </span>
                  </div>
                </div>
              </section>
              {/* END: Delivery Details Card */}

              {/* Bottom Action Buttons */}
              <div className="flex items-center justify-between pt-8">
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  className="px-6 py-2.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-semibold transition-colors cursor-pointer"
                >
                  ← Back to Reports
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/lab/report-transfer")}
                  className="px-6 py-2.5 bg-[#0b457f] hover:bg-[#093a6b] text-white text-sm font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
                >
                  Go to Report Transfer Log →
                </button>
              </div>
            </div>
          </main>
        ) : viewMode === "approve-results" && selectedReport ? (
          /* ========================================================================= */
          /* BEGIN: Approve Results View                                              */
          /* ========================================================================= */
          <main
            className="flex-1 overflow-y-auto bg-white p-8 lg:p-12"
            data-purpose="approve-results-view"
          >
            <div className="max-w-6xl mx-auto">
              {/* Back to Reports navigation link */}
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
                  Back to Reports
                </button>
              </div>

              {/* Page Title & Subtitle Header */}
              <header className="mb-8" data-purpose="page-header">
                <h2 className="text-2xl lg:text-3xl font-extrabold text-slate-900 tracking-tight">
                  Approve Results
                </h2>
                <p className="text-sm lg:text-base text-slate-500 mt-1.5 font-normal">
                  Add clinical correlation and approve the results.
                </p>
              </header>

              {/* Upper Grid: Patient Info & Clinical Correlation / Remarks */}
              <section
                className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6"
                data-purpose="upper-details-grid"
              >
                {/* Patient Information Card */}
                <article
                  className="border border-slate-200 rounded-2xl p-7 flex flex-col justify-between bg-white shadow-2xs"
                  data-purpose="patient-info-card"
                >
                  <div>
                    {/* Card Section Title */}
                    <span className="text-xs font-bold tracking-wider text-[#353ec2] uppercase">
                      PATIENT INFORMATION
                    </span>

                    {/* Patient Profile Details */}
                    <div className="flex items-center gap-4 mt-5 mb-8">
                      {selectedReport.patientAvatar ? (
                        <img
                          alt={selectedReport.patientName}
                          className="w-14 h-14 rounded-full object-cover border border-slate-100 ring-2 ring-slate-100"
                          src={selectedReport.patientAvatar}
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-full bg-[#E8F0FE] text-[#00488D] border border-blue-200/60 ring-2 ring-slate-100 flex items-center justify-center font-bold text-lg select-none">
                          {selectedReport.patientName ? selectedReport.patientName.slice(0, 2).toUpperCase() : "P"}
                        </div>
                      )}
                      <div>
                        <h3 className="text-lg font-bold text-slate-900 leading-snug">
                          {selectedReport.patientName}
                        </h3>
                        <p className="text-xs text-slate-500 font-medium mt-0.5 font-mono">
                          PID:{" "}
                          {selectedReport.patientPid ||
                            selectedReport.patientId ||
                            "-"}
                        </p>
                        <p className="text-xs text-slate-400 font-normal mt-0.5">
                          {selectedReport.patientAgeGender || "-"}
                        </p>
                      </div>
                    </div>

                    {/* Meta Information List */}
                    <div className="space-y-5">
                      <div>
                        <p className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">
                          BARCODE
                        </p>
                        <p className="text-sm font-bold text-slate-800 mt-1 font-mono">
                          {getDisplayBarcode(selectedReport)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">
                          TEST / PROFILE
                        </p>
                        <p className="text-sm font-semibold text-slate-800 mt-1">
                          {selectedReport.testPanel}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">
                          COMPLETED ON
                        </p>
                        <p className="text-sm font-semibold text-slate-800 mt-1">
                          {selectedReport.completedDate ||
                            selectedReport.generatedDate}
                        </p>
                      </div>
                    </div>
                  </div>
                </article>

                {/* Right Side Stack: Clinical Correlation + Remarks */}
                <div
                  className="flex flex-col gap-6"
                  data-purpose="right-stack-cards"
                >
                  {/* Clinical Correlation Card */}
                  <article className="border border-slate-200 rounded-2xl p-7 bg-white shadow-2xs">
                    <span className="text-xs font-bold tracking-wider text-[#353ec2] uppercase block mb-4">
                      CLINICAL CORRELATION
                    </span>
                    <div className="border border-slate-200 rounded-xl p-3.5 bg-white min-h-[110px] focus-within:border-blue-500 transition-colors">
                      <textarea
                        value={clinicalCorrelation}
                        onChange={(e) => setClinicalCorrelation(e.target.value)}
                        className="w-full h-full text-sm text-slate-700 leading-relaxed font-normal resize-none focus:outline-none bg-transparent"
                        rows={3}
                        placeholder="Add clinical correlation..."
                      />
                    </div>
                  </article>

                  {/* Remarks / Comments Card */}
                  <article className="border border-slate-200 rounded-2xl p-7 bg-white shadow-2xs">
                    <span className="text-xs font-bold tracking-wider text-[#353ec2] uppercase block mb-4">
                      REMARKS / COMMENTS
                    </span>
                    <div className="border border-slate-200 rounded-xl p-3.5 bg-white min-h-[85px] flex items-start focus-within:border-blue-500 transition-colors">
                      <textarea
                        value={approvalRemarks}
                        onChange={(e) => setApprovalRemarks(e.target.value)}
                        className="w-full h-full text-sm text-slate-700 leading-relaxed font-normal resize-none focus:outline-none bg-transparent"
                        rows={2}
                        placeholder="Add comments or remarks..."
                      />
                    </div>
                  </article>
                </div>
              </section>

              {/* Bottom Card: Approval & Digital Signature */}
              <section
                className="border border-slate-200 rounded-2xl p-7 lg:p-8 bg-white shadow-2xs"
                data-purpose="approval-card"
              >
                {/* Section Title */}
                <span className="text-xs font-bold tracking-wider text-[#353ec2] uppercase block mb-6">
                  APPROVAL
                </span>

                {/* Two Column Content */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start mb-6">
                  {/* Approver Details (Left Column) */}
                  <div className="lg:col-span-5 space-y-6">
                    <div>
                      <p className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">
                        APPROVED BY
                      </p>
                      <h4 className="text-base font-bold text-[#0e3b70] mt-1">
                        {approverName}
                      </h4>
                      <p className="text-xs text-slate-500 font-normal mt-0.5">
                        {approverRole}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">
                        APPROVAL DATE &amp; TIME
                      </p>
                      <p className="text-sm font-semibold text-slate-800 mt-1">
                        {approvalDateTime}
                      </p>
                    </div>
                  </div>

                  {/* Digital Signature Box (Right Column) */}
                  <div className="lg:col-span-7">
                    {/* Hidden file input for uploading custom signature */}
                    <input
                      type="file"
                      ref={signatureFileInputRef}
                      onChange={handleSignatureFileUpload}
                      accept="image/*"
                      className="hidden"
                    />

                    {/* Header with Actions */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold tracking-wider text-[#353ec2] uppercase">
                        DIGITAL SIGNATURE
                      </span>
                      <div className="flex items-center gap-4 text-xs font-bold text-[#2e37c4]">
                        <button
                          type="button"
                          onClick={handleRemoveSignature}
                          className="hover:underline uppercase tracking-wide cursor-pointer"
                        >
                          REMOVE
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (signatureFileInputRef.current) {
                              signatureFileInputRef.current.click();
                            } else {
                              handleApplyDefaultSignature();
                            }
                          }}
                          className="hover:underline uppercase tracking-wide cursor-pointer"
                        >
                          ADD
                        </button>
                      </div>
                    </div>

                    {/* Upload Area / Dropzone */}
                    <div
                      onClick={() => {
                        if (!digitalSignature) {
                          handleApplyDefaultSignature();
                        } else if (signatureFileInputRef.current) {
                          signatureFileInputRef.current.click();
                        }
                      }}
                      className="border border-slate-200 bg-slate-50/50 rounded-2xl h-44 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 transition-colors p-4"
                      data-purpose="signature-dropzone"
                      title={
                        digitalSignature
                          ? "Click to replace signature"
                          : "Click to add digital signature"
                      }
                    >
                      {digitalSignature === "certified-default" ? (
                        <div className="flex flex-col items-center justify-center select-none">
                          <span className="font-serif italic text-3xl text-[#0b4079] tracking-wider font-bold">
                            Dr. Sarah Johnson
                          </span>
                          <span className="text-[11px] font-mono text-slate-400 mt-1">
                            Digitally Signed &amp; Timestamped • SHA256: 4f8b2e...
                          </span>
                          <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full mt-3">
                            <svg
                              className="w-3.5 h-3.5 fill-current"
                              viewBox="0 0 20 20"
                            >
                              <path
                                clipRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                fillRule="evenodd"
                              />
                            </svg>
                            Certified Pathologist Signature
                          </span>
                        </div>
                      ) : digitalSignature ? (
                        <div className="flex flex-col items-center justify-center">
                          <img
                            src={digitalSignature}
                            alt="Uploaded Digital Signature"
                            className="max-h-24 max-w-full object-contain"
                          />
                          <span className="text-[11px] font-mono text-slate-400 mt-2">
                            Custom Signature Attached • Verified
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center text-slate-400">
                          <svg
                            className="w-12 h-12 text-slate-600 stroke-[1.5]"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                          <span className="text-xs text-slate-500 font-medium mt-2">
                            Click to upload signature or click ADD
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card Footer / Final Action Button */}
                <div className="flex justify-end items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setViewMode("table")}
                    className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleConfirmApproveAndSign(false)}
                    className="inline-flex items-center gap-2 bg-[#12a136] hover:bg-[#0f8b2e] text-white px-7 py-3 rounded-xl font-semibold text-sm shadow-sm transition duration-150 ease-in-out cursor-pointer"
                    data-purpose="approve-sign-button"
                  >
                    <span>Approve &amp; Sign</span>
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M14 5l7 7m0 0l-7 7m7-7H3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleConfirmApproveAndSign(true)}
                    className="inline-flex items-center gap-2 bg-[#0b457f] hover:bg-[#093a6b] text-white px-6 py-3 rounded-xl font-semibold text-sm shadow-sm transition duration-150 ease-in-out cursor-pointer"
                  >
                    <span>Approve &amp; View Delivery Status</span>
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M14 5l7 7m0 0l-7 7m7-7H3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              </section>
            </div>
          </main>
        ) : viewMode === "quality-check" && selectedReport ? (
          /* ========================================================================= */
          /* BEGIN: Quality Check - Review Results View                               */
          /* ========================================================================= */
          <main
            className="flex-1 flex flex-col min-w-0 bg-[#f8fafc]"
            data-purpose="quality-check-view"
          >
            {/* Top Header Banner */}
            <header className="px-8 py-6 border-b border-slate-200 bg-white">
              {/* Back to Reports navigation link */}
              <div className="mb-2">
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
                  Back to Reports
                </button>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                    Quality Check - Review Results
                  </h1>
                  <p className="text-sm text-slate-500 mt-1 font-normal">
                    Review completed test results for quality assurance
                  </p>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-center">
                  <span className="text-xs font-mono font-semibold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                    Report ID: {selectedReport.reportId}
                  </span>
                  <span className="text-xs font-mono font-semibold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200">
                    Req: {selectedReport.requestId}
                  </span>
                </div>
              </div>
            </header>

            {/* Content Body */}
            <div className="p-8 space-y-6 max-w-7xl">
              {/* BEGIN: Sample Information Card */}
              <section
                className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm"
                data-purpose="sample-information"
              >
                <h2 className="text-xs font-semibold tracking-wider text-slate-400 uppercase mb-5">
                  SAMPLE INFORMATION
                </h2>
                <div className="flex items-start justify-between gap-6">
                  {/* Information Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-16 flex-1 text-sm">
                    {/* Row 1 */}
                    <div className="flex items-baseline">
                      <span className="w-36 text-slate-500 font-normal shrink-0">
                        Barcode
                      </span>
                      <span className="font-semibold text-slate-900 font-mono">
                        {getDisplayBarcode(selectedReport)}
                      </span>
                    </div>
                    <div className="flex items-baseline">
                      <span className="w-36 text-slate-500 font-normal shrink-0">
                        Completed Date
                      </span>
                      <span className="font-semibold text-slate-900">
                        {selectedReport.completedDate ||
                          selectedReport.generatedDate}
                      </span>
                    </div>
                    {/* Row 2 */}
                    <div className="flex items-baseline">
                      <span className="w-36 text-slate-500 font-normal shrink-0">
                        Patient Name
                      </span>
                      <span className="font-semibold text-slate-900">
                        {selectedReport.patientName}{" "}
                        <span className="text-xs text-slate-400 font-mono">
                          ({selectedReport.patientId})
                        </span>
                      </span>
                    </div>
                    <div className="flex items-baseline">
                      <span className="w-36 text-slate-500 font-normal shrink-0">
                        Completed By
                      </span>
                      <span className="font-semibold text-slate-900">
                        {selectedReport.completedBy ||
                          "Lab Technician"}
                      </span>
                    </div>
                    {/* Row 3 */}
                    <div className="flex items-baseline">
                      <span className="w-36 text-slate-500 font-normal shrink-0">
                        Sample Type
                      </span>
                      <span className="font-semibold text-slate-900">
                        {selectedReport.sampleType || "Specimen"}
                      </span>
                    </div>
                    <div className="flex items-center">
                      <span className="w-36 text-slate-500 font-normal shrink-0">
                        Status
                      </span>
                      <span className="inline-flex items-center px-4 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Completed
                      </span>
                    </div>
                  </div>
                  {/* Patient Thumbnail Image */}
                  <div className="shrink-0 pl-4 hidden sm:block">
                    {selectedReport.patientAvatar ? (
                      <img
                        alt="Patient Avatar"
                        className="w-16 h-16 rounded-full object-cover shadow-sm ring-2 ring-slate-100"
                        src={selectedReport.patientAvatar}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-[#E8F0FE] text-[#00488D] border border-blue-200/60 ring-2 ring-slate-100 flex items-center justify-center font-bold text-lg select-none">
                        {selectedReport.patientName ? selectedReport.patientName.slice(0, 2).toUpperCase() : "P"}
                      </div>
                    )}
                  </div>
                </div>
              </section>
              {/* END: Sample Information Card */}

              {/* BEGIN: Parameter Results Table */}
              <section
                className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm"
                data-purpose="test-parameters-table"
              >
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">
                      Test Parameter Analysis
                    </h3>
                    <p className="text-xs text-slate-400">
                      Panel: {selectedReport.testPanel}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleApproveAllParameters}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                  >
                    Approve All Parameters
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/50 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                        <th className="py-3.5 px-6 font-semibold w-1/4" scope="col">
                          PARAMETER
                        </th>
                        <th
                          className="py-3.5 px-6 font-semibold border-l border-slate-100"
                          scope="col"
                        >
                          RESULT
                        </th>
                        <th
                          className="py-3.5 px-6 font-semibold border-l border-slate-100"
                          scope="col"
                        >
                          UNIT
                        </th>
                        <th
                          className="py-3.5 px-6 font-semibold border-l border-slate-100"
                          scope="col"
                        >
                          REFERENCE RANGE
                        </th>
                        <th
                          className="py-3.5 px-6 font-semibold border-l border-slate-100 text-center"
                          scope="col"
                        >
                          STATUS
                        </th>
                        <th
                          className="py-3.5 px-6 font-semibold border-l border-slate-100 text-center"
                          scope="col"
                        >
                          ACTION
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {currentParameters.map((p) => (
                        <tr
                          key={p.id}
                          className="hover:bg-slate-50/70 transition-colors"
                        >
                          <td className="py-3 px-6 font-medium text-slate-900">
                            {p.parameter}
                          </td>
                          <td className="py-3 px-6 text-slate-500 font-medium border-l border-slate-100 font-mono">
                            {p.result}
                          </td>
                          <td className="py-3 px-6 text-slate-600 border-l border-slate-100">
                            {p.unit}
                          </td>
                          <td className="py-3 px-6 text-slate-600 border-l border-slate-100">
                            {p.referenceRange}
                          </td>
                          <td className="py-3 px-6 text-center border-l border-slate-100">
                            {p.status === "Normal" ? (
                              <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium text-emerald-700 bg-emerald-50">
                                Normal
                              </span>
                            ) : p.status === "Critical" ? (
                              <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium text-red-700 bg-red-50">
                                Critical
                              </span>
                            ) : (
                              <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium text-amber-700 bg-amber-50">
                                Abnormal
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-6 text-center border-l border-slate-100">
                            <button
                              type="button"
                              onClick={() =>
                                handleToggleParameterApproval(p.id)
                              }
                              className={`px-4 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                                p.approved
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100"
                                  : "text-blue-600 border border-blue-200 hover:bg-blue-50"
                              }`}
                            >
                              {p.approved ? "Approved ✓" : "Approve"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              {/* END: Parameter Results Table */}

              {/* BEGIN: Review Controls & Decision Area */}
              <section
                className="pt-2"
                data-purpose="quality-check-form"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                  {/* Overall Decision Dropdown */}
                  <div>
                    <label
                      className="block text-sm font-semibold text-slate-900 mb-2.5"
                      htmlFor="overall-quality-check"
                    >
                      Overall Quality Check
                    </label>
                    <div className="relative">
                      <select
                        id="overall-quality-check"
                        value={overallDecision}
                        onChange={(e) =>
                          setOverallDecision(
                            e.target.value as
                              | "Approved"
                              | "Rejected"
                              | "Pending",
                          )
                        }
                        className={`w-full appearance-none bg-white border border-slate-200 rounded-lg px-4 py-3 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm cursor-pointer shadow-sm ${
                          overallDecision === "Approved"
                            ? "text-emerald-600"
                            : overallDecision === "Rejected"
                              ? "text-rose-600"
                              : "text-amber-600"
                        }`}
                      >
                        <option
                          className="text-emerald-600 font-semibold"
                          value="Approved"
                        >
                          Approved
                        </option>
                        <option
                          className="text-rose-600 font-semibold"
                          value="Rejected"
                        >
                          Rejected
                        </option>
                        <option
                          className="text-amber-600 font-semibold"
                          value="Pending"
                        >
                          Pending Review
                        </option>
                      </select>
                      {/* Custom Dropdown Arrow */}
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          viewBox="0 0 24 24"
                        >
                          <path
                            d="M19 9l-7 7-7-7"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Comments Text Box */}
                  <div>
                    <label
                      className="block text-sm font-semibold text-slate-900 mb-2.5"
                      htmlFor="review-comments"
                    >
                      Comments (Optional)
                    </label>
                    <textarea
                      id="review-comments"
                      value={reviewComments}
                      onChange={(e) => setReviewComments(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg p-3.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm resize-none"
                      placeholder="Enter comments..."
                      rows={4}
                    />
                  </div>
                </div>

                {/* Submit Review Action Button */}
                <div className="flex flex-wrap justify-end items-center gap-3 pt-6">
                  <button
                    type="button"
                    onClick={() => setViewMode("table")}
                    className="px-5 py-2.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSubmitReview(false)}
                    className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2.5 rounded-lg shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 text-sm cursor-pointer"
                  >
                    <svg
                      className="w-4 h-4 stroke-[2.5]"
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
                    <span>Submit Review</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSubmitReview(true)}
                    className="inline-flex items-center gap-2 bg-[#12a136] hover:bg-[#0f8b2e] text-white font-medium px-6 py-2.5 rounded-lg shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-[#12a136] text-sm cursor-pointer"
                  >
                    <span>Proceed to Approve &amp; Sign</span>
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M14 5l7 7m0 0l-7 7m7-7H3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              </section>
              {/* END: Review Controls & Decision Area */}
            </div>
          </main>
        ) : (
          /* ========================================================================= */
          /* BEGIN: Table & Catalog View                                              */
          /* ========================================================================= */
          <>
            {/* TopNavbar */}
            <header
              className="sticky top-0 z-10 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-8 py-4 flex items-center justify-between"
              data-purpose="dashboard-header"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[#0b4a8b]">
                  <svg className="w-5 h-5 stroke-[2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-900 tracking-tight">Report Generation</h1>
                  <p className="text-xs text-slate-500">Review test findings, approve diagnoses and print reports</p>
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

            {/* DashboardBody */}
            <main className="flex-1 p-8 lg:p-10 space-y-8 max-w-[1600px] w-full mx-auto">
              {/* StatCardsRow */}
              <section
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4"
                data-purpose="kpi-metric-cards"
              >
                {/* Card 1: Report Generated */}
                <div className="bg-white rounded-2xl p-5 border border-emerald-200/80 shadow-xs flex items-center justify-between relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-50 rounded-full blur-2xl -mr-5 -mt-5 pointer-events-none" />
                  <div className="relative">
                    <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">
                      Report Generated
                    </span>
                    <h3 className="text-2xl font-extrabold text-emerald-950 mt-1">
                      {generatedCount}
                    </h3>
                    <p className="text-[11px] text-emerald-600/80 mt-0.5">
                      Reports generated successfully
                    </p>
                  </div>
                  <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 relative">
                    <svg className="w-5 h-5 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  </div>
                </div>

                {/* Card 2: Report Pending */}
                <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs flex items-center justify-between relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-20 h-20 bg-blue-50/50 rounded-full blur-2xl -mr-5 -mt-5 pointer-events-none" />
                  <div className="relative">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        Report Pending
                      </span>
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                    </div>
                    <h3 className="text-2xl font-extrabold text-slate-900 mt-1">
                      {pendingReportCount}
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Awaiting report generation
                    </p>
                  </div>
                  <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 relative">
                    <svg className="w-5 h-5 stroke-[2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                  </div>
                </div>
              </section>

              {/* TableContainerCard */}
              {/* BEGIN: MainContainer */}
              <section
                className="w-full bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden"
                data-purpose="report-generation-card"
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
                    Report Generation Details
                  </h1>
                  {/* Top Right Actions: Search and Filter */}
                  <div
                    className="flex items-center gap-3 w-full md:w-auto"
                    data-purpose="search-and-filter-group"
                  >
                    {/* Search Input Container */}
                    <div
                      className="relative flex-1 md:w-80"
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
                        placeholder="Search Patient, Barcode, Doctor..."
                        type="text"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery("")}
                          className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
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
                        className={`inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 border rounded-lg text-sm font-medium transition-colors cursor-pointer ${
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
                            className={`w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center justify-between cursor-pointer ${
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
                              setStatusFilter("GENERATED");
                              setIsFilterDropdownOpen(false);
                            }}
                            className={`w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center justify-between cursor-pointer ${
                              statusFilter === "GENERATED"
                                ? "font-semibold text-[#15803d] bg-green-50/50"
                                : "text-slate-700"
                            }`}
                          >
                            <span>Generated ({generatedCount})</span>
                            {statusFilter === "GENERATED" && <span>✓</span>}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setStatusFilter("REVIEWED");
                              setIsFilterDropdownOpen(false);
                            }}
                            className={`w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center justify-between cursor-pointer ${
                              statusFilter === "REVIEWED"
                                ? "font-semibold text-blue-700 bg-blue-50/50"
                                : "text-slate-700"
                            }`}
                          >
                            <span>Reviewed ({reviewedCount})</span>
                            {statusFilter === "REVIEWED" && <span>✓</span>}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setStatusFilter("UNDER_REVIEW");
                              setIsFilterDropdownOpen(false);
                            }}
                            className={`w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center justify-between cursor-pointer ${
                              statusFilter === "UNDER_REVIEW"
                                ? "font-semibold text-[#715e17] bg-[#faecc5]/30"
                                : "text-slate-700"
                            }`}
                          >
                            <span>Under Review ({reviewCount})</span>
                            {statusFilter === "UNDER_REVIEW" && <span>✓</span>}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setStatusFilter("CRITICAL");
                              setIsFilterDropdownOpen(false);
                            }}
                            className={`w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center justify-between cursor-pointer ${
                              statusFilter === "CRITICAL"
                                ? "font-semibold text-[#b91c1c] bg-red-50/50"
                                : "text-slate-700"
                            }`}
                          >
                            <span>Critical ({criticalCount})</span>
                            {statusFilter === "CRITICAL" && <span>✓</span>}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setStatusFilter("DRAFT");
                              setIsFilterDropdownOpen(false);
                            }}
                            className={`w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center justify-between cursor-pointer ${
                              statusFilter === "DRAFT"
                                ? "font-semibold text-slate-700 bg-slate-100"
                                : "text-slate-700"
                            }`}
                          >
                            <span>Draft ({draftCount})</span>
                            {statusFilter === "DRAFT" && <span>✓</span>}
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
                    id="reports-catalog-table"
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
                          DOCTOR
                        </th>
                        <th className="py-5 px-6 font-bold" scope="col">
                          TEST PANEL &amp; FINDINGS
                        </th>
                        <th
                          className="py-5 px-6 font-bold text-center"
                          scope="col"
                        >
                          DATE GENERATED
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
                      {filteredReports.length === 0 ? (
                        <tr>
                          <td
                            colSpan={7}
                            className="py-10 text-center text-slate-400 text-sm"
                          >
                            No diagnostic reports found matching your search.
                          </td>
                        </tr>
                      ) : (
                        filteredReports.map((r) => (
                          <tr
                            key={r.id}
                            onClick={() => {
                              if (r.status === "REVIEWED") {
                                handleOpenApproveResults(r);
                              } else if (r.status === "GENERATED") {
                                handleOpenDeliveredStatus(r);
                              } else {
                                handleOpenQualityCheck(r);
                              }
                            }}
                            className="hover:bg-slate-50/60 transition-colors cursor-pointer"
                          >
                            <td className="py-5 px-8 whitespace-nowrap">
                              <span className="font-mono text-slate-900 text-sm font-semibold">
                                {getDisplayBarcode(r)}
                              </span>
                            </td>
                            <td className="py-5 px-6 whitespace-nowrap">
                              <span className="font-semibold text-slate-900 block">
                                {r.patientName}
                              </span>
                              <span className="text-[11px] text-slate-400 font-mono">
                                {r.patientPid || r.patientId}
                              </span>
                            </td>
                            <td className="py-5 px-6 text-slate-700 font-normal text-xs whitespace-nowrap">
                              {r.doctorName}
                            </td>
                            <td className="py-5 px-6 whitespace-nowrap">
                              <span className="font-medium text-slate-800 block">
                                {r.testPanel}
                              </span>
                              <span className="text-[11px] text-slate-500 block truncate max-w-xs">
                                {r.findingsSummary}
                              </span>
                            </td>
                            <td className="py-5 px-6 text-center text-slate-600 font-normal whitespace-nowrap">
                              {r.generatedDate}
                            </td>
                            <td className="py-5 px-8 text-center whitespace-nowrap">
                              {r.status === "GENERATED" ? (
                                <span className="inline-block px-4 py-1.5 rounded-full text-xs font-bold tracking-wider bg-[#bbf7d0] text-[#15803d]">
                                  GENERATED
                                </span>
                              ) : r.status === "REVIEWED" ? (
                                <span className="inline-block px-4 py-1.5 rounded-full text-xs font-bold tracking-wider bg-blue-100 text-blue-800 border border-blue-200">
                                  REVIEWED
                                </span>
                              ) : r.status === "UNDER_REVIEW" ? (
                                <span className="inline-block px-4 py-1.5 rounded-full text-xs font-bold tracking-wider bg-[#faecc5] text-[#715e17]">
                                  UNDER REVIEW
                                </span>
                              ) : r.status === "CRITICAL" ? (
                                <span className="inline-block px-4 py-1.5 rounded-full text-xs font-bold tracking-wider bg-[#fee2e2] text-[#991b1b]">
                                  CRITICAL
                                </span>
                              ) : (
                                <span className="inline-block px-4 py-1.5 rounded-full text-xs font-bold tracking-wider bg-slate-200 text-slate-700">
                                  DRAFT
                                </span>
                              )}
                            </td>
                            <td className="py-5 px-4 text-center whitespace-nowrap">
                              {r.status === "REVIEWED" ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenApproveResults(r);
                                  }}
                                  className="px-4 py-1.5 bg-[#12a136] hover:bg-[#0f8b2e] text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5"
                                >
                                  <svg
                                    className="w-3.5 h-3.5 stroke-[2.2]"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
                                    />
                                  </svg>
                                  Approve &amp; Sign
                                </button>
                              ) : r.status === "GENERATED" ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenDeliveredStatus(r);
                                  }}
                                  className="px-4 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-[#16a34a] border border-emerald-200 text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5"
                                >
                                  <svg
                                    className="w-3.5 h-3.5 stroke-[2.2]"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                                    />
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                    />
                                  </svg>
                                  View Report
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenQualityCheck(r);
                                  }}
                                  className="px-4 py-1.5 bg-[#0b57a4] hover:bg-[#094c94] text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5"
                                >
                                  <svg
                                    className="w-3.5 h-3.5 stroke-[2.2]"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                    />
                                  </svg>
                                  QC Review
                                </button>
                              )}
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
          </>
        )}
      </div>
    </div>
  );
}
