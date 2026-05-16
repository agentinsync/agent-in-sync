# Design Log #029: CLI Install Command for Skills & Rules

## Background

Design Log #024 migrated from custom per-IDE instruction files to the Agent Skills standard (`SKILL.md`). That design delegated skill installation to the third-party `npx skills add` CLI. The current `agent-in-sync` CLI has two commands: `setup` (MCP auth + config) and `config` (write/print MCP config). After setup, users are told to run `npx skills add agentinsync/agentinsync-skill`.

However, skills alone only cover behavioral instructions. **Rules** — persistent coding conventions, project standards, and workflow directives — are a separate concept supported natively by most agents. Today our rule content lives only in `.cursor/rules/agent-in-sync-workflow.mdc`, invisible to every other agent.

## Problem

1. **Rules are Cursor-only**: The `agent-in-sync-workflow` rule (search-before-fixing mandate) only reaches Cursor users. Claude Code, Cline, Windsurf, Roo Code, Codex, and Copilot users never get it.
2. **External dependency for skills**: Requiring users to install a separate CLI (`npx skills add`) adds friction and a third-party dependency.
3. **Content is scattered**: Skills live in `skills/` and `.agents/skills/`, rules live in `.cursor/rules/`. No single canonical location.
4. **No universal rule format**: Each agent has a different rules format (`.mdc`, `.md` with `paths`, plain `.md`, `AGENTS.md` sections). There's no standard like SKILL.md for rules.

## Questions and Answers

> Q: Should this be a general-purpose CLI (like vercel-labs/skills) or AgentInSync-specific?

A: AgentInSync-specific. We extend the existing `agent-in-sync` CLI to install **our own** skills and rules. Not a generic tool.

> Q: Where should canonical content live?

A: Top-level `skills/` and `rules/` directories at the repo root. These are the source of truth.

> Q: Should the install be multi-select (pick many agents) or single-select?

A: Single-select with arrow-key navigation. Pick one agent, install both skills and rules. Run again for another agent. Keeps the UX simple.

> Q: Should users be able to install only skills or only rules?

A: No. Always install both. Fewer options = less confusion.

> Q: How do we handle agents that use AGENTS.md instead of a rules directory?

A: Append rule content between idempotent markers (`<!-- agent-in-sync:start:{name} -->` / `<!-- agent-in-sync:end:{name} -->`). If markers already exist, replace the content between them.

> Q: What about the existing `.cursor/rules/agent-in-sync-workflow.mdc` in the repo?

A: It stays as a consumer of the canonical `rules/agent-in-sync-workflow/RULE.md`. The install command writes it; developers can also manually copy. Long-term, running `agent-in-sync install --agent cursor` in the repo itself produces the same file.

## Design

### Canonical Content Structure

```
skills/
  agent-in-sync/
    SKILL.md              # already exists

rules/
  agent-in-sync-workflow/
    RULE.md               # new — universal format
```

### RULE.md Format

A new universal, agent-agnostic format with YAML frontmatter:

```yaml
---
name: agent-in-sync-workflow
description: Mandatory error workflow for AgentInSync
alwaysApply: true
globs: []
---
# AgentInSync — Mandatory Error Workflow

## BEFORE fixing any error, bug, or issue:
...
```

Fields:

- `name` (string, required) — unique identifier
- `description` (string, required) — what the rule does
- `alwaysApply` (boolean, default `false`) — applies to every context vs. only matching files
- `globs` (string[], default `[]`) — file patterns for conditional activation

### Agent Rules Mapping

The CLI translates `RULE.md` to each agent's native format:

| Agent          | Output Path                 | Format                                                     |
| -------------- | --------------------------- | ---------------------------------------------------------- |
| Cursor         | `.cursor/rules/{name}.mdc`  | MDC with `description`, `globs`, `alwaysApply` frontmatter |
| Claude Code    | `.claude/rules/{name}.md`   | MD with optional `paths` frontmatter (from globs)          |
| Cline          | `.clinerules/{name}.md`     | MD with optional `paths` frontmatter (from globs)          |
| Windsurf       | `.windsurf/rules/{name}.md` | Plain MD (no frontmatter)                                  |
| Roo Code       | `.roo/rules/{name}.md`      | Plain MD                                                   |
| Codex          | `AGENTS.md`                 | Append between markers                                     |
| GitHub Copilot | `AGENTS.md`                 | Append between markers                                     |

### Agent Skills Mapping

Skills use SKILL.md (standard format), copied as-is:

| Agent                                       | Output Path                        |
| ------------------------------------------- | ---------------------------------- |
| Cursor                                      | `.cursor/skills/{name}/SKILL.md`   |
| Claude Code                                 | `.claude/skills/{name}/SKILL.md`   |
| Cline                                       | `.cline/skills/{name}/SKILL.md`    |
| Windsurf                                    | `.windsurf/skills/{name}/SKILL.md` |
| Roo Code                                    | `.roo/skills/{name}/SKILL.md`      |
| Universal (Codex, Copilot, Amp, Gemini CLI) | `.agents/skills/{name}/SKILL.md`   |

### CLI UX — Interactive Single-Select

```
$ agent-in-sync install

  Detecting installed agents... ✔ Found 4 agents

  ? Select an agent to install to: (Use arrow keys)
  ❯ Cursor
    Claude Code
    Cline
    Windsurf

  Installing skills & rules to Cursor...
    ✔ Skill: agent-in-sync → .cursor/skills/agent-in-sync/SKILL.md
    ✔ Rule: agent-in-sync-workflow → .cursor/rules/agent-in-sync-workflow.mdc

  Done! Restart Cursor to load the new configuration.
```

Non-interactive: `agent-in-sync install --agent cursor`
Dry run: `agent-in-sync install --list`

### Rule Adapter Interface

```typescript
interface RuleAdapter {
  agentId: string;
  rulesDir(projectRoot: string): string;
  transformRule(rule: ParsedRule): { filename: string; content: string };
}

interface ParsedRule {
  name: string;
  description: string;
  alwaysApply: boolean;
  globs: string[];
  body: string;
}
```

Example adapter output for Cursor:

```
---
description: Mandatory error workflow for AgentInSync
globs:
alwaysApply: true
---
# AgentInSync — Mandatory Error Workflow
...
```

Example adapter output for Claude Code:

```
---
paths: src/**/*.ts
---
# AgentInSync — Mandatory Error Workflow
...
```

(Omits `paths` frontmatter when `globs` is empty, meaning the rule applies globally.)

Example adapter output for AGENTS.md agents:

```markdown
<!-- agent-in-sync:start:agent-in-sync-workflow -->

# AgentInSync — Mandatory Error Workflow

...

<!-- agent-in-sync:end:agent-in-sync-workflow -->
```

### Expanded Agent Config

Extend `packages/cli/src/constants.ts` — add skills/rules paths per agent:

```typescript
type AgentType =
  | 'cursor'
  | 'claude-code'
  | 'windsurf'
  | 'cline'
  | 'roo-code'
  | 'codex'
  | 'github-copilot';

interface AgentConfig {
  id: AgentType;
  name: string;
  configPath: string; // MCP config (existing)
  configFileName: string; // MCP config file (existing)
  usesCliSetup?: boolean; // existing
  skillsDir: string; // NEW — project-relative skills path
  rulesDir: string; // NEW — project-relative rules path
  rulesFormat: 'mdc' | 'md-paths' | 'md-plain' | 'agents-md'; // NEW
}
```

### Detection Expansion

Extend `detect.ts` to check for new agents:

| Agent          | Detection                                                  |
| -------------- | ---------------------------------------------------------- |
| Cline          | `~/.vscode/extensions/saoudrizwan.claude-dev-*` exists     |
| Roo Code       | `~/.vscode/extensions/rooveterinaryinc.roo-cline-*` exists |
| Codex          | `which codex` in PATH                                      |
| GitHub Copilot | `~/.vscode/extensions/github.copilot-*` exists             |

### Install Flow

```
1. Discover SKILL.md files from skills/
2. Discover RULE.md files from rules/
3. Parse frontmatter with gray-matter
4. Detect installed agents
5. If --list: print what would be installed and exit
6. If --agent: use specified agent (skip prompt)
7. Otherwise: inquirer list prompt (arrow keys, single-select)
8. For the selected agent:
   a. mkdir -p agent's skills dir → copy each SKILL.md
   b. Get the agent's rule adapter → transform each RULE.md → write to agent's rules dir
9. Print per-file results with spinners
```

## Implementation Plan

### Phase 1: Canonical Content

- Create `rules/agent-in-sync-workflow/RULE.md` by converting `.cursor/rules/agent-in-sync-workflow.mdc` to the universal format
- Verify `skills/agent-in-sync/SKILL.md` exists (it does)

### Phase 2: Expand Agent Config

- Add new agents (Cline, Roo Code, Codex, GitHub Copilot) to `constants.ts`
- Add `skillsDir`, `rulesDir`, `rulesFormat` to `AgentConfig`
- Expand detection in `detect.ts`

### Phase 3: Content Discovery

- Create `packages/cli/src/utils/discover.ts`
- Parse `skills/*/SKILL.md` and `rules/*/RULE.md` with `gray-matter`
- Return typed arrays of `ParsedSkill` and `ParsedRule`

### Phase 4: Rule Adapters

- Create `packages/cli/src/utils/rule-adapters.ts`
- Implement adapters: `CursorAdapter` (`.mdc`), `ClaudeCodeAdapter` (`.md` + paths), `ClineAdapter` (`.md` + paths), `WindsurfAdapter` (plain `.md`), `RooCodeAdapter` (plain `.md`), `AgentsMdAdapter` (marker-based append)
- Map each `rulesFormat` to an adapter

### Phase 5: Install Logic

- Create `packages/cli/src/utils/install-content.ts`
- `installSkill(skill, agent, projectRoot)` — mkdir + copy SKILL.md
- `installRule(rule, agent, projectRoot)` — transform via adapter + write
- Handle `AGENTS.md` marker-based idempotent updates

### Phase 6: Install Command

- Create `packages/cli/src/commands/install.ts`
- Options: `--agent <id>`, `--list`
- Interactive: detect agents → inquirer `list` prompt → install → summary
- Register in `index.ts`

### Phase 7: Integration

- Add `gray-matter` dependency
- Update `setup.ts` success message: suggest `agent-in-sync install` instead of `npx skills add`

## Examples

✅ Interactive install to Cursor:

```
$ agent-in-sync install
  ? Select an agent to install to: Cursor
  ✔ Skill: agent-in-sync → .cursor/skills/agent-in-sync/SKILL.md
  ✔ Rule: agent-in-sync-workflow → .cursor/rules/agent-in-sync-workflow.mdc
```

✅ Non-interactive install:

```
$ agent-in-sync install --agent claude-code
  ✔ Skill: agent-in-sync → .claude/skills/agent-in-sync/SKILL.md
  ✔ Rule: agent-in-sync-workflow → .claude/rules/agent-in-sync-workflow.md
```

✅ Dry run:

```
$ agent-in-sync install --list
  Skills:
    agent-in-sync — Search, submit, and vote on coding solutions...

  Rules:
    agent-in-sync-workflow — Mandatory error workflow for AgentInSync

  Detected agents: Cursor, Claude Code, Windsurf
```

✅ AGENTS.md idempotent update (Codex):

```markdown
# AGENTS.md

Existing project content...

<!-- agent-in-sync:start:agent-in-sync-workflow -->

# AgentInSync — Mandatory Error Workflow

...

<!-- agent-in-sync:end:agent-in-sync-workflow -->
```

Running install again replaces content between markers without duplicating.

❌ Old approach (no longer needed):

```bash
npx skills add agentinsync/agentinsync-skill  # external dependency
```

## Trade-offs

| Pros                                                | Cons                                                                 |
| --------------------------------------------------- | -------------------------------------------------------------------- |
| One CLI installs both skills and rules to any agent | Must maintain rule adapters for 4 formats                            |
| Rules reach all agents, not just Cursor             | New RULE.md format is non-standard (no community spec like SKILL.md) |
| No external CLI dependency                          | Single-select means running multiple times for multiple agents       |
| Simple interactive UX (arrow keys, one choice)      | New dependency: gray-matter                                          |
| Canonical content in one place (top-level dirs)     | AGENTS.md marker approach is fragile if users edit markers           |
| Idempotent — safe to re-run                         | —                                                                    |

---

_Created: 2026-02-17_
_Status: Draft_
