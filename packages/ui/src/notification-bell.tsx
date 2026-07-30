"use client";

import { Bell } from "lucide-react";

export type NotificationBellItem = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};

export type NotificationBellProps = {
  unreadCount: number;
  items: NotificationBellItem[];
  loading?: boolean;
  open: boolean;
  onToggle: () => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  className?: string;
};

export function NotificationBell({
  unreadCount,
  items,
  loading = false,
  open,
  onToggle,
  onMarkRead,
  onMarkAllRead,
  className = "",
}: NotificationBellProps) {
  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
        aria-expanded={open}
        data-testid="notification-bell"
        onClick={onToggle}
        className="relative inline-flex items-center justify-center rounded-full border border-border bg-surface-raised p-2 text-foreground transition-colors duration-200 hover:bg-surface-muted"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unreadCount > 0 ? (
          <span
            className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 font-sans text-[10px] font-semibold text-white"
            data-testid="notification-unread-badge"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-surface-raised"
          data-testid="notification-panel"
          role="dialog"
          aria-label="Notifications"
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
            <p className="font-sans text-sm font-medium text-foreground">Notifications</p>
            {unreadCount > 0 ? (
              <MarkAllButton onClick={onMarkAllRead} />
            ) : null}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <p className="px-3 py-4 font-sans text-sm text-muted">Loading…</p>
            ) : items.length === 0 ? (
              <p className="px-3 py-4 font-sans text-sm text-muted">No notifications yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`w-full px-3 py-3 text-left transition-colors duration-200 hover:bg-surface-muted ${
                        item.readAt ? "opacity-70" : ""
                      }`}
                      onClick={() => {
                        if (!item.readAt) onMarkRead(item.id);
                      }}
                    >
                      <p className="font-sans text-sm font-medium text-foreground">
                        {item.title}
                      </p>
                      <p className="mt-1 font-serif text-xs text-muted line-clamp-3">
                        {item.body}
                      </p>
                      <p className="mt-1 font-sans text-[10px] uppercase tracking-wide text-muted">
                        {new Date(item.createdAt).toLocaleString()}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MarkAllButton({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="font-sans text-xs font-medium text-brand-600 transition-colors duration-200 hover:text-brand-700"
      onClick={onClick}
      data-testid="notification-mark-all"
    >
      Mark all read
    </button>
  );
}
