import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { getUser, remove } from "@/utils/token";
import { Logo } from "@/components/hms/Logo";
import { employeeApi } from "@/api/employee.api";

export type LabTab =
  | "Dashboard"
  | "Sample Registration"
  | "Lab Orders"
  | "Samples Verification"
  | "Testing Samples"
  | "Report Generation"
  | "Report Transfer"
  | "Profile";

export interface LabNavProps {
  activeTab: LabTab;
  onTabChange?: (tab: LabTab) => void;
}

export default function LabNav({ activeTab, onTabChange }: LabNavProps) {
  const navigate = useNavigate();
  const currentUser = getUser();
  const displayName = currentUser?.username || "Admin";
  const displayRole =
    currentUser?.role_type === "LAB_TECHNICIAN"
      ? "Lab Technician"
      : currentUser?.role_type || "Admin User";

  const [avatarUrl, setAvatarUrl] = useState<string>(
    () => localStorage.getItem("user_photo") || ""
  );

  useEffect(() => {
    let mounted = true;
    const updatePhoto = (e: any) => {
      if (e?.detail) setAvatarUrl(e.detail);
    };
    window.addEventListener("profile-photo-updated", updatePhoto);

    if (!avatarUrl) {
      employeeApi
        .getMe()
        .then((res) => {
          if (!mounted) return;
          const url = res.data?.data?.employee?.employee_photo_URL || "";
          if (url) {
            setAvatarUrl(url);
            localStorage.setItem("user_photo", url);
          }
        })
        .catch(() => {});
    }

    return () => {
      mounted = false;
      window.removeEventListener("profile-photo-updated", updatePhoto);
    };
  }, []);

  const handleLogout = () => {
    remove();
    navigate("/", { replace: true });
  };

  const handleNavClick = (tab: LabTab, path: string) => {
    if (onTabChange) {
      onTabChange(tab);
    }
    if (activeTab !== tab) {
      navigate(path);
    }
  };

  return (
    <aside
      className="w-64 bg-white border-r border-slate-200 flex flex-col justify-between shrink-0 min-h-screen fixed inset-y-0 left-0 z-20 select-none font-sans"
      data-purpose="sidebar-navigation"
    >
      {/* Top Brand & Navigation */}
      <div className="p-6">
        {/* Brand Logo / Title */}
        <div className="mb-8" data-purpose="brand-header">
          <Link to="/lab/dashboard" className="block focus:outline-none">
            <Logo className="w-full max-w-[175px] h-auto" iconPosition="left" />
          </Link>
        </div>

        {/* Main Navigation Links */}
        <nav aria-label="Main Navigation" className="space-y-1.5">
          {/* Dashboard */}
          <button
            type="button"
            onClick={() => handleNavClick("Dashboard", "/lab/dashboard")}
            className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-lg font-medium text-sm transition-colors text-left cursor-pointer ${
              activeTab === "Dashboard"
                ? "bg-[#0b4a8b] text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <svg
              className={`w-5 h-5 shrink-0 ${activeTab === "Dashboard" ? "text-white" : "text-slate-500"}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              viewBox="0 0 24 24"
            >
              <rect height="7" rx="1.5" width="7" x="3" y="3" />
              <rect height="7" rx="1.5" width="7" x="14" y="3" />
              <rect height="7" rx="1.5" width="7" x="3" y="14" />
              <rect height="7" rx="1.5" width="7" x="14" y="14" />
            </svg>
            <span>Dashboard</span>
          </button>

          {/* Sample Registration */}
          <button
            type="button"
            onClick={() => handleNavClick("Sample Registration", "/lab/sample-registration")}
            aria-current={activeTab === "Sample Registration" ? "page" : undefined}
            className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-lg font-medium text-sm transition-colors text-left cursor-pointer ${
              activeTab === "Sample Registration"
                ? "bg-[#0b4a8b] text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <svg
              className={`w-5 h-5 shrink-0 ${activeTab === "Sample Registration" ? "text-white" : "text-slate-500"}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9 2 2 4-4" />
            </svg>
            <span>Sample Registration</span>
          </button>

          {/* Samples Verification */}
          <button
            type="button"
            onClick={() => handleNavClick("Samples Verification", "/lab/sample-verification")}
            aria-current={activeTab === "Samples Verification" ? "page" : undefined}
            className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-lg font-medium text-sm transition-colors text-left cursor-pointer ${
              activeTab === "Samples Verification"
                ? "bg-[#0b4a8b] text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <svg
              className={`w-5 h-5 shrink-0 ${activeTab === "Samples Verification" ? "text-white" : "text-slate-500"}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              viewBox="0 0 24 24"
            >
              <rect x="3" y="8" width="18" height="13" rx="3" />
              <path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="3" y1="13" x2="21" y2="13" />
            </svg>
            <span>Samples Verification</span>
          </button>

          {/* Testing Samples */}
          <button
            type="button"
            onClick={() => handleNavClick("Testing Samples", "/lab/testing-samples")}
            aria-current={activeTab === "Testing Samples" ? "page" : undefined}
            className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-lg font-medium text-sm transition-colors text-left cursor-pointer ${
              activeTab === "Testing Samples"
                ? "bg-[#0b4a8b] text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <svg
              className={`w-5 h-5 shrink-0 ${activeTab === "Testing Samples" ? "text-white" : "text-slate-500"}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              viewBox="0 0 24 24"
            >
              <path
                d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.941A2.25 2.25 0 0 1 17.07 16.5H6.93a2.25 2.25 0 0 1-1.16-.309L4.2 15.3M19.8 15.3A2.25 2.25 0 0 1 21 17.228v.522a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 17.75v-.522a2.25 2.25 0 0 1 1.2-1.928"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>Testing Samples</span>
          </button>

          {/* Report Generation */}
          <button
            type="button"
            onClick={() => handleNavClick("Report Generation", "/lab/report-generation")}
            aria-current={activeTab === "Report Generation" ? "page" : undefined}
            className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-lg font-medium text-sm transition-colors text-left cursor-pointer ${
              activeTab === "Report Generation"
                ? "bg-[#0b4a8b] text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <svg
              className={`w-5 h-5 shrink-0 ${activeTab === "Report Generation" ? "text-white" : "text-slate-500"}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              viewBox="0 0 24 24"
            >
              <path
                d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>Report Generation</span>
          </button>

          {/* Report Transfer */}
          <button
            type="button"
            onClick={() => handleNavClick("Report Transfer", "/lab/report-transfer")}
            aria-current={activeTab === "Report Transfer" ? "page" : undefined}
            className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-lg font-medium text-sm transition-colors text-left cursor-pointer ${
              activeTab === "Report Transfer"
                ? "bg-[#0b4a8b] text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <svg
              className={`w-5 h-5 shrink-0 ${activeTab === "Report Transfer" ? "text-white" : "text-slate-500"}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              viewBox="0 0 24 24"
            >
              <path
                d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>Report Transfer</span>
          </button>
        </nav>
      </div>

      {/* Bottom Sidebar Utilities & User Profile */}
      <div className="p-6 border-t border-slate-100 space-y-4" data-purpose="sidebar-footer">
        <nav aria-label="Support and Settings" className="space-y-1.5">
          <button
            type="button"
            className="flex items-center gap-3.5 px-3.5 py-2 rounded-lg text-slate-600 hover:bg-slate-50 font-medium text-sm transition-colors w-full text-left cursor-pointer"
            onClick={() => navigate("/lab/profile")}
          >
            <svg
              className="w-5 h-5 text-slate-500 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              viewBox="0 0 24 24"
            >
              <path
                d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.38.138.75.43 1.02l1.004.828c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.6 6.6 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-1.02l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>Settings</span>
          </button>
          <a
            className="flex items-center gap-3.5 px-3.5 py-2 rounded-lg text-slate-600 hover:bg-slate-50 font-medium text-sm transition-colors"
            href="#support"
            onClick={(e) => e.preventDefault()}
          >
            <svg
              className="w-5 h-5 text-slate-500 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              viewBox="0 0 24 24"
            >
              <path
                d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>Support</span>
          </a>
        </nav>

        {/* User Profile Badge & Logout */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <div
            onClick={() => navigate("/lab/profile")}
            className="flex items-center gap-3 cursor-pointer group flex-1 min-w-0"
            title="View Profile"
          >
            <div className="relative w-10 h-10 rounded-full overflow-hidden shrink-0 border border-slate-200">
              {avatarUrl ? (
                <img
                  alt={displayName}
                  className="w-full h-full object-cover"
                  src={avatarUrl}
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />
              ) : null}
              <div
                className={`w-full h-full bg-[#0b4a8b] text-white flex items-center justify-center font-bold text-sm ${
                  avatarUrl ? "hidden" : "flex"
                }`}
              >
                {displayName.charAt(0).toUpperCase()}
              </div>
            </div>
            <div className="truncate">
              <p className="text-sm font-semibold text-slate-900 group-hover:text-[#0b4a8b] transition-colors leading-tight truncate">
                {displayName}
              </p>
              <p className="text-xs text-slate-400 truncate">{displayRole}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            title="Sign Out"
            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}

