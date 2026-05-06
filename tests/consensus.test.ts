import { describe, it, expect } from 'vitest';
import { buildConsensus, ConsensusInput } from '../src/core/consensus';

function makeInput(name: string, summary: string, issues: Array<{ severity: string; message: string; line: number }>): ConsensusInput {
  return {
    agentName: name,
    result: {
      summary,
      issues: issues.map((i) => ({
        severity: i.severity as 'critical' | 'warning' | 'info',
        message: i.message,
        line: i.line,
      })),
    },
  };
}

describe('buildConsensus', () => {
  it('returns single result when only one agent', () => {
    const input = makeInput('claude', 'All good', []);
    const result = buildConsensus([input]);
    expect(result.summary).toBe('All good');
    expect(result.issues).toHaveLength(0);
    expect(result.agreement).toBe(1);
  });

  it('majority-vote: includes issues found by majority', () => {
    const inputs = [
      makeInput('claude', 'Found issues', [
        { severity: 'critical', message: 'SQL injection on line 10', line: 10 },
        { severity: 'warning', message: 'Missing error handling', line: 20 },
      ]),
      makeInput('gpt', 'Some issues', [
        { severity: 'critical', message: 'SQL injection vulnerability at line 10', line: 10 },
      ]),
      makeInput('gemini', 'Looks ok', []),
    ];

    const result = buildConsensus(inputs, 'majority-vote');
    // Line 10 issue should be in consensus (2/3 agree)
    const consensusIssues = result.issues.filter((i) => !i.message.startsWith('[minority:'));
    expect(consensusIssues.length).toBeGreaterThanOrEqual(1);
    expect(consensusIssues.some((i) => i.line === 10)).toBe(true);
  });

  it('unanimous: only includes issues all agree on', () => {
    const inputs = [
      makeInput('claude', 'Issues', [
        { severity: 'critical', message: 'Bug on line 5', line: 5 },
        { severity: 'warning', message: 'Style issue', line: 15 },
      ]),
      makeInput('gpt', 'Issues', [
        { severity: 'critical', message: 'Bug found at line 5', line: 5 },
      ]),
    ];

    const result = buildConsensus(inputs, 'unanimous');
    // Only line 5 should be included (both agree)
    expect(result.issues.every((i) => i.line === 5)).toBe(true);
    expect(result.strategy).toBe('unanimous');
  });

  it('any: includes union of all issues', () => {
    const inputs = [
      makeInput('claude', 'Issues', [
        { severity: 'warning', message: 'Issue A', line: 1 },
      ]),
      makeInput('gpt', 'Issues', [
        { severity: 'warning', message: 'Issue B', line: 2 },
      ]),
    ];

    const result = buildConsensus(inputs, 'any');
    expect(result.issues).toHaveLength(2);
    expect(result.strategy).toBe('any');
  });

  it('handles empty inputs', () => {
    const result = buildConsensus([]);
    expect(result.issues).toHaveLength(0);
    expect(result.agreement).toBe(0);
  });
});
