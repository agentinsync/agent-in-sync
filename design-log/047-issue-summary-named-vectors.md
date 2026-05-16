# Design Log #047: Issue Summary Field + Named Vector Search

## Background

Search is the core value proposition of AgentInSync. Agents call `search_before_fixing` mid-debug
and make a binary decision: apply the result or fix it themselves. Wrong results waste tokens and
pollute the KB.

The previous search index (`SOLUTION_SCHEMA_VERSION = 5`) vectorized two fields together into a
**single vector**:

- `title` — the issue title (10-500 chars)
- `content` — the **solution text** (the fix the agent wrote)

This had two problems:

1. **Wrong content vectorized**: Searching "ECONNREFUSED postgres" matched against solution prose,
   not the issue description. If the fix never mentioned the error, it wouldn't be found.

2. **No semantic weight control**: `title` and `content` were concatenated before embedding. The
   transformer model (512 token limit) receives a single string — no way to say "title matters 2×
   more than content" in the vector space.

## Problem

### 1. Solution text is the wrong search target

Agents searching for a previously solved bug want to match the _problem_, not the _fix_. The issue
title and description capture what broke. The solution captures what to do about it. These are
semantically different.

Example: query `"useEffect cleanup not called on fast re-render"` should match an issue titled
exactly that — not rely on the solution happening to include the phrase "fast re-render".

### 2. No per-field vector weighting

With a single concatenated vector, longer content dominates the embedding. A 400-char solution
text outweighs a 50-char title. There is no way to say "title should carry 40% of the vector
signal, summary should carry 60%".

BM25 `queryProperties` already supports `weight: 2` on title for the keyword leg. The vector leg
had no equivalent control.

### 3. Agents submit noisy content (Markdown + code) for vectorization

Solution text and full issue descriptions are rich Markdown: ` ```typescript `, headers, bullet
lists, code diffs. Transformers embed natural prose well; they embed Markdown syntax and code as
noise. A 200-token code block in the submission drives the embedding away from the semantic meaning
of the bug.

## Design

### New field: `summary`

A required plain-text field (20-500 chars) that the agent writes at submit time. No Markdown, no
code blocks — 2-3 sentences in natural prose describing what broke and why.

```
"The Weaviate hybrid search returns empty results when the query contains stack trace punctuation.
BM25 splits on special characters leaving no keyword matches."
```

This becomes the `content` field stored in Weaviate (the field name is unchanged; the **value**
changes from solution text to agent-written summary).

**Why agent-written rather than auto-generated?**

The agent already understands the bug deeply at submit time. A human-level summary written at that
moment is more accurate than any post-hoc extraction from the description. It also forces the agent
to distill the issue to its essence — which is exactly what makes a good search document.

### Named vectors: `titleVec` + `summaryVec`

Replace the single concatenated vector with two named vectors, each with its own HNSW index:

| Vector       | Source property | HNSW index          | Weight at query time |
| ------------ | --------------- | ------------------- | -------------------- |
| `titleVec`   | `title`         | efConstruction: 256 | 0.4                  |
| `summaryVec` | `content`       | efConstruction: 256 | 0.6                  |

**Why 0.4 / 0.6?**

- Summary is richer and longer — deserves more semantic weight
- Title is already boosted in the BM25 leg via `queryProperties: [{ name: 'title', weight: 2 }]`
- 0.4/0.6 gives title a meaningful vector signal without letting it dominate
- These weights are tunable without a schema change (query-time only)

**Combination method: `manualWeights`**

Weaviate's `manualWeights` multiplies each vector's score by its weight before combining. This is
the right choice when fields have different importance levels. `relativeScore` normalizes each
vector's scores first (loses magnitude signal); `average` / `sum` treat all vectors equally.

### Schema v6

Named vectors require dropping and recreating the collection (immutable at creation). The existing
`SOLUTION_SCHEMA_VERSION` bump mechanism handles this on startup.

Properties `title` and `content` now have `skipVectorization: true` — vectorization is delegated
to the named vectorizer configs. Without this, Weaviate would attempt to vectorize them at the
property level too, producing a redundant unnamed default vector.

## Questions and Answers

> Q: Should `summary` be optional for backward compatibility?

A: No. Optional summary means some documents have a `summaryVec` from an empty string, which is
semantically meaningless. Making it required ensures consistent index quality. Existing agents
hitting the API without `summary` will get a 400 validation error — acceptable breakage for a
pre-production system.

> Q: Why not auto-generate the summary server-side from the description?

A: The description is Markdown with code blocks — extraction is noisy. The agent has the full bug
context at submit time and can write a better summary in one pass than any extraction heuristic.
Agent LLMs are good at this.

> Q: Could the `title` alone serve as the only vector (drop `summaryVec`)?

A: Titles are intentionally short (10-500 chars, typically <100). They capture the symptom but not
the context. Two agents hitting the same React error in different component hierarchies write the
same title. The summary differentiates them and improves recall for context-sensitive queries.

> Q: What happens to BM25 with two named vectors?

A: Named vectors do not affect BM25. The `queryProperties` config in `hybridSearch` operates on
stored property text independent of vectorization. BM25 still runs over `title` (weight 2) and
`content` with the full stored text.

> Q: Why change title BM25 weight from 3 to 2?

A: With named vectors, title now has dedicated vector representation (40% weight). The previous
`weight: 3` was compensating for title being diluted in a shared vector. With `titleVec` giving
it proper semantic representation, `weight: 3` over-boosted exact title matches at the expense of
semantic recall from `summaryVec`.

## Implementation

### Files changed

| File                                              | Change                                                                      |
| ------------------------------------------------- | --------------------------------------------------------------------------- |
| `packages/backend/src/weaviate/client.ts`         | Schema v6: single vectorizer → two named vectorizers                        |
| `packages/backend/src/services/search.service.ts` | `targetVector: manualWeights` in hybrid + vector search; title weight 3 → 2 |
| `packages/backend/src/services/submit.service.ts` | `summary` field; pass `summary` as `content` to Weaviate                    |
| `packages/shared/src/schemas/issue.ts`            | `summary` added to `submitIssueInputSchema` (required)                      |
| `packages/mcp-server/src/tools.ts`                | `summary` added to `submit_after_solving` tool (required)                   |
| `packages/shared/src/instructions.ts`             | `summary` documented in submission workflow                                 |
| `skills/agent-in-sync/SKILL.md`                   | Same documentation updates                                                  |

### Weaviate schema diff

```typescript
// Before (v5)
vectorizers: vectorizer.text2VecTransformers({
  vectorizeCollectionName: false,
  vectorIndexConfig: configure.vectorIndex.hnsw({ efConstruction: 256, maxConnections: 32 }),
}),
// title: { dataType: 'text' }           ← vectorized
// content: { dataType: 'text' }         ← vectorized (was solution text)

// After (v6)
vectorizers: [
  vectorizer.text2VecTransformers({
    name: 'titleVec',
    sourceProperties: ['title'],
    vectorizeCollectionName: false,
    vectorIndexConfig: configure.vectorIndex.hnsw({ efConstruction: 256, maxConnections: 32 }),
  }),
  vectorizer.text2VecTransformers({
    name: 'summaryVec',
    sourceProperties: ['content'],
    vectorizeCollectionName: false,
    vectorIndexConfig: configure.vectorIndex.hnsw({ efConstruction: 256, maxConnections: 32 }),
  }),
],
// title: { dataType: 'text', skipVectorization: true }   ← delegated to titleVec
// content: { dataType: 'text', skipVectorization: true } ← delegated to summaryVec (now = summary)
```

### Query diff

```typescript
// Before
collection.query.hybrid(query, {
  queryProperties: [{ name: 'title', weight: 3 }, 'content'],
  // ... no targetVector
});

// After
collection.query.hybrid(query, {
  queryProperties: [{ name: 'title', weight: 2 }, 'content'],
  targetVector: collection.multiTargetVector.manualWeights({ titleVec: 0.4, summaryVec: 0.6 }),
  // ...
});
```

## Trade-offs

| Gain                                          | Cost                                                       |
| --------------------------------------------- | ---------------------------------------------------------- |
| Vectors match the problem, not the fix        | Schema v6 drop/recreate required                           |
| Per-field vector weight control               | Two HNSW indexes instead of one (~2× index memory)         |
| Clean prose embeddings (no Markdown noise)    | Agents must write a summary (new required field)           |
| Title vector isolated from summary dilution   | Breaking change for existing API callers without `summary` |
| Weights tunable at query time without reindex | —                                                          |

---

_Created: 2026-03-21_
_Status: Implemented_
