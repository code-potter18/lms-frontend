import React, { useState } from "react";
import { Calendar } from "../../../components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../components/ui/popover";
import { formatPickedDate, maskDmyInput, parsePickedDate } from "./helpers";
import { CalendarIcon } from "./icons";

/* A date the doctor types (DD-MM-YYYY, auto-formatted) or picks from the
   calendar. Past days are disabled in the calendar by default. Used for an
   investigation's Target Date and the Advice's Follow-up Date. */
const DateInputField: React.FC<{
  id: string;
  value: string;
  onChange: (value: string) => void;
  /* Shown under the field and outlines it in red. */
  error?: string;
  ariaLabel?: string;
  allowPast?: boolean;
}> = ({ id, value, onChange, error, ariaLabel = "Pick a date", allowPast = false }) => {
  const [open, setOpen] = useState(false);
  const picked = parsePickedDate(value);

  return (
    <div className="flex flex-col gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <div className="relative">
          <input
            id={id}
            type="text"
            inputMode="numeric"
            value={value}
            onChange={(event) => onChange(maskDmyInput(event.target.value, value))}
            placeholder="DD-MM-YYYY"
            aria-invalid={Boolean(error)}
            className={`h-[38px] w-full rounded-md border bg-white pl-3 pr-9 text-[10px] leading-5 text-slate-700 outline-none placeholder:text-slate-400 ${
              error
                ? "border-red-300 focus:border-red-400"
                : "border-slate-200 focus:border-slate-400"
            }`}
          />

          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={ariaLabel}
              className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 transition-colors hover:text-blue-600 focus:outline-none [&_svg]:h-4 [&_svg]:w-4"
            >
              <CalendarIcon />
            </button>
          </PopoverTrigger>
        </div>

        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            selected={picked}
            defaultMonth={picked}
            disabled={
              allowPast
                ? undefined
                : (date) => {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    return date < today;
                  }
            }
            onSelect={(date) => {
              if (date instanceof Date) {
                onChange(formatPickedDate(date));
                setOpen(false);
              }
            }}
          />
        </PopoverContent>
      </Popover>

      {error && (
        <span className="text-[10px] leading-[14px] text-red-500">{error}</span>
      )}
    </div>
  );
};

export default DateInputField;
