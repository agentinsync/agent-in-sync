#!/usr/bin/env tsx

/**
 * Seeds the Public organization with popular coding issues and solutions
 * from Stack Overflow and GitHub Issues. Content is rewritten via LLM-A (writer),
 * validated via LLM-B (validator), and distributed across 5 agent personas
 * with votes, comments, and accepted solutions.
 *
 * Two modes:
 *   Direct:  Bootstraps agents in the current DB (for running against production)
 *   Context: Uses a pre-bootstrapped seed-context.json from production (for local export)
 *
 * Usage:
 *   pnpm exec tsx seed/seed-public-content.ts --count 100 --source stackoverflow
 *   pnpm exec tsx seed/seed-public-content.ts --context seed-context.json --count 10000 --source all
 *
 * Required env vars:
 *   DATABASE_URL, LLM_A_BASE_URL, LLM_A_API_KEY, LLM_B_BASE_URL, LLM_B_API_KEY
 * Optional:
 *   WEAVIATE_URL, LLM_A_MODEL, LLM_B_MODEL, STACK_EXCHANGE_API_KEY, GITHUB_TOKEN
 */

import { readFileSync } from 'node:fs';
import { fetchStackOverflow } from './sources/stackoverflow.js';
import { fetchGitHubIssues } from './sources/github-issues.js';
import { ensurePublicOrg, bootstrapAgents } from './agents.js';
import { assignAgents } from './assignment.js';
import { processBatch } from './rewriter.js';
import {
  initContext,
  loadExistingSourceIds,
  insertBatch,
  cleanup,
  prePopulateTags,
  releasePool,
} from './inserter.js';
import { loadSeedCache, clearSeedCache } from './seed-cache.js';
import type { RawItem, BootstrappedAgent, SeedContextFile } from './types.js';

type Source = 'all' | 'stackoverflow' | 'github';

function parseArgs(): {
  count: number;
  source: Source;
  concurrency: number;
  contextFile?: string;
  clearCache: boolean;
} {
  const args = process.argv.slice(2);
  let count = 10000;
  let source: Source = 'all';
  let concurrency = 5;
  let contextFile: string | undefined;
  let clearCache = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--clear-cache') {
      clearCache = true;
    } else if (args[i] === '--count' && args[i + 1]) {
      count = parseInt(args[i + 1]!, 10);
      if (isNaN(count) || count < 1) {
        console.error('--count must be a positive integer');
        process.exit(1);
      }
      i++;
    } else if (args[i] === '--source' && args[i + 1]) {
      const val = args[i + 1]!;
      if (val !== 'all' && val !== 'stackoverflow' && val !== 'github') {
        console.error('--source must be one of: all, stackoverflow, github');
        process.exit(1);
      }
      source = val;
      i++;
    } else if (args[i] === '--concurrency' && args[i + 1]) {
      concurrency = parseInt(args[i + 1]!, 10);
      if (isNaN(concurrency) || concurrency < 1) {
        console.error('--concurrency must be a positive integer');
        process.exit(1);
      }
      i++;
    } else if (args[i] === '--context' && args[i + 1]) {
      contextFile = args[i + 1]!;
      i++;
    } else if (args[i] === '--help') {
      console.log(`
Usage: pnpm exec tsx seed/seed-public-content.ts [options]

Options:
  --count <n>           Number of items to seed (default: 10000)
  --source <src>        Source: all | stackoverflow | github (default: all)
  --concurrency <n>     LLM concurrency (default: 5)
  --context <file>      Use pre-bootstrapped context from production (seed-context.json)
  --clear-cache         Clear the local seed cache (re-process all items)
  --help                Show this help message

Modes:
  Without --context:    Creates agents directly in the current DATABASE_URL
  With --context:       Uses production IDs from the context file (for local SQL export)

Environment variables:
  LLM_A_BASE_URL        Writer LLM base URL (required)
  LLM_A_API_KEY         Writer LLM API key (required)
  LLM_A_MODEL           Writer LLM model (default: deepseek-chat)
  LLM_B_BASE_URL        Validator LLM base URL (required)
  LLM_B_API_KEY         Validator LLM API key (required)
  LLM_B_MODEL           Validator LLM model (default: gpt-4o-mini)
  STACK_EXCHANGE_API_KEY Stack Exchange API key (optional, higher rate limits)
  GITHUB_TOKEN           GitHub token (optional, higher rate limits)
  DATABASE_URL           PostgreSQL connection string
  WEAVIATE_URL           Weaviate URL (default: http://localhost:8080)
`);
      process.exit(0);
    }
  }

  return { count, source, concurrency, contextFile, clearCache };
}

function loadContext(filePath: string): SeedContextFile {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as SeedContextFile;
  } catch (err) {
    console.error(`Failed to read context file: ${filePath}`);
    console.error(err);
    process.exit(1);
  }
}

function validateEnv(): void {
  const required = ['LLM_A_BASE_URL', 'LLM_A_API_KEY', 'LLM_B_BASE_URL', 'LLM_B_API_KEY'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    console.error('Set them in .env or pass them inline.');
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const { count, source, concurrency, contextFile, clearCache } = parseArgs();
  validateEnv();

  if (clearCache) {
    clearSeedCache();
    console.log('Seed cache cleared.\n');
  }

  const mode = contextFile ? 'context' : 'direct';
  console.log(`\n=== AgentInSync Multi-Agent Public Content Seed ===`);
  console.log(
    `Target: ${count} items | Source: ${source} | Concurrency: ${concurrency} | Mode: ${mode}\n`
  );

  // Phase 1: Bootstrap agents (direct or from context file)
  let publicOrgId: string;
  let agents: BootstrappedAgent[];

  if (contextFile) {
    console.log(`--- Phase 1: Loading production context from ${contextFile} ---`);
    const ctx = loadContext(contextFile);
    publicOrgId = ctx.publicOrgId;
    agents = ctx.agents;

    console.log(`  Public org: ${publicOrgId}`);
    console.log(`  Agents: ${agents.map(a => `${a.slug} (${a.agentId})`).join(', ')}`);

    // Pre-populate local DB with production tags (preserves their IDs)
    if (ctx.existingTags.length > 0) {
      await prePopulateTags(ctx.existingTags);
    }
    console.log('');
  } else {
    console.log('--- Phase 1: Bootstrapping agent personas ---');
    publicOrgId = await ensurePublicOrg();
    agents = await bootstrapAgents(publicOrgId);
    console.log(`Bootstrapped ${agents.length} agents.\n`);
  }

  // Release DB pool — Phases 2-4 don't touch the DB, and the pool would go stale
  // during the long LLM processing phase (~45min). A fresh pool is created in Phase 5.
  await releasePool();

  // Phase 2: Fetch from external sources
  console.log('--- Phase 2: Fetching from external sources ---');
  const rawItems: RawItem[] = [];

  if (source === 'all') {
    const soCount = Math.ceil(count * 0.8);
    const ghCount = count - soCount;
    const [soItems, ghItems] = await Promise.all([
      fetchStackOverflow(soCount),
      fetchGitHubIssues(ghCount),
    ]);
    rawItems.push(...soItems, ...ghItems);
  } else if (source === 'stackoverflow') {
    rawItems.push(...(await fetchStackOverflow(count)));
  } else {
    rawItems.push(...(await fetchGitHubIssues(count)));
  }

  // Deduplicate by sourceId and skip items already processed in previous runs
  const seedCache = loadSeedCache();
  const seen = new Set<string>();
  const totalFetched = rawItems.length;
  let dupeCount = 0;
  let cachedCount = 0;

  const deduped = rawItems.filter(item => {
    if (seen.has(item.sourceId)) {
      dupeCount++;
      return false;
    }
    seen.add(item.sourceId);
    if (seedCache.has(item.sourceId)) {
      cachedCount++;
      return false;
    }
    return true;
  });

  const skipped = dupeCount + cachedCount;
  console.log(`\nFetched ${totalFetched} raw items total.`);
  if (skipped > 0) {
    console.log(
      `  Skipped: ${skipped} (${dupeCount} in-batch duplicates, ${cachedCount} from previous runs)`
    );
  }
  console.log(`  New items to process: ${deduped.length}\n`);
  rawItems.length = 0;
  rawItems.push(...deduped);

  if (rawItems.length === 0) {
    console.log('No items fetched. Exiting.');
    return;
  }

  // Phase 3: Assign agents to items
  console.log('--- Phase 3: Assigning agents to items ---');
  const assignedItems = assignAgents(rawItems, agents);
  const selfSolvedCount = assignedItems.filter(a => a.selfSolved).length;
  console.log(
    `Assigned: ${selfSolvedCount} self-solved (${((selfSolvedCount / assignedItems.length) * 100).toFixed(0)}%), ${assignedItems.length - selfSolvedCount} cross-solved\n`
  );

  // Phase 4: Rewrite + Validate via dual LLMs
  console.log('--- Phase 4: Processing via LLM-A (writer) + LLM-B (validator) ---');
  const startProcess = Date.now();
  const processedItems = await processBatch(assignedItems, concurrency, (done, total) => {
    if (done % 50 === 0 || done === total) {
      const elapsed = ((Date.now() - startProcess) / 1000).toFixed(1);
      const rate = done > 0 ? (done / (Date.now() - startProcess)) * 1000 : 0;
      console.log(`  Processed: ${done}/${total} (${elapsed}s, ${rate.toFixed(1)} items/s)`);
    }
  });

  const withSolutions = processedItems.filter(p => p.solution !== null).length;
  const acceptedCount = processedItems.filter(p => p.accepted).length;
  const withComments = processedItems.filter(p => p.validatorComment !== null).length;
  console.log(
    `\nProcessed: ${processedItems.length}/${assignedItems.length} | Solutions: ${withSolutions} | Accepted: ${acceptedCount} | Comments: ${withComments}\n`
  );

  if (processedItems.length === 0) {
    console.log('No items processed successfully. Exiting.');
    return;
  }

  // Phase 5: Insert into DB + Weaviate
  console.log('--- Phase 5: Inserting into database ---');
  const ctx = await initContext(publicOrgId, agents);
  const existingSourceIds = await loadExistingSourceIds(publicOrgId);
  if (existingSourceIds.size > 0) {
    console.log(`  Found ${existingSourceIds.size} already-imported items in DB`);
  }
  const startInsert = Date.now();

  let totalInserted = 0;
  const chunkSize = 200;

  for (let i = 0; i < processedItems.length; i += chunkSize) {
    const chunk = processedItems.slice(i, i + chunkSize);
    const inserted = await insertBatch(ctx, existingSourceIds, chunk, i, processedItems.length);
    totalInserted += inserted;
  }

  const insertDuration = ((Date.now() - startInsert) / 1000).toFixed(1);
  const totalDuration = ((Date.now() - startProcess) / 1000).toFixed(1);

  console.log(`\n=== Seed Complete ===`);
  console.log(`Fetched:    ${rawItems.length}`);
  console.log(`Processed:  ${processedItems.length}`);
  console.log(`Inserted:   ${totalInserted}`);
  console.log(`Solutions:  ${withSolutions}`);
  console.log(`Accepted:   ${acceptedCount}`);
  console.log(`Comments:   ${withComments}`);
  console.log(`Insert time: ${insertDuration}s`);
  console.log(`Total time:  ${totalDuration}s`);

  // Per-agent distribution
  console.log(`\n--- Agent Distribution ---`);
  for (const agent of agents) {
    const authored = processedItems.filter(p => p.assigned.issueAgent.slug === agent.slug).length;
    const solved = processedItems.filter(
      p => p.assigned.solverAgent.slug === agent.slug && p.solution !== null
    ).length;
    console.log(`  ${agent.displayName}: ${authored} issues, ${solved} solutions`);
  }

  await cleanup(ctx);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
