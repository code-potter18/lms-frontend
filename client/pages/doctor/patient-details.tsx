import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  Droplet,
  Gauge,
  HeartPulse,
  PersonStanding,
  Ruler,
  Thermometer,
  Weight,
} from "lucide-react";
import API from "../../api/axios";
import { patientApi, type PatientRecord } from "../../api/patient.api";
import {
  ALL_BRANCHES_VALUE,
  BranchFilterProvider,
  NO_BRANCH_VALUE,
  useBranchFilter,
} from "../../context/BranchFilterContext";
import { BellNotificationButton } from "@/components/hms/BellNotificationButton";
import {
  type ConsultationState,
  type SummaryPlan,
  type PatientAllergyRecord,
  type PatientDetailTab,
  PATIENT_DETAIL_TABS,
} from "./patient-details/types";
import { useLatestPatientVitals } from "./patient-details/hooks";
import { loadLatestChemoPlan } from "./patient-details/api";
import OrderSummaryTab from "./patient-details/OrderSummaryTab";
import MedicationsTab from "./patient-details/MedicationsTab";
import AdministrationTab from "./patient-details/AdministrationTab";
import DischargeTab from "./patient-details/DischargeTab";
import HistoryTab from "./patient-details/HistoryTab";
import NotesDocumentsTab from "./patient-details/NotesDocumentsTab";

/* ============================================================
   PATIENT DETAILS PAGE
   The fixed part of the page - top bar, patient header card (vitals,
   intent), the allergy / previous cycle alerts and the tab bar - with
   the selected tab's content below it. Each tab lives in its own
   component under ./patient-details/.
   ============================================================ */

function HMSPatientPortal({ onBack }: { onBack?: () => void }) {
  const [activeTab, setActiveTab] = useState<PatientDetailTab>("Order Summary");
  const [selectedCycle] = useState(1);

  const [savedPlan, setSavedPlan] = useState<SummaryPlan | null>(null);
  const [planNotice, setPlanNotice] = useState("");
  const [cycleMedicationsMap, setCycleMedicationsMap] = useState<Record<string, any[]>>({});
  const [patientAllergies, setPatientAllergies] = useState<
    PatientAllergyRecord[]
  >([]);

  const location = useLocation();
  const navigate = useNavigate();
  const consultationState = location.state as ConsultationState | null;
  const searchPatientId = new URLSearchParams(location.search).get('patientId');
  const resolvedPatientId = consultationState?.patientId || searchPatientId || localStorage.getItem('hms_last_patient_id') || '';
  useEffect(() => {
    if (resolvedPatientId) {
      localStorage.setItem('hms_last_patient_id', resolvedPatientId);
      if (!searchPatientId) {
        navigate(`${location.pathname}?patientId=${resolvedPatientId}`, { replace: true });
      }
    }
  }, [resolvedPatientId, searchPatientId, location.pathname, navigate]);
  const { selectedBranchId } = useBranchFilter();

  /* Latest vitals (encounter + chemo merged) for the header strip.
     Re-runs when the branch selection changes so scoped fallbacks and
     the chemo chain pick up the new x-branch-id header. */
  const latestVitals = useLatestPatientVitals(
    resolvedPatientId,
    selectedBranchId
  );
  const { scopeHint } = latestVitals;

  const [patient, setPatient] = useState<PatientRecord | null>(null);

  useEffect(() => {
    const patientId = resolvedPatientId;
    if (!patientId) return;
    let cancelled = false;
    patientApi
      .getById(patientId)
      .then((response) => {
        if (cancelled) return;
        setPatient(response.data.data);
      })
      .catch((error) => {
        console.error("Failed to load patient:", error);
      });
    return () => {
      cancelled = true;
    };
  }, [resolvedPatientId]);

  useEffect(() => {
    const patientId = resolvedPatientId;
    if (!patientId) return;
    let cancelled = false;

    /* Latest plan for THIS selected patient via
       GET /chemotherapy/plans?patient_id=<id> (newest first).
       The branch filter is tried first; when it comes back empty
       (plan was saved under another branch) retry without it.
       Runs for every tab so Medications gets the same data. */
    /* Latest plan for THIS selected patient via the mapping-scoped
       endpoint (GET /plans/latest-for-patient) - works with or without
       a branch selection. Runs for every tab so Medications gets the
       same data. */
    const loadSavedPlan = async () => {
      let loaded: SummaryPlan | null = null;
      try {
        loaded = await loadLatestChemoPlan(patientId);
      } catch {
        loaded = null;
      }

      if (cancelled) return;
      setSavedPlan(loaded);
      setPlanNotice(
        loaded
          ? ""
          : "No chemotherapy plan found for this patient yet. Complete the Treatment Plan step to populate the Order Summary."
      );
    };

    loadSavedPlan();
    return () => {
      cancelled = true;
    };
  }, [resolvedPatientId, activeTab, selectedBranchId]);

  // Pre-fetch doctor-described medications for all cycles
  useEffect(() => {
    if (!savedPlan?.chemotherapy_cycle?.length) {
      setCycleMedicationsMap({});
      return;
    }
    let cancelled = false;
    const fetchAllCycles = async () => {
      const map: Record<string, any[]> = {};
      const cycles = savedPlan.chemotherapy_cycle.filter(c => c?.chemotherapy_cycle_id);
      await Promise.all(
        cycles.map(async (cycle) => {
          try {
            const response = await API.get<{ success: boolean; data: any }>(
              `/chemotherapy/cycles/${encodeURIComponent(cycle.chemotherapy_cycle_id)}`
            );
            if (cancelled) return;
            const items = response.data?.data?.chemotherapy_plan_items ?? response.data?.data?.items ?? response.data?.data?.chemotherapy_plan?.chemotherapy_plan_items ?? [];
            map[cycle.chemotherapy_cycle_id] = items;
          } catch {
            map[cycle.chemotherapy_cycle_id] = [];
          }
        })
      );
      if (!cancelled) setCycleMedicationsMap(map);
    };
    fetchAllCycles();
    return () => { cancelled = true; };
  }, [savedPlan?.chemotherapy_plan_id, selectedBranchId]);

  useEffect(() => {
    const patientId = resolvedPatientId;
    if (!patientId) return;
    let cancelled = false;
    API.get<{ success: boolean; data: PatientAllergyRecord[] }>(
      `/clinical-details/patients/${patientId}/allergies`
    )
      .then((response) => {
        if (!cancelled) {
          setPatientAllergies(response.data?.data ?? []);
        }
      })
      .catch((error) => {
        console.error("Failed to load patient allergies:", error);
      });
    return () => {
      cancelled = true;
    };
  }, [resolvedPatientId]);

  const patientName = patient
    ? [
        patient.patient_first_name,
        patient.patient_middle_name,
        patient.patient_last_name,
      ]
        .filter(Boolean)
        .join(" ")
    : "";

  const patientPhoto = patient?.patient_photo_url || "";

  const patientAgeSex = patient
    ? `${patient.patient_age ?? "—"}Y / ${patient.patient_gender ?? ""}`
    : "";

  const patientDisplayId = patient?.patient_id || "";

  const recentDiagnosis =
    [
      savedPlan?.cancer_subtype || savedPlan?.cancer_type,
      savedPlan?.cancer_stage,
    ]
      .filter(Boolean)
      .join(" ");

  const orderTherapy = savedPlan?.regimen_name || "";
  const orderIntent = savedPlan?.treatment_intent || "";

  const recentAllergyNames = patientAllergies
    .map((item) => item.allergy_master?.substance_name)
    .filter(Boolean)
    .join(", ");

  const fmtOrderDate = (value?: string | null) => {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return `${String(d.getDate()).padStart(2, "0")}-${String(
      d.getMonth() + 1
    ).padStart(2, "0")}-${d.getFullYear()}`;
  };

  const handlePrint = () => window.print();

  return (
    <>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" />
      <div className="font-[Inter,sans-serif] text-[#1e293b] antialiased flex h-screen overflow-hidden bg-[#f8fafc]">


{/* BEGIN: Main Content */}
<main className="flex-1 flex flex-col h-full overflow-hidden bg-[#f8fafc] relative">
{/* BEGIN: Top Header */}
<header className="h-[72px] bg-[#f8fafc] border-b border-[#e2e8f0] flex items-center justify-between px-8 shrink-0 z-10">
<div className="flex items-center gap-4">
{onBack && (
<button type="button" aria-label="Go back" onClick={onBack} className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-slate-100">
<svg viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
<path d="M19 12H5" />
<path d="m12 19-7-7 7-7" />
</svg>
</button>
)}

</div>
<div className="flex items-center space-x-6">
<BellNotificationButton size="md" />
<div className="flex items-center space-x-3 cursor-pointer pl-6 border-l border-[#e2e8f0]">
<span className="text-sm font-bold text-[#1d4ed8]">HMS</span>
<div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-white">
<i className="fa-solid fa-user text-sm"></i>
</div>
</div>
</div>
</header>
{/* END: Top Header */}
<div className="flex-1 overflow-y-auto relative">
<div className="p-8 max-w-[1400px] mx-auto pb-32">
{/* BEGIN: Patient Header Card */}
<div className="bg-white rounded-[16px] border border-[#e2e8f0] p-6 shadow-sm mb-6 flex justify-between items-center">
<div className="flex items-center">
<img alt={patientName} className="w-20 h-20 rounded-full border-4 border-white shadow-sm object-cover" src={patientPhoto}/>
<div className="ml-6">
<div className="flex items-center space-x-3 mb-1">
<h2 className="text-xl font-bold text-[#1e293b]">{patientName}</h2>
<span className="bg-slate-100 text-[#64748b] px-3 py-1 rounded-full text-xs font-semibold">{patientDisplayId}</span>
</div>
<div className="text-sm text-[#64748b] flex items-center space-x-3">
<span>{patientAgeSex}</span>
<span className="w-1 h-1 rounded-full bg-slate-300"></span>
<span className="text-[#1d4ed8] font-semibold">{recentDiagnosis}</span>
</div>
</div>
</div>
<div className="flex items-center gap-8">
{(() => {
  const v = latestVitals.vitals;
  const TONE: Record<string, string> = {
    danger: "bg-[#FBEAE9] text-[#B5433E]",
    warning: "bg-[#FCF1DD] text-[#A8720F]",
    success: "bg-[#E7F4EE] text-[#2E7D5B]",
    purple: "bg-[#EEECF7] text-[#5A4E9C]",
    accent: "bg-[#E6F1F5] text-[#1D6E8C]",
  };
  const SEV_BADGE: Record<string, string> = {
    normal: "bg-green-50 text-green-600",
    moderate: "bg-orange-50 text-orange-500",
    critical: "bg-red-50 text-red-600",
  };
  const SEV_TEXT: Record<string, string> = {
    normal: "text-green-700",
    moderate: "text-orange-600",
    critical: "text-red-600",
  };
  const band = (val: number, nL: number, nH: number, mL: number, mH: number): string =>
    val >= nL && val <= nH ? "normal" : val >= mL && val <= mH ? "moderate" : "critical";
  const bp = v.bpSystolic != null && v.bpDiastolic != null ? `${v.bpSystolic}/${v.bpDiastolic}` : null;
  const bpSev = (() => {
    if (!bp) return undefined;
    const [s, d] = bp.split("/").map(Number);
    const lvls = [...(!isNaN(s) ? [band(s, 90, 119, 120, 139)] : []), ...(!isNaN(d) ? [band(d, 60, 79, 80, 89)] : [])];
    return lvls.includes("critical") ? "critical" : lvls.includes("moderate") ? "moderate" : lvls[0];
  })();
  type Tile = { key: string; label: string; Icon: React.ElementType; tone: string; value: string; sev?: string };
  const tiles: Tile[] = [
    { key: "height", label: "Height",         Icon: Ruler,         tone: "accent",  value: v.height != null ? `${v.height} cm` : "—" },
    { key: "weight", label: "Weight",         Icon: Weight,        tone: "accent",  value: v.weight != null ? `${v.weight} kg` : "—" },
    { key: "bsa",    label: "BSA",            Icon: PersonStanding,tone: "accent",  value: v.bsa != null ? `${v.bsa} m²` : "—" },
    { key: "bmi",    label: "BMI",            Icon: Gauge,         tone: "accent",  value: v.bmi != null ? String(v.bmi) : "—", sev: v.bmi != null ? band(v.bmi, 18.5, 24.9, 17, 29.9) : undefined },
    { key: "bp",     label: "Blood Pressure", Icon: Droplet,       tone: "danger",  value: bp ? `${bp} mmHg` : "—", sev: bpSev },
    { key: "pulse",  label: "Pulse",          Icon: HeartPulse,    tone: "danger",  value: v.pulse != null ? `${v.pulse} bpm` : "—", sev: v.pulse != null ? band(v.pulse, 60, 100, 101, 110) : undefined },
    { key: "temp",   label: "Temperature",    Icon: Thermometer,   tone: "warning", value: v.temp != null ? `${v.temp} °C` : "—", sev: v.temp != null ? (v.temp >= 38 || v.temp < 35.5 ? "critical" : v.temp > 37.2 || v.temp < 36.1 ? "moderate" : "normal") : undefined },
    { key: "spo2",   label: "SPO2",           Icon: Activity,      tone: "success", value: v.spo2 != null ? `${v.spo2}%` : "—", sev: v.spo2 != null ? (v.spo2 < 90 ? "critical" : v.spo2 < 95 ? "moderate" : "normal") : undefined },
    ...(v.painScore != null ? [{ key: "pain", label: "Pain Score", Icon: Activity, tone: "purple", value: `${v.painScore}/10`, sev: v.painScore >= 7 ? "critical" : v.painScore >= 4 ? "moderate" : "normal" } as Tile] : []),
  ];
  return (
    <div className="grid grid-cols-3 gap-x-6 gap-y-4 border-r border-[#e2e8f0] pr-8">
      {tiles.map((t) => (
        <div key={t.key} className="flex items-start gap-2">
          <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${t.sev ? SEV_BADGE[t.sev] : TONE[t.tone]}`}>
            <t.Icon className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-slate-500 mb-0.5">{t.label}</p>
            <p className={`text-xs font-semibold truncate ${t.sev ? SEV_TEXT[t.sev] : "text-slate-900"}`}>{t.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
})()}
<div className="bg-blue-50/50 border border-blue-100 rounded-[12px] p-4 w-[220px]">
<div className="text-[10px] font-bold text-[#1d4ed8] uppercase tracking-wider mb-1.5">INTENT: {orderIntent || "—"}</div>
<div className="text-[15px] font-bold text-[#1d4ed8] mb-2.5">{orderTherapy || "—"}</div>
<div className="flex items-center text-xs text-[#64748b] font-medium">
<span className="w-2 h-2 rounded-full bg-[#10b981] mr-2"></span> Active Protocol
</div>
</div>
</div>
</div>
{/* END: Patient Header Card */}
{/* BEGIN: Alerts Banner */}
<div className="flex items-center justify-between text-sm mb-8 border-b border-[#e2e8f0] pb-4">
<div className="flex items-center space-x-8">
<div className="flex items-center">
<i className="fa-solid fa-triangle-exclamation text-[#ef4444] mr-2"></i>
<span className="text-[#ef4444] font-semibold">Allergy:</span> <span className="ml-1 text-[#1e293b]">{recentAllergyNames || "—"}</span>
</div>
<div className="flex items-center">
<i className="fa-solid fa-clock-rotate-left text-[#f59e0b] mr-2"></i>
<span className="text-[#f59e0b] font-semibold">Previous Cycle:</span> <span className="ml-1 text-[#1e293b]">{savedPlan?.completed_cycles ? `Cycle ${savedPlan.completed_cycles} completed` : "—"}</span>
</div>
<div className="flex items-center text-[#1d4ed8] font-medium">
<i className="fa-solid fa-link mr-2"></i>
<span>Central Line Available</span>
</div>
</div>

</div>
{/* END: Alerts Banner */}
{/* BEGIN: Branch scope hint */}
{scopeHint && (
<div className="mb-6 flex items-center rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
<i className="fa-solid fa-triangle-exclamation mr-2"></i> Multiple branches assigned — select your branch to load plan, discharge &amp; appointment details:
<InlineBranchPicker />
</div>
)}
{/* END: Branch scope hint */}
{/* BEGIN: Tabs */}
<div className="border-b border-[#e2e8f0] mb-6">
<nav className="flex space-x-8">
{PATIENT_DETAIL_TABS.map((tab) => (
<button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`px-1 py-3 border-b-2 text-sm font-medium transition-colors ${activeTab === tab ? "border-[#1d4ed8] text-[#1d4ed8] font-semibold" : "border-transparent text-[#64748b] hover:text-[#1e293b] hover:border-slate-300"}`}>
{tab}
</button>
))}
</nav>
</div>
{/* END: Tabs */}
{activeTab === "Order Summary" ? (
<OrderSummaryTab
  patientId={resolvedPatientId}
  savedPlan={savedPlan}
  planNotice={planNotice}
  selectedCycle={selectedCycle}
  cycleMedicationsMap={cycleMedicationsMap}
/>
) : activeTab === "Medications" ? (
<MedicationsTab
  plan={savedPlan}
  selectedCycle={selectedCycle}
  cycleMedicationsMap={cycleMedicationsMap}
/>
) : activeTab === "Administration" ? (
<AdministrationTab patientId={resolvedPatientId} plan={savedPlan} />
) : activeTab === "Discharge" ? (
<DischargeTab
  patientId={resolvedPatientId}
  plan={savedPlan}
  latestVitals={latestVitals}
/>
) : activeTab === "History" ? (
<HistoryTab embedded patientId={resolvedPatientId} initialPlan={savedPlan} />
) : (
<NotesDocumentsTab embedded patientId={resolvedPatientId} />
)}
</div>
</div>
{/* BEGIN: Footer */}
<footer className="absolute bottom-0 left-0 right-0 bg-white border-t border-[#e2e8f0] px-8 py-4 flex items-center justify-between z-20">
<div>
<div className="text-xs text-[#64748b]">Created by <span className="font-medium text-[#1e293b]">{[savedPlan?.employees?.first_name, savedPlan?.employees?.last_name].filter(Boolean).join(" ") || "—"}</span> on {fmtOrderDate(savedPlan?.created_at) || "—"}</div>
<div className="text-xs text-[#64748b] mt-1">Last updated by <span className="font-medium text-[#1e293b]">{[savedPlan?.employees?.first_name, savedPlan?.employees?.last_name].filter(Boolean).join(" ") || "—"}</span> on {fmtOrderDate(savedPlan?.updated_at) || "—"}</div>
</div>
<div className="flex items-center space-x-4">
<button type="button" onClick={handlePrint} className="px-4 py-2 border border-[#e2e8f0] rounded-[8px] text-sm font-semibold text-[#1e293b] hover:bg-slate-50 transition-colors flex items-center">
<i className="fa-solid fa-print mr-2"></i> Print
          </button>
<button className="px-4 py-2 border border-[#e2e8f0] rounded-[8px] text-sm font-semibold text-[#1e293b] hover:bg-slate-50 transition-colors flex items-center">
<i className="fa-solid fa-share-nodes mr-2"></i> Share
          </button>
<button className="px-4 py-2 border border-[#e2e8f0] rounded-[8px] text-sm font-semibold text-[#1e293b] hover:bg-slate-50 transition-colors flex items-center">
<i className="fa-regular fa-copy mr-2"></i> Duplicate Cycle
          </button>
<button className="px-6 py-2 bg-[#1d4ed8] text-white rounded-[8px] text-sm font-semibold hover:bg-blue-700 transition-colors">
            Update Order
          </button>
</div>
</footer>
{/* END: Footer */}
</main>
{/* END: Main Content */}

      </div>
    </>
  );
}

/* Compact branch dropdown for the full-screen portals. They render
   OUTSIDE AppLayout, so the header BranchSelector isn't available and
   multi-branch users would otherwise 403 on every scoped call with no
   way to pick a branch on-page. Uses the real selectBranch, so the
   localStorage key and the axios x-branch-id header stay in sync with
   the rest of the app. */
function InlineBranchPicker() {
  const { branches, loading, selectedBranchId, selectBranch } =
    useBranchFilter();
  const hasSelection =
    !!selectedBranchId &&
    selectedBranchId !== ALL_BRANCHES_VALUE &&
    selectedBranchId !== NO_BRANCH_VALUE;
  return (
    <select
      value={hasSelection ? selectedBranchId : ""}
      disabled={loading}
      onChange={(event) => selectBranch(event.target.value)}
      className="ml-2 rounded-md border border-amber-300 bg-white px-2 py-1 text-xs font-semibold text-[#1e293b] focus:outline-none"
    >
      {!hasSelection && <option value="">Select branch…</option>}
      {branches.map((branch) => (
        <option key={branch.id} value={branch.id}>
          {branch.name}
          {branch.area && branch.area !== "N/A" ? ` – ${branch.area}` : ""}
        </option>
      ))}
    </select>
  );
}

const PatientDetails: React.FC = () => {
  const navigate = useNavigate();
  return (
    <BranchFilterProvider>
      <HMSPatientPortal onBack={() => navigate(-1)} />
    </BranchFilterProvider>
  );
};

export default PatientDetails;
