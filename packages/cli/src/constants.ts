import { homedir, platform } from 'os';
import { join } from 'path';

export function getBaseUrl(): string {
  const productionDomain = process.env.PRODUCTION_DOMAIN || 'agentinsync.com';
  return process.env.AGENT_IN_SYNC_URL || `https://${productionDomain}`;
}

export function getApiBaseUrl(): string {
  return process.env.AGENT_IN_SYNC_API_URL || `${getBaseUrl()}/api`;
}

export function getMcpBaseUrl(): string {
  return process.env.AGENT_IN_SYNC_MCP_URL || getBaseUrl();
}
export const AUTH_CALLBACK_PORT = 8765;

export type AgentType =
  | 'cursor'
  | 'windsurf'
  | 'claude-code'
  | 'cline'
  | 'roo-code'
  | 'codex'
  | 'github-copilot'
  | 'antigravity'
  | 'warp'
  | 'gemini-cli';

export type RulesFormat =
  | 'mdc'
  | 'md-paths'
  | 'md-plain'
  | 'windsurf-mdc'
  | 'agents-md'
  | 'copilot-instructions'
  | 'gemini-md';

export type ConfigFormat = 'json-mcpServers' | 'json-servers' | 'toml' | 'cli' | 'ui-only';

export type InstallScope = 'user' | 'project';

export interface AgentConfig {
  id: AgentType;
  name: string;
  configPath: string;
  configFileName: string;
  configFormat: ConfigFormat;
  usesCliSetup?: boolean;
  skillsDir: string;
  rulesDir: string;
  rulesFormat: RulesFormat;
  /** Optional override: path under $HOME for user-scope skills. Defaults to skillsDir. */
  userSkillsDir?: string;
  /** Optional override: path under $HOME for user-scope rules. Defaults to rulesDir. */
  userRulesDir?: string;
  /** If true, user-scope install is unsupported and will fall back to project. */
  noUserScope?: boolean;
}

function getHomePath(...segments: string[]): string {
  return join(homedir(), ...segments);
}

function getAgentConfigPath(agent: AgentType): string {
  const os = platform();

  switch (agent) {
    case 'cursor':
      return getHomePath('.cursor', 'mcp.json');

    case 'windsurf':
      if (os === 'win32') {
        return join(process.env.APPDATA || '', 'Codeium', 'windsurf', 'mcp.json');
      }
      return getHomePath('.codeium', 'windsurf', 'mcp.json');

    case 'codex':
      return getHomePath('.codex', 'config.toml');

    case 'gemini-cli':
      return getHomePath('.gemini', 'settings.json');

    case 'claude-code':
    case 'cline':
    case 'roo-code':
    case 'github-copilot':
    case 'antigravity':
    case 'warp':
      return '';

    default:
      throw new Error(`Unknown agent: ${agent}`);
  }
}

export const AGENTS: AgentConfig[] = [
  {
    id: 'cursor',
    name: 'Cursor',
    configPath: getAgentConfigPath('cursor'),
    configFileName: 'mcp.json',
    configFormat: 'json-mcpServers',
    skillsDir: '.cursor/skills',
    rulesDir: '.cursor/rules',
    rulesFormat: 'mdc',
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    configPath: '',
    configFileName: '',
    configFormat: 'cli',
    usesCliSetup: true,
    skillsDir: '.claude/skills',
    rulesDir: '.claude/rules',
    rulesFormat: 'md-paths',
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    configPath: getAgentConfigPath('windsurf'),
    configFileName: 'mcp.json',
    configFormat: 'json-mcpServers',
    skillsDir: '.windsurf/skills',
    rulesDir: '.windsurf/rules',
    rulesFormat: 'windsurf-mdc',
    userSkillsDir: '.codeium/windsurf/skills',
    userRulesDir: '.codeium/windsurf/rules',
  },
  {
    id: 'cline',
    name: 'Cline',
    configPath: '',
    configFileName: '',
    configFormat: 'json-mcpServers',
    skillsDir: '.cline/skills',
    rulesDir: '.clinerules',
    rulesFormat: 'md-paths',
  },
  {
    id: 'roo-code',
    name: 'Roo Code',
    configPath: '',
    configFileName: '',
    configFormat: 'json-mcpServers',
    skillsDir: '.roo/skills',
    rulesDir: '.roo/rules',
    rulesFormat: 'md-plain',
  },
  {
    id: 'codex',
    name: 'Codex',
    configPath: getAgentConfigPath('codex'),
    configFileName: 'config.toml',
    configFormat: 'toml',
    skillsDir: '.agents/skills',
    rulesDir: '',
    rulesFormat: 'agents-md',
    userSkillsDir: '.codex/skills',
    userRulesDir: '.codex',
  },
  {
    id: 'github-copilot',
    name: 'GitHub Copilot',
    configPath: '',
    configFileName: 'mcp.json',
    configFormat: 'json-servers',
    skillsDir: '.agents/skills',
    rulesDir: '.github',
    rulesFormat: 'copilot-instructions',
    noUserScope: true,
  },
  {
    id: 'antigravity',
    name: 'Antigravity',
    configPath: '',
    configFileName: 'mcp_config.json',
    configFormat: 'ui-only',
    skillsDir: '.agent/skills',
    rulesDir: '',
    rulesFormat: 'agents-md',
    userSkillsDir: '.antigravity/skills',
    userRulesDir: '.antigravity',
  },
  {
    id: 'warp',
    name: 'Warp',
    configPath: '',
    configFileName: '',
    configFormat: 'ui-only',
    skillsDir: '.warp/skills',
    rulesDir: '',
    rulesFormat: 'agents-md',
    userRulesDir: '.warp',
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    configPath: getAgentConfigPath('gemini-cli'),
    configFileName: 'settings.json',
    configFormat: 'json-mcpServers',
    skillsDir: '.gemini/skills',
    rulesDir: '',
    rulesFormat: 'gemini-md',
    userRulesDir: '.gemini',
  },
];

export function getAgent(id: AgentType): AgentConfig | undefined {
  return AGENTS.find(a => a.id === id);
}
