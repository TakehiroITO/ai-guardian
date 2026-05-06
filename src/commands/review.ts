import * as fs from 'fs';
import * as path from 'path';
import { loadConfig, getProjectDir, GuardianConfig } from '../core/config';
import { runLocalReview, ReviewOutput } from '../core/reviewer';
import { ConductorClient } from '../core/conductor';
import { buildConsensus, ConsensusStrategy, ConsensusOutput } from '../core/consensus';
import { loadRules, matchRulesForFile } from '../core/rules';
import { readContextFile } from '../core/context';
import { writeReviewResult } from '../core/context';
import { logger } from '../utils/logger';

export interface ReviewOptions {
  target: string;
  type: 'code' | 'architecture' | 'requirements' | 'task';
  agents?: string[];
  providers?: string[];
  consensus?: ConsensusStrategy;
}

function formatReviewOutput(result: ReviewOutput, targetFile: string, reviewType: string): string {
  const lines: string[] = [];
  const timestamp = new Date().toISOString();

  lines.push(`# Review Result`);
  lines.push('');
  lines.push(`- **Date:** ${timestamp}`);
  lines.push(`- **Target:** ${targetFile}`);
  lines.push(`- **Type:** ${reviewType}`);
  lines.push('');
  lines.push(`## Summary`);
  lines.push('');
  lines.push(result.summary);
  lines.push('');

  if (result.issues.length > 0) {
    lines.push(`## Issues`);
    lines.push('');
    for (const issue of result.issues) {
      const lineInfo = issue.line > 0 ? ` (line ${issue.line})` : '';
      lines.push(`- **[${issue.severity.toUpperCase()}]**${lineInfo} ${issue.message}`);
    }
    lines.push('');
  } else {
    lines.push('No issues found.');
    lines.push('');
  }

  return lines.join('\n');
}

export async function reviewCommand(options: ReviewOptions): Promise<void> {
  const projectDir = getProjectDir();
  const config = loadConfig(projectDir);

  // Read target file
  const targetPath = path.resolve(projectDir, options.target);
  let content: string;
  try {
    content = fs.readFileSync(targetPath, 'utf-8');
  } catch {
    logger.error(`Target file not found: ${targetPath}`);
    process.exit(1);
  }

  // Read context (CURRENT_CONTEXT.md)
  const context = readContextFile(projectDir, 'CURRENT_CONTEXT.md') || '';

  // Determine agents
  const agents = options.agents || config.agents.default;

  // Inject matching rules into context
  const matchedRules = matchRulesForFile(loadRules(projectDir), options.target);
  const rulesContext = matchedRules.length > 0
    ? '\n\n## Applicable Rules\n' + matchedRules.map((r) => `### ${r.name} [${r.severity}]\n${r.content}`).join('\n\n')
    : '';
  const fullContext = context + rulesContext;

  try {
    if (options.providers && options.providers.length > 1) {
      // Multi-provider consensus review
      await runConsensusReview(config, options, content, fullContext, projectDir);
    } else if (config.conductor.enabled && config.conductor.endpoint) {
      await runConductorReview(config, options, content, fullContext, agents, projectDir);
    } else {
      const providerName = options.providers?.[0] || 'anthropic';
      await runLocal(config, options, content, fullContext, projectDir, providerName);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(message);
    process.exit(1);
  }
}

async function runLocal(
  config: GuardianConfig,
  options: ReviewOptions,
  content: string,
  context: string,
  projectDir: string,
  providerName: string = 'anthropic',
): Promise<void> {
  logger.info(`Running local review (provider: ${providerName})...`);

  const result = await runLocalReview(config, options.type, options.target, content, context, providerName);
  const formatted = formatReviewOutput(result, options.target, options.type);

  // Write result to .ai/reviews/
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `review-${options.type}-${timestamp}.md`;
  const filePath = writeReviewResult(projectDir, fileName, formatted);

  // Report critical issues
  const criticals = result.issues.filter((i) => i.severity === 'critical');
  if (criticals.length > 0) {
    logger.warn(`${criticals.length} critical issue(s) found. Review before proceeding.`);
  }

  logger.info(`Review complete. Result: ${filePath}`);
}

async function runConductorReview(
  config: GuardianConfig,
  options: ReviewOptions,
  content: string,
  context: string,
  agents: string[],
  projectDir: string,
): Promise<void> {
  logger.info('Submitting review to ai-conductor...');

  const client = new ConductorClient(config.conductor);
  const projectName = config.project?.name || path.basename(projectDir);
  const projectStack = config.project?.stack || '';

  const submitResponse = await client.submitReview({
    project: { name: projectName, stack: projectStack },
    review: {
      type: options.type,
      target_file: options.target,
      content,
      context,
    },
    agents,
    callback: {
      type: 'local_file',
      file_path: path.join(projectDir, '.ai', 'reviews'),
      slack_channel: config.notifications.slack.default_channel,
    },
  });

  logger.info(`Review accepted (ID: ${submitResponse.request_id}, ETA: ${submitResponse.estimated_seconds}s)`);

  // Poll for result
  const result = await client.pollReviewResult(submitResponse.request_id);

  if (result.status === 'failed') {
    logger.error('Review failed on conductor side.');
    return;
  }

  // Format and write combined results
  const lines: string[] = [];
  lines.push(`# Conductor Review Result`);
  lines.push('');
  lines.push(`- **Request ID:** ${result.request_id}`);
  lines.push(`- **Target:** ${options.target}`);
  lines.push(`- **Type:** ${options.type}`);
  lines.push(`- **Agents:** ${agents.join(', ')}`);
  lines.push('');

  if (result.results) {
    for (const [agent, agentResult] of Object.entries(result.results)) {
      lines.push(`## ${agent}`);
      lines.push('');
      lines.push(agentResult.summary);
      lines.push('');
      for (const issue of agentResult.issues) {
        const lineInfo = issue.line > 0 ? ` (line ${issue.line})` : '';
        lines.push(`- **[${issue.severity.toUpperCase()}]**${lineInfo} ${issue.message}`);
      }
      lines.push('');
    }
  }

  if (result.consensus) {
    lines.push(`## Consensus`);
    lines.push('');
    lines.push(`**Severity:** ${result.consensus.severity}`);
    lines.push(`**Summary:** ${result.consensus.summary}`);
    lines.push(`**Recommendation:** ${result.consensus.recommendation}`);
    lines.push('');
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `review-${options.type}-conductor-${timestamp}.md`;
  const filePath = writeReviewResult(projectDir, fileName, lines.join('\n'));

  logger.info(`Conductor review complete. Result: ${filePath}`);
}

async function runConsensusReview(
  config: GuardianConfig,
  options: ReviewOptions,
  content: string,
  context: string,
  projectDir: string,
): Promise<void> {
  const providers = options.providers!;
  const strategy = options.consensus || 'majority-vote';

  logger.info(`Running multi-provider review: ${providers.join(', ')} (strategy: ${strategy})`);

  // Run reviews in parallel across providers
  const results = await Promise.allSettled(
    providers.map(async (providerName) => {
      const result = await runLocalReview(config, options.type, options.target, content, context, providerName);
      return { agentName: providerName, result };
    }),
  );

  const successResults = results
    .filter((r): r is PromiseFulfilledResult<{ agentName: string; result: ReviewOutput }> => r.status === 'fulfilled')
    .map((r) => r.value);

  const failedResults = results
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected');

  for (const failed of failedResults) {
    logger.warn(`Provider failed: ${failed.reason}`);
  }

  if (successResults.length === 0) {
    logger.error('All providers failed.');
    process.exit(1);
  }

  const consensus = buildConsensus(successResults, strategy);

  // Format output
  const lines: string[] = [];
  lines.push(`# Multi-Provider Review Result`);
  lines.push('');
  lines.push(`- **Target:** ${options.target}`);
  lines.push(`- **Type:** ${options.type}`);
  lines.push(`- **Providers:** ${providers.join(', ')}`);
  lines.push(`- **Strategy:** ${strategy}`);
  lines.push(`- **Agreement:** ${(consensus.agreement * 100).toFixed(0)}%`);
  lines.push('');
  lines.push(`## Consensus Summary`);
  lines.push('');
  lines.push(consensus.summary);
  lines.push('');

  if (consensus.issues.length > 0) {
    lines.push(`## Issues (${consensus.issues.length})`);
    lines.push('');
    for (const issue of consensus.issues) {
      const lineInfo = issue.line > 0 ? ` (line ${issue.line})` : '';
      lines.push(`- **[${issue.severity.toUpperCase()}]**${lineInfo} ${issue.message}`);
    }
    lines.push('');
  }

  // Individual agent results
  lines.push(`## Individual Results`);
  lines.push('');
  for (const agentResult of consensus.agentResults) {
    lines.push(`### ${agentResult.agentName}`);
    lines.push('');
    lines.push(agentResult.result.summary);
    lines.push(`Issues: ${agentResult.result.issues.length}`);
    lines.push('');
  }

  const formatted = lines.join('\n');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `review-${options.type}-consensus-${timestamp}.md`;
  const filePath = writeReviewResult(projectDir, fileName, formatted);

  const criticals = consensus.issues.filter((i) => i.severity === 'critical');
  if (criticals.length > 0) {
    logger.warn(`${criticals.length} critical issue(s) in consensus.`);
  }

  logger.info(`Consensus review complete (agreement: ${(consensus.agreement * 100).toFixed(0)}%). Result: ${filePath}`);
}
