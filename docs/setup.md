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

4. **Run database migrations**

   ```bash
   pnpm --filter @unified/db db:migrate
   ```

5. **Seed sample data**

   ```bash
   pnpm --filter @unified/db db:seed
   ```

   Demo users all use password `password123`. See [requirements/database-schema.md](./requirements/database-schema.md) for seed details.

6. **Run all apps**

   ```bash
   pnpm dev
   ```

## App URLs

| App                    | URL                          |
| ---------------------- | ---------------------------- |
| API                    | http://localhost:4000/health |
| Support Hub            | http://localhost:3000        |
| Review & Audit Console | http://localhost:3001        |

## AI Progress Tracker (digest)

Digests are delivered by a **background worker**, not on page load / `pnpm dev`. The notification bell reads rows the worker already wrote.

Migration `20260731020000_digest_notifications` (included in `pnpm --filter @unified/db db:migrate`) creates `digest_runs` + `notifications`. No special seed is required — run the worker against existing demo users/tickets/PRs.

### Local env (root `.env`)

| Variable | Required? | Default | Notes |
| -------- | --------- | ------- | ----- |
| `DIGEST_ENABLED` | yes to process | `false` | Must be `true` for the worker to create notifications |
| `GROQ_API_KEY` | optional | unset | Groq LLM summaries; template fallback if missing |
| `DIGEST_LLM_ENABLED` | optional | `true` if key set | Force off with `false` even when key is present |
| `GROQ_MODEL` | optional | `openai/gpt-oss-20b` | Groq model id |
| `DIGEST_TICKET_STALE_DAYS` | optional | `3` | Idle ticket threshold (`updatedAt`) |
| `DIGEST_PR_IDLE_DAYS` | optional | `3` | Waiting-review PR idle threshold |
| `DIGEST_LLM_TIMEOUT_MS` | optional | `8000` | Groq request timeout |
| `DIGEST_MAX_USERS_PER_RUN` | optional | `10000` | Cap users processed per run |
| `DIGEST_STALE_RUNNING_MS` | optional | `600000` | Resume stale `RUNNING` digest claims |

The worker also needs `DATABASE_APP_URL` (same as API runtime). It does not need `JWT_SECRET`.

### Argus email digest (optional second channel)

**Argus** is the only brand for outbound digest email. Sender Gmail: `argus.unified.workspace@gmail.com`. Default From: `Argus <argus.unified.workspace@gmail.com>`.

Email delivery is **off by default** (`DIGEST_EMAIL_ENABLED=false`). Only the digest worker uses these vars — not `pnpm dev` / the API request path. Soft-fail: missing SMTP config or send errors never block in-app delivery.

| Variable | Required? | Default | Notes |
| -------- | --------- | ------- | ----- |
| `DIGEST_EMAIL_ENABLED` | no | `false` | Master switch — leave `false` until you intentionally enable Argus email |
| `SMTP_HOST` | when enabled | `smtp.gmail.com` | Gmail SMTP |
| `SMTP_PORT` | when enabled | `587` | STARTTLS |
| `SMTP_USER` | when enabled | — | `argus.unified.workspace@gmail.com` |
| `SMTP_PASS` | when enabled | — | Gmail **App Password** for Argus (not the normal Gmail password) |
| `SMTP_FROM` | no | `Argus <argus.unified.workspace@gmail.com>` | From header |
| `DIGEST_EMAIL_ALLOWLIST` | no | empty | Soft rollout: only email these comma-separated addresses |
| `DIGEST_EMAIL_REDIRECT_TO` | no | empty | **Local/test only** — forces every send to one inbox; **never set in production** |

Recipient rules when email is enabled: redirect (if set) → else allowlist (if non-empty) → else `user.email`.

Seed user **Dave** (`temporary.hamesha.ka.group@gmail.com`) is the real-inbox recipient for Argus email testing. Prefer allowlisting that address locally — do **not** set `DIGEST_EMAIL_REDIRECT_TO` for this path (redirect remains available for other ad-hoc tests only; never in production).

```bash
# Local test: allowlist Dave’s real inbox (seed user)
DIGEST_EMAIL_ENABLED=true
DIGEST_EMAIL_ALLOWLIST=temporary.hamesha.ka.group@gmail.com
SMTP_USER=argus.unified.workspace@gmail.com
SMTP_FROM=Argus <argus.unified.workspace@gmail.com>
SMTP_PASS=xxxx xxxx xxxx xxxx
```

Create the Argus Gmail account, enable 2-Step Verification, then create an [App Password](https://myaccount.google.com/apppasswords) (Mail / Other → “Argus”) for `SMTP_PASS`.

### Run once locally

```bash
# After migrate/seed; optional GROQ_API_KEY in .env for LLM (template fallback without it)
DIGEST_ENABLED=true pnpm --filter @unified/api digest:once
```

Optional: `DIGEST_ENABLED=true pnpm --filter @unified/api digest:once -- --scheduled-for=2026-07-31T06:00:00.000Z`

With Argus email enabled + Dave allowlist (local):

```bash
DIGEST_ENABLED=true DIGEST_EMAIL_ENABLED=true \
  SMTP_USER=argus.unified.workspace@gmail.com \
  SMTP_FROM='Argus <argus.unified.workspace@gmail.com>' \
  SMTP_PASS='xxxx xxxx xxxx xxxx' \
  DIGEST_EMAIL_ALLOWLIST=temporary.hamesha.ka.group@gmail.com \
  pnpm --filter @unified/api digest:once
```

Then open Support Hub or Review Console — the notification bell should show the digest (in-app only; EMAIL rows do not inflate the bell). Check Dave’s Gmail for the Argus message.

Isolation leak coverage: `pnpm test:bola` includes `ai-digest-leak.test.ts`. Product details: [requirements/ai-progress-tracker.md](./requirements/ai-progress-tracker.md). Production job + Scheduler: [deployment.md](./deployment.md#ai-progress-tracker-digest).

## Auth verification (Branch 3)

With the API running (`pnpm --filter @unified/api dev`), test auth via curl or Postman. See [requirements/identity-auth.md](./requirements/identity-auth.md).

Postman: import [`postman/unified-org-identity-auth.postman_collection.json`](../postman/unified-org-identity-auth.postman_collection.json) or run `pnpm test:auth` (Newman complementary smoke: identity, RBAC, tickets BOLA) with API on port 4000. Newman is **not** the product BOLA gate exit criterion.

## API integration / product BOLA gate

Requires Postgres migrated (`pnpm --filter @unified/db exec prisma migrate deploy`) and the same local `DATABASE_URL` / `DATABASE_APP_URL` as in [AGENTS.md](../AGENTS.md).

```bash
pnpm test:bola              # Core Product Security Gate (exact allowlist)
pnpm test:product-security  # alias for test:bola
pnpm test:integration       # full API integration suite
```

See [requirements/bola-tests.md](./requirements/bola-tests.md) and [requirements/product-bola-gate.md](./requirements/product-bola-gate.md).

## Common commands

```bash
pnpm lint          # ESLint across workspace
pnpm typecheck     # TypeScript across workspace
pnpm build         # Production build for all apps/packages
pnpm test          # Package unit tests (turbo)
pnpm test:bola     # Product BOLA security gate
DIGEST_ENABLED=true pnpm --filter @unified/api digest:once   # one-shot AI digest worker
```

## Monorepo layout

- `apps/api` — Express API (`@unified/api`)
- `apps/support-hub` — Next.js Dashboard 1 (`@unified/support-hub`)
- `apps/review-console` — Next.js Dashboard 2 (`@unified/review-console`)
- `packages/*` — Shared libraries (`@unified/ui`, `@unified/types`, etc.)

See [requirements/monorepo-scaffold.md](./requirements/monorepo-scaffold.md) for full scaffold scope.
