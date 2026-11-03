import React, { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate, Link } from "react-router-dom";
import DoctorSidebar from "./DoctorSidebar";
import { UserProfileDropdown } from "@/components/ui/User_profile_dropdown";
import { ConfirmationDialog } from "@/components/ui/ConfirmationDialog";
import { remove, getUser } from "../../utils/token";
import { employeeApi } from "../../api/employee.api";
import { BranchFilterProvider } from "@/context/BranchFilterContext";
import { AIChatBox } from "@/components/hms/AIChatBox";
import { Logo } from "@/components/hms/Logo";
import { Menu, X, LayoutDashboard, Users, CalendarX, FileText, CalendarCheck } from "lucide-react";

interface DoctorLayoutProps {
  children?: React.ReactNode;
  doctorName?: string;
}

const DoctorLayout: React.FC<DoctorLayoutProps> = ({
  children,
  doctorName,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userName, setUserName] = useState("");
  const [userSubtext, setUserSubtext] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string>(() => localStorage.getItem("user_photo") || "");
  const [avatarLoading, setAvatarLoading] = useState<boolean>(() => !localStorage.getItem("user_photo"));

  useEffect(() => {
    const user = getUser();
    if (user) {
      setUserName(user.username || "");
      setUserSubtext(user.role || user.user_id || "");
    }
    let mounted = true;
    const fetchAvatar = () => {
      employeeApi
        .getMe()
        .then((res) => {
          if (!mounted) return;
          const url = res.data?.data?.employee?.employee_photo_URL || "";
          setAvatarUrl(url);
          if (url) localStorage.setItem("user_photo", url);
          else localStorage.removeItem("user_photo");
          setAvatarLoading(false);
        })
        .catch(() => {
          if (mounted) setAvatarLoading(false);
        });
    };
    fetchAvatar();
    return () => { mounted = false; };
  }, []);

  const handleLogout = () => {
    setLogoutOpen(false);
    remove();
    localStorage.removeItem("user_info");
    localStorage.removeItem("user_photo");
    navigate("/");
  };

  const getActiveItem = () => {
    if (location.pathname === "/dashboard" || location.pathname === "/doctor-dashboard") {
      return "Dashboard";
    }

    if (location.pathname.startsWith("/doctor/appointments")) {
      return "Appointment";
    }

    if (location.pathname.startsWith("/doctor/leave")) {
      return "Leave";
    }

    if (location.pathname.startsWith("/doctor/reviews")) {
      return "Review";
    }

    if (location.pathname.startsWith("/doctor/schedule")) {
      return "My schedule";
    }

    return "Dashboard";
  };

  const handleNavigation = (item: string) => {
    switch (item) {
      case "Dashboard":
        navigate("/dashboard");
        break;

      case "Appointment":
        navigate("/doctor/appointments");
        break;

      case "Leave":
        navigate("/doctor/leave");
        break;

      case "Review":
        navigate("/doctor/reviews");
        break;

      case "My schedule":
        navigate("/doctor/schedule");
        break;

      default:
        break;
    }
  };

  const mobileNavItems = [
    { name: "Dashboard",   icon: LayoutDashboard },
    { name: "Appointment", icon: Users },
    { name: "Leave",       icon: CalendarX },
    { name: "Review",      icon: FileText },
    { name: "My schedule", icon: CalendarCheck },
  ];

  return (
    <BranchFilterProvider>
      <div className="min-h-screen h-screen flex bg-[#f8fafc] overflow-hidden">

        {/* Doctor Sidebar — desktop only */}
        <div className="hidden lg:block">
          <DoctorSidebar
            activeItem={getActiveItem()}
            onNavigate={handleNavigation}
            doctorName={doctorName}
          />
        </div>

        {/* Mobile drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden">
            {/* Transparent backdrop for click-outside close */}
            <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setMobileMenuOpen(false)} />
            {/* Drawer panel */}
            <div className="fixed left-0 top-0 z-50 h-full w-[230px] bg-[#f6f7f9] border-r border-gray-200 flex flex-col shadow-xl">
              {/* Logo + close */}
              <div className="flex items-center justify-between px-5 pt-6 pb-6">
                <Link to="/doctor" onClick={() => setMobileMenuOpen(false)} className="block focus:outline-none">
                  <Logo className="w-full max-w-[155px] h-auto" iconPosition="left" />
                </Link>
                <button type="button" onClick={() => setMobileMenuOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-200/70">
                  <X className="h-4 w-4 text-gray-500" strokeWidth={2} />
                </button>
              </div>
              {/* Nav items */}
              <nav className="flex-1 flex flex-col gap-1.5 px-3">
                {mobileNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = getActiveItem() === item.name;
                  return (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => { handleNavigation(item.name); setMobileMenuOpen(false); }}
                      className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-all duration-150 ${isActive ? "bg-[#dce6f8] text-[#0f3d91]" : "text-gray-600 hover:bg-gray-200/70 hover:text-gray-800"}`}
                    >
                      {isActive && <div className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-[#0f3d91]" />}
                      <Icon className={`w-[19px] h-[19px] flex-shrink-0 ${isActive ? "text-[#0f3d91]" : "text-gray-500"}`} strokeWidth={2} />
                      <span className="font-semibold text-[14px]">{item.name}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>
        )}

        {/* Doctor Content */}
        <div className="flex-1 min-w-0 flex flex-col h-screen overflow-hidden bg-[#f8fafc]">
          <header className="flex h-16 items-center justify-between bg-white/90 backdrop-blur-sm border-b border-slate-200 px-6">

            {/* Mobile/tablet: hamburger + logo */}
            <div className="flex items-center gap-3 lg:hidden">
              <button
                type="button"
                aria-label="Open menu"
                onClick={() => setMobileMenuOpen(v => !v)}
                className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-slate-100"
              >
                <Menu className="h-5 w-5 text-slate-600" strokeWidth={2} />
              </button>
              <Link to="/doctor" className="block focus:outline-none">
                <Logo className="w-[200px] h-auto" iconPosition="left" />
              </Link>
            </div>

            {/* Desktop: empty left placeholder */}
            <div className="hidden lg:block" />

            <UserProfileDropdown
              userName={userName || "Doctor"}
              userSubtext={userSubtext || "Doctor"}
              userAvatar={avatarUrl || undefined}
              avatarLoading={avatarLoading}
              onLogout={() => setLogoutOpen(true)}
              profilePath="/doctor/profile"
              notificationsPath="/doctor/notifications"
            />
          </header>
          <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden">
            {children ?? <Outlet />}
          </main>
        </div>

        <ConfirmationDialog
          open={logoutOpen}
          type="danger"
          title="Log Out?"
          description="Are you sure you want to log out? Any unsaved changes may be lost."
          confirmText="Log Out"
          cancelText="Stay"
          onConfirm={handleLogout}
          onCancel={() => setLogoutOpen(false)}
        />
        <AIChatBox />
      </div>
    </BranchFilterProvider>
  );
};

export default DoctorLayout;