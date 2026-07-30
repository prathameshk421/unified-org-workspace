# Local Setup Guide

## Prerequisites

- Node.js 22+
- pnpm 10+
- Docker and Docker Compose

## Quick start

1. **Clone and install**

   ```bash
   pnpm install
   ```

2. **Configure environment**

   ```bash
   cp .env.example .env
   ```

3. **Start infrastructure**

   ```bash
   docker compose up -d
   ```

   Postgres runs on `localhost:5432`, Redis on `localhost:6379`.

4. **Run database migrations**

   ```bash
   pnpm --filter @unified/db db:migrate
   ```

5. **Seed sample data**

   ```bash
   pnpm --filter @unified/db db:seed
   ```

   Demo users all use password `password123`. See [requirements/database-schema.md](./requirements/database-schema.md) for seed details.

6. **Run all apps**

   ```bash
   pnpm dev
   ```

## App URLs

| App                    | URL                          |
| ---------------------- | ---------------------------- |
| API                    | http://localhost:4000/health |
| Support Hub            | http://localhost:3000        |
| Review & Audit Console | http://localhost:3001        |

## AI Progress Tracker (digest)

Digests are delivered by a **background worker**, not on page load / `pnpm dev`. The notification bell reads rows the worker already wrote.

Migration `20260731020000_digest_notifications` (included in `pnpm --filter @unified/db db:migrate`) creates `digest_runs` + `notifications`. No special seed is required — run the worker against existing demo users/tickets/PRs.

### Local env (root `.env`)

| Variable | Required? | Default | Notes |
| -------- | --------- | ------- | ----- |
| `DIGEST_ENABLED` | yes to process | `false` | Must be `true` for the worker to create notifications |
| `GROQ_API_KEY` | optional | unset | Groq LLM summaries; template fallback if missing |
| `DIGEST_LLM_ENABLED` | optional | `true` if key set | Force off with `false` even when key is present |
| `GROQ_MODEL` | optional | `openai/gpt-oss-20b` | Groq model id |
| `DIGEST_TICKET_STALE_DAYS` | optional | `3` | Idle ticket threshold (`updatedAt`) |
| `DIGEST_PR_IDLE_DAYS` | optional | `3` | Waiting-review PR idle threshold |
| `DIGEST_LLM_TIMEOUT_MS` | optional | `8000` | Groq request timeout |
| `DIGEST_MAX_USERS_PER_RUN` | optional | `10000` | Cap users processed per run |
| `DIGEST_STALE_RUNNING_MS` | optional | `600000` | Resume stale `RUNNING` digest claims |

The worker also needs `DATABASE_APP_URL` (same as API runtime). It does not need `JWT_SECRET`.

### Run once locally

```bash
# After migrate/seed; optional GROQ_API_KEY in .env for LLM (template fallback without it)
DIGEST_ENABLED=true pnpm --filter @unified/api digest:once
```

Optional: `DIGEST_ENABLED=true pnpm --filter @unified/api digest:once -- --scheduled-for=2026-07-31T06:00:00.000Z`

Then open Support Hub or Review Console — the notification bell should show the digest.

Isolation leak coverage: `pnpm test:bola` includes `ai-digest-leak.test.ts`. Product details: [requirements/ai-progress-tracker.md](./requirements/ai-progress-tracker.md). Production job + Scheduler: [deployment.md](./deployment.md#ai-progress-tracker-digest).

## Auth verification (Branch 3)

With the API running (`pnpm --filter @unified/api dev`), test auth via curl or Postman. See [requirements/identity-auth.md](./requirements/identity-auth.md).

Postman: import [`postman/unified-org-identity-auth.postman_collection.json`](../postman/unified-org-identity-auth.postman_collection.json) or run `pnpm test:auth` (Newman complementary smoke: identity, RBAC, tickets BOLA) with API on port 4000. Newman is **not** the product BOLA gate exit criterion.

## API integration / product BOLA gate

Requires Postgres migrated (`pnpm --filter @unified/db exec prisma migrate deploy`) and the same local `DATABASE_URL` / `DATABASE_APP_URL` as in [AGENTS.md](../AGENTS.md).

```bash
pnpm test:bola              # Core Product Security Gate (exact allowlist)
pnpm test:product-security  # alias for test:bola
pnpm test:integration       # full API integration suite
```

See [requirements/bola-tests.md](./requirements/bola-tests.md) and [requirements/product-bola-gate.md](./requirements/product-bola-gate.md).

## Common commands

```bash
pnpm lint          # ESLint across workspace
pnpm typecheck     # TypeScript across workspace
pnpm build         # Production build for all apps/packages
pnpm test          # Package unit tests (turbo)
pnpm test:bola     # Product BOLA security gate
DIGEST_ENABLED=true pnpm --filter @unified/api digest:once   # one-shot AI digest worker
```

## Monorepo layout

- `apps/api` — Express API (`@unified/api`)
- `apps/support-hub` — Next.js Dashboard 1 (`@unified/support-hub`)
- `apps/review-console` — Next.js Dashboard 2 (`@unified/review-console`)
- `packages/*` — Shared libraries (`@unified/ui`, `@unified/types`, etc.)

See [requirements/monorepo-scaffold.md](./requirements/monorepo-scaffold.md) for full scaffold scope.
