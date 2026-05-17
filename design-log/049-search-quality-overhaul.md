# Design Log #049: Search Quality Overhaul

## Background

AgentInSync's core value proposition is precision search for coding agents. The primary consumer is a
coding agent calling `search_before_fixing` mid-debug. Its decision is binary:

```
found relevant result → use it (saves ~47K tokens, avoids repeating the mistake)
no result found      → fix it yourself, submit to KB
```

A wrong result is worse than no result — the agent may apply a bad fix, waste tokens debugging it,
and pollute the KB with a bad submission. **Every change must optimize precision first.**

The current search stack (built across DL #004, #025, #034, #044) works well at its core:
`alpha: 0.7`, `RelativeScore` fusion, `autoLimit: 1`, unified Weaviate path. This design log
implements seven targeted improvements identified through a Weaviate docs review.

## Problem

Seven gaps between current implementation and best-practice Weaviate hybrid search:

1. **Equal BM25 weight across fields** — `title` and `content` are weighted equally in hybrid BM25.
   An exact error message in a title is more relevant than the same phrase buried in 2000 words of
   solution content.

2. **PG round-trip on every text search** — The Weaviate path still calls `fetchSolutionDetails`
   (5-table JOIN) after retrieving candidates. Design Log #043 (Draft) eliminates this by
   denormalizing display fields into Weaviate. One Weaviate call → full `SearchResult`. This is
   the biggest latency win available.

3. **No cross-encoder reranking** — `all-MiniLM-L6-v2` is a bi-encoder: embeds query and document
   independently. A cross-encoder evaluates `(query, document)` pairs together — far more accurate
   for ranking relevance but only runs on the already-shortlisted candidates. For 3-result agent
   searches, the overhead is negligible; the precision gain is significant.

4. **No zero-result visibility** — Knowledge managers can't see which queries returned empty
   results. This is the highest-signal data for knowledge curation: "agents searched for X 47 times
   and found nothing" is an actionable gap.

5. **HNSW index defaults at schema creation** — `efConstruction: 128` (default). For a
   search-heavy, write-light product, `efConstruction: 256` produces a denser graph with better
   recall. This is immutable after creation — must be set at the next schema version bump.

6. **Tag sprawl** — `react`, `React`, `reactjs`, `react.js` are treated as different tags. Agents
   using different conventions miss each other's solutions. No normalization at write time.

7. **`errorCategory` tokenization** — Stores free-text error strings like
   `"TypeError: Cannot read property 'length' of null"`. Default `word` tokenization splits on
   whitespace only, missing casing variants. `trigram` tokenization enables fuzzy matching and
   handles mixed-case identifiers.

## Questions and Answers

> Q: Should improvements 2, 3, 5, 7 be done together (they all require a schema version bump)?

A: Yes. Items 2 (denormalized fields), 3 (reranker config), 5 (HNSW tuning), and 7 (errorCategory
trigram) all require a schema change. Since `SOLUTION_SCHEMA_VERSION` bump drops and recreates the
collection, batch them into one schema version (v5). This avoids multiple data re-indexes.

> Q: Does adding a reranker add meaningful latency for agents?

A: Minimal. `autoLimit: 1` typically returns 1-5 candidates. The cross-encoder runs on that tiny
shortlist, not on 100 candidates. On CPU (no CUDA), `ms-marco-MiniLM-L-6-v2` takes ~10-30ms for
5 pairs. Acceptable for agent use (latency is not the bottleneck — correctness is).

> Q: For item 2 (DL #043), which PG path is removed?

A: Only the Weaviate text-search path (`weaviateSearchPath`). The PG browse path (no text query)
keeps `fetchSolutionDetails` unchanged — Weaviate can't browse without a query, and that path is
used by humans, not agents.

> Q: Does `queryProperties` with `title^3` change the `alpha` balance?

A: No. `alpha` controls vector vs BM25 weight. `queryProperties` only affects how BM25 scores are
computed internally (which properties contribute, with what boost). The vector component is
unchanged.

> Q: How does tag normalization affect existing tags in Weaviate?

A: Schema v5 drops the collection anyway. The re-indexing pass (triggered at startup from
existing PG data) re-normalizes all tags at that point. No separate migration needed.

> Q: What's the fallback if the reranker container is unavailable?

A: Weaviate gracefully falls back to the un-reranked hybrid scores. The collection config still has
the reranker module enabled, but if the inference API is unreachable, results return without
reranking. Add a health check dependency in docker-compose.

> Q: For item 4 (zero-result UI), where is search telemetry logged?

A: The `logger.info('Search completed successfully')` call in `weaviateSearchPath` already logs
`resultCount`. Axiom receives this. The frontend knowledge-gaps view queries Axiom directly or a
new `/api/v1/analytics/search-gaps` endpoint. Start with the backend endpoint (simpler, no Axiom
dependency for the feature).

## Design

### Phase 1 — BM25 property boost (1 line, no schema change)

Add `queryProperties` to `hybridSearch()` in `search.service.ts`:

```typescript
const results = await collection.query.hybrid(query, {
  alpha: HYBRID_ALPHA,
  fusionType: 'RelativeScore',
  autoLimit: 1,
  maxVectorDistance: MAX_VECTOR_DISTANCE,
  queryProperties: ['title^3', 'content'], // title 3× weight in BM25
  limit,
  filters: filter ?? undefined,
  returnMetadata: ['score'],
});
```

**Effect**: An exact error message matching the solution title is ranked dramatically higher than a
content-buried match. No schema change, no re-index.

### Phase 2 — Unified Weaviate search (DL #043 implementation)

Remove the `fetchSolutionDetails` PG JOIN from the Weaviate text-search path. Full design in
[Design Log #043](./043-unified-weaviate-search.md).

**Schema additions** (6 denormalized display fields, bundled in schema v5):

```typescript
{ name: 'authorName', dataType: 'text', skipVectorization: true },
{ name: 'agentSlug', dataType: 'text', skipVectorization: true },
{ name: 'agentDisplayName', dataType: 'text', skipVectorization: true },
{ name: 'organizationName', dataType: 'text', skipVectorization: true },
{ name: 'isAccepted', dataType: 'boolean', skipVectorization: true },
{ name: 'authorTrustLevel', dataType: 'text', skipVectorization: true },
```

**Result**: 1 Weaviate call (was 1 Weaviate + 1 PG) for all text searches. ~50% latency reduction
on the primary agent path.

### Phase 3 — Cross-encoder reranker

Add `reranker-transformers` service. Wire into collection schema and hybrid query.

**Docker services** (both `docker-compose.yml` and `docker-compose.data.yml`):

```yaml
reranker-transformers:
  image: cr.weaviate.io/semitechnologies/reranker-transformers:cross-encoder-ms-marco-MiniLM-L-6-v2
  restart: unless-stopped
  environment:
    ENABLE_CUDA: '0'
  networks:
    - agent-in-sync-network

weaviate:
  environment:
    # existing vars...
    RERANKER_INFERENCE_API: 'http://reranker-transformers:8080'
  depends_on:
    - t2v-transformers
    - reranker-transformers # add
```

**Schema** (bundled in schema v5):

```typescript
await client.collections.create({
  name: SOLUTION_COLLECTION,
  vectorizers: vectorizer.text2VecTransformers({ vectorizeCollectionName: false }),
  reranker: weaviate.configure.reranker.transformers(), // ← new
  // ... properties
});
```

**Query** (add `rerank` to `hybridSearch()`):

```typescript
import { Rerank } from 'weaviate-client';

const results = await collection.query.hybrid(query, {
  alpha: HYBRID_ALPHA,
  fusionType: 'RelativeScore',
  autoLimit: 1,
  maxVectorDistance: MAX_VECTOR_DISTANCE,
  queryProperties: ['title^3', 'content'],
  rerank: new Rerank({ prop: 'title', query }), // cross-encoder reranks by title
  limit,
  filters: filter ?? undefined,
  returnMetadata: ['score', 'rerankScore'],
});
```

Use `rerankScore` as the `relevance` value when present (more accurate than fused score).

### Phase 4 — Zero-result monitoring UI

**Backend**: New endpoint `GET /api/v1/analytics/search-gaps` (admin/reviewer only).

Track zero-result queries in a lightweight `search_events` PostgreSQL table:

```sql
CREATE TABLE search_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  query TEXT NOT NULL,
  result_count INT NOT NULL,
  search_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON search_events (organization_id, result_count, created_at DESC);
```

Log every search in `weaviateSearchPath()` and `pgBrowsePath()`. The endpoint aggregates:

```typescript
// GET /api/v1/analytics/search-gaps
{
  gaps: [
    { query: 'connection pool exhausted postgres', count: 47, lastSearchedAt: '...' },
    { query: 'K8S_CONTEXT env var missing', count: 23, lastSearchedAt: '...' },
  ];
}
```

**Frontend**: "Knowledge Gaps" tab in the admin/management UI. Shows the table above with a
"Create Solution" button that pre-fills `submit_after_solving` with the missing query as the title.

### Phase 5 — HNSW tuning (bundled in schema v5)

Set `efConstruction: 256` at collection creation:

```typescript
await client.collections.create({
  name: SOLUTION_COLLECTION,
  vectorIndexConfig: weaviate.configure.vectorIndex.hnsw({
    efConstruction: 256, // default 128 → better recall for search-heavy workload
    maxConnections: 32, // keep default
    // ef stays -1 (dynamic) — auto-adjusts at query time
  }),
  // ...
});
```

Immutable after creation — only apply on the schema v5 drop/recreate.

### Phase 6 — Tag normalization at write time

In `submit.service.ts` and `suggest.service.ts`, normalize tags before PG insert and Weaviate index:

```typescript
function normalizeTags(tags: string[]): string[] {
  return [
    ...new Set(
      tags.map(t =>
        t
          .toLowerCase()
          .trim()
          .replace(/[.\s]+/g, '-')
      )
    ),
  ];
}
```

This maps `React`, `react.js`, `React.JS` → `react`. Idempotent. Applied at the DB layer
(before insert), so Weaviate always receives normalized tags from `indexSolutionInWeaviate`.

Also applied to search input (`weaviateFilters.tags`) so filter queries match the stored values.

### Phase 7 — `errorCategory` trigram tokenization (bundled in schema v5)

```typescript
{
  name: 'errorCategory',
  dataType: 'text',
  skipVectorization: true,
  indexFilterable: true,
  tokenization: 'trigram',  // was: 'word' (default)
},
```

Trigram tokenization breaks `"TypeError: Cannot read"` into character 3-grams, enabling BM25
to match `"typeerror cannot"` even with casing differences or partial error strings.

### Schema version bump summary

Schema v5 (applied in `packages/backend/src/weaviate/client.ts`):

| Change                        | Phase |
| ----------------------------- | ----- |
| 6 denormalized display fields | 2     |
| `reranker: transformers()`    | 3     |
| `efConstruction: 256`         | 5     |
| `errorCategory` trigram       | 7     |

Single `SOLUTION_SCHEMA_VERSION = 5` bump triggers drop + recreate on startup.

## Implementation Plan

### Phase 1: BM25 boost — `queryProperties` (no schema change)

Files changed (1):

- `packages/backend/src/services/search.service.ts` — add `queryProperties` to `hybridSearch()`

Tests:

- Add: hybrid call includes `queryProperties: ['title^3', 'content']`

### Phase 2: Unified Weaviate (DL #043)

Files changed (≤3 per PR):

- `packages/backend/src/weaviate/client.ts` — add 6 fields, bump schema v5
- `packages/backend/src/services/search.service.ts` — remove `fetchSolutionDetails` from Weaviate path, `hybridSearch`/`vectorSearch` return `SearchResult[]`
- `packages/backend/src/services/submit.service.ts` — populate new fields on index

Tests:

- Mock Weaviate returns full objects with display fields
- Remove tests asserting `fetchSolutionDetails` called from Weaviate path

### Phase 3: Reranker

Files changed (≤3 per PR):

- `docker-compose.yml` + `docker-compose.data.yml` — add service, env var (2 files)
- `packages/backend/src/weaviate/client.ts` — add `reranker` to schema (already touched in Phase 2)
- `packages/backend/src/services/search.service.ts` — add `rerank` + `rerankScore` (already touched)

Tests:

- Verify hybrid call includes `rerank` param
- Verify `rerankScore` used as relevance when present

### Phase 4: Zero-result monitoring

Files changed (≤3 per PR, split from Phase 4):

- New DB migration — `search_events` table
- `packages/backend/src/services/search.service.ts` — log events
- `packages/backend/src/routes/analytics.route.ts` — new endpoint
- `packages/frontend/src/routes/` — Knowledge Gaps UI page

Split into two PRs: backend (migration + endpoint) and frontend (UI).

### Phase 5+6+7: Schema + normalization

Files changed (≤3 per PR):

- `packages/backend/src/weaviate/client.ts` — HNSW config, trigram tokenization (with Phase 2 schema bump)
- `packages/backend/src/services/submit.service.ts` — tag normalization (shared with Phase 6)

## Trade-offs

| Improvement                | Gain                                        | Cost                                       |
| -------------------------- | ------------------------------------------- | ------------------------------------------ |
| BM25 boost                 | Better ranking for title-match queries      | None — one line                            |
| Unified Weaviate (DL #043) | ~50% latency reduction, simpler code        | Eventual consistency on display fields     |
| Cross-encoder reranker     | Dramatically better #1 result precision     | +1 docker service, +10-30ms latency        |
| Zero-result monitoring     | Actionable knowledge gap signal             | New DB table, ~50 rows/day                 |
| HNSW efConstruction: 256   | Better recall, especially on small datasets | Slower writes (~2× import time)            |
| Tag normalization          | Fixes tag-based search misses               | Slight loss of original tag casing         |
| Trigram tokenization       | Fuzzy BM25 on error strings                 | Larger BM25 index size for `errorCategory` |

## Examples

### Agent search — before vs after

Query: `"TypeError: Cannot read properties of undefined reading 'map'"` (React error)

**Before**:

- BM25 weight: title = content = 1×
- No cross-encoder
- Result #1: content-match solution ranked by fused score

**After**:

- BM25 weight: title = 3× content
- Cross-encoder reranks top N by `(query, title)` pair
- Result #1: the solution whose title IS the error message, ranked first
- Latency: 1 network call (was 2)

### Knowledge manager workflow

1. Opens "Knowledge Gaps" tab
2. Sees: `"connection pool exhausted postgres"` — searched 47 times, 0 results
3. Clicks "Create Solution" → pre-filled submit form
4. Writes the solution → agents find it immediately

---

## Implementation Results

_Implemented: 2026-03-21 — All 7 phases shipped in PR #33._

### Deviations from plan

- **Phase 1**: `queryProperties` uses `{ name: 'title', weight: 3 }` object format (not `'title^3'` string) — TypeScript client requires typed objects.
- **Phase 2**: Already implemented (DL #043 was done). No changes needed.
- **Phase 3**: `RerankOptions<T>` takes `{ property, query }`, not `new Rerank(...)`. `rerankScore` is a raw cross-encoder logit — must be normalized via sigmoid before use as a relevance score (see post-ship fix below).
- **Phase 5**: `vectorIndexConfig` must be nested inside `vectorizer.text2VecTransformers()` options, not at top-level `collections.create()`.
- **autoLimit removed**: `autoLimit: 1` (autocut) was too aggressive on sparse collections — caused zero results for valid queries. Removed in post-ship fix (PR #34).

### Post-ship fixes (PR #34, PR #35)

**Bug: 211% relevance scores** — `rerankScore` is a raw cross-encoder logit (e.g. `2.11`), not bounded to [0,1]. Fixed by applying sigmoid normalization: `1 / (1 + Math.exp(-rerankScore))`.

**Bug: Zero results for keyword-heavy queries** — `autoLimit: 1` cuts results when Weaviate's autocut finds no score jump. With a sparse collection this returned nothing. Removed `autoLimit`; the explicit `limit` parameter is sufficient.

**Recall improvement: alpha 0.7 → 0.5** — Production observation: coding agents search with exact technical terms (error messages, package names, stack traces) where BM25 outperforms pure vector. With `alpha: 0.7` (70% vector), a query like `"index all solutions from PostgreSQL Weaviate"` missed the stored "re-index" document because the vector for "index" is semantically distant. Lowering to `0.5` (equal weight) restores BM25 as an equal partner for keyword-heavy agent queries without increasing noise.

### Final configuration

| Parameter                 | Original  | Final              | Reason                                      |
| ------------------------- | --------- | ------------------ | ------------------------------------------- |
| `alpha`                   | `0.7`     | `0.5`              | Equal BM25/vector for agent keyword queries |
| `autoLimit`               | `1`       | removed            | Too aggressive on sparse collections        |
| `rerankScore`             | raw logit | sigmoid normalized | Bounded to [0,1]                            |
| `SOLUTION_SCHEMA_VERSION` | `4`       | `5`                | HNSW + reranker + trigram                   |

---

_Created: 2026-03-20_
_Status: Implemented_
