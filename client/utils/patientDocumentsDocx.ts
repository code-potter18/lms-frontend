import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import { formatFileSize, type PatientDocumentItem } from "./patientDocuments";
import { buildWordSections, wordSectionsToDocxChildren } from "./combinedDocumentWord";

const TITLE_COLOR = "141E28";
const HEADING_COLOR = "312E81";
const ACCENT_COLOR = "004785";
const HEADER_FILL = "004785";
const ALT_ROW_FILL = "F7F9FB";
const BORDER_COLOR = "E2E8F0";
const MUTED_COLOR = "64748B";
const FADED_COLOR = "94A3B8";
const BODY_TEXT_COLOR = "1E293B";

const CELL_MARGINS = { top: 70, bottom: 70, left: 110, right: 110 };

function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function typeLabelOf(doc: PatientDocumentItem): string {
  const ext = extOf(doc.name);
  if (ext) return ext.toUpperCase();
  const subtype = (doc.type || "").split("/").pop();
  return (subtype || "FILE").toUpperCase();
}

function sectionHeading(title: string): Paragraph {
  return new Paragraph({
    spacing: { before: 260, after: 120 },
    border: { left: { style: BorderStyle.SINGLE, size: 24, color: ACCENT_COLOR, space: 6 } },
    indent: { left: 120 },
    children: [new TextRun({ text: title, bold: true, size: 22, color: HEADING_COLOR })],
  });
}

function mutedNote(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    children: [new TextRun({ text, italics: true, size: 18, color: FADED_COLOR })],
  });
}

function headerCell(label: string, widthPercent: number): TableCell {
  return new TableCell({
    width: { size: widthPercent, type: WidthType.PERCENTAGE },
    shading: { type: ShadingType.CLEAR, color: "auto", fill: HEADER_FILL },
    margins: CELL_MARGINS,
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        children: [new TextRun({ text: label, bold: true, size: 17, color: "FFFFFF" })],
      }),
    ],
  });
}

function bodyCell(text: string, widthPercent: number, fill?: string): TableCell {
  return new TableCell({
    width: { size: widthPercent, type: WidthType.PERCENTAGE },
    ...(fill
      ? { shading: { type: ShadingType.CLEAR, color: "auto", fill } }
      : {}),
    margins: CELL_MARGINS,
    children: [
      new Paragraph({
        children: [
          new TextRun({ text: text || "-", size: 17, color: BODY_TEXT_COLOR }),
        ],
      }),
    ],
  });
}

function emptyRow(message: string, columnSpan: number): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        columnSpan,
        margins: CELL_MARGINS,
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: message, italics: true, size: 17, color: FADED_COLOR }),
            ],
          }),
        ],
      }),
    ],
  });
}

function buildTable(rows: TableRow[]): Table {
  const border = { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: border,
      bottom: border,
      left: border,
      right: border,
      insideHorizontal: border,
      insideVertical: border,
    },
    rows,
  });
}

function buildFooter(generatedAt: string): Footer {
  return new Footer({
    children: [
      new Paragraph({
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR, space: 6 } },
        spacing: { before: 60, after: 0 },
        children: [new TextRun({ text: `Generated ${generatedAt}`, size: 15, color: FADED_COLOR })],
      }),
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({ text: "Page ", size: 15, color: FADED_COLOR }),
          new TextRun({ children: [PageNumber.CURRENT], size: 15, color: FADED_COLOR }),
          new TextRun({ text: " of ", size: 15, color: FADED_COLOR }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 15, color: FADED_COLOR }),
        ],
      }),
    ],
  });
}

export interface PatientDocumentsDocxOptions {
  patientId?: string;
}

export async function downloadPatientDocumentsDocx(
  documents: PatientDocumentItem[],
  options: PatientDocumentsDocxOptions = {}
): Promise<void> {
  const generatedAt = new Date().toLocaleString();
  const patientLabel = options.patientId || "—";

  const children: (Paragraph | Table)[] = [
    new Paragraph({
      spacing: { after: 60 },
      children: [
        new TextRun({ text: "Document Library Summary", bold: true, size: 32, color: TITLE_COLOR }),
      ],
    }),
    new Paragraph({
      spacing: { after: 40 },
      children: [
        new TextRun({ text: `Patient ID: ${patientLabel}`, size: 18, color: MUTED_COLOR }),
        new TextRun({ text: "   |   ", size: 18, color: MUTED_COLOR }),
        new TextRun({ text: `Total files: ${documents.length}`, size: 18, color: MUTED_COLOR }),
        new TextRun({ text: "   |   ", size: 18, color: MUTED_COLOR }),
        new TextRun({ text: `Generated ${generatedAt}`, size: 18, color: MUTED_COLOR }),
      ],
    }),
  ];

  children.push(sectionHeading("All Documents"));

  const tableRows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: [
        headerCell("File Name", 42),
        headerCell("Type", 12),
        headerCell("Size", 14),
        headerCell("Uploaded", 32),
      ],
    }),
  ];

  if (documents.length === 0) {
    tableRows.push(emptyRow("No documents uploaded", 4));
  } else {
    documents.forEach((doc, index) => {
      const fill = index % 2 === 1 ? ALT_ROW_FILL : undefined;
      tableRows.push(
        new TableRow({
          children: [
            bodyCell(doc.name, 42, fill),
            bodyCell(typeLabelOf(doc), 12, fill),
            bodyCell(formatFileSize(doc.size), 14, fill),
            bodyCell(doc.uploadDate, 32, fill),
          ],
        })
      );
    });
  }

  children.push(buildTable(tableRows));

  /* Full content of every file — images embedded, PDF text converted into
     Word, DOCX/DOC/TXT contents extracted — so the export IS the Word
     document. */
  children.push(sectionHeading("Document Contents"));
  const sections = await buildWordSections(documents);
  children.push(...wordSectionsToDocxChildren(sections));

  const doc = new Document({
    creator: "HMS",
    title: "Document Library Summary",
    description: "Summary of documents uploaded to the patient Document Library",
    styles: {
      default: {
        document: {
          run: { font: "Arial", size: 18 },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 720, right: 720, bottom: 1440, left: 720, footer: 360 },
          },
        },
        footers: { default: buildFooter(generatedAt) },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `document-library-summary-${options.patientId || "patient"}.docx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Convert ONE document into a Word (.docx) file and trigger its download —
 * images/logos embedded, PDF text extracted, DOCX/DOC/TXT contents converted.
 * Returns false when the file type cannot be represented in Word, so the
 * caller can fall back to downloading the original file unchanged.
 */
export async function downloadDocumentAsDocx(doc: PatientDocumentItem): Promise<boolean> {
  const sections = await buildWordSections([doc]);
  const section = sections[0];
  if (!section) return false;
  if (section.blocks.length === 0 && section.source === "indexed") return false;

  const wordDoc = new Document({
    creator: "HMS",
    title: doc.name,
    description: `Word conversion of ${doc.name} from the patient Document Library`,
    styles: {
      default: {
        document: {
          run: { font: "Arial", size: 18 },
        },
      },
    },
    sections: [{ children: wordSectionsToDocxChildren(sections) }],
  });

  const blob = await Packer.toBlob(wordDoc);
  const base = (doc.name || "document").replace(/\.[^.]+$/, "") || "document";
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${base}.docx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return true;
}
