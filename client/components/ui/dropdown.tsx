import { useState, useRef, useEffect, useId, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

/**
 * Dropdown — an accessible, keyboard-friendly select replacement.
 *
 * Renders its option list INLINE inside its own wrapper (no portal). That is
 * what makes it work inside the modal Radix dialogs (AddWardDialog /
 * AddBedDialog): Radix pins `pointer-events: none` on everything outside the
 * dialog layer while a modal is open, so FormDropdown's document.body-portaled
 * list could be seen but never clicked. Anything rendered here stays inside the
 * dialog content and stays selectable.
 *
 * Props
 *  options     Array<{ value: string, label: string, disabled?: boolean }>
 *  value       Selected value (controlled). Omit to let the component manage it.
 *  onChange    (value) => void
 *  placeholder Text shown when nothing is selected
 *  label       Visible label above the trigger
 *  disabled    Disables the whole control
 *  className   Merged onto the root wrapper (defaults to `w-64`)
 *
 * Keyboard: up/down move, Home/End jump, Enter/Space select, Esc closes,
 * typing a letter jumps to the first matching option.
 */
export interface DropdownOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface DropdownProps {
  options?: DropdownOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  className?: string;
  // Merged onto the trigger button, after its own classes, so a toolbar can
  // match its row height (e.g. BedMaster's h-[34px] controls) without the
  // dialogs' taller default leaking into it. `cn` collapses conflicting
  // utilities, so this wins over py-*/text-*.
  triggerClassName?: string;
}

export function Dropdown({
  options = [],
  value,
  onChange,
  placeholder = "Select an option",
  label,
  disabled = false,
  className,
  triggerClassName,
}: DropdownProps) {
  const [internal, setInternal] = useState<string | null>(null);
  const selected = value !== undefined ? value : internal;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const id = useId();

  const selectedOption = options.find((o) => o.value === selected);
  const enabledIdx = options
    .map((o, i) => (o.disabled ? -1 : i))
    .filter((i) => i >= 0);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Keep the active option in view
  useEffect(() => {
    if (!open || active < 0 || !listRef.current) return;
    listRef.current.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const openList = () => {
    if (disabled) return;
    const idx = options.findIndex((o) => o.value === selected);
    setActive(idx >= 0 ? idx : (enabledIdx[0] ?? -1));
    setOpen(true);
  };

  const choose = (i: number) => {
    const opt = options[i];
    if (!opt || opt.disabled) return;
    if (value === undefined) setInternal(opt.value);
    onChange?.(opt.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const move = (dir: number) => {
    const pos = enabledIdx.indexOf(active);
    const next =
      enabledIdx[Math.min(Math.max(pos + dir, 0), enabledIdx.length - 1)];
    if (next !== undefined) setActive(next);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        break;
      case "Home":
        e.preventDefault();
        setActive(enabledIdx[0]);
        break;
      case "End":
        e.preventDefault();
        setActive(enabledIdx[enabledIdx.length - 1]);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        choose(active);
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        if (e.key.length === 1) {
          const ch = e.key.toLowerCase();
          const match = options.findIndex(
            (o) => !o.disabled && o.label.toLowerCase().startsWith(ch),
          );
          if (match >= 0) setActive(match);
        }
    }
  };

  return (
    <div ref={rootRef} className={cn("relative w-64", className)}>
      {label && (
        <label
          id={`${id}-label`}
          className="block mb-1.5 text-sm font-medium text-stone-700"
        >
          {label}
        </label>
      )}

      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={label ? `${id}-label ${id}-btn` : undefined}
        aria-controls={`${id}-list`}
        aria-activedescendant={
          open && active >= 0 ? `${id}-opt-${active}` : undefined
        }
        id={`${id}-btn`}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className={cn(
          `flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm
            bg-white transition-colors
            focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-1
            ${open ? "border-teal-700" : "border-stone-300 hover:border-stone-400"}
            ${disabled ? "cursor-not-allowed bg-stone-100 text-stone-400" : "text-stone-900"}`,
          triggerClassName,
        )}
      >
        <span className={selectedOption ? "" : "text-stone-400"}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <svg
          className={`h-4 w-4 text-stone-500 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" />
        </svg>
      </button>

      {open && (
        <ul
          ref={listRef}
          id={`${id}-list`}
          role="listbox"
          aria-labelledby={label ? `${id}-label` : undefined}
          className="absolute z-10 mt-1 max-h-60 w-full overflow-auto slim-scrollbar rounded-md border border-stone-200 bg-white py-1 text-sm shadow-lg"
        >
          {options.length === 0 && (
            <li className="px-3 py-2 text-stone-400">No options available</li>
          )}
          {options.map((opt, i) => {
            const isSelected = opt.value === selected;
            const isActive = i === active;
            return (
              <li
                key={opt.value}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={isSelected}
                aria-disabled={opt.disabled || undefined}
                onMouseEnter={() => !opt.disabled && setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(i)}
                className={`flex cursor-pointer items-center justify-between px-3 py-2
                  ${opt.disabled ? "cursor-not-allowed text-stone-300" : "text-stone-800"}
                  ${isActive && !opt.disabled ? "bg-teal-50" : ""}
                  ${isSelected ? "font-medium text-teal-800" : ""}`}
              >
                {opt.label}
                {isSelected && (
                  <svg
                    className="h-4 w-4 text-teal-700"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 111.4-1.4l3.8 3.8 6.8-6.8a1 1 0 011.4 0z" />
                  </svg>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default Dropdown;
