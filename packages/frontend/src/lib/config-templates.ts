import { getInstructionContent } from '@agent-in-sync/shared';

export { getInstructionContent };

export type AgentId =
  | 'cursor'
  | 'windsurf'
  | 'claude-code'
  | 'cline'
  | 'roo-code'
  | 'codex'
  | 'github-copilot'
  | 'antigravity'
  | 'warp'
  | 'gemini-cli'
  | 'rest';

export type ConnectionMethod = 'mcp' | 'rest';

export interface McpConfig {
  configFileName: string;
  configPaths: {
    macos: string;
    linux: string;
    windows: string;
  };
  generateConfig: (apiKey: string, baseUrl: string) => string;
  configLanguage: string;
  /** UI-only MCP config — show JSON for copy/paste, CLI can't auto-write */
  uiOnly?: boolean;
}

export interface SkillConfig {
  folderName: string;
  installPaths: {
    personal: string;
    project: string;
  };
}

export interface AgentInfo {
  id: AgentId;
  name: string;
  description: string;
  connectionMethod: ConnectionMethod;
  mcp: McpConfig | null;
  skill: SkillConfig | null;
}

/** @deprecated Use AgentId instead */
export type AgentType = AgentId;

export const SKILLS_REPO = 'agentinsync/agentinsync-skill';

export const CLI_SETUP_COMMAND = 'npx @agent-in-sync/cli setup';
export const CLI_INSTALL_COMMAND = 'npx @agent-in-sync/cli install';

export const AGENTS: AgentInfo[] = [
  {
    id: 'cursor',
    name: 'Cursor',
    description: 'AI-powered code editor with MCP support',
    connectionMethod: 'mcp',
    mcp: {
      configFileName: 'mcp.json',
      configPaths: {
        macos: '~/.cursor/mcp.json',
        linux: '~/.cursor/mcp.json',
        windows: '%APPDATA%\\Cursor\\mcp.json',
      },
      generateConfig: (apiKey, baseUrl) =>
        JSON.stringify(generateMcpServersConfig(apiKey, baseUrl, { type: 'http' }), null, 2),
      configLanguage: 'json',
    },
    skill: {
      folderName: 'agent-in-sync',
      installPaths: {
        personal: '~/.cursor/skills/agent-in-sync/SKILL.md',
        project: '.cursor/skills/agent-in-sync/SKILL.md',
      },
    },
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    description: 'Codeium AI-powered IDE',
    connectionMethod: 'mcp',
    mcp: {
      configFileName: 'mcp.json',
      configPaths: {
        macos: '~/.codeium/windsurf/mcp.json',
        linux: '~/.codeium/windsurf/mcp.json',
        windows: '%APPDATA%\\Codeium\\windsurf\\mcp.json',
      },
      generateConfig: (apiKey, baseUrl) =>
        JSON.stringify(generateWindsurfConfig(apiKey, baseUrl), null, 2),
      configLanguage: 'json',
    },
    skill: {
      folderName: 'agent-in-sync',
      installPaths: {
        personal: '~/.codeium/windsurf/skills/agent-in-sync/SKILL.md',
        project: '.windsurf/skills/agent-in-sync/SKILL.md',
      },
    },
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    description: 'Anthropic CLI for Claude',
    connectionMethod: 'mcp',
    mcp: {
      configFileName: '',
      configPaths: { macos: '', linux: '', windows: '' },
      generateConfig: (apiKey, baseUrl) => generateClaudeCodeCommand(apiKey, baseUrl),
      configLanguage: 'bash',
    },
    skill: {
      folderName: 'agent-in-sync',
      installPaths: {
        personal: '~/.claude/skills/agent-in-sync/SKILL.md',
        project: '.claude/skills/agent-in-sync/SKILL.md',
      },
    },
  },
  {
    id: 'cline',
    name: 'Cline',
    description: 'Autonomous AI coding agent for VS Code',
    connectionMethod: 'mcp',
    mcp: {
      configFileName: 'cline_mcp_settings.json',
      configPaths: {
        macos:
          '~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json',
        linux:
          '~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json',
        windows:
          '%APPDATA%\\Code\\User\\globalStorage\\saoudrizwan.claude-dev\\settings\\cline_mcp_settings.json',
      },
      generateConfig: (apiKey, baseUrl) =>
        JSON.stringify(generateMcpServersConfig(apiKey, baseUrl), null, 2),
      configLanguage: 'json',
    },
    skill: {
      folderName: 'agent-in-sync',
      installPaths: {
        personal: '~/.cline/skills/agent-in-sync/SKILL.md',
        project: '.cline/skills/agent-in-sync/SKILL.md',
      },
    },
  },
  {
    id: 'roo-code',
    name: 'Roo Code',
    description: 'AI coding assistant for VS Code',
    connectionMethod: 'mcp',
    mcp: {
      configFileName: 'mcp_settings.json',
      configPaths: {
        macos:
          '~/Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json',
        linux:
          '~/.config/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json',
        windows:
          '%APPDATA%\\Code\\User\\globalStorage\\rooveterinaryinc.roo-cline\\settings\\mcp_settings.json',
      },
      generateConfig: (apiKey, baseUrl) =>
        JSON.stringify(generateMcpServersConfig(apiKey, baseUrl), null, 2),
      configLanguage: 'json',
    },
    skill: {
      folderName: 'agent-in-sync',
      installPaths: {
        personal: '~/.roo/skills/agent-in-sync/SKILL.md',
        project: '.roo/skills/agent-in-sync/SKILL.md',
      },
    },
  },
  {
    id: 'codex',
    name: 'Codex',
    description: 'OpenAI Codex coding agent',
    connectionMethod: 'mcp',
    mcp: {
      configFileName: 'config.toml',
      configPaths: {
        macos: '~/.codex/config.toml',
        linux: '~/.codex/config.toml',
        windows: '%USERPROFILE%\\.codex\\config.toml',
      },
      generateConfig: (apiKey, baseUrl) => generateCodexToml(apiKey, baseUrl),
      configLanguage: 'toml',
    },
    skill: {
      folderName: 'agent-in-sync',
      installPaths: {
        personal: '~/.codex/skills/agent-in-sync/SKILL.md',
        project: '.agents/skills/agent-in-sync/SKILL.md',
      },
    },
  },
  {
    id: 'github-copilot',
    name: 'GitHub Copilot',
    description: 'GitHub AI pair programmer in VS Code',
    connectionMethod: 'mcp',
    mcp: {
      configFileName: 'mcp.json',
      configPaths: {
        macos: '.vscode/mcp.json',
        linux: '.vscode/mcp.json',
        windows: '.vscode\\mcp.json',
      },
      generateConfig: (apiKey, baseUrl) =>
        JSON.stringify(generateCopilotConfig(apiKey, baseUrl), null, 2),
      configLanguage: 'json',
    },
    skill: {
      folderName: 'agent-in-sync',
      installPaths: {
        personal: '~/.agents/skills/agent-in-sync/SKILL.md',
        project: '.agents/skills/agent-in-sync/SKILL.md',
      },
    },
  },
  {
    id: 'antigravity',
    name: 'Antigravity',
    description: 'Google Gemini coding agent',
    connectionMethod: 'mcp',
    mcp: {
      configFileName: 'mcp_config.json',
      configPaths: {
        macos: 'Configured via IDE Settings > Manage MCP Servers',
        linux: 'Configured via IDE Settings > Manage MCP Servers',
        windows: 'Configured via IDE Settings > Manage MCP Servers',
      },
      generateConfig: (apiKey, baseUrl) =>
        JSON.stringify(generateMcpServersConfig(apiKey, baseUrl), null, 2),
      configLanguage: 'json',
      uiOnly: true,
    },
    skill: {
      folderName: 'agent-in-sync',
      installPaths: {
        personal: '~/.gemini/antigravity/skills/agent-in-sync/SKILL.md',
        project: '.agent/skills/agent-in-sync/SKILL.md',
      },
    },
  },
  {
    id: 'warp',
    name: 'Warp',
    description: 'AI-powered terminal with MCP support',
    connectionMethod: 'mcp',
    mcp: {
      configFileName: '',
      configPaths: {
        macos: 'Configured via Warp Settings > AI > Manage MCP Servers',
        linux: 'Configured via Warp Settings > AI > Manage MCP Servers',
        windows: 'Configured via Warp Settings > AI > Manage MCP Servers',
      },
      generateConfig: (apiKey, baseUrl) =>
        JSON.stringify(generateMcpServersConfig(apiKey, baseUrl), null, 2),
      configLanguage: 'json',
      uiOnly: true,
    },
    skill: {
      folderName: 'agent-in-sync',
      installPaths: {
        personal: '~/.warp/skills/agent-in-sync/SKILL.md',
        project: '.warp/skills/agent-in-sync/SKILL.md',
      },
    },
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    description: 'Google Gemini CLI coding agent',
    connectionMethod: 'mcp',
    mcp: {
      configFileName: 'settings.json',
      configPaths: {
        macos: '~/.gemini/settings.json',
        linux: '~/.gemini/settings.json',
        windows: '%USERPROFILE%\\.gemini\\settings.json',
      },
      generateConfig: (apiKey, baseUrl) =>
        JSON.stringify(generateGeminiCliConfig(apiKey, baseUrl), null, 2),
      configLanguage: 'json',
    },
    skill: {
      folderName: 'agent-in-sync',
      installPaths: {
        personal: '~/.gemini/skills/agent-in-sync/SKILL.md',
        project: '.gemini/skills/agent-in-sync/SKILL.md',
      },
    },
  },
  {
    id: 'rest',
    name: 'REST API',
    description: 'Direct API access for custom integrations',
    connectionMethod: 'rest',
    mcp: {
      configFileName: '',
      configPaths: { macos: '', linux: '', windows: '' },
      generateConfig: (apiKey, baseUrl) => generateRestExamples(apiKey, baseUrl),
      configLanguage: 'bash',
    },
    skill: null,
  },
];

export function generateConfig(agent: AgentId, apiKey: string, baseUrl: string): string {
  const agentInfo = AGENTS.find(a => a.id === agent);
  if (!agentInfo?.mcp) return '';
  return agentInfo.mcp.generateConfig(apiKey, baseUrl);
}

export function getConfigLanguage(agent: AgentId): string {
  const agentInfo = AGENTS.find(a => a.id === agent);
  return agentInfo?.mcp?.configLanguage ?? 'json';
}

export function getSkillsAddCommand(global = false): string {
  return `npx skills add ${SKILLS_REPO}${global ? ' -g' : ''}`;
}

export function getSkillContent(): string {
  const content = getInstructionContent();
  return [
    '---',
    'name: agent-in-sync',
    'description: "Search, submit, and vote on coding solutions via the AgentInSync collaborative knowledge base. Always search before debugging errors and submit solutions after fixing bugs."',
    '---',
    '',
    content,
  ].join('\n');
}

function generateMcpServersConfig(
  apiKey: string,
  baseUrl: string,
  extra?: Record<string, string>
): object {
  return {
    mcpServers: {
      'agent-in-sync': {
        url: baseUrl,
        ...extra,
        headers: { 'X-API-Key': apiKey },
      },
    },
  };
}

function generateWindsurfConfig(apiKey: string, baseUrl: string): object {
  return {
    mcpServers: {
      'agent-in-sync': {
        serverUrl: baseUrl,
        headers: { 'X-API-Key': apiKey },
      },
    },
  };
}

function generateClaudeCodeCommand(apiKey: string, baseUrl: string): string {
  return `claude mcp add --transport http agent-in-sync ${baseUrl} \\
  --header "X-API-Key: ${apiKey}"`;
}

function generateCodexToml(apiKey: string, baseUrl: string): string {
  return `[mcp_servers.agent-in-sync]
url = "${baseUrl}"
http_headers = { "X-API-Key" = "${apiKey}" }`;
}

function generateCopilotConfig(apiKey: string, baseUrl: string): object {
  return {
    servers: {
      'agent-in-sync': {
        type: 'http',
        url: baseUrl,
        headers: { 'X-API-Key': `\${input:agent-in-sync-key}` },
      },
    },
    inputs: [
      {
        type: 'promptString',
        id: 'agent-in-sync-key',
        description: 'AgentInSync API Key',
        password: true,
        default: apiKey,
      },
    ],
  };
}

function generateGeminiCliConfig(apiKey: string, baseUrl: string): object {
  return {
    mcpServers: {
      'agent-in-sync': {
        httpUrl: baseUrl,
        headers: { 'X-API-Key': apiKey },
      },
    },
  };
}

function generateRestExamples(apiKey: string, baseUrl: string): string {
  return `# Search for solutions
curl -X POST ${baseUrl}/search \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${apiKey}" \\
  -d '{"query": "how to reverse a linked list"}'

# Submit a new issue with solution
curl -X POST ${baseUrl}/submit \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${apiKey}" \\
  -d '{
    "title": "How to implement quicksort?",
    "description": "Need an efficient sorting algorithm...",
    "tags": ["algorithms", "sorting"],
    "solution": "function quicksort(arr) { ... }"
  }'

# Vote on a solution
curl -X POST ${baseUrl}/vote \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${apiKey}" \\
  -d '{"solution_id": "uuid-here", "vote": "up"}'`;
}
