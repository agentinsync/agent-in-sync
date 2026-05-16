#!/usr/bin/env bash
# benchmark/sentry/run-all.sh
#
# Runs the Sentry benchmark for all (or selected) bugs.
#
# Usage:
#   ./benchmark/sentry/run-all.sh                      # all 10 bugs, sequential
#   ./benchmark/sentry/run-all.sh --jobs 3             # 3 in parallel
#   ./benchmark/sentry/run-all.sh --bugs "S1 S3 S5"   # specific bugs
#   ./benchmark/sentry/run-all.sh --dry-run            # print commands only
#   ./benchmark/sentry/run-all.sh --skip-done          # skip bugs with existing data

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ALL_BUGS=$(jq -r '.[].id' "$SCRIPT_DIR/bugs.json" | tr '\n' ' ')

BUGS=""
JOBS=1
DRY_RUN=false
SKIP_DONE=false
EXTRA_FLAGS=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --jobs)           JOBS="$2"; shift 2 ;;
    --bugs)           BUGS="$2"; shift 2 ;;
    --dry-run)        DRY_RUN=true; shift ;;
    --skip-done)      SKIP_DONE=true; shift ;;
    --runs)           EXTRA_FLAGS="$EXTRA_FLAGS --runs $2"; shift 2 ;;
    --keep-worktrees) EXTRA_FLAGS="$EXTRA_FLAGS --keep-worktrees"; shift ;;
    --no-vote)        EXTRA_FLAGS="$EXTRA_FLAGS --no-vote"; shift ;;
    --search-limit)   EXTRA_FLAGS="$EXTRA_FLAGS --search-limit $2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

BUGS="${BUGS:-$ALL_BUGS}"
$DRY_RUN && EXTRA_FLAGS="$EXTRA_FLAGS --dry-run"

has_data() {
  local bug="$1"
  local csv="$SCRIPT_DIR/results.csv"
  local col
  col=$(head -1 "$csv" | tr ',' '\n' | grep -n '^input_tokens$' | cut -d: -f1)
  [ -n "$col" ] || return 1
  grep "^${bug}," "$csv" | awk -F',' -v c="$col" '$c != ""' | grep -q . 2>/dev/null
}

run_bug() {
  local bug="$1"
  if $SKIP_DONE && has_data "$bug"; then
    echo "[SKIP] $bug — already has data in results.csv"
    return 0
  fi
  echo "[START] $bug"
  local rc=0
  "$SCRIPT_DIR/auto-run.sh" "$bug" $EXTRA_FLAGS || rc=$?
  if [ "$rc" -eq 0 ]; then
    echo "[DONE] $bug"
  else
    echo "[FAILED] $bug (exit $rc)"
    return 1
  fi
}

export -f run_bug has_data
export SCRIPT_DIR SKIP_DONE DRY_RUN EXTRA_FLAGS

echo "=== Sentry Benchmark: Full Run ==="
echo "Bugs: $BUGS"
echo "Jobs: $JOBS"
$DRY_RUN && echo "(DRY RUN)"
echo ""

OVERALL_RC=0

if [ "$JOBS" -gt 1 ]; then
  echo "Running $JOBS bugs in parallel..."
  echo ""
  echo "$BUGS" | tr ' ' '\n' | \
    xargs -P "$JOBS" -I{} bash -c 'run_bug "$@"' _ {} || OVERALL_RC=$?

  if [ "$OVERALL_RC" -ne 0 ]; then
    echo ""
    echo "⚠ WARNING: One or more bugs failed (xargs exit $OVERALL_RC)"
  fi
else
  FAILED_BUGS=()
  for bug in $BUGS; do
    if ! run_bug "$bug"; then
      FAILED_BUGS+=("$bug")
      OVERALL_RC=1
    fi
    echo ""
  done

  if [ "${#FAILED_BUGS[@]}" -gt 0 ]; then
    echo ""
    echo "⚠ Failed bugs (${#FAILED_BUGS[@]}):"
    for b in "${FAILED_BUGS[@]}"; do
      echo "  - $b"
    done
  fi
fi

echo ""
echo "=== All done ==="
echo "Results: $SCRIPT_DIR/results.csv"

exit $OVERALL_RC
