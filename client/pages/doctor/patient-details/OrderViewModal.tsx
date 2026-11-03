import { useCallback, useEffect, useState } from "react";
import {
  chemoPlanItemName,
  chemotherapyApi,
  type ChemoPlanItem,
  type ChemoPlanOrder,
} from "@/api/chemotherapy.api";
import { DetailTable, InfoGrid, ModalButton, ModalLoadState, ModalSection, ModalShell } from "./ModalShell";
import { doseText, fmtDate, fmtTime } from "./adminFormat";

const ROLE_SECTIONS: { role: string; title: string; icon: string }[] = [
  { role: "PREMEDICATION",  title: "Pre-Medications",        icon: "fa-prescription-bottle-medical" },
  { role: "PRIMARY",        title: "Chemotherapy Drugs",     icon: "fa-syringe" },
  { role: "SUPPORTIVE",     title: "Supportive Medications", icon: "fa-plus-circle" },
  { role: "POSTMEDICATION", title: "Post-Medications",       icon: "fa-pills" },
  { role: "DILUTION",       title: "Dilution",               icon: "fa-flask" },
];

const ORDER_STATUS: Record<string, { label: string; className: string }> = {
  ORDERED:           { label: "Ordered",           className: "bg-amber-100 text-amber-700" },
  IN_ADMINISTRATION: { label: "In Administration", className: "bg-blue-100 text-blue-700" },
  COMPLETED:         { label: "Completed",         className: "bg-green-100 text-green-700" },
};

const num = (value: number | string | null | undefined, unit: string) => {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })} ${unit}`.trim() : `${value} ${unit}`.trim();
};

const infusion = (item: ChemoPlanItem) =>
  item.infusion_rate ||
  [item.infusion_type, item.infusion_duration_minutes ? `${item.infusion_duration_minutes} min` : ""]
    .filter(Boolean)
    .join(" · ") ||
  "—";

/* "View Orders" of the Administration tab: the saved Chemotherapy Order of
   the cycle day on screen - dosing parameters, drugs, hydration and the
   instructions written with it. */
export default function OrderViewModal({
  planId,
  cycleNumber,
  cycleDay,
  treatmentDate,
  onClose,
}: {
  planId: string;
  cycleNumber: number;
  cycleDay: number;
  treatmentDate?: string | null;
  onClose: () => void;
}) {
  const [order, setOrder] = useState<ChemoPlanOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setMissing(false);
    chemotherapyApi
      .getPlanOrder(planId, cycleNumber, cycleDay)
      .then(response => {
        if (cancelled) return;
        setOrder(response.data.data);
        setMissing(!response.data.data);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.response?.data?.message || "Failed to load the order.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [planId, cycleNumber, cycleDay]);

  useEffect(() => load(), [load]);

  const items = order?.chemotherapy_plan_items ?? [];
  const hydration = [...(order?.chemotherapy_plan_hydration ?? [])].sort(
    (a, b) =>
      (a.hydration_stage === "PRE" ? 0 : 1) - (b.hydration_stage === "PRE" ? 0 : 1) ||
      (a.display_order ?? 0) - (b.display_order ?? 0)
  );
  const status = order ? ORDER_STATUS[order.order_status] : null;

  return (
    <ModalShell
      icon="fa-clipboard-list"
      tone="blue"
      title="View Orders"
      subtitle={
        <span className="font-semibold text-blue-700">
          Cycle {cycleNumber} · Day {cycleDay}{treatmentDate ? ` · ${fmtDate(treatmentDate)}` : ""}
        </span>
      }
      maxWidth="max-w-4xl"
      onClose={onClose}
      footer={
        <div className="flex justify-end">
          <ModalButton onClick={onClose}>Close</ModalButton>
        </div>
      }
    >
      {missing ? (
        <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
          No Chemotherapy Order has been saved for this cycle day yet.
        </p>
      ) : !order ? (
        <ModalLoadState loading={loading} error={error} onRetry={load} />
      ) : (
        <div className="space-y-5">
          <InfoGrid
            items={[
              {
                label: "Order Status",
                value: (
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${status?.className ?? "bg-slate-100 text-slate-600"}`}>
                    {status?.label ?? order.order_status}
                  </span>
                ),
              },
              { label: "Planned Date", value: order.planned_date ? fmtDate(order.planned_date.slice(0, 10)) : "" },
              { label: "Ordered On", value: order.created_at ? `${fmtDate(order.created_at)} ${fmtTime(order.created_at)}` : "" },
              { label: "Completed On", value: order.completed_at ? `${fmtDate(order.completed_at)} ${fmtTime(order.completed_at)}` : "" },
              { label: "Height", value: num(order.dosing_height_cm, "cm") },
              { label: "Weight", value: num(order.dosing_weight_kg, "kg") },
              { label: "BSA", value: num(order.dosing_bsa, "m²") },
              { label: "Serum Creatinine", value: num(order.dosing_serum_creatinine, "mg/dL") },
              { label: "CrCl", value: num(order.dosing_crcl, "mL/min") },
              { label: "Encounter", value: order.encounter_no },
            ]}
          />

          {ROLE_SECTIONS.map(section => {
            const rows = items
              .filter(item => (item.drug_role ?? "").toUpperCase() === section.role)
              .sort((a, b) => (a.drug_sequence ?? 0) - (b.drug_sequence ?? 0));
            if (rows.length === 0 && section.role !== "PRIMARY") return null;
            const dilution = section.role === "DILUTION";
            return (
              <ModalSection
                key={section.role}
                icon={section.icon}
                title={section.title}
                aside={<span className="text-[11px] text-slate-400">{rows.length}</span>}
              >
                <DetailTable
                  rows={rows}
                  rowKey={item => item.chemotherapy_plan_item_id}
                  empty="No drugs were ordered in this section."
                  columns={[
                    {
                      header: "Drug",
                      cell: item => (
                        <>
                          <span className="font-semibold text-slate-800">{chemoPlanItemName(item) || "—"}</span>
                          {(item.medicine_master?.brand_name || item.formulation) && (
                            <span className="block text-[10px] text-slate-400">
                              {[item.medicine_master?.brand_name, item.formulation].filter(Boolean).join(" · ")}
                            </span>
                          )}
                        </>
                      ),
                    },
                    {
                      header: dilution ? "Dose" : "Patient Dose",
                      cell: item =>
                        doseText(item.calculated_dose ?? null, item.calculated_dose_unit) ||
                        doseText(item.protocol_dose ?? null, item.protocol_dose_unit) ||
                        "—",
                      className: "whitespace-nowrap font-semibold text-slate-800",
                    },
                    ...(dilution
                      ? [
                          { header: "Diluent", cell: (item: ChemoPlanItem) => item.dilution_solution || "—" },
                          { header: "Volume", cell: (item: ChemoPlanItem) => (item.dilution_volume ? String(item.dilution_volume) : "—") },
                          { header: "Guidance", cell: (item: ChemoPlanItem) => item.administration_detail || "—" },
                        ]
                      : [
                          {
                            header: "Protocol Dose",
                            cell: (item: ChemoPlanItem) => doseText(item.protocol_dose ?? null, item.protocol_dose_unit) || "—",
                            className: "whitespace-nowrap",
                          },
                          { header: "Route", cell: (item: ChemoPlanItem) => item.administration_route || "—" },
                          { header: "Infusion", cell: infusion },
                          {
                            header: "Frequency / Timing",
                            cell: (item: ChemoPlanItem) =>
                              [item.frequency, item.timing_relative_to_primary].filter(Boolean).join(" · ") || "—",
                          },
                        ]),
                  ]}
                />
              </ModalSection>
            );
          })}

          {hydration.length > 0 && (
            <ModalSection icon="fa-droplet" title="Hydration" aside={<span className="text-[11px] text-slate-400">{hydration.length}</span>}>
              <DetailTable
                rows={hydration}
                rowKey={row => row.plan_hydration_id}
                columns={[
                  {
                    header: "Stage",
                    cell: row => (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${row.hydration_stage === "POST" ? "bg-violet-50 text-violet-700" : "bg-sky-50 text-sky-700"}`}>
                        {row.hydration_stage === "POST" ? "Post" : "Pre"}
                      </span>
                    ),
                  },
                  { header: "Agent", cell: row => row.agent_name || "—" },
                  { header: "Diluent", cell: row => row.diluent || "—" },
                  { header: "Volume", cell: row => num(row.dilution_volume, row.dilution_volume_unit ?? "") || "—" },
                  { header: "Guidance", cell: row => row.guidance || "—" },
                ]}
              />
            </ModalSection>
          )}

          {(order.chemo_instructions?.trim() || order.additional_notes?.trim()) && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {order.chemo_instructions?.trim() && (
                <ModalSection icon="fa-clipboard-check" title="Post Chemo Instructions">
                  <p className="whitespace-pre-line rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    {order.chemo_instructions}
                  </p>
                </ModalSection>
              )}
              {order.additional_notes?.trim() && (
                <ModalSection icon="fa-note-sticky" title="Additional Notes">
                  <p className="whitespace-pre-line rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    {order.additional_notes}
                  </p>
                </ModalSection>
              )}
            </div>
          )}
        </div>
      )}
    </ModalShell>
  );
}
