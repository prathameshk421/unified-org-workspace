"use client";

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

function BellIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

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
        className="relative inline-flex items-center justify-center rounded-md border border-border bg-surface p-2 text-foreground hover:bg-surface-muted"
      >
        <BellIcon />
        {unreadCount > 0 ? (
          <span
            className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold text-white"
            data-testid="notification-unread-badge"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-md border border-border bg-surface shadow-lg"
          data-testid="notification-panel"
          role="dialog"
          aria-label="Notifications"
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <p className="text-sm font-medium text-foreground">Notifications</p>
            {unreadCount > 0 ? (
              <MarkAllButton onClick={onMarkAllRead} />
            ) : null}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <p className="px-3 py-4 text-sm text-muted">Loading…</p>
            ) : items.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted">No notifications yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`w-full px-3 py-3 text-left hover:bg-surface-muted ${
                        item.readAt ? "opacity-70" : ""
                      }`}
                      onClick={() => {
                        if (!item.readAt) onMarkRead(item.id);
                      }}
                    >
                      <p className="text-sm font-medium text-foreground">
                        {item.title}
                      </p>
                      <p className="mt-1 text-xs text-muted line-clamp-3">
                        {item.body}
                      </p>
                      <p className="mt-1 text-[10px] text-muted">
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
      className="text-xs font-medium text-brand-600 hover:underline"
      onClick={onClick}
      data-testid="notification-mark-all"
    >
      Mark all read
    </button>
  );
}
