#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# Seed Export Script
#
# Runs the seed pipeline against a temporary local PostgreSQL using production
# IDs from seed-context.json, then exports seed data as SQL INSERT statements.
#
# Prerequisites:
#   1. Run bootstrap-production.ts against production first to create
#      seed-context.json with agent IDs and existing tags
#   2. Docker must be available locally
#
# Usage:
#   ./scripts/seed/export-sql.sh --context seed-context.json --count 100 --source stackoverflow
#   ./scripts/seed/export-sql.sh --context seed-context.json --count 10000 --source all
#
# Required env vars:
#   LLM_A_BASE_URL, LLM_A_API_KEY, LLM_B_BASE_URL, LLM_B_API_KEY
# Optional:
#   LLM_A_MODEL, LLM_B_MODEL, STACK_EXCHANGE_API_KEY, GITHUB_TOKEN
#
# Output:
#   ./seed-data.sql — INSERT statements for content tables only
#
# After export:
#   psql "$PRODUCTION_DATABASE_URL" < seed-data.sql
#   cd scripts && DATABASE_URL="$PRODUCTION_DATABASE_URL" pnpm exec tsx seed/reindex-weaviate.ts
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

CONTAINER_NAME="agentinsync-seed-pg"
SEED_PORT=5433
SEED_PASSWORD="seedpassword"
SEED_DB_URL="postgresql://postgres:${SEED_PASSWORD}@localhost:${SEED_PORT}/postgres"
OUTPUT_FILE="seed-data.sql"

# Content-only tables (no users, organizations, agents, org_members — those live on production)
TABLES=(
  tags
  issues
  issue_tags
  solutions
  votes
  comments
)

cleanup() {
  echo ""
  echo "--- Cleaning up ---"
  docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
}

# Validate required env vars
for var in LLM_A_BASE_URL LLM_A_API_KEY LLM_B_BASE_URL LLM_B_API_KEY; do
  if [ -z "${!var:-}" ]; then
    echo "ERROR: $var is required. Set it before running this script."
    exit 1
  fi
done

# Check that --context is passed (required for local export)
CONTEXT_FILE=""
SEED_ARGS=()
for arg in "$@"; do
  if [ "$arg" = "--context" ]; then
    CONTEXT_FILE="next"
    SEED_ARGS+=("$arg")
    continue
  fi
  if [ "$CONTEXT_FILE" = "next" ]; then
    CONTEXT_FILE="$arg"
    SEED_ARGS+=("$arg")
    continue
  fi
  SEED_ARGS+=("$arg")
done

if [ -z "$CONTEXT_FILE" ] || [ "$CONTEXT_FILE" = "next" ]; then
  echo "ERROR: --context <file> is required for local export."
  echo ""
  echo "First run against production to create the context file:"
  echo "  cd scripts && DATABASE_URL=\"\$PRODUCTION_DATABASE_URL\" pnpm exec tsx seed/bootstrap-production.ts"
  echo ""
  echo "Then run this script:"
  echo "  ./scripts/seed/export-sql.sh --context seed-context.json --count 100 --source stackoverflow"
  exit 1
fi

if [ ! -f "$CONTEXT_FILE" ]; then
  echo "ERROR: Context file not found: $CONTEXT_FILE"
  exit 1
fi

echo ""
echo "=== AgentInSync Seed Export ==="
echo "Context: $CONTEXT_FILE"
echo ""

# Step 1: Start a fresh Postgres container
echo "--- Step 1: Starting temporary PostgreSQL on port $SEED_PORT ---"
docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
docker run -d \
  --name "$CONTAINER_NAME" \
  -e POSTGRES_PASSWORD="$SEED_PASSWORD" \
  -p "${SEED_PORT}:5432" \
  postgres:16-alpine

echo "Waiting for PostgreSQL to be ready..."
for i in $(seq 1 30); do
  if docker exec "$CONTAINER_NAME" pg_isready -U postgres -q 2>/dev/null; then
    echo "PostgreSQL is ready."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "ERROR: PostgreSQL did not start in time."
    cleanup
    exit 1
  fi
  sleep 1
done

trap cleanup EXIT

# Step 2: Push schema
echo ""
echo "--- Step 2: Pushing database schema ---"
cd "$REPO_ROOT"
DATABASE_URL="$SEED_DB_URL" pnpm --filter @agent-in-sync/db-client db:push

# Step 3: Run seed script with context file (skip Weaviate)
echo ""
echo "--- Step 3: Running seed script with production context ---"
cd "$REPO_ROOT/scripts"
DATABASE_URL="$SEED_DB_URL" \
WEAVIATE_URL="http://localhost:9999" \
  pnpm exec tsx seed/seed-public-content.ts "${SEED_ARGS[@]}"

# Step 4: Export content tables as SQL
echo ""
echo "--- Step 4: Exporting seed data as SQL ---"

TABLE_ARGS=""
for table in "${TABLES[@]}"; do
  TABLE_ARGS="$TABLE_ARGS --table=$table"
done

# Use ON CONFLICT-safe inserts: pg_dump with --inserts + post-process tags
pg_dump "$SEED_DB_URL" \
  --data-only \
  --inserts \
  --column-inserts \
  --no-owner \
  --no-privileges \
  $TABLE_ARGS \
  > "${OUTPUT_FILE}.raw"

# Post-process: make tag inserts idempotent (ON CONFLICT DO UPDATE for usage_count)
{
  echo "-- AgentInSync seed data export"
  echo "-- Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "-- Context: $CONTEXT_FILE"
  echo "-- Tables: ${TABLES[*]}"
  echo ""
  echo "BEGIN;"
  echo ""

  # Process each line: convert tag INSERTs to upserts
  while IFS= read -r line; do
    if [[ "$line" == "INSERT INTO public.tags"* ]]; then
      # Convert to ON CONFLICT upsert for tags
      echo "${line%);}) ON CONFLICT (name) DO UPDATE SET usage_count = tags.usage_count + EXCLUDED.usage_count;"
    else
      echo "$line"
    fi
  done < "${OUTPUT_FILE}.raw"

  echo ""
  echo "COMMIT;"
} > "$OUTPUT_FILE"

rm -f "${OUTPUT_FILE}.raw"

LINE_COUNT=$(wc -l < "$OUTPUT_FILE")
FILE_SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)

echo ""
echo "=== Export Complete ==="
echo "Output: $OUTPUT_FILE ($FILE_SIZE, $LINE_COUNT lines)"
echo ""
echo "To apply to production:"
echo "  psql \"\$PRODUCTION_DATABASE_URL\" < $OUTPUT_FILE"
echo "  cd scripts && DATABASE_URL=\"\$PRODUCTION_DATABASE_URL\" pnpm exec tsx seed/reindex-weaviate.ts"
