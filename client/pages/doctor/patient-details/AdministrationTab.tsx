import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { SummaryPlan } from "./types";

type DrugStatus = "GIVEN" | "PENDING" | "SKIPPED" | "CANCELLED";

interface Drug {
  id: number;
  name: string;
  brandName: string;
  dose: string;
  actualDose: string;
  route: string;
  dilution: string;
  infusionRate: string;
  nurse: string;
  status: DrugStatus;
  reason?: string;
  remarks?: string;
}

interface SupportiveMed {
  id: number;
  name: string;
  dose: string;
  route: string;
  dilution: string;
  infusionRate: string;
  status: DrugStatus;
}

interface PostMed {
  id: number;
  name: string;
  dose: string;
  route: string;
  time: string;
  status: DrugStatus;
}

interface AdministrationTabProps {
  patientId: string | null;
  plan?: SummaryPlan | null;
}

const STATUS_CONFIG: Record<DrugStatus, { label: string; className: string }> = {
  GIVEN:     { label: "GIVEN",     className: "bg-green-50 text-green-700 border border-green-200" },
  PENDING:   { label: "PENDING",   className: "bg-amber-50 text-amber-600 border border-amber-200" },
  SKIPPED:   { label: "SKIPPED",   className: "bg-slate-100 text-slate-600 border border-slate-300" },
  CANCELLED: { label: "CANCELLED", className: "bg-red-50 text-red-500 border border-red-200" },
};

const INITIAL_DRUGS: Drug[] = [
  { id: 1, name: "Doxorubicin",       brandName: "Adriamycin",  dose: "60 mg/m²",  actualDose: "100 mg",    route: "IV", dilution: "NS 250 mL", infusionRate: "10 mg/min", nurse: "Priya S",   status: "GIVEN" },
  { id: 2, name: "Cyclophosphamide",  brandName: "Cytoxan",     dose: "600 mg/m²", actualDose: "1,000 mg",  route: "IV", dilution: "NS 250 mL", infusionRate: "250 mL/hr", nurse: "Kavitha R", status: "GIVEN" },
  { id: 3, name: "Paclitaxel",        brandName: "Taxol",       dose: "175 mg/m²", actualDose: "300 mg",    route: "IV", dilution: "DS 250 mL", infusionRate: "3 hrs",     nurse: "Rani P",    status: "PENDING",   reason: "", remarks: "" },
  { id: 4, name: "Carboplatin",       brandName: "Paraplatin",  dose: "AUC 5",     actualDose: "450 mg",    route: "IV", dilution: "NS 250 mL", infusionRate: "60 min",    nurse: "Sushma K",  status: "SKIPPED",   reason: "Patient not willing", remarks: "Patient refused due to nausea and fatigue." },
  { id: 5, name: "Trastuzumab",       brandName: "Herceptin",   dose: "6 mg/kg",   actualDose: "360 mg",    route: "IV", dilution: "NS 250 mL", infusionRate: "90 min",    nurse: "Anitha V",  status: "GIVEN" },
  { id: 6, name: "Pertuzumab",        brandName: "Perjeta",     dose: "420 mg",    actualDose: "",          route: "IV", dilution: "NS 250 mL", infusionRate: "60 min",    nurse: "Lakshmi S", status: "CANCELLED", reason: "Adverse reaction", remarks: "Patient developed rash and itching. Treatment discontinued as per oncologist." },
];

const SUPPORTIVE_MEDS: SupportiveMed[] = [
  { id: 1, name: "Filgrastim", dose: "300 mcg", route: "SC", dilution: "—", infusionRate: "—", status: "GIVEN" },
];

const POST_MEDS: PostMed[] = [
  { id: 1, name: "Pantoprazole", dose: "40 mg", route: "IV", time: "07:00 PM", status: "GIVEN" },
];

const PREVIOUS_CYCLES = [
  { cycle: "Cycle 2", date: "12-Sep-2026", regimen: "AC (Doxorubicin + Cyclophosphamide)", status: "Completed" },
  { cycle: "Cycle 1", date: "25-Aug-2026", regimen: "AC (Doxorubicin + Cyclophosphamide)", status: "Completed" },
];

const SKIP_CANCEL_REASONS = [
  "Patient not willing",
  "Adverse reaction",
  "Drug unavailable",
  "Physician order",
  "Lab values",
  "Others",
];

function StatusBadge({ status }: { status: DrugStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

function ReasonDropdown({ value, onChange, hasError }: { value: string; onChange: (v: string) => void; hasError: boolean }) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      const wrapper = inputRef.current?.closest(".relative");
      if (!menuRef.current?.contains(e.target as Node) && !wrapper?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const updatePos = () => {
      if (inputRef.current && menuRef.current) {
        const r = inputRef.current.getBoundingClientRect();
        menuRef.current.style.top = `${r.bottom + 2}px`;
        menuRef.current.style.left = `${r.left}px`;
        menuRef.current.style.width = `${r.width}px`;
      }
    };
    window.addEventListener("scroll", updatePos, true);
    return () => window.removeEventListener("scroll", updatePos, true);
  }, [open]);

  const borderCls = hasError ? "border-red-300" : "border-slate-200";

  function openDropdown() {
    if (inputRef.current) setRect(inputRef.current.getBoundingClientRect());
    setOpen(true);
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); if (e.target.value) openDropdown(); }}
        onKeyDown={e => { if (e.key === "Enter" && value) { e.preventDefault(); setOpen(false); } }}
        onFocus={openDropdown}
        placeholder="Select or type a reason..."
        className={`w-full rounded-lg border ${borderCls} bg-white py-2 pl-3 pr-8 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-200`}
      />
      <button
        type="button"
        onMouseDown={e => { e.preventDefault(); open ? setOpen(false) : openDropdown(); inputRef.current?.focus(); }}
        className="absolute inset-y-0 right-0 flex items-center px-2 text-slate-400 hover:text-slate-600"
        tabIndex={-1}
      >
        <i className={`fa-solid fa-chevron-down text-[10px] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && rect && createPortal(
        <div
          ref={menuRef}
          style={{ position: "fixed", top: rect.bottom + 2, left: rect.left, width: rect.width, zIndex: 9999 }}
          className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          {value && !SKIP_CANCEL_REASONS.includes(value) && (
            <button
              type="button"
              onMouseDown={e => { e.preventDefault(); onChange(value); setOpen(false); }}
              className="flex w-full items-center px-3 py-2 text-left text-sm font-medium text-blue-600 hover:bg-blue-50"
            >
              <i className="fa-solid fa-plus mr-2 text-[10px]" />
              "{value}"
            </button>
          )}
          {SKIP_CANCEL_REASONS.map(r => (
            <button
              key={r}
              type="button"
              onMouseDown={e => {
                e.preventDefault();
                onChange(r === "Others" ? "" : r);
                setOpen(false);
                if (r === "Others") inputRef.current?.focus();
              }}
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50 ${value === r ? "font-semibold text-blue-600" : "text-slate-700"}`}
            >
              {r}
              {value === r && <i className="fa-solid fa-check text-[10px] text-blue-500" />}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

export default function AdministrationTab({ patientId, plan }: AdministrationTabProps) {
  const [drugs, setDrugs] = useState<Drug[]>(INITIAL_DRUGS);
  const [supportiveOpen, setSupportiveOpen] = useState(true);
  const [postMedOpen, setPostMedOpen] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [adminInstructions, setAdminInstructions] = useState<{
    medicineName: string; route: string; infusion: string; dose: string;
    frequency: string; timing: string; remarks: string; administrationDetail: string;
  }[]>([]);

  useEffect(() => {
    if (!patientId) { setAdminInstructions([]); return; }
    try {
      const stored = localStorage.getItem(`hms_admin_instructions_${patientId}`);
      const parsed = stored ? JSON.parse(stored) : [];
      setAdminInstructions(Array.isArray(parsed) ? parsed : []);
    } catch { setAdminInstructions([]); }
  }, [patientId]);

  useEffect(() => {
    if (openMenuId === null) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openMenuId]);

  const latestCycle = plan?.chemotherapy_cycle?.[0];
  const cycleNumber = latestCycle?.cycle_number ?? 3;
  const totalDays   = 4;
  const currentDay  = latestCycle?.cycle_day ?? 1;
  const protocol    = plan?.regimen_name ?? "AC (Doxorubicin + Cyclophosphamide)";

  const given     = drugs.filter(d => d.status === "GIVEN").length;
  const pending   = drugs.filter(d => d.status === "PENDING").length;
  const skipped   = drugs.filter(d => d.status === "SKIPPED").length;
  const cancelled = drugs.filter(d => d.status === "CANCELLED").length;
  const total     = drugs.length + SUPPORTIVE_MEDS.length + POST_MEDS.length;

  const filtered = drugs.filter(d =>
    !searchTerm ||
    d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.brandName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const updateDrug = (id: number, field: "reason" | "remarks", value: string) =>
    setDrugs(prev => prev.map(d => d.id === id ? { ...d, [field]: value } : d));


  return (
    <div className="flex gap-5">
      {/* ─── MAIN CONTENT ─── */}
      <div className="min-w-0 flex-1 space-y-4">

        {/* ── Chemotherapy Administration header ── */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-start justify-between p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50">
                <i className="fa-solid fa-syringe text-blue-600" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Chemotherapy Administration</h2>
                <p className="text-sm text-slate-500">
                  Cycle {cycleNumber}&nbsp;&nbsp;|&nbsp;&nbsp;01-Oct-2026 (Day {currentDay})
                </p>
                <p className="mt-0.5 text-xs text-slate-400">Protocol: {protocol}</p>
              </div>
            </div>
            {/* Day timeline with connecting lines */}
            <div className="flex items-start pt-1">
              {Array.from({ length: totalDays }, (_, i) => {
                const isActive = i === currentDay - 1;
                const isDone   = i < currentDay - 1;
                return (
                  <React.Fragment key={i}>
                    <div className="flex flex-col items-center gap-1.5">
                      <div className={`h-3 w-3 rounded-full border-2 ${
                        isDone || isActive
                          ? "border-blue-600 bg-blue-600"
                          : "border-blue-200 bg-white"
                      }`} />
                      {isActive ? (
                        <div className="flex flex-col items-center text-center leading-tight">
                          <span className="text-[10px] font-semibold text-blue-600">Cycle {cycleNumber}</span>
                          <span className="text-[10px] font-semibold text-blue-600">Day {currentDay}</span>
                        </div>
                      ) : (
                        <span className="text-[10px] font-medium text-slate-400">Day {i + 1}</span>
                      )}
                    </div>
                    {i < totalDays - 1 && (
                      <div className="mt-[5px] h-0.5 w-10 flex-shrink-0 bg-blue-100" />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-5 divide-x divide-slate-100 border-t border-slate-100">
            {[
              { icon: "fa-pills",             label: "Total Drugs", value: total,     color: "text-slate-700" },
              { icon: "fa-circle-check",      label: "Given",       value: given,     color: "text-green-600" },
              { icon: "fa-clock",             label: "Pending",     value: pending,   color: "text-amber-500" },
              { icon: "fa-triangle-exclamation", label: "Skipped",  value: skipped,   color: "text-slate-500" },
              { icon: "fa-circle-xmark",      label: "Cancelled",   value: cancelled, color: "text-red-500"   },
            ].map(stat => (
              <div key={stat.label} className="p-4 text-center">
                <div className={`mb-1 flex items-center justify-center gap-1.5 ${stat.color}`}>
                  <i className={`fa-solid ${stat.icon} text-xs`} />
                  <span className="text-xs font-medium">{stat.label}</span>
                </div>
                <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Chemotherapy Drugs table ── */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <div className="flex items-center gap-2">
              <i className="fa-solid fa-table-list text-blue-500 text-sm" />
              <h3 className="text-sm font-bold text-slate-800">Chemotherapy Drugs</h3>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800">
                Show All Drugs <i className="fa-solid fa-chevron-down text-[9px]" />
              </button>
              <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
                <i className="fa-solid fa-magnifying-glass text-[10px] text-slate-400" />
                <input
                  type="text"
                  placeholder="Search drug name..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-36 bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-3">#</th>
                  <th className="px-3 py-3">Medication</th>
                  <th className="px-3 py-3">Dose</th>
                  <th className="px-3 py-3">Route</th>
                  <th className="px-3 py-3">Dilution / Volume</th>
                  <th className="px-3 py-3">Infusion Rate</th>
                  <th className="px-3 py-3">Nurse</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(drug => (
                  <React.Fragment key={drug.id}>
                    <tr className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-3 py-3 text-sm text-slate-600">{drug.id}</td>
                      <td className="px-3 py-3">
                        <p className="text-sm font-semibold text-blue-700">{drug.name}</p>
                        <p className="text-[11px] text-slate-400">({drug.brandName})</p>
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-sm font-medium text-slate-800">{drug.dose}</p>
                        {drug.actualDose && (
                          <p className="text-[11px] text-slate-500">({drug.actualDose})</p>
                        )}
                      </td>
                      <td className="px-3 py-3 text-sm text-slate-700">{drug.route}</td>
                      <td className="px-3 py-3 text-sm text-slate-700">{drug.dilution}</td>
                      <td className="px-3 py-3 text-sm text-slate-700">{drug.infusionRate}</td>
                      <td className="px-3 py-3 text-sm text-slate-700">{drug.nurse}</td>
                      <td className="px-3 py-3">
                        <StatusBadge status={drug.status} />
                      </td>
                      <td className="px-3 py-3">
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setOpenMenuId(openMenuId === drug.id ? null : drug.id)}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                          >
                            <i className="fa-solid fa-ellipsis-vertical text-sm" />
                          </button>
                          {openMenuId === drug.id && (
                            <div ref={menuRef} className="absolute right-0 z-20 mt-1 w-36 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                              {(["GIVEN", "PENDING", "SKIPPED", "CANCELLED"] as DrugStatus[]).map(s => (
                                <button
                                  key={s}
                                  type="button"
                                  onClick={() => {
                                    setDrugs(prev => prev.map(d =>
                                      d.id === drug.id ? { ...d, status: s, reason: s === "GIVEN" ? undefined : (d.reason ?? ""), remarks: s === "GIVEN" ? undefined : (d.remarks ?? "") } : d
                                    ));
                                    setOpenMenuId(null);
                                  }}
                                  className={`flex w-full items-center gap-2 px-3 py-2 text-xs font-medium transition-colors hover:bg-slate-50 ${drug.status === s ? "bg-slate-50 font-semibold" : ""}`}
                                >
                                  <span className={
                                    s === "GIVEN"   ? "text-green-700" :
                                    s === "PENDING" ? "text-amber-600" :
                                    s === "SKIPPED" ? "text-slate-600" :
                                                      "text-red-500"
                                  }>{s.charAt(0) + s.slice(1).toLowerCase()}</span>
                                  {drug.status === s && (
                                    <i className="fa-solid fa-check ml-auto text-[10px] text-slate-500" />
                                  )}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Reason form for PENDING / SKIPPED / CANCELLED */}
                    {(drug.status === "PENDING" || drug.status === "SKIPPED" || drug.status === "CANCELLED") && (
                      <tr className="border-b border-slate-100">
                        <td colSpan={9} className="bg-slate-50/60 px-5 pb-4 pt-3">
                          {drug.status === "PENDING" && !drug.reason && (
                            <p className="mb-3 text-[11px] font-medium text-red-500">
                              * Reason is required for skipped or cancelled medication
                            </p>
                          )}
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="mb-1 block text-xs font-semibold text-slate-700">
                                Reason <span className="text-red-500">*</span>
                              </label>
                              <ReasonDropdown
                                value={drug.reason ?? ""}
                                onChange={v => updateDrug(drug.id, "reason", v)}
                                hasError={!drug.reason}
                              />
                              {!drug.reason && (
                                <p className="mt-1 text-[11px] text-red-500">Reason is required</p>
                              )}
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-semibold text-slate-700">
                                Remarks / Reason <span className="text-red-500">*</span>
                              </label>
                              <textarea
                                rows={3}
                                maxLength={500}
                                value={drug.remarks ?? ""}
                                onChange={e => updateDrug(drug.id, "remarks", e.target.value)}
                                placeholder="Enter reason / remarks..."
                                className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-200"
                              />
                              <p className="text-right text-[10px] text-slate-400">
                                {(drug.remarks ?? "").length}/500
                              </p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Supportive Medications ── */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setSupportiveOpen(v => !v)}
            className="flex w-full items-center justify-between px-5 py-3"
          >
            <div className="flex items-center gap-2">
              <i className="fa-solid fa-plus-circle text-blue-500 text-sm" />
              <h3 className="text-sm font-bold text-slate-800">Supportive Medications</h3>
            </div>
            <i className={`fa-solid fa-chevron-${supportiveOpen ? "up" : "down"} text-xs text-slate-400`} />
          </button>
          {supportiveOpen && (
            <div className="border-t border-slate-100 overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-5 py-2.5">#</th>
                    <th className="px-3 py-2.5">Medication</th>
                    <th className="px-3 py-2.5">Dose</th>
                    <th className="px-3 py-2.5">Route</th>
                    <th className="px-3 py-2.5">Dilution / Volume</th>
                    <th className="px-3 py-2.5">Infusion Rate</th>
                    <th className="px-3 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {SUPPORTIVE_MEDS.map(med => (
                    <tr key={med.id} className="border-t border-slate-50">
                      <td className="px-5 py-3 text-sm text-slate-600">{med.id}</td>
                      <td className="px-3 py-3 text-sm font-semibold text-slate-800">{med.name}</td>
                      <td className="px-3 py-3 text-sm text-slate-700">{med.dose}</td>
                      <td className="px-3 py-3 text-sm text-slate-700">{med.route}</td>
                      <td className="px-3 py-3 text-sm text-slate-700">{med.dilution}</td>
                      <td className="px-3 py-3 text-sm text-slate-700">{med.infusionRate}</td>
                      <td className="px-3 py-3"><StatusBadge status={med.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Post Medications ── */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setPostMedOpen(v => !v)}
            className="flex w-full items-center justify-between px-5 py-3"
          >
            <div className="flex items-center gap-2">
              <i className="fa-solid fa-capsules text-blue-500 text-sm" />
              <h3 className="text-sm font-bold text-slate-800">Post Medications</h3>
            </div>
            <i className={`fa-solid fa-chevron-${postMedOpen ? "up" : "down"} text-xs text-slate-400`} />
          </button>
          {postMedOpen && (
            <div className="border-t border-slate-100 overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-5 py-2.5">#</th>
                    <th className="px-3 py-2.5">Medication</th>
                    <th className="px-3 py-2.5">Dose</th>
                    <th className="px-3 py-2.5">Route</th>
                    <th className="px-3 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {POST_MEDS.map(med => (
                    <tr key={med.id} className="border-t border-slate-50">
                      <td className="px-5 py-3 text-sm text-slate-600">{med.id}</td>
                      <td className="px-3 py-3 text-sm font-semibold text-slate-800">{med.name}</td>
                      <td className="px-3 py-3 text-sm text-slate-700">{med.dose}</td>
                      <td className="px-3 py-3 text-sm text-slate-700">{med.route}</td>
                      <td className="px-3 py-3"><StatusBadge status={med.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Instructions ── */}
        <div className="mt-2 rounded-[16px] border border-[#e2e8f0] bg-white p-6 shadow-sm flex justify-between items-start">
          <div className="flex-1">
            <div className="mb-4 flex items-center text-[#1d4ed8]">
              <i className="fa-regular fa-file-lines mr-2" />
              <h4 className="text-sm font-bold">Instructions</h4>
            </div>
            <p className="mb-3 text-sm text-[#64748b]">Administration instructions from the selected regimen protocol:</p>
            {adminInstructions.length === 0 ? (
              <ul className="list-inside list-disc space-y-2 text-sm font-medium text-[#1e293b]">
                <li>No instructions recorded.</li>
              </ul>
            ) : (
              <ul className="space-y-3 text-sm text-[#1e293b]">
                {adminInstructions.map((instr, idx) => (
                  <li key={idx} className="rounded-[12px] border border-slate-100 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-bold text-[#1e293b]">{instr.medicineName || `Item ${idx + 1}`}</span>
                      {instr.dose && <span className="whitespace-nowrap text-xs text-[#64748b]">{instr.dose}</span>}
                    </div>
                    {(instr.route || instr.infusion || instr.frequency || instr.timing) && (
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#64748b]">
                        {instr.route     && <span>Route: {instr.route}</span>}
                        {instr.infusion  && <span>Infusion: {instr.infusion}</span>}
                        {instr.frequency && <span>Frequency: {instr.frequency}</span>}
                        {instr.timing    && <span>Timing: {instr.timing}</span>}
                      </div>
                    )}
                    {instr.administrationDetail && (
                      <p className="mt-1.5 text-xs text-[#475569]">{instr.administrationDetail}</p>
                    )}
                    {instr.remarks && (
                      <p className="mt-1.5 text-xs italic text-[#64748b]">{instr.remarks}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <a className="mt-4 inline-block text-sm font-semibold text-[#1d4ed8] underline" href="#">
              Investigation for Next Cycle: —
            </a>
          </div>
          <div className="ml-6 flex h-full w-[160px] flex-shrink-0 flex-col items-center justify-center rounded-[12px] border border-slate-200 bg-slate-50 p-5">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#1d4ed8]">NEXT CYCLE</div>
            <div className="flex items-center text-sm font-bold text-[#1d4ed8]">
              <i className="fa-regular fa-calendar mr-2" />
              {plan?.chemotherapy_cycle?.[0]?.next_cycle_date ?? "—"}
            </div>
          </div>
        </div>

      </div>

      {/* ─── RIGHT SIDEBAR ─── */}
      <div className="w-64 flex-shrink-0 space-y-4">

        {/* Quick Actions */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
            <i className="fa-solid fa-bolt text-xs text-yellow-500" />
            <h4 className="text-sm font-bold text-slate-800">Quick Actions</h4>
          </div>
          <div className="space-y-2 p-3">
            <button
              type="button"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
            >
              <i className="fa-solid fa-plus text-xs" />
              Add Administration
            </button>
            {[
              { icon: "fa-file-medical",     label: "View Protocol" },
              { icon: "fa-clipboard-list",   label: "View Orders" },
              { icon: "fa-print",            label: "Print MAR" },
              { icon: "fa-download",         label: "Download Report" },
            ].map(action => (
              <button
                key={action.label}
                type="button"
                className="flex w-full items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                <i className={`fa-solid ${action.icon} text-xs text-slate-400`} />
                {action.label}
              </button>
            ))}
          </div>
        </div>

        {/* Current Cycle */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
            <i className="fa-solid fa-rotate text-xs text-blue-500" />
            <h4 className="text-sm font-bold text-slate-800">Current Cycle</h4>
          </div>
          <div className="space-y-4 p-4">
            <p className="text-sm font-bold text-slate-900">
              Cycle {cycleNumber} - Day {currentDay}
            </p>
            <div>
              <div className="mb-1.5 flex items-center justify-end">
                <span className="text-xs font-semibold text-blue-600">
                  {currentDay} / {totalDays} Days
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-2 rounded-full bg-blue-600 transition-all"
                  style={{ width: `${(currentDay / totalDays) * 100}%` }}
                />
              </div>
            </div>
            <div>
              <p className="mb-0.5 text-xs text-slate-500">Next Cycle Date</p>
              <p className="text-sm font-semibold text-slate-800">12-Oct-2026</p>
            </div>
            <div>
              <p className="mb-0.5 text-xs text-slate-500">Regimen</p>
              <p className="text-sm font-semibold text-slate-800">{protocol}</p>
            </div>
          </div>
        </div>

        {/* Administration Details */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
            <i className="fa-solid fa-clipboard-list text-xs text-blue-500" />
            <h4 className="text-sm font-bold text-slate-800">Administration Details</h4>
          </div>
          <div className="space-y-3 p-4">
            {[
              { icon: "fa-user-nurse",    label: "Administered By", value: "Nurse Priya S (N001)" },
              { icon: "fa-user-doctor",   label: "Verified By",     value: "Dr. S. Kumar (D01)" },
              { icon: "fa-file-medical",  label: "Treatment Plan",  value: `AC - Cycle ${cycleNumber}` },
            ].map(item => (
              <div key={item.label} className="flex items-start gap-2.5">
                <i className={`fa-solid ${item.icon} mt-0.5 text-xs text-slate-400`} />
                <div>
                  <p className="text-[11px] text-slate-500">{item.label}</p>
                  <p className="text-xs font-semibold text-slate-800">{item.value}</p>
                </div>
              </div>
            ))}
            <div className="flex items-start gap-2.5">
              <i className="fa-solid fa-shield-check mt-0.5 text-xs text-slate-400" />
              <div>
                <p className="text-[11px] text-slate-500 mb-0.5">Double Check</p>
                <div className="flex items-center gap-3 text-xs text-slate-700">
                  <span className="flex items-center gap-1">
                    Nurse <i className="fa-solid fa-check text-[10px] text-green-600" />
                  </span>
                  <span className="flex items-center gap-1">
                    Pharmacist <i className="fa-solid fa-check text-[10px] text-green-600" />
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <i className="fa-solid fa-circle-check mt-0.5 text-xs text-slate-400" />
              <div>
                <p className="text-[11px] text-slate-500">Verification Status</p>
                <p className="text-xs font-semibold text-green-700">Completed</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <i className="fa-solid fa-spinner mt-0.5 text-xs text-slate-400" />
              <div>
                <p className="text-[11px] text-slate-500">Treatment Status</p>
                <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                  In Progress
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Previous Cycles */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <i className="fa-solid fa-clock-rotate-left text-xs text-blue-500" />
              <h4 className="text-sm font-bold text-slate-800">Previous Cycles</h4>
            </div>
            <button type="button" className="text-[11px] font-medium text-blue-600 hover:text-blue-800">
              View All
            </button>
          </div>
          <div className="divide-y divide-slate-50">
            {PREVIOUS_CYCLES.map(row => (
              <div key={row.cycle} className="flex items-start justify-between gap-2 px-4 py-3">
                <div>
                  <p className="text-xs font-semibold text-slate-800">{row.cycle}</p>
                  <p className="text-[11px] text-slate-500">{row.date}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400 leading-tight">{row.regimen}</p>
                </div>
                <span className="mt-0.5 flex-shrink-0 text-[11px] font-semibold text-green-600">
                  {row.status}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
