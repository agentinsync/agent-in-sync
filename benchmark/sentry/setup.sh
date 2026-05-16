#!/usr/bin/env bash
# benchmark/sentry/setup.sh
#
# Sets up the Sentry benchmark environment:
#   1. Clones AI-Code-Review-Evals/entelligence-sentry into .repo/
#   2. Extracts PR diffs as patch files via gh CLI
#   3. Validates patches apply cleanly
#   4. Copies AIS rules/skills into ais-inject/
#   5. Generates results.csv template
#
# Prerequisites: gh (authenticated), git, jq
#
# Usage:
#   ./benchmark/sentry/setup.sh              # full setup
#   ./benchmark/sentry/setup.sh --skip-clone  # re-extract patches without re-cloning
#   ./benchmark/sentry/setup.sh --clean        # remove generated files (keep .repo/) and re-run
#   ./benchmark/sentry/setup.sh --clean-all    # remove everything including .repo/ and re-run

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

SENTRY_REPO="AI-Code-Review-Evals/entelligence-sentry"
CLONE_DIR="$SCRIPT_DIR/.repo"
PATCHES_DIR="$SCRIPT_DIR/patches"
BUGS_JSON="$SCRIPT_DIR/bugs.json"
RESULTS_CSV="$SCRIPT_DIR/results.csv"

SKIP_CLONE=false
CLEAN=false
CLEAN_ALL=false
for arg in "$@"; do
  case "$arg" in
    --skip-clone) SKIP_CLONE=true ;;
    --clean)      CLEAN=true ;;
    --clean-all)  CLEAN=true; CLEAN_ALL=true ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

log() { echo "[$(date '+%H:%M:%S')] $*" >&2; }

# ──────────────────────────────────────────
# Clean (remove all generated artifacts)
# ──────────────────────────────────────────
if $CLEAN; then
  log "Cleaning generated files..."
  if $CLEAN_ALL; then
    rm -rf "$CLONE_DIR"     && log "  Removed .repo/"
  else
    log "  Keeping .repo/ (use --clean-all to remove)"
    SKIP_CLONE=true
  fi
  rm -rf "$PATCHES_DIR"     && log "  Removed patches/"
  rm -f  "$RESULTS_CSV"     && log "  Removed results.csv"
  rm -f  "$SCRIPT_DIR/empty-mcp.json" && log "  Removed empty-mcp.json"
  rm -rf "$SCRIPT_DIR/runs" && log "  Removed runs/"
  log "Clean complete. Re-running setup..."
  echo ""
fi

# ──────────────────────────────────────────
# Preflight
# ──────────────────────────────────────────
missing=()
command -v gh  >/dev/null 2>&1 || missing+=("gh (GitHub CLI)")
command -v git >/dev/null 2>&1 || missing+=("git")
command -v jq  >/dev/null 2>&1 || missing+=("jq")

if [ "${#missing[@]}" -gt 0 ]; then
  echo "Error: Missing required tools:"
  for t in "${missing[@]}"; do echo "  - $t"; done
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Error: gh is not authenticated. Run 'gh auth login' first."
  exit 1
fi

[ -f "$BUGS_JSON" ] || { echo "Error: bugs.json not found at $BUGS_JSON"; exit 1; }

log "Setup: Sentry Benchmark"
log "Repo:  $SENTRY_REPO"

# ──────────────────────────────────────────
# Step 1: Clone
# ──────────────────────────────────────────
if $SKIP_CLONE && [ -d "$CLONE_DIR/.git" ]; then
  log "Skipping clone (--skip-clone, repo exists at $CLONE_DIR)"
else
  if [ -d "$CLONE_DIR" ]; then
    log "Removing existing clone..."
    rm -rf "$CLONE_DIR"
  fi
  log "Cloning $SENTRY_REPO..."
  git clone "https://github.com/${SENTRY_REPO}.git" "$CLONE_DIR"
  log "Clone complete: $CLONE_DIR"
fi

# ──────────────────────────────────────────
# Step 2: Fetch PR metadata + extract patches
# ──────────────────────────────────────────
mkdir -p "$PATCHES_DIR"
PR_META="$PATCHES_DIR/pr-metadata.json"

prs=$(jq -r '.[].pr' "$BUGS_JSON" | sort -un)

log "Fetching PR metadata and patches for PRs: $(echo $prs | tr '\n' ' ')"

# Build metadata JSON: { "6": { "base": "branch-name" }, ... }
echo "{}" > "$PR_META"
for pr in $prs; do
  log "  PR #${pr}: fetching metadata..."
  base_ref=$(gh pr view "$pr" --repo "$SENTRY_REPO" --json baseRefName -q '.baseRefName' 2>/dev/null)
  if [ -z "$base_ref" ]; then
    log "  ERROR: Could not fetch base branch for PR #${pr}"
    exit 1
  fi
  log "  PR #${pr}: base branch = $base_ref"

  # Update metadata JSON
  jq --arg pr "$pr" --arg base "$base_ref" \
    '.[$pr] = { "base": $base }' "$PR_META" > "${PR_META}.tmp" && mv "${PR_META}.tmp" "$PR_META"

  # Extract patch
  patch_file="$PATCHES_DIR/PR${pr}.patch"
  if [ -f "$patch_file" ]; then
    log "  PR #${pr}: patch already exists, skipping extraction"
    continue
  fi

  log "  PR #${pr}: fetching diff..."
  if gh pr diff "$pr" --repo "$SENTRY_REPO" > "$patch_file" 2>/dev/null; then
    lines=$(wc -l < "$patch_file" | tr -d ' ')
    log "  PR #${pr}: saved ($lines lines) → $patch_file"
  else
    log "  ERROR: Failed to fetch diff for PR #${pr}"
    rm -f "$patch_file"
    exit 1
  fi
done

log "PR metadata saved to $PR_META"

# ──────────────────────────────────────────
# Step 3: Validate patches against correct base branches
# ──────────────────────────────────────────
log "Validating patches against their respective base branches..."

cd "$CLONE_DIR"

all_ok=true
for pr in $prs; do
  patch_file="$PATCHES_DIR/PR${pr}.patch"
  base_ref=$(jq -r --arg pr "$pr" '.[$pr].base' "$PR_META")

  # Ensure the base branch exists locally
  if ! git rev-parse --verify "$base_ref" >/dev/null 2>&1; then
    if ! git rev-parse --verify "origin/$base_ref" >/dev/null 2>&1; then
      log "  PR #${pr}: ✗ base branch '$base_ref' not found locally or in remote"
      all_ok=false
      continue
    fi
    git checkout -q "$base_ref" 2>/dev/null || git checkout -q -b "$base_ref" "origin/$base_ref" 2>/dev/null
  fi

  # Validate patch against the base branch
  git checkout -q "$base_ref" 2>/dev/null
  if git apply --check "$patch_file" 2>/dev/null; then
    log "  PR #${pr}: ✓ applies cleanly on $base_ref"
  else
    log "  PR #${pr}: ✗ does NOT apply cleanly on $base_ref — may need manual adjustment"
    all_ok=false
  fi
done

# Return to default branch
git checkout -q - 2>/dev/null || true

if ! $all_ok; then
  log "WARNING: Some patches failed validation. Review and fix before running benchmarks."
fi

cd "$SCRIPT_DIR"

# ──────────────────────────────────────────
# Step 4: Copy AIS inject files
# ──────────────────────────────────────────
log "Copying AIS rules and skills into ais-inject/..."

AIS_INJECT="$SCRIPT_DIR/ais-inject"
mkdir -p "$AIS_INJECT/.claude/rules" "$AIS_INJECT/.claude/skills/agent-in-sync"

src_rules="$REPO_ROOT/.claude/rules/agent-in-sync-workflow.md"
src_skill="$REPO_ROOT/.claude/skills/agent-in-sync/SKILL.md"

if [ -f "$src_rules" ]; then
  cp "$src_rules" "$AIS_INJECT/.claude/rules/agent-in-sync-workflow.md"
  log "  Copied rules: agent-in-sync-workflow.md"
else
  log "  WARNING: $src_rules not found"
fi

if [ -f "$src_skill" ]; then
  cp "$src_skill" "$AIS_INJECT/.claude/skills/agent-in-sync/SKILL.md"
  log "  Copied skill: SKILL.md"
else
  log "  WARNING: $src_skill not found"
fi

# ──────────────────────────────────────────
# Step 5: Generate results.csv
# ──────────────────────────────────────────
if [ -f "$RESULTS_CSV" ]; then
  log "results.csv already exists — skipping generation"
  log "  Delete $RESULTS_CSV and re-run setup to regenerate"
else
  log "Generating results.csv template..."

  header="bug_id,category,difficulty,condition,run,input_tokens,output_tokens,total_cost_usd,tool_calls,wall_clock_s,correct,searched_ais,found_solution,submitted_issue_id,notes,timestamp"
  echo "$header" > "$RESULTS_CSV"

  jq -r '.[] | "\(.id),\(.category),\(.severity)"' "$BUGS_JSON" | while IFS=, read -r bug_id category severity; do
    for condition in without_ais with_ais; do
      for run_num in 1 2 3; do
        echo "${bug_id},${category},${severity},${condition},${run_num},,,,,,,,,,,"
      done
    done
  done >> "$RESULTS_CSV"

  row_count=$(( $(wc -l < "$RESULTS_CSV" | tr -d ' ') - 1 ))
  log "  Generated $row_count rows (10 bugs × 2 conditions × 3 runs)"
fi

# ──────────────────────────────────────────
# Step 6: Create empty-mcp.json if missing
# ──────────────────────────────────────────
EMPTY_MCP="$SCRIPT_DIR/empty-mcp.json"
if [ ! -f "$EMPTY_MCP" ]; then
  echo '{ "mcpServers": {} }' > "$EMPTY_MCP"
  log "Created empty-mcp.json"
fi

# ──────────────────────────────────────────
# Done
# ──────────────────────────────────────────
echo ""
log "=== Setup complete ==="
log "  Clone:     $CLONE_DIR"
log "  Patches:   $PATCHES_DIR/ ($(ls "$PATCHES_DIR"/*.patch 2>/dev/null | wc -l | tr -d ' ') files)"
log "  AIS inject: $AIS_INJECT/"
log "  Results:   $RESULTS_CSV"
echo ""
prompt_count=$(ls "$SCRIPT_DIR/prompts/"*.md 2>/dev/null | wc -l | tr -d ' ')
if [ "$prompt_count" -eq 0 ]; then
  log "Next: Write prompts in $SCRIPT_DIR/prompts/ then run: ./benchmark/sentry/auto-run.sh S1 --dry-run"
else
  log "Prompts: $prompt_count found in $SCRIPT_DIR/prompts/"
  log "Ready to run: ./benchmark/sentry/auto-run.sh S1 --dry-run"
fi
