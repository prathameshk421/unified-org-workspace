#!/usr/bin/env bash
# Start API + both Next apps for local/CI auth e2e. Expects migrate+seed already done.
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
export NODE_ENV="${NODE_ENV:-development}"

cleanup() {
  if [[ -n "${API_PID:-}" ]]; then kill "$API_PID" 2>/dev/null || true; fi
  if [[ -n "${HUB_PID:-}" ]]; then kill "$HUB_PID" 2>/dev/null || true; fi
  if [[ -n "${CONSOLE_PID:-}" ]]; then kill "$CONSOLE_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT

pnpm --filter @unified/api exec tsx src/index.ts &
API_PID=$!

pnpm --filter @unified/support-hub exec next dev --port 3000 &
HUB_PID=$!

pnpm --filter @unified/review-console exec next dev --port 3001 &
CONSOLE_PID=$!

echo "Waiting for services..."
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
