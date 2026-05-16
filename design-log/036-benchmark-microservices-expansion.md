# Design Log #036: Benchmark Expansion — Microservices Scenarios & Fleet Simulation

## Background

Design log #033 established the token-savings benchmark: a rigorous A/B methodology measuring how much AgentInSync reduces agent cost when fixing known bugs. It defined 10 bugs (5 project-specific, 5 common library), a per-bug protocol, and an `analyze.ts` script that outputs per-bug token savings.

The benchmark proved the core claim — "AIS-enabled agents spend fewer tokens on known bugs" — but only for a **single agent hitting a single bug**. The narrative was missing its most compelling dimension: the **fleet multiplier effect** that makes AIS valuable at the scale of a real microservices company.

Two things were absent:

1. **A microservices bug category**: The two existing categories (project-specific bugs, common library bugs) map to "things your team knows" and "things the internet knows." Missing is the third, most expensive category: **cross-package contract breaks** — bugs that only surface because one service changed without notifying another.

2. **Fleet simulation**: The analyze script showed per-run token counts but never asked "what if 10 agents across 5 services hit this same bug class?" That's the calculation that makes AIS obviously worthwhile.

## Problem

### 1. The Narrative Gap

The benchmark prompted the question "does AIS help one agent?" but not the more important question: **"how does AIS help a team of agents?"**

In practice, the value of shared knowledge is not that a single agent saves tokens once. The value is:

- **Agent on payments team** hits `express-rate-limit` global key bug (C5) → 20K tokens to debug
- **Agent on notifications team** hits the same bug 2 weeks later → without AIS: 20K tokens again; with AIS: 2K tokens (search + read + apply)
- **Agent on orders team** hits it again → 2K tokens again
- **10 agents across the company** → 200K tokens without AIS vs 38K tokens with AIS

The benchmark had the right bugs but the wrong story around them.

### 2. Missing Bug Category: Cross-Package / Infrastructure Breaks

In a super-microservices company, the hardest bugs to find are the ones that span package boundaries:

- DevOps changed the DB connection pool config — it's in the ops runbook, not the code
- The MCP team changed an internal constant that flows through to backend validation
- A shared schema enum gained new values but consumers weren't updated

These bugs are **expensive without AIS** because:

- They require understanding two (or more) subsystems simultaneously
- The fix is trivial once the root cause is identified
- The root cause is non-obvious from the error message alone
- No Stack Overflow answer exists — this is company-specific institutional knowledge

The benchmark needed a third category (`microservice`) to demonstrate AIS value for this scenario.

### 3. No Cost Projection

The `analyze.ts` output ended with raw token counts and a savings percentage, but never translated to:

- Dollar cost at different fleet sizes
- Break-even analysis (how many agents does it take for AIS to pay for itself?)
- Projections for realistic company footprints

Without these numbers, the benchmark tells a researcher's story, not a buyer's story.

## Questions and Answers

> Q: Should MS bugs be in the same codebase as P/C bugs, or in a separate fictional repo?

A: Same codebase. The benchmark must be runnable via `git apply`. Using a fictional codebase adds a setup burden and reduces reproducibility. The AgentInSync monorepo already has multiple packages with real cross-package dependencies — it is itself a valid microservices analogue.

> Q: What makes a good MS bug?

A: Three properties: (1) the root cause is in a different package/layer than where the error appears; (2) the error message alone does not reveal the source; (3) the fix requires reading across a package boundary. All three MS bugs satisfy these criteria.

> Q: Should the fleet simulation use measured data or estimates?

A: Both. When the CSV has data, use the measured median as the discovery cost. When the CSV is empty (pre-benchmark run), use an estimate and label it clearly. This makes `analyze.ts` useful both as a planning tool (before the benchmark) and as an analysis tool (after).

> Q: How should we model the AIS overhead?

A: Two components:

- **Search overhead** (~5K tokens per agent): tokens consumed by `search_before_fixing` + reading results + deciding to use the solution
- **Submit overhead** (~8K tokens, once per bug): tokens consumed by `submit_after_solving` in the first agent's session

Submit overhead is amortized across all subsequent agents. At N=2 it's already fully amortized for most bugs.

> Q: What's the right framing for the README?

A: The README should answer "why does this benchmark exist and what does it prove?" before explaining how to run it. The knowledge-fragmentation problem (Slack, READMEs, GitHub issues, Stack Overflow) should be front-loaded. Engineers reading it should say "yes, that's exactly our situation" before they see any numbers.

## Design

### Bug Catalog Expansion

Three new bugs in a `microservice` category:

```
MS1: DB pool max defaulting to 1
  File: packages/db-client/src/client.ts
  Patch: Change `DB_POOL_MAX ?? '20'` → `DB_POOL_MAX ?? '1'`
  Error: Concurrent requests timeout / ECONNRESET
  Root cause layer: db-client (infra config)
  Error surface layer: backend (all routes under load)
  Knowledge source: Ops runbook / incident postmortem

MS2: MCP search limit cap set to 0
  File: packages/mcp-server/src/handlers.ts
  Patch: `MCP_SEARCH_MAX_LIMIT = 10` → `MCP_SEARCH_MAX_LIMIT = 0`
  Error: "limit: Number must be greater than 0" on every MCP search
  Root cause layer: mcp-server constant
  Error surface layer: backend Zod validation (.positive())
  Knowledge source: Cross-team PR comment / changelog

MS3: Invalid sort_order default in MCP handler
  File: packages/mcp-server/src/handlers.ts
  Patch: `args.sort_order ?? 'relevance'` → `args.sort_order ?? 'trending'`
  Error: "Invalid enum value. Expected '...' received 'trending'"
  Root cause layer: mcp-server default value
  Error surface layer: backend Zod validation (enum check)
  Knowledge source: Shared schema changelog / sortOrderSchema enum
```

**Why these three bugs specifically:**

| Bug | Without AIS                                                                                                                      | With AIS                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| MS1 | Agent checks DB health, Kubernetes config, app code, env vars for 40-60 mins before looking at pool defaults                     | Searches "database timeout concurrent requests postgres pool" → instant hit    |
| MS2 | Agent traces the validation error into Zod schema, then into backend route, then puzzles why limit is 0, then finds the constant | Searches "MCP search limit must be greater than 0" → finds the constant change |
| MS3 | Agent reads sortOrderSchema, searches for where `trending` came from, eventually finds the handler default                       | Searches "sort_order invalid enum trending MCP" → finds the exact bug          |

### Fleet Simulation in analyze.ts

A new `printFleetSimulation()` function appended to the analysis output:

```typescript
// Model: first agent pays full discovery + submit cost
//        each subsequent agent pays only search cost
const withoutTotal = discovery * n;
const withTotal = discovery + submitOverhead + (n - 1) * searchOverhead;
const savings = ((1 - withTotal / withoutTotal) * 100).toFixed(0) + '%';
```

Constants used (configurable):

| Parameter        | Value        | Basis                                                                          |
| ---------------- | ------------ | ------------------------------------------------------------------------------ |
| `searchOverhead` | 5,000 tokens | Estimated: `search_before_fixing` call + reading 3 results + applying solution |
| `submitOverhead` | 8,000 tokens | Estimated: `submit_after_solving` call in the fix session                      |
| `costPerToken`   | $0.0000066   | Claude Sonnet: 70% input @ $3/M + 30% output @ $15/M                           |

When the CSV has measured data, `discovery` is replaced with the measured median across all bugs. This makes the simulation grounded rather than hypothetical.

### README Rewrite

The benchmark README was restructured around three sections:

1. **The Problem: Knowledge Lives Everywhere** — opens with a concrete diagram showing where knowledge fragments (Slack, READMEs, GitHub, Stack Overflow, runbooks). Makes the problem visceral before introducing the solution.

2. **The Fleet Multiplier** — shows the math and a table of N agents vs total token cost, with/without AIS. Break-even is highlighted: 2 agents, always. Makes the ROI case without requiring the reader to run the benchmark.

3. **Bug Catalog** — three-category table with an added "Knowledge Source" column. Each bug is now explicitly linked to the type of institutional knowledge it requires, making the mapping to real-world scenarios concrete.

### Per-Category Breakdown in analyze.ts

The existing per-bug table now feeds into a per-category summary:

```
Per-category median savings:
  project      5 bugs   median savings: 62.3%
  common       5 bugs   median savings: 71.5%
  microservice 3 bugs   median savings: 78.9%   ← expected highest (hardest discovery)
```

The hypothesis: MS bugs should show the highest savings because they have the longest discovery time without AIS (multi-package traversal) but the same short search time with AIS.

## Implementation Plan

### Phase 1: Bug Patches ✅

1. `benchmark/patches/MS1-db-pool-max.patch` — changes pool default from 20 to 1
2. `benchmark/patches/MS2-mcp-search-limit-cap.patch` — changes cap from 10 to 0
3. `benchmark/patches/MS3-mcp-sort-order-invalid.patch` — changes default from 'relevance' to 'trending'

### Phase 2: Prompts and Submit-Prompts ✅

For each MS bug:

- `benchmark/prompts/MS{N}.md` — error prompt describing what the agent sees (no codebase knowledge given)
- `benchmark/submit-prompts/MS{N}.md` — guided submit prompt with tags, metadata, lessonsLearned

The prompts are written to match the category's knowledge requirements:

- MS1 prompt does NOT mention pool config (the agent must discover it)
- MS2 prompt does NOT mention the constant (the agent must trace the error)
- MS3 prompt gives the exact error message so AIS can surface it via keyword search

### Phase 3: README Rewrite ✅

Full rewrite of `benchmark/README.md` with:

- "The Problem" section with ASCII knowledge-fragmentation diagram
- "The Fleet Multiplier" section with N-agent cost table
- Three-category bug catalog with "Knowledge Source" column
- "What Voting and Ranking Adds" section explaining how quality improves over time
- Updated protocol section referencing all 13 bugs

### Phase 4: analyze.ts Enhancement ✅

- Added `printFleetSimulation()` function with N-agent simulation
- Added per-category median savings breakdown
- Added dollar-cost projection for realistic company footprints
- When CSV is empty, prints the fleet simulation with estimates (so the tool is useful pre-benchmark)

### Phase 5: results.csv ✅

Added 18 new rows for MS1/MS2/MS3 (3 without-AIS runs + 3 with-AIS runs each), maintaining the same schema as existing rows.

## Examples

✅ Fleet simulation output (empty CSV, using estimates):

```
Fleet Simulation: What if N agents across your org hit the same bug?
================================================================================
Using estimated discovery cost: 50,000 tokens
AIS search overhead: ~5K tokens/agent
AIS submit overhead: ~8K tokens (once, first agent)

Agents     Without AIS        With AIS           Savings    USD saved (Sonnet)
--------------------------------------------------------------------------------
1          50K                58K                -16%       -
2          100K               63K                37%        $0.245
3          150K               68K                55%        $0.541
5          250K               78K                69%        $1.133
10         500K               103K               79%        $2.607
20         1,000K             153K               85%        $5.594
50         2,500K             303K               88%        $14.553
100        5,000K             553K               89%        $29.107

Key insight: break-even is at 2 agents. Every agent after the first is net profit.
```

✅ Per-category breakdown (with data):

```
Per-category median savings:
  project      5 bugs   median savings: 58.4%
  common       5 bugs   median savings: 67.1%
  microservice 3 bugs   median savings: 81.2%
```

❌ What we do NOT show: exact token counts as proof of fixed savings

```typescript
// Don't claim "AIS always saves exactly 70%"
// The savings depend on: bug difficulty, AIS submission quality,
// whether the agent searched effectively, LLM non-determinism.
// The benchmark shows DISTRIBUTIONS, not constants.
```

## Trade-offs

| Pros                                                          | Cons                                                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| MS category explicitly tests the microservices value prop     | 3 more bugs = 18 more benchmark runs (1.5× the work)                                              |
| Fleet simulation answers the "so what?" for buyers            | Simulation uses estimated overhead — real numbers may differ                                      |
| README now tells a story, not just instructions               | Longer README may reduce read-through rate                                                        |
| Per-category breakdown reveals which bug class AIS helps most | Category distinctions are somewhat subjective (a C bug could be an MS bug in a different company) |
| analyze.ts useful pre-benchmark (shows estimates)             | Pre-benchmark estimates could set inflated expectations                                           |
| Knowledge-source column makes the value prop concrete         | Knowledge sources are illustrative, not formally verified                                         |

## Implementation Notes

All new files:

- `benchmark/patches/MS1-db-pool-max.patch` — DB pool default change
- `benchmark/patches/MS2-mcp-search-limit-cap.patch` — MCP constant change
- `benchmark/patches/MS3-mcp-sort-order-invalid.patch` — MCP default enum value change
- `benchmark/prompts/MS1.md` — timeout error prompt
- `benchmark/prompts/MS2.md` — limit validation error prompt
- `benchmark/prompts/MS3.md` — sort_order enum error prompt
- `benchmark/submit-prompts/MS1.md` — guided submit for pool bug
- `benchmark/submit-prompts/MS2.md` — guided submit for limit cap bug
- `benchmark/submit-prompts/MS3.md` — guided submit for sort order bug

Modified files:

- `benchmark/README.md` — complete rewrite with microservices narrative
- `benchmark/analyze.ts` — fleet simulation + per-category breakdown + dollar projections
- `benchmark/results.csv` — 18 new rows for MS1/MS2/MS3

No production code was changed. The benchmark is entirely additive.

---

_Created: 2026-02-24_
_Status: Implemented_
