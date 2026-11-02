import * as React from "react";
import { Check, ChevronDown, Loader2, X, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { createPortal } from "react-dom";

export interface MultiSelectOption {
  label: string;
  value: string;
  badge?: string;
  group?: string;
}

export interface FormProtocolMultiSelectProps {
  options: MultiSelectOption[];
  values: string[];
  onValuesChange: (values: string[]) => void;
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}

export const FormProtocolMultiSelect: React.FC<FormProtocolMultiSelectProps> = ({
  options,
  values = [],
  onValuesChange,
  placeholder = "Select options...",
  emptyMessage = "No results found.",
  disabled = false,
  loading = false,
  className,
}) => {
  const [open, setOpen] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [coords, setCoords] = React.useState<{ top: number; left: number; width: number } | null>(null);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  const selectedOptions = React.useMemo(() => {
    return values
      .map((val) => options.find((opt) => opt.value === val))
      .filter((opt): opt is MultiSelectOption => Boolean(opt));
  }, [options, values]);

  const filteredOptions = React.useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) => opt.label.toLowerCase().includes(q));
  }, [options, searchTerm]);

  const updatePosition = React.useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      setOpen(false);
      return;
    }
    const fitsBelow = rect.bottom + 260 <= window.innerHeight;
    const top = fitsBelow ? rect.bottom + 4 : Math.max(8, rect.top - 264);
    setCoords({ top, left: rect.left, width: Math.max(rect.width, 220) });
  }, []);

  React.useEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, updatePosition]);

  React.useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        listRef.current &&
        !listRef.current.contains(target)
      ) {
        setOpen(false);
        setSearchTerm("");
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  React.useEffect(() => {
    if (open) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [open]);

  const toggleOption = (val: string) => {
    if (disabled) return;
    if (values.includes(val)) {
      onValuesChange(values.filter((v) => v !== val));
    } else {
      onValuesChange([...values, val]);
    }
  };

  const removeTag = (e: React.MouseEvent, val: string) => {
    e.stopPropagation();
    if (disabled) return;
    onValuesChange(values.filter((v) => v !== val));
  };

  const selectAll = () => {
    if (disabled) return;
    const all = Array.from(new Set([...values, ...filteredOptions.map((o) => o.value)]));
    onValuesChange(all);
  };

  const clearAll = () => {
    if (disabled) return;
    onValuesChange([]);
  };

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={() => {
          if (!disabled && !loading) {
            updatePosition();
            setOpen((prev) => !prev);
          }
        }}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !disabled && !loading) {
            e.preventDefault();
            updatePosition();
            setOpen((prev) => !prev);
          }
        }}
        className={cn(
          "w-full min-h-[38px] px-2.5 py-1.5 bg-[#f8fafc] border border-[#dde4ec] rounded-[11px] text-[13px] text-[#17212e] transition-all duration-150 flex items-center justify-between gap-1.5 cursor-pointer select-none",
          "overflow-hidden",
          "hover:border-[#c7d2dd] hover:bg-[#f5f8fb]",
          open && "border-[#12335c] bg-white ring-3 ring-[#12335c]/15",
          disabled && "bg-[#f1f3f5] text-[#9aa5b1] cursor-not-allowed border-[#dde4ec] hover:bg-[#f1f3f5] hover:border-[#dde4ec]"
        )}
      >
        <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
        <div
          className="flex items-center gap-1.5 flex-1 min-w-0 overflow-x-auto overflow-y-hidden hide-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden py-0.5"
          onWheel={(e) => {
            if (e.currentTarget.scrollWidth > e.currentTarget.clientWidth && e.deltaY !== 0) {
              e.currentTarget.scrollLeft += e.deltaY;
            }
          }}
        >
          {selectedOptions.length === 0 ? (
            <span className="text-[#a7b2bf] text-[13px] px-1 truncate">{placeholder}</span>
          ) : (
            selectedOptions.map((opt) => (
              <span
                key={opt.value}
                className="inline-flex shrink-0 items-center gap-1 px-2 py-0.5 rounded-md bg-[#eaf0f7] text-[#12335c] font-medium text-[12px] border border-[#d2e0f0] animate-in fade-in-50 duration-100 whitespace-nowrap"
              >
                <span className="max-w-[160px] truncate">{opt.label}</span>
                {!disabled && (
                  <button
                    type="button"
                    onClick={(e) => removeTag(e, opt.value)}
                    className="text-[#64748b] hover:text-[#0f172a] focus:outline-none p-0.5 rounded hover:bg-[#d8e5f3] transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            ))
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 text-[#8a97a6] pl-1">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          ) : (
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform duration-200 text-gray-400",
                open && "rotate-180"
              )}
            />
          )}
        </div>
      </div>

      </div>

      {open && !disabled && !loading && coords
        ? createPortal(
            <div
              ref={listRef}
              style={{
                position: "fixed",
                top: coords.top,
                left: coords.left,
                width: coords.width,
              }}
              className="z-[9999] max-h-72 slim-scrollbar overflow-hidden rounded-[11px] border border-[#dde4ec] bg-white shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15)] flex flex-col origin-top animate-in fade-in-50 zoom-in-95 duration-100"
            >
              {/* Search input header */}
              <div className="p-2 border-b border-[#edf1f5] bg-[#fafbfc] flex items-center gap-2">
                <Search className="h-3.5 w-3.5 text-[#8a97a6] shrink-0 ml-1" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-transparent text-[12.5px] text-[#17212e] placeholder:text-[#a7b2bf] outline-none"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm("")}
                    className="p-1 text-[#8a97a6] hover:text-[#17212e]"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              {/* Quick actions: Select all / Clear */}
              <div className="px-3 py-1.5 border-b border-[#edf1f5] bg-[#f8fafc] flex items-center justify-between text-[11px] font-semibold text-[#5b6b7c]">
                <span>{values.length} selected</span>
                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="text-[#12335c] hover:underline"
                  >
                    Select All
                  </button>
                  <span className="text-[#cbd5e1]">|</span>
                  <button
                    type="button"
                    onClick={clearAll}
                    className="text-[#c0374a] hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* Options list */}
              <div className="overflow-y-auto max-h-48 slim-scrollbar py-1">
                {filteredOptions.length === 0 ? (
                  <p className="px-4 py-3 text-center text-xs text-[#8a97a6]">
                    {emptyMessage}
                  </p>
                ) : (
                  (() => {
                    const hasGroups = filteredOptions.some((o) => !!o.group);
                    const renderItem = (opt: MultiSelectOption) => {
                      const isSelected = values.includes(opt.value);
                      return (
                        <div
                          key={opt.value}
                          onClick={() => toggleOption(opt.value)}
                          className={cn(
                            "flex items-center gap-2.5 px-3 py-2 text-[12.5px] cursor-pointer transition-colors select-none",
                            isSelected
                              ? "bg-[#edf4fb] text-[#12335c] font-medium"
                              : "text-[#17212e] hover:bg-[#f8fafc]"
                          )}
                        >
                          <div
                            className={cn(
                              "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                              isSelected
                                ? "bg-[#12335c] border-[#12335c] text-white"
                                : "border-[#cbd5e1] bg-white"
                            )}
                          >
                            {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                          </div>
                          <span className="flex-1 truncate">{opt.label}</span>
                          {opt.badge && (
                            <span className="text-[10px] bg-[#f1f5f9] text-[#64748b] px-1.5 py-0.5 rounded font-normal shrink-0">
                              {opt.badge}
                            </span>
                          )}
                        </div>
                      );
                    };

                    if (!hasGroups) {
                      return filteredOptions.map(renderItem);
                    }

                    // Group while preserving sequence
                    const groups: { name: string; items: MultiSelectOption[] }[] = [];
                    const groupMap = new Map<string, MultiSelectOption[]>();
                    for (const opt of filteredOptions) {
                      const gName = opt.group || "Other";
                      if (!groupMap.has(gName)) {
                        const items: MultiSelectOption[] = [];
                        groupMap.set(gName, items);
                        groups.push({ name: gName, items });
                      }
                      groupMap.get(gName)!.push(opt);
                    }

                    return groups.map((g) => (
                      <div key={g.name}>
                        <div className="px-3 py-1.5 text-[10px] font-bold text-[#8a97a6] bg-[#f8fafc] uppercase tracking-wider sticky top-0 border-y border-[#edf1f5] select-none">
                          {g.name}
                        </div>
                        {g.items.map(renderItem)}
                      </div>
                    ));
                  })()
                )}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
  };