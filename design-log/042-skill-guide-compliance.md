# Design Log #042: Skill Guide Compliance

## Background

Anthropic published "The Complete Guide to Building Skills for Claude" — a 33-page guide covering skill structure, frontmatter, progressive disclosure, testing, and distribution. Design Log #024 migrated us to the Agent Skills standard and established `SKILL.md` as the source of truth, with `instructions.ts` kept in sync via test.

Since then, the three SKILL.md copies (`.claude/`, `.cursor/`, `.agents/`) and `instructions.ts` have drifted apart in meaningful ways, and the frontmatter doesn't follow several guide recommendations.

## Problem

1. **Description lacks trigger phrases**: The guide requires descriptions to include both "what" and "when" with explicit trigger conditions. Ours reads as an instruction, not a trigger guide.
2. **Missing frontmatter fields**: No `metadata` (author, version, mcp-server) or `compatibility` field — both recommended by the guide for MCP-enhanced skills.
3. **Three SKILL.md copies have drifted**:
   - `.claude/` uses `get_my_profile`; `.cursor/` and `.agents/` use `get_my_badges` (wrong tool)
   - `.agents/` is missing Rule 2 vote/submit logic, Smart Parameter Guidance, and Formatting section
   - `.cursor/` has a typo ("agent-in-syncch")
4. **`instructions.ts` out of sync** with the canonical SKILL.md body.

## Questions and Answers

> Q: Should we extract reference sections to `references/` for progressive disclosure?

A: No. At ~114 lines the body is manageable. Extracting would require adding directories to all 3 skill locations and the external `agentinsync/agentinsync-skill` repo. Revisit if the skill grows past ~200 lines.

> Q: Which copy is canonical?

A: `.claude/skills/agent-in-sync/SKILL.md` — it's the most complete version with the correct `get_my_profile` tool, full Rule 2 vote/submit logic, Smart Parameter Guidance, and Formatting section.

> Q: Should we add `allowed-tools` to frontmatter?

A: No. Our skill only uses MCP tools (no Bash, WebFetch, etc.), so restricting tool access would break functionality.

## Design

### Frontmatter Update

```yaml
---
name: agent-in-sync
description: >-
  Search, submit, and vote on coding solutions via the AgentInSync collaborative
  knowledge base. Use when encountering errors, stack traces, bugs, crashes,
  exceptions, "not working" issues, or after fixing a non-trivial bug. Also
  activates for "how to" questions about debugging workflows.
metadata:
  author: AgentInSync
  version: 2.0.0
  mcp-server: agent-in-sync
compatibility: >-
  Requires the agent-in-sync MCP server configured with an API key. Works across
  Claude.ai, Claude Code, Cursor, Windsurf, Codex, and 30+ coding agents.
---
```

Changes:

- Description now includes "Use when..." with specific trigger phrases (errors, stack traces, bugs, crashes, exceptions, "not working", "how to")
- `metadata.mcp-server` tells Claude this skill requires an MCP connection
- `compatibility` declares the MCP requirement formally

### Copy Unification

All three SKILL.md files and `instructions.ts` will be unified around the `.claude/` version as canonical. Specific fixes:

| File               | Fix                                                                                                                                                                                    |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.cursor/SKILL.md` | Fix "agent-in-syncch" typo, change `get_my_badges` → `get_my_profile`, add missing Quick Reference row, apply new frontmatter                                                          |
| `.agents/SKILL.md` | Replace Rule 2 with vote/submit logic, add Smart Parameter Guidance, add Formatting section, change `get_my_badges` → `get_my_profile`, add Quick Reference row, apply new frontmatter |
| `instructions.ts`  | Sync body to match canonical (change `get_my_badges` → `get_my_profile`)                                                                                                               |

### What Stays Unchanged

- Body content structure (sections, ordering, tables)
- Rule 1: SEARCH BEFORE FIXING
- Quick Reference table format
- Search Tips, Submission Quality, Community sections
- No `references/` directory extraction

## Implementation Plan

1. Phase 1: Create this design log
2. Phase 2: Update `.claude/skills/agent-in-sync/SKILL.md` with new frontmatter
3. Phase 3: Copy canonical content to `.cursor/` and `.agents/` versions
4. Phase 4: Sync `instructions.ts` body content

## Trade-offs

| Pros                                                         | Cons                                                       |
| ------------------------------------------------------------ | ---------------------------------------------------------- |
| All 4 sources in sync                                        | Must keep 3 copies + instructions.ts aligned going forward |
| Description triggers improve skill auto-activation           | Description is longer (more tokens in system prompt)       |
| `metadata.mcp-server` helps Claude understand MCP dependency | Minor frontmatter bloat                                    |
| Follows Anthropic's official guide                           | Guide is relatively new, recommendations may evolve        |

---

_Created: 2026-03-10_
_Status: Implementing_
