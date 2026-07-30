FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/config/package.json ./packages/config/
COPY packages/types/package.json ./packages/types/
COPY packages/db/package.json ./packages/db/
# Root package.json overrides serialised-error to this local path (newman dep).
COPY scripts/vendor/serialised-error ./scripts/vendor/serialised-error/
RUN pnpm install --frozen-lockfile --filter @unified/api...

FROM deps AS builder
WORKDIR /app
COPY . .
RUN pnpm --filter @unified/db exec prisma generate
RUN pnpm turbo build --filter=@unified/api

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 expressjs

# Preserve monorepo paths so pnpm workspace symlinks resolve:
# apps/api/node_modules/@unified/types -> ../../../../packages/types
COPY --from=builder --chown=expressjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=expressjs:nodejs /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder --chown=expressjs:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=expressjs:nodejs /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder --chown=expressjs:nodejs /app/packages/types/package.json ./packages/types/package.json
COPY --from=builder --chown=expressjs:nodejs /app/packages/types/dist ./packages/types/dist

USER expressjs
WORKDIR /app/apps/api
EXPOSE 8080
CMD ["node", "dist/index.js"]
