import { createAuthClient } from "@unified/auth-client";
import type {
  CreateTicketRequest,
  TicketListResponse,
  TicketResponse,
  UpdateTicketRequest,
  UpdateTicketStatusRequest,
} from "@unified/types";

const client = createAuthClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL!,
});

export async function listTickets(status?: string): Promise<TicketListResponse> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return client.request<TicketListResponse>(`/tickets${query}`);
}

export async function getTicket(id: string): Promise<TicketResponse> {
  return client.request<TicketResponse>(`/tickets/${id}`);
}

export async function createTicket(
  input: CreateTicketRequest,
): Promise<TicketResponse> {
  return client.request<TicketResponse>("/tickets", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateTicket(
  id: string,
  input: UpdateTicketRequest,
): Promise<TicketResponse> {
  return client.request<TicketResponse>(`/tickets/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function updateTicketStatus(
  id: string,
  input: UpdateTicketStatusRequest,
): Promise<TicketResponse> {
  return client.request<TicketResponse>(`/tickets/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteTicket(id: string): Promise<void> {
  await client.request<void>(`/tickets/${id}`, {
    method: "DELETE",
  });
}
