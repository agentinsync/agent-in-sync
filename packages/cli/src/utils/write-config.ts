import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { MCP_BASE_URL, type AgentConfig, type AgentType } from '../constants.js';

export interface McpServerConfig {
  url?: string;
  serverUrl?: string;
  httpUrl?: string;
  type?: string;
  headers: {
    'X-API-Key': string;
  };
}

export interface McpConfig {
  mcpServers: {
    [key: string]: McpServerConfig;
  };
}

function generateAgentInSyncConfig(apiKey: string, agentType: AgentType): McpServerConfig {
  switch (agentType) {
    case 'cursor':
      return {
        url: `${MCP_BASE_URL}/mcp`,
        type: 'http',
        headers: { 'X-API-Key': apiKey },
      };
    case 'windsurf':
      return {
        serverUrl: `${MCP_BASE_URL}/mcp`,
        headers: { 'X-API-Key': apiKey },
      };
    case 'gemini-cli':
      return {
        httpUrl: `${MCP_BASE_URL}/mcp`,
        headers: { 'X-API-Key': apiKey },
      };
    default:
      return {
        url: `${MCP_BASE_URL}/mcp`,
        headers: { 'X-API-Key': apiKey },
      };
  }
}

export function getClaudeCodeCommand(apiKey: string): string {
  return `claude mcp add --scope user --transport http agent-in-sync ${MCP_BASE_URL}/mcp --header "X-API-Key: ${apiKey}"`;
}

function writeJsonMcpServersConfig(agent: AgentConfig, apiKey: string): void {
  const dir = dirname(agent.configPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  let existingConfig: McpConfig = { mcpServers: {} };
  if (existsSync(agent.configPath)) {
    try {
      const content = readFileSync(agent.configPath, 'utf-8');
      existingConfig = JSON.parse(content);
      if (!existingConfig.mcpServers) {
        existingConfig.mcpServers = {};
      }
    } catch {
      existingConfig = { mcpServers: {} };
    }
  }

  existingConfig.mcpServers['agent-in-sync'] = generateAgentInSyncConfig(apiKey, agent.id);
  writeFileSync(agent.configPath, JSON.stringify(existingConfig, null, 2));
}

/** GitHub Copilot uses `servers` top-level key instead of `mcpServers` */
function writeJsonServersConfig(configPath: string, apiKey: string): void {
  const dir = dirname(configPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  let existing: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try {
      existing = JSON.parse(readFileSync(configPath, 'utf-8'));
    } catch {
      existing = {};
    }
  }

  const servers = (existing.servers ?? {}) as Record<string, unknown>;
  servers['agent-in-sync'] = {
    type: 'http',
    url: `${MCP_BASE_URL}/mcp`,
    headers: { 'X-API-Key': '${input:agent-in-sync-key}' },
  };
  existing.servers = servers;

  const inputs = (existing.inputs ?? []) as Array<Record<string, unknown>>;
  const existingInput = inputs.findIndex(
    (i: Record<string, unknown>) => i.id === 'agent-in-sync-key'
  );
  const inputEntry = {
    type: 'promptString',
    id: 'agent-in-sync-key',
    description: 'AgentInSync API Key',
    password: true,
    default: apiKey,
  };
  if (existingInput >= 0) {
    inputs[existingInput] = inputEntry;
  } else {
    inputs.push(inputEntry);
  }
  existing.inputs = inputs;

  writeFileSync(configPath, JSON.stringify(existing, null, 2));
}

/** Codex uses TOML config with [mcp_servers.*] sections */
function writeTomlConfig(configPath: string, apiKey: string): void {
  const dir = dirname(configPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  let existing = '';
  if (existsSync(configPath)) {
    existing = readFileSync(configPath, 'utf-8');
  }

  const sectionHeader = '[mcp_servers.agent-in-sync]';
  const sectionContent = `${sectionHeader}\nurl = "${MCP_BASE_URL}/mcp"\nhttp_headers = { "X-API-Key" = "${apiKey}" }\n`;

  if (existing.includes(sectionHeader)) {
    const start = existing.indexOf(sectionHeader);
    let end = existing.indexOf('\n[', start + 1);
    if (end === -1) end = existing.length;
    existing = existing.slice(0, start) + sectionContent + existing.slice(end);
  } else {
    existing = existing.trimEnd() + (existing.length > 0 ? '\n\n' : '') + sectionContent;
  }

  writeFileSync(configPath, existing);
}

export function writeAgentConfig(
  agent: AgentConfig,
  apiKey: string
): { success: boolean; error?: string } {
  try {
    switch (agent.configFormat) {
      case 'cli': {
        const result = spawnSync(
          'claude',
          [
            'mcp',
            'add',
            '--scope',
            'user',
            '--transport',
            'http',
            'agent-in-sync',
            `${MCP_BASE_URL}/mcp`,
            '--header',
            `X-API-Key: ${apiKey}`,
          ],
          { stdio: 'pipe' }
        );
        if (result.status !== 0) {
          throw new Error(result.stderr?.toString().trim() || 'claude mcp add failed');
        }
        break;
      }

      case 'json-mcpServers':
        if (!agent.configPath) return { success: false, error: 'No config path for this agent' };
        writeJsonMcpServersConfig(agent, apiKey);
        break;

      case 'json-servers':
        if (!agent.configPath) return { success: false, error: 'No config path for this agent' };
        writeJsonServersConfig(agent.configPath, apiKey);
        break;

      case 'toml':
        if (!agent.configPath) return { success: false, error: 'No config path for this agent' };
        writeTomlConfig(agent.configPath, apiKey);
        break;

      case 'ui-only':
        return { success: false, error: `${agent.name} MCP is configured via its IDE UI` };

      default:
        return { success: false, error: `Unknown config format: ${agent.configFormat}` };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

export function backupExistingConfig(agent: AgentConfig): string | null {
  if (!existsSync(agent.configPath)) {
    return null;
  }

  const backupPath = `${agent.configPath}.backup.${Date.now()}`;
  try {
    const content = readFileSync(agent.configPath, 'utf-8');
    writeFileSync(backupPath, content);
    return backupPath;
  } catch {
    return null;
  }
}
