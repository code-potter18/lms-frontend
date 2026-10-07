/**
 * Combined Word engine for the Document Library.
 *
 * Turns every uploaded file into Word content so the library can be shown
 * and downloaded as ONE .docx that contains all files:
 *   - images (jpg/png/webp/gif/bmp)      -> embedded inline
 *   - PDF                                -> text extracted as editable Word
 *                                           paragraphs (scanned pages with no
 *                                           text fall back to page images)
 *   - DOCX                               -> paragraphs / headings / tables extracted
 *   - legacy DOC                         -> best-effort text extraction
 *   - TXT / CSV                          -> plain text
 *   - anything else (xls, ppt, ...)      -> indexed with a note (not convertible)
 *
 * The same sections feed both the .docx generators and the in-app
 * "Word view" preview component.
 */

import {
  AlignmentType,
  BorderStyle,
  ImageRun,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import JSZip from "jszip";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import API from "../api/axios";
import { formatFileSize, type PatientDocumentItem } from "./patientDocuments";

/* ---------------- Types ---------------- */

export type WordImageFormat = "jpg" | "png" | "gif" | "bmp";

export type WordBlock =
  | {
      kind: "paragraph";
      text: string;
      style?: "heading1" | "heading2" | "heading3" | "bullet" | "note";
      bold?: boolean;
    }
  | { kind: "table"; rows: string[][] }
  | {
      kind: "image";
      bytes: Uint8Array;
      format: WordImageFormat;
      width: number;
      height: number;
      caption?: string;
    };

export type WordSectionSource =
  | "image"
  | "pdf"
  | "docx"
  | "doc"
  | "text"
  | "indexed";

export interface WordSection {
  docId: string;
  fileName: string;
  typeLabel: string;
  sizeLabel: string;
  uploadedAt: string;
  source: WordSectionSource;
  blocks: WordBlock[];
  note?: string;
}

export type WordSectionsProgress = (done: number, total: number) => void;

/* ---------------- Shared styling (docx) ---------------- */

const ACCENT = "004785";
const HEADING = "312E81";
const MUTED = "64748B";
const BODY = "1E293B";
const BORDER = "E2E8F0";
const ALT_ROW = "F7F9FB";
const EMPTY = "94A3B8";

const CELL_MARGINS = { top: 60, bottom: 60, left: 100, right: 100 };
const TABLE_BORDER = { style: BorderStyle.SINGLE, size: 4, color: BORDER };

const MAX_IMAGE_WIDTH = 620;
const MAX_IMAGE_HEIGHT = 620;

/* Safety caps so a huge upload cannot freeze the browser. */
const PDF_PAGE_CAP = 100; // pages rendered as images (scanned fallback)
const PDF_TEXT_PAGE_CAP = 300; // pages read via text extraction
const TEXT_CHAR_BUDGET = 400_000;
const LEGACY_DOC_MIN_RUN = 40;

/* ---------------- Helpers ---------------- */

function extOf(name: string): string {
  const dot = (name || "").lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function typeLabelOf(doc: PatientDocumentItem): string {
  const ext = extOf(doc.originalName || doc.name);
  if (ext) return ext.toUpperCase();
  const subtype = (doc.type || "").split("/").pop();
  return (subtype || "FILE").toUpperCase();
}

function fitWithin(
  width: number,
  height: number
): { width: number; height: number } {
  if (width <= MAX_IMAGE_WIDTH && height <= MAX_IMAGE_HEIGHT) {
    return { width, height };
  }
  const scale = Math.min(MAX_IMAGE_WIDTH / width, MAX_IMAGE_HEIGHT / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function fetchDocumentBytes(
  doc: PatientDocumentItem
): Promise<Uint8Array> {
  if (doc.blob) {
    return new Uint8Array(await doc.blob.arrayBuffer());
  }
  try {
    const response = await API.get<ArrayBuffer | ArrayBufferView>(
      `/patient-documents/${encodeURIComponent(doc.id)}/download`,
      { responseType: "arraybuffer" }
    );
    const data = response.data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView(data)) {
      return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }
  } catch {
    /* fall through to the view URL */
  }
  if (doc.url) {
    const response = await fetch(doc.url);
    if (!response.ok) throw new Error(`Download failed (${response.status})`);
    return new Uint8Array(await response.arrayBuffer());
  }
  throw new Error("Document bytes are unavailable");
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  return bytes.slice();
}

/* ---------------- Image extraction ---------------- */

const DIRECT_FORMAT_BY_EXT: Record<string, WordImageFormat> = {
  jpg: "jpg",
  jpeg: "jpg",
  png: "png",
  gif: "gif",
  bmp: "bmp",
};

async function imageToPng(bitmap: ImageBitmap): Promise<Uint8Array | null> {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png")
    );
    if (!blob) return null;
    return new Uint8Array(await blob.arrayBuffer());
  } catch {
    return null;
  }
}

async function extractImageSection(
  doc: PatientDocumentItem,
  bytes: Uint8Array
): Promise<WordSection> {
  const base: WordSection = {
    docId: doc.id,
    fileName: doc.name,
    typeLabel: typeLabelOf(doc),
    sizeLabel: formatFileSize(doc.size),
    uploadedAt: doc.uploadDate,
    source: "image",
    blocks: [],
  };

  const ext = extOf(doc.name);
  const mime = doc.type || `image/${ext === "jpg" ? "jpeg" : ext}`;
  try {
    const bitmap = await createImageBitmap(
      new Blob([copyBytes(bytes).buffer as ArrayBuffer], { type: mime })
    );
    let outBytes = bytes;
    let format = DIRECT_FORMAT_BY_EXT[ext];
    if (!format && mime.includes("jpeg")) format = "jpg";
    if (!format && mime.includes("png")) format = "png";

    if (!format) {
      /* webp, svg, or anything the browser decodes but Word cannot embed */
      const png = await imageToPng(bitmap);
      if (!png) {
        bitmap.close?.();
        return {
          ...base,
          source: "indexed",
          note: "This image format cannot be embedded in Word. Download the original to view it.",
        };
      }
      outBytes = png;
      format = "png";
    }

    const dims = fitWithin(bitmap.width, bitmap.height);
    bitmap.close?.();
    base.blocks = [
      {
        kind: "image",
        bytes: outBytes,
        format,
        width: dims.width,
        height: dims.height,
        caption: `${doc.name}  •  ${formatFileSize(doc.size)}  •  ${doc.uploadDate}`,
      },
    ];
    return base;
  } catch {
    return {
      ...base,
      source: "indexed",
      note: "This image could not be converted for Word. Download the original to view it.",
    };
  }
}

/* ---------------- PDF extraction ---------------- */

interface PdfTextItem {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
  hasEOL?: boolean;
}

interface PdfLine {
  text: string;
  size: number;
  y: number;
}

/** An image (logo/graphic) extracted from a PDF page's operator list. */
interface PdfPageImage {
  y: number;
  bytes: Uint8Array;
  width: number;
  height: number;
}

type PdfPagePlan =
  | { pageNum: number; kind: "text"; lines: PdfLine[]; images: PdfPageImage[] }
  | { pageNum: number; kind: "image"; block: WordBlock };

function itemFontSize(item: PdfTextItem): number {
  const t = item.transform;
  if (t && t.length >= 4) {
    const scale = Math.hypot(t[2], t[3]);
    if (scale > 0.5) return scale;
  }
  if (item.height && item.height > 0.5) return item.height;
  return 10;
}

/** Group pdf.js text items into visual lines (PDF y grows upward). */
async function pageTextLines(page: {
  getTextContent: () => Promise<{ items: unknown[] }>;
}): Promise<PdfLine[]> {
  let content: { items: unknown[] };
  try {
    content = await page.getTextContent();
  } catch {
    return [];
  }
  const items = (content.items || []).filter(
    (it): it is PdfTextItem => Boolean(it) && typeof (it as PdfTextItem).str === "string"
  );

  const lines: PdfLine[] = [];
  let current: { parts: string[]; size: number; y: number } | null = null;
  let prevEnd: { x: number; width: number } | null = null;

  const flush = () => {
    if (!current) return;
    const text = current.parts.join("").replace(/\s+/g, " ").trim();
    if (text) lines.push({ text, size: current.size, y: current.y });
    current = null;
    prevEnd = null;
  };

  for (const item of items) {
    const str = item.str || "";
    const t = item.transform || [1, 0, 0, 1, 0, 0];
    const x = t[4];
    const y = t[5];
    const size = itemFontSize(item);

    const newLine =
      !current || Math.abs(current.y - y) > Math.max(1.5, size * 0.6);
    if (newLine) {
      flush();
      if (str) current = { parts: [str], size, y };
      prevEnd = { x, width: item.width || 0 };
      if (item.hasEOL) flush();
      continue;
    }
    if (!current) continue;

    if (str) {
      const gap = x - (prevEnd ? prevEnd.x + prevEnd.width : x);
      let sep = "";
      if (prevEnd && gap > size * 3) sep = " | ";
      else if (prevEnd && gap > Math.max(0.5, size * 0.2)) sep = " ";
      current.parts.push(sep + str);
      current.size = Math.max(current.size, size);
    }
    prevEnd = { x, width: item.width || 0 };
    if (item.hasEOL) flush();
  }
  flush();
  return lines;
}

function median(values: number[]): number {
  if (values.length === 0) return 10;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function multiplyAffine(m: number[], n: number[]): number[] {
  return [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5],
  ];
}

/** Encode raw PDF image pixels (RGBA / RGB / packed 1-bit gray) as PNG. */
function rawImageToPng(
  data: Uint8Array,
  width: number,
  height: number,
  channels: 1 | 3 | 4
): Promise<Uint8Array | null> {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const imageData = ctx.createImageData(width, height);
    const out = imageData.data;
    const pixels = width * height;

    if (channels === 4) {
      if (data.length < pixels * 4) return null;
      out.set(data.subarray(0, pixels * 4));
    } else if (channels === 3) {
      if (data.length < pixels * 3) return null;
      for (let i = 0, j = 0; i < pixels; i++, j += 3) {
        const k = i * 4;
        out[k] = data[j];
        out[k + 1] = data[j + 1];
        out[k + 2] = data[j + 2];
        out[k + 3] = 255;
      }
    } else {
      const rowBytes = Math.ceil(width / 8);
      if (data.length < rowBytes * height) return null;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const bit = (data[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
          const k = (y * width + x) * 4;
          const v = bit ? 255 : 0;
          out[k] = v;
          out[k + 1] = v;
          out[k + 2] = v;
          out[k + 3] = 255;
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return new Promise<Uint8Array | null>((resolve) => {
      canvas.toBlob(async (blob) => {
        resolve(blob ? new Uint8Array(await blob.arrayBuffer()) : null);
      }, "image/png");
    });
  } catch {
    return null;
  }
}

/**
 * Walk a page's operator list and pull out embedded raster images
 * (logos, charts, photos) with their vertical position so they can be
 * interleaved with the extracted text. Masks/repeats/shadings are skipped.
 */
async function extractPageEmbeddedImages(
  pdfjs: { OPS?: Record<string, number> },
  page: {
    getOperatorList: () => Promise<{ fnArray: number[]; argsArray: any[] }>;
    commonObjs: { get: (id: string) => any };
    objs?: { get: (id: string) => any };
  }
): Promise<PdfPageImage[]> {
  if (typeof document === "undefined" || !pdfjs.OPS) return [];
  const OPS = pdfjs.OPS;
  const MAX_PAGE_IMAGES = 8;

  let opList: { fnArray: number[]; argsArray: any[] };
  try {
    opList = await page.getOperatorList();
  } catch {
    return [];
  }

  const out: PdfPageImage[] = [];
  const stack: number[][] = [];
  let ctm = [1, 0, 0, 1, 0, 0];

  const encode = async (
    img: { width?: number; height?: number; data?: Uint8Array; imageMask?: boolean },
    y: number
  ) => {
    if (out.length >= MAX_PAGE_IMAGES) return;
    const w = Math.floor(img.width || 0);
    const h = Math.floor(img.height || 0);
    const data = img.data as Uint8Array | undefined;
    if (w < 2 || h < 2 || !data || img.imageMask) return;
    let channels: 1 | 3 | 4;
    if (data.length >= w * h * 4) channels = 4;
    else if (data.length >= w * h * 3) channels = 3;
    else if (data.length >= Math.ceil(w / 8) * h) channels = 1;
    else return;
    const png = await rawImageToPng(data, w, h, channels);
    if (!png) return;
    out.push({ y, bytes: png, width: w, height: h });
  };

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    const args = opList.argsArray[i];
    if (fn === OPS.save) {
      stack.push(ctm.slice());
      continue;
    }
    if (fn === OPS.restore) {
      const prev = stack.pop();
      if (prev) ctm = prev;
      continue;
    }
    if (fn === OPS.transform) {
      ctm = multiplyAffine(ctm, (args as number[]) || ctm);
      continue;
    }
    if (fn === OPS.paintImageXObject) {
      const id = args?.[0];
      if (typeof id !== "string") continue;
      /* Decoded images live in the page-specific store; fonts (rarely
         useful here) live in the shared common store. */
      let obj: any = null;
      try {
        obj = page.objs?.get(id) ?? null;
      } catch {
        /* not resolved in page store — try common below */
      }
      if (!obj) {
        try {
          obj = page.commonObjs.get(id);
        } catch {
          continue;
        }
      }
      if (obj && typeof obj === "object") {
        await encode(
          {
            ...obj,
            width: obj.width ?? args?.[1],
            height: obj.height ?? args?.[2],
          },
          ctm[5]
        );
      }
      continue;
    }
    if (fn === OPS.paintInlineImageXObject) {
      const obj = args?.[0];
      if (obj && typeof obj === "object") await encode(obj, ctm[5]);
      continue;
    }
    if (fn === OPS.drawImage) {
      const obj = args?.[0];
      const matrix = args?.[1];
      const y =
        Array.isArray(matrix) && typeof matrix[5] === "number" ? matrix[5] : ctm[5];
      if (obj && typeof obj === "object") await encode(obj, y);
      continue;
    }
    /* paintImageMaskXObject / paintImageXObjectRepeat / shadings: skipped */
  }
  return out;
}

/** Merge a page's visual lines (and extracted logo images) into Word paragraphs. */
function pageLinesToBlocks(
  lines: PdfLine[],
  bodySize: number,
  images: PdfPageImage[] = []
): WordBlock[] {
  type PageEvent = { y: number; line?: PdfLine; image?: PdfPageImage };
  const events: PageEvent[] = [
    ...lines.map((line) => ({ y: line.y, line })),
    ...images.map((image) => ({ y: image.y, image })),
  ].sort((a, b) => b.y - a.y);

  const blocks: WordBlock[] = [];
  let current: { parts: string[] } | null = null;
  let prevLine: PdfLine | null = null;

  const flush = () => {
    if (!current) return;
    const text = current.parts.join(" ").replace(/\s+/g, " ").trim();
    if (text) blocks.push({ kind: "paragraph", text });
    current = null;
  };

  for (const event of events) {
    if (event.image) {
      flush();
      prevLine = null;
      blocks.push({
        kind: "image",
        bytes: event.image.bytes,
        format: "png",
        width: event.image.width,
        height: event.image.height,
      });
      continue;
    }
    const line = event.line;
    if (!line) continue;
    const text = line.text.trim();
    if (!text) continue;

    if (line.size >= bodySize * 1.25 && text.length <= 140) {
      flush();
      blocks.push({
        kind: "paragraph",
        text,
        style: line.size >= bodySize * 1.55 ? "heading1" : "heading2",
      });
      prevLine = line;
      continue;
    }

    const bullet = /^\s*[•▪·*]\s+/.test(text) || /^\s*-\s+/.test(text);
    if (bullet) {
      flush();
      blocks.push({
        kind: "paragraph",
        text: text.replace(/^\s*[•▪·*]\s+/, "").replace(/^\s*-\s+/, ""),
        style: "bullet",
      });
      prevLine = line;
      continue;
    }

    const gapAbove = prevLine ? prevLine.y - line.y : 0;
    const sameParagraph =
      current !== null &&
      prevLine !== null &&
      gapAbove > 0 &&
      gapAbove <= Math.max(prevLine.size, line.size) * 2;

    if (!sameParagraph) flush();
    if (!current) current = { parts: [text] };
    else current.parts.push(text);
    prevLine = line;
  }
  flush();
  return blocks;
}

/** Render a single PDF page to a JPEG block — only for pages with no text. */
async function renderPdfPageToImageBlock(
  page: {
    getViewport: (opts: { scale: number }) => { width: number; height: number };
    render: (opts: { canvas: HTMLCanvasElement; viewport: unknown }) => { promise: Promise<void> };
  },
  pageNum: number,
  total: number
): Promise<WordBlock | null> {
  try {
    const viewport = page.getViewport({ scale: 1.7 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const renderTask = page.render({ canvas, viewport });
    await renderTask.promise;

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9)
    );
    canvas.width = 0;
    canvas.height = 0;
    if (!blob) return null;
    return {
      kind: "image",
      bytes: new Uint8Array(await blob.arrayBuffer()),
      format: "jpg",
      width: Math.round(viewport.width),
      height: Math.round(viewport.height),
      caption: `Page ${pageNum} of ${total} (no extractable text — scanned page)`,
    };
  } catch {
    return null;
  }
}

/**
 * PDF → Word: extract the actual text of every page as editable Word
 * paragraphs (headings, bullets, wrapped lines). Only pages that carry no
 * text at all (scanned/image PDFs) fall back to a rendered page image.
 */
async function extractPdfSection(
  doc: PatientDocumentItem,
  bytes: Uint8Array
): Promise<WordSection> {
  const base: WordSection = {
    docId: doc.id,
    fileName: doc.name,
    typeLabel: typeLabelOf(doc),
    sizeLabel: formatFileSize(doc.size),
    uploadedAt: doc.uploadDate,
    source: "pdf",
    blocks: [],
  };

  try {
    /* pdf.js reads document fingerprints via Uint8Array.prototype.toHex and
       tracks operator state via Map.prototype.getOrInsert(Computed) — TC39
       proposals — polyfill them when the runtime lacks them. */
    const u8 = Uint8Array.prototype as unknown as { toHex?: () => string };
    if (typeof u8.toHex !== "function") {
      u8.toHex = function (this: Uint8Array) {
        let out = "";
        for (let i = 0; i < this.length; i++) {
          out += this[i].toString(16).padStart(2, "0");
        }
        return out;
      };
    }
    const mapProto = Map.prototype as unknown as {
      getOrInsert?: <K, V>(key: K, value: V) => V;
      getOrInsertComputed?: <K, V>(key: K, compute: (key: K) => V) => V;
    };
    if (typeof mapProto.getOrInsert !== "function") {
      mapProto.getOrInsert = function <K, V>(key: K, value: V): V {
        if (this.has(key)) return this.get(key) as V;
        this.set(key, value);
        return value;
      };
    }
    if (typeof mapProto.getOrInsertComputed !== "function") {
      mapProto.getOrInsertComputed = function <K, V>(key: K, compute: (key: K) => V): V {
        if (this.has(key)) return this.get(key) as V;
        const value = compute(key);
        this.set(key, value);
        return value;
      };
    }

    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

    const task = pdfjs.getDocument({ data: copyBytes(bytes) });
    const pdf = await task.promise;
    const total = pdf.numPages;
    const pageCount = Math.min(total, PDF_TEXT_PAGE_CAP);

    const plans: PdfPagePlan[] = [];
    let textPageCount = 0;
    let imagePageCount = 0;
    let skippedPages = 0;

    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const lines = await pageTextLines(page);
      if (lines.length > 0) {
        textPageCount += 1;
        const images = await extractPageEmbeddedImages(pdfjs, page);
        plans.push({ pageNum, kind: "text", lines, images });
      } else if (pageNum <= PDF_PAGE_CAP) {
        const block = await renderPdfPageToImageBlock(page, pageNum, total);
        if (block) {
          imagePageCount += 1;
          plans.push({ pageNum, kind: "image", block });
        } else {
          skippedPages += 1;
        }
      } else {
        skippedPages += 1;
      }
      page.cleanup();
    }

    const bodySize = median(
      plans.flatMap((plan) => (plan.kind === "text" ? plan.lines.map((l) => l.size) : []))
    );

    let anyPageBefore = false;
    for (const plan of plans) {
      if (plan.kind === "text") {
        if (anyPageBefore && total > 1) {
          base.blocks.push({
            kind: "paragraph",
            text: `Page ${plan.pageNum} of ${total}`,
            style: "note",
          });
        }
        base.blocks.push(...pageLinesToBlocks(plan.lines, bodySize, plan.images));
      } else {
        base.blocks.push(plan.block);
      }
      anyPageBefore = true;
    }

    const plural = (n: number) => (n === 1 ? "" : "s");
    const notes: string[] = [];
    if (pageCount < total) {
      notes.push(
        `Showing the first ${pageCount} of ${total} PDF pages. Download the original for the complete file.`
      );
    }
    if (plans.length === 0) {
      base.note =
        "This PDF has no content that could be converted into Word. Download the original to view it.";
      await task.destroy();
      return base;
    }
    if (textPageCount > 0) {
      notes.push(
        `Text from ${textPageCount} page${plural(textPageCount)} converted into editable Word content.` +
          (imagePageCount > 0
            ? ` ${imagePageCount} scanned page${plural(imagePageCount)} (no text) shown as image${plural(imagePageCount)}.`
            : "")
      );
    } else {
      notes.push(
        `No extractable text in this PDF — ${imagePageCount} page${plural(imagePageCount)} shown as image${plural(imagePageCount)}.`
      );
    }
    if (skippedPages > 0) {
      notes.push(`${skippedPages} page${plural(skippedPages)} beyond the page limit skipped.`);
    }
    base.note = notes.join(" ");

    await task.destroy();
    return base;
  } catch (error) {
    console.error("PDF to Word conversion failed:", doc.name, error);
    return {
      ...base,
      source: "indexed",
      note: "This PDF could not be converted into Word. Download the original to view it.",
    };
  }
}

/* ---------------- DOCX extraction ---------------- */

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function attrW(el: Element, name: string): string | null {
  return el.getAttributeNS(WORD_NS, name) ?? el.getAttribute(`w:${name}`);
}

function elementChildren(el: Element, local: string): Element[] {
  const out: Element[] = [];
  for (let i = 0; i < el.children.length; i++) {
    const child = el.children[i];
    if (child.localName === local) out.push(child);
  }
  return out;
}

function paragraphText(p: Element): string {
  let text = "";
  const all = p.getElementsByTagName("*");
  for (let i = 0; i < all.length; i++) {
    const node = all[i];
    if (node.localName === "t") text += node.textContent ?? "";
    else if (node.localName === "tab") text += " ";
    else if (node.localName === "br" || node.localName === "cr") text += "\n";
  }
  return text;
}

function paragraphStyle(
  p: Element
): "heading1" | "heading2" | "heading3" | "bullet" | undefined {
  const styleEl = elementChildren(p, "pPr")[0];
  if (!styleEl) return undefined;
  const numPr = elementChildren(styleEl, "numPr");
  const pStyle = elementChildren(styleEl, "pStyle")[0];
  const val = (pStyle ? attrW(pStyle, "val") : "") || "";
  const heading = /^Heading([1-6])$/.exec(val);
  if (heading) {
    const level = Number(heading[1]);
    return level <= 1 ? "heading1" : level === 2 ? "heading2" : "heading3";
  }
  if (val === "Title") return "heading1";
  if (val === "Subtitle") return "heading2";
  if (numPr.length > 0) return "bullet";
  return undefined;
}

async function extractDocxSection(
  doc: PatientDocumentItem,
  bytes: Uint8Array
): Promise<WordSection> {
  const base: WordSection = {
    docId: doc.id,
    fileName: doc.name,
    typeLabel: typeLabelOf(doc),
    sizeLabel: formatFileSize(doc.size),
    uploadedAt: doc.uploadDate,
    source: "docx",
    blocks: [],
  };

  try {
    const zip = await JSZip.loadAsync(copyBytes(bytes));
    const entry = zip.file("word/document.xml");
    if (!entry) throw new Error("Not a Word document");
    const xml = await entry.async("string");
    const parsed = new DOMParser().parseFromString(xml, "application/xml");
    const body = parsed.getElementsByTagNameNS(WORD_NS, "body")[0];
    if (!body) throw new Error("Missing document body");

    let budget = TEXT_CHAR_BUDGET;
    let truncated = false;

    const pushParagraph = (
      text: string,
      style?: "heading1" | "heading2" | "heading3" | "bullet"
    ) => {
      const trimmed = text.replace(/\s+$/g, "");
      if (!trimmed.trim()) return;
      if (budget <= 0) {
        truncated = true;
        return;
      }
      budget -= trimmed.length;
      base.blocks.push({ kind: "paragraph", text: trimmed, style });
    };

    for (let i = 0; i < body.children.length && budget > 0; i++) {
      const node = body.children[i];
      if (node.localName === "p") {
        pushParagraph(paragraphText(node), paragraphStyle(node));
      } else if (node.localName === "tbl") {
        const rows: string[][] = [];
        for (const tr of elementChildren(node, "tr")) {
          const row: string[] = [];
          for (const tc of elementChildren(tr, "tc")) {
            const texts = elementChildren(tc, "p")
              .map((p) => paragraphText(p).trim())
              .filter(Boolean);
            row.push(texts.join(" "));
          }
          if (row.length > 0) rows.push(row);
        }
        if (rows.length > 0) {
          budget -= rows.flat().join("").length;
          base.blocks.push({ kind: "table", rows });
        }
      }
    }

    if (base.blocks.length === 0) {
      base.note =
        "No readable text found in this Word file. Download the original to view it.";
    } else if (truncated) {
      base.note =
        "Very large Word file — showing the first part of its content in this document.";
    }
    return base;
  } catch (error) {
    console.error("DOCX to Word extraction failed:", doc.name, error);
    return {
      ...base,
      source: "indexed",
      note: "This Word file could not be read. Download the original to view it.",
    };
  }
}

/* ---------------- Legacy .doc extraction (best effort) ---------------- */

function isPrintableAscii(code: number): boolean {
  return (
    code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 126)
  );
}

function isPrintableWide(code: number): boolean {
  if (code === 9 || code === 10 || code === 13) return true;
  if (code >= 32 && code <= 126) return true;
  if (code >= 0xa0 && code <= 0x2fff) return true;
  if (code >= 0x3000 && code <= 0xfffd) {
    return !(code >= 0xd800 && code <= 0xdfff);
  }
  return false;
}

function looksLikeProse(text: string): boolean {
  if (text.length < LEGACY_DOC_MIN_RUN) return false;
  let letters = 0;
  let spaces = 0;
  for (const ch of text) {
    if (/[a-zA-Z]/.test(ch)) letters += 1;
    else if (ch === " " || ch === "\n" || ch === "\r" || ch === "\t") {
      spaces += 1;
    }
  }
  return (letters + spaces) / text.length >= 0.55;
}

function extractLegacyDocText(bytes: Uint8Array): string {
  const runs: string[] = [];

  /* UTF-16LE pass (Word stores text this way for many documents). */
  for (const offset of [0, 1]) {
    let current = "";
    for (let i = offset; i + 1 < bytes.length; i += 2) {
      const code = bytes[i] | (bytes[i + 1] << 8);
      if (isPrintableWide(code)) {
        current += String.fromCharCode(code);
        if (current.length > 100_000) {
          runs.push(current);
          current = "";
        }
      } else {
        if (current.length >= LEGACY_DOC_MIN_RUN) runs.push(current);
        current = "";
      }
    }
    if (current.length >= LEGACY_DOC_MIN_RUN) runs.push(current);
  }

  /* Single-byte pass (CP1252 / ASCII). */
  let ascii = "";
  for (let i = 0; i < bytes.length; i++) {
    const code = bytes[i];
    if (isPrintableAscii(code)) {
      ascii += String.fromCharCode(code);
      if (ascii.length > 100_000) {
        runs.push(ascii);
        ascii = "";
      }
    } else {
      if (ascii.length >= LEGACY_DOC_MIN_RUN) runs.push(ascii);
      ascii = "";
    }
  }
  if (ascii.length >= LEGACY_DOC_MIN_RUN) runs.push(ascii);

  const seen = new Set<string>();
  const parts: string[] = [];
  let budget = TEXT_CHAR_BUDGET;
  for (const run of runs.sort((a, b) => b.length - a.length)) {
    const text = run.replace(/[ \t]+/g, " ").replace(/\r/g, "\n").trim();
    if (!looksLikeProse(text)) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    parts.push(text);
    budget -= text.length;
    if (budget <= 0) break;
  }
  return parts.join("\n\n");
}

async function extractLegacyDocSection(
  doc: PatientDocumentItem,
  bytes: Uint8Array
): Promise<WordSection> {
  const base: WordSection = {
    docId: doc.id,
    fileName: doc.name,
    typeLabel: typeLabelOf(doc),
    sizeLabel: formatFileSize(doc.size),
    uploadedAt: doc.uploadDate,
    source: "doc",
    blocks: [],
  };

  const text = extractLegacyDocText(bytes);
  if (text.length < LEGACY_DOC_MIN_RUN) {
    return {
      ...base,
      source: "indexed",
      note: "Text could not be extracted from this legacy .doc file. Download the original to view it.",
    };
  }
  base.blocks = [
    { kind: "paragraph", text: "Best-effort text extracted from the legacy .doc file:", style: "note" },
    ...text
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .map((paragraph): WordBlock => ({ kind: "paragraph", text: paragraph })),
  ];
  return base;
}

/* ---------------- Plain text (txt / csv) ---------------- */

async function extractTextSection(
  doc: PatientDocumentItem,
  bytes: Uint8Array
): Promise<WordSection> {
  const text = new TextDecoder("utf-8").decode(bytes);
  const lines = text.split(/\r?\n/);
  const blocks: WordBlock[] = [];
  let budget = TEXT_CHAR_BUDGET;
  let truncated = false;
  for (const line of lines) {
    if (budget <= 0) {
      truncated = true;
      break;
    }
    budget -= line.length;
    if (line.trim()) blocks.push({ kind: "paragraph", text: line });
  }
  return {
    docId: doc.id,
    fileName: doc.name,
    typeLabel: typeLabelOf(doc),
    sizeLabel: formatFileSize(doc.size),
    uploadedAt: doc.uploadDate,
    source: "text",
    blocks,
    note: truncated
      ? "Very large file — showing the first part of its content."
      : undefined,
  };
}

/* ---------------- Section routing ---------------- */

function indexedSection(doc: PatientDocumentItem, note: string): WordSection {
  return {
    docId: doc.id,
    fileName: doc.name,
    typeLabel: typeLabelOf(doc),
    sizeLabel: formatFileSize(doc.size),
    uploadedAt: doc.uploadDate,
    source: "indexed",
    blocks: [],
    note,
  };
}

async function buildSectionForDocument(
  doc: PatientDocumentItem
): Promise<WordSection> {
  const name = (doc.originalName || doc.name || "").toLowerCase();
  const ext = extOf(name);
  const mime = (doc.type || "").toLowerCase();

  const isImage =
    ext in DIRECT_FORMAT_BY_EXT ||
    ext === "webp" ||
    ext === "svg" ||
    mime.startsWith("image/");

  const kind: "image" | "pdf" | "docx" | "doc" | "text" | "indexed" =
    isImage
      ? "image"
      : ext === "pdf" || mime === "application/pdf"
        ? "pdf"
        : ext === "docx" ||
            mime ===
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          ? "docx"
          : ext === "doc" || mime === "application/msword"
            ? "doc"
            : ext === "txt" || ext === "csv" || mime.startsWith("text/")
              ? "text"
              : "indexed";

  if (kind === "indexed") {
    return indexedSection(
      doc,
      "This file type cannot be converted into Word — it is listed in the document index. Download the original to view it."
    );
  }

  let bytes: Uint8Array;
  try {
    bytes = await fetchDocumentBytes(doc);
  } catch (error) {
    console.error("Failed to read document for Word view:", doc.name, error);
    return indexedSection(
      doc,
      "File content could not be loaded right now. Download the original to view it."
    );
  }

  switch (kind) {
    case "image":
      return extractImageSection(doc, bytes);
    case "pdf":
      return extractPdfSection(doc, bytes);
    case "docx":
      return extractDocxSection(doc, bytes);
    case "doc":
      return extractLegacyDocSection(doc, bytes);
    case "text":
      return extractTextSection(doc, bytes);
    default:
      return indexedSection(
        doc,
        "This file type cannot be converted into Word — it is listed in the document index. Download the original to view it."
      );
  }
}

/**
 * Build Word content sections for every uploaded document, in library order.
 */
export async function buildWordSections(
  documents: readonly PatientDocumentItem[],
  onProgress?: WordSectionsProgress
): Promise<WordSection[]> {
  const sections: WordSection[] = [];
  const total = documents.length;
  let done = 0;
  onProgress?.(0, total);
  for (const doc of documents) {
    sections.push(await buildSectionForDocument(doc));
    done += 1;
    onProgress?.(done, total);
  }
  return sections;
}

/* ---------------- Word sections -> docx children ---------------- */

function sectionHeading(fileName: string): Paragraph {
  return new Paragraph({
    spacing: { before: 300, after: 80 },
    border: { left: { style: BorderStyle.SINGLE, size: 24, color: ACCENT, space: 4 } },
    children: [new TextRun({ text: fileName, bold: true, size: 22, color: HEADING })],
  });
}

function metaLine(meta: string): Paragraph {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text: meta, size: 15, color: MUTED })],
  });
}

function noteLine(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 40, after: 80 },
    children: [new TextRun({ text, italics: true, size: 16, color: EMPTY })],
  });
}

function paragraphBlockToDocx(block: Extract<WordBlock, { kind: "paragraph" }>): Paragraph {
  const { text, style } = block;
  if (style === "heading1") {
    return new Paragraph({
      spacing: { before: 180, after: 80 },
      children: [new TextRun({ text, bold: true, size: 26, color: HEADING })],
    });
  }
  if (style === "heading2") {
    return new Paragraph({
      spacing: { before: 160, after: 60 },
      children: [new TextRun({ text, bold: true, size: 22, color: HEADING })],
    });
  }
  if (style === "heading3") {
    return new Paragraph({
      spacing: { before: 140, after: 60 },
      children: [new TextRun({ text, bold: true, size: 20, color: BODY })],
    });
  }
  if (style === "bullet") {
    return new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({ text: `•  ${text}`, size: 18, color: BODY })],
    });
  }
  if (style === "note") {
    return new Paragraph({
      spacing: { after: 80 },
      children: [new TextRun({ text, italics: true, size: 16, color: MUTED })],
    });
  }
  return new Paragraph({
    spacing: { after: 80 },
    children: [new TextRun({ text, size: 18, color: BODY })],
  });
}

function tableBlockToDocx(block: Extract<WordBlock, { kind: "table" }>): Table {
  const columnCount = Math.max(...block.rows.map((row) => row.length), 1);
  const percent = Math.floor(100 / columnCount);
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: TABLE_BORDER,
      bottom: TABLE_BORDER,
      left: TABLE_BORDER,
      right: TABLE_BORDER,
      insideHorizontal: TABLE_BORDER,
      insideVertical: TABLE_BORDER,
    },
    rows: block.rows.map(
      (row, rowIndex) =>
        new TableRow({
          children: Array.from({ length: columnCount }, (_, columnIndex) => {
            const isHeader = rowIndex === 0;
            return new TableCell({
              width: { size: percent, type: WidthType.PERCENTAGE },
              margins: CELL_MARGINS,
              verticalAlign: VerticalAlign.TOP,
              shading: isHeader
                ? { type: ShadingType.CLEAR, color: "auto", fill: "EEF2F7" }
                : rowIndex % 2 === 0
                  ? undefined
                  : { type: ShadingType.CLEAR, color: "auto", fill: ALT_ROW },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: row[columnIndex] || "-",
                      size: 16,
                      color: BODY,
                      bold: isHeader,
                    }),
                  ],
                }),
              ],
            });
          }),
        })
    ),
  });
}

function imageBlockToDocx(block: Extract<WordBlock, { kind: "image" }>): Paragraph[] {
  const children: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 40 },
      children: [
        new ImageRun({
          type: block.format,
          data: block.bytes,
          transformation: { width: block.width, height: block.height },
        }),
      ],
    }),
  ];
  if (block.caption) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 140 },
        children: [new TextRun({ text: block.caption, size: 15, color: MUTED })],
      })
    );
  }
  return children;
}

/**
 * Convert built Word sections into docx children (shared by both the
 * Document Library export and the consultation summary).
 */
export function wordSectionsToDocxChildren(
  sections: readonly WordSection[]
): (Paragraph | Table)[] {
  const children: (Paragraph | Table)[] = [];
  if (sections.length === 0) {
    children.push(noteLine("No documents uploaded"));
    return children;
  }
  for (const section of sections) {
    children.push(
      sectionHeading(section.fileName),
      metaLine(`${section.typeLabel}  •  ${section.sizeLabel}  •  ${section.uploadedAt}`)
    );
    if (section.note) children.push(noteLine(section.note));
    for (const block of section.blocks) {
      if (block.kind === "paragraph") children.push(paragraphBlockToDocx(block));
      else if (block.kind === "table") children.push(tableBlockToDocx(block));
      else children.push(...imageBlockToDocx(block));
    }
  }
  return children;
}
