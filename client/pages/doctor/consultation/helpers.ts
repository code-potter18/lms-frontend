import API, { getActiveBranchId } from "../../../api/axios";
import { appointmentApi } from "../../../api/appointment.api";
import { getUser } from "../../../utils/token";
import { encounterApi, type EncounterRecord } from "../../../api/encounter.api";
import { ipdApi, type AdmissionRecord } from "../../../api/ipd.api";
import {
  chemotherapyApi,
  isChemoPlanClosed,
  type ChemoPlanInvestigation,
  type ChemoPlanOrderHeader,
  type ChemoPlanOrderPayload,
} from "../../../api/chemotherapy.api";
import {
  labOrderApi,
  labOrderItemApi,
  type LabOrderRecord,
} from "../../../api/labOrder.api";
import type {
  FormData,
  RegimenProtocolDetail,
  RegimenProtocolDilution,
  RegimenProtocolItem,
} from "./types";
import type { DosingSnapshot, OrderPlanItem } from "./doseCalculation";

export const formatPickedDate = (date: Date) => {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}-${month}-${date.getFullYear()}`;
};

export const parsePickedDate = (value: string) => {
  const match = value.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (!match) return undefined;
  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
};

/* Strict DD-MM-YYYY -> YYYY-MM-DD. Rejects impossible dates such as
   31-02-2026, which parsePickedDate would roll over into March. */
export const dmyToIsoStrict = (value: string): string | undefined => {
  const date = parsePickedDate(value.trim());
  if (!date) return undefined;
  const [day, month, year] = value.trim().split("-").map(Number);
  if (
    date.getDate() !== day ||
    date.getMonth() !== month - 1 ||
    date.getFullYear() !== year
  ) {
    return undefined;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

/* Formats a typed/pasted date as DD-MM-YYYY. Digits overflow into the next
   part ("10102026" -> "10-10-2026"), "/" or "." count as "-", and while
   typing forward a full day/month gets its "-" added and a separator after
   a single digit pads it ("1-" -> "01-"). Deleting never re-adds a "-". */
export const maskDmyInput = (next: string, prev: string) => {
  const typingForward = next.length > prev.length;
  const parts: string[] = [""];

  for (const char of next) {
    const last = parts.length - 1;
    if (/\d/.test(char)) {
      if (parts[last].length < (last < 2 ? 2 : 4)) parts[last] += char;
      else if (last < 2) parts.push(char);
    } else if (/[-/.]/.test(char) && last < 2 && parts[last]) {
      parts.push("");
    }
  }

  if (typingForward) {
    const last = parts.length - 1;
    if (/[-/.]$/.test(next) && last > 0 && parts[last] === "") {
      parts[last - 1] = parts[last - 1].padStart(2, "0");
    } else if (last < 2 && parts[last].length === 2) {
      parts.push("");
    }
  }

  return parts.join("-");
};

const todayIso = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
};

/* Validation message for an investigation's Target Date ("" when valid
   or empty - the field is optional). */
export const targetDateError = (value: string) => {
  if (!value.trim()) return "";
  const iso = dmyToIsoStrict(value);
  if (!iso) return "Use DD-MM-YYYY";
  if (iso < todayIso()) return "Date is in the past";
  return "";
};

/* DD-MM-YYYY of a DATE column value ("2026-10-07" or its UTC-midnight
   timestamp), read from the string so the timezone can't shift the day. */
export const dateOnlyDMY = (value?: string | null) => {
  const iso = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[3]}-${iso[2]}-${iso[1]}` : "";
};

/* ---------------- Follow Up block on the encounter advice ----------------
   The Follow Up step saves its values as a "[Follow Up]" block at the end
   of the visit encounter's advice ("Next Visit: ...", "Next Cycle: ...",
   "Plan: ...", "New Visit: ...", "Notes: ..."). */
export type FollowUpValues = {
  nextVisit: string;
  nextCycle: string;
  plan: string;
  newVisit: string;
  notes: string;
};

const FOLLOW_UP_KEYS: [string, keyof FollowUpValues][] = [
  ["Next Visit", "nextVisit"],
  ["Next Cycle", "nextCycle"],
  ["Plan", "plan"],
  ["New Visit", "newVisit"],
  ["Notes", "notes"],
];

/* One "[Name]" block of the advice - up to the next block, so re-saving a
   step never drops another step's block (e.g. Discharge Medication saved
   after Follow Up). */
export const adviceBlockPattern = (name: string) =>
  new RegExp(`\\n*\\[${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\][\\s\\S]*?(?=\\n*\\[[A-Z][^\\]\\n]*\\]\\s*(?:\\n|$)|$)`);

export const FOLLOW_UP_BLOCK_PATTERN = adviceBlockPattern("Follow Up");

/* The saved Follow Up values (empty strings when there is no block). A line
   without a known key continues the value above it (multi-line notes). */
export const parseFollowUpAdvice = (advice?: string | null): FollowUpValues => {
  const values: FollowUpValues = { nextVisit: "", nextCycle: "", plan: "", newVisit: "", notes: "" };
  const start = (advice ?? "").indexOf("[Follow Up]");
  if (start === -1) return values;
  let current: keyof FollowUpValues | null = null;
  const lines = (advice ?? "").slice(start + "[Follow Up]".length).split("\n");
  for (const line of lines) {
    /* The next step's block (e.g. "[Discharge Medication]") ends this one. */
    if (/^\[[A-Z][^\]]*\]$/.test(line.trim())) break;
    const known = FOLLOW_UP_KEYS.find(([label]) => line.startsWith(`${label}:`));
    if (known) {
      current = known[1];
      values[current] = line.slice(known[0].length + 1).trim();
    } else if (current && line.trim()) {
      values[current] = `${values[current]}\n${line}`.trim();
    }
  }
  return values;
};

/* The block's lines for the values that are set. */
export const followUpAdviceLines = (values: FollowUpValues): string[] =>
  FOLLOW_UP_KEYS.filter(([, key]) => values[key].trim()).map(
    ([label, key]) => `${label}: ${values[key].trim()}`
  );

/* Whole days since the epoch of a "YYYY-MM-DD..." value (UTC-safe). */
const isoDayNumber = (value?: string | null) => {
  const iso = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])) / 86_400_000 : NaN;
};

/* The Next Visit Date (DD-MM-YYYY) for a "Cycle N / Day M" label, from
   the patient's chemotherapy plan schedule; "" when the plan (or that day)
   has none. It follows on from this visit's cycle day and its Start Date
   (as set in the Chemotherapy Order, edited or not): the next day comes
   the same number of days after it as the schedule spaces the two days
   (e.g. Cycle 2 / Day 3 moved to 20-10 -> Day 4 on 21-10). A next day
   whose own date the doctor already set keeps that date. */
export const fetchScheduledDate = async (
  patientId: string,
  cycleLabel: string
): Promise<string> => {
  const match = cycleLabel.match(/Cycle\s*(\d+)\s*\/\s*Day\s*(\d+)/i);
  if (!patientId || !match) return "";
  try {
    const response = await chemotherapyApi.getLatestPlanForPatient(patientId);
    const schedule = response.data.data?.chemotherapy_plan_schedule ?? [];
    const rowOf = (cycle: number, day: number) =>
      schedule.find((entry) => entry.cycle_number === cycle && entry.cycle_day === day);
    const next = rowOf(Number(match[1]), Number(match[2]));
    if (!next) return "";
    if (next.edited) return dateOnlyDMY(next.planned_date);

    /* This visit's cycle day and its Start Date, from the order draft. */
    let draft: { orderCycle?: number | null; orderDay?: number | null; startDate?: string; startDateKey?: string } = {};
    try {
      draft = JSON.parse(localStorage.getItem(`hms_chemo_order_${patientId}`) ?? "{}") ?? {};
    } catch {
      draft = {};
    }
    const current =
      draft.orderCycle && draft.orderDay ? rowOf(draft.orderCycle, draft.orderDay) : undefined;
    const currentDate =
      (current && draft.startDateKey === `${current.cycle_number}/${current.cycle_day}`
        ? toIsoDate(draft.startDate)
        : undefined) ?? current?.planned_date;
    const gap =
      isoDayNumber(next.calculated_date ?? next.planned_date) -
      isoDayNumber(current?.calculated_date ?? current?.planned_date);

    if (current && currentDate && Number.isFinite(gap) && gap > 0) {
      return dateOnlyDMY(addDaysToIsoDate(currentDate, gap));
    }
    return dateOnlyDMY(next.planned_date);
  } catch {
    return "";
  }
};

/* A DATE column value moved by whole days, as YYYY-MM-DD. */
export const addDaysToIsoDate = (value: string, days: number) => {
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!iso) return "";
  const date = new Date(
    Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]) + days)
  );
  return date.toISOString().slice(0, 10);
};

/* A protocol item's day within a cycle (administration_day, else the
   legacy cycle_day); items without a day belong to Day 1. */
const protocolItemDay = (item: RegimenProtocolItem): number => {
  const day = Number(item.administration_day ?? item.cycle_day);
  return Number.isFinite(day) && day > 0 ? day : 1;
};

/* The Chemotherapy Order Dilution tab's template for a cycle day: the
   protocol-level dilutions (every day) plus those attached to that day's
   items (a "same as Day 1" day uses Day 1's), each with its item. */
export const protocolDayDilutions = (
  protocol: RegimenProtocolDetail | null | undefined,
  dayNumber: number | null
): { dilution: RegimenProtocolDilution; item?: RegimenProtocolItem }[] => {
  const items = protocol?.chemotherapy_regimen_protocol_items ?? [];
  const itemById = new Map(items.map((item) => [item.protocol_item_id, item]));

  const byId = new Map<string, RegimenProtocolDilution>();
  for (const dilution of protocol?.protocol_dilutions ?? []) {
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

  let day = dayNumber;
  if (day != null && day !== 1) {
    const days = protocol?.chemotherapy_regimen_protocol_days ?? [];
    if (
      days.find((entry) => entry.day_number === day)?.same_as_day_one &&
      days.some((entry) => entry.day_number === 1)
    ) {
      day = 1;
    }
  }
  const dayItemIds = new Set(
    day != null
      ? items
          .filter((item) => protocolItemDay(item) === day)
          .map((item) => item.protocol_item_id)
      : []
  );

  const all = [...byId.values()];
  return [
    ...all.filter((dilution) => !dilution.protocol_item_id),
    ...all.filter(
      (dilution) =>
        !!dilution.protocol_item_id && dayItemIds.has(dilution.protocol_item_id)
    ),
  ].map((dilution) => ({
    dilution,
    item: dilution.protocol_item_id
      ? itemById.get(dilution.protocol_item_id)
      : undefined,
  }));
};

export const parseDateValue = (value?: string | null): Date | null => {
  if (!value) return null;
  const trimmed = value.trim();
  const dmy = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmy) {
    return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
  }
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/* ============================================================
   PROTOCOL-DRIVEN NEXT VISIT DATE
   The "Next Visit Date" shown in the Follow Up and Summary steps
   is derived from the selected regimen protocol's cycle interval
   and the treatment start date stated in the Treatment Plan /
   Chemo Order: next visit = start date + protocol.cycle_interval_days.
   ============================================================ */

export const computeProtocolNextVisitDate = (
  startDateValue?: string | null,
  intervalDays?: number | null
): string => {
  const begin = parseDateValue(startDateValue);
  if (!begin) return "";
  const interval =
    intervalDays && intervalDays > 0 ? Math.round(intervalDays) : 21;
  const next = new Date(begin);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() + interval);
  const day = String(next.getDate()).padStart(2, "0");
  const month = String(next.getMonth() + 1).padStart(2, "0");
  return `${day}-${month}-${next.getFullYear()}`;
};

/* Resolve the date the oncologist stated for the treatment start:
   prefer the Chemo Order's stated start date, fall back to the
   Treatment Plan's planned start date. */
export const getStatedTreatmentStartDate = (patientId: string): string => {
  try {
    const draft = JSON.parse(
      localStorage.getItem(`hms_chemo_order_${patientId}`) ?? ""
    ) as { startDate?: string } | null;
    if (draft?.startDate) return draft.startDate;
  } catch {
    // Malformed draft - fall through to the treatment plan.
  }
  return localStorage.getItem(`hms_planned_start_date_${patientId}`) ?? "";
};

/* Pull the cycle number out of a "Cycle N / Day M" label. */
export const getStoredCycleNumber = (value: string): number | null => {
  const match = value.trim().match(/^Cycle\s+(\d+)/i);
  return match ? Number(match[1]) : null;
};

/* Resolve the effective treatment start date used to derive the next
   visit date. If neither the Chemo Order nor the Treatment Plan has an
   explicit date (the user accepted the auto-filled default), reconstruct
   the base date from the Chemo Order's pushed next-cycle value - the
   Chemotherapy Order always persists that value, keyed off the same
   base start date + (cycleNumber - 1) * interval. */
export const resolveEffectiveStartDate = (
  patientId: string,
  intervalDays?: number | null
): string => {
  const typedStartDate = getStatedTreatmentStartDate(patientId);
  if (typedStartDate) return typedStartDate;

  const interval =
    intervalDays && intervalDays > 0 ? Math.round(intervalDays) : 21;
  const pushedDate = parseDateValue(
    localStorage.getItem(`hms_next_cycle_date_${patientId}`)
  );
  if (!pushedDate) return "";

  const cycleNumber =
    getStoredCycleNumber(
      localStorage.getItem(`hms_next_cycle_${patientId}`) ?? ""
    ) ?? 1;
  const base = new Date(pushedDate);
  base.setHours(0, 0, 0, 0);
  base.setDate(base.getDate() - (cycleNumber - 1) * interval);
  const day = String(base.getDate()).padStart(2, "0");
  const month = String(base.getMonth() + 1).padStart(2, "0");
  return `${day}-${month}-${base.getFullYear()}`;
};

/* Past History shares the encounter's clinical_notes column with
   Consultation Notes. This marker separates the two sections so they
   can be split back apart when the encounter is loaded again. */
export const PAST_HISTORY_MARKER = "[Past History]";

/* ---------------- Visit investigations ----------------
   Investigations typed by the doctor that are not lab tests can't be lab
   order items; they are kept on the visit's lab order description. */
export const OTHER_INVESTIGATIONS_PREFIX = "Other investigations: ";

export const otherInvestigationsOf = (labDescription?: string | null): string[] => {
  const text = labDescription ?? "";
  const at = text.indexOf(OTHER_INVESTIGATIONS_PREFIX);
  if (at === -1) return [];
  return text
    .slice(at + OTHER_INVESTIGATIONS_PREFIX.length)
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
};

/* Adds newly advised non-lab investigations to a lab order's description.
   The prefix is written once, names are de-duplicated, and any free text
   already on the description is kept ahead of the investigations block
   (never clobbered). The block is found wherever it sits, so a description
   that started as free text is parsed correctly afterwards. */
export const mergeOtherInvestigations = (
  labDescription: string | null | undefined,
  names: string[]
): string => {
  const addition = names.map((name) => name.trim()).filter(Boolean);
  const existing = otherInvestigationsOf(labDescription);
  const text = (labDescription ?? "").trim();
  const at = text.indexOf(OTHER_INVESTIGATIONS_PREFIX);
  const freeText = (at === -1 ? text : text.slice(0, at))
    .replace(/[,\s]+$/, "")
    .trim();
  const merged = [...new Set([...existing, ...addition])];

  if (merged.length === 0) return text;

  const block = `${OTHER_INVESTIGATIONS_PREFIX}${merged.join(", ")}`;
  return freeText ? `${freeText}, ${block}` : block;
};

/* ---------------- Ordering a plan's investigations ----------------
   The Chemotherapy Order's Investigations tab (protocol-driven LAB rows plus
   name-only NON_LAB / TISSUE rows) is ordered once - from Discharge
   Medication > Next, or the tab's own "Order Investigations" button.

   LAB rows become lab_order_item rows carrying the tab's clinical notes,
   priority and target date; name-only rows are kept on the visit's lab order
   description. Ordering is idempotent: a test already on one of this visit's
   orders is not ordered again, and a name already recorded is not repeated.
   Nothing outside this patient's visit is ever read or written. */

export type PlanInvestigationOrderInput = {
  investigation_id?: string | null;
  lab_test_id?: string | null;
  investigation_name: string;
  investigation_category: "LAB" | "NON_LAB" | "TISSUE";
  investigation_type?: string | null;
  priority?: string | null;
  target_date?: string | null;
  clinical_notes?: string | null;
  item_status?: string | null;
  lab_order_id?: string | null;
  lab_order_item_id?: string | null;
};

export type PlanInvestigationOrderResult = {
  created: number;
  skipped: number;
  updated: number;
  errors: string[];
};

/* Testing methods accepted on a Molecular-category lab test. */
const LAB_ORDER_ITEM_METHODS = [
  "Germline Testing",
  "Tissue Biopsy Testing",
  "Liquid Biopsy Testing",
];

const LAB_PRIORITY_RANK: Record<string, number> = {
  Normal: 0,
  Urgent: 1,
  Stat: 2,
};

/* The Investigations tab's Normal / High / Urgent map onto the lab order's
   Normal / Urgent / Stat. */
export const labOrderPriorityOf = (
  priority?: string | null
): "Normal" | "Urgent" | "Stat" => {
  const value = (priority ?? "").trim().toLowerCase();
  if (value === "stat" || value === "critical") return "Stat";
  if (value === "urgent" || value === "high") return "Urgent";
  return "Normal";
};

export const highestLabOrderPriority = (
  priorities: (string | null | undefined)[]
): "Normal" | "Urgent" | "Stat" =>
  priorities.reduce<"Normal" | "Urgent" | "Stat">((highest, priority) => {
    const candidate = labOrderPriorityOf(priority);
    return LAB_PRIORITY_RANK[candidate] > LAB_PRIORITY_RANK[highest]
      ? candidate
      : highest;
  }, "Normal");

/* A cancelled / completed order can no longer take items. */
const isOpenLabOrder = (order: { order_status?: string | null }) => {
  const status = (order.order_status ?? "").trim().toLowerCase();
  return status !== "cancelled" && status !== "completed";
};

const resolveActingDoctorId = async (): Promise<string> => {
  const user = getUser();
  if (user?.employee_id) return user.employee_id;
  /* The login payload usually carries employee_id; when it does not, ask the
     server before falling back to the user id (doctor_employee_id is an
     employee reference). */
  try {
    const me = await API.get<{ user?: { employee_id?: string | null } }>(
      "/auth/me"
    );
    const employeeId = me.data?.user?.employee_id;
    if (employeeId) return employeeId;
  } catch {
    /* Fall through to the id we have. */
  }
  return user?.user_id ?? "";
};

const resolveOrderingEncounter = async (
  patientId: string,
  encounterNo?: string | null,
  appointmentId?: string | null
): Promise<EncounterRecord | null> => {
  if (encounterNo) {
    try {
      const found = (await encounterApi.getByNumber(encounterNo)).data?.data;
      if (found && found.patient_id === patientId) return found;
    } catch (error) {
      console.error("Failed to load the order's encounter:", error);
    }
  }
  if (appointmentId) {
    try {
      const found = (await encounterApi.getByAppointment(appointmentId)).data
        ?.data;
      if (found && found.patient_id === patientId) return found;
    } catch (error) {
      console.error("Failed to load the order's encounter:", error);
    }
  }
  return null;
};

export const orderPlanInvestigations = async ({
  planId,
  cycle,
  day,
  encounterNo,
  patientId,
  appointmentId,
  branchId,
  investigations,
}: {
  planId: string;
  cycle: number;
  day: number;
  encounterNo?: string | null;
  patientId: string;
  appointmentId?: string | null;
  branchId?: string | null;
  /* The tab's saved rows; fetched from the cycle day order when omitted. */
  investigations?: PlanInvestigationOrderInput[] | null;
}): Promise<PlanInvestigationOrderResult> => {
  const result: PlanInvestigationOrderResult = {
    created: 0,
    skipped: 0,
    updated: 0,
    errors: [],
  };

  if (!planId || !patientId) {
    result.errors.push(
      "A chemotherapy plan and patient are required to order investigations."
    );
    return result;
  }

  const encounter = await resolveOrderingEncounter(
    patientId,
    encounterNo,
    appointmentId
  );
  const patientHistoryId = encounter?.patient_history_id ?? undefined;
  const visitAppointmentId =
    appointmentId || encounter?.appointment_id || undefined;
  const visitBranchId =
    encounter?.branch_id ||
    branchId ||
    getActiveBranchId() ||
    getUser()?.branch_id ||
    undefined;

  let rows: PlanInvestigationOrderInput[];
  try {
    rows =
      investigations ??
      ((await chemotherapyApi.getPlanOrder(planId, cycle, day)).data.data
        ?.chemotherapy_plan_order_investigation as
        | ChemoPlanInvestigation[]
        | undefined) ??
      [];
  } catch (error: any) {
    result.errors.push(
      error?.response?.data?.message ||
        error?.message ||
        "Failed to load the plan's investigations."
    );
    return result;
  }

  /* Only rows still to be ordered. Already ordered rows keep their link. */
  const openRows = rows.filter(
    (row) => (row.item_status ?? "PLANNED") === "PLANNED"
  );
  const labRows = openRows.filter(
    (row) =>
      row.investigation_category === "LAB" &&
      Boolean(row.lab_test_id) &&
      Boolean(row.investigation_name?.trim())
  );
  const nonLabNames = [
    ...new Set(
      openRows
        .filter((row) => row.investigation_category !== "LAB")
        .map((row) => row.investigation_name?.trim())
        .filter(Boolean) as string[]
    ),
  ];

  if (labRows.length === 0 && nonLabNames.length === 0) return result;

  /* This visit's lab orders only - never another patient's / visit's. The
     encounter's patient_history row is the visit; without one, the
     appointment narrows it. With neither, no order is reused (a new one is
     created) rather than risking another visit's order. */
  const visitScope = patientHistoryId
    ? { patientHistoryId }
    : visitAppointmentId
      ? { patientId, appointmentId: visitAppointmentId }
      : null;

  let visitOrders: LabOrderRecord[] = [];
  if (visitScope) {
    try {
      visitOrders =
        (
          await labOrderApi.getAll({
            ...visitScope,
            limit: 200,
          })
        ).data.data ?? [];
    } catch (error: any) {
      result.errors.push(
        error?.response?.data?.message ||
          error?.message ||
          "Failed to load this visit's lab orders."
      );
      return result;
    }
  }

  /* Every test already ordered in this visit's open orders. A cancelled /
     completed order does not block ordering the test again. */
  const orderedTests = new Map<
    string,
    { labOrderId: string; itemId: string }
  >();
  visitOrders.filter(isOpenLabOrder).forEach((visitOrder) => {
    (visitOrder.lab_order_item ?? []).forEach((item) => {
      if (item.lab_test_id) {
        orderedTests.set(item.lab_test_id, {
          labOrderId: visitOrder.lab_order_id,
          itemId: item.lab_order_item_id,
        });
      }
    });
  });

  const recordedNames = new Set(
    visitOrders
      .flatMap((visitOrder) => otherInvestigationsOf(visitOrder.lab_description))
      .map((name) => name.toLowerCase())
  );
  const namesToAdd = nonLabNames.filter(
    (name) => !recordedNames.has(name.toLowerCase())
  );

  const openOrder = visitOrders.find(isOpenLabOrder) ?? null;
  let labOrderId = openOrder?.lab_order_id ?? "";
  let namesWritten = false;

  if (labRows.length > 0 || namesToAdd.length > 0) {
    if (!labOrderId) {
      const doctorId = await resolveActingDoctorId();
      if (!doctorId) {
        result.errors.push(
          "Could not resolve the logged-in doctor. Please log in again."
        );
        return result;
      }
      try {
        const created = (
          await labOrderApi.create({
            patient_id: patientId,
            ...(patientHistoryId
              ? { patient_history_id: patientHistoryId }
              : {}),
            doctor_employee_id: doctorId,
            ...(visitBranchId ? { branch_id: visitBranchId } : {}),
            ...(visitAppointmentId
              ? { appointment_id: visitAppointmentId }
              : {}),
            priority: highestLabOrderPriority(labRows.map((row) => row.priority)),
            ...(namesToAdd.length > 0
              ? {
                  lab_description: mergeOtherInvestigations("", namesToAdd),
                }
              : {}),
          })
        ).data.data;
        labOrderId = created?.lab_order_id ?? "";
        if (!labOrderId) throw new Error("Failed to create the lab order.");
        namesWritten = namesToAdd.length > 0;
      } catch (error: any) {
        result.errors.push(
          error?.response?.data?.message ||
            error?.message ||
            "Failed to create the lab order."
        );
        return result;
      }
    }

    /* An order reused from earlier in the visit keeps its description; the
       new names are merged in (prefix written once, nothing clobbered). */
    if (labOrderId && namesToAdd.length > 0 && !namesWritten) {
      try {
        const current = (await labOrderApi.getById(labOrderId)).data.data;
        const merged = mergeOtherInvestigations(
          current?.lab_description,
          namesToAdd
        );
        if (merged && merged !== (current?.lab_description ?? "")) {
          await labOrderApi.update(labOrderId, { lab_description: merged });
        }
        namesWritten = true;
      } catch (error: any) {
        result.errors.push(
          error?.response?.data?.message ||
            error?.message ||
            "Failed to save the non-lab investigations on the lab order."
        );
      }
    }

    /* The order's priority is the highest of the tests it carries - a reused
       order is raised when this visit adds a more urgent test. */
    if (labOrderId && labRows.length > 0) {
      const highest = highestLabOrderPriority(
        labRows.map((row) => row.priority)
      );
      const currentOrder = visitOrders.find(
        (visitOrder) => visitOrder.lab_order_id === labOrderId
      );
      if (
        currentOrder &&
        LAB_PRIORITY_RANK[highest] >
          LAB_PRIORITY_RANK[labOrderPriorityOf(currentOrder.priority)]
      ) {
        try {
          await labOrderApi.update(labOrderId, { priority: highest });
        } catch (error: any) {
          console.error(
            "Failed to raise the lab order priority:",
            error?.response?.data?.message ?? error?.message
          );
        }
      }
    }
  }

  const statusUpdates: {
    investigation_id?: string | null;
    item_status: "ORDERED";
    lab_order_id?: string | null;
    lab_order_item_id?: string | null;
  }[] = [];

  for (const row of labRows) {
    const existing = orderedTests.get(row.lab_test_id!);

    if (existing) {
      /* Ordered earlier (e.g. a retry, or Lab Review): never duplicate it,
         just re-link the plan row (self-heals a failed status update). */
      result.skipped += 1;
      if (row.investigation_id) {
        statusUpdates.push({
          investigation_id: row.investigation_id,
          item_status: "ORDERED",
          lab_order_id: existing.labOrderId,
          lab_order_item_id: existing.itemId,
        });
      }
      continue;
    }

    if (!labOrderId) {
      result.errors.push(
        `No lab order is available for ${row.investigation_name}.`
      );
      continue;
    }

    try {
      const targetDate = toIsoDate(row.target_date);
      const method = (row.investigation_type ?? "").trim();
      const item = (
        await labOrderItemApi.create({
          lab_order_id: labOrderId,
          lab_test_id: row.lab_test_id!,
          ...(row.clinical_notes?.trim()
            ? { clinical_notes: row.clinical_notes.trim() }
            : {}),
          priority: labOrderPriorityOf(row.priority),
          ...(targetDate ? { target_date: targetDate } : {}),
          ...(LAB_ORDER_ITEM_METHODS.includes(method) ? { method } : {}),
          ...(visitBranchId ? { branch_id: visitBranchId } : {}),
        })
      ).data.data;

      if (!item?.lab_order_item_id) {
        throw new Error("The lab order item was not created.");
      }

      result.created += 1;
      orderedTests.set(row.lab_test_id!, {
        labOrderId,
        itemId: item.lab_order_item_id,
      });

      if (row.investigation_id) {
        statusUpdates.push({
          investigation_id: row.investigation_id,
          item_status: "ORDERED",
          lab_order_id: labOrderId,
          lab_order_item_id: item.lab_order_item_id,
        });
      }
    } catch (error: any) {
      result.errors.push(
        `${row.investigation_name}: ${
          error?.response?.data?.message ||
          error?.message ||
          "could not be ordered"
        }`
      );
    }
  }

  /* Non-lab / tissue rows have no item - they are ORDERED once recorded on
     the visit's lab order. Names already recorded count as written even when
     this run had nothing new to add (self-heals a failed status update). */
  if (labOrderId && (namesWritten || namesToAdd.length === 0)) {
    const writtenNames = new Set([
      ...recordedNames,
      ...namesToAdd.map((name) => name.toLowerCase()),
    ]);
    openRows
      .filter((row) => row.investigation_category !== "LAB")
      .forEach((row) => {
        const name = row.investigation_name?.trim();
        if (!name || !row.investigation_id) return;
        if (!writtenNames.has(name.toLowerCase())) return;
        statusUpdates.push({
          investigation_id: row.investigation_id,
          item_status: "ORDERED",
          lab_order_id: labOrderId,
        });
      });
  }

  if (statusUpdates.length > 0) {
    try {
      const response = await chemotherapyApi.updatePlanInvestigationStatus(
        planId,
        cycle,
        day,
        statusUpdates
      );
      result.updated = response.data.data?.updated ?? 0;
    } catch (error: any) {
      result.errors.push(
        error?.response?.data?.message ||
          error?.message ||
          "Failed to update the investigations' status."
      );
    }
  }

  return result;
};

/* ---------------- Consultation draft ("Save as Draft") ----------------
   One draft per visit (encounter), else per patient - never one shared
   key, which let one patient's notes show up for another. A draft left in
   the old shared key is taken over only by its own patient. */
const LEGACY_CONSULTATION_DRAFT_KEY = "hms_consultation_draft";

const consultationDraftKey = (encounterNo?: string | null, patientId?: string | null) =>
  encounterNo
    ? `hms_consultation_draft_${encounterNo}`
    : patientId
      ? `hms_consultation_draft_patient_${patientId}`
      : "";

export const readConsultationDraft = (
  encounterNo?: string | null,
  patientId?: string | null
): Record<string, any> => {
  const key = consultationDraftKey(encounterNo, patientId);
  if (!key) return {};
  try {
    const own = localStorage.getItem(key);
    if (own) return JSON.parse(own) ?? {};
    const legacy = localStorage.getItem(LEGACY_CONSULTATION_DRAFT_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) ?? {};
      if (patientId && parsed.patientId === patientId) {
        localStorage.setItem(key, legacy);
        localStorage.removeItem(LEGACY_CONSULTATION_DRAFT_KEY);
        return parsed;
      }
    }
  } catch {
    /* Malformed draft - ignore it. */
  }
  return {};
};

export const writeConsultationDraft = (
  encounterNo: string | null | undefined,
  patientId: string | null | undefined,
  data: Record<string, unknown>
) => {
  const key = consultationDraftKey(encounterNo, patientId);
  if (key) localStorage.setItem(key, JSON.stringify({ ...data, patientId }));
};

/* The visit's consultation was saved: its draft is no longer needed. */
export const clearConsultationDraft = (encounterNo?: string | null, patientId?: string | null) => {
  const key = consultationDraftKey(encounterNo, patientId);
  if (key) localStorage.removeItem(key);
  if (patientId) localStorage.removeItem(consultationDraftKey(null, patientId));
};

/* ============================================================
   ACTIVE ENCOUNTER LOOKUP
   The encounter exists in the DB but scoped queries can still come
   back empty or 403 when the active branch selector points at a
   different branch than the one the encounter was created under,
   or when a multi-branch doctor has no branch selected. Strategy:
     0. By appointment_id (exact key, branch-independent)
     1. Active branch + OPEN        (original behaviour)
     2. Cross-branch + OPEN         (x-branch-id header suppressed)
     3. Cross-branch, any state, OPEN preferred
     4. Self-heal: recreate from the in-progress appointment
   Scope errors (403) are collected so the UI can show the real
   reason instead of a generic "not found".
   ============================================================ */

export const collectScopeError = (error: any, sink: string[]) => {
  if (error?.response?.status === 403) {
    const message = error?.response?.data?.message;
    if (message) sink.push(message);
    return;
  }
  console.error("Failed to load encounter:", error);
};

export const BRANCH_HINT =
  " (or pick your branch from the selector in the header)";

export const findActiveEncounter = async (
  patientId: string,
  appointmentId?: string,
  branchId?: string,
): Promise<{ encounter: EncounterRecord | null; scopeError?: string }> => {
  const scopeErrors: string[] = [];
  /* Real reason encounter creation failed (400-class backend messages).
     Preferred over scopeErrors when present: a failed POST /encounters is
     the actionable root cause, while scoped-list 403s are just fallout. */
  const createErrors: string[] = [];
  const crossBranchConfig = { skipBranchScope: true };

  /* 0. Precise hit - dedicated endpoint resolves by appointment_id with
        mapping-based branch isolation (no active selection required). */
  if (appointmentId) {
    let missing = false;
    try {
      const response = await encounterApi.getByAppointment(appointmentId);
      const exact = response.data.data;
      if (exact && exact.patient_id === patientId) {
        return { encounter: exact };
      }
    } catch (error: any) {
      if (error?.response?.status === 404) {
        // No encounter yet for this appointment.
        missing = true;
      } else {
        collectScopeError(error, scopeErrors);
      }
    }

    /* Encounter not created yet - create it directly from this
       appointment (POST /encounters has no branchScope) and re-read it
       through the mapping-checked endpoint. Deliberately no scoped list
       calls here: they would 403 a multi-branch doctor with no selection. */
    if (missing) {
      try {
        await encounterApi.create({ appointment_id: appointmentId });
      } catch (error: any) {
        // "Encounter already exists" or not creatable - verify decides.
        const message = error?.response?.data?.message;
        if (message && !/already exists/i.test(message)) {
          createErrors.push(message);
        }
      }
      try {
        const response = await encounterApi.getByAppointment(appointmentId);
        const healed = response.data.data;
        if (healed && healed.patient_id === patientId) {
          return { encounter: healed };
        }
      } catch (error: any) {
        collectScopeError(error, scopeErrors);
      }
    }
  }

  /* An ALLOWED branchId query param makes branchScope validate membership
     and pass through instead of demanding an active selection, so the nav
     state's branch (dashboard context) unblocks multi-branch doctors. */
  const activeBranch =
    branchId ?? getActiveBranchId() ?? getUser()?.branch_id ?? undefined;

  // 1. Known/active branch + OPEN (original behaviour)
  try {
    const response = await encounterApi.getAll({
      ...(activeBranch ? { branchId: activeBranch } : {}),
      patientId,
      status: "OPEN",
      page: 1,
      limit: 5,
    });
    const encounters = response.data.data?.encounters ?? [];
    const current =
      encounters.find((item) => item.patient_id === patientId) ??
      encounters[0] ??
      null;
    if (current) return { encounter: current };
  } catch (error: any) {
    collectScopeError(error, scopeErrors);
  }

  // 2. Any allowed branch + OPEN - recovers a branch mismatch.
  try {
    const response = await encounterApi.getAll(
      { patientId, status: "OPEN", page: 1, limit: 10 },
      crossBranchConfig,
    );
    const openEncounters = response.data.data?.encounters ?? [];
    const openMatch = openEncounters.find(
      (item) => item.patient_id === patientId,
    );
    if (openMatch) return { encounter: openMatch };
  } catch (error: any) {
    collectScopeError(error, scopeErrors);
  }

  // 3. Any allowed branch, any state, OPEN preferred.
  try {
    const response = await encounterApi.getAll(
      { patientId, page: 1, limit: 10 },
      crossBranchConfig,
    );
    const encounters = response.data.data?.encounters ?? [];
    const anyOpen = encounters.find(
      (item) => item.patient_id === patientId && item.status === "OPEN",
    );
    if (anyOpen) return { encounter: anyOpen };
  } catch (error: any) {
    collectScopeError(error, scopeErrors);
  }

  /* ============================================================
     SELF-HEAL
     Check-in flips the appointment status before the encounter
     is created; when creation failed (e.g. the linked schedule
     was deactivated) the appointment is stuck with no encounter.
     Recreate it here from the patient's most recent in-progress
     appointment so clinical details load instead of erroring.
     Verification uses the mapping-checked by-appointment endpoint,
     never a scoped list query.
     ============================================================ */

  const inProgressStatuses = ["IN_CONSULTATION", "CHECKED_IN"];
  for (const status of inProgressStatuses) {
    let candidates: { appointment_id: string }[] = [];
    try {
      const apptResponse = await appointmentApi.getAll(
        {
          ...(activeBranch ? { branchId: activeBranch } : {}),
          patientId,
          status,
          sortBy: "created_at",
          sortOrder: "desc",
          page: 1,
          limit: 5,
        },
        crossBranchConfig,
      );
      candidates = apptResponse.data.data?.appointments ?? [];
    } catch {
      continue;
    }
    for (const appt of candidates) {
      try {
        await encounterApi.create({ appointment_id: appt.appointment_id });
      } catch (error: any) {
        // "Encounter already exists" or not creatable - verify decides.
        const message = error?.response?.data?.message;
        if (message && !/already exists/i.test(message)) {
          createErrors.push(message);
        }
      }
      try {
        const response = await encounterApi.getByAppointment(
          appt.appointment_id,
        );
        const healed = response.data.data;
        if (healed && healed.patient_id === patientId) {
          return { encounter: healed };
        }
      } catch (error: any) {
        collectScopeError(error, scopeErrors);
      }
    }
  }

  /* Prefer the real creation-failure reason over scope fallout: if POST
     /encounters told us why it refused, that beats "Please select a branch
     first." produced by the fallback list queries. */
  const primaryMessage = createErrors[0] ?? scopeErrors[0];

  return {
    encounter: null,
    scopeError: primaryMessage
      ? `${primaryMessage}${
          /select a branch/i.test(primaryMessage) ? BRANCH_HINT : ""
        }`
      : undefined,
  };
};

/*
 * Does this patient currently have an active (ADMITTED) inpatient stay?
 * Shared by the Discharge Medication step (which renders the Inpatient
 * Discharge section only when one exists) and the Follow Up step (which
 * routes the review/follow-up date to admission.review_date instead of
 * encounter.follow_up_date when one exists) -- one lookup, one source of
 * truth, so the two steps never disagree about whether this is an inpatient.
 */
export const findActiveAdmission = async (
  patientId: string
): Promise<AdmissionRecord | null> => {
  if (!patientId) return null;
  try {
    const response = await ipdApi.getAll({ patientId, status: "ADMITTED", limit: 1 });
    const admissions = response.data?.data?.admissions || [];
    return admissions[0] || null;
  } catch (error) {
    console.error("findActiveAdmission failed:", error);
    return null;
  }
};

/* ============================================================
   ONCOLOGY DIAGNOSIS + CHEMOTHERAPY PLAN HELPERS
   Shared by the Diagnosis (staging-detail persist) and
   ChemotherapyOrder (plan persist) steps. These resolve foreign
   keys the backend requires that the UI form fields alone don't
   capture: the diagnosis_id comes from the ICD catalog (with a
   malignancy fallback), the staging_detail_id comes from the
   [diagnosis|staging] steps, and employee/department/branch come
   from the active encounter + the logged-in session.
   ============================================================ */

export const toIsoDate = (value?: string | null): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10);
};

/* Load every diagnosis (ICD catalog) the backend exposes so a
   diagnosis_id can be matched from an ICD code. The DB has few
   oncology-friendly codes, so a malignancy regex fallback targets
   DIS000130 (Z85.9 "Personal History of Malignant Neoplasm"). */
export const loadAllIcdDiagnoses = async (): Promise<
  { diagnosis_id: string; icd_code: string | null }[]
> => {
  const categoriesResponse = await API.get<{
    success: boolean;
    data: { categories: { diagnosis_catogory_id: string }[] };
  }>("/diagnosis/categories");
  const categories = (
    categoriesResponse.data.data?.categories ?? []
  ).filter((category) => Boolean(category.diagnosis_catogory_id));
  const responses = await Promise.all(
    categories.map((category) =>
      API.get<{
        success: boolean;
        data: {
          diagnoses: { diagnosis_id: string; icd_code: string | null }[];
        };
      }>(`/diagnosis/categories/${category.diagnosis_catogory_id}/diagnoses`)
    )
  );
  return responses.flatMap((response) => response.data.data?.diagnoses ?? []);
};

/* Resolve the patient's diagnosis_id from the ICD catalog. Priority:
   1. The active encounter's diagnosis_id when already recorded.
   2. Exact ICD code match (from the Diagnosis form's icdCode).
   3. Malignancy fallback (regex / ICD [CZ]\d prefix). */
export const resolveDiagnosisId = async (
  patientId: string,
  icdCodeOverride?: string
): Promise<string> => {
  let icdCode = icdCodeOverride?.trim() ?? "";
  if (!icdCode) {
    try {
      const draft = JSON.parse(
        localStorage.getItem(`hms_diagnosis_form_${patientId}`) ?? ""
      ) as Partial<FormData> | null;
      icdCode = draft?.icdCode?.trim() ?? "";
    } catch {
      icdCode = "";
    }
  }
  /* The field lists one code per selected cancer type ("C50.9, C34.9");
     the diagnosis is the primary (first) type's. */
  icdCode = icdCode.split(",")[0]?.trim() ?? "";

  try {
    const diagnoses = await loadAllIcdDiagnoses();
    if (icdCode) {
      const exact = diagnoses.find(
        (d) =>
          d.icd_code?.trim().toUpperCase() === icdCode.toUpperCase()
      );
      if (exact?.diagnosis_id) return exact.diagnosis_id;
    }
    const fallback = diagnoses.find(
      (d) =>
        /malign|neoplasm|carcinom|tumou?r|leuk|lymphoma|oncol/i.test(
          d.icd_code ?? ""
        ) || /^[CZ]\d/i.test(d.icd_code ?? "")
    );
    if (fallback?.diagnosis_id) return fallback.diagnosis_id;
  } catch (error) {
    console.error("Failed to resolve diagnosis_id from ICD catalog:", error);
  }
  return "";
};

/* The staging detail recorded in this visit (one per encounter), or "". */
export const findStagingDetailForEncounter = async (
  patientId: string,
  encounterNo: string
): Promise<string> => {
  if (!patientId || !encounterNo) return "";
  const response = await API.get<{
    success: boolean;
    data: { staging_detail_id: string }[];
  }>("/oncology/staging-details", {
    /* view=ids: just the row id, not the whole diagnosis. */
    params: { patient_id: patientId, encounter_no: encounterNo, page: 1, limit: 1, view: "ids" },
  });
  return response.data.data?.[0]?.staging_detail_id ?? "";
};

/* The patient's latest staging detail on record (newest visit first), or
   "". Asks the server - unlike resolveStagingDetailId, which prefers the
   id this browser saved last. */
export const findLatestStagingDetailId = async (
  patientId: string
): Promise<string> => {
  if (!patientId) return "";
  const response = await API.get<{
    success: boolean;
    data: { staging_detail_id: string }[];
  }>("/oncology/staging-details", {
    params: { patient_id: patientId, page: 1, limit: 1, view: "ids" },
  });
  return response.data.data?.[0]?.staging_detail_id ?? "";
};

/* The Consultation Notes part of an encounter's clinical_notes (the Past
   History section after PAST_HISTORY_MARKER is left out). */
export const consultationNotesOf = (clinicalNotes?: string | null) => {
  const raw = clinicalNotes ?? "";
  const markerIndex = raw.indexOf(PAST_HISTORY_MARKER);
  return (markerIndex === -1 ? raw : raw.slice(0, markerIndex)).trim();
};

/* Resolve the patient's most recent staging_detail_id (persisted by
   the Diagnosis step, else the latest on record). */
export const resolveStagingDetailId = async (patientId: string): Promise<string> => {
  try {
    const stored = JSON.parse(
      localStorage.getItem(`hms_staging_detail_id_${patientId}`) ?? ""
    ) as { staging_detail_id?: string } | null;
    if (stored?.staging_detail_id) return stored.staging_detail_id;
  } catch {
    // Malformed draft - fall through to the server lookup.
  }
  try {
    const response = await API.get<{
      success: boolean;
      data: { staging_detail_id: string }[];
    }>("/oncology/staging-details", {
      params: { patient_id: patientId, page: 1, limit: 1, view: "ids" },
    });
    const found = response.data.data?.[0]?.staging_detail_id ?? "";
    if (found) {
      localStorage.setItem(
        `hms_staging_detail_id_${patientId}`,
        JSON.stringify({ staging_detail_id: found })
      );
    }
    return found;
  } catch (error) {
    console.error("Failed to resolve staging_detail_id:", error);
    return "";
  }
};

/* The dosing inputs a cycle day order's patient doses came from. */
export const orderDosingFromSnapshot = (
  dosing?: DosingSnapshot
): ChemoPlanOrderPayload["dosing"] =>
  dosing
    ? {
        height_cm: dosing.dosing_height_cm ?? null,
        weight_kg: dosing.dosing_weight_kg ?? null,
        bsa: dosing.dosing_bsa ?? null,
        serum_creatinine: dosing.dosing_serum_creatinine ?? null,
        crcl: dosing.dosing_crcl ?? null,
      }
    : undefined;

/* The cycle day whose order `planItems` are, and (optionally) its
   Hydration rows - left out, that day's saved hydration is kept. With
   planId, the order is only saved onto that plan (a draft of an earlier
   course is never saved onto the next one). */
export type PlanOrderTarget = {
  planId?: string | null;
  cycle: number;
  day: number;
  hydration?: ChemoPlanOrderPayload["hydration"];
  investigations?: ChemoPlanOrderPayload["investigations"];
  /* The order's Post Chemo Instructions / Additional Notes; left out keeps
     what the day's order already has. */
  chemoInstructions?: string;
  additionalNotes?: string;
  /* The day's planned date (YYYY-MM-DD) from the Start Date; moves only
     this cycle day. */
  plannedDate?: string;
};

/* The visit's encounter by its number (it must be this patient's), else
   the patient's open encounter. */
const resolveVisitEncounter = async (
  patientId: string,
  encounterNo?: string | null
): Promise<{ encounter: EncounterRecord | null; scopeError?: string }> => {
  if (encounterNo) {
    try {
      const found = (await encounterApi.getByNumber(encounterNo)).data?.data ?? null;
      if (found && found.patient_id === patientId) return { encounter: found };
    } catch (error) {
      console.error("Failed to load the visit's encounter:", error);
    }
  }
  return findActiveEncounter(patientId);
};

export const COURSE_CLOSED_MESSAGE =
  "This chemotherapy course is completed. Start a new plan from the Treatment Plan step.";

/* Which cycle day of the plan the current visit's order is on: the saved
   draft's values win, else the day whose order was saved in this encounter,
   else the latest cycle day, else Cycle 1 / Day 1. Used before saving the
   discharge medications and before ordering the plan's investigations so
   both target the day the doctor actually worked on. */
export const resolvePlanCycleDay = async (
  planId?: string | null,
  encounterNo?: string | null
): Promise<{ cycle: number; day: number }> => {
  if (!planId) return { cycle: 1, day: 1 };
  try {
    const orders =
      (await chemotherapyApi.listPlanOrders(planId)).data.data ?? [];
    const inEncounter = encounterNo
      ? orders.filter((order) => order.encounter_no === encounterNo)
      : [];
    const order = inEncounter[inEncounter.length - 1] ?? orders[orders.length - 1];
    if (order?.cycle_number && order?.cycle_day) {
      return { cycle: order.cycle_number, day: order.cycle_day };
    }
  } catch (error: any) {
    console.error(
      "Failed to resolve the plan's cycle day:",
      error?.response?.data?.message ?? error?.message
    );
  }
  return { cycle: 1, day: 1 };
};

/* Ensure a chemotherapy plan exists for the patient, returning its id.
   Used by the ChemotherapyOrder Save button and as a safety net before
   the Summary step creates a prescription. Re-uses the patient's open
   plan; otherwise POSTs a new one. `dosing` is the snapshot of the inputs
   the plan items' calculated_dose came from.
   A plan is one course: once it is completed (or discontinued /
   cancelled) a new one is only started from the Treatment Plan step
   (`allowNewCourse`); elsewhere the closed plan is returned untouched
   with `courseClosed`. `planItems` are saved as the order of
   `order.cycle` / `order.day`, unless that day is already completed. */
export const createChemotherapyPlanForPatient = async (
  patientId: string,
  startDateValue?: string | null,
  planItems?: OrderPlanItem[],
  plannedCycles?: number,
  discussion?: string | null,
  dosing?: DosingSnapshot,
  options?: {
    order?: PlanOrderTarget;
    allowNewCourse?: boolean;
    /* The consultation's own encounter: the order is saved in it, so the
       Summary's Submit (same encounter) sends it for administration. Without
       it, the patient's open encounter is looked up. */
    encounterNo?: string | null;
  }
): Promise<{ planId: string | null; error?: string; courseClosed?: boolean }> => {
  const { encounter, scopeError } = await resolveVisitEncounter(patientId, options?.encounterNo);
  if (!encounter) {
    return {
      planId: null,
      error:
        scopeError ||
        "No active encounter found. Open this page from a patient consultation to continue.",
    };
  }

  const employeeId =
    getUser()?.employee_id ?? encounter.employee_id ?? "";
  const departmentId = encounter.department_id ?? "";
  const branchId =
    getActiveBranchId() ??
    getUser()?.branch_id ??
    encounter.branch_id ??
    "";
  const protocolId =
    localStorage.getItem(`hms_selected_protocol_id_${patientId}`) ?? "";

  const diagnosisId = await resolveDiagnosisId(patientId);
  const stagingDetailId = await resolveStagingDetailId(patientId);
  const treatmentStartDate = toIsoDate(
    startDateValue ??
      localStorage.getItem(`hms_planned_start_date_${patientId}`)
  );

  /* Saves planItems as the target cycle day's order - skipped once that
     day's consultation was submitted (sent for administration, or
     completed): its order is read-only from then on. */
  const saveOrder = async (
    planId: string,
    orders: ChemoPlanOrderHeader[] | null | undefined
  ): Promise<string | undefined> => {
    const target = options?.order;
    const hasItems = Boolean(planItems && planItems.length > 0);
    const hasInvestigations = target?.investigations !== undefined;
    if (!target || (!hasItems && !hasInvestigations)) return undefined;
    if (target.planId && target.planId !== planId) return undefined;
    const saved = (orders ?? []).find(
      (order) =>
        order.cycle_number === target.cycle && order.cycle_day === target.day
    );
    if (saved?.order_status === "COMPLETED" || saved?.order_status === "IN_ADMINISTRATION") {
      return undefined;
    }
    try {
      await chemotherapyApi.savePlanOrder(planId, target.cycle, target.day, {
        items: planItems ?? [],
        ...(target.hydration ? { hydration: target.hydration } : {}),
        ...(target.investigations !== undefined ? { investigations: target.investigations } : {}),
        dosing: orderDosingFromSnapshot(dosing),
        encounter_no: encounter.encounter_no ?? null,
        ...(target.chemoInstructions !== undefined
          ? { chemo_instructions: target.chemoInstructions }
          : {}),
        ...(target.additionalNotes !== undefined
          ? { additional_notes: target.additionalNotes }
          : {}),
        ...(target.plannedDate ? { planned_date: target.plannedDate } : {}),
      });
      return undefined;
    } catch (orderError: any) {
      console.error(
        "Failed to save the cycle day order:",
        orderError?.response?.data?.message ?? orderError?.message
      );
      return (
        orderError?.response?.data?.message ||
        "Failed to save the chemotherapy order."
      );
    }
  };

  /* Prefer the patient's open plan; creation only happens once per
     course so repeated Saves don't stack duplicates.
     When an open plan is found, the latest oncology selections are
     pushed onto it: the protocol (name + cadence -> planned_cycles and
     cycle_interval_days) and the cancer context from the latest staging
     detail, so downstream viewers (patient-details) show the new days
     and cycles immediately. When planItems are provided, they are saved
     as the target cycle day's order. */
  try {
    /* Look the plan up via the mapping-scoped /plans/latest-for-patient
       endpoint (same one patient-details reads) so the existing plan we
       sync is the plan being displayed and branch-scoped list 403s don't
       silently skip the update. */
    const existing = await chemotherapyApi.getLatestPlanForPatient(patientId);
    const existingPlan = existing.data.data;
    const existingPlanId = existingPlan?.chemotherapy_plan_id;
    const courseClosed = isChemoPlanClosed(existingPlan);
    /* The course is over: nothing more is saved onto it, and only the
       Treatment Plan step starts the next one (created below). */
    if (existingPlanId && courseClosed && !options?.allowNewCourse) {
      return { planId: existingPlanId, courseClosed: true };
    }
    if (existingPlanId && !courseClosed) {
      /* Re-link the existing plan to the current protocol + diagnosis.
         The server copies the protocol's regimen name / code / cycles and
         the staging detail's cancer context, so only the ids are sent. A
         failed re-link (e.g. protocol doesn't match the diagnosis) stops
         here, before the plan items are replaced with that protocol's
         drugs. */
      const planChanges: Record<string, unknown> = {
        ...(protocolId ? { source_protocol_id: protocolId } : {}),
        ...(stagingDetailId ? { staging_detail_id: stagingDetailId } : {}),
        ...(dosing ?? {}),
      };

      if (Object.keys(planChanges).length > 0) {
        try {
          await API.put(
            `/chemotherapy/plans/${existingPlanId}`,
            planChanges
          );
        } catch (syncErr: any) {
          const message =
            syncErr?.response?.data?.message ?? syncErr?.message;
          console.error(
            "Failed to sync protocol/cancer context onto existing plan:",
            message
          );
          return {
            planId: existingPlanId,
            error: message || "Failed to update the chemotherapy plan.",
          };
        }
      }

      const orderError = await saveOrder(existingPlanId, existingPlan?.plan_orders);
      if (orderError) {
        return { planId: existingPlanId, error: orderError };
      }
      if (discussion !== undefined) {
        try {
          await API.put(`/chemotherapy/plans/${existingPlanId}`, {
            discussion: discussion || null,
          });
        } catch (discussionError: any) {
          console.error(
            "Failed to save plan discussion:",
            discussionError?.response?.data?.message ?? discussionError?.message
          );
        }
      }
      return { planId: existingPlanId };
    }
  } catch (error) {
    // Missing/incapable plan lookups fall through to creation.
    console.error("Existing plan lookup failed:", error);
  }

  if (!stagingDetailId) {
    return {
      planId: null,
      error:
        "No oncology staging detail found for this patient. Complete the Diagnosis step first.",
    };
  }
  if (!employeeId) {
    return { planId: null, error: "Consulting doctor could not be identified." };
  }
  if (!departmentId) {
    return {
      planId: null,
      error: "The patient's encounter has no department assigned.",
    };
  }
  if (!branchId) {
    return {
      planId: null,
      error: "Please select a branch from the selector in the header.",
    };
  }

  try {
    const response = await API.post<{
      success: boolean;
      data: { chemotherapy_plan_id: string };
    }>("/chemotherapy/plans", {
      patient_id: patientId,
      staging_detail_id: stagingDetailId,
      ...(diagnosisId ? { diagnosis_id: diagnosisId } : {}),
      employee_id: employeeId,
      department_id: departmentId,
      branch_id: branchId,
      appointment_id: encounter.appointment_id ?? undefined,
      encounter_no: encounter.encounter_no ?? undefined,
      ...(protocolId ? { protocol_id: protocolId } : {}),
      ...(treatmentStartDate
        ? { treatment_start_date: treatmentStartDate }
        : {}),
      confirm_suggested_therapy: true,
      ...(plannedCycles ? { planned_cycles: plannedCycles } : {}),
      /* The plan's baseline is the protocol's copy; only without a
         protocol do the order's rows seed it. */
      ...(!protocolId && planItems && planItems.length > 0
        ? { plan_items: planItems }
        : {}),
      ...(discussion !== undefined ? { discussion: discussion || null } : {}),
      ...(dosing ?? {}),
    });
    const planId = response.data.data?.chemotherapy_plan_id ?? null;
    const orderError = planId ? await saveOrder(planId, []) : undefined;
    return orderError ? { planId, error: orderError } : { planId };
  } catch (error: any) {
    console.error("Failed to create chemotherapy plan:", error);
    return {
      planId: null,
      error:
        error?.response?.data?.message ||
        "Failed to create the chemotherapy plan.",
    };
  }
};

export const formatDateDMY = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}-${month}-${date.getFullYear()}`;
};

export const formatTimeAMPM = (value?: string | null) => {
  if (!value) return "";
  const timeMatch = value.match(
    /(?:T|\s)?(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?/
  );
  if (timeMatch) {
    let hour = Number(timeMatch[1]);
    const minute = timeMatch[2];
    const suffix = hour >= 12 ? "PM" : "AM";
    hour = hour % 12 || 12;
    return `${String(hour).padStart(2, "0")}:${minute} ${suffix}`;
  }
  return value;
};
