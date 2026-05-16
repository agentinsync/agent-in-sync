# Design Log #035: MCP Search Result Cap

## Background

The `search_before_fixing` MCP tool returns search results formatted as markdown that gets injected into the calling agent's LLM context window. The backend allows up to 50 results per request (`limit: 1-50`, default 10), designed for paginated human UI where users scroll through results. The MCP handler currently passes the agent-supplied `limit` straight through (defaulting to 10).

Each search result renders ~15-20 lines of markdown via `formatSearchResultsMarkdown`: a heading, a metadata table (issue ID, solution ID, votes, tags, author, relevance), a metadata summary line, and a blockquote summary. At `limit: 10`, that's ~150-200 lines; at `limit: 50`, ~750-1000 lines — a significant fraction of an agent's context window consumed by results it will mostly ignore.

## Problem

1. **Token waste**: Agents typically need 1-3 matching results. Returning 10 by default wastes ~70% of the search response tokens. Agents rarely paginate or inspect beyond the top few.

2. **No MCP-specific guard**: The backend's `limit: 50` ceiling is a UI concern. The MCP layer has no independent cap — an agent (or a rogue prompt) can request 50 full results, burning ~4-5K tokens on search output alone.

3. **Attention dilution**: LLMs perform worse when relevant information is buried in long context. Fewer, higher-quality results improve the agent's ability to identify and apply the right solution.

## Questions and Answers

> Q: Should the MCP cap be a hard override or just a different default?

A: Both. Lower default **and** a hard cap. The MCP serves a fundamentally different consumer (LLM context) than the REST API (human paginated UI). An agent requesting 50 results is almost certainly a mistake.

> Q: What's the right default and cap?

A: Default **3**, cap **10**. Rationale:

- 3 results is enough to find a match or determine "no relevant solution exists"
- If the top 3 don't match, the agent should refine its query (different terms, add filters) rather than read more results
- Cap of 10 allows agents that explicitly need more (e.g., duplicate detection before submit) to request it
- 10 results × ~15-20 lines = ~150-200 lines, still manageable

> Q: Should we add a compact output mode?

A: Not now. Capping at 3 results by default already reduces output to ~50-60 lines. A compact mode adds formatter complexity for marginal gain at this scale. Revisit if agents consistently need 10+ results.

> Q: Should we update the tool schema description?

A: Yes. The `limit` description should say `1-10, default 3` instead of `1-50`, so LLMs generating tool calls understand the MCP constraint without needing to read documentation.

## Design

### MCP-Level Enforcement

Constants in `handlers.ts`:

```typescript
const MCP_SEARCH_DEFAULT_LIMIT = 3;
const MCP_SEARCH_MAX_LIMIT = 10;
```

Applied in `handleSearch` before passing to the backend:

```typescript
const mcpLimit = Math.min(
  Math.max(Number(args.limit ?? MCP_SEARCH_DEFAULT_LIMIT), 1),
  MCP_SEARCH_MAX_LIMIT
);
```

### Tool Schema Update

In `tools.ts`, update the `limit` property description:

```typescript
limit: { type: 'number', description: 'Max results to return (1-10, default 3). Keep low to save context.' },
```

### SKILL.md Guidance

Add a search tip encouraging small limits and query refinement over result volume.

## Implementation Plan

1. **Phase 1**: Add `MCP_SEARCH_DEFAULT_LIMIT` and `MCP_SEARCH_MAX_LIMIT` constants in `handlers.ts`. Clamp `limit` in `handleSearch`.
2. **Phase 2**: Update `limit` description in `tools.ts` to reflect MCP constraints.
3. **Phase 3**: Update SKILL.md with search limit guidance.
4. **Phase 4**: Update formatter test if it asserts on result counts affected by the cap.

## Examples

✅ Agent searches with default (gets 3 results — fast, focused):

```
search_before_fixing({ query: "useEffect cleanup not called" })
// → 3 results, ~50 lines of markdown
```

✅ Agent explicitly requests more when needed:

```
search_before_fixing({ query: "react hydration mismatch", limit: 8 })
// → 8 results, ~140 lines of markdown
```

❌ Agent requests 50 — clamped to 10:

```
search_before_fixing({ query: "typescript error", limit: 50 })
// → 10 results (clamped), ~170 lines of markdown
```

## Trade-offs

| Pros                                               | Cons                                                                                   |
| -------------------------------------------------- | -------------------------------------------------------------------------------------- |
| ~70% fewer tokens per search by default            | Agents may need multiple searches to find niche results                                |
| Better LLM attention on top results                | Slightly more tool calls if agent needs to paginate                                    |
| Hard cap prevents runaway context consumption      | MCP limit diverges from REST API limit (two ceilings to maintain)                      |
| Schema description guides LLM tool-call generation | Agents trained on older schema may still request high limits (harmless — gets clamped) |

## Implementation Notes

Key files:

- `packages/mcp-server/src/handlers.ts` — clamp logic
- `packages/mcp-server/src/tools.ts` — schema description update
- `.cursor/skills/agent-in-sync/SKILL.md` — agent guidance

---

_Created: 2026-02-24_
_Status: Draft_
