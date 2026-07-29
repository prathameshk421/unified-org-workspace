# RBAC Middleware — Branch 4 (`feat/rbac-middleware`)

Express route guards for organization roles and platform admin access. Builds on cookie JWT auth (`requireAuth`) and session-sync org scoping.

## Middleware

| Export | Purpose | Status |
|---|---|---|
| `requireAuth` | Cookie JWT + live `Session` / `OrgMembership` / `User.isPlatformAdmin` re-check | Existing (hardened) |
| `requireOrgAccess` | Requires active org; sets `req.orgId` from `req.auth.activeOrgId` only | New |
| `requireActiveOrg` | Alias of `requireOrgAccess` (session-sync doc compatibility) | Alias |
| `requireRole(...roles)` | Membership role must be in allowlist | New |
| `requirePlatformAdmin` | `req.auth.isPlatformAdmin === true` (live DB value) | New |

Location: [`apps/api/src/routes/identity/auth/middleware.ts`](../../apps/api/src/routes/identity/auth/middleware.ts)

### Status codes

| Condition | Code | Response `code` |
|---|---|---|
| No / invalid token | **401** | — |
| No active org on org-scoped route | **403** | `no_active_org` |
| Wrong membership role | **403** | `insufficient_role` |
| Not platform admin | **403** | `platform_admin_required` |

### Org scoping

- **Only** tenancy source: `req.auth.activeOrgId` (from verified session + live membership)
- `requireOrgAccess` sets `req.orgId = req.auth.activeOrgId` for handlers — **never** from `req.params`, `req.query`, or `req.body`
- **Exception:** `POST /auth/switch-org` accepts `orgId` in body after membership validation
- Do **not** attach `requireOrgAccess` or `requireRole` to `/auth/me` or `/auth/switch-org` (null active org is valid)

### Platform admin vs org roles

- Platform Super Admin is `User.isPlatformAdmin` (boolean), **not** an `OrgRole` enum value
- `requireRole` checks **membership role only** — platform admins do **not** auto-bypass org role checks unless they also have an `OrgMembership` for the active org
- `resolveAuthContext` re-reads `User.isPlatformAdmin` from DB on every `requireAuth` (prevents demoted admins retaining access until JWT expiry)

## Role mapping (brief ↔ schema)

| Assignment brief | Implementation |
|---|---|
| Org Admin | `OrgRole.ORG_ADMIN` |
| Support Agent | `OrgRole.SUPPORT_AGENT` |
| Reviewer / Approver | `OrgRole.REVIEWER` |
| Cross-Org Guest | `OrgRole.CROSS_ORG_GUEST` |
| Platform Super Admin | `User.isPlatformAdmin` + `requirePlatformAdmin()` |

Do **not** rename `REVIEWER` → `REVIEWER_APPROVER` or add `PLATFORM_SUPER_ADMIN` to `OrgRole` without a migration plan.

## Role groups (`@unified/types`)

Shared constants for Tier 2 route guards:

| Constant | Roles |
|---|---|
| `TICKET_MUTATOR_ROLES` | ORG_ADMIN, SUPPORT_AGENT, REVIEWER |
| `TICKET_READER_ROLES` | above + CROSS_ORG_GUEST |
| `PR_MUTATOR_ROLES` | ORG_ADMIN, REVIEWER |
| `AUDIT_VIEWER_ROLES` | ORG_ADMIN, REVIEWER |

## Permissions matrix (future product routes)

| Capability | ORG_ADMIN | SUPPORT_AGENT | REVIEWER | CROSS_ORG_GUEST | Platform admin |
|---|---|---|---|---|---|
| Org-scoped API (`requireOrgAccess`) | yes | yes | yes | yes* | only if member + active org |
| Ticket mutate | yes | yes | yes | no | n/a |
| PR mutate / approve | yes | no | yes | no | n/a |
| Audit viewer | yes | no | yes | no | n/a |
| Platform orgs / connections / settings | no | no | no | no | **yes** |

\*Guest needs org membership for in-org guest role; cross-org **share** access is item-level (Tier 2), not workspace-wide.

## Composition for future endpoints

```ts
// Org-scoped ticket list (Tier 2)
router.get(
  "/tickets",
  requireAuth,
  requireOrgAccess,
  requireRole(...TICKET_READER_ROLES),
  handler,
);

// Platform-only (Tier 2+)
router.get("/platform/orgs", requireAuth, requirePlatformAdmin, handler);
```

Always scope Prisma queries by `req.orgId` (or `req.auth.activeOrgId`) — never client-supplied org IDs.

## Probe routes (auth-layer verification)

Safe echo endpoints under `/rbac` (no product data):

| Method | Path | Guards |
|---|---|---|
| GET | `/rbac/org` | auth + org access |
| GET | `/rbac/admin` | auth + org + `ORG_ADMIN` |
| GET | `/rbac/agent` | auth + org + `SUPPORT_AGENT` or `ORG_ADMIN` |
| GET | `/rbac/reviewer` | auth + org + `REVIEWER` or `ORG_ADMIN` |
| GET | `/rbac/platform` | auth + platform admin |

## Demo users (seed)

| Email | Org | Role / flag | Password |
|---|---|---|---|
| `alice@acme.com` | Acme | ORG_ADMIN | `password123` |
| `bob@acme.com` | Acme | SUPPORT_AGENT | `password123` |
| `carol@globex.com` | Globex | ORG_ADMIN | `password123` |
| `dave@example.com` | Acme + Globex | REVIEWER | `password123` |
| `eve@example.com` | Acme | CROSS_ORG_GUEST | `password123` |
| `platform@example.com` | none | Platform Super Admin | `password123` |

## Verification

```bash
# Newman (API must be running on :4000 with seeded DB)
pnpm test:auth

# Cross-dashboard session sync (unchanged)
bash scripts/run-auth-e2e.sh
```

### curl examples

```bash
API=http://localhost:4000
JAR=cookies.txt

# Login as Bob (agent) — admin probe should 403
curl -s -c $JAR -b $JAR -X POST $API/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"bob@acme.com","password":"password123"}' | jq
curl -s -c $JAR -b $JAR $API/rbac/admin -w '\nHTTP %{http_code}\n'
curl -s -c $JAR -b $JAR $API/rbac/agent -w '\nHTTP %{http_code}\n'

# Platform admin — no active org → /rbac/org 403
curl -s -c cookies-platform.txt -b cookies-platform.txt -X POST $API/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"platform@example.com","password":"password123"}' | jq
curl -s -c cookies-platform.txt -b cookies-platform.txt $API/rbac/platform | jq
curl -s -c cookies-platform.txt -b cookies-platform.txt $API/rbac/org -w '\nHTTP %{http_code}\n'
```

## Explicit non-goals (this branch)

- Ticket / PR / audit product routes (Tier 2)
- Full resource-ID BOLA with manipulated ticket/PR IDs (Tier 2)
- Next.js SSR auth middleware
- Cookie / Helmet / Terraform / deploy config changes
- Renaming `OrgRole` enum values

## Production merge checklist

1. No Prisma enum changes — seed data + app code only
2. No cookie, Helmet, CORS, or dual-URL changes
3. `/auth/me` and `/auth/switch-org` use **only** `requireAuth`
4. `pnpm lint`, `pnpm typecheck`, `pnpm build` pass
5. Newman auth + RBAC assertions green (`pnpm test:auth`)
6. Playwright session-sync green (`bash scripts/run-auth-e2e.sh`)
7. Probe routes return auth echo only — no tenant product data
