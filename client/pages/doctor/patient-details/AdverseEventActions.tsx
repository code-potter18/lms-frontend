import { useState } from "react";
import { chemotherapyApi, type ChemoAdverseEventRecord } from "@/api/chemotherapy.api";
import { useToast } from "@/hooks/use-toast";
import { ComboInput } from "./ComboInput";
import { ModalButton, ModalShell } from "./ModalShell";
import { CTCAE_GRADES } from "./adminFormat";

const REMOVE_REASONS = [
  "Entered in error",
  "Duplicate entry",
  "Wrong patient",
  "Wrong cycle day",
  "Others",
];

const pad = (n: number) => String(n).padStart(2, "0");
const localDay = (date = new Date()) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/* The event being acted on, as a compact summary card. */
function EventSummary({ event, dayLabel }: { event: ChemoAdverseEventRecord; dayLabel: string }) {
  const grade = CTCAE_GRADES.find(g => g.value === String(event.ctcae_grade ?? ""));
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-800">{event.adverse_event_name}</p>
        <p className="truncate text-[11px] text-slate-500">{dayLabel}</p>
      </div>
      {event.ctcae_grade && (
        <span className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${grade?.badge ?? "border border-slate-200 bg-slate-100 text-slate-600"}`}>
          Grade {event.ctcae_grade}
        </span>
      )}
    </div>
  );
}

/* "Mark resolved": records the date an ongoing adverse event resolved. */
export function ResolveAdverseModal({
  event,
  dayLabel,
  onSaved,
  onClose,
}: {
  event: ChemoAdverseEventRecord;
  dayLabel: string;
  onSaved: (record: ChemoAdverseEventRecord) => void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const today = localDay();
  const eventDay = event.event_date ? localDay(new Date(event.event_date)) : "";
  const [date, setDate] = useState(today);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const error = !date
    ? "Enter the resolution date"
    : eventDay && date < eventDay
      ? "Can't be before the event date"
      : date > today
        ? "Can't be in the future"
        : "";

  const submit = async () => {
    setTouched(true);
    if (error || saving) return;
    setSaving(true);
    try {
      const response = await chemotherapyApi.updateAdverseEvent(event.adverse_event_id, {
        resolved: true,
        resolution_date: date,
      });
      onSaved(response.data.data);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Couldn't mark the event resolved",
        description: err?.response?.data?.message || err?.message || "Please try again.",
      });
      setSaving(false);
    }
  };

  return (
    <ModalShell
      icon="fa-circle-check"
      tone="green"
      title="Mark Adverse Event Resolved"
      subtitle="The event moves from Ongoing to Resolved."
      maxWidth="max-w-md"
      busy={saving}
      onClose={onClose}
      initialFocus="#adverse-resolution-date"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <ModalButton onClick={onClose} disabled={saving}>Back</ModalButton>
          <ModalButton
            variant="success"
            icon="fa-check"
            busy={saving}
            disabled={saving || (touched && !!error)}
            onClick={() => void submit()}
          >
            Mark Resolved
          </ModalButton>
        </div>
      }
    >
      <div className="space-y-4">
        <EventSummary event={event} dayLabel={dayLabel} />
        <div>
          <label htmlFor="adverse-resolution-date" className="mb-1 block text-[10px] font-semibold text-slate-700">
            Resolution Date <span className="text-red-500">*</span>
          </label>
          <input
            id="adverse-resolution-date"
            type="date"
            value={date}
            min={eventDay || undefined}
            max={today}
            onChange={e => setDate(e.target.value)}
            className={`w-full rounded-lg border ${touched && error ? "border-red-300" : "border-slate-200"} bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-200`}
          />
          {touched && error && <p className="mt-1 text-[11px] font-medium text-red-500">{error}</p>}
        </div>
      </div>
    </ModalShell>
  );
}

/* "Remove": soft-deletes an event entered in error; the reason is kept in
   the audit log. */
export function RemoveAdverseModal({
  event,
  dayLabel,
  onRemoved,
  onClose,
}: {
  event: ChemoAdverseEventRecord;
  dayLabel: string;
  onRemoved: (adverseEventId: string) => void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const missingReason = !reason.trim();

  const submit = async () => {
    setTouched(true);
    if (missingReason || saving) return;
    setSaving(true);
    try {
      await chemotherapyApi.removeAdverseEvent(event.adverse_event_id, reason.trim());
      onRemoved(event.adverse_event_id);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Couldn't remove the adverse event",
        description: err?.response?.data?.message || err?.message || "Please try again.",
      });
      setSaving(false);
    }
  };

  return (
    <ModalShell
      icon="fa-trash-can"
      tone="red"
      title="Remove Adverse Event"
      subtitle="Use this only for an event recorded by mistake."
      maxWidth="max-w-md"
      busy={saving}
      onClose={onClose}
      initialFocus="#adverse-remove-reason"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <ModalButton onClick={onClose} disabled={saving}>Back</ModalButton>
          <ModalButton
            variant="danger"
            icon="fa-trash-can"
            busy={saving}
            disabled={saving || (touched && missingReason)}
            onClick={() => void submit()}
          >
            Remove Event
          </ModalButton>
        </div>
      }
    >
      <div className="space-y-4">
        <EventSummary event={event} dayLabel={dayLabel} />
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-800">
          <i className="fa-solid fa-circle-info mt-0.5" />
          <span>The event is removed from the Administration and History tabs. The record and your reason are kept in the audit log.</span>
        </div>
        <div>
          <label htmlFor="adverse-remove-reason" className="mb-1 block text-[10px] font-semibold text-slate-700">
            Reason <span className="text-red-500">*</span>
          </label>
          <ComboInput
            id="adverse-remove-reason"
            value={reason}
            onChange={setReason}
            options={REMOVE_REASONS}
            placeholder="Select or type a reason..."
            hasError={touched && missingReason}
          />
          {touched && missingReason && (
            <p className="mt-1 text-[11px] font-medium text-red-500">A reason is required to remove an adverse event</p>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
