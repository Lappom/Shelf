# Shelf

**A self-hosted reading hub focused on reading history, meaningful signals, and personalized recommendations.**

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)](https://react.dev/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?logo=prisma)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](#license)

Shelf helps you track what you read, why you read it, and what to read next.  
EPUB reading is included, but the core value is your **reading timeline + recommendation signals**.

---

## Why Shelf?

- **Reading-first model**: progress, statuses, shelves, tags, annotations, and reading time.
- **Recommendation-ready data**: built to generate relevant suggestions from your real activity.
- **Self-hosted by design**: your catalog, files, metadata, and API keys stay under your control.
- **Metadata-rich workflow**: EPUB extraction, Open Library enrichment, and three-way metadata merge.
- **MCP server built-in**: connect AI clients to your library via `/api/mcp`.

## Key Features

- Multi-user library with roles (`admin`, `reader`)
- EPUB upload + extraction + secure streaming
- Physical book support (without file requirement)
- Dynamic and manual shelves
- Full-text search using PostgreSQL (`tsvector` + `pg_trgm`)
- Metadata synchronization with snapshot-based three-way merge
- Recommendations pipeline and user-facing recommendation feed
- API key management for MCP integrations

## Tech Stack

- **Frontend**: Next.js App Router, React, Tailwind CSS, shadcn/ui
- **Backend**: Next.js Route Handlers + Server Actions
- **Database**: PostgreSQL + Prisma
- **Auth**: Auth.js (NextAuth v5 beta), optional OIDC
- **Storage**: Local filesystem or S3-compatible backend (MinIO, S3)
- **Reader**: `epubjs`
- **Testing**: Vitest + Playwright

---

## Quick Start (Local Development)

### 1) Install dependencies

```bash
pnpm install
```

### 2) Configure environment

```bash
cp .env.example .env
# Windows (PowerShell)
copy .env.example .env
```

Minimum required values:

- `DATABASE_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET` (use a strong secret in production)

### 3) Run PostgreSQL (and optional Redis)

```bash
docker compose -f docker/docker-compose.yml up -d db redis
```

### 4) Apply migrations

```bash
pnpm db:migrate
```

### 5) Start the app

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Run with Docker Compose

From repository root:

```bash
docker compose -f docker/docker-compose.yml up --build
```

The container runs Prisma migrations (`prisma migrate deploy`) before starting the app.

Useful docs:

- [Self-hosted deployment guide](docs/self-hosted.md)
- [Functional specifications](docs/SPECS.md)
- [Roadmap](docs/roadmap.md)

## MCP Integration

Shelf exposes an MCP endpoint at:

`{YOUR_ORIGIN}/api/mcp`

Authenticate with:

`Authorization: Bearer sk_shelf_...`

See full client setup in [docs/mcp-client.md](docs/mcp-client.md).

## Security Principles

- Files are **never served directly** from storage.
- Access goes through authenticated endpoints with authorization checks.
- Server-side input validation is enforced.
- Sensitive routes include rate limiting.

For operational details: [docs/self-hosted.md](docs/self-hosted.md).

---

## Available Scripts

- `pnpm dev` — start development server
- `pnpm build` — production build
- `pnpm start` — start production server
- `pnpm lint` — run ESLint
- `pnpm typecheck` — run TypeScript checks
- `pnpm test` — run unit/integration tests
- `pnpm test:component` — run component tests
- `pnpm test:e2e` — run end-to-end tests

## Project Documentation

- [docs/SPECS.md](docs/SPECS.md) — full product and technical specification
- [docs/roadmap.md](docs/roadmap.md) — implementation roadmap
- [docs/STATE.md](docs/STATE.md) — current implementation status
- [docs/CONVENTIONS.md](docs/CONVENTIONS.md) — coding and architecture conventions

## Contributing

1. Fork the repository
2. Create a feature branch
3. Open a pull request with a clear description and test notes

If your change touches auth, storage, reader, or MCP, include explicit security and regression checks in the PR.

## License

MIT (or project owner preferred license).
