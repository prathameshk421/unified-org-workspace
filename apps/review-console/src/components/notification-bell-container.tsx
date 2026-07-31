"use client";

import { useAuth } from "@unified/auth-client/react";
import {
  NotificationBell,
  type NotificationBellItem,
  useToast,
} from "@unified/ui";
import { useCallback, useEffect, useState } from "react";
import type {
  NotificationListResponse,
  NotificationUnreadCountResponse,
} from "@unified/types";
import { apiFetch } from "@/lib/api";

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
  const { toast } = useToast();

  const refresh = useCallback(async () => {
    if (status !== "authenticated") return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }
    try {
      const [countRes, listRes] = await Promise.all([
        apiFetch<NotificationUnreadCountResponse>("/notifications/unread-count"),
        apiFetch<NotificationListResponse>("/notifications?limit=20"),
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

  const onToggle = () => {
    setOpen((prev) => {
      const next = !prev;
      if (next) {
        setLoading(true);
        void refresh().finally(() => setLoading(false));
      }
      return next;
    });
  };

  const onMarkRead = async (id: string) => {
    const previousItems = items;
    const previousUnreadCount = unreadCount;
    const wasUnread = items.some((item) => item.id === id && !item.readAt);
    setItems((current) =>
      current.map((item) => (item.id === id && !item.readAt ? { ...item, readAt: new Date().toISOString() } : item)),
    );
    if (wasUnread) setUnreadCount((current) => Math.max(0, current - 1));
    try {
      await apiFetch<unknown>(`/notifications/${id}/read`, { method: "POST" });
      await refresh();
    } catch {
      setItems(previousItems);
      setUnreadCount(previousUnreadCount);
      toast("Could not mark notification as read.", "error");
    }
  };

  const onMarkAllRead = async () => {
    const previousItems = items;
    const previousUnreadCount = unreadCount;
    setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
    setUnreadCount(0);
    try {
      await apiFetch<unknown>("/notifications/read-all", { method: "POST" });
      await refresh();
    } catch {
      setItems(previousItems);
      setUnreadCount(previousUnreadCount);
      toast("Could not mark notifications as read.", "error");
    }
  };

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
      onToggle={onToggle}
      onMarkRead={(id) => void onMarkRead(id)}
      onMarkAllRead={() => void onMarkAllRead()}
    />
  );
}
