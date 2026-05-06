import * as fs from 'fs';
import * as os from 'os';
import { GuardianConfig, ReviewerConfig } from './config';
import { getProvider } from '../providers/provider';
import { prependResponseStyle } from './response-style';
import { logger } from '../utils/logger';

export interface ReviewIssue {
  severity: 'critical' | 'warning' | 'info';
  message: string;
  line: number;
}

export interface ReviewOutput {
  summary: string;
  issues: ReviewIssue[];
}

function loadSystemPrompt(systemFile: string): string {
  const expandedPath = systemFile.replace(/^~/, os.homedir());
  try {
    return fs.readFileSync(expandedPath, 'utf-8');
  } catch {
    logger.debug(`System prompt file not found: ${expandedPath}, using default.`);
    return '';
  }
}

function buildDefaultSystemPrompt(reviewType: string): string {
  return `You are a code reviewer. Perform a ${reviewType} review of the provided content.
Return your review as JSON with the following structure:
{
  "summary": "Brief summary of the review",
  "issues": [
    {
      "severity": "critical | warning | info",
      "message": "Description of the issue",
      "line": 0
    }
  ]
}
Only return valid JSON, no markdown fences or other text.`;
}

export async function runLocalReview(
  config: GuardianConfig,
  reviewType: string,
  targetFile: string,
  content: string,
  context: string,
  providerName: string = 'anthropic',
): Promise<ReviewOutput> {
  // Find reviewer config
  const reviewerConfig: ReviewerConfig | undefined = config.reviewers[reviewType];
  const model = reviewerConfig?.model || config.api.model;

  // Load or build system prompt
  let systemPrompt = '';
  if (reviewerConfig?.system_file) {
    systemPrompt = loadSystemPrompt(reviewerConfig.system_file);
  }
  if (!systemPrompt) {
    systemPrompt = buildDefaultSystemPrompt(reviewType);
  }

  // Prepend response style prompt
  systemPrompt = prependResponseStyle(systemPrompt, config);

  const userMessage = `Review target: ${targetFile}\n\nContent:\n${content}${context ? `\n\nContext:\n${context}` : ''}`;

  logger.info(`Running local review (provider: ${providerName}, model: ${model}, type: ${reviewType})...`);

  const provider = getProvider(providerName, config);
  const responseText = await provider.chat({
    system: systemPrompt,
    userMessage,
    model,
    maxTokens: 4096,
  });

  try {
    return JSON.parse(responseText) as ReviewOutput;
  } catch {
    return {
      summary: responseText,
      issues: [],
    };
  }
}
