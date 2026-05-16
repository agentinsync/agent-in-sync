# Design Log #044: Slim Down Rule to Skill Pointer

## Background

Research into Codex's MCP/skills/rules setup revealed that our rule (RULE.md) is a redundant subset of our skill (SKILL.md). Both contain the same search-before-fixing workflow at different lengths. The rule (55 lines) gets injected into always-on context (AGENTS.md for Codex/Warp, `.claude/rules/` for Claude Code, etc.), while the skill (142 lines) is loaded on-demand when the agent detects an error/bug task.

This wastes always-on context budget and creates a maintenance burden (design log 043 showed every content change must be synced across both).

## Problem

1. **Wasted context budget**: The 55-line rule repeats workflow details that are already in the skill. Always-on context is premium real estate — especially in Codex (32KB AGENTS.md budget) and Claude Code (rules are always loaded).
2. **Maintenance burden**: Every workflow change (like the trivial fix exemption in #043) must be applied to both RULE.md and SKILL.md, risking drift.
3. **Redundant instruction**: When a trigger fires, the agent loads both the rule AND the skill, getting duplicate (and potentially conflicting) instructions.

## Questions and Answers

> Q: Will agents still activate the skill if the rule is just a pointer?

A: Yes. All 10 supported agents have both `skillsDir` and `rulesDir`. The rule's job is to prime the agent with trigger patterns. When a trigger matches, the agent loads the full skill. The pointer just needs to list the triggers and summarize the expected behavior.

> Q: What if the skill fails to load — does the agent lose all workflow guidance?

A: The pointer still contains the core workflow summary (search first, vote/submit after). It's enough for an agent to follow the pattern even without the full skill. The skill adds detail and examples, but the rule's summary is self-contained for the happy path.

> Q: Do rule adapters need changes?

A: No. Adapters process the frontmatter + body of RULE.md. A shorter body works identically — the format is unchanged.

## Design

Replace the 55-line RULE.md with a ~15-line pointer that:

1. Tells the agent it has the `agent-in-sync` skill available
2. Lists the mandatory triggers (same keywords as before)
3. Provides a 3-step summary: search → fix → vote/submit
4. Mentions the trivial fix exemption in one line

The skill (SKILL.md) remains unchanged — it's the source of truth for the full workflow.

## Implementation Plan

1. Rewrite `rules/agent-in-sync-workflow/RULE.md` with slim pointer content
2. Verify adapters still produce valid output for each format
3. Run lint/format checks

## Trade-offs

| Aspect              | Before                          | After                                             |
| ------------------- | ------------------------------- | ------------------------------------------------- |
| Always-on context   | 55 lines of workflow detail     | ~15 lines, pointer only                           |
| Maintenance         | Must sync changes to both files | Single source of truth (SKILL.md)                 |
| Standalone guidance | Rule is self-contained          | Rule has summary, skill has detail                |
| Risk                | Drift between rule and skill    | Agent might not load skill (mitigated by summary) |
