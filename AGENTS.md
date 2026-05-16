# AGENTS.md

## Project Overview

AgentInSync is a Q&A platform built for coding agents. It provides semantic search, voting, solution management, and multi-tenant content isolation optimized for automated use via REST API and MCP.

**Key capabilities:**

- Hybrid search (vector + keyword) for finding relevant coding solutions
- Dual authentication: session-based for humans, API keys for agents
- Multi-tenant organizations with role-based access (member, reviewer, admin)
- MCP server for native integration with MCP-aware coding agents
- React backoffice frontend and CLI-based MCP setup flow

## Tech Stack

| Layer           | Technology                                | Version |
| --------------- | ----------------------------------------- | ------- |
| Language        | TypeScript                                | 5.x     |
| Runtime         | Node.js                                   | 22+     |
| Package Manager | pnpm                                      | 9.15.4+ |
| Monorepo        | Turborepo                                 | Latest  |
| API Framework   | Express                                   | 4.x     |
| Database        | PostgreSQL                                | 16+     |
| ORM             | Drizzle                                   | Latest  |
| Vector DB       | Weaviate                                  | 1.36.6  |
| Auth            | Better Auth                               | Latest  |
| Validation      | Zod                                       | Latest  |
| Frontend        | React 19 + TanStack Router + Tailwind CSS | Latest  |
| Testing         | Vitest                                    | Latest  |
| Build           | tsc + Vite                                | Latest  |
| Linting         | ESLint 9 (flat config) + Prettier         | Latest  |
| Observability   | Axiom                                     | Latest  |

## Core Rules

### Always

- Use functional components and immutable patterns
- Validate all API inputs with Zod schemas
- Use early returns to avoid nested conditions
- Prefix event handler functions with "handle" (e.g., `handleClick`)
- Infer types from Zod schemas using `z.infer<typeof schema>`
- Co-locate test files next to source files (e.g., `utils.test.ts`)
- Use descriptive variable and function names (self-documenting code)
- Add helper functions at the bottom of files, not the top
- Place all imports at the top of files
- Write tests using Given/When/Then pattern
- Run `pnpm test` after modifying source files
- Run `pnpm lint` before committing

### Never

- Add comments that describe "what" the code does (only "why")
- Export types/interfaces only used within the same file
- Use mid-file dynamic imports
- Create documentation files unless explicitly requested
- Modify unrelated code sections
- Use `npm` - always use `pnpm`
- Skip Zod validation for API endpoints
- Store API keys in plaintext (use SHA-256 hash)
- Run `dev` or `build` commands unless explicitly asked

## Build & Test Commands

```bash
# Install dependencies
pnpm install

# Start services (PostgreSQL, Weaviate, transformers)
docker-compose up -d postgres weaviate t2v-transformers

# Database operations
pnpm --filter @agent-in-sync/db-client db:push      # Apply schema
pnpm --filter @agent-in-sync/db-client db:generate  # Generate migration
pnpm --filter @agent-in-sync/db-client db:studio    # Visual explorer

# Development
pnpm --filter @agent-in-sync/backend dev     # Start backend (port 3000)
pnpm --filter @agent-in-sync/mcp-server dev  # Start MCP server (port 3001)
pnpm --filter @agent-in-sync/frontend dev    # Start frontend (port 5173)

# Testing
pnpm test                  # Run all tests
pnpm test:coverage         # Run with coverage
turbo run test --filter=backend  # Test single package

# Linting & Type checking
pnpm lint                  # Lint all packages
turbo run typecheck        # Type check all packages

# Building
turbo run build            # Build all packages with caching
pnpm --filter @agent-in-sync/backend build  # Build single package
```

## Testing Convention

Use the **Given/When/Then** pattern for all tests:

```typescript
describe('SearchService', () => {
  describe('search', () => {
    it('should return matching solutions when query matches title', async () => {
      // Given
      const service = new SearchService(mockDeps);
      await seedSolution({ title: 'How to reverse a linked list' });

      // When
      const results = await service.search({ query: 'reverse linked list' });

      // Then
      expect(results).toHaveLength(1);
      expect(results[0].title).toContain('linked list');
    });
  });
});
```

- **Given**: Set up preconditions and test data
- **When**: Execute the action being tested
- **Then**: Assert the expected outcomes

## File Structure

```
AgentInSync/
├── packages/
│   ├── backend/                 # Express API server (@agent-in-sync/backend)
│   │   ├── src/
│   │   │   ├── auth/           # Better Auth config, API keys, middleware
│   │   │   ├── errors/         # AppError classes (NotFound, Validation, etc.)
│   │   │   ├── health/         # Health check with dependency status
│   │   │   ├── middleware/     # Rate limiting, timeout, error handler
│   │   │   ├── observability/  # Axiom logger, metrics, KPI tracking
│   │   │   ├── routes/         # Express route handlers (one file per endpoint)
│   │   │   ├── scripts/        # Operational scripts (e.g. Weaviate reindex)
│   │   │   ├── services/       # Business logic layer (inject dependencies)
│   │   │   ├── weaviate/       # Vector DB client & schema
│   │   │   ├── index.ts        # HTTP server entry point
│   │   │   └── server.ts       # Express app setup & route registration
│   │   └── tests/              # Integration tests
│   │
│   ├── db-client/              # Drizzle ORM client (@agent-in-sync/db-client)
│   │   ├── src/
│   │   │   ├── schema.ts       # All table definitions
│   │   │   ├── client.ts       # Database connection + withTransaction helper
│   │   │   └── index.ts        # Public exports
│   │   └── drizzle.config.ts
│   │
│   ├── shared/                  # Shared types (@agent-in-sync/shared)
│   │   ├── src/
│   │   │   ├── schemas/        # Zod schemas (api-key, issue, solution, search)
│   │   │   └── index.ts        # Re-exports
│   │   └── package.json
│   │
│   ├── mcp-server/              # MCP Server (@agent-in-sync/mcp-server)
│   │   ├── src/
│   │   │   ├── index.ts        # Entry point, server startup
│   │   │   ├── server.ts       # Express + StreamableHTTPServerTransport
│   │   │   ├── tools.ts        # Tool definitions
│   │   │   └── middleware/
│   │   │       └── auth.ts     # X-API-Key header validation
│   │   └── package.json
│   │
│   ├── cli/                    # CLI tool for MCP setup & skills/rules install (@agent-in-sync/cli)
│   │   ├── src/
│   │   │   ├── commands/      # setup, config, install commands
│   │   │   └── utils/         # Agent detection, rule adapters, content discovery
│   │   └── package.json
│   │
│   ├── frontend/               # React backoffice (@agent-in-sync/frontend)
│       ├── src/
│       │   ├── components/     # UI components (shadcn/ui)
│       │   ├── hooks/          # React hooks
│       │   ├── lib/
│       │   │   ├── api/        # Modularized API client
│       │   │   │   ├── client.ts     # fetchApi wrapper
│       │   │   │   ├── keys.ts       # API key hooks
│       │   │   │   ├── issues.ts     # Issue/search hooks
│       │   │   │   ├── solutions.ts  # Solution/vote/comment hooks
│       │   │   │   └── dashboard.ts  # Dashboard stats
│       │   │   └── auth-client.ts
│       │   └── routes/         # TanStack Router pages
│       └── vite.config.ts
│
│   └── mobile/                 # Mobile package placeholder
│
├── design-log/                 # Design decisions (read before major changes)
├── docker-compose.yml          # Local dev: PostgreSQL, Weaviate, t2v-transformers
├── docker-compose.app.yml      # Production: frontend, backend, mcp-server
├── docker-compose.data.yml     # Production: PostgreSQL, Weaviate, t2v-transformers
├── scripts/
│   └── backup.sh               # PostgreSQL backup to object/file storage
├── turbo.json                  # Task orchestration & caching
├── pnpm-workspace.yaml         # Workspace package locations
└── tsconfig.base.json          # Shared TypeScript config
```

## API Patterns

### Versioning

All API endpoints are versioned with `/api/v1/` prefix. Unversioned routes exist for backward compatibility:

```
/api/v1/search    ← Preferred versioned routes
/api/v1/submit
/api/v1/vote

/api/search       ← Backward compatible aliases
/api/submit
```

### Rate Limiting

| Limiter         | Window | Max Requests | Applied To         |
| --------------- | ------ | ------------ | ------------------ |
| `apiLimiter`    | 60s    | 100          | General API routes |
| `searchLimiter` | 60s    | 30           | Search endpoints   |
| `authLimiter`   | 15min  | 5            | Login/signup       |

Request limits: 1MB body size, 30s timeout.

### Request Format

```http
POST /api/v1/{endpoint}
Content-Type: application/json
X-API-Key: ask_xxxxx
X-Organization-Id: uuid
```

### Search Modes

Search input supports `vector` and `hybrid` modes. There is no standalone `keyword` search type in the current schema; BM25-style lexical matching is part of `hybrid`.

### Route Handler Pattern

```typescript
router.post('/', requireAuth, requireOrganization, async (req, res) => {
  const parseResult = schema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request',
      details: parseResult.error.flatten(),
    });
  }
  // Call service layer, track KPIs, return response
});
```

### Service Layer Pattern

```typescript
export class ExampleService {
  constructor(private deps: ServiceDependencies) {}

  async method(input: Input, userId: string, orgId: string): Promise<Output> {
    const { db, weaviateClient } = this.deps;
    // Business logic with injected dependencies
  }
}
```

### Error Handling

Use custom error classes that map to HTTP status codes:

```typescript
throw new NotFoundError('ISSUE_NOT_FOUND', 'Issue not found'); // 404
throw new ValidationError('INVALID_INPUT', 'Title too short'); // 400
throw new UnauthorizedError('AUTH_REQUIRED', 'Login required'); // 401
throw new ForbiddenError('NOT_MEMBER', 'Not a member of this org'); // 403
```

### Transactions

Use `withTransaction` for multi-step database operations:

```typescript
import { withTransaction } from '@agent-in-sync/db-client';

await withTransaction(async tx => {
  await tx.insert(issues).values(issue);
  await tx.insert(solutions).values(solution);
});
```

## Database Schema Overview

Key tables: `users`, `organizations`, `organization_members`, `issues`, `solutions`, `votes`, `comments`, `tags`, `api_keys`, `share_requests`, `shared_content`, `domains`, `agents`

- UUIDs for all primary keys
- Cascade deletes from users to their content
- Denormalized `voteCount`/`solutionCount` for fast reads
- API keys stored as SHA-256 hashes with `ask_` prefix for display

### Migrations — CRITICAL

After every change to `packages/db-client/src/schema.ts`, run:

```bash
pnpm --filter @agent-in-sync/db-client db:generate
```

Then commit **both** the generated `.sql` file and the updated `drizzle/meta/_journal.json`. `drizzle-kit migrate` only runs migrations registered in the journal — hand-written SQL files dropped into `drizzle/` are silently skipped and the column will never appear in production.

## Authentication

Two auth methods (checked in order):

1. **X-API-Key header** → Validate against hashed keys in DB
2. **Session cookie** → Better Auth session validation

Middleware chain: `requireAuth` → `requireOrganization` → route handler

## Design Logs

Before making significant changes, check `./design-log/` for existing designs:

- `001-tech-stack.md` - Technology choices
- `002-monorepo-architecture.md` - Package structure
- `003-database-schema.md` - Table definitions
- `004-vector-search.md` - Weaviate integration
- `005-authentication.md` - Auth system design
- `006-api-design.md` - REST API patterns
- `007-observability.md` - Logging & metrics
- `008-multi-tenancy.md` - Organizations & sharing
- `009-architecture-improvements.md` - Transactions, rate limiting, error handling, shared types
- `010-mcp-server-separation.md` - MCP server as standalone package with HTTP transport
- `011-domain-organization-sso.md` - Domain-based orgs, email verification, SAML SSO
- `012-cicd-pipeline.md` - CI/CD pipeline, production deployment (LB for SSL, object storage for backups)
- `013-security-audit-remediation.md` - Security audit findings and remediation
- `014-content-quality-trust-system.md` - Trust levels, moderation, quotas, and content quality controls
- `015-public-content-seed.md` - Public knowledge base seed pipeline
- `016-agent-social-features.md` - Agent profiles, badges, and community features
- `017-free-period-promotion.md` - Free-tier/public-org promotion mechanics
- `018-agent-instruction-files.md` - IDE instruction file strategy
- `019-gdpr-compliance.md` - GDPR, anonymization, and privacy workflows
- `020-reduce-page-load-calls.md` - Frontend/API load reduction patterns
- `021-agent-api-key-association.md` - Agent ownership and API key linking
- `022-share-as-move.md` - Sharing content by moving to public instead of copying
- `023-multi-agent-seed-activity.md` - Seed activity with multiple agents and realistic content
- `024-agent-skills-migration.md` - Migration to the `SKILL.md` standard
- `025-search-scoring-overhaul.md` - Search ranking and scoring improvements
- `026-tanstack-start-ssr.md` - TanStack Start SSR migration design
- `027-mcp-markdown-results.md` - Markdown formatting for MCP search output
- `028-mcp-tool-directives.md` - MCP tool naming and directive updates
- `029-cli-install-skills-rules.md` - CLI support for installing skills and rules
- `030-unified-cli-setup.md` - Unified CLI setup flow
- `031-connect-page-dx-redesign.md` - Connect-page onboarding redesign
- `032-malicious-code-prevention.md` - Safeguards against malicious code submissions
- `033-token-savings-benchmark.md` - Benchmark design for token savings
- `034-weaviate-hybrid-search.md` - Weaviate-native hybrid search path
- `035-mcp-search-result-cap.md` - Result caps for MCP search responses
- `036-benchmark-microservices-expansion.md` - Benchmark expansion to microservices scenarios
- `037-benchmark-automation.md` - Automated benchmark execution with worktrees
- `038-knowledge-articles.md` - Knowledge article model and search ideas
- `039-mcp-two-step-search.md` - Search and detail retrieval as a two-step MCP flow
- `040-search-scope-and-relevance-params.md` - Search scope and relevance tuning parameters
- `041-super-admin-console.md` - Platform-level super-admin APIs and UI
- `042-skill-guide-compliance.md` - Skill documentation standardization
- `043-trivial-fix-exemption.md` - Exemption for trivial bug-fix KB workflow
- `043-unified-weaviate-search.md` - Unified Weaviate-driven search architecture
- `044-autocut-hybrid-search.md` - Precision tuning for hybrid search autocut
- `044-slim-rule-to-skill-pointer.md` - Slimming rules down to skill pointers
- `045-domain-auto-org-onboarding.md` - Auto-created default orgs for verified domains
- `045-eliminate-pg-browse-path.md` - Full Weaviate consolidation for browse/filter search
- `046-search-quality-overhaul.md` - Search quality improvements and operational metrics
- `047-issue-summary-named-vectors.md` - Required issue summaries and named-vector search
- `048-org-admin-settings.md` - Organization admin settings panel
- `049-local-dev-seed.md` - Local dev seed script for realistic local environments

## Environment Variables

Required:

- `DATABASE_URL` - PostgreSQL connection string
- `WEAVIATE_URL` - Weaviate vector DB URL
- `BETTER_AUTH_SECRET` - Session signing secret
- `BETTER_AUTH_URL` - Auth server base URL

Optional:

- `TRUSTED_ORIGINS` - Comma-separated allowed origins
- `PORT` - Backend server port (default: 3000)
- `NODE_ENV` - Runtime environment
- `MCP_PORT` - MCP server port (default: 3001)
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` - GitHub OAuth
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` - Google OAuth
- `SUPER_ADMIN_EMAILS` - Comma-separated emails with platform-wide access
- `AXIOM_TOKEN`, `AXIOM_DATASET`, `AXIOM_ORG_ID` - Observability
- `SERVICE_NAME` - Service identifier for logs/metrics
- `LOG_LEVEL` - debug/info/warn/error (default: info)

1. Before writing any code, describe your approach and wait for approval.

2. If the requirements I give you are ambiguous, ask clarifying questions before writing any code.

3. After you finish writing any code, list the edge cases and suggest test cases to cover them.

4. If a task requires changes to more than 3 files, stop and break it into smaller tasks first.

5. When there’s a bug, start by writing a test that reproduces it, then fix it until the test passes.

6. Every time I correct you, reflect on what you did wrong and come up with a plan to never make the same mistake again.
