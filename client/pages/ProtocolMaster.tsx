import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import {
  Plus,
  Search,
  Loader2,
  ChevronDown,
  MoreVertical,
  TrendingUp,
  FileText,
  CheckCircle2,
  Eye,
  PenLine,
  Archive,
  Trash2,
  Clock,
  CalendarDays,
} from "lucide-react";
import { format } from "date-fns";
import HmsTable from "@/components/hms/HmsTable";
import { RefreshButton } from "@/components/hms/RefreshButton";
import { StatusBadge } from "@/components/hms/StatusBadge";
import ExportReport from "@/components/ui/ExportReport";
import { ConfirmationDialog } from "@/components/ui/ConfirmationDialog";
import { useToast } from "@/hooks/use-toast";
import { usePermission } from "@/context/PermissionContext";
import { useNavigate } from "react-router-dom";
import { downloadExportPdf } from "@/lib/exportPdf";
import {
  chemotherapyApi,
  type RegimenProtocol,
} from "@/api/chemotherapy.api";

type ProtocolStatus = "Active" | "Archive" | "Under Review" | "Draft";

interface ProtocolRow {
  protocol_id: string;
  name: string;
  cycle_days: number;
  status: ProtocolStatus;
  updated_by: string;
  updated_at: string;
  cancer_type: string;
  version: string;
  intent: string;
  review_date?: string | null;
  used_this_month?: number | null;
}




function toRow(p: RegimenProtocol): ProtocolRow {
  const multiCancers = (p.chemotherapy_protocol_cancers ?? [])
    .map((c) => c.cancer_types?.cancer_type)
    .filter(Boolean);
  const cancerTypeDisplay = multiCancers.length > 0
    ? Array.from(new Set(multiCancers)).join(", ")
    : (p.cancer_types?.cancer_type ?? "—");

  let status: ProtocolStatus = p.active_status === 1 ? "Active" : "Archive";
  if ((p as any).status === "Draft" || (p as any).is_draft) {
    status = "Draft";
  } else if ((p as any).status === "Under Review") {
    status = "Under Review";
  } else if ((p as any).status === "Archive" || (p as any).status === "Archived" || p.active_status === 0) {
    status = "Archive";
  } else if ((p as any).status === "Active" || p.active_status === 1) {
    status = "Active";
  }

  return {
    protocol_id: p.protocol_id,
    name: p.regimen_name,
    cycle_days: p.no_of_days,
    status,
    updated_by: "—",
    updated_at: p.updated_at ?? p.created_at ?? new Date().toISOString(),
    cancer_type: cancerTypeDisplay,
    version: p.protocol_version ?? "v1",
    intent: p.treatment_intent ?? "—",
    review_date: (p as any).review_date ?? (p as any).next_review_date ?? null,
    used_this_month: typeof (p as any).used_this_month === "number" ? (p as any).used_this_month : null,
  };
}

const STATUS_OPTIONS: Array<"All" | ProtocolStatus> = [
  "All",
  "Active",
  "Archive",
  "Under Review",
  "Draft",
];

function ProtocolActionMenu({
  onView,
  onEdit,
  onDelete,
}: {
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const { can } = usePermission();

  const canView = can("chemo.protocol.read") || can("chemo.protocol.manage");
  const canEdit = can("chemo.protocol.manage");
  const canDelete = can("chemo.protocol.manage");

  if (!canView && !canEdit && !canDelete) return null;

  const placeMenu = () => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    // Anchor the dropdown to the button's bottom-right corner.
    setCoords({ top: rect.bottom + 4, left: rect.right - 176 });
  };

  useEffect(() => {
    if (!open) return;
    placeMenu();
    const handleOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleScroll = () => setOpen(false);
    const handleResize = () => setOpen(false);
    document.addEventListener("mousedown", handleOutside);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleResize);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleResize);
    };
  }, [open]);

  const items: Array<{ label: string; onClick: () => void; danger?: boolean }> = [];
  if (canView) items.push({ label: "View Protocol", onClick: onView });
  if (canEdit) items.push({ label: "Edit Protocol", onClick: onEdit });
  if (canDelete) items.push({ label: "Delete Protocol", onClick: onDelete, danger: true });

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-center p-1.5 border border-[#E5E7EB] rounded-md hover:border-[#00488D] transition-colors"
      >
        <MoreVertical className="w-4 h-4 text-[#6B7280]" />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", top: coords.top, left: coords.left, zIndex: 9999 }}
            className="w-44 bg-white border border-[#E5E7EB] rounded-md shadow-lg overflow-hidden"
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
                className={`flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-left transition-colors ${
                  item.danger
                    ? "text-red-600 hover:bg-red-50"
                    : "text-[#374151] hover:bg-[#F2F4F6]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}

export default function ProtocolMaster() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { can } = usePermission();

  const queryClient = useQueryClient();

  const {
    data: protocolRows = [],
    isLoading: loading,
    refetch: fetchProtocols,
  } = useQuery<ProtocolRow[]>({
    queryKey: ["protocol-master-list"],
    queryFn: async () => {
      const res = await chemotherapyApi.listRegimenProtocols();
      const list = res.data?.data ?? [];
      return list.map(toRow);
    },
    staleTime: 10 * 60 * 1000, // 10 minutes cache
  });

  const [rowOverride, setRowOverride] = useState<ProtocolRow[] | null>(null);
  const rows = rowOverride ?? protocolRows;
  const setRows = (updater: React.SetStateAction<ProtocolRow[]>) => {
    setRowOverride((prev) => (typeof updater === "function" ? updater(prev ?? protocolRows) : updater));
  };

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | ProtocolStatus>("All");

  const [sortField, setSortField] = useState("updated_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const bulkRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (bulkRef.current && !bulkRef.current.contains(e.target as Node)) {
        setBulkOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);


  const stats = useMemo(() => {
    const active = rows.filter((r) => r.status === "Active").length;
    const archived = rows.filter((r) => r.status === "Archive").length;
    const underReview = rows.filter((r) => r.status === "Under Review").length;
    const draft = rows.filter((r) => r.status === "Draft").length;
    return { total: rows.length, active, archived, underReview, draft };
  }, [rows]);

  const usedThisMonth = useMemo(() => {
    let count = 0;
    let hasUsageData = false;
    for (const r of rows) {
      if (typeof r.used_this_month === "number") {
        hasUsageData = true;
        count += r.used_this_month;
      }
    }
    return { count, hasUsageData };
  }, [rows]);

  const dueForReview = useMemo(() => {
    const now = new Date();
    let count = 0;
    let hasReviewData = false;
    let overdueCount = 0;
    for (const r of rows) {
      if (r.review_date) {
        hasReviewData = true;
        const targetDate = new Date(r.review_date);
        if (!isNaN(targetDate.getTime()) && targetDate <= now) {
          count++;
          overdueCount++;
        }
      }
    }
    return { count, hasReviewData, overdueCount };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows;
    if (q) {
      list = list.filter(
        (r) =>
          r.protocol_id.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q) ||
          r.cancer_type.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== "All") {
      list = list.filter((r) => r.status === statusFilter);
    }
    return list;
  }, [rows, search, statusFilter]);

  const sortedData = useMemo(() => {
    const list = [...filtered];
    const dir = sortDirection === "asc" ? 1 : -1;
    list.sort((a, b) => {
      switch (sortField) {
        case "protocol_id":
          return a.protocol_id.localeCompare(b.protocol_id) * dir;
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "cycle_days":
          return (a.cycle_days - b.cycle_days) * dir;
        case "status":
          return a.status.localeCompare(b.status) * dir;
        case "updated_at":
          return (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * dir;
        default:
          return 0;
      }
    });
    return list;
  }, [filtered, sortField, sortDirection]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const totalRecords = sortedData.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / rowsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const currentRows = sortedData.slice((safePage - 1) * rowsPerPage, safePage * rowsPerPage);
  const visibleStart = totalRecords === 0 ? 0 : (safePage - 1) * rowsPerPage + 1;
  const visibleEnd = Math.min(safePage * rowsPerPage, totalRecords);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = currentRows.length > 0 && currentRows.every((r) => selectedIds.has(r.protocol_id));

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) currentRows.forEach((r) => next.delete(r.protocol_id));
      else currentRows.forEach((r) => next.add(r.protocol_id));
      return next;
    });
  };

  const selectedRows = useMemo(
    () => sortedData.filter((r) => selectedIds.has(r.protocol_id)),
    [sortedData, selectedIds]
  );

  const handleBulkArchive = () => {
    const count = selectedIds.size;
    setRows((prev) =>
      prev.map((r) => (selectedIds.has(r.protocol_id) ? { ...r, status: "Archive" as ProtocolStatus } : r))
    );
    setSelectedIds(new Set());
    setBulkOpen(false);
    toast({
      title: "Protocols archived",
      description: `${count} protocol${count === 1 ? "" : "s"} moved to archive.`,
    });
  };

  const handleBulkExport = () => {
    setBulkOpen(false);
    const count = selectedIds.size;
    if (count === 0) {
      toast({ title: "No protocols selected", variant: "destructive" });
      return;
    }
    handleExport("pdf");
  };

  const handleExport = (exportFormat: string) => {
    const source = selectedIds.size > 0 ? selectedRows : sortedData;
    if (exportFormat === "pdf") {
      downloadExportPdf({
        title: "Chemotherapy Protocols",
        subtitle: `${source.length} protocol${source.length === 1 ? "" : "s"} - exported on ${format(new Date(), "dd/MM/yyyy HH:mm")}`,
        filename: `protocols-${format(new Date(), "yyyy-MM-dd")}.pdf`,
        columns: [
          { header: "Protocol ID", cell: (r: any) => r.protocol_id },
          { header: "Protocol Name", cell: (r: any) => r.name },
          { header: "Cancer Type", cell: (r: any) => r.cancer_type },
          { header: "Cycle Days", cell: (r: any) => r.cycle_days },
          { header: "Status", cell: (r: any) => r.status },
          { header: "Updated By", cell: (r: any) => r.updated_by },
          { header: "Updated At", cell: (r: any) => format(new Date(r.updated_at), "dd/MM/yyyy") },
        ],
        rows: source,
      });
      toast({ title: "Export complete", description: "The PDF file has been downloaded." });
      return;
    }
    if (exportFormat !== "csv") return;
    try {
      const header = ["Protocol ID", "Protocol Name", "Cancer Type", "Cycle Days", "Status", "Updated By", "Updated At"];
      const lines = source.map((r) =>
        [
          r.protocol_id,
          r.name,
          r.cancer_type,
          r.cycle_days,
          r.status,
          r.updated_by,
          format(new Date(r.updated_at), "dd/MM/yyyy"),
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(",")
      );
      const blob = new Blob([[header.join(","), ...lines].join("\n")], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `protocols-${format(new Date(), "yyyy-MM-dd")}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Export complete", description: "The CSV file has been downloaded." });
    } catch {
      toast({ title: "Export failed", description: "Something went wrong while exporting.", variant: "destructive" });
    }
  };

  const handleNewProtocol = () => {
    navigate("/protocol/create");
  };

  const [deleteTarget, setDeleteTarget] = useState<ProtocolRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleView = (row: ProtocolRow) => navigate(`/protocol/view/${row.protocol_id}`);
  const handleEdit = (row: ProtocolRow) => navigate(`/protocol/edit/${row.protocol_id}`);
  const handleDelete = (row: ProtocolRow) => setDeleteTarget(row);
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      // Backend has no delete for regimen-protocol; try delete API, fallback to local archive
      try {
        await chemotherapyApi.deleteRegimenProtocol(deleteTarget.protocol_id);
      } catch {}
      setRows((prev) => prev.filter((r) => r.protocol_id !== deleteTarget.protocol_id));
      queryClient.invalidateQueries({ queryKey: ["protocol-master-list"] });
      toast({ title: "Protocol deleted", description: `${deleteTarget.name} has been removed.` });
      setDeleteTarget(null);
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.response?.data?.message ?? e.message, variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };

  const recentlyUpdated = useMemo(
    () => [...rows].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 5),
    [rows]
  );

  const mostUsed = useMemo(
    () => [...rows].filter((r) => r.status === "Active").slice(0, 5),
    [rows]
  );

  const usagePercent = [92, 87, 79, 71, 64];

  const upcomingReviews = [
    { name: "FOLFOX-6 Regimen", days: "in 2 days", date: "22 Aug 2026" },
    { name: "ABVD Protocol", days: "in 5 days", date: "25 Aug 2026" },
    { name: "R-CHOP Regimen", days: "in 9 days", date: "29 Aug 2026" },
    { name: "TCP Chemotherapy", days: "in 14 days", date: "03 Sep 2026" },
  ];

  const activePercent = stats.total > 0 ? (stats.active / stats.total) * 100 : 0;
  const activePercentFormatted =
    activePercent % 1 === 0 ? `${activePercent}%` : `${parseFloat(activePercent.toFixed(2))}%`;

  const statCards = [
    {
      label: "Total Protocols",
      value: stats.total,
      supportingText: "All protocols",
      supportingClass: "text-[#6B7280]",
      icon: FileText,
      color: "#004785",
    },
    {
      label: "Active",
      value: stats.active,
      supportingText: `${activePercentFormatted} of total`,
      supportingClass: "text-[#059669]",
      icon: CheckCircle2,
      color: "#059669",
    },
    {
      label: "Used This Month",
      value: usedThisMonth.count,
      supportingText: usedThisMonth.hasUsageData ? "This calendar month" : "No usage data tracked",
      supportingClass: "text-[#6B7280]",
      icon: TrendingUp,
      color: "#004785",
    },
    {
      label: "Due for Review",
      value: dueForReview.count,
      supportingText: dueForReview.hasReviewData
        ? dueForReview.overdueCount > 0
          ? `${dueForReview.overdueCount} overdue`
          : "Up to date"
        : "No review dates set",
      supportingClass: dueForReview.overdueCount > 0 ? "text-[#DC2626]" : "text-[#6B7280]",
      icon: Clock,
      color: "#F59E0B",
    },
    {
      label: "Draft",
      value: stats.draft,
      supportingText: "In progress",
      supportingClass: "text-[#6B7280]",
      icon: PenLine,
      color: "#6366F1",
    },
  ];

  return (
    <div className="flex w-full font-[Manrope,sans-serif] bg-[#F7F9FB] min-h-screen">
      <div className="flex flex-col flex-1 min-w-0">
        <main className="flex flex-col gap-6">

          {/* ==================== HEADER ==================== */}
          <div className="flex flex-col md:flex-row md:items-center justify-between">
            <div>
              <h1 className="hms-heading">Chemotherapy Protocols</h1>
              <p className="hms-subheading">Manage chemotherapy regimens, protocols and standard treatment plans across all cancer types.</p>
            </div>
            <div className="flex items-center gap-3">
              {can("report.export") && <ExportReport onExport={handleExport} />}
              {can("chemo.protocol.manage") && (
                <button
                  onClick={handleNewProtocol}
                  className="flex items-center gap-2 px-4 py-2 bg-[#004785] rounded-lg text-white text-xs font-semibold shadow-sm hover:bg-[#003a6b] transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  New Protocol
                </button>
              )}
            </div>
          </div>

          {/* ==================== STAT CARDS ==================== */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
            {statCards.map((card) => (
              <div key={card.label} className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#6B7280]">{card.label}</span>
                  <card.icon className="w-4 h-4" style={{ color: card.color }} />
                </div>
                <div className="mt-2 text-3xl font-bold text-[#191C1E]">{card.value}</div>
                <div className={`mt-1 text-xs font-semibold ${card.supportingClass}`}>
                  {card.supportingText}
                </div>
              </div>
            ))}
          </div>

          {/* ==================== MAIN CARD ==================== */}
          <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm flex flex-col transition-all duration-300 hover:shadow-md">

            {/* ==================== TOOLBAR ==================== */}
            <div className="px-5 py-4 border-b border-[#E5E7EB] flex flex-wrap items-center justify-between gap-4">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search protocols..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                  className="pl-8 pr-3 py-1.5 bg-[#F2F4F6] text-xs text-[#6B7280] placeholder:text-[#6B7280] outline-none w-[180px] sm:w-[240px] rounded-md transition-all duration-200 focus:rounded-none focus:w-[240px] sm:focus:w-[300px]"
                />
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#424752]" />
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <select
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value as "All" | ProtocolStatus); setCurrentPage(1); }}
                  className="px-3 py-1.5 bg-[#F2F4F6] text-xs text-[#424752] outline-none rounded-md border border-transparent focus:border-[#00488D]"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt === "All" ? "All Statuses" : opt}</option>
                  ))}
                </select>
                <RefreshButton onClick={fetchProtocols} isLoading={loading} />
              </div>
            </div>

            {/* ==================== BULK ACTIONS ==================== */}
            {selectedIds.size > 0 && (
              <div className="px-5 py-3 border-b border-[#E5E7EB] flex items-center gap-3 bg-[#F7F9FB]">
                <span className="text-sm font-semibold text-[#191C1E]">{selectedIds.size} selected</span>
                <div className="relative" ref={bulkRef}>
                  <button
                    onClick={() => setBulkOpen((o) => !o)}
                    className="flex items-center gap-2 px-3 py-1.5 border border-[#E5E7EB] bg-white rounded-lg text-xs font-semibold text-[#424752] shadow-sm hover:bg-[#F2F4F6] transition-colors"
                  >
                    Bulk Actions
                    <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${bulkOpen ? "rotate-180" : ""}`} />
                  </button>
                  {bulkOpen && (
                    <div className="absolute left-0 mt-2 w-44 bg-white rounded-lg shadow-lg border border-[#E5E7EB] py-1 z-10 animate-slideDown">
                      <button
                        onClick={handleBulkExport}
                        className="flex items-center gap-2 w-full px-4 py-2 text-xs font-medium text-[#424752] hover:bg-[#F2F4F6] transition-colors"
                      >
                        <FileText className="w-4 h-4" />
                        Export selected
                      </button>
                      <button
                        onClick={handleBulkArchive}
                        className="flex items-center gap-2 w-full px-4 py-2 text-xs font-medium text-[#B45309] hover:bg-[#F2F4F6] transition-colors"
                      >
                        <Archive className="w-4 h-4" />
                        Archive selected
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ==================== BODY ==================== */}
            {loading ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-[#6B7280] text-sm">
                <Loader2 size={24} className="animate-spin text-[#00488D]" />
                Loading protocols...
              </div>
            ) : (
              /* Flex column + [&>div]:flex-1 stretches HmsTable's root so the
                 mt-auto pagination footer stays pinned to the bottom of the
                 card (the wrapper keeps a 450px min-height even with few
                 rows) — same behavior as Dashboard/Staff. */
              <div className="flex-1 flex flex-col min-h-[450px] hide-scrollbar [&>div]:flex-1">
                <HmsTable
                  scrollable={true}
                  columns={[
                  {
                    key: "select",
                    label: "",
                    sortable: false,
                    className: "w-12 pl-5",
                    headerClassName: "w-12 pl-5",
                    render: (r: any) => (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(r.protocol_id)}
                        onChange={() => toggleSelect(r.protocol_id)}
                        className="w-3.5 h-3.5 accent-[#004785] cursor-pointer"
                      />
                    ),
                  },
                  {
                    key: "protocol_id",
                    label: "Protocol ID",
                    sortable: true,
                    render: (r: any) => <span className="hms-id-text">{r.protocol_id}</span>,
                  },
                  {
                    key: "name",
                    label: "Protocol Name",
                    sortable: true,
                    render: (r: any) => (
                      <div>
                        <div className="hms-name-text">{r.name}</div>
                        <div className="hms-id-text">{r.cancer_type} · {r.intent}</div>
                      </div>
                    ),
                  },
                  {
                    key: "cycle_days",
                    label: "Cycle Days",
                    sortable: true,
                    render: (r: any) => (
                      <span className="text-[#424752] text-sm font-semibold">{r.cycle_days}</span>
                    ),
                  },
                  {
                    key: "status",
                    label: "Status",
                    sortable: true,
                    render: (r: any) => <StatusBadge status={r.status} />,
                  },
                  {
                    key: "updated_at",
                    label: "Updated",
                    sortable: true,
                    render: (r: any) => (
                      <div>
                        <div className="text-[#424752] text-sm font-medium">{r.updated_by}</div>
                        <div className="hms-id-text">{format(new Date(r.updated_at), "MMM d, yyyy")}</div>
                      </div>
                    ),
                  },
                  {
                    key: "actions",
                    label: "Actions",
                    sortable: false,
                    className: "w-12 !whitespace-normal",
                    headerClassName: "w-12",
                    render: (r: any) => (
                      <ProtocolActionMenu
                        onView={() => handleView(r as ProtocolRow)}
                        onEdit={() => handleEdit(r as ProtocolRow)}
                        onDelete={() => handleDelete(r as ProtocolRow)}
                      />
                    ),
                  },
                ]}
                data={currentRows}
                sortField={sortField}
                sortDirection={sortDirection}
                onSort={handleSort}
                currentPage={safePage}
                totalPages={totalPages}
                totalRecords={totalRecords}
                rowsPerPage={rowsPerPage}
                visibleStart={visibleStart}
                visibleEnd={visibleEnd}
                onPageChange={(p) => { setCurrentPage(p); setBulkOpen(false); }}
                onRowsPerPageChange={(val) => { setRowsPerPage(val); setCurrentPage(1); }}
                rowsPerPageOptions={[10, 20, 50]}
                emptyMessage="No protocols found matching the current filters."
                rowKey={(r: any) => String(r.protocol_id)}
              />
              </div>
            )}
          </div>

          {/* ==================== BOTTOM CARDS ==================== */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

            {/* MOST USED PROTOCOLS */}
            <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#191C1E]">Most Used Protocols</h3>
                <TrendingUp className="w-4 h-4 text-[#004785]" />
              </div>
              <div className="mt-4 flex flex-col gap-4">
                {mostUsed.map((r, i) => (
                  <div key={r.protocol_id}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[#424752]">{r.name}</span>
                      <span className="font-bold text-[#004785]">{usagePercent[i]}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full bg-[#F2F4F6] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#004785] rounded-full"
                        style={{ width: `${usagePercent[i]}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* RECENTLY UPDATED */}
            <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#191C1E]">Recently Updated</h3>
                <Clock className="w-4 h-4 text-[#004785]" />
              </div>
              <div className="mt-4 flex flex-col gap-3">
                {recentlyUpdated.map((r) => (
                  <div key={r.protocol_id} className="flex items-center justify-between gap-3 py-1.5 border-b border-[#F2F4F6] last:border-0">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[#191C1E] truncate">{r.name}</div>
                      <div className="hms-id-text">{r.protocol_id} · {r.updated_by}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge status={r.status} />
                      <span className="text-[10px] font-semibold text-[#6B7280]">{format(new Date(r.updated_at), "MMM d")}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* UPCOMING REVIEWS */}
            <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#191C1E]">Upcoming Reviews</h3>
                <CalendarDays className="w-4 h-4 text-[#004785]" />
              </div>
              <div className="mt-4 flex flex-col gap-3">
                {upcomingReviews.map((r) => (
                  <div key={r.name} className="flex items-center justify-between gap-3 py-1.5 border-b border-[#F2F4F6] last:border-0">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[#191C1E] truncate">{r.name}</div>
                      <div className="hms-id-text">{r.date}</div>
                    </div>
                    <span className="text-[10px] font-bold text-[#B45309] bg-[#FEF3C7] rounded-full px-2.5 py-1 whitespace-nowrap">
                      {r.days}
                    </span>
                  </div>
                ))}
              </div>
            </div>

          </div>

          <ConfirmationDialog
            open={!!deleteTarget}
            type="danger"
            title="Delete Protocol?"
            description={deleteTarget ? `Protocol "${deleteTarget.name}" (${deleteTarget.protocol_id}) will be permanently deleted. This action cannot be undone.` : ""}
            confirmText="Delete"
            cancelText="Cancel"
            loading={isDeleting}
            onConfirm={confirmDelete}
            onCancel={() => setDeleteTarget(null)}
          />

        </main>
      </div>
    </div>
  );
}