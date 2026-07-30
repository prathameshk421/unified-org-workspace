import { AuthError, createAuthClient } from "@unified/auth-client";
import type {
  NotificationListResponse,
  NotificationUnreadCountResponse,
} from "@unified/types";

const client = createAuthClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL!,
});

export async function fetchNotifications(
  limit = 20,
): Promise<NotificationListResponse> {
  return client.request<NotificationListResponse>(
    `/notifications?limit=${limit}`,
  );
}

export async function fetchUnreadCount(): Promise<NotificationUnreadCountResponse> {
  return client.request<NotificationUnreadCountResponse>(
    "/notifications/unread-count",
  );
}

export async function markNotificationRead(id: string): Promise<void> {
  await client.request(`/notifications/${id}/read`, { method: "POST" });
}

export async function markAllNotificationsRead(): Promise<void> {
  await client.request("/notifications/read-all", { method: "POST" });
}

export { AuthError };
