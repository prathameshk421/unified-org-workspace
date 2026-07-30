import { apiFetch } from "./api";
import type {
  ConnectionDto,
  ConnectionRecipientDto,
} from "@unified/types";

export async function listConnections(): Promise<{ connections: ConnectionDto[] }> {
  return apiFetch<{ connections: ConnectionDto[] }>("/connections");
}

export async function requestConnection(
  partnerOrgSlug: string,
): Promise<ConnectionDto> {
  return apiFetch<ConnectionDto>("/connections", {
    method: "POST",
    body: JSON.stringify({ partnerOrgSlug }),
  });
}

export async function acceptConnection(id: string): Promise<ConnectionDto> {
  return apiFetch<ConnectionDto>(`/connections/${id}/accept`, {
    method: "POST",
  });
}

export async function rejectConnection(id: string): Promise<ConnectionDto> {
  return apiFetch<ConnectionDto>(`/connections/${id}/reject`, {
    method: "POST",
  });
}

export async function revokeConnection(id: string): Promise<ConnectionDto> {
  return apiFetch<ConnectionDto>(`/connections/${id}/revoke`, {
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
  return apiFetch<{ recipients: ConnectionRecipientDto[]; total: number }>(
    `/connections/${connectionId}/recipients${qs ? `?${qs}` : ""}`,
  );
}
