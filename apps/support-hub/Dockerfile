FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/support-hub/package.json ./apps/support-hub/
COPY packages/config/package.json ./packages/config/
COPY packages/types/package.json ./packages/types/
COPY packages/ui/package.json ./packages/ui/
COPY packages/auth-client/package.json ./packages/auth-client/
RUN pnpm install --frozen-lockfile --filter @unified/support-hub...

FROM deps AS builder
WORKDIR /app
COPY . .
ARG NEXT_PUBLIC_SUPPORT_HUB_URL
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SUPPORT_HUB_URL=$NEXT_PUBLIC_SUPPORT_HUB_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm turbo build --filter=@unified/support-hub

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
USER nextjs
COPY --from=builder /app/apps/support-hub/public ./apps/support-hub/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/support-hub/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/support-hub/.next/static ./apps/support-hub/.next/static
EXPOSE 8080
CMD ["node", "apps/support-hub/server.js"]
