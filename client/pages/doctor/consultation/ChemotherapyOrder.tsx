import React, { useEffect, useRef, useState, useMemo } from "react";
import { useLocation } from "react-router-dom";
import API from "../../../api/axios";
import {
  chemotherapyApi,
  isChemoPlanClosed,
  type ChemoPlanHydration,
  type ChemoPlanItem,
  type ChemoPlanOrder,
  type ChemoPlanOrderHeader,
} from "../../../api/chemotherapy.api";
import { getUser } from "../../../utils/token";
import { Calendar } from "../../../components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../components/ui/popover";
import { UserProfileDropdown } from "../../../components/ui/User_profile_dropdown";
import VoiceToText from "@/components/ui/voicetotext";
import type {
  ConsultationState,
  Drug,
  MeasurementValues,
  RegimenProtocolDay,
  RegimenProtocolDetail,
  RegimenProtocolDilution,
  RegimenProtocolItem,
} from "./types";
import {
  COURSE_CLOSED_MESSAGE,
  createChemotherapyPlanForPatient,
  findActiveEncounter,
  formatDateDMY,
  orderDosingFromSnapshot,
  formatPickedDate,
  parseDateValue,
  parsePickedDate,
  toIsoDate,
} from "./helpers";
import { BackIcon, BellIcon, CheckIcon } from "./icons";
import { SingleSelectDropdown } from "../../../components/ui/single-select-dropdown";
import type { MultiSelectOption } from "../../../components/ui/multi-select-dropdown";
import {
  DOSE_CALC_OPTIONS,
  buildDosingSnapshot,
  buildPlanItemsFromOrder,
  computePatientDose,
  defaultDoseCalc,
  normalizeDoseCalc,
  normalizeLegacyDraftDrug,
  parseSex,
  resolveDoseCalc,
  resolveTargetAuc,
  summarizeDosingInputs,
  toPositiveNumber,
  type DosingInputs,
  type PatientDoseResult,
} from "./doseCalculation";

/* ============================================================
   CHEMOTHERAPY ORDER COMPONENT
   (combined from client/pages/doctor/chemo.tsx 
    renamed App-style component ChemotherapyOrder to the same
    embedded pattern as LabReview / Diagnosis / DischargeMedication,
    icons moved inside the component to avoid colliding with the
    module-level CheckIcon / BackIcon, original chemo.tsx file
    left untouched)
============================================================ */

/* Parse a MeasurementValues height/weight/bsa string like "170 cm",
   "70 kg", "1.8 m²" back to a number. */
const parseMeasureString = (value: string): number | null => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

/* A saved plan item (baseline or a cycle day order's row): a
   medicine_master drug, or - medicine_id null - a drug name typed for this
   patient (drug_name). */
type ChemotherapyPlanItem = ChemoPlanItem;

/* chemotherapy_plan_hydration row. */
type PlanHydrationRecord = ChemoPlanHydration;

/* Editable Hydration tab row: the plan's own saved list, or a copy of the
   protocol's hydration template (document Section 3). */
type HydrationRow = {
  id: number;
  sourceDilutionId: string | null;
  stage: "PRE" | "POST";
  agent: string;
  diluent: string;
  volume: string;
  volumeUnit: string;
  guidance: string;
};

const dilutionToHydrationRow = (
  dilution: RegimenProtocolDilution,
  index: number
): HydrationRow => ({
  id: index,
  sourceDilutionId: dilution.protocol_dilution_id,
  stage: (dilution.hydration_stage ?? "").toUpperCase() === "POST" ? "POST" : "PRE",
  agent:
    dilution.medicine_master?.medicine_name || dilution.drug_brand_name || "",
  diluent: dilution.diluent ?? "",
  volume:
    dilution.dilution_volume != null ? String(Number(dilution.dilution_volume)) : "",
  volumeUnit: dilution.dilution_volume_unit ?? "",
  guidance: dilution.comment ?? "",
});

/* The Dilution tab's template row: a protocol DILUTION DETAILS entry
   (item-attached or protocol-level) as a table row. The volume and its unit
   travel together in `volume` ("500 mL"), the one column the plan item
   stores, and `dilutionSolution` / `administrationDetail` carry the diluent
   and the comment. An item-attached dilution without a medicine of its own
   is the dilution of its item's drug, so it takes that drug's name. */
const protocolDilutionToDrug = (
  dilution: RegimenProtocolDilution,
  index: number,
  item?: RegimenProtocolItem
): Drug => ({
  id: index,
  name:
    dilution.medicine_master?.medicine_name ||
    dilution.drug_brand_name ||
    (!dilution.medicine_id || dilution.medicine_id === item?.medicine_id
      ? item?.medicine_master?.medicine_name ||
        item?.medicine_master?.generic_name
      : "") ||
    "",
  form: dilution.form ?? "",
  dose: dilution.dose != null ? String(Number(dilution.dose)) : "",
  unit: dilution.dose_unit ?? "",
  volume: [
    dilution.dilution_volume != null ? String(Number(dilution.dilution_volume)) : "",
    dilution.dilution_volume_unit ?? "",
  ]
    .filter(Boolean)
    .join(" "),
  medicineId: dilution.medicine_id ?? item?.medicine_id ?? undefined,
  dilutionSolution: dilution.diluent ?? null,
  administrationDetail: dilution.comment ?? null,
});

const planHydrationToRow = (
  record: PlanHydrationRecord,
  index: number
): HydrationRow => ({
  id: index,
  sourceDilutionId: record.source_dilution_id,
  stage: record.hydration_stage === "POST" ? "POST" : "PRE",
  agent: record.agent_name ?? "",
  diluent: record.diluent ?? "",
  volume:
    record.dilution_volume != null ? String(Number(record.dilution_volume)) : "",
  volumeUnit: record.dilution_volume_unit ?? "",
  guidance: record.guidance ?? "",
});

type ChemotherapyPlan = {
  chemotherapy_plan_id: string;
  source_protocol_id?: string | null;
  protocol_name: string | null;
  regimen_name: string | null;
  regimen_code: string | null;
  treatment_start_date: string | null;
  planned_cycles: number | null;
  completed_cycles: number | null;
  treatment_status: string | null;
  chemotherapy_cycle: {
    cycle_number: number;
    cycle_day: number | null;
  }[] | null;
  chemotherapy_plan_items: ChemotherapyPlanItem[] | null;
  chemotherapy_regimen_protocol: {
    protocol_id: string;
    regimen_code: string | null;
    regimen_name: string | null;
  } | null;
  /* Saved cycle day orders (by cycle / day) and the current one. */
  plan_orders?: ChemoPlanOrderHeader[] | null;
  current_order?: ChemoPlanOrder | null;
};

const orderKey = (cycle: number, day: number) => `${cycle}/${day}`;

const byCycleDay = (a: ChemoPlanOrderHeader, b: ChemoPlanOrderHeader) =>
  a.cycle_number - b.cycle_number || a.cycle_day - b.cycle_day;

/* A cycle closed by its last day (or cancelled) takes no more orders. */
const isClosedCycleOrder = (order: ChemoPlanOrderHeader) =>
  ["COMPLETED", "CANCELLED"].includes(
    String(order.chemotherapy_cycle?.cycle_status ?? "").toUpperCase()
  );

/* The Hydration tab rows as saved on a cycle day order. */
const hydrationPayload = (rows: HydrationRow[]) =>
  rows.map((row) => ({
    source_dilution_id: row.sourceDilutionId,
    hydration_stage: row.stage,
    agent_name: row.agent.trim() || null,
    diluent: row.diluent.trim() || null,
    dilution_volume: row.volume.trim() ? Number(row.volume) : null,
    dilution_volume_unit: row.volumeUnit.trim() || null,
    guidance: row.guidance.trim() || null,
  }));

/* Marks a Drug Name value that is a typed name, not a medicine. */
const CUSTOM_DRUG_VALUE = "__custom_drug__";

type RowKind = "drug" | "premedication" | "supportive" | "dilution";

const ChemotherapyOrder: React.FC<{
  embedded?: boolean;
  patientId?: string;
  measurements?: MeasurementValues;
  gender?: string;
  age?: string | number | null;
  onNext?: () => void;
}> = ({
  embedded = false,
  patientId,
  measurements,
  gender,
  age,
  onNext,
}) => {
  const [userAvatarUrl, setUserAvatarUrl] = useState<string>(() => localStorage.getItem("user_photo") || "");
  const [avatarLoading, setAvatarLoading] = useState<boolean>(() => !localStorage.getItem("user_photo"));

  const location = useLocation();
  const statePatientId = (
    (location.state as ConsultationState | null)?.patientId ?? ""
  );
  const resolvedPatientId = patientId || statePatientId;

  /* Serum creatinine for Cockcroft-Gault CrCl, used by Carboplatin -
     Calvert rows. It is a lab value, not a vital, so it is entered here. */
  const [serumCreatinine, setSerumCreatinine] = useState("");

  /* Inputs every PRIMARY row's Dose Cal formula uses: height / weight
     from the banner vitals, age / sex from the patient record. */
  const dosingInputs: DosingInputs = useMemo(
    () => ({
      heightCm: parseMeasureString(measurements?.height ?? ""),
      weightKg: parseMeasureString(measurements?.weight ?? ""),
      ageYears: toPositiveNumber(age),
      sex: parseSex(gender),
      serumCreatinine: toPositiveNumber(serumCreatinine),
    }),
    [measurements?.height, measurements?.weight, age, gender, serumCreatinine]
  );
  const dosingSummary = summarizeDosingInputs(dosingInputs);

  const [cycleDay, setCycleDay] = useState("");
  const [startDate, setStartDate] = useState("");
  const [activeTab, setActiveTab] = useState("Chemotherapy Orders");
  const [cycleDayOpen, setCycleDayOpen] = useState(false);
  const [protocolName, setProtocolName] = useState("");
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState("");
  const [discussion, setDiscussion] = useState("");
  const [postChemoInstructions, setPostChemoInstructions] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");

  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [premedicationDrugs, setPremedicationDrugs] = useState<Drug[]>(
    []
  );
  const [supportiveDrugs, setSupportiveDrugs] = useState<Drug[]>([]);
  const [dilutionDrugs, setDilutionDrugs] = useState<Drug[]>([]);

  const userTouched = useRef({
    cycleDay: false,
    startDate: false,
    drugs: false,
    premedication: false,
    supportive: false,
    dilution: false,
    hydration: false,
  });

  const protocolRef = useRef<RegimenProtocolDetail | null>(null);
  const protocolDaysRef = useRef<RegimenProtocolDay[]>([]);
  const cycleDayRef = useRef<string>("");
  const planIdRef = useRef<string>("");
  /* Snapshot of the previously-scheduled next cycle, captured at the very
     start of mount (before any ref/plan/protocol loads rewrite the shared
     localStorage key), so a returning patient's order can resume at the
     exact cycle/day the last visit scheduled. */
  const storedNextCycleRef = useRef<string>("");
  const planItemsRef = useRef<ChemotherapyPlanItem[]>([]);
  const selectedProtocolIdRef = useRef<string>("");

  /* Hydration tab rows (template copy, or the plan's own saved list). */
  const [hydrationRows, setHydrationRows] = useState<HydrationRow[]>([]);
  const [hydrationDraft, setHydrationDraft] = useState<HydrationRow | null>(
    null
  );

  /* The plan's saved cycle day orders: headers (by cycle / day) and the
     full orders loaded so far, keyed "cycle/day". The tables show the
     displayed cycle day's order, else the protocol template for that day. */
  const [planOrders, setPlanOrders] = useState<ChemoPlanOrderHeader[]>([]);
  const planOrdersRef = useRef<ChemoPlanOrderHeader[]>([]);
  const ordersRef = useRef<Map<string, ChemoPlanOrder>>(new Map());
  const [orderLoading, setOrderLoading] = useState(false);
  const loadingOrderKeysRef = useRef<Set<string>>(new Set());
  /* The plan (one course) is completed / discontinued / cancelled. */
  const [planClosed, setPlanClosed] = useState(false);
  /* The protocol day the tables show (a rest day snaps to the next). */
  const displayedDayRef = useRef<number | null>(null);
  const [displayedDay, setDisplayedDay] = useState<number | null>(null);
  const encounterNoRef = useRef<string>("");
  /* "Copy as Cycle X / Day Y": copy an earlier cycle day's order. */
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);
  const copyMenuRef = useRef<HTMLDivElement>(null);
  const [copying, setCopying] = useState(false);

  /* medicine_master for the Drug Name editor, loaded on the first edit. */
  const [medicineOptions, setMedicineOptions] = useState<MultiSelectOption[]>(
    []
  );
  const medicinesRequestedRef = useRef(false);
  /* Route of each medicine_master drug, to prefill an empty Route. */
  const medicineRoutesRef = useRef<Map<string, string>>(new Map());
  /* A row added with "Add Medicine" that hasn't been saved yet: Cancel
     drops it again. */
  const newRowRef = useRef<{ kind: RowKind | "hydration"; id: number } | null>(
    null
  );

  /* Edit-in-place state (medication rows) */
  const [editingRow, setEditingRow] = useState<{
    kind: RowKind | "hydration";
    id: number;
    /* The table the row is edited in: its own tab, Admin Instructions or
       Hydration. */
    view: "row" | "admin" | "hydration";
  } | null>(null);
  const [editDraft, setEditDraft] = useState<Drug | null>(null);
  const [savingPlan, setSavingPlan] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");

  /* Single source of truth for cycle/day: always keeps the ref in sync
     with the state so async protocol loads filter by the CURRENT day
     (never a stale mount-time closure). */
  const updateCycleDay = (value: string) => {
    cycleDayRef.current = value;
    setCycleDay(value);
  };

  const applyNextCycle = (
    protocol: RegimenProtocolDetail | null,
    baseDateValue?: string | null
  ) => {
    if (!protocol || !resolvedPatientId) return;

    const interval =
      protocol.cycle_interval_days && protocol.cycle_interval_days > 0
        ? protocol.cycle_interval_days
        : null;
    const maxCycles =
      protocol.standard_cycles && protocol.standard_cycles > 0
        ? protocol.standard_cycles
        : Number.POSITIVE_INFINITY;

    /* The cycle/day to be administered on this visit is whatever the
       previous visit scheduled as its "next" (hms_next_cycle). This makes
       the order advance day-by-day within the cycle (Cycle 2 / Day 1 ->
       Cycle 2 / Day 2 -> ...) and roll to the next cycle's Day 1 once a
       cycle completes, instead of always starting at Day 1.
       The stored value is authoritative when the patient has a recorded
       cycle in the DB OR an active treatment plan exists (the plan the
       doctor already saved - so the next scheduled cycle/day is honored
       even before a cycle record exists). A truly brand-new treatment
       (no plan and no recorded cycle) must always present Cycle 1 / Day
       1, never a leftover hms_next_cycle value from an abandoned earlier
       session - which this very function (and the follow-up effect) also
       rewrite during the same mount. */
    /* A plan with saved cycle day orders resumes from them instead: its
       first day still ORDERED, else the day after the last completed. */
    const storedParsed =
      cycleDayFromOrders(protocol) ??
      (planIdRef.current
        ? getCycleAndDay(storedNextCycleRef.current)
        : null);

    let formCycleNumber = storedParsed ? storedParsed.cycle : 1;
    if (formCycleNumber > maxCycles) {
      formCycleNumber = maxCycles;
    }
    const formCycleDay = storedParsed ? storedParsed.day : 1;

    // Never auto-land on a rest day. Once a cycle's meds are entered the
    // next scheduled visit should skip to the next day that actually has
    // drugs in the protocol (some cycles have fewer medication days).
    const snappedFormDay =
      nextAvailableDay(protocol, formCycleDay) ?? formCycleDay;

    const baseDate = parseDateValue(baseDateValue) ?? new Date();
    const baseStart = new Date(baseDate);
    baseStart.setHours(0, 0, 0, 0);

    const formDate = new Date(baseStart);
    formDate.setDate(
      formDate.getDate() + (formCycleNumber - 1) * interval
    );

    const formatDate = (date: Date) => {
      const day = String(date.getDate()).padStart(2, "0");
      const month = String(date.getMonth() + 1).padStart(2, "0");
      return `${day}-${month}-${date.getFullYear()}`;
    };

    const formCycleStr = `Cycle ${formCycleNumber} / Day ${snappedFormDay}`;
    const nextAvailable = nextAvailableDay(protocol, snappedFormDay + 1);
    const nextCycleStr =
      nextAvailable != null
        ? `Cycle ${formCycleNumber} / Day ${nextAvailable}`
        : computeNextCycle(formCycleStr, protocol.no_of_days);

    const next = getCycleAndDay(nextCycleStr);
    const nextCycleNumber = (next?.cycle ?? formCycleNumber) > maxCycles
      ? maxCycles
      : (next?.cycle ?? formCycleNumber);

    const nextDate = new Date(baseStart);
    nextDate.setDate(
      nextDate.getDate() + (nextCycleNumber - 1) * interval
    );

    updateCycleDay(formCycleStr);
    setStartDate(formatDate(formDate));
    localStorage.setItem(
      `hms_next_cycle_${resolvedPatientId}`,
      nextCycleStr
    );
    localStorage.setItem(
      `hms_next_cycle_date_${resolvedPatientId}`,
      formatDate(nextDate)
    );
  };

  /* ------------------------------------------------------------
     CYCLE-DAY DRIVEN DRUG FILTERING
     The regimen protocol endpoint returns chemotherapy_regimen_
     protocol_days (one entry per cycle day, each carrying its own
     nested items, and some days marked same_as_day_one). The drugs
     shown in the Chemotherapy Orders / Premedication / Supportive
     tables must reflect only the day selected in the Cycle/Day field
     (some protocols run >6 days, some <6, some exactly 6).
  ------------------------------------------------------------ */

  const getCycleDayNumber = (value: string): number | null => {
    const match = value.trim().match(/Day\s*(\d+)/i);
    return match ? Number(match[1]) : null;
  };

  const getCycleNumber = (value: string): number | null => {
    const match = value.trim().match(/Cycle\s*(\d+)/i);
    return match ? Number(match[1]) : null;
  };

  const getCycleAndDay = (
    value: string
  ): { cycle: number; day: number } | null => {
    const cycle = getCycleNumber(value);
    const day = getCycleDayNumber(value);
    if (cycle === null || day === null) return null;
    return { cycle, day };
  };

  /* Given the CURRENT cycle/day being treated and the protocol's days
     per cycle (no_of_days), compute the next scheduled day:
       - same cycle, next day while the cycle has more days to run
       - next cycle, Day 1 once the current cycle's last day completes
     Rest days (days with no drugs) are skipped using the protocol's
     actual medication days, so protocols with >6 / <6 / exactly 6 days
     advance correctly. */
  const computeNextCycle = (
    cycleDayValue: string,
    noOfDays: number | null
  ): string => {
    const current = getCycleAndDay(cycleDayValue);
    if (!current) return "";
    const protocol = protocolRef.current;
    const medDays = getAvailableDays(protocol);
    const daysPerCycle =
      noOfDays && noOfDays > 0
        ? noOfDays
        : medDays.length > 0
        ? Math.max(...medDays)
        : 6;
    const lastDay = medDays.length > 0 ? medDays[medDays.length - 1] : daysPerCycle;
    if (medDays.length > 0) {
      if (current.day >= lastDay) {
        return `Cycle ${current.cycle + 1} / Day ${medDays[0] ?? 1}`;
      }
      const nextMedDay = medDays.find((d) => d > current.day);
      return `Cycle ${current.cycle} / Day ${nextMedDay ?? (medDays[0] ?? 1)}`;
    }
    if (current.day < daysPerCycle) {
      return `Cycle ${current.cycle} / Day ${current.day + 1}`;
    }
    return `Cycle ${current.cycle + 1} / Day 1`;
  };

  /* The cycle / day a plan with saved orders resumes at: the first day
     still ORDERED (on an open cycle), else the medication day after the
     latest COMPLETED one. Null without saved orders. */
  const cycleDayFromOrders = (
    protocol: RegimenProtocolDetail | null
  ): { cycle: number; day: number } | null => {
    const orders = planOrdersRef.current;
    const pending = orders.find(
      (order) => order.order_status !== "COMPLETED" && !isClosedCycleOrder(order)
    );
    if (pending) return { cycle: pending.cycle_number, day: pending.cycle_day };
    const last = [...orders]
      .reverse()
      .find((order) => order.order_status === "COMPLETED");
    if (!last) return null;
    return getCycleAndDay(
      computeNextCycle(
        `Cycle ${last.cycle_number} / Day ${last.cycle_day}`,
        protocol?.no_of_days ?? null
      )
    );
  };

  /* A protocol item's day within a cycle, using the field the backend
     actually populates (administration_day) or, failing that, the legacy
     cycle_day. Items without any explicit day belong to Day 1. */
  const protocolItemDay = (item: RegimenProtocolItem): number => {
    const d = Number(item.administration_day ?? item.cycle_day);
    return Number.isFinite(d) && d > 0 ? d : 1;
  };

  /* The distinct cycle days that actually have medication in the protocol,
     derived from the flat items' day (administration_day ?? cycle_day).
     Protocols with rest days (e.g. day 2 has no drugs) simply won't list
     that day here. */
  const getAvailableDays = (
    protocol: RegimenProtocolDetail | null | undefined
  ): number[] => {
    const set = new Set<number>();
    (protocol?.chemotherapy_regimen_protocol_items ?? []).forEach((item) => {
      set.add(protocolItemDay(item));
    });
    return [...set].sort((a, b) => a - b);
  };

  /* The first day >= fromDay that has drugs, so auto-advance never lands
     on a rest day. Returns null when fromDay has passed the last med day
     of the cycle (roll to the next cycle). */
  const nextAvailableDay = (
    protocol: RegimenProtocolDetail | null | undefined,
    fromDay: number
  ): number | null => {
    const days = getAvailableDays(protocol);
    if (days.length === 0) return null;
    return days.find((d) => d >= fromDay) ?? null;
  };

  const resolveProtocolDayItems = (
    days: RegimenProtocolDay[] | null | undefined,
    dayNumber: number
  ): RegimenProtocolItem[] => {
    const entries = days ?? [];

    // A day marked same_as_day_one mirrors the medicines of day 1.
    if (entries.length > 0) {
      const day = entries.find((d) => d.day_number === dayNumber);
      if (day?.same_as_day_one && dayNumber !== 1) {
        const firstDay = entries.find((d) => d.day_number === 1);
        if (firstDay) {
          dayNumber = 1;
        }
      }
    }

    // The daily breakdown is not an array of items per day; instead the
    // flat chemotherapy_regimen_protocol_items rows carry a day (either
    // administration_day or cycle_day) that maps them onto a protocol
    // day. Filter them the same way the backend's day view does.
    const flat = protocolRef.current?.chemotherapy_regimen_protocol_items ?? [];
    return flat.filter((item) => protocolItemDay(item) === dayNumber);
  };

  const toDrugFromItem = (
    item: RegimenProtocolItem,
    index: number
  ): Drug => ({
    id: index,
    name:
      item.medicine_master?.medicine_name ||
      item.medicine_master?.generic_name ||
      "",
    form:
      item.medicine_master?.dosage_form ||
      item.administration_route ||
      "",
    /* Protocol dose as written (mg/m², mg/kg, ...); the Patient Dose
       column applies the row's Dose Cal formula. The unit comes from the
       protocol only - medicine_master.unit is "mg" for almost every drug
       and would turn per-m² doses into flat ones. */
    dose: item.dosage != null ? String(Number(item.dosage)) : "",
    unit: item.dosage_unit || "",
    volume: "",
    medicineId: item.medicine_id,
    drugType: item.drug_type ?? null,
    protocolDoseCalc: item.dose_calculation_method ?? null,
    doseCalc: defaultDoseCalc(item.dosage_unit, item.dose_calculation_method),
    route: item.administration_route ?? "",
    infusionType: item.infusion_type ?? "",
    infusionDuration:
      item.infusion_duration_minutes != null
        ? String(item.infusion_duration_minutes)
        : "",
    frequency: item.frequency ?? "",
    timing: item.timing_relative_to_primary ?? "",
    remarks: item.remarks ?? "",
    administrationDetail: item.administration_detail ?? "",
  });

  /* A saved plan item as a table row - a medicine, or the drug name typed
     for this patient. The protocol's own method hint (e.g. "AUC 5") comes
     from the matching template item. */
  const planItemToDrug = (item: ChemotherapyPlanItem, index: number): Drug => {
    const template = item.medicine_id
      ? (protocolRef.current?.chemotherapy_regimen_protocol_items ?? []).find(
          (candidate) =>
            candidate.medicine_id === item.medicine_id &&
            (candidate.drug_role ?? "").toUpperCase() ===
              (item.drug_role ?? "").toUpperCase()
        )
      : undefined;
    const numberOrNull = (value: string | number | null | undefined) =>
      value != null && Number.isFinite(Number(value)) ? Number(value) : null;
    return {
      id: index,
      planItemId: item.chemotherapy_plan_item_id,
      name:
        item.medicine_master?.medicine_name ||
        item.medicine_master?.generic_name ||
        item.drug_name ||
        "",
      form: item.formulation || item.medicine_master?.dosage_form || "",
      dose: item.protocol_dose != null ? String(Number(item.protocol_dose)) : "",
      unit: item.protocol_dose_unit || "",
      volume: item.dilution_volume != null ? `${item.dilution_volume}` : "",
      medicineId: item.medicine_id ?? undefined,
      drugType: item.drug_type ?? null,
      infusionRate: item.infusion_rate ?? null,
      dilutionSolution: item.dilution_solution ?? null,
      maximumDose: numberOrNull(item.maximum_dose),
      minimumDose: numberOrNull(item.minimum_dose),
      doseCalc: normalizeDoseCalc(item.dose_calculation_method) ?? undefined,
      protocolDoseCalc: template?.dose_calculation_method ?? null,
      route: item.administration_route ?? "",
      infusionType: item.infusion_type ?? "",
      infusionDuration:
        item.infusion_duration_minutes != null
          ? String(item.infusion_duration_minutes)
          : "",
      frequency: item.frequency ?? "",
      timing: item.timing_relative_to_primary ?? "",
      remarks: item.remarks ?? "",
      administrationDetail: item.administration_detail ?? "",
    };
  };

  const planItemsForRole = (items: ChemotherapyPlanItem[], role: string) =>
    items
      .filter((item) => (item.drug_role ?? "").toUpperCase() === role)
      .sort((a, b) => (a.drug_sequence ?? 0) - (b.drug_sequence ?? 0))
      .map(planItemToDrug);

  /* A saved order's Dilution rows. An order saved while the template
     listed every item-attached dilution twice stored each one twice; an
     exact repeat of an earlier row is dropped (the next save of the day
     stores the list without it). */
  const savedDilutionRows = (items: ChemotherapyPlanItem[]) => {
    const seen = new Set<string>();
    return planItemsForRole(items, "DILUTION").filter((drug) => {
      const key = JSON.stringify([
        drug.medicineId ?? drug.name.trim().toLowerCase(),
        drug.form,
        drug.dose,
        drug.unit,
        drug.volume,
        drug.dilutionSolution ?? "",
        drug.administrationDetail ?? "",
      ]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const templateHydration = () =>
    (protocolRef.current?.protocol_dilutions ?? [])
      .filter((dilution) => !!dilution.hydration_stage)
      .sort((a, b) => {
        const rank = (stage: string | null) =>
          (stage ?? "").toUpperCase() === "PRE" ? 0 : 1;
        const byStage = rank(a.hydration_stage) - rank(b.hydration_stage);
        if (byStage !== 0) return byStage;
        return (a.diluent ?? "").localeCompare(b.diluent ?? "");
      })
      .map(dilutionToHydrationRow);

  /* The Dilution tab's template for the selected cycle day: the protocol
     dilutions attached to the items of THIS day (a dilution inherits its
     item's day), plus the protocol-level dilutions, which carry no day of
     their own and so apply to every day of the protocol.
     protocol_dilutions holds EVERY active dilution of the protocol (with its
     medicine), item-attached ones included, and each item's
     chemotherapy_protocol_dilutions repeats those (without the medicine) -
     so each dilution is read once, by protocol_dilution_id, preferring the
     protocol_dilutions copy. */
  const templateDilutions = (dayNumber: number | null): Drug[] => {
    const items = protocolRef.current?.chemotherapy_regimen_protocol_items ?? [];
    const itemById = new Map(items.map((item) => [item.protocol_item_id, item]));

    const byId = new Map<string, RegimenProtocolDilution>();
    for (const dilution of protocolRef.current?.protocol_dilutions ?? []) {
      byId.set(dilution.protocol_dilution_id, dilution);
    }
    for (const item of items) {
      for (const dilution of item.chemotherapy_protocol_dilutions ?? []) {
        if (byId.has(dilution.protocol_dilution_id)) continue;
        byId.set(dilution.protocol_dilution_id, {
          ...dilution,
          protocol_item_id: dilution.protocol_item_id ?? item.protocol_item_id,
        });
      }
    }

    /* The items of this day (a same-as-day-1 day uses day 1's). */
    const dayItemIds = new Set(
      dayNumber != null
        ? resolveProtocolDayItems(protocolDaysRef.current, dayNumber).map(
            (item) => item.protocol_item_id
          )
        : []
    );

    const all = [...byId.values()];
    /* Detached protocol-level rows first, then the day's own, so a whole
       protocol's dilutions always read the same way. */
    const protocolLevel = all.filter((dilution) => !dilution.protocol_item_id);
    const attached = all.filter(
      (dilution) =>
        !!dilution.protocol_item_id && dayItemIds.has(dilution.protocol_item_id)
    );

    return [...protocolLevel, ...attached].map((dilution, index) =>
      protocolDilutionToDrug(
        dilution,
        index,
        dilution.protocol_item_id
          ? itemById.get(dilution.protocol_item_id)
          : undefined
      )
    );
  };

  /* Keeps a saved cycle day order (from a load or a save) and its header. */
  const cacheOrder = (order: ChemoPlanOrder | null | undefined) => {
    if (!order) return;
    ordersRef.current.set(orderKey(order.cycle_number, order.cycle_day), order);
    const previous = planOrdersRef.current.find(
      (header) => header.plan_order_id === order.plan_order_id
    );
    const next = [
      ...planOrdersRef.current.filter(
        (header) => header.plan_order_id !== order.plan_order_id
      ),
      {
        ...order,
        chemotherapy_cycle:
          order.chemotherapy_cycle ?? previous?.chemotherapy_cycle ?? null,
      },
    ].sort(byCycleDay);
    planOrdersRef.current = next;
    setPlanOrders(next);
  };

  const loadOrder = async (cycle: number, day: number) => {
    if (!planIdRef.current) return null;
    const response = await chemotherapyApi.getPlanOrder(
      planIdRef.current,
      cycle,
      day
    );
    const order = response.data.data;
    cacheOrder(order);
    return order ?? null;
  };

  const applyCycleDayDrugs = (
    dayValue: string,
    days: RegimenProtocolDay[] | null | undefined
  ) => {
    let dayNumber = getCycleDayNumber(dayValue);

    // If the selected day is a rest day (or not parseable) but the
    // protocol has medication days, snap forward to the next day that
    // actually has drugs so the tables are never empty. Explicitly valid
    // medication days are left untouched.
    const available = getAvailableDays(protocolRef.current);
    if (available.length > 0 && (dayNumber == null || !available.includes(dayNumber))) {
      const fallback =
        available.find((d) => d >= (dayNumber ?? 1)) ?? available[0];
      dayNumber = fallback;
    }

    displayedDayRef.current = dayNumber ?? null;
    setDisplayedDay(dayNumber ?? null);
    const cycleNumber = getCycleNumber(dayValue) ?? 1;

    /* A different cycle day: any open row edit (or unsaved added row)
       belongs to the old one. */
    newRowRef.current = null;
    setEditingRow(null);
    setEditDraft(null);
    setHydrationDraft(null);

    /* The saved order of this cycle day (every tab, including Hydration)
       wins over the protocol template. One saved but not loaded yet is
       fetched first. */
    const key = dayNumber != null ? orderKey(cycleNumber, dayNumber) : "";
    const saved = key ? ordersRef.current.get(key) : undefined;
    const savedHeader = key
      ? planOrdersRef.current.find(
          (order) =>
            order.cycle_number === cycleNumber && order.cycle_day === dayNumber
        )
      : undefined;

    if (!saved && savedHeader && dayNumber != null) {
      setDrugs([]);
      setPremedicationDrugs([]);
      setSupportiveDrugs([]);
      setDilutionDrugs([]);
      setHydrationRows([]);
      if (loadingOrderKeysRef.current.has(key)) return;
      loadingOrderKeysRef.current.add(key);
      setOrderLoading(true);
      loadOrder(cycleNumber, dayNumber)
        .catch((error) => {
          console.error("Failed to load the cycle day order:", error);
          setEditError(
            errorMessage(error, "Failed to load the saved order for this day.")
          );
        })
        .finally(() => {
          loadingOrderKeysRef.current.delete(key);
          setOrderLoading(loadingOrderKeysRef.current.size > 0);
          /* Still showing that cycle day: show its rows now. */
          if (
            ordersRef.current.has(key) &&
            getCycleNumber(cycleDayRef.current) === cycleNumber &&
            displayedDayRef.current === dayNumber
          ) {
            applyCycleDayDrugs(cycleDayRef.current, protocolDaysRef.current);
          }
        });
      return;
    }

    if (saved) {
      const items = saved.chemotherapy_plan_items ?? [];
      setDrugs(planItemsForRole(items, "PRIMARY"));
      setPremedicationDrugs(planItemsForRole(items, "PREMEDICATION"));
      setSupportiveDrugs(planItemsForRole(items, "SUPPORTIVE"));
      /* A saved day that has no dilution rows of its own still shows the
         protocol's rows for that day, the same way an unsaved day does. */
      {
        const savedDilutions = savedDilutionRows(items);
        const hasRealDilutions =
          savedDilutions.length > 0 &&
          savedDilutions.some((d) => (d.name ?? "").trim());
        setDilutionDrugs(
          hasRealDilutions ? savedDilutions : templateDilutions(dayNumber)
        );
      }
      setHydrationRows(
        saved.hydration_saved
          ? (saved.chemotherapy_plan_hydration ?? []).map(planHydrationToRow)
          : templateHydration()
      );
      return;
    }

    /* Else the protocol template for this day. */
    {
      // Show only the medicines mapped to the selected cycle's day.
      // Protocols with items that have no explicit day treat all of them as
      // Day 1. If a valid day is missing, show nothing (never dump the whole
      // cycle across every day).
      const items =
        dayNumber != null ? resolveProtocolDayItems(days, dayNumber) : [];

      setDrugs(
        items
          .filter((item) => item.drug_role === "PRIMARY")
          .map(toDrugFromItem)
      );
      setPremedicationDrugs(
        items
          .filter((item) => item.drug_role?.toUpperCase() === "PREMEDICATION")
          .map(toDrugFromItem)
      );
      setSupportiveDrugs(
        items
          .filter((item) => item.drug_role === "SUPPORTIVE")
          .map(toDrugFromItem)
      );
    }
    setDilutionDrugs(templateDilutions(dayNumber));
    setHydrationRows(templateHydration());
  };

  const orderDraftKey = `hms_chemo_order_${resolvedPatientId}`;

  useEffect(() => {
    if (!resolvedPatientId) return;
    const saved = localStorage.getItem(orderDraftKey);

    if (!saved) return;

    try {
      const data = JSON.parse(saved) as {
        cycleDay?: string;
        startDate?: string;
        drugs?: Drug[];
        premedicationDrugs?: Drug[];
        supportiveDrugs?: Drug[];
        dilutionDrugs?: Drug[];
        discussion?: string;
        postChemoInstructions?: string;
        additionalNotes?: string;
        serumCreatinine?: string;
      };

      if (data.cycleDay) {
        updateCycleDay(data.cycleDay);
        userTouched.current.cycleDay = true;
      }

      if (data.discussion) {
        setDiscussion(data.discussion);
      }

      if (data.postChemoInstructions) {
        setPostChemoInstructions(data.postChemoInstructions);
      }

      if (data.additionalNotes) {
        setAdditionalNotes(data.additionalNotes);
      }

      if (data.serumCreatinine) {
        setSerumCreatinine(data.serumCreatinine);
      }

      if (data.startDate) {
        setStartDate(data.startDate);
        userTouched.current.startDate = true;
      }

      if (Array.isArray(data.drugs) && data.drugs.length > 0) {
        setDrugs(data.drugs.map(normalizeLegacyDraftDrug));
        userTouched.current.drugs = true;
      }

      if (
        Array.isArray(data.premedicationDrugs) &&
        data.premedicationDrugs.length > 0
      ) {
        setPremedicationDrugs(
          data.premedicationDrugs.map(normalizeLegacyDraftDrug)
        );
        userTouched.current.premedication = true;
      }

      if (
        Array.isArray(data.supportiveDrugs) &&
        data.supportiveDrugs.length > 0
      ) {
        setSupportiveDrugs(data.supportiveDrugs.map(normalizeLegacyDraftDrug));
        userTouched.current.supportive = true;
      }

      if (
        Array.isArray(data.dilutionDrugs) &&
        data.dilutionDrugs.length > 0
      ) {
        setDilutionDrugs(data.dilutionDrugs.map(normalizeLegacyDraftDrug));
        userTouched.current.dilution = true;
      }
    } catch (error) {
      console.error("Failed to restore chemotherapy order draft:", error);
    }
  }, [orderDraftKey, resolvedPatientId]);

  useEffect(() => {
    if (!resolvedPatientId) return;
    localStorage.setItem(
      orderDraftKey,
      JSON.stringify({
        cycleDay: userTouched.current.cycleDay ? cycleDay : "",
        startDate: userTouched.current.startDate ? startDate : "",
        drugs: userTouched.current.drugs ? drugs : [],
        premedicationDrugs: userTouched.current.premedication
          ? premedicationDrugs
          : [],
        supportiveDrugs: userTouched.current.supportive
          ? supportiveDrugs
          : [],
        dilutionDrugs: userTouched.current.dilution ? dilutionDrugs : [],
        discussion,
        postChemoInstructions,
        additionalNotes,
        serumCreatinine,
        /* Discharge Medication re-saves these rows as the order of this
           plan's cycle day, with the same Dose Cal inputs. */
        dosingInputs,
        planId: planIdRef.current || null,
        orderCycle: getCycleNumber(cycleDay),
        orderDay: displayedDayRef.current,
      })
    );
  }, [
    cycleDay,
    startDate,
    drugs,
    premedicationDrugs,
    supportiveDrugs,
    dilutionDrugs,
    discussion,
    postChemoInstructions,
    additionalNotes,
    serumCreatinine,
    dosingInputs,
    displayedDay,
    planOrders,
    orderDraftKey,
    resolvedPatientId,
  ]);

  const tabs = [
    "Chemotherapy Orders",
    "Premedication",
    "Supportive",
    "Hydration",
    "Admin Instructions",
    "Dilution",
  ];

  /* Number of days selectable for the current cycle, driven by the
     protocol's no_of_days (falling back to the distinct administration
     days present in the flat items). */
  const protocolDayCount = (() => {
    const explicit = Number(
      protocolRef.current?.no_of_days ?? null
    );
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    const adminDays = new Set<number>();
    (protocolRef.current?.chemotherapy_regimen_protocol_items ?? []).forEach(
      (item) => {
        const d = Number(item.administration_day ?? item.cycle_day);
        if (Number.isFinite(d) && d > 0) adminDays.add(d);
      }
    );
    return adminDays.size > 0 ? Math.max(...adminDays) : 6;
  })();

  /* The distinct days selectable for the current cycle, driven by the
     protocol's no_of_days (all days 1..N regardless of which days
     have items) merged with the distinct item-level days. This ensures
     the day-selector always matches the protocol header's day count. */
  const availableDays = (() => {
    const set = new Set<number>(getAvailableDays(protocolRef.current));
    const explicit = Number(protocolRef.current?.no_of_days ?? null);
    if (Number.isFinite(explicit) && explicit > 0) {
      for (let i = 1; i <= explicit; i++) set.add(i);
    } else if (set.size === 0) {
      return Array.from({ length: protocolDayCount }, (_, i) => i + 1);
    }
    return [...set].sort((a, b) => a - b);
  })();

  /* The distinct cycles (1..standard_cycles) available for the selected
     protocol, used to render the cycle-selector checkboxes. */
  const availableCycles = (() => {
    const total = Number(protocolRef.current?.standard_cycles ?? 0);
    if (Number.isFinite(total) && total > 0) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    return Array.from({ length: 6 }, (_, i) => i + 1);
  })();

  /* Set the cycle while preserving the currently selected day (clamped to
     the protocol's available days). Updates the Cycle / Day field and
     refetches that cycle's medications. */
  const selectCycle = (cycle: number) => {
    const currentDay = getCycleDayNumber(cycleDay) ?? availableDays[0] ?? 1;
    const day = availableDays.includes(currentDay)
      ? currentDay
      : (availableDays[0] ?? 1);
    const value = `Cycle ${cycle} / Day ${day}`;
    updateCycleDay(value);
    applySelectedDay(value);
  };

  /* Jump to a specific day in the current cycle, preserving the cycle
     number already selected in the Cycle / Day field. The filtered drugs
     are applied immediately (synchronously) so the tables update the
     instant the day is picked. */
  const selectDay = (day: number) => {
    const currentCycle = getCycleNumber(cycleDay) || 1;
    const value = `Cycle ${currentCycle} / Day ${day}`;
    updateCycleDay(value);
    applySelectedDay(value);
  };

  /* Apply the day's filtered drugs to the three tables. If the regimen
     protocol has not been loaded yet for this session, load it on demand
     (using the stored protocol id) so selecting a day always fetches that
     day's drugs instead of leaving the tables empty. */
  const applySelectedDay = async (value: string) => {
    if (protocolRef.current) {
      applyCycleDayDrugs(value, protocolDaysRef.current);
      return;
    }
    const protocolId = selectedProtocolIdRef.current;
    if (!protocolId) {
      applyCycleDayDrugs(value, protocolDaysRef.current);
      return;
    }
    try {
      const protocolResponse = await API.get<{
        success: boolean;
        data: RegimenProtocolDetail;
      }>(`/chemotherapy/regimen-protocols/${protocolId}`);
      const protocol = protocolResponse.data.data;
      protocolRef.current = protocol;
      protocolDaysRef.current = protocol.chemotherapy_regimen_protocol_days ?? [];
      setProtocolName(
        protocol.regimen_code
          ? `${protocol.regimen_code} - ${protocol.regimen_name}`
          : protocol.regimen_name
      );
      applyCycleDayDrugs(value, protocolDaysRef.current);
    } catch (error) {
      console.error("Failed to load regimen protocol on day select:", error);
    }
  };

  const handleNext = async () => {
    if (savingPlan) return;

    /* Nothing to save on a completed day or a closed course. */
    if (orderLocked) {
      setPlanError("");
      onNext?.();
      return;
    }

    if (!resolvedPatientId) {
      setPlanError(
        "Patient is not selected. Open this page from a patient consultation to continue."
      );
      return;
    }

    const hasAnyData = cycleDay.trim() || startDate.trim();

    if (!hasAnyData) {
      setPlanError(
        "Please select or enter the important field in the previous form."
      );
      return;
    }

    setPlanError("");
    setSavingPlan(true);

    let navigated = false;
    const navigateNext = () => {
      if (navigated) return;
      navigated = true;
      onNext?.();
    };
    const navigateTimer = setTimeout(navigateNext, 500);

    const saveOrder = async () => {
      const planItems = buildPlanItemsFromOrder(
        drugs,
        premedicationDrugs,
        supportiveDrugs,
        dosingInputs,
        null,
        dilutionDrugs
      );

      const planStartDate =
        toIsoDate(startDate) ||
        toIsoDate(
          localStorage.getItem(`hms_planned_start_date_${resolvedPatientId}`)
        ) ||
        toIsoDate(new Date().toISOString());

      /* The rows are the order of the displayed cycle day, saved with
         every tab (Dilution and Hydration included). */
      const result = await createChemotherapyPlanForPatient(
        resolvedPatientId,
        planStartDate,
        planItems.length > 0 ? planItems : undefined,
        undefined,
        discussion,
        buildDosingSnapshot(dosingInputs),
        {
          order: {
            cycle: getCycleNumber(cycleDayRef.current) ?? 1,
            day: displayedDayRef.current ?? 1,
            hydration: hydrationPayload(hydrationRows),
          },
        }
      );

      if (result.courseClosed) {
        setPlanClosed(true);
      }
      if (!result.error && result.planId) {
        planIdRef.current = result.planId;
      }

      return result;
    };

    try {
      const { error } = await saveOrder();

      if (error) {
        clearTimeout(navigateTimer);
        setPlanError(error);
        return;
      }

      clearTimeout(navigateTimer);
      navigateNext();
    } catch (err: any) {
      clearTimeout(navigateTimer);
      console.error("Failed to save chemotherapy order:", err);
      setPlanError(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to save chemotherapy order. Please try again."
      );
    } finally {
      setSavingPlan(false);
    }
  };

  const formatDateDMY = (value?: string | null) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${day}-${month}-${date.getFullYear()}`;
  };

  useEffect(() => {
    if (!resolvedPatientId) return;
    let cancelled = false;
    setPlanLoading(true);
    setPlanError("");

    /* Snapshot the previously scheduled next cycle/day BEFORE any protocol
       or plan load rewrites hms_next_cycle during this mount, so a
       returning visit resumes at the exact cycle the last visit planned
       (e.g. Cycle 2 / Day 1 -> Cycle 2 / Day 2). */
    storedNextCycleRef.current =
      localStorage.getItem(`hms_next_cycle_${resolvedPatientId}`) ?? "";

    const savedStartDate = localStorage.getItem(
      `hms_planned_start_date_${resolvedPatientId}`
    );
    if (!userTouched.current.startDate) {
      const isoMatch = savedStartDate
        ?.trim()
        .match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (isoMatch) {
        setStartDate(`${isoMatch[3]}-${isoMatch[2]}-${isoMatch[1]}`);
      } else if (savedStartDate) {
        setStartDate(savedStartDate.trim());
      }
    }
    if (!userTouched.current.cycleDay) {
      updateCycleDay("Cycle 1 / Day 1");
    }

    const savedProtocolId = localStorage.getItem(
      `hms_selected_protocol_id_${resolvedPatientId}`
    );
    if (savedProtocolId) {
      selectedProtocolIdRef.current = savedProtocolId;
    }

    const loadRegimenProtocol = async (protocolId: string) => {
      try {
        const protocolResponse = await API.get<{
          success: boolean;
          data: RegimenProtocolDetail;
        }>(`/chemotherapy/regimen-protocols/${protocolId}`);
        if (cancelled) return;
        const protocol = protocolResponse.data.data;
        setProtocolName(
          protocol.regimen_code
            ? `${protocol.regimen_code} - ${protocol.regimen_name}`
            : protocol.regimen_name
        );
        const items =
          protocol.chemotherapy_regimen_protocol_items ?? [];

        protocolRef.current = protocol;
        protocolDaysRef.current = protocol.chemotherapy_regimen_protocol_days ?? [];
        applyCycleDayDrugs(cycleDayRef.current, protocolDaysRef.current);
        applyNextCycle(protocol, savedStartDate);
      } catch (error) {
        console.error("Failed to load regimen protocol:", error);
        if (!cancelled) {
          setPlanError(
            error?.response?.data?.message ||
              "Failed to load the regimen protocol."
          );
        }
      }
    };

    if (savedProtocolId) {
      void loadRegimenProtocol(savedProtocolId);
    }

    /* The patient's open plan (one course at a time), else their latest -
       with its saved cycle day orders and the current one. */
    API.get<{ success: boolean; data: ChemotherapyPlan | null }>(
      "/chemotherapy/plans/latest-for-patient",
      { params: { patient_id: resolvedPatientId } }
    )
      .then((response) => {
        if (cancelled) return;
        const plan = response.data.data;
        if (!plan) return;

        planIdRef.current = plan.chemotherapy_plan_id;
        setPlanClosed(isChemoPlanClosed(plan));

        const planItems = plan.chemotherapy_plan_items ?? [];
        planItemsRef.current = planItems;
        ordersRef.current = new Map();
        planOrdersRef.current = [...(plan.plan_orders ?? [])].sort(byCycleDay);
        setPlanOrders(planOrdersRef.current);
        cacheOrder(plan.current_order);

        if (!userTouched.current.startDate) {
          setStartDate(formatDateDMY(plan.treatment_start_date));
        }

        /* Resume at the saved orders' cycle day (snapped to a medication
           day once the protocol is known). */
        const resumeAt = cycleDayFromOrders(protocolRef.current);
        if (!userTouched.current.cycleDay) {
          updateCycleDay(
            resumeAt
              ? `Cycle ${resumeAt.cycle} / Day ${resumeAt.day}`
              : "Cycle 1 / Day 1"
          );
        }
        applyNextCycle(protocolRef.current, plan.treatment_start_date);

        /* The protocol may have loaded first: show the plan's saved order
           for the displayed day now that it is known. */
        if (protocolRef.current) {
          applyCycleDayDrugs(cycleDayRef.current, protocolDaysRef.current);
        }

        if (!savedProtocolId) {
          setProtocolName(
            plan.protocol_name || plan.regimen_name || ""
          );
          const shownItems =
            plan.current_order?.chemotherapy_plan_items ?? planItems;
          setDrugs(planItemsForRole(shownItems, "PRIMARY"));
          setPremedicationDrugs(planItemsForRole(shownItems, "PREMEDICATION"));
          setSupportiveDrugs(planItemsForRole(shownItems, "SUPPORTIVE"));

          const protocolId =
            plan.chemotherapy_regimen_protocol?.protocol_id;
          if (protocolId) {
            selectedProtocolIdRef.current = String(protocolId);
            void loadRegimenProtocol(String(protocolId));
          }
        }
      })
      .catch((error) => {
        console.error("Failed to load chemotherapy plans:", error);
        if (!cancelled) {
          setPlanError(
            error?.response?.data?.message ||
              "Failed to load chemotherapy orders."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setPlanLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [resolvedPatientId]);

  useEffect(() => {
    if (!resolvedPatientId) return;
    setSupportiveDrugs([]);
  }, [resolvedPatientId]);

  /* Re-apply the role-filtered drugs whenever the selected cycle
     day changes so the tables reflect that day's regimen. The ref is the
     single source of truth (kept in sync by updateCycleDay), so async
     loads never filter by a stale mount-time value. We only overwrite
     the ref when a real value is present, preserving the default set on
     first mount. */
  useEffect(() => {
    if (!resolvedPatientId) return;
    if (cycleDay.trim()) {
      cycleDayRef.current = cycleDay;
    }
    applyCycleDayDrugs(cycleDayRef.current, protocolDaysRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleDay, resolvedPatientId]);

  /* Keep the Follow-Up "Next Cycle" label in sync with the cycle/day
     selected in this form and the protocol's days-per-cycle. When the
     current day is not the cycle's last day, the next entry is the next
     day of the same cycle (e.g. Cycle 2 / Day 1 -> Cycle 2 / Day 2);
     once the last day is reached it rolls to the next cycle Day 1. */
  useEffect(() => {
    if (!resolvedPatientId) return;
    const protocol = protocolRef.current;
    if (!protocol) return;
    const next = computeNextCycle(cycleDay, protocol.no_of_days);
    if (next) {
      localStorage.setItem(`hms_next_cycle_${resolvedPatientId}`, next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleDay, resolvedPatientId]);

  const rowsOf = (kind: RowKind) =>
    kind === "drug"
      ? drugs
      : kind === "premedication"
        ? premedicationDrugs
        : kind === "supportive"
          ? supportiveDrugs
          : dilutionDrugs;

  const setRowsOf = (kind: RowKind, rows: Drug[]) => {
    if (kind === "drug") setDrugs(rows);
    else if (kind === "premedication") setPremedicationDrugs(rows);
    else if (kind === "supportive") setSupportiveDrugs(rows);
    else setDilutionDrugs(rows);
  };

  /* Every drug table, with one of them replaced. The other groups have to
     be carried in full: savePlanOrder replaces the whole cycle day order,
     so a Dilution tab edit that left the other arrays out would erase
     their saved rows. */
  const withRows = (kind: RowKind, rows: Drug[]): Record<RowKind, Drug[]> => ({
    drug: kind === "drug" ? rows : drugs,
    premedication: kind === "premedication" ? rows : premedicationDrugs,
    supportive: kind === "supportive" ? rows : supportiveDrugs,
    dilution: kind === "dilution" ? rows : dilutionDrugs,
  });

  const touch = (kind: RowKind) => {
    userTouched.current[kind === "drug" ? "drugs" : kind] = true;
  };

  const errorMessage = (error: any, fallback: string) =>
    error?.response?.data?.message || error?.message || fallback;

  /* The encounter this visit's orders are saved in (the consultation's
     submit completes them), looked up once. */
  const resolveEncounterNo = async () => {
    if (encounterNoRef.current || !resolvedPatientId) {
      return encounterNoRef.current;
    }
    try {
      const { encounter } = await findActiveEncounter(resolvedPatientId);
      encounterNoRef.current = encounter?.encounter_no ?? "";
    } catch (error) {
      console.error("Failed to resolve the encounter for the order:", error);
    }
    return encounterNoRef.current;
  };

  /* Saves the displayed cycle day's full order - every row of the
     Chemotherapy Orders, Premedication and Supportive tabs (Admin
     Instructions edits those same rows) and the Hydration list - as that
     cycle day's order, in one call. Other cycle days are untouched.
     Without a plan yet the rows stay local; Next creates the plan with
     them. */
  const saveOrderToPlan = async (
    next: Record<RowKind, Drug[]>,
    hydration: HydrationRow[] = hydrationRows,
    copiedFromOrderId?: string
  ) => {
    if (!planIdRef.current) return;
    const cycle = getCycleNumber(cycleDayRef.current) ?? 1;
    const day = displayedDayRef.current ?? 1;
    const encounterNo = await resolveEncounterNo();
    const response = await chemotherapyApi.savePlanOrder(
      planIdRef.current,
      cycle,
      day,
      {
        items: buildPlanItemsFromOrder(
          next.drug,
          next.premedication,
          next.supportive,
          dosingInputs,
          null,
          next.dilution
        ),
        hydration: hydrationPayload(hydration),
        dosing: orderDosingFromSnapshot(buildDosingSnapshot(dosingInputs)),
        encounter_no: encounterNo || null,
        ...(copiedFromOrderId ? { copied_from_order_id: copiedFromOrderId } : {}),
      }
    );
    cacheOrder(response.data.data);
  };

  /* Remove: saved to the plan straight away with the rest of the order. */
  const removeRow = async (kind: RowKind, id: number) => {
    if (editingRow || savingEdit) return;
    const rows = rowsOf(kind).filter((drug) => drug.id !== id);
    try {
      setSavingEdit(true);
      setEditError("");
      await saveOrderToPlan(withRows(kind, rows));
      touch(kind);
      setRowsOf(kind, rows);
    } catch (error: any) {
      console.error("Failed to remove the medication:", error);
      setEditError(
        errorMessage(error, "Failed to remove the medication. Please try again.")
      );
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = (id: number) => void removeRow("drug", id);
  const handleDeletePremedication = (id: number) =>
    void removeRow("premedication", id);
  const handleDeleteSupportive = (id: number) =>
    void removeRow("supportive", id);
  const handleDeleteDilution = (id: number) => void removeRow("dilution", id);

  /* An Admin Instructions row is a drug of the order: removing it removes
     the drug. */
  const handleDeleteAdminRow = (kind: RowKind, drug: Drug) => {
    if (
      window.confirm(
        `Remove ${drug.name || "this drug"} from this order? It is removed from its ${
          kind === "drug"
            ? "Chemotherapy Orders"
            : kind === "premedication"
              ? "Premedication"
              : kind === "supportive"
                ? "Supportive"
                : "Dilution"
        } list too.`
      )
    ) {
      void removeRow(kind, drug.id);
    }
  };

  /* Dose Cal / target AUC change on a PRIMARY row that isn't in edit mode. */
  const updatePrimaryDrug = (id: number, patch: Partial<Drug>) => {
    userTouched.current.drugs = true;
    setDrugs((current) =>
      current.map((drug) => (drug.id === id ? { ...drug, ...patch } : drug))
    );
  };

  const ensureMedicineOptions = () => {
    if (medicinesRequestedRef.current) return;
    medicinesRequestedRef.current = true;
    API.get<{
      success: boolean;
      data: {
        medicine_id: string;
        medicine_name: string;
        dosage_form: string | null;
        route?: string | null;
      }[];
    }>("/chemotherapy/medicines")
      .then((response) => {
        const medicines = response.data.data ?? [];
        medicineRoutesRef.current = new Map(
          medicines
            .filter((medicine) => medicine.route)
            .map((medicine) => [medicine.medicine_id, medicine.route as string])
        );
        setMedicineOptions(
          medicines.map((medicine) => ({
            label: medicine.medicine_name,
            value: medicine.medicine_id,
            hint: medicine.dosage_form ?? undefined,
          }))
        );
      })
      .catch((error) => {
        medicinesRequestedRef.current = false;
        console.error("Failed to load medicines:", error);
      });
  };

  const startEdit = (kind: RowKind, drug: Drug, view: "row" | "admin" = "row") => {
    if (editingRow || savingEdit) return;
    ensureMedicineOptions();
    setEditError("");
    setEditingRow({ kind, id: drug.id, view });
    setEditDraft({ ...drug });
  };

  /* "Add Medicine": a blank row at the end of that list, opened for
     editing (drug from medicine_master or a typed name, and its columns).
     Saving it saves this patient's cycle day order only - the regimen
     protocol and its master tables are never changed. */
  const addMedicineRow = (kind: RowKind) => {
    if (editingRow || savingEdit || copying || orderLocked) return;
    const drug: Drug = {
      id: Date.now(),
      name: "",
      form: "",
      dose: "",
      unit: "",
      volume: "",
    };
    setRowsOf(kind, [...rowsOf(kind), drug]);
    newRowRef.current = { kind, id: drug.id };
    startEdit(kind, drug);
  };

  const handleEdit = (id: number) => {
    const drug = drugs.find((item) => item.id === id);
    if (drug) startEdit("drug", drug);
  };

  const handleEditPremedication = (id: number) => {
    const drug = premedicationDrugs.find((item) => item.id === id);
    if (drug) startEdit("premedication", drug);
  };

  const handleEditSupportive = (id: number) => {
    const drug = supportiveDrugs.find((item) => item.id === id);
    if (drug) startEdit("supportive", drug);
  };

  const handleEditDilution = (id: number) => {
    const drug = dilutionDrugs.find((item) => item.id === id);
    if (drug) startEdit("dilution", drug);
  };

  const cancelEdit = () => {
    if (savingEdit) return;
    /* An added row that was never saved goes away again. */
    const added = newRowRef.current;
    if (added && editingRow && added.kind === editingRow.kind && added.id === editingRow.id) {
      if (added.kind === "hydration") {
        setHydrationRows((rows) => rows.filter((row) => row.id !== added.id));
      } else {
        setRowsOf(added.kind, rowsOf(added.kind).filter((drug) => drug.id !== added.id));
      }
    }
    newRowRef.current = null;
    setEditingRow(null);
    setEditDraft(null);
    setHydrationDraft(null);
    setEditError("");
  };

  const updateEditDraft = (field: keyof Drug, value: string) => {
    setEditDraft((previous) =>
      previous ? { ...previous, [field]: value } : previous
    );
  };

  /* Save an edited row (any column) and the rest of the day's order onto
     the plan. */
  const saveEditedDrug = async () => {
    if (!editDraft || !editingRow || editingRow.kind === "hydration" || savingEdit) {
      return;
    }
    const kind = editingRow.kind;

    if (!editDraft.medicineId && !editDraft.name.trim()) {
      setEditError("Select a drug from the list or type a drug name.");
      return;
    }
    const dose = editDraft.dose.trim();
    if (dose && Number.isNaN(Number(dose))) {
      setEditError("Dose must be a valid number.");
      return;
    }
    const minutes = (editDraft.infusionDuration ?? "").trim();
    if (minutes && !/^\d+$/.test(minutes)) {
      setEditError("Infusion duration must be whole minutes.");
      return;
    }

    const rows = rowsOf(kind).map((drug) =>
      drug.id === editingRow.id ? { ...editDraft } : drug
    );

    try {
      setSavingEdit(true);
      setEditError("");
      await saveOrderToPlan(withRows(kind, rows));
      touch(kind);
      setRowsOf(kind, rows);
      newRowRef.current = null;
      setEditingRow(null);
      setEditDraft(null);
    } catch (error: any) {
      console.error("Failed to save medication changes:", error);
      setEditError(
        errorMessage(error, "Failed to save the medication changes. Please try again.")
      );
    } finally {
      setSavingEdit(false);
    }
  };

  /* ---------------- Hydration rows ---------------- */

  /* A Hydration change is saved with the rest of the day's order. */
  const commitHydration = async (rows: HydrationRow[]) => {
    await saveOrderToPlan(withRows("drug", drugs), rows);
    userTouched.current.hydration = true;
    setHydrationRows(rows);
  };

  /* ---------------- "Copy as Cycle X / Day Y" ---------------- */

  /* The copy menu closes on an outside click or Escape. */
  useEffect(() => {
    if (!copyMenuOpen) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (!copyMenuRef.current?.contains(event.target as Node)) {
        setCopyMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCopyMenuOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [copyMenuOpen]);

  const displayedCycleNumber = getCycleNumber(cycleDay) ?? 1;
  const displayedOrder =
    displayedDay != null
      ? planOrders.find(
          (order) =>
            order.cycle_number === displayedCycleNumber &&
            order.cycle_day === displayedDay
        )
      : undefined;
  /* A completed cycle day (its consultation was submitted) or a closed
     course is read-only. */
  const orderLocked = planClosed || displayedOrder?.order_status === "COMPLETED";

  /* Saved orders before the displayed cycle day, latest first. */
  const copySources = planIdRef.current
    ? planOrders
        .filter(
          (order) =>
            order.cycle_number < displayedCycleNumber ||
            (order.cycle_number === displayedCycleNumber &&
              order.cycle_day < (displayedDay ?? 1))
        )
        .sort((a, b) => byCycleDay(b, a))
    : [];

  /* Copies a previous cycle day's whole order - Chemotherapy Orders,
     Premedication, Supportive, Dilution, Hydration and Admin Instructions -
     into the displayed cycle day and saves it. Patient Dose is recalculated
     from today's vitals. */
  const copyFromOrder = async (source: ChemoPlanOrderHeader) => {
    setCopyMenuOpen(false);
    if (copying || savingEdit || editingRow || orderLocked || !planIdRef.current) {
      return;
    }
    const from = `Cycle ${source.cycle_number} / Day ${source.cycle_day}`;
    const target = `Cycle ${displayedCycleNumber} / Day ${displayedDay ?? 1}`;
    if (
      displayedOrder &&
      !window.confirm(
        `Replace the saved ${target} order with a copy of ${from}? Its Chemotherapy Orders, Premedication, Supportive, Dilution, Hydration and Admin Instructions are all replaced.`
      )
    ) {
      return;
    }
    try {
      setCopying(true);
      setEditError("");
      const order =
        ordersRef.current.get(orderKey(source.cycle_number, source.cycle_day)) ??
        (await loadOrder(source.cycle_number, source.cycle_day));
      if (!order) {
        throw new Error(`${from} has no saved order to copy.`);
      }
      const items = order.chemotherapy_plan_items ?? [];
      const dilution = savedDilutionRows(items);
      const hasRealDilutions =
        dilution.length > 0 && dilution.some((d) => (d.name ?? "").trim());
      const next: Record<RowKind, Drug[]> = {
        drug: planItemsForRole(items, "PRIMARY"),
        premedication: planItemsForRole(items, "PREMEDICATION"),
        supportive: planItemsForRole(items, "SUPPORTIVE"),
        dilution: hasRealDilutions
          ? dilution
          : templateDilutions(source.cycle_day),
      };
      const hydration = order.hydration_saved
        ? (order.chemotherapy_plan_hydration ?? []).map(planHydrationToRow)
        : templateHydration();
      await saveOrderToPlan(next, hydration, order.plan_order_id);
      userTouched.current.drugs = true;
      userTouched.current.premedication = true;
      userTouched.current.supportive = true;
      userTouched.current.dilution = true;
      userTouched.current.hydration = true;
      setDrugs(next.drug);
      setPremedicationDrugs(next.premedication);
      setSupportiveDrugs(next.supportive);
      setDilutionDrugs(next.dilution);
      setHydrationRows(hydration);
    } catch (error: any) {
      console.error("Failed to copy the cycle day order:", error);
      setEditError(errorMessage(error, `Failed to copy the ${from} order.`));
    } finally {
      setCopying(false);
    }
  };

  const startHydrationEdit = (row: HydrationRow) => {
    if (editingRow || savingEdit) return;
    setEditError("");
    setEditingRow({ kind: "hydration", id: row.id, view: "hydration" });
    setHydrationDraft({ ...row });
  };

  /* "Add Medicine" on Hydration: a blank row for this cycle day only. */
  const addHydrationRow = () => {
    if (editingRow || savingEdit || copying || orderLocked) return;
    const row: HydrationRow = {
      id: Date.now(),
      sourceDilutionId: null,
      stage: "PRE",
      agent: "",
      diluent: "",
      volume: "",
      volumeUnit: "mL",
      guidance: "",
    };
    setHydrationRows((rows) => [...rows, row]);
    newRowRef.current = { kind: "hydration", id: row.id };
    startHydrationEdit(row);
  };

  const updateHydrationDraft = (field: keyof HydrationRow, value: string) => {
    setHydrationDraft((previous) =>
      previous ? { ...previous, [field]: value } : previous
    );
  };

  const saveHydrationRow = async () => {
    if (!hydrationDraft || savingEdit) return;
    if (!hydrationDraft.agent.trim() && !hydrationDraft.diluent.trim()) {
      setEditError("Enter the agent or the diluent.");
      return;
    }
    const volume = hydrationDraft.volume.trim();
    if (volume && (Number.isNaN(Number(volume)) || Number(volume) < 0)) {
      setEditError("Volume must be a number.");
      return;
    }
    const rows = hydrationRows.map((row) =>
      row.id === hydrationDraft.id ? { ...hydrationDraft } : row
    );
    try {
      setSavingEdit(true);
      setEditError("");
      await commitHydration(rows);
      newRowRef.current = null;
      setEditingRow(null);
      setHydrationDraft(null);
    } catch (error: any) {
      console.error("Failed to save hydration:", error);
      setEditError(errorMessage(error, "Failed to save the hydration row."));
    } finally {
      setSavingEdit(false);
    }
  };

  const removeHydrationRow = async (id: number) => {
    if (editingRow || savingEdit) return;
    try {
      setSavingEdit(true);
      setEditError("");
      await commitHydration(hydrationRows.filter((row) => row.id !== id));
    } catch (error: any) {
      console.error("Failed to remove hydration row:", error);
      setEditError(errorMessage(error, "Failed to remove the hydration row."));
    } finally {
      setSavingEdit(false);
    }
  };

  /* Icons (scoped inside the component) */

  const BackIcon = () => (
    <svg
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path
        d="M10 19l-7-7m0 0l7-7m-7 7h18"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  const BellIcon = () => (
    <svg
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  const CheckIcon = () => (
    <svg
      className="h-5 w-5"
      fill="currentColor"
      viewBox="0 0 20 20"
    >
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );

  const RefreshIcon = () => (
    <svg
      className="h-5 w-5 text-gray-400"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );

  const CalendarIcon = () => (
    <svg
      className="h-5 w-5 text-gray-400"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );

  const EditIcon = () => (
    <svg
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  const DeleteIcon = () => (
    <svg
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  /* Dose Cal cell: formula select (+ target AUC for Calvert). */
  const renderDoseCalcCell = (
    drug: Drug,
    onChange: (patch: Partial<Drug>) => void,
    disabled = false
  ) => {
    const method = resolveDoseCalc(drug);
    return (
      <div className="flex min-w-[200px] flex-col gap-1.5">
        <select
          aria-label={`Dose calculation for ${drug.name}`}
          value={method}
          onChange={(event) => onChange({ doseCalc: event.target.value })}
          disabled={disabled}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50 disabled:text-gray-500"
        >
          {DOSE_CALC_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {method === "AUC" && (
          <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
            Target AUC
            <input
              type="number"
              min="0"
              step="0.5"
              value={drug.targetAuc ?? String(resolveTargetAuc(drug) ?? "")}
              onChange={(event) => onChange({ targetAuc: event.target.value })}
              disabled={disabled}
              className="w-20 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </label>
        )}
      </div>
    );
  };

  const renderPatientDoseCell = (result: PatientDoseResult) =>
    result.value !== null ? (
      <div>
        <span className="text-base font-semibold text-gray-900">
          {result.value} {result.unit}
        </span>
        {result.note && (
          <p className="mt-0.5 text-xs text-gray-500">{result.note}</p>
        )}
      </div>
    ) : (
      <span className="text-xs font-medium text-amber-600">
        {result.message}
      </span>
    );

  const usesCalvert = drugs.some((drug) => resolveDoseCalc(drug) === "AUC");

  const EDIT_INPUT_CLASS =
    "w-full min-w-[100px] rounded-md border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

  /* Drug Name editor: a drug from medicine_master, or any name the doctor
     types for this patient - kept on this cycle day's order only, never
     added to medicine_master. */
  const renderDrugNameEditor = () =>
    editDraft && (
      <div className="min-w-[220px]">
        <SingleSelectDropdown
          options={medicineOptions}
          value={
            editDraft.medicineId ??
            (editDraft.name.trim() ? CUSTOM_DRUG_VALUE : "")
          }
          valueLabel={editDraft.name}
          onValueChange={(medicineId) => {
            const option = medicineOptions.find((item) => item.value === medicineId);
            setEditDraft((previous) =>
              previous
                ? {
                    ...previous,
                    medicineId: medicineId || undefined,
                    name: option?.label ?? "",
                    form: option?.hint || previous.form,
                    route:
                      previous.route ||
                      medicineRoutesRef.current.get(medicineId) ||
                      "",
                  }
                : previous
            );
          }}
          onCreateOption={(typed) =>
            setEditDraft((previous) =>
              previous
                ? { ...previous, medicineId: undefined, name: typed.trim() }
                : previous
            )
          }
          createLabel="Use"
          placeholder={medicineOptions.length > 0 ? "Select or type a drug" : "Loading drugs..."}
          className="h-10 rounded-md border-gray-300 text-base shadow-none"
        />
        {!editDraft.medicineId && editDraft.name.trim() && (
          <p className="mt-1 text-xs text-gray-500">
            Custom name - saved for this patient only
          </p>
        )}
      </div>
    );

  const renderEditInput = (field: keyof Drug, placeholder?: string) => (
    <input
      type="text"
      value={(editDraft?.[field] as string | undefined) ?? ""}
      onChange={(event) => updateEditDraft(field, event.target.value)}
      placeholder={placeholder}
      className={EDIT_INPUT_CLASS}
    />
  );

  const renderEditTextarea = (field: keyof Drug, placeholder?: string) => (
    <textarea
      value={(editDraft?.[field] as string | undefined) ?? ""}
      onChange={(event) => updateEditDraft(field, event.target.value)}
      placeholder={placeholder}
      rows={2}
      className={`${EDIT_INPUT_CLASS} min-w-[180px] resize-y text-sm`}
    />
  );

  const renderEditActions = (onSave: () => void) => (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={onSave}
        disabled={savingEdit}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {savingEdit ? "Saving" : "Save"}
      </button>

      <button
        type="button"
        onClick={cancelEdit}
        disabled={savingEdit}
        className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Cancel
      </button>
    </div>
  );

  const renderRowActions = (
    label: string,
    onEdit: () => void,
    onDelete: () => void
  ) => (
    <div className={`flex items-center justify-end gap-3 text-gray-500${orderLocked ? " hidden" : ""}`}>
      <button
        type="button"
        aria-label={`Edit ${label}`}
        onClick={onEdit}
        disabled={savingEdit}
        className="transition-colors hover:text-gray-900 focus:outline-none disabled:opacity-40"
      >
        <EditIcon />
      </button>

      <button
        type="button"
        aria-label={`Delete ${label}`}
        onClick={onDelete}
        disabled={savingEdit}
        className="transition-colors hover:text-red-600 focus:outline-none disabled:opacity-40"
      >
        <DeleteIcon />
      </button>
    </div>
  );

  const renderRowError = () =>
    editError && (
      <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
        {editError}
      </div>
    );

  /* Admin Instructions: one row per row of the order (every drug tab),
     in the same order the Summary page lists them. */
  const adminRows: { kind: RowKind; drug: Drug }[] = [
    ...drugs.map((drug) => ({ kind: "drug" as const, drug })),
    ...premedicationDrugs.map((drug) => ({ kind: "premedication" as const, drug })),
    ...supportiveDrugs.map((drug) => ({ kind: "supportive" as const, drug })),
    ...dilutionDrugs.map((drug) => ({ kind: "dilution" as const, drug })),
  ];

  const tablesLoading = planLoading || orderLoading;

  /* "Add Medicine" under a list (hidden on a completed day / closed
     course). */
  const renderAddMedicineButton = (onAdd: () => void) =>
    !orderLocked && (
      <div className="mt-4 flex justify-start">
        <button
          type="button"
          onClick={onAdd}
          disabled={Boolean(editingRow) || savingEdit || copying || tablesLoading}
          className="inline-flex items-center gap-2 rounded-md border border-dashed border-blue-400 bg-white px-4 py-2 text-sm font-semibold text-blue-600 transition-colors hover:border-blue-600 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
              clipRule="evenodd"
            />
          </svg>
          Add Medicine
        </button>
      </div>
    );

  const infusionLabel = (drug: Drug) =>
    [drug.infusionType, drug.infusionDuration ? `${drug.infusionDuration} min` : ""]
      .filter(Boolean)
      .join(" · ");

  const formatInput = (value: number | null | undefined, unit: string) =>
    value != null ? `${value} ${unit}` : "—";

  const content = (
    <div className="w-full space-y-8">
      {/* ================= ORDER CONTAINER ================= */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {/* ================= FORM HEADER ================= */}
        <div className="grid grid-cols-1 gap-8 p-8 pb-6 md:grid-cols-3">
          {/* Protocol */}
          <div className="space-y-2">
            <label
              htmlFor="protocol"
              className="block text-sm font-semibold uppercase tracking-wide text-gray-500"
            >
              Protocol
            </label>

            <input
              id="protocol"
              type="text"
              value={protocolName}
              readOnly
              className="mt-1 block w-full rounded-md border border-gray-300 px-4 py-3 text-base text-gray-900 shadow-sm outline-none"
            />
          </div>

          {/* Cycle / Day */}
          <div className="relative space-y-2">
            <label
              htmlFor="cycle-day"
              className="block text-sm font-semibold uppercase tracking-wide text-gray-500"
            >
              Cycle / Day
            </label>

            {/* Dropdown trigger */}
            <button
              type="button"
              onClick={() => setCycleDayOpen((prev) => !prev)}
              className="relative mt-1 flex w-full items-center justify-between rounded-md border border-gray-300 bg-white px-4 py-3 text-left text-base text-gray-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            >
              <span className={cycleDay ? "text-gray-900" : "text-gray-400"}>
                {cycleDay || "Select Cycle / Day"}
              </span>

              <svg
                className={`h-4 w-4 text-gray-400 transition-transform ${
                  cycleDayOpen ? "rotate-180" : ""
                }`}
                viewBox="0 0 20 20"
                fill="currentColor"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fillRule="evenodd"
                  d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>

            {/* Dropdown panel - only shows when open */}
            {cycleDayOpen && (
              <div className="absolute z-20 mt-1 w-full rounded-md border border-gray-300 bg-white p-3 shadow-lg">
                <div className="grid grid-cols-2 gap-4">
                  {/* Cycles */}
                  <div className="space-y-1.5">
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Cycles
                    </div>
                    <div className="max-h-40 space-y-1 overflow-y-auto">
                      {availableCycles.map((cycle) => {
                        const isChecked = getCycleNumber(cycleDay) === cycle;
                        return (
                          <label
                            key={cycle}
                            className="flex cursor-pointer items-center gap-2 text-sm text-gray-700"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                userTouched.current.cycleDay = true;
                                setCycleDayOpen(false);
                                selectCycle(cycle);
                              }}
                              className="h-4 w-4 shrink-0 cursor-pointer rounded border border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span>Cycle {cycle}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Days */}
                  <div className="space-y-1.5">
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Days
                    </div>
                    <div className="max-h-40 space-y-1 overflow-y-auto">
                      {availableDays.map((day) => {
                        const isChecked = getCycleDayNumber(cycleDay) === day;
                        return (
                          <label
                            key={day}
                            className="flex cursor-pointer items-center gap-2 text-sm text-gray-700"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                userTouched.current.cycleDay = true;
                                setCycleDayOpen(false);
                                selectDay(day);
                              }}
                              className="h-4 w-4 shrink-0 cursor-pointer rounded border border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span>Day {day}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Start Date */}
          <div className="space-y-2">
            <label
              htmlFor="start-date"
              className="block text-sm font-semibold uppercase tracking-wide text-gray-500"
            >
              Start Date
            </label>

            <Popover>
              <PopoverTrigger asChild>
                <div className="relative mt-1 cursor-pointer rounded-md shadow-sm">
                  <input
                    id="start-date"
                    type="text"
                    value={startDate}
                    onChange={(e) => {
                      userTouched.current.startDate = true;
                      setStartDate(e.target.value);
                    }}
                    className="block w-full rounded-md border border-gray-300 py-3 pl-4 pr-10 text-base text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  />

                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                    <CalendarIcon />
                  </div>
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={parsePickedDate(startDate)}
                  onSelect={(date) => {
                    if (date instanceof Date) {
                      userTouched.current.startDate = true;
                      setStartDate(formatPickedDate(date));
                    }
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* A completed cycle day / closed course is read-only. */}
        {orderLocked && (
          <div className="mx-8 mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            {planClosed && <p>{COURSE_CLOSED_MESSAGE}</p>}
            {displayedOrder?.order_status === "COMPLETED" && (
              <p>
                Cycle {displayedOrder.cycle_number} / Day {displayedOrder.cycle_day} was
                completed
                {displayedOrder.completed_at
                  ? ` on ${formatDateDMY(displayedOrder.completed_at)}`
                  : ""}
                . Its order is read-only
                {planClosed ? "." : " - pick another day to order, or reuse it there with its \"Copy as Cycle\" button."}
              </p>
            )}
          </div>
        )}

        {/* ================= TABS ================= */}
        <div className="border-b border-gray-200 px-8">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <nav
              aria-label="Tabs"
              className="-mb-px flex gap-6 overflow-x-auto"
            >
              {tabs.map((tab) => {
                const isActive = activeTab === tab;

                return (
                  <React.Fragment key={tab}>
                    <button
                      type="button"
                      onClick={() => setActiveTab(tab)}
                      className={`whitespace-nowrap border-b-2 px-1 py-4 text-base font-medium transition-colors ${
                        isActive
                          ? "border-blue-600 text-blue-600"
                          : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                      }`}
                    >
                      {tab}
                    </button>

                  </React.Fragment>
                );
              })}
            </nav>

            {/* Copy as Cycle X / Day Y + Next */}
            <div className="flex flex-col items-end gap-2 pb-3">
              {planError && (
                <div className="text-sm font-medium text-red-600">{planError}</div>
              )}
              <div className="flex flex-wrap items-center justify-end gap-3">
                {/* Copy an earlier cycle day's whole order into this one;
                    the chevron lists every earlier saved cycle day. */}
                {!orderLocked && copySources.length > 0 && (
                  <div ref={copyMenuRef} className="relative inline-flex rounded-md shadow-sm">
                    <button
                      type="button"
                      onClick={() => void copyFromOrder(copySources[0])}
                      disabled={copying || savingEdit || Boolean(editingRow)}
                      title={`Copy the Cycle ${copySources[0].cycle_number} / Day ${copySources[0].cycle_day} order (every tab) into this cycle day`}
                      className="inline-flex items-center rounded-l-md border border-blue-600 bg-white px-4 py-2.5 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {copying
                        ? "Copying..."
                        : `Copy as Cycle ${copySources[0].cycle_number} / Day ${copySources[0].cycle_day}`}
                    </button>
                    <button
                      type="button"
                      aria-label="Copy from another cycle day"
                      aria-haspopup="menu"
                      aria-expanded={copyMenuOpen}
                      onClick={() => setCopyMenuOpen((open) => !open)}
                      disabled={copying || savingEdit || Boolean(editingRow)}
                      className={`inline-flex items-center rounded-r-md border border-l-0 border-blue-600 px-2.5 py-2.5 text-blue-600 transition-colors hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
                        copyMenuOpen ? "bg-blue-50" : "bg-white"
                      }`}
                    >
                      <svg
                        className={`h-4 w-4 transition-transform duration-200 ease-out ${
                          copyMenuOpen ? "rotate-180" : ""
                        }`}
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          fillRule="evenodd"
                          d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>

                    {/* Always mounted so it can fade / scale in and out. */}
                    <div
                      role="menu"
                      aria-hidden={!copyMenuOpen}
                      className={`absolute right-0 top-full z-30 mt-2 max-h-60 w-72 origin-top-right overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg transition duration-150 ease-out ${
                        copyMenuOpen
                          ? "visible translate-y-0 scale-100 opacity-100"
                          : "pointer-events-none invisible -translate-y-1 scale-95 opacity-0"
                      }`}
                    >
                      {copySources.map((source) => (
                        <button
                          key={source.plan_order_id}
                          type="button"
                          role="menuitem"
                          tabIndex={copyMenuOpen ? 0 : -1}
                          onClick={() => void copyFromOrder(source)}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-blue-50 hover:text-blue-700"
                        >
                          <span>
                            Copy as Cycle {source.cycle_number} / Day {source.cycle_day}
                          </span>
                          <span className="text-xs text-gray-400">
                            {source.order_status === "COMPLETED"
                              ? `Completed ${formatDateDMY(source.completed_at)}`
                              : "Ordered"}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleNext}
                  disabled={savingPlan}
                  className="inline-flex items-center justify-center rounded-md border border-transparent bg-blue-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingPlan ? "Saving..." : "Next"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ================= ORDER TABLE ================= */}
        {activeTab === "Chemotherapy Orders" ? (
          <div className="p-8">
            {renderRowError()}

            {/* Inputs the Dose Cal formulas use (spec Section 4). */}

            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="py-4 pl-6 pr-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Drug Name
                    </th>

                    <th className="px-3 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Form
                    </th>

                    <th className="px-3 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Dose Cal
                    </th>

                    <th className="px-3 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Dose
                    </th>

                    <th className="px-3 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Unit
                    </th>

                    <th className="px-3 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Patient Dose
                    </th>

                    <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-200 bg-white">
                  {tablesLoading && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-6 py-8 text-center text-sm text-gray-500"
                      >
                        Loading chemotherapy orders
                      </td>
                    </tr>
                  )}

                  {!tablesLoading && !planError && drugs.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-6 py-8 text-center text-sm text-gray-500"
                      >
                        No chemotherapy orders found for this patient.
                      </td>
                    </tr>
                  )}

                  {planError && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-6 py-8 text-center text-sm text-red-500"
                      >
                        {planError}
                      </td>
                    </tr>
                  )}

                  {drugs.map((drug) => {
                    const isEditingRow =
                      editingRow?.kind === "drug" &&
                      editingRow.view === "row" &&
                      editingRow.id === drug.id;

                    if (isEditingRow && editDraft) {
                      return (
                        <tr
                          key={drug.id}
                          className="bg-blue-50/40 transition-colors"
                        >
                          <td className="px-3 py-3 pl-6 pr-3">
                            {renderDrugNameEditor()}
                          </td>

                          <td className="px-3 py-3">
                            {renderEditInput("form", "Form")}
                          </td>

                          <td className="px-3 py-3">
                            {renderDoseCalcCell(editDraft, (patch) =>
                              setEditDraft((previous) =>
                                previous ? { ...previous, ...patch } : previous
                              )
                            )}
                          </td>

                          <td className="px-3 py-3">
                            <input
                              type="text"
                              value={editDraft.dose}
                              onChange={(event) =>
                                updateEditDraft(
                                  "dose",
                                  event.target.value
                                )
                              }
                              className="w-full min-w-[100px] rounded-md border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                            />
                          </td>

                          <td className="px-3 py-3">
                            <input
                              type="text"
                              value={editDraft.unit}
                              onChange={(event) =>
                                updateEditDraft(
                                  "unit",
                                  event.target.value
                                )
                              }
                              className="w-full min-w-[100px] rounded-md border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                            />
                          </td>

                          <td className="px-3 py-3">
                            {renderPatientDoseCell(
                              computePatientDose(editDraft, dosingInputs)
                            )}
                          </td>

                          <td className="whitespace-nowrap px-6 py-3 text-right text-sm font-medium">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={saveEditedDrug}
                                disabled={savingEdit}
                                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {savingEdit ? "Saving" : "Save"}
                              </button>

                              <button
                                type="button"
                                onClick={cancelEdit}
                                disabled={savingEdit}
                                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    return (
                    <tr
                      key={drug.id}
                      className="transition-colors hover:bg-gray-50"
                    >
                      <td className="whitespace-nowrap py-5 pl-6 pr-3 text-base font-medium text-gray-900">
                        {drug.name}
                      </td>

                      <td className="whitespace-nowrap px-3 py-5 text-base text-gray-500">
                        {drug.form}
                      </td>

                      <td className="px-3 py-5">
                        {renderDoseCalcCell(
                          drug,
                          (patch) => updatePrimaryDrug(drug.id, patch),
                          orderLocked
                        )}
                      </td>

                      <td className="whitespace-nowrap px-3 py-5 text-base text-gray-900">
                        {drug.dose}
                      </td>

                      <td className="whitespace-nowrap px-3 py-5 text-base text-blue-500">
                        {drug.unit}
                      </td>

                      <td className="px-3 py-5">
                        {renderPatientDoseCell(
                          computePatientDose(drug, dosingInputs)
                        )}
                      </td>

                      <td className="whitespace-nowrap px-6 py-5 text-right text-sm font-medium">
                        <div className={`flex items-center justify-end gap-3 text-gray-500${orderLocked ? " hidden" : ""}`}>
                          <button
                            type="button"
                            aria-label={`Edit ${drug.name}`}
                            onClick={() =>
                              handleEdit(drug.id)
                            }
                            className="transition-colors hover:text-gray-900 focus:outline-none"
                          >
                            <EditIcon />
                          </button>

                          <button
                            type="button"
                            aria-label={`Delete ${drug.name}`}
                            onClick={() =>
                              handleDelete(drug.id)
                            }
                            className="transition-colors hover:text-red-600 focus:outline-none"
                          >
                            <DeleteIcon />
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
</table>
             </div>

            {renderAddMedicineButton(() => addMedicineRow("drug"))}
          </div>
        ) : activeTab === "Premedication" ? (
          <div className="p-8">
            {renderRowError()}
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="py-4 pl-6 pr-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Drug Name
                    </th>

                    <th className="px-3 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Form
                    </th>

                    <th className="px-3 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Dose
                    </th>

                    <th className="px-3 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Unit
                    </th>

                    <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-200 bg-white">
                  {tablesLoading && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-6 py-8 text-center text-sm text-gray-500"
                      >
                        Loading premedication
                      </td>
                    </tr>
                  )}

                  {!tablesLoading &&
                    !planError &&
                    premedicationDrugs.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-6 py-8 text-center text-sm text-gray-500"
                        >
                          No premedication drugs found for this protocol.
                        </td>
                      </tr>
                    )}

                  {planError && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-6 py-8 text-center text-sm text-red-500"
                      >
                        {planError}
                      </td>
                    </tr>
                  )}

                  {premedicationDrugs.map((drug) => {
                    const isEditingRow =
                      editingRow?.kind === "premedication" &&
                      editingRow.view === "row" &&
                      editingRow.id === drug.id;

                    if (isEditingRow && editDraft) {
                      return (
                        <tr
                          key={drug.id}
                          className="bg-blue-50/40 transition-colors"
                        >
                          <td className="px-3 py-3 pl-6 pr-3">
                            {renderDrugNameEditor()}
                          </td>

                          <td className="px-3 py-3">
                            {renderEditInput("form", "Form")}
                          </td>

                          <td className="px-3 py-3">
                            <input
                              type="text"
                              value={editDraft.dose}
                              onChange={(event) =>
                                updateEditDraft(
                                  "dose",
                                  event.target.value
                                )
                              }
                              className="w-full min-w-[100px] rounded-md border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                            />
                          </td>

                          <td className="px-3 py-3">
                            <input
                              type="text"
                              value={editDraft.unit}
                              onChange={(event) =>
                                updateEditDraft(
                                  "unit",
                                  event.target.value
                                )
                              }
                              className="w-full min-w-[100px] rounded-md border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                            />
                          </td>

                          <td className="whitespace-nowrap px-6 py-3 text-right text-sm font-medium">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={saveEditedDrug}
                                disabled={savingEdit}
                                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {savingEdit ? "Saving" : "Save"}
                              </button>

                              <button
                                type="button"
                                onClick={cancelEdit}
                                disabled={savingEdit}
                                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    return (
                    <tr
                      key={drug.id}
                      className="transition-colors hover:bg-gray-50"
                    >
                      <td className="whitespace-nowrap py-5 pl-6 pr-3 text-base font-medium text-gray-900">
                        {drug.name}
                      </td>

                      <td className="whitespace-nowrap px-3 py-5 text-base text-gray-500">
                        {drug.form}
                      </td>

                      <td className="whitespace-nowrap px-3 py-5 text-base text-gray-900">
                        {drug.dose}
                      </td>

                      <td className="whitespace-nowrap px-3 py-5 text-base text-blue-500">
                        {drug.unit}
                      </td>

                      <td className="whitespace-nowrap px-6 py-5 text-right text-sm font-medium">
                        <div className={`flex items-center justify-end gap-3 text-gray-500${orderLocked ? " hidden" : ""}`}>
                          <button
                            type="button"
                            aria-label={`Edit ${drug.name}`}
                            onClick={() =>
                              handleEditPremedication(drug.id)
                            }
                            className="transition-colors hover:text-gray-900 focus:outline-none"
                          >
                            <EditIcon />
                          </button>

                          <button
                            type="button"
                            aria-label={`Delete ${drug.name}`}
                            onClick={() =>
                              handleDeletePremedication(drug.id)
                            }
                            className="transition-colors hover:text-red-600 focus:outline-none"
                          >
                            <DeleteIcon />
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {renderAddMedicineButton(() => addMedicineRow("premedication"))}
          </div>
        ) : activeTab === "Supportive" ? (
          <div className="p-8">
            {renderRowError()}
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="py-4 pl-6 pr-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Drug Name
                    </th>

                    <th className="px-3 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Form
                    </th>

                    <th className="px-3 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Dose
                    </th>

                    <th className="px-3 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Unit
                    </th>

                    <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-200 bg-white">
                  {tablesLoading && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-6 py-8 text-center text-sm text-gray-500"
                      >
                        Loading supportive drugs
                      </td>
                    </tr>
                  )}

                  {!tablesLoading &&
                    !planError &&
                    supportiveDrugs.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-6 py-8 text-center text-sm text-gray-500"
                        >
                          No supportive drugs found for this protocol.
                        </td>
                      </tr>
                    )}

                  {planError && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-6 py-8 text-center text-sm text-red-500"
                      >
                        {planError}
                      </td>
                    </tr>
                  )}

                  {supportiveDrugs.map((drug) => {
                    const isEditingRow =
                      editingRow?.kind === "supportive" &&
                      editingRow.view === "row" &&
                      editingRow.id === drug.id;

                    if (isEditingRow && editDraft) {
                      return (
                        <tr
                          key={drug.id}
                          className="bg-blue-50/40 transition-colors"
                        >
                          <td className="px-3 py-3 pl-6 pr-3">
                            {renderDrugNameEditor()}
                          </td>

                          <td className="px-3 py-3">
                            {renderEditInput("form", "Form")}
                          </td>

                          <td className="px-3 py-3">
                            <input
                              type="text"
                              value={editDraft.dose}
                              onChange={(event) =>
                                updateEditDraft("dose", event.target.value)
                              }
                              className="w-full min-w-[100px] rounded-md border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                            />
                          </td>

                          <td className="px-3 py-3">
                            <input
                              type="text"
                              value={editDraft.unit}
                              onChange={(event) =>
                                updateEditDraft("unit", event.target.value)
                              }
                              className="w-full min-w-[100px] rounded-md border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                            />
                          </td>

                          <td className="whitespace-nowrap px-6 py-3 text-right text-sm font-medium">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={saveEditedDrug}
                                disabled={savingEdit}
                                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {savingEdit ? "Saving" : "Save"}
                              </button>

                              <button
                                type="button"
                                onClick={cancelEdit}
                                disabled={savingEdit}
                                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    return (
                    <tr
                      key={drug.id}
                      className="transition-colors hover:bg-gray-50"
                    >
                      <td className="whitespace-nowrap py-5 pl-6 pr-3 text-base font-medium text-gray-900">
                        {drug.name}
                      </td>

                      <td className="whitespace-nowrap px-3 py-5 text-base text-gray-500">
                        {drug.form}
                      </td>

                      <td className="whitespace-nowrap px-3 py-5 text-base text-gray-900">
                        {drug.dose}
                      </td>

                      <td className="whitespace-nowrap px-3 py-5 text-base text-blue-500">
                        {drug.unit}
                      </td>

                      <td className="whitespace-nowrap px-6 py-5 text-right text-sm font-medium">
                        <div className={`flex items-center justify-end gap-3 text-gray-500${orderLocked ? " hidden" : ""}`}>
                          <button
                            type="button"
                            aria-label={`Edit ${drug.name}`}
                            onClick={() => handleEditSupportive(drug.id)}
                            className="transition-colors hover:text-gray-900 focus:outline-none"
                          >
                            <EditIcon />
                          </button>

                          <button
                            type="button"
                            aria-label={`Delete ${drug.name}`}
                            onClick={() => handleDeleteSupportive(drug.id)}
                            className="transition-colors hover:text-red-600 focus:outline-none"
                          >
                            <DeleteIcon />
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {renderAddMedicineButton(() => addMedicineRow("supportive"))}
          </div>
        ) : activeTab === "Admin Instructions" ? (
          <div className="p-8">
            {renderRowError()}
            <p className="mb-4 text-sm text-gray-500">
              Administration instructions for the drugs of this order:
            </p>

            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {[
                      "Drug Name",
                      "Route",
                      "Infusion",
                      "Frequency",
                      "Timing",
                      "Admin Detail",
                      "Remarks",
                    ].map((label, index) => (
                      <th
                        key={label}
                        className={`${
                          index === 0 ? "py-4 pl-6 pr-3" : "px-3 py-4"
                        } text-left text-xs font-semibold uppercase tracking-wider text-gray-500`}
                      >
                        {label}
                      </th>
                    ))}

                    <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-200 bg-white">
                  {tablesLoading && (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-6 py-8 text-center text-sm text-gray-500"
                      >
                        Loading administration instructions
                      </td>
                    </tr>
                  )}

                  {!tablesLoading && !planError && adminRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-6 py-8 text-center text-sm text-gray-500"
                      >
                        No administration instructions found for this
                        protocol.
                      </td>
                    </tr>
                  )}

                  {planError && (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-6 py-8 text-center text-sm text-red-500"
                      >
                        {planError}
                      </td>
                    </tr>
                  )}

                  {adminRows.map(({ kind, drug }) => {
                    const isEditingRow =
                      editingRow?.view === "admin" &&
                      editingRow.kind === kind &&
                      editingRow.id === drug.id;

                    if (isEditingRow && editDraft) {
                      return (
                        <tr
                          key={`${kind}-${drug.id}`}
                          className="bg-blue-50/40 align-top transition-colors"
                        >
                          <td className="py-3 pl-6 pr-3">
                            {renderDrugNameEditor()}
                          </td>

                          <td className="px-3 py-3">
                            {renderEditInput("route", "e.g. IV")}
                          </td>

                          <td className="px-3 py-3">
                            <div className="flex min-w-[160px] flex-col gap-1.5">
                              {renderEditInput("infusionType", "Infusion type")}
                              <label className="flex items-center gap-1.5 text-xs text-gray-500">
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={editDraft.infusionDuration ?? ""}
                                  onChange={(event) =>
                                    updateEditDraft(
                                      "infusionDuration",
                                      event.target.value
                                    )
                                  }
                                  placeholder="0"
                                  className={`${EDIT_INPUT_CLASS} w-24 min-w-0`}
                                />
                                min
                              </label>
                            </div>
                          </td>

                          <td className="px-3 py-3">
                            {renderEditInput("frequency", "Frequency")}
                          </td>

                          <td className="px-3 py-3">
                            {renderEditInput("timing", "Timing")}
                          </td>

                          <td className="px-3 py-3">
                            {renderEditTextarea(
                              "administrationDetail",
                              "Administration detail"
                            )}
                          </td>

                          <td className="px-3 py-3">
                            {renderEditTextarea("remarks", "Remarks")}
                          </td>

                          <td className="whitespace-nowrap px-6 py-3 text-right text-sm font-medium">
                            {renderEditActions(saveEditedDrug)}
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr
                        key={`${kind}-${drug.id}`}
                        className="align-top transition-colors hover:bg-gray-50"
                      >
                        <td className="whitespace-nowrap py-5 pl-6 pr-3 text-sm font-medium text-gray-900">
                          {drug.name || "—"}
                        </td>

                        <td className="whitespace-nowrap px-3 py-5 text-sm text-gray-500">
                          {drug.route || "—"}
                        </td>

                        <td className="whitespace-nowrap px-3 py-5 text-sm text-gray-500">
                          {infusionLabel(drug) || "—"}
                        </td>

                        <td className="whitespace-nowrap px-3 py-5 text-sm text-gray-500">
                          {drug.frequency || "—"}
                        </td>

                        <td className="whitespace-nowrap px-3 py-5 text-sm text-gray-500">
                          {drug.timing || "—"}
                        </td>

                        <td className="px-3 py-5 text-sm text-gray-700">
                          {drug.administrationDetail || "—"}
                        </td>

                        <td className="px-3 py-5 text-sm text-gray-500">
                          {drug.remarks || "—"}
                        </td>

                        <td className="whitespace-nowrap px-6 py-5 text-right text-sm font-medium">
                          {renderRowActions(
                            drug.name,
                            () => startEdit(kind, drug, "admin"),
                            () => handleDeleteAdminRow(kind, drug)
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : activeTab === "Hydration" ? (
          <div className="p-8">
            {renderRowError()}
            <p className="mb-4 text-sm text-gray-500">
              Hydration guidance for the selected protocol (document Section 3
              - values by chemotherapy agent):
            </p>

            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {["Stage", "Agent", "Diluent", "Volume", "Guidance"].map(
                      (label, index) => (
                        <th
                          key={label}
                          className={`${
                            index === 0 ? "py-4 pl-6 pr-3" : "px-3 py-4"
                          } text-left text-xs font-semibold uppercase tracking-wider text-gray-500`}
                        >
                          {label}
                        </th>
                      )
                    )}

                    <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-200 bg-white">
                  {tablesLoading && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-6 py-8 text-center text-sm text-gray-500"
                      >
                        Loading hydration guidance
                      </td>
                    </tr>
                  )}

                  {!tablesLoading &&
                    !planError &&
                    hydrationRows.length === 0 && (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-6 py-8 text-center text-sm text-gray-500"
                        >
                          No mandatory hydration for this protocol.
                        </td>
                      </tr>
                    )}

                  {planError && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-6 py-8 text-center text-sm text-red-500"
                      >
                        {planError}
                      </td>
                    </tr>
                  )}

                  {hydrationRows.map((row) => {
                    const isEditingRow =
                      editingRow?.view === "hydration" &&
                      editingRow.id === row.id;

                    if (isEditingRow && hydrationDraft) {
                      return (
                        <tr
                          key={row.id}
                          className="bg-blue-50/40 align-top transition-colors"
                        >
                          <td className="py-3 pl-6 pr-3">
                            <select
                              value={hydrationDraft.stage}
                              onChange={(event) =>
                                updateHydrationDraft("stage", event.target.value)
                              }
                              className={`${EDIT_INPUT_CLASS} w-28 min-w-0`}
                            >
                              <option value="PRE">PRE</option>
                              <option value="POST">POST</option>
                            </select>
                          </td>

                          <td className="px-3 py-3">
                            <input
                              type="text"
                              value={hydrationDraft.agent}
                              onChange={(event) =>
                                updateHydrationDraft("agent", event.target.value)
                              }
                              placeholder="Agent"
                              className={EDIT_INPUT_CLASS}
                            />
                          </td>

                          <td className="px-3 py-3">
                            <input
                              type="text"
                              value={hydrationDraft.diluent}
                              onChange={(event) =>
                                updateHydrationDraft("diluent", event.target.value)
                              }
                              placeholder="e.g. NS 0.9%"
                              className={EDIT_INPUT_CLASS}
                            />
                          </td>

                          <td className="px-3 py-3">
                            <div className="flex min-w-[180px] items-center gap-1.5">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={hydrationDraft.volume}
                                onChange={(event) =>
                                  updateHydrationDraft("volume", event.target.value)
                                }
                                placeholder="0"
                                className={`${EDIT_INPUT_CLASS} w-24 min-w-0`}
                              />
                              <input
                                type="text"
                                value={hydrationDraft.volumeUnit}
                                onChange={(event) =>
                                  updateHydrationDraft(
                                    "volumeUnit",
                                    event.target.value
                                  )
                                }
                                placeholder="mL"
                                className={`${EDIT_INPUT_CLASS} w-20 min-w-0`}
                              />
                            </div>
                          </td>

                          <td className="px-3 py-3">
                            <textarea
                              value={hydrationDraft.guidance}
                              onChange={(event) =>
                                updateHydrationDraft("guidance", event.target.value)
                              }
                              placeholder="Guidance"
                              rows={2}
                              className={`${EDIT_INPUT_CLASS} min-w-[220px] resize-y text-sm`}
                            />
                          </td>

                          <td className="whitespace-nowrap px-6 py-3 text-right text-sm font-medium">
                            {renderEditActions(saveHydrationRow)}
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr
                        key={row.id}
                        className="align-top transition-colors hover:bg-gray-50"
                      >
                        <td className="whitespace-nowrap py-5 pl-6 pr-3 text-sm">
                          <span
                            className={
                              row.stage === "PRE"
                                ? "rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700"
                                : "rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700"
                            }
                          >
                            {row.stage}
                          </span>
                        </td>

                        <td className="whitespace-nowrap px-3 py-5 text-sm font-medium text-gray-900">
                          {row.agent || "—"}
                        </td>

                        <td className="whitespace-nowrap px-3 py-5 text-sm text-gray-500">
                          {row.diluent || "—"}
                        </td>

                        <td className="whitespace-nowrap px-3 py-5 text-sm text-gray-500">
                          {row.volume
                            ? `${row.volume}${row.volumeUnit ? ` ${row.volumeUnit}` : ""}`
                            : "—"}
                        </td>

                        <td className="px-3 py-5 text-sm text-gray-700">
                          {row.guidance || "—"}
                        </td>

                        <td className="whitespace-nowrap px-6 py-5 text-right text-sm font-medium">
                          {renderRowActions(
                            row.agent || "hydration row",
                            () => startHydrationEdit(row),
                            () => void removeHydrationRow(row.id)
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {renderAddMedicineButton(addHydrationRow)}
          </div>
        ) : activeTab === "Dilution" ? (
          <div className="p-8">
            {renderRowError()}
            <p className="mb-4 text-sm text-gray-500">
              Dilution details for the selected protocol day - the diluent
              and volume each agent is prepared in. A row added or changed
              here is saved on this patient's cycle day order only.
            </p>

            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {[
                      "Drug Name",
                      "Form",
                      "Dose",
                      "Unit",
                      "Diluent",
                      "Dilution Volume",
                      "Guidance",
                    ].map((label, index) => (
                      <th
                        key={label}
                        className={`${
                          index === 0 ? "py-4 pl-6 pr-3" : "px-3 py-4"
                        } text-left text-xs font-semibold uppercase tracking-wider text-gray-500`}
                      >
                        {label}
                      </th>
                    ))}

                    <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-200 bg-white">
                  {tablesLoading && (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-6 py-8 text-center text-sm text-gray-500"
                      >
                        Loading dilution details
                      </td>
                    </tr>
                  )}

                  {!tablesLoading &&
                    !planError &&
                    dilutionDrugs.length === 0 && (
                      <tr>
                        <td
                          colSpan={8}
                          className="px-6 py-8 text-center text-sm text-gray-500"
                        >
                          No dilution details found for this protocol day.
                        </td>
                      </tr>
                    )}

                  {planError && (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-6 py-8 text-center text-sm text-red-500"
                      >
                        {planError}
                      </td>
                    </tr>
                  )}

                  {dilutionDrugs.map((drug) => {
                    const isEditingRow =
                      editingRow?.kind === "dilution" &&
                      editingRow.view === "row" &&
                      editingRow.id === drug.id;

                    if (isEditingRow && editDraft) {
                      return (
                        <tr
                          key={drug.id}
                          className="align-top bg-blue-50/40 transition-colors"
                        >
                          <td className="py-3 pl-6 pr-3">
                            {renderDrugNameEditor()}
                          </td>

                          <td className="px-3 py-3">
                            {renderEditInput("form", "Form")}
                          </td>

                          <td className="px-3 py-3">
                            {renderEditInput("dose", "Dose")}
                          </td>

                          <td className="px-3 py-3">
                            {renderEditInput("unit", "Unit")}
                          </td>

                          <td className="px-3 py-3">
                            {renderEditInput(
                              "dilutionSolution",
                              "e.g. NS 0.9%"
                            )}
                          </td>

                          <td className="px-3 py-3">
                            {renderEditInput(
                              "volume",
                              "500 mL"
                            )}
                          </td>

                          <td className="px-3 py-3">
                            {renderEditTextarea(
                              "administrationDetail",
                              "Guidance"
                            )}
                          </td>

                          <td className="whitespace-nowrap px-6 py-3 text-right text-sm font-medium">
                            {renderEditActions(saveEditedDrug)}
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr
                        key={drug.id}
                        className="align-top transition-colors hover:bg-gray-50"
                      >
                        <td className="whitespace-nowrap py-5 pl-6 pr-3 text-base font-medium text-gray-900">
                          {drug.name}
                        </td>

                        <td className="whitespace-nowrap px-3 py-5 text-base text-gray-500">
                          {drug.form || "—"}
                        </td>

                        <td className="whitespace-nowrap px-3 py-5 text-base text-gray-900">
                          {drug.dose || "—"}
                        </td>

                        <td className="whitespace-nowrap px-3 py-5 text-base text-blue-500">
                          {drug.unit || "—"}
                        </td>

                        <td className="whitespace-nowrap px-3 py-5 text-base text-gray-500">
                          {drug.dilutionSolution || "—"}
                        </td>

                        <td className="whitespace-nowrap px-3 py-5 text-base text-gray-500">
                          {drug.volume || "—"}
                        </td>

                        <td className="px-3 py-5 text-sm text-gray-700">
                          {drug.administrationDetail || "—"}
                        </td>

                        <td className="whitespace-nowrap px-6 py-5 text-right text-sm font-medium">
                          {renderRowActions(
                            drug.name || "dilution row",
                            () => handleEditDilution(drug.id),
                            () => handleDeleteDilution(drug.id)
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {renderAddMedicineButton(() => addMedicineRow("dilution"))}
          </div>
        ) : (
          /* Other Tabs */
          <div className="flex min-h-[300px] items-center justify-center p-8">
            <div className="text-center">
              <p className="text-lg font-semibold text-gray-700">
                {activeTab}
              </p>

              <p className="mt-2 text-sm text-gray-500">
                No items available.
              </p>
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-4 rounded-lg border border-gray-200 p-6">
          <div className="text-base font-semibold text-gray-900">
            Discussion
          </div>
          <VoiceToText
            value={discussion}
            onChange={setDiscussion}
            placeholder="Type the discussion..."
          />
        </div>

        <div className="mt-6 flex flex-col gap-4 rounded-lg border border-gray-200 p-6">
          <div className="text-base font-semibold text-gray-900">
            Post Chemo Instructions
          </div>
          <VoiceToText
            value={postChemoInstructions}
            onChange={setPostChemoInstructions}
            placeholder="Type the post chemo instructions..."
          />
        </div>

        <div className="mt-6 flex flex-col gap-4 rounded-lg border border-gray-200 p-6">
          <div className="text-base font-semibold text-gray-900">
            Additional Notes
          </div>
          <VoiceToText
            value={additionalNotes}
            onChange={setAdditionalNotes}
            placeholder="Type any additional notes..."
          />
        </div>
      </div>
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <div className="min-h-screen bg-[#fafbfc] font-sans text-gray-800 antialiased">
      {/* ================= HEADER ================= */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center gap-4">
          <button
            type="button"
            aria-label="Go back"
            className="rounded-full p-1 text-gray-600 transition-colors hover:text-gray-900 focus:outline-none"
            onClick={() => window.history.back()}
          >
            <BackIcon />
          </button>

          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Patients
          </h1>
        </div>

        <div className="flex items-center gap-6">
          {/* Notification */}
          <button
            type="button"
            aria-label="Notifications"
            className="relative text-gray-500 transition-colors hover:text-gray-700 focus:outline-none"
          >
            <BellIcon />

            <span className="absolute right-0 top-0 block h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />
          </button>

          {/* User */}
          <UserProfileDropdown
            userName={getUser()?.username || "Doctor"}
            userSubtext={getUser()?.role || "Doctor"}
            userAvatar={userAvatarUrl || undefined}
            avatarLoading={avatarLoading}
            onLogout={() => { localStorage.clear(); window.location.href = '/login'; }}
            profilePath="/doctor/profile"
            notificationsPath="/doctor/notifications"
          />
        </div>
      </header>

      {/* ================= MAIN ================= */}
      <main className="flex min-h-[calc(100vh-73px)] flex-grow justify-center p-8">
        <div className="w-full space-y-8">
          {/* ================= STEPPER ================= */}
          <nav
            aria-label="Progress"
            className="relative"
          >
            <ol className="relative z-0 flex w-full items-center">
              {/* Step 1 */}
              <li className="relative flex-1 text-center">
                <div className="flex flex-col items-center">
                  <span className="relative z-10 mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-gray-400 text-white shadow-sm">
                    <CheckIcon />
                  </span>

                  <span className="text-xs font-bold uppercase tracking-wider text-gray-900">
                    Diagnosis
                  </span>
                </div>

                <div className="absolute left-1/2 top-4 -z-10 h-0.5 w-full bg-gray-200" />
              </li>

              {/* Step 2 */}
              <li className="relative flex-1 text-center">
                <div className="flex flex-col items-center">
                  <span className="relative z-10 mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-gray-400 text-white shadow-sm">
                    <CheckIcon />
                  </span>

                  <span className="text-xs font-bold uppercase tracking-wider text-gray-900">
                    Treatment Plan
                  </span>
                </div>

                <div className="absolute right-1/2 top-4 -z-10 h-0.5 w-full bg-gray-200" />
                <div className="absolute left-1/2 top-4 -z-10 h-0.5 w-full bg-gray-200" />
              </li>

              {/* Step 3 */}
              <li className="relative flex-1 text-center">
                <div className="flex flex-col items-center">
                  <span className="relative z-10 mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-green-500 text-white shadow-md ring-4 ring-white">
                    <CheckIcon />
                  </span>

                  <span className="text-xs font-bold uppercase tracking-wider text-gray-900">
                    Chemotherapy Order
                  </span>

                  <div className="mx-auto mt-3 h-1.5 w-full max-w-[200px] rounded-t-md bg-green-500" />
                </div>

                <div className="absolute right-1/2 top-4 -z-10 h-0.5 w-full bg-gray-200" />
                <div className="absolute left-1/2 top-4 -z-10 h-0.5 w-full bg-gray-200" />
              </li>

              {/* Step 4 */}
              <li className="relative flex-1 text-center">
                <div className="flex flex-col items-center opacity-50">
                  <span className="relative z-10 mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-gray-400 text-white shadow-sm" />

                  <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                    Discharge Plan
                  </span>
                </div>

                <div className="absolute right-1/2 top-4 -z-10 h-0.5 w-full bg-gray-200" />
              </li>
            </ol>
          </nav>

          {content}
        </div>
      </main>
    </div>
  );
};

export default ChemotherapyOrder;
