# Foundation Security Test Findings

Documented gaps and risks surfaced while implementing the Tier 1 foundation security test suite. These are **tracked, not fixed** in the foundation-security-tests branch so the test diff stays reviewable.

## 1. No global 404 / error handler

Unknown routes return Express's default HTML 404 page. Unhandled async errors can leak stack traces outside production. Integration tests track this with `test.fails()` in `apps/api/tests/integration/hardening.test.ts`.

**Follow-up:** Add a global JSON error handler and 404 middleware in `apps/api/src/app.ts`.

## 2. In-memory rate limiter is per-process

Auth rate limits use a process-local `Map` with no eviction of expired keys. On multi-instance Cloud Run deployments, limits are approximate at best, and long-running processes can accumulate bucket entries under sustained attack.

**Follow-up:** Move to Redis-backed rate limiting or add bucket TTL eviction.

## 3. Parallel refresh race can trigger token reuse logout

Two clients refreshing the same session concurrently can cause one request to succeed and another to hit refresh-token reuse detection, revoking the entire session chain. The browser client's single-flight refresh hides this; native or multi-tab clients may not.

**Follow-up:** Use database-level locking or idempotent refresh rotation.

## 4. Duplicated bcrypt rounds constant

`env.bcryptRounds` is defined as `12` in `apps/api/src/lib/env.ts`, but `apps/api/src/routes/identity/auth/service.ts` hard-codes `12` in `bcrypt.hash()` calls.

**Follow-up:** Use `env.bcryptRounds` consistently in the service layer.

## 5. Audit flush errors are swallowed

`auditMutations` flushes audit rows on `res.on("finish")` and logs failures to stderr only. A failed audit write is invisible to the caller and monitoring.

**Follow-up:** Emit metrics/alerts on audit flush failure; consider failing closed for security-sensitive mutations.
