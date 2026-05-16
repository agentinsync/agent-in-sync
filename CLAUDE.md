# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
# Root-level (runs across all packages via Turborepo)
pnpm build              # Build all packages
pnpm dev                # Dev mode (all packages)
pnpm test               # Run all tests
pnpm lint               # Lint all packages
pnpm lint:fix           # Auto-fix lint issues
pnpm format             # Format with Prettier
pnpm format:check       # Check formatting
pnpm typecheck          # Type-check all packages

# Single package
pnpm --filter @agent-in-sync/backend test
pnpm --filter @agent-in-sync/backend test:watch
pnpm --filter @agent-in-sync/backend dev        # tsx watch with .env
pnpm --filter @agent-in-sync/frontend dev        # Vite on :5173
pnpm --filter @agent-in-sync/mcp-server dev

# Run a single test file
pnpm --filter @agent-in-sync/backend test -- src/services/search.service.test.ts

# Database (from db-client package)
pnpm --filter @agent-in-sync/db-client db:generate   # Generate migrations
pnpm --filter @agent-in-sync/db-client db:push       # Push schema to DB
pnpm --filter @agent-in-sync/db-client db:studio      # Drizzle Studio UI

# Infrastructure
docker-compose up -d postgres weaviate t2v-transformers reranker-transformers
```

## Architecture

**Monorepo** (Turborepo + pnpm workspaces) with 6 packages:

```
packages/
  backend/      Express 4.x API server (TypeScript, port 3000)
  frontend/     React 19 + TanStack Router + shadcn/ui (Vite, port 5173)
  mcp-server/   MCP server with HTTP transport (port 3001)
  db-client/    Drizzle ORM schema & database client (PostgreSQL)
  shared/       Zod validation schemas shared between backend & frontend
  cli/          CLI tool for MCP setup and skills/rules installation (@agent-in-sync/cli)
  cli/          CLI tool for MCP setup and skills/rules installation (@agent-in-sync/cli)
```

**Dependency graph:** `mcp-server → backend → db-client, shared`; `frontend → shared`

### Backend Structure

Routes (`routes/`) handle HTTP concerns (validation, response). Services (`services/`) contain business logic. Services receive dependencies via `ServiceDependencies` (db, weaviateClient) for testability.

**Auth is dual-mode:** session-based (Better Auth with GitHub/Google OAuth) for humans, SHA-256 hashed API keys (`ask_` prefix, `x-api-key` header) for agents. Middleware chain: `requireAuth` → `requireOrganization` → route handler.

**Multi-tenancy:** organization-based isolation. Most content tables have `organizationId`. Users belong to organizations via `organization_members` with roles: `member`, `reviewer`, `admin`.

### Database

Schema in `packages/db-client/src/schema.ts` (~20 tables). Uses Drizzle ORM with `pg` driver. Singleton pool via `getDb()`. Environment variable: `DATABASE_URL`.

**CRITICAL — migrations:** After every change to `schema.ts`, run `pnpm --filter @agent-in-sync/db-client db:generate` and commit **both** the generated `.sql` file and the updated `drizzle/meta/_journal.json`. Never hand-write SQL files directly into `drizzle/` — `drizzle-kit migrate` reads only what is registered in the journal and will silently skip unregistered files, leaving production columns missing.

### Vector Search

Weaviate for semantic search (collections: `Solution`, `Issue`). Three search types: `vector` (semantic), `keyword` (PostgreSQL full-text), `hybrid` (combined).

### Frontend

File-based routing via TanStack Router. Protected routes under `_protected` layout. Auth client via Better Auth React SDK. Styling: Tailwind CSS 4.x + shadcn/ui. State: TanStack Query.

### Shared Package

Zod schemas used for request validation on backend and type inference on frontend. Always derive types via `z.infer<typeof schema>` instead of separate interfaces.

### Observability

Structured logging and metrics via Axiom (`packages/backend/src/observability/`). KPI tracking for key events (searches, submissions, votes).

## Code Conventions

- **Module system:** ESM everywhere. Use `.js` extensions in imports even for TypeScript files.
- **TypeScript:** Strict mode with `noUncheckedIndexedAccess`, `noImplicitReturns`, `noUnusedLocals`.
- **Prettier:** Single quotes, trailing commas (es5), 100 char width, no parens on single arrow params.
- **Testing:** Vitest. Co-locate test files next to source (`example.test.ts`). Backend uses supertest for HTTP tests. Frontend uses happy-dom + @testing-library/react.
- **Early returns** over nested conditions.
- **Prefer self-documenting code** over comments. Only comment "why", never "what".
- **Helper functions** go at the bottom of files, not the top.
- **All imports** at the top of files, no mid-file dynamic imports.
- **Don't export** types/interfaces only used within the same file.
- **Minimal code changes:** only modify sections related to the task. Avoid unrelated cleanup.

## Design Log Methodology

Check `./design-log/` before making significant changes. For new features: create a design log first (Background → Problem → Q&A → Design → Implementation Plan → Examples → Trade-offs). When implementing, follow the plan phases, append "Implementation Results" section, and document any deviations.
