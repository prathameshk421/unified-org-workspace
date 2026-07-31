# unified-org-workspace

A multi-tenant, dual-dashboard org workspace (ticketing + PR/audit console) with shared JWT-based identity, cross-org BOLA-safe isolation, and append-only audit logging — built as a full-stack take-home for Froncort.AI.

## Monorepo

| Component | Package | Port |
| --------- | ------- | ---- |
| Identity/Org service | `@unified/api` | 4000 |
| Dashboard 1 — Support Hub | `@unified/support-hub` | 3000 |
| Dashboard 2 — Review Console | `@unified/review-console` | 3001 |

## Getting started

```bash
chmod +x run_all.sh   # first time only
./run_all.sh
```

Or manually:

```bash
pnpm install
cp .env.example .env
docker compose up -d
pnpm --filter @unified/db db:migrate:deploy
pnpm --filter @unified/db db:seed
pnpm dev
```

## Documentation

| Doc | Description |
| --- | ----------- |
| [docs/setup.md](./docs/setup.md) | Local setup guide |
| [docs/known-limitations.md](./docs/known-limitations.md) | Known limitations and future improvements |
| `docs/identity-org-service.png` | Architecture — Identity/Org service |
| `docs/dashboard-1-support-hub.png` | Architecture — Dashboard 1 |
| `docs/dashboard-2-review-console.png` | Architecture — Dashboard 2 |

Demo users: `password123` (see [setup guide](./docs/setup.md) for emails).
