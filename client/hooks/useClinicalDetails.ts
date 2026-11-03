import { useCallback, useEffect, useRef, useState } from "react";
import {
  clinicalDetailsApi,
  getApiErrorMessage,
  type AllergyOption,
  type ComorbidityOption,
  type DurationUnit,
  type EncounterClinicalDetails,
  type PerformanceStatusOption,
  type SymptomOption,
} from "@/api/clinicalDetails.api";

export interface ClinicalDetailsDraft {
  performanceStatusId: number | null;
  symptoms: Array<{
    symptomId: number;
    severity?: string;
    durationDays?: number | null;
    durationUnit?: DurationUnit | null;
    onsetDate?: string | null;
    clinicalNotes?: string | null;
  }>;
  allergies: Array<{
    allergyId: number;
    reaction?: string | null;
    severity?: string;
    durationValue?: number | null;
    durationUnit?: DurationUnit | null;
    clinicalNotes?: string | null;
  }>;
  comorbidities: Array<{
    /* comorbidity_master.id */
    comorbidityId: string;
    onsetDate?: string | null;
    durationValue?: number | null;
    durationUnit?: DurationUnit | null;
    clinicalNotes?: string | null;
  }>;
}

export interface UseClinicalDetailsParams {
  patientId?: string | null;
  encounterNo?: string | null;
}

interface UseClinicalDetailsResult {
  loading: boolean;
  error: string | null;
  retry: () => void;

  performanceStatusOptions: PerformanceStatusOption[];
  symptomOptions: SymptomOption[];
  allergyOptions: AllergyOption[];
  comorbidityOptions: ComorbidityOption[];
  /* Distinct comorbidity_master categories, for the "+ Add" panel. */
  comorbidityCategories: string[];

  saved: EncounterClinicalDetails | null;

  saving: boolean;
  saveError: string | null;
  saveSuccess: boolean;
  /* Resolves true when every write succeeded, false otherwise. */
  saveClinicalDetails: (draft: ClinicalDetailsDraft) => Promise<boolean>;

  createSymptom: (name: string) => Promise<SymptomOption | null>;
  createAllergy: (substanceName: string) => Promise<AllergyOption | null>;
  createComorbidity: (payload: {
    comorbidityName: string;
    category?: string;
    icdCode?: string;
  }) => Promise<ComorbidityOption | null>;
}

/* The API returns timestamps, the editors hold YYYY-MM-DD; compare the
   date part only so unchanged dates never trigger a write. */
const dateOnly = (value?: string | null) =>
  value ? String(value).slice(0, 10) : "";

const EMPTY_SAVED: EncounterClinicalDetails = {
  encounter: { encounterNo: "", patientId: "", encounterTs: "", status: "" },
  performanceStatus: null,
  symptoms: [],
  allergies: [],
  comorbidities: [],
};

export function useClinicalDetails({
  patientId,
  encounterNo,
}: UseClinicalDetailsParams): UseClinicalDetailsResult {
  const [performanceStatusOptions, setPerformanceStatusOptions] = useState<
    PerformanceStatusOption[]
  >([]);
  const [symptomOptions, setSymptomOptions] = useState<SymptomOption[]>([]);
  const [allergyOptions, setAllergyOptions] = useState<AllergyOption[]>([]);
  const [comorbidityOptions, setComorbidityOptions] = useState<
    ComorbidityOption[]
  >([]);
  const [comorbidityCategories, setComorbidityCategories] = useState<
    string[]
  >([]);

  const [saved, setSaved] = useState<EncounterClinicalDetails | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [loadVersion, setLoadVersion] = useState(0);

  const saveInFlight = useRef(false);

  const hasContext = Boolean(patientId && encounterNo);

  /* ============================================================
     LOAD: master/reference options + saved encounter clinical details
  ============================================================ */
  useEffect(() => {
    let cancelled = false;

    if (!hasContext) {
      setSaved(null);
      setPerformanceStatusOptions([]);
      setSymptomOptions([]);
      setAllergyOptions([]);
      setComorbidityOptions([]);
      setComorbidityCategories([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    (async () => {
      try {
        const [
          performanceRes,
          symptomRes,
          allergyRes,
          comorbidityRes,
          clinicalRes,
        ] = await Promise.all([
          clinicalDetailsApi.getPerformanceStatusOptions(),
          clinicalDetailsApi.getSymptomOptions(),
          clinicalDetailsApi.getAllergyOptions(),
          clinicalDetailsApi.getComorbidityMaster(),
          clinicalDetailsApi.getEncounterClinicalDetails(encounterNo!),
        ]);

        if (cancelled) return;

        const comorbidityOptions = comorbidityRes.data.data ?? [];
        setComorbidityCategories(
          Array.from(
            new Set(
              comorbidityOptions
                .map((option) => option.category)
                .filter((category): category is string => Boolean(category)),
            ),
          ).sort(),
        );

        setPerformanceStatusOptions(
          performanceRes.data.data?.items ?? [],
        );
        setSymptomOptions(symptomRes.data.data?.items ?? []);
        setAllergyOptions(allergyRes.data.data?.items ?? []);
        setComorbidityOptions(comorbidityOptions);

        setSaved(clinicalRes.data.data ?? EMPTY_SAVED);
      } catch (err) {
        console.error(
          "[useClinicalDetails] Failed to load clinical details:",
          err,
        );
        if (cancelled) return;
        setError(getApiErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [patientId, encounterNo, hasContext, loadVersion]);

  const retry = useCallback(() => {
    setLoadVersion((version) => version + 1);
  }, []);

  /* ============================================================
     SAVE: sends the current draft to the backend, then re-fetches
     the saved state from the server so local state matches the DB.
     ECOG + symptoms are encounter-specific; allergies + comorbidities
     are patient-level and saved through their own endpoints.
  ============================================================ */
  const saveClinicalDetails = useCallback(
    async (draft: ClinicalDetailsDraft): Promise<boolean> => {
      if (!patientId || !encounterNo) {
        setSaveError("Missing patient or encounter context.");
        return false;
      }

      if (saveInFlight.current) return false;
      saveInFlight.current = true;

      setSaving(true);
      setSaveError(null);
      setSaveSuccess(false);

      const writeErrors: unknown[] = [];
      const isAlreadyActiveError = (err: any) =>
        typeof err?.response?.data?.message === "string" &&
        /already has this .* active/i.test(err.response.data.message);
      const noteWriteError = (
        err: unknown,
        action: string,
        label: string
      ) => {
        console.error(
          `[useClinicalDetails] ${action} failed for ${label}:`,
          err
        );
        writeErrors.push(err);
      };

      try {
        const current = saved;

        // ---- 1. ECOG (upsert, encounter-specific) ----
        if (draft.performanceStatusId != null) {
          await clinicalDetailsApi.setEncounterPerformanceStatus(encounterNo, {
            performanceStatusId: draft.performanceStatusId,
          });
        }

        // ---- 2. Symptoms (encounter-specific) ----
        const savedSymptoms = current?.symptoms ?? [];
        const draftSymptomIds = draft.symptoms.map(
          (symptom) => symptom.symptomId,
        );

        for (const savedSymptom of savedSymptoms) {
          if (!draftSymptomIds.includes(Number(savedSymptom.symptomId))) {
            try {
              await clinicalDetailsApi.removeEncounterSymptom(
                encounterNo,
                Number(savedSymptom.symptomId),
              );
            } catch (err) {
              noteWriteError(err, "remove symptom", savedSymptom.symptomName);
            }
          }
        }

        for (const symptom of draft.symptoms) {
          const existing = savedSymptoms.find(
            (savedSymptom) =>
              Number(savedSymptom.symptomId) === symptom.symptomId,
          );

          const payload = {
            severity: symptom.severity || undefined,
            durationDays: symptom.durationDays ?? null,
            durationUnit: symptom.durationDays == null
              ? null
              : symptom.durationUnit ?? null,
            onsetDate: symptom.onsetDate ?? null,
            clinicalNotes: symptom.clinicalNotes ?? null,
          };

          if (!existing) {
            try {
              await clinicalDetailsApi.addEncounterSymptom(encounterNo, {
                symptomId: symptom.symptomId,
                ...payload,
              });
            } catch (err) {
              if (!isAlreadyActiveError(err)) {
                noteWriteError(err, "add symptom", String(symptom.symptomId));
              }
            }
          } else if (
            (existing.severity ?? "") !== (symptom.severity ?? "") ||
            (existing.durationDays ?? null) !==
              (symptom.durationDays ?? null) ||
            (existing.durationUnit ?? null) !==
              (symptom.durationUnit ?? null) ||
            dateOnly(existing.onsetDate) !== dateOnly(symptom.onsetDate) ||
            (existing.clinicalNotes ?? "") !==
              (symptom.clinicalNotes ?? "")
          ) {
            try {
              await clinicalDetailsApi.updateEncounterSymptom(
                encounterNo,
                Number(existing.symptomId),
                payload,
              );
            } catch (err) {
              noteWriteError(err, "update symptom", String(symptom.symptomId));
            }
          }
        }

        // ---- 3. Allergies (patient-level, longitudinal) ----
        const savedAllergies = current?.allergies ?? [];
        const draftAllergyIds = draft.allergies.map(
          (allergy) => allergy.allergyId,
        );

        for (const savedAllergy of savedAllergies) {
          if (!draftAllergyIds.includes(Number(savedAllergy.allergyId))) {
            try {
              await clinicalDetailsApi.removePatientAllergy(
                patientId,
                Number(savedAllergy.id),
              );
            } catch (err) {
              noteWriteError(err, "remove allergy", savedAllergy.substanceName);
            }
          }
        }

        for (const allergy of draft.allergies) {
          const existing = savedAllergies.find(
            (savedAllergy) =>
              Number(savedAllergy.allergyId) === allergy.allergyId,
          );

          const payload = {
            reaction: allergy.reaction ?? null,
            severity: allergy.severity || undefined,
            durationValue: allergy.durationValue ?? null,
            durationUnit: allergy.durationValue == null
              ? null
              : allergy.durationUnit ?? null,
            clinicalNotes: allergy.clinicalNotes ?? null,
          };

          if (!existing) {
            try {
              await clinicalDetailsApi.addPatientAllergy(patientId, {
                allergyId: allergy.allergyId,
                ...payload,
                identifiedAtEncounterNo: encounterNo,
              });
            } catch (err) {
              if (!isAlreadyActiveError(err)) {
                noteWriteError(err, "add allergy", String(allergy.allergyId));
              }
            }
          } else if (
            (existing.reaction ?? "") !== (allergy.reaction ?? "") ||
            (existing.severity ?? "") !== (allergy.severity ?? "") ||
            (existing.durationValue ?? null) !==
              (allergy.durationValue ?? null) ||
            (existing.durationUnit ?? null) !==
              (allergy.durationUnit ?? null) ||
            (existing.clinicalNotes ?? "") !==
              (allergy.clinicalNotes ?? "")
          ) {
            try {
              await clinicalDetailsApi.updatePatientAllergy(
                patientId,
                Number(existing.id),
                payload,
              );
            } catch (err) {
              noteWriteError(err, "update allergy", String(allergy.allergyId));
            }
          }
        }

        // ---- 4. Comorbidities (patient-level, longitudinal) ----
        const savedComorbidities = current?.comorbidities ?? [];
        const draftComorbidityIds = draft.comorbidities.map((comorbidity) =>
          String(comorbidity.comorbidityId),
        );

        for (const savedComorbidity of savedComorbidities) {
          if (
            !draftComorbidityIds.includes(String(savedComorbidity.comorbidityId))
          ) {
            try {
              await clinicalDetailsApi.removePatientComorbidity(
                patientId,
                Number(savedComorbidity.id),
              );
            } catch (err) {
              noteWriteError(
                err,
                "remove comorbidity",
                savedComorbidity.comorbidityName,
              );
            }
          }
        }

        for (const comorbidity of draft.comorbidities) {
          const existing = savedComorbidities.find(
            (savedComorbidity) =>
              String(savedComorbidity.comorbidityId) ===
              String(comorbidity.comorbidityId),
          );

          const comorbidityPayload = {
            onsetDate: comorbidity.onsetDate ?? null,
            durationValue: comorbidity.durationValue ?? null,
            durationUnit: comorbidity.durationValue == null
              ? null
              : comorbidity.durationUnit ?? null,
            clinicalNotes: comorbidity.clinicalNotes ?? null,
          };

          if (!existing) {
            try {
              await clinicalDetailsApi.addPatientComorbidity(patientId, {
                comorbidityId: comorbidity.comorbidityId,
                ...comorbidityPayload,
                identifiedAtEncounterNo: encounterNo,
              });
            } catch (err) {
              if (!isAlreadyActiveError(err)) {
                noteWriteError(
                  err,
                  "add comorbidity",
                  String(comorbidity.comorbidityId),
                );
              }
            }
          } else if (
            dateOnly(existing.onsetDate) !== dateOnly(comorbidity.onsetDate) ||
            (existing.durationValue ?? null) !==
              (comorbidity.durationValue ?? null) ||
            (existing.durationUnit ?? null) !==
              (comorbidity.durationUnit ?? null) ||
            (existing.clinicalNotes ?? "") !==
              (comorbidity.clinicalNotes ?? "")
          ) {
            try {
              await clinicalDetailsApi.updatePatientComorbidity(
                patientId,
                Number(existing.id),
                comorbidityPayload,
              );
            } catch (err) {
              noteWriteError(
                err,
                "update comorbidity",
                String(comorbidity.comorbidityId),
              );
            }
          }
        }

        // ---- 5. Always refresh from server so local state mirrors
        //        the DB even when individual writes failed. ----
        const fresh = await clinicalDetailsApi.getEncounterClinicalDetails(
          encounterNo,
        );
        const freshData = fresh.data.data ?? EMPTY_SAVED;
        setSaved(freshData);
        if (writeErrors.length > 0) {
          setSaveError(
            "Some clinical details could not be saved. The rest were saved successfully.",
          );
        } else {
          setSaveSuccess(true);
        }
        return writeErrors.length === 0;
      } catch (err) {
        console.error(
          "[useClinicalDetails] Failed to save clinical details:",
          err,
        );
        setSaveError(getApiErrorMessage(err));
        return false;
      } finally {
        saveInFlight.current = false;
        setSaving(false);
      }
    },
    [patientId, encounterNo, saved],
  );

  /* ============================================================
     CUSTOM "OTHERS" CREATION
     Creates a new master/reference record from free-text input and
     appends it to the local option list so it is immediately usable
     (selectable / addable) without a page reload.
  ============================================================ */
  const createSymptom = useCallback(
    async (name: string): Promise<SymptomOption | null> => {
      try {
        const response = await clinicalDetailsApi.createCustomSymptom({ name });
        const created = response.data.data;
        if (created) {
          setSymptomOptions((previous) =>
            previous.some((option) => option.id === created.id)
              ? previous
              : [...previous, created],
          );
        }
        return created ?? null;
      } catch (err) {
        const message = getApiErrorMessage(err);
        setError(message);
        throw new Error(message);
      }
    },
    [],
  );

  const createAllergy = useCallback(
    async (substanceName: string): Promise<AllergyOption | null> => {
      try {
        const response = await clinicalDetailsApi.createCustomAllergy({
          substanceName,
        });
        const created = response.data.data;
        if (created) {
          setAllergyOptions((previous) =>
            previous.some((option) => option.id === created.id)
              ? previous
              : [...previous, created],
          );
        }
        return created ?? null;
      } catch (err) {
        const message = getApiErrorMessage(err);
        setError(message);
        throw new Error(message);
      }
    },
    [],
  );

  const createComorbidity = useCallback(
    async (payload: {
      comorbidityName: string;
      category?: string;
      icdCode?: string;
    }): Promise<ComorbidityOption | null> => {
      try {
        const response = await clinicalDetailsApi.createCustomComorbidity(
          payload,
        );
        // A name that already exists comes back as the existing row.
        const created = response.data.data;
        if (created) {
          setComorbidityOptions((previous) =>
            previous.some((option) => option.id === created.id)
              ? previous
              : [...previous, created],
          );
          const category = created.category;
          if (category) {
            setComorbidityCategories((previous) =>
              previous.includes(category)
                ? previous
                : [...previous, category].sort(),
            );
          }
        }
        return created ?? null;
      } catch (err) {
        const message = getApiErrorMessage(err);
        setError(message);
        throw new Error(message);
      }
    },
    [],
  );

  return {
    loading,
    error,
    retry,
    performanceStatusOptions,
    symptomOptions,
    allergyOptions,
    comorbidityOptions,
    comorbidityCategories,
    saved,
    saving,
    saveError,
    saveSuccess,
    saveClinicalDetails,
    createSymptom,
    createAllergy,
    createComorbidity,
  };
}