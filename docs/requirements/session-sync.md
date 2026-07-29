# Requirements — Session Sync (Branch 5 / `feat/session-sync`)

Shared Identity/Org session across Support Hub and Review Console via **API-origin httpOnly cookies** and credentialed browser fetches. Dashboards never read session cookies in JavaScript.

## Mental model

1. User logs in from either dashboard → browser `POST` to API with `credentials: "include"`.
2. API sets `unified_access` / `unified_refresh` on the **API host** (optionally `Domain=.parent.com`).
3. Each dashboard hydrates via `GET /auth/me` with `credentials: "include"`.
4. The browser attaches cookies to API requests; apps never call `document.cookie` for auth.

## Cookie SameSite matrix

| Environment | `COOKIE_DOMAIN` | Secure | SameSite | Notes |
|---|---|---|---|---|
| Local | unset | false | `strict` | Host-only cookies on `localhost:4000`; hub `:3000` / console `:3001` sync via credentialed API calls |
| Cloud Run default (`*.run.app`) | unset | true | `none` | Cross-site hub/console → api; requires CORS allowlist |
| Custom parent domain | `.example.com` | true | `strict` | `hub.` / `console.` / `api.` same-site |

`COOKIE_DOMAIN` stays **optional** (Terraform sets it only when `enable_custom_domain=true`). Do not force it on default deploy.

CSRF with `SameSite=None`: mutating `/auth/*` routes reject non-`application/json` Content-Type (415).

## Frontend package

`@unified/auth-client`:

- `.` — `createAuthClient` with single-flight `401 → refresh → retry once`
- `./react` — `AuthProvider`, `useAuth`, `OrgSwitcher` (no `next/*` imports)

Per-app adapters: `ProtectedRoute` / `GuestRoute` (redirect only when `authStatus === "unauthenticated"`, never while `loading`).

## BOLA rules (frontend)

- Active org comes only from JWT / `/auth/me` — never from URL, localStorage, or OrgSwitcher selection alone.
- `OrgSwitcher` may send `orgId` **only** to `POST /auth/switch-org`.
- Never put `orgId` on data fetches.
- After switch: re-fetch `/auth/me` and broadcast `ORG_SWITCHED` via `BroadcastChannel`.
- Backend exports `requireActiveOrg` for future resource routes (not wired to `/auth/*`).

## Acceptance criteria

1. Login on Support Hub → open Review Console (same browser) → `data-testid="auth-status"` shows the same user.
2. Logout on one dashboard → other dashboard loses session on next navigation/hydration.
3. Logout-everywhere invalidates refresh; subsequent `/auth/me` and `/auth/refresh` return 401.
4. Multi-org user (`dave@example.com`) can switch org via OrgSwitcher; active org updates from server.
5. Alice cannot `switch-org` to Globex (403) — Newman.
6. Non-JSON `POST /auth/login` → 415 — Newman.
7. Default Cloud Run path unchanged (no Terraform / forced `COOKIE_DOMAIN`).

## Tests

```bash
# API (Newman) — API must be running on :4000 with seeded DB
pnpm test:auth

# Cross-dashboard (Playwright) — starts API + both apps
bash scripts/run-auth-e2e.sh
```

Demo users (password `password123`): `alice@acme.com`, `dave@example.com` (multi-org).

## Explicitly out of scope

- Full resource-ID BOLA tests (no tickets/PRs yet)
- RBAC `requireRole` middleware
- Next.js middleware SSR auth
- Enabling custom domain by default
