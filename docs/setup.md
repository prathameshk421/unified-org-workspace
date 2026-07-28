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

4. **Generate Prisma client** (optional for scaffold; required before DB work)

   ```bash
   pnpm --filter @unified/db db:generate
   ```

5. **Run all apps**

   ```bash
   pnpm dev
   ```

## App URLs

| App | URL |
|---|---|
| API | http://localhost:4000/health |
| Support Hub | http://localhost:3000 |
| Review & Audit Console | http://localhost:3001 |

## Common commands

```bash
pnpm lint          # ESLint across workspace
pnpm typecheck     # TypeScript across workspace
pnpm build         # Production build for all apps/packages
pnpm test          # Test placeholder (no tests yet)
```

## Monorepo layout

- `apps/api` — Express API (`@unified/api`)
- `apps/support-hub` — Next.js Dashboard 1 (`@unified/support-hub`)
- `apps/review-console` — Next.js Dashboard 2 (`@unified/review-console`)
- `packages/*` — Shared libraries (`@unified/ui`, `@unified/types`, etc.)

See [requirements/monorepo-scaffold.md](./requirements/monorepo-scaffold.md) for full scaffold scope.
