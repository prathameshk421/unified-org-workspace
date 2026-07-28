/**
 * Auth client shell — populated in feat/identity-auth.
 */
export const AUTH_CLIENT_VERSION = "0.0.0";

export function createAuthClient() {
  return {
    version: AUTH_CLIENT_VERSION,
  };
}
