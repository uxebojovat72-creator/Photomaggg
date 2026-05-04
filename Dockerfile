FROM node:20-slim
WORKDIR /app

# Install OpenSSL (required by Prisma schema engine)
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# Copy workspace manifests first (for layer caching)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Install all workspace dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# Build shared types, generate Prisma client, compile API
RUN pnpm --filter @priceradar/shared build
RUN pnpm --filter api prisma:generate
RUN pnpm --filter api build

ENV NODE_ENV=production
EXPOSE 4000

# On start: push DB schema then run server
CMD ["sh", "-c", "pnpm --filter api prisma:push && node apps/api/dist/index.js"]
