/**
 * Patient Documents Utility & Dual-Engine Storage
 * - Central PostgreSQL Database persistence via Express Backend REST API
 * - Local IndexedDB caching engine for offline tolerance and instant blob previews
 * - Supports PDFs, images, clinical notes, lab reports, and office documents
 */

import API from "../api/axios";
import { getToken, getUser } from "./token";

export interface PatientDocumentItem {
  id: string;
  patientId: string;
  name: string; // Stored file name (custom title + original extension)
  title: string; // Document name entered in "Title name" (no extension)
  originalName: string; // Original uploaded file name
  size: number;
  type: string;
  url: string; // Active blob object URL or backend stream URL
  uploadDate: string; // Formatted date string, e.g. "17 Sep 2026, 03:30 PM"
  info: string; // Display summary, e.g. "PDF • 1.2 MB • 17 Sep 2026"
  icon: string; // FontAwesome icon class
  color: string; // Tailwind text color class
  hover: string; // Tailwind border hover class
  blob?: Blob;
  // The OPD visit or IPD stay this document is scoped to, if any -- the
  // common column across both modules.
  encounterNo?: string | null;
  // Free-text taxonomy (BIOPSY_REPORT / DISCHARGE_DOCUMENT / LAB_REPORT /
  // IMAGING / CONSENT_FORM / INSURANCE / OTHER).
  documentType?: string | null;
}

/** Mirrors the backend's DOCUMENT_TYPE_VALUES (patientDocument.constants.ts). */
export const DOCUMENT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "BIOPSY_REPORT", label: "Biopsy Report" },
  { value: "DISCHARGE_DOCUMENT", label: "Discharge Document" },
  { value: "LAB_REPORT", label: "Lab Report" },
  { value: "IMAGING", label: "Imaging" },
  { value: "CONSENT_FORM", label: "Consent Form" },
  { value: "INSURANCE", label: "Insurance" },
  { value: "OTHER", label: "Other" },
];

interface StoredDocumentRecord {
  id: string;
  patientId: string;
  name: string;
  originalName?: string;
  size: number;
  type: string;
  uploadDate: string;
  blob: Blob;
}

interface BackendDocumentRecord {
  id: string;
  document_id: string;
  patient_id: string;
  file_name: string;
  original_name: string;
  file_type: string;
  file_size: number;
  category?: string | null;
  uploaded_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  encounter_no?: string | null;
  document_type?: string | null;
}

const DB_NAME = "HMS_PatientDocumentsDB";
const STORE_NAME = "documents";
const DB_VERSION = 1;

/**
 * Strip the extension from a file name to get the document title
 */
function stripExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

/**
 * Format raw byte size into human readable string (B, KB, MB)
 */
export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Resolve icon class and styling based on file extension and MIME type
 */
export function getDocumentIconAndColors(
  fileName: string,
  mimeType: string = ""
): {
  icon: string;
  color: string;
  hover: string;
} {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const lowerMime = mimeType.toLowerCase();

  if (ext === "pdf" || lowerMime.includes("pdf")) {
    return {
      icon: "fa-file-pdf",
      color: "text-red-500",
      hover: "hover:border-red-300",
    };
  }

  if (
    ["jpg", "jpeg", "png", "webp", "gif", "svg"].includes(ext) ||
    lowerMime.startsWith("image/")
  ) {
    return {
      icon: "fa-file-image",
      color: "text-emerald-500",
      hover: "hover:border-emerald-300",
    };
  }

  if (
    ["doc", "docx"].includes(ext) ||
    lowerMime.includes("word") ||
    lowerMime.includes("document")
  ) {
    return {
      icon: "fa-file-word",
      color: "text-blue-600",
      hover: "hover:border-blue-300",
    };
  }

  if (
    ["xls", "xlsx", "csv"].includes(ext) ||
    lowerMime.includes("sheet") ||
    lowerMime.includes("csv")
  ) {
    return {
      icon: "fa-file-excel",
      color: "text-green-600",
      hover: "hover:border-green-300",
    };
  }

  if (["txt", "rtf", "log"].includes(ext) || lowerMime.startsWith("text/")) {
    return {
      icon: "fa-file-lines",
      color: "text-slate-600",
      hover: "hover:border-slate-300",
    };
  }

  return {
    icon: "fa-file-lines",
    color: "text-indigo-500",
    hover: "hover:border-indigo-300",
  };
}

/**
 * Convert a File object to a Base64 data string
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result);
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

/**
 * Open IndexedDB database connection
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return reject(new Error("IndexedDB is not supported in this environment"));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("patientId", "patientId", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open IndexedDB"));
  });
}

/**
 * Load documents from local IndexedDB cache
 */
async function loadPatientDocumentsFromIndexedDB(
  patientId: string
): Promise<PatientDocumentItem[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index("patientId");
      const request = index.getAll(patientId);

      request.onsuccess = () => {
        const records: StoredDocumentRecord[] = request.result || [];
        const items: PatientDocumentItem[] = records.map((rec) => {
          const { icon, color, hover } = getDocumentIconAndColors(rec.name, rec.type);
          const ext = rec.name.split(".").pop()?.toUpperCase() || "FILE";
          const formattedSize = formatFileSize(rec.size);
          const dateOnly = rec.uploadDate.split(",")[0] || rec.uploadDate;
          const url = URL.createObjectURL(rec.blob);

          return {
            id: rec.id,
            patientId: rec.patientId,
            name: rec.name,
            title: stripExtension(rec.name),
            originalName: rec.originalName || rec.name,
            size: rec.size,
            type: rec.type,
            url,
            uploadDate: rec.uploadDate,
            info: `${ext} • ${formattedSize} • ${dateOnly}`,
            icon,
            color,
            hover,
            blob: rec.blob,
          };
        });

        items.sort((a, b) => b.id.localeCompare(a.id));
        resolve(items);
      };

      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn("IndexedDB fallback error:", err);
    return [];
  }
}

/**
 * Save document to local IndexedDB cache
 */
async function savePatientDocumentToIndexedDB(
  patientId: string,
  file: File,
  customId?: string,
  displayName: string = file.name
): Promise<PatientDocumentItem> {
  const id = customId || `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date();
  const uploadDate =
    now.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }) +
    ", " +
    now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const storedRecord: StoredDocumentRecord = {
    id,
    patientId,
    name: displayName,
    originalName: file.name,
    size: file.size,
    type: file.type || "application/octet-stream",
    uploadDate,
    blob: file,
  };

  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(storedRecord);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn("Could not write document to IndexedDB:", err);
  }

  const { icon, color, hover } = getDocumentIconAndColors(displayName, file.type);
  const ext = displayName.split(".").pop()?.toUpperCase() || "FILE";
  const formattedSize = formatFileSize(file.size);
  const dateOnly = uploadDate.split(",")[0] || uploadDate;
  const url = URL.createObjectURL(file);

  return {
    id,
    patientId,
    name: displayName,
    title: stripExtension(displayName),
    originalName: file.name,
    size: file.size,
    type: file.type || "application/octet-stream",
    url,
    uploadDate,
    info: `${ext} • ${formattedSize} • ${dateOnly}`,
    icon,
    color,
    hover,
    blob: file,
  };
}

/**
 * Delete document from local IndexedDB cache
 */
async function deletePatientDocumentFromIndexedDB(id: string): Promise<void> {
  if (!id) return;
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn("Could not delete document from IndexedDB:", err);
  }
}

function backendBaseUrl(): string {
  return (
    (import.meta as any).env?.VITE_BACKEND_URL || "http://localhost:5000/api"
  ).replace(/\/+$/, "");
}

/** Shared record -> PatientDocumentItem mapping for every backend-sourced list. */
function mapBackendRecord(
  rec: BackendDocumentRecord,
  fallbackPatientId: string,
  backendBase: string,
  tokenQuery: string
): PatientDocumentItem {
  const docId = rec.document_id || rec.id;
  const fileName = rec.file_name || rec.original_name || "Document";
  const fileType = rec.file_type || "application/octet-stream";
  const fileSize = Number(rec.file_size || 0);
  const { icon, color, hover } = getDocumentIconAndColors(fileName, fileType);
  const ext = fileName.split(".").pop()?.toUpperCase() || "FILE";
  const formattedSize = formatFileSize(fileSize);

  const createdDate = rec.created_at ? new Date(rec.created_at) : new Date();
  const uploadDate =
    createdDate.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }) +
    ", " +
    createdDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateOnly = uploadDate.split(",")[0] || uploadDate;

  const viewUrl = `${backendBase}/patient-documents/${encodeURIComponent(docId)}/view${tokenQuery}`;

  return {
    id: docId,
    patientId: rec.patient_id || fallbackPatientId,
    name: fileName,
    title: stripExtension(fileName),
    originalName: rec.original_name || fileName,
    size: fileSize,
    type: fileType,
    url: viewUrl,
    uploadDate,
    info: `${ext} • ${formattedSize} • ${dateOnly}`,
    icon,
    color,
    hover,
    encounterNo: rec.encounter_no ?? null,
    documentType: rec.document_type ?? null,
  };
}

/**
 * Load all documents stored in the database for a specific patient.
 * First queries backend API `/patient-documents/patient/:patientId`.
 * If network is unreachable, gracefully falls back to IndexedDB.
 */
export async function loadPatientDocuments(
  patientId: string
): Promise<PatientDocumentItem[]> {
  if (!patientId) return [];

  const backendBase = backendBaseUrl();
  const token = getToken();
  const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : "";

  try {
    const response = await API.get<{ success: boolean; data: BackendDocumentRecord[] }>(
      `/patient-documents/patient/${encodeURIComponent(patientId)}`
    );

    if (response.data && Array.isArray(response.data.data)) {
      return response.data.data.map((rec) =>
        mapBackendRecord(rec, patientId, backendBase, tokenQuery)
      );
    }
  } catch (err) {
    console.warn("Backend loadPatientDocuments failed, falling back to IndexedDB:", err);
  }

  return loadPatientDocumentsFromIndexedDB(patientId);
}

/**
 * Documents attached to one OPD visit or IPD stay (encounter-scoped).
 * No IndexedDB fallback -- this view only exists once the backend link is
 * known, so there's nothing meaningful to show offline.
 */
export async function loadDocumentsByEncounter(
  encounterNo: string
): Promise<PatientDocumentItem[]> {
  if (!encounterNo) return [];

  const backendBase = backendBaseUrl();
  const token = getToken();
  const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : "";

  try {
    const response = await API.get<{ success: boolean; data: BackendDocumentRecord[] }>(
      `/patient-documents/encounter/${encodeURIComponent(encounterNo)}`
    );

    if (response.data && Array.isArray(response.data.data)) {
      return response.data.data.map((rec) =>
        mapBackendRecord(rec, rec.patient_id, backendBase, tokenQuery)
      );
    }
  } catch (err) {
    console.warn("loadDocumentsByEncounter failed:", err);
  }

  return [];
}

/**
 * Build the stored file name from a user-entered title, keeping the original
 * extension so downloads still open with the right application.
 */
function buildDocumentName(file: File, title?: string): string {
  const trimmed = title?.trim();
  if (!trimmed) return file.name;
  const dot = file.name.lastIndexOf(".");
  const ext = dot > 0 ? file.name.slice(dot) : "";
  return ext && trimmed.toLowerCase().endsWith(ext.toLowerCase())
    ? trimmed
    : `${trimmed}${ext}`;
}

/**
 * Save an uploaded file for a patient into PostgreSQL Database via backend API,
 * and caches into IndexedDB for offline capability and immediate previews.
 * An optional title replaces the file name shown in the Document Library.
 * `context` scopes the upload to one OPD visit / IPD stay (encounterNo) and
 * tags it with a taxonomy value (documentType) -- both optional, so existing
 * patient-only callers (e.g. the doctor's Notes & Documents tab) are unaffected.
 */
export async function savePatientDocument(
  patientId: string,
  file: File,
  title?: string,
  context?: { encounterNo?: string; documentType?: string }
): Promise<PatientDocumentItem> {
  const displayName = buildDocumentName(file, title);
  const backendBase = backendBaseUrl();
  const token = getToken();
  const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : "";

  // 1. Prepare local item with live blob URL immediately
  const localItem = await savePatientDocumentToIndexedDB(
    patientId,
    file,
    undefined,
    displayName
  );

  try {
    // 2. Read file as Base64 for database storage
    const base64Data = await fileToBase64(file);
    const currentUser = getUser();
    const uploadedBy =
      currentUser?.name || currentUser?.username || currentUser?.role || "Doctor";

    // 3. Post to backend
    const response = await API.post<{
      success: boolean;
      data: BackendDocumentRecord;
    }>("/patient-documents/upload", {
      patient_id: patientId,
      file_name: displayName,
      original_name: file.name,
      file_type: file.type || "application/octet-stream",
      file_size: file.size,
      file_data: base64Data,
      category: "Clinical",
      uploaded_by: uploadedBy,
      encounter_no: context?.encounterNo,
      document_type: context?.documentType,
    });

    if (response.data && response.data.data) {
      const serverDoc = response.data.data;
      const docId = serverDoc.document_id || serverDoc.id;

      // Update indexedDB record with server document_id
      await savePatientDocumentToIndexedDB(patientId, file, docId, displayName);

      const { icon, color, hover } = getDocumentIconAndColors(
        serverDoc.file_name,
        serverDoc.file_type
      );
      const ext = serverDoc.file_name.split(".").pop()?.toUpperCase() || "FILE";
      const formattedSize = formatFileSize(Number(serverDoc.file_size));
      const createdDate = serverDoc.created_at ? new Date(serverDoc.created_at) : new Date();
      const uploadDate =
        createdDate.toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }) +
        ", " +
        createdDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const dateOnly = uploadDate.split(",")[0] || uploadDate;
      const viewUrl = `${backendBase}/patient-documents/${encodeURIComponent(docId)}/view${tokenQuery}`;

      return {
        id: docId,
        patientId: serverDoc.patient_id,
        name: serverDoc.file_name,
        title: stripExtension(serverDoc.file_name),
        originalName: serverDoc.original_name || file.name,
        size: Number(serverDoc.file_size),
        type: serverDoc.file_type,
        url: localItem.url || viewUrl,
        uploadDate,
        info: `${ext} • ${formattedSize} • ${dateOnly}`,
        icon,
        color,
        hover,
        blob: file,
        encounterNo: serverDoc.encounter_no ?? context?.encounterNo ?? null,
        documentType: serverDoc.document_type ?? context?.documentType ?? null,
      };
    }
  } catch (err) {
    console.error("Failed to save patient document to backend API:", err);
  }

  return localItem;
}

/**
 * Delete a document from the database by its ID (and clean from local IndexedDB cache)
 */
export async function deletePatientDocument(id: string): Promise<void> {
  if (!id) return;
  try {
    await API.delete(`/patient-documents/${encodeURIComponent(id)}`);
  } catch (err) {
    console.warn("Could not delete document from backend API:", err);
  }
  await deletePatientDocumentFromIndexedDB(id);
}

/**
 * Trigger browser download of a document (fetches blob stream from backend or local blob)
 */
export async function downloadDocument(doc: PatientDocumentItem): Promise<void> {
  if (doc.blob) {
    const a = document.createElement("a");
    a.href = doc.url;
    a.download = doc.name || "document";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return;
  }

  try {
    const response = await API.get(`/patient-documents/${encodeURIComponent(doc.id)}/download`, {
      responseType: "blob",
    });

    const blob = new Blob([response.data], {
      type: doc.type || "application/octet-stream",
    });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = doc.name || "document";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
  } catch (err) {
    console.warn("API downloadDocument failed, opening URL directly:", err);
    if (doc.url) {
      window.open(doc.url, "_blank");
    }
  }
}

/**
 * Download all documents sequentially
 */
export function downloadAllDocuments(docs: PatientDocumentItem[]): void {
  if (!docs || docs.length === 0) return;
  docs.forEach((doc, idx) => {
    setTimeout(() => {
      downloadDocument(doc);
    }, idx * 300);
  });
}
