#!/usr/bin/env bash
# One-command local bootstrap: env, Postgres, migrate, seed, then start all apps.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

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

require_cmd node
require_cmd pnpm
require_cmd docker

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running. Start Docker Desktop and retry." >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  echo "Creating .env from .env.example..."
  cp .env.example .env
fi

echo "Installing dependencies..."
pnpm install

echo "Starting Postgres..."
docker compose up -d

echo "Waiting for Postgres..."
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U postgres -d unified_org >/dev/null 2>&1; then
    break
  fi
  if [[ "$i" -eq 30 ]]; then
    echo "Timed out waiting for Postgres." >&2
    exit 1
  fi
  sleep 1
done

echo "Running database migrations..."
pnpm --filter @unified/db db:migrate:deploy

echo "Seeding sample data..."
pnpm --filter @unified/db db:seed

API_PORT="${API_PORT:-4000}"
require_free_port "${API_PORT}" "API"
require_free_port 3000 "Support Hub"
require_free_port 3001 "Review Console"

cat <<EOF

Ready. Starting all apps (Ctrl+C stops apps; Postgres stays running).

  API (Identity/Org service):  http://localhost:${API_PORT}/health
  Dashboard 1 (Support Hub):     http://localhost:3000
  Dashboard 2 (Review Console): http://localhost:3001

Demo users (password: password123):
  alice@acme.com
  bob@acme.com
  carol@globex.com
  dave@example.com               (Dave — Acme + Globex)

EOF

exec pnpm dev
