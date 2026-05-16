import type { RulesFormat } from '../constants.js';
import type { ParsedRule } from './discover.js';

interface TransformedRule {
  filename: string;
  content: string;
}

type RuleTransformer = (rule: ParsedRule) => TransformedRule;

/** Cursor: MDC format with description/globs/alwaysApply frontmatter */
function cursorAdapter(rule: ParsedRule): TransformedRule {
  const globs = rule.globs.length > 0 ? rule.globs.join(', ') : '';
  const lines = [
    '---',
    `description: ${rule.description}`,
    `globs: ${globs}`,
    `alwaysApply: ${rule.alwaysApply}`,
    '---',
    rule.body,
  ];
  return { filename: `${rule.name}.mdc`, content: lines.join('\n') + '\n' };
}

/** Claude Code / Cline: MD with optional paths frontmatter from globs */
function mdPathsAdapter(rule: ParsedRule): TransformedRule {
  const lines: string[] = [];
  if (rule.globs.length > 0) {
    lines.push('---', `paths: ${rule.globs.join(', ')}`, '---');
  }
  lines.push(rule.body);
  return { filename: `${rule.name}.md`, content: lines.join('\n') + '\n' };
}

/** Windsurf / Roo Code: plain markdown, no frontmatter */
function mdPlainAdapter(rule: ParsedRule): TransformedRule {
  return { filename: `${rule.name}.md`, content: rule.body + '\n' };
}

/** Windsurf Wave 8+: MD with trigger/globs frontmatter */
function windsurfMdcAdapter(rule: ParsedRule): TransformedRule {
  const trigger =
    rule.globs.length > 0 ? 'glob' : rule.alwaysApply ? 'always_on' : 'model_decision';
  const lines = ['---', `trigger: ${trigger}`];
  if (rule.globs.length > 0) lines.push(`globs: ${rule.globs.join(', ')}`);
  lines.push('---', rule.body);
  return { filename: `${rule.name}.md`, content: lines.join('\n') + '\n' };
}

/** Codex / Warp: append to AGENTS.md between idempotent markers */
function agentsMdAdapter(rule: ParsedRule): TransformedRule {
  const startMarker = `<!-- agent-in-sync:start:${rule.name} -->`;
  const endMarker = `<!-- agent-in-sync:end:${rule.name} -->`;
  const content = `${startMarker}\n${rule.body}\n${endMarker}`;
  return { filename: 'AGENTS.md', content };
}

/** GitHub Copilot: append to .github/copilot-instructions.md between idempotent markers */
function copilotInstructionsAdapter(rule: ParsedRule): TransformedRule {
  const startMarker = `<!-- agent-in-sync:start:${rule.name} -->`;
  const endMarker = `<!-- agent-in-sync:end:${rule.name} -->`;
  const content = `${startMarker}\n${rule.body}\n${endMarker}`;
  return { filename: 'copilot-instructions.md', content };
}

/** Gemini CLI: append to GEMINI.md between idempotent markers */
function geminiMdAdapter(rule: ParsedRule): TransformedRule {
  const startMarker = `<!-- agent-in-sync:start:${rule.name} -->`;
  const endMarker = `<!-- agent-in-sync:end:${rule.name} -->`;
  const content = `${startMarker}\n${rule.body}\n${endMarker}`;
  return { filename: 'GEMINI.md', content };
}

const ADAPTERS: Record<RulesFormat, RuleTransformer> = {
  mdc: cursorAdapter,
  'md-paths': mdPathsAdapter,
  'md-plain': mdPlainAdapter,
  'windsurf-mdc': windsurfMdcAdapter,
  'agents-md': agentsMdAdapter,
  'copilot-instructions': copilotInstructionsAdapter,
  'gemini-md': geminiMdAdapter,
};

export function transformRule(rule: ParsedRule, format: RulesFormat): TransformedRule {
  return ADAPTERS[format](rule);
}
