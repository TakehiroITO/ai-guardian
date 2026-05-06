import { ReviewOutput, ReviewIssue } from './reviewer';
import { logger } from '../utils/logger';

export type ConsensusStrategy = 'majority-vote' | 'weighted' | 'unanimous' | 'any';

export interface ConsensusInput {
  agentName: string;
  result: ReviewOutput;
}

export interface ConsensusOutput {
  strategy: ConsensusStrategy;
  summary: string;
  issues: ReviewIssue[];
  agentResults: ConsensusInput[];
  agreement: number;
}

function normalizeSeverity(severity: string): 'critical' | 'warning' | 'info' {
  if (severity === 'critical') return 'critical';
  if (severity === 'warning') return 'warning';
  return 'info';
}

function severityWeight(severity: string): number {
  switch (severity) {
    case 'critical': return 3;
    case 'warning': return 2;
    case 'info': return 1;
    default: return 0;
  }
}

function similarIssues(a: ReviewIssue, b: ReviewIssue): boolean {
  // Same line and similar message = likely same issue
  if (a.line > 0 && b.line > 0 && a.line === b.line) return true;

  // Fuzzy message match: significant word overlap
  const wordsA = new Set(a.message.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
  const wordsB = new Set(b.message.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
  if (wordsA.size === 0 || wordsB.size === 0) return false;

  let overlap = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++;
  }
  const overlapRatio = overlap / Math.min(wordsA.size, wordsB.size);
  return overlapRatio > 0.5;
}

function majorityVote(inputs: ConsensusInput[]): ConsensusOutput {
  const allIssues: Array<{ issue: ReviewIssue; votes: number; agents: string[] }> = [];

  for (const input of inputs) {
    for (const issue of input.result.issues) {
      const existing = allIssues.find((ai) => similarIssues(ai.issue, issue));
      if (existing) {
        existing.votes++;
        existing.agents.push(input.agentName);
        // Escalate severity if multiple agents agree
        if (severityWeight(issue.severity) > severityWeight(existing.issue.severity)) {
          existing.issue.severity = normalizeSeverity(issue.severity);
        }
      } else {
        allIssues.push({ issue: { ...issue }, votes: 1, agents: [input.agentName] });
      }
    }
  }

  const threshold = Math.ceil(inputs.length / 2);
  const consensusIssues = allIssues
    .filter((ai) => ai.votes >= threshold)
    .map((ai) => ai.issue);

  // Non-consensus issues at info level for transparency
  const minorityIssues = allIssues
    .filter((ai) => ai.votes < threshold)
    .map((ai) => ({
      ...ai.issue,
      severity: 'info' as const,
      message: `[minority: ${ai.agents.join(',')}] ${ai.issue.message}`,
    }));

  const totalIssues = [...consensusIssues, ...minorityIssues];
  const agreedCount = allIssues.filter((ai) => ai.votes >= threshold).length;
  const agreement = allIssues.length > 0 ? agreedCount / allIssues.length : 1;

  const summaries = inputs.map((i) => i.result.summary).filter(Boolean);
  const summary = summaries.length > 0
    ? `[Consensus from ${inputs.length} agents] ${summaries[0]}`
    : `Review completed by ${inputs.length} agents.`;

  return {
    strategy: 'majority-vote',
    summary,
    issues: totalIssues,
    agentResults: inputs,
    agreement,
  };
}

function unanimousConsensus(inputs: ConsensusInput[]): ConsensusOutput {
  const allIssues: Array<{ issue: ReviewIssue; votes: number; agents: string[] }> = [];

  for (const input of inputs) {
    for (const issue of input.result.issues) {
      const existing = allIssues.find((ai) => similarIssues(ai.issue, issue));
      if (existing) {
        existing.votes++;
        existing.agents.push(input.agentName);
      } else {
        allIssues.push({ issue: { ...issue }, votes: 1, agents: [input.agentName] });
      }
    }
  }

  // Only include issues ALL agents agree on
  const consensusIssues = allIssues
    .filter((ai) => ai.votes === inputs.length)
    .map((ai) => ai.issue);

  const agreement = allIssues.length > 0
    ? allIssues.filter((ai) => ai.votes === inputs.length).length / allIssues.length
    : 1;

  return {
    strategy: 'unanimous',
    summary: `[Unanimous consensus from ${inputs.length} agents] ${consensusIssues.length} agreed issues.`,
    issues: consensusIssues,
    agentResults: inputs,
    agreement,
  };
}

function anyConsensus(inputs: ConsensusInput[]): ConsensusOutput {
  // Union of all issues
  const seen = new Set<string>();
  const allIssues: ReviewIssue[] = [];

  for (const input of inputs) {
    for (const issue of input.result.issues) {
      const key = `${issue.line}:${issue.message.slice(0, 50)}`;
      if (!seen.has(key)) {
        seen.add(key);
        allIssues.push(issue);
      }
    }
  }

  return {
    strategy: 'any',
    summary: `[Union from ${inputs.length} agents] ${allIssues.length} total issues.`,
    issues: allIssues,
    agentResults: inputs,
    agreement: 1,
  };
}

export function buildConsensus(inputs: ConsensusInput[], strategy: ConsensusStrategy = 'majority-vote'): ConsensusOutput {
  if (inputs.length === 0) {
    return { strategy, summary: 'No agent results.', issues: [], agentResults: [], agreement: 0 };
  }

  if (inputs.length === 1) {
    return {
      strategy,
      summary: inputs[0].result.summary,
      issues: inputs[0].result.issues,
      agentResults: inputs,
      agreement: 1,
    };
  }

  logger.info(`Building consensus with strategy: ${strategy} (${inputs.length} agents)`);

  switch (strategy) {
    case 'majority-vote':
    case 'weighted':
      return majorityVote(inputs);
    case 'unanimous':
      return unanimousConsensus(inputs);
    case 'any':
      return anyConsensus(inputs);
    default:
      return majorityVote(inputs);
  }
}
