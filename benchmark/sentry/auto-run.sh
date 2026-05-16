#!/usr/bin/env bash
# benchmark/sentry/auto-run.sh
#
# Automates the full A/B benchmark cycle for a single Sentry bug.
# Thin wrapper over benchmark/lib/common.sh with Sentry-specific configuration.
#
# Behaviour notes:
#   - Worktrees are created from the cloned Sentry repo at .repo/
#   - AIS is injected by copying a .claude/ directory into the worktree
#     (and removed by deleting it)
#   - The agent reads and fixes code only — no test execution or build
#   - Patch files are per-PR (multiple bugs can share a PR patch)
#
# Usage:
#   ./benchmark/sentry/auto-run.sh <BUG_ID>                   # 1 full cycle
#   ./benchmark/sentry/auto-run.sh <BUG_ID> --runs 3          # 3 cycles
#   ./benchmark/sentry/auto-run.sh <BUG_ID> --dry-run         # print commands only
#   ./benchmark/sentry/auto-run.sh <BUG_ID> --keep-worktrees  # keep worktrees

set -euo pipefail

# ──────────────────────────────────────────
# Configuration
# ──────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$SCRIPT_DIR/.repo"

BUG="${1:-}"
DRY_RUN=false
KEEP_WORKTREES=false
NO_VOTE=false
NUM_RUNS=1
SEARCH_LIMIT=""

_COMMON_LIB="$SCRIPT_DIR/../lib/common.sh"

if [ -z "$BUG" ]; then
  echo "Usage: $0 <BUG_ID> [--runs N] [--dry-run] [--keep-worktrees] [--no-vote] [--search-limit N]"
  echo ""
  echo "Bug IDs: S1 S2 S3 S4 S5 S6 S7 S8 S9 S10"
  echo ""
  echo "Example: $0 S3"
  echo "         $0 S3 --runs 3 --dry-run"
  exit 1
fi

shift
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)        DRY_RUN=true ;;
    --keep-worktrees) KEEP_WORKTREES=true ;;
    --no-vote)        NO_VOTE=true ;;
    --runs)           NUM_RUNS="${2:?--runs requires a number (1, 2, or 3)}"; shift ;;
    --search-limit)   SEARCH_LIMIT="${2:?--search-limit requires a number}"; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
  shift
done

if ! [[ "$NUM_RUNS" =~ ^[123]$ ]]; then
  echo "Error: --runs must be 1, 2, or 3 (got: $NUM_RUNS)"
  exit 1
fi

# Resolve bug → PR mapping from bugs.json
BUGS_JSON="$SCRIPT_DIR/bugs.json"
[ -f "$BUGS_JSON" ] || { echo "Error: bugs.json not found at $BUGS_JSON"; exit 1; }

PR_NUM=$(jq -r --arg id "$BUG" '.[] | select(.id == $id) | .pr' "$BUGS_JSON")
if [ -z "$PR_NUM" ]; then
  echo "Error: Bug '$BUG' not found in $BUGS_JSON"
  echo "Valid bug IDs: $(jq -r '.[].id' "$BUGS_JSON" | tr '\n' ' ')"
  exit 1
fi

# Optional: pre-seeded issue ID — if set, Phase 2 (submit) is skipped for this bug
SEED_ISSUE_ID=$(jq -r --arg id "$BUG" '.[] | select(.id == $id) | .seed_issue_id // empty' "$BUGS_JSON")

PATCH_FILE="$SCRIPT_DIR/patches/PR${PR_NUM}.patch"
if [ ! -f "$PATCH_FILE" ]; then
  echo "Error: Patch file not found: $PATCH_FILE"
  echo "  Run ./benchmark/sentry/setup.sh first"
  exit 1
fi

# Resolve the base branch for this PR (patches must be applied against this branch)
PR_META="$SCRIPT_DIR/patches/pr-metadata.json"
if [ ! -f "$PR_META" ]; then
  echo "Error: PR metadata not found: $PR_META"
  echo "  Run ./benchmark/sentry/setup.sh first"
  exit 1
fi
BASE_BRANCH=$(jq -r --arg pr "$PR_NUM" '.[$pr].base // empty' "$PR_META")
if [ -z "$BASE_BRANCH" ]; then
  echo "Error: No base branch found for PR #${PR_NUM} in $PR_META"
  exit 1
fi

PROMPT_FILE="$SCRIPT_DIR/prompts/${BUG}.md"
EMPTY_MCP="$SCRIPT_DIR/empty-mcp.json"
RESULTS_CSV="$SCRIPT_DIR/results.csv"
UPDATE_CSV="$SCRIPT_DIR/../update-csv.py"
AIS_HOST="${AIS_HOST:-https://example.com}"
AIS_API_KEY="${AIS_API_KEY:-}"

for f in "$PROMPT_FILE" "$EMPTY_MCP" "$RESULTS_CSV" "$_COMMON_LIB"; do
  [ -f "$f" ] || { echo "Error: Missing file $f"; exit 1; }
done

[ -d "$REPO_ROOT/.git" ] || { echo "Error: Sentry repo not cloned at $REPO_ROOT — run setup.sh first"; exit 1; }

# shellcheck source=../lib/common.sh
source "$_COMMON_LIB"
install_traps

# ──────────────────────────────────────────
# Sentry-specific: AIS injection (copy in / remove)
# ──────────────────────────────────────────

AIS_INJECT_SRC="$SCRIPT_DIR/ais-inject"

disable_ais() {
  local dir="$1"
  if [ -d "$dir/.claude" ]; then
    rm -rf "$dir/.claude"
    log "  AIS removed (injected .claude/ deleted)"
  else
    log "  AIS not present (nothing to remove)"
  fi
}

enable_ais() {
  local dir="$1"
  if [ -d "$AIS_INJECT_SRC/.claude" ]; then
    cp -r "$AIS_INJECT_SRC/.claude" "$dir/.claude"
    log "  AIS injected (.claude/ copied from ais-inject/)"
  else
    log "  WARNING: AIS inject source not found at $AIS_INJECT_SRC/.claude"
  fi
}

# ──────────────────────────────────────────
# Sentry-specific: worktree management
# ──────────────────────────────────────────

make_worktree() {
  local name="$1"
  local path="/tmp/bench-sentry-${BUG}-${name}-$$"
  log "  Creating worktree at $ORIGINAL_COMMIT (detached): $path" >&2
  # Use --detach with the commit hash rather than the branch name.
  # git worktree add refuses to check out a branch that is already checked out
  # in the main .repo worktree (e.g., after setup.sh leaves it on a feature branch).
  # --detach sidesteps this entirely.
  git -C "$REPO_ROOT" worktree add --quiet --detach "$path" "$ORIGINAL_COMMIT"
  ACTIVE_WORKTREES+=("$path")
  log "  Worktree ready: $path" >&2
  echo "$path"
}

# ──────────────────────────────────────────
# MAIN
# ──────────────────────────────────────────

RUN_DIR="$SCRIPT_DIR/runs/${BUG}/$(date -u '+%Y%m%d-%H%M%S')-$$"
mkdir -p "$RUN_DIR"
ORIGINAL_COMMIT=$(git -C "$REPO_ROOT" rev-parse "$BASE_BRANCH")
_REASON_FILE=$(mktemp /tmp/bench-reason-XXXXXX)

preflight_check

resolve_ccusage
log "ccusage cmd: $CCUSAGE_CMD"

# Clean up stale worktrees
stale_wts=$(git -C "$REPO_ROOT" worktree list --porcelain 2>/dev/null \
  | grep "^worktree /tmp/bench-sentry-${BUG}-" | awk '{print $2}') || true
for wt in $stale_wts; do
  log "Removing stale worktree from previous run: $wt"
  git -C "$REPO_ROOT" worktree remove --force "$wt" 2>/dev/null || true
done

log "=== Sentry Benchmark: $BUG ==="
log "PR:          #${PR_NUM} (base: $BASE_BRANCH)"
log "Patch:       $PATCH_FILE"
log "Prompt:      $PROMPT_FILE"
log "Runs:        $NUM_RUNS (submit on run 1 only, if fix correct)"
log "Seed issue:  ${SEED_ISSUE_ID:-none (Phase 2 will submit if Phase 1 correct)}"
log "Worktrees:   $($KEEP_WORKTREES && echo 'kept' || echo 'removed after each run')"
log "Commit:      $ORIGINAL_COMMIT"
$DRY_RUN && log "(DRY RUN MODE — no Claude sessions will run)"
echo ""

SUBMITTED_ISSUE_ID=""
SUMMARY_ROWS=()

# ──────────────────────────────────────────
# Main loop: one full cycle per run
# ──────────────────────────────────────────
for (( run=1; run<=NUM_RUNS; run++ )); do

  log "╔══════════════════════════════════════════════════════════════════════════╗"
  log "║  RUN ${run}/${NUM_RUNS}  —  Bug: $BUG (Sentry PR #${PR_NUM})"
  log "╚══════════════════════════════════════════════════════════════════════════╝"
  echo ""

  SESSION_ID=""
  WT=$(make_worktree "run${run}")

  # ────────────────────────────────────────
  # PHASE 1: Fix without AIS
  # ────────────────────────────────────────
  log "══════════════════════════════════════════════════════════════════════════"
  log "PHASE 1: Fix without AIS (run ${run})"
  log "══════════════════════════════════════════════════════════════════════════"

  log "Ensuring AIS is not present..."
  disable_ais "$WT"
  log "Applying patch to introduce bug..."
  apply_patch "$WT"

  RESULT_FIX="$RUN_DIR/run${run}-fix.json"
  PHASE1_OK=true
  log "Starting Claude session — no AIS, max $MAX_TURNS_FIX turns"
  WALL_START=$SECONDS
  if ! run_claude "$WT" "$RESULT_FIX" \
    -p "$(cat "$PROMPT_FILE")" \
    --strict-mcp-config --mcp-config "$EMPTY_MCP" \
    --dangerously-skip-permissions \
    --max-turns "$MAX_TURNS_FIX"; then
    PHASE1_OK=false
  fi
  WALL_FIX=$(( SECONDS - WALL_START ))

  if $PHASE1_OK; then
    log "Phase 1 Claude session complete — extracting results..."
    SESSION_ID=$(get_session_id "$RESULT_FIX")
    INPUT_FIX=$(get_tokens "$RESULT_FIX" input_tokens)
    OUTPUT_FIX=$(get_tokens "$RESULT_FIX" output_tokens)
    COST_FIX=$(get_cost "$RESULT_FIX")
    log "Checking correctness..."
    CORRECT_FIX=$(check_correct "$WT")
    VALIDATION_REASON=$(cat "$_REASON_FILE" 2>/dev/null || echo "")

    log "Phase 1 results:"
    log "  Session ID:  $SESSION_ID"
    log "  Tokens:      ${INPUT_FIX} in / ${OUTPUT_FIX} out"
    log "  Cost:        \$${COST_FIX:-n/a}"
    log "  Correct fix: $CORRECT_FIX (${VALIDATION_REASON:-unknown})"
    log "  Wall clock:  ${WALL_FIX}s"
    log "  Stream file: ${RESULT_FIX%.json}.stream"

    log "Printing response..."
    print_response "$RESULT_FIX" "Phase 1 — Fix without AIS (run ${run})"
    log "Running ccusage..."
    print_ccusage "$SESSION_ID" "Phase 1 — Fix without AIS (run ${run})"

    TOOL_CALLS_FIX=$(count_tool_calls "$RESULT_FIX")
    log "Recording to CSV..."
    record "$BUG" without_ais "$run" \
      --input-tokens "$INPUT_FIX" --output-tokens "$OUTPUT_FIX" \
      --tool-calls "$TOOL_CALLS_FIX" \
      --wall-clock "$WALL_FIX" --correct "$CORRECT_FIX" \
      --timestamp "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
      ${COST_FIX:+--cost "$COST_FIX"} \
      ${VALIDATION_REASON:+--notes "$VALIDATION_REASON"}
    log "Phase 1 recording complete."
  else
    log "ERROR: Phase 1 failed — recording failure"
    log "  Stream file: ${RESULT_FIX%.json}.stream"
    record "$BUG" without_ais "$run" --wall-clock "$WALL_FIX" --notes "session_failed"
  fi

  # ────────────────────────────────────────
  # PHASE 2: Submit (run 1 only, correct fix only)
  # ────────────────────────────────────────
  echo ""
  if [ "$run" -eq 1 ]; then
    log "══════════════════════════════════════════════════════════════════════════"
    log "PHASE 2: Submit solution (resume session, AIS enabled)"
    log "══════════════════════════════════════════════════════════════════════════"

    if [ -n "$SEED_ISSUE_ID" ]; then
      log "SKIP: seed_issue_id already set in bugs.json ($SEED_ISSUE_ID)"
      log "  A solution is pre-seeded in the KB — Phase 2 submit not needed"
      SUBMITTED_ISSUE_ID="$SEED_ISSUE_ID"
      # Do NOT add to SUBMITTED_ISSUE_IDS — seed is permanent, not cleaned up
    elif $PHASE1_OK && [ -n "$SESSION_ID" ] && [ "${CORRECT_FIX:-no}" = "yes" ]; then
      log "Fix was correct — injecting AIS for submit..."
      enable_ais "$WT"

      RESULT_SUBMIT="$RUN_DIR/run${run}-submit.json"
      log "Resuming session $SESSION_ID — asking agent to submit..."
      if run_claude "$WT" "$RESULT_SUBMIT" \
        -p "$SUBMIT_PROMPT" \
        --resume "$SESSION_ID" \
        --dangerously-skip-permissions \
        --max-turns "$MAX_TURNS_SUBMIT"; then

        SUBMIT_SID=$(get_session_id "$RESULT_SUBMIT")
        ISSUE_ID=$(extract_issue_id "$RESULT_SUBMIT")
        log "Phase 2 results:"
        log "  Submit session ID:  $SUBMIT_SID"
        log "  Submitted issue ID: ${ISSUE_ID:-<not found in stream>}"
        log "  Stream file:        ${RESULT_SUBMIT%.json}.stream"

        print_response "$RESULT_SUBMIT" "Phase 2 — Submit"
        print_ccusage "$SUBMIT_SID" "Phase 2 — Submit"

        if [ -n "$ISSUE_ID" ]; then
          SUBMITTED_ISSUE_ID="$ISSUE_ID"
          SUBMITTED_ISSUE_IDS+=("$ISSUE_ID")
          record "$BUG" without_ais 1 --submitted-issue-id "$ISSUE_ID"
          log "  Submitted issue ID recorded: $ISSUE_ID"
        elif grep -q '"name":"mcp__agent-in-sync__vote"' "${RESULT_SUBMIT%.json}.stream" 2>/dev/null; then
          log "  Agent found duplicate and voted — no new issue created"
        else
          log "⚠ WARNING: Could not extract issue ID from submit stream"
        fi
      else
        log "WARNING: Submit step failed"
      fi
    elif ! $PHASE1_OK || [ -z "$SESSION_ID" ]; then
      log "SKIP: Phase 1 did not produce a valid session — nothing to submit"
    else
      log "SKIP: Phase 1 fix was incorrect — not submitting broken fix"
    fi
  else
    log "(Skipping submit — already submitted on run 1)"
  fi

  # ────────────────────────────────────────
  # PHASE 3: Fix with AIS
  # ────────────────────────────────────────
  echo ""
  SESSION_ID=""
  log "══════════════════════════════════════════════════════════════════════════"
  log "PHASE 3: Fix with AIS (run ${run})"
  log "══════════════════════════════════════════════════════════════════════════"

  log "Reverting worktree and reapplying patch with AIS injected..."
  reset_worktree "$WT"
  enable_ais "$WT"
  apply_patch "$WT"

  if [ -n "$SUBMITTED_ISSUE_ID" ]; then
    log "AIS knowledge base: has submitted solution (issue $SUBMITTED_ISSUE_ID)"
  else
    log "AIS knowledge base: no solution submitted yet"
  fi

  RESULT_AIS="$RUN_DIR/run${run}-ais.json"
  log "Starting Claude session — AIS enabled, max $MAX_TURNS_FIX turns"
  WALL_START=$SECONDS
  phase3_disallowed="mcp__agent-in-sync__submit_after_solving,mcp__agent-in-sync__setup_agent_identity"
  if $NO_VOTE; then
    phase3_disallowed="${phase3_disallowed},mcp__agent-in-sync__vote"
  fi

  phase3_prompt="$(cat "$PROMPT_FILE")"
  if [ -n "$SEARCH_LIMIT" ]; then
    phase3_prompt="${phase3_prompt}

When calling search_before_fixing, always set the limit parameter to ${SEARCH_LIMIT}."
    log "  Search limit: $SEARCH_LIMIT (injected into prompt)"
  fi

  if ! run_claude "$WT" "$RESULT_AIS" \
    -p "$phase3_prompt" \
    --dangerously-skip-permissions \
    --disallowedTools "$phase3_disallowed" \
    --max-turns "$MAX_TURNS_FIX"; then
    log "ERROR: AIS run failed — recording failure"
    WALL_AIS=$(( SECONDS - WALL_START ))
    record "$BUG" with_ais "$run" --wall-clock "$WALL_AIS" --notes "session_failed"
    _accumulate_summary
    remove_worktree "$WT"
    continue
  fi
  WALL_AIS=$(( SECONDS - WALL_START ))

  SESSION_ID=$(get_session_id "$RESULT_AIS")
  INPUT_AIS=$(get_tokens "$RESULT_AIS" input_tokens)
  OUTPUT_AIS=$(get_tokens "$RESULT_AIS" output_tokens)
  COST_AIS=$(get_cost "$RESULT_AIS")
  CORRECT_AIS=$(check_correct "$WT")
  VALIDATION_REASON=$(cat "$_REASON_FILE" 2>/dev/null || echo "")

  SEARCHED=$(checked_ais "$RESULT_AIS")
  FOUND=$(found_solution "$RESULT_AIS" "$SUBMITTED_ISSUE_ID")
  TOOL_CALLS_AIS=$(count_tool_calls "$RESULT_AIS")
  SEARCHED_YN=$( [ "${SEARCHED:-0}" -gt 0 ] 2>/dev/null && echo "yes" || echo "no" )

  log "Phase 3 results:"
  log "  Session ID:    $SESSION_ID"
  log "  Tokens:        ${INPUT_AIS} in / ${OUTPUT_AIS} out"
  log "  Cost:          \$${COST_AIS:-n/a}"
  log "  Correct fix:   $CORRECT_AIS (${VALIDATION_REASON:-unknown})"
  log "  Searched AIS:  ${SEARCHED_YN} (${SEARCHED} calls)"
  log "  Found solution: ${FOUND}"
  log "  Wall clock:    ${WALL_AIS}s"

  if [ "$SEARCHED_YN" = "no" ]; then
    log "FATAL: Agent did NOT call search_before_fixing — AIS injection may have failed"
    record "$BUG" with_ais "$run" \
      --input-tokens "$INPUT_AIS" --output-tokens "$OUTPUT_AIS" \
      --wall-clock "$WALL_AIS" --correct "$CORRECT_AIS" \
      ${COST_AIS:+--cost "$COST_AIS"} \
      --searched-ais "no" --found-solution "no" \
      --notes "aborted:no_search"
    _accumulate_summary
    remove_worktree "$WT"
    exit 1
  fi

  print_response "$RESULT_AIS" "Phase 3 — Fix with AIS (run ${run})"
  print_ccusage "$SESSION_ID" "Phase 3 — Fix with AIS (run ${run})"

  PHASE3_ISSUE_ID=$(extract_issue_id "$RESULT_AIS")
  if [ -n "$PHASE3_ISSUE_ID" ]; then
    SUBMITTED_ISSUE_IDS+=("$PHASE3_ISSUE_ID")
    log "  Phase 3 agent submitted issue: $PHASE3_ISSUE_ID (tracked for cleanup)"
  fi

  record "$BUG" with_ais "$run" \
    --input-tokens "$INPUT_AIS" --output-tokens "$OUTPUT_AIS" \
    --tool-calls "$TOOL_CALLS_AIS" \
    --wall-clock "$WALL_AIS" --correct "$CORRECT_AIS" \
    --timestamp "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
    ${COST_AIS:+--cost "$COST_AIS"} \
    --searched-ais "$SEARCHED_YN" --found-solution "$FOUND" \
    ${VALIDATION_REASON:+--notes "$VALIDATION_REASON"}

  SESSION_ID=""
  _accumulate_summary
  remove_worktree "$WT"
  echo ""
done

# ──────────────────────────────────────────
# Done
# ──────────────────────────────────────────
echo ""
log "=== Sentry Benchmark $BUG complete ==="

print_summary "$BUG"

log "Results recorded in $RESULTS_CSV"
log "Run archive: $RUN_DIR"

if $KEEP_WORKTREES; then
  log "Worktrees retained — run 'git worktree list' to see them"
fi
