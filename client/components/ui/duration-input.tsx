import React from "react";
import {
  DURATION_UNIT_OPTIONS,
  normalizeDurationUnit,
  type DurationUnit,
} from "@/utils/duration";

interface DurationInputProps {
  value: string;
  unit: DurationUnit | string;
  onValueChange: (value: string) => void;
  onUnitChange: (unit: DurationUnit) => void;
  disabled?: boolean;
  /* Extra classes for the wrapper (e.g. flex-1, shrink-0). */
  className?: string;
}

/* Numeric duration + day/week/month/year selector. The value is kept as
   a string while editing so the field can be blank. */
export const DurationInput: React.FC<DurationInputProps> = ({
  value,
  unit,
  onValueChange,
  onUnitChange,
  disabled = false,
  className = "",
}) => (
  <div className={`flex shrink-0 items-center gap-1 ${className}`}>
    <input
      type="number"
      min={0}
      max={9999}
      step={1}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      disabled={disabled}
      placeholder="Duration"
      aria-label="Duration value"
      className="h-7 w-20 min-w-0 rounded-md border border-slate-200 bg-white px-2 text-xs leading-4 text-slate-600 outline-none disabled:cursor-not-allowed disabled:bg-slate-50"
    />

    <select
      value={normalizeDurationUnit(unit)}
      onChange={(event) => onUnitChange(event.target.value as DurationUnit)}
      disabled={disabled}
      aria-label="Duration unit"
      className="h-7 w-[74px] shrink-0 appearance-none rounded-md border border-slate-200 bg-white px-2 text-xs leading-4 text-slate-600 outline-none disabled:cursor-not-allowed disabled:bg-slate-50"
    >
      {DURATION_UNIT_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.plural}
        </option>
      ))}
    </select>
  </div>
);

export default DurationInput;
