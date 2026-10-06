import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getUser, remove } from "@/utils/token";
import { toast } from "@/hooks/use-toast";
import LabNav from "./labnav";
import {
  labOrderApi,
  labOrderItemApi,
  LabOrderRecord,
  LabOrderItemRecord,
} from "@/api/labOrder.api";
import { patientApi, PatientRecord } from "@/api/patient.api";
import { LabNotificationBell } from "@/components/hms/LabNotificationBell";
import { UserProfileDropdown } from "@/components/ui/User_profile_dropdown";

function calculateAge(dobString?: string): number {
  if (!dobString) return 30;
  const birthDate = new Date(dobString);
  if (isNaN(birthDate.getTime())) return 30;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age > 0 ? age : 1;
}

function formatSampleDate(dateInput?: string | Date): {
  formattedDate: string;
  formattedTime: string;
  fullString: string;
} {
  const d = dateInput ? new Date(dateInput) : new Date();
  const valid = !isNaN(d.getTime());
  const dateObj = valid ? d : new Date();

  const formattedDate = dateObj.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const formattedTime = dateObj.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  return {
    formattedDate,
    formattedTime,
    fullString: `${formattedDate}, ${formattedTime}`,
  };
}

interface SampleItem {
  id: string;
  sampleId: string;
  collectionId: string;
  collectedOn: string;
  patientId: string;
  patientName: string;
  ageGender: string;
  requisitionNo: string;
  orderedTest: string;
  testCode: string;
  testName: string;
  sampleType: string;
  collectionTime: string;
  technician: string;
  collectionSite: string;
  remarks: string;
  barcode: string;
  status: "VERIFIED" | "PENDING" | "REJECTED";
  rejectionReason?: string;
}

const INITIAL_SAMPLES: SampleItem[] = [
  {
    id: "s1",
    sampleId: "SMP-001",
    collectionId: "COLL-2024-05-20-001",
    collectedOn: "20 May 2024, 10:30 AM",
    barcode: "BC2405200001",
    patientId: "PID123456",
    patientName: "Rahul Sharma",
    ageGender: "34 Y / Male",
    requisitionNo: "REQ123789",
    orderedTest: "Complete Blood Count (CBC)",
    testCode: "CBC001",
    testName: "Complete Blood Count (CBC)",
    sampleType: "Whole Blood",
    collectionTime: "20 May 2024, 10:30 AM",
    technician: "John Doe",
    collectionSite: "Outpatient - OPD",
    remarks: "-",
    status: "PENDING",
  },
  {
    id: "s2",
    sampleId: "SMP-002",
    collectionId: "COLL-2024-05-20-002",
    collectedOn: "20 May 2024, 10:32 AM",
    barcode: "BC2405200002",
    patientId: "PID123456",
    patientName: "Rahul Sharma",
    ageGender: "34 Y / Male",
    requisitionNo: "REQ123789",
    orderedTest: "Liver Function Test (LFT)",
    testCode: "LFT002",
    testName: "Liver Function Test (LFT)",
    sampleType: "Serum (SST)",
    collectionTime: "20 May 2024, 10:32 AM",
    technician: "John Doe",
    collectionSite: "Outpatient - OPD",
    remarks: "-",
    status: "VERIFIED",
  },
  {
    id: "s3",
    sampleId: "SMP-003",
    collectionId: "COLL-2026-03-30-003",
    collectedOn: "30 Mar 2026, 11:30 AM",
    barcode: "BC2405200003",
    patientId: "P000124",
    patientName: "Priya",
    ageGender: "28 Y / Female",
    requisitionNo: "REQ123790",
    orderedTest: "Kidney Function Test (KFT)",
    testCode: "KFT003",
    testName: "Kidney Function Test (KFT)",
    sampleType: "Serum (SST)",
    collectionTime: "30 Mar 2026, 11:30 AM",
    technician: "John Doe",
    collectionSite: "Outpatient - OPD",
    remarks: "Fasting maintained",
    status: "VERIFIED",
  },
  {
    id: "s4",
    sampleId: "SMP-004",
    collectionId: "COLL-2026-04-03-004",
    collectedOn: "03 Apr 2026, 10:45 AM",
    barcode: "BC2405200004",
    patientId: "P000125",
    patientName: "Praveen Singh",
    ageGender: "45 Y / Male",
    requisitionNo: "REQ123791",
    orderedTest: "Lipid Profile",
    testCode: "LIP004",
    testName: "Lipid Profile",
    sampleType: "Serum (SST)",
    collectionTime: "03 Apr 2026, 10:45 AM",
    technician: "John Doe",
    collectionSite: "Inpatient - Ward 3",
    remarks: "12h Fasting confirmed",
    status: "PENDING",
  },
  {
    id: "s5",
    sampleId: "SMP-005",
    collectionId: "COLL-2026-04-05-005",
    collectedOn: "05 Apr 2026, 10:30 AM",
    barcode: "BC2405200005",
    patientId: "P000126",
    patientName: "Naziya",
    ageGender: "31 Y / Female",
    requisitionNo: "REQ123792",
    orderedTest: "Complete Blood Count (CBC)",
    testCode: "CBC001",
    testName: "Complete Blood Count (CBC)",
    sampleType: "Whole Blood (EDTA)",
    collectionTime: "05 Apr 2026, 10:30 AM",
    technician: "John Doe",
    collectionSite: "Emergency - ED",
    remarks: "Hemolyzed specimen",
    status: "REJECTED",
    rejectionReason: "Hemolyzed specimen",
  },
];

export default function SampleVerification() {
  const navigate = useNavigate();
  const currentUser = getUser();
  const displayName = currentUser?.username || "Admin";
  const displayRole =
    currentUser?.role_type === "LAB_TECHNICIAN"
      ? "Lab Technician"
      : currentUser?.role_type || "Admin User";

  const handleLogout = () => {
    remove();
    navigate("/", { replace: true });
  };

  const [activeNav, setActiveNav] = useState("Samples Verification");
  const [samples, setSamples] = useState<SampleItem[]>(INITIAL_SAMPLES);
  const [selectedSample, setSelectedSample] = useState<SampleItem>(INITIAL_SAMPLES[0]);
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [viewMode, setViewMode] = useState<"workflow" | "table">("table");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Patient Info Edit state
  const [isEditingPatient, setIsEditingPatient] = useState(false);
  const [patientEditData, setPatientEditData] = useState({
    patientId: INITIAL_SAMPLES[0].patientId,
    patientName: INITIAL_SAMPLES[0].patientName,
    ageGender: INITIAL_SAMPLES[0].ageGender,
    requisitionNo: INITIAL_SAMPLES[0].requisitionNo,
    orderedTest: INITIAL_SAMPLES[0].orderedTest,
    testCode: INITIAL_SAMPLES[0].testCode,
  });

  // Step 2 Container checklist items (checked by default per design)
  const [containerChecks, setContainerChecks] = useState<boolean[]>([
    true,
    true,
    true,
    true,
    true,
    true,
  ]);
  const toggleContainerCheck = (index: number) => {
    setContainerChecks((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  };

  // Step 4 Transport remarks state
  const [transportRemarks, setTransportRemarks] = useState("");

  // Table search & filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "PENDING" | "VERIFIED" | "REJECTED"
  >("ALL");
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState("");

  // Real backend data fetch
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

      if (items.length > 0) {
        // Patient lookup map by patient_id
        const patientMap = new Map<string, PatientRecord>();
        patients.forEach((p) => {
          if (p.patient_id) patientMap.set(p.patient_id, p);
        });

        // Lab Order lookup map by lab_order_id
        const orderMap = new Map<string, LabOrderRecord>();
        orders.forEach((o) => {
          if (o.lab_order_id) orderMap.set(o.lab_order_id, o);
        });

        // Filter: ONLY specimens that have had barcodes generated in the Lab Dashboard!
        const barcodedItems = items.filter((item) => {
          const hasScBarcode =
            item.sample_collection &&
            item.sample_collection.length > 0 &&
            !!item.sample_collection[0].barcode;
          const hasRemarksBarcode =
            !!item.remarks && (item.remarks.includes("Barcode:") || /BC\d+/i.test(item.remarks));
          const hasStatus = [
            "BARCODE GENERATED",
            "COLLECTED",
            "VERIFIED",
            "REJECTED",
          ].includes((item.item_status || "").toUpperCase());
          const hasLocalSync =
            typeof window !== "undefined" &&
            (!!localStorage.getItem(`generated_barcode_item_${item.lab_order_item_id}`) ||
              !!localStorage.getItem(`generated_barcode_${item.lab_order_id}`));

          return hasScBarcode || hasRemarksBarcode || hasStatus || hasLocalSync || !!item.barcode;
        });

        const mappedSamples: SampleItem[] = barcodedItems.map((item, idx) => {
          const parentOrder = orderMap.get(item.lab_order_id) || item.lab_order;
          const pId =
            parentOrder?.patient_history?.patient_id ||
            parentOrder?.patient_history_id ||
            `PAT00${idx + 1}`;
          const patient = patientMap.get(pId);

          const pName = patient
            ? [
                patient.patient_first_name,
                patient.patient_middle_name,
                patient.patient_last_name,
              ]
                .filter(Boolean)
                .join(" ")
            : `Patient ${pId}`;

          const age = patient?.patient_age || (patient?.patient_dob ? calculateAge(patient.patient_dob) : 32);
          const gender = patient?.patient_gender || "Male";
          const ageGender = `${age} Y / ${gender}`;

          const testName =
            item.lab_test_master?.test_name ||
            item.lab_test_id?.replace(/^LABTEST/, "Test-") ||
            "Diagnostic Test";

          const testCode =
            item.lab_test_master?.test_code ||
            item.lab_test_id?.replace(/^LABTEST/, "T") ||
            "TEST";

          const sampleType =
            item.lab_test_master?.sample_type ||
            item.specimen_type ||
            "Whole Blood (EDTA)";

          const dateObj = item.created_at || parentOrder?.order_datetime;
          const { fullString } = formatSampleDate(dateObj);

          // Barcode & sample identifier
          const dateDigits = item.created_at
            ? new Date(item.created_at).toISOString().slice(2, 10).replace(/-/g, "")
            : "260908";

          const barcodeMatch = item.remarks
            ? item.remarks.match(/Barcode:\s*([A-Za-z0-9_-]+)/i) || item.remarks.match(/(BC\d+)/i)
            : null;

          const resolvedBarcode =
            item.sample_collection?.[0]?.barcode ||
            (barcodeMatch ? barcodeMatch[1] : null) ||
            (typeof window !== "undefined"
              ? localStorage.getItem(`generated_barcode_item_${item.lab_order_item_id}`)
              : null) ||
            item.barcode ||
            `BC${dateDigits}${String(idx + 1).padStart(4, "0")}`;

          const sampleId =
            item.sample_id ||
            `SMP-${item.lab_order_item_id.replace(/^LOI/, "").slice(-4) || String(idx + 1).padStart(3, "0")}`;
          const collectionId = `COLL-${dateDigits}-${String(idx + 1).padStart(3, "0")}`;

          // Status mapping
          const isLocallyVerified =
            typeof window !== "undefined" &&
            (localStorage.getItem(`verified_sample_${item.lab_order_item_id}`) === "true" ||
              (resolvedBarcode && localStorage.getItem(`verified_sample_barcode_${resolvedBarcode}`) === "true"));
          const isLocallyRejected =
            typeof window !== "undefined" &&
            localStorage.getItem(`rejected_sample_${item.lab_order_item_id}`) === "true";

          const rawStatus = (item.item_status || "").toUpperCase();
          let status: "VERIFIED" | "PENDING" | "REJECTED" = "PENDING";
          if (rawStatus === "VERIFIED" || rawStatus === "COMPLETED" || isLocallyVerified) {
            status = "VERIFIED";
          } else if (rawStatus === "REJECTED" || rawStatus === "CANCELLED" || isLocallyRejected) {
            status = "REJECTED";
          }

          const site =
            patient?.patient_type === "IPD"
              ? "Inpatient - Ward"
              : "Outpatient - OPD";

          return {
            id: item.lab_order_item_id,
            sampleId,
            collectionId,
            collectedOn: fullString,
            barcode: resolvedBarcode,
            patientId: pId,
            patientName: pName,
            ageGender,
            requisitionNo: item.lab_order_id,
            orderedTest: testName,
            testCode,
            testName,
            sampleType,
            collectionTime: fullString,
            technician: "Lab Technician",
            collectionSite: site,
            remarks: item.remarks || "-",
            status,
            rejectionReason: status === "REJECTED" ? (item.remarks || "Sample rejected") : undefined,
          };
        });

        if (mappedSamples.length > 0) {
          setSamples(mappedSamples);
          setSelectedSample(mappedSamples[0]);
          setPatientEditData({
            patientId: mappedSamples[0].patientId,
            patientName: mappedSamples[0].patientName,
            ageGender: mappedSamples[0].ageGender,
            requisitionNo: mappedSamples[0].requisitionNo,
            orderedTest: mappedSamples[0].orderedTest,
            testCode: mappedSamples[0].testCode,
          });
        }
      }
    } catch (err: any) {
      console.error("Failed to load real sample data:", err);
      setFetchError(err.message || "Failed to fetch real samples");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRealData();
  }, [fetchRealData]);

  const handleSelectSample = (sample: SampleItem) => {
    setSelectedSample(sample);
    setPatientEditData({
      patientId: sample.patientId,
      patientName: sample.patientName,
      ageGender: sample.ageGender,
      requisitionNo: sample.requisitionNo,
      orderedTest: sample.orderedTest,
      testCode: sample.testCode,
    });
    setTransportRemarks(sample.remarks && sample.remarks !== "-" ? sample.remarks : "");
    setCurrentStep(1);
    setViewMode("workflow");
  };

  const handleSavePatientEdit = (e: React.FormEvent) => {
    e.preventDefault();
    setSelectedSample((prev) => ({
      ...prev,
      ...patientEditData,
      testName: patientEditData.orderedTest,
    }));
    setSamples((prev) =>
      prev.map((s) =>
        s.id === selectedSample.id
          ? {
              ...s,
              ...patientEditData,
              testName: patientEditData.orderedTest,
            }
          : s
      )
    );
    setIsEditingPatient(false);
    toast({
      title: "Patient Details Updated",
      description: "Changes saved to the active sample requisition.",
    });
  };

  const handleVerifySample = async (id: string) => {
    const target = samples.find((s) => s.id === id);
    setSamples((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: "VERIFIED" } : s))
    );
    if (selectedSample.id === id) {
      setSelectedSample((prev) => ({ ...prev, status: "VERIFIED" }));
    }

    try {
      localStorage.setItem(`verified_sample_${id}`, "true");
      if (target?.barcode) {
        localStorage.setItem(`verified_sample_barcode_${target.barcode}`, "true");
      }
      if (target?.sampleId) {
        localStorage.setItem(`verified_sample_sampleid_${target.sampleId}`, "true");
      }

      const verifiedCache: any[] = JSON.parse(
        localStorage.getItem("verified_samples_cache") || "[]"
      );
      const entry = {
        id,
        sampleId: target?.sampleId || id,
        barcode: target?.barcode || "",
        patientId: target?.patientId || "",
        patientName: target?.patientName || "",
        testName: target?.testName || target?.orderedTest || "",
        sampleType: target?.sampleType || "Whole Blood",
        collectionTime: target?.collectionTime || "",
        technician: target?.technician || "Lab Technician",
        status: "VERIFIED",
      };
      const existingIdx = verifiedCache.findIndex(
        (v) => v.id === id || (target?.barcode && v.barcode === target.barcode)
      );
      if (existingIdx >= 0) {
        verifiedCache[existingIdx] = entry;
      } else {
        verifiedCache.push(entry);
      }
      localStorage.setItem("verified_samples_cache", JSON.stringify(verifiedCache));
      localStorage.removeItem(`rejected_sample_${id}`);
    } catch {}

    toast({
      title: "Sample Verified",
      description: "Sample passed pre-analytical integrity check.",
    });

    if (!id.startsWith("s") || id.startsWith("LOI")) {
      try {
        await labOrderItemApi.update(id, { item_status: "Verified" });
      } catch (err) {
        console.error("Failed to update sample status in backend:", err);
      }
    }
  };

  const handleRejectSample = async (id: string) => {
    const reason = prompt("Enter reason for rejection:", "Hemolyzed specimen");
    if (reason) {
      setSamples((prev) =>
        prev.map((s) =>
          s.id === id
            ? { ...s, status: "REJECTED", rejectionReason: reason }
            : s
        )
      );
      if (selectedSample.id === id) {
        setSelectedSample((prev) => ({
          ...prev,
          status: "REJECTED",
          rejectionReason: reason,
        }));
      }

      try {
        localStorage.removeItem(`verified_sample_${id}`);
        localStorage.setItem(`rejected_sample_${id}`, "true");
      } catch {}
      toast({
        title: "Sample Rejected",
        description: `Sample marked for recollection. Reason: ${reason}`,
        variant: "destructive",
      });

      if (!id.startsWith("s") || id.startsWith("LOI")) {
        try {
          await labOrderItemApi.update(id, {
            item_status: "Rejected",
            remarks: reason,
          });
        } catch (err) {
          console.error("Failed to update sample rejection in backend:", err);
        }
      }
    }
  };

  const handleBarcodeScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;
    const match = samples.find(
      (s) =>
        s.barcode.toLowerCase() === barcodeInput.trim().toLowerCase() ||
        s.sampleId.toLowerCase() === barcodeInput.trim().toLowerCase()
    );
    if (match) {
      handleVerifySample(match.id);
      handleSelectSample(match);
      setBarcodeInput("");
    } else {
      toast({
        title: "Barcode Not Found",
        description: `No sample matching "${barcodeInput}" found in queue.`,
        variant: "destructive",
      });
    }
  };

  const filteredSamples = useMemo(() => {
    return samples.filter((sample) => {
      const matchesSearch =
        searchQuery.trim() === "" ||
        sample.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sample.barcode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sample.sampleId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sample.testName.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === "ALL" || sample.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [samples, searchQuery, statusFilter]);

  const verifiedCount = useMemo(
    () => samples.filter((s) => s.status === "VERIFIED").length,
    [samples]
  );
  const pendingCount = useMemo(
    () => samples.filter((s) => s.status === "PENDING").length,
    [samples]
  );
  const rejectedCount = useMemo(
    () => samples.filter((s) => s.status === "REJECTED").length,
    [samples]
  );
  const overdueCount = useMemo(() => {
    const now = new Date().getTime();
    return samples.filter((s) => {
      if (s.status !== "PENDING") return false;
      const t = new Date(s.collectedOn).getTime();
      return isNaN(t) || now - t > 4 * 3600 * 1000;
    }).length;
  }, [samples]);

  return (
    <div className="bg-[#f8fafc] text-slate-800 min-h-screen flex flex-row font-sans selection:bg-blue-100 antialiased">
      {/* Global Lab Navigation Sidebar */}
      <LabNav
        activeTab="Samples Verification"
        onTabChange={(tab) => {
          if (tab === "Samples Verification") {
            setViewMode("table");
          }
        }}
      />

      {/* Main Content Wrapper */}
      <div className="flex-1 ml-64 min-h-screen flex flex-col min-w-0 bg-[#f8fafc]">
        {/* VIEW 1: SAMPLE COLLECTION & VERIFICATION STEPPER WORKFLOW */}
        {viewMode === "workflow" ? (
          <main className="flex-1 px-8 md:px-12 py-8 md:py-10 max-w-7xl w-full">
            {/* Header Section */}
            <header className="mb-8" data-purpose="page-header">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setViewMode("table")}
                    className="inline-flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 transition-colors shadow-xs cursor-pointer"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M10 19l-7-7m0 0l7-7m-7 7h18"
                      />
                    </svg>
                    <span>Back to Table</span>
                  </button>
                  <div>
                    <h2 className="text-3xl font-bold text-slate-900 tracking-tight mb-1">
                      {currentStep === 1
                        ? "Sample Collection"
                        : currentStep === 2
                        ? "Verify Container"
                        : currentStep === 3
                        ? "Verify Labeling"
                        : "Verify Transport"}
                    </h2>
                    <p className="text-base text-slate-500 font-normal">
                      {currentStep === 1
                        ? "Collect sample and start verification process"
                        : currentStep === 2
                        ? "Check if the correct container is used and in good condition"
                        : currentStep === 3
                        ? "Check if the sample is labeled correctly"
                        : "Check if the sample transport conditions are appropriate"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <LabNotificationBell size="md" />
                  <UserProfileDropdown userName={displayName} userSubtext={displayRole} onLogout={handleLogout} profilePath="/lab/profile" hideNotifications />
                </div>
              </div>
            </header>

            {/* BEGIN: StepperSection */}
            <section
              aria-label="Progress Steps"
              className="mb-10 px-4 select-none"
              data-purpose="progress-stepper"
            >
              <div className="flex items-center justify-between max-w-2xl mx-auto">
                {/* Step 1 */}
                <div
                  className="flex flex-col items-center cursor-pointer"
                  onClick={() => setCurrentStep(1)}
                >
                  <div
                    aria-label="Step 1"
                    className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shadow-sm transition-colors ${
                      currentStep > 1
                        ? "bg-emerald-500 text-white"
                        : currentStep === 1
                        ? "bg-blue-600 text-white ring-4 ring-blue-100"
                        : "border border-slate-300 text-slate-400 bg-white font-medium"
                    }`}
                  >
                    {currentStep > 1 ? (
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        viewBox="0 0 24 24"
                      >
                        <path
                          d="M4.5 12.75l6 6 9-13.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      "1"
                    )}
                  </div>
                  <span
                    className={`text-xs mt-2 text-center whitespace-nowrap ${
                      currentStep === 1
                        ? "font-semibold text-blue-600"
                        : currentStep > 1
                        ? "font-medium text-slate-600"
                        : "font-medium text-slate-400"
                    }`}
                  >
                    Sample Collected
                  </span>
                </div>

                {/* Step Line 1 to 2 */}
                <div
                  className={`flex-1 h-[1.5px] mx-3 -mt-6 transition-colors ${
                    currentStep >= 2 ? "bg-[#93c5fd]" : "bg-slate-200"
                  }`}
                />

                {/* Step 2 */}
                <div
                  className="flex flex-col items-center cursor-pointer"
                  onClick={() => setCurrentStep(2)}
                >
                  <div
                    aria-label="Step 2"
                    className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shadow-sm transition-colors ${
                      currentStep > 2
                        ? "bg-[#00a86b] text-white"
                        : currentStep === 2
                        ? "bg-[#1e60d2] text-white ring-4 ring-blue-100"
                        : "border border-slate-300 text-slate-400 bg-white font-medium"
                    }`}
                  >
                    {currentStep > 2 ? (
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        viewBox="0 0 24 24"
                      >
                        <path
                          d="M5 13l4 4L19 7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      "2"
                    )}
                  </div>
                  <span
                    className={`text-xs mt-2 text-center whitespace-nowrap tracking-tight ${
                      currentStep === 2
                        ? "font-bold text-[#1e60d2]"
                        : currentStep > 2
                        ? "font-medium text-slate-600"
                        : "font-medium text-slate-400"
                    }`}
                  >
                    Verify Container
                  </span>
                </div>

                {/* Step Line 2 to 3 */}
                <div
                  className={`flex-1 h-[1.5px] mx-3 -mt-6 transition-colors ${
                    currentStep >= 3 ? "bg-[#93c5fd]" : "bg-slate-200"
                  }`}
                />

                {/* Step 3 */}
                <div
                  className="flex flex-col items-center cursor-pointer"
                  onClick={() => setCurrentStep(3)}
                >
                  <div
                    aria-current={currentStep === 3 ? "step" : undefined}
                    className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shadow-sm transition-colors ${
                      currentStep > 3
                        ? "bg-[#00a86b] text-white"
                        : currentStep === 3
                        ? "bg-[#1e60d2] text-white ring-4 ring-blue-100"
                        : "border border-slate-300 text-slate-400 bg-white font-medium"
                    }`}
                  >
                    {currentStep > 3 ? (
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        viewBox="0 0 24 24"
                      >
                        <path
                          d="M5 13l4 4L19 7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      "3"
                    )}
                  </div>
                  <span
                    className={`text-xs mt-2 text-center whitespace-nowrap tracking-tight ${
                      currentStep === 3
                        ? "font-bold text-[#1e60d2]"
                        : currentStep > 3
                        ? "font-medium text-slate-600"
                        : "font-medium text-slate-400"
                    }`}
                  >
                    Verify Labeling
                  </span>
                </div>

                {/* Step Line 3 to 4 */}
                <div
                  className={`flex-1 h-[1.5px] mx-3 -mt-6 transition-colors ${
                    currentStep >= 4 ? "bg-[#93c5fd]" : "bg-slate-200"
                  }`}
                />

                {/* Step 4 */}
                <div
                  className="flex flex-col items-center cursor-pointer"
                  onClick={() => setCurrentStep(4)}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shadow-sm transition-colors ${
                      selectedSample.status === "VERIFIED"
                        ? "bg-[#00a86b] text-white"
                        : currentStep === 4
                        ? "bg-[#1e60d2] text-white ring-4 ring-blue-100"
                        : "border border-slate-300 text-slate-400 bg-white font-medium"
                    }`}
                  >
                    {selectedSample.status === "VERIFIED" ? (
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        viewBox="0 0 24 24"
                      >
                        <path
                          d="M5 13l4 4L19 7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      "4"
                    )}
                  </div>
                  <span
                    className={`text-xs mt-2 text-center whitespace-nowrap tracking-tight ${
                      currentStep === 4
                        ? "font-bold text-[#1e60d2]"
                        : selectedSample.status === "VERIFIED"
                        ? "font-medium text-slate-600"
                        : "font-medium text-slate-400"
                    }`}
                  >
                    Verify Transport
                  </span>
                </div>
              </div>
            </section>
            {/* END: StepperSection */}

            {/* STEP 1: Sample Collected Details */}
            {currentStep === 1 && (
              <div
                className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start"
                data-purpose="content-grid"
              >
                {/* Left Column */}
                <div className="space-y-6">
                  {/* Card 1: Sample Collected Successfully Banner */}
                  <div
                    className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-sm"
                    data-purpose="success-status-card"
                  >
                    <div className="flex items-start gap-4 mb-6">
                      {/* Green Check Circle Badge */}
                      <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                        <svg
                          className="w-5 h-5 text-emerald-600"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          viewBox="0 0 24 24"
                        >
                          <path
                            d="m4.5 12.75 6 6 9-13.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-slate-900 leading-tight">
                          Sample Collected Successfully
                        </h3>
                        <p className="text-sm text-slate-500 mt-1">
                          You can now proceed with verification
                        </p>
                      </div>
                    </div>
                    {/* Gray Info Strip */}
                    <div className="bg-[#f8fafc] border border-slate-100 rounded-xl p-4 flex flex-wrap gap-8">
                      <div className="min-w-[160px]">
                        <span className="block text-[11px] font-semibold tracking-wider text-slate-400 uppercase mb-1.5">
                          Collection ID
                        </span>
                        <span className="text-sm font-bold text-slate-800 tracking-tight">
                          {selectedSample.collectionId}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[11px] font-semibold tracking-wider text-slate-400 uppercase mb-1.5">
                          Collected On
                        </span>
                        <span className="text-sm font-bold text-slate-800 tracking-tight">
                          {selectedSample.collectedOn}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card 2: Patient Information */}
                  <div
                    className="bg-white border border-slate-200/90 rounded-2xl p-7 shadow-sm"
                    data-purpose="patient-info-card"
                  >
                    <div className="flex items-center justify-between pb-5 border-b border-slate-100 mb-6">
                      <h3 className="text-base font-bold text-slate-900">
                        Patient Information
                      </h3>
                      <button
                        onClick={() => setIsEditingPatient(!isEditingPatient)}
                        className="text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors cursor-pointer"
                        type="button"
                      >
                        {isEditingPatient ? "Cancel" : "Edit"}
                      </button>
                    </div>

                    {isEditingPatient ? (
                      <form onSubmit={handleSavePatientEdit} className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">
                              Patient ID
                            </label>
                            <input
                              type="text"
                              value={patientEditData.patientId}
                              onChange={(e) =>
                                setPatientEditData({
                                  ...patientEditData,
                                  patientId: e.target.value,
                                })
                              }
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">
                              Patient Name
                            </label>
                            <input
                              type="text"
                              value={patientEditData.patientName}
                              onChange={(e) =>
                                setPatientEditData({
                                  ...patientEditData,
                                  patientName: e.target.value,
                                })
                              }
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">
                              Age / Gender
                            </label>
                            <input
                              type="text"
                              value={patientEditData.ageGender}
                              onChange={(e) =>
                                setPatientEditData({
                                  ...patientEditData,
                                  ageGender: e.target.value,
                                })
                              }
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">
                              Requisition No.
                            </label>
                            <input
                              type="text"
                              value={patientEditData.requisitionNo}
                              onChange={(e) =>
                                setPatientEditData({
                                  ...patientEditData,
                                  requisitionNo: e.target.value,
                                })
                              }
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-blue-500"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-semibold text-slate-500 mb-1">
                              Ordered Test
                            </label>
                            <input
                              type="text"
                              value={patientEditData.orderedTest}
                              onChange={(e) =>
                                setPatientEditData({
                                  ...patientEditData,
                                  orderedTest: e.target.value,
                                })
                              }
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-blue-500"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                          <button
                            type="button"
                            onClick={() => setIsEditingPatient(false)}
                            className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold"
                          >
                            Save Changes
                          </button>
                        </div>
                      </form>
                    ) : (
                      /* Key-Value Pairs List */
                      <div className="space-y-4">
                        <div className="grid grid-cols-12 gap-2 text-sm">
                          <span className="col-span-5 text-slate-500">Patient ID</span>
                          <span className="col-span-7 font-bold text-slate-900">
                            {selectedSample.patientId}
                          </span>
                        </div>
                        <div className="grid grid-cols-12 gap-2 text-sm">
                          <span className="col-span-5 text-slate-500">Patient Name</span>
                          <span className="col-span-7 font-bold text-slate-900">
                            {selectedSample.patientName}
                          </span>
                        </div>
                        <div className="grid grid-cols-12 gap-2 text-sm">
                          <span className="col-span-5 text-slate-500">Age / Gender</span>
                          <span className="col-span-7 font-bold text-slate-900">
                            {selectedSample.ageGender}
                          </span>
                        </div>
                        <div className="grid grid-cols-12 gap-2 text-sm">
                          <span className="col-span-5 text-slate-500">Requisition No.</span>
                          <span className="col-span-7 font-bold text-slate-900">
                            {selectedSample.requisitionNo}
                          </span>
                        </div>
                        <div className="grid grid-cols-12 gap-2 text-sm">
                          <span className="col-span-5 text-slate-500">Ordered Test</span>
                          <span className="col-span-7 font-bold text-slate-900">
                            {selectedSample.orderedTest}
                          </span>
                        </div>
                        <div className="grid grid-cols-12 gap-2 text-sm">
                          <span className="col-span-5 text-slate-500">Test Code</span>
                          <span className="col-span-7 font-bold text-slate-900">
                            {selectedSample.testCode}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column */}
                <div className="space-y-6">
                  {/* Card 3: Collection Details */}
                  <div
                    className="bg-white border border-slate-200/90 rounded-2xl p-7 shadow-sm"
                    data-purpose="collection-details-card"
                  >
                    <div className="pb-5 border-b border-slate-100 mb-6">
                      <h3 className="text-base font-bold text-slate-900">
                        Collection Details
                      </h3>
                    </div>
                    {/* Detail Items with Icons */}
                    <div className="space-y-5">
                      {/* Sample Type */}
                      <div className="flex items-center text-sm">
                        <div className="w-7 text-slate-400 shrink-0">
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            viewBox="0 0 24 24"
                          >
                            <path
                              d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                        <span className="w-48 text-slate-500">Sample Type</span>
                        <span className="font-bold text-slate-900">
                          {selectedSample.sampleType}
                        </span>
                      </div>
                      {/* Collection Date & Time */}
                      <div className="flex items-center text-sm">
                        <div className="w-7 text-slate-400 shrink-0">
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            viewBox="0 0 24 24"
                          >
                            <path
                              d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                        <span className="w-48 text-slate-500">
                          Collection Date &amp; Time
                        </span>
                        <span className="font-bold text-slate-900">
                          {selectedSample.collectionTime}
                        </span>
                      </div>
                      {/* Lab Technician */}
                      <div className="flex items-center text-sm">
                        <div className="w-7 text-slate-400 shrink-0">
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            viewBox="0 0 24 24"
                          >
                            <path
                              d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                        <span className="w-48 text-slate-500">Lab Technician</span>
                        <span className="font-bold text-slate-900">
                          {selectedSample.technician}
                        </span>
                      </div>
                      {/* Collection Site */}
                      <div className="flex items-center text-sm">
                        <div className="w-7 text-slate-400 shrink-0">
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            viewBox="0 0 24 24"
                          >
                            <path
                              d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                        <span className="w-48 text-slate-500">Collection Site</span>
                        <span className="font-bold text-slate-900">
                          {selectedSample.collectionSite}
                        </span>
                      </div>
                      {/* Remarks */}
                      <div className="flex items-center text-sm">
                        <div className="w-7 text-slate-400 shrink-0">
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            viewBox="0 0 24 24"
                          >
                            <path
                              d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                        <span className="w-48 text-slate-500">Remarks</span>
                        <span className="font-bold text-slate-900">
                          {selectedSample.remarks}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card 4: Next Step Action Card */}
                  <div
                    className="bg-white border border-slate-200/90 rounded-2xl p-7 shadow-sm"
                    data-purpose="next-step-card"
                  >
                    <h3 className="text-base font-bold text-slate-900 mb-2">
                      Next Step
                    </h3>
                    <p className="text-sm text-slate-500 leading-relaxed mb-6 font-normal">
                      Please verify all details of the sample before sending for
                      testing.
                    </p>
                    {/* Action Button */}
                    <button
                      onClick={() => setCurrentStep(2)}
                      className="w-full bg-[#0052cc] hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-xl transition duration-150 flex items-center justify-center gap-2 group shadow-sm cursor-pointer"
                      type="button"
                    >
                      <span>Start Verification</span>
                      <svg
                        className="w-4 h-4 transition-transform group-hover:translate-x-1"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        viewBox="0 0 24 24"
                      >
                        <path
                          d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: Verify Container */}
            {currentStep === 2 && (
              <div className="space-y-8">
                {/* BEGIN: TwoColumnVerificationCards */}
                <section
                  className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch"
                  data-purpose="verification-panels"
                >
                  {/* BEGIN: ContainerDetailsCard */}
                  <article
                    className="border border-slate-200/90 rounded-2xl p-8 bg-white flex flex-col justify-center transition-all shadow-sm"
                    data-purpose="specimen-display-card"
                  >
                    <div className="flex flex-col sm:flex-row items-center gap-8 lg:gap-10">
                      {/* Tube Illustration / Container Presentation */}
                      <div className="w-64 h-64 sm:w-64 sm:h-64 rounded-xl bg-slate-50 border border-slate-100/80 flex items-center justify-center p-4 relative flex-shrink-0 shadow-inner">
                        {/* Authentic SVG representation of EDTA Lavender Cap Tube */}
                        <svg
                          className="h-56 w-auto drop-shadow-md"
                          fill="none"
                          viewBox="0 0 100 240"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          {/* Defs for realistic gradients */}
                          <defs>
                            {/* Cap Gradient (Lavender / Purple) */}
                            <linearGradient
                              id="purpleCap"
                              x1="0%"
                              x2="100%"
                              y1="0%"
                              y2="0%"
                            >
                              <stop offset="0%" stopColor="#6B21A8" />
                              <stop offset="25%" stopColor="#9333EA" />
                              <stop offset="60%" stopColor="#A855F7" />
                              <stop offset="100%" stopColor="#581C87" />
                            </linearGradient>
                            {/* Tube Glass Gloss */}
                            <linearGradient
                              id="glassGradient"
                              x1="0%"
                              x2="100%"
                              y1="0%"
                              y2="0%"
                            >
                              <stop
                                offset="0%"
                                stopColor="#FFFFFF"
                                stopOpacity="0.8"
                              />
                              <stop
                                offset="15%"
                                stopColor="#F1F5F9"
                                stopOpacity="0.2"
                              />
                              <stop
                                offset="85%"
                                stopColor="#E2E8F0"
                                stopOpacity="0.1"
                              />
                              <stop
                                offset="100%"
                                stopColor="#CBD5E1"
                                stopOpacity="0.7"
                              />
                            </linearGradient>
                            {/* Blood Gradient */}
                            <linearGradient
                              id="bloodGradient"
                              x1="0%"
                              x2="100%"
                              y1="0%"
                              y2="0%"
                            >
                              <stop offset="0%" stopColor="#450A0A" />
                              <stop offset="35%" stopColor="#7F1D1D" />
                              <stop offset="65%" stopColor="#991B1B" />
                              <stop offset="100%" stopColor="#3C0404" />
                            </linearGradient>
                            {/* Shadow beneath tube base */}
                            <radialGradient
                              cx="50%"
                              cy="50%"
                              id="tubeShadow"
                              r="50%"
                            >
                              <stop
                                offset="0%"
                                stopColor="#64748B"
                                stopOpacity="0.35"
                              />
                              <stop
                                offset="100%"
                                stopColor="#64748B"
                                stopOpacity="0"
                              />
                            </radialGradient>
                          </defs>
                          {/* Tube Ground Shadow */}
                          <ellipse
                            cx="50"
                            cy="232"
                            fill="url(#tubeShadow)"
                            rx="22"
                            ry="5"
                          />
                          {/* Outer Glass Tube Body */}
                          <path
                            d="M 33 46 L 33 210 Q 33 226 50 226 Q 67 226 67 210 L 67 46 Z"
                            fill="#F8FAFC"
                            stroke="#CBD5E1"
                            strokeWidth="1.5"
                          />
                          {/* Blood Column Inside (Approx 2.5 mL level) */}
                          <path
                            d="M 33.5 130 L 33.5 210 Q 33.5 225 50 225 Q 66.5 225 66.5 210 L 66.5 130 Z"
                            fill="url(#bloodGradient)"
                          />
                          {/* Blood meniscus line */}
                          <ellipse
                            cx="50"
                            cy="130"
                            fill="#991B1B"
                            rx="16.5"
                            ry="2"
                          />
                          {/* White Specimen Label wrapped around tube */}
                          <rect
                            fill="#FFFFFF"
                            height="96"
                            rx="1"
                            stroke="#E2E8F0"
                            strokeWidth="0.8"
                            width="30"
                            x="34"
                            y="65"
                          />
                          {/* Barcode representation */}
                          <g opacity="0.8" stroke="#334155" strokeWidth="1">
                            <line x1="61" x2="61" y1="72" y2="88" />
                            <line
                              strokeWidth="1.5"
                              x1="61"
                              x2="61"
                              y1="91"
                              y2="102"
                            />
                            <line x1="61" x2="61" y1="105" y2="118" />
                            <line
                              strokeWidth="1.5"
                              x1="61"
                              x2="61"
                              y1="121"
                              y2="135"
                            />
                          </g>
                          {/* Label Text "2.5 mL" Rotated */}
                          <text
                            fill="#0F172A"
                            fontFamily="sans-serif"
                            fontSize="8.5"
                            fontWeight="bold"
                            letterSpacing="0.5"
                            transform="rotate(-90)"
                            x="-124"
                            y="52"
                          >
                            2.5 mL
                          </text>
                          <text
                            fill="#64748B"
                            fontFamily="sans-serif"
                            fontSize="5"
                            transform="rotate(-90)"
                            x="-138"
                            y="44"
                          >
                            EDTA K2
                          </text>
                          {/* Glass Highlight Overlay */}
                          <path
                            d="M 36 50 L 36 210 Q 36 221 44 223 L 44 50 Z"
                            fill="url(#glassGradient)"
                            opacity="0.6"
                          />
                          {/* Purple Stopper / Cap Ribbed Structure */}
                          <rect
                            fill="url(#purpleCap)"
                            height="38"
                            rx="3"
                            stroke="#581C87"
                            strokeWidth="0.8"
                            width="40"
                            x="30"
                            y="8"
                          />
                          {/* Rib texture on cap */}
                          <line
                            opacity="0.6"
                            stroke="#581C87"
                            strokeWidth="1"
                            x1="34"
                            x2="34"
                            y1="12"
                            y2="42"
                          />
                          <line
                            opacity="0.6"
                            stroke="#A855F7"
                            strokeWidth="1"
                            x1="39"
                            x2="39"
                            y1="12"
                            y2="42"
                          />
                          <line
                            opacity="0.6"
                            stroke="#581C87"
                            strokeWidth="1"
                            x1="44"
                            x2="44"
                            y1="12"
                            y2="42"
                          />
                          <line
                            opacity="0.6"
                            stroke="#A855F7"
                            strokeWidth="1"
                            x1="50"
                            x2="50"
                            y1="12"
                            y2="42"
                          />
                          <line
                            opacity="0.6"
                            stroke="#581C87"
                            strokeWidth="1"
                            x1="56"
                            x2="56"
                            y1="12"
                            y2="42"
                          />
                          <line
                            opacity="0.6"
                            stroke="#581C87"
                            strokeWidth="1"
                            x1="61"
                            x2="61"
                            y1="12"
                            y2="42"
                          />
                          <line
                            opacity="0.6"
                            stroke="#A855F7"
                            strokeWidth="1"
                            x1="66"
                            x2="66"
                            y1="12"
                            y2="42"
                          />
                          <ellipse
                            cx="50"
                            cy="8"
                            fill="#A855F7"
                            rx="20"
                            ry="2"
                          />
                        </svg>
                      </div>
                      {/* Measurement & Volume Specifications */}
                      <div className="flex-1 flex flex-col justify-center space-y-5">
                        {/* Required Volume Block */}
                        <div>
                          <span className="block text-xs font-bold tracking-wider text-slate-500 uppercase mb-1">
                            Required Volume
                          </span>
                          <span className="block text-2xl lg:text-3xl font-bold tracking-tight text-slate-900">
                            2.0 - 3.0 mL
                          </span>
                        </div>
                        {/* Collected Volume Block */}
                        <div>
                          <span className="block text-xs font-bold tracking-wider text-slate-500 uppercase mb-1">
                            Collected
                          </span>
                          <span className="block text-2xl lg:text-3xl font-bold tracking-tight text-emerald-500">
                            2.5 mL
                          </span>
                        </div>
                        {/* Subtle Separator */}
                        <hr className="border-t border-slate-100 my-1 w-full" />
                        {/* Guidelines Block */}
                        <div>
                          <h4 className="text-sm font-semibold text-slate-800 mb-2">
                            Volume Guidelines
                          </h4>
                          <ul className="space-y-1.5 text-sm text-slate-600">
                            <li className="flex items-center gap-2.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                              <span>Minimum: 2.0 mL</span>
                            </li>
                            <li className="flex items-center gap-2.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                              <span>Maximum: 3.0 mL</span>
                            </li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </article>
                  {/* END: ContainerDetailsCard */}

                  {/* BEGIN: ContainerChecklistCard */}
                  <article
                    className="border border-slate-200/90 rounded-2xl p-8 bg-white flex flex-col justify-between shadow-sm"
                    data-purpose="criteria-checklist-card"
                  >
                    {/* Checklist Title */}
                    <div className="mb-4">
                      <h3 className="text-xs font-bold tracking-wider text-slate-400 uppercase">
                        Container Checklist
                      </h3>
                    </div>
                    {/* Checklist Items List */}
                    <ul
                      className="divide-y divide-slate-100 flex-1 flex flex-col justify-around py-1"
                      data-purpose="checklist-items"
                    >
                      {/* Item 1: Correct Container Type */}
                      <li
                        className="flex items-center justify-between py-3.5 cursor-pointer select-none"
                        onClick={() => toggleContainerCheck(0)}
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-500">
                            {/* Tube / Container outline icon */}
                            <svg
                              className="w-5 h-5 stroke-[1.75]"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <rect height="18" rx="4" width="10" x="7" y="3" />
                              <line x1="7" x2="17" y1="8" y2="8" />
                              <line x1="7" x2="12" y1="12" y2="12" />
                            </svg>
                          </div>
                          <span className="text-base font-medium text-slate-800">
                            Correct Container Type
                          </span>
                        </div>
                        {/* Check Badge */}
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-white shadow-xs transition-colors ${
                            containerChecks[0]
                              ? "bg-emerald-500"
                              : "bg-slate-200 text-slate-400"
                          }`}
                        >
                          <svg
                            className="w-4 h-4 stroke-[2.75]"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              d="M5 13l4 4L19 7"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                      </li>
                      {/* Item 2: Proper Additive */}
                      <li
                        className="flex items-center justify-between py-3.5 cursor-pointer select-none"
                        onClick={() => toggleContainerCheck(1)}
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-500">
                            {/* Flask / Beaker icon */}
                            <svg
                              className="w-5 h-5 stroke-[1.75]"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </div>
                          <span className="text-base font-medium text-slate-800">
                            Proper Additive
                          </span>
                        </div>
                        {/* Check Badge */}
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-white shadow-xs transition-colors ${
                            containerChecks[1]
                              ? "bg-emerald-500"
                              : "bg-slate-200 text-slate-400"
                          }`}
                        >
                          <svg
                            className="w-4 h-4 stroke-[2.75]"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              d="M5 13l4 4L19 7"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                      </li>
                      {/* Item 3: No Leakage / Damage */}
                      <li
                        className="flex items-center justify-between py-3.5 cursor-pointer select-none"
                        onClick={() => toggleContainerCheck(2)}
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-500">
                            {/* Water Droplet icon */}
                            <svg
                              className="w-5 h-5 stroke-[1.75]"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                d="M19.5 13.5A7.5 7.5 0 1112 4.5c1.6 2.6 7.5 9 7.5 9z"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </div>
                          <span className="text-base font-medium text-slate-800">
                            No Leakage / Damage
                          </span>
                        </div>
                        {/* Check Badge */}
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-white shadow-xs transition-colors ${
                            containerChecks[2]
                              ? "bg-emerald-500"
                              : "bg-slate-200 text-slate-400"
                          }`}
                        >
                          <svg
                            className="w-4 h-4 stroke-[2.75]"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              d="M5 13l4 4L19 7"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                      </li>
                      {/* Item 4: Cap Secure */}
                      <li
                        className="flex items-center justify-between py-3.5 cursor-pointer select-none"
                        onClick={() => toggleContainerCheck(3)}
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-500">
                            {/* Secure Check Shield / Circle icon */}
                            <svg
                              className="w-5 h-5 stroke-[1.75]"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </div>
                          <span className="text-base font-medium text-slate-800">
                            Cap Secure
                          </span>
                        </div>
                        {/* Check Badge */}
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-white shadow-xs transition-colors ${
                            containerChecks[3]
                              ? "bg-emerald-500"
                              : "bg-slate-200 text-slate-400"
                          }`}
                        >
                          <svg
                            className="w-4 h-4 stroke-[2.75]"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              d="M5 13l4 4L19 7"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                      </li>
                      {/* Item 5: Within Expiry Date */}
                      <li
                        className="flex items-center justify-between py-3.5 cursor-pointer select-none"
                        onClick={() => toggleContainerCheck(4)}
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-500">
                            {/* Calendar / QR / Expiry icon */}
                            <svg
                              className="w-5 h-5 stroke-[1.75]"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </div>
                          <span className="text-base font-medium text-slate-800">
                            Within Expiry Date
                          </span>
                        </div>
                        {/* Check Badge */}
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-white shadow-xs transition-colors ${
                            containerChecks[4]
                              ? "bg-emerald-500"
                              : "bg-slate-200 text-slate-400"
                          }`}
                        >
                          <svg
                            className="w-4 h-4 stroke-[2.75]"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              d="M5 13l4 4L19 7"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                      </li>
                    </ul>
                  </article>
                  {/* END: ContainerChecklistCard */}
                </section>
                {/* END: TwoColumnVerificationCards */}

                {/* BEGIN: BottomStickyFooter */}
                <footer
                  className="w-full border-t border-slate-200 bg-white py-5 px-8 rounded-2xl shadow-xs"
                  data-purpose="bottom-action-bar"
                >
                  <div className="w-full flex items-center justify-between">
                    {/* Back Action */}
                    <div>
                      <button
                        className="px-6 py-2.5 rounded-lg border border-slate-300 text-blue-600 font-medium text-base hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 cursor-pointer"
                        type="button"
                        onClick={() => setCurrentStep(1)}
                      >
                        Back
                      </button>
                    </div>
                    {/* Affirmative / Negative Choice Actions */}
                    <div className="flex items-center gap-4">
                      {/* Container is Correct Button */}
                      <button
                        className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-emerald-50 border border-emerald-400 text-emerald-700 font-semibold text-base hover:bg-emerald-100 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer"
                        type="button"
                        onClick={() => {
                          toast({
                            title: "Container Verified",
                            description:
                              "Primary container integrity confirmed. Proceeding to labeling check.",
                          });
                          setCurrentStep(3);
                        }}
                      >
                        <span>Container is Correct</span>
                        <svg
                          className="w-4 h-4 stroke-[2.5]"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            d="M5 13l4 4L19 7"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                      {/* Container is Incorrect Button */}
                      <button
                        className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-600 font-semibold text-base hover:bg-rose-100 transition-colors focus:outline-none focus:ring-2 focus:ring-rose-400 cursor-pointer"
                        type="button"
                        onClick={() => handleRejectSample(selectedSample.id)}
                      >
                        <span>Container is Incorrect</span>
                        <svg
                          className="w-4 h-4 stroke-[2.5]"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            d="M6 18L18 6M6 6l12 12"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                </footer>
                {/* END: BottomStickyFooter */}
              </div>
            )}

            {/* STEP 3: Verify Labeling */}
            {currentStep === 3 && (
              <div className="max-w-4xl w-full mx-auto">
                {/* Card 1: Sample Label Realistic Preview Graphic */}
                <section
                  className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6"
                  data-purpose="sample-label-preview-card"
                >
                  <div className="px-6 py-4 border-b border-slate-100">
                    <h2 className="text-base font-semibold text-slate-800">
                      Sample Label Preview
                    </h2>
                  </div>
                  {/* Interactive Realistic Specimen Tube Container */}
                  <div className="p-8 md:p-14 flex items-center justify-center bg-white min-h-[300px]">
                    {/* Realistic Blood Collection Tube Graphic */}
                    <div
                      className="relative flex items-center select-none max-w-full overflow-x-auto py-4"
                      style={{
                        filter: "drop-shadow(0 18px 24px rgba(15, 23, 42, 0.12))",
                      }}
                    >
                      {/* Rubber Stopper Cap (Lavender / EDTA Tube) */}
                      <div
                        className="relative w-14 h-16 bg-[#7c5295] rounded-l-md flex items-center justify-center border-r border-[#543369] shadow-inner shrink-0"
                        title="Lavender EDTA Stopper"
                      >
                        {/* Ridges Texture on Cap */}
                        <div className="absolute inset-0 flex justify-evenly opacity-35">
                          <div className="w-0.5 h-full bg-slate-900"></div>
                          <div className="w-0.5 h-full bg-white"></div>
                          <div className="w-0.5 h-full bg-slate-900"></div>
                          <div className="w-0.5 h-full bg-white"></div>
                          <div className="w-0.5 h-full bg-slate-900"></div>
                        </div>
                        <div
                          className="absolute inset-0 rounded-l-md pointer-events-none"
                          style={{
                            background:
                              "linear-gradient(180deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0) 40%, rgba(0,0,0,0.25) 100%)",
                          }}
                        ></div>
                      </div>
                      {/* Glass Tube Section with Blood Sample Inside */}
                      <div className="relative h-14 w-80 md:w-96 bg-gradient-to-b from-[#56060c] via-[#7d0b13] to-[#400408] flex items-center rounded-r-full shadow-inner border-y border-r border-slate-300/60 overflow-hidden">
                        {/* Specimen Label Wrap */}
                        <div className="relative z-10 w-[78%] h-[84%] bg-white rounded-[2px] shadow-sm ml-2 px-3 py-1.5 flex items-center justify-between border-l border-slate-200">
                          {/* Label Text Information */}
                          <div className="flex flex-col justify-center text-left">
                            <span className="font-bold text-slate-900 text-xs md:text-sm tracking-wide leading-tight">
                              {selectedSample.patientId || "PID123456"}
                            </span>
                            <span className="text-[11px] md:text-xs text-slate-700 font-medium leading-snug">
                              {selectedSample.patientName || "Rahul Sharma"}
                            </span>
                            <span className="text-[10px] md:text-[11px] text-slate-500 font-normal leading-tight mt-0.5">
                              {selectedSample.collectedOn || "20 May 2024 10:30 AM"}
                            </span>
                          </div>
                          {/* 2D DataMatrix / QR Code Graphic */}
                          <div className="w-10 h-10 shrink-0 bg-white p-0.5 flex items-center justify-center">
                            <svg
                              className="w-full h-full text-slate-900"
                              fill="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path d="M2 2h7v7H2V2zm2 2v3h3V4H4zm11-2h7v7h-7V2zm2 2v3h3V4h-3zM2 15h7v7H2v-7zm2 2v3h3v-3H4zm9-2h2v2h-2v-2zm4 0h2v2h-2v-2zm-4 4h2v2h-2v-2zm4 0h2v2h-2v-2zm2-2h2v2h-2v-2zm-6-4h2v2h-2v-2zm4 0h2v2h-2v-2zm2 4h2v2h-2v-2z"></path>
                            </svg>
                          </div>
                        </div>
                        {/* Exposed Hemispherical Blood Glass Tip at the End */}
                        <div className="flex-1 h-full relative">
                          {/* Specimen Glass Glare Highlight */}
                          <div
                            className="absolute inset-0 pointer-events-none"
                            style={{
                              background:
                                "linear-gradient(180deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0) 40%, rgba(0,0,0,0.25) 100%)",
                            }}
                          ></div>
                          <div className="absolute right-2 top-2.5 w-6 h-1 bg-white/40 rounded-full blur-[1px]"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Card 2: Labeling Checklist Card */}
                <section
                  className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-8"
                  data-purpose="labeling-checklist-card"
                >
                  <div className="px-6 py-4 border-b border-slate-100">
                    <h2 className="text-base font-semibold text-slate-800">
                      Labeling Checklist
                    </h2>
                  </div>
                  {/* Checklist Item Rows */}
                  <div className="divide-y divide-slate-100 px-6">
                    {/* Checklist Item: Patient ID */}
                    <div className="py-3.5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <svg
                          className="w-4 h-4 text-slate-500"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          viewBox="0 0 24 24"
                        >
                          <path
                            d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          ></path>
                        </svg>
                        <span className="text-sm text-slate-600 font-normal">
                          Patient ID
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-semibold text-slate-800">
                          {selectedSample.patientId || "PID123456"}
                        </span>
                        <div className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-300 flex items-center justify-center shadow-xs">
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            viewBox="0 0 24 24"
                          >
                            <path
                              d="M4.5 12.75l6 6 9-13.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            ></path>
                          </svg>
                        </div>
                      </div>
                    </div>

                    {/* Checklist Item: Patient Name */}
                    <div className="py-3.5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <svg
                          className="w-4 h-4 text-slate-500"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          viewBox="0 0 24 24"
                        >
                          <path
                            d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          ></path>
                        </svg>
                        <span className="text-sm text-slate-600 font-normal">
                          Patient Name
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-semibold text-slate-800">
                          {selectedSample.patientName || "Rahul Sharma"}
                        </span>
                        <div className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-300 flex items-center justify-center shadow-xs">
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            viewBox="0 0 24 24"
                          >
                            <path
                              d="M4.5 12.75l6 6 9-13.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            ></path>
                          </svg>
                        </div>
                      </div>
                    </div>

                    {/* Checklist Item: Collection Date & Time */}
                    <div className="py-3.5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <svg
                          className="w-4 h-4 text-slate-500"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          viewBox="0 0 24 24"
                        >
                          <path
                            d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          ></path>
                        </svg>
                        <span className="text-sm text-slate-600 font-normal">
                          Collection Date &amp; Time
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-semibold text-slate-800">
                          {selectedSample.collectedOn || "20 May 2024, 10:30 AM"}
                        </span>
                        <div className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-300 flex items-center justify-center shadow-xs">
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            viewBox="0 0 24 24"
                          >
                            <path
                              d="M4.5 12.75l6 6 9-13.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            ></path>
                          </svg>
                        </div>
                      </div>
                    </div>

                    {/* Checklist Item: Test Name / Code */}
                    <div className="py-3.5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <svg
                          className="w-4 h-4 text-slate-500"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          viewBox="0 0 24 24"
                        >
                          <path
                            d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          ></path>
                        </svg>
                        <span className="text-sm text-slate-600 font-normal">
                          Test Name / Code
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-semibold text-slate-800">
                          {selectedSample.testCode
                            ? `${selectedSample.orderedTest || selectedSample.testName} / ${selectedSample.testCode}`
                            : "CBC / CBC001"}
                        </span>
                        <div className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-300 flex items-center justify-center shadow-xs">
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            viewBox="0 0 24 24"
                          >
                            <path
                              d="M4.5 12.75l6 6 9-13.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            ></path>
                          </svg>
                        </div>
                      </div>
                    </div>

                    {/* Checklist Item: Barcode / QR Code */}
                    <div className="py-3.5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <svg
                          className="w-4 h-4 text-slate-500"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          viewBox="0 0 24 24"
                        >
                          <path
                            d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          ></path>
                          <path
                            d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h3v3h-3v-3zM16.5 16.5h3v3h-3v-3z"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          ></path>
                        </svg>
                        <span className="text-sm text-slate-600 font-normal">
                          Barcode / QR Code
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-semibold text-slate-800">
                          {selectedSample.barcode
                            ? `Present and Scannable (${selectedSample.barcode})`
                            : "Present and Scannable"}
                        </span>
                        <div className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-300 flex items-center justify-center shadow-xs">
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            viewBox="0 0 24 24"
                          >
                            <path
                              d="M4.5 12.75l6 6 9-13.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            ></path>
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                {/* BEGIN: FooterActions */}
                <footer
                  className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 pb-8"
                  data-purpose="form-actions"
                >
                  {/* Back Navigation Button */}
                  <button
                    className="w-full sm:w-auto px-7 py-2.5 rounded-lg border border-slate-200 bg-white text-blue-600 font-semibold text-sm hover:bg-slate-50 transition-colors shadow-xs cursor-pointer"
                    type="button"
                    onClick={() => setCurrentStep(2)}
                  >
                    Back
                  </button>
                  {/* Right Decision Buttons */}
                  <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                    {/* Verification Confirm Button */}
                    <button
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg border border-emerald-500 bg-emerald-50 text-emerald-700 font-semibold text-sm hover:bg-emerald-100 transition-colors shadow-xs cursor-pointer"
                      type="button"
                      onClick={() => {
                        toast({
                          title: "Labeling Verified",
                          description:
                            "Sample labeling and dual patient identifiers verified. Proceeding to transport check.",
                        });
                        setCurrentStep(4);
                      }}
                    >
                      <span>Labelling is Correct</span>
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        viewBox="0 0 24 24"
                      >
                        <path
                          d="M4.5 12.75l6 6 9-13.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        ></path>
                      </svg>
                    </button>
                    {/* Verification Reject Button */}
                    <button
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg border border-rose-300 bg-rose-50 text-rose-600 font-semibold text-sm hover:bg-rose-100 transition-colors shadow-xs cursor-pointer"
                      type="button"
                      onClick={() => handleRejectSample(selectedSample.id)}
                    >
                      <span>Labelling is Incorrect</span>
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        viewBox="0 0 24 24"
                      >
                        <path
                          d="M6 18L18 6M6 6l12 12"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        ></path>
                      </svg>
                    </button>
                  </div>
                </footer>
                {/* END: FooterActions */}
              </div>
            )}

            {/* STEP 4: Verify Transport */}
            {currentStep === 4 && (
              <div className="max-w-4xl w-full mx-auto" data-purpose="primary-flow">
                {/* BEGIN: TransportConditionsCard */}
                <section
                  className="bg-white rounded-2xl border border-slate-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.02)] p-7 mb-8"
                  data-purpose="transport-conditions-overview"
                >
                  <h3 className="text-[17px] font-bold text-slate-900 mb-6">
                    Transport Conditions
                  </h3>
                  {/* Condition List Items */}
                  <div className="flex flex-col space-y-4">
                    {/* Row 1: Temperature */}
                    <div className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 border border-slate-100">
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            viewBox="0 0 24 24"
                          >
                            <path
                              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            ></path>
                          </svg>
                        </div>
                        <span className="text-[15px] text-slate-700 font-medium">
                          Temperature
                        </span>
                      </div>
                      <div className="flex items-center gap-6">
                        <span className="text-[15px] font-bold text-slate-800 tracking-tight">
                          2 - 8 °C
                        </span>
                        <div className="w-6 h-6 rounded-full bg-[#00a86b] text-white flex items-center justify-center shrink-0">
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            viewBox="0 0 24 24"
                          >
                            <path
                              d="M5 13l4 4L19 7"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            ></path>
                          </svg>
                        </div>
                      </div>
                    </div>
                    {/* Row 2: Transport Medium */}
                    <div className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 border border-slate-100">
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            viewBox="0 0 24 24"
                          >
                            <path
                              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            ></path>
                          </svg>
                        </div>
                        <span className="text-[15px] text-slate-700 font-medium">
                          Transport Medium
                        </span>
                      </div>
                      <div className="flex items-center gap-6">
                        <span className="text-[15px] font-bold text-slate-800 tracking-tight">
                          Ice Pack
                        </span>
                        <div className="w-6 h-6 rounded-full bg-[#00a86b] text-white flex items-center justify-center shrink-0">
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            viewBox="0 0 24 24"
                          >
                            <path
                              d="M5 13l4 4L19 7"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            ></path>
                          </svg>
                        </div>
                      </div>
                    </div>
                    {/* Row 3: Container Sealed */}
                    <div className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 border border-slate-100">
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            viewBox="0 0 24 24"
                          >
                            <path
                              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            ></path>
                          </svg>
                        </div>
                        <span className="text-[15px] text-slate-700 font-medium">
                          Container Sealed
                        </span>
                      </div>
                      <div className="flex items-center gap-6">
                        <span className="text-[15px] font-bold text-slate-800 tracking-tight">
                          Yes
                        </span>
                        <div className="w-6 h-6 rounded-full bg-[#00a86b] text-white flex items-center justify-center shrink-0">
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            viewBox="0 0 24 24"
                          >
                            <path
                              d="M5 13l4 4L19 7"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            ></path>
                          </svg>
                        </div>
                      </div>
                    </div>
                    {/* Row 4: Transport Time */}
                    <div className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 border border-slate-100">
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            viewBox="0 0 24 24"
                          >
                            <circle cx="12" cy="12" r="9"></circle>
                            <path
                              d="M12 6v6l4 2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            ></path>
                          </svg>
                        </div>
                        <span className="text-[15px] text-slate-700 font-medium">
                          Transport Time
                        </span>
                      </div>
                      <div className="flex items-center gap-6">
                        <span className="text-[15px] font-bold text-slate-800 tracking-tight">
                          Within Acceptable Limit
                        </span>
                        <div className="w-6 h-6 rounded-full bg-[#00a86b] text-white flex items-center justify-center shrink-0">
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            viewBox="0 0 24 24"
                          >
                            <path
                              d="M5 13l4 4L19 7"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            ></path>
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
                {/* END: TransportConditionsCard */}

                {/* BEGIN: RemarksSection */}
                <section className="mb-10" data-purpose="optional-remarks">
                  <h3 className="text-[16px] font-bold text-slate-900 mb-3">
                    Remarks (Optional)
                  </h3>
                  <textarea
                    value={transportRemarks}
                    onChange={(e) => setTransportRemarks(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder-slate-400 text-sm p-4 resize-none transition-colors outline-none"
                    placeholder="Enter remarks"
                    rows={4}
                  ></textarea>
                </section>
                {/* END: RemarksSection */}

                {/* BEGIN: ActionButtons */}
                <footer
                  className="pt-6 border-t border-slate-200/80 flex items-center justify-between"
                  data-purpose="page-actions"
                >
                  {/* Back Button */}
                  <button
                    className="px-8 py-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[#1e60d2] text-[15px] font-semibold shadow-sm transition-all focus:outline-none cursor-pointer"
                    type="button"
                    onClick={() => setCurrentStep(3)}
                  >
                    Back
                  </button>
                  {/* Decision Action Buttons */}
                  <div className="flex items-center gap-4">
                    {/* Transport is Correct */}
                    <button
                      className="flex items-center gap-2 px-7 py-2.5 rounded-lg bg-[#eafaf1] border border-[#a3e9c6] text-[#00a86b] hover:bg-[#d8f5e5] text-[15px] font-semibold transition-all focus:outline-none cursor-pointer"
                      type="button"
                      onClick={async () => {
                        await handleVerifySample(selectedSample.id);
                        if (transportRemarks.trim()) {
                          setSelectedSample((prev) => ({
                            ...prev,
                            remarks: transportRemarks.trim(),
                          }));
                          setSamples((prev) =>
                            prev.map((s) =>
                              s.id === selectedSample.id
                                ? { ...s, remarks: transportRemarks.trim() }
                                : s
                            )
                          );
                          if (!selectedSample.id.startsWith("s") || selectedSample.id.startsWith("LOI")) {
                            try {
                              await labOrderItemApi.update(selectedSample.id, {
                                item_status: "Verified",
                                remarks: transportRemarks.trim(),
                              });
                            } catch (e) {
                              console.error("Failed to persist transport remarks:", e);
                            }
                          }
                        }
                        toast({
                          title: "Sample Verified Successfully",
                          description: `${selectedSample.sampleId} passed all 4 pre-analytical verification steps.`,
                        });
                        setTimeout(() => {
                          setViewMode("table");
                        }, 1200);
                      }}
                    >
                      <span>Transport is Correct</span>
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        viewBox="0 0 24 24"
                      >
                        <path
                          d="M5 13l4 4L19 7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        ></path>
                      </svg>
                    </button>
                    {/* Transport is Incorrect */}
                    <button
                      className="flex items-center gap-2 px-7 py-2.5 rounded-lg bg-[#fdeeee] border border-[#f8c6c6] text-[#eb3b5a] hover:bg-[#fbdada] text-[15px] font-semibold transition-all focus:outline-none cursor-pointer"
                      type="button"
                      onClick={() => handleRejectSample(selectedSample.id)}
                    >
                      <span>Transport is Incorrect</span>
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        viewBox="0 0 24 24"
                      >
                        <path
                          d="M6 18L18 6M6 6l12 12"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        ></path>
                      </svg>
                    </button>
                  </div>
                </footer>
                {/* END: ActionButtons */}
              </div>
            )}
          </main>
        ) : (
          /* =========================================================================
             VIEW 2: SAMPLES QUEUE TABLE (Standard Table & Metrics View)
             ========================================================================= */
          <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
            <header className="sticky top-0 z-10 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-8 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[#0b4a8b]">
                  <svg className="w-5 h-5 stroke-[2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-900 tracking-tight">Samples Verification</h1>
                  <p className="text-xs text-slate-500">Accessioning, specimen integrity check & barcode matching</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={fetchRealData}
                  disabled={isLoading}
                  className="p-2 rounded-xl border border-slate-200 hover:border-slate-300 bg-white text-slate-600 hover:text-slate-900 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                  title="Refresh"
                >
                  <svg className={`w-4 h-4 ${isLoading ? "animate-spin text-blue-600" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                </button>
                <LabNotificationBell size="md" />
                <UserProfileDropdown userName={displayName} userSubtext={displayRole} onLogout={handleLogout} profilePath="/lab/profile" hideNotifications />
              </div>
            </header>
            <main className="flex-1 p-8 lg:p-10 space-y-8 max-w-[1600px] w-full mx-auto">
            {/* StatCardsRow */}
            <section
              className="grid grid-cols-1 sm:grid-cols-2 gap-4"
              data-purpose="kpi-metric-cards"
            >
              {/* Card 1: Sample Verified */}
              <div className="bg-white rounded-2xl p-5 border border-emerald-200/80 shadow-xs flex items-center justify-between relative overflow-hidden">
                <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-50 rounded-full blur-2xl -mr-5 -mt-5 pointer-events-none" />
                <div className="relative">
                  <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">
                    Sample Verified
                  </span>
                  <h3 className="text-2xl font-extrabold text-emerald-950 mt-1">
                    {verifiedCount}
                  </h3>
                  <p className="text-[11px] text-emerald-600/80 mt-0.5">
                    Samples verified successfully
                  </p>
                </div>
                <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 relative">
                  <svg className="w-5 h-5 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                </div>
              </div>

              {/* Card 2: Sample Verification Pending */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs flex items-center justify-between relative overflow-hidden">
                <div className="absolute top-0 right-0 w-20 h-20 bg-blue-50/50 rounded-full blur-2xl -mr-5 -mt-5 pointer-events-none" />
                <div className="relative">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      Sample Verification Pending
                    </span>
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                  </div>
                  <h3 className="text-2xl font-extrabold text-slate-900 mt-1">
                    {pendingCount}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Samples pending verification
                  </p>
                </div>
                <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 relative">
                  <svg className="w-5 h-5 stroke-[2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                </div>
              </div>
            </section>

            {/* BEGIN: MainContainer */}
            <section
              className="w-full bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden"
              data-purpose="specimens-details-card"
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
                  Samples Verification Details
                </h1>
                {/* Top Right Actions: Search and Filter */}
                <div
                  className="flex flex-wrap items-center gap-3 w-full md:w-auto"
                  data-purpose="search-and-filter-group"
                >
                  {/* Barcode Quick Scan Input */}
                  <form
                    onSubmit={handleBarcodeScan}
                    className="relative flex items-center"
                  >
                    <input
                      type="text"
                      value={barcodeInput}
                      onChange={(e) => setBarcodeInput(e.target.value)}
                      placeholder="Scan / Type Barcode..."
                      className="w-48 pl-3 pr-14 py-2.5 bg-white text-sm font-mono text-slate-800 placeholder-slate-400 border border-slate-300 rounded-lg focus:outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500 transition-colors"
                    />
                    <button
                      type="submit"
                      className="absolute right-1.5 px-3 py-1 bg-[#00875A] hover:bg-[#00744E] text-white text-xs font-semibold rounded-md shadow-2xs transition-colors cursor-pointer"
                    >
                      Verify
                    </button>
                  </form>

                  {/* Search Input Container */}
                  <div
                    className="relative flex-1 md:w-72"
                    data-purpose="search-input-wrapper"
                  >
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
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
                      placeholder="Search Patient, Barcode, Sample..."
                      type="text"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M6 18L18 6M6 6l12 12"
                          />
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
                      <span>
                        {statusFilter === "ALL" ? "Filter" : statusFilter}
                      </span>
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
                            setStatusFilter("PENDING");
                            setIsFilterDropdownOpen(false);
                          }}
                          className={`w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center justify-between ${
                            statusFilter === "PENDING"
                              ? "font-semibold text-[#715e17] bg-[#faecc5]/30"
                              : "text-slate-700"
                          }`}
                        >
                          <span>Pending ({pendingCount})</span>
                          {statusFilter === "PENDING" && <span>✓</span>}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setStatusFilter("VERIFIED");
                            setIsFilterDropdownOpen(false);
                          }}
                          className={`w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center justify-between ${
                            statusFilter === "VERIFIED"
                              ? "font-semibold text-[#15803d] bg-green-50/50"
                              : "text-slate-700"
                          }`}
                        >
                          <span>Verified ({verifiedCount})</span>
                          {statusFilter === "VERIFIED" && <span>✓</span>}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setStatusFilter("REJECTED");
                            setIsFilterDropdownOpen(false);
                          }}
                          className={`w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center justify-between ${
                            statusFilter === "REJECTED"
                              ? "font-semibold text-[#b91c1c] bg-red-50/50"
                              : "text-slate-700"
                          }`}
                        >
                          <span>Rejected ({rejectedCount})</span>
                          {statusFilter === "REJECTED" && <span>✓</span>}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Refresh Button */}
                  <button
                    type="button"
                    onClick={fetchRealData}
                    disabled={isLoading}
                    className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 transition-colors shadow-2xs disabled:opacity-60 cursor-pointer"
                    title="Refresh data from server"
                  >
                    <svg
                      className={`w-4 h-4 text-slate-600 ${isLoading ? "animate-spin" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    <span className="hidden sm:inline">Refresh</span>
                  </button>
                </div>
              </header>
              {/* END: HeaderSection */}

              {/* BEGIN: TableContent */}
              <div
                className="overflow-x-auto w-full"
                data-purpose="table-scroll-container"
              >
                <table
                  className="w-full border-collapse text-left"
                  id="samples-details-table"
                >
                  <thead>
                    <tr className="bg-[#f8fafc] border-y border-slate-200/90 text-[13px] font-bold text-slate-600 tracking-wider">
                      <th className="py-5 px-8 font-bold" scope="col">
                        BARCODE
                      </th>
                      <th className="py-5 px-6 font-bold" scope="col">
                        PATIENT NAME
                      </th>
                      <th className="py-5 px-6 font-bold" scope="col">
                        TEST &amp; SAMPLE TUBE
                      </th>
                      <th
                        className="py-5 px-6 font-bold text-center"
                        scope="col"
                      >
                        COLLECTED TIME
                      </th>
                      <th
                        className="py-5 px-8 font-bold text-center"
                        scope="col"
                      >
                        STATUS
                      </th>
                      <th
                        className="py-5 px-4 font-bold text-center"
                        scope="col"
                      >
                        ACTION
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-[14px] text-slate-600">
                    {isLoading ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="py-16 text-center text-slate-500"
                        >
                          <div className="flex flex-col items-center justify-center gap-3">
                            <svg
                              className="w-7 h-7 text-[#0052cc] animate-spin"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                              />
                              <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8v8H4z"
                              />
                            </svg>
                            <p className="text-sm font-medium text-slate-600">
                              Loading specimen verification queue...
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : filteredSamples.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="py-16 text-center"
                        >
                          {samples.length === 0 ? (
                            <div className="flex flex-col items-center justify-center gap-3.5 max-w-md mx-auto">
                              <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shadow-2xs">
                                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                                </svg>
                              </div>
                              <div>
                                <h4 className="text-base font-bold text-slate-800 mb-1">
                                  No Specimen Barcodes Generated Yet
                                </h4>
                                <p className="text-sm text-slate-500 mb-4 leading-relaxed">
                                  Specimens appear here only after barcode labels have been generated for patients in Sample Registration.
                                </p>
                                <button
                                  type="button"
                                  onClick={() => navigate("/lab/sample-registration")}
                                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0052cc] hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors cursor-pointer"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                  </svg>
                                  <span>Go to Sample Registration to Generate Barcodes</span>
                                </button>
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-sm">
                              No specimen records found matching your search or filter.
                            </span>
                          )}
                        </td>
                      </tr>
                    ) : (
                      filteredSamples.map((s) => (
                        <tr
                          key={s.id}
                          onClick={() => handleSelectSample(s)}
                          className="hover:bg-slate-50/60 transition-colors cursor-pointer group"
                        >
                          <td className="py-5 px-8 whitespace-nowrap">
                            <span className="font-mono text-slate-900 text-sm font-semibold">
                              {s.barcode}
                            </span>
                          </td>
                          <td className="py-5 px-6 whitespace-nowrap">
                            <span className="font-semibold text-slate-900 block group-hover:text-blue-600 transition-colors">
                              {s.patientName}
                            </span>
                            <span className="text-xs text-slate-400 font-mono">
                              {s.patientId}
                            </span>
                          </td>
                          <td className="py-5 px-6 whitespace-nowrap">
                            <span className="font-medium text-slate-800 block">
                              {s.testName}
                            </span>
                            <span className="text-xs text-slate-500">
                              {s.sampleType}
                            </span>
                          </td>
                          <td className="py-5 px-6 text-center text-slate-600 font-normal whitespace-nowrap">
                            {s.collectionTime}
                          </td>
                          <td className="py-5 px-8 text-center whitespace-nowrap">
                            {s.status === "VERIFIED" ? (
                              <span className="inline-block px-4 py-1.5 rounded-full text-xs font-bold tracking-wider bg-[#bbf7d0] text-[#15803d]">
                                VERIFIED
                              </span>
                            ) : s.status === "REJECTED" ? (
                              <span
                                className="inline-block px-4 py-1.5 rounded-full text-xs font-bold tracking-wider bg-[#fee2e2] text-[#991b1b]"
                                title={s.rejectionReason}
                              >
                                REJECTED
                              </span>
                            ) : (
                              <span className="inline-block px-4 py-1.5 rounded-full text-xs font-bold tracking-wider bg-[#faecc5] text-[#715e17]">
                                PENDING
                              </span>
                            )}
                          </td>
                          <td
                            className="py-5 px-4 text-center whitespace-nowrap"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleSelectSample(s)}
                                className="px-3.5 py-1.5 bg-[#0052cc] hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors cursor-pointer inline-flex items-center gap-1.5"
                              >
                                <span>{s.status === "PENDING" ? "Verify Sample" : "View Sample"}</span>
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                                </svg>
                              </button>
                              {s.status === "PENDING" && (
                                <button
                                  type="button"
                                  onClick={() => handleRejectSample(s.id)}
                                  className="px-2.5 py-1.5 bg-white border border-slate-300 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 text-slate-700 text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
                                >
                                  Reject
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {/* END: TableContent */}
            </section>
          </main>
        </div>
      )}
      </div>
    </div>
  );
}

