FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/db/package.json ./packages/db/
COPY packages/config/package.json ./packages/config/
# Root package.json overrides serialised-error to this local path (newman dep).
COPY scripts/vendor/serialised-error ./scripts/vendor/serialised-error/
RUN pnpm install --frozen-lockfile --filter @unified/db...

FROM deps AS builder
WORKDIR /app
COPY packages/db ./packages/db
COPY packages/config ./packages/config
RUN pnpm --filter @unified/db exec prisma generate

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json pnpm-workspace.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/db ./packages/db
WORKDIR /app/packages/db
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]
