import {
  escapeHtml,
  fields,
  has,
  list,
  PRINT_BASE_STYLES,
  printHtmlDocument,
  section,
  subsection,
  table,
  text,
} from "./printHtml";

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
  pastTreatments: {
    type: string;
    date?: string;
    note?: string;
    response?: string;
  }[];
  previousReports: { test: string; date?: string; result?: string; impression?: string }[];
  previousReportsText?: string;
  molecularTests: { test: string; date?: string; result?: string; impression?: string }[];
  investigations: {
    name: string;
    /* Molecular-category tests only. */
    method?: string;
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
  /* The Advice's Follow-up Date (DD-MM-YYYY). */
  adviceFollowUpDate?: string;
}

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
        ...data.pastTreatments
          .filter((treatment) => has(treatment.type))
          .map((treatment) =>
            subsection(
              "Previous Treatment",
              fields([
                { label: "Treatment Type", value: treatment.type },
                { label: "Date", value: treatment.date },
              ]) +
                (has(treatment.note) ? text(treatment.note) : "") +
                (has(treatment.response)
                  ? fields([{ label: "Treatment Response", value: treatment.response }])
                  : "")
            )
          ),
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
        /* The Method column only appears when a Molecular test picked one. */
        ...(data.investigations.some((row) => has(row.method))
          ? [{ header: "Method", cell: (row: (typeof data.investigations)[number]) => row.method }]
          : []),
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
      ]) +
        (has(data.adviceFollowUpDate)
          ? fields([{ label: "Follow-up Date", value: data.adviceFollowUpDate }])
          : "") +
        (has(data.adviceDiscussion) ? subsection("Discussion", text(data.adviceDiscussion)) : "")
    ),
  ].join("");

  const title = `Consultation Summary - ${data.patient.name || data.patient.displayId}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>${PRINT_BASE_STYLES}</style>
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
export const printConsultationSummary = (data: ConsultationSummaryPrintData) =>
  printHtmlDocument(buildConsultationSummaryHtml(data));
