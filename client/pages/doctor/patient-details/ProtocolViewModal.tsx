import { useCallback, useEffect, useState } from "react";
import { chemotherapyApi, type RegimenProtocol, type RegimenProtocolItem } from "@/api/chemotherapy.api";
import { DetailTable, InfoGrid, ModalButton, ModalLoadState, ModalSection, ModalShell } from "./ModalShell";
import { doseText } from "./adminFormat";

const ROLE_SECTIONS: { role: string; title: string; icon: string }[] = [
  { role: "PREMEDICATION",  title: "Pre-Medications",        icon: "fa-prescription-bottle-medical" },
  { role: "PRIMARY",        title: "Chemotherapy Drugs",     icon: "fa-syringe" },
  { role: "SUPPORTIVE",     title: "Supportive Medications", icon: "fa-plus-circle" },
  { role: "POSTMEDICATION", title: "Post-Medications",       icon: "fa-pills" },
];

const itemName = (item: RegimenProtocolItem) =>
  item.medicine_master?.medicine_name || item.drug_brand_name || "—";

const infusion = (item: RegimenProtocolItem) =>
  [item.infusion_type, item.infusion_duration_minutes ? `${item.infusion_duration_minutes} min` : ""]
    .filter(Boolean)
    .join(" · ") || "—";

const dayOf = (item: RegimenProtocolItem) => {
  const day = item.administration_day ?? item.cycle_day;
  return day ? `Day ${day}` : "—";
};

/* "View Protocol" of the Administration tab: the regimen protocol the
   plan was built from, read-only. */
export default function ProtocolViewModal({
  protocolId,
  cycleIntervalDays,
  onClose,
}: {
  protocolId: string;
  /* The plan's own interval (it can differ from the protocol's). */
  cycleIntervalDays?: number | null;
  onClose: () => void;
}) {
  const [protocol, setProtocol] = useState<RegimenProtocol | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    chemotherapyApi
      .getRegimenProtocol(protocolId)
      .then(response => { if (!cancelled) setProtocol(response.data.data); })
      .catch((err: any) => {
        if (!cancelled) {
          setError(
            err?.response?.status === 403
              ? "You don't have access to protocol details."
              : err?.response?.data?.message || "Failed to load the protocol."
          );
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [protocolId]);

  useEffect(() => load(), [load]);

  const items = protocol?.chemotherapy_regimen_protocol_items ?? [];
  const cancers = (protocol?.chemotherapy_protocol_cancers ?? [])
    .map(link => [link.cancer_types?.cancer_type, link.cancer_subtypes?.subtype_name].filter(Boolean).join(" - "))
    .filter(Boolean);
  const cancerText = cancers.length
    ? cancers.join(", ")
    : [protocol?.cancer_types?.cancer_type, protocol?.cancer_subtypes?.subtype_name].filter(Boolean).join(" - ");

  return (
    <ModalShell
      icon="fa-file-medical"
      tone="blue"
      title="View Protocol"
      subtitle={protocol ? <span className="font-semibold text-blue-700">{protocol.regimen_name}</span> : "Treatment protocol of this plan"}
      maxWidth="max-w-4xl"
      onClose={onClose}
      footer={
        <div className="flex justify-end">
          <ModalButton onClick={onClose}>Close</ModalButton>
        </div>
      }
    >
      {!protocol ? (
        <ModalLoadState loading={loading} error={error} onRetry={load} />
      ) : (
        <div className="space-y-5">
          <InfoGrid
            items={[
              { label: "Regimen", value: protocol.regimen_name },
              { label: "Regimen Code", value: protocol.regimen_code },
              { label: "Version", value: protocol.protocol_version },
              { label: "Treatment Intent", value: protocol.treatment_intent },
              { label: "Standard Cycles", value: protocol.standard_cycles },
              { label: "Days per Cycle", value: protocol.no_of_days },
              { label: "Cycle Interval", value: cycleIntervalDays ? `${cycleIntervalDays} days` : "" },
              { label: "Guideline Source", value: protocol.guideline_source },
              { label: "Cancer Type", value: cancerText },
            ]}
          />

          {ROLE_SECTIONS.map(section => {
            const rows = items
              .filter(item => (item.drug_role ?? "").toUpperCase() === section.role)
              .sort((a, b) => (a.drug_sequence ?? 0) - (b.drug_sequence ?? 0));
            if (rows.length === 0 && section.role !== "PRIMARY") return null;
            return (
              <ModalSection
                key={section.role}
                icon={section.icon}
                title={section.title}
                aside={<span className="text-[11px] text-slate-400">{rows.length}</span>}
              >
                <DetailTable
                  rows={rows}
                  rowKey={item => item.protocol_item_id}
                  empty="No drugs in this section."
                  columns={[
                    {
                      header: "Drug",
                      cell: item => (
                        <>
                          <span className="font-semibold text-slate-800">{itemName(item)}</span>
                          {item.drug_type && <span className="block text-[10px] text-slate-400">{item.drug_type}</span>}
                        </>
                      ),
                    },
                    {
                      header: "Dose",
                      cell: item => (
                        <>
                          {doseText(item.dosage, item.dosage_unit) || "—"}
                          {item.dose_calculation_method && (
                            <span className="block text-[10px] text-slate-400">{item.dose_calculation_method}</span>
                          )}
                        </>
                      ),
                    },
                    { header: "Route", cell: item => item.administration_route || "—" },
                    { header: "Infusion", cell: infusion },
                    { header: "Day", cell: dayOf, className: "whitespace-nowrap" },
                    {
                      header: "Frequency / Timing",
                      cell: item => [item.frequency, item.timing_relative_to_primary].filter(Boolean).join(" · ") || "—",
                    },
                  ]}
                />
              </ModalSection>
            );
          })}

          {protocol.notes?.trim() && (
            <ModalSection icon="fa-note-sticky" title="Notes">
              <p className="whitespace-pre-line rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {protocol.notes}
              </p>
            </ModalSection>
          )}
        </div>
      )}
    </ModalShell>
  );
}
