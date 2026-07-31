# Requirements — AI Progress Tracker

Personalized digests delivered by a background worker, shown in an in-app notification bell. Isolation matches ticket/PR share rules. Chatbots and push (FCM/web-push) remain out of scope.

**Email channel (Argus):** optional second delivery channel on the same digest worker (`feat/email-push-notifications` / email-digest work). Brand-locked as **Argus** — From `Argus <argus.unified.workspace@gmail.com>`, sender Gmail `argus.unified.workspace@gmail.com`. Default **off** (`DIGEST_EMAIL_ENABLED=false`); soft-fail so SMTP issues never block in-app. Bell list/unread filter `IN_APP` only so EMAIL rows do not double the badge. Env tables: [setup.md](../setup.md#ai-progress-tracker-digest) (local) and [deployment.md](../deployment.md#ai-progress-tracker-digest) (GCP).

## Behavior

- Collect facts per user across **all accepted memberships** + inbound `ShareGrant`s (`listInboundSharedTicketIds` / `listInboundSharedPrIds`).
- Tickets: assignee + `OPEN`/`IN_PROGRESS`. **Stale** = idle by `updatedAt` (no `dueDate` column).
- PRs: `ORG_ADMIN`/`REVIEWER` only for member waiting-review; shared PRs are view-only (not elevated to review).
- Summarize with **Groq** (`GROQ_API_KEY`, model default `openai/gpt-oss-20b`) using **only** scoped `DigestFacts` JSON. Template fallback on missing key / timeout / error.
- Persist `Notification` rows (`IN_APP`; optional `EMAIL` when Argus email is enabled). API never returns `facts` JSON.
- Revoke share / connection → soft-redact notifications that referenced that resource.

## Worker

```bash
DIGEST_ENABLED=true pnpm --filter @unified/api digest:once
```

Local env table + optional flags: [docs/setup.md](../setup.md#ai-progress-tracker-digest).  
Production: Cloud Run Job `unified-org-digest` (API image, `DATABASE_APP_URL`) + Cloud Scheduler `0 6 * * *` UTC — [docs/deployment.md](../deployment.md#ai-progress-tracker-digest).

## API

| Method | Path | Auth |
|--------|------|------|
| GET | `/notifications` | `requireAuth` only |
| GET | `/notifications/unread-count` | `requireAuth` |
| POST | `/notifications/:id/read` | `requireAuth`; foreign id → 404 |
| POST | `/notifications/read-all` | `requireAuth` |

`Cache-Control: no-store`. No client `orgId` / `userId` scoping.

## Tests

`apps/api/tests/integration/ai-digest-leak.test.ts` is on the product BOLA allowlist (`vitest.bola.config.ts`).

## Out of scope

- Push (FCM / web-push) — still deferred even on the email-digest branch
- `feat/github-webhooks`
- `feat/shared-ui-polish`
- In-app chatbot
- Redis fanout / SSE
