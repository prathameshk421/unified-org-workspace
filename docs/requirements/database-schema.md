# `feat/database-schema` — Scope & Requirements

## Purpose

Define the PostgreSQL schema for identity, organizations, sessions, audit logging, and cross-org connections. This is the data foundation for Tier 1 (auth, RBAC, org scoping, append-only audit).

Verified against:

- [assignment-spec.md](./assignment-spec.md) — shared identity, RBAC roles, append-only audit, cross-org connections
- [tiered-build-plan.md](./tiered-build-plan.md) — Tier 1 foundation before product work

---

## Locked Decisions

| Area | Choice |
|---|---|
| Package | `@unified/db` at `packages/db/` |
| ORM | Prisma 6 + PostgreSQL 16 |
| IDs | `cuid()` strings |
| Table names | snake_case via `@@map` |
| Platform Super Admin | `User.isPlatformAdmin` (not an org membership role) |
| Org roles | `ORG_ADMIN`, `SUPPORT_AGENT`, `REVIEWER`, `CROSS_ORG_GUEST` |
| Audit append-only | Postgres role `unified_app` with `INSERT`/`SELECT` only on `audit_logs` |
| Audit `orgId` | Nullable for org-less auth/platform events; `ON DELETE SET NULL` preserves history |
| Migrate/seed user | `postgres` superuser via `DATABASE_URL` |
| Runtime API user | `unified_app` via `DATABASE_APP_URL` (wired in `feat/identity-auth`) |

---

## Models

| Model | Table | Purpose |
|---|---|---|
| Organization | `organizations` | Tenant root |
| User | `users` | Identity |
| OrgMembership | `org_memberships` | User ↔ org with role |
| AuditLog | `audit_logs` | Append-only mutation trail |
| Session | `sessions` | Session revocation root; stores `activeOrgId` for cross-dashboard org sync |
| RefreshToken | `refresh_tokens` | Token revocation / rotation |
| OrgConnection | `org_connections` | Cross-org partnership |

---

## Seed Data

| Entity | Details |
|---|---|
| Orgs | `acme` (Acme Corp), `globex` (Globex Inc) |
| Users | alice@acme.com, bob@acme.com, carol@globex.com, dave@example.com |
| Password | `password123` (bcrypt hashed) |
| Memberships | Alice → ORG_ADMIN (Acme); Bob → SUPPORT_AGENT (Acme); Carol → ORG_ADMIN (Globex); Dave → REVIEWER (both) |
| Connection | Acme ↔ Globex, `ACCEPTED` |

---

## Commands

```bash
pnpm --filter @unified/db db:migrate      # create/apply migrations
pnpm --filter @unified/db db:seed         # seed sample data
pnpm --filter @unified/db db:studio       # Prisma Studio
pnpm --filter @unified/db db:migrate:deploy  # production deploy
```

---

## Acceptance Criteria

1. `pnpm --filter @unified/db db:migrate` creates all tables without errors
2. `pnpm --filter @unified/db db:seed` inserts 2 orgs, 4 users, 1 accepted connection
3. `unified_app` role can `INSERT` into `audit_logs` but not `UPDATE` or `DELETE`
4. `pnpm typecheck` and `pnpm lint` pass for `@unified/db` and `@unified/types`

---

## Out of Scope

- Auth routes, JWT, password login (`feat/identity-auth`)
- RBAC middleware (implemented — [rbac-middleware.md](./rbac-middleware.md))
- Ticket / PR tables (Tier 2)
- Using `DATABASE_APP_URL` in the API at runtime
