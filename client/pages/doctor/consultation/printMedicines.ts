/* ============================================================
   PRINT MEDICINES
   Text rules for the printed Summary: the medicine name carries one
   dosage-form prefix, the medicine type is a sub-heading (never part of
   the sentence), and the administration detail flows naturally after
   the route instead of appearing under a separate "Administration:"
   heading.
   ============================================================ */

export type PrintableMedicine = {
  drug_role?: string | null;
  drug_name?: string | null;
  drug_type?: string | null;
  drug_sequence?: number | null;
  formulation?: string | null;
  protocol_dose?: number | null;
  protocol_dose_unit?: string | null;
  calculated_dose?: number | string | null;
  calculated_dose_unit?: string | null;
  dilution_volume?: string | null;
  dilution_solution?: string | null;
  administration_route?: string | null;
  frequency?: string | null;
  remarks?: string | null;
  timing_relative_to_primary?: string | null;
  infusion_type?: string | null;
  infusion_duration_minutes?: number | null;
  administration_detail?: string | null;
  medicine_master?: {
    medicine_name?: string | null;
    generic_name?: string | null;
    dosage_form?: string | null;
    unit?: string | null;
  } | null;
};

export type MedicineTypeSection = {
  role: string;
  label: string;
};

/* drug_type holds the dosage form on newer protocol items, but older
   rows stored the role name there - never treat those as a form. */
const ROLE_DRUG_TYPES = new Set([
  "PREMEDICATION",
  "PRIMARY",
  "SUPPORTIVE",
  "POSTMEDICATION",
  "DILUTION",
  "DISCHARGE",
]);

const FORM_ALIASES: Record<string, string> = {
  inj: "Inj.",
  injection: "Inj.",
  inf: "Inf.",
  infusion: "Inf.",
  tab: "Tab.",
  tablet: "Tab.",
  cap: "Cap.",
  capsule: "Cap.",
  syr: "Syr.",
  syrup: "Syr.",
  susp: "Susp.",
  suspension: "Susp.",
  sol: "Soln.",
  soln: "Soln.",
  solution: "Soln.",
  oint: "Oint.",
  ointment: "Oint.",
  cream: "Cream",
  gel: "Gel",
  "powder for injection": "Inj.",
  "powder for infusion": "Inf.",
  "intrathecal injection": "Inj.",
  "concentrate for infusion": "Inf.",
};

/* A form word at the start of a medicine name: "Inj Pertuzumab",
   "Inj. Pertuzumab", "Injection Pertuzumab", "Tab Paracetamol". */
const NAME_FORM_WORD =
  /^(inj(?:ection)?|inf(?:usion)?|tab(?:let)?|cap(?:sule)?|syr(?:up)?|susp(?:ension)?|soln?|sol(?:ution)?|oint(?:ment)?|cream|gel)\b\.?\s+(.+)$/i;

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* The medicine the plan names, else the generic, else the typed name. */
export const medicineName = (item: PrintableMedicine): string =>
  item.medicine_master?.medicine_name ||
  item.medicine_master?.generic_name ||
  item.drug_name ||
  "";

/* The dosage form: the row's formulation, the master's form, else a real
   drug_type (never the legacy role name stored there). */
export const medicineForm = (item: PrintableMedicine): string => {
  const explicit = (
    item.formulation ||
    item.medicine_master?.dosage_form ||
    ""
  ).trim();
  if (explicit) return explicit;
  const type = (item.drug_type ?? "").trim();
  return type && !ROLE_DRUG_TYPES.has(type.toUpperCase()) ? type : "";
};

/* "Inj. Pertuzumab": collapse any repeated form prefixes already in the
   name ("Inj. Inj Pertuzumab"), then add exactly one canonical prefix. */
export const medicineWithForm = (item: PrintableMedicine): string => {
  let name = medicineName(item).trim();
  let prefix = "";
  let match = name.match(NAME_FORM_WORD);
  while (match) {
    const token = match[1].toLowerCase();
    prefix = FORM_ALIASES[token] ?? prefix;
    name = (match[2] ?? "").trim();
    match = name.match(NAME_FORM_WORD);
  }
  if (!name) return "";
  if (prefix) return `${prefix} ${name}`;

  const form = medicineForm(item);
  const formPrefix = form ? FORM_ALIASES[form.toLowerCase()] ?? form : "";
  return formPrefix ? `${formPrefix} ${name}` : name;
};

/* "175 mg/m²": the protocol (ordered) dose, with the calculated unit as a
   fallback when the protocol row is missing its unit. */
export const protocolDoseText = (item: PrintableMedicine): string => {
  if (item.protocol_dose === null || item.protocol_dose === undefined) {
    return "";
  }
  const unit =
    item.protocol_dose_unit || item.calculated_dose_unit || "";
  return `${Number(item.protocol_dose)} ${unit}`.trim();
};

/* "297.5 mg": the Dose Cal result (chemotherapy drugs only), "" if none. */
export const patientDoseText = (item: PrintableMedicine): string => {
  if (
    item.calculated_dose === null ||
    item.calculated_dose === undefined ||
    item.calculated_dose === ("" as unknown)
  ) {
    return "";
  }
  const unit =
    item.calculated_dose_unit || item.protocol_dose_unit || "";
  return `${Number(item.calculated_dose)} ${unit}`.trim();
};

const infusionDurationText = (minutes?: number | null): string => {
  if (minutes === null || minutes === undefined) return "";
  if (minutes > 0 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  return `${minutes} minutes`;
};

/* "250 mL": a stored volume may or may not carry its unit. */
const volumeText = (volume?: string | null): string => {
  const value = (volume ?? "").trim();
  if (!value) return "";
  const normalized = value.replace(/\bml\b/gi, "mL");
  return /[a-z]/i.test(normalized) ? normalized : `${normalized} mL`;
};

/* "IN 250 ML NS OVER 60 MIN" -> "in 250 mL NS over 60 minutes" */
export const humanizeAdministrationDetail = (
  value?: string | null
): string => {
  let text = (value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.;,]+$/, "")
    .trim();
  if (!text) return "";

  text = text
    .replace(/\bML\b/gi, "mL")
    .replace(/\bMG\b/gi, "mg")
    .replace(/\bMCG\b/gi, "mcg")
    .replace(/\bUG\b/gi, "mcg")
    .replace(
      /\b(\d+)\s*MINS?\b/gi,
      (_match, count: string) =>
        `${count} ${Number(count) === 1 ? "minute" : "minutes"}`
    )
    .replace(/\bMINS?\b/gi, "minutes")
    .replace(
      /\b(\d+)\s*HRS?\b/gi,
      (_match, count: string) =>
        `${count} ${Number(count) === 1 ? "hour" : "hours"}`
    )
    .replace(/\bHRS?\b/gi, "hours")
    .replace(
      /\b(\d+)\s*HOURS?\b/gi,
      (_match, count: string) =>
        `${count} ${Number(count) === 1 ? "hour" : "hours"}`
    );

  /* Lower-case the instruction prepositions, but keep IV/IM/PO/etc. */
  text = text
    .replace(/\bOVER\b/gi, "over")
    .replace(
      /(^|[,;]\s*)(IN|VIA|AS|BY|AT|WITH)\b/g,
      (_match, separator: string, word: string) =>
        `${separator}${word.toLowerCase()}`
    );

  return text.trim();
};

const mentionsRoute = (detail: string, route: string): boolean => {
  const cleaned = route.trim().toLowerCase();
  if (!detail || !cleaned) return false;
  const aliases: Record<string, string[]> = {
    iv: ["iv", "i.v.", "intravenous", "intravenously"],
    im: ["im", "i.m.", "intramuscular"],
    sc: ["sc", "s.c.", "subcutaneous", "subcutaneously"],
    po: ["po", "p.o.", "oral", "orally"],
    it: ["it", "intrathecal"],
  };
  const candidates = aliases[cleaned] ?? [cleaned];
  const lower = detail.toLowerCase();
  return candidates.some((candidate) =>
    /^[a-z]{2}$/i.test(candidate)
      ? new RegExp(`\\b${escapeRegExp(candidate)}\\b`, "i").test(lower)
      : lower.includes(candidate)
  );
};

const mentionsVolume = (
  detail: string,
  volume?: string | null
): boolean => {
  const raw = (volume ?? "").trim();
  if (!detail || !raw) return false;
  const number = raw.match(/\d+(?:\.\d+)?/)?.[0];
  if (!number) return false;
  return new RegExp(
    `\\b${escapeRegExp(number)}\\s*(ml|millilit\\w*|cc)\\b`,
    "i"
  ).test(detail);
};

const mentionsDuration = (
  detail: string,
  minutes?: number | null
): boolean => {
  if (!detail || minutes === null || minutes === undefined) return false;
  const count = Number(minutes);
  if (!Number.isFinite(count)) return false;
  if (
    new RegExp(
      `\\b${escapeRegExp(String(count))}\\s*(min|minute|minutes|hr|hrs|hour|hours)\\b`,
      "i"
    ).test(detail)
  ) {
    return true;
  }
  if (count > 0 && count % 60 === 0) {
    const hours = count / 60;
    return new RegExp(
      `\\b${escapeRegExp(String(hours))}\\s*(hr|hrs|hour|hours)\\b`,
      "i"
    ).test(detail);
  }
  return false;
};

const containsText = (detail: string, value?: string | null): boolean => {
  const cleaned = (value ?? "").trim().toLowerCase();
  return cleaned.length > 1 && detail.toLowerCase().includes(cleaned);
};

/* The administration phrase that follows the dose: route first, then the
   free-text Admin Detail (if any), then any structured field it did not
   already mention. */
export const buildAdministrationPhrase = (
  item: PrintableMedicine,
  options: { diluent?: string | null } = {}
): string => {
  const route = (item.administration_route ?? "").trim();
  const detail = humanizeAdministrationDetail(item.administration_detail);
  const volume = volumeText(item.dilution_volume);
  const diluent = (
    item.dilution_solution ||
    options.diluent ||
    ""
  ).trim();
  const duration = infusionDurationText(item.infusion_duration_minutes);
  const infusion = (item.infusion_type ?? "").trim();

  const parts: string[] = [];
  const detailHasRoute = detail ? mentionsRoute(detail, route) : false;

  if (route && !detailHasRoute) parts.push(`given ${route}`);

  if (detail) {
    const startsWithPreposition = /^(in|over|via|as|by|at|with)\b/i.test(
      detail
    );
    if (parts.length > 0) {
      parts.push(startsWithPreposition ? detail : `- ${detail}`);
    } else {
      parts.push(startsWithPreposition ? `given ${detail}` : detail);
    }
    /* Fill in structured values only when the free text lacks them. */
    if (volume && !mentionsVolume(detail, item.dilution_volume)) {
      parts.push(`in ${volume}${diluent ? ` ${diluent}` : ""}`);
    }
    if (duration && !mentionsDuration(detail, item.infusion_duration_minutes)) {
      parts.push(`over ${duration}`);
    }
    if (infusion && !containsText(detail, infusion)) {
      parts.push(`as ${infusion}`);
    }
  } else {
    if (volume) parts.push(`in ${volume}${diluent ? ` ${diluent}` : ""}`);
    else if (diluent) parts.push(`in ${diluent}`);
    if (duration) parts.push(`over ${duration}`);
    if (infusion) parts.push(`as ${infusion}`);
  }

  return parts.filter(Boolean).join(" ");
};

/* One readable sentence, e.g.
   "Inj. Pertuzumab - patient dose 79.6 mg (protocol dose 40 mg), given IV
   in 250 mL NS over 60 minutes."
   The caller adds the number and the final full stop. */
export const buildMedicineSentence = (
  item: PrintableMedicine,
  options: { diluent?: string | null } = {}
): string => {
  const role = (item.drug_role ?? "").toUpperCase();
  const protocolDose = protocolDoseText(item);
  const patientDose = patientDoseText(item);

  let doseText = "";
  if (role === "PRIMARY") {
    if (patientDose && protocolDose) {
      doseText = `patient dose ${patientDose} (protocol dose ${protocolDose})`;
    } else if (patientDose) {
      doseText = `patient dose ${patientDose}`;
    } else if (protocolDose) {
      doseText = `protocol dose ${protocolDose}`;
    }
  } else if (protocolDose) {
    doseText = `dose ${protocolDose}`;
  } else if (patientDose) {
    doseText = `dose ${patientDose}`;
  }

  const administration = buildAdministrationPhrase(item, options);
  const extras = [item.frequency, item.timing_relative_to_primary]
    .map((value) => (value ?? "").trim())
    .filter(Boolean)
    .filter(
      (value) =>
        !administration.toLowerCase().includes(value.toLowerCase())
    );

  const details = [doseText, administration, ...extras]
    .filter(Boolean)
    .join(", ");
  const name = medicineWithForm(item);

  if (!name) return details;
  return `${name}${details ? ` - ${details}` : ""}`;
};

/* Group the day's medicines by type, in the given (clinical) order.
   Rows whose role is not in the list go under "Other Medicines". */
export const groupMedicinesByType = <
  T extends { drug_role?: string | null; drug_sequence?: number | null }
>(
  items: T[],
  sections: MedicineTypeSection[]
): { label: string; items: T[] }[] => {
  const ordered = sections.map((section) => ({
    ...section,
    role: section.role.toUpperCase(),
  }));

  const groups = ordered
    .map((section) => ({
      label: section.label,
      items: items
        .filter(
          (item) =>
            (item.drug_role ?? "").toUpperCase() === section.role
        )
        .sort(
          (a, b) => (a.drug_sequence ?? 0) - (b.drug_sequence ?? 0)
        ),
    }))
    .filter((group) => group.items.length > 0);

  const knownRoles = new Set(ordered.map((section) => section.role));
  const other = items
    .filter(
      (item) => !knownRoles.has((item.drug_role ?? "").toUpperCase())
    )
    .sort((a, b) => (a.drug_sequence ?? 0) - (b.drug_sequence ?? 0));

  if (other.length > 0) {
    groups.push({ label: "Other Medicines", items: other });
  }

  return groups;
};
