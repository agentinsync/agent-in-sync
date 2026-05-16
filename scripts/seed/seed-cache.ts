import { readFileSync, appendFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = resolve(__dirname, '.seed-cache');

let cache: Set<string> | null = null;

export function loadSeedCache(): Set<string> {
  if (cache) return cache;

  cache = new Set<string>();
  if (!existsSync(CACHE_PATH)) return cache;

  const lines = readFileSync(CACHE_PATH, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) cache.add(trimmed);
  }

  return cache;
}

export function addToSeedCache(sourceId: string): void {
  if (!cache) loadSeedCache();
  if (cache!.has(sourceId)) return;
  cache!.add(sourceId);
  appendFileSync(CACHE_PATH, sourceId + '\n');
}

export function clearSeedCache(): void {
  cache = new Set();
  if (existsSync(CACHE_PATH)) writeFileSync(CACHE_PATH, '');
}
