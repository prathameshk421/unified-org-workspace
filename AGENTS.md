# AGENTS.md

Guidance for AI coding agents working in this repo. For full requirements, read the docs — do not re-derive constraints from chat.

## Project

Multi-tenant dual-dashboard workspace (Support Hub ticketing + Review & Audit Console) sharing one Identity API. Built as a Froncort.AI full-stack assignment with shared JWT auth, org isolation, append-only audit, and cross-org item sharing.

**Source of truth:**

- [docs/requirements/assignment-spec.md](docs/requirements/assignment-spec.md)
- [docs/requirements/tiered-build-plan.md](docs/requirements/tiered-build-plan.md)
- [docs/requirements/identity-auth.md](docs/requirements/identity-auth.md)
- [docs/requirements/session-sync.md](docs/requirements/session-sync.md)
- [docs/requirements/rbac-middleware.md](docs/requirements/rbac-middleware.md)
- [docs/requirements/database-schema.md](docs/requirements/database-schema.md)
- [docs/setup.md](docs/setup.md)

## Hand long-running commands to the user

**Do not run** commands that stay open, take a long time, or commonly cause agents to mistake silence for failure. Instead, print the exact command for the user and wait for their output.

Hand to the user:

- `docker compose up -d` and any Docker build/pull
- `pnpm dev`, Turbo persistent watchers, `next dev`, `tsx watch`
- `pnpm --filter @unified/db db:migrate` (interactive migrate)
- `pnpm --filter @unified/db db:studio`
- `pnpm test:e2e` / `bash scripts/run-auth-e2e.sh` (starts API + both apps)
- Prisma generate or large `pnpm install` if it appears stuck
- Terraform apply / deploy scripts

Safe for the agent when needed: short read-only checks (`git status`, `rg`), quick `pnpm typecheck` / `pnpm lint`, targeted file edits, reading docs.

**Never** conclude a command failed from a timeout alone — ask the user for terminal output.

## Non-negotiable: BOLA / tenant isolation

Tenant isolation is enforced at the **query layer**. The **BOLA (Broken Object Level Authorization) test is non-negotiable.**

- Active org / `orgId` comes **only** from verified session/JWT (`req.auth.activeOrgId`, `GET /auth/me`) — **never** from client query, body, URL, or localStorage.
- **Exception:** `POST /auth/switch-org` may accept `orgId` but must validate membership (e.g. Alice cannot switch to Globex → 403).
- Isolation must hold under **direct API calls with manipulated IDs** → return **403/404**, covered by an automated test.
- **Frontend:** never put `orgId` on data fetches; `OrgSwitcher` may send `orgId` **only** to `switch-org`.
- **Cross-org:** item-level share only (one ticket/PR at a time); guests view + comment only; no workspace-wide access.
- When adding ticket/PR/audit queries: always scope by session org or explicit share grant — never trust a client-supplied resource owner id alone.

## Auth & session sync hard rules

- Cookies live on the **API origin** (`unified_access` 15m JWT, `unified_refresh` 7d opaque token). Dashboards use `credentials: "include"`; **never** `document.cookie` for auth.
- Active org is persisted on `Session.activeOrgId` (mirrored in JWT). Org switch updates all of the user's active sessions.
- `requireAuth` re-checks `Session.revokedAt` and live `OrgMembership` on every protected route.
- Org-scoped routes: `requireAuth` → `requireOrgAccess` (sets `req.orgId` from session only) → `requireRole(...)` as needed. Platform routes: `requirePlatformAdmin`. See [rbac-middleware.md](docs/requirements/rbac-middleware.md).
- Logout-everywhere must invalidate prior tokens across both dashboards.
- Do **not** relax Helmet CORP for session sync. Do **not** force `COOKIE_DOMAIN` on default Cloud Run deploy.
- `ProtectedRoute` / `GuestRoute`: redirect only when `authStatus === "unauthenticated"`, never while `loading`.
- Hydrate via `GET /auth/me` with `Cache-Control: no-store`. `@unified/auth-client` does single-flight `401 → refresh → retry once`.

## Tier gating & audit

- **Tier 1 is non-negotiable.** Do not start Tier 2 product work until Tier 1 passes its required tests (auth, session sync, org scoping, audit append-only, RBAC). See [tiered-build-plan.md](docs/requirements/tiered-build-plan.md).
- **Audit log** is append-only at the **database permission level** (`unified_app` = INSERT/SELECT only on `audit_logs`) — app-only guards are insufficient.
- **DB dual URLs:** migrate/seed with `DATABASE_URL`; runtime API uses `DATABASE_APP_URL`.
- **AI digests (when built):** scoped to user's org + explicit shares only; delivered by background job, not on page load; requires a dedicated leak test.

## Repo layout & ports

| Piece | Notes |
|---|---|
| `apps/api` | Express Identity API — port **4000** |
| `apps/support-hub` | Next.js 15 Dashboard 1 — port **3000** |
| `apps/review-console` | Next.js 15 Dashboard 2 — port **3001** |
| `packages/auth-client` | Credentialed fetch + `AuthProvider` / `OrgSwitcher` |
| `packages/db` | Prisma schema, migrations, seed |
| `packages/types`, `packages/ui`, `packages/config` | Shared types, UI, tooling config |

Stack: pnpm + Turborepo, Node 22, Prisma 6, PostgreSQL 16, Redis (provisioned; not yet used by app code).

## Verification

- Auth/BOLA foundation: `pnpm test:auth` (Newman) — only if API is already running on `:4000`; otherwise ask the user.
- Session sync e2e: `bash scripts/run-auth-e2e.sh` — hand to the user.
- Demo users: `*@example.com` / `password123` (alice, bob, carol, dave; **dave** = multi-org Acme + Globex).

## Where to read more

- Local setup: [docs/setup.md](docs/setup.md)
- Production deploy: [docs/deployment.md](docs/deployment.md)
- Monorepo scaffold decisions: [docs/requirements/monorepo-scaffold.md](docs/requirements/monorepo-scaffold.md)
