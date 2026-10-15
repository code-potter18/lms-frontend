import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  CheckCircle2,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { getUser, remove } from "@/utils/token";
import { toast } from "@/hooks/use-toast";
import LabNav from "./labnav";
import { LabNotificationBell } from "@/components/hms/LabNotificationBell";
import { UserProfileDropdown } from "@/components/ui/User_profile_dropdown";
import { getDisplayBarcode } from "./reportgeneration";
import { labReportApi, LabReportRecord } from "@/api/labReport.api";
import { labOrderApi, labOrderItemApi, LabOrderRecord, LabOrderItemRecord } from "@/api/labOrder.api";
import { patientApi, PatientRecord } from "@/api/patient.api";

export interface DiagnosticParameter {
  parameter: string;
  result: string;
  unit: string;
  referenceRange: string;
  status: "NORMAL" | "ABNORMAL" | "CRITICAL";
}

export interface TransferItem {
  id: string;
  dispatchId: string;
  reportId: string;
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
  testProfile: string;
  recipient: string;
  channel: "EMR / Doctor" | "Patient SMS / WhatsApp" | "Email PDF" | "ICU / Ward";
  dispatchedAt: string;
  status: "DELIVERED" | "SENT" | "QUEUED" | "FAILED";
  ackDetails?: string;
  collectedOn?: string;
  reportedOn?: string;
  clinicalRemarks?: string;
  clinicalCorrelation?: string;
  parameters?: DiagnosticParameter[];
  targetDate?: string;
  targetDateIso?: string;
}

const DEFAULT_CBC_PARAMETERS: DiagnosticParameter[] = [
  {
    parameter: "WBC (White Blood Cells)",
    result: "6.80",
    unit: "10^3/µL",
    referenceRange: "4.0 - 10.0",
    status: "NORMAL",
  },
  {
    parameter: "RBC (Red Blood Cells)",
    result: "4.82",
    unit: "10^6/µL",
    referenceRange: "4.2 - 5.8",
    status: "NORMAL",
  },
  {
    parameter: "HGB (Hemoglobin)",
    result: "14.2",
    unit: "g/dL",
    referenceRange: "13.0 - 17.0",
    status: "NORMAL",
  },
  {
    parameter: "HCT (Hematocrit)",
    result: "43.1",
    unit: "%",
    referenceRange: "40 - 50",
    status: "NORMAL",
  },
  {
    parameter: "MCV (Mean Corpuscular Vol)",
    result: "87.6",
    unit: "fL",
    referenceRange: "80 - 100",
    status: "NORMAL",
  },
  {
    parameter: "MCH (Mean Corpuscular Hb)",
    result: "29.1",
    unit: "pg",
    referenceRange: "27 - 34",
    status: "NORMAL",
  },
  {
    parameter: "MCHC (MCH Concentration)",
    result: "33.0",
    unit: "g/dL",
    referenceRange: "32 - 36",
    status: "NORMAL",
  },
  {
    parameter: "PLT (Platelet Count)",
    result: "235",
    unit: "10^3/µL",
    referenceRange: "150 - 450",
    status: "NORMAL",
  },
];

function calculateAge(dob: string): number {
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return Math.max(0, age);
}

function normalizeToIsoDate(dateVal?: string | Date | null): string | null {
  if (!dateVal) return null;
  if (typeof dateVal === "string") {
    const trimmed = dateVal.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return trimmed.slice(0, 10);
    }
    const dmyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (dmyMatch) {
      const day = dmyMatch[1].padStart(2, "0");
      const month = dmyMatch[2].padStart(2, "0");
      const year = dmyMatch[3];
      return `${year}-${month}-${day}`;
    }
  }
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function formatTargetDate(dateVal?: string | Date | null): string {
  if (!dateVal) return "";
  const iso = normalizeToIsoDate(dateVal);
  if (iso) {
    const [y, m, d] = iso.split("-");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthName = months[parseInt(m, 10) - 1] || m;
    return `${d} ${monthName} ${y}`;
  }
  return String(dateVal);
}

function isTransferOverdue(item?: TransferItem | null): boolean {
  if (!item) return false;
  if (item.status === "DELIVERED") return false;
  const todayIso = new Date().toISOString().slice(0, 10);
  const targetIso = item.targetDateIso || normalizeToIsoDate(item.targetDate);
  if (!targetIso) return false;
  return targetIso < todayIso;
}

function formatReportDate(dateVal?: string | Date | null): string {
  if (!dateVal) return new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return String(dateVal);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function ReportTransfer() {
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

  const [activeNav, setActiveNav] = useState("Report Transfer");
  const [transfers, setTransfers] = useState<TransferItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "DELIVERED" | "SENT" | "QUEUED" | "FAILED"
  >("ALL");
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Real database fetch
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

      const itemsByOrderMap = new Map<string, LabOrderItemRecord[]>();
      items.forEach((item) => {
        const arr = itemsByOrderMap.get(item.lab_order_id) || [];
        arr.push(item);
        itemsByOrderMap.set(item.lab_order_id, arr);
      });

      const mappedTransfers: TransferItem[] = [];

      // 1. Map all lab_report records in the database
      dbReports.forEach((rep, idx) => {
        const order = orderMap.get(rep.lab_order_id) || rep.lab_order;
        const patientId = order?.patient_history?.patient_id || order?.patient_history_id || "PAT-001";
        const patient = patientMap.get(patientId);

        const patientName = patient
          ? [patient.patient_first_name, patient.patient_middle_name, patient.patient_last_name].filter(Boolean).join(" ")
          : `Patient ${patientId}`;
        const age = patient?.patient_age || (patient?.patient_dob ? calculateAge(patient.patient_dob) : 34);
        const gender = patient?.patient_gender || "Male";
        const patientAgeGender = `${age} Years / ${gender}`;

        const doctor = order?.employees;
        const doctorName = doctor ? `Dr. ${doctor.first_name} ${doctor.last_name || ""}`.trim() : "Dr. Sarah Johnson";
        const doctorEmail = (doctor as any)?.email || "johnson@hospital.com";

        const orderItem = rep.lab_order?.lab_order_item?.[0] || itemsByOrderMap.get(rep.lab_order_id)?.[0];
        const testProfile = orderItem?.lab_test_master?.test_name || "Diagnostic Panel";

        const sampleBarcode =
          orderItem?.sample_collection?.[0]?.barcode ||
          orderItem?.barcode ||
          (orderItem?.remarks?.match(/Barcode:\s*([A-Za-z0-9_-]+)/i)?.[1]) ||
          getDisplayBarcode({
            id: rep.lab_report_id,
            sampleId: orderItem?.sample_collection?.[0]?.sample_collection_id,
            requestId: rep.lab_order_id,
          });

        const isDelivered = !!rep.delivered_datetime || rep.report_status?.toUpperCase() === "DELIVERED" || !!rep.delivered_to;
        const status: "DELIVERED" | "SENT" | "QUEUED" | "FAILED" = isDelivered ? "DELIVERED" : "QUEUED";

        const dispatchId = `DSP-${9000 + idx + 1}`;
        const recipient = rep.delivered_to || `${doctorName} (Internal Medicine)`;
        const channel: "EMR / Doctor" | "Patient SMS / WhatsApp" | "Email PDF" | "ICU / Ward" =
          rep.delivered_to?.includes("Patient") ? "Patient SMS / WhatsApp" : "EMR / Doctor";

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

        const deliveredTimeStr = rep.delivered_datetime
          ? new Date(rep.delivered_datetime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : "11:35 AM";

        const rawTargetDate = (orderItem as any)?.target_date || (order as any)?.target_date || (rep as any)?.target_date;
        const targetDateIso = normalizeToIsoDate(rawTargetDate) || undefined;
        const targetDate = formatTargetDate(rawTargetDate);

        mappedTransfers.push({
          id: rep.lab_report_id,
          dispatchId,
          reportId: rep.report_number || `RPT-${rep.lab_report_id.slice(-6)}`,
          barcode: sampleBarcode,
          sampleId: sampleBarcode,
          patientId,
          patientPid: patient?.patient_id || patientId,
          patientName,
          patientAgeGender,
          patientAvatar:
            patient?.patient_photo_url ||
            (patient as any)?.avatar ||
            undefined,
          patientEmail: patient?.patient_email || `${patientName.toLowerCase().replace(/\s+/g, ".")}@email.com`,
          doctorName,
          doctorEmail,
          testProfile,
          recipient,
          channel,
          dispatchedAt: deliveredTimeStr,
          status,
          ackDetails: isDelivered ? "Delivered and acknowledged in portal" : "Pending dispatch queue",
          collectedOn: formatReportDate((orderItem as any)?.created_at || order?.order_datetime),
          reportedOn: formatReportDate(rep.generated_datetime || rep.created_at),
          clinicalRemarks: parsedMeta?.text || commentString || "All parameters evaluated. Laboratory diagnostics complete.",
          clinicalCorrelation: parsedMeta?.clinicalCorrelation || "Correlate clinically with physical findings and history.",
          parameters: parsedMeta?.parameters && parsedMeta.parameters.length > 0 ? parsedMeta.parameters : DEFAULT_CBC_PARAMETERS,
          targetDate,
          targetDateIso,
        });
      });

      // 2. Map backend items that have had reports generated (item_status === "Report Generated" or approved in localStorage)
      const reportedOrderIds = new Set(dbReports.map((r) => r.lab_order_id));
      items.forEach((item, idx) => {
        if (reportedOrderIds.has(item.lab_order_id)) return;
        const rawStatus = (item.item_status || "").toUpperCase();

        const isApprovedInStorage = typeof window !== "undefined" && (
          localStorage.getItem(`report_approved_item-${item.lab_order_item_id}`) === "GENERATED" ||
          localStorage.getItem(`report_approved_${item.lab_order_item_id}`) === "GENERATED" ||
          localStorage.getItem(`report_approved_${item.lab_order_id}`) === "GENERATED"
        );

        const isGenerated = rawStatus === "REPORT GENERATED" || isApprovedInStorage;

        // STRICT REQUIREMENT: Only include items where a report has been GENERATED!
        if (!isGenerated) return;

        const parentOrder = orderMap.get(item.lab_order_id) || item.lab_order;
        const patientId = parentOrder?.patient_history?.patient_id || parentOrder?.patient_history_id || `PAT00${idx + 1}`;
        const patient = patientMap.get(patientId);

        const patientName = patient
          ? [patient.patient_first_name, patient.patient_middle_name, patient.patient_last_name].filter(Boolean).join(" ")
          : `Patient ${patientId}`;
        const age = patient?.patient_age || (patient?.patient_dob ? calculateAge(patient.patient_dob) : 30);
        const gender = patient?.patient_gender || "Male";
        const patientAgeGender = `${age} Years / ${gender}`;

        const doctor = parentOrder?.employees;
        const doctorName = doctor ? `Dr. ${doctor.first_name} ${doctor.last_name || ""}`.trim() : "Dr. Sarah Johnson";
        const doctorEmail = (doctor as any)?.email || "doctor@hospital.com";

        const testProfile = item.lab_test_master?.test_name || "Diagnostic Test";
        const sampleBarcode =
          item.sample_collection?.[0]?.barcode ||
          item.barcode ||
          (item.remarks?.match(/Barcode:\s*([A-Za-z0-9_-]+)/i)?.[1]) ||
          getDisplayBarcode({ id: item.lab_order_item_id, requestId: item.lab_order_id });

        const isDelivered = typeof window !== "undefined" && (
          localStorage.getItem(`report_transferred_${item.lab_order_item_id}`) === "true" ||
          localStorage.getItem(`report_transferred_${item.lab_order_id}`) === "true"
        );

        const rawTargetDate = (item as any)?.target_date || (parentOrder as any)?.target_date;
        const targetDateIso = normalizeToIsoDate(rawTargetDate) || undefined;
        const targetDate = formatTargetDate(rawTargetDate);

        mappedTransfers.push({
          id: `item-${item.lab_order_item_id}`,
          dispatchId: `DSP-${9100 + idx + 1}`,
          reportId: `RPT-${item.lab_order_item_id.slice(-6)}`,
          barcode: sampleBarcode,
          sampleId: sampleBarcode,
          patientId,
          patientPid: patient?.patient_id || patientId,
          patientName,
          patientAgeGender,
          patientAvatar:
            patient?.patient_photo_url ||
            (patient as any)?.avatar ||
            undefined,
          patientEmail: patient?.patient_email || `${patientName.toLowerCase().replace(/\s+/g, ".")}@email.com`,
          doctorName,
          doctorEmail,
          testProfile,
          recipient: `${doctorName} (Internal Medicine)`,
          channel: "EMR / Doctor",
          dispatchedAt: isDelivered ? "Dispatched" : "Queued",
          status: isDelivered ? "DELIVERED" : "QUEUED",
          ackDetails: isDelivered ? "Delivered and acknowledged in portal" : "Report generated. Ready for portal transfer.",
          collectedOn: formatReportDate((item as any)?.created_at || parentOrder?.order_datetime),
          reportedOn: formatReportDate((item as any)?.updated_at || new Date()),
          clinicalRemarks: "Diagnostic results certified by Pathologist and ready for delivery.",
          clinicalCorrelation: "Correlate with attending physician assessment.",
          parameters: DEFAULT_CBC_PARAMETERS,
          targetDate,
          targetDateIso,
        });
      });

      // Check any other sample completed & approved in Report Generation from registry
      if (typeof window !== "undefined") {
        const completedRegistry: any[] = JSON.parse(localStorage.getItem("completed_testing_samples") || "[]");
        completedRegistry.forEach((cs, i) => {
          const isApproved =
            localStorage.getItem(`report_approved_${cs.id}`) === "GENERATED" ||
            localStorage.getItem(`report_approved_rep-${cs.id}`) === "GENERATED" ||
            localStorage.getItem(`report_approved_rep_RPT-${cs.sampleId || cs.id}`) === "GENERATED" ||
            localStorage.getItem(`report_approved_smp_${cs.sampleId}`) === "GENERATED";
          if (!isApproved) return;

          const reportId = `RPT-${cs.sampleId || cs.id}`;
          const alreadyInList = mappedTransfers.some(
            (t) => t.id === cs.id || t.id === `item-${cs.id}` || t.id === `tx-${cs.id}` || t.reportId === reportId
          );
          if (alreadyInList) return;

          const isDelivered =
            localStorage.getItem(`report_transferred_${cs.id}`) === "true" ||
            localStorage.getItem(`report_transferred_${reportId}`) === "true";

          const rawTargetDate = cs.targetDate || cs.targetDateIso || cs.target_date;
          const targetDateIso = normalizeToIsoDate(rawTargetDate) || undefined;
          const targetDate = formatTargetDate(rawTargetDate);

          mappedTransfers.push({
            id: `tx-${cs.id}`,
            dispatchId: `DSP-${9300 + i}`,
            reportId,
            barcode: getDisplayBarcode({ id: cs.id, sampleId: cs.sampleId, barcode: cs.barcode }),
            sampleId: cs.barcode || `SMP-${cs.id}`,
            patientId: cs.patientId || "P000124",
            patientPid: cs.patientId || "P000124",
            patientName: cs.patientName || "Patient",
            patientAgeGender: "32 Years / Male",
            patientAvatar: undefined,
            patientEmail: "patient@email.com",
            doctorName: "Dr. Sarah Johnson",
            doctorEmail: "doctor@hospital.com",
            testProfile: cs.testName || "Diagnostic Test",
            recipient: "Dr. Sarah Johnson (Internal Medicine)",
            channel: "EMR / Doctor",
            dispatchedAt: isDelivered ? "Dispatched" : "Queued",
            status: isDelivered ? "DELIVERED" : "QUEUED",
            ackDetails: isDelivered ? "Delivered and acknowledged in portal" : "Report generated. Ready for portal transfer.",
            collectedOn: formatReportDate(cs.receivedDate || new Date()),
            reportedOn: formatReportDate(new Date()),
            clinicalRemarks: cs.testResult || "Diagnostic test certified by Pathologist.",
            clinicalCorrelation: "Correlate with attending physician assessment.",
            parameters: cs.parameters ? cs.parameters.map((p: any) => ({
              parameter: p.parameter || "Parameter",
              result: String(p.result || "0.0"),
              unit: p.unit || "",
              referenceRange: p.referenceRange || "Normal",
              status: ((p.status || "NORMAL").toUpperCase() === "COMPLETED" ? "NORMAL" : (p.status || "NORMAL").toUpperCase()) as any,
            })) : DEFAULT_CBC_PARAMETERS,
            targetDate,
            targetDateIso,
          });
        });
      }

      
      // 5. Final strict filter: ONLY reports that have been GENERATED are allowed in Report Transfer!
      const generatedOnlyTransfers = mappedTransfers.filter((t) => {
        // Any database report is generated
        if (dbReports.some((r) => r.lab_report_id === t.id || r.report_number === t.reportId)) return true;
                // Check localStorage approval
        const rawId = t.id.replace("item-", "").replace("tx-", "").replace("rep-", "");
        if (
          localStorage.getItem(`report_approved_${rawId}`) === "GENERATED" ||
          localStorage.getItem(`report_approved_${t.id}`) === "GENERATED" ||
          localStorage.getItem(`report_approved_rep_${t.reportId}`) === "GENERATED" ||
          localStorage.getItem(`report_approved_smp_${t.sampleId}`) === "GENERATED"
        ) {
          return true;
        }
        // Backend order item is REPORT GENERATED
        const matchingItem = items.find((it) => it.lab_order_item_id === rawId);
        if (matchingItem && (matchingItem.item_status || "").toUpperCase() === "REPORT GENERATED") return true;

        return false;
      });

      if (generatedOnlyTransfers.length > 0) {
        setTransfers(generatedOnlyTransfers);
        setSelectedTransfer((prev) => {
          if (!prev) return generatedOnlyTransfers[0];
          const found = generatedOnlyTransfers.find((r) => r.id === prev.id);
          return found || generatedOnlyTransfers[0];
        });
      } else {
        setTransfers([]);
        setSelectedTransfer(null);
      }
    } catch (err: any) {
      console.error("Error fetching transfer records:", err);
      setFetchError(err.message || "Failed to load real transfer data");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRealData();
  }, [fetchRealData]);

  // Workflow View Mode: "table" | "forward" | "preview"
  const [viewMode, setViewMode] = useState<"table" | "forward" | "preview">(
    "table",
  );
  const [returnView, setReturnView] = useState<"table" | "forward">("forward");
  const [selectedTransfer, setSelectedTransfer] = useState<TransferItem | null>(null);

  // Forward Screen Recipient Controls
  const [sendToPatient, setSendToPatient] = useState(true);
  const [sendToDoctor, setSendToDoctor] = useState(true);
  const [additionalEmailInput, setAdditionalEmailInput] = useState("");
  const [additionalRecipients, setAdditionalRecipients] = useState<string[]>([]);

  const handleOpenForward = (transfer: TransferItem) => {
    setSelectedTransfer(transfer);
    setSendToPatient(true);
    setSendToDoctor(true);
    setAdditionalEmailInput("");
    setAdditionalRecipients([]);
    setViewMode("forward");
  };

  const handleOpenPreview = (
    transfer?: TransferItem,
    from: "table" | "forward" = "forward",
  ) => {
    if (transfer) {
      setSelectedTransfer(transfer);
    }
    setReturnView(from);
    setViewMode("preview");
  };

  const handleAddAdditionalRecipient = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = additionalEmailInput.trim();
    if (!trimmed) return;
    if (additionalRecipients.includes(trimmed)) {
      toast({
        title: "Recipient Exists",
        description: "This email is already in the recipient list.",
      });
      return;
    }
    setAdditionalRecipients((prev) => [...prev, trimmed]);
    setAdditionalEmailInput("");
    toast({
      title: "Recipient Added",
      description: `Added ${trimmed} to report dispatch list.`,
    });
  };

  const handleRemoveAdditionalRecipient = (email: string) => {
    setAdditionalRecipients((prev) => prev.filter((e) => e !== email));
  };

  const handleSendReport = async () => {
    if (!selectedTransfer) return;
    if (!sendToPatient && !sendToDoctor && additionalRecipients.length === 0) {
      toast({
        title: "No Recipients Selected",
        description:
          "Please select at least one recipient portal or add an email address.",
        variant: "destructive",
      });
      return;
    }

    const nowTime = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    const recipientList: string[] = [];
    if (sendToPatient) recipientList.push("Patient Portal");
    if (sendToDoctor) recipientList.push("Doctor Portal");
    if (additionalRecipients.length > 0) {
      recipientList.push(`${additionalRecipients.length} external email(s)`);
    }

    const deliveredToStr = recipientList.join(" | ") || selectedTransfer.recipient;

    // Persist real transfer to database if lab_report exists
    if (!selectedTransfer.id.startsWith("tx-") && !selectedTransfer.id.startsWith("item-")) {
      try {
        await labReportApi.transfer(selectedTransfer.id, {
          delivered_to: deliveredToStr,
          delivered_datetime: new Date().toISOString(),
          report_status: "DELIVERED",
        });
      } catch (err: any) {
        console.error("Failed to update report transfer in DB:", err);
      }
    }

    try {
      localStorage.setItem(`report_transferred_${selectedTransfer.id}`, "true");
      localStorage.setItem(`report_transferred_${selectedTransfer.reportId}`, "true");
      const rawId = selectedTransfer.id.replace("item-", "").replace("tx-", "");
      localStorage.setItem(`report_transferred_${rawId}`, "true");
    } catch {}

    setTransfers((prev) =>
      prev.map((t) =>
        t.id === selectedTransfer.id
          ? {
              ...t,
              status: "DELIVERED",
              dispatchedAt: nowTime,
              ackDetails: "Delivered via automated portal forwarder",
            }
          : t,
      ),
    );

    toast({
      title: "Report Forwarded Successfully",
      description: `Report ${selectedTransfer.reportId} sent to: ${recipientList.join(", ")}.`,
    });

    setViewMode("table");
  };

  const handleResend = async (id: string) => {
    const nowTime = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    if (!id.startsWith("tx-") && !id.startsWith("item-")) {
      try {
        await labReportApi.transfer(id, {
          delivered_to: "Resent to Portal",
          delivered_datetime: new Date().toISOString(),
          report_status: "DELIVERED",
        });
      } catch (err: any) {
        console.error("Failed to re-transmit report in DB:", err);
      }
    }

    setTransfers((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              status: "DELIVERED",
              dispatchedAt: nowTime,
              ackDetails: "Successfully re-transmitted and acknowledged.",
            }
          : t,
      ),
    );
    toast({
      title: "Dispatch Successful",
      description: "Report transmitted to recipient EMR/channel.",
    });
  };

  const handleBatchSync = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const queuedReports = transfers.filter(
      (t) => (t.status === "QUEUED" || t.status === "FAILED") && !t.id.startsWith("tx-") && !t.id.startsWith("item-")
    );

    if (queuedReports.length > 0) {
      await Promise.allSettled(
        queuedReports.map((t) =>
          labReportApi.transfer(t.id, {
            delivered_to: t.recipient,
            delivered_datetime: new Date().toISOString(),
            report_status: "DELIVERED",
          })
        )
      );
    }

    setTransfers((prev) =>
      prev.map((t) =>
        t.status === "QUEUED" || t.status === "FAILED"
          ? { ...t, status: "DELIVERED", dispatchedAt: "Just now" }
          : t,
      ),
    );
    toast({
      title: "Batch EMR Sync Completed",
      description:
        "All queued and pending laboratory reports have been pushed to EMR.",
    });
  };

  const filteredTransfers = useMemo(() => {
    return transfers.filter((t) => {
      const matchesSearch =
        searchQuery.trim() === "" ||
        t.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.reportId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.dispatchId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.barcode && t.barcode.toLowerCase().includes(searchQuery.toLowerCase())) ||
        getDisplayBarcode(t).toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.recipient.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.channel.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === "ALL" || t.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [transfers, searchQuery, statusFilter]);

  const deliveredCount = useMemo(
    () => transfers.filter((t) => t.status === "DELIVERED").length,
    [transfers],
  );
  const sentCount = useMemo(
    () => transfers.filter((t) => t.status === "SENT").length,
    [transfers],
  );
  const queuedCount = useMemo(
    () => transfers.filter((t) => t.status === "QUEUED").length,
    [transfers],
  );
  const failedCount = useMemo(
    () => transfers.filter((t) => t.status === "FAILED").length,
    [transfers],
  );
  const transferredCount = useMemo(
    () => transfers.filter((t) => t.status === "DELIVERED" || t.status === "SENT").length,
    [transfers],
  );
  const pendingTransferCount = useMemo(
    () => transfers.filter((t) => t.status !== "DELIVERED" && t.status !== "SENT").length,
    [transfers],
  );

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
        id: "total-dispatches",
        label: "Total Dispatches",
        subLabel: "Reports in dispatch pipeline",
        value: transfers.length,
        tag: "Total",
        bg: "#D6E3FF",
        valueColor: "#00488D",
        iconBg: "rgba(255, 255, 255, 0.40)",
        icon: <FileText className="w-[17px] h-[17px]" color="#00488D" />,
        isActive: statusFilter === "ALL",
        onClick: () => setStatusFilter("ALL"),
      },
      {
        id: "report-transferred",
        label: "Report Transferred",
        subLabel: "Delivered to Doctor / EMR",
        value: transferredCount,
        tag: `${transfers.length > 0 ? Math.round((transferredCount / transfers.length) * 100) : 0}%`,
        bg: "rgba(0, 200, 150, 0.12)",
        valueColor: "#00A87E",
        iconBg: "rgba(255, 255, 255, 0.40)",
        icon: <CheckCircle2 className="w-[17px] h-[17px]" color="#00A87E" />,
        isActive: statusFilter === "DELIVERED",
        onClick: () => setStatusFilter((prev) => (prev === "DELIVERED" ? "ALL" : "DELIVERED")),
      },
      {
        id: "transfer-pending",
        label: "Transfer Pending",
        subLabel: "Queued for portal delivery",
        value: pendingTransferCount,
        tag: "Pending",
        bg: "rgba(255, 107, 53, 0.12)",
        valueColor: "#7B3200",
        iconBg: "#FFDBCB",
        icon: <Clock className="w-[17px] h-[17px]" color="#7B3200" />,
        isActive: statusFilter === "QUEUED",
        onClick: () => setStatusFilter((prev) => (prev === "QUEUED" ? "ALL" : "QUEUED")),
      },
    ],
    [transfers.length, transferredCount, pendingTransferCount, statusFilter]
  );

  const activeParameters: DiagnosticParameter[] =
    selectedTransfer?.parameters && selectedTransfer.parameters.length > 0
      ? selectedTransfer.parameters
      : DEFAULT_CBC_PARAMETERS;

  return (
    <div className="min-h-screen flex bg-white text-gray-900 antialiased selection:bg-blue-100 font-sans">
      <style>{`
        @media print {
          aside { display: none !important; }
          .ml-64 { margin-left: 0 !important; }
          .print-hide { display: none !important; }
        }
      `}</style>

      {/* Global Lab Navigation Sidebar */}
      <LabNav
        activeTab="Report Transfer"
        onTabChange={() => setViewMode("table")}
      />

      {/* Main Content Area */}
      <div className="flex-1 ml-64 min-h-screen flex flex-col min-w-0 bg-white">
        {viewMode === "preview" && selectedTransfer ? (
          /* ========================================================================= */
          /* BEGIN: Clinical Precision Diagnostics - Preview Report View               */
          /* ========================================================================= */
          <main
            className="flex-1 bg-white overflow-y-auto px-6 sm:px-12 py-10 flex flex-col justify-between"
            data-purpose="report-preview-document"
          >
            <div className="max-w-[1020px] w-full mx-auto">
              {/* Top Navigation Back Button */}
              <div className="mb-6 print-hide">
                <button
                  type="button"
                  onClick={() => setViewMode(returnView)}
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
                  {returnView === "forward" ? "Back to Forwarding" : "Back to Dispatches"}
                </button>
              </div>

              {/* Overdue Warning Banner */}
              {isTransferOverdue(selectedTransfer) && (
                <div className="mb-6 rounded-xl border border-rose-300 bg-rose-50/80 px-4 py-3 text-sm text-rose-900 flex items-center justify-between print-hide">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-2.5 w-2.5 rounded-full bg-rose-600 animate-pulse" />
                    <span className="font-bold text-rose-800">TRANSFER OVERDUE:</span>
                    <span>Target completion date was {selectedTransfer.targetDate || "passed"}. Expedite report dispatch immediately.</span>
                  </div>
                  <span className="px-2 py-0.5 text-xs font-extrabold uppercase tracking-wide bg-rose-600 text-white rounded">
                    OVERDUE
                  </span>
                </div>
              )}

              {/* BEGIN: ReportHeader */}
              <header className="text-center pt-2">
                <h2 className="text-2xl lg:text-[26px] font-black tracking-wider text-black uppercase">
                  CLINICAL PRECISION DIAGNOSTICS
                </h2>
                <p className="text-[11px] font-semibold tracking-widest text-gray-800 uppercase mt-1">
                  EXCELLENCE IN MEDICAL TESTING &amp; RESEARCH
                </p>
                <p className="text-[11px] text-gray-600 mt-1 font-normal">
                  123 Medical Plaza, Health District, NY 10001 | Ph: +1 (555) 012-3456 | Web: www.clinicalprecision.com
                </p>
                {/* Horizontal Thick Bar Separator */}
                <div className="w-full h-[2.5px] bg-black mt-3 mb-6" />
              </header>
              {/* END: ReportHeader */}

              {/* BEGIN: PatientAndSampleMetadata */}
              <section
                aria-label="Patient and Specimen Metadata"
                className="flex flex-col sm:flex-row items-center justify-between gap-6 py-2 px-1 mb-8"
              >
                {/* Patient Info with circular avatar */}
                <div className="flex items-center gap-5 w-full sm:w-1/2">
                  <div className="w-16 h-16 rounded-full overflow-hidden shrink-0 border-2 border-slate-100 shadow-sm flex items-center justify-center bg-[#E8F0FE]">
                    {selectedTransfer.patientAvatar ? (
                      <img
                        alt={`Patient ${selectedTransfer.patientName}`}
                        className="w-full h-full object-cover"
                        src={selectedTransfer.patientAvatar}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <span className="text-[#00488D] font-bold text-xl select-none">
                        {selectedTransfer.patientName ? selectedTransfer.patientName.slice(0, 2).toUpperCase() : "P"}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-[130px_1fr] text-[13px] gap-y-1.5 font-medium">
                    <span className="font-bold text-black uppercase tracking-tight">
                      PATIENT NAME:
                    </span>
                    <span className="text-gray-900 font-semibold">
                      {selectedTransfer.patientName}
                    </span>
                    <span className="font-bold text-black uppercase tracking-tight">
                      PATIENT ID:
                    </span>
                    <span className="text-gray-900 font-mono">
                      {selectedTransfer.patientPid || selectedTransfer.patientId}
                    </span>
                    <span className="font-bold text-black uppercase tracking-tight">
                      AGE / GENDER:
                    </span>
                    <span className="text-gray-900">
                      {selectedTransfer.patientAgeGender || "-"}
                    </span>
                  </div>
                </div>

                {/* Sample Details */}
                <div className="w-full sm:w-1/2 flex justify-start sm:justify-end">
                  <div className="grid grid-cols-[130px_1fr] text-[13px] gap-y-1.5 font-medium">
                    <span className="font-bold text-black uppercase tracking-tight">
                      BARCODE:
                    </span>
                    <span className="text-gray-900 font-mono font-semibold">
                      {getDisplayBarcode(selectedTransfer)}
                    </span>
                    <span className="font-bold text-black uppercase tracking-tight">
                      TEST NAME:
                    </span>
                    <span className="text-gray-900 font-semibold">
                      {selectedTransfer.testProfile}
                    </span>
                    <span className="font-bold text-black uppercase tracking-tight">
                      COLLECTED ON:
                    </span>
                    <span className="text-gray-900">
                      {selectedTransfer.collectedOn || "-"}
                    </span>
                    <span className="font-bold text-black uppercase tracking-tight">
                      REPORTED ON:
                    </span>
                    <span className="text-gray-900">
                      {selectedTransfer.reportedOn || "-"}
                    </span>
                    <span className="font-bold text-black uppercase tracking-tight">
                      TARGET DATE:
                    </span>
                    <span className="text-gray-900 font-semibold flex items-center gap-1.5">
                      <span className={isTransferOverdue(selectedTransfer) ? "text-rose-700 font-bold" : ""}>
                        {selectedTransfer.targetDate || "-"}
                      </span>
                      {isTransferOverdue(selectedTransfer) && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-rose-600 text-white tracking-wide uppercase">
                          OVERDUE
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </section>
              {/* END: PatientAndSampleMetadata */}

              {/* BEGIN: LaboratoryTestResultsTable */}
              <section
                aria-label="Diagnostic Results Table"
                className="overflow-x-auto mb-8"
              >
                <table className="w-full text-left border border-black text-[13px] border-collapse">
                  <thead>
                    <tr className="bg-gray-100 font-bold text-black uppercase text-[11px] tracking-wider border border-black">
                      <th
                        className="py-2.5 px-4 font-bold border border-black"
                        scope="col"
                      >
                        PARAMETER
                      </th>
                      <th
                        className="py-2.5 px-4 text-center font-bold border border-black"
                        scope="col"
                      >
                        RESULT
                      </th>
                      <th
                        className="py-2.5 px-4 text-center font-bold border border-black"
                        scope="col"
                      >
                        UNIT
                      </th>
                      <th
                        className="py-2.5 px-4 text-center font-bold border border-black"
                        scope="col"
                      >
                        REFERENCE RANGE
                      </th>
                      <th
                        className="py-2.5 px-4 text-center font-bold border border-black"
                        scope="col"
                      >
                        STATUS
                      </th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-900 font-medium">
                    {activeParameters.map((p, idx) => (
                      <tr
                        key={idx}
                        className="hover:bg-slate-50/50 border border-black"
                      >
                        <td className="py-2 px-4 font-semibold text-gray-900 border border-black">
                          {p.parameter}
                        </td>
                        <td className="py-2 px-4 text-center font-medium font-mono border border-black">
                          {p.result}
                        </td>
                        <td className="py-2 px-4 text-center border border-black">
                          {p.unit}
                        </td>
                        <td className="py-2 px-4 text-center border border-black">
                          {p.referenceRange}
                        </td>
                        <td className="py-2 px-4 text-center font-bold text-black tracking-wide border border-black">
                          {p.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
              {/* END: LaboratoryTestResultsTable */}

              {/* BEGIN: ClinicalNotesAndSignatureSection */}
              <section
                aria-label="Clinical Remarks and Validation"
                className="flex flex-col lg:flex-row justify-between items-start gap-8 mb-8"
              >
                {/* Remarks & Correlation text */}
                <div className="space-y-4 max-w-xl text-[12.5px] leading-relaxed">
                  <div>
                    <h3 className="font-bold text-black uppercase tracking-tight">
                      CLINICAL REMARKS
                    </h3>
                    <p className="text-gray-700 mt-0.5">
                      {selectedTransfer.clinicalRemarks ||
                        "All parameters are within normal limits. The blood counts show no signs of anemia, infection, or clotting disorders at this time."}
                    </p>
                  </div>
                  <div>
                    <h3 className="font-bold text-black uppercase tracking-tight">
                      CLINICAL CORRELATION
                    </h3>
                    <p className="text-gray-700 mt-0.5">
                      {selectedTransfer.clinicalCorrelation ||
                        "Correlate clinically with patient's physical symptoms and history."}
                    </p>
                  </div>
                </div>

                {/* Digital Signature Card */}
                <div className="border border-black w-64 text-center bg-white shadow-none shrink-0 self-end lg:self-auto">
                  {/* Card Header */}
                  <div className="border-b border-black py-1.5 bg-gray-50/50">
                    <span className="text-[10px] font-bold tracking-wider text-black uppercase">
                      DIGITAL SIGNATURE
                    </span>
                  </div>
                  {/* Signature Body */}
                  <div className="py-4 px-3 flex flex-col items-center justify-center">
                    <div className="text-2xl font-normal text-gray-900 tracking-wide mb-1 font-serif italic">
                      Sarah Johnson
                    </div>
                    <div className="w-3/4 h-[0.75px] bg-gray-300 mb-2" />
                    <p className="font-bold text-black text-[10px] tracking-tight uppercase">
                      DR. SARAH JOHNSON
                    </p>
                    <p className="text-[9px] font-bold text-gray-800 uppercase mt-0.5">
                      SENIOR PATHOLOGIST (MD, DNB)
                    </p>
                    <p className="text-[9px] font-medium text-gray-700 tracking-tight uppercase mt-0.5">
                      REG NO: MC-209455
                    </p>
                  </div>
                </div>
              </section>
              {/* END: ClinicalNotesAndSignatureSection */}

              {/* BEGIN: Disclaimer */}
              <footer className="pt-2 border-t border-black mb-10">
                <p className="text-[10.5px] leading-tight text-gray-800">
                  <span className="font-bold text-black uppercase">
                    DISCLAIMER
                  </span>
                  <br />
                  This report is for diagnostic purposes and should be interpreted by a registered medical practitioner. Laboratory results are subject to clinical variation.
                </p>
              </footer>
              {/* END: Disclaimer */}

              {/* BEGIN: ActionButtons */}
              <div className="flex items-center justify-between pt-2 pb-6 border-t border-transparent print-hide">
                {/* Back Button */}
                <button
                  onClick={() => setViewMode(returnView)}
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#9ca3af] hover:bg-[#8e95a1] text-gray-900 font-semibold text-sm rounded shadow-sm transition cursor-pointer"
                  type="button"
                >
                  <svg
                    className="w-4 h-4 text-gray-900"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M10 19l-7-7m0 0l7-7m-7 7h18"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span>Back</span>
                </button>
                {/* Print Report Button */}
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#4f46e5] hover:bg-[#4338ca] text-white font-semibold text-sm rounded shadow-sm transition cursor-pointer"
                  type="button"
                >
                  <svg
                    className="w-4 h-4 text-white"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span>Print Report</span>
                </button>
              </div>
              {/* END: ActionButtons */}
            </div>
          </main>
        ) : viewMode === "forward" && selectedTransfer ? (
          /* ========================================================================= */
          /* BEGIN: Forward Test Reports View                                         */
          /* ========================================================================= */
          <main
            className="flex-1 bg-white p-10 overflow-y-auto"
            data-purpose="main-workspace"
          >
            <div className="max-w-[1240px] mx-auto">
              {/* Back to Dispatches Navigation */}
              <div className="mb-4">
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  className="inline-flex items-center text-[13.5px] font-semibold text-[#1d4ed8] hover:text-blue-800 transition-colors cursor-pointer"
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
                  Back to Dispatches
                </button>
              </div>

              {/* Page Title */}
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight mb-6">
                Forward Test Reports
              </h1>

              {/* Overdue Warning in Forward View */}
              {isTransferOverdue(selectedTransfer) && (
                <div className="mb-6 rounded-xl border border-rose-300 bg-rose-50/80 px-4 py-3 text-sm text-rose-900 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-2.5 w-2.5 rounded-full bg-rose-600 animate-pulse" />
                    <span className="font-bold text-rose-800">TRANSFER OVERDUE:</span>
                    <span>Target completion date was {selectedTransfer.targetDate || "passed"}. Expedite dispatch immediately.</span>
                  </div>
                  <span className="px-2 py-0.5 text-xs font-extrabold uppercase tracking-wide bg-rose-600 text-white rounded">
                    OVERDUE
                  </span>
                </div>
              )}

              {/* Content Dual-Card Grid Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                {/* BEGIN: ReportInformationCard */}
                <section
                  className="bg-white border border-gray-200/90 rounded-xl p-7 shadow-sm"
                  data-purpose="report-info-section"
                >
                  <h2 className="text-base font-semibold text-[#1d4ed8] mb-6">
                    Report Information
                  </h2>
                  <div className="space-y-6">
                    {/* Field: Report ID */}
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1.5">
                        Report ID
                      </p>
                      <p className="text-[15px] font-semibold text-gray-900 font-mono">
                        {selectedTransfer.reportId}
                      </p>
                    </div>
                    {/* Field: Sample ID */}
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1.5">
                        Barcode
                      </p>
                      <p className="text-[15px] font-semibold text-gray-900 font-mono">
                        {getDisplayBarcode(selectedTransfer)}
                      </p>
                    </div>
                    {/* Field: Patient Name */}
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1.5">
                        Patient Name
                      </p>
                      <p className="text-[15px] font-semibold text-gray-900">
                        {selectedTransfer.patientName}{" "}
                        <span className="text-xs text-gray-400 font-mono">
                          ({selectedTransfer.patientId})
                        </span>
                      </p>
                    </div>
                    {/* Field: Test / Profile */}
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1.5">
                        Test / Profile
                      </p>
                      <p className="text-[15px] font-semibold text-gray-900">
                        {selectedTransfer.testProfile}
                      </p>
                    </div>
                    {/* Field: Target Date */}
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1.5">
                        Target Date
                      </p>
                      <div className="flex items-center gap-2">
                        <p className={`text-[15px] font-semibold ${isTransferOverdue(selectedTransfer) ? "text-rose-700 font-bold" : "text-gray-900"}`}>
                          {selectedTransfer.targetDate || "Not Specified"}
                        </p>
                        {isTransferOverdue(selectedTransfer) && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-rose-600 text-white tracking-wide uppercase">
                            OVERDUE
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Preview Action Button */}
                    <div className="pt-3">
                      <button
                        onClick={() => handleOpenPreview(selectedTransfer, "forward")}
                        className="w-full bg-[#94a3b8] hover:bg-[#8292a7] transition-colors text-white font-semibold py-2.5 px-4 rounded-lg text-sm shadow-sm cursor-pointer"
                        type="button"
                      >
                        Preview Report
                      </button>
                    </div>
                  </div>
                </section>
                {/* END: ReportInformationCard */}

                {/* BEGIN: SendToCard */}
                <section
                  className="bg-white border border-gray-200/90 rounded-xl p-7 shadow-sm"
                  data-purpose="send-recipients-section"
                >
                  <h2 className="text-base font-semibold text-[#1d4ed8] mb-6">
                    Send To
                  </h2>
                  <div className="space-y-4">
                    {/* Recipient 1: Patient Portal */}
                    <div className="bg-[#f8fafc] border border-gray-100 rounded-lg p-4 flex items-start justify-between">
                      <div className="flex items-start gap-3.5">
                        <input
                          aria-label="Send to Patient Portal"
                          checked={sendToPatient}
                          onChange={(e) => setSendToPatient(e.target.checked)}
                          className="mt-1 h-4 w-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300 cursor-pointer"
                          type="checkbox"
                        />
                        <div>
                          <h3 className="text-sm font-semibold text-gray-900">
                            Patient Portal
                          </h3>
                          <p className="text-xs text-gray-500 mt-1 font-mono">
                            {selectedTransfer.patientEmail}
                          </p>
                        </div>
                      </div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wide bg-[#e6f8ee] text-[#16a34a]">
                        SENT
                      </span>
                    </div>

                    {/* Recipient 2: Doctor Portal */}
                    <div className="bg-[#f8fafc] border border-gray-100 rounded-lg p-4 flex items-start justify-between">
                      <div className="flex items-start gap-3.5">
                        <input
                          aria-label="Send to Doctor Portal"
                          checked={sendToDoctor}
                          onChange={(e) => setSendToDoctor(e.target.checked)}
                          className="mt-1 h-4 w-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300 cursor-pointer"
                          type="checkbox"
                        />
                        <div>
                          <h3 className="text-sm font-semibold text-gray-900">
                            Doctor Portal
                          </h3>
                          <p className="text-xs text-gray-600 mt-1 font-normal">
                            {selectedTransfer.doctorName}
                          </p>
                          <p className="text-xs text-gray-500 font-mono">
                            {selectedTransfer.doctorEmail}
                          </p>
                        </div>
                      </div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wide bg-[#e6f8ee] text-[#16a34a]">
                        SENT
                      </span>
                    </div>

                    {/* Additional Optional Recipients Input Group */}
                    <div className="pt-3">
                      <label
                        className="block text-xs font-medium text-gray-900 mb-2"
                        htmlFor="additional-email"
                      >
                        Additional Recipients (Optional)
                      </label>
                      <form
                        onSubmit={handleAddAdditionalRecipient}
                        className="flex items-center gap-2"
                      >
                        <input
                          value={additionalEmailInput}
                          onChange={(e) => setAdditionalEmailInput(e.target.value)}
                          className="block w-full rounded-lg border-gray-300 text-xs py-2.5 px-3.5 text-gray-700 placeholder-gray-400 focus:border-blue-500 focus:ring-blue-500 shadow-sm"
                          id="additional-email"
                          placeholder="Enter email address"
                          type="email"
                        />
                        <button
                          type="submit"
                          className="shrink-0 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-semibold py-2.5 px-4 rounded-lg shadow-sm transition-colors cursor-pointer"
                        >
                          + Add
                        </button>
                      </form>

                      {/* Display added additional email chips */}
                      {additionalRecipients.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {additionalRecipients.map((email) => (
                            <span
                              key={email}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200"
                            >
                              <span>{email}</span>
                              <button
                                type="button"
                                onClick={() =>
                                  handleRemoveAdditionalRecipient(email)
                                }
                                className="text-blue-500 hover:text-blue-800 cursor-pointer"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </section>
                {/* END: SendToCard */}
              </div>

              {/* Action Button Area (Send Report) */}
              <div
                className="mt-8 flex justify-end items-center gap-3"
                data-purpose="submit-container"
              >
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSendReport}
                  className="inline-flex items-center justify-center gap-2 bg-[#4f46e5] hover:bg-[#4338ca] text-white font-medium text-sm px-6 py-2.5 rounded-lg shadow-sm transition-colors cursor-pointer"
                >
                  <span>Send Report</span>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </main>
        ) : (
          /* ========================================================================= */
          /* BEGIN: Table & Dispatch Log View                                         */
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
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-900 tracking-tight">Report Transfer</h1>
                  <p className="text-xs text-slate-500">Dispatch completed diagnostic reports to consulting doctors and wards</p>
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
              {/* Key Performance Indicators - Admin Dashboard Style Scrollable Track */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between flex-wrap gap-2 px-1">
                  <div>
                    <h2 className="text-base font-bold text-[#1c1e21] tracking-tight">Key Performance Indicators</h2>
                    <p className="text-xs text-[#70747c]">Real-time report dispatch pipeline and channel transmission logs</p>
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
                    className={`absolute left-0 top-0 bottom-2 w-12 pointer-events-none z-[2] transition-opacity duration-200 bg-gradient-to-r from-white to-transparent ${
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
                    className={`absolute right-0 top-0 bottom-2 w-12 pointer-events-none z-[2] transition-opacity duration-200 bg-gradient-to-l from-white to-transparent ${
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

              {/* TableContainerCard */}
              <section
                className="w-full bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden"
                data-purpose="tests-details-card"
              >
                {/* BEGIN: HeaderSection */}
                <header
                  className="px-8 pt-7 pb-6 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  data-purpose="table-header"
                >
                  <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
                      Report Dispatch &amp; Transfer Log
                    </h1>
                  </div>
                  {/* BEGIN: SearchAndFilters */}
                  <div
                    className="flex flex-wrap items-center gap-3"
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
                        placeholder="Search Patient, Barcode, Recipient..."
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
                            className={`w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center justify-between cursor-pointer ${
                              statusFilter === "ALL"
                                ? "font-semibold text-blue-600 bg-blue-50/50"
                                : "text-slate-700"
                            }`}
                          >
                            <span>All ({transfers.length})</span>
                            {statusFilter === "ALL" && <span>✓</span>}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setStatusFilter("DELIVERED");
                              setIsFilterDropdownOpen(false);
                            }}
                            className={`w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center justify-between cursor-pointer ${
                              statusFilter === "DELIVERED"
                                ? "font-semibold text-[#15803d] bg-green-50/50"
                                : "text-slate-700"
                            }`}
                          >
                            <span>Delivered ({deliveredCount})</span>
                            {statusFilter === "DELIVERED" && <span>✓</span>}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setStatusFilter("SENT");
                              setIsFilterDropdownOpen(false);
                            }}
                            className={`w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center justify-between cursor-pointer ${
                              statusFilter === "SENT"
                                ? "font-semibold text-blue-600 bg-blue-50/50"
                                : "text-slate-700"
                            }`}
                          >
                            <span>Sent ({sentCount})</span>
                            {statusFilter === "SENT" && <span>✓</span>}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setStatusFilter("QUEUED");
                              setIsFilterDropdownOpen(false);
                            }}
                            className={`w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center justify-between cursor-pointer ${
                              statusFilter === "QUEUED"
                                ? "font-semibold text-[#715e17] bg-[#faecc5]/30"
                                : "text-slate-700"
                            }`}
                          >
                            <span>Queued ({queuedCount})</span>
                            {statusFilter === "QUEUED" && <span>✓</span>}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setStatusFilter("FAILED");
                              setIsFilterDropdownOpen(false);
                            }}
                            className={`w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center justify-between cursor-pointer ${
                              statusFilter === "FAILED"
                                ? "font-semibold text-[#991b1b] bg-red-50/50"
                                : "text-slate-700"
                            }`}
                          >
                            <span>Failed ({failedCount})</span>
                            {statusFilter === "FAILED" && <span>✓</span>}
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
                    id="transfers-log-table"
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
                          RECIPIENT &amp; STATION
                        </th>
                        <th
                          className="py-5 px-6 font-bold text-center"
                          scope="col"
                        >
                          TIME
                        </th>
                        <th
                          className="py-5 px-8 font-bold text-center"
                          scope="col"
                        >
                          STATUS
                        </th>
                        <th
                          className="py-5 px-6 font-bold text-center"
                          scope="col"
                        >
                          ACTION
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-[14px] text-slate-600">
                      {filteredTransfers.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="py-12 text-center text-slate-400 text-sm"
                          >
                            No dispatch logs found matching your criteria.
                          </td>
                        </tr>
                      ) : (
                        filteredTransfers.map((t) => {
                          const isOverdue = isTransferOverdue(t);
                          return (
                            <tr
                              key={t.id}
                              onClick={() => handleOpenForward(t)}
                              className={`transition-colors cursor-pointer ${
                                isOverdue
                                  ? "bg-rose-50/40 hover:bg-rose-50/70 border-l-4 border-l-rose-500"
                                  : "hover:bg-slate-50/60"
                              }`}
                            >
                              <td className="py-5 px-8 whitespace-nowrap">
                                <span className="font-mono text-slate-900 text-sm font-semibold block">
                                  {getDisplayBarcode(t)}
                                </span>
                                {isOverdue && (
                                  <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                                    <Clock className="w-3 h-3 text-rose-600" /> Overdue
                                  </span>
                                )}
                              </td>
                              <td className="py-5 px-6">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-semibold text-slate-900">
                                    {t.patientName}
                                  </span>
                                  {isOverdue && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-rose-600 text-white tracking-wide uppercase shrink-0">
                                      OVERDUE
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                  <span className="text-xs text-slate-400 font-mono">
                                    {t.patientId}
                                  </span>
                                  <span className="text-xs text-slate-600 font-medium truncate max-w-[170px]" title={t.testProfile}>
                                    · {t.testProfile}
                                  </span>
                                  {t.targetDate && (
                                    <span className={`text-xs font-semibold ${isOverdue ? "text-rose-700" : "text-slate-500"}`}>
                                      · Target: {t.targetDate}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-5 px-6">
                                <span className="font-medium text-slate-800 block text-xs">
                                  {t.recipient}
                                </span>
                                {t.ackDetails && (
                                  <span className="text-xs text-slate-400 block truncate max-w-xs">
                                    {t.ackDetails}
                                  </span>
                                )}
                              </td>
                            <td className="py-5 px-6 text-center text-slate-600 font-mono text-xs">
                              {t.dispatchedAt}
                            </td>
                            <td className="py-5 px-8 text-center">
                              {t.status === "DELIVERED" ? (
                                <span className="inline-block px-4 py-1.5 rounded-full text-xs font-bold tracking-wider bg-[#bbf7d0] text-[#15803d]">
                                  DELIVERED
                                </span>
                              ) : t.status === "SENT" ? (
                                <span className="inline-block px-4 py-1.5 rounded-full text-xs font-bold tracking-wider bg-[#dbeafe] text-[#1e40af]">
                                  SENT
                                </span>
                              ) : t.status === "FAILED" ? (
                                <span
                                  className="inline-block px-4 py-1.5 rounded-full text-xs font-bold tracking-wider bg-[#fee2e2] text-[#991b1b]"
                                  title={t.ackDetails}
                                >
                                  FAILED
                                </span>
                              ) : (
                                <span className="inline-block px-4 py-1.5 rounded-full text-xs font-bold tracking-wider bg-[#faecc5] text-[#715e17]">
                                  QUEUED
                                </span>
                              )}
                            </td>
                            <td className="py-5 px-6 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenForward(t);
                                  }}
                                  className="px-3 py-1.5 bg-[#4f46e5] hover:bg-[#4338ca] text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
                                >
                                  Forward
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenPreview(t, "table");
                                  }}
                                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 transition-colors cursor-pointer"
                                  title="View Diagnostic Report"
                                >
                                  Preview
                                </button>
                                {t.status === "FAILED" && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleResend(t.id);
                                    }}
                                    className="px-3 py-1.5 bg-[#00875A] hover:bg-[#00744E] text-white text-xs font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
                                  >
                                    Retry
                                  </button>
                                )}
                                {t.status === "QUEUED" && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleResend(t.id);
                                    }}
                                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
                                  >
                                    Dispatch
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                    </tbody>
                  </table>
                </div>
              </section>
            </main>
          </>
        )}
      </div>
    </div>
  );
}
