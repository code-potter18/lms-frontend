import React, { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Printer,
  Pencil,
  Calendar,
  Clock,
  User,
  FileText,
  Phone,
  Mail,
  MapPin,
  ClipboardList,
  ArrowRight,
  Loader2,
  FlaskConical,
  Pill,
  Download,
  Eye,
  Activity,
  HeartPulse,
  Droplet,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { appointmentApi, type AppointmentRecord } from "@/api/appointment.api";
import { encounterApi, type EncounterRecord } from "@/api/encounter.api";
import { chemoPlanCurrentItems, chemoPlanItemName } from "@/api/chemotherapy.api";
import API from "@/api/axios";
import { formatMobile } from "@/utils/formatters";
import { StatusBadge, type StatusTone } from "@/components/hms/StatusBadge";
import PatientVitalsPanel from "@/components/hms/PatientVitalsPanel";
import {
  generatePrescriptionPdf,
  downloadPrescriptionPdf,
  type PrescriptionData,
} from "@/utils/prescriptionPdf";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// Status label mapping matching backend enum
const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "Scheduled",
  CHECKED_IN: "Checked In",
  IN_CONSULTATION: "In Consultation",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No Show",
  RESCHEDULED: "Rescheduled",
  RESCHEDULE_REQUIRED: "Reschedule Required",
  TRANSFER_REVIEW_REQUIRED: "Transfer Review Required",
};

const STATUS_TONES: Record<string, StatusTone> = {
  SCHEDULED: "blue",
  CHECKED_IN: "amber",
  IN_CONSULTATION: "purple",
  COMPLETED: "emerald",
  CANCELLED: "red",
  NO_SHOW: "gray",
  RESCHEDULED: "teal",
  RESCHEDULE_REQUIRED: "amber",
  TRANSFER_REVIEW_REQUIRED: "indigo",
};

function getInitials(name: string): string {
  const words = name.replace(/^Dr\.?\s*/i, "").trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}

function formatPatientName(p: AppointmentRecord["patient_bio_data"]): string {
  if (!p) return "Unknown Patient";
  return [p.patient_first_name, p.patient_middle_name, p.patient_last_name]
    .filter(Boolean)
    .join(" ");
}

function formatDoctorName(e: AppointmentRecord["employees"], fallbackName?: string | null): string {
  if (!e) return fallbackName || "Unassigned";
  return `Dr. ${[e.first_name, e.middle_name, e.last_name].filter(Boolean).join(" ")}`;
}

function formatAppointmentDate(date?: string | null): string {
  if (!date) return "—";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function formatAppointmentTime(time?: string | null): string {
  if (!time) return "—";
  const t = new Date(time);
  if (isNaN(t.getTime())) return "—";
  const minutes = String(t.getUTCMinutes()).padStart(2, "0");
  const period = t.getUTCHours() >= 12 ? "PM" : "AM";
  const hours12 = t.getUTCHours() % 12 || 12;
  return `${String(hours12).padStart(2, "0")}:${minutes} ${period}`;
}

function formatCreatedAt(date?: string | null): string {
  if (!date) return "—";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function calculateAge(dob?: string | null): string {
  if (!dob) return "—";
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return "—";
  const diff = Date.now() - birth.getTime();
  const ageDate = new Date(diff);
  return `${Math.abs(ageDate.getUTCFullYear() - 1970)} Yrs`;
}

interface MedicationItemDisplay {
  id: string;
  name: string;
  genericName?: string;
  role: "PREMEDICATION" | "PRIMARY" | "SUPPORTIVE" | "DILUTION" | "POST";
  form?: string;
  dose?: string;
  route?: string;
  frequency?: string;
  timing?: string;
  instructions?: string;
  diluent?: string;
  dilutionVolume?: string;
  duration?: string;
}

const AppointmentDetails: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [appointment, setAppointment] = useState<AppointmentRecord | null>(null);
  const [encounter, setEncounter] = useState<EncounterRecord | null>(null);
  const [chemoPlan, setChemoPlan] = useState<any | null>(null);
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [dischargeMeds, setDischargeMeds] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Medication tab switcher: "all" | "pre" | "chemo" | "supportive" | "dilutions" | "post"
  const [medTab, setMedTab] = useState<"all" | "pre" | "chemo" | "supportive" | "dilutions" | "post">("all");

  useEffect(() => {
    if (!id) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    const loadData = async () => {
      try {
        // 1. Load appointment
        const aptRes = await appointmentApi.getOne(id);
        const aptData = aptRes.data?.data ?? null;
        if (!isMounted) return;
        setAppointment(aptData);

        if (!aptData) {
          setIsLoading(false);
          return;
        }

        const patientId = aptData.patient_id;

        // 2. Parallel secondary data loads (encounter, chemo plan, prescriptions)
        const [encounterResult, planResult, prescriptionsResult] = await Promise.allSettled([
          encounterApi.getByAppointment(id).then((r) => r.data?.data ?? null),
          API.get<{ success: boolean; data: any }>("/chemotherapy/plans/latest-for-patient", {
            params: { patient_id: patientId },
          }).then((r) => r.data?.data ?? null),
          API.get<{ success: boolean; data: { prescriptions?: any[] } }>(`/prescriptions/patient/${patientId}`).then(
            (r) => r.data?.data?.prescriptions ?? []
          ),
        ]);

        if (!isMounted) return;

        if (encounterResult.status === "fulfilled") {
          setEncounter(encounterResult.value);
        }

        let loadedPlan: any = null;
        if (planResult.status === "fulfilled" && planResult.value) {
          loadedPlan = planResult.value;
          setChemoPlan(loadedPlan);
        }

        if (prescriptionsResult.status === "fulfilled") {
          setPrescriptions(prescriptionsResult.value ?? []);
        }

        // 3. Load discharge medicines if protocol is linked
        const protocolId =
          loadedPlan?.chemotherapy_regimen_protocol?.protocol_id ||
          loadedPlan?.source_protocol_id;

        if (protocolId) {
          try {
            const dischargeRes = await API.get<{ success: boolean; data: any[] }>(
              `/chemotherapy/regimen-protocols/${encodeURIComponent(protocolId)}/discharge-medicines`
            );
            if (isMounted && dischargeRes.data?.data) {
              setDischargeMeds(dischargeRes.data.data);
            }
          } catch {
            // Discharge medicines optional
          }
        }
      } catch (err) {
        console.error("[View Appointment] Load failed:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [id]);

  const isLabVisit = useMemo(() => {
    if (!appointment) return false;
    const visitTypeRaw = (appointment.Patient_visit_type ?? appointment.patient_visit_type ?? "").toLowerCase();
    const deptRaw = (
      appointment.department_master?.department_name ??
      appointment.department ??
      ""
    ).toLowerCase();
    return visitTypeRaw.includes("lab") || deptRaw.includes("laboratory");
  }, [appointment]);

  // Unified medications list
  const allMedications: MedicationItemDisplay[] = useMemo(() => {
    const list: MedicationItemDisplay[] = [];

    // From Chemotherapy Plan items (the current cycle day order, else the baseline)
    const chemoPlanItems = chemoPlanCurrentItems<any>(chemoPlan);
    if (Array.isArray(chemoPlanItems)) {
      chemoPlanItems.forEach((item: any, idx: number) => {
        const roleUpper = (item.drug_role ?? "").toUpperCase();
        let role: MedicationItemDisplay["role"] = "PRIMARY";
        if (roleUpper === "PREMEDICATION") role = "PREMEDICATION";
        else if (roleUpper === "SUPPORTIVE") role = "SUPPORTIVE";
        else if (item.dilution_volume) role = "DILUTION";

        list.push({
          id: item.chemotherapy_plan_item_id || `plan-item-${idx}`,
          name: chemoPlanItemName(item) || item.medicine_name || "—",
          genericName: item.medicine_master?.generic_name,
          role,
          form: item.formulation || item.medicine_master?.dosage_form,
          dose: item.protocol_dose != null ? `${item.protocol_dose} ${item.protocol_dose_unit || ""}`.trim() : undefined,
          route: item.administration_route || undefined,
          frequency: item.frequency || undefined,
          timing: item.timing || undefined,
          instructions: item.remarks || item.administration_detail || undefined,
          diluent: item.diluent || undefined,
          dilutionVolume: item.dilution_volume ? String(item.dilution_volume) : undefined,
        });
      });
    }

    // From Discharge / Post medicines
    if (dischargeMeds.length > 0) {
      dischargeMeds.forEach((item: any, idx: number) => {
        list.push({
          id: item.discharge_instruction_id || `discharge-${idx}`,
          name: item.medicine_master?.medicine_name || "—",
          role: "POST",
          dose: item.patient_dose != null ? `${item.patient_dose} ${item.patient_dose_unit || ""}`.trim() : undefined,
          frequency: item.frequency || undefined,
          instructions: item.administration_detail || item.comment || item.composition || undefined,
          duration: item.duration || undefined,
        });
      });
    }

    // Fallback: If no chemo plan items, extract from latest prescription
    if (list.length === 0 && prescriptions.length > 0) {
      const latestPrescription = prescriptions[0];
      (latestPrescription.prescription_items || []).forEach((pItem: any, idx: number) => {
        const r = (pItem.drug_role || "").toUpperCase();
        let role: MedicationItemDisplay["role"] = "PRIMARY";
        if (r.includes("PRE")) role = "PREMEDICATION";
        else if (r.includes("SUPPORT")) role = "SUPPORTIVE";
        else if (r.includes("POST") || r.includes("DISCHARGE")) role = "POST";

        list.push({
          id: pItem.prescription_item_id || `rx-item-${idx}`,
          name: pItem.medicine_master?.medicine_name || pItem.medicine_name || pItem.drug_name || "—",
          genericName: pItem.medicine_master?.generic_name,
          role,
          dose: pItem.dosage ? `${pItem.dosage} ${pItem.unit || ""}`.trim() : undefined,
          route: pItem.route || undefined,
          frequency: pItem.frequency || undefined,
          instructions: pItem.instruction || undefined,
        });
      });
    }

    return list;
  }, [chemoPlan, dischargeMeds, prescriptions]);

  const filteredMeds = useMemo(() => {
    if (medTab === "all") return allMedications;
    if (medTab === "pre") return allMedications.filter((m) => m.role === "PREMEDICATION");
    if (medTab === "chemo") return allMedications.filter((m) => m.role === "PRIMARY");
    if (medTab === "supportive") return allMedications.filter((m) => m.role === "SUPPORTIVE");
    if (medTab === "dilutions") return allMedications.filter((m) => m.role === "DILUTION" || Boolean(m.dilutionVolume));
    if (medTab === "post") return allMedications.filter((m) => m.role === "POST");
    return allMedications;
  }, [allMedications, medTab]);

  const medCounts = useMemo(() => {
    return {
      all: allMedications.length,
      pre: allMedications.filter((m) => m.role === "PREMEDICATION").length,
      chemo: allMedications.filter((m) => m.role === "PRIMARY").length,
      supportive: allMedications.filter((m) => m.role === "SUPPORTIVE").length,
      dilutions: allMedications.filter((m) => m.role === "DILUTION" || Boolean(m.dilutionVolume)).length,
      post: allMedications.filter((m) => m.role === "POST").length,
    };
  }, [allMedications]);

  // Diagnosis resolution (Encounter diagnosis > Chemo Plan diagnosis/staging > Latest Prescription diagnosis)
  const resolvedDiagnosis = useMemo(() => {
    // 1. Chemo plan staging detail
    const osd = chemoPlan?.oncology_staging_detail;
    const cancerType = osd?.cancer_types?.cancer_type || chemoPlan?.cancer_type;
    const subtype = osd?.histopathology || osd?.cancer_subtypes?.subtype_name || chemoPlan?.cancer_subtype;
    const stage = osd?.clinical_stage || chemoPlan?.cancer_stage || osd?.derived_fields?.ajcc_stage;
    const icd = osd?.icd10_code || osd?.derived_fields?.icd10_auto;

    if (cancerType || subtype || stage) {
      return {
        title: [cancerType, subtype].filter(Boolean).join(" — ") || "Oncology Consultation",
        stage: stage ? `Stage: ${stage}` : null,
        icd: icd ? `ICD-10: ${icd}` : null,
        protocol: chemoPlan?.regimen_name || chemoPlan?.protocol_name || null,
        intent: chemoPlan?.treatment_intent || chemoPlan?.treatment_goal || null,
      };
    }

    // 2. From prescription diagnosis
    if (prescriptions.length > 0 && prescriptions[0]?.diagnosis?.diagnosis_name) {
      const rxDiag = prescriptions[0].diagnosis;
      return {
        title: rxDiag.diagnosis_name,
        stage: null,
        icd: rxDiag.icd_code || rxDiag.icd10_code ? `ICD-10: ${rxDiag.icd_code || rxDiag.icd10_code}` : null,
        protocol: null,
        intent: null,
      };
    }

    return null;
  }, [chemoPlan, prescriptions]);

  // Chief Complaint resolution
  const resolvedChiefComplaint = useMemo(() => {
    return (
      encounter?.chief_complaint ||
      appointment?.reason_for_visit ||
      prescriptions[0]?.chief_complaint ||
      "No chief complaint provided for this visit."
    );
  }, [encounter, appointment, prescriptions]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPrescription = (p: any) => {
    const rxData: PrescriptionData = {
      prescription_id: p.prescription_id,
      prescription_date: p.prescription_date,
      advice: p.advice,
      visit_type: p.visit_type,
      chief_complaint: p.chief_complaint,
      clinical_notes: p.clinical_notes,
      followup_date: p.followup_date,
      prescription_status: p.prescription_status,
      branch_name: p.branch?.branch_name || appointment?.branch?.branch_name,
      department_name: p.department_master?.department_name || appointment?.department_master?.department_name,
      patient_history: {
        patient_first_name: p.patient_history?.patient_bio_data?.patient_first_name || appointment?.patient_bio_data?.patient_first_name || "",
        patient_last_name: p.patient_history?.patient_bio_data?.patient_last_name || appointment?.patient_bio_data?.patient_last_name || "",
        patient_display_id: p.patient_history?.patient_bio_data?.patient_id || appointment?.patient_id || "",
        patient_id: p.patient_history?.patient_bio_data?.patient_id || appointment?.patient_id || "",
        patient_mobile: p.patient_history?.patient_bio_data?.patient_primary_mobile || appointment?.patient_bio_data?.patient_primary_mobile || "",
        visit_date: p.prescription_date || appointment?.appointment_date || "",
        patient_dob: p.patient_history?.patient_bio_data?.patient_dob || appointment?.patient_bio_data?.patient_dob || "",
      },
      employees: {
        first_name: p.employees?.first_name || appointment?.employees?.first_name || "",
        last_name: p.employees?.last_name || appointment?.employees?.last_name || "",
        specialization: p.employees?.specialization || appointment?.employees?.specialization || "",
      },
      diagnosis: {
        diagnosis_name: p.diagnosis?.diagnosis_name || resolvedDiagnosis?.title || "Clinical Prescription",
        icd10_code: p.diagnosis?.icd_code || "",
      },
      prescription_items: (p.prescription_items || []).map((it: any) => ({
        medicine_name: it.medicine_master?.medicine_name || it.medicine_name || it.drug_name || "",
        medicine_master: it.medicine_master,
        dosage: it.dosage,
        unit: it.unit,
        route: it.route,
        frequency: it.frequency,
        instruction: it.instruction,
        drug_role: it.drug_role,
      })),
    };

    downloadPrescriptionPdf(rxData);
  };

  const handleViewPrescription = async (p: any) => {
    const rxData: PrescriptionData = {
      prescription_id: p.prescription_id,
      prescription_date: p.prescription_date,
      advice: p.advice,
      visit_type: p.visit_type,
      chief_complaint: p.chief_complaint,
      clinical_notes: p.clinical_notes,
      followup_date: p.followup_date,
      prescription_status: p.prescription_status,
      branch_name: p.branch?.branch_name || appointment?.branch?.branch_name,
      department_name: p.department_master?.department_name || appointment?.department_master?.department_name,
      patient_history: {
        patient_first_name: p.patient_history?.patient_bio_data?.patient_first_name || appointment?.patient_bio_data?.patient_first_name || "",
        patient_last_name: p.patient_history?.patient_bio_data?.patient_last_name || appointment?.patient_bio_data?.patient_last_name || "",
        patient_display_id: p.patient_history?.patient_bio_data?.patient_id || appointment?.patient_id || "",
        patient_id: p.patient_history?.patient_bio_data?.patient_id || appointment?.patient_id || "",
        patient_mobile: p.patient_history?.patient_bio_data?.patient_primary_mobile || appointment?.patient_bio_data?.patient_primary_mobile || "",
        visit_date: p.prescription_date || appointment?.appointment_date || "",
        patient_dob: p.patient_history?.patient_bio_data?.patient_dob || appointment?.patient_bio_data?.patient_dob || "",
      },
      employees: {
        first_name: p.employees?.first_name || appointment?.employees?.first_name || "",
        last_name: p.employees?.last_name || appointment?.employees?.last_name || "",
        specialization: p.employees?.specialization || appointment?.employees?.specialization || "",
      },
      diagnosis: {
        diagnosis_name: p.diagnosis?.diagnosis_name || resolvedDiagnosis?.title || "Clinical Prescription",
        icd10_code: p.diagnosis?.icd_code || "",
      },
      prescription_items: (p.prescription_items || []).map((it: any) => ({
        medicine_name: it.medicine_master?.medicine_name || it.medicine_name || it.drug_name || "",
        medicine_master: it.medicine_master,
        dosage: it.dosage,
        unit: it.unit,
        route: it.route,
        frequency: it.frequency,
        instruction: it.instruction,
        drug_role: it.drug_role,
      })),
    };

    const { url } = await generatePrescriptionPdf(rxData);
    window.open(url, "_blank");
  };

  const handleDownloadChemoSummary = () => {
    if (!chemoPlan || !appointment) return;
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "pt",
      format: "a4",
    });

    doc.setFontSize(16);
    doc.setTextColor(20, 30, 40);
    doc.text("Chemotherapy Treatment Summary", 40, 44);

    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    const pName = formatPatientName(appointment.patient_bio_data);
    const infoLine = [
      `Patient: ${pName} (${appointment.patient_id})`,
      chemoPlan.cancer_type && `Cancer Type: ${chemoPlan.cancer_type}`,
      chemoPlan.cancer_stage && `Stage: ${chemoPlan.cancer_stage}`,
      chemoPlan.treatment_intent && `Intent: ${chemoPlan.treatment_intent}`,
      chemoPlan.regimen_name && `Regimen: ${chemoPlan.regimen_name}`,
      chemoPlan.planned_cycles && `Planned Cycles: ${chemoPlan.planned_cycles}`,
    ]
      .filter(Boolean)
      .join("   |   ");
    doc.text(infoLine, 40, 60);

    const tableStyles = {
      fontSize: 8,
      cellPadding: 5,
      textColor: [30, 41, 59] as [number, number, number],
      lineColor: [226, 232, 240] as [number, number, number],
      lineWidth: 0.5,
    };
    const headStyles = {
      fillColor: [0, 71, 133] as [number, number, number],
      textColor: [255, 255, 255] as [number, number, number],
      fontSize: 8.5,
      fontStyle: "bold" as const,
    };

    let y = 72;

    const renderSection = (title: string, head: string[], body: string[][]) => {
      if (body.length === 0) return;
      if (y > 420) {
        doc.addPage();
        y = 40;
      }
      doc.setFontSize(11);
      doc.setTextColor(49, 46, 129);
      doc.text(title, 40, y);
      y += 8;
      autoTable(doc, {
        startY: y,
        head: [head],
        body,
        styles: tableStyles,
        headStyles,
        alternateRowStyles: { fillColor: [247, 249, 251] },
        margin: { left: 40, right: 40 },
      });
      y = (doc as any).lastAutoTable?.finalY ?? y;
      y += 24;
    };

    const primaryMeds = allMedications.filter((m) => m.role === "PRIMARY");
    const preMeds = allMedications.filter((m) => m.role === "PREMEDICATION");
    const supportiveMeds = allMedications.filter((m) => m.role === "SUPPORTIVE");
    const postMeds = allMedications.filter((m) => m.role === "POST");

    renderSection(
      "Chemotherapy Drugs (Primary)",
      ["Drug Name", "Dose", "Route", "Dilution / Diluent", "Instructions"],
      primaryMeds.map((m) => [m.name, m.dose || "—", m.route || "—", m.dilutionVolume || "—", m.instructions || "—"])
    );

    renderSection(
      "Pre-medications",
      ["Drug Name", "Dose", "Route", "Timing / Frequency", "Instructions"],
      preMeds.map((m) => [m.name, m.dose || "—", m.route || "—", m.timing || m.frequency || "—", m.instructions || "—"])
    );

    renderSection(
      "Supportive Care",
      ["Drug Name", "Dose", "Route", "Frequency", "Instructions"],
      supportiveMeds.map((m) => [m.name, m.dose || "—", m.route || "—", m.frequency || "—", m.instructions || "—"])
    );

    renderSection(
      "Post / Discharge Medication",
      ["Drug Name", "Dose", "Frequency", "Instructions", "Duration"],
      postMeds.map((m) => [m.name, m.dose || "—", m.frequency || "—", m.instructions || "—", m.duration || "—"])
    );

    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Chemo_Summary_${appointment.patient_id}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <main className="flex min-h-[70vh] flex-col items-center justify-center gap-3 bg-slate-50 text-slate-500 font-[Manrope,sans-serif]">
        <Loader2 className="h-7 w-7 animate-spin text-[#00488D]" />
        <p className="text-sm font-medium">Loading appointment details...</p>
      </main>
    );
  }

  if (!appointment) {
    return (
      <main className="flex min-h-[70vh] flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-slate-700 font-[Manrope,sans-serif]">
        <AlertCircle className="h-10 w-10 text-rose-500" />
        <h2 className="text-xl font-bold text-slate-900">Appointment Not Found</h2>
        <p className="text-sm text-slate-500 max-w-md text-center">
          The appointment you are looking for does not exist or may have been deleted.
        </p>
        <button
          onClick={() => navigate("/appointments")}
          className="rounded-lg bg-[#00488D] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#003870]"
        >
          Return to Appointments
        </button>
      </main>
    );
  }

  const rawStatus = (appointment.status ?? "SCHEDULED").toUpperCase();
  const statusLabel = STATUS_LABELS[rawStatus] ?? (appointment.status || "Scheduled");
  const statusTone = STATUS_TONES[rawStatus] ?? "blue";
  const patientName = formatPatientName(appointment.patient_bio_data);
  const doctorName = formatDoctorName(appointment.employees, appointment.doctor_name);
  const dateLabel = formatAppointmentDate(appointment.appointment_date);
  const timeLabel = formatAppointmentTime(appointment.appointment_time);
  const deptName = appointment.department_master?.department_name ?? appointment.department ?? "—";
  const branchName = appointment.branch?.branch_name ?? "—";
  const branchArea = appointment.branch?.branch_area;

  return (
    <main className="min-h-screen bg-[#F8FAFC] p-4 md:p-6 lg:p-8 font-[Manrope,sans-serif] text-slate-900">
      <div className="mx-auto max-w-7xl space-y-6">

        {/* 1. Header Bar */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <button
              aria-label="Go back"
              onClick={() => navigate(-1)}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>

            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="hms-heading">Appointment Details</h1>
                <StatusBadge tone={statusTone}>{statusLabel}</StatusBadge>
              </div>
              <p className="hms-subheading mt-0.5">
                APT ID: <span className="font-bold text-slate-800">#{appointment.appointment_id}</span> • Created {formatCreatedAt(appointment.created_at)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-end sm:self-auto">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:border-slate-300"
            >
              <Printer className="h-4 w-4 text-slate-500" />
              Print
            </button>

            <button
              onClick={() => navigate(`/appointments/edit/${appointment.appointment_id}`)}
              className="flex items-center gap-2 rounded-xl border border-[#00488D] bg-white px-4 py-2 text-xs font-semibold text-[#00488D] shadow-sm transition-all hover:bg-blue-50"
            >
              <Pencil className="h-4 w-4" />
              Edit Appointment
            </button>
          </div>
        </header>

        {/* 2. Top Summary Ribbon */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6 lg:gap-6 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
            {/* Status */}
            <div className="flex flex-col justify-center">
              <span className="hms-id-text">Status</span>
              <div className="mt-1">
                <StatusBadge tone={statusTone}>{statusLabel}</StatusBadge>
              </div>
            </div>

            {/* Date */}
            <div className="flex flex-col justify-center sm:pl-4">
              <span className="hms-id-text">Date</span>
              <div className="mt-1 flex items-center gap-1.5 font-bold text-sm text-slate-800">
                <Calendar className="h-3.5 w-3.5 text-blue-600" />
                <span>{dateLabel}</span>
              </div>
            </div>

            {/* Time */}
            <div className="flex flex-col justify-center sm:pl-4 pt-3 sm:pt-0">
              <span className="hms-id-text">Time Slot</span>
              <div className="mt-1 flex items-center gap-1.5 font-bold text-sm text-slate-800">
                <Clock className="h-3.5 w-3.5 text-blue-600" />
                <span>{timeLabel}</span>
              </div>
            </div>

            {/* Department */}
            <div className="flex flex-col justify-center sm:pl-4 pt-3 sm:pt-0">
              <span className="hms-id-text">Department</span>
              <div className="mt-1 font-semibold text-xs text-slate-800 truncate">
                {deptName}
              </div>
            </div>

            {/* Token */}
            <div className="flex flex-col justify-center sm:pl-4 pt-3 sm:pt-0">
              <span className="hms-id-text">Token No.</span>
              <div className="mt-1 font-extrabold text-sm text-[#00488D]">
                {appointment.token_number != null ? `#${appointment.token_number}` : "—"}
              </div>
            </div>

            {/* Visit Type Badge */}
            <div className="flex flex-col justify-center sm:pl-4 pt-3 sm:pt-0">
              <span className="hms-id-text">Visit Type</span>
              <div className="mt-1">
                {isLabVisit ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                    <FlaskConical className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                    Lab Visit
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                    <User className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    Consultation
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Chemo Fitness Notification Ribbon (if assessed) */}
          {appointment.chemo_fitness && (
            <div
              className={`mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border p-3 text-xs ${
                appointment.chemo_fitness === "FIT"
                  ? "border-emerald-200 bg-emerald-50/60 text-emerald-900"
                  : "border-rose-200 bg-rose-50/60 text-rose-900"
              }`}
            >
              <div className="flex items-center gap-2 font-semibold">
                {appointment.chemo_fitness === "FIT" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                )}
                <span>
                  Chemotherapy Assessment:{" "}
                  <strong>{appointment.chemo_fitness === "FIT" ? "FIT FOR CHEMOTHERAPY" : "CHEMOTHERAPY DEFERRED (UNFIT)"}</strong>
                </span>
              </div>
              {appointment.chemo_unfit_reason && (
                <div className="text-slate-600 sm:text-right">
                  Reason: <span className="font-medium text-slate-800">{appointment.chemo_unfit_reason}</span>
                </div>
              )}
            </div>
          )}
        </section>

        {/* 3. Clinical Provider & Patient Profile Cards Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

          {/* Clinical Provider Card */}
          <section className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <FileText className="h-4 w-4" />
                  </div>
                  <h2 className="text-base font-bold text-slate-900">Clinical Provider</h2>
                </div>

                {appointment.employee_id ? (
                  <button
                    type="button"
                    onClick={() => navigate(`/doctor/view/${appointment.employee_id}`)}
                    className="flex items-center gap-1 text-xs font-semibold text-[#00488D] hover:underline cursor-pointer"
                  >
                    View Profile
                    <ArrowRight className="h-3 w-3" />
                  </button>
                ) : null}
              </div>

              <div className="mt-5 flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#D6E3FF] text-[#00488D] text-lg font-bold shadow-inner">
                  {getInitials(doctorName)}
                </div>

                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="hms-name-text text-base font-bold text-slate-900 truncate">
                      {doctorName}
                    </h3>
                    {appointment.employee_id && (
                      <span className="hms-id-text rounded bg-slate-100 px-1.5 py-0.5">
                        ID: {appointment.employee_id}
                      </span>
                    )}
                  </div>

                  <p className="text-xs font-medium text-slate-600">
                    {appointment.employees?.specialization ?? "General Physician"}
                  </p>

                  <div className="pt-1">
                    <span className="inline-block rounded-md border border-blue-100 bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700">
                      {deptName}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Provider Contact & Location Footer */}
            <div className="mt-6 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span>
                  {appointment.employees?.mobile_no ? formatMobile(appointment.employees.mobile_no) : "Phone not listed"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{branchName}</span>
              </div>
            </div>
          </section>

          {/* Patient Profile Card */}
          <section className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                    <User className="h-4 w-4" />
                  </div>
                  <h2 className="text-base font-bold text-slate-900">Patient Profile</h2>
                </div>

                <button
                  type="button"
                  onClick={() => navigate(`/patients/view/${appointment.patient_id}`)}
                  className="flex items-center gap-1 text-xs font-semibold text-[#00488D] hover:underline cursor-pointer"
                >
                  View Profile
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>

              <div className="mt-5 flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 text-lg font-bold shadow-inner">
                  {getInitials(patientName)}
                </div>

                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="hms-name-text text-base font-bold text-slate-900 truncate">
                      {patientName}
                    </h3>
                    <span className="hms-id-text rounded bg-slate-100 px-1.5 py-0.5">
                      #{appointment.patient_id}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-500 pt-0.5">
                    <span>
                      Gender: <strong className="text-slate-800 font-medium">{appointment.patient_bio_data?.patient_gender ?? "—"}</strong>
                    </span>
                    <span>•</span>
                    <span>
                      Age: <strong className="text-slate-800 font-medium">{calculateAge(appointment.patient_bio_data?.patient_dob)}</strong>
                    </span>
                    {appointment.patient_bio_data?.patient_blood_group && (
                      <>
                        <span>•</span>
                        <span>
                          Blood: <strong className="text-rose-600 font-semibold">{appointment.patient_bio_data.patient_blood_group}</strong>
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Patient Contact & Secondary Info Footer */}
            <div className="mt-6 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span>
                  {appointment.patient_bio_data?.patient_primary_mobile
                    ? formatMobile(appointment.patient_bio_data.patient_primary_mobile)
                    : "No mobile on file"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{branchArea || branchName}</span>
              </div>
            </div>
          </section>
        </div>

        {/* 4. Full Width Visit Details (Diagnosis at top, Chief Complaint below) */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm w-full space-y-6">
          <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <ClipboardList className="h-4 w-4" />
            </div>
            <h2 className="text-base font-bold text-slate-900">Visit Details</h2>
          </div>

          {/* DIAGNOSIS AT TOP */}
          <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-blue-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-blue-900">Primary Diagnosis</h3>
              </div>
              {resolvedDiagnosis?.stage && (
                <span className="rounded-md bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-800">
                  {resolvedDiagnosis.stage}
                </span>
              )}
            </div>

            {resolvedDiagnosis ? (
              <div className="space-y-2">
                <p className="text-base font-bold text-slate-900">{resolvedDiagnosis.title}</p>
                <div className="flex items-center gap-3 text-xs text-slate-600 flex-wrap">
                  {resolvedDiagnosis.icd && (
                    <span className="font-mono bg-white px-2 py-0.5 rounded border border-slate-200 font-medium">
                      {resolvedDiagnosis.icd}
                    </span>
                  )}
                  {resolvedDiagnosis.protocol && (
                    <span>Protocol: <strong className="text-slate-800">{resolvedDiagnosis.protocol}</strong></span>
                  )}
                  {resolvedDiagnosis.intent && (
                    <span>Intent: <strong className="text-slate-800">{resolvedDiagnosis.intent}</strong></span>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic">
                No formal diagnosis recorded for this appointment yet. Complete diagnosis in consultation.
              </p>
            )}
          </div>

          {/* CHIEF COMPLAINT BELOW DIAGNOSIS */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Chief Complaint & Reason for Visit
            </h4>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm leading-relaxed text-slate-800 font-medium">
              {resolvedChiefComplaint}
            </div>
          </div>

          {/* Valid Appointment Specific Details Grid */}
          <div className="pt-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
              Appointment Parameters
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                <span className="text-slate-400 text-[10px] uppercase font-bold">Appointment ID</span>
                <p className="font-semibold text-slate-800 mt-0.5">{appointment.appointment_id}</p>
              </div>

              <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                <span className="text-slate-400 text-[10px] uppercase font-bold">Branch Location</span>
                <p className="font-semibold text-slate-800 mt-0.5">{branchName}</p>
              </div>

              <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                <span className="text-slate-400 text-[10px] uppercase font-bold">Patient Type</span>
                <p className="font-semibold text-slate-800 mt-0.5 capitalize">{appointment.patient_type || "Outpatient (OP)"}</p>
              </div>

              <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                <span className="text-slate-400 text-[10px] uppercase font-bold">Referred By</span>
                <p className="font-semibold text-slate-800 mt-0.5">{appointment.referred_by || "Self / None"}</p>
              </div>
            </div>
          </div>
        </section>

        {/* 5. Vitals Section (Reusing PatientVitalsPanel from patientProfile.tsx) */}
        <section className="space-y-2">
          <PatientVitalsPanel patientId={appointment.patient_id} />
        </section>

        {/* 6. MEDICATIONS Instructions Section */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <Pill className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Medications & Instructions</h2>
                <p className="text-xs text-slate-500">
                  Prescribed and protocol chemotherapy medicines recorded for this patient
                </p>
              </div>
            </div>

            {chemoPlan && (
              <button
                type="button"
                onClick={handleDownloadChemoSummary}
                className="flex items-center gap-1.5 text-xs font-semibold text-[#00488D] bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 hover:bg-blue-100 transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                Chemotherapy Summary PDF
              </button>
            )}
          </div>

          {/* Segmented Filter Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-100 bg-slate-50/60 px-4 py-2 text-xs">
            <button
              onClick={() => setMedTab("all")}
              className={`rounded-lg px-3 py-1.5 font-semibold transition-colors ${
                medTab === "all" ? "bg-white text-[#00488D] shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              All Medications ({medCounts.all})
            </button>
            <button
              onClick={() => setMedTab("pre")}
              className={`rounded-lg px-3 py-1.5 font-semibold transition-colors ${
                medTab === "pre" ? "bg-white text-[#00488D] shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Pre-medication ({medCounts.pre})
            </button>
            <button
              onClick={() => setMedTab("chemo")}
              className={`rounded-lg px-3 py-1.5 font-semibold transition-colors ${
                medTab === "chemo" ? "bg-white text-[#00488D] shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Chemotherapy ({medCounts.chemo})
            </button>
            <button
              onClick={() => setMedTab("supportive")}
              className={`rounded-lg px-3 py-1.5 font-semibold transition-colors ${
                medTab === "supportive" ? "bg-white text-[#00488D] shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Supportive ({medCounts.supportive})
            </button>
            <button
              onClick={() => setMedTab("dilutions")}
              className={`rounded-lg px-3 py-1.5 font-semibold transition-colors ${
                medTab === "dilutions" ? "bg-white text-[#00488D] shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Dilutions ({medCounts.dilutions})
            </button>
            <button
              onClick={() => setMedTab("post")}
              className={`rounded-lg px-3 py-1.5 font-semibold transition-colors ${
                medTab === "post" ? "bg-white text-[#00488D] shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Post / Discharge ({medCounts.post})
            </button>
          </div>

          {/* Medications Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3 w-12 text-center">#</th>
                  <th className="px-5 py-3">Medicine Name</th>
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3">Dose / Unit</th>
                  <th className="px-5 py-3">Route / Timing</th>
                  <th className="px-5 py-3">Dilution / Diluent</th>
                  <th className="px-5 py-3">Instructions / Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMeds.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                      No medication records found under this category.
                    </td>
                  </tr>
                ) : (
                  filteredMeds.map((med, index) => (
                    <tr key={med.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-3 text-center text-slate-400 font-mono">{index + 1}</td>
                      <td className="px-5 py-3">
                        <p className="font-bold text-slate-900 text-[13px]">{med.name}</p>
                        {med.genericName && <p className="text-[11px] text-slate-400">{med.genericName}</p>}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            med.role === "PRIMARY"
                              ? "bg-red-50 text-red-700 border border-red-200"
                              : med.role === "PREMEDICATION"
                              ? "bg-blue-50 text-blue-700 border border-blue-200"
                              : med.role === "SUPPORTIVE"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : med.role === "DILUTION"
                              ? "bg-purple-50 text-purple-700 border border-purple-200"
                              : "bg-orange-50 text-orange-700 border border-orange-200"
                          }`}
                        >
                          {med.role === "PRIMARY"
                            ? "Chemo"
                            : med.role === "PREMEDICATION"
                            ? "Pre-Med"
                            : med.role === "SUPPORTIVE"
                            ? "Supportive"
                            : med.role === "DILUTION"
                            ? "Dilution"
                            : "Discharge"}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-semibold text-slate-800">
                        {med.dose || "—"}
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {med.route || med.frequency || med.timing || "—"}
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {med.dilutionVolume || med.diluent ? `${med.dilutionVolume ?? ""} ${med.diluent ?? ""}`.trim() : "—"}
                      </td>
                      <td className="px-5 py-3 text-slate-600 max-w-xs truncate" title={med.instructions || med.duration}>
                        {med.instructions || med.duration || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* 7. Document History & Download Reports Section */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
                <FileText className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Document History & Reports</h2>
                <p className="text-xs text-slate-500">
                  Downloadable clinical prescriptions, summaries, and encounter records
                </p>
              </div>
            </div>

            <span className="text-xs font-semibold text-slate-500">
              {prescriptions.length} Document{prescriptions.length === 1 ? "" : "s"} Available
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3 w-12 text-center">#</th>
                  <th className="px-5 py-3">Document / Prescription</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Doctor</th>
                  <th className="px-5 py-3">Diagnosis / Notes</th>
                  <th className="px-5 py-3">Items</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {prescriptions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                      No prescriptions or medical documents issued for this patient yet.
                    </td>
                  </tr>
                ) : (
                  prescriptions.map((rx, index) => {
                    const rxDoctor = rx.employees
                      ? `Dr. ${[rx.employees.first_name, rx.employees.last_name].filter(Boolean).join(" ")}`
                      : "—";
                    const rxDiag = rx.diagnosis?.diagnosis_name || rx.chief_complaint || "Routine Clinical Visit";
                    const rxItemsCount = (rx.prescription_items || []).length;
                    const rxDate = rx.prescription_date
                      ? new Date(rx.prescription_date).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })
                      : "—";

                    return (
                      <tr key={rx.prescription_id || index} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-5 py-3 text-center text-slate-400 font-mono">{index + 1}</td>
                        <td className="px-5 py-3">
                          <p className="font-bold text-slate-900">Rx #{rx.prescription_id?.slice(-8) ?? index + 1}</p>
                          <span className="text-[10px] uppercase font-bold text-slate-400">Medical Prescription</span>
                        </td>
                        <td className="px-5 py-3 font-medium text-slate-700">{rxDate}</td>
                        <td className="px-5 py-3 text-slate-700 font-medium">{rxDoctor}</td>
                        <td className="px-5 py-3 text-slate-600 max-w-xs truncate" title={rxDiag}>
                          {rxDiag}
                        </td>
                        <td className="px-5 py-3">
                          <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold text-[11px]">
                            {rxItemsCount} Meds
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleViewPrescription(rx)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 font-semibold transition-colors"
                              title="Preview PDF"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              <span>View</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadPrescription(rx)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-[#00488D] bg-[#00488D] text-white hover:bg-[#003870] font-semibold transition-colors"
                              title="Download PDF"
                            >
                              <Download className="h-3.5 w-3.5" />
                              <span>Download</span>
                            </button>
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

      </div>
    </main>
  );
};

export default AppointmentDetails;
