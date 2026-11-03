import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CalendarPlus,
  Loader2,
  Phone,
  X,
  Zap,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { followUpAlertApi, type FollowUpAlert } from "@/api/followUpAlert.api";
import { appointmentApi } from "@/api/appointment.api";
import { useBranchFilter } from "@/context/BranchFilterContext";
import { usePermission } from "@/context/PermissionContext";
import { RefreshButton } from "@/components/hms/RefreshButton";
import { StatusBadge } from "@/components/hms/StatusBadge";
import HmsTable from "@/components/hms/HmsTable";

const fmtDate = (iso?: string | null) => {
  if (!iso) return "—";
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mIndex = parseInt(match[2], 10) - 1;
  return `${match[3]} ${months[mIndex] || match[2]} ${match[1]}`;
};

const splitName = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    patient_first_name: parts[0] ?? "",
    patient_middle_name: parts.length > 2 ? parts.slice(1, -1).join(" ") : "",
    patient_last_name: parts.length > 1 ? parts[parts.length - 1] : "",
  };
};

const Avatar = ({ text, color = "#00488D", bg = "#D6E3FF" }: { text: string; color?: string; bg?: string }) => (
  <div className="flex items-center justify-center w-7 h-7 rounded-xl flex-shrink-0 hms-avatar-text" style={{ backgroundColor: bg, color }}>
    {text}
  </div>
);

export default function PendingBookings() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { can } = usePermission();
  const { selectedBranchId, isAllBranches } = useBranchFilter();

  const [alerts, setAlerts] = useState<FollowUpAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "OVERDUE" | "DUE_TODAY" | "UPCOMING">("ALL");
  const [bookingAlertId, setBookingAlertId] = useState<string | null>(null);

  // Pagination & Sorting state
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [sortField, setSortField] = useState("follow_up_date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const fetchAlerts = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await followUpAlertApi.getAlerts(isAllBranches ? undefined : selectedBranchId);
      const data = res.data?.data?.alerts || [];
      setAlerts(data.filter((a) => !a.booked));
    } catch (err: any) {
      console.error("[PendingBookings] Failed to fetch alerts:", err);
      toast({
        title: "Failed to load pending follow-ups",
        description: err.response?.data?.message || "Couldn't reach follow-up alerts endpoint.",
        variant: "destructive",
      });
      setAlerts([]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedBranchId, isAllBranches, toast]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  // Single-click instant auto-booking
  const handleOneClickBook = async (alert: FollowUpAlert) => {
    if (!alert.doctor) {
      toast({
        title: "Doctor not assigned",
        description: "Opening appointment form to select a doctor...",
      });
      handleCustomBook(alert);
      return;
    }

    setBookingAlertId(alert.encounter_no);
    try {
      let chosenTime = "09:00";
      try {
        const slotRes = await appointmentApi.getAvailableSlots(
          alert.doctor.employee_id,
          alert.branch.branch_id,
          alert.follow_up_date
        );
        const slots = slotRes.data?.data?.slots || [];
        const openSlot = slots.find((s) => s.is_available);
        if (openSlot?.time) chosenTime = openSlot.time;
      } catch (slotErr) {
        console.warn("[PendingBookings] getAvailableSlots fallback:", slotErr);
      }

      await appointmentApi.create({
        patient_id: alert.patient.patient_id,
        patient_name: alert.patient.name,
        patient_number: alert.patient.mobile || undefined,
        branch_id: alert.branch.branch_id,
        department_id: alert.department?.department_id || "",
        employee_id: alert.doctor.employee_id,
        appointment_date: alert.follow_up_date,
        appointment_time: chosenTime,
        patient_type: "Outpatient (OPD)",
        patient_visit_type: "Follow-up",
        reason_for_visit: "Follow-up consultation",
      });

      toast({
        title: "Appointment Booked Successfully!",
        description: `Follow-up booked for ${alert.patient.name} with Dr. ${alert.doctor.name} on ${fmtDate(alert.follow_up_date)} at ${chosenTime}.`,
      });

      void followUpAlertApi.dismiss(alert.encounter_no);
      fetchAlerts();
    } catch (err: any) {
      toast({
        title: "Instant booking could not complete",
        description: err.response?.data?.message || "Redirecting to manual scheduler...",
      });
      handleCustomBook(alert);
    } finally {
      setBookingAlertId(null);
    }
  };

  const handleCustomBook = (alert: FollowUpAlert) => {
    const date = alert.follow_up_date;
    const placement = alert.doctor
      ? {
          doctorId: alert.doctor.employee_id,
          branchId: alert.branch?.branch_id || "",
          departmentId: alert.department?.department_id || "",
        }
      : null;

    navigate("/appointments/book", {
      state: {
        patient: {
          patient_id: alert.patient.patient_id,
          ...splitName(alert.patient.name),
          patient_primary_mobile: alert.patient.mobile ?? "",
        },
        ...(placement ? { slot: { ...placement, date } } : {}),
        ...(placement?.doctorId ? { doctorId: placement.doctorId } : {}),
        selectedDate: date,
        followUpDate: date,
        date,
        keepDate: true,
        isFollowUpBooking: true,
        defaultVisitType: "Follow-up",
      },
    });
  };

  const handleDismiss = async (encounterNo: string) => {
    try {
      await followUpAlertApi.dismiss(encounterNo);
      setAlerts((prev) => prev.filter((a) => a.encounter_no !== encounterNo));
      toast({ title: "Follow-up alert dismissed" });
    } catch (err) {
      console.error("[PendingBookings] Failed to dismiss:", err);
    }
  };

  // Filter & Search
  const filteredData = useMemo(() => {
    return alerts.filter((alert) => {
      if (statusFilter === "OVERDUE" && alert.due_status !== "OVERDUE") return false;
      if (statusFilter === "DUE_TODAY" && alert.due_status !== "DUE_TODAY") return false;
      if (statusFilter === "UPCOMING" && alert.due_status !== "UPCOMING" && alert.due_status !== "DUE_TOMORROW") return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const patientMatch =
        alert.patient.name.toLowerCase().includes(q) ||
        alert.patient.patient_id.toLowerCase().includes(q) ||
        (alert.patient.mobile && alert.patient.mobile.includes(q));
      const doctorMatch = alert.doctor && alert.doctor.name.toLowerCase().includes(q);
      const branchMatch = alert.branch.branch_name && alert.branch.branch_name.toLowerCase().includes(q);

      return patientMatch || doctorMatch || branchMatch;
    });
  }, [alerts, statusFilter, searchQuery]);

  // Sorting
  const sortedData = useMemo(() => {
    return [...filteredData].sort((a, b) => {
      let aVal = "";
      let bVal = "";
      if (sortField === "name") {
        aVal = a.patient.name;
        bVal = b.patient.name;
      } else if (sortField === "doctor") {
        aVal = a.doctor?.name ?? "";
        bVal = b.doctor?.name ?? "";
      } else if (sortField === "follow_up_date") {
        aVal = a.follow_up_date;
        bVal = b.follow_up_date;
      } else if (sortField === "visit_date") {
        aVal = a.visit_date ?? "";
        bVal = b.visit_date ?? "";
      } else if (sortField === "status") {
        aVal = a.due_status;
        bVal = b.due_status;
      }
      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredData, sortField, sortDirection]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const totalRecords = sortedData.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / rowsPerPage));
  const startIndex = (currentPage - 1) * rowsPerPage;
  const currentRows = sortedData.slice(startIndex, startIndex + rowsPerPage);
  const visibleStart = totalRecords === 0 ? 0 : startIndex + 1;
  const visibleEnd = Math.min(startIndex + rowsPerPage, totalRecords);

  const overdueCount = alerts.filter((a) => a.due_status === "OVERDUE").length;
  const dueTodayCount = alerts.filter((a) => a.due_status === "DUE_TODAY").length;
  const upcomingCount = alerts.filter((a) => a.due_status === "UPCOMING" || a.due_status === "DUE_TOMORROW").length;

  return (
    <div className="flex w-full font-[Manrope,sans-serif] bg-[#F7F9FB] min-h-screen p-6">
      <div className="flex flex-col flex-1 min-w-0 gap-6">
        {/* ==================== HEADER ==================== */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 rounded-lg border border-[#E5E7EB] bg-white hover:bg-[#F2F4F6] transition-colors shadow-2xs"
              title="Back"
            >
              <ArrowLeft className="w-4 h-4 text-[#191C1E]" />
            </button>
            <div>
              <h1 className="hms-heading">Pending Follow-up Bookings</h1>
              <p className="hms-subheading">Patients with doctor-prescribed follow-up dates awaiting appointment confirmation.</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {can("appointment.create") && (
              <button
                onClick={() => navigate("/appointments/book")}
                className="flex items-center gap-2 px-4 py-2 bg-[#004785] rounded-lg text-white text-xs font-semibold shadow-sm hover:bg-[#003a6b] transition-colors"
              >
                <CalendarPlus className="w-4 h-4" />
                Schedule Appointment
              </button>
            )}
          </div>
        </div>

        {/* ==================== MAIN CARD ==================== */}
        <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm flex flex-col transition-all duration-300 hover:shadow-md">
          {/* ==================== TOOLBAR ==================== */}
          <div className="px-5 py-3.5 border-b border-[#E5E7EB] flex flex-wrap items-center justify-between gap-3">
            {/* Left Section: Title + Total Badge */}
            <div className="flex items-center gap-3">
              <span className="text-[#191C1E] text-sm font-bold">Follow-up Queue</span>
              <span className="bg-[#E6F0FF] text-[#00488D] px-2.5 py-0.5 rounded-full text-[10px] font-semibold">
                Total Pending : {totalRecords}
              </span>
            </div>

            {/* Right Section: Search Box + Status Filter Tabs + Refresh Button (Minimal & Tight) */}
            <div className="flex items-center gap-2 ml-auto flex-wrap">
              {/* Expand-on-focus Search Box */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                  className="pl-8 pr-3 py-1.5 h-[32px] bg-[#F2F4F6] text-xs text-[#6B7280] placeholder:text-[#6B7280] outline-none w-[150px] sm:w-[190px] rounded-md transition-all duration-200 focus:rounded-none focus:w-[200px] sm:focus:w-[250px]"
                />
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2" width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M11.0667 11.5713L6.86667 7.3713C6.53333 7.638 6.15 7.8491 5.71667 8.0046C5.28333 8.1602 4.82222 8.238 4.33333 8.238C3.12222 8.238 2.09722 7.8185 1.25833 6.9796C0.419444 6.1407 0 5.1157 0 3.90462C0 2.69351.419444 1.66851 1.25833.82962C2.09722-.00927 3.12222-.42871 4.33333-.42871C5.54444-.42871 6.56944-.00927 7.40833.82962C8.24722 1.66851 8.66667 2.69351 8.66667 3.90462C8.66667 4.3935 8.58889 4.8546 8.43333 5.288C8.27778 5.7213 8.06667 6.1046 7.8 6.438L12 10.638L11.0667 11.5713ZM4.33333 6.9046C5.16667 6.9046 5.875 6.613 6.45833 6.0296C7.04167 5.4463 7.33333 4.738 7.33333 3.90462C7.33333 3.07129 7.04167 2.36296 6.45833 1.77962C5.875 1.19629 5.16667.90462 4.33333.90462C3.5.90462 2.79167 1.19629 2.20833 1.77962C1.625 2.36296 1.33333 3.07129 1.33333 3.90462C1.33333 4.738 1.625 5.4463 2.20833 6.0296C2.79167 6.613 3.5 6.9046 4.33333 6.9046Z" fill="#424752"/>
                </svg>
              </div>

              {/* Minimal Status Tabs + Refresh Button (Tight gap-1.5, matching 32px height) */}
              <div className="flex items-center gap-1.5">
                <div className="flex h-[32px] items-center border border-[#E5E7EB] rounded-lg overflow-hidden bg-[#F2F4F6] p-0.5 text-[11px] font-semibold">
                  <button
                    onClick={() => { setStatusFilter("ALL"); setCurrentPage(1); }}
                    className={`h-full px-2.5 rounded-md transition-all ${statusFilter === "ALL" ? "bg-white text-[#00488D] shadow-xs" : "text-[#6B7280] hover:text-[#111827]"}`}
                  >
                    All ({alerts.length})
                  </button>
                  <button
                    onClick={() => { setStatusFilter("OVERDUE"); setCurrentPage(1); }}
                    className={`h-full px-2.5 rounded-md transition-all ${statusFilter === "OVERDUE" ? "bg-white text-red-600 shadow-xs" : "text-[#6B7280] hover:text-[#111827]"}`}
                  >
                    Overdue ({overdueCount})
                  </button>
                  <button
                    onClick={() => { setStatusFilter("DUE_TODAY"); setCurrentPage(1); }}
                    className={`h-full px-2.5 rounded-md transition-all ${statusFilter === "DUE_TODAY" ? "bg-white text-amber-600 shadow-xs" : "text-[#6B7280] hover:text-[#111827]"}`}
                  >
                    Due Today ({dueTodayCount})
                  </button>
                  <button
                    onClick={() => { setStatusFilter("UPCOMING"); setCurrentPage(1); }}
                    className={`h-full px-2.5 rounded-md transition-all ${statusFilter === "UPCOMING" ? "bg-white text-blue-600 shadow-xs" : "text-[#6B7280] hover:text-[#111827]"}`}
                  >
                    Upcoming ({upcomingCount})
                  </button>
                </div>

                <RefreshButton onClick={fetchAlerts} isLoading={isLoading} className="!h-[32px] px-2.5 text-xs rounded-lg" />
              </div>
            </div>
          </div>

          {/* ==================== BODY (HmsTable) ==================== */}
          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-[#6B7280] text-sm">
              <Loader2 size={24} className="animate-spin text-[#00488D]" />
              Loading pending follow-ups...
            </div>
          ) : (
            <HmsTable
              columns={[
                {
                  key: "name",
                  label: "Patient",
                  render: (r: any) => (
                    <div className="flex items-center gap-2">
                      <Avatar text={String(r.patient.name || "P")[0]?.toUpperCase()} />
                      <div>
                        <div className="hms-name-text">{r.patient.name || r.patient.patient_id}</div>
                        <div className="hms-id-text flex items-center gap-1">
                          {r.patient.patient_id}
                          {r.patient.age != null && ` • ${r.patient.age}Y/${r.patient.gender?.charAt(0) ?? ""}`}
                        </div>
                      </div>
                    </div>
                  ),
                },
                {
                  key: "mobile",
                  label: "Mobile",
                  sortable: false,
                  render: (r: any) => (
                    r.patient.mobile ? (
                      <a href={`tel:${r.patient.mobile}`} className="hms-content-text text-[#00488D] hover:underline flex items-center gap-1">
                        <Phone className="w-3 h-3 text-[#9CA3AF]" />
                        {r.patient.mobile}
                      </a>
                    ) : (
                      <span className="text-[#9CA3AF]">—</span>
                    )
                  ),
                },
                {
                  key: "doctor",
                  label: "Follow-up Doctor",
                  render: (r: any) => (
                    r.doctor ? (
                      <div>
                        <div className="hms-name-text">Dr. {r.doctor.name.replace(/^dr\.?\s+/i, "")}</div>
                        <div className="hms-id-text text-[#6B7280]">
                          {r.department?.department_name || r.doctor.specialization || "General Medicine"}
                        </div>
                      </div>
                    ) : (
                      <span className="text-[#9CA3AF] italic">Unassigned</span>
                    )
                  ),
                },
                {
                  key: "follow_up_date",
                  label: "Follow-up Date",
                  render: (r: any) => (
                    <div>
                      <div className="hms-content-text text-[#111827]">{fmtDate(r.follow_up_date)}</div>
                      <div className="hms-id-text">{r.follow_up_date}</div>
                    </div>
                  ),
                },
                {
                  key: "visit_date",
                  label: "Consult Date",
                  render: (r: any) => <span className="hms-content-text text-[#4B5563]">{fmtDate(r.visit_date)}</span>,
                },
                {
                  key: "branch",
                  label: "Branch",
                  render: (r: any) => <span className="hms-content-text text-[#191C1E]">{r.branch.branch_name || "—"}</span>,
                },
                {
                  key: "status",
                  label: "Status",
                  render: (r: any) => {
                    if (r.due_status === "OVERDUE") {
                      return <StatusBadge status={`Overdue (${r.days_overdue}d)`} tone="red" />;
                    }
                    if (r.due_status === "DUE_TODAY") {
                      return <StatusBadge status="Due Today" tone="amber" />;
                    }
                    if (r.due_status === "DUE_TOMORROW") {
                      return <StatusBadge status="Due Tomorrow" tone="blue" />;
                    }
                    return <StatusBadge status={`In ${r.days_until}d`} tone="blue" />;
                  },
                },
                {
                  key: "actions",
                  label: "Actions",
                  sortable: false,
                  render: (r: any) => (
                    <div className="flex items-center gap-1.5">
                      {can("appointment.create") && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleOneClickBook(r)}
                            disabled={bookingAlertId === r.encounter_no}
                            title="Instant 1-Click Book with earliest available slot"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#004785] hover:bg-[#003a6b] text-white text-xs font-semibold shadow-xs active:scale-95 transition-all disabled:opacity-50"
                          >
                            {bookingAlertId === r.encounter_no ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Zap className="w-3 h-3 fill-current text-amber-300" />
                            )}
                            <span>1-Click</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleCustomBook(r)}
                            title="Open scheduler to select slot"
                            className="p-1.5 rounded-lg border border-[#E5E7EB] bg-white hover:bg-[#F2F4F6] text-[#374151] transition-colors"
                          >
                            <CalendarPlus className="w-4 h-4 text-[#00488D]" />
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => handleDismiss(r.encounter_no)}
                        title="Dismiss follow-up"
                        className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-red-500 hover:bg-[#F2F4F6] transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ),
                },
              ]}
              data={currentRows}
              sortField={sortField}
              sortDirection={sortDirection}
              onSort={handleSort}
              currentPage={currentPage}
              totalPages={totalPages}
              totalRecords={totalRecords}
              rowsPerPage={rowsPerPage}
              visibleStart={visibleStart}
              visibleEnd={visibleEnd}
              onPageChange={setCurrentPage}
              onRowsPerPageChange={(val) => { setRowsPerPage(val); setCurrentPage(1); }}
              rowsPerPageOptions={[10, 20, 50]}
              emptyMessage="No pending follow-ups match your current filters."
              rowKey={(r: any) => String(r.encounter_no)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
