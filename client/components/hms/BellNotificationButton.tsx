import React, { useRef, useState, useEffect } from "react";
import { Bell, X, Check } from "lucide-react";
import { useNotifications } from "@/context/NotificationContext";
import { useFollowUpAlerts } from "@/context/FollowUpAlertContext";
import { FollowUpAlertSection } from "@/components/hms/FollowUpAlertList";
import { cn } from "@/lib/utils";

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

interface BellNotificationButtonProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function BellNotificationButton({ className = "", size = "md" }: BellNotificationButtonProps) {
  const { notifications, unreadCount: activityUnread, isLoading, error, markAllAsRead, clearAll, removeNotification, refetch } =
    useNotifications();
  /* Follow-ups due are part of this list (and of its count). */
  const followUps = useFollowUpAlerts();
  const hasFollowUps = followUps.enabled && followUps.alerts.length > 0;
  const unreadCount = activityUnread + (followUps.enabled ? followUps.unreadCount : 0);
  const [isOpen, setIsOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 10000);
    return () => clearInterval(interval);
  }, []);

  const sizeClasses = {
    sm: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-11 w-11",
  };

  const iconSizes = {
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-6 w-6",
  };

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (popoverRef.current && !popoverRef.current.contains(target)) {
        if (triggerRef.current && !triggerRef.current.contains(target)) {
          setIsOpen(false);
        }
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const renderNotification = (item: typeof notifications[0]) => {
    const unread = item.createdAt > (window as any).__HMS_LAST_SEEN__ || false;

    return (
      <article
        key={item.id}
        className="relative flex gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-[#f0f2f5]"
      >
        {unread && (
          <span className="absolute left-0 top-5 h-2 w-2 rounded-full bg-[#003ec7]" />
        )}

        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
            item.role === "doctor" && "bg-[#e9efff]",
            item.role === "staff" && "bg-[#eef1f9]",
            item.role === "admin" && "bg-[#fff0e7]",
            item.role === "patient" && "bg-[#e9f8f1]",
            item.role === "appointment" && "bg-[#f0eaff]",
            item.role === "booking" && "bg-[#e9f8f1]",
            item.role === "checkin" && "bg-[#fef3c7]",
            item.role === "account" && "bg-[#e9efff]"
          )}
        >
          {item.role === "doctor" && (
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#003ec7]" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M15 20a6 6 0 0 0-12 0" strokeLinecap="round" />
              <circle cx="9" cy="7" r="4" />
              <path d="M19 8v6M16 11h6" strokeLinecap="round" />
            </svg>
          )}
          {item.role === "staff" && (
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#434656]" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="9" cy="8" r="3.5" />
              <path d="M3 20a6 6 0 0 1 12 0" strokeLinecap="round" />
              <path d="M17 8h4M19 6v4" strokeLinecap="round" />
            </svg>
          )}
          {item.role === "admin" && (
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#d65f00]" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 3l7 3v5c0 4.5-2.9 7.8-7 10-4.1-2.2-7-5.5-7-10V6l7-3Z" strokeLinejoin="round" />
              <path d="M9.5 12l1.7 1.7 3.5-3.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          {item.role === "patient" && (
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#138a52]" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="9" cy="8" r="3.5" />
              <path d="M3 20a6 6 0 0 1 12 0" strokeLinecap="round" />
              <path d="M17 11v6M14 14h6" strokeLinecap="round" />
            </svg>
          )}
          {item.role === "appointment" && (
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#7046c9]" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M16 3v4M8 3v4M3 10h18" strokeLinecap="round" />
              <path d="M8 14h3M8 17h5" strokeLinecap="round" />
            </svg>
          )}
          {item.role === "booking" && (
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#138a52]" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M9 3v4M15 3v4M3 9h18" strokeLinecap="round" />
              <path d="M9 13h6M9 16h4" strokeLinecap="round" />
            </svg>
          )}
          {item.role === "checkin" && (
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#d65f00]" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M9 11l3 3L22 4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          {item.role === "account" && (
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#003ec7]" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" strokeLinecap="round" />
            </svg>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-start justify-between gap-3">
            <h3 className="truncate text-xs font-semibold tracking-[0.02em] text-[#131b2e]">
              {item.title}
            </h3>

            <div className="flex shrink-0 items-center gap-2">
              <span className="text-[11px] font-medium leading-[14px] text-[#434656]">
                {timeAgo(item.createdAt)}
              </span>

              {unread && (
                <span aria-label="Unread indicator" className="h-2 w-2 rounded-full bg-[#003ec7]" />
              )}

              <button
                type="button"
                onClick={() => removeNotification(item.id)}
                aria-label="Delete notification"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[#8a8fa3] transition-colors hover:bg-[#eef1f9] hover:text-[#434656] focus:outline-none focus:ring-2 focus:ring-[#003ec7]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <p className="text-[12px] font-normal leading-[18px] text-[#434656]">
            {item.message}
          </p>
        </div>
      </article>
    );
  };

  return (
    <div className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
        onClick={() => setIsOpen((v) => !v)}
        className={cn(
          "relative flex items-center justify-center rounded-full text-[#8a8fa3] transition-colors hover:bg-[#eef1f9] hover:text-[#434656]",
          sizeClasses[size]
        )}
      >
        <Bell className={iconSizes[size]} />
        {unreadCount > 0 && (
          <>
            <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[#e53e3e] ring-2 ring-white animate-pulse" />
            <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#e53e3e] px-1 text-[10px] font-bold leading-none text-white">
              {unreadCount > 99 ? "99+" : unreadCount > 9 ? "9+" : unreadCount}
            </span>
          </>
        )}
      </button>

      {isOpen && (
        <div
          ref={popoverRef}
          className="absolute right-0 top-full z-50 mt-2 w-[380px] overflow-hidden rounded-xl border border-[#e5e7ef] bg-white shadow-[0_10px_40px_-10px_rgba(0,0,0,0.16)]"
          role="dialog"
          aria-label="Notifications"
        >
          <header className="flex items-center justify-between border-b border-[#e5e7ef] bg-white px-5 py-4">
            <h1 className="text-base font-semibold tracking-[0.01em] text-[#131b2e]">
              Notifications
              {unreadCount > 0 && (
                <span className="ml-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#003ec7] px-1.5 text-[10px] font-bold leading-none text-white">
                  {unreadCount}
                </span>
              )}
            </h1>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={markAllAsRead}
                disabled={unreadCount === 0}
                className={cn(
                  "text-xs font-semibold tracking-[0.02em] text-[#003ec7] transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-[#003ec7]",
                  unreadCount === 0 && "opacity-40 cursor-not-allowed"
                )}
              >
                <Check className="h-3 w-3 inline mr-1" />
                Mark all read
              </button>
              <button
                type="button"
                onClick={clearAll}
                disabled={notifications.length === 0}
                className={cn(
                  "text-xs font-semibold tracking-[0.02em] text-[#93000a] transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-[#93000a]",
                  notifications.length === 0 && "opacity-40 cursor-not-allowed"
                )}
              >
                <X className="h-3 w-3 inline mr-1" />
                Clear all
              </button>
            </div>
          </header>

          <main className="flex max-h-[420px] w-full flex-col gap-6 overflow-y-auto bg-[#f8fafc] p-4">
            <FollowUpAlertSection portal="doctor" onNavigate={() => setIsOpen(false)} />

            {isLoading && (
              <p className="text-center text-xs text-[#434656]">Loading notifications...</p>
            )}

            {!isLoading && error && (
              <p className="text-center text-xs text-[#93000a]">{error}</p>
            )}

            {!isLoading && !error && notifications.length === 0 && !hasFollowUps && (
              <p className="py-6 text-center text-xs text-[#434656]">No new notifications</p>
            )}

            {!isLoading && notifications.length > 0 && (
              <section>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#434656]">
                  Today
                </h2>
                <div className="flex flex-col gap-1">
                  {notifications.map(renderNotification)}
                </div>
              </section>
            )}
          </main>
        </div>
      )}
    </div>
  );
}