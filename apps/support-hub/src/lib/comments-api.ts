import { createAuthClient } from "@unified/auth-client";
import type {
  CreateTicketCommentRequest,
  TicketCommentListResponse,
  TicketCommentResponse,
  UpdateTicketCommentRequest,
} from "@unified/types";

const client = createAuthClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL!,
});

export async function listComments(
  ticketId: string,
): Promise<TicketCommentListResponse> {
  return client.request<TicketCommentListResponse>(
    `/tickets/${ticketId}/comments`,
  );
}

export async function createComment(
  ticketId: string,
  input: CreateTicketCommentRequest,
): Promise<TicketCommentResponse> {
  return client.request<TicketCommentResponse>(
    `/tickets/${ticketId}/comments`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function updateComment(
  ticketId: string,
  commentId: string,
  input: UpdateTicketCommentRequest,
): Promise<TicketCommentResponse> {
  return client.request<TicketCommentResponse>(
    `/tickets/${ticketId}/comments/${commentId}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
}

export async function deleteComment(
  ticketId: string,
  commentId: string,
): Promise<void> {
  await client.request<void>(`/tickets/${ticketId}/comments/${commentId}`, {
    method: "DELETE",
  });
}
