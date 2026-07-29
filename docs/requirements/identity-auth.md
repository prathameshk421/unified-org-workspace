# Identity Auth — Branch 3 (`feat/identity-auth`)

Cookie-based JWT authentication for the unified org workspace API.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | Create user + auto-login |
| POST | `/auth/login` | Email/password login |
| POST | `/auth/refresh` | Rotate refresh token |
| POST | `/auth/logout` | Revoke current session |
| POST | `/auth/logout-everywhere` | Revoke all user sessions |
| GET | `/auth/me` | Current user + memberships + active org |
| POST | `/auth/switch-org` | Switch active org (membership required) |

## Cookies

| Cookie | TTL | Purpose |
|--------|-----|---------|
| `unified_access` | 15 min | JWT access token (httpOnly) |
| `unified_refresh` | 7 days | Opaque refresh token (httpOnly, SHA-256 hashed in DB) |

**Flags:** `httpOnly`, dynamic `sameSite` (see matrix below), `secure` in production (or `COOKIE_SECURE=true`).

| Env | `COOKIE_DOMAIN` | SameSite |
|-----|-----------------|----------|
| Local | omit | `strict` |
| `*.run.app` (secure, no domain) | omit | `none` |
| Custom parent domain | `.yourparent.com` | `strict` |

**Local / client-only sync:** omit `COOKIE_DOMAIN` — cookies are host-only on the **API** origin (`localhost:4000`). Dashboards on `:3000` / `:3001` do not host session cookies; they call the API with `credentials: "include"`, so the browser sends the API cookies and both dashboards share one session. (Older wording that “ports cannot share cookies” referred to dashboard-to-dashboard cookie jars, not this API-origin model.)

**Production custom domain:** set `COOKIE_DOMAIN=.yourparent.com` so `hub.` / `console.` / `api.` are same-site with `SameSite=Strict` (also enables future SSR/middleware cookie reads on dashboard hosts).

## BOLA foundation

- Active org comes **only** from verified JWT (`req.auth.activeOrgId`), never from client query/body (except `switch-org` which validates membership).
- `requireAuth` re-checks `Session.revokedAt` and live `OrgMembership` on every protected route.

## Verification (curl)

Use a cookie jar file (`cookies.txt`). Demo password: `password123`.

```bash
API=http://localhost:4000
JAR=cookies.txt

# 1. Login as Alice (Acme admin)
curl -s -c $JAR -b $JAR -X POST $API/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@acme.com","password":"password123"}' | jq

# 2. Get current user
curl -s -c $JAR -b $JAR $API/auth/me | jq

# 3. BOLA: client orgId ignored (still Acme)
curl -s -c $JAR -b $JAR "$API/auth/me?orgId=ignored" | jq '.activeOrg'

# 4. Login as Dave (multi-org) in separate jar
curl -s -c cookies-dave.txt -b cookies-dave.txt -X POST $API/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"dave@example.com","password":"password123"}' | jq

# 5. Switch org (use Globex orgId from /auth/me memberships)
GLOBEX_ID=$(curl -s -c cookies-dave.txt -b cookies-dave.txt $API/auth/me | jq -r '.memberships[] | select(.orgSlug=="globex") | .orgId')
curl -s -c cookies-dave.txt -b cookies-dave.txt -X POST $API/auth/switch-org \
  -H 'Content-Type: application/json' \
  -d "{\"orgId\":\"$GLOBEX_ID\"}" | jq

# 6. BOLA: Alice cannot switch to Globex
curl -s -c $JAR -b $JAR -X POST $API/auth/switch-org \
  -H 'Content-Type: application/json' \
  -d "{\"orgId\":\"$GLOBEX_ID\"}" -w '\nHTTP %{http_code}\n'

# 7. Refresh tokens
curl -s -c $JAR -b $JAR -X POST $API/auth/refresh | jq

# 8. Logout
curl -s -c $JAR -b $JAR -X POST $API/auth/logout | jq
curl -s -c $JAR -b $JAR $API/auth/me -w '\nHTTP %{http_code}\n'
```

## Postman / Newman

Import [`postman/unified-org-identity-auth.postman_collection.json`](../../postman/unified-org-identity-auth.postman_collection.json) into Postman desktop, or run automated tests with Newman:

```bash
# API must be running on localhost:4000
npx newman run postman/unified-org-identity-auth.postman_collection.json \
  --env-var baseUrl=http://localhost:4000
```

All 14 assertions should pass (login, me, BOLA 403, switch-org, refresh, logout).

**Note:** Postman cloud MCP can create collections but cannot execute requests against localhost. Use Newman or Postman desktop Collection Runner for local API testing.

## Environment variables

See [`.env.example`](../../.env.example): `JWT_SECRET` (min 32 chars), `DATABASE_APP_URL`, `ACCESS_COOKIE_NAME`, `REFRESH_COOKIE_NAME`, `CORS_ORIGINS`, optional `COOKIE_DOMAIN` / `COOKIE_SECURE`.
