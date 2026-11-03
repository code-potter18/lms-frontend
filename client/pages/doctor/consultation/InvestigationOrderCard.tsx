import React from "react";
import VoiceToText from "@/components/ui/voicetotext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { targetDateError } from "./helpers";
import DateInputField from "./DateInputField";
import type { InvestigationOrderDetail, InvestigationPriority } from "./types";

/* ============================================================
   INVESTIGATION ORDER CARD
   One selected investigation in the Consultation step: clinical
   notes, Priority and Target Date. Lab Review sends these on the
   test's lab_order_item when it places the order.
   ============================================================ */

export const EMPTY_INVESTIGATION_DETAIL: InvestigationOrderDetail = {
  notes: "",
  priority: "Normal",
  targetDate: "",
};

const PRIORITY_OPTIONS: { value: InvestigationPriority; dot: string }[] = [
  { value: "Normal", dot: "bg-emerald-500" },
  { value: "Urgent", dot: "bg-red-500" },
];

const FIELD_LABEL =
  "text-[10px] font-bold uppercase leading-[15px] tracking-[0.5px] text-slate-400";

interface InvestigationOrderCardProps {
  index: number;
  name: string;
  detail: InvestigationOrderDetail;
  onChange: (patch: Partial<InvestigationOrderDetail>) => void;
  onRemove: () => void;
}

const InvestigationOrderCard: React.FC<InvestigationOrderCardProps> = ({
  index,
  name,
  detail,
  onChange,
  onRemove,
}) => {
  const urgent = detail.priority === "Urgent";
  const fieldId = `investigation-${index}`;

  return (
    <div
      className={`flex flex-col gap-2.5 rounded-lg border border-slate-200 bg-slate-50/60 p-3 ${
        urgent ? "border-l-4 border-l-red-400" : ""
      }`}
    >
      {/* Header: number, test name, urgent pill, remove */}
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700">
          {index + 1}
        </span>
        <span className="min-w-0 flex-1 truncate text-[10px] font-semibold leading-5 text-slate-700">
          {name}
        </span>
        {urgent && (
          <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.5px] text-red-600 ring-1 ring-red-200">
            Urgent
          </span>
        )}
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          title="Remove"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 transition hover:bg-slate-200 hover:text-slate-600"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </div>

      {/* Notes | Priority | Target Date */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-[minmax(0,1fr)_140px_170px]">
        <div className="flex flex-col gap-1.5 sm:col-span-2 md:col-span-1">
          <span className={FIELD_LABEL}>Clinical Notes</span>
          <VoiceToText
            rows={2}
            value={detail.notes}
            onChange={(text) => onChange({ notes: text })}
            placeholder={`Clinical notes for ${name}`}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL}>Priority</span>
          <Select
            value={detail.priority}
            onValueChange={(value) =>
              onChange({ priority: value as InvestigationPriority })
            }
          >
            <SelectTrigger
              aria-label={`Priority for ${name}`}
              className={`h-[38px] rounded-md text-[10px] shadow-none focus:ring-0 focus:ring-offset-0 ${
                urgent
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <span className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${option.dot}`} />
                    {option.value}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${fieldId}-target-date`} className={FIELD_LABEL}>
            Target Date
          </label>
          {/* Past days are disabled - it is when the result is needed. */}
          <DateInputField
            id={`${fieldId}-target-date`}
            value={detail.targetDate}
            onChange={(value) => onChange({ targetDate: value })}
            error={targetDateError(detail.targetDate)}
            ariaLabel="Pick target date"
          />
        </div>
      </div>
    </div>
  );
};

export default InvestigationOrderCard;
