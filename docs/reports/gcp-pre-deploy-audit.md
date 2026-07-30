# GCP Pre-Deployment Audit Report

**Project:** unified-org-workspace  
**Audit date:** 2026-07-30  
**Auditor:** Automated pre-deploy audit (static + Terraform live + Docker runtime smoke 2026-07-30)  
**Repo:** `/Volumes/SSD/Projects/froncort_home/unified-org-workspace`

---

## Executive summary

| Metric | Value |
|--------|-------|
| **Deployment Readiness Score** | **72 / 100** |
| **Verdict** | **RISKY** |
| **Confirmed blockers** | 0 |
| **Pending blockers (user Docker)** | 0 |
| **High-confidence static risks** | 0 (R1 EACCES not reproduced at runtime) |
| **Warnings** | 20 |
| **Passed checks** | 32 |

Infrastructure is already provisioned in GCP project `unified-org-workspace`. `terraform validate` and `terraform plan` succeed. CI/CD is WIF-based with migrate-before-service ordering. Docker smoke (Appendix A) passed: all four images build, migrate exit 0, API `/health` 200, hub/console HTTP 200 on `PORT=8080`. Remaining gaps (no graceful shutdown, liveness-only `/health`, ephemeral attachments, unused Redis, local TF state, public `allUsers`) keep deploy **risky** until the 7 GitHub Variables and WIF are confirmed.

| Gate | Result |
|------|--------|
| Terraform live | ✅ `validate` + `plan` OK — **0 add, 3 change, 0 destroy** |
| Docker runtime | ✅ Appendix A smoke — B1–B3 pass, hub/console 200 |
| GitHub Variables (7) | ⚠️ Operator must confirm before first Deploy |

---

## Appendix A: Docker/Compose smoke commands (USER RUN)

**Completed 2026-07-30** — user built all images + migrate; agent ran remaining runtime curls (health, R1 default path, hub/console). Compose postgres/redis steps optional and not re-run here.

```bash
cd /Volumes/SSD/Projects/froncort_home/unified-org-workspace

# =============================================================================
# 1) Compose: Postgres + Redis only (healthchecks)
# =============================================================================
docker compose up -d
docker compose ps
docker compose exec postgres pg_isready -U postgres -d unified_org
docker compose exec redis redis-cli ping

# =============================================================================
# 2) Fresh builds (no cache) — all 4 images
#    Next apps REQUIRE NEXT_PUBLIC_* build-args (API_URL enforced by Dockerfile)
# =============================================================================
docker build --no-cache -f apps/api/Dockerfile -t unified-org/api:audit .

docker build --no-cache -f apps/support-hub/Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=http://host.docker.internal:8080 \
  --build-arg NEXT_PUBLIC_SUPPORT_HUB_URL=http://localhost:8081 \
  --build-arg NEXT_PUBLIC_REVIEW_CONSOLE_URL=http://localhost:8082 \
  -t unified-org/support-hub:audit .

docker build --no-cache -f apps/review-console/Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=http://host.docker.internal:8080 \
  --build-arg NEXT_PUBLIC_SUPPORT_HUB_URL=http://localhost:8081 \
  --build-arg NEXT_PUBLIC_REVIEW_CONSOLE_URL=http://localhost:8082 \
  -t unified-org/review-console:audit .

docker build --no-cache -f packages/db/Dockerfile -t unified-org/db-migrate:audit .

# =============================================================================
# 3) Migrate against local Postgres (owner URL) — creates unified_app role
# =============================================================================
docker run --rm \
  --add-host=host.docker.internal:host-gateway \
  -e DATABASE_URL='postgresql://postgres:postgres@host.docker.internal:5432/unified_org' \
  unified-org/db-migrate:audit
echo "migrate_exit=$?"

# =============================================================================
# 4) Run each container with Cloud Run–like PORT=8080
# =============================================================================

# API — uses ATTACHMENTS_DIR=/tmp/attachments to avoid non-root mkdir under /app
# (also try WITHOUT ATTACHMENTS_DIR once to verify default path permissions)
docker run --rm -d --name audit-api -p 8080:8080 \
  --add-host=host.docker.internal:host-gateway \
  -e PORT=8080 \
  -e NODE_ENV=production \
  -e JWT_SECRET=audit-jwt-secret-at-least-32-chars-long \
  -e DATABASE_APP_URL='postgresql://unified_app:unified_app@host.docker.internal:5432/unified_org' \
  -e CORS_ORIGINS='http://localhost:8081,http://localhost:8082' \
  -e ATTACHMENTS_DIR=/tmp/attachments \
  unified-org/api:audit

sleep 3
curl -sS -w '\nhttp_code:%{http_code}\n' http://127.0.0.1:8080/health || true
docker logs audit-api 2>&1 | tail -50

# Optional: confirm default attachments path fails or succeeds (stop audit-api first)
# docker stop audit-api
# docker run --rm -d --name audit-api-default -p 8080:8080 \
#   --add-host=host.docker.internal:host-gateway \
#   -e PORT=8080 -e NODE_ENV=production \
#   -e JWT_SECRET=audit-jwt-secret-at-least-32-chars-long \
#   -e DATABASE_APP_URL='postgresql://unified_app:unified_app@host.docker.internal:5432/unified_org' \
#   -e CORS_ORIGINS='http://localhost:8081,http://localhost:8082' \
#   unified-org/api:audit
# sleep 3; curl -sS http://127.0.0.1:8080/health || true
# docker logs audit-api-default 2>&1 | tail -30
# docker stop audit-api-default || true

# Support Hub + Review Console on 8080 inside container
docker run --rm -d --name audit-hub -p 8081:8080 \
  -e PORT=8080 -e HOSTNAME=0.0.0.0 \
  unified-org/support-hub:audit

docker run --rm -d --name audit-console -p 8082:8080 \
  -e PORT=8080 -e HOSTNAME=0.0.0.0 \
  unified-org/review-console:audit

sleep 3
curl -sS -o /dev/null -w 'hub:%{http_code}\n' http://127.0.0.1:8081/ || true
curl -sS -o /dev/null -w 'console:%{http_code}\n' http://127.0.0.1:8082/ || true
docker logs audit-hub 2>&1 | tail -20
docker logs audit-console 2>&1 | tail -20

# Cleanup app containers
docker stop audit-api audit-hub audit-console 2>/dev/null || true

# =============================================================================
# 5) Image size summary
# =============================================================================
docker images 'unified-org/*:audit' --format 'table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.ID}}'
```

**Notes**

- Compose provides **postgres + redis only** (no app services) — matches design.
- On macOS Docker Desktop, `host.docker.internal` usually works; `--add-host=…:host-gateway` is included for Linux/compatibility.
- Prefer running **migrate before API** so `unified_app` exists for `DATABASE_APP_URL`.
- Builds are slow (full monorepo, no cache) — expect several minutes per image.

---

## Passed checks

| # | Check | Evidence | Confidence |
|---|-------|----------|------------|
| P1 | 4 Dockerfiles (api, support-hub, review-console, db-migrate) | `apps/*/Dockerfile`, `packages/db/Dockerfile` | High |
| P2 | API/Next run as non-root (`expressjs`/`nextjs` uid 1001) | `apps/api/Dockerfile:26-37`, hub/console `:36-37` | High |
| P3 | API binds `0.0.0.0`, respects `PORT` | `apps/api/src/index.ts:5-10` | High |
| P4 | Next standalone + `HOSTNAME=0.0.0.0` + `EXPOSE 8080` | hub/console Dockerfiles | High |
| P5 | `NEXT_PUBLIC_API_URL` enforced at Docker build | hub/console `Dockerfile:28` | High |
| P6 | `.dockerignore` excludes `node_modules`, `.env*` | `.dockerignore` | High |
| P7 | Compose = Postgres 16 + Redis 7 with healthchecks | `docker-compose.yml:1-36` | High |
| P8 | `GET /health` exists | `apps/api/src/app.ts:30-38` | High |
| P9 | Dual DB URLs: migrate=`DATABASE_URL`, API=`DATABASE_APP_URL` | `infra/secrets.tf`, `apps/api/src/lib/prisma.ts` | High |
| P10 | CORS allowlist from TF hub/console URIs | `infra/cloud_run.tf:63-66` | High |
| P11 | No `COOKIE_DOMAIN` on default `*.run.app` path | `infra/cloud_run.tf:55-61` (dynamic) | High |
| P12 | Helmet CORP left default (session-sync compliant) | `apps/api/src/app.ts:19` | High |
| P13 | Credentialed fetch; no `document.cookie` auth | `packages/auth-client` | High |
| P14 | Org switch only path that accepts client `orgId` | `OrgSwitcher` → `/auth/switch-org` | High |
| P15 | `terraform validate` Success | live run 2026-07-30 | High |
| P16 | `terraform plan` Success (infra already applied) | 0 add / 3 change / 0 destroy | High |
| P17 | 3 Cloud Run services + 2 jobs | `infra/cloud_run.tf` | High |
| P18 | Secrets: JWT, DATABASE_URL, DATABASE_APP_URL, REDIS_URL | `infra/secrets.tf` | High |
| P19 | Deploy: migrate job **before** service image updates | `deploy.yml:100-134` | High |
| P20 | Deploy auth = WIF vars only (no GCP JSON keys) | `deploy.yml:37-41` | High |
| P21 | CI docker-smoke builds all 4 images | `ci.yml:229-269` | High |
| P22 | CI auth-e2e + BOLA self-contained on clean runners | `ci.yml:71-163` | High |
| P23 | Audit append-only test in CI | `ci.yml` + `packages/db` script | High |
| P24 | API integration tests with Postgres service | `ci.yml:165-227` | High |
| P25 | WIF scoped to `github_repo` attribute | `infra/wif.tf:18` | High |
| P26 | Cloud SQL private IP + Direct VPC egress | `cloud_sql.tf`, `cloud_run.tf:15-21` | High |
| P27 | `lifecycle.ignore_changes` on images (CD owns images) | `cloud_run.tf:90-96` | High |
| P28 | No hardcoded production secrets in app source | static scan | High || P29 | All 4 audit images build (`--no-cache`) | User Docker build 2026-07-30 | High |
| P30 | API `/health` on container `PORT=8080` | Appendix A curl 200 | High |
| P31 | Hub + console serve on internal 8080 | HTTP 200 mapped 8081/8082 | High |
| P32 | db-migrate container exit 0 | User `migrate_exit=0` | High |

---

## Deployment blockers

### Confirmed (static / live)

None that unconditionally block GCP bootstrap **if** Docker builds/start succeed and the 7 GitHub Variables + WIF are set.

### Static risk — R1 attachments dir (Appendix A verified)

| ID | Severity | Location | Root cause | Fix | Confidence |
|----|----------|----------|------------|-----|------------|
| R1 | **warning** (runtime OK) | `apps/api/Dockerfile:37-39`, `apps/api/src/index.ts:7`, `env.ts:50-52` | Static analysis: non-root `mkdir` under `cwd/data/attachments` could EACCES. **Appendix A:** container `unified-org/api:audit` without `ATTACHMENTS_DIR` returned `/health` **200** and log `API server listening on port 8080`. | Still set `ATTACHMENTS_DIR=/tmp/attachments` (or GCS) on Cloud Run for W6 ephemeral disk; optional Dockerfile `chown` for defense in depth. | High (static) / verified pass (local Docker) |

### Docker verification (Appendix A — complete)

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| B1 | All 4 images build `--no-cache` | ✅ **Pass** | User-built tags `unified-org/*:audit` (api, support-hub, review-console, db-migrate) |
| B2 | API `/health` 200 on `PORT=8080`; Next on 8080 | ✅ **Pass** | `curl` → `http_code:200`; hub `200`, console `200`; Next.js Ready in ~50–62ms |
| B3 | Migrate container exit 0 vs local Postgres | ✅ **Pass** | User-reported `migrate_exit=0` |

### Conditional (operator / org policy)

| ID | Severity | Location | Root cause | Fix | Confidence |
|----|----------|----------|------------|-----|------------|
| C1 | blocker if misconfigured | `deploy.yml` + GitHub Variables | Empty `API_URL` → Next `RUN test -n` fails; empty WIF → auth fails | Set all 7 vars from `terraform output` before Deploy | High |
| C2 | blocker if wrong | `infra/wif.tf:18`, tfvars `github_repo` | WIF `attribute_condition` must match `owner/repo` | Align tfvars with real GitHub repo | High |
| C3 | blocker if org policy | `cloud_run.tf:358-377` | `allUsers` invoker may be denied by org policy | Request exception or use IAP/LB | Medium |

---

## Warnings

| # | Finding | Location | Root cause | Fix | Confidence |
|---|---------|----------|------------|-----|------------|
| W1 | No API graceful shutdown | `apps/api/src/index.ts:9-11` | No `SIGTERM` / `server.close` / Prisma disconnect | Add shutdown hooks (Cloud Run ~10s budget) | High |
| W2 | `/health` liveness-only | `apps/api/src/app.ts:30-38` | Static JSON; no DB ping | Add `/ready` with `SELECT 1` | High |
| W3 | No TF startup/liveness HTTP probes | `infra/cloud_run.tf` | Platform TCP default only | HTTP probe on `/health` | High |
| W4 | Redis provisioned, unused by app | `infra/redis.tf`, `secrets.tf:50-52` | Memorystore + secret injected; no client | Wire rate limits or remove (~$30+/mo) | High |
| W5 | In-memory rate limit + `min_instance=0` / max 10 | `rateLimit.ts`, `cloud_run.tf:11-12` | Per-process Map resets / uneven | Redis-backed limiter | High |
| W6 | Attachments on ephemeral local disk | `env.ts:50-52`, `attachments-storage.ts` | Lost on scale-to-zero / multi-instance | GCS (or pin max instances=1 for demo) | High |
| W7 | No remote Terraform state | `infra/versions.tf` | Local `terraform.tfstate` only | GCS backend + locking | High |
| W8 | Placeholder hello images until CD | `variables.tf:56-59`, `locals.tf:13-16` | Bootstrap pattern | Run Deploy after vars set | High |
| W9 | `allUsers` invoker on 3 services | `cloud_run.tf:358-377` | Public `*.run.app` demo | IAP / Armor for real prod | High |
| W10 | `min_instance_count = 0` | `cloud_run.tf:11` | Cold starts | min=1 for demos if needed | Medium |
| W11 | 512Mi memory under upload concurrency | `cloud_run.tf:81-86`, multer memory | 5 MB buffers in RAM | Cap concurrency / bump memory / stream to GCS | Medium |
| W12 | db-migrate runs as root | `packages/db/Dockerfile:21-28` | No `USER` | Optional non-root for Jobs | High |
| W13 | Migrate `PASSWORD 'unified_app'` vs TF random | `migration.sql:4-6`, `cloud_sql.tf:58-61` | Safe if TF creates user first (`IF NOT EXISTS`) | Document order; never migrate before TF user on GCP | High |
| W14 | Hub/console sibling `NEXT_PUBLIC_*` not `test -n` | Dockerfiles `:21-28` | Empty → localhost bake-in | Guard all three ARGs | High |
| W15 | Deploy health checks API only | `deploy.yml:136-148` | Frontends can be broken silently | Curl hub + console | High |
| W16 | Undocumented `TURBO_TOKEN` / `TURBO_TEAM` | `ci.yml:44-45,53-54` | Optional remote cache | Document as optional | High |
| W17 | AGENTS.md demo emails `*@example.com` | `AGENTS.md:85` vs seed | Doc drift | Use `alice@acme.com` etc. | High |
| W18 | `CORS_ORIGINS` omitted from deployment.md API table | `docs/deployment.md:89-96` | Ops miss | Document TF source | High |
| W19 | Custom domain + stale GitHub URL vars | `cloud_run.tf` + `deploy.yml` | Cookie/CORS vs baked NEXT_PUBLIC drift | Update vars + rebuild all images | High |
| W20 | `deletion_protection = false` | Cloud Run + SQL | Accidental destroy | Enable for real prod | High |

---

## CI/CD prediction (clean runners)

### Required GitHub Variables (Deploy) — exactly 7

| Variable | Source |
|----------|--------|
| `GCP_PROJECT_ID` | `unified-org-workspace` |
| `GCP_REGION` | `us-central1` |
| `WIF_PROVIDER` | `terraform output wif_provider` |
| `WIF_SERVICE_ACCOUNT` | `terraform output github_deploy_service_account` |
| `API_URL` | `cloud_run_urls.api` |
| `SUPPORT_HUB_URL` | `cloud_run_urls.support_hub` |
| `REVIEW_CONSOLE_URL` | `cloud_run_urls.review_console` |

**Secrets required for CD:** none (WIF only).

**Optional CI:** `TURBO_TOKEN` (secret), `TURBO_TEAM` (variable) — missing → slower builds, not failure.

### Live Terraform outputs (for vars)

```
api            = https://unified-org-api-r6xn3etohq-uc.a.run.app
support_hub    = https://unified-org-support-hub-r6xn3etohq-uc.a.run.app
review_console = https://unified-org-review-console-r6xn3etohq-uc.a.run.app
wif_provider   = projects/426201478724/locations/global/workloadIdentityPools/unified-org-github/providers/github
github_deploy  = unified-org-github-deploy@unified-org-workspace.iam.gserviceaccount.com
```

### Clean-runner failure modes

| Failure | When | Mitigation |
|---------|------|------------|
| Next Docker `test -n` fails | Empty `API_URL` | Set GitHub var before Deploy |
| WIF auth denied | Wrong `github_repo` / WIF vars | Match `owner/repo` in tfvars |
| Registry path malformed | Empty `GCP_PROJECT_ID` / `GCP_REGION` | Set vars |
| `gcloud run jobs update` fails | TF not applied | Bootstrap first (already done here) |
| Migrate job fails | Bad `DATABASE_URL` / VPC | Check Secret Manager + Cloud SQL |
| Health smoke fails | API crash (e.g. R1) or cold start | Fix attachments dir; retries exist (5×15s) |
| Localhost baked into Next | Empty hub/console URL vars | Set all three URL vars |
| Missing `.env` in CI | N/A for current CI | Job env vars suffice; dotenv missing file tolerated |
| Seed missing after deploy | By design | Run `seed-demo.yml` manually once |

### Deploy order (correct)

```
Build/push 4 images → update migrate+seed job images → execute migrate --wait
  → update api → support-hub → review-console → curl $API_URL/health
```

No Terraform in CD — manual `infra/` bootstrap required (already applied in this project).

---

## Infrastructure validation (Terraform live)

```
Working directory: infra/
terraform.tfvars: present (gitignored) — project_id=unified-org-workspace
Backend: local state only (no remote backend block)

terraform init     → Success (providers reused)
terraform validate → Success
terraform plan     → Success
  Plan: 0 to add, 3 to change, 0 to destroy
  Changes: in-place scaling block drift on api, support_hub, review_console
           (manual_instance_count / min_instance_count provider noise — cosmetic)
```

**No apply performed.**

### Inventory (from state refresh)

| Resource | Name |
|----------|------|
| Cloud Run | `unified-org-api`, `unified-org-support-hub`, `unified-org-review-console` |
| Jobs | `unified-org-migrate`, `unified-org-seed` |
| Cloud SQL | `unified-org-pg` (PG16, private IP) |
| Redis | `unified-org-redis` (host `172.20.80.91`) |
| Artifact Registry | `unified-org` @ `us-central1` |
| Secrets | JWT_SECRET, DATABASE_URL, DATABASE_APP_URL, REDIS_URL |
| WIF | pool `unified-org-github` → deploy SA |

---

## Cross-service validation

| Integration | Status | Notes |
|-------------|--------|-------|
| Hub/Console → API | ✅ Design OK | `NEXT_PUBLIC_API_URL` at build; `credentials: "include"` |
| API → Cloud SQL | ✅ | `DATABASE_APP_URL` + VPC private IP |
| API → Redis | ⚠️ Unused | Secret present; no app consumer |
| AI digests | N/A | Not implemented (Tier 2) |
| CORS + cookies `*.run.app` | ✅ | `SameSite=None` + Secure + TF CORS origins |
| Custom domain path | ⚠️ Drift risk | Must update GitHub vars + rebuild |
| Demo emails | ⚠️ | Seed: `alice@acme.com`; AGENTS.md wrong |

---

## Security & production checks

| Check | Result |
|-------|--------|
| Hardcoded JWT / prod DB passwords in app | Pass — env / Secret Manager |
| Demo `password123` in seed | Pass — intentional assignment demo |
| `.env` / `terraform.tfvars` / `*.tfstate` gitignored | Pass |
| Non-root API + Next | Pass |
| Root db-migrate | Warning (acceptable for Jobs) |
| `allUsers` invoker | Warning (expected for public demo) |
| Helmet CORP | Pass (not relaxed) |
| Open `POST /auth/register` | Warning — consider gate for prod |
| BOLA org from session only | Pass |

---

## Appendix A runtime results (2026-07-30)

**support-hub build fix (pre-smoke):** `@next/next/no-html-link-for-pages` in `auth-dashboard.tsx` — internal routes use `next/link`.

### Smoke summary

| Step | Result | Notes |
|------|--------|-------|
| API `/health` (with `ATTACHMENTS_DIR=/tmp/attachments`) | ✅ 200 | `{"status":"ok","service":"api",...}` |
| API `/health` (default attachments path, no env) | ✅ 200 | R1 EACCES **not** observed |
| Support Hub `GET /` :8081→8080 | ✅ 200 | Next 15.5.22 Ready in 62ms |
| Review Console `GET /` :8082→8080 | ✅ 200 | Next 15.5.22 Ready in 50ms |
| db-migrate job image | ✅ exit 0 | `migrate_exit=0` (user run) |

### Image sizes (`unified-org/*:audit`)

| Repository | Tag | Size | Image ID |
|------------|-----|------|----------|
| unified-org/api | audit | 884MB | 21857db1f074 |
| unified-org/support-hub | audit | 337MB | 4cefc03f29c6 |
| unified-org/review-console | audit | 337MB | dcc165b30267 |
| unified-org/db-migrate | audit | 821MB | 2f77f7a23522 |

### Key log snippets

```
API server listening on port 8080
{"status":"ok","service":"api","timestamp":"2026-07-30T12:20:36.047Z"}
hub:200 / console:200
✓ Ready in 62ms  (support-hub)
✓ Ready in 50ms  (review-console)
```

---

## Prioritized pre-deploy checklist

### Must complete before treating deploy as ready

1. [x] Run **Appendix A**; confirm builds, `/health`, migrate exit 0
2. [ ] (Recommended) Set `ATTACHMENTS_DIR=/tmp/attachments` in Cloud Run for ephemeral disk — R1 mkdir OK locally but W6 still applies
3. [ ] Confirm all **7 GitHub Variables** match live Terraform outputs above
4. [ ] Confirm WIF `github_repo` matches actual GitHub `owner/repo`
5. [ ] CI green on `main` → Deploy workflow (or `workflow_dispatch`)
6. [ ] Run **Seed Demo Data** once after first successful deploy
7. [ ] Login: `alice@acme.com` / `password123` on both dashboards

### Should fix soon (assignment-tolerable)

- [ ] Graceful shutdown + `/ready` DB check
- [ ] Guard all three `NEXT_PUBLIC_*` in Dockerfiles
- [ ] Fix AGENTS.md demo emails; document `CORS_ORIGINS` + Turbo optional vars
- [ ] Decide: wire Redis or remove Memorystore

### Before real production

- [ ] GCS (or equivalent) for attachments
- [ ] Remote TF state; `deletion_protection`
- [ ] Replace `allUsers` with IAP/authenticated ingress
- [ ] Distributed rate limiting; consider `min_instance >= 1`

---

## Scoring methodology

| Category | Weight | Score | Notes |
|----------|--------|-------|-------|
| Infrastructure (TF) | 25 | 22/25 | Plan clean; local state; cosmetic scaling drift |
| CI/CD | 20 | 16/20 | Strong pipeline; var/WIF ops risk; Turbo undocumented |
| Container config | 20 | 17/20 | Dockerfiles + local smoke pass; R1 not reproduced |
| Runtime hardening | 20 | 8/20 | No shutdown; liveness-only; ephemeral attachments |
| Security | 15 | 10/15 | Good secrets/WIF; public invoker; open register |
| **Total** | 100 | **72/100** | **RISKY** |

**Verdict thresholds:** ≥80 SAFE · 60–79 RISKY · &lt;60 NOT READY

Docker smoke restored +10 vs pending baseline (62→72). Verdict stays **RISKY** until GitHub Variables/WIF confirmed and runtime hardening gaps (W1–W6) addressed; failed B1–B3 would be **NOT READY**.

---

*Generated by GCP pre-deployment audit. No `terraform apply`. Docker builds by user; Appendix A runtime curls by agent 2026-07-30.*
