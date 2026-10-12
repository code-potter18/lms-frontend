import React, { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Upload, Download, Trash2, Eye, Loader2 } from "lucide-react";
import {
  loadDocumentsByEncounter,
  savePatientDocument,
  deletePatientDocument,
  downloadDocument,
  DOCUMENT_TYPE_OPTIONS,
  type PatientDocumentItem,
} from "@/utils/patientDocuments";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const documentTypeLabel = (value: string | null | undefined): string =>
  DOCUMENT_TYPE_OPTIONS.find((o) => o.value === value)?.label || "Other";

interface EncounterDocumentsProps {
  /** The OPD visit or IPD stay to scope documents to -- the common link. */
  encounterNo: string | null | undefined;
  patientId: string;
  /** Admission Details-style views show the list only, no upload/delete controls. */
  readOnly?: boolean;
  title?: string;
  className?: string;
}

/*
 * Reusable encounter-scoped document list + uploader. Built on the same
 * backend-first, IndexedDB-cached utilities the doctor's OPD "Notes &
 * Documents" tab already uses (utils/patientDocuments.ts) -- this is that
 * same pipeline, scoped by encounter_no instead of patient_id alone, so an
 * IPD stay's biopsy reports / discharge paperwork don't land in the same
 * flat bucket as every other visit this patient has ever had.
 */
export const EncounterDocuments: React.FC<EncounterDocumentsProps> = ({
  encounterNo,
  patientId,
  readOnly = false,
  title = "Documents",
  className = "",
}) => {
  const { toast } = useToast();
  const [documents, setDocuments] = useState<PatientDocumentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [documentType, setDocumentType] = useState<string>("OTHER");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    if (!encounterNo) {
      setDocuments([]);
      return;
    }
    setLoading(true);
    try {
      const docs = await loadDocumentsByEncounter(encounterNo);
      setDocuments(docs);
    } finally {
      setLoading(false);
    }
  }, [encounterNo]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file name
    if (!file || !encounterNo) return;

    setUploading(true);
    try {
      await savePatientDocument(patientId, file, undefined, {
        encounterNo,
        documentType,
      });
      toast({ title: "Document uploaded", description: file.name });
      await refresh();
    } catch (err: any) {
      toast({
        title: "Upload failed",
        description: err?.response?.data?.message || err?.message || "Could not upload document.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (doc: PatientDocumentItem) => {
    if (!window.confirm(`Delete "${doc.title}"? This cannot be undone.`)) return;
    try {
      await deletePatientDocument(doc.id);
      toast({ title: "Document deleted" });
      await refresh();
    } catch (err: any) {
      toast({
        title: "Delete failed",
        description: err?.message || "Could not delete document.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold text-slate-700">
          {title}
          {documents.length > 0 && (
            <span className="ml-1.5 text-slate-400 font-normal">({documents.length})</span>
          )}
        </Label>

        {!readOnly && encounterNo && (
          <div className="flex items-center gap-2">
            <Select value={documentType} onValueChange={setDocumentType}>
              <SelectTrigger className="h-8 w-[150px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileSelected}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5 mr-1" />
              )}
              Upload
            </Button>
          </div>
        )}
      </div>

      {!encounterNo ? (
        <p className="text-xs text-slate-400 italic">
          Documents can be attached once the admission is saved.
        </p>
      ) : loading ? (
        <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading documents...
        </div>
      ) : documents.length === 0 ? (
        <p className="text-xs text-slate-400 italic">No documents attached yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {documents.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileText className={`h-4 w-4 shrink-0 ${doc.color}`} />
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-800" title={doc.title}>
                    {doc.title}
                  </div>
                  <div className="text-slate-400">
                    {documentTypeLabel(doc.documentType)} • {doc.info}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  className="p-1.5 rounded hover:bg-slate-100 text-slate-500"
                  title="View"
                  onClick={() => window.open(doc.url, "_blank", "noopener,noreferrer")}
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="p-1.5 rounded hover:bg-slate-100 text-slate-500"
                  title="Download"
                  onClick={() => downloadDocument(doc)}
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
                {!readOnly && (
                  <button
                    type="button"
                    className="p-1.5 rounded hover:bg-red-50 text-red-500"
                    title="Delete"
                    onClick={() => handleDelete(doc)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default EncounterDocuments;
