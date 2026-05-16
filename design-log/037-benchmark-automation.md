# Design Log #037: Benchmark Automation — Claude Code CLI + Worktrees

## Background

Design log #033 defined the benchmark protocol and #036 expanded it with microservices scenarios. Both assumed the benchmark would be run manually: apply patch → open Claude Code UI → paste prompt → record `/cost` → repeat 78 times (13 bugs × 6 runs each).

78 manual sessions is prohibitive. Even running 2 bugs per day, that's 39 days to collect data. The benchmark needs to be automated so the full 78-run cycle can execute overnight.

Claude Code exposes exactly the right primitives:

- `claude -p "prompt" --output-format json` — non-interactive session with machine-readable output including token counts
- `claude --resume <session-id>` — continue a previous session (used to submit the solution in the same session context where the fix was found)
- `--strict-mcp-config --mcp-config <file>` — override which MCP servers are active for a single run (no-AIS vs AIS)
- Git worktrees — isolated copy of the repo per run, so patches don't contaminate each other or the main working tree

## Problem

### 1. Disabling/enabling AIS between runs

The benchmark has two conditions:

- **without_ais**: No MCP server, no skill instructions (agent debugs from scratch)
- **with_ais**: MCP active, `search_before_fixing` available, rules injected

Two things must be toggled:

1. The **MCP server** — controls whether `search_before_fixing` tool exists
2. The **rules/skills** in `.claude/` — controls whether the "search first" instruction appears in the system prompt

For (1): `--strict-mcp-config --mcp-config benchmark/empty-mcp.json` is a clean per-run override that doesn't modify any global config.

For (2): There is no `--no-rules` flag. The solution is to run in a **git worktree** where we can safely modify the `.claude/` directory (rename rule/skill files) without touching the main working tree.

### 2. Resuming the no-AIS session for solution submission

The submit step must happen in the **same session** as the fix — the agent has context about what it changed. This means:

1. Capture the session ID from the no-AIS run (`jq '.session_id'`)
2. Enable MCP (no `--strict-mcp-config`)
3. `claude --resume <session-id>` — the MCP tools are now available in the resumed session

### 3. Token counting without `/cost`

`--output-format json` returns `usage.input_tokens` and `usage.output_tokens` in the response JSON. No need for `ccusage` per-run — though `ccusage session` is still useful for aggregate analysis across all benchmark runs.

### 4. Preventing interactive tool approval prompts

In non-interactive mode, Claude Code prompts for tool approval which blocks the script. `--allowedTools` pre-approves specific tools without prompting.

### 5. Patch isolation

Patches must be applied and reverted cleanly. If a run crashes mid-session, the patch could be left applied. Worktrees solve this: each run gets a fresh copy of HEAD — the patch state in one worktree is completely independent of others and of the main repo.

## Questions and Answers

> Q: Does resuming a session with MCP enabled actually make MCP tools available, even if the original session didn't have them?

A: Yes. `--resume` recreates the session context (conversation history) but reads the current environment's MCP configuration, not the original session's. By omitting `--strict-mcp-config` on resume, the normal project MCP config is loaded, making AIS tools available.

> Q: Can we run multiple bugs in parallel with worktrees?

A: Yes. Each worktree is a separate directory, so `claude -p` sessions in different worktrees are independent (different project paths → different session storage). A `--parallel N` flag on the orchestrator script can run N bugs simultaneously. Constraint: each session consumes API rate limit and costs money; stay within API limits.

> Q: How do we extract the submitted `issue_id` from the agent's response?

A: The `submit_after_solving` MCP tool returns a JSON payload with an `id` field. This gets embedded in the agent's response text. We parse `jq '.result'` and regex for a UUID. If the UUID pattern match fails (agent may not have submitted), record a warning and continue.

> Q: Should we use `--dangerously-skip-permissions` for automation?

A: No. Use `--allowedTools` instead to pre-approve the specific tools needed (Read, Edit, Bash, Glob, Grep for no-AIS; add MCP tools for AIS). This is safer and matches what the agent would reasonably need.

> Q: What if the agent doesn't fix the bug correctly in an automated run?

A: Record `correct=no` in the CSV. The benchmark's `correct` column tracks this. An incorrect fix in a no-AIS run is valid data (it shows the baseline failure rate). An incorrect fix in an AIS run still records tokens — it just means `found_solution=yes` but `correct=no`, which is also valuable data.

> Q: How do we capture whether the AIS agent called `search_before_fixing`?

A: The `--output-format json` `result` field contains the full agent response including tool use transcripts. We grep the result for `search_before_fixing` to determine `searched_ais=yes/no`.

## Design

### Architecture

```
benchmark/
  auto-run.sh        # orchestrates one full bug cycle (Steps A-E)
  run-all.sh         # runs all 13 bugs, records to results.csv
  empty-mcp.json     # {"mcpServers":{}} — disables all MCP for no-AIS runs
  update-csv.py      # updates a specific row in results.csv with recorded data
```

### Session Flow per Bug

```
┌─────────────────────────────────────────────────────────────────────┐
│ STEP A: Baseline run 1 (worktree, no AIS)                          │
│                                                                     │
│  git worktree add /tmp/bench-BUG-0 HEAD                            │
│  [in worktree] mv .claude/rules/agent-in-sync* *.disabled          │
│  [in worktree] mv .claude/skills/agent-in-sync *.disabled          │
│  [in worktree] git apply patches/BUG.patch                         │
│  [in worktree] claude -p "$(cat prompts/BUG.md)"                   │
│                  --strict-mcp-config --mcp-config empty-mcp.json   │
│                  --allowedTools "Read,Edit,Bash,Glob,Grep"          │
│                  --output-format json > /tmp/result-A.json          │
│  session_id=$(jq -r .session_id /tmp/result-A.json)                │
│  input_A=$(jq -r .usage.input_tokens /tmp/result-A.json)           │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│ STEP B: Submit (same worktree, same session, AIS enabled)          │
│                                                                     │
│  [in worktree] mv .claude/rules/agent-in-sync*.disabled *.md       │
│  [in worktree] mv .claude/skills/agent-in-sync*.disabled (restore) │
│  [in worktree] claude -p "$(cat submit-prompts/BUG.md)"            │
│                  --resume $session_id                               │
│                  --allowedTools "..."                               │
│                  --output-format json > /tmp/result-B.json          │
│  issue_id=$(grep_uuid /tmp/result-B.json)                          │
│                                                                     │
│  git worktree remove /tmp/bench-BUG-0                              │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│ STEPS C & C2: Baseline runs 2 & 3 (fresh worktrees, no AIS)       │
│                                                                     │
│  for run in 2 3:                                                    │
│    git worktree add /tmp/bench-BUG-$run HEAD                       │
│    [disable AIS rules/skills in worktree]                          │
│    [apply patch in worktree]                                        │
│    claude -p ... --strict-mcp-config ... --output-format json      │
│    [record tokens]                                                  │
│    git worktree remove /tmp/bench-BUG-$run                         │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│ STEPS D, D2, D3: AIS runs 1-3 (fresh worktrees, AIS enabled)     │
│                                                                     │
│  for run in 1 2 3:                                                  │
│    git worktree add /tmp/bench-BUG-ais-$run HEAD                   │
│    [apply patch in worktree]                                        │
│    claude -p ... (no --strict-mcp-config → AIS active)             │
│    searched=$(grep_tool_use search_before_fixing result)            │
│    found=$(grep_accepted result)                                    │
│    [record tokens, searched_ais, found_solution]                   │
│    git worktree remove /tmp/bench-BUG-ais-$run                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Key CLI Invocations

**No-AIS session:**

```bash
claude -p "$(cat benchmark/prompts/${BUG}.md)" \
  --strict-mcp-config --mcp-config benchmark/empty-mcp.json \
  --allowedTools "Read,Edit,Bash,Glob,Grep" \
  --max-turns 20 \
  --output-format json
```

**Submit (resume, AIS enabled):**

```bash
claude -p "$(cat benchmark/submit-prompts/${BUG}.md)" \
  --resume "$SESSION_ID" \
  --allowedTools "Read,Edit,Bash,Glob,Grep,mcp__agent-in-sync__*" \
  --max-turns 5 \
  --output-format json
```

**AIS session:**

```bash
claude -p "$(cat benchmark/prompts/${BUG}.md)" \
  --allowedTools "Read,Edit,Bash,Glob,Grep,mcp__agent-in-sync__*" \
  --max-turns 20 \
  --output-format json
```

### Disabling AIS Instructions in Worktree

```bash
disable_ais_instructions() {
  local dir="$1"
  local rules_file="$dir/.claude/rules/agent-in-sync-workflow.md"
  local skills_dir="$dir/.claude/skills/agent-in-sync"

  [ -f "$rules_file" ]  && mv "$rules_file"  "${rules_file}.disabled"
  [ -d "$skills_dir" ]  && mv "$skills_dir"  "${skills_dir}.disabled"
}

enable_ais_instructions() {
  local dir="$1"
  local rules_file="$dir/.claude/rules/agent-in-sync-workflow.md"
  local skills_dir="$dir/.claude/skills/agent-in-sync"

  [ -f "${rules_file}.disabled" ] && mv "${rules_file}.disabled" "$rules_file"
  [ -d "${skills_dir}.disabled" ] && mv "${skills_dir}.disabled" "$skills_dir"
}
```

### Extracting Issue ID from Submit Response

```bash
extract_issue_id() {
  local result_json="$1"
  # The MCP submit tool returns JSON with id field embedded in the result text
  jq -r '.result // ""' "$result_json" \
    | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' \
    | head -1
}
```

### Detecting AIS Tool Use

```bash
checked_ais() {
  local result_json="$1"
  # Check if the agent invoked search_before_fixing
  jq -r '.result // ""' "$result_json" | grep -q 'search_before_fixing' && echo "yes" || echo "no"
}

found_solution() {
  local result_json="$1"
  # Check if the result mentions a found solution (not "No results found")
  local result
  result=$(jq -r '.result // ""' "$result_json")
  echo "$result" | grep -q 'No results found' && echo "no" || \
  echo "$result" | grep -q 'search_before_fixing' && echo "yes" || echo "no"
}
```

### CSV Update Script

A Python helper updates the results.csv in-place rather than appending, so re-runs overwrite previous data for the same (bug_id, condition, run) slot:

```python
# benchmark/update-csv.py
import csv, sys, os

def update_row(csv_path, bug_id, condition, run, **fields):
    rows = []
    updated = False
    with open(csv_path) as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        for row in reader:
            if row['bug_id'] == bug_id and row['condition'] == condition and row['run'] == str(run):
                row.update({k: v for k, v in fields.items() if v is not None})
                updated = True
            rows.append(row)

    if not updated:
        print(f"Warning: row not found for {bug_id}/{condition}/{run}", file=sys.stderr)
        return

    with open(csv_path, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
```

## Implementation Plan

### Phase 1: Foundation files ✅ (this PR)

1. `benchmark/empty-mcp.json` — `{"mcpServers":{}}` for `--strict-mcp-config`
2. `benchmark/update-csv.py` — in-place CSV row updater
3. `benchmark/auto-run.sh` — single-bug orchestrator

### Phase 2: Full orchestration

4. `benchmark/run-all.sh` — loops over all 13 bugs, calls `auto-run.sh` for each
5. `benchmark/run-parallel.sh` — runs N bugs simultaneously using background processes

### Phase 3: Validation

6. Dry-run mode (`--dry-run` flag on auto-run.sh): prints what it would do without calling Claude
7. Smoke test: run one easy bug (C5) end-to-end and verify CSV is populated correctly

## Examples

✅ Run single bug:

```bash
./benchmark/auto-run.sh C5
# Runs all 6 sessions for C5 (3 baseline + 3 AIS)
# Updates results.csv
```

✅ Run all bugs:

```bash
./benchmark/run-all.sh
# Runs all 13 bugs sequentially (~8-12 hours depending on session length)
```

✅ Run all bugs in parallel (3 at a time):

```bash
./benchmark/run-parallel.sh --jobs 3
```

❌ Do NOT use `--dangerously-skip-permissions`:

```bash
# Bad - bypasses all safety checks
claude -p "fix bug" --dangerously-skip-permissions

# Good - pre-approves only the tools the agent needs
claude -p "fix bug" --allowedTools "Read,Edit,Bash,Glob,Grep"
```

❌ Do NOT modify ~/.claude.json to disable MCP:

```bash
# Bad - modifies global config, risky if script crashes mid-run
jq '.mcpServers.ais.disabled = true' ~/.claude.json > /tmp/cfg && mv /tmp/cfg ~/.claude.json

# Good - per-run override, no global state change
claude -p "..." --strict-mcp-config --mcp-config benchmark/empty-mcp.json
```

## Trade-offs

| Pros                                                            | Cons                                                                                    |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Runs 78 sessions unattended overnight                           | Automated sessions may be less creative in debugging (no back-and-forth)                |
| Worktrees give perfect patch isolation                          | Each worktree costs disk space and a few seconds to create/remove                       |
| `--output-format json` gives exact token counts without ccusage | JSON result parsing is brittle if agent output format changes                           |
| `--strict-mcp-config` is a clean per-run override               | Requires Claude Code version that supports this flag                                    |
| Git history stays clean (patches never applied to main)         | Worktrees share the `.git` object store — `git worktree add` is cheap but not zero cost |
| Re-running a specific bug is trivial                            | Session IDs not preserved across script crashes — must re-run affected bug              |
| Cost visible immediately from JSON output                       | Long sessions with `--max-turns 20` can still be expensive per run                      |

## Implementation Notes

Key files to create:

- `benchmark/auto-run.sh` — main automation script
- `benchmark/run-all.sh` — orchestrator for all 13 bugs
- `benchmark/empty-mcp.json` — MCP disable config
- `benchmark/update-csv.py` — CSV update helper

Key Claude Code CLI flags used:

- `--print` / `-p` — non-interactive with prompt
- `--output-format json` — machine-readable output with usage stats
- `--resume <session-id>` — continue a specific session
- `--strict-mcp-config --mcp-config <file>` — per-run MCP override
- `--allowedTools "..."` — pre-approve tools (no interactive approval prompts)
- `--max-turns N` — cap session length to bound cost

---

_Created: 2026-02-25_
_Status: Draft_
