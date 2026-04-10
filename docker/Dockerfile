FROM node:20-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
RUN corepack enable
# prisma.config.ts requires DATABASE_URL to load; install postinstall runs prisma generate
ENV DATABASE_URL=postgresql://ci:ci@127.0.0.1:5432/ci
COPY package.json pnpm-lock.yaml prisma.config.ts ./
COPY prisma ./prisma/
RUN pnpm install --frozen-lockfile

FROM base AS build
RUN corepack enable
ENV DATABASE_URL=postgresql://ci:ci@127.0.0.1:5432/ci
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm db:generate
ENV SKIP_ENV_VALIDATION=1
RUN pnpm build

FROM base AS runner
ENV NODE_ENV=production
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
COPY --from=build /app/public ./public
COPY --from=build /app/.next ./.next
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/prisma ./prisma
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && chown nextjs:nodejs /entrypoint.sh

USER nextjs
EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]

