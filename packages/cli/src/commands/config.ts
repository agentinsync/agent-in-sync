import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { AGENTS, getMcpBaseUrl, type AgentType } from '../constants.js';
import { detectInstalledAgents } from '../utils/detect.js';
import {
  writeAgentConfig,
  backupExistingConfig,
  getClaudeCodeCommand,
} from '../utils/write-config.js';

export const configCommand = new Command('config')
  .description('Generate or update agent configuration')
  .option('-k, --api-key <key>', 'API key to use')
  .option('-a, --agent <agent>', 'Agent to configure (cursor, claude, windsurf, claude-code)')
  .option('--print', 'Print config to stdout instead of writing to file')
  .action(async (options: { apiKey?: string; agent?: string; print?: boolean }) => {
    let apiKey = options.apiKey;
    let agentId = options.agent as AgentType | undefined;

    if (!apiKey) {
      const answer = await inquirer.prompt<{ apiKey: string }>([
        {
          type: 'input',
          name: 'apiKey',
          message: 'Enter your API key:',
          validate: (input: string) => {
            if (!input.trim()) return 'API key is required';
            if (!input.startsWith('ask_')) return 'API key should start with ask_';
            return true;
          },
        },
      ]);
      apiKey = answer.apiKey;
    }

    if (!agentId) {
      const detectedAgents = detectInstalledAgents();
      const choices = AGENTS.map(agent => {
        const detected = detectedAgents.find(d => d.id === agent.id);
        return {
          name: `${agent.name}${detected ? chalk.green(' (installed)') : chalk.gray(' (not found)')}`,
          value: agent.id,
        };
      });

      const answer = await inquirer.prompt<{ agent: AgentType }>([
        {
          type: 'list',
          name: 'agent',
          message: 'Select agent to configure:',
          choices,
        },
      ]);
      agentId = answer.agent;
    }

    const agent = AGENTS.find(a => a.id === agentId);
    if (!agent) {
      console.log(chalk.red(`Unknown agent: ${agentId}`));
      console.log(chalk.gray('Supported agents: cursor, claude, windsurf, claude-code'));
      return;
    }

    if (options.print) {
      if (agent.usesCliSetup) {
        console.log(getClaudeCodeCommand(apiKey));
      } else {
        const config = generateConfigForAgent(agentId, apiKey);
        console.log(JSON.stringify(config, null, 2));
      }
      return;
    }

    if (agent.usesCliSetup) {
      const result = writeAgentConfig(agent, apiKey);
      if (result.success) {
        console.log(chalk.green(`✓ MCP server added to ${agent.name}`));
      } else {
        console.log(chalk.red(`✗ Failed to configure ${agent.name}: ${result.error}`));
        console.log();
        console.log(chalk.gray('Run this command manually:'));
        console.log(chalk.cyan(getClaudeCodeCommand(apiKey)));
      }
      return;
    }

    const existingConfigExists = detectInstalledAgents().find(a => a.id === agentId)?.configExists;

    if (existingConfigExists) {
      const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
        {
          type: 'confirm',
          name: 'confirm',
          message: `${agent.name} config already exists. Update it?`,
          default: true,
        },
      ]);

      if (!confirm) {
        console.log(chalk.yellow('Cancelled.'));
        return;
      }

      const backupPath = backupExistingConfig(agent);
      if (backupPath) {
        console.log(chalk.gray(`Backup created: ${backupPath}`));
      }
    }

    const result = writeAgentConfig(agent, apiKey);

    if (result.success) {
      console.log(chalk.green(`✓ Configuration written to ${agent.configPath}`));
      console.log(chalk.gray(`Restart ${agent.name} to load the new configuration.`));
    } else {
      console.log(chalk.red(`✗ Failed to write configuration: ${result.error}`));
    }
  });

function generateConfigForAgent(agentId: AgentType, apiKey: string): object {
  const baseConfig = {
    headers: { 'X-API-Key': apiKey },
  };

  switch (agentId) {
    case 'cursor':
      return {
        mcpServers: {
          'agent-in-sync': {
            url: `${getMcpBaseUrl()}/mcp`,
            type: 'http',
            ...baseConfig,
          },
        },
      };
    case 'claude-code':
      return {
        mcpServers: {
          'agent-in-sync': {
            url: `${getMcpBaseUrl()}/mcp`,
            ...baseConfig,
          },
        },
      };
    case 'windsurf':
      return {
        mcpServers: {
          'agent-in-sync': {
            serverUrl: `${getMcpBaseUrl()}/mcp`,
            ...baseConfig,
          },
        },
      };
    default:
      return {
        mcpServers: {
          'agent-in-sync': {
            url: `${getMcpBaseUrl()}/mcp`,
            ...baseConfig,
          },
        },
      };
  }
}
