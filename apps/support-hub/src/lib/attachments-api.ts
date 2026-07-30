import { createAuthClient } from "@unified/auth-client";
import type {
  TicketAttachmentListResponse,
  TicketAttachmentResponse,
} from "@unified/types";

const client = createAuthClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL!,
});

export async function listAttachments(
  ticketId: string,
): Promise<TicketAttachmentListResponse> {
  return client.request<TicketAttachmentListResponse>(
    `/tickets/${ticketId}/attachments`,
  );
}

export async function uploadAttachment(
  ticketId: string,
  file: File,
): Promise<TicketAttachmentResponse> {
  const formData = new FormData();
  formData.append("file", file);
  return client.request<TicketAttachmentResponse>(
    `/tickets/${ticketId}/attachments`,
    {
      method: "POST",
      body: formData,
    },
  );
}

export async function downloadAttachment(
  ticketId: string,
  attachmentId: string,
  fileName: string,
): Promise<void> {
  const blob = await client.requestBlob(
    `/tickets/${ticketId}/attachments/${attachmentId}/download`,
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function deleteAttachment(
  ticketId: string,
  attachmentId: string,
): Promise<void> {
  await client.request<void>(
    `/tickets/${ticketId}/attachments/${attachmentId}`,
    {
      method: "DELETE",
    },
  );
}
