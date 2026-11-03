import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Stethoscope,
  Users,
  Calendar,
  BedDouble,
  Shield,
  Building2,
  ChevronDown,
  Sparkles,
  LayoutGrid,
  FileSpreadsheet,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePermission } from "@/context/PermissionContext";

interface AdminQuickActionToolbarProps {
  showWardOccupancy: boolean;
  onToggleWardOccupancy: () => void;
  className?: string;
}

export function AdminQuickActionToolbar({
  showWardOccupancy,
  onToggleWardOccupancy,
  className = "",
}: AdminQuickActionToolbarProps) {
  const navigate = useNavigate();
  const { can } = usePermission();

  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`}>
      {/* Toggle Ward & Bed Occupancy */}
      <button
        type="button"
        onClick={onToggleWardOccupancy}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
          showWardOccupancy
            ? "bg-blue-50 text-[#00488D] border-blue-200 shadow-sm"
            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
        }`}
        title="Toggle Ward & Bed Occupancy view"
      >
        <BedDouble className="w-3.5 h-3.5 text-[#00488D]" />
        <span>Ward Occupancy</span>
        <span
          className={`w-2 h-2 rounded-full ${
            showWardOccupancy ? "bg-[#00488D]" : "bg-slate-300"
          }`}
        />
      </button>

      {/* Admin Center Shortcut */}
      {can("permission.manage") && (
        <button
          type="button"
          onClick={() => navigate("/admin")}
          className="flex items-center gap-1.5 px-3 py-2 bg-white text-slate-700 hover:text-[#00488D] hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold transition-all"
        >
          <Shield className="w-3.5 h-3.5 text-violet-600" />
          <span>Admin Center</span>
        </button>
      )}

      {/* Action Dropdown Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1.5 px-4 py-2 bg-[#00488D] hover:bg-[#00386e] text-white rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Admin Actions</span>
            <ChevronDown className="w-3.5 h-3.5 opacity-80" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="end"
          sideOffset={6}
          className="w-56 p-1.5 rounded-xl border border-slate-200 bg-white shadow-xl z-50 text-slate-800"
        >
          <DropdownMenuLabel className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1">
            Clinical & Staffing
          </DropdownMenuLabel>

          {can("appointment.create") && (
            <DropdownMenuItem
              onClick={() => navigate("/appointments/add")}
              className="flex items-center gap-2 px-2 py-1.5 text-xs font-semibold rounded-lg hover:bg-blue-50 hover:text-[#00488D] cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              <span>Book Appointment</span>
            </DropdownMenuItem>
          )}

          {can("doctor.create") && (
            <DropdownMenuItem
              onClick={() => navigate("/staff/add?role=doctor")}
              className="flex items-center gap-2 px-2 py-1.5 text-xs font-semibold rounded-lg hover:bg-blue-50 hover:text-[#00488D] cursor-pointer"
            >
              <Stethoscope className="w-3.5 h-3.5 text-teal-600" />
              <span>Add Doctor</span>
            </DropdownMenuItem>
          )}

          {can("employee.create") && (
            <DropdownMenuItem
              onClick={() => navigate("/staff/add")}
              className="flex items-center gap-2 px-2 py-1.5 text-xs font-semibold rounded-lg hover:bg-blue-50 hover:text-[#00488D] cursor-pointer"
            >
              <Users className="w-3.5 h-3.5 text-indigo-600" />
              <span>Add Staff Member</span>
            </DropdownMenuItem>
          )}

          {can("admission.create") && (
            <DropdownMenuItem
              onClick={() => navigate("/inpatient/admissions")}
              className="flex items-center gap-2 px-2 py-1.5 text-xs font-semibold rounded-lg hover:bg-blue-50 hover:text-[#00488D] cursor-pointer"
            >
              <BedDouble className="w-3.5 h-3.5 text-emerald-600" />
              <span>Inpatient Admissions</span>
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator className="my-1 bg-slate-100" />
          <DropdownMenuLabel className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1">
            Facilities & System
          </DropdownMenuLabel>

          {can("branch.create") && (
            <DropdownMenuItem
              onClick={() => navigate("/branches/add")}
              className="flex items-center gap-2 px-2 py-1.5 text-xs font-semibold rounded-lg hover:bg-blue-50 hover:text-[#00488D] cursor-pointer"
            >
              <Building2 className="w-3.5 h-3.5 text-amber-600" />
              <span>Add Hospital Branch</span>
            </DropdownMenuItem>
          )}

          {can("permission.manage") && (
            <DropdownMenuItem
              onClick={() => navigate("/admin/permissions")}
              className="flex items-center gap-2 px-2 py-1.5 text-xs font-semibold rounded-lg hover:bg-blue-50 hover:text-[#00488D] cursor-pointer"
            >
              <Shield className="w-3.5 h-3.5 text-violet-600" />
              <span>Permission Matrix</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

