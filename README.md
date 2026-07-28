# unified-org-workspace

A multi-tenant, dual-dashboard org workspace (ticketing + PR/audit console) with shared JWT-based identity, cross-org BOLA-safe isolation, and append-only audit logging — built as a full-stack take-home for Froncort.AI.

## Monorepo

| App | Package | Port |
|---|---|---|
| API | `@unified/api` | 4000 |
| Support Hub | `@unified/support-hub` | 3000 |
| Review & Audit Console | `@unified/review-console` | 3001 |

## Getting started

```bash
pnpm install
cp .env.example .env
docker compose up -d
pnpm dev
```

See [docs/setup.md](./docs/setup.md) for full local setup instructions.

For GCP production deployment, see [docs/deployment.md](./docs/deployment.md).

## Requirements

- [Assignment spec](./docs/requirements/assignment-spec.md)
- [Tiered build plan](./docs/requirements/tiered-build-plan.md)
- [Monorepo scaffold](./docs/requirements/monorepo-scaffold.md)
