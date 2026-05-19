#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init';
import { watchCommand } from './commands/watch';
import { reviewCommand } from './commands/review';
import { notifyCommand, NotifyLevel, NotifyEvent } from './commands/notify';
import { skillCommand } from './commands/skill';
import { agentCommand } from './commands/agent';
import { contextCommand } from './commands/context-cmd';
import { rulesCommand } from './commands/rules-cmd';
import { syncCommand } from './commands/sync';
import { setupCommand } from './commands/setup';
import { sessionCommand } from './commands/session';
import { setLogLevel } from './utils/logger';

const program = new Command();

program
  .name('ai-guardian')
  .description('AI coding support CLI - context management, file watching, and multi-agent review')
  .version('0.2.0')
  .option('--debug', 'Enable debug logging')
  .hook('preAction', (thisCommand) => {
    if (thisCommand.opts().debug) {
      setLogLevel('debug');
    }
  });

// ai-guardian setup
program
  .command('setup')
  .description('Initialize global configuration (~/.ai-guardian/)')
  .option('--force', 'Reinitialize global configuration')
  .action(async (options) => {
    await setupCommand(options);
  });

// ai-guardian init
program
  .command('init')
  .description('Initialize ai-guardian project files (.ai/ and .ai-guardian.yaml)')
  .option('--force', 'Overwrite existing files')
  .option('--agent <llm>', 'Generate adapter files for LLM tool (claude / cursor / copilot / all)')
  .action(async (options) => {
    await initCommand(options);
  });

// ai-guardian watch <subcommand>
program
  .command('watch <subcommand>')
  .description('File watch daemon (start / stop / status)')
  .action(async (subcommand: string) => {
    await watchCommand(subcommand);
  });

// ai-guardian review
program
  .command('review')
  .description('Run a review on a target file')
  .requiredOption('--target <file>', 'Target file to review')
  .requiredOption('--type <type>', 'Review type (code / architecture / requirements / task)')
  .option('--agents <agents>', 'Comma-separated list of agents to use', (val: string) => val.split(','))
  .option('--providers <providers>', 'Comma-separated LLM providers for multi-provider review (e.g. anthropic,openai,gemini)', (val: string) => val.split(','))
  .option('--consensus <strategy>', 'Consensus strategy (majority-vote / unanimous / any)')
  .action(async (options) => {
    await reviewCommand({
      target: options.target,
      type: options.type,
      agents: options.agents,
      providers: options.providers,
      consensus: options.consensus,
    });
  });

// ai-guardian notify
program
  .command('notify')
  .description('Send a notification')
  .requiredOption('--level <level>', 'Notification level (info / warning / critical)')
  .requiredOption('--event <event>', 'Event type (timeout / deploy_complete / deploy_failed / review_complete)')
  .requiredOption('--message <message>', 'Notification message')
  .option('--channel <channel>', 'Slack channel override')
  .action(async (options) => {
    await notifyCommand({
      level: options.level as NotifyLevel,
      event: options.event as NotifyEvent,
      message: options.message,
      channel: options.channel,
    });
  });

// ai-guardian skill <name>
program
  .command('skill [name]')
  .description('Run a skill or list available skills')
  .option('--list', 'List available skills')
  .action(async (name: string | undefined, options) => {
    await skillCommand(name || '--list', options);
  });

// ai-guardian agent <name>
program
  .command('agent [name]')
  .description('Run an agent or list available agents')
  .option('--input <text>', 'Input text for the agent')
  .option('--list', 'List available agents')
  .option('--auto', 'Auto-route to best agent(s) based on file patterns')
  .option('--files <paths>', 'Comma-separated file paths for auto-routing')
  .action(async (name: string | undefined, options) => {
    await agentCommand(name || '--list', options);
  });

// ai-guardian context <subcommand>
program
  .command('context <subcommand>')
  .description('Context management (sync / diff / snapshot / compress)')
  .option('--label <label>', 'Snapshot label')
  .action(async (subcommand: string, options) => {
    await contextCommand(subcommand, options);
  });

// ai-guardian rules <subcommand>
program
  .command('rules <subcommand>')
  .description('Rule management (list / test / validate)')
  .option('--file <file>', 'Target file for rules test')
  .action(async (subcommand: string, options) => {
    await rulesCommand(subcommand, options);
  });

// ai-guardian session <subcommand>
program
  .command('session <subcommand>')
  .description('Session/task lifecycle (start / complete / check / status)')
  .option('--task <description>', 'Task description (with start)')
  .option('--type <type>', 'Filter for complete (session / task)')
  .option('--json', 'Output JSON')
  .option('--skip-verify', 'Skip verify command in check')
  .option('--skip-sync', 'Skip context sync in check')
  .action(async (subcommand: string, options) => {
    await sessionCommand(subcommand, {
      task: options.task,
      type: options.type,
      json: options.json,
      skipVerify: options.skipVerify,
      skipSync: options.skipSync,
    });
  });

// ai-guardian sync
program
  .command('sync')
  .description('Sync adapter files with current configuration')
  .option('--agent <llm>', 'Target adapter (claude / cursor / copilot)')
  .action(async (options) => {
    await syncCommand(options);
  });

program.parse();
