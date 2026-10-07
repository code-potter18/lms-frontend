/**
 * Chemotherapy Summary as a Word (.docx) download.
 * Replaces the previous jsPDF summary with an editable Word document,
 * including an "Uploaded Documents" section that lists every file in the
 * patient's Document Library and embeds uploaded images inline.
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  PageNumber,
  PageOrientation,
  Packer,
  Paragraph,
  ShadingType,
  TabStopType,
  Table,
  TableCell,
  TableRow,
  TableLayoutType,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import { formatFileSize, type PatientDocumentItem } from "./patientDocuments";
import { buildWordSections, wordSectionsToDocxChildren } from "./combinedDocumentWord";

export interface SummaryDocRow {
  [key: string]: string;
}

export interface ChemotherapySummaryDocData {
  patientName: string;
  patientId: string;
  cancerType: string;
  stage: string;
  context: string;
  protocol: string;
  duration: string;
  current: string;
  visitCycleDay: string;
  chemoOrders: readonly SummaryDocRow[];
  premedications: readonly SummaryDocRow[];
  hydration: readonly SummaryDocRow[];
  adminInstructions: readonly SummaryDocRow[];
  dischargeMedications: readonly SummaryDocRow[];
  nextVisitDate: string;
  nextCycle: string;
  documents: readonly PatientDocumentItem[];
}

/* Palette mirrors the old PDF (jsPDF RGB values -> hex). */
const ACCENT = "004785";
const HEADING = "312E81";
const MUTED = "64748B";
const BODY = "1E293B";
const BORDER = "E2E8F0";
const ALT_ROW = "F7F9FB";
const EMPTY = "94A3B8";
const TITLE_COLOR = "141E28";
const PRE_COLOR = "1D4ED8";
const POST_COLOR = "B45309";

/* A4 landscape (twips) with ~0.55in margins, like the old PDF. */
const PAGE_WIDTH = 16838;
const PAGE_HEIGHT = 11906;
const MARGIN = 800;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const CELL_MARGINS = { top: 60, bottom: 60, left: 100, right: 100 };
const TABLE_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
  left: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
  right: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
  insideVertical: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
};

const columnWidthsFrom = (fractions: number[]) =>
  fractions.map((f) => Math.round(f * CONTENT_WIDTH));

const sectionHeading = (title: string, note?: string) =>
  new Paragraph({
    spacing: { before: 260, after: 90 },
    border: {
      left: { style: BorderStyle.SINGLE, size: 24, color: ACCENT, space: 4 },
    },
    tabStops: note ? [{ type: TabStopType.RIGHT, position: CONTENT_WIDTH }] : [],
    children: [
      new TextRun({ text: title, bold: true, size: 22, color: HEADING }),
      ...(note
        ? [new TextRun({ text: `\t${note}`, size: 17, color: MUTED })]
        : []),
    ],
  });

const buildTable = (
  head: string[],
  body: string[][],
  options: {
    note?: string;
    empty?: string;
    fractions: number[];
    stageColumn?: number;
    title: string;
  }
) => {
  const colWidths = columnWidthsFrom(options.fractions);
  const tableHead = new TableRow({
    tableHeader: true,
    children: head.map(
      (label, i) =>
        new TableCell({
          width: { size: colWidths[i], type: WidthType.DXA },
          shading: { type: ShadingType.CLEAR, color: "auto", fill: ACCENT },
          margins: CELL_MARGINS,
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: label, bold: true, size: 17, color: "FFFFFF" }),
              ],
            }),
          ],
        })
    ),
  });

  const tableBody =
    body.length > 0
      ? body.map(
          (row, ri) =>
            new TableRow({
              children: row.map((raw, ci) => {
                const value = raw || "-";
                const isStage = options.stageColumn === ci;
                const stageColor =
                  value === "POST" ? POST_COLOR : PRE_COLOR;
                return new TableCell({
                  width: { size: colWidths[ci], type: WidthType.DXA },
                  verticalAlign: VerticalAlign.TOP,
                  margins: CELL_MARGINS,
                  shading:
                    ri % 2 === 1
                      ? { type: ShadingType.CLEAR, color: "auto", fill: ALT_ROW }
                      : undefined,
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: value,
                          size: 16,
                          color: isStage ? stageColor : BODY,
                          bold: isStage,
                        }),
                      ],
                    }),
                  ],
                });
              }),
            })
        )
      : [
          new TableRow({
            children: [
              new TableCell({
                columnSpan: head.length,
                width: { size: CONTENT_WIDTH, type: WidthType.DXA },
                margins: CELL_MARGINS,
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                      new TextRun({
                        text: options.empty ?? "None recorded",
                        italics: true,
                        size: 16,
                        color: EMPTY,
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ];

  return [
    sectionHeading(options.title, options.note),
    new Table({
      rows: [tableHead, ...tableBody],
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: colWidths,
      layout: TableLayoutType.FIXED,
      borders: TABLE_BORDERS,
    }),
  ];
};

/* ---------------- Uploaded documents (full Word contents) ---------------- */

const uploadedDocumentsSection = async (
  documents: readonly PatientDocumentItem[]
): Promise<(Paragraph | Table)[]> => {
  const extensionOf = (name: string) => {
    const parts = (name || "").toLowerCase().split(".");
    return parts.length > 1 ? parts[parts.length - 1] : "file";
  };

  const rows = documents.map((doc) => [
    doc.name || doc.originalName || "Document",
    extensionOf(doc.originalName || doc.name || ""),
    formatFileSize(doc.size),
    doc.uploadDate || "",
  ]);

  const children: (Paragraph | Table)[] = [
    ...buildTable(
      ["File Name", "Type", "Size", "Uploaded"],
      rows.map((row) => row.map((cell) => cell || "-")),
      {
        title: "Uploaded Documents",
        empty: "No documents uploaded",
        fractions: [0.44, 0.12, 0.16, 0.28],
      }
    ),
  ];

  /* Full content of every file — images embedded, PDF text converted into
     Word, DOCX/DOC/TXT contents extracted — so this export IS the Word
     document of the entire document library. */
  const sections = await buildWordSections(documents);
  children.push(...wordSectionsToDocxChildren(sections));

  return children;
};

/* ---------------- Document assembly ---------------- */

export const downloadChemotherapySummaryDocx = async (
  data: ChemotherapySummaryDocData
): Promise<void> => {
  const infoLine = [
    `Patient: ${data.patientName || data.patientId}`,
    data.cancerType && `Cancer Type: ${data.cancerType}`,
    data.stage && `Stage: ${data.stage}`,
    data.context && `Context: ${data.context}`,
    data.protocol && `Protocol: ${data.protocol}`,
    data.duration && `Duration: ${data.duration}`,
    data.current && `Current: ${data.current}`,
  ]
    .filter(Boolean)
    .join("   |   ");

  const keysOf = (rows: readonly SummaryDocRow[], columns: string[]) =>
    rows.map((row) => columns.map((column) => row[column] ?? ""));

  const generatedAt = new Date().toLocaleString();

  const footer = new Footer({
    children: [
      new Paragraph({
        border: {
          top: { style: BorderStyle.SINGLE, size: 4, color: BORDER, space: 4 },
        },
        tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_WIDTH }],
        spacing: { before: 60 },
        children: [
          new TextRun({ text: `Generated ${generatedAt}`, size: 15, color: EMPTY }),
          new TextRun({ text: "\tPage ", size: 15, color: EMPTY }),
          new TextRun({ children: [PageNumber.CURRENT], size: 15, color: EMPTY }),
          new TextRun({ text: " of ", size: 15, color: EMPTY }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 15, color: EMPTY }),
        ],
      }),
    ],
  });

  const children: (Paragraph | Table)[] = [
    new Paragraph({
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: "Chemotherapy Summary",
          bold: true,
          size: 32,
          color: TITLE_COLOR,
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 120 },
      children: [new TextRun({ text: infoLine, size: 18, color: MUTED })],
    }),
    ...buildTable(
      ["Drug Name", "Form", "Dose", "Unit"],
      keysOf(data.chemoOrders, ["drug", "form", "dose", "unit"]),
      { title: "Chemotherapy Orders", fractions: [0.44, 0.24, 0.16, 0.16] }
    ),
    ...buildTable(
      ["Drug Name", "Dose", "Route", "Time"],
      keysOf(data.premedications, ["drug", "dose", "route", "time"]),
      { title: "Premedication", fractions: [0.4, 0.2, 0.2, 0.2] }
    ),
    ...buildTable(
      ["Stage", "Agent", "Diluent", "Volume", "Guidance"],
      keysOf(data.hydration, ["stage", "agent", "diluent", "volume", "guidance"]),
      {
        title: "Hydration",
        note: data.visitCycleDay,
        empty: "No hydration ordered for this visit",
        fractions: [0.07, 0.2, 0.18, 0.1, 0.45],
        stageColumn: 0,
      }
    ),
    ...buildTable(
      [
        "Drug Name",
        "Category",
        "Route",
        "Infusion",
        "Frequency",
        "Timing",
        "Admin Detail",
        "Remarks",
      ],
      keysOf(data.adminInstructions, [
        "drug",
        "category",
        "route",
        "infusion",
        "frequency",
        "timing",
        "detail",
        "remarks",
      ]),
      {
        title: "Administration Instructions",
        note: data.visitCycleDay,
        empty: "No administration instructions for this visit",
        fractions: [0.15, 0.1, 0.07, 0.11, 0.09, 0.11, 0.23, 0.14],
      }
    ),
    ...buildTable(
      ["Drug Name", "Dose", "Frequency", "Instruction", "Duration"],
      keysOf(data.dischargeMedications, [
        "drug",
        "dose",
        "frequency",
        "instruction",
        "duration",
      ]),
      { title: "Discharge Medication", fractions: [0.3, 0.15, 0.15, 0.25, 0.15] }
    ),
    ...(await uploadedDocumentsSection(data.documents)),
    new Paragraph({
      spacing: { before: 260 },
      tabStops: [{ type: TabStopType.LEFT, position: 5200 }],
      children: [
        new TextRun({
          text: `Next Visit Date: ${data.nextVisitDate || ""}`,
          size: 18,
          color: "0F172A",
        }),
        new TextRun({
          text: `\tNext Cycle: ${data.nextCycle || ""}`,
          size: 18,
          color: "0F172A",
        }),
      ],
    }),
  ];

  const summaryDoc = new Document({
    features: { updateFields: true },
    creator: "HMS",
    title: "Chemotherapy Summary",
    description: "Chemotherapy summary with uploaded patient documents",
    sections: [
      {
        properties: {
          page: {
            size: {
              width: PAGE_WIDTH,
              height: PAGE_HEIGHT,
              orientation: PageOrientation.LANDSCAPE,
            },
            margin: { top: MARGIN, right: MARGIN, bottom: 1000, left: MARGIN },
          },
        },
        footers: { default: footer },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(summaryDoc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `chemotherapy-summary-${data.patientId || "patient"}.docx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
