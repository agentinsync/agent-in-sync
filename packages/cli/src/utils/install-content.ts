import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, isAbsolute, join } from 'path';
import type { AgentConfig, InstallScope } from '../constants.js';
import type { ParsedRule, ParsedSkill } from './discover.js';
import { transformRule } from './rule-adapters.js';

interface InstallResult {
  type: 'skill' | 'rule';
  name: string;
  targetPath: string;
  success: boolean;
  error?: string;
  effectiveScope: InstallScope;
}

function resolveScope(agent: AgentConfig, scope: InstallScope): InstallScope {
  if (scope === 'user' && agent.noUserScope) return 'project';
  return scope;
}

function resolveBase(scope: InstallScope, projectRoot: string): string {
  return scope === 'user' ? homedir() : projectRoot;
}

function resolveSkillsDir(agent: AgentConfig, scope: InstallScope): string {
  return scope === 'user' ? (agent.userSkillsDir ?? agent.skillsDir) : agent.skillsDir;
}

function resolveRulesDir(agent: AgentConfig, scope: InstallScope): string {
  return scope === 'user' ? (agent.userRulesDir ?? agent.rulesDir) : agent.rulesDir;
}

export function installSkill(
  skill: ParsedSkill,
  agent: AgentConfig,
  projectRoot: string,
  scope: InstallScope = 'project'
): InstallResult {
  const effectiveScope = resolveScope(agent, scope);
  const base = resolveBase(effectiveScope, projectRoot);
  const skillsDir = resolveSkillsDir(agent, effectiveScope);
  const targetDir = join(base, skillsDir, skill.name);
  const targetPath = join(targetDir, 'SKILL.md');

  try {
    mkdirSync(targetDir, { recursive: true });
    copyFileSync(skill.sourcePath, targetPath);
    return {
      type: 'skill',
      name: skill.name,
      targetPath: displayPath(base, targetPath, effectiveScope),
      success: true,
      effectiveScope,
    };
  } catch (err) {
    return {
      type: 'skill',
      name: skill.name,
      targetPath: displayPath(base, targetPath, effectiveScope),
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
      effectiveScope,
    };
  }
}

export function installRule(
  rule: ParsedRule,
  agent: AgentConfig,
  projectRoot: string,
  scope: InstallScope = 'project'
): InstallResult {
  const effectiveScope = resolveScope(agent, scope);
  const transformed = transformRule(rule, agent.rulesFormat);

  if (agent.rulesFormat === 'agents-md') {
    const base = resolveBase(effectiveScope, projectRoot);
    const rulesDir = resolveRulesDir(agent, effectiveScope);
    const agentsMdPath = join(base, rulesDir, 'AGENTS.md');
    return installToAgentsMd(rule.name, transformed.content, agentsMdPath, base, effectiveScope);
  }

  const base = resolveBase(effectiveScope, projectRoot);
  const rulesDir = resolveRulesDir(agent, effectiveScope);
  const targetPath = join(base, rulesDir, transformed.filename);

  try {
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, transformed.content, 'utf-8');
    return {
      type: 'rule',
      name: rule.name,
      targetPath: displayPath(base, targetPath, effectiveScope),
      success: true,
      effectiveScope,
    };
  } catch (err) {
    return {
      type: 'rule',
      name: rule.name,
      targetPath: displayPath(base, targetPath, effectiveScope),
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
      effectiveScope,
    };
  }
}

function installToAgentsMd(
  ruleName: string,
  markedContent: string,
  agentsMdPath: string,
  base: string,
  effectiveScope: InstallScope
): InstallResult {
  const startMarker = `<!-- agent-in-sync:start:${ruleName} -->`;
  const endMarker = `<!-- agent-in-sync:end:${ruleName} -->`;

  try {
    mkdirSync(dirname(agentsMdPath), { recursive: true });

    let existing = '';
    if (existsSync(agentsMdPath)) {
      existing = readFileSync(agentsMdPath, 'utf-8');
    }

    const startIdx = existing.indexOf(startMarker);
    const endIdx = existing.indexOf(endMarker);

    let updated: string;
    if (startIdx !== -1 && endIdx !== -1) {
      updated =
        existing.slice(0, startIdx) + markedContent + existing.slice(endIdx + endMarker.length);
    } else {
      updated = existing
        ? existing.trimEnd() + '\n\n' + markedContent + '\n'
        : markedContent + '\n';
    }

    writeFileSync(agentsMdPath, updated, 'utf-8');
    return {
      type: 'rule',
      name: ruleName,
      targetPath: displayPath(base, agentsMdPath, effectiveScope),
      success: true,
      effectiveScope,
    };
  } catch (err) {
    return {
      type: 'rule',
      name: ruleName,
      targetPath: displayPath(base, agentsMdPath, effectiveScope),
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
      effectiveScope,
    };
  }
}

function displayPath(base: string, full: string, scope: InstallScope): string {
  if (!isAbsolute(full)) return full;
  if (scope === 'user' && full.startsWith(base)) {
    const rest = full.slice(base.length).replace(/^[/\\]/, '');
    return rest ? `~/${rest}` : '~';
  }
  if (full.startsWith(base)) {
    const rest = full.slice(base.length).replace(/^[/\\]/, '');
    return rest || full;
  }
  return full;
}
