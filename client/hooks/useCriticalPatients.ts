import { useState, useEffect, useCallback } from "react";
import { encounterApi, type EncounterRecord } from "@/api/encounter.api";
import { patientApi } from "@/api/patient.api";
import type { CriticalInfo } from "@/components/hms/CriticalPatientIndicator";

interface PatientAgeData {
  patientId: string;
  age?: number | null;
  dob?: string | null;
}

function computeAge(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

function checkAbnormalVitals(enc: EncounterRecord): string[] {
  const reasons: string[] = [];
  if (enc.pain_score != null) {
    const ps = Number(enc.pain_score);
    if (ps >= 7) reasons.push(`Pain Score: ${ps}/10`);
  }
  if (enc.systolic_bp != null && enc.diastolic_bp != null) {
    const sys = Number(enc.systolic_bp);
    const dia = Number(enc.diastolic_bp);
    if (sys > 180 || dia > 120) reasons.push(`High BP: ${sys}/${dia}`);
    else if (sys < 90 || dia < 60) reasons.push(`Low BP: ${sys}/${dia}`);
  }
  if (enc.spo2 != null) {
    const spo2 = Number(enc.spo2);
    if (spo2 < 90) reasons.push(`SpO2: ${spo2}%`);
  }
  if (enc.temperature != null) {
    const temp = Number(enc.temperature);
    if (temp > 39.5) reasons.push(`Temp: ${temp}\u00B0F`);
  }
  if (enc.pulse != null) {
    const pulse = Number(enc.pulse);
    if (pulse > 120 || pulse < 40) reasons.push(`Pulse: ${pulse} bpm`);
  }
  return reasons;
}

function checkClinicalStatus(enc: EncounterRecord): string[] {
  const reasons: string[] = [];
  const notes = (enc.clinical_notes || "").toLowerCase();
  if (
    notes.includes("not doing well") ||
    notes.includes("critical") ||
    notes.includes("deteriorating") ||
    notes.includes("urgent")
  ) {
    reasons.push("Clinical Status: Not Doing Well");
  }
  return reasons;
}

// Shared in-memory cache across component mounts (5-minute TTL)
const globalEncounterCache: Record<string, { data: EncounterRecord | null; timestamp: number }> = {};
const globalDobCache: Record<string, { dob: string | null; timestamp: number }> = {};
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function useCriticalPatients(
  patientAgeData: PatientAgeData[],
  enabled = true
) {
  const [encounterCache, setEncounterCache] = useState<
    Record<string, EncounterRecord>
  >(() => {
    const initial: Record<string, EncounterRecord> = {};
    const now = Date.now();
    for (const [id, entry] of Object.entries(globalEncounterCache)) {
      if (now - entry.timestamp < CACHE_TTL_MS && entry.data) {
        initial[id] = entry.data;
      }
    }
    return initial;
  });

  const [dobCache, setDobCache] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    const now = Date.now();
    for (const [id, entry] of Object.entries(globalDobCache)) {
      if (now - entry.timestamp < CACHE_TTL_MS && entry.dob) {
        initial[id] = entry.dob;
      }
    }
    return initial;
  });

  const patientIds = patientAgeData.map((p) => p.patientId);
  const key = [...patientIds].sort().join(",");

  const fetchEncounters = useCallback(async () => {
    if (!enabled || patientAgeData.length === 0) return;

    const now = Date.now();
    const toFetch = patientAgeData.filter((p) => {
      const cached = globalEncounterCache[p.patientId];
      return !cached || now - cached.timestamp >= CACHE_TTL_MS;
    });
    if (toFetch.length === 0) return;

    const results = await Promise.allSettled(
      toFetch.map(async (p) => {
        try {
          const res = await encounterApi.getLatest(p.patientId, 1);
          const enc = res.data?.data?.encounters?.[0] || null;
          return { patientId: p.patientId, encounter: enc };
        } catch {
          return { patientId: p.patientId, encounter: null };
        }
      })
    );

    const nowFulfilled = Date.now();
    const newEntries: Record<string, EncounterRecord> = {};
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        globalEncounterCache[r.value.patientId] = {
          data: r.value.encounter,
          timestamp: nowFulfilled,
        };
        if (r.value.encounter) {
          newEntries[r.value.patientId] = r.value.encounter;
        }
      }
    }

    if (Object.keys(newEntries).length > 0) {
      setEncounterCache((prev) => ({ ...prev, ...newEntries }));
    }
  }, [key, enabled, patientAgeData]);

  useEffect(() => {
    fetchEncounters();
  }, [fetchEncounters]);

  const fetchMissingDobs = useCallback(async () => {
    if (!enabled || patientAgeData.length === 0) return;

    const now = Date.now();
    const needDob = patientAgeData.filter((p) => {
      if (p.age != null || p.dob) return false;
      const cached = globalDobCache[p.patientId];
      return !cached || now - cached.timestamp >= CACHE_TTL_MS;
    });
    if (needDob.length === 0) return;

    const results = await Promise.allSettled(
      needDob.map(async (p) => {
        try {
          const res = await patientApi.getById(p.patientId);
          const patient = res.data?.data;
          return { patientId: p.patientId, dob: patient?.patient_dob || null };
        } catch {
          return { patientId: p.patientId, dob: null };
        }
      })
    );

    const nowFulfilled = Date.now();
    const newDobs: Record<string, string> = {};
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        globalDobCache[r.value.patientId] = {
          dob: r.value.dob,
          timestamp: nowFulfilled,
        };
        if (r.value.dob) {
          newDobs[r.value.patientId] = r.value.dob;
        }
      }
    }

    if (Object.keys(newDobs).length > 0) {
      setDobCache((prev) => ({ ...prev, ...newDobs }));
    }
  }, [key, enabled, patientAgeData]);

  useEffect(() => {
    fetchMissingDobs();
  }, [fetchMissingDobs]);

  const getCriticalInfo = useCallback(
    (patientId: string): CriticalInfo => {
      const reasons: string[] = [];

      const ageData = patientAgeData.find((p) => p.patientId === patientId);
      let resolvedDob = ageData?.dob ?? dobCache[patientId] ?? null;
      const age =
        ageData?.age ??
        (resolvedDob ? computeAge(resolvedDob) : null);

      if (age != null) {
        if (age < 18) reasons.push(`Age < 18 (Pediatric)`);
        if (age > 75) reasons.push(`Age > 75 (Elderly)`);
      }

      const enc = encounterCache[patientId];
      if (enc) {
        reasons.push(...checkAbnormalVitals(enc));
        reasons.push(...checkClinicalStatus(enc));
      }

      return { isCritical: reasons.length > 0, reasons };
    },
    [patientAgeData, encounterCache, dobCache]
  );

  return { getCriticalInfo, refetch: fetchEncounters };
}
