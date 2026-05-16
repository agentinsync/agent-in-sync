#!/usr/bin/env bash
# benchmark/lib/common.sh
#
# Shared functions for AgentInSync benchmark runners.
# Sourced by both benchmark/auto-run.sh (internal) and benchmark-oss/*/auto-run.sh (OSS).
#
# Required variables (must be set BEFORE sourcing):
#   DRY_RUN          — "true" or "false"
#   KEEP_WORKTREES   — "true" or "false"
#   REPO_ROOT        — path to the git repo used for worktrees
#   RESULTS_CSV      — path to results.csv
#   UPDATE_CSV       — path to update-csv.py
#   EMPTY_MCP        — path to empty-mcp.json
#   AIS_HOST         — AgentInSync API URL (default: https://example.com)
#   AIS_API_KEY      — API key for KB cleanup
#
# Variables set per-bug by the caller before invoking shared functions:
#   BUG              — bug ID (e.g. C5, S3)
#   PATCH_FILE       — path to the .patch file
#   PROMPT_FILE      — path to the prompt .md file
#   ORIGINAL_COMMIT  — git commit hash of the correct (pre-bug) code
#   _REASON_FILE     — temp file for check_correct reason propagation
#   RUN_DIR          — directory for run artifacts

# ──────────────────────────────────────────
# Constants
# ──────────────────────────────────────────

MAX_TURNS_FIX=20
MAX_TURNS_SUBMIT=8

SUBMIT_PROMPT="You've successfully fixed the bug. Now submit your fix to the shared knowledge base so other agents can benefit. Submit it as an issue with your solution."

VALIDATION_SCHEMA='{"type":"object","properties":{"correct":{"type":"boolean","description":"Whether the fix resolves the bug"},"reason":{"type":"string","description":"Brief explanation of why the fix is or is not correct"}},"required":["correct","reason"],"additionalProperties":false}'

# Summary table format
_SUMMARY_FMT="  %-3s  │  %-7s  %-10s  %-5s  %-6s  │  %-7s  %-10s  %-5s  %-6s  %-5s"

# ──────────────────────────────────────────
# Global state (managed by common.sh)
# ──────────────────────────────────────────

ACTIVE_CLAUDE_PID=""
ACTIVE_DISPLAY_PID=""
ACTIVE_WORKTREES=()
SUBMITTED_ISSUE_IDS=()
VALIDATION_REASON=""
CCUSAGE_CMD=""
INTERRUPTED=false

# ──────────────────────────────────────────
# Utilities
# ──────────────────────────────────────────

log() { echo "[$(date '+%H:%M:%S')] $*" >&2; }

preflight_check() {
  local missing=()

  command -v claude >/dev/null 2>&1 || missing+=("claude (Claude Code CLI)")
  command -v jq    >/dev/null 2>&1 || missing+=("jq")
  command -v git   >/dev/null 2>&1 || missing+=("git")
  command -v python3 >/dev/null 2>&1 || missing+=("python3")
  command -v curl  >/dev/null 2>&1 || missing+=("curl")

  if [ "${#missing[@]}" -gt 0 ]; then
    echo "Error: Missing required tools:"
    for t in "${missing[@]}"; do echo "  - $t"; done
    exit 1
  fi

  if ! claude --help 2>&1 | grep -q 'output-format'; then
    echo "Warning: claude --help does not mention --output-format."
    echo "  Ensure Claude Code >= 1.x is installed. Proceeding anyway."
  fi

  if [ -z "$AIS_API_KEY" ]; then
    log "⚠ WARNING: AIS_API_KEY is not set — submitted issues cannot be cleaned up automatically"
    log "  Set it with: export AIS_API_KEY=ask_prv_xxx"
  fi

  log "Preflight OK  (claude, jq, git, python3, curl found)"
}

resolve_ccusage() {
  CCUSAGE_CMD="pnpm dlx ccusage"
}

# ──────────────────────────────────────────
# Cleanup / interrupt handler
# ──────────────────────────────────────────

cleanup() {
  local exit_code=${1:-$?}
  if $INTERRUPTED; then
    echo ""
    log "Interrupted — cleaning up..."
  elif [ "$exit_code" -ne 0 ]; then
    log "Exiting with error (code $exit_code) — cleaning up..."
  fi

  if [ -n "${ACTIVE_DISPLAY_PID:-}" ]; then
    kill "$ACTIVE_DISPLAY_PID" 2>/dev/null || true
    wait "$ACTIVE_DISPLAY_PID" 2>/dev/null || true
    ACTIVE_DISPLAY_PID=""
  fi

  if [ -n "${ACTIVE_CLAUDE_PID:-}" ]; then
    kill "$ACTIVE_CLAUDE_PID" 2>/dev/null || true
    log "Killed claude process (PID $ACTIVE_CLAUDE_PID)"
    ACTIVE_CLAUDE_PID=""
  fi

  if (( ${#SUBMITTED_ISSUE_IDS[@]} > 0 )); then
    log "Deleting ${#SUBMITTED_ISSUE_IDS[@]} submitted issue(s) from KB..."
    for iid in "${SUBMITTED_ISSUE_IDS[@]}"; do
      [ -n "$iid" ] || continue
      delete_issue "$iid"
    done
  fi

  if (( ${#ACTIVE_WORKTREES[@]} > 0 )); then
    for wt in "${ACTIVE_WORKTREES[@]}"; do
      [ -n "$wt" ] || continue
      if $KEEP_WORKTREES; then
        log "Keeping worktree: $wt"
      else
        git -C "$wt" checkout -- . 2>/dev/null || true
        git -C "$wt" clean -fd 2>/dev/null || true
        git -C "$REPO_ROOT" worktree remove --force "$wt" 2>/dev/null || true
        log "Removed worktree: $wt"
      fi
    done
  fi
  ACTIVE_WORKTREES=()
  [ -n "${_REASON_FILE:-}" ] && rm -f "$_REASON_FILE"
  if [ -n "${RUN_DIR:-}" ]; then
    log "Run artifacts saved to: $RUN_DIR"
  fi
}

handle_int() {
  INTERRUPTED=true
  exit 130
}

install_traps() {
  trap handle_int INT TERM
  trap cleanup EXIT
}

# ──────────────────────────────────────────
# NDJSON stream display
# ──────────────────────────────────────────

print_stream_events() {
  local turn=0
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    local type
    type=$(jq -r '.type // ""' <<< "$line" 2>/dev/null) || continue
    [ -z "$type" ] && continue

    case "$type" in
      system)
        local model cwd num_tools
        model=$(jq -r '.model // "?"' <<< "$line" 2>/dev/null)
        cwd=$(jq -r '.cwd // "?"' <<< "$line" 2>/dev/null)
        num_tools=$(jq -r '(.tools // []) | length' <<< "$line" 2>/dev/null)
        echo ""
        log "  [claude-init] model=${model}  cwd=${cwd}  tools=${num_tools}"
        ;;

      assistant)
        turn=$((turn + 1))
        local texts
        texts=$(jq -r '.message.content[]? | select(.type == "text") | .text' \
          <<< "$line" 2>/dev/null)
        if [ -n "$texts" ]; then
          echo ""
          echo "┌─ Claude (turn ${turn}) ────────────────────────────────────────────"
          echo "$texts"
        fi
        while IFS= read -r tool_json; do
          [ -z "$tool_json" ] && continue
          local tname tinput
          tname=$(jq -r '.name' <<< "$tool_json" 2>/dev/null)
          tinput=$(jq -rc '.input' <<< "$tool_json" 2>/dev/null | head -c 140)
          echo ""
          echo "  ▶ [tool_use] $tname"
          echo "    input: $tinput"
        done < <(jq -c '.message.content[]? | select(.type == "tool_use")' \
          <<< "$line" 2>/dev/null)
        ;;

      user)
        while IFS= read -r result_json; do
          [ -z "$result_json" ] && continue
          local content_str
          content_str=$(jq -r '
            .content |
            if type == "array" then (.[0].text? // (. | tostring))
            elif type == "string" then .
            else (. | tostring)
            end' <<< "$result_json" 2>/dev/null \
            | head -c 200 | tr '\n' ' ')
          echo "  ◀ [tool_result] ${content_str}"
        done < <(jq -c '.message.content[]? | select(.type == "tool_result")' \
          <<< "$line" 2>/dev/null)
        ;;

      result)
        local turns cost subtype
        turns=$(jq -r '.num_turns // "?"' <<< "$line" 2>/dev/null)
        cost=$(jq -r '.total_cost_usd // ""' <<< "$line" 2>/dev/null)
        subtype=$(jq -r '.subtype // ""' <<< "$line" 2>/dev/null)
        local in_tok out_tok
        in_tok=$(jq -r '.usage.input_tokens // "?"' <<< "$line" 2>/dev/null)
        out_tok=$(jq -r '.usage.output_tokens // "?"' <<< "$line" 2>/dev/null)
        echo ""
        echo "└─ [${subtype}] ${turns} turns  in=${in_tok} out=${out_tok}  cost=\$${cost:-?}"
        echo ""
        ;;
    esac
  done
}

# ──────────────────────────────────────────
# run_claude — run a claude session, stream events to console, save to files
#
# Args: <workdir> <out_json_file> [claude args...]
# ──────────────────────────────────────────
run_claude() {
  local workdir="$1" out="$2"; shift 2

  local stream_file="${out%.json}.stream"

  if $DRY_RUN; then
    log "[DRY RUN] (cd $workdir) claude $*"
    local dry_result='{"type":"result","subtype":"success","session_id":"dry-run-id","total_cost_usd":0,"num_turns":0,"usage":{"input_tokens":0,"output_tokens":0},"result":"[dry-run: no LLM response]"}'
    echo "$dry_result" > "$stream_file"
    echo "$dry_result" > "$out"
    return 0
  fi

  local rc=0
  > "$stream_file"

  set -m
  tail -f "$stream_file" | print_stream_events &
  ACTIVE_DISPLAY_PID=$!
  set +m

  (cd "$workdir" && exec claude "$@" --output-format stream-json --verbose) > "$stream_file" &
  ACTIVE_CLAUDE_PID=$!
  log "Claude running (PID $ACTIVE_CLAUDE_PID) in $workdir ..."

  wait "$ACTIVE_CLAUDE_PID" || rc=$?
  ACTIVE_CLAUDE_PID=""

  sleep 0.3
  log "Killing display pipeline (PGID $ACTIVE_DISPLAY_PID)..."
  kill -- -"$ACTIVE_DISPLAY_PID" 2>/dev/null || kill "$ACTIVE_DISPLAY_PID" 2>/dev/null || true
  wait "$ACTIVE_DISPLAY_PID" 2>/dev/null || true
  ACTIVE_DISPLAY_PID=""
  log "Display pipeline stopped."

  if [ "$rc" -ne 0 ]; then
    log "WARNING: Claude exited with code $rc"
  fi

  if ! grep -q '"type":"result"' "$stream_file" 2>/dev/null; then
    local line_count
    line_count=$(wc -l < "$stream_file" 2>/dev/null | tr -d ' ') || line_count=0
    log "ERROR: No result event in stream (${line_count} event lines written)"
    log "       Check $stream_file for details"
    return 1
  fi

  grep '"type":"result"' "$stream_file" | tail -1 > "$out"

  if ! jq -e '.session_id' "$out" >/dev/null 2>&1; then
    log "ERROR: Result event is malformed — could not parse session_id"
    log "       Check $out"
    return 1
  fi

  return $rc
}

# ──────────────────────────────────────────
# JSON / stream helpers
# ──────────────────────────────────────────

print_response() {
  local file="$1" label="${2:-Response}"
  local result
  result=$(jq -r '.result // ""' "$file" 2>/dev/null)
  if [ -z "$result" ]; then
    log "  (no LLM response text in output)"
    return 0
  fi
  echo ""
  echo "┌── $label ─────────────────────────────────────────────────────────────"
  echo "$result"
  echo "└────────────────────────────────────────────────────────────────────────"
  echo ""
}

print_ccusage() {
  local session_id="$1" label="${2:-}"
  if [ -z "$session_id" ]; then
    log "  (no session ID — skipping ccusage)"
    return 0
  fi
  [ "$session_id" = "dry-run-id" ] && return 0
  echo ""
  log "┌── ccusage: ${label:-session $session_id} ──"
  log "Running: $CCUSAGE_CMD session --id $session_id (timeout 30s)"
  if command -v timeout >/dev/null 2>&1; then
    timeout 30 $CCUSAGE_CMD session --id "$session_id" || \
      log "  ccusage failed or timed out (exit $?)"
  else
    perl -e 'alarm 30; exec @ARGV' $CCUSAGE_CMD session --id "$session_id" || \
      log "  ccusage failed or timed out (exit $?)"
  fi
  log "└──"
  echo ""
}

get_tokens() {
  jq -r ".usage.${2} // 0" "$1" 2>/dev/null || echo "0"
}

get_session_id() {
  jq -r '.session_id // ""' "$1" 2>/dev/null || echo ""
}

get_cost() {
  jq -r '.total_cost_usd // ""' "$1" 2>/dev/null || echo ""
}

# ──────────────────────────────────────────
# Tool-use detection (from NDJSON stream)
# ──────────────────────────────────────────

count_tool_calls() {
  local stream="${1%.json}.stream"
  if [ ! -f "$stream" ]; then echo "0"; return; fi
  jq -r 'select(.type == "assistant") | .message.content[]? | select(.type == "tool_use") | .name' \
    "$stream" 2>/dev/null | wc -l | tr -d ' ' || echo "0"
}

checked_ais() {
  local stream="${1%.json}.stream"
  if [ ! -f "$stream" ]; then echo "0"; return; fi
  local count
  count=$(grep -c '"name":"mcp__agent-in-sync__search_before_fixing"' "$stream" 2>/dev/null || true)
  echo "${count:-0}"
}

found_solution() {
  local stream="${1%.json}.stream"
  local known_issue_id="${2:-}"  # optional: if set, check whether the agent voted on this specific issue

  if [ ! -f "$stream" ]; then echo "no"; return; fi

  if ! grep -q '"name":"mcp__agent-in-sync__search_before_fixing"' "$stream" 2>/dev/null; then
    echo "no"
    return
  fi

  # When we have a known issue ID (from Phase 2 submit or a pre-seeded solution),
  # check whether the agent actually interacted with that specific issue (voted on it).
  # This is more precise than checking for any vote/non-empty result.
  if [ -n "$known_issue_id" ]; then
    grep -q "\"$known_issue_id\"" "$stream" 2>/dev/null && echo "yes" || echo "no"
    return
  fi

  # General detection (no known issue ID): agent voted on any solution
  if grep -q '"name":"mcp__agent-in-sync__vote"' "$stream" 2>/dev/null; then
    echo "yes"
    return
  fi

  if grep -q '"name":"mcp__agent-in-sync__submit_after_solving"' "$stream" 2>/dev/null; then
    echo "yes"
    return
  fi

  local has_real_results
  has_real_results=$(jq -r '
    select(.type == "user") |
    .message.content[]? |
    select(.type == "tool_result") |
    .content |
    if type == "array" then .[0].text? // ""
    elif type == "string" then .
    else ""
    end
  ' "$stream" 2>/dev/null \
    | grep -v 'No results found' \
    | grep -v '^$' \
    | grep -c '[a-zA-Z0-9]' 2>/dev/null || echo 0)

  [ "$has_real_results" -gt 0 ] && echo "yes" || echo "no"
}

extract_issue_id() {
  local stream="${1%.json}.stream"
  if [ ! -f "$stream" ]; then echo ""; return; fi

  jq -r '
    select(.type == "user") |
    .message.content[]? |
    select(.type == "tool_result") |
    .content |
    if type == "array" then .[0].text? // ""
    elif type == "string" then .
    else (. | tostring)
    end
  ' "$stream" 2>/dev/null \
  | jq -r '.issue_id // empty' 2>/dev/null \
  | head -1 || echo ""
}

# ──────────────────────────────────────────
# Patch / worktree helpers
# ──────────────────────────────────────────

apply_patch() {
  local worktree="$1"
  log "  Applying patch: $PATCH_FILE"
  if ! (cd "$worktree" && git apply "$PATCH_FILE"); then
    log "ERROR: git apply failed for $PATCH_FILE in $worktree"
    log "       Run 'git apply --check $PATCH_FILE' to diagnose"
    return 1
  fi
  log "  Patch applied OK"
}

# Reset worktree to HEAD. Pass exclude patterns as extra args (e.g. "-e node_modules").
reset_worktree() {
  local worktree="$1"; shift
  log "  Reverting all changes in worktree to HEAD..."
  git -C "$worktree" checkout -- . 2>/dev/null || true
  git -C "$worktree" clean -fd "$@" 2>/dev/null || true
  log "  Worktree reset to HEAD"
}

remove_worktree() {
  local path="$1"

  local new_wts=()
  if (( ${#ACTIVE_WORKTREES[@]} > 0 )); then
    local wt
    for wt in "${ACTIVE_WORKTREES[@]}"; do
      [[ "$wt" != "$path" ]] && new_wts+=("$wt")
    done
  fi
  if (( ${#new_wts[@]} > 0 )); then
    ACTIVE_WORKTREES=("${new_wts[@]}")
  else
    ACTIVE_WORKTREES=()
  fi

  if $KEEP_WORKTREES; then
    log "  Keeping worktree: $path"
    return
  fi
  git -C "$path" checkout -- . 2>/dev/null || true
  git -C "$path" clean -fd 2>/dev/null || true
  git -C "$REPO_ROOT" worktree remove --force "$path" 2>/dev/null || true
  log "  Worktree removed: $path"
}

# ──────────────────────────────────────────
# Correctness validation
# ──────────────────────────────────────────

check_correct() {
  local worktree="$1"
  _set_reason() { printf '%s' "$1" > "$_REASON_FILE"; }
  _set_reason ""

  local patched_files=()
  while IFS= read -r pf; do
    [ -n "$pf" ] && patched_files+=("$pf")
  done < <(grep -E '^\+\+\+ b/' "$PATCH_FILE" | sed 's|^+++ b/||')

  if [ ${#patched_files[@]} -eq 0 ]; then
    log "  check_correct: could not parse patched files from $PATCH_FILE — defaulting to 'no'"
    _set_reason "could not parse patched files"
    echo "no"
    return
  fi

  local has_diff=false
  for f in "${patched_files[@]}"; do
    if ! git -C "$worktree" diff --quiet "$ORIGINAL_COMMIT" -- "$f" 2>/dev/null; then
      has_diff=true
      break
    fi
  done
  if ! $has_diff; then
    _set_reason "exact match"
    echo "yes"
    return
  fi

  local diff_output
  diff_output=$(git -C "$worktree" diff "$ORIGINAL_COMMIT" -- "${patched_files[@]}" 2>/dev/null)

  local bug_description
  bug_description=$(cat "$PROMPT_FILE" 2>/dev/null)

  local patch_content
  patch_content=$(cat "$PATCH_FILE" 2>/dev/null)

  local eval_prompt="You are evaluating whether a code fix correctly resolves a bug.

## Bug Description (what the user reported)
${bug_description}

## Patch that introduced the bug (the root cause)
${patch_content}

## Agent's changes compared to the original working code
${diff_output}

Does the agent's fix resolve the bug described above?
A fix is correct if it addresses the root cause, even if the exact values differ from the original (e.g., pool max=10 vs max=20 are both valid fixes for a pool-too-small bug).
A fix is incorrect if it does not address the root cause, leaves the bug in place, or introduces new bugs in the patched files.
Cosmetic changes (comments, type annotations) alongside a correct fix are acceptable."

  log "  check_correct: diff found — asking Claude to evaluate semantically..."

  local eval_result
  if eval_result=$(claude -p "$eval_prompt" \
    --model haiku \
    --output-format json \
    --max-turns 1 \
    --json-schema "$VALIDATION_SCHEMA" \
    --no-session-persistence \
    --dangerously-skip-permissions 2>/dev/null); then

    # Extract correct/reason from .result — which may be a JSON object or a JSON-encoded string.
    # NOTE: jq's // operator treats `false` as falsy, so we MUST NOT use `.correct // empty`
    # for a boolean field — it would swallow `false` as if it were null.
    local correct reason
    correct=$(printf '%s' "$eval_result" | jq -r '
      .result |
      if type == "object" then
        if has("correct") then .correct else "MISSING" end
      elif type == "string" and length > 0 then
        (. | fromjson | if has("correct") then .correct else "MISSING" end)
      else "MISSING"
      end
    ' 2>/dev/null) || correct="MISSING"

    reason=$(printf '%s' "$eval_result" | jq -r '
      .result |
      if type == "object" then (.reason // "no reason given")
      elif type == "string" and length > 0 then (. | fromjson | .reason // "no reason given")
      else "parse error"
      end
    ' 2>/dev/null) || reason="parse error"

    if [ "$correct" = "true" ]; then
      _set_reason "LLM: $reason"
      log "  check_correct: LLM says YES — $reason"
      echo "yes"
      return
    elif [ "$correct" = "false" ]; then
      _set_reason "LLM: $reason"
      log "  check_correct: LLM says NO — $reason"
      echo "no"
      return
    else
      log "  check_correct: LLM response unparseable (correct=$correct)"
      log "    eval_result preview: $(printf '%s' "$eval_result" | head -c 300)"
      _set_reason "LLM parse failure, fallback to no"
      echo "no"
      return
    fi
  else
    log "  check_correct: LLM call failed (exit $?) — falling back to 'no'"
    _set_reason "LLM call failed, fallback to no"
    echo "no"
    return
  fi
}

# ──────────────────────────────────────────
# CSV recording
# ──────────────────────────────────────────

record() {
  local bug="$1" condition="$2" run="$3"
  shift 3
  if $DRY_RUN; then
    log "[DRY RUN] update-csv $bug/$condition/run$run $*"
    return
  fi
  log "  Recording to CSV: $bug / $condition / run $run  $*"
  python3 "$UPDATE_CSV" --csv "$RESULTS_CSV" --bug "$bug" --condition "$condition" --run "$run" "$@"
}

# ──────────────────────────────────────────
# Summary table
# ──────────────────────────────────────────

_accumulate_summary() {
  local c1="-" c2="-" t1="-" t3="-"
  [[ "${COST_FIX:-}" =~ ^[0-9] ]] && c1=$(printf '$%.4f' "$COST_FIX")
  [[ "${COST_AIS:-}" =~ ^[0-9] ]] && c2=$(printf '$%.4f' "$COST_AIS")
  [[ "${WALL_FIX:-}" =~ ^[0-9] ]] && t1="${WALL_FIX}s"
  [[ "${WALL_AIS:-}" =~ ^[0-9] ]] && t3="${WALL_AIS}s"
  # shellcheck disable=SC2059
  SUMMARY_ROWS+=("$(printf "$_SUMMARY_FMT" \
    "$run" \
    "${CORRECT_FIX:--}" "$c1" "${TOOL_CALLS_FIX:--}" "$t1" \
    "${CORRECT_AIS:--}" "$c2" "${TOOL_CALLS_AIS:--}" "$t3" \
    "${FOUND:--}")")
}

print_summary() {
  local bug="$1"
  if (( ${#SUMMARY_ROWS[@]} > 0 )); then
    # shellcheck disable=SC2059
    local _hdr _sep
    _hdr=$(printf "$_SUMMARY_FMT" "Run" "Correct" "Cost" "Turns" "Time" "Correct" "Cost" "Turns" "Time" "Found")
    _sep=$(printf "$_SUMMARY_FMT" "───" "───────" "──────────" "─────" "──────" "───────" "──────────" "─────" "──────" "─────")
    log "┌─ Results: $bug"
    log "│  without AIS ──────────────────────────────────  with AIS"
    log "│${_hdr}"
    log "│${_sep}"
    for row in "${SUMMARY_ROWS[@]}"; do
      log "│${row}"
    done
    log "└${_sep}"
  fi
}

# ──────────────────────────────────────────
# KB cleanup
# ──────────────────────────────────────────

delete_issue() {
  local issue_id="$1"
  if [ -z "$issue_id" ]; then
    log "  (no issue ID to delete)"
    return 0
  fi
  if $DRY_RUN; then
    log "[DRY RUN] DELETE $AIS_HOST/api/v1/issues/$issue_id"
    return 0
  fi
  if [ -z "$AIS_API_KEY" ]; then
    log "⚠ WARNING: AIS_API_KEY not set — cannot delete issue $issue_id"
    log "  Run manually: AIS_API_KEY=ask_xxx ./benchmark/cleanup.sh"
    return 0
  fi
  local http_code
  http_code=$(curl -s -o /dev/null -w "%{http_code}" \
    -X DELETE \
    -H "x-api-key: $AIS_API_KEY" \
    "${AIS_HOST}/api/v1/issues/${issue_id}")

  if [ "$http_code" = "200" ] || [ "$http_code" = "204" ]; then
    log "  Issue $issue_id deleted from KB (HTTP $http_code)"
  elif [ "$http_code" = "404" ]; then
    log "  Issue $issue_id already gone (HTTP 404)"
  else
    log "⚠ WARNING: Failed to delete issue $issue_id (HTTP $http_code)"
  fi
}
