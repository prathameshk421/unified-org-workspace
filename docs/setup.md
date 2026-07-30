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
```

## Monorepo layout

- `apps/api` — Express API (`@unified/api`)
- `apps/support-hub` — Next.js Dashboard 1 (`@unified/support-hub`)
- `apps/review-console` — Next.js Dashboard 2 (`@unified/review-console`)
- `packages/*` — Shared libraries (`@unified/ui`, `@unified/types`, etc.)

See [requirements/monorepo-scaffold.md](./requirements/monorepo-scaffold.md) for full scaffold scope.
