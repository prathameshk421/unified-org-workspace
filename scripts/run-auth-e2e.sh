#!/usr/bin/env bash
# Start API + both Next apps for local/CI auth e2e. Expects migrate+seed already done.
#
# Prefers production servers (node dist + next start) when builds exist or
# AUTH_E2E_USE_PROD=1 is set (CI). Falls back to tsx/next dev only for local
# iteration when dist/.next are missing.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export JWT_SECRET="${JWT_SECRET:-dev-only-secret-min-32-chars-long!!}"
export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/unified_org}"
export DATABASE_APP_URL="${DATABASE_APP_URL:-postgresql://unified_app:unified_app@localhost:5432/unified_org}"
export CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:3000,http://localhost:3001}"
export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://localhost:4000}"
export NEXT_PUBLIC_SUPPORT_HUB_URL="${NEXT_PUBLIC_SUPPORT_HUB_URL:-http://localhost:3000}"
export NEXT_PUBLIC_REVIEW_CONSOLE_URL="${NEXT_PUBLIC_REVIEW_CONSOLE_URL:-http://localhost:3001}"
export API_PORT="${API_PORT:-4000}"

# Keep API cookies usable on http://localhost (Secure cookies would break HTTP e2e).
export NODE_ENV="${NODE_ENV:-development}"
export COOKIE_SECURE="${COOKIE_SECURE:-false}"

has_prod_builds=0
if [[ -f apps/api/dist/index.js && -d apps/support-hub/.next && -d apps/review-console/.next ]]; then
  has_prod_builds=1
fi

USE_PROD=0
if [[ "${AUTH_E2E_USE_PROD:-}" == "1" || "$has_prod_builds" -eq 1 ]]; then
  USE_PROD=1
fi

cleanup() {
  if [[ -n "${API_PID:-}" ]]; then kill "$API_PID" 2>/dev/null || true; fi
  if [[ -n "${HUB_PID:-}" ]]; then kill "$HUB_PID" 2>/dev/null || true; fi
  if [[ -n "${CONSOLE_PID:-}" ]]; then kill "$CONSOLE_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT

if [[ "$USE_PROD" -eq 1 ]]; then
  if [[ "$has_prod_builds" -ne 1 ]]; then
    echo "AUTH_E2E_USE_PROD=1 but builds are missing." >&2
    echo "Need apps/api/dist, apps/support-hub/.next, apps/review-console/.next" >&2
    exit 1
  fi

  echo "Starting services with production builds (next start / node dist)..."

  # API stays NODE_ENV=development so Secure cookies are not forced on localhost HTTP.
  NODE_ENV=development pnpm --filter @unified/api exec node dist/index.js &
  API_PID=$!

  NODE_ENV=production pnpm --filter @unified/support-hub start &
  HUB_PID=$!

  NODE_ENV=production pnpm --filter @unified/review-console start &
  CONSOLE_PID=$!
else
  echo "No production builds found — starting with next dev / tsx (local fallback)..."
  echo "Tip: run 'pnpm build' first (or set AUTH_E2E_USE_PROD=1 with artifacts) for faster startup."

  pnpm --filter @unified/api exec tsx src/index.ts &
  API_PID=$!

  pnpm --filter @unified/support-hub dev &
  HUB_PID=$!

  pnpm --filter @unified/review-console dev &
  CONSOLE_PID=$!
fi

echo "Waiting for services (prod=${USE_PROD})..."
for i in $(seq 1 60); do
  if curl -sf "http://localhost:4000/health" >/dev/null \
    && curl -sf "http://localhost:3000/login" >/dev/null \
    && curl -sf "http://localhost:3001/login" >/dev/null; then
    echo "All services ready"
    break
  fi
  if [[ "$i" -eq 60 ]]; then
    echo "Timed out waiting for services" >&2
    exit 1
  fi
  sleep 2
done

pnpm test:auth
pnpm exec playwright test
