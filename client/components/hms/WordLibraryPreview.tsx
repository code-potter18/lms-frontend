/**
 * WordLibraryPreview — the Document Library shown as ONE Word document.
 *
 * Converts every uploaded file (images, PDF text, DOCX/DOC/TXT contents)
 * through the shared combined-Word engine and renders the result as a
 * Word-styled HTML page, with the same content downloadable as a single
 * .docx. PDFs become editable Word text — page images are used only for
 * scanned pages with no text. The highlighted file's section is scrolled
 * into view; everything else stays browsable below it.
 */
import { useEffect, useRef, useState } from "react";
import {
  buildWordSections,
  type WordBlock,
  type WordSection,
} from "../../utils/combinedDocumentWord";
import { downloadPatientDocumentsDocx } from "../../utils/patientDocumentsDocx";
import type { PatientDocumentItem } from "../../utils/patientDocuments";

interface WordLibraryPreviewProps {
  documents: PatientDocumentItem[];
  highlightDocId?: string;
  onClose: () => void;
  onDownloadOriginal: (doc: PatientDocumentItem) => void;
}

/* Object-URL image with automatic cleanup */
const PreviewImage = ({ block }: { block: Extract<WordBlock, { kind: "image" }> }) => {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const mime = `image/${block.format === "jpg" ? "jpeg" : block.format}`;
    const blob = new Blob([block.bytes.slice().buffer as ArrayBuffer], { type: mime });
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [block]);

  if (!url) return null;
  return (
    <figure className="my-4 text-center">
      <img
        src={url}
        alt={block.caption || "Document image"}
        className="mx-auto max-w-full rounded-lg border border-slate-200 shadow-sm"
        style={{ width: block.width, height: block.height }}
      />
      {block.caption && (
        <figcaption className="mt-2 text-xs italic text-slate-500">
          {block.caption}
        </figcaption>
      )}
    </figure>
  );
};

const paragraphClass = (style?: string): string => {
  if (style === "heading1") return "mt-4 mb-2 text-lg font-bold text-indigo-800";
  if (style === "heading2") return "mt-3 mb-1.5 text-base font-bold text-indigo-700";
  if (style === "heading3") return "mt-2 mb-1 text-sm font-semibold text-slate-800";
  if (style === "bullet") return "mb-1 pl-1 text-sm text-slate-700";
  if (style === "note") return "mb-2 text-xs italic text-slate-500";
  return "mb-2 text-sm leading-relaxed text-slate-800";
};

const TableBlock = ({ block }: { block: Extract<WordBlock, { kind: "table" }> }) => (
  <div className="my-4 overflow-x-auto">
    <table className="w-full border-collapse text-sm">
      <tbody>
        {block.rows.map((row, rowIndex) => (
          <tr key={rowIndex} className={rowIndex === 0 ? "bg-slate-100" : rowIndex % 2 === 0 ? "bg-slate-50" : ""}>
            {row.map((cell, cellIndex) => (
              <td
                key={cellIndex}
                className={`border border-slate-200 px-2.5 py-1.5 align-top text-slate-700 ${rowIndex === 0 ? "font-semibold" : ""}`}
              >
                {cell || "-"}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const WordLibraryPreview = ({
  documents,
  highlightDocId,
  onClose,
  onDownloadOriginal,
}: WordLibraryPreviewProps) => {
  const [sections, setSections] = useState<WordSection[] | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: documents.length });
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const highlightedDoc =
    (highlightDocId && documents.find((d) => d.id === highlightDocId)) || null;

  useEffect(() => {
    let cancelled = false;
    setSections(null);
    setError(null);
    setProgress({ done: 0, total: documents.length });
    buildWordSections(documents, (done, total) => {
      if (!cancelled) setProgress({ done, total });
    })
      .then((built) => {
        if (!cancelled) setSections(built);
      })
      .catch((err) => {
        console.error("Word view conversion failed:", err);
        if (!cancelled) setError("Could not build the Word view. You can still download files below.");
      });
    return () => {
      cancelled = true;
    };
  }, [documents]);

  useEffect(() => {
    if (!sections || !highlightDocId) return;
    const el = sectionRefs.current[highlightDocId];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [sections, highlightDocId]);

  const handleDownloadWord = async () => {
    if (isExporting || documents.length === 0) return;
    setIsExporting(true);
    try {
      await downloadPatientDocumentsDocx(documents, {
        patientId: documents[0]?.patientId,
      });
    } catch (err) {
      console.error("Failed to download Word document:", err);
      setError("Could not generate the Word file. Try again or download the originals.");
    } finally {
      setIsExporting(false);
    }
  };

  const total = documents.length;
  const ready = sections !== null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center space-x-3 overflow-hidden">
            <div className="text-2xl text-blue-600">
              <i className="fa-solid fa-file-word" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-base font-bold text-slate-900" title="Document Library">
                Document Library — Word View
              </h3>
              <p className="text-xs text-slate-500">
                {total} file{total === 1 ? "" : "s"} • one Word document
                {highlightedDoc ? ` • showing ${highlightedDoc.name}` : ""}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleDownloadWord}
              disabled={!ready || isExporting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              title="Download the combined Word document"
            >
              <i className={`fa-solid ${isExporting ? "fa-spinner fa-spin" : "fa-download"} text-xs`} />
              Download Word (.docx)
            </button>
            {highlightedDoc && (
              <button
                type="button"
                onClick={() => onDownloadOriginal(highlightedDoc)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                title="Download the original file"
              >
                <i className="fa-solid fa-file-arrow-down text-xs" />
                Original File
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close preview"
            >
              <i className="fa-solid fa-xmark text-base" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="min-h-[300px] flex-1 overflow-auto bg-slate-100 p-4">
          {error && (
            <div className="mx-auto max-w-2xl rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <i className="fa-solid fa-triangle-exclamation mr-2" />
              {error}
              {highlightedDoc && (
                <button
                  type="button"
                  onClick={() => onDownloadOriginal(highlightedDoc)}
                  className="ml-3 underline hover:text-amber-900"
                >
                  Download original
                </button>
              )}
            </div>
          )}

          {!ready && !error && (
            <div className="flex h-full min-h-[260px] flex-col items-center justify-center py-12 text-center">
              <i className="fa-solid fa-arrows-rotate fa-spin mb-4 text-3xl text-blue-600" />
              <p className="text-sm font-semibold text-slate-700">
                Building the Word document…
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {progress.total > 0
                  ? `Converted ${progress.done} of ${progress.total} file${progress.total === 1 ? "" : "s"}`
                  : "Preparing files"}
              </p>
            </div>
          )}

          {ready && (
            <div className="mx-auto max-w-3xl rounded-lg bg-white p-8 shadow-sm">
              <div className="mb-6 border-b border-slate-200 pb-4">
                <h2 className="text-xl font-bold text-slate-900">Document Library</h2>
                <p className="mt-1 text-xs text-slate-500">
                  All {total} uploaded file{total === 1 ? "" : "s"} combined into one Word document.
                  PDFs and office documents are converted to editable Word content; images are embedded.
                </p>
              </div>

              {sections!.length === 0 && (
                <p className="text-sm italic text-slate-400">No documents uploaded</p>
              )}

              {sections!.map((section) => (
                <section
                  key={section.docId}
                  ref={(el) => {
                    sectionRefs.current[section.docId] = el;
                  }}
                  data-doc-id={section.docId}
                  className={`mb-8 scroll-mt-6 rounded-lg border-l-4 border-blue-700 pl-4 ${
                    section.docId === highlightDocId ? "bg-blue-50/60 ring-2 ring-blue-300" : ""
                  }`}
                >
                  <h3 className="text-base font-bold text-indigo-800">{section.fileName}</h3>
                  <p className="mb-2 text-xs text-slate-500">
                    {section.typeLabel} &nbsp;•&nbsp; {section.sizeLabel} &nbsp;•&nbsp; {section.uploadedAt}
                  </p>
                  {section.note && (
                    <p className="mb-2 rounded border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs italic text-amber-700">
                      {section.note}
                    </p>
                  )}
                  {section.blocks.length === 0 && !section.note && (
                    <p className="text-sm italic text-slate-400">
                      No viewable content for this file type — use Original File to download it.
                    </p>
                  )}
                  {section.blocks.map((block, blockIndex) => {
                    if (block.kind === "image") return <PreviewImage key={blockIndex} block={block} />;
                    if (block.kind === "table") return <TableBlock key={blockIndex} block={block} />;
                    return (
                      <p key={blockIndex} className={paragraphClass(block.style)}>
                        {block.style === "bullet" && <span className="mr-1">•</span>}
                        {block.text}
                      </p>
                    );
                  })}
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WordLibraryPreview;
