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
# Playwright suite logs in repeatedly; default 10/min per email trips 429 mid-run.
export AUTH_RATE_LIMIT_MAX="${AUTH_RATE_LIMIT_MAX:-1000}"

# Require real Next production artifacts (BUILD_ID). A partial .next from next
# dev / interrupted builds must not trigger next start.
has_prod_builds=0
if [[ -f apps/api/dist/index.js \
  && -f apps/support-hub/.next/BUILD_ID \
  && -f apps/review-console/.next/BUILD_ID ]]; then
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

port_in_use() {
  lsof -iTCP:"$1" -sTCP:LISTEN -t >/dev/null 2>&1
}

require_free_port() {
  local port="$1"
  local service="$2"
  if port_in_use "$port"; then
    echo "Port ${port} is already in use (${service})." >&2
    echo "Stop the existing process and retry, e.g.:" >&2
    echo "  lsof -iTCP:${port} -sTCP:LISTEN" >&2
    exit 1
  fi
}

assert_process_alive() {
  local pid="$1"
  local name="$2"
  sleep 1
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "${name} failed to start (PID ${pid} exited)." >&2
    if [[ "$name" == "API" ]] && port_in_use "${API_PORT}"; then
      echo "Port ${API_PORT} is in use by another process — the health check may have passed against a stale server." >&2
    fi
    exit 1
  fi
}

require_free_port "${API_PORT}" "API"
require_free_port 3000 "Support Hub"
require_free_port 3001 "Review Console"

if [[ "$USE_PROD" -eq 1 ]]; then
  if [[ "$has_prod_builds" -ne 1 ]]; then
    echo "AUTH_E2E_USE_PROD=1 but complete production builds are missing." >&2
    echo "Need apps/api/dist/index.js plus apps/support-hub/.next/BUILD_ID and apps/review-console/.next/BUILD_ID" >&2
    echo "Run: pnpm build" >&2
    exit 1
  fi

  echo "Starting services with production builds (next start / node dist)..."

  # API stays NODE_ENV=development so Secure cookies are not forced on localhost HTTP.
  NODE_ENV=development pnpm --filter @unified/api exec node dist/index.js &
  API_PID=$!
  assert_process_alive "$API_PID" "API"

  NODE_ENV=production pnpm --filter @unified/support-hub start &
  HUB_PID=$!
  assert_process_alive "$HUB_PID" "Support Hub"

  NODE_ENV=production pnpm --filter @unified/review-console start &
  CONSOLE_PID=$!
  assert_process_alive "$CONSOLE_PID" "Review Console"
else
  echo "No production builds found — starting with next dev / tsx (local fallback)..."
  echo "Tip: run 'pnpm build' first (or set AUTH_E2E_USE_PROD=1 with artifacts) for faster startup."

  pnpm --filter @unified/api exec tsx src/index.ts &
  API_PID=$!
  assert_process_alive "$API_PID" "API"

  pnpm --filter @unified/support-hub dev &
  HUB_PID=$!
  assert_process_alive "$HUB_PID" "Support Hub"

  pnpm --filter @unified/review-console dev &
  CONSOLE_PID=$!
  assert_process_alive "$CONSOLE_PID" "Review Console"
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

echo "Ensuring Playwright Chromium is installed..."
pnpm exec playwright install chromium

pnpm exec playwright test
