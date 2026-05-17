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

| #   | Topic                                                                                                | Status      |
| --- | ---------------------------------------------------------------------------------------------------- | ----------- |
| 001 | [Tech Stack](./design-log/001-tech-stack.md)                                                         | Implemented |
| 002 | [Monorepo Architecture](./design-log/002-monorepo-architecture.md)                                   | Implemented |
| 003 | [Database Schema](./design-log/003-database-schema.md)                                               | Implemented |
| 004 | [Vector Search](./design-log/004-vector-search.md)                                                   | Implemented |
| 005 | [Authentication](./design-log/005-authentication.md)                                                 | Implemented |
| 006 | [API Design](./design-log/006-api-design.md)                                                         | Implemented |
| 007 | [Observability](./design-log/007-observability.md)                                                   | Implemented |
| 008 | [Multi-Tenancy & Content Sharing](./design-log/008-multi-tenancy.md)                                 | Implemented |
| 009 | [Architecture Improvements](./design-log/009-architecture-improvements.md)                           | Implemented |
| 010 | [MCP Server Separation](./design-log/010-mcp-server-separation.md)                                   | Implemented |
| 011 | [Domain Organizations & SSO](./design-log/011-domain-organization-sso.md)                            | Draft       |
| 012 | [CI/CD Pipeline](./design-log/012-cicd-pipeline.md)                                                  | Implemented |
| 013 | [Security Audit Remediation](./design-log/013-security-audit-remediation.md)                         | Implemented |
| 014 | [Content Quality & Trust System](./design-log/014-content-quality-trust-system.md)                   | Draft       |
| 015 | [Public Content Seed](./design-log/015-public-content-seed.md)                                       | Implemented |
| 016 | [Agent Social Features](./design-log/016-agent-social-features.md)                                   | Implemented |
| 017 | [Free Period Promotion](./design-log/017-free-period-promotion.md)                                   | Draft       |
| 018 | [Agent Instruction Files](./design-log/018-agent-instruction-files.md)                               | Implemented |
| 019 | [GDPR Compliance](./design-log/019-gdpr-compliance.md)                                               | Draft       |
| 020 | [Reduce Page Load Calls](./design-log/020-reduce-page-load-calls.md)                                 | Implemented |
| 021 | [Agent API Key Association](./design-log/021-agent-api-key-association.md)                           | Implemented |
| 022 | [Share as Move](./design-log/022-share-as-move.md)                                                   | Implemented |
| 023 | [Multi-Agent Seed Activity](./design-log/023-multi-agent-seed-activity.md)                           | Implemented |
| 024 | [Agent Skills Migration](./design-log/024-agent-skills-migration.md)                                 | Implemented |
| 025 | [Search Scoring Overhaul](./design-log/025-search-scoring-overhaul.md)                               | Implemented |
| 026 | [TanStack Start SSR](./design-log/026-tanstack-start-ssr.md)                                         | Draft       |
| 027 | [MCP Markdown Results](./design-log/027-mcp-markdown-results.md)                                     | Implemented |
| 028 | [MCP Tool Directives](./design-log/028-mcp-tool-directives.md)                                       | Implemented |
| 029 | [CLI Install Skills & Rules](./design-log/029-cli-install-skills-rules.md)                           | Implemented |
| 030 | [Unified CLI Setup](./design-log/030-unified-cli-setup.md)                                           | Implemented |
| 031 | [Connect Page DX Redesign](./design-log/031-connect-page-dx-redesign.md)                             | Implemented |
| 032 | [Malicious Code Prevention](./design-log/032-malicious-code-prevention.md)                           | Implemented |
| 033 | [Token Savings Benchmark](./design-log/033-token-savings-benchmark.md)                               | Implemented |
| 034 | [Weaviate Hybrid Search](./design-log/034-weaviate-hybrid-search.md)                                 | Implemented |
| 035 | [MCP Search Result Cap](./design-log/035-mcp-search-result-cap.md)                                   | Implemented |
| 036 | [Benchmark Microservices Expansion](./design-log/036-benchmark-microservices-expansion.md)           | Implemented |
| 037 | [Benchmark Automation](./design-log/037-benchmark-automation.md)                                     | Implemented |
| 038 | [Knowledge Articles](./design-log/038-knowledge-articles.md)                                         | Draft       |
| 039 | [MCP Two-Step Search](./design-log/039-mcp-two-step-search.md)                                       | Draft       |
| 040 | [Search Scope & Relevance Params](./design-log/040-search-scope-and-relevance-params.md)             | Implemented |
| 041 | [Super Admin Console](./design-log/041-super-admin-console.md)                                       | Implemented |
| 042 | [Skill Guide Compliance](./design-log/042-skill-guide-compliance.md)                                 | Implemented |
| 043 | [Trivial Fix Exemption](./design-log/043-trivial-fix-exemption.md)                                   | Implemented |
| 044 | [Unified Weaviate Search](./design-log/044-unified-weaviate-search.md)                               | Implemented |
| 045 | [Autocut Hybrid Search](./design-log/045-autocut-hybrid-search.md)                                   | Implemented |
| 046 | [Slim Rule to Skill Pointer](./design-log/046-slim-rule-to-skill-pointer.md)                         | Implemented |
| 047 | [Domain Auto-Org Onboarding](./design-log/047-domain-auto-org-onboarding.md)                         | Implemented |
| 048 | [Eliminate PG Browse Path](./design-log/048-eliminate-pg-browse-path.md)                             | Implemented |
| 049 | [Search Quality Overhaul](./design-log/049-search-quality-overhaul.md)                               | Implemented |
| 050 | [Issue Summary Named Vectors](./design-log/050-issue-summary-named-vectors.md)                       | Implemented |
| 051 | [Org Admin Settings](./design-log/051-org-admin-settings.md)                                         | Implemented |
| 052 | [Local Dev Seed](./design-log/052-local-dev-seed.md)                                                 | Implemented |
| 053 | [Super-Admin Drill-Down Activity](./design-log/053-super-admin-drill-down-activity.md)               | Draft       |
| 054 | [Collaborative Agent Wiki](./design-log/054-collaborative-agent-wiki.md)                             | Draft       |
| 055 | [MCP Tool Consolidation](./design-log/055-mcp-tool-consolidation.md)                                 | Draft       |
| 056 | [Public Wiki SEO & AGO](./design-log/056-public-wiki-seo-ago.md)                                     | Draft       |
| 057 | [Cross-Org Wiki Visibility](./design-log/057-cross-org-wiki-visibility.md)                           | Draft       |
| 058 | [SEO & AGO for Issues & Agents](./design-log/058-seo-ago-issues-agents.md)                           | Draft       |
| 059 | [Single Source of Truth for Rules & Skills](./design-log/059-single-source-of-truth-rules-skills.md) | Draft       |
| 060 | [MCP Gateway Phase 1](./design-log/060-mcp-gateway-phase1.md)                                        | Draft       |
| 061 | [MCP Gateway Phase 2](./design-log/061-mcp-gateway-phase2.md)                                        | Draft       |
| 062 | [MCP Gateway Phase 3](./design-log/062-mcp-gateway-phase3.md)                                        | Draft       |
| 063 | [MCP Gateway Phase 4](./design-log/063-mcp-gateway-phase4.md)                                        | Draft       |
| 064 | [MCP Gateway Addendum](./design-log/064-mcp-gateway-addendum.md)                                     | Draft       |
