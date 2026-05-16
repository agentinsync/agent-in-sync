import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import type { AgentConfig } from '../constants.js';
import type { ParsedRule, ParsedSkill } from './discover.js';
import { transformRule } from './rule-adapters.js';

interface InstallResult {
  type: 'skill' | 'rule';
  name: string;
  targetPath: string;
  success: boolean;
  error?: string;
}

/** Install a single skill to the agent's skills directory */
export function installSkill(
  skill: ParsedSkill,
  agent: AgentConfig,
  projectRoot: string
): InstallResult {
  const targetDir = join(projectRoot, agent.skillsDir, skill.name);
  const targetPath = join(targetDir, 'SKILL.md');

  try {
    mkdirSync(targetDir, { recursive: true });
    copyFileSync(skill.sourcePath, targetPath);
    return {
      type: 'skill',
      name: skill.name,
      targetPath: relPath(projectRoot, targetPath),
      success: true,
    };
  } catch (err) {
    return {
      type: 'skill',
      name: skill.name,
      targetPath: relPath(projectRoot, targetPath),
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/** Install a single rule to the agent's rules location */
export function installRule(
  rule: ParsedRule,
  agent: AgentConfig,
  projectRoot: string
): InstallResult {
  const transformed = transformRule(rule, agent.rulesFormat);

  if (agent.rulesFormat === 'agents-md') {
    return installToAgentsMd(rule.name, transformed.content, projectRoot);
  }

  const targetPath = join(projectRoot, agent.rulesDir, transformed.filename);

  try {
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, transformed.content, 'utf-8');
    return {
      type: 'rule',
      name: rule.name,
      targetPath: relPath(projectRoot, targetPath),
      success: true,
    };
  } catch (err) {
    return {
      type: 'rule',
      name: rule.name,
      targetPath: relPath(projectRoot, targetPath),
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/** Append or replace rule content in AGENTS.md using idempotent markers */
function installToAgentsMd(
  ruleName: string,
  markedContent: string,
  projectRoot: string
): InstallResult {
  const agentsMdPath = join(projectRoot, 'AGENTS.md');
  const startMarker = `<!-- agent-in-sync:start:${ruleName} -->`;
  const endMarker = `<!-- agent-in-sync:end:${ruleName} -->`;

  try {
    let existing = '';
    if (existsSync(agentsMdPath)) {
      existing = readFileSync(agentsMdPath, 'utf-8');
    }

    const startIdx = existing.indexOf(startMarker);
    const endIdx = existing.indexOf(endMarker);

    let updated: string;
    if (startIdx !== -1 && endIdx !== -1) {
      // Replace existing section
      updated =
        existing.slice(0, startIdx) + markedContent + existing.slice(endIdx + endMarker.length);
    } else {
      // Append new section
      updated = existing
        ? existing.trimEnd() + '\n\n' + markedContent + '\n'
        : markedContent + '\n';
    }

    writeFileSync(agentsMdPath, updated, 'utf-8');
    return { type: 'rule', name: ruleName, targetPath: 'AGENTS.md', success: true };
  } catch (err) {
    return {
      type: 'rule',
      name: ruleName,
      targetPath: 'AGENTS.md',
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

function relPath(base: string, full: string): string {
  return full.startsWith(base) ? full.slice(base.length + 1) : full;
}
