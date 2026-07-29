# Requirements — Audit Log (Branch 6 / `feat/audit-log`)

Tier 1 append-only audit trail: shared writer utility, mutation middleware, auth mutation coverage, and automated DB permission test.

Verified against:

- [tiered-build-plan.md](./tiered-build-plan.md) — append-only at DB level; audit append-only test required
- [assignment-spec.md](./assignment-spec.md) — every mutation recorded; append-only enforced at database
- [database-schema.md](./database-schema.md) — `unified_app` role; dual URLs

---

## Locked Decisions

| Area | Choice |
|---|---|
| Runtime DB role | **`unified_app`** (not `app_writer`) via `DATABASE_APP_URL` |
| Writer location | `apps/api/src/lib/audit-log.ts` — uses API `prisma` only |
| Middleware | `auditMutations` flushes queued events on successful mutations; never logs raw `req.body` |
| `orgId` on auth events | Nullable — `null` for register / org-less login / logout without active org |
| Org delete | `audit_logs.orgId` FK `ON DELETE SET NULL` — history preserved |
| Excluded routes | `/health`, `POST /auth/refresh` |
| Action constants | `AuditAction` in `@unified/types` |

---

## API Surface

### `record(input: AuditRecordInput)`

Inserts one row into `audit_logs` via the API Prisma client (`unified_app`).

- `orgId` / `userId` must come from verified session (`req.auth`, `req.orgId`) — never from client body/query/URL.
- `metadata` is sanitized (denylist secrets; 4 KB cap).
- On failure: rethrows — callers decide fail-closed.

### `auditMutations` middleware

- Runs for `POST|PUT|PATCH|DELETE`.
- Skips `/health` and `/auth/refresh`.
- On successful response (`statusCode < 400`): flushes `res.locals.auditEvents` or writes fallback `http.mutation`.
- Auth routes that call `record()` in the service set `res.locals.auditWritten = true` to avoid double-write.

---

## Auth Audit Coverage

| Mutation | Action | `orgId` |
|---|---|---|
| `POST /auth/register` | `auth.register` | `null` |
| `POST /auth/login` | `auth.login` | session active org or `null` |
| `POST /auth/logout` | `auth.logout` | session active org or `null` |
| `POST /auth/logout-everywhere` | `auth.logout_everywhere` | same |
| `POST /auth/switch-org` | `auth.switch_org` | target org (membership-verified) |
| `POST /auth/refresh` | — | excluded |

---

## DB Enforcement

Role `unified_app` (existing migration `20260728164500_audit_app_role`):

- `GRANT SELECT, INSERT ON audit_logs`
- `REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs`

Nullable-org migration re-asserts these grants. **Never** `ALTER ROLE unified_app PASSWORD` in migrations (Cloud SQL password is Terraform-managed).

---

## Commands

```bash
pnpm --filter @unified/db db:migrate              # apply nullable orgId migration
pnpm --filter @unified/db test:audit-append-only  # DB permission test (DATABASE_APP_URL)
pnpm test:auth                                    # Newman (API must be running)
```

---

## Acceptance Criteria

1. `record()` inserts via `unified_app` connection.
2. Successful auth mutations (except refresh) create audit rows.
3. Middleware mounted; fallback `http.mutation` for unlisted successful mutations.
4. No passwords/tokens in `metadata`.
5. `test:audit-append-only` fails CI if UPDATE/DELETE succeed as `unified_app`.
6. `pnpm typecheck` and `pnpm lint` pass.
7. Org-less events use `orgId: null`; org delete does not CASCADE-delete audit rows.

---

## Cloud Run Footguns (do not do)

- Create role `app_writer` without Terraform user + secret
- `ALTER ROLE unified_app PASSWORD …` in migrations
- Point migrate/seed at `DATABASE_APP_URL`
- `REVOKE SELECT` on `audit_logs` (breaks Prisma `INSERT … RETURNING`)
- Put audit writer on `@unified/db` default client (`DATABASE_URL` = postgres)
- Log `req.body` / cookies into metadata

---

## Out of Scope (Tier 2)

- Unified audit viewer API/UI / CSV export
- Ticket/PR mutation auditing (middleware is ready; product routes not built)
