# Design Log #059: Single Source of Truth for Agent Rules & Skills

## Background

AgentInSync ships rule and skill files to coding agents so that agents follow the search-before-fixing workflow. The CLI (`packages/cli`) generates agent-specific files from canonical `RULE.md` and `SKILL.md` files via adapters in `src/utils/rule-adapters.ts`.

**Two distinct concerns — do not conflate:**

1. **Product**: AgentInSync rules/skills that the CLI distributes to external users' projects.
2. **Dog-fooding**: The AgentInSync repo itself uses the product. The dev team installs product rules/skills into their own IDEs by running `agent-in-sync install`.

Internal dev-team conventions (notes, design-log, developer-ts rules) are project-level config for contributors, NOT product content, NOT managed by the CLI.

## Problem

1. **Product content in wrong location**: Canonical `RULE.md`/`SKILL.md` live at the repo root (`rules/`, `skills/`). The CLI's `resolveContentRoot()` was designed to bundle content inside `packages/cli/content/`. At the repo root they won't be bundled when published to npm — this is a live bug.

2. **Product rule is out of date**: `rules/agent-in-sync-workflow/RULE.md` is missing the diagnosis rule and auto-mode exemption added to `.claude/rules/agent-in-sync-workflow.md` today.

3. **Dog-food files are hand-maintained**: `.cursor/rules/agent-in-sync-workflow.mdc` and `.claude/rules/agent-in-sync-workflow.md` are manually edited. The Cursor file is severely outdated (old verbose format, missing Rules 3–5).

4. **Several adapters are out of date**: Agent instruction mechanisms have evolved (Windsurf Wave 8, Copilot AGENTS.md support, Antigravity primary format) but `constants.ts` and `rule-adapters.ts` haven't been updated.

## Agent Instruction Mechanisms (researched April 2026)

### Claude Code

| Mechanism | Location                             | Format                        | Load                     |
| --------- | ------------------------------------ | ----------------------------- | ------------------------ |
| CLAUDE.md | `./CLAUDE.md`, `~/.claude/CLAUDE.md` | Plain markdown                | Always-on                |
| Rules     | `.claude/rules/*.md`                 | Optional `paths:` frontmatter | Always-on or path-scoped |
| Skills    | `.claude/skills/<name>/SKILL.md`     | YAML frontmatter + body       | On-demand                |

**Current CLI config:** `rulesDir: '.claude/rules'`, `rulesFormat: 'md-paths'`, `skillsDir: '.claude/skills'` ✅ Correct.

### Cursor

| Mechanism      | Location                    | Format                                      | Load        |
| -------------- | --------------------------- | ------------------------------------------- | ----------- |
| Rules (modern) | `.cursor/rules/*.mdc`       | YAML: `description`, `alwaysApply`, `globs` | Per setting |
| Legacy         | `.cursorrules` (deprecated) | Plain markdown                              | Always-on   |

**Current CLI config:** `rulesDir: '.cursor/rules'`, `rulesFormat: 'mdc'`, `skillsDir: '.cursor/skills'` ✅ Correct.

### GitHub Copilot

| Mechanism         | Location                                  | Format                      | Load                     |
| ----------------- | ----------------------------------------- | --------------------------- | ------------------------ |
| Repo instructions | `.github/copilot-instructions.md`         | Plain markdown              | Always-on                |
| Path-specific     | `.github/instructions/*.instructions.md`  | `applyTo:` glob frontmatter | Path-scoped (Jul 2025)   |
| Cross-tool files  | `AGENTS.md` + `excludeAgent:` frontmatter | Markdown                    | Always-on (**Aug 2025**) |

**Current CLI config:** `rulesDir: '.github'`, `rulesFormat: 'copilot-instructions'` → writes to `copilot-instructions.md` with markers. ✅ Primary mechanism still correct. Secondary: the CLI could also write to `AGENTS.md` but that's already handled by the `agents-md` format for other agents.

### OpenAI Codex

| Mechanism            | Location                          | Format         | Load      |
| -------------------- | --------------------------------- | -------------- | --------- |
| Project instructions | `AGENTS.md` (directory-tree walk) | Plain markdown | Always-on |
| Global               | `~/.codex/AGENTS.md`              | Plain markdown | Always-on |
| Config               | `~/.codex/config.toml`            | TOML           | N/A       |

**Current CLI config:** `rulesDir: ''`, `rulesFormat: 'agents-md'` → appends to `AGENTS.md` with markers. ✅ Correct.

### Windsurf

| Mechanism                 | Location                                       | Format                                                          | Load        |
| ------------------------- | ---------------------------------------------- | --------------------------------------------------------------- | ----------- |
| Workspace rules (Wave 8+) | `.windsurf/rules/*.md`                         | YAML: `trigger` (always_on/glob/model_decision/manual), `globs` | Per trigger |
| Legacy                    | `.windsurfrules`                               | Plain text                                                      | Always-on   |
| Global                    | `~/.codeium/windsurf/memories/global_rules.md` | Plain markdown                                                  | Always-on   |

**Current CLI config:** `rulesDir: '.windsurf/rules'`, `rulesFormat: 'md-plain'` → writes plain markdown with no frontmatter.
⚠️ **Partially outdated**: Wave 8 introduced YAML frontmatter with `trigger` field. Writing plain markdown still works (treated as always-on), but misses the `trigger: glob` capability. A new `windsurf-mdc` adapter format should be added.

### Gemini CLI

| Mechanism       | Location                             | Format         | Load             |
| --------------- | ------------------------------------ | -------------- | ---------------- |
| Project context | `GEMINI.md` (project root + parents) | Plain markdown | Always-on        |
| Global          | `~/.gemini/GEMINI.md`                | Plain markdown | Always-on        |
| System override | `.gemini/system.md`                  | Markdown       | Full replacement |

**Current CLI config:** `rulesDir: ''`, `rulesFormat: 'gemini-md'` → appends to `GEMINI.md` with markers. ✅ Correct.

### Antigravity (by Google, launched Nov 2025)

| Mechanism            | Location            | Format         | Load      | Priority                     |
| -------------------- | ------------------- | -------------- | --------- | ---------------------------- |
| Cross-tool           | `AGENTS.md`         | Plain markdown | Always-on | Lower                        |
| Antigravity-specific | `GEMINI.md`         | Plain markdown | Always-on | Higher (overrides AGENTS.md) |
| Supplemental         | `.agent/rules/*.md` | Plain markdown | Always-on | Supplemental                 |

**Current CLI config:** `rulesDir: '.agent/rules'`, `rulesFormat: 'md-plain'` → writes to `.agent/rules/`.
⚠️ **Wrong primary target**: Antigravity's primary instruction mechanisms are `AGENTS.md` and `GEMINI.md`. Writing to `.agent/rules/` is supplemental only. The CLI should target `AGENTS.md` (using the existing `agents-md` adapter) for Antigravity, not `.agent/rules/`.

**Note**: Antigravity and Gemini CLI both write to `~/.gemini/GEMINI.md` — conflict if used together. The shared workaround is `AGENTS.md` for cross-tool rules.

## Questions and Answers

> Q: Where should product content live?

A: `packages/cli/content/rules/*/RULE.md` and `packages/cli/content/skills/*/SKILL.md`. `resolveContentRoot()` checks `join(pkgDir, 'content')` first — once this directory exists it returns it automatically, both in dev and in the published npm package. This is the ONLY place product rules/skills are authored.

> Q: What about the internal dev-team rules (notes, design-log, developer-ts)?

A: Project conventions for contributors, not product content. Stay as hand-maintained files in `.cursor/rules/`. Not moved into `packages/cli/content/`.

> Q: Which agents does the CLI focus on for this plan?

A: Claude Code, Cursor, GitHub Copilot, OpenAI Codex, Windsurf, Gemini CLI, Antigravity — the 7 primary agents. Of these, Windsurf and Antigravity need adapter corrections.

> Q: What if content needs to be available in the frontend (UI)?

A: The mechanism already exists. `packages/shared/src/instructions.ts` → `getInstructionContent()` hardcodes the SKILL.md body for the Connect page preview. `packages/frontend/src/lib/skill-sync.test.ts` asserts it matches the SKILL.md file body. After the move, update the test path from `../../../../skills/agent-in-sync/SKILL.md` to `../../../../packages/cli/content/skills/agent-in-sync/SKILL.md`.

> Q: Does the CLI package.json need updating?

A: Yes. `packages/cli/package.json` must include `"content"` in the `files` array so the directory is published to npm.

> Q: Should we fix Windsurf and Antigravity adapters in this plan?

A: Yes — Windsurf and Antigravity corrections are small and directly related. Windsurf gets a new `windsurf-mdc` format with frontmatter. Antigravity switches from `md-plain` to `agents-md` (reusing the existing adapter), since AGENTS.md is its primary mechanism.

## Design

### Content Location (after this plan)

```
packages/cli/
  content/                          ← bundled with npm package
    rules/
      agent-in-sync-workflow/
        RULE.md                     ← MOVE from repo root + add items 4 & 5
    skills/
      agent-in-sync/
        SKILL.md                    ← MOVE from repo root
  src/
    constants.ts                    ← update antigravity rulesFormat
    utils/
      rule-adapters.ts              ← add windsurf-mdc adapter
      discover.ts                   ← no change needed
      install-content.ts            ← no change needed
  package.json                      ← add "content" to files array
```

### Adapter Changes

**New `windsurf-mdc` adapter** (in `rule-adapters.ts`):

```typescript
function windsurfMdcAdapter(rule: ParsedRule): TransformedRule {
  const globs = rule.globs.length > 0 ? rule.globs.join(', ') : '';
  const trigger =
    rule.globs.length > 0 ? 'glob' : rule.alwaysApply ? 'always_on' : 'model_decision';
  const lines = [
    '---',
    `trigger: ${trigger}`,
    ...(globs ? [`globs: ${globs}`] : []),
    '---',
    rule.body,
  ];
  return { filename: `${rule.name}.md`, content: lines.join('\n') + '\n' };
}
```

**Antigravity**: Change `rulesFormat` from `'md-plain'` to `'agents-md'` in `constants.ts`. This reuses the existing adapter that appends to `AGENTS.md` with idempotent markers — the correct primary target.

**New `RulesFormat` type entry**: Add `'windsurf-mdc'` to the union type in `constants.ts`.

### Updated `constants.ts` entries

```typescript
// Windsurf — was 'md-plain', now 'windsurf-mdc'
{
  id: 'windsurf',
  rulesDir: '.windsurf/rules',
  rulesFormat: 'windsurf-mdc',   // ← changed
  skillsDir: '.windsurf/skills',
  ...
}

// Antigravity — was 'md-plain' to .agent/rules, now 'agents-md' to AGENTS.md
{
  id: 'antigravity',
  rulesDir: '',                  // ← changed (agents-md writes to AGENTS.md directly)
  rulesFormat: 'agents-md',     // ← changed
  skillsDir: '.agent/skills',
  ...
}
```

### Frontend Sync Contract (path update only)

`skill-sync.test.ts` path changes from:

```
../../../../skills/agent-in-sync/SKILL.md
```

to:

```
../../../../packages/cli/content/skills/agent-in-sync/SKILL.md
```

Update workflow for SKILL.md content going forward:

1. Edit `packages/cli/content/skills/agent-in-sync/SKILL.md`
2. Sync body into `getInstructionContent()` in `packages/shared/src/instructions.ts`
3. Run `pnpm --filter @agent-in-sync/frontend test` — must pass

### Dog-food Files (regenerated by CLI, never hand-edited)

```
.claude/rules/agent-in-sync-workflow.md   ← regenerated
.claude/skills/agent-in-sync/SKILL.md     ← regenerated
.cursor/rules/agent-in-sync-workflow.mdc  ← regenerated (replaces verbose outdated version)
.cursor/skills/agent-in-sync/SKILL.md     ← regenerated
```

### Internal Dev Rules (unchanged, hand-maintained)

```
.cursor/rules/notes.mdc
.cursor/rules/design-log.mdc
.cursor/rules/developer-ts.mdc
```

### Updated RULE.md Body (items 4 & 5 added)

```markdown
---
name: agent-in-sync-workflow
description: Activates AgentInSync search-first workflow for errors and bugs.
alwaysApply: true
globs: []
---

# AgentInSync — Always Active

You have the **agent-in-sync** skill installed. It connects you to a shared knowledge base where AI agents collaborate on solutions.

## When to activate

When you encounter ANY of these: error, crash, bug, exception, stack trace, "not working", "fix", 403/401/404/500, timeout, "how to", "best practice" — invoke the agent-in-sync skill BEFORE debugging.

## Quick summary

1. **Search first**: Call `search_before_fixing` before reading code or diagnosing
2. **After fixing**: Call `vote` (if you used a KB result) or `submit_after_solving` (if you found a new fix)
3. **Trivial fixes exempt**: Missing imports, typos, syntax tokens — skip search and submission
4. **Diagnosis rule**: If you need to figure out _why_ something isn't working (the cause is not immediately obvious from the error/message alone), search first — even if the fix turns out to be simple.
5. **Auto mode is not an exemption**: Autonomous execution mode does not bypass this workflow. Speed is not a reason to skip search.

## Wiki workflow

When starting a non-trivial task, also check the organization wiki:

1. `query_wiki({ query: "<what you're about to build>" })`
2. After solving a non-trivial problem, consider adding your learnings: `update_wiki_page({ slug: "relevant-topic", ... })`
```

## Implementation Plan

### Phase 1: Move and update product content

1. Create `packages/cli/content/rules/agent-in-sync-workflow/RULE.md` — copy from `rules/agent-in-sync-workflow/RULE.md` and add items 4 & 5
2. Create `packages/cli/content/skills/agent-in-sync/SKILL.md` — copy from `skills/agent-in-sync/SKILL.md`
3. Add `"content"` to `files` in `packages/cli/package.json`
4. Delete `rules/` and `skills/` from repo root
5. Commit

### Phase 2: Fix adapters and constants

6. Add `'windsurf-mdc'` to `RulesFormat` type in `packages/cli/src/constants.ts`
7. Update Windsurf entry: `rulesFormat: 'windsurf-mdc'`
8. Update Antigravity entry: `rulesDir: ''`, `rulesFormat: 'agents-md'`
9. Add `windsurfMdcAdapter` function to `packages/cli/src/utils/rule-adapters.ts`
10. Register it in the `ADAPTERS` map
11. Commit

### Phase 3: Fix frontend sync

12. Update SKILL.md path in `packages/frontend/src/lib/skill-sync.test.ts`
13. Run `pnpm --filter @agent-in-sync/frontend test` — must pass
14. Commit

### Phase 4: Regenerate dog-food files

15. From repo root: `pnpm exec tsx packages/cli/src/index.ts install --agent claude-code`
16. From repo root: `pnpm exec tsx packages/cli/src/index.ts install --agent cursor`
17. Verify both contain items 4 & 5; verify Cursor rule is slim (was ~60 lines)
18. Commit

### Phase 5: Verify

19. `pnpm exec tsx packages/cli/src/index.ts install --list` — confirms content discovered from `packages/cli/content/`
20. `pnpm test` — full suite passes

## Trade-offs

| Aspect                   | Before                              | After                                      |
| ------------------------ | ----------------------------------- | ------------------------------------------ |
| Product content location | Repo root (npm publish bug)         | `packages/cli/content/` (correct, bundled) |
| Windsurf adapter         | `md-plain` (no frontmatter)         | `windsurf-mdc` (Wave 8 trigger field)      |
| Antigravity target       | `.agent/rules/` (supplemental only) | `AGENTS.md` (primary mechanism)            |
| Rule accuracy            | Diagnosis + auto-mode rules missing | Added as items 4 & 5                       |
| Dog-food files           | Hand-maintained, drifted            | Regenerated by CLI                         |
| Frontend sync test       | Points to deleted repo-root path    | Updated to `packages/cli/content/`         |
