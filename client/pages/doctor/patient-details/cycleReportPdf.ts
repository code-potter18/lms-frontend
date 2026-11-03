import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { ChemoAdministrationDay, ChemoAdverseEventRecord } from "@/api/chemotherapy.api";
import {
  ADMIN_ROLE_SECTIONS,
  ADMIN_STATUS_LABEL,
  fmtDate,
  fmtTime,
  infusionText,
  itemDose,
} from "./adminFormat";
import { adverseAction, adverseOutcome, type AdministrationPrintPatient } from "./marPrint";

/* ============================================================
   CYCLE ADMINISTRATION REPORT (PDF)
   "Download Report" of the Administration tab: every ordered day
   of a cycle - each medicine's status, who gave it and when, skip /
   cancel reasons - followed by the cycle's adverse events. A4
   landscape, with the patient header and page numbers on every page.
   ============================================================ */

export interface CycleReportData {
  hospitalName: string;
  patient: AdministrationPrintPatient;
  regimen: string;
  physician: string;
  cycleNumber: number;
  /* The cycle's ordered days, in day order. */
  days: ChemoAdministrationDay[];
  adverseEvents: ChemoAdverseEventRecord[];
}

type RGB = [number, number, number];
const BLUE: RGB = [29, 78, 216];
const DARK: RGB = [30, 41, 59];
const GREY: RGB = [100, 116, 139];
const HEAD_FILL: RGB = [241, 245, 249];

const STATUS_COLOR: Record<string, RGB> = {
  GIVEN: [21, 128, 61],
  PENDING: [180, 83, 9],
  SKIPPED: [71, 85, 105],
  CANCELLED: [185, 28, 28],
};

/* jsPDF's built-in fonts only cover Latin-1; keep the text to it (locale
   time strings can carry a narrow no-break space, for one). */
const plain = (value?: string | null) =>
  (value ?? "")
    .replace(/[  ]/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/[·•]/g, "|")
    .replace(/[^\x20-\xFF\n]/g, "")
    .trim();

const when = (value?: string | null) =>
  value ? plain(`${fmtDate(value)} ${fmtTime(value)}`) : "-";

export function downloadCycleAdministrationReport(data: CycleReportData) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 36;
  const contentTop = 82;
  const contentBottom = pageHeight - 40;

  const tableDefaults = {
    margin: { top: contentTop, left: marginX, right: marginX, bottom: 40 },
    styles: { font: "helvetica", fontSize: 8, cellPadding: 3.5, textColor: DARK, lineColor: [226, 232, 240] as RGB, lineWidth: 0.5 },
    headStyles: { fillColor: HEAD_FILL, textColor: [51, 65, 85] as RGB, fontStyle: "bold" as const },
    theme: "grid" as const,
  };

  let y = contentTop;
  const ensureSpace = (needed: number) => {
    if (y + needed > contentBottom) {
      doc.addPage();
      y = contentTop;
    }
  };

  const heading = (label: string, detail: string) => {
    ensureSpace(60);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(...BLUE);
    doc.text(plain(label), marginX, y);
    if (detail) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...GREY);
      doc.text(plain(detail), marginX + doc.getTextWidth(plain(label)) + 10, y);
    }
    y += 6;
  };

  const afterTable = () => {
    y = ((doc as any).lastAutoTable?.finalY ?? y) + 18;
  };

  /* ---------- one section per ordered day ---------- */

  if (data.days.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...GREY);
    doc.text("No cycle days have been ordered for this cycle yet.", marginX, y);
    y += 24;
  }

  data.days.forEach(day => {
    const s = day.summary;
    heading(
      `Day ${day.cycle_day}  |  ${fmtDate(day.treatment_date)}`,
      `${day.order_status.replace(/_/g, " ")}  |  Given ${s.given}/${s.total}` +
        (s.skipped ? `, skipped ${s.skipped}` : "") +
        (s.cancelled ? `, cancelled ${s.cancelled}` : "") +
        (s.pending ? `, pending ${s.pending}` : "") +
        (day.administered_by.length ? `  |  By ${day.administered_by.join(", ")}` : "")
    );

    const items = ADMIN_ROLE_SECTIONS.flatMap(({ role, title }) =>
      day.items
        .filter(item => item.drug_role === role)
        .sort((a, b) => (a.drug_sequence ?? 0) - (b.drug_sequence ?? 0))
        .map(item => ({ item, title }))
    );

    autoTable(doc, {
      ...tableDefaults,
      startY: y,
      head: [["Type", "Drug", "Dose", "Route", "Infusion", "Status", "Given At", "Given By", "Reason / Remarks"]],
      body: items.length
        ? items.map(({ item, title }) => [
            title,
            plain(item.brand_name ? `${item.drug_name} (${item.brand_name})` : item.drug_name),
            plain(itemDose(item) || "-"),
            plain(item.administration_route || "-"),
            plain(infusionText(item)),
            ADMIN_STATUS_LABEL[item.status] ?? item.status,
            when(item.given_at),
            plain(item.administered_by_name || "-"),
            plain([item.status_reason, item.remarks].filter(Boolean).join(" - ") || "-"),
          ])
        : [[{ content: "No medicines were ordered for this day.", colSpan: 9, styles: { textColor: GREY, halign: "center" } }]],
      columnStyles: {
        0: { cellWidth: 82 },
        1: { cellWidth: 130 },
        5: { fontStyle: "bold" },
        6: { cellWidth: 82 },
      },
      didParseCell: hook => {
        if (hook.section === "body" && hook.column.index === 5) {
          const status = items[hook.row.index]?.item.status;
          if (status && STATUS_COLOR[status]) hook.cell.styles.textColor = STATUS_COLOR[status];
        }
      },
    });
    afterTable();
  });

  /* ---------- adverse events of the cycle ---------- */

  const events = [...data.adverseEvents].sort((a, b) => Date.parse(a.event_date) - Date.parse(b.event_date));
  heading("Adverse Events", events.length ? `${events.length} recorded this cycle` : "");
  autoTable(doc, {
    ...tableDefaults,
    startY: y,
    head: [["Date & Time", "Day", "Event", "Grade", "Severity", "Action Taken", "Outcome"]],
    body: events.length
      ? events.map(event => [
          when(event.event_date),
          event.cycle_day != null ? `Day ${event.cycle_day}` : "-",
          plain(event.adverse_event_name),
          event.ctcae_grade ? `Grade ${event.ctcae_grade}` : "-",
          plain(event.severity || "-"),
          plain(adverseAction(event) || "-"),
          plain(adverseOutcome(event)),
        ])
      : [[{ content: "No adverse events recorded for this cycle.", colSpan: 7, styles: { textColor: GREY, halign: "center" } }]],
    columnStyles: { 0: { cellWidth: 90 }, 1: { cellWidth: 45 }, 3: { cellWidth: 50 } },
  });
  afterTable();

  /* ---------- signatures ---------- */

  ensureSpace(60);
  y += 24;
  doc.setDrawColor(71, 85, 105);
  doc.setLineWidth(0.6);
  const sigWidth = 190;
  doc.line(marginX, y, marginX + sigWidth, y);
  doc.line(pageWidth - marginX - sigWidth, y, pageWidth - marginX, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...DARK);
  doc.text("Administered by (Nurse)", marginX, y + 12);
  doc.text(plain(data.physician) || "Verified by (Physician)", pageWidth - marginX - sigWidth, y + 12);

  /* ---------- header + footer on every page ---------- */

  const generated = new Date().toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
  const patientLine = [
    data.patient.name && `Patient: ${data.patient.name}`,
    data.patient.uhid && `UHID: ${data.patient.uhid}`,
    data.patient.ageSex && `Age/Sex: ${data.patient.ageSex}`,
    data.regimen && `Regimen: ${data.regimen}`,
    data.physician && `Physician: ${data.physician}`,
  ]
    .filter(Boolean)
    .join("   |   ");

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...BLUE);
    doc.text(plain(data.hospitalName) || "Chemotherapy Administration", marginX, 34);
    doc.setFontSize(10);
    doc.setTextColor(...DARK);
    doc.text(`Administration Report - Cycle ${data.cycleNumber}`, pageWidth - marginX, 34, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...GREY);
    doc.text(plain(patientLine), marginX, 52, { maxWidth: pageWidth - marginX * 2 });
    doc.setDrawColor(...BLUE);
    doc.setLineWidth(1.2);
    doc.line(marginX, 62, pageWidth - marginX, 62);

    doc.setFontSize(8);
    doc.setTextColor(...GREY);
    doc.text(plain(`Generated ${generated}`), marginX, pageHeight - 20);
    doc.text(`Page ${page} / ${pages}`, pageWidth - marginX, pageHeight - 20, { align: "right" });
  }

  const safe = (value: string) => value.replace(/[^A-Za-z0-9_-]+/g, "");
  doc.save(`Administration_Report_${safe(data.patient.uhid) || "Patient"}_Cycle${data.cycleNumber}.pdf`);
}
