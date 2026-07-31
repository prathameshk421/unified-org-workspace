# Local Setup Guide

This guide explains how to run the project locally. Architecture diagrams for the three main components are in this folder:

- `identity-org-service.png` — Identity/Org service (Express API, port 4000)
- `dashboard-1-support-hub.png` — Dashboard 1: Support Hub (port 3000)
- `dashboard-2-review-console.png` — Dashboard 2: Review & Audit Console (port 3001)

Both dashboards share the same Identity/Org session — log in on one and you are logged in on the other (localhost three-port mode).

---

## Prerequisites

- **Node.js 22+**
- **pnpm 10+** (`corepack enable` if needed)
- **Docker Desktop** (for PostgreSQL)

---

## Quick start (one command)

From the repo root:

```bash
chmod +x run_all.sh   # first time only
./run_all.sh
```

This script will:

1. Create `.env` from `.env.example` if missing
2. Run `pnpm install`
3. Start Postgres via Docker Compose
4. Run database migrations and seed demo data
5. Start the API + both dashboards with `pnpm dev`

Press **Ctrl+C** to stop the apps. Postgres keeps running in Docker until you run `docker compose down`.

---

## Manual setup (step by step)

Use this if you prefer to run each step yourself or need to debug.

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

The defaults in `.env.example` work for local development. Key values:

| Variable | Local default | Purpose |
| -------- | ------------- | ------- |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/unified_org` | Migrations and seed (owner role) |
| `DATABASE_APP_URL` | `postgresql://unified_app:unified_app@localhost:5432/unified_org` | API runtime (append-only audit) |
| `API_PORT` | `4000` | Identity/Org service |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | API URL for both dashboards |
| `CORS_ORIGINS` | `http://localhost:3000,http://localhost:3001` | Credentialed cross-origin requests |
| `JWT_SECRET` | dev secret in example | Must be ≥32 characters |

### 3. Start PostgreSQL

```bash
docker compose up -d
```

Postgres listens on `localhost:5432`. Wait until it is healthy:

```bash
docker compose exec postgres pg_isready -U postgres -d unified_org
```

### 4. Run migrations

```bash
pnpm --filter @unified/db db:migrate:deploy
```

This applies all Prisma migrations non-interactively (including the `unified_app` DB role and append-only audit permissions).

### 5. Seed demo data

```bash
pnpm --filter @unified/db db:seed
```

Creates sample orgs (Acme, Globex), users, tickets, PRs, a cross-org connection, and share grants.

### 6. Start all apps

```bash
pnpm dev
```

Turbo starts three processes in parallel:

| Component | Package | URL |
| --------- | ------- | --- |
| Identity/Org service | `@unified/api` | http://localhost:4000/health |
| Dashboard 1 — Support Hub | `@unified/support-hub` | http://localhost:3000 |
| Dashboard 2 — Review Console | `@unified/review-console` | http://localhost:3001 |

---

## Demo credentials

All seed users use password **`password123`**:

| Email | Org(s) | Notes |
| ----- | ------ | ----- |
| `alice@acme.com` | Acme | Admin |
| `bob@acme.com` | Acme | Member |
| `carol@globex.com` | Globex | Admin |
| `dave@example.com` | Acme + Globex | Dave — multi-org user |

Optional private Argus email tester: set `SEED_ARGUS_TEST_EMAIL` (and matching `DIGEST_EMAIL_ALLOWLIST`) in `.env` before `db:seed`. That account is **not** a public demo credential — Dave stays `dave@example.com`.

---

## What to try

1. **Login** — Open Support Hub and Review Console in two browser tabs. Log in on one; the other should show you as authenticated.
2. **Org switcher** — As Dave, switch between Acme and Globex. Both dashboards should reflect the active org.
3. **Tickets** — In Support Hub, browse and comment on tickets scoped to your active org.
4. **PRs & audit** — In Review Console, browse PRs and the audit log for your org.
5. **Cross-org share** — Demo seed includes an accepted org connection and item-level shares. Guests can view and comment only — no workspace-wide access.

---

## Optional: AI progress digest

Digests run via a background worker on a configurable UTC interval (default **3 hours** via `DIGEST_INTERVAL_HOURS`; Cloud Scheduler in production). They are not triggered on page load. To generate notifications once:

```bash
DIGEST_ENABLED=true pnpm --filter @unified/api digest:once
```

Optional LLM summaries need `GROQ_API_KEY` in `.env`. Without it, a template fallback is used. See `.env.example` for all digest and email (Argus) variables.

---

## Verify the stack

```bash
curl http://localhost:4000/health
```

With the API running, optional automated checks:

```bash
pnpm test:auth        # Newman identity/RBAC smoke (API on :4000)
pnpm test:bola        # Product BOLA security gate (needs migrated DB)
```

End-to-end browser tests (starts services + Playwright):

```bash
bash scripts/run-auth-e2e.sh
```

---

## Troubleshooting

| Problem | Fix |
| ------- | --- |
| `Port 4000/3000/3001 already in use` | Stop the conflicting process: `lsof -iTCP:4000 -sTCP:LISTEN` |
| `Docker is not running` | Start Docker Desktop, then retry `./run_all.sh` |
| Migration errors | Ensure Postgres is up: `docker compose ps` |
| `401` on API calls | Check `JWT_SECRET` in `.env`; re-login after changing it |
| Dashboard can't reach API | Confirm `NEXT_PUBLIC_API_URL=http://localhost:4000` and `CORS_ORIGINS` includes both dashboard URLs |
| Session not syncing between dashboards | On localhost this should work out of the box. In production, Hub and Console must share one hostname (gateway) or a parent `COOKIE_DOMAIN` |

To reset the database:

```bash
docker compose down -v
docker compose up -d
pnpm --filter @unified/db db:migrate:deploy
pnpm --filter @unified/db db:seed
```

---

## Monorepo layout

| Path | Description |
| ---- | ----------- |
| `apps/api` | Identity/Org service — Express API |
| `apps/support-hub` | Dashboard 1 — Support Hub (Next.js 15) |
| `apps/review-console` | Dashboard 2 — Review & Audit Console (Next.js 15) |
| `apps/gateway` | nginx reverse proxy (production single-hostname deploy only) |
| `packages/auth-client` | Shared auth provider, credentialed fetch, org switcher |
| `packages/db` | Prisma schema, migrations, seed |
| `packages/types` | Shared TypeScript types |
| `packages/ui` | Shared React UI components |
| `packages/config` | ESLint, Prettier, Tailwind, TS configs |

Stack: **pnpm + Turborepo**, Node 22, Prisma 6, PostgreSQL 16.

---

## Common commands

```bash
./run_all.sh                              # full bootstrap + dev
pnpm dev                                  # start API + both dashboards
pnpm build                                # production build all apps
pnpm lint                                 # ESLint
pnpm typecheck                            # TypeScript
pnpm --filter @unified/db db:studio       # Prisma Studio (interactive)
docker compose down                       # stop Postgres (add -v to wipe data)
```
