#!/usr/bin/env node
import { Command } from 'commander';
import { setupCommand } from './commands/setup.js';
import { configCommand } from './commands/config.js';
import { installCommand } from './commands/install.js';

process.on('SIGINT', () => {
  console.log('\n\nAborted.');
  process.exit(130);
});

const program = new Command();

program
  .name('agent-in-sync')
  .description('CLI tool for connecting AgentInSync to your AI coding agents')
  .version('0.0.1');

program.addCommand(setupCommand);
program.addCommand(configCommand);
program.addCommand(installCommand);

program.parse();
