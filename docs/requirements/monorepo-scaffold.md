# `feat/monorepo-scaffold` — Scope & Requirements

## Purpose

Set up the monorepo structure so that all future feature branches have a working skeleton to build inside. No business logic, no auth, no database models — just the project infrastructure.

This branch is verified against:

- [assignment-spec.md](./assignment-spec.md) — suggested stack, dual-dashboard architecture, deliverables
- [tiered-build-plan.md](./tiered-build-plan.md) — Tier 1 foundation must land before product work

---

## Locked Decisions

| Area                | Choice                                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| Package manager     | **pnpm** workspaces (`pnpm-workspace.yaml`)                                                         |
| Orchestrator        | **Turborepo** (`turbo.json`)                                                                        |
| Package scope       | **`@unified/*`**                                                                                    |
| Node                | **22** (Alpine in Docker)                                                                           |
| Express             | **v4** + `cors`, `helmet`, `express.json()`; health at `GET /health`                                |
| Next.js             | **15** App Router for both dashboards; `transpilePackages` for workspace packages                   |
| Ports               | API **4000**, Support Hub **3000**, Review & Audit Console **3001**                                 |
| TypeScript          | Shared `strict: true` + `noUncheckedIndexedAccess`; API **ESM** (`NodeNext`); Next apps extend base |
| Package consumption | Workspace protocol + raw TS; Next `transpilePackages`; API via `tsx` in dev / `tsc` build           |
| UI exports          | Barrel `packages/ui/src/index.ts`                                                                   |
| ESLint              | Flat config (ESLint 9) via `@unified/config`                                                        |
| Prettier            | Root config; **no husky/lint-staged in this branch**                                                |
| Tailwind            | **v4** with shared theme tokens in `@unified/config`                                                |
| Fonts               | **Geist** via `geist` npm package (no network fetch at build time)                                  |
| Docker Compose      | Postgres **16**, Redis **7**; DB `unified_org`, user/pass `postgres`/`postgres`                     |
| Next deploy         | `output: "standalone"` multi-stage Dockerfiles                                                      |
| CI                  | GitHub Actions on PRs to `main`: install → lint → typecheck → build                                 |

---

## Areas of Concern

### 1. Monorepo Tooling

- pnpm workspaces
- Turborepo task pipeline: `build` depends on `^build`; `dev` is persistent; `lint`, `typecheck`, `test`
- Root scripts: `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`

### 2. App Shells

| App                        | Package                   | Role                                  | Port |
| -------------------------- | ------------------------- | ------------------------------------- | ---- |
| **API server**             | `@unified/api`            | Express.js backend with `GET /health` | 4000 |
| **Support Hub**            | `@unified/support-hub`    | Next.js Dashboard 1 placeholder       | 3000 |
| **Review & Audit Console** | `@unified/review-console` | Next.js Dashboard 2 placeholder       | 3001 |

API middleware out of the box: `cors`, `helmet`, `express.json()`.

Empty route folders for future module boundaries: `identity`, `tickets`, `prs`, `audit`.

### 3. Shared Packages

| Package                | Purpose                                                |
| ---------------------- | ------------------------------------------------------ |
| `@unified/ui`          | Shared React components across both dashboards         |
| `@unified/types`       | TypeScript types, enums, DTOs for frontend and backend |
| `@unified/auth-client` | Frontend auth utilities (empty shell)                  |
| `@unified/db`          | Prisma schema and client (minimal setup, no models)    |
| `@unified/config`      | TypeScript, ESLint, Tailwind, and Prettier configs     |

### 4. TypeScript Configuration

- Base `tsconfig` in `@unified/config` extended by all apps/packages
- API: Node ESM target
- Next apps: bundler/browser targets via Next defaults

### 5. Linting & Formatting

- Shared ESLint flat config
- Root Prettier config
- Lint scripts wired into Turborepo pipeline
- Pre-commit hooks deferred to a later branch

### 6. Styling Setup

- Tailwind CSS v4 in both Next.js apps
- Shared theme/preset in `@unified/config`
- UI library consumable by both dashboards' Tailwind builds

### 7. Local Development Infrastructure

- Docker Compose: PostgreSQL 16 + Redis 7
- `.env.example` with all required variables documented, including future parent-domain cookie vars for session sync
- Default local DB: `postgresql://postgres:postgres@localhost:5432/unified_org`

### 8. Containerization

- Multi-stage Dockerfile per app
- Monorepo-aware copy (only what each app needs)
- Node 22 Alpine base; Next.js standalone output

### 9. CI Pipeline

- GitHub Actions on PRs to `main`
- Steps: install → lint → typecheck → build
- Test task present but empty/pass-through until later branches
- pnpm store + Turborepo cache enabled

---

## Target Layout

```text
apps/
  api/
  support-hub/
  review-console/
packages/
  ui/
  types/
  auth-client/
  db/
  config/
docker-compose.yml
.env.example
turbo.json
pnpm-workspace.yaml
.github/workflows/ci.yml
docs/requirements/monorepo-scaffold.md
docs/setup.md
```

---

## What Does NOT Go In This Branch

- Database tables or Prisma models (→ `feat/database-schema`)
- Auth routes, JWT logic, password hashing (→ `feat/identity-auth`)
- RBAC middleware (implemented — [rbac-middleware.md](../requirements/rbac-middleware.md))
- Any real UI pages or business logic (→ Tier 2 branches)
- Real secrets in `.env` (only `.env.example`)

---

## Acceptance Criteria

1. Docker services (Postgres + Redis) start and are reachable
2. `pnpm install` completes with zero errors
3. All three apps start concurrently via `pnpm dev`
4. API health endpoint responds successfully at `GET /health`
5. Both Next.js apps render placeholder pages
6. Both dashboards import and render a component from `@unified/ui`
7. Both dashboards and the API import types from `@unified/types`
8. Type-checking passes across all apps and packages
9. Linting passes across all apps and packages
10. Production build succeeds for all apps
