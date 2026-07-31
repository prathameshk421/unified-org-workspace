# AGENTS.md

Guidance for AI coding agents working in this repo.

## Project

Multi-tenant dual-dashboard workspace (Support Hub ticketing + Review & Audit Console) sharing one Identity/Org API. Built as a Froncort.AI full-stack assignment with shared JWT auth, org isolation, append-only audit, and cross-org item sharing.

**Docs:**

- [docs/setup.md](docs/setup.md) — local setup
- [docs/known-limitations.md](docs/known-limitations.md) — limitations and future work

## Hand long-running commands to the user

**Do not run** commands that stay open, take a long time, or commonly cause agents to mistake silence for failure. Instead, print the exact command for the user and wait for their output.

Hand to the user:

- `docker compose up -d` and any Docker build/pull
- `./run_all.sh`, `pnpm dev`, Turbo persistent watchers, `next dev`, `tsx watch`
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
- Org-scoped routes: `requireAuth` → `requireOrgAccess` (sets `req.orgId` from session only) → `requireRole(...)` as needed. Platform routes: `requirePlatformAdmin`.
- Logout-everywhere must invalidate prior tokens across both dashboards.
- **Production Hub↔Console sync** requires a shared site: Cloud Run gateway (single hostname) **or** custom parent domain. Three default `*.run.app` hosts do **not** sync under Chrome third-party cookie partitioning. Localhost three-port remains valid. Gateway paths: landing `/`, Hub `/support-hub`, Console `/console`, API `/api`.
- Do **not** relax Helmet CORP for session sync. Do **not** force `COOKIE_DOMAIN` on gateway / default Cloud Run deploy.
- `ProtectedRoute` / `GuestRoute`: redirect only when `authStatus === "unauthenticated"`, never while `loading`.
- Hydrate via `GET /auth/me` with `Cache-Control: no-store`. `@unified/auth-client` does single-flight `401 → refresh → retry once`.
- Seed attachments: the seed job uploads demo files to GCS when `ATTACHMENTS_*` is set (same as API runtime).

## Tier gating & audit

- **Tier 1 is non-negotiable.** Auth, session sync, org scoping, audit append-only, and RBAC must pass before Tier 2 product work.
- **Audit log** is append-only at the **database permission level** (`unified_app` = INSERT/SELECT only on `audit_logs`) — app-only guards are insufficient.
- **DB dual URLs:** migrate/seed with `DATABASE_URL`; runtime API uses `DATABASE_APP_URL`.
- **AI digests:** scoped to user's org + explicit shares only; delivered by background job (`pnpm --filter @unified/api digest:once`), not on page load; dedicated leak test in BOLA allowlist. Groq LLM summarizes scoped facts only (template fallback).

## Repo layout & ports

| Piece                                              | Notes                                               |
| -------------------------------------------------- | --------------------------------------------------- |
| `apps/api`                                         | Express Identity/Org API — port **4000**            |
| `apps/support-hub`                                 | Next.js 15 Dashboard 1 — port **3000**              |
| `apps/review-console`                              | Next.js 15 Dashboard 2 — port **3001**              |
| `packages/auth-client`                             | Credentialed fetch + `AuthProvider` / `OrgSwitcher` |
| `packages/db`                                      | Prisma schema, migrations, seed                     |
| `packages/types`, `packages/ui`, `packages/config` | Shared types, UI, tooling config                    |

Stack: pnpm + Turborepo, Node 22, Prisma 6, PostgreSQL 16.

## Verification

- Auth/BOLA foundation: `pnpm test:auth` (Newman) — only if API is already running on `:4000`; otherwise ask the user.
- Audit append-only (DB permissions): `pnpm --filter @unified/db test:audit-append-only` — requires Postgres migrated; uses `DATABASE_APP_URL`.
- Product BOLA gate: `pnpm test:bola`
- Session sync e2e: `bash scripts/run-auth-e2e.sh` — hand to the user.
- Demo users: `password123` (alice@acme.com, bob@acme.com, carol@globex.com, **dave** = `dave@example.com` multi-org Acme + Globex).

## Where to read more

- Local setup: [docs/setup.md](docs/setup.md)
- Known limitations: [docs/known-limitations.md](docs/known-limitations.md)
