/* Shared pieces of the HTML printouts (consultation summary, MAR, ...):
   escaping and layout helpers, the base A4 styles, and a hidden-iframe
   printer. */

export const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const has = (value?: string | null): value is string => !!value && !!value.trim();

/* Free text keeps its line breaks. */
export const text = (value: string) =>
  `<p class="text">${escapeHtml(value.trim()).replace(/\n/g, "<br />")}</p>`;

export const section = (title: string, body: string) =>
  body ? `<section><h2>${escapeHtml(title)}</h2>${body}</section>` : "";

export const subsection = (title: string, body: string) =>
  body ? `<div class="sub"><h3>${escapeHtml(title)}</h3>${body}</div>` : "";

/* Label / value pairs laid out as a compact grid; empty values are dropped. */
export const fields = (items: { label: string; value?: string }[], className = "") => {
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
export const table = <T,>(
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

export const list = (items: string[]) => {
  const filled = items.filter(has);
  return filled.length
    ? `<ul class="inline">${filled.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : "";
};

export const PRINT_BASE_STYLES = `
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

/* Prints a complete HTML document from a hidden iframe, so the page
   itself is untouched. */
export const printHtmlDocument = (html: string) => {
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
  frameDocument.write(html);
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
