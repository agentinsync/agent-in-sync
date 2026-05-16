# Design Log #043: Trivial Fix Exemption for KB Search

## Background

The AgentInSync workflow rules (SKILL.md + `.claude/rules/agent-in-sync-workflow.md`) mandate calling `search_before_fixing` on **any** error/bug keyword trigger. This includes obvious mechanical fixes like missing imports, typos, and missing semicolons -- fixes that any agent can resolve instantly from its own knowledge.

The mandatory search adds latency and consumes API calls for zero knowledge-base value. Agents were spending more time searching than fixing for single-character corrections.

## Problem

1. **Wasted time**: A missing semicolon triggers a full KB search round-trip before the agent can add `;`.
2. **Wasted API calls**: Every search hits the backend + Weaviate, even when the fix is self-evident.
3. **KB pollution risk**: If agents submit trivial fixes (per step 5), the knowledge base fills with low-value entries like "added missing import for useState".
4. **Agent frustration signal**: Users reported agents feeling "slow" on obvious fixes due to the mandatory search-first workflow.

## Questions and Answers

> Q: How do we prevent agents from abusing the exemption to skip search on real bugs?

A: Three safeguards: (1) a **closed list** of qualifying categories -- not open-ended "use judgment", (2) a **single-line constraint** -- multi-file or architectural fixes never qualify, (3) a **"when in doubt, search" rule** that defaults to searching. The comparison table provides concrete examples for LLM calibration.

> Q: Should trivial fixes still require submission (step 5)?

A: No. If the fix has no investigation value, it has no KB value. Exempting from both search and submission keeps the KB signal-to-noise ratio high.

> Q: Why not use a confidence threshold or heuristic instead of a closed list?

A: LLMs interpret "I'm confident" loosely. A closed list of categories (import, typo, syntax token, string literal, type annotation) is unambiguous and auditable. The comparison table (trivial vs not-trivial) further calibrates the boundary.

> Q: Does this affect the `.claude/rules/agent-in-sync-workflow.md` differently from SKILL.md?

A: Yes. The workflow rules file has a more structured execution sequence (steps 1-5) and explicit MANDATORY TRIGGERS. It needed a dedicated `TRIVIAL FIX EXEMPTION` section with the full comparison table and updated constraint wording. SKILL.md uses inline blockquotes since it's more narrative.

## Design

The exemption is defined by three ALL-required conditions:

1. **Single-line or single-statement change** -- if it touches multiple files, it's not trivial
2. **Immediately obvious root cause** -- no investigation needed, error message tells you everything
3. **Falls into a closed category list**:
   - Missing or incorrect `import`/`require` statement
   - Typo in a variable, function, or file name
   - Missing syntax token (`;`, `)`, `}`, `,`)
   - Wrong string literal (e.g., mismatched route path)
   - Type annotation fix that the compiler already identifies

### Calibration table

| Trivial (skip search)                | NOT trivial (search required)                 |
| ------------------------------------ | --------------------------------------------- |
| Missing import for a known symbol    | Import exists but module resolution fails     |
| Typo in variable name                | Wrong variable used (logic error)             |
| Missing closing bracket              | Mismatched async/await causing race condition |
| Type annotation fix suggested by tsc | Type error from incompatible library versions |

### Safety net

**"When in doubt, search."** -- if the agent isn't sure whether a fix qualifies, it must search. This preserves the search-first default for anything ambiguous.

## Implementation Plan

1. Phase 1: Add trivial fix exemption blockquotes to `skills/agent-in-sync/SKILL.md` (canonical source)
2. Phase 2: Sync to 3 agent-specific copies (`.claude/`, `.agents/`, `.cursor/`)
3. Phase 3: Update `packages/shared/src/instructions.ts` (escaped backtick version) to match
4. Phase 4: Add full `TRIVIAL FIX EXEMPTION` section to `.claude/rules/agent-in-sync-workflow.md`
5. Phase 5: Verify `skill-sync.test.ts` passes (SKILL.md body == `getInstructionContent()`)

## Examples

Agent receives: "Fix the missing import for `useState`"

- Single-line change: yes
- Obvious cause: yes (missing import)
- Category match: yes (missing import)
- **Result: skip search, fix directly, no submission**

Agent receives: "Getting a 500 error on the /api/users endpoint"

- Single-line change: unknown
- Obvious cause: no (needs investigation)
- **Result: search first (mandatory)**

Agent receives: "Fix the race condition in the auth middleware"

- Single-line change: almost certainly no
- Obvious cause: no (race conditions require analysis)
- **Result: search first (mandatory)**

## Trade-offs

| Pros                                         | Cons                                               |
| -------------------------------------------- | -------------------------------------------------- |
| Faster agent response for obvious fixes      | Risk of agents over-classifying as "trivial"       |
| Fewer wasted API calls to search backend     | Closed list may miss some valid trivial categories |
| Cleaner KB (no low-value submissions)        | Adds complexity to the rule set agents must parse  |
| Better UX for users with simple fix requests | Cannot be automatically enforced (relies on LLM)   |
| "When in doubt, search" preserves safety     |                                                    |

## Implementation Results

All 6 files updated successfully:

- `skills/agent-in-sync/SKILL.md` -- canonical source with blockquote exemptions
- `.claude/skills/agent-in-sync/SKILL.md` -- identical copy
- `.agents/skills/agent-in-sync/SKILL.md` -- identical copy
- `.cursor/skills/agent-in-sync/SKILL.md` -- identical copy
- `packages/shared/src/instructions.ts` -- escaped backtick version, synced with prettier output
- `.claude/rules/agent-in-sync-workflow.md` -- full TRIVIAL FIX EXEMPTION section with comparison table

### Deviation from plan

Prettier reformatted the markdown blockquotes (added `>` blank line after header, changed `*why*` to `_why_`). Required a follow-up commit to align `instructions.ts` with the prettier-formatted SKILL.md so the sync test would pass.

### Verification

- `skill-sync.test.ts`: passes (SKILL.md body matches `getInstructionContent()`)
- `pnpm format:check`: clean
- `pnpm lint`: passes (only pre-existing warnings in unrelated test files)

---

_Created: 2026-03-13_
_Status: Implemented_
