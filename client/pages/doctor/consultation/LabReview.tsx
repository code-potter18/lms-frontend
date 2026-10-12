import React, { useEffect, useRef, useState, useCallback } from "react";
import API, { getActiveBranchId } from "../../../api/axios";
import { getUser } from "../../../utils/token";
import { encounterApi } from "../../../api/encounter.api";
import type { LabTestMasterRecord } from "../../../api/labTestMaster.api";
import {
  labOrderApi,
  labOrderItemApi,
  type LabOrderItemRecord,
} from "../../../api/labOrder.api";
import { UserProfileDropdown } from "../../../components/ui/User_profile_dropdown";
import VoiceToText from "@/components/ui/voicetotext";
import { dmyToIsoStrict, findActiveEncounter } from "./helpers";
import { BackIcon, CheckIcon } from "./icons";
import type { InvestigationOrderDetail } from "./types";

/* ============================================================
   LAB REVIEW COMPONENT
   (combined from client/pages/doctor/labreview.tsx ”
    renamed App ’ LabReview, duplicate React/useState import
    removed so it can live in this file)

   Table rows come from the lab_order_item table via
   GET /lab-order-item filtered to the consulted patient.
============================================================ */

const formatOrderedDate = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}-${month}-${date.getFullYear()}`;
};

/* target_date is a DATE column (serialised as UTC midnight), so it is read
   from the string rather than through the local timezone. */
const formatTargetDate = (value?: string | null) => {
  const iso = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[3]}-${iso[2]}-${iso[1]}` : "—";
};

const NotificationIcon = () => (
  <svg
    className="h-6 w-6"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ArrowRightIcon = () => (
  <svg
    className="h-5 w-5"
    fill="currentColor"
    viewBox="0 0 20 20"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z"
    />
  </svg>
);

const LabReview: React.FC<{
  embedded?: boolean;
  patientId?: string;
  appointmentId?: string;
  branchId?: string;
  encounterNo?: string;
  pendingTests?: LabTestMasterRecord[];
  /* Consultation's per-test notes / priority / target date, by test name. */
  testDetails?: Record<string, InvestigationOrderDetail>;
  /* Consultation's Additional Instructions -> lab_order.clinical_notes. */
  instructions?: string;
  onOrdered?: (testIds: string[]) => void;
  onNext?: () => void;
}> = ({
  embedded = false,
  patientId,
  appointmentId,
  branchId,
  encounterNo,
  pendingTests = [],
  testDetails = {},
  instructions = "",
  onOrdered,
  onNext,
}) => {
  const [userAvatarUrl, setUserAvatarUrl] = useState<string>(() => localStorage.getItem("user_photo") || "");
  const [avatarLoading, setAvatarLoading] = useState<boolean>(() => !localStorage.getItem("user_photo"));

  const [observations, setObservations] = useState("");
  const [notifications, setNotifications] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savingObservations, setSavingObservations] = useState(false);

  /* ------------------------------------------------------------
     LAB ORDER ITEMS (lab_order_item table via GET /lab-order-item)
     One row per investigation ordered for this patient.
     item_status: "Ordered" initially → "Completed" once reported.
  ------------------------------------------------------------ */

  const [orderedItems, setOrderedItems] = useState<LabOrderItemRecord[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [itemsError, setItemsError] = useState("");
  const [orderError, setOrderError] = useState("");

  const placingRef = useRef(false);

  const loadItems = useCallback(() => {
    let cancelled = false;
    setItemsLoading(true);
    setItemsError("");
    labOrderItemApi
      .getAll()
      .then((response) => {
        if (cancelled) return;
        const allItems = response.data.data ?? [];
        const now = new Date();
        const forPatient = allItems.filter(
          (item) => {
            if (item.lab_order?.patient_history?.patient_id !== patientId) return false;
            const dateStr = item.lab_order?.order_datetime ?? item.created_at;
            if (!dateStr) return false;
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return false;
            return (
              d.getFullYear() === now.getFullYear() &&
              d.getMonth() === now.getMonth() &&
              d.getDate() === now.getDate()
            );
          }
        );
        setOrderedItems(forPatient);
      })
      .catch((error: any) => {
        console.error("Failed to load lab order items:", error);
        if (!cancelled) {
          setItemsError(
            error?.response?.data?.message ||
              error?.message ||
              "Failed to load laboratory investigations."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setItemsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  /* ------------------------------------------------------------
     AUTO-PLACE the selected investigations when Lab Review opens:
     one lab_order per visit (POST /lab-order) + one lab_order_item
     per test (POST /lab-order-item, status defaults to "Ordered").
     Runs no matter how this step was reached (Proceed button or
     the stepper), and reports placed ids back to the parent so
     re-entering the step never duplicates orders.
  ------------------------------------------------------------ */

  useEffect(() => {
    if (placingRef.current) return;
    if (!patientId || pendingTests.length === 0) return;

    placingRef.current = true;
    setItemsLoading(true);
    setOrderError("");

    (async () => {
      try {
        let employeeId = getUser()?.employee_id ?? null;

        if (!employeeId) {
          const me = await API.get<{
            success: boolean;
            user?: { employee_id?: string | null };
          }>("/auth/me");
          employeeId = me.data?.user?.employee_id ?? null;
        }

        if (!employeeId) {
          throw new Error(
            "Could not resolve the logged-in doctor. Please log in again."
          );
        }

        const branchId =
          getActiveBranchId() ?? getUser()?.branch_id ?? undefined;

        /* The order is Urgent when any of its tests is, so the lab's
           order-level badges and alerts flag it. */
        const orderUrgent = pendingTests.some(
          (test) => testDetails[test.test_name]?.priority === "Urgent"
        );

        const orderResponse = await labOrderApi.create({
          patient_id: patientId,
          doctor_employee_id: employeeId,
          priority: orderUrgent ? "Urgent" : "Normal",
          ...(instructions.trim()
            ? { clinical_notes: instructions.trim() }
            : {}),
          ...(branchId ? { branch_id: branchId } : {}),
        });

        const labOrderId = orderResponse.data.data?.lab_order_id;

        if (!labOrderId) {
          throw new Error("Failed to create the lab order.");
        }

        const createdItems = await Promise.all(
          pendingTests.map((test) => {
            const detail = testDetails[test.test_name];
            const notes = detail?.notes.trim() ?? "";
            /* An invalid typed date is dropped (Consultation's Proceed
               blocks it, but this step can be opened from the stepper). */
            const targetDate = dmyToIsoStrict(detail?.targetDate ?? "");

            return labOrderItemApi.create({
              lab_order_id: labOrderId,
              lab_test_id: test.lab_test_id,
              priority: detail?.priority ?? "Normal",
              ...(notes ? { clinical_notes: notes } : {}),
              ...(targetDate ? { target_date: targetDate } : {}),
              ...(branchId ? { branch_id: branchId } : {}),
            });
          })
        );

        try {
          const itemIds = createdItems
            .map((r) => r.data.data?.lab_order_item_id)
            .filter(Boolean);
          if (itemIds.length > 0) {
            const existing: string[] = JSON.parse(
              localStorage.getItem(`hms_lab_item_ids_${patientId}`) || "[]"
            );
            const merged = [...new Set([...existing, ...itemIds])];
            localStorage.setItem(`hms_lab_item_ids_${patientId}`, JSON.stringify(merged));
          }
        } catch { /* ignore */ }

        onOrdered?.(pendingTests.map((test) => test.lab_test_id));
      } catch (error: any) {
        console.error("Failed to place lab order:", error);
        setOrderError(
          error?.response?.data?.message ||
            error?.message ||
            "Failed to place the lab order for the selected investigations."
        );
      } finally {
        setItemsLoading(false);
        loadItems();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  const handleCancel = () => {
    setObservations("");
    setSaved(false);
  };

  const handleSaveDraft = () => {
    setSaved(true);
  };

  const handleProceed = async () => {
    if (savingObservations) return;

    try {
      setSavingObservations(true);

      let targetEncounterNo = encounterNo ?? "";

      if (!targetEncounterNo && patientId) {
        const { encounter: found } = await findActiveEncounter(
          patientId,
          appointmentId,
          branchId,
        );
        targetEncounterNo = found?.encounter_no ?? "";
      }

      if (!targetEncounterNo) {
        window.alert(
          "No active encounter found. Cannot save lab review observations."
        );
        return;
      }

      const payload: { advice?: string } = {};
      if (observations.trim()) {
        payload.advice = observations;
      }

      await encounterApi.update(targetEncounterNo, payload);

      setSaved(true);

      onNext?.();
    } catch (error: any) {
      console.error("Failed to save lab review observations:", error);
      window.alert(
        error?.response?.data?.message ||
          error?.message ||
          "Failed to save lab review observations."
      );
    } finally {
      setSavingObservations(false);
    }
  };

  const handleViewReport = (name: string) => {
    alert(`Viewing report: ${name}`);
  };

  const content = (
    <div className="space-y-6">
      {/* Laboratory Investigations */}
      <section className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)]">
        {/* Card Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-8 py-6">
          <h2 className="text-2xl font-bold text-gray-900">
            Laboratory Investigations
          </h2>

          <span className="text-sm font-medium text-gray-500">
            {itemsLoading
              ? "Loading..."
              : `${orderedItems.length} Reports Found`}
          </span>
        </div>

        {itemsError && (
          <div className="border-b border-gray-100 bg-red-50 px-8 py-4 text-sm text-red-700">
            {itemsError}
          </div>
        )}

        {orderError && (
          <div className="border-b border-gray-100 bg-red-50 px-8 py-4 text-sm text-red-700">
            Failed to place order: {orderError}
          </div>
        )}

        {!patientId && pendingTests.length > 0 && (
          <div className="border-b border-gray-100 bg-amber-50 px-8 py-4 text-sm text-amber-700">
            Cannot place the selected investigations: this page was opened
            without a patient reference. Go back and open the patient from the
            appointments list.
          </div>
        )}

        {/* Table */}
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-gray-100 bg-white">
                <th className="w-[36%] px-8 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">
                  Investigation Name
                </th>

                <th className="w-[16%] px-8 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">
                  Ordered Date
                </th>

                <th className="w-[16%] px-8 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">
                  Target Date
                </th>

                <th className="w-[16%] px-8 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">
                  Status
                </th>

                <th className="w-[16%] px-8 py-4 text-right text-xs font-bold uppercase tracking-wider text-gray-500">
                  Action
                </th>
              </tr>
            </thead>

            <tbody className="bg-white text-gray-700">
              {!itemsLoading && !itemsError && orderedItems.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-8 py-6 text-center text-sm text-gray-500"
                  >
                    No investigations have been ordered for this patient yet.
                  </td>
                </tr>
              )}

              {orderedItems.map((item) => {
                const status = item.item_status || "Ordered";
                const completed = status === "Completed";

                return (
                <tr
                  key={item.lab_order_item_id}
                  className="border-b border-[#F3F4F6] transition-colors last:border-b-0 hover:bg-gray-50"
                >
                  <td className="max-w-0 px-8 py-5">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[15px] font-semibold">
                        {item.lab_test_master?.test_name ?? "—"}
                      </span>
                      {item.priority === "Urgent" && (
                        <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-600 ring-1 ring-red-200">
                          Urgent
                        </span>
                      )}
                    </div>
                    {item.clinical_notes && (
                      <div
                        className="mt-0.5 truncate text-xs text-gray-500"
                        title={item.clinical_notes}
                      >
                        {item.clinical_notes}
                      </div>
                    )}
                  </td>

                  <td className="px-8 py-5 text-gray-600">
                    {formatOrderedDate(
                      item.lab_order?.order_datetime ?? item.created_at
                    )}
                  </td>

                  <td className="px-8 py-5 text-gray-600">
                    {formatTargetDate(item.target_date)}
                  </td>

                  <td className="px-8 py-5">
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${
                        completed
                          ? "bg-[#DCFCE7] text-[#166534]"
                          : "bg-[#FEF3C7] text-[#92400E]"
                      }`}
                    >
                      {status}
                    </span>
                  </td>

                  <td className="px-8 py-5 text-right">
                    <button
                      type="button"
                      onClick={() =>
                        completed &&
                        handleViewReport(
                          item.lab_test_master?.test_name ??
                            item.lab_order_item_id
                        )
                      }
                      disabled={!completed}
                      title={
                        completed
                          ? "View report"
                          : "Report available once the test is Completed"
                      }
                      className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 ${
                        completed
                          ? "bg-[#F0F5FF] text-[#2563EB] hover:bg-blue-100 focus:ring-blue-500"
                          : "cursor-not-allowed bg-slate-100 text-slate-400"
                      }`}
                    >
                      View Report
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Clinical Remarks */}
      <section className="rounded-xl border border-gray-100 bg-white p-8 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)]">
        <h2 className="mb-6 text-2xl font-bold text-gray-900">
          Clinical Remarks
        </h2>

        <div className="space-y-3">
          <label
            htmlFor="observations"
            className="block text-[13px] font-bold uppercase tracking-widest text-[#9CA3AF]"
          >
            Observations & Notes
          </label>

          <VoiceToText
            value={observations}
            onChange={(text) => setObservations(text)}
            placeholder="Enter clinical observations based on the laboratory reports..."
          />
        </div>

        {saved && (
          <p className="mt-3 text-sm font-medium text-green-600">
            Draft saved successfully.
          </p>
        )}
      </section>
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F9FB] text-[#1F2937]">
      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center gap-4">
          <button
            type="button"
            aria-label="Go back"
            onClick={() => window.history.back()}
            className="text-gray-600 transition-colors hover:text-gray-900 focus:outline-none"
          >
            <BackIcon />
          </button>

          <h1 className="text-xl font-bold tracking-tight text-gray-900">
            Patients
          </h1>
        </div>

        <div className="flex items-center gap-6">
          <div className="relative">
            <button
              type="button"
              aria-label="Notifications"
              onClick={() => setNotifications((prev) => !prev)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#8a8fa3] transition-colors hover:bg-[#eef1f9] hover:text-[#434656] focus:outline-none"
            >
              <NotificationIcon />

              <span className="absolute right-0 top-0 block h-2 w-2 rounded-full bg-[#003ec7] ring-2 ring-white" />
            </button>

            {notifications && (
              <div className="absolute right-0 top-14 z-50 w-[360px] overflow-hidden rounded-xl border border-[#e5e7ef] bg-white shadow-[0_10px_30px_rgba(0,0,0,0.15)]">
                <header className="flex items-center justify-between border-b border-[#e5e7ef] bg-white px-5 py-4">
                  <h1 className="text-base font-semibold tracking-[0.01em] text-[#131b2e]">Notifications</h1>
                  <div className="flex shrink-0 items-center gap-3">
                    <button
                      type="button"
                      className="text-xs font-semibold tracking-[0.02em] text-[#003ec7] transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-[#003ec7]"
                    >
                      Mark all as read
                    </button>
                    <button
                      type="button"
                      className="text-xs font-semibold tracking-[0.02em] text-[#93000a] transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-[#93000a] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Clear all
                    </button>
                  </div>
                </header>
                <main className="flex max-h-[420px] w-full flex-col gap-6 overflow-y-auto bg-[#f8fafc] p-4">
                  <p className="py-6 text-center text-xs text-[#434656]">No new notifications</p>
                </main>
              </div>
            )}
          </div>

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

      {/* Workflow Stepper */}
      <section className="relative bg-[#F8F9FB] pb-0 pt-8">
        <div className="mx-auto max-w-5xl px-6">
          <div className="relative flex items-end justify-between">
            {/* Consultation */}
            <div className="relative z-10 flex flex-1 flex-col items-center pb-6">
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-gray-400 text-white">
                <CheckIcon />
              </div>

              <span className="text-xs font-bold uppercase tracking-wider text-gray-800">
                Consultation
              </span>

              <div className="absolute bottom-0 left-0 right-[-50%] h-1 rounded bg-white" />
            </div>

            {/* Lab Report Review */}
            <div className="relative z-10 flex flex-1 flex-col items-center pb-6">
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-green-500 text-white ring-4 ring-green-100">
                <CheckIcon />
              </div>

              <span className="text-xs font-bold uppercase tracking-wider text-gray-800">
                Lab Report Review
              </span>

              <div className="absolute bottom-0 left-0 right-0 mx-auto h-1 w-[95%] rounded bg-green-500" />
            </div>

            {/* Diagnosis */}
            <div className="relative z-10 flex flex-1 flex-col items-center pb-6">
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-gray-400 text-white">
                <CheckIcon />
              </div>

              <span className="text-xs font-bold uppercase tracking-wider text-gray-800">
                Diagnosis
              </span>

              <div className="absolute bottom-0 left-[-50%] right-0 h-1 rounded bg-white" />
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main className="flex-grow px-6 py-8">
        <div className="mx-auto max-w-5xl space-y-6">
          {content}
        </div>
      </main>

      {/* Footer */}
      <footer className="sticky bottom-0 z-20 border-t border-gray-200 bg-white px-6 py-6">
        <div className="mx-auto flex max-w-5xl justify-center gap-4">
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-xl border border-gray-300 px-8 py-3 text-[15px] font-bold text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSaveDraft}
            className="rounded-xl border border-blue-600 px-8 py-3 text-[15px] font-bold text-blue-600 transition-colors hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Save as Draft
          </button>

          <button
            type="button"
            onClick={handleProceed}
            disabled={savingObservations}
            className="flex items-center gap-2 rounded-xl bg-[#2563EB] px-8 py-3 text-[15px] font-bold text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {savingObservations ? "Saving" : "Proceed to Treatment Plan"}
            <ArrowRightIcon />
          </button>
        </div>
      </footer>
    </div>
  );
};

export default LabReview;
