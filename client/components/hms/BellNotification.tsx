import { useState, useRef, useEffect } from "react";
import { Bell, Check, Trash2 } from "lucide-react";
import { useNotifications } from "@/context/NotificationContext";
import { useFollowUpAlerts } from "@/context/FollowUpAlertContext";
import { FollowUpAlertSection } from "@/components/hms/FollowUpAlertList";
import { cn } from "@/lib/utils";

const ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-emerald-50 text-emerald-600",
  UPDATE: "bg-blue-50 text-blue-600",
  DELETE: "bg-red-50 text-red-600",
};

const ACTION_LABELS: Record<string, string> = {
  CREATE: "Created",
  UPDATE: "Updated",
  DELETE: "Deleted",
};

const ROLE_ICONS: Record<string, string> = {
  doctor: "\u{1F468}\u200D\u2695\uFE0F",
  staff: "\u{1F464}",
  admin: "\u{1F6E1}\uFE0F",
  patient: "\u{1FA7A}",
  appointment: "\u{1F4C5}",
  account: "\u{1F511}",
  booking: "\u{1F4CB}",
  checkin: "\u2705",
};

function timeAgo(timestamp: number) {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export function BellNotification() {
  const { unreadCount: activityUnread, notifications, markAllAsRead, removeNotification } = useNotifications();
  /* Follow-ups due are part of this list (and of its count). */
  const followUps = useFollowUpAlerts();
  const hasFollowUps = followUps.enabled && followUps.alerts.length > 0;
  const unreadCount = activityUnread + (followUps.enabled ? followUps.unreadCount : 0);
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleToggle = () => {
    setOpen((prev) => {
      if (!prev) {
        markAllAsRead();
      }
      return !prev;
    });
  };

  const items = notifications || [];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={handleToggle}
        className="relative flex items-center justify-center w-9 h-9 rounded-lg border border-[#E5E7EB] bg-white hover:bg-[#F2F4F6] transition-colors outline-none"
      >
        <Bell className="w-4 h-4 text-[#6B7280]" />
        {unreadCount > 0 && (
          <>
            <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white animate-pulse" />
            <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none shadow-sm">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          </>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[380px] bg-white rounded-xl border border-[#E5E7EB] shadow-[0_10px_40px_-10px_rgba(0,0,0,0.16)] z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#E5E7EB] bg-[#F8F9FF]">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[#0B1C30]">Notifications</h3>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold">
                  {unreadCount}
                </span>
              )}
            </div>
            {items.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  markAllAsRead();
                }}
                className="flex items-center gap-1 text-[11px] font-semibold text-[#00488D] hover:text-[#003A6B] transition-colors"
              >
                <Check className="w-3 h-3" />
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[480px] overflow-y-auto">
            {hasFollowUps && (
              <div className="border-b border-[#E5E7EB] bg-[#f8fafc] p-3">
                <FollowUpAlertSection portal="admin" onNavigate={() => setOpen(false)} />
              </div>
            )}
            {items.length === 0 && hasFollowUps ? null : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-[#94A3B8]">
                <Bell className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-xs font-medium">No notifications yet</p>
              </div>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-start gap-3 px-4 py-3 border-b border-[#F1F5F9] hover:bg-[#F8F9FF] transition-colors group",
                    item.createdAt > Date.now() - 300000 && "bg-blue-50/30"
                  )}
                >
                  {/* Role icon */}
                  <span className="text-base mt-0.5 shrink-0">
                    {ROLE_ICONS[item.role] || "\u{1F514}"}
                  </span>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-[#0B1C30]">
                        {item.title}
                      </span>
                      {item.action && (
                        <span
                          className={cn(
                            "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase shrink-0",
                            ACTION_COLORS[item.action] || "bg-gray-100 text-gray-500"
                          )}
                        >
                          {ACTION_LABELS[item.action] || item.action}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#64748B] mt-0.5 leading-relaxed">
                      {item.message}
                    </p>
                    <span className="text-[10px] text-[#94A3B8] mt-1 block">
                      {timeAgo(item.createdAt)}
                    </span>
                  </div>

                  {/* Dismiss */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeNotification(item.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-[#94A3B8] hover:text-red-500 transition-all mt-0.5 shrink-0"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {(items.length > 0 || hasFollowUps) && (
            <div className="px-4 py-2.5 border-t border-[#E5E7EB] bg-[#F8F9FF]">
              <button
                type="button"
                onClick={() => {
                  window.location.href = "/notifications";
                }}
                className="w-full text-center text-[11px] font-semibold text-[#00488D] hover:text-[#003A6B] transition-colors"
              >
                View all notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
