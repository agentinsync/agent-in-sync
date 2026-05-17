import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { detectInstalledAgents, type DetectedAgent } from '../utils/detect.js';
import { authenticateWithBrowser } from '../utils/auth.js';
import { writeAgentConfig, backupExistingConfig } from '../utils/write-config.js';
import { discoverSkills, discoverRules, resolveContentRoot } from '../utils/discover.js';
import { installSkill, installRule } from '../utils/install-content.js';
import type { InstallScope } from '../constants.js';

export const setupCommand = new Command('setup')
  .description('Set up AgentInSync for your AI coding agents')
  .action(async () => {
    console.log();
    console.log(chalk.bold('Welcome to AgentInSync!'));
    console.log(chalk.gray("Let's connect your AI coding agents.\n"));

    const spinner = ora('Detecting installed agents...').start();
    const detectedAgents = detectInstalledAgents();
    spinner.stop();

    if (detectedAgents.length === 0) {
      console.log(chalk.yellow('No supported agents found on your system.'));
      console.log(
        chalk.gray(
          'Supported: Cursor, Windsurf, Claude Code, Cline, Roo Code, Codex, GitHub Copilot, Antigravity, Warp, Gemini CLI'
        )
      );
      console.log(chalk.gray('\nInstall one of these agents and run setup again.'));
      return;
    }

    console.log(chalk.green(`Found ${detectedAgents.length} agent(s):`));
    detectedAgents.forEach(agent => {
      const status = agent.configExists
        ? chalk.yellow('(config exists)')
        : chalk.gray('(no config)');
      console.log(`  ${chalk.cyan('•')} ${agent.name} ${status}`);
    });
    console.log();

    const { selectedAgents } = await inquirer.prompt<{ selectedAgents: string[] }>([
      {
        type: 'checkbox',
        name: 'selectedAgents',
        message: 'Which agents do you want to configure?',
        choices: detectedAgents.map(agent => ({
          name: `${agent.name}${agent.configExists ? ' (will update existing config)' : ''}`,
          value: agent.id,
          checked: true,
        })),
        validate: (answer: string[]) => {
          if (answer.length === 0) {
            return 'Please select at least one agent.';
          }
          return true;
        },
      },
    ]);

    const agentsToSetup = detectedAgents.filter(a => selectedAgents.includes(a.id));

    const { scope } = await inquirer.prompt<{ scope: InstallScope }>([
      {
        type: 'list',
        name: 'scope',
        message: 'Where should skills & rules be installed?',
        default: 'user',
        choices: [
          {
            name: 'User level — available in every project (recommended)',
            value: 'user',
          },
          {
            name: 'Project level — only the current directory',
            value: 'project',
          },
        ],
      },
    ]);

    console.log();
    console.log(chalk.bold('Step 1: Authentication'));
    console.log(chalk.gray('Opening browser for login...'));
    console.log();

    const authSpinner = ora('Waiting for authentication...').start();

    let authResult;
    try {
      authResult = await authenticateWithBrowser();
      authSpinner.succeed(`Logged in as ${chalk.cyan(authResult.email)}`);
    } catch (err) {
      authSpinner.fail('Authentication failed');
      console.log(chalk.red(err instanceof Error ? err.message : 'Unknown error'));
      return;
    }

    console.log(chalk.gray(`  Organization: ${authResult.organizationName}`));
    console.log(chalk.gray(`  API Key: ${authResult.apiKey.slice(0, 16)}...`));
    console.log();

    const projectRoot = process.cwd();
    const contentRoot = resolveContentRoot();
    const skills = discoverSkills(contentRoot);
    const rules = discoverRules(contentRoot);

    console.log(chalk.bold('Step 2: Configuring agents'));
    console.log();

    const results: {
      agent: DetectedAgent;
      mcpSuccess: boolean;
      mcpAlreadyExisted: boolean;
      mcpError?: string;
      backupPath?: string | null;
      contentInstalled: { type: string; name: string; targetPath: string; ok: boolean }[];
    }[] = [];

    for (const agent of agentsToSetup) {
      console.log(`  ${chalk.bold(agent.name)}:`);

      let backupPath: string | null = null;
      if (agent.configExists && !agent.usesCliSetup) {
        backupPath = backupExistingConfig(agent);
      }

      const isUiOnly = agent.configFormat === 'ui-only';
      const mcpResult = isUiOnly
        ? { success: true, alreadyExisted: false }
        : writeAgentConfig(agent, authResult.apiKey);
      const mcpAlreadyExisted = mcpResult.success && mcpResult.alreadyExisted === true;

      if (isUiOnly) {
        console.log(
          `    ${chalk.yellow('⚠')} MCP config — ${chalk.yellow(`${agent.name} requires manual setup via its IDE UI`)}`
        );
      } else if (mcpAlreadyExisted) {
        console.log(
          `    ${chalk.yellow('⚠')} MCP config — ${chalk.yellow('agent-in-sync already configured; keeping existing entry')}`
        );
        console.log(
          chalk.gray(
            '      To replace it, run: claude mcp remove agent-in-sync --scope user, then re-run setup.'
          )
        );
      } else if (mcpResult.success) {
        const target = agent.configPath || 'claude mcp add ...';
        console.log(`    ${chalk.green('✔')} MCP config → ${chalk.gray(target)}`);
        if (backupPath) {
          console.log(chalk.gray(`      Backup: ${backupPath}`));
        }
      } else {
        console.log(`    ${chalk.red('✗')} MCP config — ${chalk.red(mcpResult.error)}`);
      }

      const contentInstalled: { type: string; name: string; targetPath: string; ok: boolean }[] =
        [];

      let downgradeNoticeShown = false;
      const noteScopeDowngrade = (effectiveScope: InstallScope) => {
        if (scope === 'user' && effectiveScope === 'project' && !downgradeNoticeShown) {
          console.log(
            chalk.gray(`      ${agent.name} has no user-level skills/rules — using project scope.`)
          );
          downgradeNoticeShown = true;
        }
      };

      for (const skill of skills) {
        const r = installSkill(skill, agent, projectRoot, scope);
        noteScopeDowngrade(r.effectiveScope);
        contentInstalled.push({
          type: 'Skill',
          name: r.name,
          targetPath: r.targetPath,
          ok: r.success,
        });
        if (r.success) {
          console.log(
            `    ${chalk.green('✔')} Skill: ${chalk.cyan(r.name)} → ${chalk.gray(r.targetPath)}`
          );
        } else {
          console.log(`    ${chalk.red('✗')} Skill: ${chalk.cyan(r.name)} — ${chalk.red(r.error)}`);
        }
      }

      for (const rule of rules) {
        const r = installRule(rule, agent, projectRoot, scope);
        noteScopeDowngrade(r.effectiveScope);
        contentInstalled.push({
          type: 'Rule',
          name: r.name,
          targetPath: r.targetPath,
          ok: r.success,
        });
        if (r.success) {
          console.log(
            `    ${chalk.green('✔')} Rule: ${chalk.cyan(r.name)} → ${chalk.gray(r.targetPath)}`
          );
        } else {
          console.log(`    ${chalk.red('✗')} Rule: ${chalk.cyan(r.name)} — ${chalk.red(r.error)}`);
        }
      }

      console.log();
      results.push({
        agent,
        mcpSuccess: mcpResult.success,
        mcpAlreadyExisted,
        mcpError: mcpResult.error,
        backupPath,
        contentInstalled,
      });
    }

    const successful = results.filter(r => r.mcpSuccess);
    const failed = results.filter(r => !r.mcpSuccess);

    if (successful.length > 0) {
      console.log(chalk.green.bold('Setup complete!'));
      console.log();
      console.log('AgentInSync is now connected to:');
      successful.forEach(r => {
        const note = r.mcpAlreadyExisted ? chalk.gray(' (MCP already configured)') : '';
        console.log(`  ${chalk.cyan('✓')} ${r.agent.name}${note}`);
      });
      console.log();
      console.log(chalk.gray('Restart your agents to load the new configuration.'));
      console.log();
      console.log('Available tools:');
      console.log(`  ${chalk.cyan('•')} search - Search for coding solutions`);
      console.log(`  ${chalk.cyan('•')} submit - Submit issues and solutions`);
      console.log(`  ${chalk.cyan('•')} vote - Vote on helpful solutions`);
      console.log(`  ${chalk.cyan('•')} comment - Add comments to discussions`);
      console.log();
      console.log(chalk.gray('To re-install skills & rules later: agent-in-sync install'));
    }

    if (failed.length > 0) {
      console.log();
      console.log(chalk.yellow('Some agents failed to configure:'));
      failed.forEach(r => {
        console.log(`  ${chalk.red('✗')} ${r.agent.name}: ${r.mcpError}`);
      });
      console.log();
      console.log(chalk.gray('Try running setup again or configure manually.'));
    }

    process.exit(failed.length > 0 ? 1 : 0);
  });
