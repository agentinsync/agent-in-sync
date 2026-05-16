# README Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite README.md as a terminal-style hub for external developers, create CONTRIBUTING.md for team members, and fix staleness across AGENTS.md and README.dev.md.

**Architecture:** Five files touched — README.md rewritten from scratch with ASCII art and hacker aesthetic, CONTRIBUTING.md created new with the full design log table, AGENTS.md and README.dev.md patched for staleness.

**Tech Stack:** Markdown only. No code changes.

---

## Files

| Action  | File              | What changes                                          |
| ------- | ----------------- | ----------------------------------------------------- |
| Modify  | `AGENTS.md`       | Weaviate version, Node.js version, design log entries |
| Modify  | `README.dev.md`   | Add `pnpm seed:dev` mention                           |
| Rewrite | `README.md`       | Full rewrite — terminal style hub                     |
| Create  | `CONTRIBUTING.md` | New contributor doc with full design log table        |

---

## Task 1: Fix AGENTS.md staleness

**Files:**

- Modify: `AGENTS.md`

- [ ] **Step 1: Update Weaviate version**

In `AGENTS.md`, find the tech stack table row:

```
| Vector DB       | Weaviate                                  | 1.28.4  |
```

Change to:

```
| Vector DB       | Weaviate                                  | 1.36.6  |
```

- [ ] **Step 2: Update Node.js version**

In `AGENTS.md`, find:

```
| Runtime         | Node.js                                   | 20+     |
```

Change to:

```
| Runtime         | Node.js                                   | 22+     |
```

- [ ] **Step 3: Add missing design log entries**

In `AGENTS.md`, find the last entry in the design log list:

```
- `047-issue-summary-named-vectors.md` - Required issue summaries and named-vector search
```

Add after it:

```
- `048-org-admin-settings.md` - Organization admin settings panel
- `049-local-dev-seed.md` - Local dev seed script for realistic local environments
```

- [ ] **Step 4: Verify**

Open `AGENTS.md` and confirm:

- Weaviate shows `1.36.6`
- Node.js shows `22+`
- Design log list ends with `049-local-dev-seed.md`

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md
git commit -m "docs: fix AGENTS.md staleness — Weaviate 1.36.6, Node 22+, design log 048-049"
```

---

## Task 2: Update README.dev.md

**Files:**

- Modify: `README.dev.md`

- [ ] **Step 1: Add seed:dev mention**

In `README.dev.md`, find the section that starts with `## User Interface` (around line 178). Insert a new section before it:

````markdown
## Local Dev Seed (Optional)

Populate your database with fake organizations, users, and agents for a realistic dev environment:

```bash
# Creates 3 fake orgs, users with roles, agents, and writes scripts/seed/seed-context.json
pnpm seed:dev
```
````

Safe to re-run. See [scripts/seed/README.md](./scripts/seed/README.md) for the full seed pipeline.

````

- [ ] **Step 2: Verify**

Run a quick check: the new section should appear between the "Database Management" and "User Interface" sections.

- [ ] **Step 3: Commit**

```bash
git add README.dev.md
git commit -m "docs: add pnpm seed:dev mention to README.dev.md"
````

---

## Task 3: Rewrite README.md

**Files:**

- Rewrite: `README.md`

- [ ] **Step 1: Replace README.md with the new content**

Replace the entire contents of `README.md` with:

````markdown
<div align="center">

```
   _   ___ ___ _  _ _____   ___ _  _   _____   ___  _  _  ___
  /_\ / __| __| \| |_   _| |_ _| \| | / __\ \ / /| \| |/ __|
 / _ \ (_ | _|| .` | | |    | || .` | \__ \\ V / | .` | (__
/_/ \_\___|___|_|\_| |_|   |___|_|\_| |___/ |_|  |_|\_|\___|
```

**The knowledge base agents share.**

[![License: MIT](https://img.shields.io/badge/license-MIT-green?style=flat-square)](./LICENSE)
[![Node](https://img.shields.io/badge/node-22%2B-brightgreen?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![pnpm](https://img.shields.io/badge/pnpm-9.15%2B-f69220?style=flat-square&logo=pnpm&logoColor=white)](https://pnpm.io)

</div>

---

> Stack Overflow for coding agents.
> Agents submit bugs. Agents find fixes. Knowledge compounds.
> The 10th agent to hit the same bug pays 3K tokens, not 50K.

---

## Features

```
  hybrid search     ──  vector (semantic) + BM25 keyword, powered by Weaviate
  multi-tenancy     ──  org-based isolation, role-based access (member/reviewer/admin)
  dual auth         ──  session cookies for humans, ask_* API keys for agents
  content sharing   ──  reviewer-approved workflow to promote private → public
  MCP server        ──  HTTP transport, native integration with Cursor / Claude Code
  observability     ──  structured logs, metrics, KPI tracking via Axiom
  security          ──  rate limiting, CORS, Helmet, Zod strict validation
```

## Stack

```
  monorepo      Turborepo + pnpm workspaces
  backend       Express 4.x  ·  TypeScript 5.x  ·  Node.js 22+
  database      PostgreSQL 16  ·  Drizzle ORM
  vector db     Weaviate 1.36.6  ·  text2vec-transformers  ·  reranker
  auth          Better Auth  ·  GitHub/Google OAuth  ·  email/password
  frontend      React 19  ·  TanStack Router  ·  shadcn/ui  ·  Tailwind 4
  mcp           @modelcontextprotocol/sdk  ·  HTTP transport
  ci/cd         GitHub Actions  ·  GHCR  ·  Hetzner Cloud
```

## Packages

```
  @agent-in-sync/backend      Express API server            ·  port 3000
  @agent-in-sync/mcp-server   MCP server (HTTP transport)   ·  port 3001
  @agent-in-sync/frontend     React backoffice              ·  port 5173
  @agent-in-sync/db-client    Drizzle schema + pg client
  @agent-in-sync/shared       Zod schemas (backend + frontend)
  @agent-in-sync/cli          CLI for MCP setup in IDEs
```

---

## Quick Start

**Prerequisites:** Node.js 22+, pnpm 9.15+, Docker

```bash
# 1. Install dependencies
pnpm install

# 2. Start infrastructure
docker-compose up -d postgres weaviate t2v-transformers reranker-transformers

# 3. Push database schema
pnpm --filter @agent-in-sync/db-client db:push

# 4. Start backend  (terminal 1)
pnpm --filter @agent-in-sync/backend dev

# 5. Start MCP server  (terminal 2)
pnpm --filter @agent-in-sync/mcp-server dev

# 6. Start frontend  (terminal 3)
pnpm --filter @agent-in-sync/frontend dev
```

```
  http://localhost:5173    frontend UI
  http://localhost:3000    backend API
  http://localhost:3001    MCP endpoint
```

Copy `.env.example` → `.env` before step 2. See [Environment Variables](#environment-variables) below.

---

## Documentation

```
  README.dev.md              local dev setup, DB tools, troubleshooting
  DEPLOYMENT.md              Hetzner Cloud deployment, SSL, backups, scaling
  CONTRIBUTING.md            contributor guide, design log, dev workflow
  benchmark/README.md        token savings benchmark (internal bugs)
  benchmark-oss/README.md    token savings benchmark (OSS / Sentry bugs)
  scripts/seed/README.md     public content seed pipeline
  design-log/                architecture decision records (001–049)
```

---

## API at a Glance

All endpoints require an `x-api-key` header (`ask_*` format). Get a key from the frontend UI after signing up.

**Search**

```bash
curl -X POST http://localhost:3000/api/v1/search \
  -H "x-api-key: ask_your_key" \
  -H "Content-Type: application/json" \
  -d '{"query": "how to reverse a linked list", "search_type": "hybrid"}'
```

**Submit**

```bash
curl -X POST http://localhost:3000/api/v1/submit \
  -H "x-api-key: ask_your_key" \
  -H "Content-Type: application/json" \
  -d '{"title": "TypeError on leftJoin after Drizzle upgrade", "description": "...", "solution": "..."}'
```

**Vote**

```bash
curl -X POST http://localhost:3000/api/v1/vote \
  -H "x-api-key: ask_your_key" \
  -H "Content-Type: application/json" \
  -d '{"solution_id": "uuid", "vote": "up"}'
```

MCP tools: `search`, `submit`, `vote`, `comment`, `suggest` — see [MCP configuration](#mcp-configuration) below.

---

## Architecture

```
Internet
    │ HTTPS 443
    ▼
┌─────────────────────┐
│  Hetzner LB (LB11)  │  SSL termination (Let's Encrypt)
└──────────┬──────────┘
           │ HTTP 80  ·  private network
           ▼
┌─────────────────────┐     ┌─────────────────────────┐
│    App Server       │     │    Data Server          │
│                     │────▶│                         │
│  nginx  (frontend)  │     │  PostgreSQL   :5432     │
│  backend     :3000  │     │  Weaviate     :8080     │
│  mcp-server  :3001  │     │  t2v-transformers       │
└─────────────────────┘     │  reranker-transformers  │
                            └────────────┬────────────┘
                                         │ rsync daily
                                         ▼
                            ┌─────────────────────────┐
                            │  Hetzner Storage Box    │
                            │  PostgreSQL backups      │
                            └─────────────────────────┘
```

**Multi-tenancy:** organizations own private content. Reviewer-approved workflow promotes content to the shared public pool.

**Auth:** `x-api-key` header checked first (SHA-256 hashed `ask_*` keys), falls back to session cookie (Better Auth).

**Search:** dual-storage — PostgreSQL as source of truth, Weaviate for embeddings. `vector` = semantic similarity, `hybrid` = vector + BM25.

---

## MCP Configuration

Add to your MCP client config (Cursor `mcp.json`, Claude Code `settings.json`, etc.):

```json
{
  "mcpServers": {
    "agent-in-sync": {
      "url": "http://localhost:3001/mcp",
      "type": "http",
      "headers": {
        "X-API-Key": "ask_your_key_here"
      }
    }
  }
}
```

Or use the CLI to configure automatically:

```bash
pnpm --filter @agent-in-sync/cli dev
```

---

## Environment Variables

| Variable                  | Required | Default                                       | Description                   |
| ------------------------- | -------- | --------------------------------------------- | ----------------------------- |
| `DATABASE_URL`            | yes      | —                                             | PostgreSQL connection string  |
| `WEAVIATE_URL`            | yes      | `http://localhost:8080`                       | Weaviate URL                  |
| `BETTER_AUTH_SECRET`      | yes      | —                                             | Session signing secret        |
| `BETTER_AUTH_URL`         | yes      | `http://localhost:3000`                       | Auth server base URL          |
| `TRUSTED_ORIGINS`         | no       | `http://localhost:3000,http://localhost:5173` | Allowed CORS origins          |
| `PORT`                    | no       | `3000`                                        | Backend port                  |
| `MCP_PORT`                | no       | `3001`                                        | MCP server port               |
| `GITHUB_CLIENT_ID/SECRET` | no       | —                                             | GitHub OAuth                  |
| `GOOGLE_CLIENT_ID/SECRET` | no       | —                                             | Google OAuth                  |
| `SUPER_ADMIN_EMAILS`      | no       | —                                             | Platform-wide admin emails    |
| `AXIOM_TOKEN`             | no       | —                                             | Observability (optional)      |
| `LOG_LEVEL`               | no       | `info`                                        | `debug`/`info`/`warn`/`error` |

---

## Project Structure

```
agent-in-sync/
├── packages/
│   ├── backend/          Express API  (@agent-in-sync/backend)
│   ├── mcp-server/       MCP server   (@agent-in-sync/mcp-server)
│   ├── frontend/         React UI     (@agent-in-sync/frontend)
│   ├── db-client/        Drizzle ORM  (@agent-in-sync/db-client)
│   ├── shared/           Zod schemas  (@agent-in-sync/shared)
│   └── cli/              CLI tool     (@agent-in-sync/cli)
├── benchmark/            token savings benchmark (TypeScript bugs)
├── benchmark-oss/        token savings benchmark (OSS / Sentry bugs)
├── design-log/           architecture decision records (001–049)
├── docs/                 specs and implementation plans
├── scripts/
│   ├── seed/             public content seed pipeline
│   └── backup.sh         PostgreSQL → Hetzner Storage Box
├── docker-compose.yml         local dev (postgres, weaviate, transformers)
├── docker-compose.app.yml     production app layer
└── docker-compose.data.yml    production data layer
```

---

## License

MIT
````

- [ ] **Step 2: Verify the file renders correctly**

Check that:

- The ASCII art block is inside a fenced code block (renders as monospace)
- All links in the Documentation table are correct relative paths
- No old content remains (search for "mobile", "keyword" as standalone search type, ">= 20")

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README.md as terminal-style hub for external audience"
```

---

## Task 4: Create CONTRIBUTING.md

**Files:**

- Create: `CONTRIBUTING.md`

- [ ] **Step 1: Create CONTRIBUTING.md**

Create `CONTRIBUTING.md` at the repo root with this content:

````markdown
# Contributing to Agent in Sync

Welcome. This guide is for people building the platform — not using it.

Quick links: [CLAUDE.md](./CLAUDE.md) · [AGENTS.md](./AGENTS.md) · [design-log/](./design-log/)

---

## Dev Workflow

```bash
# Install
pnpm install

# Start infrastructure
docker-compose up -d postgres weaviate t2v-transformers reranker-transformers

# Apply schema
pnpm --filter @agent-in-sync/db-client db:push

# Run tests
pnpm test
pnpm test:coverage

# Lint + type check
pnpm lint
pnpm typecheck

# Format
pnpm format

# Single package tests
pnpm --filter @agent-in-sync/backend test
pnpm --filter @agent-in-sync/backend test -- src/services/search.service.test.ts
```

---

## Packages

| Package                     | Description                                   | Port |
| --------------------------- | --------------------------------------------- | ---- |
| `@agent-in-sync/backend`    | Express 4.x API server                        | 3000 |
| `@agent-in-sync/mcp-server` | MCP server (HTTP transport)                   | 3001 |
| `@agent-in-sync/frontend`   | React 19 + TanStack Router backoffice         | 5173 |
| `@agent-in-sync/db-client`  | Drizzle ORM schema + pg client                | —    |
| `@agent-in-sync/shared`     | Zod schemas shared between backend + frontend | —    |
| `@agent-in-sync/cli`        | CLI for MCP setup and skills/rules install    | —    |

**Dependency graph:** `mcp-server → backend → db-client, shared` · `frontend → shared`

---

## Code Conventions

- **Imports:** ESM everywhere, `.js` extensions in TS imports
- **TypeScript:** strict mode, `noUncheckedIndexedAccess`, `noImplicitReturns`, `noUnusedLocals`
- **Style:** single quotes, trailing commas (es5), 100-char width, no parens on single arrow params
- **Tests:** Vitest, co-located next to source (`example.test.ts`), Given/When/Then pattern
- **Pattern:** early returns over nested conditions, self-documenting code over comments
- **Helpers:** at the bottom of files, not the top
- **Types:** derive from `z.infer<typeof schema>`, don't write parallel interfaces

See [CLAUDE.md](./CLAUDE.md) for the full convention reference used by AI agents.

---

## Before Making Significant Changes

Check `design-log/` for an existing design. If none exists, create one first:

```
Background → Problem → Q&A → Design → Implementation Plan → Examples → Trade-offs
```

After implementing, append an "Implementation Results" section and document any deviations.

---

## Design Log

Architecture decisions and feature designs. Read before touching anything significant.

| #   | Topic                                                                                      | Status      |
| --- | ------------------------------------------------------------------------------------------ | ----------- |
| 001 | [Tech Stack](./design-log/001-tech-stack.md)                                               | Implemented |
| 002 | [Monorepo Architecture](./design-log/002-monorepo-architecture.md)                         | Implemented |
| 003 | [Database Schema](./design-log/003-database-schema.md)                                     | Implemented |
| 004 | [Vector Search](./design-log/004-vector-search.md)                                         | Implemented |
| 005 | [Authentication](./design-log/005-authentication.md)                                       | Implemented |
| 006 | [API Design](./design-log/006-api-design.md)                                               | Implemented |
| 007 | [Observability](./design-log/007-observability.md)                                         | Implemented |
| 008 | [Multi-Tenancy & Content Sharing](./design-log/008-multi-tenancy.md)                       | Implemented |
| 009 | [Architecture Improvements](./design-log/009-architecture-improvements.md)                 | Implemented |
| 010 | [MCP Server Separation](./design-log/010-mcp-server-separation.md)                         | Implemented |
| 011 | [Domain Organizations & SSO](./design-log/011-domain-organization-sso.md)                  | Draft       |
| 012 | [CI/CD Pipeline (Hetzner LB + Storage Box)](./design-log/012-cicd-pipeline.md)             | Implemented |
| 013 | [Security Audit Remediation](./design-log/013-security-audit-remediation.md)               | Implemented |
| 014 | [Content Quality & Trust System](./design-log/014-content-quality-trust-system.md)         | Draft       |
| 015 | [Public Content Seed](./design-log/015-public-content-seed.md)                             | Implemented |
| 016 | [Agent Social Features](./design-log/016-agent-social-features.md)                         | Implemented |
| 017 | [Free Period Promotion](./design-log/017-free-period-promotion.md)                         | Draft       |
| 018 | [Agent Instruction Files](./design-log/018-agent-instruction-files.md)                     | Implemented |
| 019 | [GDPR Compliance](./design-log/019-gdpr-compliance.md)                                     | Draft       |
| 020 | [Reduce Page Load Calls](./design-log/020-reduce-page-load-calls.md)                       | Implemented |
| 021 | [Agent API Key Association](./design-log/021-agent-api-key-association.md)                 | Implemented |
| 022 | [Share as Move](./design-log/022-share-as-move.md)                                         | Implemented |
| 023 | [Multi-Agent Seed Activity](./design-log/023-multi-agent-seed-activity.md)                 | Implemented |
| 024 | [Agent Skills Migration](./design-log/024-agent-skills-migration.md)                       | Implemented |
| 025 | [Search Scoring Overhaul](./design-log/025-search-scoring-overhaul.md)                     | Implemented |
| 026 | [TanStack Start SSR](./design-log/026-tanstack-start-ssr.md)                               | Draft       |
| 027 | [MCP Markdown Results](./design-log/027-mcp-markdown-results.md)                           | Implemented |
| 028 | [MCP Tool Directives](./design-log/028-mcp-tool-directives.md)                             | Implemented |
| 029 | [CLI Install Skills & Rules](./design-log/029-cli-install-skills-rules.md)                 | Implemented |
| 030 | [Unified CLI Setup](./design-log/030-unified-cli-setup.md)                                 | Implemented |
| 031 | [Connect Page DX Redesign](./design-log/031-connect-page-dx-redesign.md)                   | Implemented |
| 032 | [Malicious Code Prevention](./design-log/032-malicious-code-prevention.md)                 | Implemented |
| 033 | [Token Savings Benchmark](./design-log/033-token-savings-benchmark.md)                     | Implemented |
| 034 | [Weaviate Hybrid Search](./design-log/034-weaviate-hybrid-search.md)                       | Implemented |
| 035 | [MCP Search Result Cap](./design-log/035-mcp-search-result-cap.md)                         | Implemented |
| 036 | [Benchmark Microservices Expansion](./design-log/036-benchmark-microservices-expansion.md) | Implemented |
| 037 | [Benchmark Automation](./design-log/037-benchmark-automation.md)                           | Implemented |
| 038 | [Knowledge Articles](./design-log/038-knowledge-articles.md)                               | Draft       |
| 039 | [MCP Two-Step Search](./design-log/039-mcp-two-step-search.md)                             | Draft       |
| 040 | [Search Scope & Relevance Params](./design-log/040-search-scope-and-relevance-params.md)   | Implemented |
| 041 | [Super Admin Console](./design-log/041-super-admin-console.md)                             | Implemented |
| 042 | [Skill Guide Compliance](./design-log/042-skill-guide-compliance.md)                       | Implemented |
| 043 | [Trivial Fix Exemption](./design-log/043-trivial-fix-exemption.md)                         | Implemented |
| 043 | [Unified Weaviate Search](./design-log/043-unified-weaviate-search.md)                     | Implemented |
| 044 | [Autocut Hybrid Search](./design-log/044-autocut-hybrid-search.md)                         | Implemented |
| 044 | [Slim Rule to Skill Pointer](./design-log/044-slim-rule-to-skill-pointer.md)               | Implemented |
| 045 | [Domain Auto-Org Onboarding](./design-log/045-domain-auto-org-onboarding.md)               | Implemented |
| 045 | [Eliminate PG Browse Path](./design-log/045-eliminate-pg-browse-path.md)                   | Implemented |
| 046 | [Search Quality Overhaul](./design-log/046-search-quality-overhaul.md)                     | Implemented |
| 047 | [Issue Summary Named Vectors](./design-log/047-issue-summary-named-vectors.md)             | Draft       |
| 048 | [Org Admin Settings](./design-log/048-org-admin-settings.md)                               | Draft       |
| 049 | [Local Dev Seed](./design-log/049-local-dev-seed.md)                                       | Implemented |
````

- [ ] **Step 2: Verify design log statuses**

Before committing, open a sample of design log files and confirm the statuses in the table are accurate. Key ones to check:

- `016-agent-social-features.md` — open and check if it has an "Implementation Results" section
- `026-tanstack-start-ssr.md` — check if it's still a draft or was implemented
- `047-issue-summary-named-vectors.md` — check status

Update the table in CONTRIBUTING.md if any status is wrong.

- [ ] **Step 3: Commit**

```bash
git add CONTRIBUTING.md
git commit -m "docs: create CONTRIBUTING.md with full design log table and contributor guide"
```

---

## Task 5: Verify and final commit

- [ ] **Step 1: Check all links in README.md**

Verify these relative paths exist:

```
./LICENSE                    ← check file exists
./README.dev.md              ← exists
./DEPLOYMENT.md              ← exists
./CONTRIBUTING.md            ← just created
./benchmark/README.md        ← exists
./benchmark-oss/README.md    ← exists
./scripts/seed/README.md     ← exists
./design-log/                ← exists
```

```bash
ls ./LICENSE 2>/dev/null || echo "LICENSE MISSING"
```

If LICENSE is missing, change the badge URL in README.md to point to `https://opensource.org/licenses/MIT` instead of `./LICENSE`.

- [ ] **Step 2: Search for stale terms in README.md**

```bash
grep -n "keyword\|>= 20\|\bstart\b\|014\b" README.md
```

Expected: no matches for stale content. The word "start" may appear in other contexts — confirm it's not in the CLI command section.

- [ ] **Step 3: Final review**

Read through README.md top to bottom and confirm:

- ASCII art is in a fenced code block
- Quick Start has exactly 6 numbered steps
- Documentation table links all exist
- No mention of `mobile` package as "Coming soon"
- Node.js shows `22+` not `20`
