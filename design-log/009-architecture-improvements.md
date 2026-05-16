# Design Log #009: Architecture Improvements

## Background

After an architectural review of the codebase, several improvements were identified to enhance reliability, performance, security, and maintainability. This design log documents the changes made in response to that review.

## Problem

Multiple architectural concerns were identified:

1. **Data Consistency**: No transaction support for multi-step database operations
2. **Performance**: N+1 queries in tag handling, synchronous API key updates
3. **Error Handling**: Inconsistent error responses, no centralized error handling
4. **Security**: No rate limiting, no request size limits
5. **Maintainability**: Large monolithic files, no shared types package
6. **Observability**: Basic health check, no dependency status tracking
7. **Build Tooling**: Native binding issues with tsdown bundler

## Design

### 1. Transaction Support

Added `withTransaction` helper to db-client for atomic operations:

```typescript
export type Transaction = Parameters<Database['transaction']>[0] extends (tx: infer T) => unknown
  ? T
  : never;

export async function withTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
  const db = getDb();
  return db.transaction(fn);
}
```

### 2. Bulk Database Operations

Refactored `ensureTagsExist` from per-tag queries to bulk operations using `inArray`:

```typescript
// Before: O(n) queries for n tags
for (const tag of tags) {
  await db.select().from(tags).where(eq(tags.name, tag));
}

// After: O(1) queries regardless of tag count
const existing = await db.select().from(tags).where(inArray(tags.name, normalized));
await db.insert(tags).values(newNames.map(n => ({ name: n, usageCount: 1 })));
await db
  .update(tags)
  .set({ usageCount: sql`${tags.usageCount} + 1` })
  .where(inArray(tags.id, existingIds));
```

### 3. Error Handling Infrastructure

Created custom error classes with HTTP status codes:

```typescript
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode = 500
  ) {
    super(message);
  }
}

export class NotFoundError extends AppError {
  /* 404 */
}
export class ValidationError extends AppError {
  /* 400 */
}
export class UnauthorizedError extends AppError {
  /* 401 */
}
export class ForbiddenError extends AppError {
  /* 403 */
}
```

Global error handler middleware centralizes error response formatting and logging.

### 4. Rate Limiting

Three tiers of rate limits applied to routes:

| Limiter         | Window | Max Requests | Applied To         |
| --------------- | ------ | ------------ | ------------------ |
| `apiLimiter`    | 60s    | 100          | General API routes |
| `searchLimiter` | 60s    | 30           | Search endpoints   |
| `authLimiter`   | 15min  | 5            | Login/signup       |

### 5. API Versioning

Routes prefixed with `/api/v1/` for future compatibility:

```
/api/v1/search    ← New versioned routes
/api/v1/submit
/api/v1/vote

/api/search       ← Backward compatible aliases
/api/submit
/api/vote
```

### 6. Request Timeouts & Size Limits

```typescript
app.use(express.json({ limit: '1mb' }));
app.use('/api', timeout('30s'));
```

### 7. Enhanced Health Check

Health endpoint now checks dependency status:

```typescript
{
  "status": "ok" | "degraded" | "unhealthy",
  "checks": {
    "db": { "status": "ok", "latencyMs": 5 },
    "weaviate": { "status": "ok" }
  },
  "timestamp": "2026-01-28T..."
}
```

### 8. Shared Types Package

Created `@agent-in-sync/shared` package with Zod schemas:

```
packages/shared/
├── src/
│   ├── schemas/
│   │   ├── api-key.ts
│   │   ├── issue.ts
│   │   ├── solution.ts
│   │   └── search.ts
│   └── index.ts
└── package.json
```

### 9. Frontend API Modularization

Split monolithic api.ts into domain modules:

```
packages/frontend/src/lib/api/
├── client.ts      # fetchApi wrapper
├── keys.ts        # API key hooks
├── issues.ts      # Issue/search hooks
├── solutions.ts   # Solution/vote/comment hooks
├── dashboard.ts   # Dashboard stats
└── index.ts       # Re-exports
```

### 10. Super Admin Database Column

Moved super admin check from env var to database:

```typescript
// Schema addition
isSuperAdmin: boolean('is_super_admin').notNull().default(false);

// Check order: DB first, env var fallback for bootstrapping
export async function checkSuperAdmin(email: string): Promise<boolean> {
  const dbCheck = await isSuperAdminByDb(email);
  if (dbCheck) return true;
  return isSuperAdminByEnv(email);
}
```

### 11. Weaviate Sync Tracking

Added `weaviateIndexedAt` timestamp to solutions table for sync reconciliation:

```typescript
weaviateIndexedAt: timestamp('weaviate_indexed_at');
```

Updated on successful Weaviate indexing.

### 12. Build Tooling Migration

Migrated from tsdown (with native binding issues) to plain tsc:

```json
// Before
"build": "tsdown"

// After
"build": "tsc"
```

Updated tsconfig.json files with `module: "NodeNext"` and `moduleResolution: "NodeNext"`.

## Trade-offs

| Pros                                 | Cons                             |
| ------------------------------------ | -------------------------------- |
| Transactions ensure data consistency | Slightly longer request times    |
| Bulk queries reduce DB round trips   | More complex query logic         |
| Rate limiting prevents abuse         | May block legitimate heavy usage |
| API versioning enables evolution     | URL complexity increases         |
| Shared types ensure consistency      | Another package to maintain      |
| tsc is simpler and more portable     | Slower builds than bundlers      |

## Implementation Notes

Key files changed:

- `packages/db-client/src/client.ts` - Transaction helper, type exports
- `packages/backend/src/services/submit.service.ts` - Bulk operations
- `packages/backend/src/errors/index.ts` - Error classes (new)
- `packages/backend/src/middleware/error-handler.ts` - Global error handler (new)
- `packages/backend/src/middleware/rate-limit.ts` - Rate limiters (new)
- `packages/backend/src/middleware/timeout.ts` - Request timeout (new)
- `packages/backend/src/health/index.ts` - Health check helpers (new)
- `packages/backend/src/server.ts` - Route registration, middleware setup
- `packages/shared/` - New shared types package
- `packages/frontend/src/lib/api/` - Modularized API client

Testing:

- Updated mock patterns for bulk operations
- Added `Transaction` type export for service testing
- All 98 backend tests pass

---

_Created: 2026-01-28_
_Status: Implemented_
