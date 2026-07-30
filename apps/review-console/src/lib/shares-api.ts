import type {
  PullRequestSummary,
  ShareGrantDto,
} from "@unified/types";
import { apiFetch } from "./api";

export async function listPrShares(
  prId: string,
): Promise<{ shares: ShareGrantDto[] }> {
  return apiFetch<{ shares: ShareGrantDto[] }>(`/prs/${prId}/shares`);
}

export async function createPrShare(
  prId: string,
  input: { recipientUserId: string; partnerOrgSlug: string },
): Promise<ShareGrantDto> {
  return apiFetch<ShareGrantDto>(`/prs/${prId}/shares`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function revokeShare(shareId: string): Promise<ShareGrantDto> {
  return apiFetch<ShareGrantDto>(`/shares/${shareId}`, {
    method: "DELETE",
  });
}

export async function listSharedPrs(): Promise<{ prs: PullRequestSummary[] }> {
  return apiFetch<{ prs: PullRequestSummary[] }>("/shared/prs");
}

export async function listInboundShares(): Promise<{ shares: ShareGrantDto[] }> {
  return apiFetch<{ shares: ShareGrantDto[] }>("/shares/inbound");
}

export async function listOutboundShares(): Promise<{ shares: ShareGrantDto[] }> {
  return apiFetch<{ shares: ShareGrantDto[] }>("/shares/outbound");
}
