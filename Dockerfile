FROM node:20-alpine
WORKDIR /app

# OpenSSL required by Prisma + Tesseract OCR for product recognition
RUN apk add --no-cache openssl tesseract-ocr tesseract-ocr-data-eng tesseract-ocr-data-rus

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

CMD ["node", "apps/api/dist/index.js"]
