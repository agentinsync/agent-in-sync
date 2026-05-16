#!/usr/bin/env bash
# benchmark/sentry/seed.sh
#
# Seeds a correct solution for a Sentry bug into the AIS knowledge base,
# then saves the resulting issue_id back into bugs.json as .seed_issue_id.
#
# The solution is auto-generated from data we already have:
#   - bugs.json    → title, description, category
#   - prompts/     → symptom the agent sees
#   - patches/     → the actual PR diff that fixes the bug
#
# After seeding, auto-run.sh for this bug will skip Phase 2 (submit) and run
# Phase 3 normally — the agent searches the KB without knowing the issue_id.
#
# Usage:
#   ./benchmark/sentry/seed.sh <BUG_ID>                     # auto-generate solution
#   ./benchmark/sentry/seed.sh <BUG_ID> --solution "text"   # override solution text
#   ./benchmark/sentry/seed.sh <BUG_ID> --show              # print current seed_issue_id
#   ./benchmark/sentry/seed.sh <BUG_ID> --clear             # remove seed_issue_id (does NOT delete from KB)
#   ./benchmark/sentry/seed.sh --all                        # seed all bugs that have no seed yet
#
# Prerequisites:
#   AIS_API_KEY — API key with write access (ask_prv_xxx)
#   AIS_HOST    — AIS server URL (default: https://example.com)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUGS_JSON="$SCRIPT_DIR/bugs.json"
PATCHES_DIR="$SCRIPT_DIR/patches"

BUG="${1:-}"
SOLUTION_OVERRIDE=""
CLEAR=false
SHOW=false
SEED_ALL=false
AIS_HOST="${AIS_HOST:-https://example.com}"
AIS_API_KEY="${AIS_API_KEY:-}"

log() { echo "[$(date '+%H:%M:%S')] $*" >&2; }
die() { echo "Error: $*" >&2; exit 1; }

if [ -z "$BUG" ]; then
  echo "Usage: $0 <BUG_ID>"
  echo "       $0 <BUG_ID> --solution \"override solution text\""
  echo "       $0 <BUG_ID> --show"
  echo "       $0 <BUG_ID> --clear"
  echo "       $0 --all"
  echo ""
  echo "Bug IDs: $(jq -r '.[].id' "$BUGS_JSON" | tr '\n' ' ')"
  exit 1
fi

if [ "$BUG" = "--all" ]; then SEED_ALL=true; BUG=""; fi

shift || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --solution) SOLUTION_OVERRIDE="${2:?--solution requires text}"; shift ;;
    --clear)    CLEAR=true ;;
    --show)     SHOW=true ;;
    *) die "Unknown option: $1" ;;
  esac
  shift
done

# ──────────────────────────────────────────
# --all: iterate over every unseeded bug
# ──────────────────────────────────────────
if $SEED_ALL; then
  ALL_IDS=$(jq -r '.[] | select(.seed_issue_id == null or .seed_issue_id == "") | .id' "$BUGS_JSON")
  if [ -z "$ALL_IDS" ]; then
    log "All bugs already have a seed_issue_id — nothing to do"
    exit 0
  fi
  log "Seeding all unseeded bugs: $(echo "$ALL_IDS" | tr '\n' ' ')"
  for id in $ALL_IDS; do
    "$SCRIPT_DIR/seed.sh" "$id" ${SOLUTION_OVERRIDE:+--solution "$SOLUTION_OVERRIDE"} || true
    echo ""
  done
  exit 0
fi

# ──────────────────────────────────────────
# Validate bug ID and read metadata
# ──────────────────────────────────────────
[ -f "$BUGS_JSON" ] || die "bugs.json not found at $BUGS_JSON"

BUG_ENTRY=$(jq -r --arg id "$BUG" '.[] | select(.id == $id)' "$BUGS_JSON")
[ -n "$BUG_ENTRY" ] || die "Bug '$BUG' not found. Valid IDs: $(jq -r '.[].id' "$BUGS_JSON" | tr '\n' ' ')"

BUG_TITLE=$(printf '%s' "$BUG_ENTRY"    | jq -r '.title')
BUG_DESC=$(printf '%s' "$BUG_ENTRY"     | jq -r '.description')
BUG_CATEGORY=$(printf '%s' "$BUG_ENTRY" | jq -r '.category')
BUG_PR=$(printf '%s' "$BUG_ENTRY"       | jq -r '.pr')
EXISTING_SEED=$(printf '%s' "$BUG_ENTRY" | jq -r '.seed_issue_id // empty')

# ──────────────────────────────────────────
# --show
# ──────────────────────────────────────────
if $SHOW; then
  if [ -n "$EXISTING_SEED" ]; then
    echo "Bug $BUG seed_issue_id: $EXISTING_SEED"
  else
    echo "Bug $BUG has no seed_issue_id"
  fi
  exit 0
fi

# ──────────────────────────────────────────
# --clear
# ──────────────────────────────────────────
if $CLEAR; then
  if [ -z "$EXISTING_SEED" ]; then
    log "Bug $BUG has no seed_issue_id — nothing to clear"
    exit 0
  fi
  log "Clearing seed_issue_id ($EXISTING_SEED) from bugs.json for $BUG"
  log "  Note: the issue is NOT deleted from the KB."
  log "  To delete: curl -X DELETE -H \"x-api-key: \$AIS_API_KEY\" ${AIS_HOST}/api/v1/submit/issues/${EXISTING_SEED}"
  jq --arg id "$BUG" '
    map(if .id == $id then del(.seed_issue_id) else . end)
  ' "$BUGS_JSON" > "${BUGS_JSON}.tmp" && mv "${BUGS_JSON}.tmp" "$BUGS_JSON"
  log "Done — bugs.json updated"
  exit 0
fi

# ──────────────────────────────────────────
# Preflight
# ──────────────────────────────────────────
command -v jq   >/dev/null 2>&1 || die "jq is required"
command -v curl >/dev/null 2>&1 || die "curl is required"
[ -n "$AIS_API_KEY" ] || die "AIS_API_KEY is not set. Export it: export AIS_API_KEY=ask_prv_xxx"

if [ -n "$EXISTING_SEED" ]; then
  log "Bug $BUG already has seed_issue_id=$EXISTING_SEED — skipping"
  log "  Use --clear to remove it first, then re-run to re-seed"
  exit 0
fi

# ──────────────────────────────────────────
# Auto-generate solution from patch + prompt
# ──────────────────────────────────────────
PATCH_FILE="$PATCHES_DIR/PR${BUG_PR}.patch"
PROMPT_FILE="$SCRIPT_DIR/prompts/${BUG}.md"

[ -f "$PATCH_FILE" ] || die "Patch file not found: $PATCH_FILE (run setup.sh first)"

PATCH_CONTENT=$(cat "$PATCH_FILE")
PROMPT_CONTENT=""
[ -f "$PROMPT_FILE" ] && PROMPT_CONTENT=$(cat "$PROMPT_FILE")

if [ -n "$SOLUTION_OVERRIDE" ]; then
  SOLUTION_TEXT="$SOLUTION_OVERRIDE"
else
  # Build solution from what we already know:
  #   1. Symptom (from the prompt the agent receives)
  #   2. Root cause (from bugs.json description)
  #   3. The fix (from the PR patch)
  #
  # The API limit is 50000 chars. PR patches can be large (multiple bugs share one PR),
  # so we reserve 1000 chars for the header sections and truncate the patch if needed.
  HEADER="## Symptom

${PROMPT_CONTENT:-$BUG_DESC}

## Root cause

${BUG_DESC}

## Fix

The following patch resolves the issue:

\`\`\`diff"
  FOOTER='```'
  MAX_PATCH=$(( 49800 - ${#HEADER} - ${#FOOTER} ))
  if [ "${#PATCH_CONTENT}" -gt "$MAX_PATCH" ]; then
    PATCH_CONTENT="${PATCH_CONTENT:0:$MAX_PATCH}"$'\n... (patch truncated)'
    log "  Patch truncated to fit 50000 char API limit"
  fi
  SOLUTION_TEXT="${HEADER}
${PATCH_CONTENT}
${FOOTER}"
fi

# ──────────────────────────────────────────
# POST to /api/v1/submit
# ──────────────────────────────────────────
log "Seeding solution for $BUG: $BUG_TITLE"

PAYLOAD=$(jq -n \
  --arg title    "$BUG_TITLE" \
  --arg desc     "$BUG_DESC" \
  --arg solution "$SOLUTION_TEXT" \
  --argjson tags "$(jq -n --arg c "$BUG_CATEGORY" --arg b "$BUG" '[$c, $b, "sentry", "oss-benchmark"]')" \
  '{title: $title, description: $desc, tags: $tags, solution: $solution}')

RESPONSE=$(curl -s -w '\n%{http_code}' \
  -X POST \
  -H "Content-Type: application/json" \
  -H "x-api-key: $AIS_API_KEY" \
  -d "$PAYLOAD" \
  "${AIS_HOST}/api/v1/submit")

HTTP_BODY=$(printf '%s' "$RESPONSE" | sed '$d')
HTTP_CODE=$(printf '%s' "$RESPONSE" | tail -n 1)

if [ "$HTTP_CODE" != "201" ]; then
  log "ERROR: POST /api/v1/submit returned HTTP $HTTP_CODE"
  log "Response: $HTTP_BODY"
  if [ "$HTTP_CODE" = "409" ]; then
    EXISTING_ID=$(printf '%s' "$HTTP_BODY" | jq -r '.exactMatch.id // empty' 2>/dev/null)
    if [ -n "$EXISTING_ID" ]; then
      log ""
      log "Duplicate detected — an identical issue already exists: $EXISTING_ID"
      log "To use it as the seed, run:"
      log "  jq 'map(if .id == \"$BUG\" then . + {\"seed_issue_id\": \"$EXISTING_ID\"} else . end)' bugs.json > bugs.json.tmp && mv bugs.json.tmp bugs.json"
    fi
  fi
  exit 1
fi

ISSUE_ID=$(printf '%s' "$HTTP_BODY"   | jq -r '.issue_id // empty')
SOLUTION_ID=$(printf '%s' "$HTTP_BODY" | jq -r '.solution_id // empty')

[ -n "$ISSUE_ID" ] || die "Could not parse issue_id from response: $HTTP_BODY"

log "  Issue:    $ISSUE_ID"
log "  Solution: ${SOLUTION_ID:-none}"

# ──────────────────────────────────────────
# Save seed_issue_id to bugs.json
# ──────────────────────────────────────────
jq --arg id "$BUG" --arg issue_id "$ISSUE_ID" '
  map(if .id == $id then . + {"seed_issue_id": $issue_id} else . end)
' "$BUGS_JSON" > "${BUGS_JSON}.tmp" && mv "${BUGS_JSON}.tmp" "$BUGS_JSON"

log "Saved to bugs.json: $BUG .seed_issue_id = $ISSUE_ID"
log ""
log "Run benchmark: ./benchmark/sentry/auto-run.sh $BUG"
