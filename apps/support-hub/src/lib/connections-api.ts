import { createAuthClient } from "@unified/auth-client";
import type {
  ConnectionDto,
  ConnectionRecipientDto,
} from "@unified/types";

const client = createAuthClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL!,
});

export async function listConnections(): Promise<{ connections: ConnectionDto[] }> {
  return client.request<{ connections: ConnectionDto[] }>("/connections");
}

export async function requestConnection(
  partnerOrgSlug: string,
): Promise<ConnectionDto> {
  return client.request<ConnectionDto>("/connections", {
    method: "POST",
    body: JSON.stringify({ partnerOrgSlug }),
  });
}

export async function acceptConnection(id: string): Promise<ConnectionDto> {
  return client.request<ConnectionDto>(`/connections/${id}/accept`, {
    method: "POST",
  });
}

export async function rejectConnection(id: string): Promise<ConnectionDto> {
  return client.request<ConnectionDto>(`/connections/${id}/reject`, {
    method: "POST",
  });
}

export async function revokeConnection(id: string): Promise<ConnectionDto> {
  return client.request<ConnectionDto>(`/connections/${id}/revoke`, {
    method: "POST",
  });
}

export async function listRecipients(
  connectionId: string,
  query?: string,
): Promise<{ recipients: ConnectionRecipientDto[]; total: number }> {
  const params = new URLSearchParams();
  if (query?.trim()) {
    params.set("query", query.trim());
  }
  const qs = params.toString();
  return client.request<{ recipients: ConnectionRecipientDto[]; total: number }>(
    `/connections/${connectionId}/recipients${qs ? `?${qs}` : ""}`,
  );
}
