import type { ReactNode } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  FlaskConical,
  Pill,
  Plus,
  ShieldPlus,
  Syringe,
  Trash2,
} from "lucide-react";
import { cardCls, getFormIcon } from "./protocolCore";
import type {
  ChemoPlan,
  DilutionDetail,
  PostTreatment,
  Premed,
  SupportiveCare,
} from "./protocolCore";

interface BaseSectionProps {
  expanded: boolean;
  onToggle: () => void;
  disabled?: boolean;
  onOpenRow: (index: number) => void;
  onAdd: () => void;
  onDelete: (index: number) => void;
}

interface SectionShellProps {
  title: string;
  titleCls?: string;
  icon: ReactNode;
  iconWrapCls: string;
  countLabel: string;
  expanded: boolean;
  onToggle: () => void;
  outerToggle?: boolean;
  emptyIconWrapCls: string;
  emptyIcon: ReactNode;
  emptyTitle: string;
  emptyHint: string;
  addLabel: string;
  addBtnCls: string;
  disabled?: boolean;
  onAdd: () => void;
  isEmpty: boolean;
  children: ReactNode;
}

function SectionShell({
  title,
  titleCls,
  icon,
  iconWrapCls,
  countLabel,
  expanded,
  onToggle,
  outerToggle = true,
  emptyIconWrapCls,
  emptyIcon,
  emptyTitle,
  emptyHint,
  addLabel,
  addBtnCls,
  disabled,
  onAdd,
  isEmpty,
  children,
}: SectionShellProps) {
  const leftCls = `flex items-center gap-2.5 text-[13.5px] font-bold ${titleCls ?? "text-[#17212e]"}`;
  const leftContent = (
    <>
      <div className={`w-7 h-7 rounded-lg ${iconWrapCls} flex items-center justify-center`}>{icon}</div>
      <span>{title}</span>
      <span className="px-2 py-0.5 text-[11px] font-semibold bg-slate-100 text-slate-600 rounded-full">
        {countLabel}
      </span>
    </>
  );
  const chevron = expanded ? (
    <ChevronUp className="w-4 h-4 text-[#8a97a6]" />
  ) : (
    <ChevronDown className="w-4 h-4 text-[#8a97a6]" />
  );

  return (
    <div className={cardCls + " mb-5"}>
      {outerToggle ? (
        <div
          className="flex items-center justify-between px-6 py-[17px] cursor-pointer hover:bg-[#f8f9fb] transition-colors"
          onClick={onToggle}
        >
          <div className={leftCls}>{leftContent}</div>
          {chevron}
        </div>
      ) : (
        <div className="flex items-center justify-between px-6 py-[17px] hover:bg-[#f8f9fb] transition-colors">
          <div className={`${leftCls} cursor-pointer flex-1`} onClick={onToggle}>
            {leftContent}
          </div>
          <div className="flex items-center gap-2">
            <div className="cursor-pointer p-1" onClick={onToggle}>
              {chevron}
            </div>
          </div>
        </div>
      )}

      {expanded && (
        <div className="p-5 pt-0">
          {isEmpty ? (
            <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-xl my-2">
              <div className={`w-10 h-10 rounded-full ${emptyIconWrapCls} flex items-center justify-center mx-auto mb-2`}>
                {emptyIcon}
              </div>
              <p className="text-xs font-semibold text-slate-700">{emptyTitle}</p>
              <p className="text-[11px] text-slate-400 mt-1">{emptyHint}</p>
            </div>
          ) : (
            <div className="overflow-hidden border border-slate-200 rounded-xl bg-white shadow-2xs">
              <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <span>Prescription Overview (Click row to edit details)</span>
                <span>Status</span>
              </div>
              <div className="divide-y divide-slate-100">{children}</div>
            </div>
          )}

          {/* Bottom Add Bar */}
          <div className="px-5 py-3.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-center mt-3 rounded-xl">
            <button
              type="button"
              onClick={() => {
                if (disabled) return;
                onAdd();
              }}
              disabled={disabled}
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg shadow-2xs transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${addBtnCls}`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{addLabel}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface SectionRowProps {
  index: number;
  medName: string;
  form?: string;
  isReady: boolean;
  placeholder: string;
  disabled?: boolean;
  hoverCls: string;
  titleHoverCls: string;
  chevronCls: string;
  rightGapCls?: string;
  extraBadge?: ReactNode;
  summary: ReactNode;
  onOpen: () => void;
  onDelete: () => void;
}

function SectionRow({
  index,
  medName,
  form,
  isReady,
  placeholder,
  disabled,
  hoverCls,
  titleHoverCls,
  chevronCls,
  rightGapCls = "gap-2.5",
  extraBadge,
  summary,
  onOpen,
  onDelete,
}: SectionRowProps) {
  return (
    <div
      onClick={onOpen}
      className={`p-3.5 ${hoverCls} cursor-pointer transition flex items-center justify-between group gap-3`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-xs font-mono text-slate-400 font-semibold w-6 shrink-0">
          {String(index + 1).padStart(2, "0")}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold text-slate-900 ${titleHoverCls} transition truncate`}>
              {medName || <span className="italic text-slate-400 font-normal">{placeholder}</span>}
            </span>
            {form && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200/80">
                {getFormIcon(form)}
                <span>{form}</span>
              </span>
            )}
            {extraBadge}
          </div>
          {summary}
        </div>
      </div>

      <div className={`flex items-center ${rightGapCls} shrink-0`}>
        {isReady ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <Check className="w-3 h-3 text-emerald-600" /> Ready
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            Incomplete
          </span>
        )}

        {!disabled && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="Delete row"
            className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition opacity-60 group-hover:opacity-100"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}

        <div className={`w-7 h-7 rounded-lg bg-slate-100 ${chevronCls} text-slate-400 flex items-center justify-center transition`}>
          <ChevronRight className="w-3.5 h-3.5" />
        </div>
      </div>
    </div>
  );
}

export function PremedSection({
  rows,
  expanded,
  onToggle,
  disabled,
  onOpenRow,
  onAdd,
  onDelete,
  resolveName,
}: BaseSectionProps & { rows: Premed[]; resolveName: (row: Premed) => string }) {
  return (
    <SectionShell
      title="Pre-medications"
      icon={<Pill className="w-4 h-4" />}
      iconWrapCls="bg-sky-50 text-sky-600"
      countLabel={`${rows.length} ${rows.length === 1 ? "drug" : "drugs"}`}
      expanded={expanded}
      onToggle={onToggle}
      emptyIconWrapCls="bg-sky-50 text-sky-600"
      emptyIcon={<Pill className="w-5 h-5" />}
      emptyTitle="No pre-medications added"
      emptyHint={'Click the "Add Medication Row" button below to create one.'}
      addLabel="Add Medication Row"
      addBtnCls="text-sky-600 hover:text-sky-700 bg-white hover:bg-sky-50 border border-sky-200"
      disabled={disabled}
      onAdd={onAdd}
      isEmpty={rows.length === 0}
    >
      {rows.map((row, idx) => (
        <SectionRow
          key={idx}
          index={idx}
          medName={resolveName(row)}
          form={row.form}
          isReady={!!row.medication?.trim()}
          placeholder="Select medication..."
          disabled={disabled}
          hoverCls="hover:bg-sky-50/50"
          titleHoverCls="group-hover:text-sky-700"
          chevronCls="group-hover:bg-sky-100 group-hover:text-sky-700"
          onOpen={() => onOpenRow(idx)}
          onDelete={() => onDelete(idx)}
          summary={
            <p className="text-xs text-slate-500 mt-1 truncate">
              {row.dose ? `${row.dose} ${row.unit || ""}` : "No dose specified"}
              {row.adminNotes ? ` • ${row.adminNotes}` : ""}
              {row.remarks ? ` (Remark: ${row.remarks})` : ""}
            </p>
          }
        />
      ))}
    </SectionShell>
  );
}

export function ChemoPlanSection({
  rows,
  expanded,
  onToggle,
  disabled,
  onOpenRow,
  onAdd,
  onDelete,
  resolveName,
}: BaseSectionProps & { rows: ChemoPlan[]; resolveName: (row: ChemoPlan) => string }) {
  return (
    <SectionShell
      title="Chemotherapy Plan"
      icon={<Syringe className="w-4 h-4" />}
      iconWrapCls="bg-indigo-50 text-indigo-600"
      countLabel={`${rows.length} ${rows.length === 1 ? "drug" : "drugs"}`}
      expanded={expanded}
      onToggle={onToggle}
      outerToggle={false}
      emptyIconWrapCls="bg-indigo-50 text-indigo-600"
      emptyIcon={<Syringe className="w-5 h-5" />}
      emptyTitle="No chemotherapy drugs added"
      emptyHint={'Click the "Add Chemotherapy Drug" button below to create one.'}
      addLabel="Add Chemotherapy Drug"
      addBtnCls="text-indigo-600 hover:text-indigo-700 bg-white hover:bg-indigo-50 border border-indigo-200"
      disabled={disabled}
      onAdd={onAdd}
      isEmpty={rows.length === 0}
    >
      {rows.map((row, idx) => (
        <SectionRow
          key={idx}
          index={idx}
          medName={resolveName(row)}
          form={row.form}
          isReady={!!row.medication?.trim()}
          placeholder="Select chemo drug..."
          disabled={disabled}
          hoverCls="hover:bg-sky-50/50"
          titleHoverCls="group-hover:text-indigo-700"
          chevronCls="group-hover:bg-indigo-100 group-hover:text-indigo-700"
          rightGapCls="gap-2"
          extraBadge={
            row.doseCalc ? (
              <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-2 py-0.5 rounded-full">
                {row.doseCalc}
              </span>
            ) : undefined
          }
          onOpen={() => onOpenRow(idx)}
          onDelete={() => onDelete(idx)}
          summary={
            <p className="text-xs text-slate-500 mt-1 truncate">
              <span className="font-medium text-slate-700">
                {row.dose ? `${row.dose} ${row.unit || ""}` : "No dose"}
              </span>
              {row.adminNotes ? ` • ${row.adminNotes}` : ""}
              {row.toxicity ? ` (Toxicity: ${row.toxicity})` : ""}
              {row.remarks ? ` (Remark: ${row.remarks})` : ""}
            </p>
          }
        />
      ))}
    </SectionShell>
  );
}

export function SupportiveSection({
  rows,
  expanded,
  onToggle,
  disabled,
  onOpenRow,
  onAdd,
  onDelete,
  resolveName,
}: BaseSectionProps & { rows: SupportiveCare[]; resolveName: (row: SupportiveCare) => string }) {
  return (
    <SectionShell
      title="Supportive Care"
      icon={<ShieldPlus className="w-4 h-4" />}
      iconWrapCls="bg-emerald-50 text-emerald-600"
      countLabel={`${rows.length} ${rows.length === 1 ? "drug" : "drugs"}`}
      expanded={expanded}
      onToggle={onToggle}
      emptyIconWrapCls="bg-emerald-50 text-emerald-600"
      emptyIcon={<ShieldPlus className="w-5 h-5" />}
      emptyTitle="No supportive care medications added"
      emptyHint={'Click the "Add Supportive Medicine" button below to create one.'}
      addLabel="Add Supportive Medicine"
      addBtnCls="text-emerald-700 hover:text-emerald-800 bg-white hover:bg-emerald-50 border border-emerald-200"
      disabled={disabled}
      onAdd={onAdd}
      isEmpty={rows.length === 0}
    >
      {rows.map((row, idx) => (
        <SectionRow
          key={idx}
          index={idx}
          medName={resolveName(row)}
          form={row.form}
          isReady={!!row.medication?.trim()}
          placeholder="Select supportive medicine..."
          disabled={disabled}
          hoverCls="hover:bg-emerald-50/40"
          titleHoverCls="group-hover:text-emerald-700"
          chevronCls="group-hover:bg-emerald-100 group-hover:text-emerald-700"
          onOpen={() => onOpenRow(idx)}
          onDelete={() => onDelete(idx)}
          summary={
            <p className="text-xs text-slate-500 mt-1 truncate">
              {row.dose ? `${row.dose} ${row.unit || ""}` : "No dose specified"}
              {row.adminNotes ? ` • ${row.adminNotes}` : ""}
              {row.remarks ? ` (Remark: ${row.remarks})` : ""}
            </p>
          }
        />
      ))}
    </SectionShell>
  );
}

export function DilutionSection({
  rows,
  expanded,
  onToggle,
  disabled,
  onOpenRow,
  onAdd,
  onDelete,
  resolveName,
}: BaseSectionProps & { rows: DilutionDetail[]; resolveName: (row: DilutionDetail) => string }) {
  return (
    <SectionShell
      title="Dilution Details"
      icon={<FlaskConical className="w-4 h-4" />}
      iconWrapCls="bg-amber-50 text-amber-600"
      countLabel={`${rows.length} ${rows.length === 1 ? "dilution" : "dilutions"}`}
      expanded={expanded}
      onToggle={onToggle}
      emptyIconWrapCls="bg-amber-50 text-amber-600"
      emptyIcon={<FlaskConical className="w-5 h-5" />}
      emptyTitle="No dilution details added"
      emptyHint={'Click the "Add Dilution Row" button below to create one.'}
      addLabel="Add Dilution Row"
      addBtnCls="text-amber-700 hover:text-amber-800 bg-white hover:bg-amber-50 border border-amber-200"
      disabled={disabled}
      onAdd={onAdd}
      isEmpty={rows.length === 0}
    >
      {rows.map((row, idx) => (
        <SectionRow
          key={idx}
          index={idx}
          medName={resolveName(row)}
          form={row.form}
          isReady={!!row.medication?.trim()}
          placeholder="Select dilution drug..."
          disabled={disabled}
          hoverCls="hover:bg-amber-50/40"
          titleHoverCls="group-hover:text-amber-700"
          chevronCls="group-hover:bg-amber-100 group-hover:text-amber-700"
          onOpen={() => onOpenRow(idx)}
          onDelete={() => onDelete(idx)}
          summary={
            <p className="text-xs text-slate-500 mt-1 truncate">
              <span className="font-medium text-slate-700">
                {row.dose ? `${row.dose} ${row.unit || ""}` : "No dose"}
              </span>
              {row.volume ? (
                <span className="text-amber-800">
                  {` in ${row.volume} ${row.volumeUnit || "CC"}`}
                </span>
              ) : ""}
              {row.diluent ? (
                <span className="text-slate-600 font-medium">
                  {` (${row.diluent})`}
                </span>
              ) : ""}
            </p>
          }
        />
      ))}
    </SectionShell>
  );
}

export function PostTreatmentSection({
  rows,
  expanded,
  onToggle,
  disabled,
  onOpenRow,
  onAdd,
  onDelete,
  resolveName,
}: BaseSectionProps & { rows: PostTreatment[]; resolveName: (row: PostTreatment) => string }) {
  return (
    <SectionShell
      title="Post-treatment Medications (On Discharge)"
      titleCls="text-[#c0374a]"
      icon={<ClipboardList className="w-4 h-4" />}
      iconWrapCls="bg-rose-50 text-rose-600"
      countLabel={`${rows.length} ${rows.length === 1 ? "medication" : "medications"}`}
      expanded={expanded}
      onToggle={onToggle}
      emptyIconWrapCls="bg-rose-50 text-rose-600"
      emptyIcon={<ClipboardList className="w-5 h-5" />}
      emptyTitle="No post-treatment medications added"
      emptyHint={'Click the "Add Discharge Medication" button below to create one.'}
      addLabel="Add Discharge Medication"
      addBtnCls="text-rose-600 hover:text-rose-700 bg-white hover:bg-rose-50 border border-rose-200"
      disabled={disabled}
      onAdd={onAdd}
      isEmpty={rows.length === 0}
    >
      {rows.map((row, idx) => (
        <SectionRow
          key={idx}
          index={idx}
          medName={resolveName(row)}
          form={row.form}
          isReady={!!row.medication?.trim()}
          placeholder="Select discharge medication..."
          disabled={disabled}
          hoverCls="hover:bg-rose-50/40"
          titleHoverCls="group-hover:text-rose-700"
          chevronCls="group-hover:bg-rose-100 group-hover:text-rose-700"
          onOpen={() => onOpenRow(idx)}
          onDelete={() => onDelete(idx)}
          summary={
            <p className="text-xs text-slate-500 mt-1 truncate">
              <span className="font-medium text-slate-700">
                {row.dose ? `${row.dose} ${row.unit || ""}` : "No dose"}
              </span>
              {row.frequency ? ` • ${row.frequency}` : ""}
              {row.duration ? ` • ${row.duration} ${row.durationDays || "D"}` : ""}
              {row.instructions ? ` • ${row.instructions}` : ""}
              {row.remarks ? ` (Remark: ${row.remarks})` : ""}
            </p>
          }
        />
      ))}
    </SectionShell>
  );
}
