# Design Log #030: Unified CLI Setup Command

## Background

The CLI had two separate commands: `setup` (auth + MCP config) and `install` (skills + rules). After running `setup`, the CLI printed "Next step: agent-in-sync install" — requiring users to run a second command to complete the configuration. This two-step flow added friction, especially for first-time users.

Design Log #029 introduced the `install` command for skills and rules. This design merges the install step into `setup` so one command does everything per agent.

## Problem

1. **Two commands for first-time setup**: Users had to run `setup` then `install` — easy to miss the second step.
2. **Process hangs after completion**: The Node.js process didn't exit cleanly due to lingering handles (auth timeout timer, inquirer readline).
3. **`resolveContentRoot()` duplicated**: The content root resolution logic was inline in `install.ts` and not reusable.

## Design

### Unified `setup` flow

```
agent-in-sync setup

Step 1: Authentication (browser OAuth → API key)
Step 2: Per-agent configuration
  - Write MCP config (mcp.json or `claude mcp add`)
  - Install skills (copy SKILL.md to agent's skills dir)
  - Install rules (transform RULE.md to agent's rules format)
```

### Key decisions

- **`install` command kept** as a standalone re-run shortcut (no auth needed). Useful for updating content after CLI upgrade.
- **Shared `resolveContentRoot()`** in `discover.ts` — checks for bundled `content/` dir (npm publish) first, falls back to CWD (dev).
- **`process.exit()`** at the end of both `setup` and `install` to prevent hanging.
- **SIGINT handler** in `index.ts` for clean Ctrl+C at any point.
- **Auth timeout `.unref()`** so the 5-minute timer doesn't prevent natural exit.
- **Exit code 1** if any agent failed MCP config, **0** on full success.

### Output grouped per agent

```
  Cursor:
    ✔ MCP config → ~/.cursor/mcp.json
    ✔ Skill: agent-in-sync → .cursor/skills/agent-in-sync/SKILL.md
    ✔ Rule: agent-in-sync-workflow → .cursor/rules/agent-in-sync-workflow.mdc

  Claude Code:
    ✔ MCP config → claude mcp add ...
    ✔ Skill: agent-in-sync → .claude/skills/agent-in-sync/SKILL.md
    ✔ Rule: agent-in-sync-workflow → .claude/rules/agent-in-sync-workflow.md
```

## Implementation Plan

1. Extract `resolveContentRoot()` to `packages/cli/src/utils/discover.ts`
2. Update `setup.ts` to call `discoverSkills`/`discoverRules` + `installSkill`/`installRule` per agent
3. Update `install.ts` to import shared `resolveContentRoot()`, remove inline copy
4. Add `process.exit()` to both commands, SIGINT handler to `index.ts`
5. Fix auth timeout with `.unref()`

## Trade-offs

| Pros                                                       | Cons                                                              |
| ---------------------------------------------------------- | ----------------------------------------------------------------- |
| Single command for complete first-time setup               | Setup now takes slightly longer (content discovery + file writes) |
| Clean process exit, no hangs                               | `process.exit()` bypasses cleanup — acceptable for a CLI          |
| `install` still available for re-runs                      | Two commands can install content (minor overlap)                  |
| Content root resolution works for both dev and npm publish | —                                                                 |

## Implementation Results

All changes implemented in a single pass:

- `packages/cli/src/utils/discover.ts` — added `resolveContentRoot()` with bundled/CWD fallback
- `packages/cli/src/commands/setup.ts` — merged install logic into per-agent loop, grouped output
- `packages/cli/src/commands/install.ts` — uses shared `resolveContentRoot()`, added `process.exit(0)`
- `packages/cli/src/index.ts` — SIGINT handler
- `packages/cli/src/utils/auth.ts` — `timeout.unref()`

Typecheck: passing. No deviations from design.

---

_Created: 2026-02-17_
_Status: Implemented_
