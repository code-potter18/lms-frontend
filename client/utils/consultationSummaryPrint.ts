/* ============================================================
   CONSULTATION SUMMARY PRINT
   Builds a clean A4 report of the Consultation step and prints it
   from a hidden iframe, so the printout is a document rather than
   a picture of the form: single column, no inputs or borders, and
   only the sections that have something in them.
   ============================================================ */

export interface ConsultationSummaryPrintData {
  hospitalName?: string;
  patient: {
    name: string;
    displayId: string;
    age?: string;
    gender?: string;
    mobile?: string;
  };
  visit: {
    date?: string;
    time?: string;
    type?: string;
    consultedBy?: string;
    encounterNo?: string;
    firstVisit?: string;
  };
  vitals: { label: string; value: string }[];
  chiefComplaint?: string;
  reasonOfVisit?: string;
  consultationNotes?: string;
  historyOfPresentIllness?: string;
  performanceStatus?: string;
  symptoms: { name: string; severity: string; durationDays: string; notes: string }[];
  allergies: { name: string; severity: string; reaction: string }[];
  comorbidities: string[];
  personalHistory: { label: string; value: string }[];
  generalExamination: string[];
  systemicExamination: { label: string; value: string }[];
  clinicalFindings?: string;
  pastHistory?: string;
  pastTreatment?: {
    type: string;
    date?: string;
    note?: string;
    response?: string;
  };
  previousReports: { test: string; date?: string; result?: string; impression?: string }[];
  previousReportsText?: string;
  molecularTests: { test: string; date?: string; result?: string; impression?: string }[];
  investigations: {
    name: string;
    notes?: string;
    priority?: string;
    targetDate?: string;
  }[];
  investigationInstructions?: string;
  medicines: {
    form: string;
    name: string;
    dosage: string;
    frequency: string;
    duration: string;
    instruction: string;
  }[];
  adviceDiscussion?: string;
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const has = (value?: string | null): value is string => !!value && !!value.trim();

/* Free text keeps its line breaks. */
const text = (value: string) =>
  `<p class="text">${escapeHtml(value.trim()).replace(/\n/g, "<br />")}</p>`;

const section = (title: string, body: string) =>
  body ? `<section><h2>${escapeHtml(title)}</h2>${body}</section>` : "";

const subsection = (title: string, body: string) =>
  body ? `<div class="sub"><h3>${escapeHtml(title)}</h3>${body}</div>` : "";

/* Label / value pairs laid out as a compact grid; empty values are dropped. */
const fields = (items: { label: string; value?: string }[], className = "") => {
  const filled = items.filter((item) => has(item.value));
  if (filled.length === 0) return "";
  return `<dl class="fields ${className}">${filled
    .map(
      (item) =>
        `<div><dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(
          item.value!.trim()
        )}</dd></div>`
    )
    .join("")}</dl>`;
};

/* A table that keeps only the columns with at least one value. */
const table = <T,>(
  rows: T[],
  columns: { header: string; cell: (row: T) => string | undefined }[]
) => {
  if (rows.length === 0) return "";
  const used = columns.filter((column) => rows.some((row) => has(column.cell(row))));
  return `<table><thead><tr>${used
    .map((column) => `<th>${escapeHtml(column.header)}</th>`)
    .join("")}</tr></thead><tbody>${rows
    .map(
      (row) =>
        `<tr>${used
          .map((column) => {
            const value = column.cell(row);
            return `<td>${has(value) ? escapeHtml(value.trim()) : "—"}</td>`;
          })
          .join("")}</tr>`
    )
    .join("")}</tbody></table>`;
};

const list = (items: string[]) => {
  const filled = items.filter(has);
  return filled.length
    ? `<ul class="inline">${filled.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : "";
};

const STYLES = `
  @page { size: A4; margin: 14mm 14mm 16mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: "Segoe UI", Roboto, Arial, sans-serif;
    font-size: 10.5pt;
    line-height: 1.45;
    color: #1e293b;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  header.report {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    border-bottom: 2px solid #1d4ed8;
    padding-bottom: 8px;
    margin-bottom: 12px;
  }
  header.report .hospital { font-size: 15pt; font-weight: 700; color: #1d4ed8; }
  header.report .title { font-size: 11pt; font-weight: 600; color: #334155; }
  header.report .printed { font-size: 8.5pt; color: #64748b; text-align: right; }
  .patient {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px 16px;
    background: #f1f5f9;
    border-radius: 4px;
    padding: 8px 10px;
    margin-bottom: 14px;
    break-inside: avoid;
  }
  .patient dt { font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.4px; color: #64748b; }
  .patient dd { margin: 0; font-weight: 600; }
  section { margin-bottom: 12px; }
  h2 {
    font-size: 10.5pt;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #1d4ed8;
    border-bottom: 1px solid #cbd5e1;
    padding-bottom: 2px;
    margin: 0 0 6px;
    break-after: avoid;
  }
  h3 { font-size: 9.5pt; color: #334155; margin: 6px 0 2px; break-after: avoid; }
  .sub { margin-bottom: 6px; break-inside: avoid; }
  .text { margin: 0 0 4px; white-space: normal; }
  dl.fields {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px 16px;
    margin: 0 0 4px;
  }
  dl.fields dt { font-size: 8pt; color: #64748b; }
  dl.fields dd { margin: 0; font-weight: 600; }
  dl.fields.vitals { grid-template-columns: repeat(5, 1fr); }
  ul.inline { margin: 0 0 4px; padding-left: 16px; columns: 2; }
  ul.inline li { break-inside: avoid; }
  table { width: 100%; border-collapse: collapse; margin: 2px 0 6px; font-size: 9.5pt; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  th {
    text-align: left;
    font-weight: 600;
    color: #334155;
    background: #f1f5f9;
    border-bottom: 1px solid #cbd5e1;
    padding: 4px 6px;
  }
  td { border-bottom: 1px solid #e2e8f0; padding: 4px 6px; vertical-align: top; }
  footer.signature {
    margin-top: 28px;
    display: flex;
    justify-content: flex-end;
    break-inside: avoid;
  }
  footer.signature div {
    border-top: 1px solid #475569;
    padding-top: 4px;
    min-width: 200px;
    text-align: center;
    font-size: 9.5pt;
  }
`;

export const buildConsultationSummaryHtml = (data: ConsultationSummaryPrintData) => {
  const printedAt = new Date().toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const patientFields = [
    { label: "Patient", value: data.patient.name },
    { label: "Patient ID", value: data.patient.displayId },
    {
      label: "Age / Gender",
      value: [data.patient.age, data.patient.gender].filter(has).join(" / "),
    },
    { label: "Mobile", value: data.patient.mobile },
    {
      label: "Visit Date",
      value: [data.visit.date, data.visit.time].filter(has).join(", "),
    },
    { label: "Visit Type", value: data.visit.type },
    { label: "Consulted By", value: data.visit.consultedBy },
    { label: "Encounter No", value: data.visit.encounterNo },
    { label: "First Visit", value: data.visit.firstVisit },
  ].filter((item) => has(item.value));

  const patientBlock = `<dl class="patient">${patientFields
    .map(
      (item) =>
        `<div><dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(item.value!)}</dd></div>`
    )
    .join("")}</dl>`;

  type ReportRow = ConsultationSummaryPrintData["previousReports"][number];
  const reportColumns: { header: string; cell: (row: ReportRow) => string | undefined }[] = [
    { header: "Test", cell: (row) => row.test },
    { header: "Date", cell: (row) => row.date },
    { header: "Result", cell: (row) => row.result },
    { header: "Impression", cell: (row) => row.impression },
  ];

  const body = [
    section("Vitals", fields(data.vitals, "vitals")),

    section(
      "Presenting Complaint",
      [
        has(data.chiefComplaint) ? subsection("Chief Complaint", text(data.chiefComplaint)) : "",
        has(data.reasonOfVisit) ? subsection("Reason of Visit", text(data.reasonOfVisit)) : "",
        has(data.historyOfPresentIllness)
          ? subsection("History of Present Illness", text(data.historyOfPresentIllness))
          : "",
        has(data.consultationNotes)
          ? subsection("Consultation Notes", text(data.consultationNotes))
          : "",
      ].join("")
    ),

    section(
      "Clinical Details",
      [
        has(data.performanceStatus)
          ? fields([{ label: "Performance Status (ECOG)", value: data.performanceStatus }])
          : "",
        subsection(
          "Symptoms",
          table(data.symptoms, [
            { header: "Symptom", cell: (row) => row.name },
            { header: "Severity", cell: (row) => row.severity },
            {
              header: "Duration",
              cell: (row) => (has(row.durationDays) ? `${row.durationDays} days` : ""),
            },
            { header: "Notes", cell: (row) => row.notes },
          ])
        ),
        subsection(
          "Allergies",
          table(data.allergies, [
            { header: "Allergen", cell: (row) => row.name },
            { header: "Severity", cell: (row) => row.severity },
            { header: "Reaction", cell: (row) => row.reaction },
          ])
        ),
        subsection("Comorbidities", list(data.comorbidities)),
      ].join("")
    ),

    section("Personal History", fields(data.personalHistory)),

    section(
      "Examination",
      [
        subsection("General Examination (positive findings)", list(data.generalExamination)),
        subsection("Systemic Examination", fields(data.systemicExamination)),
        has(data.clinicalFindings) ? subsection("Clinical Findings", text(data.clinicalFindings)) : "",
      ].join("")
    ),

    section(
      "Past History",
      [
        has(data.pastHistory) ? text(data.pastHistory) : "",
        data.pastTreatment && has(data.pastTreatment.type)
          ? subsection(
              "Previous Treatment",
              fields([
                { label: "Treatment Type", value: data.pastTreatment.type },
                { label: "Date", value: data.pastTreatment.date },
              ]) +
                (has(data.pastTreatment.note) ? text(data.pastTreatment.note) : "") +
                (has(data.pastTreatment.response)
                  ? fields([{ label: "Treatment Response", value: data.pastTreatment.response }])
                  : "")
            )
          : "",
      ].join("")
    ),

    section(
      "Previous Reports",
      table(data.previousReports, reportColumns) +
        (has(data.previousReportsText) ? text(data.previousReportsText) : "")
    ),

    section("Molecular Testing", table(data.molecularTests, reportColumns)),

    section(
      "Investigations / Scans Advised",
      table(data.investigations, [
        { header: "Investigation", cell: (row) => row.name },
        { header: "Priority", cell: (row) => row.priority },
        { header: "Target Date", cell: (row) => row.targetDate },
        { header: "Clinical Notes", cell: (row) => row.notes },
      ]) +
        (has(data.investigationInstructions)
          ? subsection("Additional Instructions", text(data.investigationInstructions))
          : "")
    ),

    section(
      "Advice",
      table(data.medicines, [
        { header: "Form", cell: (row) => row.form },
        { header: "Drug", cell: (row) => row.name },
        { header: "Dosage", cell: (row) => row.dosage },
        { header: "Frequency", cell: (row) => row.frequency },
        { header: "Duration", cell: (row) => row.duration },
        { header: "Instruction", cell: (row) => row.instruction },
      ]) + (has(data.adviceDiscussion) ? subsection("Discussion", text(data.adviceDiscussion)) : "")
    ),
  ].join("");

  const title = `Consultation Summary - ${data.patient.name || data.patient.displayId}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>${STYLES}</style>
</head>
<body>
<header class="report">
  <div>
    ${has(data.hospitalName) ? `<div class="hospital">${escapeHtml(data.hospitalName)}</div>` : ""}
    <div class="title">Consultation Summary</div>
  </div>
  <div class="printed">Printed ${escapeHtml(printedAt)}</div>
</header>
${patientBlock}
${body || `<p class="text">No consultation details have been entered yet.</p>`}
<footer class="signature">
  <div>${has(data.visit.consultedBy) ? escapeHtml(data.visit.consultedBy) : "Consultant"}<br />Signature</div>
</footer>
</body>
</html>`;
};

/* Prints the report from a hidden iframe, so the page itself is untouched. */
export const printConsultationSummary = (data: ConsultationSummaryPrintData) => {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  document.body.appendChild(frame);

  const frameWindow = frame.contentWindow;
  const frameDocument = frameWindow?.document;
  if (!frameWindow || !frameDocument) {
    frame.remove();
    return;
  }

  frameDocument.open();
  frameDocument.write(buildConsultationSummaryHtml(data));
  frameDocument.close();

  const cleanup = () => setTimeout(() => frame.remove(), 500);
  frameWindow.addEventListener("afterprint", cleanup, { once: true });

  /* Let the iframe lay out before opening the print dialog. */
  setTimeout(() => {
    frameWindow.focus();
    frameWindow.print();
    /* Browsers that don't fire afterprint still get cleaned up. */
    setTimeout(() => frame.isConnected && frame.remove(), 60_000);
  }, 250);
};
