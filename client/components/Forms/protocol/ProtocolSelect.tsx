import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { FormProtocolDropdown } from "@/components/ui/form-protocol-dropdown";
import { FormProtocolMultiSelect } from "@/components/ui/form-protocol-multiselect";
import { OTHERS_LABEL, PROTOCOL_OTHERS_INPUT_CLS } from "./protocolCore";

type ProtocolSelectOption = string | { label: string; value: string };

interface ProtocolSelectProps {
  options: ProtocolSelectOption[];
  value?: string;
  displayValue?: string;
  onValueChange?: (value: string) => void;
  onEditValue?: (text: string) => void;
  editableChip?: boolean;
  /* Offer a "+ Add '<typed>'" row when the typed text matches no option. */
  allowCreate?: boolean;
  allowFreeText?: boolean;
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}

export function ProtocolSelect({
  options,
  value,
  displayValue,
  onValueChange,
  onEditValue,
  editableChip,
  allowCreate,
  allowFreeText,
  placeholder,
  emptyMessage,
  disabled,
  loading,
  className,
}: ProtocolSelectProps) {
  const [othersMode, setOthersMode] = useState(value === OTHERS_LABEL);
  const [customText, setCustomText] = useState("");

  useEffect(() => {
    if (value === OTHERS_LABEL) setOthersMode(true);
  }, [value]);

  if (othersMode && !loading) {
    const shown = value === OTHERS_LABEL ? customText : value ?? "";
    return (
      <div className="relative w-full">
        <input
          value={shown}
          onChange={(e) => {
            const v = e.target.value;
            setCustomText(v);
            onValueChange?.(v === "" ? OTHERS_LABEL : v);
          }}
          placeholder="Type other..."
          disabled={disabled}
          className={`${PROTOCOL_OTHERS_INPUT_CLS} ${className ?? ""}`}
        />
        {!disabled ? (
          <button
            type="button"
            tabIndex={-1}
            aria-label="Back to options"
            onClick={() => {
              setOthersMode(false);
              setCustomText("");
              onValueChange?.("");
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <FormProtocolDropdown
      options={options}
      value={value}
      displayValue={displayValue}
      onEditValue={onEditValue}
      editableChip={editableChip}
      allowFreeText={allowFreeText ?? allowCreate}
      onValueChange={(v) => {
        if (v === OTHERS_LABEL) {
          setOthersMode(true);
          setCustomText("");
        } else {
          setOthersMode(false);
          setCustomText("");
        }
        onValueChange?.(v);
      }}
      onCreateOption={
        allowCreate && !disabled && !loading
          ? (typed) => {
              setOthersMode(false);
              setCustomText("");
              onValueChange?.(typed);
            }
          : undefined
      }
      placeholder={placeholder}
      emptyMessage={emptyMessage}
      disabled={disabled}
      loading={loading}
      className={className}
    />
  );
}

interface ProtocolMultiSelectProps {
  options: { label: string; value: string; group?: string }[];
  values: string[];
  onValuesChange: (values: string[]) => void;
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}

export function ProtocolMultiSelect({
  options,
  values,
  onValuesChange,
  placeholder,
  emptyMessage,
  disabled,
  loading,
  className,
}: ProtocolMultiSelectProps) {
  const [customOpts, setCustomOpts] = useState<{ label: string; value: string }[]>([]);
  const [customText, setCustomText] = useState("");
  const merged = [
    ...options,
    ...customOpts.filter((c) => !options.some((o) => o.value === c.value)),
  ];
  const showOthersInput = values.includes(OTHERS_LABEL);

  const addCustom = () => {
    const t = customText.trim();
    if (!t) return;
    setCustomOpts((prev) => [
      ...prev.filter((c) => c.value !== t),
      { label: t, value: t },
    ]);
    onValuesChange(values.filter((v) => v !== OTHERS_LABEL).concat(t));
    setCustomText("");
  };

  return (
    <div className="w-full">
      <FormProtocolMultiSelect
        options={merged}
        values={values}
        onValuesChange={onValuesChange}
        placeholder={placeholder}
        emptyMessage={emptyMessage}
        disabled={disabled}
        loading={loading}
        className={className}
      />
      {showOthersInput && !disabled ? (
        <div className="flex items-center gap-1.5 mt-1.5">
          <input
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
            placeholder="Type other..."
            className={`${PROTOCOL_OTHERS_INPUT_CLS} flex-1`}
          />
          <button
            type="button"
            onClick={addCustom}
            className="h-9 px-3 rounded-[11px] text-[12.5px] font-semibold bg-[#12335c] text-white hover:bg-[#0d2748] transition-colors focus:outline-none"
          >
            Add
          </button>
          <button
            type="button"
            aria-label="Remove others"
            onClick={() => {
              setCustomText("");
              onValuesChange(values.filter((v) => v !== OTHERS_LABEL));
            }}
            className="h-9 w-9 grid place-items-center rounded-[11px] border border-[#dde4ec] text-gray-400 hover:text-gray-600 hover:bg-[#f5f8fb] transition-colors focus:outline-none"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
