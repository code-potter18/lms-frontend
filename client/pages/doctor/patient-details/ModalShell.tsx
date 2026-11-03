import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

const TONES = {
  red: "bg-red-50 text-red-500",
  blue: "bg-blue-50 text-blue-600",
  green: "bg-green-50 text-green-600",
  slate: "bg-slate-100 text-slate-600",
} as const;

/* The popup frame of the patient-details tabs: portaled overlay, a panel
   that scrolls inside on small screens, header (icon, title, subtitle,
   close) and an optional footer. Hand-rolled (not a Radix dialog) so the
   portaled suggestion lists of ComboInput don't count as outside clicks.
   Escape and a click on the backdrop call onClose unless busy. */
export function ModalShell({
  icon,
  tone = "blue",
  title,
  subtitle,
  maxWidth = "max-w-2xl",
  busy = false,
  onClose,
  footer,
  bodyRef,
  initialFocus,
  children,
}: {
  icon: string;
  tone?: keyof typeof TONES;
  title: string;
  subtitle?: React.ReactNode;
  maxWidth?: string;
  busy?: boolean;
  onClose: () => void;
  footer?: React.ReactNode;
  bodyRef?: React.Ref<HTMLDivElement>;
  /* CSS selector of the element to focus on open (default: the panel). */
  initialFocus?: string;
  children: React.ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = initialFocus ? panelRef.current?.querySelector<HTMLElement>(initialFocus) : null;
    (target ?? panelRef.current)?.focus();
  }, [initialFocus]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-2 backdrop-blur-sm sm:p-4"
      onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={e => { if (e.key === "Escape" && !busy) { e.stopPropagation(); onClose(); } }}
        className={`flex max-h-[95vh] w-full ${maxWidth} animate-[p360-pop_0.25s_ease-out] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl outline-none sm:max-h-[90vh]`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-start gap-3">
            <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${TONES[tone]}`}>
              <i className={`fa-solid ${icon}`} />
            </div>
            <div className="min-w-0">
              <h3 id={titleId} className="text-base font-bold text-slate-900">{title}</h3>
              {subtitle && <div className="truncate text-[10px] text-slate-500">{subtitle}</div>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
            aria-label="Close"
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div ref={bodyRef} className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {children}
        </div>

        {footer && (
          <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3 sm:px-5">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

/* Footer buttons in the system's modal style. */
export function ModalButton({
  variant = "secondary",
  busy = false,
  icon,
  className = "",
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "secondary" | "primary" | "danger" | "success";
  busy?: boolean;
  icon?: string;
}) {
  const look = {
    primary: "bg-blue-600 font-semibold text-white hover:bg-blue-700 active:scale-[0.98]",
    danger: "bg-red-600 font-semibold text-white hover:bg-red-700 active:scale-[0.98]",
    success: "bg-green-600 font-semibold text-white hover:bg-green-700 active:scale-[0.98]",
    secondary: "border border-slate-200 bg-white font-medium text-slate-700 hover:bg-slate-50",
  }[variant];
  return (
    <button
      type="button"
      {...props}
      className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm transition-all disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto ${look} ${className}`}
    >
      {busy ? <i className="fa-solid fa-spinner fa-spin text-[10px]" /> : icon ? <i className={`fa-solid ${icon} text-[10px]`} /> : null}
      {children}
    </button>
  );
}

/* ---------- read-only content blocks for the view popups ---------- */

export function ModalSection({ icon, title, aside, children }: { icon: string; title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center gap-2">
        <i className={`fa-solid ${icon} text-[11px] text-blue-500`} />
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{title}</h4>
        <div className="h-px flex-1 bg-slate-100" />
        {aside}
      </div>
      {children}
    </section>
  );
}

/* Label / value pairs; empty values show a dash. */
export function InfoGrid({ items }: { items: { label: string; value?: React.ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 sm:grid-cols-3">
      {items.map(item => (
        <div key={item.label} className="min-w-0">
          <dt className="text-[11px] text-slate-500">{item.label}</dt>
          <dd className="truncate text-sm font-semibold text-slate-800">
            {item.value === undefined || item.value === null || item.value === "" ? "—" : item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* A compact table that scrolls sideways on small screens. */
export function DetailTable<T>({
  rows,
  columns,
  rowKey,
  empty = "Nothing to show.",
}: {
  rows: T[];
  columns: { header: string; cell: (row: T) => React.ReactNode; className?: string }[];
  rowKey: (row: T, index: number) => string;
  empty?: string;
}) {
  if (rows.length === 0) {
    return <p className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-center text-[10px] text-slate-400">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-[560px] text-left text-[10px]">
        <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            {columns.map(column => (
              <th key={column.header} className="whitespace-nowrap px-3 py-2">{column.header}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, index) => (
            <tr key={rowKey(row, index)} className="hover:bg-slate-50/60">
              {columns.map(column => (
                <td key={column.header} className={`px-3 py-2 align-top text-slate-700 ${column.className ?? ""}`}>
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* Loading skeleton / error with retry for a popup that fetches its data. */
export function ModalLoadState({ loading, error, onRetry }: { loading: boolean; error: string; onRetry: () => void }) {
  if (loading) {
    return (
      <div className="animate-pulse space-y-3" aria-label="Loading">
        <div className="h-20 rounded-xl bg-slate-100" />
        <div className="h-4 w-40 rounded bg-slate-100" />
        <div className="h-32 rounded-lg bg-slate-100" />
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-center text-sm text-red-700">
      <span><i className="fa-solid fa-circle-exclamation mr-2" />{error}</span>
      <ModalButton onClick={onRetry} icon="fa-rotate-right">Retry</ModalButton>
    </div>
  );
}
