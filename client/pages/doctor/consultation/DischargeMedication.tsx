import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import API, { getActiveBranchId } from "../../../api/axios";
import { getUser } from "../../../utils/token";
import { encounterApi } from "../../../api/encounter.api";
import {
  chemoPlanItemName,
  chemotherapyApi,
  type ChemoPlanItem,
} from "../../../api/chemotherapy.api";
import { SingleSelectDropdown } from "../../../components/ui/single-select-dropdown";
import type { MultiSelectOption } from "../../../components/ui/multi-select-dropdown";
import { UserProfileDropdown } from "../../../components/ui/User_profile_dropdown";
import type { DischargeMedicineRecord, Drug, MeasurementValues } from "./types";
import {
  buildDosingSnapshot,
  buildPlanItemsFromOrder,
  normalizeLegacyDraftDrug,
  type DosingInputs,
} from "./doseCalculation";
import {
  createChemotherapyPlanForPatient,
  findActiveEncounter,
  toIsoDate,
} from "./helpers";
import { ArrowLeftIcon, BellIcon, DoubleArrowIcon, PhoneIcon } from "./icons";

/* ============================================================
   DISCHARGE MEDICATION COMPONENT
   (combined from client/pages/doctor/discharge.tsx 
    renamed PatientDischargeMedication  DischargeMedication,
    Medication type renamed to DischargeMedicationItem to avoid
    clashing with the Medication interface above, duplicate
    React import and icon definitions removed,
    CheckIcon / DoubleArrowIcon reused from above,
    embedded prop added so it can live in this file)
============================================================ */

/* A row of the discharge table. Rows from the regimen protocol are the
   protocol's defaults (planItemId stays empty and they are never written
   back); rows the doctor adds or edits are saved on this patient's chemo
   plan as plan items with drug_role DISCHARGE. */
type DischargeMedicationItem = {
  id: number;
  /* Medicine from medicine_master, empty when the doctor typed a name. */
  medicineId: string;
  /* The patient's plan item id, once the row has been saved. */
  planItemId: string;
  /* The row's order on the plan. Kept across an edit so a changed row
     stays where it is instead of moving to the end of the table. */
  drugSequence: number;
  drugName: string;
  dosage: string;
  dosageUnit: string;
  frequency: string;
  instruction: string;
  duration: string;
};

/* The edit draft for one row; `medicineId` empty means a typed drug name. */
type DischargeMedicationDraft = {
  medicineId: string;
  drugName: string;
  dosage: string;
  dosageUnit: string;
  frequency: string;
  instruction: string;
  duration: string;
};

/* Sentinel for "the doctor typed a drug name that isn't in the list", the
   same marker Chemotherapy Order uses so a custom name is never written to
   medicine_master. */
const CUSTOM_DRUG_VALUE = "__custom_drug__";

const DISCHARGE_EDIT_INPUT_CLASS =
  "w-full min-w-[100px] rounded-md border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

/* "1 tab 500 mg" -> number 500, unit "mg". A free-text dose with no leading
   number is kept whole in dosage and leaves the unit empty. */
const splitDosage = (value: string): { dose: string; unit: string } => {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  return match
    ? { dose: match[1], unit: match[2].trim() }
    : { dose: value.trim(), unit: "" };
};

const joinDosage = (dose?: string | number | null, unit?: string | null) =>
  [dose ?? "", unit ?? ""].filter(Boolean).join(" ").trim();

/* One place that turns a saved plan row into a table row, so the load, the
   save and the edit agree on every field (duration included). */
const toTableRow = (
  item: ChemoPlanItem,
  id: number
): DischargeMedicationItem => ({
  id,
  medicineId: item.medicine_id ?? "",
  planItemId: item.chemotherapy_plan_item_id,
  drugSequence: item.drug_sequence ?? 0,
  drugName: chemoPlanItemName(item),
  dosage: joinDosage(item.protocol_dose, item.protocol_dose_unit),
  dosageUnit: item.protocol_dose_unit ?? "",
  frequency: item.frequency || "",
  instruction: item.administration_detail || "",
  duration: item.duration || "",
});

/* Ids for the patient's own rows, kept clear of the protocol rows' indexes
   so a row can always be told apart by id. */
const patientRowId = (index: number) => 10000 + index;

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

const MailIcon = () => (
  <svg
    className="h-5 w-5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
  >
    <rect
      x="3"
      y="5"
      width="18"
      height="14"
      rx="2"
    />
    <path
      d="M3 7l9 6 9-6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const DischargeMedication: React.FC<{
  embedded?: boolean;
  patientId?: string;
  appointmentId?: string;
  branchId?: string;
  encounterNo?: string;
  measurements?: MeasurementValues;
  onNext?: () => void;
}> = ({
  embedded = false,
  patientId,
  appointmentId,
  branchId,
  encounterNo,
  measurements,
  onNext,
}) => {
  const resolvedPatientId = patientId || "";
  const navigate = useNavigate();

  const [userAvatarUrl, setUserAvatarUrl] = useState<string>(() => localStorage.getItem("user_photo") || "");
  const [avatarLoading, setAvatarLoading] = useState<boolean>(() => !localStorage.getItem("user_photo"));

  const [medications, setMedications] = useState<DischargeMedicationItem[]>(
    []
  );

  const [activeStep, setActiveStep] = useState(1);
  const [savingMeds, setSavingMeds] = useState(false);
  const [medsError, setMedsError] = useState("");
  const [medsLoading, setMedsLoading] = useState(false);
  const [medsProtocolId, setMedsProtocolId] = useState("");
  /* The patient's chemo plan, where added discharge rows are saved. */
  const [medsPlanId, setMedsPlanId] = useState("");
  /* Rows added on this plan (protocol defaults excluded). */
  const [patientMeds, setPatientMeds] = useState<DischargeMedicationItem[]>([]);

  /* Inline "Add Medicine" editing, same pattern as Chemotherapy Order. */
  const [medicineOptions, setMedicineOptions] = useState<MultiSelectOption[]>([]);
  const medicinesRequestedRef = useRef(false);
  const [editingRowId, setEditingRowId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<DischargeMedicationDraft | null>(null);
  const [newRowIdRef, setNewRowIdRef] = useState<number | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");

  const ensureMedicineOptions = () => {
    if (medicinesRequestedRef.current) return;
    medicinesRequestedRef.current = true;
    API.get<{
      success: boolean;
      data: {
        medicine_id: string;
        medicine_name: string;
        dosage_form: string | null;
      }[];
    }>("/chemotherapy/medicines")
      .then((response) => {
        setMedicineOptions(
          (response.data.data ?? []).map((medicine) => ({
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

  /* ============================================================
     LOAD DISCHARGE MEDICINES
     Real take-home rows from
     GET /chemotherapy/regimen-protocols/:protocolId/discharge-medicines.
     The protocol is the one selected in the Treatment Plan step
     (localStorage), falling back to the patient's chemotherapy plan.
     ============================================================ */

  useEffect(() => {
    if (!resolvedPatientId) return;

    let cancelled = false;
    setMedsProtocolId("");
    setMedsPlanId("");
    setPatientMeds([]);

    const mapRecord = (
      item: DischargeMedicineRecord,
      index: number,
    ): DischargeMedicationItem => ({
      id: index,
      medicineId: item.medicine_id ?? "",
      planItemId: "",
      drugSequence: item.drug_sequence ?? 0,
      drugName:
        item.medicine_master?.medicine_name ||
        item.medicine_master?.generic_name ||
        item.drug_name ||
        "",
      dosage:
        item.patient_dose != null && item.patient_dose !== ""
          ? `${item.patient_dose} ${
              item.patient_dose_unit ?? item.medicine_master?.unit ?? ""
            }`.trim()
          : "",
      dosageUnit: item.patient_dose_unit ?? item.medicine_master?.unit ?? "",
      frequency: item.frequency || "",
      instruction:
        item.administration_detail || item.comment || item.composition || "",
      duration: item.duration || "",
    });

    /* This patient's own discharge rows (saved on their chemo plan). */
    const mapPlanItem = (
      item: ChemoPlanItem,
      index: number,
    ): DischargeMedicationItem => toTableRow(item, patientRowId(index));

    setMedsLoading(true);
    setMedsError("");

    /* The patient's plan, which holds any discharge rows they add here. */
    const resolvePlanId = async (): Promise<string> => {
      const fromDraft = (() => {
        try {
          const raw = localStorage.getItem(
            `hms_chemo_order_${resolvedPatientId}`
          );
          const parsed = raw
            ? (JSON.parse(raw) as { planId?: string | null } | null)
            : null;
          return parsed?.planId ?? "";
        } catch {
          return "";
        }
      })();
      if (fromDraft) return fromDraft;

      // Branch-independent latest-plan lookup (returns data:null cleanly
      // instead of a branch-scope 403), then the scoped /plans listing.
      try {
        const latest = await API.get<{
          success: boolean;
          data: { chemotherapy_plan_id?: string } | null;
        }>("/chemotherapy/plans/latest-for-patient", {
          params: { patient_id: resolvedPatientId },
        });
        const planId = latest.data.data?.chemotherapy_plan_id;
        if (planId) return planId;
      } catch (error: any) {
        console.warn(
          "Latest plan fallback failed:",
          error?.response?.data?.message ?? error?.message
        );
      }

      try {
        const response = await API.get<{
          success: boolean;
          data: { chemotherapy_plan_id?: string }[];
        }>("/chemotherapy/plans", {
          params: {
            patient_id: resolvedPatientId,
            branchId:
              getActiveBranchId() ?? getUser()?.branch_id ?? undefined,
          },
        });
        return response.data.data?.[0]?.chemotherapy_plan_id ?? "";
      } catch (error: any) {
        console.warn(
          "Scoped plan fallback failed:",
          error?.response?.data?.message ?? error?.message
        );
        return "";
      }
    };

    const resolveProtocolId = async (): Promise<string> => {
      const savedProtocolId = localStorage.getItem(
        `hms_selected_protocol_id_${resolvedPatientId}`
      );
      if (savedProtocolId) return savedProtocolId;

      try {
        const draft = JSON.parse(
          localStorage.getItem(`hms_treatment_plan_${resolvedPatientId}`) ??
            ""
        ) as { protocol?: string } | null;
        if (draft?.protocol) return draft.protocol;
      } catch {
        // Malformed draft - continue with the plan lookup.
      }

      try {
        const latest = await API.get<{
          success: boolean;
          data: {
            chemotherapy_regimen_protocol?: { protocol_id?: string } | null;
          } | null;
        }>("/chemotherapy/plans/latest-for-patient", {
          params: { patient_id: resolvedPatientId },
        });
        const plan = latest.data.data;
        if (plan?.chemotherapy_regimen_protocol?.protocol_id) {
          return plan.chemotherapy_regimen_protocol.protocol_id;
        }
      } catch (error: any) {
        console.warn(
          "Latest plan fallback failed:",
          error?.response?.data?.message ?? error?.message
        );
      }

      const response = await API.get<{
        success: boolean;
        data: {
          chemotherapy_regimen_protocol?: {
            protocol_id?: string;
          } | null;
        }[];
      }>("/chemotherapy/plans", {
        params: {
          patient_id: resolvedPatientId,
          branchId:
            getActiveBranchId() ?? getUser()?.branch_id ?? undefined,
        },
      });
      const plan = response.data.data?.[0];
      return plan?.chemotherapy_regimen_protocol?.protocol_id ?? "";
    };

    const loadProtocolRows = async (protocolId: string) => {
      if (!protocolId) return [];

      const response = await API.get<{
        success: boolean;
        data: DischargeMedicineRecord[];
      }>(
        `/chemotherapy/regimen-protocols/${encodeURIComponent(
          protocolId
        )}/discharge-medicines`
      );

      return [...(response.data.data ?? [])].sort(
        (a, b) => (a.drug_sequence ?? 0) - (b.drug_sequence ?? 0)
      );
    };

    /* The protocol's default rows first, then this patient's own rows on
       top - an added row for a drug the protocol already lists is kept as
       its own row, so nothing the doctor typed is overwritten. */
    const loadPatientRows = async (planId: string) => {
      if (!planId) return [];

      const response = await chemotherapyApi.listPlanDischargeMedicines(planId);
      return response.data.data ?? [];
    };

    Promise.all([resolveProtocolId(), resolvePlanId()])
      .then(async ([protocolId, planId]) => {
        if (cancelled) return;
        setMedsProtocolId(protocolId);
        setMedsPlanId(planId);

        const [protocolRecords, planItems] = await Promise.all([
          loadProtocolRows(protocolId),
          loadPatientRows(planId),
        ]);

        const protocolRows = protocolRecords.map(mapRecord);
        const patientRows = planItems.map(mapPlanItem);

        if (cancelled) return;
        setPatientMeds(patientRows);
        setMedications([...protocolRows, ...patientRows]);
      })
      .catch((error: any) => {
        console.error("Failed to load discharge medicines:", error);
        if (cancelled) return;
        setMedications([]);
        setMedsError(
          error?.response?.data?.message ||
            error?.message ||
            "Failed to load discharge medicines."
        );
      })
      .finally(() => {
        if (!cancelled) setMedsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [resolvedPatientId]);

  const resolveEncounterNo = async () => {
    if (encounterNo) return encounterNo;
    if (!patientId) return "";
    const { encounter: found } = await findActiveEncounter(
      patientId,
      appointmentId,
      branchId,
    );
    return found?.encounter_no ?? "";
  };

  /* ============================================================
     ADD / EDIT / REMOVE A DISCHARGE MEDICINE
     Rows added here are saved on THIS patient's chemotherapy plan
     (plan items with drug_role DISCHARGE): a drug picked from the list is
     stored by medicine_id, a name the doctor types is stored as drug_name on
     the plan and is never written to medicine_master. The regimen protocol's
     own discharge instructions are read-only here and never modified.
     ============================================================ */

  const planIdForEdits = async (): Promise<string> => {
    if (medsPlanId) return medsPlanId;

    const response = await API.get<{
      success: boolean;
      data: { chemotherapy_plan_id?: string } | null;
    }>("/chemotherapy/plans/latest-for-patient", {
      params: { patient_id: resolvedPatientId },
    });
    const planId = response.data.data?.chemotherapy_plan_id ?? "";
    if (planId) setMedsPlanId(planId);
    return planId;
  };

  /* The server's discharge rows replace this patient's rows in the table;
     the protocol's own rows (no planItemId) stay as they are. */
  const applyPatientRows = (rows: ChemoPlanItem[]) => {
    const next = rows.map((item, index) =>
      toTableRow(item, patientRowId(index))
    );
    setPatientMeds(next);
    setMedications((current) => [
      ...current.filter((item) => !item.planItemId),
      ...next,
    ]);
  };

  /* The row a save returned, so an edit lands back on the row the doctor
     was editing instead of being appended as a new line.
     `knownPlanItemIds` is the plan item ids already in the table before the
     request, which is how the just-created row is picked out of the
     server's list. */
  const replaceRowFromServer = (
    rows: ChemoPlanItem[],
    row: DischargeMedicationItem,
    editedIndex: number,
    knownPlanItemIds: Set<string>
  ) => {
    const saved = row.planItemId
      ? rows.find(
          (item) =>
            item.chemotherapy_plan_item_id === row.planItemId
        )
      : rows.find(
          (item) => !knownPlanItemIds.has(item.chemotherapy_plan_item_id)
        );

    if (!saved) return;

    /* The row keeps its own id so React updates it in place rather than
       remounting it. */
    const updated = toTableRow(saved, row.id);

    /* Every row the server returned is this patient's now; the table itself
       is patched rather than rebuilt so the edited row keeps its slot. */
    setPatientMeds(
      rows.map((item, index) => toTableRow(item, patientRowId(index)))
    );
    setMedications((current) => {
      const target = current.findIndex(
        (item) => item.id === row.id
      );

      /* The protocol rows above the edited row stay put, so the index the
         doctor saw still points at their own row. */
      const at = target === -1 ? editedIndex : target;

      if (at >= 0 && at <= current.length) {
        const next = [...current];
        next.splice(at, 1, updated);
        return next;
      }

      return [...current, updated];
    });
  };

  const toPayload = (draft: DischargeMedicationDraft, sequence: number) => {
    const { dose, unit } = splitDosage(draft.dosage);
    const numericDose = Number(dose);

    return {
      /* A typed name keeps medicine_id null so nothing is added to
         medicine_master. */
      medicine_id: draft.medicineId || null,
      drug_name: draft.medicineId ? null : draft.drugName.trim(),
      drug_sequence: sequence,
      dosage: dose && !Number.isNaN(numericDose) ? numericDose : null,
      dosage_unit: draft.medicineId
        ? (draft.dosageUnit || unit || undefined)
        : undefined,
      frequency: draft.frequency.trim() || null,
      administration_detail: draft.instruction.trim() || null,
      duration: draft.duration.trim() || null,
    };
  };

  const startEdit = (row: DischargeMedicationItem) => {
    if (editingRowId !== null || savingEdit) return;
    ensureMedicineOptions();
    setEditError("");
    setEditingRowId(row.id);
    setEditDraft({
      medicineId: row.medicineId,
      drugName: row.drugName,
      dosage: row.dosage,
      dosageUnit: row.dosageUnit,
      frequency: row.frequency,
      instruction: row.instruction,
      duration: row.duration,
    });
  };

  /* A blank row at the end of the table, opened for editing. */
  const handleAddMedicine = () => {
    if (editingRowId !== null || savingEdit) return;
    const row: DischargeMedicationItem = {
      id: Date.now(),
      medicineId: "",
      planItemId: "",
      drugSequence:
        Math.max(0, ...medications.map((item) => item.drugSequence || 0)) + 1,
      drugName: "",
      dosage: "",
      dosageUnit: "",
      frequency: "",
      instruction: "",
      duration: "",
    };
    setMedications((current) => [...current, row]);
    setNewRowIdRef(row.id);
    startEdit(row);
  };

  const cancelEdit = () => {
    if (savingEdit) return;
    /* An added row that was never saved goes away again. */
    if (newRowIdRef !== null) {
      setMedications((current) =>
        current.filter((item) => item.id !== newRowIdRef)
      );
      setNewRowIdRef(null);
    }
    setEditingRowId(null);
    setEditDraft(null);
    setEditError("");
  };

  const saveEdit = async () => {
    if (!editDraft || editingRowId === null || savingEdit) return;

    const name = editDraft.drugName.trim();
    if (!editDraft.medicineId && !name) {
      setEditError("Select a drug from the list or type a drug name");
      return;
    }

    const planId = await planIdForEdits();
    if (!planId) {
      setEditError(
        "This patient has no chemotherapy plan yet. Add one in the Treatment Plan step before adding discharge medicines."
      );
      return;
    }

    const row = medications.find((item) => item.id === editingRowId);
    if (!row) return;

    /* Its position in the table, so the saved row lands back on the line
       the doctor edited. */
    const editedIndex = medications.findIndex(
      (item) => item.id === editingRowId
    );

    /* A protocol row has no plan item id, so saving one puts it on this
       patient's plan; the row it replaces is dropped by
       replaceRowFromServer below. */
    const isNew = !row.planItemId;
    /* An existing row keeps its order on the plan; a row without one goes to
       the end of the table. */
    const nextSequence = Math.max(
      0,
      ...medications.map((item) => item.drugSequence || 0)
    );
    const sequence =
      row.drugSequence > 0 ? row.drugSequence : nextSequence + 1;
    /* Plan item ids in the table before this save, so the just-created row
       can be told apart from the ones already there. */
    const knownPlanItemIds = new Set(
      medications
        .map((item) => item.planItemId)
        .filter(Boolean)
    );

    try {
      setSavingEdit(true);
      setEditError("");

      const payload = toPayload(editDraft, sequence);

      const response = isNew
        ? await chemotherapyApi.addPlanDischargeMedicine(planId, payload)
          : await chemotherapyApi.updatePlanDischargeMedicine(
            planId,
            row.planItemId,
            payload
          );

      replaceRowFromServer(
        response.data.data ?? [],
        row,
        editedIndex,
        knownPlanItemIds
      );
      setEditingRowId(null);
      setEditDraft(null);
      setNewRowIdRef(null);
    } catch (error: any) {
      console.error("Failed to save discharge medicine:", error);
      setEditError(
        error?.response?.data?.message ||
          error?.message ||
          "Failed to save the discharge medicine."
      );
    } finally {
      setSavingEdit(false);
    }
  };

  const removeMedicine = async (row: DischargeMedicationItem) => {
    if (editingRowId !== null || savingEdit) return;

    if (!row.planItemId) {
      /* Protocol default: it is not this patient's row, so there is nothing
         saved to remove - only drop it from the table. */
      setMedications((current) => current.filter((item) => item.id !== row.id));
      return;
    }

    try {
      setSavingEdit(true);
      setEditError("");

      const planId = await planIdForEdits();
      const response = await chemotherapyApi.removePlanDischargeMedicine(
        planId,
        row.planItemId
      );

      applyPatientRows(response.data.data ?? []);
    } catch (error: any) {
      console.error("Failed to remove discharge medicine:", error);
      setEditError(
        error?.response?.data?.message ||
          error?.message ||
          "Failed to remove the discharge medicine."
      );
    } finally {
      setSavingEdit(false);
    }
  };

  const handleNext = async () => {
    if (savingMeds) return;

    if (editingRowId !== null) {
      setMedsError("Save or cancel the medicine you are editing first.");
      return;
    }

    const hasMedications = medications.some((item) => item.drugName.trim());
    if (!hasMedications) {
      setMedsError(
        "Please select or enter the important field in the previous form."
      );
      return;
    }

    try {
      setSavingMeds(true);
      setMedsError("");

      const chemoOrderDraftKey = `hms_chemo_order_${resolvedPatientId}`;
      const draft = (() => {
        try {
          const raw = localStorage.getItem(chemoOrderDraftKey);
          return raw
            ? (JSON.parse(raw) as {
                cycleDay?: string;
                startDate?: string;
                drugs?: Drug[];
                premedicationDrugs?: Drug[];
                supportiveDrugs?: Drug[];
                dosingInputs?: DosingInputs;
                planId?: string | null;
                orderCycle?: number | null;
                orderDay?: number | null;
              })
            : null;
        } catch (error) {
          console.error("Failed to read chemotherapy order draft:", error);
          return null;
        }
      })();

      /* Same builder as the Chemotherapy Order step, so the Dose Cal /
         Patient Dose it calculated are re-saved unchanged. */
      const dosingInputs: DosingInputs = draft?.dosingInputs ?? {
        heightCm: null,
        weightKg: null,
        ageYears: null,
        sex: null,
        serumCreatinine: null,
      };
      const planItems = buildPlanItemsFromOrder(
        (draft?.drugs ?? []).map(normalizeLegacyDraftDrug),
        (draft?.premedicationDrugs ?? []).map(normalizeLegacyDraftDrug),
        (draft?.supportiveDrugs ?? []).map(normalizeLegacyDraftDrug),
        dosingInputs
      );
      /* The draft's rows are the order of the cycle day it was saved
         for; hydration is left as the Chemotherapy Order step saved it. */
      const orderTarget =
        draft?.planId && draft?.orderCycle && draft?.orderDay
          ? { planId: draft.planId, cycle: draft.orderCycle, day: draft.orderDay }
          : undefined;

      const planStartDate =
        toIsoDate(draft?.startDate) ||
        toIsoDate(
          localStorage.getItem(`hms_planned_start_date_${resolvedPatientId}`)
        ) ||
        toIsoDate(new Date().toISOString());

      const { planId, error } = await createChemotherapyPlanForPatient(
        resolvedPatientId,
        planStartDate,
        planItems.length > 0 ? planItems : undefined,
        undefined,
        undefined,
        draft?.dosingInputs ? buildDosingSnapshot(draft.dosingInputs) : undefined,
        { order: orderTarget }
      );
      if (error) {
        setMedsError(error);
        return;
      }
      if (planId) {
        localStorage.setItem(
          `hms_planned_start_date_${resolvedPatientId}`,
          planStartDate ?? ""
        );
      }

      const targetEncounterNo = await resolveEncounterNo();

      if (!targetEncounterNo) {
        setMedsError(
          "No active encounter found. Cannot save discharge medications."
        );
        return;
      }

      const medicationLines = medications
        .filter((item) => item.drugName.trim())
        .map(
          (item, index) =>
            `${index + 1}. ${[
              item.drugName,
              item.dosage,
              item.frequency,
              item.instruction,
              item.duration,
            ]
              .filter(Boolean)
              .join(" | ")}`
        );

      const encounterResponse = await encounterApi.getByNumber(
        targetEncounterNo
      );
      const existingAdvice = encounterResponse.data.data?.advice ?? "";
      const cleanedAdvice = existingAdvice
        .replace(/\n*\[Discharge Medication\][\s\S]*$/, "")
        .trimEnd();

      const adviceParts = [cleanedAdvice];
      if (medicationLines.length > 0) {
        adviceParts.push("[Discharge Medication]", ...medicationLines);
      }
      const advice = adviceParts.filter(Boolean).join("\n\n").trim();

      const payload: { advice?: string } = {};
      if (advice) payload.advice = advice;

      await encounterApi.update(targetEncounterNo, payload);

      if (activeStep < 3) {
        setActiveStep((current) => current + 1);
      }

      onNext?.();
    } catch (error: any) {
      console.error("Failed to save discharge medications:", error);
      setMedsError(
        error?.response?.data?.message ||
          error?.message ||
          "Failed to save discharge medications. Please try again."
      );
    } finally {
      setSavingMeds(false);
    }
  };

  const handleBack = () => {
    window.history.back();
  };

  const handleViewProfile = () => {
    if (!resolvedPatientId) return;
    navigate("/doctor/patient-details", {
      state: { patientId: resolvedPatientId },
    });
  };

  /* ============================================================
     TABLE RENDERING
     ============================================================ */

  /* Drug Name editor: a drug from medicine_master, or any name the doctor
     types - kept on this patient's plan, never added to medicine_master. */
  const renderDrugNameEditor = () =>
    editDraft && (
      <div className="min-w-[220px]">
        <SingleSelectDropdown
          options={medicineOptions}
          value={
            editDraft.medicineId ||
            (editDraft.drugName.trim() ? CUSTOM_DRUG_VALUE : "")
          }
          valueLabel={editDraft.drugName}
          onValueChange={(medicineId) => {
            const option = medicineOptions.find(
              (item) => item.value === medicineId
            );
            setEditDraft((previous) =>
              previous
                ? {
                    ...previous,
                    medicineId: medicineId || "",
                    drugName: option?.label ?? "",
                  }
                : previous
            );
          }}
          onCreateOption={(typed) =>
            setEditDraft((previous) =>
              previous
                ? {
                    ...previous,
                    medicineId: "",
                    drugName: typed.trim(),
                  }
                : previous
            )
          }
          createLabel="Use"
          placeholder={
            medicineOptions.length > 0
              ? "Select or type a drug"
              : "Loading drugs..."
          }
          className="h-10 rounded-md border-gray-300 text-base shadow-none"
        />
        {!editDraft.medicineId && editDraft.drugName.trim() && (
          <p className="mt-1 text-xs text-gray-500">
            Custom name - saved for this patient only
          </p>
        )}
      </div>
    );

  const renderEditInput = (
    field: "frequency" | "duration" | "dosage",
    placeholder?: string
  ) => (
    <input
      type="text"
      value={editDraft?.[field] ?? ""}
      onChange={(event) =>
        setEditDraft((previous) =>
          previous ? { ...previous, [field]: event.target.value } : previous
        )
      }
      placeholder={placeholder}
      className={DISCHARGE_EDIT_INPUT_CLASS}
    />
  );

  const renderEditTextarea = () => (
    <textarea
      value={editDraft?.instruction ?? ""}
      onChange={(event) =>
        setEditDraft((previous) =>
          previous
            ? { ...previous, instruction: event.target.value }
            : previous
        )
      }
      placeholder="Instruction"
      rows={2}
      className={`${DISCHARGE_EDIT_INPUT_CLASS} min-w-[180px] resize-y text-sm`}
    />
  );

  /* The row being added or edited: editors instead of values. */
  const renderEditRow = () => (
    <tr className="border-b border-gray-100 bg-blue-50/40 transition-colors">
      <td className="px-6 py-4">{renderDrugNameEditor()}</td>

      <td className="px-6 py-4">{renderEditInput("dosage", "Dosage")}</td>

      <td className="px-6 py-4">
        {renderEditInput("frequency", "Frequency")}
      </td>

      <td className="px-6 py-4">{renderEditTextarea()}</td>

      <td className="px-6 py-4">{renderEditInput("duration", "Duration")}</td>

      <td className="whitespace-nowrap px-6 py-4 text-right">
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={saveEdit}
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

  const renderReadRow = (medication: DischargeMedicationItem) => (
    <tr
      key={medication.id}
      className="border-b border-gray-100 transition-colors hover:bg-gray-50 last:border-gray-200"
    >
      <td className="px-8 py-6 text-gray-800">
        {medication.drugName}

        {!medication.planItemId && (
          <p className="mt-0.5 text-xs text-gray-400">
            From the treatment protocol
          </p>
        )}
      </td>

      <td className="px-8 py-6">{medication.dosage}</td>

      <td className="px-8 py-6">{medication.frequency}</td>

      <td className="px-8 py-6">{medication.instruction}</td>

      <td className="px-8 py-6">{medication.duration}</td>

      <td className="whitespace-nowrap px-6 py-6 text-right">
        <div className="flex items-center justify-end gap-3 text-gray-500">
          <button
            type="button"
            aria-label={`Edit ${medication.drugName}`}
            onClick={() => startEdit(medication)}
            disabled={editingRowId !== null || savingEdit}
            className="transition-colors hover:text-gray-900 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            <EditIcon />
          </button>

          <button
            type="button"
            aria-label={`Delete ${medication.drugName}`}
            onClick={() => removeMedicine(medication)}
            disabled={editingRowId !== null || savingEdit}
            className="transition-colors hover:text-red-600 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            <DeleteIcon />
          </button>
        </div>
      </td>
    </tr>
  );

  const renderAddMedicineButton = () => (
    <div className="flex flex-col items-start gap-2 px-6 py-4">
      <button
        type="button"
        onClick={handleAddMedicine}
        disabled={
          editingRowId !== null || savingEdit || medsLoading || Boolean(medsError)
        }
        className="inline-flex items-center gap-2 rounded-md border border-dashed border-blue-400 bg-white px-4 py-2 text-sm font-semibold text-blue-600 transition-colors hover:border-blue-600 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
            clipRule="evenodd"
          />
        </svg>
        Add Medicine
      </button>

      {editError && (
        <p className="text-sm font-medium text-red-600">{editError}</p>
      )}
    </div>
  );

  /* The whole table body, shared by the embedded and full-page layouts. */
  const renderTableBody = () => (
    <tbody className="text-sm text-gray-500">
      {medsLoading && (
        <tr>
          <td
            colSpan={6}
            className="px-8 py-8 text-center text-sm text-gray-500"
          >
            Loading discharge medicines...
          </td>
        </tr>
      )}

      {!medsLoading && !medsError && medications.length === 0 && (
        <tr>
          <td
            colSpan={6}
            className="px-8 py-8 text-center text-sm text-gray-500"
          >
            {medsProtocolId
              ? "No discharge medicines recorded on this patient's protocol yet."
              : "No treatment protocol selected yet. Select a protocol in the Treatment Plan step to load its discharge medicines."}
          </td>
        </tr>
      )}

      {medsError && (
        <tr>
          <td
            colSpan={6}
            className="px-8 py-8 text-center text-sm text-red-500"
          >
            {medsError}
          </td>
        </tr>
      )}

      {medications.map((medication) =>
        editingRowId === medication.id ? (
          <React.Fragment key={medication.id}>{renderEditRow()}</React.Fragment>
        ) : (
          renderReadRow(medication)
        )
      )}
    </tbody>
  );

  const DISCHARGE_HEADERS = (
    <thead>
      <tr className="border-b border-gray-200">
        <th className="w-1/4 px-8 py-5 text-[11px] font-bold uppercase tracking-wider text-gray-600">
          Drug Name
        </th>

        <th className="w-1/6 px-8 py-5 text-[11px] font-bold uppercase tracking-wider text-gray-600">
          Dosage
        </th>

        <th className="w-1/6 px-8 py-5 text-[11px] font-bold uppercase tracking-wider text-gray-600">
          Frequency
        </th>

        <th className="w-1/4 px-8 py-5 text-[11px] font-bold uppercase tracking-wider text-gray-600">
          Instruction
        </th>

        <th className="w-1/6 px-8 py-5 text-[11px] font-bold uppercase tracking-wider text-gray-600">
          Duration
        </th>

        <th className="w-40 px-6 py-5 text-right text-[11px] font-bold uppercase tracking-wider text-gray-600">
          Actions
        </th>
      </tr>
    </thead>
  );

if (embedded) {

  return (
    <div className="w-full">
      {/* MEDICATION CARD */}
      <div className="mb-6 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] border-collapse text-left">
            {DISCHARGE_HEADERS}

            {renderTableBody()}
          </table>
        </div>

        {!medsLoading && !medsError && renderAddMedicineButton()}
      </div>

      {/* FOOTER ACTION */}
      <div className="mb-8 flex w-full flex-col items-end gap-2">
        {medsError && (
          <div className="text-sm font-medium text-red-600">{medsError}</div>
        )}
        <button
          type="button"
          onClick={handleNext}
          disabled={savingMeds}
          className="flex items-center gap-2 rounded-md bg-[#1d4ed8] px-8 py-3 font-bold text-white shadow-sm transition-colors hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <DoubleArrowIcon />
          {savingMeds ? "Saving" : "Next"}
        </button>
      </div>
    </div>
  );
  }

  return (
    <div className="flex min-h-screen bg-gray-50 font-sans text-gray-800 antialiased">
      {/* SIDEBAR */}
      <aside className="relative z-20 flex min-h-screen w-80 shrink-0 flex-col border-r border-gray-200 bg-white">
        {/* Profile Summary */}
        <div className="flex flex-col items-center border-b border-gray-200 p-8">
          <div className="relative mb-6 h-32 w-32 overflow-hidden rounded-full ring-4 ring-[#eab308] shadow-sm">
            <img
              src=""
              alt=""
              className="h-full w-full object-cover"
            />
          </div>

          <h2 className="mb-2 text-[22px] font-bold text-gray-900">
            {""}
          </h2>

          <p className="mb-4 text-[15px] text-gray-500">
            {""}
          </p>

          <span className="mb-6 rounded-full bg-gray-100 px-4 py-1.5 text-xs font-semibold text-gray-600">
            {""}
          </span>

          <p className="text-center text-sm font-bold tracking-wide text-blue-700">
            {""}
          </p>
        </div>

        {/* Contact */}
        <div className="space-y-6 border-b border-gray-200 p-8">
          <div className="flex items-start gap-4">
            <PhoneIcon />

            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                Phone
              </p>

              <p className="text-[15px] font-medium text-gray-700">
                {""}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <MailIcon />

            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                Email
              </p>

              <p className="text-[15px] font-medium text-gray-700">
                {""}
              </p>
            </div>
          </div>
        </div>

        {/* Vitals */}
        <div className="flex-grow space-y-8 p-8">
          <div className="grid grid-cols-2 gap-x-4 gap-y-6">
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                Height
              </p>

              <p className="text-[15px] font-bold text-gray-900">
                {measurements.height}
              </p>
            </div>

            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                Weight
              </p>

              <p className="text-[15px] font-bold text-gray-900">
                {measurements.weight}
              </p>
            </div>

            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                BSA
              </p>

              <p className="text-[15px] font-bold text-gray-900">
                {measurements.bsa}
              </p>
            </div>

            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                BMI
              </p>

              <p className="text-[15px] font-bold text-gray-900">
                {measurements.bmi}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleViewProfile}
            className="mt-8 w-full rounded-md border border-blue-600 px-4 py-2.5 font-semibold text-blue-600 transition-colors duration-200 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            View Full Profile
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="relative z-10 flex min-w-0 flex-1 flex-col bg-gray-50">
        {/* TOP HEADER */}
        <header className="relative z-20 flex h-20 shrink-0 items-center justify-between bg-white px-8">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleBack}
              aria-label="Back"
              className="-ml-2 rounded-full p-2 text-gray-600 transition-colors hover:bg-gray-100"
            >
              <ArrowLeftIcon />
            </button>

            <h1 className="text-2xl font-bold tracking-tight text-gray-900">
              Patients
            </h1>
          </div>

          <div className="flex items-center gap-6">
            {/* Notification */}
            <button
              type="button"
              aria-label="Notifications"
              className="relative rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100"
            >
              <BellIcon />

              <span className="absolute right-2 top-2 h-2 w-2 rounded-full border-2 border-white bg-red-500" />
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

        {/* Background under stepper */}
        <div className="absolute left-0 right-0 top-20 z-0 h-40 border-b border-gray-200 bg-white" />

        {/* CONTENT */}
        <div className="relative z-10 flex-1 overflow-y-auto p-8 pt-0">
          <div className="mx-auto max-w-[1200px]">
            {/* MEDICATION CARD */}
            <div className="mx-auto mb-6 max-w-[1200px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1000px] border-collapse text-left">
                  {DISCHARGE_HEADERS}

                  {renderTableBody()}
                </table>
              </div>

              {!medsLoading && !medsError && renderAddMedicineButton()}
            </div>

            {/* FOOTER ACTION */}
            <div className="mx-auto mb-8 flex max-w-[1200px] flex-col items-end gap-2">
              {medsError && (
                <div className="text-sm font-medium text-red-600">
                  {medsError}
                </div>
              )}

              <button
                type="button"
                onClick={handleNext}
                disabled={savingMeds}
                className="flex items-center gap-2 rounded-md bg-[#1d4ed8] px-8 py-3 font-bold text-white shadow-sm transition-colors hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <DoubleArrowIcon />
                {savingMeds ? "Saving" : "Next"}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default DischargeMedication;
