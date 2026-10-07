import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FilterField } from "./types";

// Default draft/applied values a filter panel starts with and returns to on
// Clear -- taken from any field that declares `defaultValue` (e.g. a Status
// field defaulting to ["Active"] so "Leave"/"Inactive" rows stay hidden
// until the user explicitly selects them in the filter).
function panelDefaults(fields?: FilterField[]): Record<string, any> {
  const defaults: Record<string, any> = {};
  for (const field of fields ?? []) {
    if (field.defaultValue !== undefined) {
      defaults[field.id] = field.defaultValue;
    }
  }
  return defaults;
}

export function useFilterPanel(fields?: FilterField[]) {
  // Keyed on the CONTENT of the defaults, not on `fields` itself. Nearly every
  // page builds its field array inline (`useFilterPanel([...])`), so `fields` is
  // a brand-new array on every render; memoizing on it produced a new `defaults`
  // object every render, which gave `handleClear` a new identity every render --
  // the same unstable-reference trap that caused an infinite setState loop in
  // any effect listing one of these handlers as a dependency. `panelDefaults`
  // only copies scalar/array `defaultValue`s, so serializing it is cheap and
  // yields a stable primitive to depend on.
  const defaultsKey = JSON.stringify(panelDefaults(fields));
  const defaults = useMemo<Record<string, any>>(
    () => JSON.parse(defaultsKey),
    [defaultsKey]
  );

  const [draftValues, setDraftValues] = useState<Record<string, any>>(defaults);
  const [appliedValues, setAppliedValues] = useState<Record<string, any>>(defaults);
  const [isOpen, setIsOpen] = useState(false);

  // Latest draft, readable from a stable callback. Lets `handleApply` apply the
  // values on screen right now without depending on `draftValues` (which would
  // hand it a new identity on every keystroke). Layout effects run before any
  // click handler can fire, so the ref is always current when it is read.
  const draftRef = useRef(draftValues);
  useLayoutEffect(() => {
    draftRef.current = draftValues;
  }, [draftValues]);

  // All four handlers MUST keep a stable identity across renders. Consumers
  // legitimately put them in `useEffect` dependency arrays (e.g. to reset a
  // panel when the selected branch changes); if they changed every render those
  // effects would re-run on every render and setState forever.
  const handleChange = useCallback((name: string, value: any) => {
    setDraftValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleApply = useCallback(() => {
    setAppliedValues({ ...draftRef.current });
    setIsOpen(false);
  }, []);

  const handleClear = useCallback(() => {
    setDraftValues(defaults);
    setAppliedValues(defaults);
  }, [defaults]);

  const setAppliedFilter = useCallback((name: string, value: any) => {
    setDraftValues((prev) => ({ ...prev, [name]: value }));
    setAppliedValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  return {
    values: draftValues,
    appliedValues,
    isOpen,
    setIsOpen,
    handleChange,
    handleApply,
    handleClear,
    setAppliedFilter,
  };
}
