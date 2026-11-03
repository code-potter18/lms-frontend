import type {
  ChemoAdministrationDay,
  ChemoAdministrationItem,
  ChemoAdverseEventRecord,
} from "@/api/chemotherapy.api";
import {
  escapeHtml,
  fields,
  has,
  PRINT_BASE_STYLES,
  printHtmlDocument,
  section,
  subsection,
  table,
  text,
} from "@/utils/printHtml";
import {
  ADMIN_ROLE_SECTIONS,
  ADMIN_STATUS_LABEL,
  CTCAE_GRADES,
  fmtDate,
  fmtTime,
  infusionText,
  itemDose,
} from "./adminFormat";

/* ============================================================
   MEDICATION ADMINISTRATION RECORD (MAR)
   "Print MAR" of the Administration tab: an A4 landscape record of
   one cycle day - every ordered medicine with its status, who gave
   it and when, skip / cancel reasons, the day's adverse events and
   signature lines.
   ============================================================ */

export interface AdministrationPrintPatient {
  name: string;
  uhid: string;
  ageSex: string;
}

export interface AdministrationMarData {
  hospitalName: string;
  patient: AdministrationPrintPatient;
  regimen: string;
  physician: string;
  day: ChemoAdministrationDay;
  /* The adverse events recorded for this day. */
  adverseEvents: ChemoAdverseEventRecord[];
}

const MAR_STYLES = `
  @page { size: A4 landscape; margin: 12mm 12mm 14mm; }
  .patient { grid-template-columns: repeat(4, 1fr); }
  td.status { font-weight: 600; white-space: nowrap; }
  td.status.given { color: #15803d; }
  td.status.pending { color: #b45309; }
  td.status.skipped { color: #475569; }
  td.status.cancelled { color: #b91c1c; }
  .brand { display: block; font-size: 8.5pt; color: #64748b; }
  .counts { display: flex; gap: 18px; font-size: 9.5pt; margin: 4px 0 8px; }
  .counts b { color: #0f172a; }
  footer.signature { justify-content: space-between; gap: 40px; }
`;

const when = (value?: string | null) =>
  value ? `${fmtDate(value)} ${fmtTime(value)}`.trim() : "";

/* Medicine rows of one role, with a coloured status cell. */
const medicineTable = (items: ChemoAdministrationItem[]) => {
  if (items.length === 0) return "";
  const head = ["#", "Drug", "Dose", "Route", "Infusion", "Status", "Given At", "Given By", "Reason / Remarks"];
  const rows = items
    .map((item, index) => {
      const status = String(item.status ?? "PENDING");
      const notes = [item.status_reason, item.remarks].filter(has).join(" — ");
      const cells = [
        String(index + 1),
        `${escapeHtml(item.drug_name)}${has(item.brand_name) ? `<span class="brand">${escapeHtml(item.brand_name)}</span>` : ""}`,
        escapeHtml(itemDose(item) || "—"),
        escapeHtml(item.administration_route || "—"),
        escapeHtml(infusionText(item)),
        `<span>${escapeHtml(ADMIN_STATUS_LABEL[status] ?? status)}</span>`,
        escapeHtml(when(item.given_at) || "—"),
        escapeHtml(item.administered_by_name || "—"),
        escapeHtml(notes || "—"),
      ];
      return `<tr>${cells
        .map((cell, col) => (col === 5 ? `<td class="status ${status.toLowerCase()}">${cell}</td>` : `<td>${cell}</td>`))
        .join("")}</tr>`;
    })
    .join("");
  return `<table><thead><tr>${head.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>`;
};

/* Shared with the cycle report PDF. */
export const adverseOutcome = (event: ChemoAdverseEventRecord) =>
  event.resolved
    ? `Resolved${event.resolution_date ? ` (${fmtDate(event.resolution_date.slice(0, 10))})` : ""}`
    : event.treatment_stopped
      ? "Treatment stopped"
      : event.hospitalization_required
        ? "Hospitalized"
        : "Ongoing";

export const adverseAction = (event: ChemoAdverseEventRecord) =>
  event.doctor_action ||
  event.nursing_action ||
  (event.dose_reduced
    ? "Dose reduced"
    : event.dose_delayed
      ? "Dose delayed"
      : event.treatment_interrupted
        ? "Treatment interrupted"
        : event.emergency_medication_given
          ? `Emergency medication${event.medication_given ? `: ${event.medication_given}` : ""}`
          : "");

export const buildAdministrationMarHtml = (data: AdministrationMarData) => {
  const { day } = data;
  const printedAt = new Date().toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });

  const patientBlock = `<dl class="patient">${[
    { label: "Patient", value: data.patient.name },
    { label: "UHID", value: data.patient.uhid },
    { label: "Age / Sex", value: data.patient.ageSex },
    { label: "Regimen", value: data.regimen },
  ]
    .map(item => `<div><dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(item.value || "—")}</dd></div>`)
    .join("")}</dl>`;

  const treatment = fields([
    { label: "Cycle / Day", value: `Cycle ${day.cycle_number} · Day ${day.cycle_day}` },
    { label: "Treatment Date", value: fmtDate(day.treatment_date) },
    { label: "Treating Physician", value: data.physician },
    { label: "Physician Approval", value: day.physician_approved ? "Approved" : "Awaiting approval" },
    { label: "Order Status", value: day.order_status.replace(/_/g, " ") },
    { label: "Completed", value: day.completed_at ? when(day.completed_at) : "" },
  ]);

  const counts = `<div class="counts">${[
    ["Total", day.summary.total],
    ["Given", day.summary.given],
    ["Pending", day.summary.pending],
    ["Skipped", day.summary.skipped],
    ["Cancelled", day.summary.cancelled],
  ]
    .map(([label, value]) => `<span>${label}: <b>${value}</b></span>`)
    .join("")}</div>`;

  const medicines = ADMIN_ROLE_SECTIONS.map(({ role, title }) => {
    const items = day.items
      .filter(item => item.drug_role === role)
      .sort((a, b) => (a.drug_sequence ?? 0) - (b.drug_sequence ?? 0));
    return subsection(title, medicineTable(items));
  }).join("");

  const adverse = table(
    [...data.adverseEvents].sort((a, b) => Date.parse(a.event_date) - Date.parse(b.event_date)),
    [
      { header: "Time", cell: event => when(event.event_date) },
      { header: "Event", cell: event => event.adverse_event_name },
      {
        header: "Grade",
        cell: event => {
          const grade = CTCAE_GRADES.find(g => g.value === String(event.ctcae_grade ?? ""));
          return grade ? `Grade ${grade.value} (${grade.severity})` : event.ctcae_grade ?? "";
        },
      },
      { header: "Action Taken", cell: event => adverseAction(event) },
      { header: "Outcome", cell: event => adverseOutcome(event) },
    ]
  );

  const notes = [
    has(day.chemo_instructions) ? subsection("Post Chemo Instructions", text(day.chemo_instructions)) : "",
    has(day.additional_notes) ? subsection("Additional Notes", text(day.additional_notes)) : "",
  ].join("");

  const title = `MAR - ${data.patient.name || data.patient.uhid} - Cycle ${day.cycle_number} Day ${day.cycle_day}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>${PRINT_BASE_STYLES}${MAR_STYLES}</style>
</head>
<body>
<header class="report">
  <div>
    ${has(data.hospitalName) ? `<div class="hospital">${escapeHtml(data.hospitalName)}</div>` : ""}
    <div class="title">Medication Administration Record</div>
  </div>
  <div class="printed">Printed ${escapeHtml(printedAt)}</div>
</header>
${patientBlock}
${section("Treatment Day", treatment)}
${section("Medicines", counts + (medicines || `<p class="text">No medicines were ordered for this day.</p>`))}
${section("Adverse Events", adverse || `<p class="text">No adverse events recorded for this day.</p>`)}
${section("Instructions", notes)}
<footer class="signature">
  <div>Administered by (Nurse)<br />Name &amp; Signature</div>
  <div>Verified by (Physician)<br />${has(data.physician) ? escapeHtml(data.physician) : "Name &amp; Signature"}</div>
</footer>
</body>
</html>`;
};

export const printAdministrationMar = (data: AdministrationMarData) =>
  printHtmlDocument(buildAdministrationMarHtml(data));
