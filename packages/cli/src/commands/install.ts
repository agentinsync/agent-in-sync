import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { AGENTS, type AgentConfig, type AgentType } from '../constants.js';
import { detectInstalledAgents } from '../utils/detect.js';
import { discoverSkills, discoverRules, resolveContentRoot } from '../utils/discover.js';
import { installSkill, installRule } from '../utils/install-content.js';

export const installCommand = new Command('install')
  .description('Install AgentInSync skills & rules to a coding agent')
  .option('-a, --agent <agent>', 'Target agent (skip interactive prompt)')
  .option('-l, --list', 'List available content and detected agents without installing')
  .action(async (options: { agent?: string; list?: boolean }) => {
    const projectRoot = process.cwd();
    const contentRoot = resolveContentRoot();

    const spinner = ora('Discovering content...').start();
    const skills = discoverSkills(contentRoot);
    const rules = discoverRules(contentRoot);
    spinner.succeed(
      `Found ${chalk.cyan(skills.length)} skill(s) and ${chalk.cyan(rules.length)} rule(s)`
    );

    if (skills.length === 0 && rules.length === 0) {
      console.log(chalk.yellow('\nNo skills or rules found to install.'));
      return;
    }

    const detectSpinner = ora('Detecting installed agents...').start();
    const detectedAgents = detectInstalledAgents();
    detectSpinner.succeed(`Found ${chalk.cyan(detectedAgents.length)} agent(s)`);

    if (options.list) {
      printDiscoveryReport(skills, rules, detectedAgents);
      return;
    }

    if (detectedAgents.length === 0) {
      console.log(chalk.yellow('\nNo supported agents detected on your system.'));
      console.log(
        chalk.gray(
          'Supported: Cursor, Claude Code, Windsurf, Cline, Roo Code, Codex, GitHub Copilot'
        )
      );
      return;
    }

    let agent: AgentConfig;

    if (options.agent) {
      const match = AGENTS.find(a => a.id === options.agent);
      if (!match) {
        console.log(chalk.red(`\nUnknown agent: ${options.agent}`));
        console.log(chalk.gray(`Valid agents: ${AGENTS.map(a => a.id).join(', ')}`));
        return;
      }
      agent = match;
    } else {
      console.log();
      const { selectedAgent } = await inquirer.prompt<{ selectedAgent: AgentType }>([
        {
          type: 'list',
          name: 'selectedAgent',
          message: 'Select an agent to install to:',
          choices: detectedAgents.map(a => ({
            name: a.name,
            value: a.id,
          })),
        },
      ]);

      agent = AGENTS.find(a => a.id === selectedAgent)!;
    }

    console.log();
    console.log(chalk.bold(`Installing skills & rules to ${agent.name}...`));
    console.log();

    for (const skill of skills) {
      const result = installSkill(skill, agent, projectRoot);
      if (result.success) {
        console.log(
          `  ${chalk.green('✔')} Skill: ${chalk.cyan(result.name)} → ${chalk.gray(result.targetPath)}`
        );
      } else {
        console.log(
          `  ${chalk.red('✗')} Skill: ${chalk.cyan(result.name)} — ${chalk.red(result.error)}`
        );
      }
    }

    for (const rule of rules) {
      const result = installRule(rule, agent, projectRoot);
      if (result.success) {
        console.log(
          `  ${chalk.green('✔')} Rule: ${chalk.cyan(result.name)} → ${chalk.gray(result.targetPath)}`
        );
      } else {
        console.log(
          `  ${chalk.red('✗')} Rule: ${chalk.cyan(result.name)} — ${chalk.red(result.error)}`
        );
      }
    }

    console.log();
    console.log(
      chalk.green.bold('Done!') + ` Restart ${agent.name} to load the new configuration.`
    );

    process.exit(0);
  });

function printDiscoveryReport(
  skills: { name: string; description: string }[],
  rules: { name: string; description: string }[],
  agents: { name: string; id: string }[]
): void {
  console.log();
  console.log(chalk.bold('Skills:'));
  for (const s of skills) {
    console.log(`  ${chalk.cyan(s.name)} — ${chalk.gray(s.description)}`);
  }

  console.log();
  console.log(chalk.bold('Rules:'));
  for (const r of rules) {
    console.log(`  ${chalk.cyan(r.name)} — ${chalk.gray(r.description)}`);
  }

  console.log();
  console.log(chalk.bold('Detected agents:'));
  if (agents.length === 0) {
    console.log(chalk.gray('  (none detected)'));
  } else {
    for (const a of agents) {
      console.log(`  ${chalk.cyan('•')} ${a.name} ${chalk.gray(`(${a.id})`)}`);
    }
  }
  console.log();
}
