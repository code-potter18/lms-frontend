import React, { useEffect, useState } from "react";
import { ipdApi, type AdmissionRecord, type DischargeTypeRecord } from "../../../api/ipd.api";
import { EncounterDocuments } from "@/components/hms/EncounterDocuments";

/*
 * History tab: this patient's inpatient stays -- discharged ones, plus a
 * still-admitted stay whose details the doctor already saved (marked
 * "Pending discharge" until an admin confirms) -- with everything
 * the doctor entered in the Discharge Medication step. Dates are the ones
 * the server stamped (admit time, discharge time, details saved time) --
 * nothing here is entered by hand. Attachments are the stay's own
 * (encounter-scoped) documents.
 */
const fmtDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

const fmtDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const label = (value?: string | null) =>
  value ? value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : "—";

export const InpatientDischargeHistory: React.FC<{ patientId: string }> = ({ patientId }) => {
  const [stays, setStays] = useState<AdmissionRecord[]>([]);
  const [dischargeTypes, setDischargeTypes] = useState<DischargeTypeRecord[]>([]);

  useEffect(() => {
    ipdApi
      .listDischargeTypes()
      .then((res) => setDischargeTypes(res.data?.data || []))
      .catch(() => { /* labels fall back to the stored code */ });
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!patientId) {
      setStays([]);
      return;
    }
    Promise.all([
      ipdApi.getAll({ patientId, status: "ADMITTED", limit: 5 }),
      ipdApi.getAll({ patientId, status: "DISCHARGED", limit: 50, sortField: "admission_date", sortDirection: "desc" }),
    ])
      .then(([admittedRes, dischargedRes]) => {
        if (cancelled) return;
        const pending = (admittedRes.data?.data?.admissions ?? []).filter((a) => a.discharge_details_at);
        setStays([...pending, ...(dischargedRes.data?.data?.admissions ?? [])]);
      })
      .catch((error) => {
        console.warn("Inpatient discharge history failed:", error);
        if (!cancelled) setStays([]);
      });
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  if (stays.length === 0) return null;

  /* Styled like the other sections of the consultation Summary card. */
  return (
    <section>
      <h3 className="mb-4 text-lg font-medium text-indigo-900">Inpatient Discharge</h3>

      <div className="flex flex-col gap-8">
        {stays.map((stay) => {
          const doctor = [stay.employees?.first_name, stay.employees?.last_name].filter(Boolean).join(" ");
          const cells: [string, string][] = [
            ["IP Number", stay.ip_number],
            ["Admitted", fmtDateTime(stay.admission_date)],
            ["Discharged", stay.status === "ADMITTED" ? "Pending discharge" : fmtDateTime(stay.discharge_date)],
            ["Ward / Bed", [stay.ward_master?.ward_name, stay.bed_master?.bed_number].filter(Boolean).join(" / ") || "—"],
            ["Treating Doctor", doctor ? `Dr. ${doctor}` : "—"],
            ["Discharge Type", dischargeTypes.find((t) => t.type_code === stay.discharge_type)?.type_name ?? label(stay.discharge_type)],
            ["Patient Status", label(stay.patient_status_at_discharge)],
            ["Disease Status", stay.discharge_disease_status || "—"],
            ["Next Visit Date", fmtDate(stay.review_date)],
          ];
          return (
            <div key={stay.admission_id}>
              <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
                {cells.map(([k, v]) => (
                  <div key={k}>
                    <p className="mb-2 font-medium text-slate-900">{k}</p>
                    <p className="text-sm text-slate-500">{v}</p>
                  </div>
                ))}
                <div>
                  <p className="mb-2 font-medium text-slate-900">Discharge Summary</p>
                  <p className="whitespace-pre-wrap text-sm text-slate-500">{stay.discharge_summary || "Not recorded"}</p>
                </div>
                <div>
                  <p className="mb-2 font-medium text-slate-900">Discharge Advice</p>
                  <p className="whitespace-pre-wrap text-sm text-slate-500">{stay.discharge_advice || "Not recorded"}</p>
                </div>
              </div>
              <EncounterDocuments encounterNo={stay.encounter_no} patientId={stay.patient_id} readOnly title="Attachments" />
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default InpatientDischargeHistory;
