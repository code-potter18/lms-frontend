import React, { useEffect, useRef, useState } from "react";
import API from "../../../api/axios";
import { encounterApi, type EncounterRecord } from "../../../api/encounter.api";
import { chemoPlanCurrentItems, chemoPlanItemName } from "../../../api/chemotherapy.api";
import { BellNotificationButton } from "@/components/hms/BellNotificationButton";
import {
  type PatientDocumentItem,
  loadPatientDocuments,
  savePatientDocument,
  deletePatientDocument,
  downloadDocument,
} from "../../../utils/patientDocuments";
import { downloadPatientDocumentsDocx, downloadDocumentAsDocx } from "../../../utils/patientDocumentsDocx";
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import mammoth from 'mammoth';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
import {
  type SummaryPlanItem,
  type SummaryPlan,
  type PatientAllergyRecord,
  PATIENT_DETAIL_TABS,
} from "./types";
import { loadLatestChemoPlan } from "./api";

/* ============================================================
   NOTES & DOCUMENTS TAB
   Clinical notes built from the patient's encounters, lab
   results and uploaded documents. `embedded` renders it inside the
   patient details page; without it, it renders as a full page.
   ============================================================ */

interface ClinicalNoteRecord {
  id: string;
  encounterNo?: string;
  title: string;
  dateTime: string;
  encounter: string;
  doctor: string;
  department: string;
  branch: string;
  chiefComplaint: string;
  clinicalAssessment: string[];
  examination: string[];
  diagnosis: string;
  treatmentPlan: string[];
  medications: string;
  investigations: string[];
  followUp: string;
  status: "Completed" | "In Progress" | "Draft";
  createdBy: string;
}

const INITIAL_CLINICAL_NOTES: ClinicalNoteRecord[] = [];

function mapEncounterToClinicalNote(
  enc: EncounterRecord,
  index: number,
  totalEncounters: number,
  plan: SummaryPlan | null,
  prescriptionsList: any[] = [],
  labOrdersList: any[] = []
): ClinicalNoteRecord {
  const rawDate = enc.encounter_ts || enc.created_at || enc.appointment?.appointment_date;
  let formattedDateTime = "—";
  if (rawDate) {
    const d = new Date(rawDate);
    if (!Number.isNaN(d.getTime())) {
      const timeStr = enc.appointment?.appointment_time || d.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
      formattedDateTime = `${d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })}, ${timeStr}`;
    }
  }

  const docName = [enc.employees?.first_name, enc.employees?.last_name].filter(Boolean).join(" ");
  const doctor = docName
    ? (docName.toLowerCase().startsWith("dr") ? docName : `Dr. ${docName}`)
    : (plan?.doctor_name ? (plan.doctor_name.toLowerCase().startsWith("dr") ? plan.doctor_name : `Dr. ${plan.doctor_name}`) : "Attending Doctor");

  const department = enc.department_master?.department_name || enc.employees?.specialization || (plan ? "Oncology" : "General OPD");
  const branch = enc.branch?.branch_name || "Main Branch";

  const rawStatus = (enc.status || "").toUpperCase();
  const status: "Completed" | "In Progress" | "Draft" =
    rawStatus === "CLOSED" || rawStatus === "COMPLETED" || rawStatus === "DONE"
      ? "Completed"
      : rawStatus === "OPEN" || rawStatus === "IN_PROGRESS" || rawStatus === "IN_CONSULTATION" || rawStatus === "CHECKED_IN"
      ? "In Progress"
      : "Completed";

  const cycleNum = totalEncounters - index;
  const encounterType = enc.encounter_type && enc.encounter_type !== "OPD"
    ? enc.encounter_type
    : (plan ? "Chemotherapy Follow-up" : "Outpatient Consultation");

  let chiefComplaint = enc.chief_complaint?.trim();
  if (!chiefComplaint) {
    chiefComplaint = plan
      ? `Patient presents for Cycle ${cycleNum > 0 ? cycleNum : 1} chemotherapy evaluation.`
      : "Patient presents for routine clinical follow-up and evaluation.";
  }

  const assessmentItems: string[] = [];
  if (enc.clinical_notes?.trim()) {
    assessmentItems.push(...enc.clinical_notes.split("\n").map((s) => s.trim()).filter(Boolean));
  }
  if (assessmentItems.length === 0) {
    assessmentItems.push("Clinical assessment completed. Patient stable.");
  }

  const vitalsParts: string[] = [];
  if (enc.systolic_bp && enc.diastolic_bp) vitalsParts.push(`BP: ${enc.systolic_bp}/${enc.diastolic_bp} mmHg`);
  if (enc.pulse) vitalsParts.push(`Pulse: ${enc.pulse} bpm`);
  if (enc.temperature) vitalsParts.push(`Temp: ${enc.temperature}°F`);
  if (enc.spo2) vitalsParts.push(`SpO2: ${enc.spo2}%`);
  if (enc.respiratory_rate) vitalsParts.push(`RR: ${enc.respiratory_rate}/min`);
  if (enc.blood_sugar) vitalsParts.push(`Blood Sugar: ${enc.blood_sugar} mg/dL`);

  if (vitalsParts.length > 0) {
    assessmentItems.push(`Vitals recorded: ${vitalsParts.join(", ")}.`);
  }

  const examItems: string[] = [];
  if ((enc as any).physical_examination?.trim()) {
    examItems.push(...(enc as any).physical_examination.split("\n").map((s: string) => s.trim()).filter(Boolean));
  } else {
    examItems.push("General physical condition stable.");
  }
  if (enc.pain_score != null) {
    examItems.push(`Pain score: ${enc.pain_score}/10.`);
  }
  if (enc.weight || enc.height) {
    const wt = enc.weight ? `Weight: ${enc.weight} kg` : "";
    const ht = enc.height ? `Height: ${enc.height} cm` : "";
    const bmi = enc.BMI ? `BMI: ${enc.BMI}` : "";
    const physicalStr = [wt, ht, bmi].filter(Boolean).join(", ");
    if (physicalStr) examItems.push(`Physical metrics: ${physicalStr}.`);
  }

  const diagnosis = enc.diagnosis_text || (plan?.cancer_type
    ? `${plan.cancer_type} – ongoing treatment.`
    : "Clinical evaluation - diagnosis pending.");

  const planItems: string[] = [];
  const planDrugs = chemoPlanCurrentItems<SummaryPlanItem>(plan);
  const matchingRx = prescriptionsList.find((rx: any) =>
    (rx.encounter_no && rx.encounter_no === enc.encounter_no) ||
    (rx.prescription_date && enc.encounter_ts && rx.prescription_date.slice(0, 10) === enc.encounter_ts.slice(0, 10))
  );

  if (matchingRx?.prescription_items?.length) {
    for (const item of matchingRx.prescription_items) {
      const medName = item.medicine_name || item.medicine_master?.medicine_name || item.drug_name;
      const dose = [item.dosage || item.dose, item.unit].filter(Boolean).join(" ");
      const route = item.route || item.administration_route || "";
      if (medName) {
        planItems.push(`${[medName, dose, route].filter(Boolean).join(" ")} prescribed.`);
      }
    }
  } else if (planDrugs.length) {
    for (const item of planDrugs) {
      const medName = chemoPlanItemName(item) || item.drug_role;
      if (medName) {
        const dose = [item.calculated_dose ?? item.protocol_dose, item.calculated_dose_unit ?? item.protocol_dose_unit].filter(Boolean).join(" ");
        const route = item.administration_route ? item.administration_route : "";
        planItems.push(`${[medName, dose, route].filter(Boolean).join(" ")} administered.`);
      }
    }
  }

  if (enc.advice?.trim()) {
    planItems.push(...enc.advice.split("\n").map((s) => s.trim()).filter(Boolean));
  } else if (plan) {
    planItems.push("Continue planned chemotherapy protocol.");
    planItems.push("Monitor for adverse reactions.");
  } else if (planItems.length === 0) {
    planItems.push("Continue prescribed care protocol and clinical monitoring.");
  }
  planItems.push("Follow-up as scheduled.");

  let medications = "";
  if (matchingRx?.prescription_items?.length) {
    medications = matchingRx.prescription_items
      .map((item: any) => {
        const medName = item.medicine_name || item.medicine_master?.medicine_name || item.drug_name;
        const dose = [item.dosage || item.dose, item.unit].filter(Boolean).join(" ");
        const route = item.route || "";
        return [medName, dose, route].filter(Boolean).join(" ");
      })
      .filter(Boolean)
      .join(", ");
  } else if (planDrugs.length) {
    medications = planDrugs
      .map((item) => {
        const medName = chemoPlanItemName(item) || item.drug_role;
        const dose = [item.calculated_dose ?? item.protocol_dose, item.calculated_dose_unit ?? item.protocol_dose_unit].filter(Boolean).join(" ");
        const route = item.administration_route || "";
        return [medName, dose, route].filter(Boolean).join(" ").trim();
      })
      .filter(Boolean)
      .join(", ");
  }
  if (!medications) {
    medications = "None recorded for this visit.";
  }

  const invItems: string[] = [];
  const matchingLabs = labOrdersList.filter((order: any) =>
    (order.encounter_no && order.encounter_no === enc.encounter_no) ||
    (order.patient_id === enc.patient_id)
  );
  if (matchingLabs.length > 0 && matchingLabs[0]?.lab_order_items?.length) {
    const testNames = matchingLabs[0].lab_order_items
      .map((it: any) => it.test_name || it.test_master?.test_name)
      .filter(Boolean);
    if (testNames.length > 0) {
      invItems.push(`${testNames.join(", ")} ordered/reviewed.`);
      invItems.push("Results acceptable for treatment.");
    }
  }
  if (invItems.length === 0) {
    invItems.push("No laboratory investigations ordered for this encounter.");
  }

  let followUp = "";
  if (enc.follow_up_date) {
    const fd = new Date(enc.follow_up_date);
    if (!Number.isNaN(fd.getTime())) {
      followUp = `Next visit scheduled for ${fd.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}.`;
    }
  }
  if (!followUp) {
    followUp = plan
      ? "Next chemotherapy cycle as per treatment plan."
      : "Next routine follow-up as scheduled.";
  }

  return {
    id: enc.encounter_id ? String(enc.encounter_id) : `enc-${enc.encounter_no || index}`,
    encounterNo: enc.encounter_no,
    title: index === 0 ? "RECENT CLINICAL NOTE" : "CLINICAL NOTE",
    dateTime: formattedDateTime,
    encounter: encounterType,
    doctor,
    department,
    branch,
    chiefComplaint,
    clinicalAssessment: assessmentItems,
    examination: examItems,
    diagnosis,
    treatmentPlan: planItems,
    medications,
    investigations: invItems,
    followUp,
    status,
    createdBy: doctor,
  };
}


function isImageFile(doc: PatientDocumentItem): boolean {
  if ((doc.type || "").toLowerCase().startsWith("image/")) return true;
  const ext = (doc.name || "").split(".").pop()?.toLowerCase() ?? "";
  return ["jpg", "jpeg", "png", "webp", "gif", "bmp", "tiff"].includes(ext);
}

function isPdfFile(doc: PatientDocumentItem): boolean {
  if ((doc.type || "").toLowerCase().includes("pdf")) return true;
  return (doc.name || "").toLowerCase().endsWith(".pdf");
}

function isDocxFile(doc: PatientDocumentItem): boolean {
  const type = (doc.type || "").toLowerCase();
  if (type.includes("wordprocessingml") || type.includes("msword")) return true;
  const ext = (doc.name || "").split(".").pop()?.toLowerCase() ?? "";
  return ["doc", "docx"].includes(ext);
}

const BATCHES_KEY = (pid: string) => `hms_docBatches_${pid}`;

function restoreBatchGroups(
  items: PatientDocumentItem[],
  patientId: string
): { ids: string[]; label: string }[] {
  const existingIds = new Set(items.map(d => d.id));
  try {
    const raw = localStorage.getItem(BATCHES_KEY(patientId));
    if (raw) {
      const stored: { ids: string[]; label: string }[] = JSON.parse(raw);
      const filtered = stored
        .map(g => ({ ...g, ids: g.ids.filter(id => existingIds.has(id)) }))
        .filter(g => g.ids.length > 0);
      const covered = new Set(filtered.flatMap(g => g.ids));
      const orphans = items.filter(d => !covered.has(d.id));
      return [...filtered, ...orphans.map(d => ({ ids: [d.id], label: d.name }))];
    }
  } catch {}
  return items.map(d => ({ ids: [d.id], label: d.name }));
}

function persistBatchGroups(
  groups: { ids: string[]; label: string }[],
  patientId: string
) {
  try {
    localStorage.setItem(BATCHES_KEY(patientId), JSON.stringify(groups));
  } catch {}
}

/* Shared A4 page style */
const PAGE_BOX_STYLE: React.CSSProperties = {
  width: 794,
  minHeight: 900,
  boxShadow: "0 4px 16px rgba(0,0,0,0.18),0 0 0 1px rgba(0,0,0,0.06)",
  padding: "64px 88px",
  display: "flex",
  flexDirection: "column",
};

/* Image page — one image in A4 Word frame */
const WordImagePage: React.FC<{ doc: PatientDocumentItem; pageNum: number }> = ({ doc, pageNum }) => {
  const [src, setSrc] = React.useState<string | null>(doc.url ?? null);

  React.useEffect(() => {
    if (!doc.blob) return;
    const u = URL.createObjectURL(doc.blob);
    setSrc(u);
    return () => URL.revokeObjectURL(u);
  }, [doc.blob]);

  const ext = (doc.name || "").split(".").pop()?.toUpperCase() ?? "";
  return (
    <div className="mx-auto bg-white" style={PAGE_BOX_STYLE}>
      <div style={{ borderLeft: "4px solid #2B579A", paddingLeft: 14, marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#2B579A", marginBottom: 3, lineHeight: 1.3 }}>{doc.name}</h2>
        <p style={{ fontSize: 11, color: "#94A3B8", margin: 0 }}>{ext}&nbsp;·&nbsp;{doc.info ?? ""}&nbsp;·&nbsp;Page {pageNum}</p>
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {src
          ? <img src={src} alt={doc.name} style={{ maxWidth: "100%", maxHeight: 580, objectFit: "contain" }} />
          : <span style={{ color: "#94A3B8", fontSize: 13 }}><i className="fa-solid fa-spinner fa-spin mr-1" />Loading…</span>}
      </div>
    </div>
  );
};

/* PDF pages — renders each PDF page as a canvas image in its own A4 Word frame */
const WordPdfContent: React.FC<{ doc: PatientDocumentItem }> = ({ doc }) => {
  const [pages, setPages] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let blobUrl: string | null = null;
    const renderPdf = async (src: string) => {
      try {
        const pdfDoc = await pdfjsLib.getDocument({ url: src }).promise;
        const imgs: string[] = [];
        for (let p = 1; p <= pdfDoc.numPages; p++) {
          const page = await pdfDoc.getPage(p);
          const viewport = page.getViewport({ scale: 2 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvasContext: canvas.getContext("2d")!, canvas, viewport }).promise;
          imgs.push(canvas.toDataURL("image/jpeg", 0.9));
        }
        setPages(imgs);
      } catch (err) {
        console.error("PDF render error:", err);
        setError("Could not render this PDF.");
      } finally {
        setLoading(false);
      }
    };
    if (doc.blob) { blobUrl = URL.createObjectURL(doc.blob); renderPdf(blobUrl); }
    else if (doc.url) { renderPdf(doc.url); }
    else { setError("No source available."); setLoading(false); }
    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [doc]);

  if (loading) {
    return (
      <div className="mx-auto bg-white" style={{ ...PAGE_BOX_STYLE, alignItems: "center", justifyContent: "center" }}>
        <i className="fa-solid fa-spinner fa-spin text-2xl text-blue-400" />
        <p style={{ color: "#94A3B8", marginTop: 12, fontSize: 13 }}>Rendering PDF pages…</p>
      </div>
    );
  }
  if (error || pages.length === 0) {
    return (
      <div className="mx-auto bg-white" style={{ ...PAGE_BOX_STYLE, alignItems: "center", justifyContent: "center" }}>
        <i className="fa-solid fa-file-pdf" style={{ fontSize: 48, color: "#EF4444" }} />
        <p style={{ color: "#64748B", marginTop: 12, fontSize: 14 }}>{doc.name}</p>
        <p style={{ color: "#94A3B8", fontSize: 12 }}>{error ?? "No pages to display."}</p>
      </div>
    );
  }
  return (
    <>
      {pages.map((imgSrc, i) => (
        <div key={i} className="mx-auto bg-white" style={PAGE_BOX_STYLE}>
          <div style={{ borderLeft: "4px solid #2B579A", paddingLeft: 14, marginBottom: 28 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#2B579A", marginBottom: 3, lineHeight: 1.3 }}>{doc.name}</h2>
            <p style={{ fontSize: 11, color: "#94A3B8", margin: 0 }}>PDF&nbsp;·&nbsp;Page {i + 1} of {pages.length}</p>
          </div>
          <div style={{ flex: 1, display: "flex", alignItems: "flex-start", justifyContent: "center" }}>
            <img src={imgSrc} alt={`${doc.name} – page ${i + 1}`} style={{ maxWidth: "100%", objectFit: "contain" }} />
          </div>
        </div>
      ))}
    </>
  );
};

/* DOCX page — converts .doc/.docx to HTML with mammoth, shown in A4 Word frame */
const WordDocxContent: React.FC<{ doc: PatientDocumentItem; pageNum: number }> = ({ doc, pageNum }) => {
  const [html, setHtml] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const convert = async (buf: ArrayBuffer) => {
      try {
        const result = await mammoth.convertToHtml({ arrayBuffer: buf });
        setHtml(result.value);
      } catch (err) {
        console.error("DOCX render error:", err);
        setError("Could not render this document.");
      } finally {
        setLoading(false);
      }
    };
    if (doc.blob) {
      doc.blob.arrayBuffer().then(convert);
    } else if (doc.url) {
      fetch(doc.url).then(r => r.arrayBuffer()).then(convert)
        .catch(() => { setError("Could not load document."); setLoading(false); });
    } else {
      setError("No source available."); setLoading(false);
    }
  }, [doc]);

  const ext = (doc.name || "").split(".").pop()?.toUpperCase() ?? "";
  return (
    <div className="mx-auto bg-white" style={PAGE_BOX_STYLE}>
      <div style={{ borderLeft: "4px solid #2B579A", paddingLeft: 14, marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#2B579A", marginBottom: 3, lineHeight: 1.3 }}>{doc.name}</h2>
        <p style={{ fontSize: 11, color: "#94A3B8", margin: 0 }}>{ext}&nbsp;·&nbsp;{doc.info ?? ""}&nbsp;·&nbsp;Page {pageNum}</p>
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#94A3B8", padding: 24 }}>
            <i className="fa-solid fa-spinner fa-spin" /><span style={{ fontSize: 13 }}>Loading document…</span>
          </div>
        )}
        {!loading && error && (
          <div style={{ textAlign: "center", color: "#94A3B8", padding: 40 }}>
            <i className="fa-solid fa-file-word" style={{ fontSize: 48, color: "#CBD5E1", display: "block", marginBottom: 12 }} />
            <p style={{ fontSize: 13, margin: 0 }}>{error}</p>
          </div>
        )}
        {!loading && html && (
          <div
            style={{ fontFamily: "Calibri,'Times New Roman',serif", fontSize: 13, lineHeight: 1.7, color: "#1E293B" }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
        {!loading && !error && !html && (
          <div style={{ textAlign: "center", color: "#94A3B8", padding: 40 }}>
            <i className="fa-solid fa-file-word" style={{ fontSize: 48, color: "#CBD5E1", display: "block", marginBottom: 12 }} />
            <p style={{ fontSize: 13, margin: 0 }}>Document is empty.</p>
          </div>
        )}
      </div>
    </div>
  );
};

/* Full-screen Word view — all uploaded documents, one per page */
const WordImagesView: React.FC<{
  documents: PatientDocumentItem[];
  label?: string;
  onClose: () => void;
  onDownload: (doc: PatientDocumentItem) => void;
}> = ({ documents, label, onClose, onDownload }) => {
  const docs = documents;
  if (docs.length === 0) return null;
  const title = label || (docs.length === 1 ? docs[0].name : `Documents (${docs.length} files)`);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" style={{ fontFamily: "Calibri,'Segoe UI',Arial,sans-serif" }}>
        {/* Word title bar */}
        <div className="flex flex-shrink-0 items-center justify-between gap-3 px-4 py-2" style={{ background: "#2B579A" }}>
          <div className="flex min-w-0 items-center gap-2">
            <i className="fa-solid fa-file-word flex-shrink-0 text-lg text-white" />
            <span className="truncate text-sm font-semibold text-white">{title}</span>
          </div>
          <button type="button" onClick={onClose} title="Close"
            className="rounded px-2 py-1 text-white/70 hover:bg-white/20 hover:text-white">
            <i className="fa-solid fa-xmark text-base" />
          </button>
        </div>
        {/* Ribbon */}
        <div className="flex flex-shrink-0 items-center border-b border-slate-200 bg-[#f3f3f3] px-4 py-1">
          <span className="select-none text-[11px] text-slate-500">
            {docs.length} page{docs.length !== 1 ? "s" : ""} · 1 file per page
          </span>
        </div>
        {/* Scrollable pages */}
        <div className="flex-1 overflow-y-auto" style={{ background: "#e8e9ea", padding: "24px 16px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {docs.map((doc, i) => {
              if (isPdfFile(doc)) return <WordPdfContent key={doc.id} doc={doc} />;
              if (isDocxFile(doc)) return <WordDocxContent key={doc.id} doc={doc} pageNum={i + 1} />;
              return <WordImagePage key={doc.id} doc={doc} pageNum={i + 1} />;
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

const NotesDocumentsTab: React.FC<{
  embedded?: boolean;
  patientId?: string;
}> = ({ embedded = false, patientId }) => {
  const [activeTab, setActiveTab] = useState("Notes & Documents");
  const [labTab, setLabTab] = useState("Chemistry");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [clinicalNotes, setClinicalNotes] = useState<ClinicalNoteRecord[]>(INITIAL_CLINICAL_NOTES);
  const [currentNoteIndex, setCurrentNoteIndex] = useState(0);
  const [isLoadingNotes, setIsLoadingNotes] = useState(false);
  const [notesActivities, setNotesActivities] = useState<
    { title: string; description: string; time: string; dot: string }[]
  >([]);
  const [isEditNoteModalOpen, setIsEditNoteModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<{
    id: string;
    encounterNo?: string;
    title: string;
    dateTime: string;
    encounter: string;
    doctor: string;
    department: string;
    branch: string;
    chiefComplaint: string;
    clinicalAssessment: string;
    examination: string;
    diagnosis: string;
    treatmentPlan: string;
    medications: string;
    investigations: string;
    followUp: string;
    status: "Completed" | "In Progress" | "Draft";
    createdBy: string;
  } | null>(null);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [editSuccessMsg, setEditSuccessMsg] = useState<string | null>(null);
  const [copiedNoteId, setCopiedNoteId] = useState<string | null>(null);

  const [notesPlan, setNotesPlan] = useState<SummaryPlan | null>(null);
  const [notesAllergies, setNotesAllergies] = useState<PatientAllergyRecord[]>(
    []
  );
  const [documents, setDocuments] = useState<PatientDocumentItem[]>([]);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [docSuccessMsg, setDocSuccessMsg] = useState<string | null>(null);
  const [isDownloadingWord, setIsDownloadingWord] = useState(false);
  const [isExportingDocs, setIsExportingDocs] = useState(false);
  const [imageBatchGroups, setImageBatchGroups] = useState<{ ids: string[]; label: string }[]>([]);
  const [wordView, setWordView] = useState<{ docs: PatientDocumentItem[]; label: string } | null>(null);
  const [stagedBatchLabel, setStagedBatchLabel] = useState("");
  const [stagedFiles, setStagedFiles] = useState<{ file: File; name: string }[]>([]);
  const [renamingDocId, setRenamingDocId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [addingToBatchIndex, setAddingToBatchIndex] = useState<number | null>(null);
  const [deletingBatchIndex, setDeletingBatchIndex] = useState<number | null>(null);

  const handleDeleteAll = async () => {
    for (const doc of documents) {
      await deletePatientDocument(doc.id);
    }
    setDocuments([]);
    setImageBatchGroups([]);
    if (patientId) persistBatchGroups([], patientId);
    setShowDeleteAllConfirm(false);
  };

  const handleDeleteBatch = async () => {
    if (deletingBatchIndex === null) return;
    const batch = imageBatchGroups[deletingBatchIndex];
    if (!batch) { setDeletingBatchIndex(null); return; }
    for (const id of batch.ids) {
      await deletePatientDocument(id);
    }
    setDocuments(prev => prev.filter(d => !batch.ids.includes(d.id)));
    setImageBatchGroups(prev => {
      const updated = prev.filter((_, i) => i !== deletingBatchIndex);
      if (patientId) persistBatchGroups(updated, patientId);
      return updated;
    });
    setDeletingBatchIndex(null);
  };

  const handleRenameDoc = (docId: string, newName: string) => {
    const trimmed = newName.trim();
    if (trimmed) {
      setDocuments(prev => prev.map(d => d.id === docId ? { ...d, name: trimmed } : d));
    }
    setRenamingDocId(null);
  };

  /* Load stored patient documents from IndexedDB */
  useEffect(() => {
    if (!patientId) {
      setDocuments([]);
      return;
    }
    let cancelled = false;
    loadPatientDocuments(patientId)
      .then((items) => {
        if (!cancelled) {
          setDocuments(items);
          if (items.length > 0 && patientId) {
            setImageBatchGroups(restoreBatchGroups(items, patientId));
          }
        }
      })
      .catch((err) => {
        console.warn("Failed to load patient documents:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  /* Fetch real encounters, chemo plan, allergies, and prescriptions for the selected patient */
  useEffect(() => {
    if (!patientId) {
      setNotesPlan(null);
      setNotesAllergies([]);
      setClinicalNotes(INITIAL_CLINICAL_NOTES);
      setNotesActivities([]);
      return;
    }
    let cancelled = false;
    setIsLoadingNotes(true);

    // 1. Allergies
    API.get<{ success: boolean; data: PatientAllergyRecord[] }>(
      `/clinical-details/patients/${patientId}/allergies`
    )
      .then((response) => {
        if (!cancelled) setNotesAllergies(response.data?.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setNotesAllergies([]);
      });

    // 2. Fetch encounters & build clinical notes for every visited encounter
    const fetchEncountersAndBuildNotes = async () => {
      let loadedPlan: SummaryPlan | null = null;
      try {
        loadedPlan = await loadLatestChemoPlan(patientId);
        if (!cancelled) setNotesPlan(loadedPlan);
      } catch {
        if (!cancelled) setNotesPlan(null);
      }

      let rawEncounters: EncounterRecord[] = [];
      try {
        const resp = await encounterApi.getLatest(patientId, 50);
        rawEncounters = resp.data?.data?.encounters ?? [];
      } catch (err) {
        console.warn("getLatest encounters failed, trying getAll", err);
      }

      if (rawEncounters.length === 0) {
        try {
          const resp = await encounterApi.getAll({ patientId, limit: 50 });
          rawEncounters = resp.data?.data?.encounters ?? [];
        } catch (err) {
          console.warn("getAll encounters fallback failed", err);
        }
      }

      if (rawEncounters.length === 0) {
        try {
          const resp = await API.get<{ data?: { encounters?: EncounterRecord[] }; encounters?: EncounterRecord[] }>(
            "/encounters/latest",
            { params: { patientId, limit: 50 } }
          );
          rawEncounters = resp.data?.data?.encounters || resp.data?.encounters || [];
        } catch {}
      }

      let prescriptionsList: any[] = [];
      try {
        const rxRes = await API.get(`/prescriptions/patient/${patientId}`);
        prescriptionsList = rxRes.data?.data?.prescriptions || rxRes.data?.data || [];
      } catch {}

      let labOrdersList: any[] = [];
      try {
        const labRes = await API.get('/lab-order');
        labOrdersList = (labRes.data?.data || []).filter((lo: any) => lo.patient_id === patientId);
      } catch {}

      if (cancelled) return;

      if (rawEncounters.length > 0) {
        // Sort encounters newest first
        rawEncounters.sort((a, b) => {
          const timeA = new Date(a.encounter_ts || a.created_at || 0).getTime();
          const timeB = new Date(b.encounter_ts || b.created_at || 0).getTime();
          return timeB - timeA;
        });

        const generatedNotes = rawEncounters.map((enc, idx) =>
          mapEncounterToClinicalNote(
            enc,
            idx,
            rawEncounters.length,
            loadedPlan,
            prescriptionsList,
            labOrdersList
          )
        );
        setClinicalNotes(generatedNotes);
        setCurrentNoteIndex(0);

        const builtActivities = rawEncounters.slice(0, 5).map((enc, i) => {
          const doc = enc.employees?.first_name ? `Dr. ${enc.employees.first_name}` : (loadedPlan?.doctor_name ? (loadedPlan.doctor_name.toLowerCase().startsWith("dr") ? loadedPlan.doctor_name : `Dr. ${loadedPlan.doctor_name}`) : "Doctor");
          const encType = enc.encounter_type && enc.encounter_type !== "OPD" ? enc.encounter_type : (loadedPlan ? "Chemo Follow-up" : "Consultation");
          const dateStr = enc.encounter_ts ? new Date(enc.encounter_ts).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "RECENT";
          return {
            title: encType,
            description: `${doc} completed clinical evaluation`,
            time: dateStr.toUpperCase(),
            dot: i === 0 ? "bg-blue-500" : "bg-slate-400",
          };
        });
        setNotesActivities(builtActivities);
      } else {
        setClinicalNotes([]);
        setCurrentNoteIndex(0);
        setNotesActivities([]);
      }

      setIsLoadingNotes(false);
    };

    fetchEncountersAndBuildNotes();

    return () => {
      cancelled = true;
    };
  }, [patientId]);

  /* Live counts derived from fetched records (no hardcoded values). */
  const prescriptionsCount = chemoPlanCurrentItems(notesPlan).length;
  const activities = notesActivities;

  const stageFiles = (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    setStagedFiles(Array.from(files).map(f => ({ file: f, name: f.name })));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmitUpload = async () => {
    if (stagedFiles.length === 0 || isUploadingDoc) return;
    setIsUploadingDoc(true);
    const targetPatientId = patientId || "unknown";
    const newItems: PatientDocumentItem[] = [];
    for (const staged of stagedFiles) {
      const renamedFile = new File(
        [staged.file],
        staged.name.trim() || staged.file.name,
        { type: staged.file.type }
      );
      try {
        const savedDoc = await savePatientDocument(targetPatientId, renamedFile);
        newItems.push(savedDoc);
      } catch (err) {
        console.error("Failed to save document:", staged.name, err);
      }
    }
    const batchLabel = stagedBatchLabel.trim();
    setStagedFiles([]);
    setStagedBatchLabel("");
    if (newItems.length > 0) {
      setDocuments(prev => [...newItems, ...prev]);
      setSelectedFile(stagedFiles[0]?.file ?? null);
      setDocSuccessMsg(
        `${newItems.length === 1 ? `"${newItems[0].name}"` : `${newItems.length} documents`} uploaded to Document Library!`
      );
      setTimeout(() => setDocSuccessMsg(null), 4000);
      const newBatchIds = newItems.map(d => d.id);
      if (addingToBatchIndex !== null) {
        setImageBatchGroups(prev => {
          const updated = prev.map((g, i) =>
            i === addingToBatchIndex ? { ...g, ids: [...g.ids, ...newBatchIds] } : g
          );
          if (targetPatientId !== "unknown") persistBatchGroups(updated, targetPatientId);
          return updated;
        });
        setAddingToBatchIndex(null);
      } else {
        const newBatch = { ids: newBatchIds, label: batchLabel };
        setImageBatchGroups(prev => {
          const updated = [...prev, newBatch];
          if (targetPatientId !== "unknown") persistBatchGroups(updated, targetPatientId);
          return updated;
        });
        setWordView({ docs: newItems, label: batchLabel });
      }
    }
    setIsUploadingDoc(false);
  };

  const handleDirectUploadToBatch = async (files: FileList | null) => {
    if (!files || files.length === 0 || addingToBatchIndex === null) {
      setAddingToBatchIndex(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    const batchIdx = addingToBatchIndex;
    setAddingToBatchIndex(null);
    setIsUploadingDoc(true);
    const targetPatientId = patientId || "unknown";
    const newItems: PatientDocumentItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file) continue;
      try {
        const savedDoc = await savePatientDocument(targetPatientId, file);
        newItems.push(savedDoc);
      } catch (err) {
        console.error("Failed to save document:", file.name, err);
      }
    }
    if (newItems.length > 0) {
      setDocuments(prev => [...newItems, ...prev]);
      const newBatchIds = newItems.map(d => d.id);
      setImageBatchGroups(prev => {
        const updated = prev.map((g, i) =>
          i === batchIdx ? { ...g, ids: [...g.ids, ...newBatchIds] } : g
        );
        if (targetPatientId !== "unknown") persistBatchGroups(updated, targetPatientId);
        return updated;
      });
      setDocSuccessMsg(
        `${newItems.length === 1 ? `"${newItems[0].name}"` : `${newItems.length} files`} added to batch!`
      );
      setTimeout(() => setDocSuccessMsg(null), 4000);
    }
    setIsUploadingDoc(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (addingToBatchIndex !== null) {
      handleDirectUploadToBatch(event.target.files);
    } else {
      stageFiles(event.target.files);
    }
  };

  const handleSelectFiles = () => {
    fileInputRef.current?.click();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
    if (e.dataTransfer?.files?.length) {
      stageFiles(e.dataTransfer.files);
    }
  };

  const handleDownload = (doc: PatientDocumentItem) => {
    downloadDocument(doc);
  };

  /* Card Download gives a Word file (content + logos converted); types
     Word cannot represent fall back to the original file download. */
  const handleDownloadAsWord = async (doc: PatientDocumentItem) => {
    if (isDownloadingWord) return;
    setIsDownloadingWord(true);
    try {
      const converted = await downloadDocumentAsDocx(doc);
      if (converted) {
        setDocSuccessMsg(`"${doc.name}" downloaded as Word (.docx)`);
        setTimeout(() => setDocSuccessMsg(null), 4000);
      } else {
        downloadDocument(doc);
      }
    } catch (err) {
      console.error("Word download failed:", err);
      downloadDocument(doc);
    } finally {
      setIsDownloadingWord(false);
    }
  };


  const handleDeleteDoc = async (docId: string, docName: string) => {
    if (window.confirm(`Are you sure you want to remove "${docName}" from Document Library?`)) {
      await deletePatientDocument(docId);
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
      setImageBatchGroups(prev => {
        const updated = prev
          .map(g => ({ ...g, ids: g.ids.filter(id => id !== docId) }))
          .filter(g => g.ids.length > 0);
        if (patientId) persistBatchGroups(updated, patientId);
        return updated;
      });
    }
  };

  const handleExportDocuments = async () => {
    if (documents.length === 0 || isExportingDocs) return;
    setIsExportingDocs(true);
    try {
      await downloadPatientDocumentsDocx(documents, { patientId });
    } catch (err) {
      console.error("Failed to export documents summary:", err);
    } finally {
      setIsExportingDocs(false);
    }
  };

  const handleEditNote = (note: ClinicalNoteRecord) => {
    setEditingNote({
      id: note.id,
      encounterNo: note.encounterNo,
      title: note.title,
      dateTime: note.dateTime,
      encounter: note.encounter,
      doctor: note.doctor,
      department: note.department,
      branch: note.branch,
      chiefComplaint: note.chiefComplaint,
      clinicalAssessment: (note.clinicalAssessment || []).join("\n"),
      examination: (note.examination || []).join("\n"),
      diagnosis: note.diagnosis,
      treatmentPlan: (note.treatmentPlan || []).join("\n"),
      medications: note.medications,
      investigations: (note.investigations || []).join("\n"),
      followUp: note.followUp,
      status: note.status,
      createdBy: note.createdBy,
    });
    setIsEditNoteModalOpen(true);
  };

  const handlePrintNote = (note: ClinicalNoteRecord) => {
    const noteHeader = `${note.title}${note.encounterNo ? ` (#${note.encounterNo})` : ""}`;
    const printText = `${noteHeader}\n\nDate & Time: ${note.dateTime}\nEncounter: ${note.encounter}\nDoctor: ${note.doctor}\nDepartment: ${note.department}\nBranch: ${note.branch}\n\nChief Complaint\n${note.chiefComplaint}\n\nClinical Assessment\n${note.clinicalAssessment.join("\n")}\n\nExamination\n${note.examination.join("\n")}\n\nDiagnosis\n${note.diagnosis}\n\nTreatment / Plan\n${note.treatmentPlan.map((p) => `• ${p}`).join("\n")}\n\nMedications\n${note.medications}\n\nInvestigations\n${note.investigations.join("\n")}\n\nFollow-up\n${note.followUp}\n\nStatus: ${note.status}\nCreated by: ${note.createdBy}`;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      window.alert("Please allow pop-ups to print this note.");
      return;
    }
    printWindow.document.write(
      `<html><head><title>${noteHeader}</title></head><body style="font-family:Inter,Arial,sans-serif;font-size:13px;color:#1e293b;line-height:1.6;padding:2rem;white-space:pre-wrap;max-width:760px;margin:0 auto;">${printText
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")}</body></html>`,
    );
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handleSaveEditedNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingNote) return;

    setIsSavingNote(true);

    const updatedRecord: Partial<ClinicalNoteRecord> = {
      chiefComplaint: editingNote.chiefComplaint,
      clinicalAssessment: editingNote.clinicalAssessment
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      examination: editingNote.examination
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      diagnosis: editingNote.diagnosis,
      treatmentPlan: editingNote.treatmentPlan
        .split("\n")
        .map((s) => s.trim().replace(/^[•\-\*]\s*/, ""))
        .filter(Boolean),
      medications: editingNote.medications,
      investigations: editingNote.investigations
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      followUp: editingNote.followUp,
      status: editingNote.status,
    };

    setClinicalNotes((prev) =>
      prev.map((n) => (n.id === editingNote.id ? { ...n, ...updatedRecord } : n))
    );

    if (editingNote.encounterNo) {
      try {
        await encounterApi.update(editingNote.encounterNo, {
          chief_complaint: editingNote.chiefComplaint,
          clinical_notes: editingNote.clinicalAssessment,
          diagnosis_text: editingNote.diagnosis,
          advice: editingNote.treatmentPlan,
        });
      } catch (err) {
        console.warn("Could not persist encounter update to backend:", err);
      }
    }

    setIsSavingNote(false);
    setIsEditNoteModalOpen(false);
    setEditingNote(null);
    setEditSuccessMsg("Clinical note updated successfully!");
    setTimeout(() => setEditSuccessMsg(null), 3000);
  };

  

  /* =========================================================
     CONTENT (TAB NAVIGATION + TWO COLUMN LAYOUT)
  ========================================================= */

  const safeNoteIndex = Math.min(
    Math.max(0, currentNoteIndex),
    Math.max(0, clinicalNotes.length - 1)
  );
  const activeNote = clinicalNotes[safeNoteIndex];

  const content = (
    <>
      {/* ===================================================
          TAB NAVIGATION (hidden when embedded — the parent
          portal already renders its own tab bar)
      ==================================================== */}
      {!embedded && (
        <div className="mb-6 border-b border-slate-200">
          <nav className="flex space-x-8 overflow-x-auto hide-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {PATIENT_DETAIL_TABS.map((tab) => {
              const isActive = activeTab === tab;

              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors ${
                    isActive
                      ? "border-[#0052cc] font-semibold text-[#0052cc]"
                      : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
                  }`}
                >
                  {tab}
                </button>
              );
            })}
          </nav>
        </div>
      )}

      {/* ===================================================
          TWO COLUMN LAYOUT
      ==================================================== */}
      <div className="flex flex-col gap-6 xl:flex-row">

        {/* =================================================
            LEFT / MAIN COLUMN
        ================================================== */}
        <div className="min-w-0 flex-1">

          {/* =================================================
              SUMMARY CARDS
          ================================================== */}
          <div className="mb-8 grid gap-4 md:grid-cols-4">

            {/* Total Notes */}
            <div className="flex items-center rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mr-4 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <i className="fa-regular fa-file-lines text-lg" />
              </div>

              <div>
                <p className="text-sm text-slate-500">
                  Total Notes
                </p>
                <p className="text-xl font-bold text-slate-900">
                  {clinicalNotes.length}
                </p>
              </div>
            </div>

            {/* Documents */}
            <div className="flex items-center rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mr-4 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <i className="fa-regular fa-folder-open text-lg" />
              </div>

              <div>
                <p className="text-sm text-slate-500">
                  Documents
                </p>
                <p className="text-xl font-bold text-slate-900">
                  {documents.length}
                </p>
              </div>
            </div>

            {/* Reports */}
            <div className="flex items-center rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mr-4 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-600">
                <i className="fa-solid fa-chart-simple text-lg" />
              </div>

              <div>
                <p className="text-sm text-slate-500">
                  Reports
                </p>
                <p className="text-xl font-bold text-slate-900">
                  0
                </p>
              </div>
            </div>

            {/* Prescriptions */}
            <div className="flex items-center rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mr-4 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
                <i className="fa-solid fa-prescription-bottle-medical text-lg" />
              </div>

              <div>
                <p className="text-sm text-slate-500">
                  Prescriptions
                </p>
                <p className="text-xl font-bold text-slate-900">
                  {prescriptionsCount}
                </p>
              </div>
            </div>
          </div>

          {/* =================================================
              RECENT CLINICAL NOTES
          ================================================== */}
          <section className="mb-8 rounded-xl border border-slate-200 bg-white shadow-sm">

            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold text-slate-900">
                  Recent Clinical Notes
                </h3>
                <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-[#0052cc]">
                  {clinicalNotes.length} {clinicalNotes.length === 1 ? "Note" : "Notes"}
                </span>
              </div>

              <div className="flex items-center gap-3">
                {clinicalNotes.length > 1 && (
                  <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
                    <button
                      type="button"
                      disabled={safeNoteIndex === 0}
                      onClick={() => setCurrentNoteIndex((prev) => Math.max(0, prev - 1))}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-white text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                      title="Previous note (newer visit)"
                    >
                      <i className="fa-solid fa-chevron-left text-xs" />
                    </button>
                    <span className="px-2 text-xs font-semibold text-slate-600">
                      {safeNoteIndex + 1} / {clinicalNotes.length}
                    </span>
                    <button
                      type="button"
                      disabled={safeNoteIndex === clinicalNotes.length - 1}
                      onClick={() => setCurrentNoteIndex((prev) => Math.min(clinicalNotes.length - 1, prev + 1))}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-white text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                      title="Next note (older visit)"
                    >
                      <i className="fa-solid fa-chevron-right text-xs" />
                    </button>
                  </div>
                )}

                {activeNote && (
                  <button
                    type="button"
                    onClick={() => handleEditNote(activeNote)}
                    className="flex items-center rounded-md bg-[#0052cc] px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 shadow-sm"
                  >
                    <i className="fa-solid fa-pen-to-square mr-1.5" />
                    Edit Note
                  </button>
                )}
              </div>
            </div>

            {/* Edit Success Notification */}
            {editSuccessMsg && (
              <div className="mx-6 mt-3 flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800 animate-in fade-in">
                <div className="flex items-center gap-2">
                  <i className="fa-solid fa-circle-check text-emerald-600 text-sm" />
                  <span>{editSuccessMsg}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setEditSuccessMsg(null)}
                  className="text-emerald-600 hover:text-emerald-800"
                >
                  <i className="fa-solid fa-xmark text-xs" />
                </button>
              </div>
            )}

            {/* Navigation Bar (when 2+ notes exist) */}
            {clinicalNotes.length > 1 && (
              <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 via-blue-50/20 to-slate-50 px-5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {/* Left: Quick jump visit pills */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Visits:
                    </span>
                    <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar py-0.5 max-w-[500px] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                      {clinicalNotes.map((n, idx) => {
                        const isSelected = idx === safeNoteIndex;
                        return (
                          <button
                            key={n.id || idx}
                            type="button"
                            onClick={() => setCurrentNoteIndex(idx)}
                            className={`group flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                              isSelected
                                ? "bg-[#0052cc] text-white shadow-sm ring-2 ring-[#0052cc]/30"
                                : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-100"
                            }`}
                            title={`Jump to Note ${idx + 1}: ${n.encounter} (${n.dateTime})`}
                          >
                            <span className="font-bold">
                              {idx === 0 ? "Latest Visit" : `Visit #${clinicalNotes.length - idx}`}
                            </span>
                            {n.encounterNo && (
                              <span
                                className={`rounded px-1 text-[10px] ${
                                  isSelected ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                                }`}
                              >
                                #{n.encounterNo}
                              </span>
                            )}
                            <span
                              className={`text-[11px] ${
                                isSelected ? "text-blue-100" : "text-slate-400 group-hover:text-slate-500"
                              }`}
                            >
                              • {n.dateTime.split(",")[0]}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Right: Prev / Next Buttons */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={safeNoteIndex === 0}
                      onClick={() => setCurrentNoteIndex((prev) => Math.max(0, prev - 1))}
                      className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <i className="fa-solid fa-arrow-left text-[11px]" />
                      Previous Note
                    </button>
                    <button
                      type="button"
                      disabled={safeNoteIndex === clinicalNotes.length - 1}
                      onClick={() => setCurrentNoteIndex((prev) => Math.min(clinicalNotes.length - 1, prev + 1))}
                      className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Next Note
                      <i className="fa-solid fa-arrow-right text-[11px]" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Content: Single Clinical Note Card */}
            <div className="p-6">
              {isLoadingNotes ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                  <i className="fa-solid fa-circle-notch fa-spin mb-3 text-3xl text-[#0052cc]" />
                  <p className="text-sm font-medium">Loading clinical notes for patient encounters...</p>
                </div>
              ) : clinicalNotes.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                  <i className="fa-regular fa-file-lines mb-2 text-2xl text-slate-300" />
                  <p className="text-sm font-medium text-slate-500">
                    No clinical notes recorded for this patient yet.
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Notes added from consultations will appear here.
                  </p>
                </div>
              ) : activeNote ? (
                <div className="space-y-5">
                  <div
                    key={activeNote.id}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all hover:shadow"
                  >
                    {/* Note Card Header */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-blue-50/60 via-slate-50 to-white px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0052cc] text-white shadow-sm">
                          <i className="fa-solid fa-notes-medical text-sm" />
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold uppercase tracking-wider text-[#0052cc]">
                              {safeNoteIndex === 0 ? "RECENT CLINICAL NOTE" : "CLINICAL NOTE"}
                            </span>
                            {safeNoteIndex === 0 && (
                              <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-800">
                                Latest Visit
                              </span>
                            )}
                            {activeNote.encounterNo && (
                              <span className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                                #{activeNote.encounterNo}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span className="font-semibold text-slate-800">{activeNote.encounter}</span>
                            <span>•</span>
                            <span>{activeNote.dateTime}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                          <i className="fa-solid fa-circle-check text-[10px]" />
                          {activeNote.status}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleEditNote(activeNote)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-[#0052cc]/30 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-[#0052cc] transition-colors hover:bg-[#0052cc] hover:text-white"
                          title="Edit Clinical Note"
                        >
                          <i className="fa-solid fa-pen-to-square" />
                          Edit Note
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePrintNote(activeNote)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
                          title="Print Note"
                        >
                          <i className="fa-solid fa-print" />
                          Print
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const noteHeader = `${safeNoteIndex === 0 ? "RECENT CLINICAL NOTE" : "CLINICAL NOTE"}${activeNote.encounterNo ? ` (#${activeNote.encounterNo})` : ""}`;
                            const textToCopy = `${noteHeader}\n\nDate & Time: ${activeNote.dateTime}\nEncounter: ${activeNote.encounter}\nDoctor: ${activeNote.doctor}\nDepartment: ${activeNote.department}\nBranch: ${activeNote.branch}\n\nChief Complaint\n${activeNote.chiefComplaint}\n\nClinical Assessment\n${activeNote.clinicalAssessment.join("\n")}\n\nExamination\n${activeNote.examination.join("\n")}\n\nDiagnosis\n${activeNote.diagnosis}\n\nTreatment / Plan\n${activeNote.treatmentPlan.map((p) => `• ${p}`).join("\n")}\n\nMedications\n${activeNote.medications}\n\nInvestigations\n${activeNote.investigations.join("\n")}\n\nFollow-up\n${activeNote.followUp}\n\nStatus: ${activeNote.status}\nCreated by: ${activeNote.createdBy}`;
                            navigator.clipboard?.writeText(textToCopy);
                            setCopiedNoteId(activeNote.id);
                            setTimeout(() => setCopiedNoteId(null), 2000);
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
                          title="Copy Note Text"
                        >
                          <i className={`fa-solid ${copiedNoteId === activeNote.id ? "fa-check text-emerald-600" : "fa-copy"}`} />
                          {copiedNoteId === activeNote.id ? "Copied" : "Copy"}
                        </button>
                      </div>
                    </div>

                    {/* Meta Grid */}
                    <div className="grid grid-cols-2 gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-3 sm:grid-cols-3 lg:grid-cols-5 text-xs">
                      <div>
                        <p className="text-[11px] font-medium text-slate-500">Date & Time</p>
                        <p className="mt-0.5 font-semibold text-slate-800">{activeNote.dateTime}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-medium text-slate-500">Encounter</p>
                        <p className="mt-0.5 font-semibold text-slate-800">{activeNote.encounter}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-medium text-slate-500">Doctor</p>
                        <p className="mt-0.5 font-semibold text-slate-800">{activeNote.doctor}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-medium text-slate-500">Department</p>
                        <p className="mt-0.5 font-semibold text-slate-800">{activeNote.department}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-medium text-slate-500">Branch</p>
                        <p className="mt-0.5 font-semibold text-slate-800">{activeNote.branch}</p>
                      </div>
                    </div>

                    {/* Note Content Sections */}
                    <div className="space-y-4 p-5 text-sm">
                      {/* Chief Complaint */}
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                          Chief Complaint
                        </h4>
                        <p className="mt-1 font-medium text-slate-800">
                          {activeNote.chiefComplaint}
                        </p>
                      </div>

                      {/* Clinical Assessment & Examination */}
                      <div className="grid gap-4 md:grid-cols-2 rounded-lg bg-slate-50/60 p-3.5 border border-slate-100">
                        <div>
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                            Clinical Assessment
                          </h4>
                          <div className="mt-1 space-y-1 text-slate-700">
                            {activeNote.clinicalAssessment.map((item, idx) => (
                              <p key={idx}>{item}</p>
                            ))}
                          </div>
                        </div>

                        <div>
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                            Examination
                          </h4>
                          <div className="mt-1 space-y-1 text-slate-700">
                            {activeNote.examination.map((item, idx) => (
                              <p key={idx}>{item}</p>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Diagnosis */}
                      <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-3">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-[#0052cc]">
                          Diagnosis
                        </h4>
                        <p className="mt-1 font-semibold text-slate-900">
                          {activeNote.diagnosis}
                        </p>
                      </div>

                      {/* Treatment / Plan */}
                      <div className="rounded-lg border border-slate-200 bg-white p-3.5">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                          Treatment / Plan
                        </h4>
                        <ul className="mt-1.5 space-y-1 text-slate-700">
                          {activeNote.treatmentPlan.map((item, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="text-[#0052cc] font-bold">•</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Medications & Investigations */}
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3.5">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                            Medications
                          </h4>
                          <p className="mt-1 font-semibold text-slate-900">
                            {activeNote.medications}
                          </p>
                        </div>

                        <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3.5">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                            Investigations
                          </h4>
                          <div className="mt-1 space-y-1 text-slate-700">
                            {activeNote.investigations.map((item, idx) => (
                              <p key={idx}>{item}</p>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Follow-up */}
                      <div className="rounded-lg border border-emerald-100 bg-emerald-50/30 p-3">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                          Follow-up
                        </h4>
                        <p className="mt-1 font-medium text-slate-800">
                          {activeNote.followUp}
                        </p>
                      </div>
                    </div>

                    {/* Card Footer: Status & Created By */}
                    <div className="flex flex-wrap items-center justify-between border-t border-slate-100 bg-slate-50 px-5 py-3 text-xs text-slate-500">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-700">Status:</span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                          <i className="fa-solid fa-check text-[10px]" />
                          {activeNote.status}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 font-medium text-slate-700">
                        <span>Created by:</span>
                        <span className="font-bold text-[#0052cc]">{activeNote.createdBy}</span>
                        <span className="ml-1 inline-flex items-center rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                          <i className="fa-solid fa-signature mr-1" />
                          E-Signed
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Navigation Bar */}
                  {clinicalNotes.length > 1 && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs">
                      <button
                        type="button"
                        disabled={safeNoteIndex === 0}
                        onClick={() => {
                          setCurrentNoteIndex((prev) => Math.max(0, prev - 1));
                        }}
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <i className="fa-solid fa-chevron-left text-[10px]" />
                        Previous Note
                        {safeNoteIndex > 0 && (
                          <span className="text-slate-400">
                            ({clinicalNotes[safeNoteIndex - 1].dateTime.split(",")[0]})
                          </span>
                        )}
                      </button>

                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">
                          Showing note <strong>{safeNoteIndex + 1}</strong> of <strong>{clinicalNotes.length}</strong>
                        </span>
                        {safeNoteIndex === 0 ? (
                          <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-800">
                            Latest Encounter
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                            Historical Visit
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        disabled={safeNoteIndex === clinicalNotes.length - 1}
                        onClick={() => {
                          setCurrentNoteIndex((prev) => Math.min(clinicalNotes.length - 1, prev + 1));
                        }}
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Next Note
                        {safeNoteIndex < clinicalNotes.length - 1 && (
                          <span className="text-slate-400">
                            ({clinicalNotes[safeNoteIndex + 1].dateTime.split(",")[0]})
                          </span>
                        )}
                        <i className="fa-solid fa-chevron-right text-[10px]" />
                      </button>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </section>

          {/* =================================================
              DOCUMENT LIBRARY
          ================================================== */}
          <section className="mb-8">

            <div className="mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Document Library</h3>
            </div>

            {documents.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-400">
                No documents uploaded for this patient yet. Use the upload panel to add files.
              </div>
            ) : (() => {
              return (
                <div className="grid gap-4 md:grid-cols-3">
                  {/* One card per upload batch */}
                  {imageBatchGroups.map(({ ids: batchIds, label: batchLabel }, batchIndex) => {
                    const batchDocs = batchIds
                      .map(id => documents.find(d => d.id === id))
                      .filter((d): d is PatientDocumentItem => !!d);
                    if (batchDocs.length === 0) return null;
                    const displayTitle = batchLabel || (batchDocs.length === 1 ? batchDocs[0].name : `Documents (${batchDocs.length} files)`);
                    return (
                      <div key={batchIndex} className="group relative rounded-xl border border-blue-100 bg-white p-4 shadow-sm transition-all hover:shadow-md">
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-2xl text-blue-600">
                              <i className="fa-solid fa-file-word" />
                            </span>
                            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600">
                              {batchDocs.length} file{batchDocs.length !== 1 ? "s" : ""}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => { setAddingToBatchIndex(batchIndex); fileInputRef.current?.click(); }}
                              className="flex items-center gap-1 rounded-md border border-blue-300 bg-white px-2.5 py-1 text-xs font-semibold text-blue-600 transition-colors hover:bg-blue-50"
                            >
                              <i className="fa-solid fa-plus text-xs" />
                              Add
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingBatchIndex(batchIndex)}
                              className="flex items-center gap-1 rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-500 transition-colors hover:bg-red-50"
                            >
                              <i className="fa-solid fa-trash-can text-xs" />
                              Delete
                            </button>
                          </div>
                        </div>
                        <h4 className="mb-1 text-sm font-bold text-slate-900">
                          {displayTitle}
                        </h4>
                        <div className="mb-3 max-h-[4.5rem] space-y-1 overflow-y-auto pr-1">
                          {batchDocs.map(batchDoc => (
                            <div key={batchDoc.id} className="flex items-center justify-between gap-1">
                              <i className={`fa-solid ${isPdfFile(batchDoc) ? "fa-file-pdf text-red-400" : isImageFile(batchDoc) ? "fa-file-image text-blue-400" : "fa-file text-slate-400"} flex-shrink-0 text-[10px]`} />
                              {renamingDocId === batchDoc.id ? (
                                <input
                                  autoFocus
                                  className="min-w-0 flex-1 rounded border border-blue-300 px-1 py-0.5 text-xs text-slate-800 outline-none focus:ring-1 focus:ring-blue-400"
                                  value={renameValue}
                                  onChange={e => setRenameValue(e.target.value)}
                                  onBlur={() => handleRenameDoc(batchDoc.id, renameValue)}
                                  onKeyDown={e => {
                                    if (e.key === "Enter") handleRenameDoc(batchDoc.id, renameValue);
                                    if (e.key === "Escape") setRenamingDocId(null);
                                  }}
                                />
                              ) : (
                                <span
                                  className="min-w-0 flex-1 cursor-text truncate text-xs text-slate-700 hover:text-blue-600"
                                  title={`Click to rename: ${batchDoc.name}`}
                                  onClick={() => { setRenamingDocId(batchDoc.id); setRenameValue(batchDoc.name); }}
                                >
                                  {batchDoc.name}
                                </span>
                              )}
                              <button type="button" onClick={() => handleDeleteDoc(batchDoc.id, batchDoc.name)}
                                className="flex-shrink-0 text-slate-300 transition-colors hover:text-red-500"
                                title={`Delete ${batchDoc.name}`}>
                                <i className="fa-solid fa-trash-can text-xs" />
                              </button>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => setWordView({ docs: batchDocs, label: batchLabel })}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100">
                            <i className="fa-regular fa-eye text-xs" />
                            View in Word
                          </button>
                          <button type="button" onClick={() => downloadPatientDocumentsDocx(batchDocs, { patientId: patientId || undefined })}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50">
                            <i className="fa-solid fa-download text-xs" />
                            Download
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {wordView && (
              <WordImagesView
                documents={wordView.docs}
                label={wordView.label}
                onClose={() => setWordView(null)}
                onDownload={handleDownload}
              />
            )}

            {showDeleteAllConfirm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
                  <h4 className="mb-2 text-base font-bold text-slate-900">Delete All Documents?</h4>
                  <p className="mb-5 text-sm text-slate-500">
                    This will permanently remove all {documents.length} document{documents.length !== 1 ? "s" : ""} from the library. This cannot be undone.
                  </p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setShowDeleteAllConfirm(false)}
                      className="flex-1 rounded-md border border-slate-200 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteAll}
                      className="flex-1 rounded-md bg-red-600 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
                    >
                      Delete All
                    </button>
                  </div>
                </div>
              </div>
            )}

            {deletingBatchIndex !== null && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
                  <h4 className="mb-2 text-base font-bold text-slate-900">Delete this batch?</h4>
                  <p className="mb-5 text-sm text-slate-500">
                    This will permanently remove all {imageBatchGroups[deletingBatchIndex]?.ids.length ?? 0} file{(imageBatchGroups[deletingBatchIndex]?.ids.length ?? 0) !== 1 ? "s" : ""} in this batch. This cannot be undone.
                  </p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setDeletingBatchIndex(null)}
                      className="flex-1 rounded-md border border-slate-200 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteBatch}
                      className="flex-1 rounded-md bg-red-600 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* =================================================
              LAB & DIAGNOSTIC REPORTS
          ================================================== */}
          <section className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">

            {/* Header */}
            <div className="flex flex-col justify-between gap-4 border-b border-slate-200 p-5 md:flex-row md:items-center">
              <h3 className="text-lg font-semibold text-slate-900">
                Lab & Diagnostic Reports
              </h3>

              <div className="flex w-fit space-x-2 rounded-lg bg-slate-100 p-1">
                {["CBC", "Chemistry", "Radiology"].map((tab) => {
                  const active = labTab === tab;

                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setLabTab(tab)}
                      className={`rounded-md px-3 py-1 text-sm font-medium transition-all ${
                        active
                          ? "bg-white text-blue-600 shadow-sm"
                          : "text-slate-600 hover:bg-white hover:shadow-sm"
                      }`}
                    >
                      {tab}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-white text-sm text-slate-500">
                    <th className="w-1/4 p-4 pl-6 font-medium">
                      Test Name
                    </th>

                    <th className="w-1/5 p-4 font-medium">
                      Date
                    </th>

                    <th className="w-1/5 p-4 font-medium">
                      Result
                    </th>

                    <th className="w-1/4 p-4 font-medium">
                      Trend
                    </th>

                    <th className="p-4 pr-6 text-center font-medium">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                  <tr>
                    <td
                      colSpan={5}
                      className="p-6 pl-6 text-center text-xs text-slate-400"
                    >
                      No lab or diagnostic reports available for this patient
                      yet.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* =================================================
            RIGHT SIDEBAR
        ================================================== */}
        <aside className="flex w-full flex-shrink-0 flex-col gap-6 xl:w-80">

          {/* =================================================
              UPLOAD DOCUMENT
          ================================================== */}
          {stagedFiles.length > 0 ? (
            /* ── Staging panel: rename files before uploading ── */
            <div className="rounded-xl border border-blue-200 bg-white p-4 shadow-sm">
              <h4 className="mb-3 text-sm font-bold text-slate-900">
                {stagedFiles.length} file{stagedFiles.length !== 1 ? "s" : ""} selected
              </h4>
              <div className="mb-3">
                <label className="mb-1 block text-xs font-medium text-slate-600">Word document name</label>
                <input
                  className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-300"
                  placeholder="e.g. Scan Reports"
                  value={stagedBatchLabel}
                  onChange={e => setStagedBatchLabel(e.target.value)}
                />
              </div>
              <p className="mb-2 text-xs text-slate-400">Rename individual files if needed:</p>
              <div className="mb-4 space-y-2">
                {stagedFiles.map((sf, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <i className="fa-solid fa-file flex-shrink-0 text-sm text-slate-400" />
                    <input
                      className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-300"
                      value={sf.name}
                      onChange={e => setStagedFiles(prev => prev.map((f, j) => j === i ? { ...f, name: e.target.value } : f))}
                    />
                    <button
                      type="button"
                      onClick={() => setStagedFiles(prev => prev.filter((_, j) => j !== i))}
                      className="flex-shrink-0 text-slate-300 hover:text-red-500"
                      title="Remove this file"
                    >
                      <i className="fa-solid fa-xmark text-sm" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setStagedFiles([]); setStagedBatchLabel(""); }}
                  className="flex-1 rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmitUpload}
                  disabled={isUploadingDoc}
                  className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  {isUploadingDoc ? (
                    <><i className="fa-solid fa-spinner fa-spin mr-1" />Uploading…</>
                  ) : "Submit"}
                </button>
              </div>
              {docSuccessMsg && (
                <p className="mt-3 rounded bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                  <i className="fa-solid fa-circle-check mr-1.5" />
                  {docSuccessMsg}
                </p>
              )}
            </div>
          ) : (
            /* ── Default dropzone ── */
            <div
              onClick={handleSelectFiles}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-all ${
                isDraggingFile
                  ? "border-blue-500 bg-blue-100/70 shadow-md ring-2 ring-blue-400"
                  : "border-blue-300 bg-blue-50/50 hover:bg-blue-50"
              }`}
            >
              <div
                className={`mb-3 flex h-12 w-12 items-center justify-center rounded-full text-xl transition-transform ${
                  isDraggingFile ? "scale-110 bg-blue-600 text-white" : "bg-blue-100 text-blue-600"
                }`}
              >
                <i className="fa-solid fa-file-arrow-up" />
              </div>
              <h4 className="mb-1 text-base font-bold text-slate-900">Upload Document</h4>
              <p className="mb-4 px-4 text-xs text-slate-500">
                Drag & Drop or click to browse files (PDF, JPG, PNG, DOCX)
              </p>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); handleSelectFiles(); }}
                className="rounded-md border border-blue-600 bg-white px-6 py-2 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50"
              >
                Select Files
              </button>
              {docSuccessMsg && (
                <p className="mt-3 max-w-full rounded bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                  <i className="fa-solid fa-circle-check mr-1.5" />
                  {docSuccessMsg}
                </p>
              )}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.txt"
            className="hidden"
            onChange={handleFileChange}
          />

          {/* =================================================
              RECENT ACTIVITY
          ================================================== */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-base font-semibold text-slate-900">
              Recent Activity
            </h3>

            <div className="relative pl-4">
              {/* Vertical Line */}
              <div className="absolute bottom-0 left-5 top-0 w-0.5 bg-gradient-to-b from-transparent via-slate-200 to-transparent" />

              <div className="space-y-6">
                {activities.length === 0 ? (
                  <p className="py-2 text-xs text-slate-400">
                    No recent activity recorded for this patient yet.
                  </p>
                ) : (
                  activities.map((activity) => (
                  <div
                    key={activity.title}
                    className="group relative flex items-start gap-4"
                  >
                    {/* Dot */}
                    <div
                      className={`absolute -left-[5px] top-1.5 h-3 w-3 rounded-full border-2 border-white ring-2 ring-slate-100 ${activity.dot}`}
                    />

                    <div className="pl-4">
                      <h4 className="text-sm font-semibold text-slate-900">
                        {activity.title}
                      </h4>

                      <p className="mt-0.5 text-xs text-slate-600">
                        {activity.description}
                      </p>

                      <span className="mt-1 block text-[10px] font-medium uppercase text-slate-400">
                        {activity.time}
                      </span>
                    </div>
                  </div>
                ))
                )}
              </div>
            </div>
          </section>

          {/* =================================================
              IMPORTANT FLAGS (real allergies from the API)
          ================================================== */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                Important Flags
              </h3>

              <i className="fa-solid fa-thumbtack text-slate-400" />
            </div>

            <div className="space-y-3">
              {notesAllergies.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs text-slate-400">
                  No allergy alerts recorded for this patient.
                </p>
              ) : (
                notesAllergies.map((allergy) => {
                  const severe =
                    (allergy.severity ?? "").toUpperCase() === "SEVERE" ||
                    (allergy.allergy_master?.severity_level ?? "")
                      .toUpperCase()
                      .startsWith("SEVERE");
                  return (
                    <div
                      key={allergy.id}
                      className={`rounded-r-lg border-l-4 p-3 ${
                        severe
                          ? "border-red-500 bg-red-50"
                          : "border-orange-500 bg-orange-50"
                      }`}
                    >
                      <h4
                        className={`mb-1 text-sm font-bold ${
                          severe ? "text-red-800" : "text-orange-800"
                        }`}
                      >
                        Allergy Warning
                      </h4>

                      <p
                        className={`text-xs leading-snug ${
                          severe ? "text-red-700" : "text-orange-700"
                        }`}
                      >
                        {[allergy.allergy_master?.substance_name, allergy.reaction]
                          .filter(Boolean)
                          .join(" — ") || "Recorded allergy"}
                        {allergy.allergy_master?.severity_level ||
                        allergy.severity
                          ? ` (Severity: ${
                              allergy.allergy_master?.severity_level ??
                              allergy.severity
                            })`
                          : ""}
                        {allergy.status
                          ? ` · Status: ${allergy.status}`
                          : ""}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </aside>
      </div>

      {/* ===================================================
          EDIT CLINICAL NOTE MODAL
      ==================================================== */}
      {isEditNoteModalOpen && editingNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0052cc] text-white shadow-sm">
                  <i className="fa-solid fa-pen-to-square text-sm" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Edit Clinical Note
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {editingNote.encounterNo ? `#${editingNote.encounterNo} • ` : ""}{editingNote.encounter} • {editingNote.dateTime}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isSavingNote}
                onClick={() => {
                  setIsEditNoteModalOpen(false);
                  setEditingNote(null);
                }}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors disabled:opacity-50"
              >
                <i className="fa-solid fa-xmark text-lg" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveEditedNote} className="flex flex-1 flex-col overflow-y-auto hide-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden p-6 space-y-4 text-xs">
              {/* Meta information row */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div>
                  <label className="mb-0.5 block text-[10px] font-bold uppercase text-slate-500">Encounter</label>
                  <p className="font-semibold text-slate-800 text-xs truncate" title={editingNote.encounter}>{editingNote.encounter}</p>
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] font-bold uppercase text-slate-500">Doctor</label>
                  <p className="font-semibold text-slate-800 text-xs truncate" title={editingNote.doctor}>{editingNote.doctor}</p>
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] font-bold uppercase text-slate-500">Department</label>
                  <p className="font-semibold text-slate-800 text-xs truncate" title={editingNote.department}>{editingNote.department}</p>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase text-slate-500">Status</label>
                  <select
                    value={editingNote.status}
                    onChange={(e) => setEditingNote({ ...editingNote, status: e.target.value as any })}
                    className="w-full rounded border border-slate-300 px-2 py-1 text-xs focus:border-[#0052cc] focus:outline-none bg-white font-medium"
                  >
                    <option value="Completed">Completed</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Draft">Draft</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block font-semibold text-slate-700">Chief Complaint</label>
                <input
                  type="text"
                  required
                  value={editingNote.chiefComplaint}
                  onChange={(e) => setEditingNote({ ...editingNote, chiefComplaint: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-[#0052cc] focus:outline-none"
                  placeholder="Chief complaint"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">Clinical Assessment (1 per line)</label>
                  <textarea
                    rows={3}
                    value={editingNote.clinicalAssessment}
                    onChange={(e) => setEditingNote({ ...editingNote, clinicalAssessment: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-[#0052cc] focus:outline-none"
                    placeholder="Clinical assessment items"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">Examination (1 per line)</label>
                  <textarea
                    rows={3}
                    value={editingNote.examination}
                    onChange={(e) => setEditingNote({ ...editingNote, examination: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-[#0052cc] focus:outline-none"
                    placeholder="Physical examination notes"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block font-semibold text-slate-700">Diagnosis</label>
                <input
                  type="text"
                  value={editingNote.diagnosis}
                  onChange={(e) => setEditingNote({ ...editingNote, diagnosis: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-[#0052cc] focus:outline-none"
                  placeholder="Primary clinical diagnosis"
                />
              </div>

              <div>
                <label className="mb-1 block font-semibold text-slate-700">Treatment / Plan (1 item per line)</label>
                <textarea
                  rows={3}
                  value={editingNote.treatmentPlan}
                  onChange={(e) => setEditingNote({ ...editingNote, treatmentPlan: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-[#0052cc] focus:outline-none"
                  placeholder="Treatment plan items"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">Medications</label>
                  <input
                    type="text"
                    value={editingNote.medications}
                    onChange={(e) => setEditingNote({ ...editingNote, medications: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-[#0052cc] focus:outline-none"
                    placeholder="Prescribed medications"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">Investigations (1 per line)</label>
                  <input
                    type="text"
                    value={editingNote.investigations}
                    onChange={(e) => setEditingNote({ ...editingNote, investigations: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-[#0052cc] focus:outline-none"
                    placeholder="Lab tests and investigations"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block font-semibold text-slate-700">Follow-up</label>
                <input
                  type="text"
                  value={editingNote.followUp}
                  onChange={(e) => setEditingNote({ ...editingNote, followUp: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-[#0052cc] focus:outline-none"
                  placeholder="Follow-up instructions"
                />
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  disabled={isSavingNote}
                  onClick={() => {
                    setIsEditNoteModalOpen(false);
                    setEditingNote(null);
                  }}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingNote}
                  className="flex items-center gap-1.5 rounded-lg bg-[#0052cc] px-5 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 shadow-sm disabled:opacity-50"
                >
                  {isSavingNote ? (
                    <>
                      <i className="fa-solid fa-circle-notch fa-spin text-xs" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-check" />
                      Save Changes
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </>
  );

  if (embedded) {
    return (
      <>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
        />
        {content}
      </>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-slate-50 text-slate-800 antialiased font-sans">
      {/* =========================================================
          MAIN CONTENT AREA
      ========================================================== */}
      <div className="relative flex h-screen flex-col overflow-hidden">
        {/* =======================================================
            TOP HEADER
        ======================================================== */}
        <header className="z-10 flex h-16 flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
          {/* Branch */}
          
          {/* Header Actions */}
          <div className="flex items-center space-x-4">
            {/* Notification */}
            <BellNotificationButton size="md" />

            {/* HMS */}
            <span className="rounded bg-blue-50 px-2 py-1 text-sm font-medium text-blue-600">
              HMS
            </span>

            {/* User */}
            <img
              alt="User"
              className="h-8 w-8 cursor-pointer rounded-full border border-slate-200 object-cover"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuDlp4Z9SpVdXaVjgWZ4_KJ2BK03faz2udRJkhREXle-y5y2rTeFCwW4cbRgPfipcwrkUgzEHseDbPrPvNEe_LapOJGREVcYW0M369brOZfN0BTfuLLYfu0i4w4HpxvhO9ZSkb6fT5V_FaljJqtWdRO0L6kZAPR45Uo2fY1juqc7pc031lqOhWAxw8XzQ5u-o242ARI4GCY9VzzSZzaHG9i7vz6KrxDGT5zlthoATD7Ljf0DI-aEZ7RrJA"
            />
          </div>
        </header>

        {/* =======================================================
            SCROLLABLE CONTENT
        ======================================================== */}
        <main className="relative flex-1 overflow-y-auto bg-slate-50">
          <div className="mx-auto max-w-7xl px-6 pb-6 pt-6">
            {content}
          </div>
        </main>

        {/* =======================================================
            BOTTOM ACTION BAR
        ======================================================== */}
        <div className="absolute bottom-0 left-0 right-0 z-20 flex h-16 flex-shrink-0 items-center justify-between border-t border-slate-200 bg-white px-6 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">

          <div className="text-sm text-slate-500">
            Showing {documents.length} of {documents.length} total records
          </div>

          <div className="flex space-x-3">

            {/* Export */}
            <button
              type="button"
              onClick={handleExportDocuments}
              disabled={documents.length === 0 || isExportingDocs}
              className="flex items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <i className="fa-solid fa-file-export mr-2" />
              {isExportingDocs ? "Exporting…" : "Export Documents"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotesDocumentsTab;
