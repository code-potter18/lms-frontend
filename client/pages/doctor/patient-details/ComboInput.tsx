import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/* A text input with a suggestion list: pick an option or keep the typed
   text. The list is portaled to <body> at a fixed position (z 9999) so it
   shows above the hand-rolled modals of this tab (z 100) and doesn't count
   as an outside click for them. */
export function ComboInput({
  id,
  value,
  onChange,
  options,
  placeholder = "Select or type...",
  hasError = false,
  filter = false,
  maxLength = 500,
  freeTextOption = "Others",
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  hasError?: boolean;
  /* Narrow the list to options containing the typed text. */
  filter?: boolean;
  maxLength?: number;
  /* An option that clears the input for free text instead of being picked. */
  freeTextOption?: string;
}) {
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
    window.addEventListener("resize", updatePos);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [open]);

  const borderCls = hasError ? "border-red-300" : "border-slate-200";
  const typed = value.trim().toLowerCase();
  const isOption = options.some(option => option.toLowerCase() === typed);
  const shown = filter && typed && !isOption
    ? options.filter(option => option.toLowerCase().includes(typed))
    : options;

  function openDropdown() {
    if (inputRef.current) setRect(inputRef.current.getBoundingClientRect());
    setOpen(true);
  }

  return (
    <div className="relative">
      <input
        id={id}
        ref={inputRef}
        type="text"
        value={value}
        maxLength={maxLength}
        onChange={e => { onChange(e.target.value); if (e.target.value) openDropdown(); }}
        onKeyDown={e => {
          if (e.key === "Enter" && value) { e.preventDefault(); setOpen(false); }
          /* Escape closes this list first, not the dialog around it. */
          if (e.key === "Escape" && open) { e.stopPropagation(); setOpen(false); }
        }}
        onFocus={openDropdown}
        placeholder={placeholder}
        autoComplete="off"
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
          className="max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          {value && !isOption && (
            <button
              type="button"
              onMouseDown={e => { e.preventDefault(); onChange(value); setOpen(false); }}
              className="flex w-full items-center px-3 py-2 text-left text-sm font-medium text-blue-600 hover:bg-blue-50"
            >
              <i className="fa-solid fa-plus mr-2 text-[10px]" />
              "{value}"
            </button>
          )}
          {shown.map(option => (
            <button
              key={option}
              type="button"
              onMouseDown={e => {
                e.preventDefault();
                const freeText = option === freeTextOption;
                onChange(freeText ? "" : option);
                setOpen(false);
                if (freeText) inputRef.current?.focus();
              }}
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50 ${value === option ? "font-semibold text-blue-600" : "text-slate-700"}`}
            >
              {option}
              {value === option && <i className="fa-solid fa-check text-[10px] text-blue-500" />}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
