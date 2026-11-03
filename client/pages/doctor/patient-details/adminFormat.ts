import type { ChemoAdministrationItem } from "@/api/chemotherapy.api";

/* Formatting shared by the Administration tab and its printouts (MAR,
   cycle report). */

/* 09-Oct-2026. Date-only values (YYYY-MM-DD) are calendar dates; full
   timestamps are shown in IST, the hospital's timezone. */
export function fmtDate(value?: string | null): string {
  if (!value) return "—";
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(isDateOnly ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return "—";
  return date
    .toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: isDateOnly ? "UTC" : "Asia/Kolkata",
    })
    .replace(/ /g, "-");
}

export function fmtTime(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

export function doseText(value: number | string | null | undefined, unit: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const number = Number(value);
  const shown = Number.isFinite(number)
    ? number.toLocaleString("en-IN", { maximumFractionDigits: 2 })
    : String(value);
  return `${shown} ${unit ?? ""}`.trim();
}

export function infusionText(item: Pick<ChemoAdministrationItem, "infusion_rate" | "infusion_duration_minutes" | "infusion_type">): string {
  if (item.infusion_rate) return item.infusion_rate;
  const minutes = item.infusion_duration_minutes;
  if (minutes) {
    if (minutes >= 60 && minutes % 60 === 0) {
      const hours = minutes / 60;
      return `${hours} hr${hours > 1 ? "s" : ""}`;
    }
    return `${minutes} min`;
  }
  return item.infusion_type || "—";
}

export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/* The dose given: the patient's calculated dose, else the protocol dose. */
export function itemDose(item: Pick<ChemoAdministrationItem, "calculated_dose" | "calculated_dose_unit" | "protocol_dose" | "protocol_dose_unit">): string {
  return doseText(item.calculated_dose, item.calculated_dose_unit) || doseText(item.protocol_dose, item.protocol_dose_unit);
}

/* Order of the administered drug roles and their section titles. */
export const ADMIN_ROLE_SECTIONS: { role: string; title: string }[] = [
  { role: "PREMEDICATION", title: "Pre-Medications" },
  { role: "PRIMARY", title: "Chemotherapy Drugs" },
  { role: "SUPPORTIVE", title: "Supportive Medications" },
];

export const ADMIN_STATUS_LABEL: Record<string, string> = {
  GIVEN: "Given",
  PENDING: "Pending",
  SKIPPED: "Skipped",
  CANCELLED: "Cancelled",
  NOT_RECORDED: "Not recorded",
};

/* CTCAE v5 grades, the severity each one implies, and their colours. */
export const CTCAE_GRADES: { value: string; severity: string; hint: string; active: string; badge: string }[] = [
  { value: "1", severity: "Mild",             hint: "Mild; observation only",            active: "border-green-600 bg-green-600 text-white",   badge: "bg-green-50 text-green-700 border border-green-200" },
  { value: "2", severity: "Moderate",         hint: "Moderate; minimal intervention",    active: "border-amber-500 bg-amber-500 text-white",   badge: "bg-amber-50 text-amber-700 border border-amber-200" },
  { value: "3", severity: "Severe",           hint: "Severe; hospitalization indicated", active: "border-orange-600 bg-orange-600 text-white", badge: "bg-orange-50 text-orange-700 border border-orange-200" },
  { value: "4", severity: "Life-threatening", hint: "Urgent intervention indicated",     active: "border-red-600 bg-red-600 text-white",       badge: "bg-red-50 text-red-600 border border-red-200" },
  { value: "5", severity: "Fatal",            hint: "Death related to the event",        active: "border-red-800 bg-red-800 text-white",       badge: "bg-red-700 text-white border border-red-700" },
];

