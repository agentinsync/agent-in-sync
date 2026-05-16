import { execFileSync, execSync } from 'child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { homedir, platform } from 'os';
import { dirname, join } from 'path';
import { AGENTS, type AgentConfig } from '../constants.js';

export interface DetectedAgent extends AgentConfig {
  configExists: boolean;
  dirExists: boolean;
}

function isCliAvailable(command: string): boolean {
  try {
    execSync(`which ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function hasCliMcpServer(command: string, serverName: string): boolean {
  try {
    const output = execFileSync(command, ['mcp', 'list'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output.toString().includes(serverName);
  } catch {
    return false;
  }
}

function hasVscodeExtension(prefix: string): boolean {
  const extensionsDir = join(homedir(), '.vscode', 'extensions');
  if (!existsSync(extensionsDir)) return false;
  try {
    return readdirSync(extensionsDir).some(name => name.startsWith(prefix));
  } catch {
    return false;
  }
}

function isAppInstalled(appName: string): boolean {
  const os = platform();
  if (os === 'darwin') {
    return existsSync(`/Applications/${appName}.app`);
  }
  return isCliAvailable(appName.toLowerCase());
}

function isAgentDetected(agent: AgentConfig): boolean {
  switch (agent.id) {
    case 'cursor':
      return existsSync(dirname(agent.configPath));

    case 'windsurf':
      return existsSync(dirname(agent.configPath));

    case 'claude-code':
      return isCliAvailable('claude');

    case 'cline':
      return hasVscodeExtension('saoudrizwan.claude-dev-');

    case 'roo-code':
      return hasVscodeExtension('rooveterinaryinc.roo-cline-');

    case 'codex':
      return isCliAvailable('codex');

    case 'github-copilot':
      return hasVscodeExtension('github.copilot-');

    case 'antigravity':
      return isAppInstalled('Antigravity') || hasVscodeExtension('google.antigravity-');

    case 'warp':
      return isAppInstalled('Warp') || isCliAvailable('warp');

    case 'gemini-cli':
      return isCliAvailable('gemini');

    default:
      return false;
  }
}

export function detectInstalledAgents(): DetectedAgent[] {
  const detected: DetectedAgent[] = [];

  for (const agent of AGENTS) {
    if (!isAgentDetected(agent)) continue;

    let configExists: boolean;
    if (agent.configPath) {
      configExists = existsSync(agent.configPath);
    } else if (agent.usesCliSetup) {
      configExists = hasCliMcpServer(
        agent.id === 'claude-code' ? 'claude' : agent.id,
        'agent-in-sync'
      );
    } else {
      configExists = false;
    }
    detected.push({ ...agent, configExists, dirExists: true });
  }

  return detected;
}

export function isAgentInstalled(agentId: string): boolean {
  const agent = AGENTS.find(a => a.id === agentId);
  if (!agent) return false;
  return isAgentDetected(agent);
}

export function getConfigStatus(agent: AgentConfig): { exists: boolean; hasAgentInSync: boolean } {
  if (agent.configFormat === 'cli') {
    const cliCommand = agent.id === 'claude-code' ? 'claude' : agent.id;
    const hasServer = hasCliMcpServer(cliCommand, 'agent-in-sync');
    return { exists: hasServer, hasAgentInSync: hasServer };
  }

  if (!agent.configPath || !existsSync(agent.configPath)) {
    return { exists: false, hasAgentInSync: false };
  }

  try {
    const stats = statSync(agent.configPath);
    if (!stats.isFile()) {
      return { exists: false, hasAgentInSync: false };
    }

    const content = readFileSync(agent.configPath, 'utf-8');

    if (agent.configFormat === 'toml') {
      return {
        exists: true,
        hasAgentInSync: content.includes('[mcp_servers.agent-in-sync]'),
      };
    }

    const config = JSON.parse(content);
    const hasAgentInSync =
      !!config.mcpServers?.['agent-in-sync'] || !!config.servers?.['agent-in-sync'];

    return { exists: true, hasAgentInSync };
  } catch {
    return { exists: false, hasAgentInSync: false };
  }
}
