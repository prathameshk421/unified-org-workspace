# Requirements — BOLA Tests

Policy for Broken Object Level Authorization (BOLA) / tenant isolation tests in this repo.

## Gates

| Gate | Command | Scope |
|------|---------|-------|
| **Foundation** | Vitest integration + Newman smoke | Auth, switch-org, JWT/session, RBAC probes, audit append-only DB |
| **Product (Core Product Security Gate)** | `pnpm test:bola` | Exact allowlist of domain + `product-bola/**` suites; uncheatable registry |

Newman (`pnpm test:auth`) is **complementary smoke only** — not an exit criterion for the product BOLA gate.

## Status policy (exact — no soft unions)

| Actor / case | Status |
|--------------|--------|
| Anon | **401** |
| Foreign `ORG_ADMIN` on foreign resource ID | **404** |
| Eve `SUPPORT_AGENT` on PR mutator routes | **403** `insufficient_role` |
| Share-only holder on ticket mutator (`getOrg*OrThrow` fails) | **404** |
| Wrong active org / unshared sibling / membership drop on share-capable read | **404** |
| Audit `?orgId=` ≠ session | **403** `org_filter_forbidden` |
| Absent HTTP methods (unmounted) | **404** |
| Same-org share | **400** `same_org_share_not_supported` |
| Foreign `assigneeId` on ticket PATCH | **400** `invalid_assignee` |
| Platform admin with no active org on ticket GET | **403** `no_active_org` |

**Banned** under `tests/integration/**`: `expect([403, 404])` and `expectIsolationDenied(...)`. Enforced by `product-bola/matrix-completeness.test.ts`.

## Anti-cheat registry

Source: [`apps/api/tests/support/product-bola-matrix.ts`](../../apps/api/tests/support/product-bola-matrix.ts)

- `EXPECTED_CELL_COUNT` is a **numeric literal** (never `array.length`).
- Every cell `status === "covered"` with unique `id` / `testTitle`.
- Completeness meta-test binds `testTitle` ↔ `it("…")` in `suiteFile` via filesystem read.
- Cells with `postCondition !== "none"` must import `assertOwnerAliveAttackerDenyOwnerUnchanged`, `assertOwnerDbUnchanged`, or `assertNoSuccessAuditForEntity`.
- No `*` wildcards in `pathPattern` — discrete cells only.

Full cell table: [product-bola-gate.md](./product-bola-gate.md).

## Mutation proof

Owner-alive sequence (helpers in `product-bola-helpers.ts`):

1. Snapshot `ownerDb` business fields (**never** `updatedAt`)
2. Owner GET → 200
3. Attack → exact status; body must not leak victim title / owner org
4. Re-read `ownerDb` unchanged
5. Owner GET → 200

## Path-locked PR versions / diff

Share view for versions/diff is proven **only** via:

- `GET /prs/:id/versions`
- `GET /prs/:id/versions/:n/diff`

**Forbidden** to prove share view via embedded `GET /prs/:id` payload.

## CI

`api-integration` runs `pnpm test:bola` (exact allowlist in `apps/api/vitest.bola.config.ts`), then full `pnpm --filter @unified/api test:integration`.
