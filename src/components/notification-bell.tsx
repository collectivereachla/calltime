"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/app/(app)/notifications/actions";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

interface Props {
  unreadCount: number;
}

function timeAgo(dateStr: string) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);

  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function notificationIcon(type: string) {
  switch (type) {
    case "contract_signed":
      return "✍";
    case "contract_countersigned":
      return "✓";
    case "contract_assigned":
      return "📄";
    default:
      return "●";
  }
}

export function NotificationBell({ unreadCount }: Props) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function toggleOpen() {
    if (!open) {
      setLoading(true);
      const data = await getNotifications(15);
      setNotifications(data as Notification[]);
      setLoading(false);

      // Position dropdown relative to button
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        const dropdownWidth = 340;
        let left = rect.left;
        // If dropdown would go off right edge, align to right edge of button
        if (left + dropdownWidth > window.innerWidth - 16) {
          left = rect.right - dropdownWidth;
        }
        setDropdownPos({ top: rect.bottom + 8, left });
      }
    }
    setOpen(!open);
  }

  async function handleClick(notif: Notification) {
    if (!notif.read_at) {
      markNotificationRead(notif.id);
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notif.id ? { ...n, read_at: new Date().toISOString() } : n
        )
      );
    }
    setOpen(false);
    if (notif.link) {
      router.push(notif.link);
      router.refresh();
    }
  }

  async function handleMarkAllRead() {
    await markAllNotificationsRead();
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
    );
    router.refresh();
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={toggleOpen}
        className="relative p-1.5 text-ash hover:text-ink transition-colors"
        title="Notifications"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 text-[9px] font-medium bg-brick text-paper rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1 leading-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && dropdownPos && (
        <div
          ref={dropdownRef}
          className="fixed w-[340px] bg-card border border-bone rounded-card shadow-lg overflow-hidden z-50"
          style={{ top: dropdownPos.top, left: dropdownPos.left }}
        >
          <div className="px-4 py-3 border-b border-bone flex items-center justify-between">
            <p className="text-body-sm font-medium text-ink">Notifications</p>
            {notifications.some((n) => !n.read_at) && (
              <button
                onClick={handleMarkAllRead}
                className="text-body-xs text-brick hover:text-brick/80 font-medium transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading && (
              <div className="px-4 py-6 text-center">
                <p className="text-body-sm text-muted">Loading…</p>
              </div>
            )}

            {!loading && notifications.length === 0 && (
              <div className="px-4 py-6 text-center">
                <p className="text-body-sm text-muted">No notifications yet.</p>
              </div>
            )}

            {!loading &&
              notifications.map((notif) => (
                <button
                  key={notif.id}
                  onClick={() => handleClick(notif)}
                  className={`w-full px-4 py-3 text-left flex gap-3 hover:bg-paper/80 transition-colors border-b border-bone/50 last:border-b-0 ${
                    !notif.read_at ? "bg-brick/[0.03]" : ""
                  }`}
                >
                  <span className="text-sm mt-0.5 shrink-0">
                    {notificationIcon(notif.type)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-body-sm ${
                        !notif.read_at
                          ? "text-ink font-medium"
                          : "text-ash"
                      }`}
                    >
                      {notif.title}
                    </p>
                    {notif.body && (
                      <p className="text-body-xs text-muted mt-0.5">
                        {notif.body}
                      </p>
                    )}
                    <p className="text-[10px] text-muted mt-1">
                      {timeAgo(notif.created_at)}
                    </p>
                  </div>
                  {!notif.read_at && (
                    <span className="w-2 h-2 rounded-full bg-brick shrink-0 mt-1.5" />
                  )}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
