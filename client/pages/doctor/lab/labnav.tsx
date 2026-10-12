import React from "react";
import { useNavigate, Link } from "react-router-dom";
import { Logo } from "@/components/hms/Logo";

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
      className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 min-h-screen fixed inset-y-0 left-0 z-20 select-none font-sans"
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
    </aside>
  );
}

