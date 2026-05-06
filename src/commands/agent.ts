import { loadConfig, getProjectDir } from '../core/config';
import { loadAgent, listAgents, runAgent, routeAgents, runMultiAgent } from '../core/agents';
import { logger } from '../utils/logger';

export async function agentCommand(
  name: string,
  options: { input?: string; list?: boolean; auto?: boolean; files?: string },
): Promise<void> {
  const projectDir = getProjectDir();
  const config = loadConfig(projectDir);

  if (options.list || name === '--list') {
    showAgentList(projectDir);
    return;
  }

  // Auto-routing mode: select agents based on file paths
  if (options.auto || name === '--auto') {
    const filePaths = options.files ? options.files.split(',') : [];
    if (filePaths.length === 0) {
      logger.error('--files is required with --auto. Example: --auto --files "src/api.ts,src/db.ts"');
      process.exit(1);
    }

    const input = options.input || '';
    if (!input) {
      logger.error('--input is required when running agents.');
      process.exit(1);
    }

    const routed = routeAgents(filePaths, projectDir);
    if (routed.length === 0) {
      logger.info('No agents matched the specified files.');
      return;
    }

    logger.info(`Auto-routed to ${routed.length} agent(s): ${routed.map((a) => a.name).join(', ')}`);

    try {
      const results = await runMultiAgent(routed, input, config, projectDir);
      for (const [agentName, result] of results) {
        console.log(`\n=== ${agentName} ===\n`);
        console.log(result);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Multi-agent execution failed: ${msg}`);
      process.exit(1);
    }
    return;
  }

  const agent = loadAgent(name, projectDir);
  if (!agent) {
    logger.error(`Agent not found: ${name}`);
    logger.info('Use "ai-guardian agent --list" to see available agents.');
    process.exit(1);
  }

  const input = options.input || '';
  if (!input) {
    logger.error('--input is required when running an agent.');
    process.exit(1);
  }

  try {
    const result = await runAgent(agent, input, config, projectDir);
    process.stdout.write(result + '\n');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Agent execution failed: ${msg}`);
    process.exit(1);
  }
}

function showAgentList(projectDir: string): void {
  const agents = listAgents(projectDir);

  if (agents.length === 0) {
    logger.info('No agents found.');
    logger.info('Add agent files to .ai/agents/ or ~/.ai-guardian/agents/');
    return;
  }

  logger.info(`Available agents (${agents.length}):\n`);
  for (const agent of agents) {
    console.log(`  ${agent.name} [${agent.type}] (${agent.source})`);
    if (agent.description) {
      console.log(`    ${agent.description}`);
    }
    if (agent.file_patterns.length > 0) {
      console.log(`    routes: ${agent.file_patterns.join(', ')}`);
    }
    console.log('');
  }
}
