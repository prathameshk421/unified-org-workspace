"use client";

import { useAuth } from "@unified/auth-client/react";
import {
  NotificationBell,
  type NotificationBellItem,
} from "@unified/ui";
import { useCallback, useEffect, useState } from "react";
import {
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "../lib/notifications-api";

const POLL_MS = 60_000;

export function NotificationBellContainer({
  className = "",
}: {
  className?: string;
}) {
  const { status } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<NotificationBellItem[]>([]);

  const refresh = useCallback(async () => {
    if (status !== "authenticated") return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }
    try {
      const [countRes, listRes] = await Promise.all([
        fetchUnreadCount(),
        fetchNotifications(20),
      ]);
      setUnreadCount(countRes.count);
      setItems(listRes.items);
    } catch {
      // ignore transient poll errors
    }
  }, [status]);

  useEffect(() => {
    if (status !== "authenticated") {
      setUnreadCount(0);
      setItems([]);
      setOpen(false);
      return;
    }

    void refresh();
    const id = window.setInterval(() => {
      void refresh();
    }, POLL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [status, refresh]);

  if (status !== "authenticated") {
    return null;
  }

  return (
    <NotificationBell
      className={className}
      unreadCount={unreadCount}
      items={items}
      loading={loading}
      open={open}
      onToggle={() => {
        setOpen((prev) => {
          const next = !prev;
          if (next) {
            setLoading(true);
            void refresh().finally(() => setLoading(false));
          }
          return next;
        });
      }}
      onMarkRead={(id) => {
        void markNotificationRead(id).then(() => refresh());
      }}
      onMarkAllRead={() => {
        void markAllNotificationsRead().then(() => refresh());
      }}
    />
  );
}
