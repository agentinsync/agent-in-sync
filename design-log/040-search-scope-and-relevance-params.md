# Design Log #040: Search Scope & Relevance Parameters

## Background

`search_before_fixing` already supports `query` and `limit`. However, every search always queries both the caller's private org and the shared public org, and the Weaviate relevance threshold was hardcoded (`0.25` for vector, no threshold for hybrid). Agents had no way to control either of these.

Two real problems emerged in practice:

1. **Public org noise**: When an agent is debugging an org-specific issue (internal config, proprietary tooling, private env vars), results from the public knowledge base dilute the result list with irrelevant general knowledge.
2. **Relevance ceiling**: There was no way for an agent to declare "I only want highly confident matches." Lowering `limit` helps, but it doesn't filter by semantic quality — it just truncates.

## Problem

### Public org noise

The search service resolves two org IDs per call: the caller's private org and the global public org (`isPublic = true`). All Weaviate and PostgreSQL queries run against both. When an agent is looking for a solution to a problem that only exists inside its own organization's stack (e.g., "our internal deploy script fails when `K8S_CONTEXT` is missing"), returning public org results is pure noise.

### No relevance control

`RELEVANCE_THRESHOLD = 0.25` (vector search only) was a hardcoded constant. For hybrid search, every candidate passed through regardless of score. Agents had no way to narrow results to semantically strong matches, leading to occasional weak/unrelated results consuming the fixed `limit`.

## Questions and Answers

> Q: Should the flag be `excludePrivateOrg` or `excludePublicOrg`?

A: `excludePublicOrg`. The private org is always searched — it contains the agent's institutional knowledge. The public org is the optional layer. Excluding the public org narrows scope to internal-only results.

> Q: What should `excludePublicOrg` default to?

A: `false` (include public org by default). This preserves existing behavior — most searches benefit from the broader public knowledge base.

> Q: Should `minRelevance` apply to hybrid search too, not just vector?

A: Yes. Both vector and hybrid search return a Weaviate score (0–1). Hybrid uses `RelativeScore` fusion, vector uses cosine similarity distance. Both are comparable enough for threshold filtering. Default for hybrid is `0` (no threshold — same as before); default for vector falls back to the existing `RELEVANCE_THRESHOLD = 0.25`.

> Q: Should `minRelevance` filter before or after PostgreSQL post-filtering?

A: Before. It filters Weaviate candidates, which reduces the pool that goes to PG. This is the most token-efficient point.

> Q: Should we expose `minRelevance` in the HTTP API too?

A: It was added to `searchInputSchema` (shared Zod schema), so the HTTP API inherits it automatically. No route changes needed.

## Design

### New schema fields (`packages/shared/src/schemas/search.ts`)

```typescript
excludePublicOrg: z.boolean().optional().default(false),
minRelevance: z.number().min(0).max(1).optional(),
```

### Org scoping (`packages/backend/src/services/search.service.ts`)

```typescript
// search() method
const accessibleOrgIds = await this.getAccessibleOrganizationIds(organizationId);
const searchOrgIds = input.excludePublicOrg ? [organizationId] : accessibleOrgIds;

// searchOrgIds replaces accessibleOrgIds everywhere downstream:
// - weaviateFilters.organizationIds
// - weaviateSearchPath(..., searchOrgIds, ...)
// - pgBrowsePath(..., searchOrgIds, ...)
```

`getAccessibleOrganizationIds` is unchanged — it still resolves both IDs. The narrowing happens at the call site, keeping the helper general.

### Relevance threshold (`packages/backend/src/services/search.service.ts`)

```typescript
// weaviateSearchPath()
// Before:
const filteredCandidates = useHybrid
  ? candidates
  : candidates.filter(r => r.score >= RELEVANCE_THRESHOLD);

// After:
const minScore = input.minRelevance ?? (useHybrid ? 0 : RELEVANCE_THRESHOLD);
const filteredCandidates = candidates.filter(r => r.score >= minScore);
```

Backward compatible: when `minRelevance` is not set, behavior is identical to before.

### MCP tool definition (`packages/mcp-server/src/tools.ts`)

```typescript
excludePublicOrg: {
  type: 'boolean',
  description:
    'If true, restricts search to your private org only (excludes the public knowledge base). Use when the issue is org-specific: internal config, proprietary tooling, env vars, or bugs in your private codebase that would not be relevant to other organizations.',
},
minRelevance: {
  type: 'number',
  description:
    'Minimum relevance score (0–1). Filters out low-relevance results from vector/hybrid search. Try 0.6 for high-precision matches, 0.4 for moderate focus. Omit for broadest results (default behavior).',
},
```

## Implementation Plan

1. **Schema** — add `excludePublicOrg` and `minRelevance` to `searchInputSchema` in `packages/shared/src/schemas/search.ts`
2. **Service** — apply `excludePublicOrg` to compute `searchOrgIds` in `search()`; apply `minRelevance` threshold in `weaviateSearchPath()`
3. **Tool definition** — expose both params with descriptions in `search_before_fixing` in `packages/mcp-server/src/tools.ts`
4. **Agent guidance** — update all skill and rule files with a decision guide on when to use each param

## Examples

✅ Internal issue — exclude public org:

```
search_before_fixing({
  query: "K8S_CONTEXT env var missing in deploy script",
  excludePublicOrg: true,
  limit: 5,
})
// → Only private org results; no public knowledge base noise
```

✅ High-precision search — filter by relevance:

```
search_before_fixing({
  query: "SyntaxError Cannot use import statement in module",
  minRelevance: 0.6,
  limit: 3,
})
// → Only strongly matching results; loose matches dropped
```

✅ Broad discovery — lower threshold, more results:

```
search_before_fixing({
  query: "connection pool exhausted postgres",
  minRelevance: 0.3,
  limit: 7,
})
```

❌ Using excludePublicOrg for a general framework error:

```
// Wrong — this is a public TypeScript/Node error; public org may have the answer
search_before_fixing({
  query: "Cannot find module 'zod'",
  excludePublicOrg: true,  // cuts off relevant public solutions
})
```

## Trade-offs

| Pros                                                            | Cons                                                                                |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Eliminates public org noise for internal issues                 | Agents must decide when to use `excludePublicOrg` — wrong judgment misses solutions |
| Relevance threshold gives precision control                     | `minRelevance` semantics differ between vector/hybrid (different score scales)      |
| Backward compatible — defaults preserve existing behavior       | Adds two more params to an already large tool schema                                |
| Agents get a decision guide in skill/rules                      | Agents might over-use `excludePublicOrg` and miss public knowledge                  |
| Shared schema means HTTP API inherits both params automatically |                                                                                     |

## Implementation Notes

Key files:

- `packages/shared/src/schemas/search.ts` — schema source of truth; both HTTP and MCP use this
- `packages/backend/src/services/search.service.ts` — `search()` for org scoping, `weaviateSearchPath()` for relevance threshold
- `packages/mcp-server/src/tools.ts` — MCP tool definition exposure
- `skills/agent-in-sync/SKILL.md` — canonical skill (source for CLI install)
- `rules/agent-in-sync-workflow/RULE.md` — canonical rule (source for CLI install)
- `packages/shared/src/instructions.ts` — programmatic instructions used for onboarding
- `.claude/`, `.cursor/`, `.agents/` copies — installed agent-specific copies updated in sync

---

_Created: 2026-03-07_
_Status: Implemented_
