import { readdirSync, readFileSync, statSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';

export interface ParsedSkill {
  name: string;
  description: string;
  body: string;
  sourcePath: string;
}

export interface ParsedRule {
  name: string;
  description: string;
  alwaysApply: boolean;
  globs: string[];
  body: string;
  sourcePath: string;
}

/**
 * Resolve the root directory containing skills/ and rules/ content.
 * Published package: bundled content/ dir next to dist/.
 * Local dev: falls back to CWD (monorepo root).
 */
export function resolveContentRoot(): string {
  const pkgDir = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
  const bundledContent = join(pkgDir, 'content');

  try {
    if (statSync(bundledContent).isDirectory()) return bundledContent;
  } catch {
    return resolve(process.cwd());
  }

  return resolve(process.cwd());
}

/** Discover all SKILL.md files under `baseDir/skills/` */
export function discoverSkills(baseDir: string): ParsedSkill[] {
  const skillsDir = join(baseDir, 'skills');
  return discoverContent<ParsedSkill>(skillsDir, 'SKILL.md', parseSkillMd);
}

/** Discover all RULE.md files under `baseDir/rules/` */
export function discoverRules(baseDir: string): ParsedRule[] {
  const rulesDir = join(baseDir, 'rules');
  return discoverContent<ParsedRule>(rulesDir, 'RULE.md', parseRuleMd);
}

function parseSkillMd(filePath: string): ParsedSkill | null {
  const raw = readFileSync(filePath, 'utf-8');
  const { data, content } = matter(raw);

  if (typeof data.name !== 'string' || typeof data.description !== 'string') return null;

  return {
    name: data.name,
    description: data.description,
    body: content.trim(),
    sourcePath: filePath,
  };
}

function parseRuleMd(filePath: string): ParsedRule | null {
  const raw = readFileSync(filePath, 'utf-8');
  const { data, content } = matter(raw);

  if (typeof data.name !== 'string' || typeof data.description !== 'string') return null;

  return {
    name: data.name,
    description: data.description,
    alwaysApply: data.alwaysApply === true,
    globs: Array.isArray(data.globs)
      ? data.globs.filter((g: unknown) => typeof g === 'string')
      : [],
    body: content.trim(),
    sourcePath: filePath,
  };
}

function discoverContent<T>(
  dir: string,
  filename: string,
  parser: (filePath: string) => T | null
): T[] {
  const results: T[] = [];

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }

  for (const entry of entries) {
    const entryPath = join(dir, entry);
    try {
      if (!statSync(entryPath).isDirectory()) continue;
    } catch {
      continue;
    }

    const filePath = join(entryPath, filename);
    try {
      if (!statSync(filePath).isFile()) continue;
    } catch {
      continue;
    }

    const parsed = parser(filePath);
    if (parsed) results.push(parsed);
  }

  return results;
}
