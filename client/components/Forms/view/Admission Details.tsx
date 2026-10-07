import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Printer,
  Pencil,
  Calendar,
  Clock,
  User,
  FileText,
  Phone,
  MapPin,
  ClipboardList,
  ArrowRight,
  Loader2,
  AlertCircle,
  Sparkles,
  BedDouble,
  Building2,
  ArrowRightLeft,
  Banknote,
  ShieldCheck,
  Ban,
} from "lucide-react";
import { ipdApi, type AdmissionRecord } from "@/api/ipd.api";
import { formatMobile } from "@/utils/formatters";
import { StatusBadge, type StatusTone } from "@/components/hms/StatusBadge";
import PatientVitalsPanel from "@/components/hms/PatientVitalsPanel";

// Status label mapping matching backend enum
const STATUS_LABELS: Record<string, string> = {
  PLANNED: "Planned",
  ADMITTED: "Admitted",
  DISCHARGED: "Discharged",
  TRANSFERRED: "Transferred",
  CANCELLED: "Cancelled",
  NO_SHOW: "No-Show",
};

const STATUS_TONES: Record<string, StatusTone> = {
  PLANNED: "amber",
  ADMITTED: "green",
  DISCHARGED: "slate",
  TRANSFERRED: "blue",
  CANCELLED: "red",
  NO_SHOW: "slate",
};

function getInitials(name: string): string {
  const words = name.replace(/^Dr\.?\s*/i, "").trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}

function formatPatientName(p: AdmissionRecord["patient_bio_data"]): string {
  if (!p) return "Unknown Patient";
  return [p.patient_first_name, p.patient_middle_name, p.patient_last_name]
    .filter(Boolean)
    .join(" ");
}

function formatDoctorName(e: AdmissionRecord["employees"]): string {
  if (!e) return "Unassigned";
  return `Dr. ${[e.first_name, e.middle_name, e.last_name].filter(Boolean).join(" ")}`;
}

function formatDateTime(date?: string | null): string {
  if (!date) return "—";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  });
}

function formatDateOnly(date?: string | null): string {
  if (!date) return "—";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function calculateAge(admission: AdmissionRecord): string {
  const p = admission.patient_bio_data;
  const dob = p?.patient_DOB ?? (p as any)?.patient_dob ?? null;
  if (!dob) return "—";
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return "—";
  const diff = Date.now() - birth.getTime();
  const ageDate = new Date(diff);
  return `${Math.abs(ageDate.getUTCFullYear() - 1970)} Yrs`;
}

const AdmissionDetails: React.FC = () => {
  const navigate = useNavigate();
  const { ipNumber } = useParams<{ ipNumber: string }>();

  const [admission, setAdmission] = useState<AdmissionRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!ipNumber) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    const loadData = async () => {
      try {
        const res = await ipdApi.getByIpNumber(decodeURIComponent(ipNumber));
        if (isMounted) {
          setAdmission(res.data?.data ?? null);
        }
      } catch (err) {
        console.error("[Admission Details] Load failed:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [ipNumber]);

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <main className="flex min-h-[70vh] flex-col items-center justify-center gap-3 bg-slate-50 text-slate-500 font-[Manrope,sans-serif]">
        <Loader2 className="h-7 w-7 animate-spin text-[#00488D]" />
        <p className="text-sm font-medium">Loading admission details...</p>
      </main>
    );
  }

  if (!admission) {
    return (
      <main className="flex min-h-[70vh] flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-slate-700 font-[Manrope,sans-serif]">
        <AlertCircle className="h-10 w-10 text-rose-500" />
        <h2 className="text-xl font-bold text-slate-900">Admission Not Found</h2>
        <p className="text-sm text-slate-500 max-w-md text-center">
          The admission you are looking for does not exist or may have been deleted.
        </p>
        <button
          onClick={() => navigate("/inpatient/admissions")}
          className="rounded-lg bg-[#00488D] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#003870]"
        >
          Return to Inpatient (IPD)
        </button>
      </main>
    );
  }

  const rawStatus = (admission.status ?? "PLANNED").toUpperCase();
  const statusLabel = STATUS_LABELS[rawStatus] ?? (admission.status || "Planned");
  const statusTone = STATUS_TONES[rawStatus] ?? "blue";
  const patientName = formatPatientName(admission.patient_bio_data);
  const doctorName = formatDoctorName(admission.employees);
  const deptName = admission.department_master?.department_name ?? "—";
  const branchName = admission.branch?.branch_name ?? "—";
  const branchArea = admission.branch?.branch_area;
  const stayDays = admission.expected_stay_days;
  const transfers = admission.admission_transfer_log ?? [];

  return (
    <main className="min-h-screen bg-[#F8FAFC] p-4 md:p-6 lg:p-8 font-[Manrope,sans-serif] text-slate-900">
      <div className="mx-auto max-w-7xl space-y-6">

        {/* 1. Header Bar */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <button
              aria-label="Go back"
              onClick={() => navigate(-1)}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>

            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="hms-heading">Admission Details</h1>
                <StatusBadge tone={statusTone}>{statusLabel}</StatusBadge>
              </div>
              <p className="hms-subheading mt-0.5">
                IP Number: <span className="font-bold text-slate-800">#{admission.ip_number}</span> • Admitted {formatDateTime(admission.admission_date)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-end sm:self-auto">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:border-slate-300"
            >
              <Printer className="h-4 w-4 text-slate-500" />
              Print
            </button>

            {rawStatus === "PLANNED" && (
              <button
                onClick={() => navigate("/appointments/add", { state: { admissionEdit: admission } })}
                className="flex items-center gap-2 rounded-xl border border-[#00488D] bg-white px-4 py-2 text-xs font-semibold text-[#00488D] shadow-sm transition-all hover:bg-blue-50"
              >
                <Pencil className="h-4 w-4" />
                Edit Request
              </button>
            )}
          </div>
        </header>

        {/* 2. Top Summary Ribbon */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6 lg:gap-6 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
            {/* Status */}
            <div className="flex flex-col justify-center">
              <span className="hms-id-text">Status</span>
              <div className="mt-1">
                <StatusBadge tone={statusTone}>{statusLabel}</StatusBadge>
              </div>
            </div>

            {/* IP Number */}
            <div className="flex flex-col justify-center sm:pl-4 pt-3 sm:pt-0">
              <span className="hms-id-text">IP Number</span>
              <div className="mt-1 font-extrabold text-sm text-[#00488D]">
                #{admission.ip_number}
              </div>
            </div>

            {/* Admission Type */}
            <div className="flex flex-col justify-center sm:pl-4 pt-3 sm:pt-0">
              <span className="hms-id-text">Admission Type</span>
              <div className="mt-1">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                  <BedDouble className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  {admission.admission_type}
                </span>
              </div>
            </div>

            {/* Admitted On */}
            <div className="flex flex-col justify-center sm:pl-4 pt-3 sm:pt-0">
              <span className="hms-id-text">Admitted On</span>
              <div className="mt-1 flex items-center gap-1.5 font-bold text-sm text-slate-800">
                <Calendar className="h-3.5 w-3.5 text-blue-600" />
                <span>{formatDateOnly(admission.admission_date)}</span>
              </div>
            </div>

            {/* Ward & Bed */}
            <div className="flex flex-col justify-center sm:pl-4 pt-3 sm:pt-0">
              <span className="hms-id-text">Ward & Bed</span>
              <div className="mt-1 font-semibold text-xs text-slate-800 truncate">
                {admission.ward_master?.ward_name || "Unassigned Ward"} • Bed {admission.bed_master?.bed_number || "—"}
              </div>
            </div>

            {/* Department */}
            <div className="flex flex-col justify-center sm:pl-4 pt-3 sm:pt-0">
              <span className="hms-id-text">Department</span>
              <div className="mt-1 font-semibold text-xs text-slate-800 truncate">
                {deptName}
              </div>
            </div>
          </div>
        </section>

        {/* 3. Clinical Provider & Patient Profile Cards Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

          {/* Attending Doctor Card */}
          <section className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <FileText className="h-4 w-4" />
                  </div>
                  <h2 className="text-base font-bold text-slate-900">Attending Doctor</h2>
                </div>

                {admission.employee_id ? (
                  <button
                    type="button"
                    onClick={() => navigate(`/doctor/view/${admission.employee_id}`)}
                    className="flex items-center gap-1 text-xs font-semibold text-[#00488D] hover:underline cursor-pointer"
                  >
                    View Profile
                    <ArrowRight className="h-3 w-3" />
                  </button>
                ) : null}
              </div>

              <div className="mt-5 flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#D6E3FF] text-[#00488D] text-lg font-bold shadow-inner">
                  {getInitials(doctorName)}
                </div>

                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="hms-name-text text-base font-bold text-slate-900 truncate">
                      {doctorName}
                    </h3>
                    {admission.employee_id && (
                      <span className="hms-id-text rounded bg-slate-100 px-1.5 py-0.5">
                        ID: {admission.employee_id}
                      </span>
                    )}
                  </div>

                  <p className="text-xs font-medium text-slate-600">
                    {admission.employees?.specialization ?? "General Physician"}
                  </p>

                  <div className="pt-1">
                    <span className="inline-block rounded-md border border-blue-100 bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700">
                      {deptName}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Provider Contact & Location Footer */}
            <div className="mt-6 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span>
                  {admission.employees?.mobile_no ? formatMobile(admission.employees.mobile_no) : "Phone not listed"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{branchName}</span>
              </div>
            </div>
          </section>

          {/* Patient Profile Card */}
          <section className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                    <User className="h-4 w-4" />
                  </div>
                  <h2 className="text-base font-bold text-slate-900">Patient Profile</h2>
                </div>

                <button
                  type="button"
                  onClick={() => navigate(`/patients/view/${admission.patient_id}`)}
                  className="flex items-center gap-1 text-xs font-semibold text-[#00488D] hover:underline cursor-pointer"
                >
                  View Profile
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>

              <div className="mt-5 flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 text-lg font-bold shadow-inner">
                  {getInitials(patientName)}
                </div>

                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="hms-name-text text-base font-bold text-slate-900 truncate">
                      {patientName}
                    </h3>
                    <span className="hms-id-text rounded bg-slate-100 px-1.5 py-0.5">
                      #{admission.patient_id}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-500 pt-0.5">
                    <span>
                      Gender: <strong className="text-slate-800 font-medium">{admission.patient_bio_data?.patient_gender ?? "—"}</strong>
                    </span>
                    <span>•</span>
                    <span>
                      Age: <strong className="text-slate-800 font-medium">{calculateAge(admission)}</strong>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Patient Contact Footer */}
            <div className="mt-6 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span>
                  {admission.patient_bio_data?.patient_primary_mobile
                    ? formatMobile(admission.patient_bio_data.patient_primary_mobile)
                    : admission.patient_bio_data?.patient_contact_number
                    ? formatMobile(admission.patient_bio_data.patient_contact_number)
                    : "No mobile on file"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{branchArea || branchName}</span>
              </div>
            </div>
          </section>
        </div>

        {/* 4. Full Width Stay & Clinical Details */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm w-full space-y-6">
          <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <ClipboardList className="h-4 w-4" />
            </div>
            <h2 className="text-base font-bold text-slate-900">Stay & Clinical Details</h2>
          </div>

          {/* PROVISIONAL DIAGNOSIS AT TOP */}
          <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-blue-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-blue-900">Provisional Diagnosis</h3>
            </div>

            {admission.provisional_diagnosis ? (
              <p className="text-base font-bold text-slate-900">{admission.provisional_diagnosis}</p>
            ) : (
              <p className="text-xs text-slate-500 italic">
                No provisional diagnosis recorded for this admission yet.
              </p>
            )}
          </div>

          {/* CURRENT ALLOCATION */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Current Allocation & Admission Parameters
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                <span className="text-slate-400 text-[10px] uppercase font-bold">Ward</span>
                <p className="font-semibold text-slate-800 mt-0.5">{admission.ward_master?.ward_name || "—"}</p>
              </div>

              <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                <span className="text-slate-400 text-[10px] uppercase font-bold">Bed</span>
                <p className="font-semibold text-slate-800 mt-0.5">
                  {admission.bed_master?.bed_number || "—"}
                  {admission.bed_master?.bed_type ? ` (${admission.bed_master.bed_type})` : ""}
                </p>
              </div>

              <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                <span className="text-slate-400 text-[10px] uppercase font-bold">Branch Location</span>
                <p className="font-semibold text-slate-800 mt-0.5">{branchName}</p>
              </div>

              <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                <span className="text-slate-400 text-[10px] uppercase font-bold">Expected Stay</span>
                <p className="font-semibold text-slate-800 mt-0.5">
                  {stayDays != null ? `${stayDays} Day${stayDays === 1 ? "" : "s"}` : "—"}
                </p>
              </div>

              <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                <span className="text-slate-400 text-[10px] uppercase font-bold">Daycare</span>
                <p className="font-semibold text-slate-800 mt-0.5">{admission.is_daycare ? "Yes" : "No"}</p>
              </div>

              <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                <span className="text-slate-400 text-[10px] uppercase font-bold">Appointment</span>
                <p className="font-semibold text-slate-800 mt-0.5">{admission.appointment_id || "—"}</p>
              </div>

              <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                <span className="text-slate-400 text-[10px] uppercase font-bold">Encounter</span>
                <p className="font-semibold text-slate-800 mt-0.5">{admission.encounter_no || "Not started"}</p>
              </div>

              <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                <span className="text-slate-400 text-[10px] uppercase font-bold">Recorded On</span>
                <p className="font-semibold text-slate-800 mt-0.5">{formatDateTime(admission.created_at)}</p>
              </div>
            </div>
          </div>

          {/* PAYMENT & FINANCIALS */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Banknote className="h-4 w-4 text-emerald-500" />
              Payment & Financials
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                <span className="text-slate-400 text-[10px] uppercase font-bold">Payment Mode</span>
                <p className="font-semibold text-slate-800 mt-0.5">{admission.payment_mode || "CASH"}</p>
              </div>

              <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                <span className="text-slate-400 text-[10px] uppercase font-bold">Advance Amount</span>
                <p className="font-semibold text-slate-800 mt-0.5">
                  {admission.advance_amount != null ? `₹ ${admission.advance_amount}` : "—"}
                </p>
              </div>

              <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                <span className="text-slate-400 text-[10px] uppercase font-bold">Insurance Provider</span>
                <p className="font-semibold text-slate-800 mt-0.5">{admission.insurance_provider || "—"}</p>
              </div>

              <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                <span className="text-slate-400 text-[10px] uppercase font-bold">Policy Number</span>
                <p className="font-semibold text-slate-800 mt-0.5">{admission.insurance_policy_no || "—"}</p>
              </div>
            </div>
          </div>
        </section>

        {/* 5. Transfer History */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <ArrowRightLeft className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Bed Transfer History</h2>
            </div>
          </div>

          {transfers.length === 0 ? (
            <p className="px-6 py-8 text-xs text-slate-400 italic">
              No bed transfers recorded for this stay.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-100 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3">From</th>
                    <th className="px-5 py-3">To</th>
                    <th className="px-5 py-3">Reason</th>
                    <th className="px-5 py-3">Transferred On</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transfers.map((log) => (
                    <tr key={log.transfer_log_id || String(log.id)} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-3 text-slate-600">
                        {log.from_ward_id ? `Ward ${log.from_ward_id} • Bed ${log.from_bed_id ?? "—"}` : "—"}
                      </td>
                      <td className="px-5 py-3 font-semibold text-slate-800">
                        Ward {log.to_ward_id} • Bed {log.to_bed_id}
                      </td>
                      <td className="px-5 py-3 text-slate-600">{log.reason || "—"}</td>
                      <td className="px-5 py-3 text-slate-500">{formatDateTime(log.transferred_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 6. Discharge Details */}
        {rawStatus === "DISCHARGED" && (
          <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-6 shadow-sm w-full space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <h2 className="text-base font-bold text-amber-900">Discharge Details</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="rounded-lg border border-amber-200 bg-white p-3">
                <span className="text-amber-500 text-[10px] uppercase font-bold">Discharge Type</span>
                <p className="font-semibold text-slate-800 mt-0.5">{admission.discharge_type || "Recovered"}</p>
              </div>

              <div className="rounded-lg border border-amber-200 bg-white p-3">
                <span className="text-amber-500 text-[10px] uppercase font-bold">Discharge Date</span>
                <p className="font-semibold text-slate-800 mt-0.5">{formatDateTime(admission.discharge_date)}</p>
              </div>

              <div className="rounded-lg border border-amber-200 bg-white p-3">
                <span className="text-amber-500 text-[10px] uppercase font-bold">Discharge Summary</span>
                <p className="font-semibold text-slate-800 mt-0.5">{admission.discharge_summary || "—"}</p>
              </div>
            </div>
          </section>
        )}

        {/* 6b. Cancellation / No-Show Details -- closed admissions can't be
            edited, so updated_at / updated_by still record who closed it. */}
        {(rawStatus === "CANCELLED" || rawStatus === "NO_SHOW") && (
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-6 shadow-sm w-full space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-200 text-slate-600">
                <Ban className="h-4 w-4" />
              </div>
              <h2 className="text-base font-bold text-slate-800">
                {rawStatus === "CANCELLED" ? "Cancellation Details" : "No-Show Details"}
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <span className="text-slate-400 text-[10px] uppercase font-bold">Reason</span>
                <p className="font-semibold text-slate-800 mt-0.5 whitespace-pre-wrap">
                  {admission.cancellation_reason || "No reason given"}
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <span className="text-slate-400 text-[10px] uppercase font-bold">
                  {rawStatus === "CANCELLED" ? "Cancelled On" : "Marked On"}
                </span>
                <p className="font-semibold text-slate-800 mt-0.5">{formatDateTime(admission.updated_at)}</p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <span className="text-slate-400 text-[10px] uppercase font-bold">
                  {rawStatus === "CANCELLED" ? "Cancelled By" : "Marked By"}
                </span>
                <p className="font-semibold text-slate-800 mt-0.5">
                  {admission.updated_by_name || (admission.updated_by === "SYSTEM" ? "Automatic (nightly check)" : admission.updated_by || "—")}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* 7. Vitals Section */}
        <section className="space-y-2">
          <PatientVitalsPanel patientId={admission.patient_id} />
        </section>

        {/* Footer meta */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-slate-200 pt-4 text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" />
            <span>{branchName}</span>
          </div>
          <div>
            Admission ID: {admission.admission_id} • Recorded {formatDateTime(admission.created_at)}
          </div>
        </div>

      </div>
    </main>
  );
};

export default AdmissionDetails;