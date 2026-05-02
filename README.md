# PriceRadar

Global crowdsourced price comparison PWA. One person photographs — thousands save.

## Overview

PriceRadar lets users photograph products in stores, instantly recognize them with AI, and publish real-time prices. Other users can search, compare, and analyze prices across stores, cities, and countries.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| PWA | Workbox + Web App Manifest |
| UI | Tailwind CSS + shadcn/ui |
| Charts | Recharts |
| Maps | Leaflet.js + OpenStreetMap |
| Backend | Node.js + Fastify |
| ORM | Prisma |
| Database | PostgreSQL 15 |
| Cache | Redis |
| Auth | JWT + Refresh Tokens |
| Storage | Supabase Storage / S3 |
| AI | Hugging Face BLIP-2 + Google Vision |
| Queue | BullMQ (Redis) |
| Deploy | Railway + Cloudflare Pages |

## Project Structure

```
priceradar/
├── apps/
│   ├── web/          # React PWA (Vite)
│   └── api/          # Fastify backend
├── packages/
│   └── shared/       # TypeScript types & utilities
├── docker-compose.yml
├── .github/workflows/
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker & Docker Compose

### Local Development

```bash
# Install dependencies
pnpm install

# Start PostgreSQL and Redis
docker-compose up -d

# Copy environment variables
cp .env.example .env
# Edit .env with your values

# Generate Prisma client and run migrations
pnpm db:generate
pnpm db:migrate

# Start all services in dev mode
pnpm dev
```

### Services

| Service | URL |
|---------|-----|
| Web App | http://localhost:5173 |
| API | http://localhost:4000 |
| API Docs | http://localhost:4000/docs |
| MailHog | http://localhost:8025 |
| Prisma Studio | http://localhost:5555 |

## Development Phases

- **Phase 1** — MVP: Auth, products, prices, AI recognition, PWA
- **Phase 2** — Analytics & Moderation: queue, Trust Score, charts, comparison
- **Phase 3** — Social: push notifications, favorites, map, i18n
- **Phase 4** — Optimization: performance, offline, load testing

## Environment Variables

See [`.env.example`](.env.example) for all required environment variables.

## Deployment

The app is designed to deploy on:
- **API**: Railway (Node.js + PostgreSQL + Redis)
- **Web**: Cloudflare Pages
- **CDN**: Cloudflare

Pushes to `main` trigger automatic deployment via GitHub Actions.

## License

Private & Confidential — PriceRadar v1.0
