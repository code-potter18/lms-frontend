import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { chemotherapyApi, MedicineOption } from "@/api/chemotherapy.api";
import type { GenericCatalog, ProtocolFieldOptions } from "./protocolCore";

export interface CancerTypeOption {
  cancer_type_id: string;
  cancer_type: string;
}

export interface SubtypeOption {
  subtype_id: string;
  subtype_name: string;
  group?: string;
}

const EMPTY_FIELD_OPTIONS: ProtocolFieldOptions = {
  dosage_units: [],
  dilution_forms: [],
  dilution_dose_units: [],
  dilution_volume_units: [],
  diluents: [],
};

const STALE_TIME_CATALOGS = 15 * 60 * 1000; // 15 minutes - oncology catalogs are static master data

export function useProtocolCatalogs(cancerTypeIds: string[]) {
  const [subtypeIds, setSubtypeIds] = useState<string[]>([]);
  const [filterByCancerAndSubtype, setFilterByCancerAndSubtype] = useState(true);

  // Local overrides for medicines and intents (e.g. when a custom drug is created in drawer)
  const [localAllMeds, setLocalAllMeds] = useState<MedicineOption[] | null>(null);
  const [localPremedMeds, setLocalPremedMeds] = useState<MedicineOption[] | null>(null);
  const [localChemoMeds, setLocalChemoMeds] = useState<MedicineOption[] | null>(null);
  const [localSupportiveMeds, setLocalSupportiveMeds] = useState<MedicineOption[] | null>(null);
  const [localDischargeMeds, setLocalDischargeMeds] = useState<MedicineOption[] | null>(null);
  const [localDilutionMeds, setLocalDilutionMeds] = useState<MedicineOption[] | null>(null);
  const [localTreatmentIntents, setLocalTreatmentIntents] = useState<string[] | null>(null);

  // 1. Cancer Types (Cached)
  const { data: cancerTypes = [], isLoading: loadingCancerTypes } = useQuery<CancerTypeOption[]>({
    queryKey: ["oncology-cancer-types"],
    queryFn: async () => {
      const res = await chemotherapyApi.listCancerTypes();
      const data = (res.data as any)?.data ?? res.data;
      return Array.isArray(data) ? data : [];
    },
    staleTime: STALE_TIME_CATALOGS,
  });

  // 2. Dilution Medicines (Cached)
  const { data: queryDilutionMeds = [], isLoading: loadingDilutionMeds } = useQuery<MedicineOption[]>({
    queryKey: ["oncology-dilution-meds"],
    queryFn: async () => {
      const res = await chemotherapyApi.listDilutionMedicines();
      const data = (res.data as any)?.data ?? res.data;
      return Array.isArray(data) ? data : [];
    },
    staleTime: STALE_TIME_CATALOGS,
  });

  // 3. Field Options & Treatment Intents (Cached)
  const { data: fieldOptionsData, isLoading: loadingTreatmentIntents } = useQuery({
    queryKey: ["oncology-field-options"],
    queryFn: async () => {
      const res = await chemotherapyApi.getProtocolFieldOptions();
      const data = (res.data as any)?.data;
      const opts: ProtocolFieldOptions = {
        dosage_units: Array.isArray(data?.dosage_units) ? data.dosage_units : [],
        dilution_forms: Array.isArray(data?.dilution_forms) ? data.dilution_forms : [],
        dilution_dose_units: Array.isArray(data?.dilution_dose_units) ? data.dilution_dose_units : [],
        dilution_volume_units: Array.isArray(data?.dilution_volume_units) ? data.dilution_volume_units : [],
        diluents: Array.isArray(data?.diluents) ? data.diluents : [],
      };

      let intents: string[] = [];
      if (Array.isArray(data?.treatment_intents) && data.treatment_intents.length > 0) {
        intents = data.treatment_intents;
      } else {
        try {
          const r = await chemotherapyApi.listTreatmentIntents();
          const rData = (r.data as any)?.data ?? r.data;
          if (Array.isArray(rData)) intents = rData;
        } catch {}
      }
      return { opts, intents };
    },
    staleTime: STALE_TIME_CATALOGS,
  });

  const fieldOptions = fieldOptionsData?.opts ?? EMPTY_FIELD_OPTIONS;
  const treatmentIntentOptions = localTreatmentIntents ?? fieldOptionsData?.intents ?? [];

  // 4. Generic Catalog (Cached)
  const { data: genericCatalog = {} } = useQuery<GenericCatalog>({
    queryKey: ["oncology-generic-catalog"],
    queryFn: async () => {
      const res = await chemotherapyApi.getGenericFormsAndBrands();
      const data = (res.data as any)?.data ?? res.data;
      return data && typeof data === "object" ? data : {};
    },
    staleTime: STALE_TIME_CATALOGS,
  });

  // 5. Cancer Subtypes (Cached per selected cancer types)
  const cancerKey = [...(cancerTypeIds || [])].sort().join(",");
  const { data: subtypes = [], isLoading: loadingSubtypes } = useQuery<SubtypeOption[]>({
    queryKey: ["oncology-cancer-subtypes", cancerKey],
    queryFn: async () => {
      if (!cancerTypeIds || cancerTypeIds.length === 0) return [];
      const results = await Promise.all(
        cancerTypeIds.map(async (typeId) => {
          try {
            const res = await chemotherapyApi.listCancerSubtypes(typeId);
            const data = (res.data as any)?.data ?? res.data;
            const cancerTypeObj = cancerTypes.find((c) => c.cancer_type_id === typeId);
            const list = Array.isArray(data) ? data : [];
            return list.map((s: any) => ({
              ...s,
              group: cancerTypeObj?.cancer_type || "Cancer Subtypes",
            }));
          } catch {
            return [];
          }
        })
      );
      const flattened = results.flat();
      const seen = new Map<string, any>();
      for (const s of flattened) {
        if (!seen.has(s.subtype_id)) seen.set(s.subtype_id, s);
      }
      return Array.from(seen.values());
    },
    enabled: Boolean(cancerTypeIds && cancerTypeIds.length > 0),
    staleTime: STALE_TIME_CATALOGS,
  });

  // Prune any selected subtypeIds that no longer belong to active cancer types
  useEffect(() => {
    if (subtypes.length > 0) {
      setSubtypeIds((prev) => prev.filter((id) => subtypes.some((s) => s.subtype_id === id)));
    } else if (!cancerTypeIds || cancerTypeIds.length === 0) {
      setSubtypeIds([]);
    }
  }, [subtypes, cancerTypeIds]);

  // 6. All Hospital Medicines (Cached, only fetched when filter is disabled)
  const { data: queryAllHospitalMeds = [], isLoading: loadingAllMeds } = useQuery<MedicineOption[]>({
    queryKey: ["oncology-all-hospital-meds"],
    queryFn: async () => {
      const res = await chemotherapyApi.listMedicines();
      const data = (res.data as any)?.data ?? res.data;
      return Array.isArray(data) ? data : [];
    },
    enabled: !filterByCancerAndSubtype,
    staleTime: STALE_TIME_CATALOGS,
  });

  // 7. Role-Based Medicines (Cached)
  const { data: queryPremeds = [], isLoading: loadingPremedMeds } = useQuery<MedicineOption[]>({
    queryKey: ["oncology-meds-by-role", "PREMEDICATION"],
    queryFn: async () => {
      const res = await chemotherapyApi.listMedicinesByRole("PREMEDICATION");
      const data = (res.data as any)?.data ?? res.data;
      return Array.isArray(data) ? data : [];
    },
    staleTime: STALE_TIME_CATALOGS,
  });

  const { data: queryChemoMeds = [], isLoading: loadingChemoMeds } = useQuery<MedicineOption[]>({
    queryKey: ["oncology-meds-by-role", "PRIMARY"],
    queryFn: async () => {
      const res = await chemotherapyApi.listMedicinesByRole("PRIMARY");
      const data = (res.data as any)?.data ?? res.data;
      return Array.isArray(data) ? data : [];
    },
    staleTime: STALE_TIME_CATALOGS,
  });

  const { data: querySupportiveMeds = [], isLoading: loadingSupportiveMeds } = useQuery<MedicineOption[]>({
    queryKey: ["oncology-meds-by-role", "SUPPORTIVE"],
    queryFn: async () => {
      const res = await chemotherapyApi.listMedicinesByRole("SUPPORTIVE");
      const data = (res.data as any)?.data ?? res.data;
      return Array.isArray(data) ? data : [];
    },
    staleTime: STALE_TIME_CATALOGS,
  });

  const { data: queryDischargeMeds = [], isLoading: loadingDischargeMeds } = useQuery<MedicineOption[]>({
    queryKey: ["oncology-meds-by-role", "DISCHARGE"],
    queryFn: async () => {
      const res = await chemotherapyApi.listMedicinesByRole("DISCHARGE");
      const data = (res.data as any)?.data ?? res.data;
      return Array.isArray(data) ? data : [];
    },
    staleTime: STALE_TIME_CATALOGS,
  });

  // Merge queries with local overrides
  const allHospitalMeds = localAllMeds ?? queryAllHospitalMeds;
  const premedMeds = !filterByCancerAndSubtype && allHospitalMeds.length > 0 ? allHospitalMeds : (localPremedMeds ?? queryPremeds);
  const chemoMeds = !filterByCancerAndSubtype && allHospitalMeds.length > 0 ? allHospitalMeds : (localChemoMeds ?? queryChemoMeds);
  const supportiveMeds = !filterByCancerAndSubtype && allHospitalMeds.length > 0 ? allHospitalMeds : (localSupportiveMeds ?? querySupportiveMeds);
  const dischargeMeds = !filterByCancerAndSubtype && allHospitalMeds.length > 0 ? allHospitalMeds : (localDischargeMeds ?? queryDischargeMeds);
  const dilutionMeds = localDilutionMeds ?? queryDilutionMeds;

  // Setters wrap local overrides for 100% backward compatibility with CreateProtocol
  const setAllHospitalMeds = (updater: React.SetStateAction<MedicineOption[]>) => {
    setLocalAllMeds((prev) => (typeof updater === "function" ? updater(prev ?? queryAllHospitalMeds) : updater));
  };
  const setPremedMeds = (updater: React.SetStateAction<MedicineOption[]>) => {
    setLocalPremedMeds((prev) => (typeof updater === "function" ? updater(prev ?? queryPremeds) : updater));
  };
  const setChemoMeds = (updater: React.SetStateAction<MedicineOption[]>) => {
    setLocalChemoMeds((prev) => (typeof updater === "function" ? updater(prev ?? queryChemoMeds) : updater));
  };
  const setSupportiveMeds = (updater: React.SetStateAction<MedicineOption[]>) => {
    setLocalSupportiveMeds((prev) => (typeof updater === "function" ? updater(prev ?? querySupportiveMeds) : updater));
  };
  const setDischargeMeds = (updater: React.SetStateAction<MedicineOption[]>) => {
    setLocalDischargeMeds((prev) => (typeof updater === "function" ? updater(prev ?? queryDischargeMeds) : updater));
  };
  const setDilutionMeds = (updater: React.SetStateAction<MedicineOption[]>) => {
    setLocalDilutionMeds((prev) => (typeof updater === "function" ? updater(prev ?? queryDilutionMeds) : updater));
  };
  const setTreatmentIntentOptions = (updater: React.SetStateAction<string[]>) => {
    setLocalTreatmentIntents((prev) => (typeof updater === "function" ? updater(prev ?? fieldOptionsData?.intents ?? []) : updater));
  };

  return {
    cancerTypes,
    loadingCancerTypes,
    subtypes,
    subtypeIds,
    setSubtypeIds,
    loadingSubtypes,
    filterByCancerAndSubtype,
    setFilterByCancerAndSubtype,
    allHospitalMeds,
    setAllHospitalMeds,
    loadingAllMeds,
    premedMeds,
    setPremedMeds,
    chemoMeds,
    setChemoMeds,
    supportiveMeds,
    setSupportiveMeds,
    dischargeMeds,
    setDischargeMeds,
    dilutionMeds,
    setDilutionMeds,
    loadingPremedMeds,
    loadingChemoMeds,
    loadingSupportiveMeds,
    loadingDischargeMeds,
    loadingDilutionMeds,
    genericCatalog,
    fieldOptions,
    treatmentIntentOptions,
    setTreatmentIntentOptions,
    loadingTreatmentIntents,
  };
}
