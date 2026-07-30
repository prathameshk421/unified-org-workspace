import { createAuthClient } from "@unified/auth-client";
import type {
  PullRequestSummary,
  ShareGrantDto,
  TicketResponse,
} from "@unified/types";

const client = createAuthClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL!,
});

export async function listTicketShares(
  ticketId: string,
): Promise<{ shares: ShareGrantDto[] }> {
  return client.request<{ shares: ShareGrantDto[] }>(
    `/tickets/${ticketId}/shares`,
  );
}

export async function createTicketShare(
  ticketId: string,
  input: { recipientUserId: string; partnerOrgSlug: string },
): Promise<ShareGrantDto> {
  return client.request<ShareGrantDto>(`/tickets/${ticketId}/shares`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function listPrShares(
  prId: string,
): Promise<{ shares: ShareGrantDto[] }> {
  return client.request<{ shares: ShareGrantDto[] }>(`/prs/${prId}/shares`);
}

export async function createPrShare(
  prId: string,
  input: { recipientUserId: string; partnerOrgSlug: string },
): Promise<ShareGrantDto> {
  return client.request<ShareGrantDto>(`/prs/${prId}/shares`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function revokeShare(shareId: string): Promise<ShareGrantDto> {
  return client.request<ShareGrantDto>(`/shares/${shareId}`, {
    method: "DELETE",
  });
}

export async function listSharedTickets(): Promise<{ tickets: TicketResponse[] }> {
  return client.request<{ tickets: TicketResponse[] }>("/shared/tickets");
}

export async function listSharedPrs(): Promise<{ prs: PullRequestSummary[] }> {
  return client.request<{ prs: PullRequestSummary[] }>("/shared/prs");
}

export async function listInboundShares(): Promise<{ shares: ShareGrantDto[] }> {
  return client.request<{ shares: ShareGrantDto[] }>("/shares/inbound");
}

export async function listOutboundShares(): Promise<{ shares: ShareGrantDto[] }> {
  return client.request<{ shares: ShareGrantDto[] }>("/shares/outbound");
}
