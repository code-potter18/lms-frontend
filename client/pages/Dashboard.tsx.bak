import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Stethoscope, UserRound, Users, Calendar as CalendarIcon, FileText, Receipt, Loader2, Activity, AlertCircle, FlaskConical, CheckCircle2, XCircle, ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, ChevronDown, Bed, BedDouble } from "lucide-react";
import { useNavigate } from 'react-router-dom';
import HmsTable from "@/components/hms/HmsTable";
import { format, isToday, isTomorrow, isYesterday, addDays, subDays } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import CalendarPicker from "@/components/hms/Calender";
import BranchPerformance from "@/components/hms/branchPerformance";
import { useFilterPanel, useDashboardFilters } from "@/components/Filter";
import { ToolbarFilter } from "@/components/ui/toolbar-filter";
import { applySearchAndFilter } from "@/components/Filter/utils";
import { useToast } from "@/hooks/use-toast";
import { ConfirmationDialog } from "@/components/ui/ConfirmationDialog";
import API from "@/api/axios";
import { employeeApi, type EmployeeRecord } from "@/api/employee.api";
import { encounterApi, type EncounterRecord } from "@/api/encounter.api";
import { patientApi, type PatientRecord } from "@/api/patient.api";
import { appointmentApi, type AppointmentRecord } from "@/api/appointment.api";
import { ipdApi } from "@/api/ipd.api";
import { RefreshButton } from "@/components/hms/RefreshButton";
import { StatusBadge } from "@/components/hms/StatusBadge";
import { AppointmentActionMenu } from "@/components/hms/AppointmentActionMenu";
import { DepartmentPill, DepartmentAvatarText } from "@/components/hms/DepartmentBadge";
import { DoctorBranchDisplay } from "@/components/hms/DoctorBranchDisplay";
import { useBranchFilter } from "@/context/BranchFilterContext";
import { usePermission } from "@/context/PermissionContext";
import { getUser } from "@/utils/token";

import { useCriticalPatients } from "@/hooks/useCriticalPatients";
import { CriticalDot, CriticalCorner, CriticalWrapper } from "@/components/hms/CriticalPatientIndicator";
import type { CriticalInfo } from "@/components/hms/CriticalPatientIndicator";

function getVitalsCriticalReasons(enc: EncounterRecord): string[] {
  const reasons: string[] = [];
  if (enc.pain_score != null) {
    const ps = Number(enc.pain_score);
    if (ps >= 7) reasons.push(`Pain Score: ${ps}/10`);
  }
  if (enc.systolic_bp != null && enc.diastolic_bp != null) {
    const sys = Number(enc.systolic_bp);
    const dia = Number(enc.diastolic_bp);
    if (sys > 180 || dia > 120) reasons.push(`High BP: ${sys}/${dia}`);
    else if (sys < 90 || dia < 60) reasons.push(`Low BP: ${sys}/${dia}`);
  }
  if (enc.spo2 != null) {
    const spo2 = Number(enc.spo2);
    if (spo2 < 90) reasons.push(`SpO2: ${spo2}%`);
  }
  if (enc.temperature != null) {
    const temp = Number(enc.temperature);
    if (temp > 39.5) reasons.push(`Temp: ${temp}\u00B0F`);
  }
  if (enc.pulse != null) {
    const pulse = Number(enc.pulse);
    if (pulse > 120 || pulse < 40) reasons.push(`Pulse: ${pulse} bpm`);
  }
  const notes = (enc.clinical_notes || "").toLowerCase();
  if (
    notes.includes("not doing well") ||
    notes.includes("critical") ||
    notes.includes("deteriorating") ||
    notes.includes("urgent")
  ) {
    reasons.push("Clinical Status: Not Doing Well");
  }
  return reasons;
}
import { getKpiPreferences, saveKpiPreferences } from "@/api/userPreferences.api";

const navItems = [
  {
    label: "Dashboard",
    active: true,
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M7.5 4.5V0H13.5V4.5H7.5ZM0 7.5V0H6V7.5H0ZM7.5 13.5V6H13.5V13.5H7.5ZM0 13.5V9H6V13.5H0ZM1.5 6H4.5V1.5H1.5V6ZM9 12H12V7.5H9V12ZM9 3H12V1.5H9V3ZM1.5 12H4.5V10.5H1.5V12Z" fill="currentColor"/>
      </svg>
    ),
  },
  {
    label: "Staff",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <path d="M8.25 0C8.6625 0 9.01582.14668 9.30957.44043C9.60332.73418 9.75 1.0875 9.75 1.5V3.75H13.5C13.9125 3.75 14.2658 3.89668 14.5596 4.19043C14.8533 4.48418 15 4.8375 15 5.25V13.5C15 13.9125 14.8533 14.2658 14.5596 14.5596C14.2658 14.8533 13.9125 15 13.5 15H1.5C1.0875 15 .73418 14.8533.44043 14.5596C.14668 14.2658 0 13.9125 0 13.5V5.25C0 4.8375.14668 4.48418.44043 4.19043C.73418 3.89668 1.0875 3.75 1.5 3.75H5.25V1.5C5.25 1.0875 5.39668.73418 5.69043.44043C5.98418.14668 6.3375 0 6.75 0H8.25ZM1.5 13.5H13.5V5.25H9.75C9.75 5.6625 9.60332 6.01582 9.30957 6.30957C9.01582 6.60332 8.6625 6.75 8.25 6.75H6.75C6.3375 6.75 5.98418 6.60332 5.69043 6.30957C5.39668 6.01582 5.25 5.6625 5.25 5.25H1.5V13.5ZM5.25 10.3125C5.5374 10.3125 5.80926 10.3403 6.06543 10.3965C6.32168 10.4527 6.5752 10.5379 6.8252 10.6504C7.03755 10.7504 7.20357 10.8911 7.32227 11.0723C7.44075 11.2533 7.49993 11.4499 7.5 11.6621V12H3V11.6621C3.00007 11.4499 3.05925 11.2533 3.17773 11.0723C3.29643 10.8911 3.46245 10.7504 3.6748 10.6504C3.9248 10.5379 4.17832 10.4527 4.43457 10.3965C4.69074 10.3403 4.9626 10.3125 5.25 10.3125ZM12 9.75V10.875H9V9.75H12ZM5.25 7.5C5.5625 7.5 5.82812 7.60938 6.04688 7.82812C6.26562 8.04688 6.375 8.3125 6.375 8.625C6.375 8.9375 6.26562 9.20312 6.04688 9.42188C5.82812 9.64062 5.5625 9.75 5.25 9.75C4.9375 9.75 4.67188 9.64062 4.45312 9.42188C4.23438 9.20312 4.125 8.9375 4.125 8.625C4.125 8.3125 4.23438 8.04688 4.45312 7.82812C4.67188 7.60938 4.9375 7.5 5.25 7.5ZM12 7.5V8.625H9V7.5H12ZM6.75 5.25H8.25V1.5H6.75V5.25Z" fill="currentColor"/>
      </svg>
    ),
  },
  {
    label: "Doctor",
    icon: (
      <svg width="20" height="16" viewBox="0 0 20 16" fill="none">
        <path fillRule="evenodd" clipRule="evenodd" d="M9.27875 3.61979C9.27875 5.05516 8.99208 6.92723 8.55108 6.64314C8.37075 7.37584 7.99216 8.00831 7.47958 8.43315C6.96701 8.85799 6.35206 9.04901 5.73914 8.97379C5.12622 8.89856 4.55311 8.56172 4.11714 8.02046C3.68117 7.4792 3.4092 6.76688 3.34741 6.00446C2.90975 5.05184 2.33575 3.14285 3.81141 1.65481C3.83808 1.64403 3.85408 1.55445 3.87808 1.42257C3.96941 0.923651 4.17175-0.185328 5.44808 0.0265973C6.43241 0.189585 9.27875 0.821628 9.27875 3.61979Z" fill="currentColor"/>
        <path d="M2.33333 12.8216C2.33333 12.3729 2.52433 11.9797 2.811 11.7607C2.80011 11.7091 2.78988 11.6572 2.78033 11.6052C2.72995 11.3218 2.69046 11.0356 2.662 10.7476C2.63357 10.4715 2.61633 10.1938 2.61033 9.91561C1.20333 10.6028 0 11.8005 0 13.058V15.31H12V13.058C12 11.8536 10.8967 10.7044 9.56733 10.0056V10.0172C9.57333 10.2702 9.562 10.5605 9.54 10.8396C9.52 11.0984 9.49033 11.3564 9.45467 11.5774H9.66667C9.72855 11.5775 9.78921 11.5989 9.84184 11.6394C9.89447 11.6799 9.937 11.7379 9.96467 11.8068L10.298 12.6362C10.3213 12.6939 10.3333 12.7573 10.3333 12.8216V13.6511C10.3333 13.761 10.2982 13.8665 10.2357 13.9443C10.1732 14.0221 10.0884 14.0658 10 14.0658H9.33333V13.2363H9.66667V12.9195L9.46067 12.4069H8.53933L8.33333 12.9195V13.2363H8.66667V14.0658H8C7.91159 14.0658 7.82681 14.0221 7.7643 13.9443C7.70179 13.8665 7.66667 13.761 7.66667 13.6511V12.8216C7.66667 12.7573 7.67867 12.6939 7.702 12.6362L8.03533 11.8068C8.063 11.7379 8.10553 11.6799 8.15816 11.6394C8.21079 11.5989 8.27145 11.5775 8.33333 11.5774H8.77167C8.779 11.5418 8.78633 11.5022 8.79367 11.4588C8.827 11.2635 8.85667 11.0159 8.87667 10.76C8.89667 10.5037 8.906 10.2495 8.901 10.0404C8.89991 9.95384 8.89445 9.86741 8.88467 9.78166C8.87733 9.72276 8.87 9.69581 8.86867 9.69L8.86967 9.68876C8.69278 9.62049 8.51387 9.56059 8.33333 9.50918C8.16567 9.46149 7.99233 9.74848 7.91667 9.92805H4L3.97133 9.85838C3.90067 9.68336 3.81367 9.46729 3.66667 9.50918C3.53822 9.5454 3.40989 9.58646 3.28167 9.63235C3.27768 9.7051 3.2759 9.778 3.27633 9.85091C3.27767 10.0803 3.29533 10.361 3.32367 10.6447C3.352 10.9275 3.39033 11.2029 3.43033 11.4202C3.44189 11.483 3.453 11.5389 3.46367 11.5878C3.65424 11.619 3.83355 11.7178 3.98014 11.8725C4.12673 12.0272 4.23439 12.2311 4.29022 12.46C4.34605 12.6888 4.34769 12.9328 4.29495 13.1628C4.24221 13.3927 4.13731 13.5989 3.99283 13.7566C3.84834 13.9143 3.67038 14.0169 3.48026 14.052C3.29013 14.0872 3.0959 14.0534 2.9208 13.9547C2.74571 13.8561 2.59718 13.6967 2.49299 13.4958C2.3888 13.2948 2.33337 13.0607 2.33333 12.8216Z" fill="currentColor"/>
      </svg>
    ),
  },
  {
    label: "Patients",
    icon: (
      <svg width="12" height="15" viewBox="0 0 12 15" fill="none">
        <path d="M6 6C5.175 6 4.46875 5.70625 3.88125 5.11875C3.29375 4.53125 3 3.825 3 3C3 2.175 3.29375 1.46875 3.88125 0.88125C4.46875 0.29375 5.175 0 6 0C6.825 0 7.53125 0.29375 8.11875 0.88125C8.70625 1.46875 9 2.175 9 3C9 3.825 8.70625 4.53125 8.11875 5.11875C7.53125 5.70625 6.825 6 6 6ZM0 15V9.91875C0 9.49375 0.10625 9.10312 0.31875 8.74687C0.53125 8.39062 0.825 8.1125 1.2 7.9125C1.8375 7.5875 2.55937 7.3125 3.36562 7.0875C4.17188 6.8625 5.05 6.75 6 6.75C6.95 6.75 7.82812 6.8625 8.63437 7.0875C9.44062 7.3125 10.1625 7.5875 10.8 7.9125C11.175 8.1125 11.4688 8.39062 11.6812 8.74687C11.8937 9.10312 12 9.49375 12 9.91875V13.5C12 13.9125 11.8531 14.2656 11.5594 14.5594C11.2656 14.8531 10.9125 15 10.5 15H4.3125C3.7375 15 3.25 14.8 2.85 14.4C2.45 14 2.25 13.5125 2.25 12.9375C2.25 12.3625 2.45 11.875 2.85 11.475C3.25 11.075 3.7375 10.875 4.3125 10.875H6.43125L7.59375 8.4C7.34375 8.35 7.0875 8.3125 6.825 8.2875C6.5625 8.2625 6.2875 8.25 6 8.25C5.1 8.25 4.3 8.35938 3.6 8.57812C2.9 8.79688 2.33125 9.025 1.89375 9.2625C1.76875 9.325 1.67188 9.41563 1.60312 9.53438C1.53437 9.65312 1.5 9.78125 1.5 9.91875V15H0ZM4.3125 13.5H5.2125L5.7375 12.375H4.3125C4.1625 12.375 4.03125 12.4312 3.91875 12.5437C3.80625 12.6562 3.75 12.7875 3.75 12.9375C3.75 13.0875 3.80625 13.2188 3.91875 13.3313C4.03125 13.4438 4.1625 13.5 4.3125 13.5ZM6.8625 13.5H10.5V9.91875C10.5 9.78125 10.4656 9.65312 10.3969 9.53438C10.3281 9.41563 10.2375 9.325 10.125 9.2625C9.975 9.1875 9.8125 9.10938 9.6375 9.02812C9.4625 8.94687 9.275 8.86875 9.075 8.79375L6.8625 13.5Z" fill="currentColor"/>
      </svg>
    ),
  },
  {
    label: "Appointment",
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M1.5 13.5C1.0875 13.5.734375 13.3678.440625 13.1034C.146875 12.8391 0 12.5213 0 12.15V2.7C0 2.32875.146875 2.01094.440625 1.74656C.734375 1.48219 1.0875 1.35 1.5 1.35H2.25V0H3.75V1.35H9.75V0H11.25V1.35H12C12.4125 1.35 12.7656 1.48219 13.0594 1.74656C13.3531 2.01094 13.5 2.32875 13.5 2.7V12.15C13.5 12.5213 13.3531 12.8391 13.0594 13.1034C12.7656 13.3678 12.4125 13.5 12 13.5H1.5ZM1.5 12.15H12V5.4H1.5V12.15ZM1.5 4.05H12V2.7H1.5V4.05Z" fill="currentColor"/>
      </svg>
    ),
  },
  {
    label: "Billing",
    icon: (
      <svg width="14" height="15" viewBox="0 0 14 15" fill="none">
        <path d="M2.25 15C1.625 15 1.09375 14.7812.65625 14.3438C.21875 13.9062 0 13.375 0 12.75V10.5H2.25V0L3.375 1.125L4.5 0L5.625 1.125L6.75 0L7.875 1.125L9 0L10.125 1.125L11.25 0L12.375 1.125L13.5 0V12.75C13.5 13.375 13.2812 13.9062 12.8438 14.3438C12.4062 14.7812 11.875 15 11.25 15H2.25Z" fill="currentColor"/>
      </svg>
    ),
  },
  {
    label: "Protocol",
    icon: (
      <svg width="13" height="15" viewBox="0 0 13 15" fill="none">
        <path d="M5.68803 12.8126L11.1047 6.56262C11.3578 6.27642 11.5592 5.93516 11.6973 5.55857C11.8354 5.18199 11.9074 4.77755 11.9092 4.36865C11.911 3.95975 11.8425 3.5545 11.7078 3.17632C11.573 2.79815 11.3745 2.45456 11.1239 2.16542C10.8734 1.87628 10.5756 1.64732 10.2478 1.49179C9.92007 1.33627 9.56885 1.25725 9.21447 1.25932C8.86009 1.26138 8.50958 1.34449 8.18321 1.50383C7.85683 1.66317 7.56108 1.89558 7.31303 2.18762L1.89636 8.43762C1.64326 8.72383 1.44183 9.06509 1.30374 9.44167C1.16565 9.81826 1.09362 10.2227 1.09183 10.6316C1.09004 11.0405 1.15852 11.4458 1.29331 11.8239C1.4281 12.2021 1.62653 12.5457 1.87712 12.8348C2.12771 13.124 2.42548 13.3529 2.75324 13.5085C3.08099 13.664 3.43221 13.743 3.78659 13.7409C4.14097 13.7389 4.49148 13.6558 4.81785 13.4964C5.14423 13.3371 5.43999 13.1047 5.68803 12.8126Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M4.60352 5.3125L8.39518 9.6875" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    hasArrow: true,
  },
];

const bottomNavItems = [
  {
    label: "Settings",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <path d="M5.475 15L5.175 12.6C5.0125 12.5375 4.85938 12.4625 4.71562 12.375C4.57187 12.2875 4.43125 12.1938 4.29375 12.0938L2.0625 13.0312L0 9.46875L1.93125 8.00625C1.91875 7.91875 1.9125 7.83438 1.9125 7.75313C1.9125 7.67188 1.9125 7.5875 1.9125 7.5C1.9125 7.4125 1.9125 7.32812 1.9125 7.24687C1.9125 7.16562 1.91875 7.08125 1.93125 6.99375L0 5.53125L2.0625 1.96875L4.29375 2.90625C4.43125 2.80625 4.575 2.7125 4.725 2.625C4.875 2.5375 5.025 2.4625 5.175 2.4L5.475 0H9.6L9.9 2.4C10.0625 2.4625 10.2156 2.5375 10.3594 2.625C10.5031 2.7125 10.6438 2.80625 10.7812 2.90625L13.0125 1.96875L15.075 5.53125L13.1438 6.99375C13.1562 7.08125 13.1625 7.16562 13.1625 7.24687C13.1625 7.32812 13.1625 7.4125 13.1625 7.5C13.1625 7.5875 13.1625 7.67188 13.1625 7.75313C13.1625 7.83438 13.15 7.91875 13.125 8.00625L15.0562 9.46875L12.9937 13.0312L10.7812 12.0938C10.6438 12.1938 10.5 12.2875 10.35 12.375C10.2 12.4625 10.05 12.5375 9.9 12.6L9.6 15H5.475Z" fill="currentColor"/>
      </svg>
    ),
  },
  {
    label: "Support",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <path d="M7.4625 12C7.725 12 7.94688 11.9094 8.12813 11.7281C8.30937 11.5469 8.4 11.325 8.4 11.0625C8.4 10.8 8.30937 10.5781 8.12813 10.3969C7.94688 10.2156 7.725 10.125 7.4625 10.125C7.2 10.125 6.97813 10.2156 6.79688 10.3969C6.61562 10.5781 6.525 10.8 6.525 11.0625C6.525 11.325 6.61562 11.5469 6.79688 11.7281C6.97813 11.9094 7.2 12 7.4625 12ZM6.7875 9.1125H8.175C8.175 8.7 8.22188 8.375 8.31563 8.1375C8.40938 7.9 8.675 7.575 9.1125 7.1625C9.4375 6.8375 9.69375 6.52812 9.88125 6.23438C10.0688 5.94063 10.1625 5.5875 10.1625 5.175C10.1625 4.475 9.90625 3.9375 9.39375 3.5625C8.88125 3.1875 8.275 3 7.575 3C6.8625 3 6.28437 3.1875 5.84062 3.5625C5.39687 3.9375 5.0875 4.3875 4.9125 4.9125L6.15 5.4C6.2125 5.175 6.35313 4.93125 6.57188 4.66875C6.79063 4.40625 7.125 4.275 7.575 4.275C7.975 4.275 8.275 4.38438 8.475 4.60313C8.675 4.82188 8.775 5.0625 8.775 5.325C8.775 5.575 8.7 5.80937 8.55 6.02812C8.4 6.24687 8.2125 6.45 7.9875 6.6375C7.4375 7.125 7.1 7.49375 6.975 7.74375C6.85 7.99375 6.7875 8.45 6.7875 9.1125ZM7.5 15C6.4625 15 5.4875 14.8031 4.575 14.4094C3.6625 14.0156 2.86875 13.4812 2.19375 12.8062C1.51875 12.1312.984375 11.3375.590625 10.425C.196875 9.5125 0 8.5375 0 7.5C0 6.4625.196875 5.4875.590625 4.575C.984375 3.6625 1.51875 2.86875 2.19375 2.19375C2.86875 1.51875 3.6625.984375 4.575.590625C5.4875.196875 6.4625 0 7.5 0C8.5375 0 9.5125.196875 10.425.590625C11.3375.984375 12.1312 1.51875 12.8062 2.19375C13.4812 2.86875 14.0156 3.6625 14.4094 4.575C14.8031 5.4875 15 6.4625 15 7.5C15 8.5375 14.8031 9.5125 14.4094 10.425C14.0156 11.3375 13.4812 12.1312 12.8062 12.8062C12.1312 13.4812 11.3375 14.0156 10.425 14.4094C9.5125 14.8031 8.5375 15 7.5 15Z" fill="currentColor"/>
      </svg>
    ),
  },
];




const AVATAR_PALETTE = [
  { avatarColor: "#00488D", initBg: "#D6E3FF" },
  { avatarColor: "#7B3200", initBg: "#FFDBCB" },
  { avatarColor: "#00C896", initBg: "rgba(0,200,150,0.12)" },
  { avatarColor: "#475C7F", initBg: "#E6E8EA" },
];

function getInitials(name: string): string {
  const words = name.replace(/^Dr\.?\s*/i, "").trim().split(/\s+/);
  return words.slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}

function formatBranch(branch: EmployeeRecord["branch"]): string {
  if (!branch?.branch_name) return "";
  return branch.branch_area ? `${branch.branch_name} (${branch.branch_area})` : branch.branch_name;
}

function mapEmployeeRecord(doc: EmployeeRecord, index: number) {
  const palette = AVATAR_PALETTE[index % AVATAR_PALETTE.length];
  const fullName = `${doc.first_name} ${doc.middle_name ? doc.middle_name + " " : ""}${doc.last_name}`;
  const role = doc.user_table?.role_type || "STAFF";
  const isActive = doc.emp_status === true || doc.user_table?.user_status === 0;
  // Daily status for doctors comes straight from the backend (GET /employees
  // with `date` computes doctor_status server-side: Active/Leave/Inactive).
  // Staff members never receive doctor_status, so they fall back to the
  // account-level active/inactive state.
  const status =
    role === "DOCTOR" && doc.doctor_status
      ? doc.doctor_status === "LEAVE"
        ? "Leave"
        : doc.doctor_status === "INACTIVE"
          ? "Inactive"
          : "Active"
      : isActive
        ? "Active"
        : "Inactive";
  return {
    avatar: getInitials(fullName),
    avatarColor: palette.avatarColor,
    initBg: palette.initBg,
    name: fullName,
    id: doc.employee_id,
    dept: doc.department_master?.department_name || doc.specialization || "Unassigned",
    deptBg: "#E6E8EA",
    deptColor: "#475C7F",
    branch: formatBranch(doc.branch),
    branches: doc.branches ?? [],
    status,
    role,
  };
}

function formatDateOnly(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${day}-${month}-${d.getUTCFullYear()}`;
}

function formatTimeOnly(iso: string): string {
  const d = new Date(iso);
  const hours = d.getUTCHours();
  const minutes = String(d.getUTCMinutes()).padStart(2, "0");
  const period = hours >= 12 ? "PM" : "AM";
  const h12 = hours % 12 || 12;
  return `${String(h12).padStart(2, "0")}:${minutes} ${period}`;
}

function formatAppointmentStatus(status: string | null): string {
  if (!status) return "Unknown";
  return status
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getStatusDotColor(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("schedul") || s.includes("booked")) return "bg-blue-500";
  if (s.includes("consult")) return "bg-purple-500";
  if (s.includes("complete")) return "bg-emerald-500";
  if (s.includes("cancel")) return "bg-red-500";
  if (s.includes("no show") || s.includes("no_show")) return "bg-gray-400";
  if (s.includes("reschedul")) return "bg-teal-500";
  return "bg-blue-400";
}

function mapAppointmentRecord(doc: AppointmentRecord, index: number) {
  const patientPalette = AVATAR_PALETTE[index % AVATAR_PALETTE.length];
  const doctorPalette = AVATAR_PALETTE[(index + 1) % AVATAR_PALETTE.length];

  const patient = doc.patient_bio_data;
  const patientName = patient
    ? `${patient.patient_first_name} ${patient.patient_middle_name ? patient.patient_middle_name + " " : ""}${patient.patient_last_name ?? ""}`.trim()
    : "Unknown Patient";

  const doctor = doc.employees;
  const doctorName = doctor
    ? `${doctor.first_name} ${doctor.middle_name ? doctor.middle_name + " " : ""}${doctor.last_name}`.trim()
    : (doc.doctor_name && doc.doctor_name !== "Laboratory" && doc.doctor_name !== "Unassigned" ? doc.doctor_name : "");
  const branchName = doc.branch
    ? doc.branch.branch_area
      ? `${doc.branch.branch_name} (${doc.branch.branch_area})`
      : doc.branch.branch_name
    : doc.branch_id || "";

  return {
    id: doc.appointment_id,
    appointmentNo: doc.appointment_id,
    patientName,
    patientId: doc.patient_id,
    avatar: getInitials(patientName),
    avatarColor: patientPalette.avatarColor,
    avatarBg: patientPalette.initBg,
    doctorName,
    doctorId: doc.employee_id ? doc.employee_id : "",
    doctorAvatar: getInitials(doctorName),
    doctorAvatarcolor: doctorPalette.avatarColor,
    doctorAvatarBg: doctorPalette.initBg,
    branch: branchName,
    branchId: doc.branch_id ?? "",
    reason: doc.reason_for_visit || "",
    date: formatDateOnly(doc.appointment_date),
    time: formatTimeOnly(doc.appointment_time),
    status: formatAppointmentStatus(doc.status ?? ""),
    appointmentDateISO: doc.appointment_date,
    visitType: doc.Patient_visit_type || "",
    chemo_fitness: doc.chemo_fitness,
    chemo_unfit_reason: doc.chemo_unfit_reason,
    rawRecord: doc,
  };
}

function parseStatValue(value: string | number | undefined | null): number {
  if (value == null) return 0;
  if (typeof value === "number") return isNaN(value) ? 0 : value;
  const num = Number(String(value).replace(/,/g, "").trim());
  return isNaN(num) ? 0 : num;
}

function formatStatValue(value: number): string {
  return value.toLocaleString();
}

function CountUp({ target, duration = 900 }: { target: number; duration?: number }) {
  const safeTarget = typeof target === "number" && !isNaN(target) ? Math.round(target) : 0;
  const [count, setCount] = useState(0);
  const countRef = useRef(0);
  countRef.current = count;

  const prevTargetRef = useRef<number | null>(null);
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    // If target is 0 and we're already at 0, nothing to animate
    if (safeTarget === 0 && countRef.current === 0) {
      prevTargetRef.current = 0;
      return;
    }

    // If target has not changed and count already reached it, don't re-animate
    if (prevTargetRef.current === safeTarget && countRef.current === safeTarget) {
      return;
    }

    const startVal = countRef.current;
    const endVal = safeTarget;
    prevTargetRef.current = safeTarget;

    if (startVal === endVal) {
      return;
    }

    let startTime: number | null = null;

    const animate = (now: number) => {
      if (startTime === null) startTime = now;
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Smooth ease-out cubic: starts quickly, lands smoothly
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextValue = Math.round(startVal + (endVal - startVal) * eased);

      setCount(nextValue);

      if (progress < 1) {
        rafIdRef.current = requestAnimationFrame(animate);
      } else {
        setCount(endVal);
        rafIdRef.current = null;
      }
    };

    rafIdRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [safeTarget, duration]);

  return <>{formatStatValue(count)}</>;
}

const ALL_KPI_IDS = [
  "doctors",
  "patients",
  "critical-patients",
  "staff",
  "appointments",
  "prescriptions",
  "bills",
  "total-op",
  "chemo-delivered",
  "chemo-cancelled",
  "lab-visits",
  "ipd-patients",
  "beds-occupied",
];

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("doctors");
  const [selectedKpis, setSelectedKpis] = useState<string[]>(ALL_KPI_IDS);
  const [isKpiShowerOpen, setIsKpiShowerOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { toast } = useToast();
  // Aliased -- this page already has its own local `branches` state below
  // for the branch-performance widget, so the real branch directory from
  // the shared hook (same one Staff.tsx uses for its Branch filter) needs a
  // different name.
  const { selectedBranchId, isAllBranches, branches: branchDirectory } = useBranchFilter();
  const { can, canAny, permissions, loading: permissionsLoading } = usePermission();

  // Track if KPI preferences have been loaded from backend. Kept as state (not
  // only a ref) so the auto-save effect can re-run once hydration finishes.
  const [kpiHydrated, setKpiHydrated] = useState(false);
  // Set right before hydration applies its result so the very first
  // auto-save effect run after hydration is skipped -- loading preferences
  // from the server is not a user edit and must never be saved back.
  const skipNextKpiSaveRef = useRef(false);

  // Fetch saved KPI preferences from backend (once after permissions load)
  useEffect(() => {
    if (permissionsLoading) return;
    if (kpiHydrated) return;

    getKpiPreferences()
      .then((saved) => {
        skipNextKpiSaveRef.current = true;
        if (saved.length > 0) {
          setSelectedKpis(saved);
        }
        setKpiHydrated(true);
      })
      .catch(() => {
        skipNextKpiSaveRef.current = true;
        setKpiHydrated(true);
      });
  }, [permissionsLoading, kpiHydrated]);

  // Debounced auto-save for user-initiated KPI selection changes only.
  useEffect(() => {
    if (!kpiHydrated) return; // don't save before initial load
    if (skipNextKpiSaveRef.current) {
      skipNextKpiSaveRef.current = false;
      return;
    }
    const timer = setTimeout(() => {
      saveKpiPreferences(selectedKpis).catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, [kpiHydrated, selectedKpis]);

 
  const [realDoctors, setRealDoctors] = useState<Record<string, unknown>[] | null>(null);
  const [realStaff, setRealStaff] = useState<Record<string, unknown>[] | null>(null);
  const [isEmployeesLoading, setIsEmployeesLoading] = useState(true);

  const [patientCount, setPatientCount] = useState<number>(0);
  const [patientLoading, setPatientLoading] = useState(false);

  // Real appointments fetched from the backend. No dummy fallback  an
  // empty/failed fetch just leaves this null and the tab shows no rows.
  const [realAppointments, setRealAppointments] = useState<Record<string, unknown>[] | null>(null);
  const [isAppointmentsLoading, setIsAppointmentsLoading] = useState(true);
  const [appointmentCount, setAppointmentCount] = useState<number>(0);

  const [prescriptionCount, setPrescriptionCount] = useState<number>(0);
  const [isPrescriptionsLoading, setIsPrescriptionsLoading] = useState(false);

  // IPD snapshot -- currently admitted inpatients + bed occupancy (branch-scoped).
  const [ipdOverview, setIpdOverview] = useState<{ totalPatients: number; bedsOccupied: number; totalBeds: number }>({
    totalPatients: 0,
    bedsOccupied: 0,
    totalBeds: 0,
  });
  const [isIpdStatsLoading, setIsIpdStatsLoading] = useState(false);

  // Track previous counts to compute "newly added" deltas
  const prevDoctorsRef = useRef<number>(0);
  const prevPatientsRef = useRef<number>(0);
  const prevStaffRef = useRef<number>(0);
  const prevAppointmentsRef = useRef<number>(0);
  const prevPrescriptionsRef = useRef<number>(0);
  const isInitialLoadRef = useRef(true);

  // Date selection state -- declared early since fetchAppointments below
  // depends on it to scope the Appointments tab to the selected day.
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isKpiCalendarOpen, setIsKpiCalendarOpen] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollButtons = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(maxScroll > 0 && el.scrollLeft < maxScroll - 4);
  }, []);

  const handleKpiScroll = (direction: "left" | "right") => {
    const el = trackRef.current;
    if (!el) return;
    const scrollAmount = 320;
    el.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    updateScrollButtons();

    const handleScroll = () => {
      updateScrollButtons();
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", updateScrollButtons);

    const ro = new ResizeObserver(() => {
      updateScrollButtons();
    });
    ro.observe(el);

    return () => {
      el.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", updateScrollButtons);
      ro.disconnect();
    };
  }, [updateScrollButtons]);

  const canReadEmployees = permissions.some((p) => p === "employee.read" || p === "doctor.read");
  // React Query: fetch employees once and keep them cached keyed by branch + date.
  // Refreshing the branch filter or date re-fetches in the background while the
  // previous data stays on-screen (stale-while-revalidate) -> snappier navigation.
  const employeesQuery = useQuery({
    queryKey: ["dashboard-employees", isAllBranches ? "all" : selectedBranchId, format(selectedDate, "yyyy-MM-dd")],
    queryFn: async () => {
      const res = await employeeApi.getAll({
        branchId: isAllBranches ? undefined : selectedBranchId,
        limit: 1000,
        date: format(selectedDate, "yyyy-MM-dd"),
      });
      const all = res.data?.data?.employees || [];
      const doctors = all.filter((e) => e.user_table?.role_type === "DOCTOR");
      const staff = all.filter((e) => e.user_table?.role_type !== "DOCTOR");
      return { doctors: doctors.map(mapEmployeeRecord), staff: staff.map(mapEmployeeRecord) };
    },
    enabled: canReadEmployees,
    refetchOnWindowFocus: false,
    staleTime: 1000 * 60 * 5,
  });

  // Keep the local doctors/staff arrays in sync with the query result.
  useEffect(() => {
    if (!employeesQuery.data) return;
    prevDoctorsRef.current = realDoctors?.length ?? 0;
    prevStaffRef.current = realStaff?.length ?? 0;
    setRealDoctors(employeesQuery.data.doctors);
    setRealStaff(employeesQuery.data.staff);
  }, [employeesQuery.data]);

  const [isApptStatusDropdownOpen, setIsApptStatusDropdownOpen] = useState(false);

  const canReadAppointments = permissions.includes("appointment.read");

  // React Query-backed appointments fetch. Cached per branch + date so switching
  const appointmentsQuery = useQuery({
    queryKey: ["dashboard-appointments", isAllBranches ? "all" : selectedBranchId, format(selectedDate, "yyyy-MM-dd")],
    queryFn: async () => {
      const res = await appointmentApi.getAll({
        limit: 100,
        sortBy: "appointment_date",
        sortOrder: "desc",
        branchId: isAllBranches ? undefined : selectedBranchId,
        date: format(selectedDate, "yyyy-MM-dd"),
      });
      const rows = res.data?.data?.appointments || [];
      return { rows: rows.map(mapAppointmentRecord), total: res.data?.data?.total ?? rows.length };
    },
    enabled: canReadAppointments,
    refetchOnWindowFocus: false,
    staleTime: 1000 * 60 * 2,
  });

  useEffect(() => {
    if (!appointmentsQuery.data) return;
    prevAppointmentsRef.current = appointmentCount;
    setRealAppointments(appointmentsQuery.data.rows);
    setAppointmentCount(appointmentsQuery.data.total);
  }, [appointmentsQuery.data]);

  useEffect(() => {
    setIsAppointmentsLoading(appointmentsQuery.isLoading || appointmentsQuery.isFetching);
  }, [appointmentsQuery.isLoading, appointmentsQuery.isFetching]);

  const appointmentPatientIds = useMemo(() => {
    if (!realAppointments) return [];
    const ids = (realAppointments as any[])
      .map((r) => String(r.patientId ?? "").trim())
      .filter(Boolean);
    return [...new Set(ids)];
  }, [realAppointments]);

  // Same patient universe as Patients.tsx (full branch list with age/DOB),
  // not just today's appointments — so a critical sign on Patients always
  // counts on this KPI too.
  const canReadPatients = permissions.includes("patient.read");
  const criticalPatientsQuery = useQuery({
    queryKey: ["dashboard-critical-patients", isAllBranches ? "all" : selectedBranchId],
    queryFn: async () => {
      const res = await patientApi.getAll({
        branchId: isAllBranches ? undefined : selectedBranchId,
      });
      return (res.data?.data?.patients || []) as PatientRecord[];
    },
    enabled: canReadPatients,
    refetchOnWindowFocus: false,
    staleTime: 1000 * 60 * 2,
  });

  const patientAgeData = useMemo(() => {
    return (criticalPatientsQuery.data ?? []).map((p) => ({
      patientId: String(p.patient_id),
      age: p.patient_age,
      dob: p.patient_dob,
    }));
  }, [criticalPatientsQuery.data]);

  // Hook input = full patient list (age/DOB) + any appointment-only patients
  // so table critical dots still resolve if a row is missing from the list.
  const criticalHookInput = useMemo(() => {
    const listed = new Set(patientAgeData.map((p) => p.patientId));
    const extras = appointmentPatientIds
      .filter((id) => !listed.has(id))
      .map((id) => ({ patientId: id }));
    return [...patientAgeData, ...extras];
  }, [patientAgeData, appointmentPatientIds]);

  // Count from the full patient list when loaded; fall back to appointments
  // only if the patient list is unavailable (no permission / not yet fetched).
  const criticalCountIds = useMemo(() => {
    if (criticalPatientsQuery.data) {
      return patientAgeData.map((p) => p.patientId);
    }
    return appointmentPatientIds;
  }, [criticalPatientsQuery.data, patientAgeData, appointmentPatientIds]);

  const { getCriticalInfo } = useCriticalPatients(criticalHookInput);

  const [freshEncounters, setFreshEncounters] = useState<Record<string, EncounterRecord>>({});

  const refreshCriticalEncounters = useCallback(async () => {
    // Live vitals for appointment rows; full-list vitals come from the hook.
    const ids = appointmentPatientIds;
    if (ids.length === 0) {
      setFreshEncounters({});
      return;
    }
    const results = await Promise.allSettled(
      ids.map(async (patientId) => {
        try {
          const res = await encounterApi.getLatest(patientId, 1);
          const enc = res.data?.data?.encounters?.[0];
          if (enc) return { patientId, enc };
        } catch { /* silent */ }
        return null;
      })
    );
    const map: Record<string, EncounterRecord> = {};
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        map[String(r.value.patientId)] = r.value.enc;
      }
    }
    setFreshEncounters(map);
  }, [appointmentPatientIds]);

  useEffect(() => {
    void refreshCriticalEncounters();
  }, [refreshCriticalEncounters]);

  const getLiveCriticalInfo = useCallback(
    (patientId: string): CriticalInfo => {
      const pid = String(patientId ?? "").trim();
      if (!pid) return { isCritical: false, reasons: [] };
      const base = getCriticalInfo(pid);
      const ageReasons = base.reasons.filter(
        (r) => r.startsWith("Age <") || r.startsWith("Age >")
      );
      const enc = freshEncounters[pid];
      if (enc) {
        const vitalsReasons = getVitalsCriticalReasons(enc);
        const reasons = [...ageReasons, ...vitalsReasons];
        return { isCritical: reasons.length > 0, reasons };
      }
      return base;
    },
    [getCriticalInfo, freshEncounters]
  );

  const criticalPatientCount = useMemo(() => {
    return criticalCountIds.filter((id) => getLiveCriticalInfo(id).isCritical).length;
  }, [criticalCountIds, getLiveCriticalInfo]);

  useEffect(() => {
    if (!appointmentsQuery.error) return;
    const err: any = appointmentsQuery.error;
    console.error("[Dashboard] Failed to load appointments:", err);
    toast({
      title: "Failed to load appointments",
      description: err.response?.data?.message || "Couldn't reach the appointments API.",
      variant: "destructive",
    });
  }, [appointmentsQuery.error, toast]);

  // Stable refetch helper reused by check-in/check-out + onVitalsSaved, now
  // backed by React Query so repeated calls avoid redundant network requests.
  // Also refreshes critical encounter data so the Critical Patients KPI stays live.
  const fetchAppointments = useCallback(() => {
    appointmentsQuery.refetch();
    void refreshCriticalEncounters();
  }, [appointmentsQuery.refetch, refreshCriticalEncounters]);

  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const patientsQuery = useQuery({
    queryKey: ["dashboard-patients", isAllBranches ? "all" : selectedBranchId, dateStr],
    queryFn: async () => {
      const res = await patientApi.getAll({
        limit: 1,
        branchId: isAllBranches ? undefined : selectedBranchId,
        dateFrom: dateStr,
        dateTo: dateStr,
      });
      return res.data?.data?.total ?? 0;
    },
    enabled: canReadPatients,
    refetchOnWindowFocus: false,
    staleTime: 1000 * 60 * 2,
  });

  useEffect(() => {
    if (patientsQuery.data === undefined) return;
    prevPatientsRef.current = patientCount;
    setPatientCount(patientsQuery.data);
  }, [patientsQuery.data]);

  useEffect(() => {
    setPatientLoading(patientsQuery.isLoading || patientsQuery.isFetching);
  }, [patientsQuery.isLoading, patientsQuery.isFetching]);

  const prescriptionsQuery = useQuery({
    queryKey: ["dashboard-prescriptions", isAllBranches ? "all" : selectedBranchId, dateStr],
    queryFn: async () => {
      const res = await API.get<{
        success: boolean;
        message: string;
        data: { total: number };
      }>("/prescriptions", {
        params: {
          limit: 1,
          date: dateStr,
          branchId: isAllBranches ? undefined : selectedBranchId,
        },
      }).catch((err) => {
        if (err?.response?.status === 403) {
          return { data: { success: true, message: "", data: { total: 0 } } } as any;
        }
        throw err;
      });
      return res.data?.data?.total ?? 0;
    },
    refetchOnWindowFocus: false,
    staleTime: 1000 * 60 * 2,
  });

  useEffect(() => {
    if (prescriptionsQuery.data === undefined) return;
    prevPrescriptionsRef.current = prescriptionCount;
    setPrescriptionCount(prescriptionsQuery.data);
  }, [prescriptionsQuery.data]);

  useEffect(() => {
    setIsPrescriptionsLoading(prescriptionsQuery.isLoading || prescriptionsQuery.isFetching);
  }, [prescriptionsQuery.isLoading, prescriptionsQuery.isFetching]);

  const canReadAdmissions = permissions.includes("admission.read");

  // IPD KPI snapshot: currently-admitted inpatients and occupied beds in scope.
  const ipdOverviewQuery = useQuery({
    queryKey: ["dashboard-ipd-overview", isAllBranches ? "all" : selectedBranchId, dateStr],
    queryFn: async () => {
      const res = await ipdApi.getOverview(isAllBranches ? undefined : selectedBranchId);
      return (
        res.data?.data ?? { totalPatients: 0, bedsOccupied: 0, totalBeds: 0 }
      );
    },
    enabled: canReadAdmissions,
    refetchOnWindowFocus: false,
    staleTime: 1000 * 60 * 2,
  });

  useEffect(() => {
    if (ipdOverviewQuery.data === undefined) return;
    setIpdOverview((prev) => ({
      totalPatients: ipdOverviewQuery.data!.totalPatients,
      bedsOccupied: ipdOverviewQuery.data!.bedsOccupied,
      totalBeds: ipdOverviewQuery.data!.totalBeds ?? prev.totalBeds,
    }));
  }, [ipdOverviewQuery.data]);

  useEffect(() => {
    setIsIpdStatsLoading(ipdOverviewQuery.isLoading || ipdOverviewQuery.isFetching);
  }, [ipdOverviewQuery.isLoading, ipdOverviewQuery.isFetching]);

  // Reflect React Query's pending state into the UI loading flags so the
  // table spinner and stat-card skeletons stay in sync with real requests.
  useEffect(() => {
    setIsEmployeesLoading(employeesQuery.isLoading || employeesQuery.isFetching);
  }, [employeesQuery.isLoading, employeesQuery.isFetching]);

  useEffect(() => {
    if (!employeesQuery.error) return;
    const err: any = employeesQuery.error;
    toast({
      title: "Failed to load employees",
      description: err.response?.data?.message || "Couldn't reach the employees API.",
      variant: "destructive",
    });
    setRealDoctors([]);
    setRealStaff([]);
  }, [employeesQuery.error, toast]);


  // Oncology & Daycare Daily Tracking Metrics
  const oncologyMetrics = useMemo(() => {
    const list = (realAppointments as any[]) || [];
    let totalOpVisits = 0;
    let actualChemoDelivered = 0;
    let cancelledChemo = 0;
    let labVisits = 0;

    for (const appt of list) {
      const visitType = String(appt.visitType || appt.reason || "").toLowerCase();
      const status = String(appt.status || "").toLowerCase();
      const id = String(appt.id || appt.appointmentNo || "");

      const backendFitness = (appt.chemo_fitness || (appt.rawRecord as any)?.chemo_fitness || "") as string;
      const localFitness = id ? localStorage.getItem(`hms_chemo_fitness_${id}`) : null;
      const effectiveFitness = backendFitness || localFitness;
      const isUnfit = effectiveFitness === "UNFIT";
      const isFit = effectiveFitness === "FIT";

      const isChemo = visitType.includes("chemo");
      const isLab = visitType.includes("lab");

      // 1. Lab-Only Visits
      if (isLab) {
        labVisits++;
      }

      // 2. Cancelled / Deferred Chemo
      if (isChemo && (status.includes("cancel") || isUnfit)) {
        cancelledChemo++;
      }

      // 3. Actual Chemo Delivered
      if (isChemo && !status.includes("cancel") && !isUnfit && (status.includes("complete") || isFit)) {
        actualChemoDelivered++;
      }

      // 4. Total OP Visits (all OP consultations including chemo-unfit visits which proceed as OP consultation)
      if (!isLab) {
        if (!status.includes("cancel") || isUnfit) {
          totalOpVisits++;
        }
      }
    }

    return {
      totalOpVisits,
      actualChemoDelivered,
      cancelledChemo,
      labVisits,
    };
  }, [realAppointments]);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(5);

  // Sort state (per tab)
  const [sortField, setSortField] = useState<Record<string, string>>({});
  const [sortDirection, setSortDirection] = useState<Record<string, "asc" | "desc">>({});

  // Tabs sliding underline
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [underline, setUnderline] = useState({ left: 0, width: 0 });

  const { activeFilterFields } = useDashboardFilters({
    activeTab,
    realDoctors: realDoctors,
    realStaff,
    realAppointments,
    branches: branchDirectory,
  });

  // Filters -- seeded with the fields so fields carrying a `defaultValue`
  // (e.g. Status defaulting to ["Active"]) start applied and are restored
  // when the user clears the filter.
  const {
    values: filterValues,
    appliedValues,
    isOpen: isFilterOpen,
    setIsOpen: setIsFilterOpen,
    handleChange: handleFilterChange,
    handleApply: handleApplyFilter,
    handleClear: handleClearFilter,
    setAppliedFilter,
  } = useFilterPanel(activeFilterFields);

  const skipClearFilterRef = useRef(false);

  useEffect(() => {
    if (skipClearFilterRef.current) {
      skipClearFilterRef.current = false;
      return;
    }
    handleClearFilter();
  }, [activeTab]);

  const availableTabs = useMemo(() => [
    { key: "doctors", label: "Doctors", show: canAny(["doctor.read", "employee.read"]) },
    { key: "staff", label: "Staff", show: can("employee.read") },
    { key: "appointments", label: "Appointments", show: can("appointment.read") },
  ].filter((tab) => tab.show), [permissions]);

  useEffect(() => {
    if (availableTabs.length === 0) return;
    if (!availableTabs.some((tab) => tab.key === activeTab)) {
      setActiveTab(availableTabs[0].key);
    }
  }, [availableTabs, activeTab]);

  useEffect(() => {
    const container = tabsContainerRef.current;
    if (!container) return;

    const measure = () => {
      const activeButton = container.querySelector<HTMLButtonElement>(`[data-tab="${activeTab}"]`);
      if (activeButton) {
        setUnderline({ left: activeButton.offsetLeft, width: activeButton.offsetWidth });
      }
    };

    measure();

    if (document.fonts?.ready) {
      document.fonts.ready.then(measure);
    }

    const ro = new ResizeObserver(measure);
    ro.observe(container);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [activeTab, availableTabs]);

  const handleSort = (field: string) => {
    if (sortField[activeTab] === field) {
      setSortDirection((prev) => ({
        ...prev,
        [activeTab]: prev[activeTab] === "asc" ? "desc" : "asc",
      }));
    } else {
      setSortField((prev) => ({ ...prev, [activeTab]: field }));
      setSortDirection((prev) => ({ ...prev, [activeTab]: "asc" }));
    }
  };

  const activeData =
    activeTab === "staff"
      ? (realStaff ?? [])
      : activeTab === "appointments"
        ? (realAppointments ?? [])
        : (realDoctors ?? []);

  const searchableFields =
    activeTab === "appointments"
      ? ["appointmentNo", "patientName", "doctorName", "branch", "reason", "status", "visitType"]
      : ["name", "id", "dept", "branch", "status"];

  // Dashboard receives its filtered rows straight from Filter/'s
  // applySearchAndFilter() -- same search-then-filter sequence as before,
  // now a single reusable call instead of Dashboard orchestrating both
  // steps itself.
  const filteredData = useMemo(() => {
    let result: Record<string, unknown>[] = [...activeData];

    return applySearchAndFilter(result, searchQuery, searchableFields, appliedValues, activeFilterFields);
  }, [searchQuery, activeTab, appliedValues, activeFilterFields, realDoctors, realStaff, realAppointments]);

  const currentSortField = sortField[activeTab];
  const currentSortDirection = sortDirection[activeTab];

  const currentData = [...filteredData].sort((a, b) => {
    if (!currentSortField) return 0;
    const aValue = String(a[currentSortField] ?? "").toLowerCase();
    const bValue = String(b[currentSortField] ?? "").toLowerCase();
    if (aValue < bValue) {
      return currentSortDirection === "asc" ? -1 : 1;
    }
    if (aValue > bValue) {
      return currentSortDirection === "asc" ? 1 : -1;
    }
    return 0;
  });

  const totalRecords = currentData.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / rowsPerPage));
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const currentRows = currentData.slice(startIndex, endIndex);
  const visibleStart = totalRecords === 0 ? 0 : startIndex + 1;
  const visibleEnd = Math.min(endIndex, totalRecords);

  const navigate = useNavigate();

  const handleEdit = (id: string | number) => {
    navigate(`/appointments/edit/${id}`);
  };

  const handleEditStaff = (id: string | number, role: string) => {
    navigate(`/staff/edit/${id}?role=${role}`);
  };

  // Doctor rows always route to the real Edit Doctor page, regardless of
  // which page/tab they're clicked from  role drives the destination, not
  // the page. (Staff/Appointments keep the placeholder handler above.)
  const handleEditDoctor = (id: string | number) => {
    navigate(`/doctor/edit/${id}`);
  };

  const handleView = (id: string | number) => {
    navigate(`/doctor/day-view/${id}`);
  };

  const [cancelTarget, setCancelTarget] = useState<Record<string, unknown> | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);

  const handleCancelAppointment = (target: Record<string, unknown>) => {
    setCancelReason("");
    setCancelTarget(target);
  };

  const handleConfirmCancelAppointment = async () => {
    if (!cancelTarget) return;

    if (!cancelReason.trim()) {
      toast({ title: "A cancellation reason is required", variant: "destructive" });
      return;
    }

    const targetId = cancelTarget.id as string;
    setIsCancelling(true);
    try {
      const res = await appointmentApi.cancel(targetId, cancelReason.trim(), getUser()?.employee_id ?? "");
      const cancelled = res.data?.data;
      setRealAppointments((prev) =>
        (prev ?? []).map((appt, index) =>
          appt.id === targetId
            ? cancelled && cancelled.patient_bio_data
              ? mapAppointmentRecord(cancelled, index)
              : { ...appt, status: "Cancelled" }
            : appt,
        ),
      );
      fetchAppointments();
      toast({
        title: "Appointment cancelled",
        description: `Appointment ${targetId} has been cancelled.`,
      });
      setCancelTarget(null);
      setCancelReason("");
    } catch (err: any) {
      console.error("[Dashboard] Cancel error:", err);
      toast({
        title: "Failed to cancel appointment",
        description: err.response?.data?.message || "Couldn't reach the appointments API.",
        variant: "destructive",
      });
    } finally {
      setIsCancelling(false);
    }
  };

  const handleCheckIn = async (appointment: Record<string, unknown>) => {
    const appointmentId = appointment.id as string;
    try {
      // First update appointment status to CHECKED_IN
      await appointmentApi.updateStatus(appointmentId, "CHECKED_IN");
      // Then create encounter
      await encounterApi.create({ appointment_id: appointmentId });
      // Refresh appointments
      await fetchAppointments();
      toast({ title: "Patient checked in", description: "Encounter created successfully." });
    } catch (error: any) {
      toast({ title: "Check-in failed", description: error.response?.data?.message || "Failed to check in patient", variant: "destructive" });
    }
  };

  const handleCheckOut = async (appointment: Record<string, unknown>) => {
    const appointmentId = appointment.id as string;
    try {
      // First find the encounter for this appointment
      const encounters = await encounterApi.getAll({ appointmentId });
      const encounter = encounters.data?.data?.encounters?.[0];
      if (encounter) {
        await encounterApi.close(encounter.encounter_no, "DOCTOR");
      }
      // Refresh appointments
      await fetchAppointments();
      toast({ title: "Patient checked out", description: "Encounter closed successfully." });
    } catch (error: any) {
      toast({ title: "Check-out failed", description: error.response?.data?.message || "Failed to check out patient", variant: "destructive" });
    }
  };

  const ALL_DOCTOR_STATUSES = useMemo(() => ["Active", "Leave", "Inactive"], []);
  const ALL_STAFF_STATUSES = useMemo(() => ["Active", "Inactive"], []);

  const totalDoctors = realDoctors?.length ?? 0;
  const activeDoctors = useMemo(
    () => (realDoctors ?? []).filter((d: any) => d.status === "Active").length,
    [realDoctors]
  );

  const isDoctorAllSelected = useMemo(() => {
    if (activeTab !== "doctors") return false;
    const s = appliedValues.status;
    if (!Array.isArray(s)) return false;
    return ALL_DOCTOR_STATUSES.every((status) => s.includes(status));
  }, [activeTab, appliedValues.status, ALL_DOCTOR_STATUSES]);

  const totalStaff = realStaff?.length ?? 0;
  const activeStaff = useMemo(
    () => (realStaff ?? []).filter((s: any) => s.status === "Active").length,
    [realStaff]
  );

  const isStaffAllSelected = useMemo(() => {
    if (activeTab !== "staff") return false;
    const s = appliedValues.status;
    if (!Array.isArray(s)) return false;
    return ALL_STAFF_STATUSES.every((status) => s.includes(status));
  }, [activeTab, appliedValues.status, ALL_STAFF_STATUSES]);

  const appointmentStatusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of realAppointments ?? []) {
      const s = String(a.status || "").trim();
      if (s) {
        counts[s] = (counts[s] || 0) + 1;
      }
    }
    return counts;
  }, [realAppointments]);

  const availableAppointmentStatuses = useMemo(() => {
    const PREFERRED_STATUSES = [
      "Scheduled",
      "In Consultation",
      "Completed",
      "Cancelled",
      "No Show",
      "Not Checked In",
      "Rescheduled",
    ];
    const keys = Object.keys(appointmentStatusCounts);
    return keys.sort((a, b) => {
      const idxA = PREFERRED_STATUSES.indexOf(a);
      const idxB = PREFERRED_STATUSES.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [appointmentStatusCounts]);

  const selectedApptStatus = useMemo(() => {
    if (activeTab !== "appointments") return null;
    const s = appliedValues.status;
    if (Array.isArray(s) && s.length === 1) {
      return s[0];
    }
    return null;
  }, [activeTab, appliedValues.status]);

  const switchToTabWithFilter = useCallback((targetTab: string, filterName: string, filterValue: any) => {
    if (activeTab !== targetTab) {
      skipClearFilterRef.current = true;
      setActiveTab(targetTab);
    }
    setAppliedFilter(filterName, filterValue);
    setCurrentPage(1);
  }, [activeTab, setAppliedFilter]);

  const handleSelectAppointmentStatus = useCallback((status: string | null) => {
    if (activeTab !== "appointments") {
      skipClearFilterRef.current = true;
      setActiveTab("appointments");
    }
    setSearchQuery("");
    setCurrentPage(1);
    const currentStatus = activeTab === "appointments" && Array.isArray(appliedValues.status) ? appliedValues.status : [];
    if (!status || (currentStatus.length === 1 && currentStatus[0] === status)) {
      setAppliedFilter("status", undefined);
    } else {
      setAppliedFilter("status", [status]);
    }
    setIsApptStatusDropdownOpen(false);
  }, [activeTab, appliedValues.status, setAppliedFilter]);

  const allKpiItems = useMemo(() => {
    const currentDoctors = realDoctors?.length ?? 0;
    const currentStaff = realStaff?.length ?? 0;
    const currentPatients = patientCount;
    const currentAppointments = appointmentCount;
    const currentPrescriptions = prescriptionCount;

    const doctorDelta = currentDoctors - prevDoctorsRef.current;
    const staffDelta = currentStaff - prevStaffRef.current;
    const patientDelta = currentPatients - prevPatientsRef.current;
    const appointmentDelta = currentAppointments - prevAppointmentsRef.current;
    const prescriptionDelta = currentPrescriptions - prevPrescriptionsRef.current;

    const showDelta = !isInitialLoadRef.current;
    if (isInitialLoadRef.current && (currentDoctors > 0 || currentPatients > 0 || currentAppointments > 0)) {
      isInitialLoadRef.current = false;
    }

    return [
      {
        id: "doctors",
        label: "Doctors",
        subLabel: isDoctorAllSelected ? "Total registered" : "Active today",
        permission: "doctor.read",
        loading: isEmployeesLoading,
        value: isDoctorAllSelected ? totalDoctors : activeDoctors,
        tag: isDoctorAllSelected ? `Active: ${activeDoctors}` : `+${totalDoctors}`,
        bg: "#D6E3FF",
        border: "none",
        valueColor: "#00488D",
        iconBg: "rgba(255, 255, 255, 0.40)",
        icon: <Stethoscope className="w-[17px] h-[17px]" color="#00488D" />,
        isActive: activeTab === "doctors",
        onClick: () => {
          switchToTabWithFilter("doctors", "status", ["Active"]);
        },
        onTagClick: () => {
          switchToTabWithFilter(
            "doctors",
            "status",
            isDoctorAllSelected ? ["Active"] : ALL_DOCTOR_STATUSES
          );
        },
      },
      {
        id: "patients",
        label: "Patients",
        subLabel: "Patient registry",
        permission: "patient.read",
        loading: patientLoading,
        value: currentPatients,
        tag: showDelta && patientDelta !== 0 ? (patientDelta > 0 ? `+${patientDelta}` : `${patientDelta}`) : "Total",
        bg: "rgba(0, 200, 150, 0.12)",
        border: "none",
        valueColor: "#00A87E",
        iconBg: "rgba(255, 255, 255, 0.40)",
        icon: <UserRound className="w-[17px] h-[17px]" color="#00A87E" />,
        isActive: false,
        onClick: () => {
          navigate("/patients");
        },
      },
      {
        id: "critical-patients",
        label: "Critical Patients",
        subLabel: "Needs immediate attention",
        permission: "patient.read",
        loading: criticalPatientsQuery.isLoading,
        value: criticalPatientCount,
        tag: "Alert",
        bg: "rgba(220, 38, 38, 0.12)",
        border: "none",
        valueColor: "#DC2626",
        iconBg: "rgba(255, 255, 255, 0.40)",
        icon: <AlertCircle className="w-[17px] h-[17px]" color="#DC2626" />,
        isActive: false,
        onClick: () => {
          navigate("/patients");
        },
      },
      {
        id: "ipd-patients",
        label: "Total IPD Patients",
        subLabel: "Currently admitted",
        permission: "admission.read",
        loading: isIpdStatsLoading,
        value: ipdOverview.totalPatients,
        tag: "Inpatient",
        bg: "#D6E3FF",
        border: "none",
        valueColor: "#00488D",
        iconBg: "rgba(255, 255, 255, 0.40)",
        icon: <BedDouble className="w-[17px] h-[17px]" color="#00488D" />,
        isActive: false,
        onClick: () => {
          navigate("/inpatient/admissions");
        },
      },
      {
        id: "beds-occupied",
        label: "Beds Occupied",
        subLabel: "Beds currently in use",
        permission: "admission.read",
        loading: isIpdStatsLoading,
        value: ipdOverview.bedsOccupied,
        tag: `${ipdOverview.bedsOccupied} / ${ipdOverview.totalBeds} beds`,
        bg: "#dcf5e8",
        border: "none",
        valueColor: "#007A4D",
        iconBg: "rgba(255, 255, 255, 0.40)",
        icon: <Bed className="w-[17px] h-[17px]" color="#007A4D" />,
        isActive: false,
        onClick: () => {
          navigate("/ipd/beds");
        },
      },
      {
        id: "staff",
        label: "Staff",
        subLabel: isStaffAllSelected ? "Total staff" : "Active today",
        permission: "employee.read",
        loading: isEmployeesLoading,
        value: isStaffAllSelected ? totalStaff : activeStaff,
        tag: isStaffAllSelected ? `Active: ${activeStaff}` : `+${totalStaff}`,
        bg: "rgba(255, 107, 53, 0.12)",
        border: "none",
        valueColor: "#7B3200",
        iconBg: "#FFDBCB",
        icon: <Users className="w-[17px] h-[17px]" color="#7B3200" />,
        isActive: activeTab === "staff",
        onClick: () => {
          switchToTabWithFilter("staff", "status", ["Active"]);
        },
        onTagClick: () => {
          switchToTabWithFilter(
            "staff",
            "status",
            isStaffAllSelected ? ["Active"] : ALL_STAFF_STATUSES
          );
        },
      },
      {
        id: "appointments",
        label: "Appointments",
        subLabel: selectedApptStatus ? `${selectedApptStatus} status` : "Scheduled for date",
        permission: "appointment.read",
        loading: isAppointmentsLoading,
        value: selectedApptStatus ? (appointmentStatusCounts[selectedApptStatus] ?? 0) : currentAppointments,
        tag: selectedApptStatus ? `${selectedApptStatus}: ${appointmentStatusCounts[selectedApptStatus] ?? 0}` : `All: ${currentAppointments}`,
        bg: "rgba(255, 255, 255, 0.85)",
        border: "none",
        valueColor: "#00488D",
        iconBg: "rgba(168, 200, 255, 0.25)",
        icon: <CalendarIcon className="w-[17px] h-[17px]" color="#00488D" />,
        isActive: activeTab === "appointments" && !searchQuery,
        isDropdown: true,
        onClick: () => {
          if (activeTab !== "appointments") {
            skipClearFilterRef.current = true;
            setActiveTab("appointments");
          }
          setSearchQuery("");
          setCurrentPage(1);
          setIsApptStatusDropdownOpen(true);
        },
        onTagClick: () => {
          setIsApptStatusDropdownOpen((prev) => !prev);
        },
      },
      {
        id: "prescriptions",
        label: "Prescription Generated",
        subLabel: "Prescriptions generated",
        permission: undefined,
        loading: isPrescriptionsLoading,
        value: currentPrescriptions,
        tag: showDelta && prescriptionDelta !== 0 ? (prescriptionDelta > 0 ? `+${prescriptionDelta}` : `${prescriptionDelta}`) : "Rx Count",
        bg: "#E6E8EA",
        border: "none",
        valueColor: "#4A5F83",
        iconBg: "rgba(255, 255, 255, 0.40)",
        icon: <FileText className="w-[17px] h-[17px]" color="#4A5F83" />,
        isActive: false,
        onClick: () => {
          setActiveTab("appointments");
          setCurrentPage(1);
        },
      },
      {
        id: "bills",
        label: "Bills Generated",
        subLabel: "Invoices & billing",
        permission: undefined,
        loading: false,
        value: 0,
        tag: "Invoices",
        bg: "#ded3fa",
        border: "none",
        valueColor: "#00488D",
        iconBg: "rgba(255, 255, 255, 0.40)",
        icon: <Receipt className="w-[17px] h-[17px]" color="#00488D" />,
        isActive: false,
        onClick: () => {
          navigate("/billing");
        },
      },
      {
        id: "total-op",
        label: "Total OP Visits",
        subLabel: "OPD & chemo consults",
        permission: "appointment.read",
        loading: isAppointmentsLoading,
        value: oncologyMetrics.totalOpVisits,
        tag: "OPD",
        bg: "#dcebba",
        border: "none",
        valueColor: "#00488D",
        iconBg: "rgba(255, 255, 255, 0.40)",
        icon: <Activity className="w-[17px] h-[17px]" color="#00488D" />,
        isActive: false,
        onClick: () => {
          setActiveTab("appointments");
          setSearchQuery("");
          setCurrentPage(1);
        },
      },
      {
        id: "chemo-delivered",
        label: "Actual Chemo Delivered",
        subLabel: "Completed / cleared cycles",
        permission: "appointment.read",
        loading: isAppointmentsLoading,
        value: oncologyMetrics.actualChemoDelivered,
        tag: "Daycare",
        bg: "#E6E8EA",
        border: "none",
        valueColor: "#4A5F83",
        iconBg: "rgba(255, 255, 255, 0.40)",
        icon: <CheckCircle2 className="w-[17px] h-[17px]" color="#4A5F83" />,
        isActive: activeTab === "appointments" && searchQuery.toLowerCase() === "chemo",
        onClick: () => {
          setActiveTab("appointments");
          setSearchQuery((prev) => (prev.toLowerCase() === "chemo" ? "" : "chemo"));
          setCurrentPage(1);
        },
      },
      {
        id: "chemo-cancelled",
        label: "Cancelled / Deferred Chemo",
        subLabel: "Unfit (OP visit retained)",
        permission: "appointment.read",
        loading: isAppointmentsLoading,
        value: oncologyMetrics.cancelledChemo,
        tag: "Deferred",
        bg: "#FFDBCB",
        border: "none",
        valueColor: "#7B3200",
        iconBg: "rgba(255, 255, 255, 0.40)",
        icon: <XCircle className="w-[17px] h-[17px]" color="#7B3200" />,
        isActive: activeTab === "appointments" && searchQuery.toLowerCase() === "cancel",
        onClick: () => {
          setActiveTab("appointments");
          setSearchQuery((prev) => (prev.toLowerCase() === "cancel" ? "" : "cancel"));
          setCurrentPage(1);
        },
      },
      {
        id: "lab-visits",
        label: "Lab Visits",
        subLabel: "Laboratory visits",
        permission: "appointment.read",
        loading: isAppointmentsLoading,
        value: oncologyMetrics.labVisits,
        tag: "Lab",
        bg: "#D6E3FF",
        border: "none",
        valueColor: "#00488D",
        iconBg: "rgba(255, 255, 255, 0.40)",
        icon: <FlaskConical className="w-[17px] h-[17px]" color="#00488D" />,
        isActive: activeTab === "appointments" && searchQuery.toLowerCase() === "lab",
        onClick: () => {
          setActiveTab("appointments");
          setSearchQuery((prev) => (prev.toLowerCase() === "lab" ? "" : "lab"));
          setCurrentPage(1);
        },
      },
    ];
  }, [
    realDoctors,
    realStaff,
    patientCount,
    criticalPatientCount,
    appointmentCount,
    prescriptionCount,
    isEmployeesLoading,
    isAppointmentsLoading,
    criticalPatientsQuery.isLoading,
    isPrescriptionsLoading,
    patientLoading,
    ipdOverview,
    isIpdStatsLoading,
    activeTab,
    searchQuery,
    oncologyMetrics,
    navigate,
    totalDoctors,
    activeDoctors,
    isDoctorAllSelected,
    ALL_DOCTOR_STATUSES,
    totalStaff,
    activeStaff,
    isStaffAllSelected,
    ALL_STAFF_STATUSES,
    selectedApptStatus,
    appointmentStatusCounts,
    switchToTabWithFilter,
  ]);

  const visibleStats = useMemo(() => {
    return allKpiItems.filter((stat) => !stat.permission || can(stat.permission));
  }, [allKpiItems, can]);

  const displayedStats = useMemo(() => {
    return visibleStats.filter((stat) => selectedKpis.includes(stat.id));
  }, [visibleStats, selectedKpis]);

  useEffect(() => {
    const timer = setTimeout(updateScrollButtons, 150);
    return () => clearTimeout(timer);
  }, [displayedStats.length, updateScrollButtons]);

  // Only the very first load (waiting on permissions) shows the full-page
  // skeleton. Branch/date changes and manual refreshes just flip
  // isEmployeesLoading/isAppointmentsLoading  those are handled inline
  // (stat cards + table spinner below) so the shell never unmounts, same
  // as the Staff page.
  if (permissionsLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="flex w-full font-[Manrope,sans-serif] bg-[#F7F9FB]">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}

      {/* Main */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Content */}
        <main className="flex flex-col gap-6 border-t border-[#E5E7EB] pt-6">
          {/* Key Performance Indicators - Unified Scrollable Row */}
          <div className="flex flex-col gap-3">
            {/* KPI Header with Date Picker */}
            <div className="flex items-center justify-between flex-wrap gap-2 px-1">
              <div>
                <h2 className="text-base font-bold text-[#1c1e21] tracking-tight">Key Performance Indicators</h2>
                <p className="text-xs text-[#70747c]">Real-time operational & clinical metrics across departments</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-white border border-[#E5E7EB] rounded-lg shadow-sm">
                  <button
                    onClick={() => setSelectedDate((prev) => subDays(prev, 1))}
                    className="flex items-center justify-center w-[28px] h-[28px] rounded-l-lg transition-colors hover:bg-[#F2F4F6] text-slate-600"
                    title="Previous Day"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <Popover open={isKpiCalendarOpen} onOpenChange={setIsKpiCalendarOpen}>
                    <PopoverTrigger asChild>
                      <button className="flex items-center justify-center h-[28px] px-2.5 text-xs font-semibold text-slate-700 hover:bg-[#F2F4F6] transition-colors border-x border-[#E5E7EB]">
                        <CalendarIcon className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
                        {isToday(selectedDate)
                          ? "Today"
                          : isYesterday(selectedDate)
                            ? "Yesterday"
                            : isTomorrow(selectedDate)
                              ? "Tomorrow"
                              : format(selectedDate, "dd/MM/yyyy")}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 border-[#E5E7EB] shadow-lg">
                      <CalendarPicker
                        selected={selectedDate}
                        hideThemePicker
                        onSelect={(date) => {
                          if (date instanceof Date) {
                            setSelectedDate(date);
                            setIsKpiCalendarOpen(false);
                          }
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                  <button
                    onClick={() => setSelectedDate((prev) => addDays(prev, 1))}
                    className="flex items-center justify-center w-[28px] h-[28px] rounded-r-lg transition-colors hover:bg-[#F2F4F6] text-slate-600"
                    title="Next Day"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                {/* KPI Shower - Multi-select and Selected KPI display */}
                <Popover open={isKpiShowerOpen} onOpenChange={setIsKpiShowerOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center h-[28px] px-2.5 bg-white border border-[#E5E7EB] rounded-lg shadow-sm hover:bg-[#F2F4F6] transition-colors gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer select-none"
                      title="KPI Shower - Click to select and view KPIs"
                    >
                      <Activity className="w-3.5 h-3.5 text-slate-500" />
                      {selectedKpis.length === 0 ? (
                        <span className="text-slate-500 font-normal">Select KPIs</span>
                      ) : selectedKpis.length === 1 ? (
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{
                              backgroundColor:
                                visibleStats.find((s) => s.id === selectedKpis[0])?.valueColor || "#00488D",
                            }}
                          />
                          <span className="truncate max-w-[130px] sm:max-w-[160px]">
                            {visibleStats.find((s) => s.id === selectedKpis[0])?.label || "1 Selected"}
                          </span>
                        </div>
                      ) : selectedKpis.length === visibleStats.length ? (
                        <span className="text-slate-700 font-semibold">
                          All KPIs ({visibleStats.length})
                        </span>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <div className="flex -space-x-1">
                            {visibleStats
                              .filter((s) => selectedKpis.includes(s.id))
                              .slice(0, 3)
                              .map((s) => (
                                <span
                                  key={s.id}
                                  className="w-2 h-2 rounded-full border border-white"
                                  style={{ backgroundColor: s.valueColor }}
                                />
                              ))}
                          </div>
                          <span>{selectedKpis.length} KPIs Selected</span>
                        </div>
                      )}
                      <ChevronDown
                        className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${
                          isKpiShowerOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    sideOffset={6}
                    className="w-72 p-0 shadow-xl rounded-xl z-50 bg-white border border-gray-100 text-[#1c1e21]"
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-800">KPI Shower</span>
                        <span className="text-[11px] font-medium text-slate-500">
                          ({selectedKpis.length}/{visibleStats.length})
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedKpis(visibleStats.map((s) => s.id))}
                          className="text-[11px] text-[#00488D] hover:underline font-semibold cursor-pointer"
                        >
                          Select All
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() => setSelectedKpis([])}
                          className="text-[11px] text-slate-500 hover:text-slate-700 hover:underline font-medium cursor-pointer"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    {/* KPI Multi-select List */}
                    <div className="max-h-64 overflow-y-auto p-1 space-y-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {visibleStats.map((stat) => {
                        const isChecked = selectedKpis.includes(stat.id);
                        return (
                          <div
                            key={stat.id}
                            onClick={() => {
                              setSelectedKpis((prev) =>
                                prev.includes(stat.id)
                                  ? prev.filter((id) => id !== stat.id)
                                  : [...prev, stat.id]
                              );
                            }}
                            className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors text-xs select-none ${
                              isChecked ? "bg-slate-50 font-medium" : "hover:bg-slate-50 text-slate-600"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {}}
                                className="w-3.5 h-3.5 rounded border-slate-300 text-[#00488D] focus:ring-0 cursor-pointer"
                              />
                              <div
                                style={{ background: stat.iconBg }}
                                className="w-6 h-6 rounded flex items-center justify-center shrink-0"
                              >
                                {stat.icon}
                              </div>
                              <span className="truncate text-xs text-slate-800">{stat.label}</span>
                            </div>
                            <span
                              className="text-[11px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ml-2"
                              style={{ color: stat.valueColor, background: stat.bg }}
                            >
                              {stat.value}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Scrollable KPI Track Container */}
            <div className="relative">
              {/* Left Arrow Button */}
              {canScrollLeft && (
                <button
                  type="button"
                  onClick={() => handleKpiScroll("left")}
                  aria-label="Scroll left"
                  className="absolute -left-3 top-[calc(50%-16px)] w-8 h-8 rounded-full bg-white border border-[#e6e7eb] shadow-[0_2px_8px_rgba(0,0,0,0.08)] flex items-center justify-center cursor-pointer z-10 transition-all duration-150 hover:bg-[#fafafa] hover:scale-105 text-[#1c1e21]"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}

              {/* Left Fade Gradient */}
              <div
                className={`absolute left-0 top-0 bottom-2 w-12 pointer-events-none z-[2] transition-opacity duration-200 bg-gradient-to-r from-[#F7F9FB] to-transparent ${
                  canScrollLeft ? "opacity-100" : "opacity-0"
                }`}
              />

              {/* Scroll Track */}
              <div
                ref={trackRef}
                className="flex gap-[14px] overflow-x-auto scroll-smooth py-[6px] px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {displayedStats.length === 0 ? (
                  <div className="flex items-center justify-center w-full py-8 text-xs text-slate-500 font-medium">
                    No KPIs selected. Select KPIs from the dropdown above to display them.
                  </div>
                ) : (
                  displayedStats.map((card) => (
                    <div
                      key={card.id}
                      onClick={card.onClick}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          card.onClick();
                        }
                      }}
                      style={{
                        background: card.bg,
                        border: card.isActive ? `2.5px solid ${card.valueColor}` : "2.5px solid transparent",
                        boxShadow: card.isActive
                          ? `0 0 0 1px ${card.valueColor}20, 0 6px 18px ${card.valueColor}28`
                          : "0 2px 10px rgba(0,0,0,0.06)",
                      }}
                      className="flex-[0_0_206px] min-w-[206px] rounded-[12px] p-[14px_16px] flex flex-col gap-[10px] cursor-pointer transition-all duration-200 select-none hover:-translate-y-[2px] hover:shadow-[0_6px_20px_rgba(0,0,0,0.10)]"
                    >
                    <div className="flex items-center justify-between">
                      <div
                        style={{ background: card.iconBg }}
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm"
                      >
                        {card.icon}
                      </div>
                      {card.tag && (
                        card.isDropdown ? (
                          <Popover open={isApptStatusDropdownOpen} onOpenChange={setIsApptStatusDropdownOpen}>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setIsApptStatusDropdownOpen((prev) => !prev);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.stopPropagation();
                                  }
                                }}
                                style={{ color: card.valueColor }}
                                className="text-[11px] font-bold px-[8px] py-[2px] rounded-full tracking-[-0.2px] bg-white/70 shadow-sm inline-flex items-center gap-1 cursor-pointer transition-all duration-150 hover:bg-white hover:scale-105 active:scale-95 select-none"
                                title="Filter by appointment status"
                              >
                                <span>{card.tag}</span>
                                <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${isApptStatusDropdownOpen ? "rotate-180" : ""}`} />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent
                              align="end"
                              sideOffset={6}
                              className="w-60 p-2 shadow-xl rounded-xl z-50 bg-white border border-gray-100 text-[#1c1e21]"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex items-center justify-between px-2 py-1 mb-1 border-b border-gray-100">
                                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Filter by Status</span>
                                {selectedApptStatus && (
                                  <button
                                    type="button"
                                    onClick={() => handleSelectAppointmentStatus(null)}
                                    className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
                                  >
                                    Reset
                                  </button>
                                )}
                              </div>
                              <div className="flex flex-col gap-0.5 max-h-60 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                <button
                                  type="button"
                                  onClick={() => handleSelectAppointmentStatus(null)}
                                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                                    !selectedApptStatus
                                      ? "bg-blue-50 text-blue-700 font-semibold"
                                      : "text-gray-700 hover:bg-gray-50"
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                                    <span>All Appointments</span>
                                  </div>
                                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-white border text-gray-600 font-bold">
                                    {appointmentCount}
                                  </span>
                                </button>
                                {availableAppointmentStatuses.map((status) => {
                                  const count = appointmentStatusCounts[status] ?? 0;
                                  const isSelected = selectedApptStatus === status;
                                  const dotColor = getStatusDotColor(status);
                                  return (
                                    <button
                                      key={status}
                                      type="button"
                                      onClick={() => handleSelectAppointmentStatus(status)}
                                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                                        isSelected
                                          ? "bg-blue-50 text-blue-700 font-semibold"
                                          : "text-gray-700 hover:bg-gray-50"
                                      }`}
                                    >
                                      <div className="flex items-center gap-2">
                                        <span className={`w-2 h-2 rounded-full ${dotColor} shrink-0`} />
                                        <span className="truncate">{status}</span>
                                      </div>
                                      <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-white border text-gray-600 font-bold">
                                        {count}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </PopoverContent>
                          </Popover>
                        ) : card.onTagClick ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              card.onTagClick?.();
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.stopPropagation();
                              }
                            }}
                            style={{ color: card.valueColor }}
                            className="text-[11px] font-bold px-[8px] py-[2px] rounded-full tracking-[-0.2px] bg-white/70 shadow-sm inline-flex items-center cursor-pointer transition-all duration-150 hover:bg-white hover:scale-105 active:scale-95 select-none"
                            title="Click to toggle filter (Active / All)"
                          >
                            {card.tag}
                          </button>
                        ) : (
                          <span
                            style={{ color: card.valueColor }}
                            className="text-[11px] font-bold px-[7px] py-[2px] rounded-full tracking-[-0.2px] bg-white/60 shadow-sm"
                          >
                            {card.tag}
                          </span>
                        )
                      )}
                    </div>

                    <div
                      style={{ color: card.valueColor }}
                      className="text-[26px] font-extrabold leading-[1.05] tracking-[-0.6px]"
                    >
                      {card.loading ? (
                        <div
                          style={{ backgroundColor: card.valueColor, opacity: 0.15 }}
                          className="w-14 h-7 rounded-md animate-pulse"
                        />
                      ) : (
                        <CountUp target={typeof card.value === "number" ? card.value : parseStatValue(String(card.value))} />
                      )}
                    </div>

                    <div className="flex flex-col gap-[2px] min-w-0">
                      <span
                        style={{ color: card.valueColor }}
                        className="text-[12.5px] font-bold tracking-tight truncate"
                      >
                        {card.label}
                      </span>
                      <span
                        style={{ color: card.valueColor, opacity: 0.75 }}
                        className="text-[11px] font-medium truncate"
                      >
                        {card.subLabel}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

              {/* Right Fade Gradient */}
              <div
                className={`absolute right-0 top-0 bottom-2 w-12 pointer-events-none z-[2] transition-opacity duration-200 bg-gradient-to-l from-[#F7F9FB] to-transparent ${
                  canScrollRight ? "opacity-100" : "opacity-0"
                }`}
              />

              {/* Right Arrow Button */}
              {canScrollRight && (
                <button
                  type="button"
                  onClick={() => handleKpiScroll("right")}
                  aria-label="Scroll right"
                  className="absolute -right-3 top-[calc(50%-16px)] w-8 h-8 rounded-full bg-white border border-[#e6e7eb] shadow-[0_2px_8px_rgba(0,0,0,0.08)] flex items-center justify-center cursor-pointer z-10 transition-all duration-150 hover:bg-[#fafafa] hover:scale-105 text-[#1c1e21]"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
          </div>
          </div>

{/* Overview Header */}
           <div className="flex items-end justify-between">
             <div>
               <h2 className="hms-heading">Admin Overview</h2>
               <p className="hms-subheading">Real-time performance across all branches.</p>
             </div>
             {can("appointment.create") && (
             <button
               onClick={() => navigate("/appointments/add")}
               className="flex items-center gap-1.5 px-5 py-2.5 bg-[#004785] rounded-[10px] text-white text-xs font-semibold whitespace-nowrap hover:opacity-90 transition-opacity"
             >
               <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
                 <path d="M8 2V10M4 6H12" stroke="white" strokeWidth="2" strokeLinecap="round"/>
               </svg>
               Add Appointment
             </button>
             )}
           </div>

          {/* Table Card */}
          <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm flex flex-col transition-all duration-300 hover:shadow-md">
            <div>
              {/* Table Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-[rgba(194,198,212,0.10)]">
              <div className="relative flex items-center gap-6" ref={tabsContainerRef}>
                {availableTabs.map((tab) => (
                  <button
                    key={tab.key}
                    data-tab={tab.key}
                    onClick={() => {
                      setActiveTab(tab.key);
                      setSelectedKpis((prev) => prev.includes(tab.key) ? prev : [...prev, tab.key]);
                      setCurrentPage(1);
                    }}
                    className="relative pb-2 text-xs font-semibold tracking-[1.2px] capitalize transition-colors duration-200"
                    style={{ color: activeTab === tab.key ? "#00488D" : "#424752" }}
                  >
                    {tab.label}
                  </button>
                ))}
                <div
                    className="absolute bottom-0 h-[2px] bg-[#00488D] transition-all duration-300 ease-out max-[1024px]:hidden"
                    style={{ left: underline.left, width: underline.width }}
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {/* Search */}
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="pl-8 pr-3 py-1.5 bg-[#F2F4F6] text-xs text-[#6B7280] placeholder:text-[#6B7280] outline-none w-[150px] sm:w-[200px] rounded-md transition-all duration-200 focus:rounded-none focus:w-[200px] sm:focus:w-[250px]"
                    />
                  <svg className="absolute left-2 top-1/2 -translate-y-1/2" width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M11.0667 11.5713L6.86667 7.3713C6.53333 7.638 6.15 7.8491 5.71667 8.0046C5.28333 8.1602 4.82222 8.238 4.33333 8.238C3.12222 8.238 2.09722 7.8185 1.25833 6.9796C0.419444 6.1407 0 5.1157 0 3.90462C0 2.69351.419444 1.66851 1.25833.82962C2.09722-.00927 3.12222-.42871 4.33333-.42871C5.54444-.42871 6.56944-.00927 7.40833.82962C8.24722 1.66851 8.66667 2.69351 8.66667 3.90462C8.66667 4.3935 8.58889 4.8546 8.43333 5.288C8.27778 5.7213 8.06667 6.1046 7.8 6.438L12 10.638L11.0667 11.5713ZM4.33333 6.9046C5.16667 6.9046 5.875 6.613 6.45833 6.0296C7.04167 5.4463 7.33333 4.738 7.33333 3.90462C7.33333 3.07129 7.04167 2.36296 6.45833 1.77962C5.875 1.19629 5.16667.90462 4.33333.90462C3.5.90462 2.79167 1.19629 2.20833 1.77962C1.625 2.36296 1.33333 3.07129 1.33333 3.90462C1.33333 4.738 1.625 5.4463 2.20833 6.0296C2.79167 6.613 3.5 6.9046 4.33333 6.9046Z" fill="#424752"/>
                  </svg>
                </div>
                {/* Date nav */}
                <div className="flex items-center">
                  <button
                    onClick={() => setSelectedDate((prev) => subDays(prev, 1))}
                    className="flex items-center justify-center w-[25px] h-[27px] border border-[#E5E7EB] rounded-l-lg transition-colors duration-150 hover:bg-[#F2F4F6]"
                  >
                    <svg width="6" height="10" viewBox="0 0 6 10" fill="none">
                      <path d="M5 1L1 5L5 9" stroke="black" strokeWidth="1.33" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                  <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                    <PopoverTrigger asChild>
                      <button className="flex items-center justify-center h-[27px] w-[90px] px-2 border-t border-b border-[#E5E7EB] bg-white text-xs font-medium transition-colors duration-150 hover:bg-[#F2F4F6]">
                        {isToday(selectedDate)
                          ? "Today"
                          : isYesterday(selectedDate)
                            ? "Yesterday"
                            : isTomorrow(selectedDate)
                              ? "Tomorrow"
                              : format(selectedDate, "dd/MM/yyyy")}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 border-[#E5E7EB] shadow-lg">
                      <CalendarPicker
                        selected={selectedDate}
                        hideThemePicker
                        onSelect={(date) => {
                          if (date instanceof Date) {
                            setSelectedDate(date);
                            setIsCalendarOpen(false);
                          }
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                  <button
                    onClick={() => setSelectedDate((prev) => addDays(prev, 1))}
                    className="flex items-center justify-center w-[25px] h-[27px] border border-[#E5E7EB] rounded-r-lg transition-colors duration-150 hover:bg-[#F2F4F6]"
                  >
                    <svg width="6" height="10" viewBox="0 0 6 10" fill="none">
                      <path d="M1 1L5 5L1 9" stroke="black" strokeWidth="1.33" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
                {/* Filters */}
                <ToolbarFilter
                  title="Advanced Filters"
                  fields={activeFilterFields}
                  values={filterValues}
                  onChange={handleFilterChange}
                  onApply={handleApplyFilter}
                  onClear={handleClearFilter}
                  open={isFilterOpen}
                  onOpenChange={setIsFilterOpen}
                />
                <RefreshButton
                  onClick={() => {
                    if (activeTab === "appointments") fetchAppointments();
                    else {
                      employeesQuery.refetch();
                      void refreshCriticalEncounters();
                    }
                    patientsQuery.refetch();
                    void criticalPatientsQuery.refetch();
                    prescriptionsQuery.refetch();
                    ipdOverviewQuery.refetch();
                  }}
                  isLoading={activeTab === "appointments" ? isAppointmentsLoading : isEmployeesLoading}
                />
              </div>
            </div>

            {/* Table / Loading */}
            {((activeTab === "doctors" || activeTab === "staff") && isEmployeesLoading) ||
            (activeTab === "appointments" && isAppointmentsLoading) ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-[#6B7280] text-sm">
                <Loader2 size={24} className="animate-spin text-[#00488D]" />
                Loading {activeTab}...
              </div>
            ) : (
              <HmsTable
                scrollable={false}
                columns={activeTab === "appointments" ? [
                  { key: "patientName", label: "Patient Name", className: "relative", render: (r: any) => {
                    const crit = getLiveCriticalInfo(r.patientId);
                    return (
                    <>
                      <CriticalCorner reasons={crit.reasons} />
                      <CriticalWrapper className="flex items-center gap-2" reasons={crit.reasons}>
                        <div data-critical-avatar className="w-7 h-7 flex items-center justify-center rounded-xl flex-shrink-0 hms-avatar-text" style={{ background: r.avatarBg, color: r.avatarColor }}>{r.avatar}</div>
                        <div><div className="hms-name-text">{r.patientName}</div><div className="hms-id-text flex items-center">{r.patientId}<CriticalDot reasons={crit.reasons} /></div></div>
                      </CriticalWrapper>
                    </>
                    );
                  }},
                  { key: "appointmentNo", label: "Appointment No", render: (r: any) => (
                    <span className="px-3 py-1 rounded-[20px] hms-content-text inline-block" style={{ background: "#EEF2FF", color: "#4F46E5" }}>{r.appointmentNo}</span>
                  )},
                  { key: "doctorName", label: "Assigned Doctor", render: (r: any) => (
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 flex items-center justify-center rounded-xl flex-shrink-0 hms-avatar-text" style={{ background: r.doctorAvatarBg, color: r.doctorAvatarcolor }}>{r.doctorAvatar}</div>
                      <div><div className="hms-name-text">{r.doctorName}</div><div className="hms-id-text">{r.doctorId}</div></div>
                    </div>
                  )},
                  { key: "branch", label: "Branch", render: (r: any) => (
                    <span className="text-[#191C1E] hms-content-text leading-4">{r.branch}</span>
                  )},
                  { key: "reason", label: "Reason / Type", render: (r: any) => (
                    <div className="flex flex-col gap-1">
                      <span className="text-[#191C1E] hms-content-text leading-4">{r.reason}</span>
                      {r.visitType && (
                        <span
                          className={`inline-block w-fit text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                            r.visitType.toLowerCase().includes("chemo")
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : r.visitType.toLowerCase().includes("lab")
                              ? "bg-purple-50 text-purple-700 border-purple-200"
                              : "bg-blue-50 text-blue-700 border-blue-200"
                          }`}
                        >
                          {r.visitType}
                        </span>
                      )}
                    </div>
                  )},
                  { key: "date", label: "Timing", render: (r: any) => (
                    <div className="text-[#191C1E] hms-content-text leading-4"><div>{r.date}</div><div className="text-[#8C8D8F] hms-department-text">{r.time}</div></div>
                  )},
                  { key: "status", label: "Status", render: (r: any) => (
                    <StatusBadge status={String(r.status)} />
                  )},
                  { key: "actions", label: "Action", sortable: false, render: (r: any) => (
                    <AppointmentActionMenu
                      status={r.status}
                      appointmentDateISO={r.appointmentDateISO}
                      onView={() => navigate(`/appointments/view/${r.id}`)}
                      onEdit={() => handleEdit(r.id)}
                      onCancel={() => handleCancelAppointment(r)}
                      onCheckIn={() => handleCheckIn(r)}
                      onCheckOut={() => handleCheckOut(r)}
                      onVitalsSaved={fetchAppointments}
                      appointmentId={r.id}
                      patientId={r.patientId}
                    />
                  )},
                ] : [
                  { key: "name", label: "Name", render: (r: any) => (
                    <div className="flex items-center gap-2">
                      <DepartmentAvatarText department={r.dept}>{r.avatar}</DepartmentAvatarText>
                      <div><div className="hms-name-text">{r.name}</div><div className="hms-id-text">{r.id}</div></div>
                    </div>
                  )},
                  { key: "dept", label: "Department", render: (r: any) => (
                    <DepartmentPill department={r.dept}>{r.dept}</DepartmentPill>
                  )},
                  { key: "branch", label: "Branch", render: (r: any) => (
                    activeTab === "doctors" && r.branches?.length
                      ? <DoctorBranchDisplay branches={r.branches} />
                      : <span className="text-[#191C1E] hms-content-text leading-4">{r.branch}</span>
                  )},
                  { key: "status", label: "Status", render: (r: any) => (
                    <StatusBadge status={String(r.status)} />
                  )},
                  { key: "actions", label: "Actions", sortable: false, render: (r: any) => (
                    <div className="flex items-center gap-1">
                      {can("doctor.read") && (
                      <button title="View" onClick={() => handleView(r.id)} className="p-1.5 rounded transition-colors duration-200 hover:bg-none group">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-colors duration-200 stroke-[#1B1D20] group-hover:stroke-[#505F76]">
                          <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      </button>
                      )}
                      {can(activeTab === "doctors" ? "doctor.update" : "employee.update") && (
                      <button title="Edit" onClick={() => {
                        if (activeTab === "doctors") handleEditDoctor(r.id);
                        else if (activeTab === "staff") handleEditStaff(r.id, r.role);
                        else handleEdit(r.id);
                      }} className="p-1.5 rounded transition-colors duration-200 hover:bg-blue-50 group">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.36" strokeLinecap="round" strokeLinejoin="round" className="transition-colors duration-200 stroke-[#003EA8] group-hover:stroke-[#5E87CF]">
                          <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" />
                        </svg>
                      </button>
                      )}
                    </div>
                  )},
                ]}
                data={currentRows}
                sortField={sortField[activeTab] ?? ""}
                sortDirection={sortDirection[activeTab] ?? "asc"}
                onSort={handleSort}
                currentPage={currentPage}
                totalPages={totalPages}
                totalRecords={totalRecords}
                rowsPerPage={rowsPerPage}
                visibleStart={visibleStart}
                visibleEnd={visibleEnd}
                onPageChange={setCurrentPage}
                onRowsPerPageChange={(val) => { setRowsPerPage(val); setCurrentPage(1); }}
                rowsPerPageOptions={[5, 10, 20]}
                emptyMessage={`No ${activeTab} found matching the current filters.`}
                rowKey={(r) => String((r as any).id)}
                rowClassName={(r: any) => {
                  if (activeTab !== "appointments") return "";
                  const crit = getLiveCriticalInfo(r.patientId);
                   return "";
                }}
              />
            )}
            </div>
          </div>

          {/* Bottom Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4">
            {/* Branch Performance -- extracted into its own component (incl. Bar/Pie toggle) */}
            {can("appointment.read") && (
            <BranchPerformance selectedDate={selectedDate} />
            )}

            {/* System Integrity */}
            <div className="bg-white rounded-lg border border-[rgba(194,198,212,0.10)] p-5 flex flex-col gap-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-[#191C1E] font-extrabold text-base leading-6 tracking-[-0.4px]">System Integrity</h3>
                  <p className="text-[#424752] text-[9px] font-semibold tracking-[0.9px] capitalize">Alerts</p>
                </div>
                <button className="px-3 py-1 rounded border border-[rgba(194,198,212,0.30)] text-[#424752] text-[9px] font-semibold tracking-[0.9px]">View All</button>
              </div>
              <div className="flex flex-col gap-2">
                {/* Alert 1 */}
                <div className="flex items-start gap-3 p-2 rounded-[4px]">
                  <svg width="17" height="15" viewBox="0 0 17 15" fill="none" className="flex-shrink-0 mt-0.5">
                    <path d="M0 14.25L8.25 0L16.5 14.25H0ZM2.5875 12.75H13.9125L8.25 3L2.5875 12.75ZM8.25 12C8.4625 12 8.64062 11.9281 8.78438 11.7844C8.92813 11.6406 9 11.4625 9 11.25C9 11.0375 8.92813 10.8594 8.78438 10.7156C8.64062 10.5719 8.4625 10.5 8.25 10.5C8.0375 10.5 7.85938 10.5719 7.71562 10.7156C7.57187 10.8594 7.5 11.0375 7.5 11.25C7.5 11.4625 7.57187 11.6406 7.71562 11.7844C7.85938 11.9281 8.0375 12 8.25 12ZM7.5 9.75H9V6H7.5V9.75Z" fill="#BA1A1A"/>
                  </svg>
                  <div>
                    <div className="text-[#191C1E] font-semibold text-xs leading-[15px]">Admin Access Granted</div>
                    <div className="text-[#424752] font-normal text-[10px] leading-[15px]">John Doe (IT) authorized for DB.</div>
                  </div>
                </div>
                {/* Alert 2 */}
                <div className="flex items-start gap-3 p-2 rounded-[4px]">
                  <svg width="17" height="15" viewBox="0 0 17 15" fill="none" className="flex-shrink-0 mt-0.5">
                    <path d="M0 14.25L8.25 0L16.5 14.25H0ZM2.5875 12.75H13.9125L8.25 3L2.5875 12.75ZM8.25 12C8.4625 12 8.64062 11.9281 8.78438 11.7844C8.92813 11.6406 9 11.4625 9 11.25C9 11.0375 8.92813 10.8594 8.78438 10.7156C8.64062 10.5719 8.4625 10.5 8.25 10.5C8.0375 10.5 7.85938 10.5719 7.71562 10.7156C7.57187 10.8594 7.5 11.0375 7.5 11.25C7.5 11.4625 7.57187 11.6406 7.71562 11.7844C7.85938 11.9281 8.0375 12 8.25 12ZM7.5 9.75H9V6H7.5V9.75Z" fill="#BA1A1A"/>
                  </svg>
                  <div>
                    <div className="text-[#191C1E] font-semibold text-xs leading-[15px]">Server Latency</div>
                    <div className="text-[#424752] font-normal text-[10px] leading-[15px]">Billing module experiencing delays.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      <ConfirmationDialog
        open={!!cancelTarget}
        type="danger"
        title="Cancel Appointment?"
        description={
          cancelTarget
            ? `Appointment ${cancelTarget.id} will be cancelled. Please enter a reason for cancellation.`
            : ""
        }
        confirmText="Cancel Appointment"
        cancelText="Keep Appointment"
        loading={isCancelling}
        onConfirm={handleConfirmCancelAppointment}
        onCancel={() => setCancelTarget(null)}
      >
        <textarea
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          placeholder="Reason for cancellation (required)"
          rows={3}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
      </ConfirmationDialog>
    </div>
  );
};

function DashboardSkeleton() {
  return (
    <div className="flex w-full font-[Manrope,sans-serif] bg-[#F7F9FB]">
      <div className="flex flex-col flex-1 min-w-0">
        <main className="flex flex-col gap-6 border-t border-[#E5E7EB] pt-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-8">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="flex flex-col gap-3 p-4 rounded-xl border border-slate-200 bg-white shadow-sm"
              >
                <div className="w-8 h-8 bg-slate-200 rounded-[4px] animate-pulse" />
                <div className="w-16 h-6 bg-slate-200 rounded-md animate-pulse" />
                <div className="w-20 h-3 bg-slate-100 rounded-md animate-pulse" />
              </div>
            ))}
          </div>

          <div className="flex items-end justify-between">
            <div className="flex flex-col gap-2">
              <div className="w-44 h-6 bg-slate-200 rounded-md animate-pulse" />
              <div className="w-72 h-3 bg-slate-100 rounded-md animate-pulse" />
            </div>
            <div className="w-32 h-9 bg-slate-200 rounded-[10px] animate-pulse" />
          </div>

          <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <div className="flex items-center gap-6">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="w-14 h-4 bg-slate-100 rounded-md animate-pulse" />
                ))}
              </div>
              <div className="flex items-center gap-3">
                <div className="w-[200px] h-7 bg-slate-100 rounded-md animate-pulse" />
                <div className="w-24 h-7 bg-slate-100 rounded-md animate-pulse" />
              </div>
            </div>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-slate-100">
                <div className="w-1/5 h-4 bg-slate-100 rounded-md animate-pulse" />
                <div className="w-1/6 h-4 bg-slate-100 rounded-md animate-pulse" />
                <div className="flex-1 h-4 bg-slate-50 rounded-md animate-pulse" />
                <div className="w-16 h-5 bg-slate-100 rounded-full animate-pulse" />
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
