import type { ReactNode } from "react";

export interface DepartmentColors {
  bg: string;
  text: string;
}

const DEPARTMENT_COLORS: Record<string, DepartmentColors> = {
  Cardiology: { bg: "#DBEAFE", text: "#1E40AF" },
  Neurology: { bg: "#EDE9FE", text: "#5B21B6" },
  Pediatrics: { bg: "#FCE7F3", text: "#9D174D" },
  Orthopedics: { bg: "#D1FAE5", text: "#065F46" },
  "Emergency Medicine": { bg: "#FEE2E2", text: "#991B1B" },
  Radiology: { bg: "#E0E7FF", text: "#312E81" },
  Pathology: { bg: "#F3E8FF", text: "#6B21A8" },
  Dermatology: { bg: "#FEF3C7", text: "#92400E" },
  Psychiatry: { bg: "#E0F2FE", text: "#075985" },
  Oncology: { bg: "#FDF4FF", text: "#86198F" },
  "General Medicine": { bg: "#E6E8EA", text: "#475C7F" },
  "Internal Medicine": { bg: "#E6E8EA", text: "#475C7F" },
  Surgery: { bg: "#FEE2E2", text: "#991B1B" },
  "Cardiac Surgery": { bg: "#FEE2E2", text: "#991B1B" },
  "Neurosurgery": { bg: "#EDE9FE", text: "#5B21B6" },
  "Plastic Surgery": { bg: "#FCE7F3", text: "#9D174D" },
  Urology: { bg: "#DBEAFE", text: "#1E40AF" },
  Nephrology: { bg: "#DBEAFE", text: "#1E40AF" },
  Gastroenterology: { bg: "#FEF3C7", text: "#92400E" },
  Endocrinology: { bg: "#F0FDF4", text: "#166534" },
  Rheumatology: { bg: "#EDE9FE", text: "#5B21B6" },
  Pulmonology: { bg: "#E0F2FE", text: "#075985" },
  "Infectious Disease": { bg: "#FEE2E2", text: "#991B1B" },
  Allergy: { bg: "#F0FDF4", text: "#166534" },
  Anesthesiology: { bg: "#F3E8FF", text: "#6B21A8" },
  "Nuclear Medicine": { bg: "#E0E7FF", text: "#312E81" },
  "Physical Medicine": { bg: "#D1FAE5", text: "#065F46" },
  "Occupational Medicine": { bg: "#F5F5F4", text: "#44403C" },
  "Preventive Medicine": { bg: "#F0FDF4", text: "#166534" },
  "Family Medicine": { bg: "#E6E8EA", text: "#475C7F" },
  Geriatrics: { bg: "#EDE9FE", text: "#5B21B6" },
  Obstetrics: { bg: "#FCE7F3", text: "#9D174D" },
  Gynecology: { bg: "#FCE7F3", text: "#9D174D" },
  "OB/GYN": { bg: "#FCE7F3", text: "#9D174D" },
  Ophthalmology: { bg: "#DBEAFE", text: "#1E40AF" },
  Otolaryngology: { bg: "#DBEAFE", text: "#1E40AF" },
  "ENT": { bg: "#DBEAFE", text: "#1E40AF" },
  Nursing: { bg: "#DBEAFE", text: "#1E40AF" },
  Administration: { bg: "#F5F5F4", text: "#44403C" },
  Admin: { bg: "#F5F5F4", text: "#44403C" },
  "Human Resources": { bg: "#F5F5F4", text: "#44403C" },
  Finance: { bg: "#FEF3C7", text: "#92400E" },
  IT: { bg: "#E0E7FF", text: "#312E81" },
  "Information Technology": { bg: "#E0E7FF", text: "#312E81" },
  Maintenance: { bg: "#F5F5F4", text: "#44403C" },
  Housekeeping: { bg: "#F5F5F4", text: "#44403C" },
  Security: { bg: "#1E293B", text: "#F8FAFC" },
  Pharmacy: { bg: "#F0FDF4", text: "#166534" },
  Laboratory: { bg: "#EDE9FE", text: "#5B21B6" },
  "Lab": { bg: "#EDE9FE", text: "#5B21B6" },
  "Blood Bank": { bg: "#FEE2E2", text: "#991B1B" },
  "Dietetics": { bg: "#F0FDF4", text: "#166534" },
  Physiotherapy: { bg: "#D1FAE5", text: "#065F46" },
  "Occupational Therapy": { bg: "#D1FAE5", text: "#065F46" },
  "Speech Therapy": { bg: "#D1FAE5", text: "#065F46" },
};

const DEFAULT_COLORS: DepartmentColors = { bg: "#E6E8EA", text: "#475C7F" };

export function getDepartmentColors(departmentName?: string | null): DepartmentColors {
  if (!departmentName) return DEFAULT_COLORS;
  const normalized = departmentName.trim();
  return DEPARTMENT_COLORS[normalized] || DEPARTMENT_COLORS[normalized.toLowerCase()] || DEFAULT_COLORS;
}

export function DepartmentPill({
  department,
  className = "",
  children,
}: {
  department?: string | null;
  className?: string;
  children?: ReactNode;
}) {
  const { bg, text } = getDepartmentColors(department);
  const label = children ?? (department ?? "—");

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${className}`}
      style={{ backgroundColor: bg, color: text }}
    >
      {label}
    </span>
  );
}

export function DepartmentAvatarText({
  department,
  className = "",
  children,
}: {
  department?: string | null;
  className?: string;
  children?: ReactNode;
}) {
  const { bg, text } = getDepartmentColors(department);
  const label = children ?? (department ?? "—");

  return (
    <span
      className={`inline-flex items-center justify-center w-7 h-7 rounded-xl hms-avatar-text ${className}`}
      style={{ backgroundColor: bg, color: text }}
    >
      {label}
    </span>
  );
}