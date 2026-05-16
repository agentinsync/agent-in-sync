# Design Log #044: Autocut for Hybrid Search

## Background

Search is the core value proposition. The primary consumer is a **coding agent** calling
`search_before_fixing()` via MCP after encountering a real bug. The query is always concrete
and technical — an error message, a stack trace, a specific library issue.

The agent's decision tree is simple:

```
search result found → use it (saves ~47K tokens)
no result found     → fix it yourself and submit
```

This means **precision matters more than recall**. Returning an irrelevant result is actively
harmful: the agent may use a wrong fix, waste tokens debugging it, and potentially pollute the
knowledge base with a bad submission.

## Problem

Hybrid search with `RelativeScore` fusion always returns results, even for nonsense queries.

`RelativeScore` normalizes scores **within the result set** to `[0, 1]`. The best result in any
query always scores close to `1.0`, regardless of whether it actually matches semantically. For
a random string like `"xyzzy abc123 qwerty"`, the results look like:

| Result                        | True cosine similarity | RelativeScore (reported) |
| ----------------------------- | ---------------------- | ------------------------ |
| "React useEffect cleanup fix" | 0.08                   | **0.95**                 |
| "TypeScript null check error" | 0.07                   | 0.82                     |
| "PostgreSQL connection pool"  | 0.065                  | 0.71                     |

The existing `RELEVANCE_THRESHOLD = 0.5` at `weaviateSearchPath()` compares against these
already-normalized scores, so it never filters out bad results from hybrid search.

The `minScore` branching introduced in Design Log #040 fixes this for vector search (raw cosine
distance is absolute), but left hybrid unprotected because it defaults to the same
`RELEVANCE_THRESHOLD`:

```typescript
// Current — applies 0.5 to both, but 0.5 is meaningless for RelativeScore
const minScore = input.minRelevance ?? RELEVANCE_THRESHOLD;
```

## Questions and Answers

> Q: Should we switch from `RelativeScore` to `rankedFusion`?

A: No. When a real match exists, `RelativeScore` clearly separates the winner from the rest.
`rankedFusion` produces tiny `1/(60+rank)` scores — harder to reason about and no better at
detecting "no match". `RelativeScore` is the right fusion for ranking; `autocut` is the right
mechanism for detecting no-match.

> Q: Should we switch to vector-only for agent queries?

A: No. Agent queries contain specific library names, method names, version strings, and exact
error messages. BM25 catches exact token matches that semantic search might miss. Both signals
together are stronger than either alone for technical queries.

> Q: What is `autocut`?

A: Weaviate's `autocut` parameter cuts results after the first N "jumps" in consecutive scores.
A "jump" is a significant relative drop between adjacent results.

For a **good query** (real match exists), the top results cluster together, then drop off:

```
scores: 0.91 → 0.88 → 0.85 → 0.22 → 0.19
jumps:         0.03   0.03   0.63   0.03
                              ↑ big jump here
```

`autocut: 1` cuts after the first big jump → returns the top 3. ✓

For a **garbage query** (no real match), scores are uniformly distributed with no clear gap:

```
scores: 0.08 → 0.07 → 0.065 → 0.06 → 0.058
jumps:         0.01   0.005   0.005  0.002
```

No big jump → `autocut: 1` cuts everything → 0 results returned. ✓

> Q: What value for `autocut`?

A: `1` — cut after the first score jump. This is the most precise setting. `autocut: 2` would
allow one "cluster" of mediocre results through before cutting. For agent use, precision is
paramount, so `1` is correct.

> Q: Does `autocut` work with `RelativeScore` fusion?

A: Yes. Weaviate applies `autocut` on the final fused scores, regardless of fusion type.

> Q: Should `RELEVANCE_THRESHOLD` still apply to hybrid?

A: No. With `autocut: 1` handling quality filtering, applying `RELEVANCE_THRESHOLD = 0.5` to
hybrid scores is redundant and potentially wrong (RelativeScore scores are relative, not
absolute). Set the hybrid floor to `0` unless the caller explicitly passes `minRelevance`.

## Design

### Change 1: Add `autocut: 1` to `hybridSearch()`

```typescript
const results = await collection.query.hybrid(query, {
  alpha: HYBRID_ALPHA,
  fusionType: 'RelativeScore',
  autoLimit: 1, // ← new (SDK name for Weaviate's autocut parameter)
  limit,
  offset,
  filters: filter ?? undefined,
  returnMetadata: ['score'],
});
```

### Change 2: Fix `minScore` branching in `weaviateSearchPath()`

```typescript
// Before — 0.5 threshold applies to both, meaningless for hybrid
const minScore = input.minRelevance ?? RELEVANCE_THRESHOLD;

// After — threshold only applies to vector (raw cosine scores are absolute)
const minScore = input.minRelevance ?? (useHybrid ? 0 : RELEVANCE_THRESHOLD);
```

For vector search, `1 - distance` is a real cosine similarity. `RELEVANCE_THRESHOLD = 0.5`
filters out weak matches correctly. For hybrid, `autocut` handles it upstream.

## Implementation Plan

1. Add `autocut: 1` to `collection.query.hybrid()` in `hybridSearch()` — one line
2. Fix `minScore` in `weaviateSearchPath()` — one line
3. Update existing test asserting hybrid call params to include `autocut: 1`
4. Add new tests:
   - Hybrid call includes `autocut: 1`
   - Hybrid with low scores is NOT filtered by the 0.5 threshold (only autocut filters)
   - Vector search with low scores IS still filtered by the 0.5 threshold

## Files Changed

- `packages/backend/src/services/search.service.ts` — 2 lines changed
- `packages/backend/src/services/search.service.test.ts` — 1 existing test updated, 2 new tests

## Trade-offs

| Pros                                                              | Cons                                                     |
| ----------------------------------------------------------------- | -------------------------------------------------------- |
| Gibberish queries return 0 results instead of false positives     | `autocut: 1` is aggressive — might cut on small datasets |
| No changes to fusion type, ranking behavior unchanged             | Weaviate handles the cut internally (less transparent)   |
| Works correctly for agent use case (precision > recall)           | —                                                        |
| Human frontend searches also benefit (no junk results)            | —                                                        |
| `RELEVANCE_THRESHOLD` now correctly applies only where meaningful | —                                                        |

---

_Created: 2026-03-17_
_Status: Implemented_
