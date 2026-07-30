import { createAuthClient } from "@unified/auth-client";
import type {
  OrgSettingsResponse,
  UpdateOrgSettingsRequest,
} from "@unified/types";

const client = createAuthClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL!,
});

export async function getOrgSettings(): Promise<OrgSettingsResponse> {
  return client.request<OrgSettingsResponse>("/org/settings");
}

export async function updateOrgSettings(
  input: UpdateOrgSettingsRequest,
): Promise<OrgSettingsResponse> {
  return client.request<OrgSettingsResponse>("/org/settings", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
