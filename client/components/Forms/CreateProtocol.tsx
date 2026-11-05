import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  Save,
  Pill,
  Syringe,
  ClipboardList,
  Copy,
  Plus,
  Eye,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ConfirmationDialog } from "@/components/ui/ConfirmationDialog";
import { chemotherapyApi, MedicineOption } from "@/api/chemotherapy.api";
import {
  cardCls,
  inputCls,
  labelCls,
  Req,
  emptyPremed,
  emptyChemo,
  emptySupportive,
  emptyDilution,
  emptyPost,
  getMedName,
  buildProtocolItems,
  buildDischargeInstructions,
  buildDilutions,
  parseProtocolPayload,
  stripOthersOpts,
} from "./protocol/protocolCore";
import type {
  ChemoPlan,
  DilutionDetail,
  PostTreatment,
  Premed,
  ProtocolDay,
  SupportiveCare,
} from "./protocol/protocolCore";
import { ProtocolSelect, ProtocolMultiSelect } from "./protocol/ProtocolSelect";
import { useProtocolCatalogs } from "./protocol/useProtocolCatalogs";
import { ProtocolDrawer } from "./protocol/ProtocolDrawer";
import type { DrawerSectionState } from "./protocol/ProtocolDrawer";
import {
  PremedSection,
  ChemoPlanSection,
  SupportiveSection,
  DilutionSection,
  PostTreatmentSection,
} from "./protocol/ProtocolSectionCard";

export default function CreateProtocol() {
  const navigate = useNavigate();
  const { protocolId } = useParams<{ protocolId: string }>();
  const location = useLocation();
  const { toast } = useToast();

  const isViewMode = location.pathname.includes("/view/");
  const isEditMode = location.pathname.includes("/edit/");
  const isCreateMode = !protocolId && !isViewMode && !isEditMode;
  const disabled = isViewMode;

  // Pattern 5 Slide-Over Drawer State
  const [activeDrawer, setActiveDrawer] = useState<DrawerSectionState | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && activeDrawer !== null) {
        setActiveDrawer(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeDrawer]);

  const getActiveSectionItemsCount = () => {
    if (!activeDrawer) return 0;
    switch (activeDrawer.section) {
      case "premeds": return premeds.length;
      case "chemo": return chemoPlans.length;
      case "supportive": return supportive.length;
      case "dilution": return dilution.length;
      case "post": return post.length;
      default: return 0;
    }
  };

  const handleDeleteFromDrawer = () => {
    if (disabled || !activeDrawer) return;
    const { section, index } = activeDrawer;
    if (section === "premeds") removePremed(index);
    else if (section === "chemo") removeChemoPlan(index);
    else if (section === "supportive") removeSupportive(index);
    else if (section === "dilution") removeDilution(index);
    else if (section === "post") removePost(index);
    setActiveDrawer(null);
  };

  // --- Protocol header fields --- regimen_code = Regime_name, regimen_name = Protocol Title (original_protocol)
  const [regimenCode, setRegimenCode] = useState("");
  const [regimenName, setRegimenName] = useState("");
  const [cancerTypeIds, setCancerTypeIds] = useState<string[]>([]);
  const [treatmentIntent, setTreatmentIntent] = useState("");

  const [standardCycles, setStandardCycles] = useState<number>(6);
  const [cycleIntervalDays, setCycleIntervalDays] = useState<number>(21);
  const [notes, setNotes] = useState("");
  const [days, setDays] = useState<ProtocolDay[]>([{ dayNumber: 1 }]);
  const [activeDay, setActiveDay] = useState(1);

  // Per-day maps for protocol items (each day owns its own rows; preserves
  // administration_day per item so repeated edits never re-stamp items onto
  // a single active day).
  const [premedsByDay, setPremedsByDay] = useState<Record<number, Premed[]>>({ 1: [emptyPremed()] });
  const [chemoPlansByDay, setChemoPlansByDay] = useState<Record<number, ChemoPlan[]>>({ 1: [emptyChemo()] });
  const [supportiveByDay, setSupportiveByDay] = useState<Record<number, SupportiveCare[]>>({ 1: [emptySupportive()] });
  const [dilution, setDilution] = useState<DilutionDetail[]>([emptyDilution()]);
  const [post, setPost] = useState<PostTreatment[]>([emptyPost()]);

  const {
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
  } = useProtocolCatalogs(cancerTypeIds);

  // Active-day views + setters - Pre-medications, Primary Chemo, and Supportive
  // Care are partitioned per day. Dilution Details and Post-treatment (On Discharge)
  // medications are protocol-level (not tied to any administration day).
  const premeds = premedsByDay[activeDay] ?? [];
  const setPremeds = (list: Premed[]) => setPremedsByDay((prev) => ({ ...prev, [activeDay]: list }));
  const chemoPlans = chemoPlansByDay[activeDay] ?? [];
  const setChemoPlans = (list: ChemoPlan[]) => setChemoPlansByDay((prev) => ({ ...prev, [activeDay]: list }));
  const supportive = supportiveByDay[activeDay] ?? [];
  const setSupportive = (list: SupportiveCare[]) => setSupportiveByDay((prev) => ({ ...prev, [activeDay]: list }));

  const [savingDrawer, setSavingDrawer] = useState(false);

  const updateLocalMedicineCatalog = (
    medicineId: string,
    genericId: string,
    genericName: string,
    dosageForm?: string | null
  ) => {
    const updateList = (list: MedicineOption[]) => {
      const exists = list.some(
        (m) =>
          m.medicine_id === medicineId ||
          (genericId && genericId !== "GEN_NOT_SPECIFIED" && m.generic_id === genericId)
      );
      if (exists) {
        return list.map((m) =>
          m.medicine_id === medicineId ||
          (genericId && genericId !== "GEN_NOT_SPECIFIED" && m.generic_id === genericId)
            ? { ...m, generic_id: genericId, generic_name: genericName, ...(dosageForm ? { dosage_form: dosageForm } : {}) }
            : m
        );
      }
      // Prepend newly created medicine to the catalog
      const newMed: MedicineOption = {
        medicine_id: medicineId,
        medicine_name: genericName,
        generic_id: genericId,
        generic_name: genericName,
        dosage_form: dosageForm || undefined,
      };
      return [newMed, ...list];
    };

    setAllHospitalMeds((prev) => updateList(prev));
    setPremedMeds((prev) => updateList(prev));
    setChemoMeds((prev) => updateList(prev));
    setSupportiveMeds((prev) => updateList(prev));
    setDilutionMeds((prev) => updateList(prev));
    setDischargeMeds((prev) => updateList(prev));

    // Update in-memory rows across all drawers if they share this medicine or generic_id
    const isMatchingDrug = (medVal?: string) => {
      if (!medVal) return false;
      if (medVal === medicineId) return true;
      if (genericId && genericId !== "GEN_NOT_SPECIFIED") {
        const found = allHospitalMeds.find((m) => m.medicine_id === medVal);
        return found?.generic_id === genericId;
      }
      return false;
    };

    const updateDayMap = <T extends { medication?: string; medicineName?: string; form?: string }>(
      map: Record<number, T[]>
    ): Record<number, T[]> => {
      const updated: Record<number, T[]> = {};
      for (const [day, rows] of Object.entries(map)) {
        updated[Number(day)] = (rows || []).map((row) =>
          isMatchingDrug(row.medication)
            ? {
                ...row,
                medicineName: genericName,
                ...(dosageForm && !row.form ? { form: dosageForm } : {}),
              }
            : row
        );
      }
      return updated;
    };

    setPremedsByDay((prev) => updateDayMap(prev));
    setChemoPlansByDay((prev) => updateDayMap(prev));
    setSupportiveByDay((prev) => updateDayMap(prev));

    setDilution((prev) =>
      (prev || []).map((row) =>
        isMatchingDrug(row.medication)
          ? {
              ...row,
              medicineName: genericName,
              ...(dosageForm && !row.form ? { form: dosageForm } : {}),
            }
          : row
      )
    );

    setPost((prev) =>
      (prev || []).map((row) =>
        isMatchingDrug(row.medication)
          ? {
              ...row,
              medicineName: genericName,
              ...(dosageForm && !row.form ? { form: dosageForm } : {}),
            }
          : row
      )
    );
  };

  const handleDrawerDone = async () => {
    if (!activeDrawer) {
      setActiveDrawer(null);
      return;
    }
    const { section, index } = activeDrawer;
    let currentRow: any = null;
    if (section === "premeds") currentRow = premeds[index];
    else if (section === "chemo") currentRow = chemoPlans[index];
    else if (section === "supportive") currentRow = supportive[index];
    else if (section === "dilution") currentRow = dilution[index];
    else if (section === "post") currentRow = post[index];

    if (currentRow && (currentRow.medication || currentRow.medicineName)) {
      const rawMed = (currentRow.medication || "").trim();
      const editedGeneric = (currentRow.medicineName || rawMed).trim();

      if (rawMed || editedGeneric) {
        try {
          setSavingDrawer(true);
          const res = await chemotherapyApi.catalogMedicineGeneric(
            rawMed,
            editedGeneric,
            { form: currentRow.form, drugRole: activeDrawer.section }
          );

          if (res?.data?.data) {
            const updated = res.data.data;
            updateLocalMedicineCatalog(
              updated.medicine_id,
              updated.generic_id,
              updated.generic_name,
              updated.dosage_form
            );

            // Update current row state with valid medicine_id and generic_name
            const updateRow = (n: any[]) => {
              n[index].medication = updated.medicine_id;
              n[index].medicineName = updated.generic_name;
              if (updated.dosage_form && !n[index].form) {
                n[index].form = updated.dosage_form;
              }
            };

            if (section === "premeds") {
              const n = [...premeds];
              updateRow(n);
              setPremeds(n);
            } else if (section === "chemo") {
              const n = [...chemoPlans];
              updateRow(n);
              setChemoPlans(n);
            } else if (section === "supportive") {
              const n = [...supportive];
              updateRow(n);
              setSupportive(n);
            } else if (section === "dilution") {
              const n = [...dilution];
              updateRow(n);
              setDilution(n);
            } else if (section === "post") {
              const n = [...post];
              updateRow(n);
              setPost(n);
            }

            toast({
              title: "Medicine & Generic Saved",
              description: `"${updated.generic_name}" (Generic ID: ${updated.generic_id}) saved successfully.`,
            });
          }
        } catch (err: any) {
          console.error("Failed to catalog/update generic medicine:", err);
          toast({
            title: "Catalog Update Error",
            description: err?.response?.data?.message || err?.message || "Failed to update generic catalog",
            variant: "destructive",
          });
        } finally {
          setSavingDrawer(false);
        }
      }
    }

    setActiveDrawer(null);
  };

  const loadedItemIdsRef = useRef<string[]>([]);
  const [loadingProtocol, setLoadingProtocol] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  const [sections, setSections] = useState({
    premeds: true,
    chemo: true,
    supportive: true,
    dilution: true,
    post: true,
  });
  const toggleSection = (section: keyof typeof sections) => {
    setSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // Load existing protocol for edit/view
  useEffect(() => {
    if (!protocolId || isCreateMode) return;
    setLoadingProtocol(true);
    chemotherapyApi
      .getRegimenProtocol(protocolId)
      .then((res) => {
        const p: any = (res.data as any)?.data ?? res.data;
        if (!p) return;
        const parsed = parseProtocolPayload(p);
        setRegimenCode(parsed.regimenCode);
        setRegimenName(parsed.regimenName);
        if (p.treatment_intent) {
          setTreatmentIntent(parsed.treatmentIntent);
          setTreatmentIntentOptions((prev) =>
            prev.includes(p.treatment_intent) ? prev : [p.treatment_intent, ...prev]
          );
        } else {
          setTreatmentIntent("");
        }
        setCancerTypeIds(parsed.cancerTypeIds);
        setSubtypeIds(parsed.subtypeIds);
        setStandardCycles(parsed.standardCycles);
        setCycleIntervalDays(parsed.cycleIntervalDays);
        setNotes(parsed.notes);
        setDays(parsed.days);
        loadedItemIdsRef.current = parsed.loadedItemIds;
        if (parsed.itemsData) {
          setPremedsByDay(parsed.itemsData.premedsByDay);
          setChemoPlansByDay(parsed.itemsData.chemoPlansByDay);
          setSupportiveByDay(parsed.itemsData.supportiveByDay);
          setDilution(parsed.itemsData.dilution);
          setPost(parsed.itemsData.post);
        }
      })
      .catch((e: any) => {
        toast({ title: "Failed to load protocol", description: e.response?.data?.message ?? e.message, variant: "destructive" });
      })
      .finally(() => setLoadingProtocol(false));
  }, [protocolId]);

  const isDirty =
    !disabled &&
    (regimenCode.trim() !== "" ||
      regimenName.trim() !== "" ||
      cancerTypeIds.length > 0 ||
      notes.trim() !== "" ||
      days.length > 1 ||
      Object.values(premedsByDay).some((r) => r.some((rd) => rd.medication.trim() !== "")) ||
      Object.values(chemoPlansByDay).some((r) => r.some((rd) => rd.medication.trim() !== "")) ||
      Object.values(supportiveByDay).some((r) => r.some((rd) => rd.medication.trim() !== "")) ||
      dilution.some((r) => r.medication.trim() !== "") ||
      post.some((r) => r.medication.trim() !== ""));

  const handleBack = () => {
    if (isDirty) setShowLeaveConfirm(true);
    else navigate(-1);
  };

  const handleAddDay = () => {
    if (disabled) return;
    const nextNum = days.length + 1;
    setDays([...days, { dayNumber: nextNum }]);
    setPremedsByDay((prev) => ({ ...prev, [nextNum]: [emptyPremed()] }));
    setChemoPlansByDay((prev) => ({ ...prev, [nextNum]: [emptyChemo()] }));
    setSupportiveByDay((prev) => ({ ...prev, [nextNum]: [emptySupportive()] }));
    setActiveDay(nextNum);
  };

  const handleCopyFromDay = (sourceDay: number, targetDay: number) => {
    if (disabled || sourceDay === targetDay) return;

    const srcPremeds = premedsByDay[sourceDay] ?? [];
    const clonedPremeds: Premed[] = srcPremeds.map((p) => ({
      ...p,
      id: "",
      dilutions: (p.dilutions ?? []).map((d) => ({ ...d, dilutionId: "", id: "" })),
    }));

    const srcChemo = chemoPlansByDay[sourceDay] ?? [];
    const clonedChemo: ChemoPlan[] = srcChemo.map((c) => ({
      ...c,
      id: "",
      dilutions: (c.dilutions ?? []).map((d) => ({ ...d, dilutionId: "", id: "" })),
    }));

    const srcSupportive = supportiveByDay[sourceDay] ?? [];
    const clonedSupportive: SupportiveCare[] = srcSupportive.map((s) => ({
      ...s,
      id: "",
      dilutions: (s.dilutions ?? []).map((d) => ({ ...d, dilutionId: "", id: "" })),
    }));

    setPremedsByDay((prev) => ({
      ...prev,
      [targetDay]: clonedPremeds.length > 0 ? clonedPremeds : [emptyPremed()],
    }));
    setChemoPlansByDay((prev) => ({
      ...prev,
      [targetDay]: clonedChemo.length > 0 ? clonedChemo : [emptyChemo()],
    }));
    setSupportiveByDay((prev) => ({
      ...prev,
      [targetDay]: clonedSupportive.length > 0 ? clonedSupportive : [emptySupportive()],
    }));

    setDays((prev) =>
      prev.map((d) => (d.dayNumber === targetDay ? { ...d, sameAsDay: sourceDay } : d))
    );

    toast({
      title: "Medications Copied",
      description: `Copied all medications from Day ${sourceDay} to Day ${targetDay}.`,
    });
  };
  const handleRemoveDay = (dayNumber: number) => {
    if (disabled || days.length === 1) return;
    const filtered = days.filter((d) => d.dayNumber !== dayNumber).map((d, i) => ({ ...d, dayNumber: i + 1 }));
    setDays(filtered);
    const oldNumbers = filtered.map((d) => d.dayNumber);
    const shift = <T,>(map: Record<number, T[]>): Record<number, T[]> =>
      Object.fromEntries(oldNumbers.map((old, i) => [i + 1, map[old] ?? []]));
    setPremedsByDay((prev) => shift(prev));
    setChemoPlansByDay((prev) => shift(prev));
    setSupportiveByDay((prev) => shift(prev));
    if (activeDay === dayNumber) setActiveDay(filtered[0].dayNumber);
    else if (activeDay > dayNumber) setActiveDay(activeDay - 1);
  };

  const handleSave = async () => {
    if (isViewMode) {
      navigate("/protocol");
      return;
    }
    if (!regimenName.trim()) {
      toast({ title: "Missing required field", description: "Protocol Title (Regimen Name / Original Protocol) is required.", variant: "destructive" });
      return;
    }
    if (cancerTypeIds.length === 0) {
      toast({ title: "Missing required field", description: "Please select at least one cancer type.", variant: "destructive" });
      return;
    }
    const items = buildProtocolItems({
      days,
      premedsByDay,
      chemoPlansByDay,
      supportiveByDay,
      premedMeds,
      chemoMeds,
      supportiveMeds,
    });
    if (items.length === 0) {
      toast({ title: "Missing drugs", description: "Add at least one drug with Medication filled.", variant: "destructive" });
      return;
    }
    const dilutions = buildDilutions(dilution, getDilutionMedName);
    const dischargeInstructions = buildDischargeInstructions(post, getPostMedName);
    setIsSubmitting(true);
    try {
      const payload: any = {
        regimen_name: regimenName.trim(),
        original_protocol: regimenName.trim(),
        ...(isEditMode ? { regimen_code: regimenCode.trim() } : {}),
        cancer_type_id: cancerTypeIds[0] || null,
        cancer_type_ids: cancerTypeIds,
        subtype_id: subtypeIds[0] || null,
        subtype_ids: subtypeIds,
        treatment_intent: treatmentIntent.trim() || null,
        standard_cycles: standardCycles || null,
        cycle_interval_days: cycleIntervalDays || null,
        no_of_days: days.length,
        days: days.map((d) => ({
          protocol_day_id: d.protocolDayId || undefined,
          day_number: d.dayNumber,
          same_as_day_one: d.sameAsDay === 1,
        })),
        notes: notes || null,
        items,
        dilutions,
        discharge_instructions: dischargeInstructions,
      };
      let res: any;
      if (isEditMode && protocolId) {
        const headerPayload: any = { ...payload };
        delete headerPayload.items;
        res = await chemotherapyApi.updateRegimenProtocol(protocolId, headerPayload);

        const keptIds = new Set<string>();
        for (const it of items as any[]) {
          const itemPayload: any = { ...it };
          const protocol_item_id: string | undefined = itemPayload.protocol_item_id;
          delete itemPayload.protocol_item_id;
          if (protocol_item_id) {
            keptIds.add(protocol_item_id);
            await chemotherapyApi.updateRegimenProtocolItem(protocolId, protocol_item_id, itemPayload);
          } else {
            await chemotherapyApi.addRegimenProtocolItem(protocolId, itemPayload);
          }
        }
        const removedIds = loadedItemIdsRef.current.filter((id) => !keptIds.has(id));
        for (const id of removedIds) {
          await chemotherapyApi.removeRegimenProtocolItem(protocolId, id);
        }
      } else {
        res = await chemotherapyApi.createRegimenProtocol(payload);
      }
      if ((res.data as any)?.success === false) throw new Error((res.data as any)?.message);
      toast({ title: isEditMode ? "Protocol updated" : "Protocol created", description: `${regimenName} has been ${isEditMode ? "updated" : "saved"} successfully.` });
      navigate("/protocol");
    } catch (error: any) {
      const msg = error.response?.data?.message || error.message || "Failed to save protocol.";
      toast({ title: isEditMode ? "Failed to update protocol" : "Failed to create protocol", description: msg, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const addPremed = () => setPremeds([...premeds, { id: "", medication: "", form: "", dose: "", unit: "", adminNotes: "", remarks: "" }]);
  const removePremed = (idx: number) => setPremeds(premeds.filter((_, i) => i !== idx));
  const addChemoPlan = () =>
    setChemoPlans([...chemoPlans, { id: "", medication: "", form: "", doseCalc: "", dose: "", unit: "", adminNotes: "", toxicity: "", remarks: "" }]);
  const removeChemoPlan = (idx: number) => setChemoPlans(chemoPlans.filter((_, i) => i !== idx));
  const addSupportive = () => setSupportive([...supportive, { id: "", medication: "", form: "", dose: "", unit: "", adminNotes: "", remarks: "" }]);
  const removeSupportive = (idx: number) => setSupportive(supportive.filter((_, i) => i !== idx));
  const addDilution = () => setDilution([...dilution, { dilutionId: "", id: "", medication: "", form: "", dose: "", unit: "", volume: "", volumeUnit: "", diluent: "" }]);
  const removeDilution = (idx: number) => setDilution(dilution.filter((_, i) => i !== idx));
  const addPost = () => setPost([...post, emptyPost()]);
  const removePost = (idx: number) => setPost(post.filter((_, i) => i !== idx));

  const allAvailableDilutionMeds = (() => {
    const map = new Map<string, string>();
    for (const dayNum of Object.keys(premedsByDay)) {
      for (const row of premedsByDay[Number(dayNum)] ?? []) {
        if (row.medication) {
          const label = row.medicineName || getMedName(row.medication, premedMeds);
          map.set(row.medication, label || row.medication);
        }
      }
    }
    for (const dayNum of Object.keys(chemoPlansByDay)) {
      for (const row of chemoPlansByDay[Number(dayNum)] ?? []) {
        if (row.medication) {
          const label = row.medicineName || getMedName(row.medication, chemoMeds);
          map.set(row.medication, label || row.medication);
        }
      }
    }
    for (const dayNum of Object.keys(supportiveByDay)) {
      for (const row of supportiveByDay[Number(dayNum)] ?? []) {
        if (row.medication) {
          const label = row.medicineName || getMedName(row.medication, supportiveMeds);
          map.set(row.medication, label || row.medication);
        }
      }
    }
    // Also include any dilution rows already configured on the current protocol
    for (const row of dilution) {
      if (row.medication && !map.has(row.medication)) {
        const found =
          dilutionMeds.find((m) => m.medicine_id === row.medication) ||
          chemoMeds.find((m) => m.medicine_id === row.medication) ||
          premedMeds.find((m) => m.medicine_id === row.medication) ||
          supportiveMeds.find((m) => m.medicine_id === row.medication);
        const label = row.medicineName || found?.medicine_name || row.medication;
        map.set(row.medication, label);
      }
    }
    return stripOthersOpts(
      Array.from(map.entries())
        .map(([value, label]) => ({ label, value }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    );
  })();

  const getDilutionMedName = (medId?: string) => {
    if (!medId) return "";
    const found = allAvailableDilutionMeds.find((m) => m.value === medId);
    if (found) return found.label;
    const inCatalog =
      chemoMeds.find((m) => m.medicine_id === medId) ||
      dilutionMeds.find((m) => m.medicine_id === medId) ||
      premedMeds.find((m) => m.medicine_id === medId);
    if (inCatalog) return inCatalog.generic_name || inCatalog.medicine_name;
    const inDilutionRows = dilution.find((d) => d.medication === medId);
    return inDilutionRows?.medicineName || medId;
  };

  const getPostMedName = (medId?: string) => {
    if (!medId) return "";
    const medList = [...dischargeMeds, ...premedMeds, ...chemoMeds];
    const found = medList.find((m) => m.medicine_id === medId);
    if (found) return found.generic_name || found.medicine_name;
    const inPostRows = post.find((p) => p.medication === medId);
    return inPostRows?.medicineName || medId;
  };

  const selectedCancerTypeName = cancerTypes
    .filter((c) => cancerTypeIds.includes(c.cancer_type_id))
    .map((c) => c.cancer_type)
    .join(", ") || "—";
  const pageTitle = isViewMode ? "View Protocol" : isEditMode ? "Edit Protocol" : "Create Protocol";
  const pageSubtitle = isViewMode
    ? "View chemotherapy regimen details (read-only)."
    : isEditMode
      ? "Update the existing regimen. Changes will be saved to the same protocol."
      : "Define a new chemotherapy regimen template. All drugs below will be saved as protocol items.";
  const saveLabel = isViewMode ? "Back to Protocols" : isEditMode ? "Update protocol" : "Save protocol";

  if (loadingProtocol) {
    return (
      <div className="min-h-screen bg-[#f4f6f9] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#12335c]" />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-[#f4f6f9] w-full"
      style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}
    >
      <div className="max-w-[1400px] mx-auto w-full px-10 pt-7 pb-16">
        {/* Top Header */}
        <div className="flex justify-between items-start gap-4 mb-[22px] w-full">
          <div className="flex gap-3.5 items-start">
            <button
              onClick={handleBack}
              className="w-[38px] h-[38px] shrink-0 flex items-center justify-center rounded-[11px] border border-transparent hover:bg-white hover:border-[#e1e7ee] text-[#5b6b7c] hover:text-[#12335c] transition-colors mt-0.5"
              aria-label="Go back"
            >
              <ArrowLeft className="w-[19px] h-[19px]" />
            </button>
            <div>
              <h1 className="text-[23px] font-extrabold text-[#17212e] m-0 tracking-[-0.01em]">{pageTitle}</h1>
              <p className="text-[#5b6b7c] text-[13.5px] mt-[5px] max-w-[46ch]">{pageSubtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={isSubmitting}
              className="bg-[#12335c] text-white border-none rounded-xl px-[22px] py-3 text-[13.5px] font-semibold flex items-center gap-2 shadow-[0_1px_2px_rgba(18,51,92,0.15)] hover:bg-[#0e2848] transition-colors disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving...
                </>
              ) : isViewMode ? (
                <>
                  <Eye className="h-4 w-4" /> {saveLabel}
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" /> {saveLabel}
                </>
              )}
            </button>
          </div>
        </div>

        {/* Info Bar - dynamic */}
        <div className="bg-white border border-[#e1e7ee] rounded-2xl px-[26px] py-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-5 w-full">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-[38px] h-[38px] rounded-[11px] bg-[#eaf0f7] flex items-center justify-center text-[#12335c] shrink-0">
              <Pill className="w-[17px] h-[17px]" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-[#17212e] leading-tight truncate">{regimenName || "New Protocol"}</div>
              <div className="text-xs text-[#8a97a6] mt-0.5">Regimen: {regimenCode || "—"}</div>
            </div>
          </div>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-[38px] h-[38px] rounded-[11px] bg-[#eaf0f7] flex items-center justify-center text-[#12335c] shrink-0">
              <ClipboardList className="w-[17px] h-[17px]" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-[#17212e] leading-tight truncate">{selectedCancerTypeName}</div>
              <div className="text-xs text-[#8a97a6] mt-0.5">Cancer Type</div>
            </div>
          </div>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-[38px] h-[38px] rounded-[11px] bg-[#eaf0f7] flex items-center justify-center text-[#12335c] shrink-0">
              <Syringe className="w-[17px] h-[17px]" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-[#17212e] leading-tight truncate">
                {standardCycles} cycle{standardCycles !== 1 ? "s" : ""} × {cycleIntervalDays} Days
              </div>
              <div className="text-xs text-[#8a97a6] mt-0.5">Regimen Schedule</div>
            </div>
          </div>
        </div>

        <div className="w-full">
          <div className="flex gap-5 items-start w-full mb-5">
            <div className="flex-1 min-w-0">
              {/* Top form card */}
              <div className={cardCls + " mb-5"}>
                <div className="px-[26px] py-6 w-full">
                  <div className="border-b border-[#edf1f5] pb-5 mb-[22px] w-full">
                    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <label className={labelCls + " mb-0"}>Protocol Days</label>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#f1f5f9] text-[#64748b]">
                          {days.length} day{days.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                      {activeDay > 1 && days.length > 1 && !disabled && (
                        <div className="flex items-center gap-2 bg-[#f8fafc] border border-[#dde4ec] rounded-lg px-2.5 py-1">
                          <Copy className="w-3.5 h-3.5 text-[#12335c]" />
                          <span className="text-xs font-semibold text-[#5b6b7c]">Same as:</span>
                          <select
                            value={days.find((d) => d.dayNumber === activeDay)?.sameAsDay ?? ""}
                            onChange={(e) => {
                              const src = Number(e.target.value);
                              if (src) handleCopyFromDay(src, activeDay);
                            }}
                            className="text-xs bg-white border border-[#c7d2dd] rounded-md px-2 py-0.5 text-[#12335c] font-semibold focus:outline-none focus:ring-1 focus:ring-[#12335c] cursor-pointer"
                          >
                            <option value="" disabled>Select day...</option>
                            {days
                              .filter((d) => d.dayNumber !== activeDay)
                              .map((d) => (
                                <option key={d.dayNumber} value={d.dayNumber}>
                                  Day {d.dayNumber}
                                </option>
                              ))}
                          </select>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      {days.map((d) => {
                        const isActive = d.dayNumber === activeDay;
                        return (
                          <div key={d.dayNumber} className="relative group">
                            {days.length > 1 && !disabled && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveDay(d.dayNumber);
                                }}
                                title={`Remove Day ${d.dayNumber}`}
                                aria-label={`Remove Day ${d.dayNumber}`}
                                className="absolute -top-1.5 -right-1.5 z-10 w-4 h-4 rounded-full bg-white border border-[#e3e8ee] shadow-xs flex items-center justify-center text-[#c0374a] text-[11px] leading-none opacity-0 group-hover:opacity-100 hover:bg-[#c0374a] hover:border-[#c0374a] hover:text-white hover:scale-110 transition-all duration-150"
                              >
                                ×
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setActiveDay(d.dayNumber)}
                              className={`w-[74px] h-[44px] flex flex-col items-center justify-center rounded-xl border transition-all duration-200 ${
                                isActive
                                  ? "border-[#12335c] bg-gradient-to-b from-[#1c4a80] to-[#12335c] text-white shadow-sm shadow-[#12335c]/25"
                                  : "border-[#e3e8ee] bg-white text-[#1b2530] hover:border-[#9db4cc] hover:bg-[#f8fafc] hover:-translate-y-0.5"
                              }`}
                            >
                              <span
                                className={`text-[9px] font-bold uppercase tracking-[0.14em] leading-none ${
                                  isActive ? "text-blue-100/80" : "text-[#8a97a6]"
                                }`}
                              >
                                Day
                              </span>
                              <span
                                className={`mt-0.5 text-[17px] font-extrabold leading-tight ${
                                  isActive ? "text-white" : "text-[#1b2530]"
                                }`}
                              >
                                {d.dayNumber}
                              </span>
                            </button>
                          </div>
                        );
                      })}
                      {!disabled && (
                        <button
                          type="button"
                          onClick={handleAddDay}
                          className="h-[44px] px-3.5 rounded-xl border border-dashed border-[#9db4cc] text-[#12335c] bg-[#f8fafc] hover:bg-[#eef2f6] hover:border-[#12335c] transition-all duration-200 flex items-center justify-center gap-1.5 font-bold text-xs"
                          title="Add next protocol day"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add Day</span>
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 w-full">
                    <div className="lg:col-span-1">
                      <label className={labelCls}>
                        Protocol Title (Regimen Name / Original Protocol) <Req />
                      </label>
                      <input
                        type="text"
                        value={regimenName}
                        onChange={(e) => setRegimenName(e.target.value)}
                        className={inputCls}
                        placeholder="e.g. Carboplatin AUC 5 - Original Protocol"
                        disabled={disabled}
                      />
                      <p className="text-[11px] text-[#8a97a6] mt-1">DB: regimen_name / original_protocol</p>
                    </div>
                    {(isEditMode || isViewMode) && (
                      <div>
                        <label className={labelCls}>
                          Regime Name (Regimen Code)
                        </label>
                        <input
                          type="text"
                          value={regimenCode}
                          onChange={(e) => setRegimenCode(e.target.value)}
                          className={inputCls}
                          placeholder="e.g. CARBO-AUC5"
                          disabled={disabled || isEditMode}
                        />
                        <p className="text-[11px] text-[#8a97a6] mt-1">DB: regimen_code / auto = protocol_id</p>
                      </div>
                    )}
                    <div>
                      <label className={labelCls}>
                        Cancer Type(s) <Req />
                      </label>
                      <ProtocolMultiSelect
                        options={cancerTypes.map((c) => ({ label: c.cancer_type, value: c.cancer_type_id }))}
                        values={cancerTypeIds}
                        onValuesChange={setCancerTypeIds}
                        placeholder={loadingCancerTypes ? "Loading..." : "Select cancer type(s)"}
                        disabled={disabled || loadingCancerTypes}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Cancer Subtype(s)</label>
                      <ProtocolMultiSelect
                        options={subtypes.map((s) => ({ label: s.subtype_name, value: s.subtype_id, group: s.group }))}
                        values={subtypeIds}
                        onValuesChange={setSubtypeIds}
                        placeholder={cancerTypeIds.length === 0 ? "Select cancer type(s) first" : loadingSubtypes ? "Loading subtypes..." : subtypes.length ? "Select subtype(s)" : "No subtypes"}
                        disabled={disabled || cancerTypeIds.length === 0 || loadingSubtypes || subtypes.length === 0}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Treatment Plan</label>
                      <ProtocolSelect
                        options={treatmentIntentOptions.map((t) => ({ label: t, value: t }))}
                        value={treatmentIntent}
                        onValueChange={setTreatmentIntent}
                        placeholder={loadingTreatmentIntents ? "Loading..." : "Select treatment plan"}
                        emptyMessage="No treatment plans found"
                        disabled={disabled}
                        loading={loadingTreatmentIntents}
                      />
                      <p className="text-[11px] text-[#8a97a6] mt-1">DB: treatment_intent</p>
                    </div>
                    <div>
                      <label className={labelCls}>Standard Cycles</label>
                      <div className="flex items-center border border-[#dde4ec] rounded-[11px] overflow-hidden h-10 bg-[#f8fafc]">
                        <button
                          type="button"
                          onClick={() => !disabled && setStandardCycles(Math.max(1, standardCycles - 1))}
                          className="bg-[#fafbfc] w-10 h-full text-base text-[#5b6b7c] hover:bg-[#eef2f6] transition-colors disabled:opacity-50"
                          disabled={disabled}
                        >
                          −
                        </button>
                        <div className="flex-1 text-center text-sm font-semibold">{standardCycles}</div>
                        <button
                          type="button"
                          onClick={() => !disabled && setStandardCycles(standardCycles + 1)}
                          className="bg-[#fafbfc] w-10 h-full text-base text-[#5b6b7c] hover:bg-[#eef2f6] transition-colors disabled:opacity-50"
                          disabled={disabled}
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>Cycle Interval (days)</label>
                      <div className="flex items-center border border-[#dde4ec] rounded-[11px] overflow-hidden h-10 bg-[#f8fafc]">
                        <button
                          type="button"
                          onClick={() => !disabled && setCycleIntervalDays(Math.max(1, cycleIntervalDays - 1))}
                          className="bg-[#fafbfc] w-10 h-full text-base text-[#5b6b7c] hover:bg-[#eef2f6] transition-colors disabled:opacity-50"
                          disabled={disabled}
                        >
                          −
                        </button>
                        <div className="flex-1 text-center text-sm font-semibold">{cycleIntervalDays}</div>
                        <button
                          type="button"
                          onClick={() => !disabled && setCycleIntervalDays(cycleIntervalDays + 1)}
                          className="bg-[#fafbfc] w-10 h-full text-base text-[#5b6b7c] hover:bg-[#eef2f6] transition-colors disabled:opacity-50"
                          disabled={disabled}
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div className="lg:col-span-3">
                      <label className={labelCls}>Notes / Guideline Source</label>
                      <input
                        type="text"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className={inputCls}
                        placeholder="e.g. NCCN 2024, optional"
                        disabled={disabled}
                      />
                    </div>

                    <div className="lg:col-span-3 flex flex-wrap items-center justify-between gap-2 pt-3 mt-1 border-t border-[#edf1f5] text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#5b6b7c]">Medicine Scope:</span>
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${
                          filterByCancerAndSubtype
                            ? "bg-[#eaf0f7] text-[#12335c] border border-[#d2dfef]"
                            : "bg-[#fef3c7] text-[#92400e] border border-[#fde68a]"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${filterByCancerAndSubtype ? "bg-[#12335c]" : "bg-[#d97706]"}`} />
                          {filterByCancerAndSubtype
                            ? "Filtered by Clinical Role (Premeds / Primary Chemo / Supportive)"
                            : `Showing ALL hospital medicines (${allHospitalMeds.length || "catalog"})`}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => !disabled && setFilterByCancerAndSubtype(!filterByCancerAndSubtype)}
                        disabled={disabled || loadingAllMeds}
                        className="text-xs font-medium text-[#12335c] hover:underline"
                      >
                        {loadingAllMeds ? (
                          <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Loading all medicines...</span>
                        ) : filterByCancerAndSubtype ? (
                          "Need an uncatalogued drug? Show all hospital medicines"
                        ) : (
                          "← Switch back to Role-filtered medicines"
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right sidebar */}
            <div className="w-[280px] shrink-0">
              <div className={cardCls + " sticky top-5"}>
                <div className="bg-[#eaf0f7] px-6 py-5 flex justify-between items-start">
                  <div className="text-[15px] font-extrabold leading-[1.3] text-[#12335c]">
                    PROTOCOL
                    <br />
                    SUMMARY
                  </div>
                  <ClipboardList className="w-[18px] h-[18px] text-[#12335c] shrink-0" />
                </div>
                <div className="px-6 pt-1 pb-5">
                  <div className="py-4 border-b border-[#e3e8ee]">
                    <div className="text-[10.5px] font-bold tracking-wide text-[#8a97a6] mb-1.5">REGIMEN CODE</div>
                    <div className="text-sm font-bold text-[#1b2530] truncate">{regimenCode || "—"}</div>
                  </div>
                  <div className="py-4 border-b border-[#e3e8ee]">
                    <div className="text-[10.5px] font-bold tracking-wide text-[#8a97a6] mb-1.5">PROTOCOL NAME</div>
                    <div className="text-sm font-bold text-[#1b2530] leading-tight">{regimenName || "—"}</div>
                  </div>
                  <div className="py-4 border-b border-[#e3e8ee]">
                    <div className="text-[10.5px] font-bold tracking-wide text-[#8a97a6] mb-1.5">CANCER TYPE</div>
                    <div className="text-sm font-bold text-[#1b2530]">{selectedCancerTypeName}</div>
                  </div>
                  <div className="py-4 border-b border-[#e3e8ee]">
                    <div className="text-[10.5px] font-bold tracking-wide text-[#8a97a6] mb-1.5">TREATMENT PLAN</div>
                    <div className="text-sm font-bold text-[#1b2530] truncate">{treatmentIntent || "—"}</div>
                  </div>
                  <div className="py-4 border-b border-[#e3e8ee]">
                    <div className="text-[10.5px] font-bold tracking-wide text-[#8a97a6] mb-1.5">CYCLE SCHEDULE</div>
                    <div className="text-sm font-bold text-[#1b2530]">
                      {standardCycles} cycle{standardCycles !== 1 ? "s" : ""} × {cycleIntervalDays} days
                    </div>
                  </div>
                  <div className="py-4 border-b border-[#e3e8ee]">
                    <div className="text-[10.5px] font-bold tracking-wide text-[#8a97a6] mb-1.5">PROTOCOL DAYS</div>
                    <div className="text-sm font-bold text-[#1b2530]">{days.length} day{days.length !== 1 ? "s" : ""}</div>
                  </div>
                  <div className="py-4">
                    <div className="text-[10.5px] font-bold tracking-wide text-[#8a97a6] mb-1.5">TOTAL DRUGS</div>
                    <div className="text-sm font-bold text-[#1b2530]">
                      {[...premeds, ...chemoPlans, ...supportive, ...dilution, ...post, ...days.flatMap((d) => (d.dayNumber === activeDay ? [] : [...(premedsByDay[d.dayNumber] ?? []), ...(chemoPlansByDay[d.dayNumber] ?? []), ...(supportiveByDay[d.dayNumber] ?? [])]))].filter((r: any) => (r.medication || r.item)?.trim()).length} item(s)
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* =========================================================================
              PATTERN 5: SLIDE DRAWER GRID - PRE-MEDICATIONS
             ========================================================================= */}
          <PremedSection
            rows={premeds}
            expanded={sections.premeds}
            onToggle={() => toggleSection("premeds")}
            disabled={disabled}
            onOpenRow={(index) => setActiveDrawer({ section: "premeds", index })}
            onAdd={() => {
              const newIdx = premeds.length;
              addPremed();
              setActiveDrawer({ section: "premeds", index: newIdx });
            }}
            onDelete={removePremed}
            resolveName={(row) => row.medicineName || getMedName(row.medication, premedMeds)}
          />

          {/* =========================================================================
              PATTERN 5: SLIDE DRAWER GRID - CHEMOTHERAPY PLAN
             ========================================================================= */}
          <ChemoPlanSection
            rows={chemoPlans}
            expanded={sections.chemo}
            onToggle={() => toggleSection("chemo")}
            disabled={disabled}
            onOpenRow={(index) => setActiveDrawer({ section: "chemo", index })}
            onAdd={() => {
              const newIdx = chemoPlans.length;
              addChemoPlan();
              setActiveDrawer({ section: "chemo", index: newIdx });
            }}
            onDelete={removeChemoPlan}
            resolveName={(row) => row.medicineName || getMedName(row.medication, chemoMeds)}
          />

          {/* =========================================================================
              PATTERN 5: SLIDE DRAWER GRID - SUPPORTIVE CARE
             ========================================================================= */}
          <SupportiveSection
            rows={supportive}
            expanded={sections.supportive}
            onToggle={() => toggleSection("supportive")}
            disabled={disabled}
            onOpenRow={(index) => setActiveDrawer({ section: "supportive", index })}
            onAdd={() => {
              const newIdx = supportive.length;
              addSupportive();
              setActiveDrawer({ section: "supportive", index: newIdx });
            }}
            onDelete={removeSupportive}
            resolveName={(row) => row.medicineName || getMedName(row.medication, supportiveMeds)}
          />

          {/* =========================================================================
              PATTERN 5: SLIDE DRAWER GRID - DILUTION DETAILS
             ========================================================================= */}
          <DilutionSection
            rows={dilution}
            expanded={sections.dilution}
            onToggle={() => toggleSection("dilution")}
            disabled={disabled}
            onOpenRow={(index) => setActiveDrawer({ section: "dilution", index })}
            onAdd={() => {
              const newIdx = dilution.length;
              addDilution();
              setActiveDrawer({ section: "dilution", index: newIdx });
            }}
            onDelete={removeDilution}
            resolveName={(row) => row.medicineName || getDilutionMedName(row.medication)}
          />

          {/* =========================================================================
              PATTERN 5: SLIDE DRAWER GRID - POST-TREATMENT (ON DISCHARGE)
             ========================================================================= */}
          <PostTreatmentSection
            rows={post}
            expanded={sections.post}
            onToggle={() => toggleSection("post")}
            disabled={disabled}
            onOpenRow={(index) => setActiveDrawer({ section: "post", index })}
            onAdd={() => {
              const newIdx = post.length;
              addPost();
              setActiveDrawer({ section: "post", index: newIdx });
            }}
            onDelete={removePost}
            resolveName={(row) => row.medicineName || getPostMedName(row.medication)}
          />
        </div>
      </div>

      <ConfirmationDialog
        open={showLeaveConfirm}
        title="Leave without saving?"
        description="You have unsaved changes. Are you sure you want to leave? Your changes will be lost."
        type="warning"
        confirmText="Leave"
        cancelText="Stay"
        onConfirm={() => {
          setShowLeaveConfirm(false);
          navigate(-1);
        }}
        onCancel={() => setShowLeaveConfirm(false)}
      />

      <ProtocolDrawer
        activeDrawer={activeDrawer}
        setActiveDrawer={setActiveDrawer}
        disabled={disabled}
        premeds={premeds}
        setPremeds={setPremeds}
        chemoPlans={chemoPlans}
        setChemoPlans={setChemoPlans}
        supportive={supportive}
        setSupportive={setSupportive}
        dilution={dilution}
        setDilution={setDilution}
        post={post}
        setPost={setPost}
        premedMeds={premedMeds}
        chemoMeds={chemoMeds}
        supportiveMeds={supportiveMeds}
        dilutionMeds={dilutionMeds}
        dischargeMeds={dischargeMeds}
        loadingPremedMeds={loadingPremedMeds}
        loadingChemoMeds={loadingChemoMeds}
        loadingSupportiveMeds={loadingSupportiveMeds}
        loadingDilutionMeds={loadingDilutionMeds}
        loadingDischargeMeds={loadingDischargeMeds}
        fieldOptions={fieldOptions}
        genericCatalog={genericCatalog}
        getMedName={getMedName}
        getDilutionMedName={getDilutionMedName}
        getPostMedName={getPostMedName}
        allAvailableDilutionMeds={allAvailableDilutionMeds}
        savingDrawer={savingDrawer}
        onDone={handleDrawerDone}
        onDelete={handleDeleteFromDrawer}
        getActiveSectionItemsCount={getActiveSectionItemsCount}
      />
    </div>
  );
}
