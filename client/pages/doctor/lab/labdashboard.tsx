import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { getUser, remove } from "@/utils/token";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  CheckCircle2,
  Clock,
  Timer,
  AlertTriangle,
} from "lucide-react";
import LabNav from "./labnav";
import { labOrderApi, labOrderItemApi, LabOrderRecord, LabOrderItemRecord } from "@/api/labOrder.api";
import { patientApi, PatientRecord } from "@/api/patient.api";
import { UserProfileDropdown } from "@/components/ui/User_profile_dropdown";
import { ConfirmationDialog } from "@/components/ui/ConfirmationDialog";
import { LabNotificationBell } from "@/components/hms/LabNotificationBell";
import {
  calculateSampleStability,
  resolveStabilityHours,
  useCurrentTimeTicker,
  compareBySampleStability,
  SampleStabilityInfo,
} from "@/utils/sampleStability";

export interface TestItemDetail {
  id: string;
  testCode: string;
  testName: string;
  sampleType: string;
  priority: string;
  barcode?: string;
  targetDate?: string;
  deadlineDate?: string;
}

export interface TestRecord {
  id: string;
  requestId: string;
  patientId: string;
  patientName: string;
  requestedBy: string;
  requestTime: string;
  tests: string;
  date?: string;
  time?: string;
  orderDateIso?: string;
  targetDate?: string;
  targetDateIso?: string;
  status: "PROCESSING" | "COMPLETED";
  dob: string;
  gender: string;
  mobile: string;
  email: string;
  address: string;
  avatarUrl?: string;
  testItems?: TestItemDetail[];
  barcode?: string;
  barcodeGenerated?: boolean;
  isCollected?: boolean;
  collectionTimeIso?: string;
  collectionTime?: string;
  stabilityHours?: number;
  priority?: string;
}

const INITIAL_TESTS: TestRecord[] = [
  {
    id: "1",
    requestId: "TRF1256",
    patientId: "P000123",
    patientName: "Rahul Sharma",
    requestedBy: "Dr. Sharma",
    requestTime: "20 May 2024 10:30 AM",
    tests: "CBC, LFT",
    date: "10/04/26",
    time: "10:30 AM",
    orderDateIso: "2026-04-10",
    barcodeGenerated: false,
    priority: "Normal",
    targetDate: "12-04-2026",
    targetDateIso: "2026-04-12",
    status: "PROCESSING",
    dob: "15/06/1985",
    gender: "Male",
    mobile: "9876543210",
    email: "ramesh.kumar@email.com",
    address: "21, Green Park, New Delhi",
  },
  {
    id: "2",
    requestId: "TRF1255",
    patientId: "P000124",
    patientName: "Priya",
    requestedBy: "Dr. Verma",
    requestTime: "30 Mar 2026 11:30 AM",
    tests: "KFT, Lipid Profile",
    date: "30/03/26",
    time: "11:30 AM",
    orderDateIso: "2026-03-30",
    collectionTimeIso: new Date(Date.now() - 150 * 60 * 1000).toISOString(),
    stabilityHours: 2,
    priority: "Normal",
    targetDate: "01-04-2026",
    targetDateIso: "2026-04-01",
    status: "COMPLETED",
    dob: "22/08/1992",
    gender: "Female",
    mobile: "9812345678",
    email: "priya.sharma@email.com",
    address: "45, Vasant Vihar, New Delhi",
  },
  {
    id: "3",
    requestId: "TRF1254",
    patientId: "P000125",
    patientName: "Praveen Singh",
    requestedBy: "Dr.John",
    requestTime: "03 Apr 2026 10:45 AM",
    tests: "KFT, Lipid Profile",
    date: "03/04/26",
    time: "10:45AM",
    orderDateIso: "2026-04-03",
    barcodeGenerated: false,
    priority: "Stat",
    targetDate: "05-04-2026",
    targetDateIso: "2026-04-05",
    status: "PROCESSING",
    dob: "10/11/1980",
    gender: "Male",
    mobile: "9823456789",
    email: "praveen.singh@email.com",
    address: "12, Model Town, Delhi",
  },
  {
    id: "4",
    requestId: "TRF1253",
    patientId: "P000126",
    patientName: "Naziya",
    requestedBy: "Dr. Verma",
    requestTime: "05 Apr 2026 10:30 AM",
    tests: "KFT, Lipid Profile",
    date: "05/04/26",
    time: "10:30 AM",
    orderDateIso: "2026-04-05",
    barcodeGenerated: false,
    priority: "Urgent",
    targetDate: "07-04-2026",
    targetDateIso: "2026-04-07",
    status: "PROCESSING",
    dob: "04/02/1995",
    gender: "Female",
    mobile: "9834567890",
    email: "naziya.k@email.com",
    address: "88, Jamia Nagar, New Delhi",
  },
  {
    id: "5",
    requestId: "TRF1252",
    patientId: "P000127",
    patientName: "Baskar",
    requestedBy: "Dr. Sarah",
    requestTime: "20 Mar 2026 12:15 AM",
    tests: "KFT, Lipid Profile",
    date: "20/03/26",
    time: "12:15 AM",
    orderDateIso: "2026-03-20",
    targetDate: "22-03-2026",
    targetDateIso: "2026-03-22",
    status: "COMPLETED",
    dob: "19/07/1978",
    gender: "Male",
    mobile: "9845678901",
    email: "baskar.m@email.com",
    address: "14, Lajpat Nagar, New Delhi",
  },
  {
    id: "6",
    requestId: "TRF1251",
    patientId: "P000128",
    patientName: "Ajay",
    requestedBy: "Dr. Verma",
    requestTime: "21 Mar 2026 01:16 PM",
    tests: "KFT, Lipid Profile",
    date: "21/03/26",
    time: "01:16 PM",
    orderDateIso: "2026-03-21",
    targetDate: "23-03-2026",
    targetDateIso: "2026-03-23",
    status: "COMPLETED",
    dob: "30/09/1988",
    gender: "Male",
    mobile: "9856789012",
    email: "ajay.verma@email.com",
    address: "56, Karol Bagh, New Delhi",
  },
  {
    id: "7",
    requestId: "TRF1250",
    patientId: "P000129",
    patientName: "Gopal",
    requestedBy: "Dr. Mahesh",
    requestTime: "11 Apr 2026 10:30 AM",
    tests: "KFT, Lipid Profile",
    date: "11/04/26",
    time: "10:30 AM",
    orderDateIso: "2026-04-11",
    targetDate: "13-04-2026",
    targetDateIso: "2026-04-13",
    status: "PROCESSING",
    dob: "12/12/1975",
    gender: "Male",
    mobile: "9867890123",
    email: "gopal.das@email.com",
    address: "78, Rohini Sector 9, New Delhi",
  },
  {
    id: "8",
    requestId: "TRF1249",
    patientId: "P000130",
    patientName: "Ramya",
    requestedBy: "Dr. Verma",
    requestTime: "15 Apr 2026 09:00 AM",
    tests: "KFT, Lipid Profile",
    date: "15/04/26",
    time: "09:00 AM",
    orderDateIso: "2026-04-15",
    targetDate: "17-04-2026",
    targetDateIso: "2026-04-17",
    status: "COMPLETED",
    dob: "05/05/1996",
    gender: "Female",
    mobile: "9878901234",
    email: "ramya.n@email.com",
    address: "33, Saket, New Delhi",
  },
];

// Helper to extract YYYY-MM-DD from a Date object in local time
const toIsoDateString = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Helper to format Date as DD-MM-YYYY for display
const formatPickedDisplayDate = (d: Date): string => {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
};

// Helper to normalize any date string to YYYY-MM-DD for comparison
const normalizeToIsoDate = (value?: string | null): string | null => {
  if (!value || value === "—") return null;
  const str = String(value).trim();

  // Format: YYYY-MM-DD
  const ymdMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymdMatch) return `${ymdMatch[1]}-${ymdMatch[2]}-${ymdMatch[3]}`;

  // Format: DD-MM-YYYY or DD/MM/YYYY
  const dmy4Match = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmy4Match) {
    const day = dmy4Match[1].padStart(2, "0");
    const month = dmy4Match[2].padStart(2, "0");
    const year = dmy4Match[3];
    return `${year}-${month}-${day}`;
  }

  // Format: DD/MM/YY or DD-MM-YY (e.g. "10/04/26")
  const dmy2Match = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2})$/);
  if (dmy2Match) {
    const day = dmy2Match[1].padStart(2, "0");
    const month = dmy2Match[2].padStart(2, "0");
    const year = `20${dmy2Match[3]}`;
    return `${year}-${month}-${day}`;
  }

  // Format like "20 May 2024" or "05 Apr 2026 10:30 AM"
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    return toIsoDateString(parsed);
  }

  return null;
};

// Helper to calculate age from DOB string (e.g. 15/06/1985 -> 38)
const calculateAge = (dobString?: string): number => {
  if (!dobString) return 38;
  const parts = dobString.split(/[-/]/);
  if (parts.length === 3) {
    let year = parseInt(parts[2], 10);
    if (isNaN(year) || year < 100) year = parseInt(parts[0], 10);
    if (!isNaN(year) && year > 1900 && year <= 2026) {
      return Math.max(1, 2024 - year);
    }
  }
  return 38;
};

// Helper to extract patient initials for avatar placeholder
const getPatientInitials = (name?: string): string => {
  if (!name) return "P";
  const clean = name.replace(/^Dr\.\s*/i, "").trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "P";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

/* target_date is a DATE column (serialised as UTC midnight), so it is read
   from the string rather than through the local timezone. */
const formatTargetDate = (value?: string | null): string => {
  if (!value) return "—";
  const iso = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return `${iso[3]}-${iso[2]}-${iso[1]}`;
  }
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) {
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    return `${day}-${month}-${d.getFullYear()}`;
  }
  return String(value);
};

const isTargetDateOverdue = (targetDateIso?: string, targetDateFormatted?: string, status?: string): boolean => {
  if (status === "COMPLETED") return false;
  const todayIso = new Date().toISOString().slice(0, 10);
  const iso = targetDateIso || normalizeToIsoDate(targetDateFormatted);
  if (!iso) return false;
  return iso < todayIso;
};

export const isTestOverdue = (test?: TestRecord | null): boolean => {
  if (!test) return false;
  return isTargetDateOverdue(test.targetDateIso, test.targetDate, test.status);
};

interface SampleBarcodeItem {
  id: string;
  testCode: string;
  testName: string;
  sampleType: string;
  barcode: string;
  count: number;
  targetDate?: string;
  deadlineDate?: string;
}

const INITIAL_SAMPLES: SampleBarcodeItem[] = [
  {
    id: "cbc",
    testCode: "CBC",
    testName: "Complete Blood Count",
    sampleType: "Whole Blood",
    barcode: "BC2405200001",
    count: 1,
    targetDate: "22-05-2024",
    deadlineDate: "22-05-2024",
  },
  {
    id: "lft",
    testCode: "LFT",
    testName: "Liver Function Test",
    sampleType: "Serum",
    barcode: "BC2405200002",
    count: 1,
    targetDate: "22-05-2024",
    deadlineDate: "22-05-2024",
  },
  {
    id: "kft",
    testCode: "KFT",
    testName: "Kidney Function Test",
    sampleType: "Serum",
    barcode: "BC2405200003",
    count: 1,
    targetDate: "22-05-2024",
    deadlineDate: "22-05-2024",
  },
];

const DEFAULT_TEST_ITEMS: TestItemDetail[] = [
  { id: "cbc", testCode: "CBC", testName: "Complete Blood Count", sampleType: "Whole Blood", priority: "Normal", targetDate: "22-05-2024", deadlineDate: "22-05-2024" },
  { id: "lft", testCode: "LFT", testName: "Liver Function Test", sampleType: "Serum", priority: "Normal", targetDate: "22-05-2024", deadlineDate: "22-05-2024" },
  { id: "kft", testCode: "KFT", testName: "Kidney Function Test", sampleType: "Serum", priority: "Normal", targetDate: "22-05-2024", deadlineDate: "22-05-2024" },
];

export default function LabDashboard() {
  const navigate = useNavigate();
  const currentUser = useMemo(() => getUser(), []);
  const displayName = currentUser?.username || "Lab Technician";
  const displayRole =
    currentUser?.role_type === "LAB_TECHNICIAN"
      ? "Lab Technician"
      : currentUser?.role_type || "Lab Technician";
  const avatarUrl =
    typeof window !== "undefined"
      ? localStorage.getItem("user_photo") || undefined
      : undefined;

  const [logoutOpen, setLogoutOpen] = useState(false);

  const handleLogout = () => {
    setLogoutOpen(false);
    remove();
    localStorage.removeItem("user_info");
    localStorage.removeItem("user_photo");
    navigate("/", { replace: true });
  };

  const [activeNav, setActiveNav] = useState("Dashboard");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PROCESSING" | "COMPLETED">("ALL");
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState<"ALL" | "DUE_SOON" | "EXPIRED">("ALL");
  const currentTime = useCurrentTimeTicker(30000);

  /* ---------- KPI Track Scroll (Admin Dashboard style) ---------- */
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

  // Editable tests list populated with real backend lab orders
  const [testsList, setTestsList] = useState<TestRecord[]>(INITIAL_TESTS);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Fetch real data from backend using existing APIs
  const fetchRealData = useCallback(async () => {
    try {
      setIsLoading(true);
      setFetchError(null);

      const [ordersRes, itemsRes, patientsRes] = await Promise.all([
        labOrderApi.getAll().catch(() => ({ data: { data: [] } })),
        labOrderItemApi.getAll().catch(() => ({ data: { data: [] } })),
        patientApi.getAll({ limit: 100 }).catch(() => ({ data: { data: { patients: [] } } })),
      ]);

      const orders: LabOrderRecord[] = ordersRes?.data?.data || [];
      const items: LabOrderItemRecord[] = itemsRes?.data?.data || [];
      const patients: PatientRecord[] = patientsRes?.data?.data?.patients || [];

      if (orders.length > 0) {
        // Build patient lookup map by patient_id
        const patientMap = new Map<string, PatientRecord>();
        patients.forEach((p) => {
          if (p.patient_id) patientMap.set(p.patient_id, p);
        });

        // Build order items map by lab_order_id
        const orderItemsMap = new Map<string, LabOrderItemRecord[]>();
        items.forEach((item) => {
          if (item.lab_order_id) {
            const list = orderItemsMap.get(item.lab_order_id) || [];
            list.push(item);
            orderItemsMap.set(item.lab_order_id, list);
          }
        });

        const mappedTests: TestRecord[] = orders.map((order, idx) => {
          const pBio = order.patient_history?.patient_bio_data;
          const pId =
            pBio?.patient_id ||
            order.patient_history?.patient_id ||
            order.patient_history_id ||
            `P000${120 + idx}`;
          const patient =
            pBio ||
            patientMap.get(pId) ||
            (order.patient_history?.patient_id
              ? patientMap.get(order.patient_history.patient_id)
              : undefined);
          const orderItems =
            orderItemsMap.get(order.lab_order_id) || order.lab_order_item || [];

          // Test names summary
          const testNames =
            orderItems.length > 0
              ? orderItems
                  .map(
                    (oi) =>
                      oi.lab_test_master?.test_name ||
                      oi.lab_test_master?.test_code ||
                      oi.lab_test_id
                  )
                  .filter(Boolean)
                  .join(", ")
              : order.provisional_diagnosis || "General Lab Panel";

          // Format order date & time
          const dateObj =
            order.order_datetime || order.created_at
              ? new Date(order.order_datetime || order.created_at!)
              : new Date();

          const formattedDate = dateObj.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "2-digit",
            year: "2-digit",
          });

          const formattedTime = dateObj.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          });

          const formattedReqTime =
            dateObj.toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            }) +
            " " +
            formattedTime;

          // Doctor name
          const doctorName = order.employees
            ? `Dr. ${[order.employees.first_name, order.employees.last_name]
                .filter(Boolean)
                .join(" ")}`
            : "Dr. Senthil R";

          // Patient name
          const pName = patient
            ? [
                patient.patient_first_name,
                patient.patient_middle_name,
                patient.patient_last_name,
              ]
                .filter(Boolean)
                .join(" ")
            : pId || "Patient";

          // Status: if backend says Completed -> COMPLETED, else PROCESSING
          const isCompleted =
            order.order_status?.toUpperCase() === "COMPLETED";

          // Structured tests for alignment & barcode steps
          const structuredItems: TestItemDetail[] =
            orderItems.length > 0
              ? orderItems.map((oi) => {
                  const sampleBarcode =
                    oi.sample_collection?.[0]?.barcode ||
                    (oi.remarks?.startsWith("Barcode: ")
                      ? oi.remarks.replace("Barcode: ", "")
                      : undefined) ||
                    (typeof window !== "undefined"
                      ? localStorage.getItem(`generated_barcode_item_${oi.lab_order_item_id}`) || undefined
                      : undefined);

                  const formattedTargetDate = formatTargetDate(oi.target_date);

                  return {
                    id: oi.lab_order_item_id || oi.lab_test_id,
                    testCode:
                      oi.lab_test_master?.test_code ||
                      oi.lab_test_id.replace(/^LABTEST/, "T") ||
                      "TEST",
                    testName:
                      oi.lab_test_master?.test_name || "Diagnostic Test",
                    sampleType:
                      oi.lab_test_master?.sample_type || "Whole Blood",
                    priority: oi.priority || order.priority || "Normal",
                    barcode: sampleBarcode,
                    targetDate: formattedTargetDate,
                    deadlineDate: formattedTargetDate,
                  };
                })
              : [
                  {
                    id: "cbc",
                    testCode: "CBC",
                    testName: "Complete Blood Count",
                    sampleType: "Whole Blood",
                    priority: order.priority || "Normal",
                    targetDate: "—",
                    deadlineDate: "—",
                  },
                ];

          const itemTargetDates = Array.from(
            new Set(
              orderItems
                .map((oi) => (oi.target_date ? formatTargetDate(oi.target_date) : null))
                .filter((d): d is string => Boolean(d && d !== "—"))
            )
          );
          const orderTargetDate =
            itemTargetDates.length > 0 ? itemTargetDates.join(", ") : "—";

          const isBarcodeGenerated =
            structuredItems.some((it) => !!it.barcode) ||
            orderItems.some(
              (oi) =>
                oi.item_status === "Barcode Generated" ||
                oi.item_status === "Collected" ||
                (oi.sample_collection && oi.sample_collection.length > 0)
            ) ||
            (typeof window !== "undefined" &&
              !!localStorage.getItem(`generated_barcode_${order.lab_order_id}`));

          // Check if sample has been collected from patient
          const storedColTime =
            typeof window !== "undefined"
              ? localStorage.getItem(`collected_sample_time_${order.lab_order_id}`) ||
                localStorage.getItem(`registered_sample_time_${order.lab_order_id}`)
              : null;
          const hasDbCollection = orderItems.some(
            (oi) =>
              (oi.sample_collection && oi.sample_collection.length > 0) ||
              oi.item_status === "Collected" ||
              oi.item_status === "Barcode Generated"
          );
          const isCollected = Boolean(hasDbCollection || storedColTime || (isBarcodeGenerated && structuredItems.some(it => it.barcode)));

          const colDateTime = isCollected
            ? orderItems.find((oi) => oi.sample_collection?.[0]?.collection_datetime)
                ?.sample_collection?.[0]?.collection_datetime ||
              storedColTime ||
              orderItems.find((oi) => oi.sample_collection?.[0]?.created_at)
                ?.sample_collection?.[0]?.created_at ||
              order.created_at ||
              order.order_datetime
            : undefined;

          const colDate = colDateTime ? new Date(colDateTime) : null;
          const colPriority = orderItems.find((oi) => oi.priority)?.priority || order.priority || "Normal";
          const firstTest = orderItems[0];
          const stabilityHours = resolveStabilityHours(
            testNames,
            firstTest?.lab_test_master?.sample_type,
            firstTest?.lab_test_master?.tat_hours,
            colPriority
          );

          const firstBarcode =
            structuredItems.find((it) => it.barcode)?.barcode ||
            (isBarcodeGenerated
              ? `BC${order.lab_order_id.replace(/\D/g, "").slice(-6) || "2609"}0001`
              : undefined);

          return {
            id: order.lab_order_id,
            requestId: order.lab_order_id,
            patientId: pId,
            patientName: pName,
            requestedBy: doctorName,
            requestTime: formattedReqTime,
            tests: testNames,
            date: formattedDate,
            time: formattedTime,
            orderDateIso: toIsoDateString(dateObj),
            collectionTimeIso: isCollected && colDate && !isNaN(colDate.getTime()) ? colDate.toISOString() : undefined,
            collectionTime: isCollected && colDate && !isNaN(colDate.getTime()) ? colDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true }) : undefined,
            barcodeGenerated: isCollected,
            isCollected,
            stabilityHours,
            priority: colPriority,
            targetDate: orderTargetDate,
            targetDateIso: itemTargetDates[0] ? normalizeToIsoDate(itemTargetDates[0]) || undefined : undefined,
            status: isCompleted ? "COMPLETED" : "PROCESSING",
            dob: patient?.patient_dob
              ? new Date(patient.patient_dob).toLocaleDateString("en-GB")
              : "15/06/1990",
            gender: patient?.patient_gender || "Male",
            mobile: patient?.patient_primary_mobile || "9876543210",
            email: patient?.patient_email || "patient@example.com",
            address:
              patient?.Patient_address ||
              [
                patient?.patient_area,
                patient?.patient_district,
                patient?.patient_state,
              ]
                .filter(Boolean)
                .join(", ") ||
              "Chennai, Tamil Nadu",
            avatarUrl: patient?.patient_photo_url || undefined,
            testItems: structuredItems,
            barcode: firstBarcode,

          };
        });

        setTestsList(mappedTests);
      }
    } catch (err: any) {
      console.error("Error fetching real lab data:", err);
      setFetchError("Unable to load latest lab orders. Displaying test queue.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRealData();
  }, [fetchRealData]);

  // Selected patient for expanded registration view
  const [selectedPatient, setSelectedPatient] = useState<TestRecord | null>(null);
  const [currentStep, setCurrentStep] = useState<number>(1);

  const location = useLocation();
  useEffect(() => {
    const pId = (location.state as { selectedPatientId?: string } | undefined)?.selectedPatientId;
    if (pId) {
      const match = testsList.find((t) => t.id === pId);
      if (match) {
        setSelectedPatient(match);
        setCurrentStep(1);
      }
    }
  }, [location.state, testsList]);

  // Step 2: Test Alignment selection states
  const [selectedValidTests, setSelectedValidTests] = useState<string[]>([
    "cbc",
    "lft",
    "kft",
  ]);

  // Step 3: Sample Barcode states
  const [sampleBarcodes, setSampleBarcodes] = useState<SampleBarcodeItem[]>(INITIAL_SAMPLES);
  const [printSuccessMessage, setPrintSuccessMessage] = useState<string | null>(null);

  const handleToggleValidTest = (id: string) => {
    setSelectedValidTests((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const handleToggleAllValid = () => {
    const allIds =
      selectedPatient?.testItems && selectedPatient.testItems.length > 0
        ? selectedPatient.testItems.map((ti) => ti.id)
        : ["cbc", "lft", "kft"];

    if (selectedValidTests.length === allIds.length) {
      setSelectedValidTests([]);
    } else {
      setSelectedValidTests(allIds);
    }
  };

  const handleIncrementBarcodeCount = (id: string) => {
    setSampleBarcodes((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, count: item.count + 1 } : item
      )
    );
  };

  const handleDecrementBarcodeCount = (id: string) => {
    setSampleBarcodes((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, count: Math.max(1, item.count - 1) } : item
      )
    );
  };

  const handlePrintSingleBarcode = (item: SampleBarcodeItem) => {
    setPrintSuccessMessage(`Barcode label ${item.barcode} for ${item.testCode} sent to printer!`);
    setTimeout(() => setPrintSuccessMessage(null), 3500);
  };

  const handlePrintAllBarcodes = () => {
    setPrintSuccessMessage(`All ${sampleBarcodes.length} sample barcode labels sent to printer!`);
    setTimeout(() => setPrintSuccessMessage(null), 3500);
  };

  const handleCompleteAndSave = async () => {
    if (selectedPatient) {
      const orderId = selectedPatient.id;
      const primaryBarcode = sampleBarcodes[0]?.barcode || `BC${selectedPatient.requestId.replace(/\D/g, "").slice(-6) || "2609"}0001`;
      const nowIso = new Date().toISOString();
      const nowTimeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });

      setTestsList((prev) =>
        prev.map((t) =>
          t.id === orderId
            ? {
                ...t,
                status: "COMPLETED",
                barcode: primaryBarcode,
                barcodeGenerated: true,
                isCollected: true,
                collectionTimeIso: nowIso,
                collectionTime: nowTimeStr,
                testItems: t.testItems?.map((ti, idx) => ({
                  ...ti,
                  barcode: sampleBarcodes[idx]?.barcode || primaryBarcode,
                })),
              }
            : t
        )
      );

      // Save locally
      try {
        localStorage.setItem(`generated_barcode_${orderId}`, "true");
        localStorage.setItem(`registered_sample_time_${orderId}`, nowIso);
        localStorage.setItem(`collected_sample_time_${orderId}`, nowIso);
        sampleBarcodes.forEach((sb) => {
          localStorage.setItem(`generated_barcode_item_${sb.id}`, sb.barcode);
        });
      } catch {}

      // Persist to backend
      try {
        await labOrderApi.update(orderId, { order_status: "Processing" });
      } catch (e) {
        console.warn("Could not persist status to backend API:", e);
      }

      if (sampleBarcodes.length > 0) {
        try {
          const realItems = sampleBarcodes.filter(
            (sb) =>
              !sb.id.startsWith("cbc") &&
              !sb.id.startsWith("lft") &&
              !sb.id.startsWith("kft") &&
              !sb.id.startsWith("LOI_")
          );
          if (realItems.length > 0) {
            await labOrderItemApi.generateBarcode(
              realItems.map((sb) => ({
                lab_order_item_id: sb.id,
                barcode: sb.barcode,
                sample_type: sb.sampleType,
              }))
            );
          }
        } catch (err) {
          console.warn("Could not save barcodes to backend:", err);
        }
      }

      setPrintSuccessMessage(
        `Requisition ${selectedPatient?.requestId} for ${selectedPatient?.patientName} saved! Barcode ${primaryBarcode} generated & sent to Sample Verification.`
      );
      setTimeout(() => setPrintSuccessMessage(null), 4000);
    }
    handleBackToDashboard();
  };

  // Form state for the active patient registration details
  const [patientFormData, setPatientFormData] = useState({
    patientId: "",
    fullName: "",
    dob: "",
    gender: "",
    mobile: "",
    email: "",
    address: "",
  });

  const [imageLoadError, setImageLoadError] = useState<boolean>(false);

  const handleSelectPatient = async (patient: TestRecord) => {
    setImageLoadError(false);
    setSelectedPatient(patient);
    setCurrentStep(1);

    if (patient.testItems && patient.testItems.length > 0) {
      setSelectedValidTests(patient.testItems.map((ti) => ti.id));
      setSampleBarcodes(
        patient.testItems.map((ti, idx) => ({
          id: ti.id,
          testCode: ti.testCode,
          testName: ti.testName,
          sampleType: ti.sampleType,
          barcode: `BC${patient.requestId.replace(/\D/g, "").slice(-6) || "2405"}${String(idx + 1).padStart(4, "0")}`,
          count: 1,
          targetDate: ti.targetDate || ti.deadlineDate,
          deadlineDate: ti.deadlineDate,
        }))
      );
    } else {
      setSelectedValidTests(["cbc", "lft", "kft"]);
      setSampleBarcodes(INITIAL_SAMPLES);
    }

    setPrintSuccessMessage(null);
    setPatientFormData({
      patientId: patient.patientId,
      fullName: patient.patientName,
      dob: patient.dob,
      gender: patient.gender,
      mobile: patient.mobile,
      email: patient.email,
      address: patient.address,
    });

    // Actively fetch real patient details and photo from backend
    if (patient.patientId) {
      try {
        const res = await patientApi.getById(patient.patientId);
        const data = (res?.data as any)?.data || res?.data;
        if (data) {
          const photoUrl = data.patient_photo_url || (data as any).photo || null;
          if (photoUrl) {
            setSelectedPatient((prev) => (prev ? { ...prev, avatarUrl: photoUrl } : null));
          }
          const realName = [data.patient_first_name, data.patient_middle_name, data.patient_last_name]
            .filter(Boolean)
            .join(" ");
          setPatientFormData((prev) => ({
            ...prev,
            fullName: realName || prev.fullName,
            dob: data.patient_dob ? new Date(data.patient_dob).toLocaleDateString("en-GB") : prev.dob,
            gender: data.patient_gender || prev.gender,
            mobile: data.patient_primary_mobile || prev.mobile,
            email: data.patient_email || prev.email,
            address:
              data.current_address ||
              data.Patient_address ||
              [data.patient_area, data.patient_district, data.patient_state].filter(Boolean).join(", ") ||
              prev.address,
          }));
        }
      } catch {
        // Keep current data if not found by custom ID
      }
    }
  };

  const handleBackToDashboard = () => {
    setSelectedPatient(null);
    setCurrentStep(1);
    setSelectedValidTests(["cbc", "lft", "kft"]);
    setSampleBarcodes(INITIAL_SAMPLES);
    setPrintSuccessMessage(null);
  };

  const sampleStabilityMap = useMemo(() => {
    const map = new Map<string, SampleStabilityInfo>();
    testsList.forEach((t) => {
      const isCol = Boolean(t.isCollected || (t.barcodeGenerated && t.collectionTimeIso));
      const info = calculateSampleStability(
        t.collectionTimeIso,
        t.stabilityHours || 2,
        t.status,
        currentTime,
        isCol
      );
      map.set(t.id, info);
    });
    return map;
  }, [testsList, currentTime]);

  const expiringSoonCount = useMemo(() => {
    return testsList.filter((t) => {
      if (t.status === "COMPLETED") return false;
      const info = sampleStabilityMap.get(t.id);
      return info?.isExpiringSoon;
    }).length;
  }, [testsList, sampleStabilityMap]);

  const expiredStabilityCount = useMemo(() => {
    return testsList.filter((t) => {
      if (t.status === "COMPLETED") return false;
      const info = sampleStabilityMap.get(t.id);
      return info?.isExpired;
    }).length;
  }, [testsList, sampleStabilityMap]);

  const filteredTests = useMemo(() => {
    const list = testsList.filter((test) => {
      const matchesSearch =
        searchQuery.trim() === "" ||
        test.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        test.requestId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        test.requestedBy.toLowerCase().includes(searchQuery.toLowerCase()) ||
        test.tests.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === "ALL" || test.status === statusFilter;

      const info = sampleStabilityMap.get(test.id);
      const matchesPriority =
        priorityFilter === "ALL"
          ? true
          : priorityFilter === "DUE_SOON"
          ? (info?.isExpiringSoon || false)
          : priorityFilter === "EXPIRED"
          ? (info?.isExpired || false)
          : true;

      return matchesSearch && matchesStatus && matchesPriority;
    });

    return [...list].sort((a, b) => {
      const isOverdueA = isTestOverdue(a) ? 1 : 0;
      const isOverdueB = isTestOverdue(b) ? 1 : 0;
      if (isOverdueA !== isOverdueB) return isOverdueB - isOverdueA;
      return (b.id || "").localeCompare(a.id || "");
    });
  }, [testsList, searchQuery, statusFilter, priorityFilter]);

  const completedCount = useMemo(() => {
    return testsList.filter((t) => t.status === "COMPLETED").length;
  }, [testsList]);

  const pendingCount = useMemo(() => {
    return testsList.filter((t) => t.status === "PROCESSING").length;
  }, [testsList]);

  const overdueCount = useMemo(() => {
    return testsList.filter((t) => isTestOverdue(t)).length;
  }, [testsList]);

  const repeatCount = useMemo(() => {
    return Math.max(0, Math.floor(testsList.length * 0.05));
  }, [testsList]);

  /* ---------- KPI Cards configuration (Admin Dashboard style) ---------- */
  const kpiCards = useMemo(
    () => [
      {
        id: "total-requests",
        label: "Total Requests",
        subLabel: "Accession order queue",
        value: testsList.length,
        tag: "Total",
        bg: "#D6E3FF",
        valueColor: "#00488D",
        iconBg: "rgba(255, 255, 255, 0.40)",
        icon: <FileText className="w-[17px] h-[17px]" color="#00488D" />,
        isActive: statusFilter === "ALL",
        onClick: () => setStatusFilter("ALL"),
      },
      {
        id: "sample-registered",
        label: "Sample Registered",
        subLabel: "Accessioned & barcoded",
        value: completedCount,
        tag: `${testsList.length > 0 ? Math.round((completedCount / testsList.length) * 100) : 0}%`,
        bg: "rgba(0, 200, 150, 0.12)",
        valueColor: "#00A87E",
        iconBg: "rgba(255, 255, 255, 0.40)",
        icon: <CheckCircle2 className="w-[17px] h-[17px]" color="#00A87E" />,
        isActive: statusFilter === "COMPLETED",
        onClick: () => setStatusFilter((prev) => (prev === "COMPLETED" ? "ALL" : "COMPLETED")),
      },
      {
        id: "registration-pending",
        label: "Registration Pending",
        subLabel: "Awaiting sample registration",
        value: pendingCount,
        tag: "Pending",
        bg: "rgba(255, 107, 53, 0.12)",
        valueColor: "#7B3200",
        iconBg: "#FFDBCB",
        icon: <Clock className="w-[17px] h-[17px]" color="#7B3200" />,
        isActive: statusFilter === "PROCESSING",
        onClick: () => setStatusFilter((prev) => (prev === "PROCESSING" ? "ALL" : "PROCESSING")),
      },
    ],
    [testsList.length, completedCount, pendingCount, statusFilter]
  );

  return (
    <div className="min-h-screen flex bg-[#f8fafd] text-[#1e293b] antialiased selection:bg-blue-100 font-sans">
      {/* Global Lab Navigation Sidebar */}
      <LabNav
        activeTab="Sample Registration"
        onTabChange={(tab) => {
          if (tab === "Sample Registration") {
            handleBackToDashboard();
          }
        }}
      />

      {/* Main Content Area */}
      <div className="flex-1 ml-64 min-h-screen flex flex-col min-w-0 bg-white">
        {/* =========================================================================
            VIEW 1: PATIENT REGISTRATION (When a patient row is selected / expanded)
            ========================================================================= */}
        {selectedPatient ? (
          <div className="flex-1 flex flex-col min-w-0 bg-white">
            {/* TopHeader */}
            <header
              className="w-full border-b border-gray-200 bg-white flex-shrink-0"
              data-purpose="page-header"
            >
              <div className="max-w-7xl mx-auto px-6 lg:px-8 h-20 flex items-center justify-between">
                {/* Title and Back button */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleBackToDashboard}
                    className="p-1.5 -ml-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                    title="Back to Sample Registration"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                  </button>
                  <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                    {currentStep === 1
                      ? "Patient Registration"
                      : currentStep === 2
                      ? "Test Alignment"
                      : "Sample Barcode"}
                  </h1>
                </div>

                {/* User Profile Info & Logout */}
                <div className="flex items-center space-x-3" data-purpose="user-badge">
                  <LabNotificationBell size="md" />
                  <UserProfileDropdown
                    userName={displayName}
                    userSubtext={displayRole}
                    userAvatar={avatarUrl}
                    onLogout={() => setLogoutOpen(true)}
                    profilePath="/lab/profile"
                    hideNotifications
                  />
                </div>
              </div>
            </header>

            {/* StepperWizard */}
            <section
              className="py-4 border-b border-slate-100 bg-white"
              data-purpose="stepper-section"
            >
              <nav aria-label="Progress" className="flex items-center justify-center pt-2 pb-3" data-purpose="stepper">
                <ol className="flex items-center space-x-4 sm:space-x-6 text-sm font-medium">
                  {/* Step 1 */}
                  <li className="flex items-center space-x-2.5">
                    <button
                      type="button"
                      onClick={() => setCurrentStep(1)}
                      className="flex items-center space-x-2.5 focus:outline-none cursor-pointer"
                    >
                      {currentStep > 1 ? (
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#00A86B] text-white shadow-sm">
                          <svg className="w-4 h-4 stroke-white stroke-[2.5]" fill="none" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </span>
                      ) : (
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0B57D0] text-white text-xs font-bold shadow-sm">
                          1
                        </span>
                      )}
                      <span className="text-sm font-medium text-slate-900 whitespace-nowrap">
                        Patient Details
                      </span>
                    </button>
                  </li>

                  {/* Connector Line 1 */}
                  <li className={`w-20 sm:w-32 md:w-36 h-[2px] transition-colors ${currentStep > 1 ? "bg-[#00A86B]" : "bg-slate-200"}`} />

                  {/* Step 2 */}
                  <li className="flex items-center space-x-2.5">
                    <button
                      type="button"
                      onClick={() => setCurrentStep(2)}
                      className="flex items-center space-x-2.5 focus:outline-none cursor-pointer"
                    >
                      {currentStep > 2 ? (
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#00A86B] text-white shadow-sm">
                          <svg className="w-4 h-4 stroke-white stroke-[2.5]" fill="none" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </span>
                      ) : currentStep === 2 ? (
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0B57D0] text-white text-xs font-bold shadow-sm">
                          2
                        </span>
                      ) : (
                        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 text-xs font-semibold">
                          2
                        </span>
                      )}
                      <span className={`text-sm whitespace-nowrap ${currentStep === 2 ? "text-slate-900 font-bold" : currentStep > 2 ? "text-slate-900 font-medium" : "text-slate-400 font-normal"}`}>
                        Test Alignment
                      </span>
                    </button>
                  </li>

                  {/* Connector Line 2 */}
                  <li className="w-20 sm:w-32 md:w-36 h-[2px] bg-slate-200" />

                  {/* Step 3 */}
                  <li className="flex items-center space-x-2.5">
                    <button
                      type="button"
                      onClick={() => setCurrentStep(3)}
                      className="flex items-center space-x-2.5 focus:outline-none cursor-pointer"
                    >
                      {currentStep === 3 ? (
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0B57D0] text-white text-sm font-semibold shadow-sm">
                          3
                        </span>
                      ) : (
                        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 text-xs font-semibold">
                          3
                        </span>
                      )}
                      <span className={`text-sm whitespace-nowrap ${currentStep === 3 ? "text-[#0B57D0] font-medium" : "text-slate-400 font-normal"}`}>
                        Sample Barcode
                      </span>
                    </button>
                  </li>
                </ol>
              </nav>
            </section>

            {/* PageContent */}
            <main
              className="flex-1 bg-white py-8 px-6 lg:px-8 overflow-y-auto"
              data-purpose="main-registration-content"
            >
              <div className={currentStep === 1 ? "max-w-[820px] mx-auto space-y-4" : "max-w-7xl w-full mx-auto pb-16 space-y-8"}>
                {/* STEP 1: Patient Details */}
                {currentStep === 1 && (
                  <>
                    {/* Registration Form Card */}
                    <div
                      className="bg-white rounded-xl border border-slate-200 shadow-sm p-8"
                      data-purpose="registration-card"
                    >
                      {/* Request Information Header & Grid */}
                      <section
                        className="pb-6 border-b border-slate-200"
                        data-purpose="request-information-section"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="text-xs font-bold text-slate-900 tracking-wider uppercase mb-5">
                              REQUEST INFORMATION
                            </h3>
                            <div className="grid grid-cols-3 gap-8 text-sm">
                              <div>
                                <p className="text-xs text-slate-500 font-normal mb-1">
                                  Request ID
                                </p>
                                <p className="text-slate-900 font-bold text-sm tracking-tight">
                                  {selectedPatient.requestId}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-slate-500 font-normal mb-1">
                                  Requested By
                                </p>
                                <p className="text-slate-900 font-bold text-sm tracking-tight">
                                  {selectedPatient.requestedBy}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-slate-500 font-normal mb-1">
                                  Request Time
                                </p>
                                <p className="text-slate-900 font-bold text-sm tracking-tight">
                                  {selectedPatient.requestTime}
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Patient Portrait Thumbnail */}
                          <div className="flex-shrink-0 ml-4">
                            {selectedPatient.avatarUrl && !imageLoadError ? (
                              <img
                                alt={selectedPatient.patientName}
                                className="w-16 h-16 rounded-full object-cover ring-2 ring-[#0b57d0]/20 shadow-sm"
                                src={selectedPatient.avatarUrl}
                                onError={() => setImageLoadError(true)}
                              />
                            ) : (
                              <div
                                className="w-16 h-16 rounded-full bg-[#E8F0FE] text-[#00488D] border border-blue-200/60 ring-2 ring-[#0b57d0]/20 shadow-sm flex items-center justify-center font-bold text-xl select-none"
                                title={selectedPatient.patientName}
                              >
                                {getPatientInitials(selectedPatient.patientName)}
                              </div>
                            )}
                          </div>
                        </div>
                      </section>

                      {/* Patient Information Form */}
                      <section className="pt-6" data-purpose="patient-form-section">
                        <h3 className="text-xs font-bold text-slate-900 tracking-wider uppercase mb-5">
                          PATIENT INFORMATION
                        </h3>
                        <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
                          {/* Row 1: Patient ID & Full Name */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label
                                className="block text-xs font-medium text-slate-600 mb-1.5"
                                htmlFor="patient-id"
                              >
                                Patient ID
                              </label>
                              <input
                                className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg px-3.5 py-2.5 font-medium cursor-not-allowed select-all focus:outline-none"
                                id="patient-id"
                                type="text"
                                readOnly
                                value={patientFormData.patientId}
                              />
                            </div>
                            <div>
                              <label
                                className="block text-xs font-medium text-slate-600 mb-1.5"
                                htmlFor="full-name"
                              >
                                Full Name
                              </label>
                              <input
                                className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg px-3.5 py-2.5 font-medium cursor-not-allowed select-all focus:outline-none"
                                id="full-name"
                                type="text"
                                readOnly
                                value={patientFormData.fullName}
                              />
                            </div>
                          </div>

                          {/* Row 2: Date of Birth & Gender */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label
                                className="block text-xs font-medium text-slate-600 mb-1.5"
                                htmlFor="dob"
                              >
                                Date of Birth
                              </label>
                              <div className="relative">
                                <input
                                  className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg px-3.5 py-2.5 pr-10 font-medium cursor-not-allowed select-all focus:outline-none"
                                  id="dob"
                                  type="text"
                                  readOnly
                                  value={patientFormData.dob}
                                />
                                {/* Calendar Icon */}
                                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                                  <svg
                                    className="w-4 h-4"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    viewBox="0 0 24 24"
                                  >
                                    <rect height="18" rx="2" ry="2" width="18" x="3" y="4" />
                                    <line x1="16" x2="16" y1="2" y2="6" />
                                    <line x1="8" x2="8" y1="2" y2="6" />
                                    <line x1="3" x2="21" y1="10" y2="10" />
                                  </svg>
                                </div>
                              </div>
                            </div>
                            <div>
                              <label
                                className="block text-xs font-medium text-slate-600 mb-1.5"
                                htmlFor="gender"
                              >
                                Gender
                              </label>
                              <input
                                className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg px-3.5 py-2.5 font-medium cursor-not-allowed select-all focus:outline-none"
                                id="gender"
                                type="text"
                                readOnly
                                value={patientFormData.gender}
                              />
                            </div>
                          </div>

                          {/* Row 3: Mobile Number */}
                          <div>
                            <label
                              className="block text-xs font-medium text-slate-600 mb-1.5"
                              htmlFor="mobile-number"
                            >
                              Mobile Number
                            </label>
                            <input
                              className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg px-3.5 py-2.5 font-medium cursor-not-allowed select-all focus:outline-none"
                              id="mobile-number"
                              type="text"
                              readOnly
                              value={patientFormData.mobile}
                            />
                          </div>

                          {/* Row 4: Email */}
                          <div>
                            <label
                              className="block text-xs font-medium text-slate-600 mb-1.5"
                              htmlFor="email"
                            >
                              Email
                            </label>
                            <input
                              className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg px-3.5 py-2.5 font-medium cursor-not-allowed select-all focus:outline-none"
                              id="email"
                              type="email"
                              readOnly
                              value={patientFormData.email}
                            />
                          </div>

                          {/* Row 5: Address */}
                          <div>
                            <label
                              className="block text-xs font-medium text-slate-600 mb-1.5"
                              htmlFor="address"
                            >
                              Address
                            </label>
                            <input
                              className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg px-3.5 py-2.5 font-medium cursor-not-allowed select-all focus:outline-none"
                              id="address"
                              type="text"
                              readOnly
                              value={patientFormData.address}
                            />
                          </div>
                        </form>
                      </section>
                    </div>

                    {/* Action Buttons Container */}
                    <div
                      className="flex items-center justify-between pt-1"
                      data-purpose="form-navigation-actions"
                    >
                      <button
                        onClick={handleBackToDashboard}
                        className="px-7 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-lg shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 flex items-center gap-2"
                        type="button"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        Back
                      </button>
                      <button
                        onClick={() => setCurrentStep(2)}
                        className="px-8 py-2.5 bg-[#0b57d0] hover:bg-[#094bb5] text-white text-sm font-semibold rounded-lg shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center gap-2"
                        type="button"
                      >
                        Next
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                      </button>
                    </div>
                  </>
                )}

                {/* STEP 2: Test Alignment */}
                {currentStep === 2 && (
                  <div className="space-y-9">
                    {/* BEGIN: PatientSummaryCard */}
                    <section
                      className="rounded-2xl bg-[#eff6ff]/70 border border-[#dbeafe] p-7"
                      data-purpose="patient-summary"
                    >
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        {/* Patient ID */}
                        <div>
                          <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                            Patient ID
                          </span>
                          <span className="mt-1.5 block text-xl font-bold text-slate-900">
                            {selectedPatient.patientId}
                          </span>
                        </div>
                        {/* Patient Name */}
                        <div>
                          <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                            Patient Name
                          </span>
                          <span className="mt-1.5 block text-xl font-bold text-slate-900">
                            {selectedPatient.patientName}
                          </span>
                        </div>
                        {/* Age / Gender */}
                        <div>
                          <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                            Age / Gender
                          </span>
                          <span className="mt-1.5 block text-xl font-bold text-slate-900">
                            {calculateAge(selectedPatient.dob)} / {selectedPatient.gender}
                          </span>
                        </div>
                        {/* Request ID */}
                        <div>
                          <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                            Request ID
                          </span>
                          <div className="mt-1.5 flex items-center gap-2">
                            <span className="text-xl font-bold text-slate-900">
                              {selectedPatient.requestId}
                            </span>
                            {selectedPatient && isTargetDateOverdue(selectedPatient.targetDateIso, selectedPatient.targetDate, selectedPatient.status) && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-rose-600 text-white tracking-wide uppercase">
                                OVERDUE
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </section>
                    {/* END: PatientSummaryCard */}

                    {/* BEGIN: ValidTestsSection */}
                    <section className="space-y-3" data-purpose="valid-tests-group">
                      {/* Header & Description */}
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-emerald-600">
                            <svg
                              className="w-6 h-6 fill-none stroke-emerald-600 stroke-[2.2]"
                              viewBox="0 0 24 24"
                            >
                              <circle cx="12" cy="12" r="9.5" />
                              <polyline
                                points="8 12.2 10.8 15 16 9.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </span>
                          <h2 className="text-xl font-bold text-slate-900">
                            Valid Tests to Proceed
                          </h2>
                        </div>
                        <p className="mt-1 text-sm text-slate-500">
                          These tests meet all pre-analytical requirements and are ready for sampling.
                        </p>
                      </div>

                      {/* Valid Tests Table */}
                      <div className="border border-slate-200/90 rounded-xl overflow-hidden bg-white shadow-xs">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-slate-200 bg-[#f8fafc]/80 text-[13px] font-bold text-slate-600 uppercase tracking-wider">
                              <th className="py-4 px-6 w-20" scope="col">
                                <span className="sr-only">Select</span>
                                <input
                                  type="checkbox"
                                  checked={
                                    selectedValidTests.length > 0 &&
                                    selectedValidTests.length ===
                                      (selectedPatient?.testItems?.length || DEFAULT_TEST_ITEMS.length)
                                  }
                                  onChange={handleToggleAllValid}
                                  className="h-5 w-5 rounded bg-[#1d6bf3] border-slate-300 text-[#1d6bf3] focus:ring-0 focus:ring-offset-0 cursor-pointer"
                                />
                              </th>
                              <th className="py-4 px-6" scope="col">
                                Test Name
                              </th>
                              <th className="py-4 px-6" scope="col">
                                Sample Type
                              </th>
                              <th className="py-4 px-6 w-32" scope="col">
                                Priority
                              </th>
                              <th className="py-4 px-6" scope="col">
                                Target Date
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-sm font-normal text-slate-800">
                            {(selectedPatient?.testItems && selectedPatient.testItems.length > 0
                              ? selectedPatient.testItems
                              : DEFAULT_TEST_ITEMS
                            ).map((testItem) => {
                              const isItemOverdue = isTargetDateOverdue(undefined, testItem.targetDate || testItem.deadlineDate, selectedPatient?.status);
                              return (
                                <tr
                                  key={testItem.id}
                                  className={`transition-colors ${
                                    isItemOverdue
                                      ? "bg-rose-50/40 hover:bg-rose-50/70 border-l-4 border-l-rose-500"
                                      : "hover:bg-slate-50/50"
                                  }`}
                                >
                                  <td className="py-4 px-6">
                                    <input
                                      type="checkbox"
                                      checked={selectedValidTests.includes(testItem.id)}
                                      onChange={() => handleToggleValidTest(testItem.id)}
                                      className="h-5 w-5 rounded bg-[#1d6bf3] border-slate-300 text-[#1d6bf3] focus:ring-0 focus:ring-offset-0 cursor-pointer"
                                    />
                                  </td>
                                  <td className="py-4 px-6 font-medium text-slate-800">
                                    <div className="flex items-center gap-2">
                                      <span>{testItem.testName}</span>
                                      {isItemOverdue && (
                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-rose-600 text-white tracking-wide uppercase">
                                          OVERDUE
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-4 px-6 text-slate-700">{testItem.sampleType}</td>
                                  <td className="py-4 px-6 text-slate-700">{testItem.priority}</td>
                                  <td className="py-4 px-6 text-slate-700 font-medium whitespace-nowrap">
                                    {(testItem.targetDate || testItem.deadlineDate) &&
                                    (testItem.targetDate || testItem.deadlineDate) !== "—" ? (
                                      <div className="flex flex-col gap-0.5">
                                        <div className={`flex items-center gap-1.5 ${isItemOverdue ? "text-rose-700 font-bold" : "text-slate-700"}`}>
                                          <svg className={`w-4 h-4 shrink-0 ${isItemOverdue ? "text-rose-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <rect height="18" rx="2" ry="2" width="18" x="3" y="4" strokeWidth="2" />
                                            <line x1="16" x2="16" y1="2" y2="6" strokeWidth="2" />
                                            <line x1="8" x2="8" y1="2" y2="6" strokeWidth="2" />
                                            <line x1="3" x2="21" y1="10" y2="10" strokeWidth="2" />
                                          </svg>
                                          <span>{testItem.targetDate || testItem.deadlineDate}</span>
                                        </div>
                                        {isItemOverdue && (
                                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 w-fit">
                                            Overdue
                                          </span>
                                        )}
                                      </div>
                                    ) : (
                                      "—"
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </section>
                    {/* END: ValidTestsSection */}

                    {/* BEGIN: BottomActionBar */}
                    <footer
                      className="w-full border-t border-slate-200 bg-white pt-6 mt-8"
                      data-purpose="action-footer"
                    >
                      <div className="flex items-center justify-between">
                        {/* Back Button */}
                        <button
                          onClick={() => setCurrentStep(1)}
                          className="px-8 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm font-medium hover:bg-slate-50 active:bg-slate-100 transition-colors shadow-xs cursor-pointer"
                          type="button"
                        >
                          Back
                        </button>
                        {/* Next Button */}
                        <button
                          onClick={() => setCurrentStep(3)}
                          className="px-10 py-2.5 rounded-lg bg-[#1d6bf3] text-white text-sm font-semibold hover:bg-blue-600 active:bg-blue-700 transition-colors shadow-sm cursor-pointer"
                          type="button"
                        >
                          Next
                        </button>
                      </div>
                    </footer>
                    {/* END: BottomActionBar */}
                  </div>
                )}

                {/* STEP 3: Sample Barcode */}
                {currentStep === 3 && (
                  <div className="space-y-8">
                    {/* BEGIN: PatientSummaryCard */}
                    <section
                      className="bg-[#F8FAFC]/50 border border-blue-100/80 rounded-2xl p-6 shadow-sm"
                      data-purpose="patient-summary"
                    >
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        {/* Patient ID */}
                        <div>
                          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
                            Patient ID
                          </p>
                          <p className="text-lg font-bold text-slate-900 tracking-tight">
                            {selectedPatient.patientId}
                          </p>
                        </div>
                        {/* Patient Name */}
                        <div>
                          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
                            Patient Name
                          </p>
                          <p className="text-lg font-bold text-slate-900 tracking-tight">
                            {selectedPatient.patientName}
                          </p>
                        </div>
                        {/* Age / Gender */}
                        <div>
                          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
                            Age / Gender
                          </p>
                          <p className="text-lg font-bold text-slate-900 tracking-tight">
                            {calculateAge(selectedPatient.dob)} / {selectedPatient.gender}
                          </p>
                        </div>
                        {/* Request ID */}
                        <div>
                          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
                            Request ID
                          </p>
                          <p className="text-lg font-bold text-slate-900 tracking-tight">
                            {selectedPatient.requestId}
                          </p>
                        </div>
                      </div>
                    </section>
                    {/* END: PatientSummaryCard */}

                    {/* Print Feedback Notification */}
                    {printSuccessMessage && (
                      <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium flex items-center justify-between shadow-xs">
                        <div className="flex items-center gap-2">
                          <svg className="w-5 h-5 text-emerald-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                          </svg>
                          <span>{printSuccessMessage}</span>
                        </div>
                        <button
                          onClick={() => setPrintSuccessMessage(null)}
                          className="text-emerald-700 hover:text-emerald-900 text-xs font-bold cursor-pointer"
                          type="button"
                        >
                          ✕
                        </button>
                      </div>
                    )}

                    {/* BEGIN: SampleDetailsSection */}
                    <section className="flex-1" data-purpose="sample-details">
                      <h3 className="text-lg font-bold text-slate-900 mb-4">
                        Sample Details
                      </h3>
                      {/* Table Container */}
                      <div className="w-full border-b border-slate-200 overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50/80 border-y border-slate-200/80 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                              <th className="py-3.5 px-6 font-semibold w-1/6">TEST CODE</th>
                              <th className="py-3.5 px-6 font-semibold w-1/4">TEST NAME</th>
                              <th className="py-3.5 px-6 font-semibold w-1/6">SAMPLE TYPE</th>
                              <th className="py-3.5 px-6 font-semibold w-1/5">TARGET DATE</th>
                              <th className="py-3.5 px-6 font-semibold">BARCODE</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-sm">
                            {sampleBarcodes.map((item) => {
                              const isBarcodeOverdue = isTargetDateOverdue(undefined, item.targetDate || item.deadlineDate, selectedPatient?.status);
                              return (
                                <tr
                                  key={item.id}
                                  className={`transition-colors ${
                                    isBarcodeOverdue
                                      ? "bg-rose-50/40 hover:bg-rose-50/70 border-l-4 border-l-rose-500"
                                      : "hover:bg-slate-50/40"
                                  }`}
                                >
                                  <td className="py-4 px-6 font-semibold text-slate-900">
                                    <div className="flex items-center gap-2">
                                      <span>{item.testCode}</span>
                                      {isBarcodeOverdue && (
                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-rose-600 text-white tracking-wide uppercase">
                                          OVERDUE
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-4 px-6 text-slate-600">
                                    {item.testName}
                                  </td>
                                  <td className="py-4 px-6 text-slate-600">
                                    {item.sampleType}
                                  </td>
                                  <td className="py-4 px-6 text-slate-700 font-medium whitespace-nowrap">
                                    {(item.targetDate || item.deadlineDate) && (item.targetDate || item.deadlineDate) !== "—" ? (
                                      <div className="flex flex-col gap-0.5">
                                        <span className={isBarcodeOverdue ? "text-rose-700 font-bold" : "text-slate-700"}>
                                          {item.targetDate || item.deadlineDate}
                                        </span>
                                        {isBarcodeOverdue && (
                                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 w-fit">
                                            Overdue
                                          </span>
                                        )}
                                      </div>
                                    ) : (
                                      "—"
                                    )}
                                  </td>
                                <td className="py-4 px-6">
                                  <div className="flex items-center gap-3">
                                    <input
                                      className="w-48 bg-white border border-slate-300 rounded-md px-3 py-1.5 text-xs text-slate-700 font-mono tracking-tight shadow-sm focus:outline-none"
                                      readOnly
                                      type="text"
                                      value={item.barcode}
                                    />
                                    {/* Action: Minus */}
                                    <button
                                      onClick={() => handleDecrementBarcodeCount(item.id)}
                                      className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer transition-colors"
                                      title="Decrease tubes"
                                      type="button"
                                    >
                                      <svg
                                        className="w-4 h-4"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2.5"
                                        viewBox="0 0 24 24"
                                      >
                                        <line x1="5" x2="19" y1="12" y2="12" />
                                      </svg>
                                    </button>
                                    {/* Action: Print */}
                                    <button
                                      onClick={() => handlePrintSingleBarcode(item)}
                                      className="border border-blue-200 hover:bg-blue-50 text-[#0B57D0] p-1.5 rounded-md shadow-xs transition-colors cursor-pointer"
                                      title={`Print ${item.testCode} label (${item.count} tube${item.count > 1 ? "s" : ""})`}
                                      type="button"
                                    >
                                      <svg
                                        className="w-4 h-4 stroke-current fill-none stroke-2"
                                        viewBox="0 0 24 24"
                                      >
                                        <polyline points="6 9 6 2 18 2 18 9" />
                                        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                                        <rect height="8" width="12" x="6" y="14" />
                                      </svg>
                                    </button>
                                    {/* Action: Plus */}
                                    <button
                                      onClick={() => handleIncrementBarcodeCount(item.id)}
                                      className="text-blue-600 hover:text-blue-700 p-1 cursor-pointer transition-colors"
                                      title="Increase tubes"
                                      type="button"
                                    >
                                      <svg
                                        className="w-4 h-4"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2.5"
                                        viewBox="0 0 24 24"
                                      >
                                        <line x1="12" x2="12" y1="5" y2="19" />
                                        <line x1="5" x2="19" y1="12" y2="12" />
                                      </svg>
                                    </button>
                                    {item.count > 1 && (
                                      <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                                        ×{item.count}
                                      </span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                          </tbody>
                        </table>
                      </div>

                      {/* Print Barcode Button */}
                      <div className="mt-6">
                        <button
                          onClick={handlePrintAllBarcodes}
                          className="inline-flex items-center gap-2.5 px-4 py-2.5 bg-[#0B57D0] hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow-sm transition-all cursor-pointer"
                          type="button"
                        >
                          <svg
                            className="w-4 h-4 stroke-current fill-none stroke-2"
                            viewBox="0 0 24 24"
                          >
                            <path d="M3 5v4m18-4v4M3 19v-4m18 4v-4M7 9v6m4-6v6m4-6v6m2-6v6" />
                          </svg>
                          <span>Print Barcode</span>
                        </button>
                      </div>
                    </section>
                    {/* END: SampleDetailsSection */}

                    {/* BEGIN: BottomNavigationFooter */}
                    <footer
                      className="border-t border-slate-200 pt-6 mt-8 flex items-center justify-between bg-white flex-shrink-0"
                      data-purpose="footer-action-bar"
                    >
                      {/* Back Button */}
                      <button
                        onClick={() => setCurrentStep(2)}
                        className="px-7 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
                        type="button"
                      >
                        Back
                      </button>
                      {/* Complete & Save Button */}
                      <button
                        onClick={handleCompleteAndSave}
                        className="px-7 py-2.5 bg-[#00875A] hover:bg-[#00744E] text-white text-sm font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
                        type="button"
                      >
                        Complete &amp; Save
                      </button>
                    </footer>
                    {/* END: BottomNavigationFooter */}
                  </div>
                )}
              </div>
            </main>
          </div>
        ) : (
          /* =========================================================================
             VIEW 2: LAB TECHNICIAN DASHBOARD (Default view with Metric Cards & Table)
             ========================================================================= */
          <>
            {/* TopNavbar */}
            <header
              className="sticky top-0 z-10 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-8 py-4 flex items-center justify-between"
              data-purpose="dashboard-header"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[#0b4a8b]">
                  <svg className="w-5 h-5 stroke-[2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-900 tracking-tight">Sample Registration</h1>
                  <p className="text-xs text-slate-500">Register patient specimens, manage samples & generate barcodes</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <LabNotificationBell size="md" />
                <UserProfileDropdown
                  userName={displayName}
                  userSubtext={displayRole}
                  userAvatar={avatarUrl}
                  onLogout={() => setLogoutOpen(true)}
                  profilePath="/lab/profile"
                  hideNotifications
                />
              </div>
            </header>

            {/* DashboardBody */}
            <main className="flex-1 p-8 lg:p-10 space-y-8 max-w-[1600px] w-full mx-auto">
              {/* Key Performance Indicators - Admin Dashboard Style Scrollable Track */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between flex-wrap gap-2 px-1">
                  <div>
                    <h2 className="text-base font-bold text-[#1c1e21] tracking-tight">Key Performance Indicators</h2>
                    <p className="text-xs text-[#70747c]">Real-time sample accession & registration metrics</p>
                  </div>
                </div>

                <div className="relative">
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

                  <div
                    className={`absolute left-0 top-0 bottom-2 w-12 pointer-events-none z-[2] transition-opacity duration-200 bg-gradient-to-r from-[#F8FAFC] to-transparent ${
                      canScrollLeft ? "opacity-100" : "opacity-0"
                    }`}
                  />

                  <div
                    ref={trackRef}
                    className="flex gap-[14px] overflow-x-auto scroll-smooth py-[6px] px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  >
                    {kpiCards.map((card) => (
                      <div
                        key={card.id}
                        onClick={card.onClick}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            card.onClick?.();
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
                            <span
                              style={{ color: card.valueColor }}
                              className="text-[11px] font-bold px-[7px] py-[2px] rounded-full tracking-[-0.2px] bg-white/60 shadow-sm inline-flex items-center gap-1"
                            >
                              <span>{card.tag}</span>
                            </span>
                          )}
                        </div>

                        <div
                          style={{ color: card.valueColor }}
                          className="text-[26px] font-extrabold leading-[1.05] tracking-[-0.6px]"
                        >
                          {card.value}
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
                    ))}
                  </div>

                  <div
                    className={`absolute right-0 top-0 bottom-2 w-12 pointer-events-none z-[2] transition-opacity duration-200 bg-gradient-to-l from-[#F8FAFC] to-transparent ${
                      canScrollRight ? "opacity-100" : "opacity-0"
                    }`}
                  />

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

              {/* BEGIN: MainContainer */}
              <section
                className="w-full bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden"
                data-purpose="tests-details-card"
              >
                {/* BEGIN: HeaderSection */}
                <header
                  className="px-8 pt-7 pb-6 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  data-purpose="table-controls"
                >
                  {/* Title */}
                  <h1
                    className="text-2xl font-bold text-slate-800 tracking-tight"
                    data-purpose="page-title"
                  >
                    Sample Registration
                  </h1>
                  {/* Top Right Actions: Search and Filter */}
                  <div
                    className="flex items-center gap-3 w-full md:w-auto"
                    data-purpose="search-and-filter-group"
                  >
                    {/* Search Input Container */}
                    <div
                      className="relative flex-1 md:w-80"
                      data-purpose="search-input-wrapper"
                    >
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                        {/* Search Glass Icon */}
                        <svg
                          className="w-4 h-4 text-slate-600"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          viewBox="0 0 24 24"
                        >
                          <path
                            d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                      <input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-white text-sm text-slate-800 placeholder-slate-400 border border-slate-300 rounded-lg focus:outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500 transition-colors"
                        placeholder="Search Patient / ID"
                        type="text"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery("")}
                          className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>


                    {/* Filter Button */}
                    <div className="relative shrink-0">
                      <button
                        onClick={() => setIsFilterDropdownOpen((prev) => !prev)}
                        className={`inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 border rounded-lg text-sm font-medium transition-colors ${
                          statusFilter !== "ALL"
                            ? "border-blue-500 bg-blue-50 text-blue-700"
                            : "border-slate-300 text-slate-700"
                        }`}
                        data-purpose="filter-trigger"
                        type="button"
                      >
                        {/* Horizontal Sliders Icon */}
                        <svg
                          className="w-4 h-4 text-slate-600"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          viewBox="0 0 24 24"
                        >
                          <path
                            d="M3 6h18M6 12h12M9 18h6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        <span>{statusFilter === "ALL" ? "Filter" : statusFilter}</span>
                      </button>

                      {isFilterDropdownOpen && (
                        <div className="absolute right-0 mt-2 w-44 bg-white border border-slate-200 rounded-xl shadow-lg z-30 py-1.5 text-[13px]">
                          <button
                            type="button"
                            onClick={() => {
                              setStatusFilter("ALL");
                              setIsFilterDropdownOpen(false);
                            }}
                            className={`w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center justify-between ${
                              statusFilter === "ALL"
                                ? "font-semibold text-blue-600 bg-blue-50/50"
                                : "text-slate-700"
                            }`}
                          >
                            <span>All Statuses</span>
                            {statusFilter === "ALL" && <span>✓</span>}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setStatusFilter("PROCESSING");
                              setIsFilterDropdownOpen(false);
                            }}
                            className={`w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center justify-between ${
                              statusFilter === "PROCESSING"
                                ? "font-semibold text-[#715e17] bg-[#faecc5]/30"
                                : "text-slate-700"
                            }`}
                          >
                            <span>Processing</span>
                            {statusFilter === "PROCESSING" && <span>✓</span>}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setStatusFilter("COMPLETED");
                              setIsFilterDropdownOpen(false);
                            }}
                            className={`w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center justify-between ${
                              statusFilter === "COMPLETED"
                                ? "font-semibold text-[#15803d] bg-green-50/50"
                                : "text-slate-700"
                            }`}
                          >
                            <span>Completed</span>
                            {statusFilter === "COMPLETED" && <span>✓</span>}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </header>
                {/* END: HeaderSection */}

                {/* Dashboard Success Message */}
                {printSuccessMessage && (
                  <div className="mx-8 mb-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium flex items-center justify-between shadow-xs">
                    <div className="flex items-center gap-2.5">
                      <svg className="w-5 h-5 text-emerald-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      <span>{printSuccessMessage}</span>
                    </div>
                    <button
                      onClick={() => setPrintSuccessMessage(null)}
                      className="text-emerald-700 hover:text-emerald-900 text-xs font-bold cursor-pointer"
                      type="button"
                    >
                      ✕
                    </button>
                  </div>
                )}



                {/* BEGIN: TableContent */}
                <div
                  className="overflow-x-auto w-full"
                  data-purpose="table-scroll-container"
                >
                  <table
                    className="w-full border-collapse text-left"
                    id="tests-table"
                  >
                    {/* Table Header */}
                    <thead>
                      <tr className="bg-[#f8fafc] border-y border-slate-200/90 text-[13px] font-bold text-slate-600 tracking-wider">
                        <th className="py-5 px-8 font-bold" scope="col">
                          REQUEST ID
                        </th>
                        <th className="py-5 px-6 font-bold" scope="col">
                          PATIENT NAME
                        </th>
                        <th className="py-5 px-6 font-bold" scope="col">
                          REQUESTED BY
                        </th>
                        <th
                          className="py-5 px-6 font-bold leading-tight"
                          scope="col"
                        >
                          DATE
                          <br />
                          &amp; TIME
                        </th>
                        <th className="py-5 px-6 font-bold" scope="col">
                          TARGET DATE
                        </th>
                        <th
                          className="py-5 px-8 font-bold text-center"
                          scope="col"
                        >
                          STATUS
                        </th>
                      </tr>
                    </thead>
                    {/* Table Body Rows */}
                    <tbody className="divide-y divide-slate-100 text-[14px] text-slate-600">
                      {isLoading ? (
                        <tr>
                          <td colSpan={6} className="py-14 text-center text-slate-500">
                            <div className="flex flex-col items-center justify-center gap-3">
                              <div className="w-8 h-8 border-3 border-[#0b57d0] border-t-transparent rounded-full animate-spin"></div>
                              <span className="text-sm font-medium text-slate-600">
                                Fetching lab orders from database...
                              </span>
                            </div>
                          </td>
                        </tr>
                      ) : filteredTests.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="py-10 text-center text-slate-400 text-sm"
                          >
                            No test records found matching your search.
                          </td>
                        </tr>
                      ) : (
                        filteredTests.map((test) => {
                          const isOverdue = isTestOverdue(test);
                          return (
                            <tr
                              key={test.id}
                              onClick={() => handleSelectPatient(test)}
                              className={`transition-colors cursor-pointer ${
                                isOverdue
                                  ? "bg-rose-50/40 hover:bg-rose-50/70 border-l-4 border-l-rose-500"
                                  : "hover:bg-slate-50/60"
                              }`}
                              title={`Click to open registration details for ${test.patientName}`}
                            >
                              <td className="py-5 px-8 font-normal text-slate-600 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-slate-800">{test.requestId}</span>
                                  {isOverdue && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-rose-600 text-white tracking-wide uppercase">
                                      OVERDUE
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-5 px-6 font-bold text-slate-900 whitespace-nowrap">
                                {test.patientName}
                              </td>
                              <td className="py-5 px-6 whitespace-nowrap">
                                {test.requestedBy}
                              </td>
                              <td className="py-5 px-6 leading-snug whitespace-nowrap">
                                {test.date ? (
                                  <>
                                    <div>{test.date}</div>
                                    <div className="text-slate-600">
                                      {test.time}
                                    </div>
                                  </>
                                ) : null}
                              </td>
                              <td className="py-5 px-6 whitespace-nowrap font-semibold">
                                {test.targetDate && test.targetDate !== "—" ? (
                                  <div className="flex flex-col gap-0.5">
                                    <div className={`flex items-center gap-1.5 ${isOverdue ? "text-rose-700 font-bold" : "text-slate-700"}`}>
                                      <Clock className={`w-3.5 h-3.5 shrink-0 ${isOverdue ? "text-rose-600" : "text-slate-400"}`} />
                                      <span>{test.targetDate}</span>
                                    </div>
                                    {isOverdue && (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 w-fit">
                                        Overdue
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-400 font-normal">—</span>
                                )}
                              </td>
                              <td className="py-5 px-8 text-center whitespace-nowrap">
                                {test.status === "PROCESSING" ? (
                                  <span className="inline-block px-4 py-1.5 rounded-full text-xs font-bold tracking-wider bg-[#faecc5] text-[#715e17]">
                                    PROCESSING
                                  </span>
                                ) : (
                                  <span className="inline-block px-4 py-1.5 rounded-full text-xs font-bold tracking-wider bg-[#bbf7d0] text-[#15803d]">
                                    COMPLETED
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                {/* END: TableContent */}
              </section>
            </main>
          </>
        )}
      </div>

      <ConfirmationDialog
        open={logoutOpen}
        type="danger"
        title="Log Out?"
        description="Are you sure you want to log out? Any unsaved changes may be lost."
        confirmText="Log Out"
        cancelText="Stay"
        onConfirm={handleLogout}
        onCancel={() => setLogoutOpen(false)}
      />
    </div>
  );
}
